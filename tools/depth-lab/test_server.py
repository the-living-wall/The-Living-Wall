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

if __name__ == '__main__':
    unittest.main()

class HandlerTests(unittest.TestCase):
    def request(self, path, headers=None):
        from server import Handler
        from types import SimpleNamespace
        from unittest.mock import patch
        handler = Handler.__new__(Handler)
        handler.path, handler.server = path, SimpleNamespace(server_port=8769)
        handler.headers = {'Host': '127.0.0.1:8769', **(headers or {})}
        response = {}
        handler.reply = lambda data, status=200, mime=None: response.update(data=data, status=status)
        fixture = Lab()
        fixture.mode = 'pipe'
        fixture.frame_id, fixture.processing_ms = 1, 2
        fixture.frame_at = time.monotonic()
        fixture.source_at = fixture.frame_at*1000
        fixture.image = 'jpeg-test-only'
        fixture.result = dict(state='near', background_model='pixel-wall-v2', diagnostic_valid=True,
                              near_regions=[dict(center=[.5,.5], area_px=80, contour=[[1,2]])])
        with patch('server.lab', fixture):
            handler.do_GET()
        return response

    def test_light_endpoint_has_no_images_or_contours_and_legacy_state_still_works(self):
        import json
        response = self.request('/api/input')
        self.assertEqual(response['status'], 200)
        self.assertEqual(response['data']['protocol_version'], 1)
        self.assertNotIn('image', json.dumps(response['data']))
        self.assertNotIn('contour', json.dumps(response['data']))
        original = self.request('/api/state')['data']
        self.assertEqual(original['image'], 'jpeg-test-only')
        self.assertIn('contour', original['result']['near_regions'][0])

    def test_input_rejects_foreign_host_origin_and_fetch_site(self):
        for headers in ({'Host': 'example.com'}, {'Origin': 'http://example.com'}, {'Sec-Fetch-Site': 'cross-site'}):
            self.assertEqual(self.request('/api/input', headers)['status'], 403)
