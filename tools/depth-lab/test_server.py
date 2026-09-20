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
