import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptDepthState } from '../lib/depth-input.ts';

const state = (overrides: Record<string, unknown> = {}) => ({
  mode: 'camera',
  age_ms: 20,
  result: {
    state: 'near',
    background_model: 'pixel-wall-v2',
    diagnostic_valid: true,
    near_regions: [
      { area_px: 40, center: [0.2, 0.3] },
      { area_px: 100, center: [0.7, 0.8] },
    ],
  },
  ...overrides,
});

void test('chooses largest true-camera region and mirrors both axes', () => {
  assert.deepEqual(adaptDepthState(state()).point, { x: 0.7, y: 0.8 });
  assert.deepEqual(adaptDepthState(state({ mode: 'pipe' }), true, true).point, {
    x: 0.30000000000000004,
    y: 0.19999999999999996,
  });
});

void test('rejects simulation, stale and malformed frames', () => {
  assert.equal(adaptDepthState(state({ mode: 'simulation' })).point, null);
  assert.equal(adaptDepthState(state({ age_ms: 301 })).point, null);
  assert.equal(adaptDepthState(state({ age_ms: -1 })).point, null);
  assert.equal(
    adaptDepthState(
      state({ result: { ...state().result, diagnostic_valid: false } }),
    ).point,
    null,
  );
  assert.equal(
    adaptDepthState(
      state({
        result: {
          ...state().result,
          near_regions: [{ area_px: 200, center: [1.1, 0.2] }],
        },
      }),
    ).point,
    null,
  );
});

void test('calibration message takes priority and absent region clears input', () => {
  const calibration = adaptDepthState(
    state({ result: { state: 'calibrating' }, age_ms: null }),
  );
  assert.equal(calibration.kind, 'calibrating');
  assert.equal(calibration.point, null);
  assert.equal(
    adaptDepthState(state({ result: { ...state().result, near_regions: [] } }))
      .kind,
    'waiting',
  );
});
