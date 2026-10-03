import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowCreature } from '../lib/space-visibility.ts';

void test('invites Xiaoying from a palm or detected object before a habitat is saved', () => {
  assert.equal(shouldShowCreature({ active: true, handOpen: true, hasHabitat: false, anchorMatches: false, hasAnchor: false, hasSceneTarget: false }), true);
  assert.equal(shouldShowCreature({ active: true, handOpen: false, hasHabitat: false, anchorMatches: false, hasAnchor: false, hasSceneTarget: true }), true);
});

void test('a saved habitat blocks unrelated palms and objects', () => {
  assert.equal(shouldShowCreature({ active: true, handOpen: true, hasHabitat: true, anchorMatches: false, hasAnchor: false, hasSceneTarget: true }), false);
  assert.equal(shouldShowCreature({ active: true, handOpen: false, hasHabitat: true, anchorMatches: true, hasAnchor: true, hasSceneTarget: false }), true);
});

void test('inactive space mode never renders the creature', () => {
  assert.equal(shouldShowCreature({ active: false, handOpen: true, hasHabitat: false, anchorMatches: false, hasAnchor: true, hasSceneTarget: true }), false);
});
