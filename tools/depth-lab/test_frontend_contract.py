"""Exercise actual detector output through the frontend adapter; requires Node 24."""
import json
from pathlib import Path
import subprocess
import time
import unittest

import numpy as np
from server import Lab


class FrontendContractTests(unittest.TestCase):
    def test_detector_snapshot_is_accepted_and_stale_input_is_cleared(self):
        lab = Lab()
        lab.mode = 'pipe'  # synthetic fixture only, not hardware evidence
        wall = np.full((240, 320), 1000, dtype=np.float32)
        intrinsics = (300., 300., 159.5, 119.5)
        lab.detector.begin((.2, .2, .8, .8))
        for i in range(30):
            lab.detector.update(wall, intrinsics, now=i * .1)
        frame = wall.copy()
        frame[90:145, 130:190] -= 20
        lab.result = lab.detector.update(frame, intrinsics, now=10)
        lab.frame_at = time.monotonic()
        lab.source_at = lab.frame_at * 1000
        lab.frame_id, lab.processing_ms = 31, 2
        active = lab.snapshot(compact=True)
        lab.source_at = (time.monotonic() - .4) * 1000
        stale = lab.snapshot(compact=True)
        script = '''
import assert from 'node:assert/strict';
import { adaptDepthState } from './lib/depth-input.ts';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const [active, stale] = JSON.parse(input);
const result = adaptDepthState(active);
assert.equal(result.kind, 'active');
assert.ok(result.point.x > 0 && result.point.x < 1);
assert.ok(result.point.y > 0 && result.point.y < 1);
assert.equal(adaptDepthState(stale).point, null);
assert.equal(adaptDepthState({...active, mode: 'simulation'}).point, null);
'''
        subprocess.run(
            ['node', '--input-type=module', '-e', script],
            input=json.dumps([active, stale]), text=True, check=True,
            cwd=Path(__file__).resolve().parents[2],
        )


if __name__ == '__main__':
    unittest.main()
