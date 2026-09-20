import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SoundDirector, type SoundState } from '../lib/sound-state.ts';
const base: SoundState = {
  time: 0,
  phase: 'alone',
  stroked: false,
  enjoyment: 0,
  resting: false,
  alarm: 0,
};
void test('idle stays silent; entering observe chirps only once', () => {
  const d = new SoundDirector();
  d.update(base);
  assert.equal(d.update({ ...base, time: 1 }).cue, undefined);
  assert.equal(d.update({ ...base, time: 2, phase: 'observe' }).cue, 'scales');
  assert.equal(
    d.update({ ...base, time: 40, phase: 'observe' }).cue,
    undefined,
  );
});
void test('long stroke has a finite sequence, never loops', () => {
  const d = new SoundDirector();
  d.update(base);
  const cues: string[] = [];
  for (let time = 1; time < 100; time += 0.1) {
    const e = d.update({ ...base, time, stroked: true, enjoyment: 0.8 });
    if (e.cue) cues.push(e.cue);
  }
  assert.deepEqual(cues, ['touch', 'voice', 'purr', 'roll']);
});
void test('leaving fades and does not queue the happy sound', () => {
  const d = new SoundDirector();
  d.update(base);
  d.update({ ...base, time: 1, stroked: true });
  assert.equal(d.update({ ...base, time: 1.1 }).stop, true);
  assert.equal(d.update({ ...base, time: 20, enjoyment: 0.9 }).cue, undefined);
});
void test('alarm preempts sound and rest plays once per rest entry', () => {
  const d = new SoundDirector();
  d.update(base);
  assert.deepEqual(d.update({ ...base, time: 1, stroked: true, alarm: 0.3 }), {
    stop: true,
  });
  assert.equal(d.update({ ...base, time: 10, resting: true }).cue, 'rest');
  assert.equal(d.update({ ...base, time: 50, resting: true }).cue, undefined);
  assert.equal(d.update({ ...base, time: 51 }).stop, true);
});
void test('new encounter discards old sound state', () => {
  const d = new SoundDirector();
  d.update(base);
  d.update({ ...base, time: 20, stroked: true });
  assert.deepEqual(d.update(base), { stop: true });
  assert.equal(d.update({ ...base, time: 1, stroked: true }).cue, 'touch');
});
