"""Loopback-only depth laboratory. Raw frames never leave this process/localhost."""
import argparse
import os
import select
import struct
import sys
import base64
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import time
import numpy as np
import cv2
from detector import Detector

ROOT = Path(__file__).resolve().parent


def describe_device_error(exc):
    detail = f'{type(exc).__name__}: {exc}'
    if isinstance(exc, ImportError):
        if sys.platform == 'win32':
            return ('相机 Python 库未安装或无法加载。请运行「安装环境.bat」；'
                    '若提示 DLL 加载失败，请检查 VC++ x64 运行库。原始错误：' + detail)
        return 'Orbbec Python 包无法加载，请按 README 在虚拟环境中安装依赖。原始错误：' + detail
    if sys.platform == 'darwin' and 'uvc_open' in str(exc) and 'Code: -3' in str(exc):
        return ('相机已检测到，但 macOS 拒绝打开 USB 视频接口。请从 Mac 终端启动测试台后重试；'
                '若仍失败，需要进一步处理设备访问权限。错误：' + detail)
    if sys.platform == 'win32':
        return ('Windows 无法打开相机。请关闭 Orbbec Viewer 和其他占用软件，'
                '使用 USB 3 直连，并按官方安装指南检查设备环境。错误：' + detail)
    return detail


def read_exact(count, stop):
    data = bytearray()
    while len(data) < count:
        if stop.is_set():
            raise ValueError('采集已停止。')
        ready, _, _ = select.select([sys.stdin.fileno()], [], [], 1)
        if not ready:
            continue
        chunk = os.read(sys.stdin.fileno(), count-len(data))
        if not chunk:
            raise ValueError('相机读取进程已退出；请查看启动窗口的错误提示。')
        data.extend(chunk)
    return data


class Lab:
    def __init__(self):
        self.lock = threading.RLock()
        self.detector = Detector()
        self.mode = 'stopped'
        self.message = '点击连接相机，或选择明确标注的模拟模式。'
        self.result = {}
        self.image = None
        self.frame_at = 0
        self.contact = 15
        self.sim_gap = 80
        self.sim_object = False
        self.stop = threading.Event()
        self.worker = None

    def start(self, mode):
        self.shutdown()
        with self.lock:
            self.mode = mode
            self.detector.reset()
            self.result = {}
            self.image = None
            self.frame_at = 0
            self.message = '正在等待 Gemini 335 深度数据…' if mode in ('camera','pipe') else '模拟数据，不代表相机已连接或触摸已验证。'
            self.stop = threading.Event()
            self.worker = threading.Thread(target=self.run, args=(mode,self.stop), daemon=True)
            self.worker.start()

    def shutdown(self):
        was_pipe = self.mode == 'pipe'
        self.stop.set()
        if self.worker:
            self.worker.join(timeout=4)
            if self.worker.is_alive():
                raise ValueError('设备仍在关闭，请稍后重试。')
        self.worker = None
        if was_pipe:
            sys.stdin.close()
        with self.lock:
            self.mode = 'stopped'
            self.image = None
            self.frame_at = 0
            self.result = {}
            self.detector.reset()

    def run(self, mode, stop):
        pipeline = None
        started = False
        try:
            if mode == 'camera':
                from pyorbbecsdk import Context, Pipeline, Config, OBSensorType, OBFormat
                context = Context()
                devices = context.query_devices()
                if devices.get_count() == 0:
                    raise ValueError('未检测到 Orbbec 相机。请连接 USB 3 数据线，关闭其他占用相机的软件，再点连接。')
                device = None
                for i in range(devices.get_count()):
                    candidate = devices.get_device_by_index(i)
                    if '335' in candidate.get_device_info().get_name():
                        device = candidate
                        break
                if device is None:
                    raise ValueError('检测到 Orbbec 设备，但不是 Gemini 335。')
                pipeline = Pipeline(device)
                profiles = pipeline.get_stream_profile_list(OBSensorType.DEPTH_SENSOR)
                profile = profiles.get_default_video_stream_profile()
                if profile.get_format() != OBFormat.Y16:
                    raise ValueError('默认深度格式不是 Y16，请使用官方工具检查设备配置。')
                calibration = profile.get_intrinsic()
                intr = (calibration.fx, calibration.fy, calibration.cx, calibration.cy)
                config = Config()
                config.enable_stream(profile)
                pipeline.start(config)
                started = True
                with self.lock:
                    self.message = 'Gemini 335 深度流已连接。固定相机，对准平整表面后校准。'
            missed = 0
            while not stop.is_set():
                if mode == 'pipe':
                    size = struct.unpack('!I', read_exact(4, stop))[0]
                    if not 0 < size < 4096:
                        raise ValueError('无效相机数据头。')
                    header = json.loads(read_exact(size, stop))
                    w, h = int(header['width']), int(header['height'])
                    if not 0 < w <= 4096 or not 0 < h <= 4096:
                        raise ValueError('无效深度分辨率。')
                    depth = np.frombuffer(read_exact(w*h*4, stop), '<f4').reshape(h,w)
                    intr = header['intrinsics']
                    factor = 320/w
                    depth = cv2.resize(depth,(320,round(h*factor)),interpolation=cv2.INTER_NEAREST)
                    scaled = (intr[0]*factor,intr[1]*factor,(intr[2]+.5)*factor-.5,(intr[3]+.5)*factor-.5)
                elif mode == 'camera':
                    frames = pipeline.wait_for_frames(1000)
                    frame = frames.get_depth_frame() if frames else None
                    if frame is None:
                        missed += 1
                        if missed >= 3:
                            raise ValueError('连续未收到深度帧。检查连接后重新连接，并重新校准。')
                        continue
                    missed = 0
                    w,h=frame.get_width(),frame.get_height()
                    depth=np.frombuffer(frame.get_data(),np.uint16).reshape(h,w).astype(np.float32)*frame.get_depth_scale()
                    # Nearest-neighbor preserves missing depth instead of inventing samples.
                    factor=320/w
                    depth=cv2.resize(depth,(320,round(h*factor)),interpolation=cv2.INTER_NEAREST)
                    # Pixel-centre mapping for resize.
                    scaled=(intr[0]*factor,intr[1]*factor,(intr[2]+.5)*factor-.5,(intr[3]+.5)*factor-.5)
                else:
                    depth=np.full((240,320),1000,dtype=np.float32)
                    scaled=(300.,300.,159.5,119.5)
                    with self.lock:
                        if self.sim_object and not self.detector.calibrating:
                            # Connected body/arm with an independently near-wall palm.
                            depth[65:180,85:125] -= 180
                            depth[105:130,125:180] -= 100
                            depth[96:142,180:207] -= self.sim_gap
                            # A second disconnected palm.
                            depth[65:95,215:245] -= self.sim_gap
                    depth += np.random.default_rng().normal(0,.6,depth.shape).astype(np.float32)
                    stop.wait(.07)
                with self.lock:
                    if mode == 'pipe':
                        self.message = 'Gemini 335 真实深度流已连接（独立相机读取进程）。'
                    self.result=self.detector.update(depth,scaled,contact=self.contact)
                    self.frame_at=time.monotonic()
                    visible=(depth>100)&(depth<5000)
                    mapped=np.clip((depth-150)/1850*255,0,255).astype(np.uint8)
                    rgb=cv2.applyColorMap(mapped,cv2.COLORMAP_TURBO)
                    rgb[~visible]=0
                    self.image=base64.b64encode(cv2.imencode('.jpg',rgb,[cv2.IMWRITE_JPEG_QUALITY,75])[1]).decode()
        except Exception as exc:
            with self.lock:
                self.message = describe_device_error(exc)
                self.result={'state':'error'}
                self.mode='error'
                self.image=None
                self.frame_at=0
                self.detector.reset()
        finally:
            if pipeline is not None and started:
                try:
                    pipeline.stop()
                except Exception:
                    pass

    def snapshot(self):
        with self.lock:
            age=time.monotonic()-self.frame_at if self.frame_at else None
            result=dict(self.result)
            if age is not None and age>1.5:
                result.update(state='unknown',gap_mm=None,position=None,regions=[],near_regions=[],diagnostic_valid=False,message='画面已过期，不能用于触碰判断。')
            return dict(mode=self.mode,message=self.message,result=result,image=self.image,
                        age_ms=round(age*1000) if age is not None else None,roi=self.detector.roi)


lab=Lab()


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass

    def reply(self, data, status=200, mime='application/json'):
        body=data if isinstance(data,bytes) else json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type',mime)
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def local(self):
        return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}')

    def do_GET(self):
        if not self.local():
            return self.reply({'error':'Invalid host'},403)
        if self.path=='/':
            return self.reply((ROOT/'index.html').read_bytes(),mime='text/html; charset=utf-8')
        if self.path=='/guide.mjs':
            return self.reply((ROOT/'guide.mjs').read_bytes(),mime='text/javascript; charset=utf-8')
        if self.path in ('/entity','/entity.html'):
            return self.reply((ROOT/'entity.html').read_bytes(),mime='text/html; charset=utf-8')
        if self.path=='/api/state':
            snapshot = lab.snapshot()
            snapshot['capture_stdin'] = getattr(self.server, 'capture_stdin', False)
            return self.reply(snapshot)
        self.reply({'error':'Not found'},404)

    def do_POST(self):
        origin=self.headers.get('Origin')
        if not self.local() or (origin and origin != 'http://'+self.headers.get('Host')) or self.headers.get('Content-Type')!='application/json':
            return self.reply({'error':'Local same-origin JSON requests only'},403)
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<4096:
                raise ValueError('Invalid request length')
            args=json.loads(self.rfile.read(length))
            if self.path=='/api/start':
                if getattr(self.server, 'capture_stdin', False):
                    raise ValueError('独立相机模式会自动连接，无需点击连接。如读取进程已退出，请重新打开权限启动脚本。')
                if args.get('mode') not in ('camera','simulation'):
                    raise ValueError('请选择相机或模拟模式。')
                lab.start(args['mode'])
            elif self.path=='/api/stop':
                lab.shutdown()
            elif self.path=='/api/calibrate':
                roi=args.get('roi',[.2,.2,.8,.8])
                if len(roi)!=4 or not all(isinstance(v,(float,int)) and np.isfinite(v) and 0<=v<=1 for v in roi) or roi[2]-roi[0]<.15 or roi[3]-roi[1]<.15:
                    raise ValueError('选区太小：请框选一块完整的平整表面。')
                with lab.lock:
                    if not lab.frame_at or time.monotonic()-lab.frame_at>1:
                        raise ValueError('请先连接相机并等待有效画面。')
                    lab.detector.begin(roi)
            elif self.path=='/api/settings':
                with lab.lock:
                    value=float(args.get('contact',lab.contact))
                    gap=float(args.get('gap',lab.sim_gap))
                    if not 8<=value<=40 or not 8<=gap<=250:
                        raise ValueError('阈值超出范围。')
                    lab.contact=value
                    lab.sim_gap=gap
                    lab.sim_object=bool(args.get('object',lab.sim_object))
            else:
                return self.reply({'error':'Not found'},404)
            self.reply({'ok':True})
        except (ValueError,TypeError,KeyError) as exc:
            self.reply({'error':str(exc)},400)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--capture-stdin',action='store_true')
    parser.add_argument('--open',action='store_true')
    args=parser.parse_args()
    if args.capture_stdin and sys.platform == 'win32':
        parser.error('独立管道读取仅用于 macOS；Windows 请运行启动深度测试.bat，在网页连接相机。')
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    server.capture_stdin = args.capture_stdin
    print(f'碎光深度测试台 http://127.0.0.1:{args.port}',flush=True)
    if args.capture_stdin:
        lab.start('pipe')
    if args.open:
        import webbrowser
        webbrowser.open(f'http://127.0.0.1:{args.port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        lab.shutdown()
        server.server_close()
