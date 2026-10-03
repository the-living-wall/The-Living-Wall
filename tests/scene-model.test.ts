import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSceneModelConfig, parseSceneModelConfig, selectSceneModels } from '../lib/scene-model.ts';

void test('household model is tried before the generic fallback', () => {
  const models = selectSceneModels({ models: [
    { id: 'generic', name: '通用', version: '1', kind: 'generic', path: '/generic.tflite' },
    { id: 'home', name: '家庭', version: '1', kind: 'household', path: '/home.tflite' },
  ] });
  assert.deepEqual(models.map((model) => model.id), ['home', 'generic']);
});

void test('unavailable and duplicate entries do not shadow the fallback', () => {
  const models = selectSceneModels({ models: [
    { id: 'home', name: '家庭', version: '1', kind: 'household', path: '/home.tflite', available: false },
    { id: 'generic', name: '通用', version: '1', kind: 'generic', path: '/generic.tflite' },
    { id: 'generic', name: '旧通用', version: '0', kind: 'generic', path: '/old.tflite' },
  ] });
  assert.deepEqual(models.map((model) => model.id), ['generic']);
});

void test('malformed manifests safely use the generic model', () => {
  assert.deepEqual(parseSceneModelConfig({ nope: true }), defaultSceneModelConfig);
  assert.deepEqual(parseSceneModelConfig({ models: [{ kind: 'household', path: '/broken.tflite' }] }), defaultSceneModelConfig);
});
