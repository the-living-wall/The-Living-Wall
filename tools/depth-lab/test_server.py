import time
import unittest
from server import Lab

class SnapshotTests(unittest.TestCase):
    def test_entity_page_is_present(self):
        from pathlib import Path
        self.assertTrue((Path(__file__).parent / 'entity.html').is_file())

    def test_stale_frame_removes_interaction_geometry(self):
        lab = Lab()
        lab.frame_at = time.monotonic() - 2
        lab.result = dict(state='near', gap_mm=20, position=[.5,.5],
                          regions=[{'area_px':200}], near_regions=[{'area_px':40}],
                          diagnostic_valid=True)
        result = lab.snapshot()['result']
        self.assertEqual(result['state'], 'unknown')
        self.assertEqual(result['regions'], [])
        self.assertEqual(result['near_regions'], [])
        self.assertIsNone(result['position'])
        self.assertFalse(result['diagnostic_valid'])


class DeviceErrorTests(unittest.TestCase):
    def test_missing_sdk_keeps_original_error_and_windows_instructions(self):
        from unittest.mock import patch
        from server import describe_device_error
        with patch('server.sys.platform', 'win32'):
            text = describe_device_error(ImportError('DLL load failed: missing dependency'))
        self.assertIn('安装环境.bat', text)
        self.assertIn('VC++', text)
        self.assertIn('DLL load failed: missing dependency', text)

    def test_windows_usb_error_does_not_suggest_macos_permissions(self):
        from unittest.mock import patch
        from server import describe_device_error
        with patch('server.sys.platform', 'win32'):
            text = describe_device_error(RuntimeError('uvc_open failed Code: -3'))
        self.assertIn('Windows', text)
        self.assertNotIn('macOS', text)

    def test_macos_usb_permission_guidance_is_preserved(self):
        from unittest.mock import patch
        from server import describe_device_error
        with patch('server.sys.platform', 'darwin'):
            text = describe_device_error(RuntimeError('uvc_open failed Code: -3'))
        self.assertIn('macOS', text)
        self.assertIn('权限', text)

    def test_missing_sdk_sets_error_without_simulation(self):
        from unittest.mock import patch
        import threading
        lab = Lab()
        with patch.dict('sys.modules', {'pyorbbecsdk': None}), patch('server.sys.platform', 'win32'):
            lab.run('camera', threading.Event())
        self.assertEqual(lab.mode, 'error')
        self.assertEqual(lab.result['state'], 'error')
        self.assertIsNone(lab.image)
        self.assertEqual(lab.frame_at, 0)
        self.assertIn('安装环境.bat', lab.message)

    def test_no_device_sets_error_without_simulation(self):
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        import threading
        context = Mock()
        context.query_devices.return_value.get_count.return_value = 0
        sdk = SimpleNamespace(Context=lambda: context, Pipeline=Mock(), Config=Mock(),
                              OBSensorType=Mock(), OBFormat=Mock())
        lab = Lab()
        with patch.dict('sys.modules', {'pyorbbecsdk': sdk}), patch('server.sys.platform', 'win32'):
            lab.run('camera', threading.Event())
        self.assertEqual(lab.mode, 'error')
        self.assertEqual(lab.result['state'], 'error')
        self.assertIsNone(lab.image)
        self.assertIn('未检测到 Orbbec 相机', lab.message)
        sdk.Pipeline.assert_not_called()

    def test_windows_rejects_pipe_before_opening_server(self):
        import contextlib
        import io
        import runpy
        from pathlib import Path
        from unittest.mock import patch
        error = io.StringIO()
        with patch('sys.platform', 'win32'), patch('sys.argv', ['server.py', '--capture-stdin']), \
                patch('http.server.ThreadingHTTPServer') as http, contextlib.redirect_stderr(error):
            with self.assertRaises(SystemExit) as exit_info:
                runpy.run_path(str(Path(__file__).with_name('server.py')), run_name='__main__')
        self.assertEqual(exit_info.exception.code, 2)
        http.assert_not_called()
        self.assertIn('Windows', error.getvalue())


class SimulationTests(unittest.TestCase):
    def test_explicit_simulation_can_calibrate_and_stop(self):
        lab = Lab()
        try:
            lab.start('simulation')
            deadline = time.monotonic() + 10
            while not lab.snapshot()['image'] and time.monotonic() < deadline:
                time.sleep(.05)
            self.assertIsNotNone(lab.snapshot()['image'])
            with lab.lock:
                lab.detector.begin((.2, .2, .8, .8))
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if lab.snapshot()['result'].get('state') == 'away':
                    break
                time.sleep(.05)
            self.assertEqual(lab.snapshot()['result']['state'], 'away')
            self.assertEqual(lab.mode, 'simulation')
        finally:
            lab.shutdown()
        self.assertEqual(lab.mode, 'stopped')
        self.assertIsNone(lab.image)


if __name__ == '__main__':
    unittest.main()
