"""Concurrency/protocol tests use synthetic frames; never open a camera."""
import io
import json
import os
import struct
import threading
import time
import unittest
from unittest.mock import patch
import numpy as np
from frame_stream import DepthFrame, LatestFrame, read_pipe_frame, write_pipe_frame
from server import Lab


def frame(index=1, age=0):
    return DepthFrame(np.full((240, 320), 1000, np.float32), (300., 300., 159.5, 119.5),
                      'test-session', index, time.monotonic()*1000-age, {'model': 'synthetic'})


def wait_for(predicate, timeout=2):
    deadline = time.monotonic()+timeout
    while not predicate():
        if time.monotonic() >= deadline:
            raise AssertionError('worker did not reach expected state')
        time.sleep(.002)


class PipeTests(unittest.TestCase):
    def test_single_slot_keeps_only_latest_and_counts_overwrites(self):
        slot = LatestFrame()
        for i in range(100):
            slot.put(i)
        self.assertEqual(slot.take(), 99)
        self.assertEqual(slot.dropped, 99)
        slot.close()
        slot.put(101)
        self.assertIsNone(slot.take())

    def test_fragmented_writes_and_reads_preserve_consecutive_frames(self):
        class PartialWriter(io.BytesIO):
            def write(self, data):
                return super().write(data[:17])
        output = PartialWriter()
        first, second = frame(1), frame(2)
        write_pipe_frame(output, first, 3)
        write_pipe_frame(output, second, 5)
        read_fd, write_fd = os.pipe()
        def writer():
            try:
                raw = output.getvalue()
                for at in range(0, len(raw), 7919):
                    chunk = memoryview(raw[at:at+7919])
                    while chunk:
                        n = os.write(write_fd, chunk)
                        chunk = chunk[n:]
            finally:
                os.close(write_fd)
        thread = threading.Thread(target=writer)
        thread.start()
        try:
            received = [read_pipe_frame(read_fd, threading.Event()) for _ in range(2)]
            self.assertEqual([f.frame_id for f in received], [1, 2])
            self.assertEqual([f.capture_dropped for f in received], [3, 5])
            self.assertEqual(received[0].received_mono_ms, first.received_mono_ms)
            np.testing.assert_array_equal(received[1].depth, second.depth)
            with self.assertRaises(EOFError):
                read_pipe_frame(read_fd, threading.Event())
        finally:
            os.close(read_fd)
            thread.join(2)

    def test_legacy_protocol_fails_explicitly(self):
        read_fd, write_fd = os.pipe()
        header = json.dumps({'width': 320, 'height': 240}).encode()
        os.write(write_fd, struct.pack('!I', len(header))+header)
        os.close(write_fd)
        try:
            with self.assertRaisesRegex(ValueError, '协议不匹配'):
                read_pipe_frame(read_fd, threading.Event())
        finally:
            os.close(read_fd)

    def test_stopped_empty_pipe_can_exit_without_a_new_frame(self):
        read_fd, write_fd = os.pipe()
        stop = threading.Event()
        stop.set()
        try:
            with self.assertRaises(InterruptedError):
                read_pipe_frame(read_fd, stop)
        finally:
            os.close(read_fd)
            os.close(write_fd)


class PipelineTests(unittest.TestCase):
    def test_slow_detection_drops_backlog_and_does_not_block_snapshot(self):
        lab, entered, release = Lab(), threading.Event(), threading.Event()
        lab.mode = 'camera'
        def slow(*args, **kwargs):
            entered.set()
            release.wait(2)
            return {'state': 'away', 'near_regions': [], 'diagnostic_valid': True}
        lab.detector.update = slow
        thread = threading.Thread(target=lab.process, args=(lab.stop,))
        thread.start()
        try:
            lab.frames.put(frame(1))
            self.assertTrue(entered.wait(1))
            for i in range(2, 32):
                lab.frames.put(frame(i))
            done = threading.Event()
            reader = threading.Thread(target=lambda: (lab.snapshot(compact=True), done.set()))
            reader.start()
            self.assertTrue(done.wait(.2), 'input snapshot waited for detector')
            reader.join()
            release.set()
            wait_for(lambda: lab.frame_id == 31)
            self.assertEqual(lab.processed_count, 2)
            self.assertEqual(lab.frames.dropped, 29)
        finally:
            release.set()
            lab.stop.set()
            lab.frames.close()
            thread.join(2)

    def test_preview_does_not_hold_input_lock_and_is_rate_limited(self):
        lab, entered, release = Lab(), threading.Event(), threading.Event()
        times = []
        def encode(depth):
            times.append(time.monotonic())
            entered.set()
            release.wait(1)
            return 'preview-only'
        with patch('server.encode_preview', encode):
            thread = threading.Thread(target=lab.preview, args=(lab.stop,))
            thread.start()
            try:
                lab.previews.put((frame().depth, lab.generation))
                self.assertTrue(entered.wait(1))
                self.assertNotIn('image', lab.snapshot(compact=True))
                release.set()
                for _ in range(30):
                    lab.previews.put((frame().depth, lab.generation))
                    time.sleep(.005)
                wait_for(lambda: len(times) >= 2)
                self.assertTrue(all(b-a >= .095 for a,b in zip(times, times[1:])))
            finally:
                release.set()
                lab.stop.set()
                lab.previews.close()
                thread.join(2)

    def test_calibration_requires_thirty_distinct_frames(self):
        lab = Lab()
        lab.mode = 'camera'
        lab.frame_at = time.monotonic()
        lab.calibrate([.2, .2, .8, .8])
        self.assertEqual(lab.snapshot(compact=True)['result']['state'], 'calibrating')
        def source(mode, stop):
            for i in range(1, 31):
                before = lab.processed_count
                current = frame(i)
                yield current
                wait_for(lambda: lab.processed_count > before)
                yield current  # duplicate SDK/pipe delivery must not count twice
                yield frame(i-1)  # out of order must not count
                if i == 29:
                    self.assertTrue(lab.detector.calibrating)
                    self.assertEqual(len(lab.detector.collect), 29)
        lab.source = source
        process = threading.Thread(target=lab.process, args=(lab.stop,))
        process.start()
        try:
            lab.acquire('camera', lab.stop)
            self.assertEqual(lab.received_count, 30)
            self.assertEqual(lab.processed_count, 30)
            self.assertFalse(lab.detector.calibrating)
            self.assertIsNotNone(lab.detector.reference)
        finally:
            lab.stop.set()
            lab.frames.close()
            process.join(2)

    def test_stale_frame_not_processed_and_source_age_includes_queue_wait(self):
        lab = Lab()
        lab.frames.put(frame(1, age=400))
        worker = threading.Thread(target=lab.process, args=(lab.stop,))
        worker.start()
        try:
            wait_for(lambda: lab.frames.item is None)
            self.assertEqual(lab.processed_count, 0)
            lab.frames.put(frame(2, age=100))
            wait_for(lambda: lab.frame_id == 2)
            self.assertGreaterEqual(lab.snapshot(compact=True)['source_age_ms'], 100)
        finally:
            lab.stop.set()
            lab.frames.close()
            worker.join(2)

    def test_shutdown_cannot_publish_a_late_detection(self):
        lab, entered, release = Lab(), threading.Event(), threading.Event()
        lab.mode = 'camera'
        def slow(*args, **kwargs):
            entered.set()
            release.wait(2)
            return {'state': 'near', 'near_regions': [{'center': [.5,.5]}]}
        lab.detector.update = slow
        process = threading.Thread(target=lab.process, args=(lab.stop,))
        lab.threads = [process]
        process.start()
        lab.frames.put(frame())
        self.assertTrue(entered.wait(1))
        shutdown = threading.Thread(target=lab.shutdown)
        shutdown.start()
        wait_for(lambda: lab.mode == 'stopped')
        release.set()
        shutdown.join(2)
        self.assertFalse(shutdown.is_alive())
        self.assertEqual(lab.snapshot(compact=True)['result']['near_regions'], [])
        self.assertEqual(lab.frame_at, 0)

    def test_calibration_invalidates_before_waiting_for_old_detection(self):
        lab, entered, release = Lab(), threading.Event(), threading.Event()
        lab.frame_at = time.monotonic()
        def slow(*args, **kwargs):
            entered.set()
            release.wait(2)
            return {'state': 'near', 'near_regions': [{'center': [.5,.5]}]}
        lab.detector.update = slow
        process = threading.Thread(target=lab.process, args=(lab.stop,))
        process.start()
        lab.frames.put(frame())
        self.assertTrue(entered.wait(1))
        calibrate = threading.Thread(target=lab.calibrate, args=([.2,.2,.8,.8],))
        calibrate.start()
        try:
            wait_for(lambda: lab.calibration_requested)
            self.assertEqual(lab.snapshot(compact=True)['result']['state'], 'calibrating')
            self.assertEqual(lab.snapshot(compact=True)['result']['near_regions'], [])
            release.set()
            calibrate.join(2)
            self.assertEqual(lab.snapshot(compact=True)['result']['state'], 'calibrating')
        finally:
            release.set()
            lab.stop.set()
            lab.frames.close()
            process.join(2)
            calibrate.join(2)


if __name__ == '__main__':
    unittest.main()
