import test from 'node:test';
import assert from 'node:assert/strict';
import { stabilizeSceneObjects, type TrackedSceneBox } from '../lib/scene-tracking.ts';

const box = (x: number, y: number, label = 'bed'): TrackedSceneBox => ({ label, score: 0.8, x, y, width: 0.4, height: 0.3, lastSeenAt: 0 });

void test('scene tracking blends matching boxes instead of jumping', () => {
  const tracked = stabilizeSceneObjects([box(0.1, 0.2)], [{ label: 'bed', score: 0.8, x: 0.25, y: 0.2, width: 0.4, height: 0.3 }], 700);
  assert.equal(tracked.length, 1);
  assert.ok(tracked[0].x > 0.1 && tracked[0].x < 0.25);
  assert.equal(tracked[0].lastSeenAt, 700);
});

void test('scene tracking holds a briefly occluded object and expires it', () => {
  const previous = [box(0.1, 0.2)];
  assert.equal(stabilizeSceneObjects(previous, [], 900).length, 1);
  assert.equal(stabilizeSceneObjects(previous, [], 1301).length, 0);
});

void test('scene tracking does not merge different labels', () => {
  const tracked = stabilizeSceneObjects([box(0.1, 0.2, 'bed')], [{ label: 'cat', score: 0.8, x: 0.11, y: 0.2, width: 0.4, height: 0.3 }], 700);
  assert.equal(tracked.length, 2);
});
