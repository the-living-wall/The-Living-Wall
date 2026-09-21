import test from 'node:test';
import assert from 'node:assert/strict';
import { getGrowthStage } from '../lib/creature.ts';
import {
  getVisualStageParams,
  VISUAL_STAGE_PARAMS,
} from '../lib/visual-stage.ts';

void test('visual stage parameters cover the five growth stages', () => {
  assert.equal(VISUAL_STAGE_PARAMS.length, 5);
  for (const [index, params] of VISUAL_STAGE_PARAMS.entries()) {
    assert.equal(params.stage, index);
    assert.equal(getVisualStageParams(index as 0 | 1 | 2 | 3 | 4), params);
  }
});

void test('visual expression grows from sparse white light to a fuller coloured body', () => {
  const first = getVisualStageParams(getGrowthStage(0));
  const last = getVisualStageParams(getGrowthStage(1));
  assert.ok(last.bodyScale > first.bodyScale);
  assert.ok(last.bodyRadius > first.bodyRadius);
  assert.ok(last.coreScale > first.coreScale);
  assert.ok(last.particleLimit > first.particleLimit);
  assert.ok(last.saturation > first.saturation);
  assert.ok(last.scoutScale > first.scoutScale);
});

void test('stage colour variation stays within the restrained palette envelope', () => {
  for (const params of VISUAL_STAGE_PARAMS) {
    assert.ok(params.saturation >= 0 && params.saturation <= 78);
    assert.ok(params.hue >= 150 && params.hue <= 230);
    assert.ok(params.hueRange >= 12 && params.hueRange <= 48);
  }
});
