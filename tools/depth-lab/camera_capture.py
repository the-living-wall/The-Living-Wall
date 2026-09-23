"""Temporary privileged USB reader: binary stdout only; no HTTP or file writes."""
import os
import sys
import threading

stream = os.fdopen(os.dup(sys.stdout.fileno()), 'wb', buffering=0)
os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
from frame_stream import LatestFrame, camera_frames, write_pipe_frame


def main():
    stop, latest, errors = threading.Event(), LatestFrame(), []

    def capture():
        try:
            for frame in camera_frames(stop):
                latest.put(frame)
        except Exception as exc:
            errors.append(exc)
        finally:
            stop.set()
            latest.close()

    worker = threading.Thread(target=capture, daemon=True)
    worker.start()
    try:
        while not stop.is_set():
            frame = latest.take()
            if frame is not None:
                write_pipe_frame(stream, frame, latest.dropped)
    except (BrokenPipeError, KeyboardInterrupt):
        pass
    finally:
        stop.set()
        latest.close()
        worker.join(timeout=4)
    if errors:
        print('相机读取失败：' + str(errors[0]), file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
