import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composeVocalGesture, VoiceCooldowns } from '../lib/xiaoying-voice-semantics.ts';

void test('gesture composition is deterministic and bounded', () => {
  const first = composeVocalGesture(['curiosity', 'invite'], 42);
  assert.deepEqual(first, composeVocalGesture(['curiosity', 'invite'], 42));
  assert.ok(first.durationMs >= 630 && first.durationMs <= 2000);
  assert.ok(first.variant >= 0 && first.variant < 3);
});

void test('gestures reject empty or oversized combinations', () => {
  assert.throws(() => composeVocalGesture([], 1));
  assert.throws(() => composeVocalGesture(['curiosity', 'invite', 'play', 'settle'], 1));
});

void test('cooldowns prevent repeated phonemes until elapsed', () => {
  const cooldowns = new VoiceCooldowns();
  assert.equal(cooldowns.canPlay('startle', 0), true);
  cooldowns.markPlayed('startle', 0);
  assert.equal(cooldowns.canPlay('startle', 2599), false);
  assert.equal(cooldowns.canPlay('startle', 2600), true);
});
