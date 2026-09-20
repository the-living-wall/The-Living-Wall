import assert from 'node:assert/strict';
import test from 'node:test';
import { Creature } from '../lib/creature.ts';
import {
  depthArchiveKey,
  normalArchiveKey,
  switchCreatureArchive,
} from '../lib/creature-archive.ts';

void test('depth experiment writes only its archive and restores normal growth', () => {
  const values = new Map<string, string>();
  const store = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const normal = new Creature();
  normal.care = 240;
  const experiment = switchCreatureArchive(
    store,
    normal,
    normalArchiveKey,
    depthArchiveKey,
  );
  assert.equal(experiment.care, 0);
  experiment.care = 50;
  const restored = switchCreatureArchive(
    store,
    experiment,
    depthArchiveKey,
    normalArchiveKey,
  );
  assert.equal(restored.care, 240);
  assert.equal(JSON.parse(values.get(depthArchiveKey)!).care, 50);
  assert.equal(JSON.parse(values.get(normalArchiveKey)!).care, 240);
});
