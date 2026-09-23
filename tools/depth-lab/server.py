"""Loopback-only depth laboratory. Raw frames stay in memory/on localhost."""
import argparse
import sys
import base64
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import time
import uuid
import numpy as np
import cv2
from detector import Detector
from frame_stream import LatestFrame, DepthFrame, camera_frames, read_pipe_frame

ROOT = Path(__file__).resolve().parent


def encode_preview(depth):
    visible = (depth > 100) & (depth < 5000)
    mapped = np.clip((depth - 150) / 1850 * 255, 0, 255).astype(np.uint8)
    rgb = cv2.applyColorMap(mapped, cv2.COLORMAP_TURBO)
    rgb[~visible] = 0
    return base64.b64encode(cv2.imencode('.jpg', rgb, [cv2.IMWRITE_JPEG_QUALITY, 75])[1]).decode()


class Lab:
    def __init__(self):
        self.lock = threading.RLock()
        self.lifecycle = threading.RLock()
        self.detector_lock = threading.Lock()
        self.detector = Detector()
        self.mode, self.message, self.result = 'stopped', '点击连接相机，或选择明确标注的模拟模式。', {}
        self.image, self.frame_at = None, 0
        self.contact, self.sim_gap, self.sim_object = 15, 80, False
        self.stop = threading.Event()
        self.worker = None
        self.threads = []
        self.frames, self.previews = LatestFrame(), LatestFrame()
        self.stream_id, self.frame_id = uuid.uuid4().hex, 0
        self.source_at, self.processing_ms = None, None
        self.device = {}
        self.received_count = self.processed_count = self.preview_count = 0
        self.capture_dropped = 0
        self.first_source = self.last_source = None
        self.first_frame_id = self.last_frame_id = 0
        self.generation = 0
        self.calibrate_after = 0
        self.calibration_requested = False
        self.roi = self.detector.roi

    def start(self, mode):
        with self.lifecycle:
            self.shutdown()
            with self.lock:
                self.mode = mode
                self.message = '等待真实深度流…' if mode in ('camera', 'pipe') else '模拟数据，不代表相机已连接或触摸已验证。'
                self.stop = threading.Event()
                self.frames, self.previews = LatestFrame(), LatestFrame()
                self.stream_id, self.frame_id = uuid.uuid4().hex, 0
                self.source_at, self.processing_ms, self.device = None, None, {}
                self.received_count = self.processed_count = self.preview_count = self.capture_dropped = 0
                self.first_source = self.last_source = None
                self.first_frame_id = self.last_frame_id = 0
                self.calibrate_after = 0
                self.calibration_requested = False
                self.threads = [threading.Thread(target=fn, args=(self.stop,), daemon=True)
                                for fn in (lambda stop: self.acquire(mode, stop), self.process, self.preview)]
                self.worker = self.threads[1]
            for thread in self.threads:
                thread.start()

    def shutdown(self):
        with self.lifecycle:
            was_pipe = self.mode == 'pipe'
            self.stop.set()
            self.frames.close()
            self.previews.close()
            with self.lock:
                self.generation += 1
                self.mode, self.result, self.image, self.frame_at = 'stopped', {}, None, 0
                self.source_at = None
            for thread in self.threads:
                thread.join(timeout=4)
            if any(thread.is_alive() for thread in self.threads):
                raise ValueError('设备仍在关闭，请稍后重试。')
            self.threads, self.worker = [], None
            if was_pipe:
                sys.stdin.close()
            with self.detector_lock:
                self.detector.reset()
                with self.lock:
                    self.roi = self.detector.roi

    def fail(self, stop, exc):
        if stop.is_set():
            return
        stop.set()
        self.frames.close()
        self.previews.close()
        with self.lock:
            self.generation += 1
            self.mode, self.result, self.image, self.frame_at = 'error', {'state': 'error'}, None, 0
            self.source_at = None
            self.message = ('macOS拒绝打开USB，请使用权限启动脚本。' if 'uvc_open' in str(exc) and 'Code: -3' in str(exc) else '') + str(exc)

    def source(self, mode, stop):
        if mode == 'camera':
            yield from camera_frames(stop)
        elif mode == 'pipe':
            while not stop.is_set():
                yield read_pipe_frame(sys.stdin.fileno(), stop)
        else:
            stream_id, frame_id = self.stream_id, 0
            rng = np.random.default_rng()
            while not stop.wait(.07):
                depth = np.full((240, 320), 1000, dtype=np.float32)
                with self.lock:
                    present = self.sim_object and self.result.get('state') != 'calibrating'
                    gap = self.sim_gap
                if present:
                    depth[65:180,85:125] -= 180
                    depth[105:130,125:180] -= 100
                    depth[96:142,180:207] -= gap
                    depth[65:95,215:245] -= gap
                depth += rng.normal(0, .6, depth.shape).astype(np.float32)
                frame_id += 1
                yield DepthFrame(depth, (300.,300.,159.5,119.5), stream_id, frame_id,
                                 time.monotonic()*1000, {'model': 'simulation'})

    def acquire(self, mode, stop):
        previous_id, stream_id = 0, None
        try:
            for frame in self.source(mode, stop):
                if stop.is_set():
                    break
                if stream_id is not None and stream_id != frame.stream_id:
                    raise ValueError('采集会话已改变，请重启服务并重新校准。')
                stream_id = frame.stream_id
                if frame.frame_id <= previous_id:
                    continue
                previous_id = frame.frame_id
                with self.lock:
                    self.received_count += 1
                    if self.first_source is None:
                        self.first_source = frame.received_mono_ms
                        self.first_frame_id = frame.frame_id
                    self.last_source, self.last_frame_id = frame.received_mono_ms, frame.frame_id
                    self.capture_dropped = frame.capture_dropped
                self.frames.put(frame)
        except Exception as exc:
            self.fail(stop, exc)

    def process(self, stop):
        try:
            while not stop.is_set():
                frame = self.frames.take()
                if frame is None:
                    continue
                # A frozen old capture is not a new calibration sample.
                if time.monotonic()*1000 - frame.received_mono_ms > 300:
                    continue
                started = time.monotonic()
                h, w = frame.depth.shape
                factor = 320/w
                depth = cv2.resize(frame.depth, (320, round(h*factor)), interpolation=cv2.INTER_NEAREST)
                intr = frame.intrinsics
                scaled = (intr[0]*factor, intr[1]*factor, (intr[2]+.5)*factor-.5, (intr[3]+.5)*factor-.5)
                with self.detector_lock:
                    with self.lock:
                        generation, contact, cutoff = self.generation, self.contact, self.calibrate_after
                        calibrating = self.calibration_requested
                    if calibrating or frame.received_mono_ms < cutoff:
                        continue
                    result = self.detector.update(depth, scaled, contact=contact)
                    finished = time.monotonic()
                    with self.lock:
                        if stop.is_set() or generation != self.generation:
                            continue
                        self.result, self.frame_at = result, finished
                        self.source_at, self.processing_ms = frame.received_mono_ms, (finished-started)*1000
                        self.stream_id, self.frame_id, self.device = frame.stream_id, frame.frame_id, frame.device
                        self.processed_count += 1
                        if self.mode in ('camera', 'pipe'):
                            self.message = '真实深度流已连接，请校准空墙后互动。'
                self.previews.put((depth, generation))
        except Exception as exc:
            self.fail(stop, exc)

    def preview(self, stop):
        last_started = 0
        try:
            while not stop.is_set():
                if stop.wait(max(0, .1 - (time.monotonic()-last_started))):
                    break
                item = self.previews.take()
                if item is None:
                    continue
                last_started = time.monotonic()
                depth, generation = item
                image = encode_preview(depth)
                with self.lock:
                    if not stop.is_set() and generation == self.generation:
                        self.image = image
                        self.preview_count += 1
        except Exception as exc:
            self.fail(stop, exc)

    def calibrate(self, roi):
        with self.lifecycle:
            # Invalidate immediately, even if an old detection is still running.
            # Never wait for detector_lock while holding the publication lock.
            with self.lock:
                if not self.frame_at or time.monotonic()-self.frame_at > 1:
                    raise ValueError('请先连接相机并等待有效画面。')
                self.generation += 1
                self.calibration_requested = True
                self.result = dict(state='calibrating', progress=0, near_regions=[], diagnostic_valid=False)
            with self.detector_lock:
                self.detector.begin(roi)
                with self.lock:
                    self.roi = self.detector.roi
                    self.calibrate_after = time.monotonic()*1000
                    self.calibration_requested = False

    def snapshot(self, compact=False):
        with self.lock:
            now = time.monotonic()
            age = (now-self.frame_at)*1000 if self.frame_at else None
            source_age = max(0, now*1000-self.source_at) if self.source_at is not None else None
            result = dict(self.result)
            if age is not None and age > 1500:
                result.update(state='unknown', gap_mm=None, position=None, regions=[], near_regions=[], diagnostic_valid=False, message='画面已过期，不能用于触碰判断。')
            duration = (self.last_source-self.first_source) if self.first_source is not None else 0
            diagnostics = dict(received_frames=self.received_count, processed_frames=self.processed_count,
                capture_dropped=self.capture_dropped, processing_dropped=self.frames.dropped,
                preview_frames=self.preview_count, preview_dropped=self.previews.dropped,
                capture_fps=(self.last_frame_id-self.first_frame_id)*1000/duration if duration > 0 else 0)
            if compact:
                result = {key: result[key] for key in ('state', 'background_model', 'diagnostic_valid') if key in result}
                result['near_regions'] = [{key: region[key] for key in ('center', 'area_px') if key in region}
                                          for region in self.result.get('near_regions', [])] if source_age is not None and source_age <= 300 else []
                return dict(protocol_version=1, mode=self.mode, message=self.message, result=result,
                    stream_id=self.stream_id, frame_id=self.frame_id, source_age_ms=source_age,
                    processing_ms=self.processing_ms, received_mono_ms=self.source_at,
                    diagnostics=diagnostics, device=self.device)
            return dict(mode=self.mode, message=self.message, result=result, image=self.image,
                        age_ms=round(age) if age is not None else None, roi=self.roi,
                        source_age_ms=source_age, diagnostics=diagnostics, device=self.device)


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
        if self.path=='/api/input':
            origin, site = self.headers.get('Origin'), self.headers.get('Sec-Fetch-Site')
            if (origin and origin != 'http://'+self.headers.get('Host')) or (site and site not in ('same-origin', 'none')):
                return self.reply({'error':'Local same-origin requests only'},403)
            return self.reply(lab.snapshot(compact=True))
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
                lab.calibrate(roi)
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
