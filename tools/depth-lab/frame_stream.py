"""Bounded frame handoff and versioned local pipe. No camera opened on import."""
from dataclasses import dataclass
import json
import math
import os
import select
import struct
import threading
import time
import uuid
import numpy as np


class LatestFrame:
    """One owned pending item. Replacing it never grows a FIFO."""
    def __init__(self):
        self.condition = threading.Condition()
        self.item = None
        self.closed = False
        self.dropped = 0

    def put(self, item):
        with self.condition:
            if self.closed:
                return
            if self.item is not None:
                self.dropped += 1
            self.item = item
            self.condition.notify()

    def take(self, timeout=.1):
        with self.condition:
            self.condition.wait_for(lambda: self.item is not None or self.closed, timeout)
            item, self.item = self.item, None
            return item

    def close(self):
        with self.condition:
            self.closed = True
            self.item = None
            self.condition.notify_all()


@dataclass(frozen=True)
class DepthFrame:
    depth: np.ndarray
    intrinsics: tuple
    stream_id: str
    frame_id: int
    received_mono_ms: float
    device: dict
    capture_dropped: int = 0


def read_exact(fd, count, stop):
    data = bytearray()
    while len(data) < count:
        if stop.is_set():
            raise InterruptedError('采集已停止。')
        ready, _, _ = select.select([fd], [], [], .1)
        if not ready:
            continue
        chunk = os.read(fd, count - len(data))
        if not chunk:
            raise EOFError('相机读取进程已退出；请重新启动完整采集链路。')
        data.extend(chunk)
    return data


def read_pipe_frame(fd, stop):
    size = struct.unpack('!I', read_exact(fd, 4, stop))[0]
    if not 0 < size < 16384:
        raise ValueError('无效相机数据头。')
    h = json.loads(read_exact(fd, size, stop))
    if h.get('protocol_version') != 1:
        raise ValueError('采集协议不匹配：请更新并重启 camera_capture.py 与深度服务。')
    width, height = h.get('width'), h.get('height')
    intr, stamp = h.get('intrinsics'), h.get('received_mono_ms')
    if (type(width) is not int or type(height) is not int or
            not 0 < width <= 4096 or not 0 < height <= 4096 or
            not isinstance(intr, list) or len(intr) != 4 or
            not all(type(v) in (int, float) and math.isfinite(v) for v in intr) or
            intr[0] <= 0 or intr[1] <= 0 or
            type(stamp) not in (int, float) or not math.isfinite(stamp) or stamp < 0 or
            stamp > time.monotonic() * 1000 + 1 or
            not isinstance(h.get('stream_id'), str) or not h['stream_id'] or
            type(h.get('frame_id')) is not int or h['frame_id'] < 1):
        raise ValueError('无效深度帧元数据，请重启完整采集链路。')
    depth = np.frombuffer(read_exact(fd, width * height * 4, stop), '<f4').reshape(height, width)
    device, dropped = h.get('device', {}), h.get('capture_dropped', 0)
    if not isinstance(device, dict) or type(dropped) is not int or dropped < 0:
        raise ValueError('无效采集计数或设备元数据。')
    return DepthFrame(depth, tuple(intr), h['stream_id'], h['frame_id'], stamp, device, dropped)


def write_pipe_frame(stream, frame, dropped=0):
    height, width = frame.depth.shape
    header = json.dumps(dict(protocol_version=1, width=width, height=height,
        intrinsics=frame.intrinsics, stream_id=frame.stream_id, frame_id=frame.frame_id,
        received_mono_ms=frame.received_mono_ms, device=frame.device,
        capture_dropped=dropped)).encode()
    for payload in (struct.pack('!I', len(header)), header, frame.depth.astype('<f4', copy=False).tobytes()):
        pending = memoryview(payload)
        while pending:
            written = stream.write(pending)
            if not written:
                raise BrokenPipeError('相机数据管道已关闭。')
            pending = pending[written:]


def camera_frames(stop):
    from pyorbbecsdk import Context, Pipeline, Config, OBSensorType, OBFormat, OBLogLevel
    Context.set_logger_to_console(OBLogLevel.ERROR)
    Context.set_logger_to_file(OBLogLevel.NONE, '')
    context = Context()
    devices = context.query_devices()
    names, device = [], None
    for i in range(devices.get_count()):
        candidate = devices.get_device_by_index(i)
        name = candidate.get_device_info().get_name()
        names.append(name)
        if '335' in name and device is None:
            device = candidate
    if device is None:
        raise ValueError('未找到当前已适配的 Gemini 335；SDK枚举型号：' +
                         ('、'.join(names) or '无设备') + '。请核对335/355型号，不自动套用配置。')
    pipeline = Pipeline(device)
    profile = pipeline.get_stream_profile_list(OBSensorType.DEPTH_SENSOR).get_default_video_stream_profile()
    if profile.get_format() != OBFormat.Y16:
        raise ValueError('默认深度格式不是Y16，请使用官方工具检查。')
    intr = profile.get_intrinsic()
    intrinsics = (intr.fx, intr.fy, intr.cx, intr.cy)
    info = device.get_device_info()
    connection = getattr(info, 'get_connection_type', lambda: 'unknown')()
    meta = dict(model=info.get_name(), width=profile.get_width(), height=profile.get_height(),
                configured_fps=profile.get_fps(), connection=str(connection))
    config = Config()
    config.enable_stream(profile)
    pipeline.start(config)
    stream_id, frame_id, previous_index, missed = uuid.uuid4().hex, 0, None, 0
    try:
        while not stop.is_set():
            frames = pipeline.wait_for_frames(1000)
            received = time.monotonic() * 1000
            frame = frames.get_depth_frame() if frames else None
            if frame is None:
                missed += 1
                if missed >= 3:
                    raise ValueError('连续未收到深度帧，请检查连接并重新启动。')
                continue
            missed = 0
            index = frame.get_index()
            if previous_index is not None and index <= previous_index:
                continue
            previous_index = index
            frame_id += 1
            depth = np.frombuffer(frame.get_data(), np.uint16).reshape(frame.get_height(), frame.get_width()).astype('<f4') * frame.get_depth_scale()
            yield DepthFrame(depth, intrinsics, stream_id, frame_id, received,
                             dict(meta, sdk_frame_index=index, sdk_timestamp_us=frame.get_timestamp_us()))
    finally:
        pipeline.stop()
