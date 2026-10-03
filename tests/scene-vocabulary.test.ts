import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichSceneBox, getSceneVocabulary, resolveSceneVocabulary } from '../lib/scene-vocabulary.ts';

void test('aliases collapse to one canonical scene label', () => {
  assert.equal(resolveSceneVocabulary('couch').canonical, 'sofa');
  assert.equal(resolveSceneVocabulary('couch').displayName, '沙发');
  assert.equal(resolveSceneVocabulary('dining table').canonical, 'table');
});

void test('planned household vocabulary is explicit instead of falsely recognized', () => {
  assert.equal(resolveSceneVocabulary('pillow').support, 'planned');
  assert.equal(resolveSceneVocabulary('wardrobe').displayName, '衣柜');
  assert.equal(resolveSceneVocabulary('mirror').role, 'room-fixture');
});

void test('unknown labels remain visible without inventing a semantic role', () => {
  const box = enrichSceneBox({ label: 'unknown-object', score: 0.7, x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  assert.equal(box.displayName, 'unknown-object');
  assert.equal(box.support, 'unknown');
  assert.equal(box.role, 'unknown');
});

void test('vocabulary has no duplicate aliases', () => {
  const aliases = getSceneVocabulary().flatMap((entry) => entry.aliases);
  assert.equal(new Set(aliases).size, aliases.length);
});
