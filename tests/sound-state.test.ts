import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SoundDirector, type SoundState } from '../lib/sound-state.ts';
const base: SoundState = {
  time: 0,
  phase: 'alone',
  stroked: false,
  touching: false,
  enjoyment: 0,
  resting: false,
  alarm: 0,
  heading: 0,
  motionSpeed: 0,
  frightCount: 0,
};
void test('idle and observing remain silent', () => {
  const d = new SoundDirector();
  d.update(base);
  assert.equal(d.update({ ...base, time: 1 }).cue, undefined);
  assert.equal(d.update({ ...base, time: 2, phase: 'observe' }).cue, undefined);
  assert.equal(
    d.update({ ...base, time: 40, phase: 'observe' }).cue,
    undefined,
  );
});
void test('curiosity speaks once when observation becomes a probe or invitation', () => {
  const d = new SoundDirector();
  d.update(base);
  assert.equal(d.update({ ...base, time: 1, phase: 'observe' }).cue, undefined);
  assert.equal(d.update({ ...base, time: 2, phase: 'probe' }).cue, 'curiosity');
  assert.equal(d.update({ ...base, time: 3, phase: 'probe' }).cue, undefined);
  assert.equal(d.update({ ...base, time: 4, phase: 'invite' }).cue, 'curiosity');
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
void test('alarm preempts with scales and rest plays once per rest entry', () => {
  const d = new SoundDirector();
  d.update(base);
  assert.deepEqual(d.update({ ...base, time: 1, stroked: true, alarm: 0.3 }), {
    stop: true,
    cue: 'startle',
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

void test('rest entry preempts the previous cue cooldown', () => {
  const d = new SoundDirector();
  d.update(base);
  d.update({ ...base, time: 1, stroked: true });
  assert.deepEqual(d.update({ ...base, time: 1.2, resting: true }), {
    stop: true,
    cue: 'rest',
  });
});

void test('shock survives following frames and silence resumes after finite cue', () => {
  const d = new SoundDirector();
  d.update(base);
  d.update({ ...base, time: 1, stroked: true });
  assert.deepEqual(d.update({ ...base, time: 1.1, alarm: 0.8 }), {
    stop: true,
    cue: 'startle',
  });
  for (let time = 1.2; time < 2.3; time += 0.1)
    assert.deepEqual(d.update({ ...base, time, alarm: 0.7 }), { stop: false });
  assert.equal(d.update({ ...base, time: 2.5, alarm: 0.5 }).stop, true);
  assert.deepEqual(d.update({ ...base, time: 3, alarm: 0.4 }), { stop: false });
});
void test('rapid real turns make bounded bursts, slowing fades, idle stays quiet', () => {
  const d = new SoundDirector();
  d.update(base);
  const cues: number[] = [];
  for (let frame = 1; frame <= 180; frame++) {
    const time = frame / 60;
    const e = d.update({ ...base, time, heading: time * 2 });
    if (e.cue) {
      assert.equal(e.cue, 'scales');
      cues.push(time);
    }
  }
  assert.equal(cues.length, 1);
  assert.equal(d.update({ ...base, time: 3.02, heading: 6.001 }).stop, false);
  assert.equal(d.update({ ...base, time: 4, heading: 6.001 }).cue, undefined);
});
void test('wrapped angle, slow breathing turns and resumed frames do not rustle', () => {
  const d = new SoundDirector();
  d.update({ ...base, heading: Math.PI - 0.001 });
  assert.equal(
    d.update({ ...base, time: 0.02, heading: -Math.PI + 0.001 }).cue,
    undefined,
  );
  assert.equal(d.update({ ...base, time: 2, heading: 0 }).cue, undefined);
  assert.equal(d.update({ ...base, time: 2.02, heading: 0.01 }).cue, undefined);
});
void test('fright bookkeeping alone never replays startle during recovery', () => {
  const d = new SoundDirector();
  d.update(base);
  d.update({ ...base, time: 0.1, alarm: 0.8, frightCount: 1 });
  assert.equal(d.update({ ...base, time: 0.5, alarm: 0.9, frightCount: 2 }).cue, undefined);
  assert.deepEqual(
    d.update({ ...base, time: 0.52, alarm: 0.9, frightCount: 2 }),
    { stop: false },
  );
});

void test('material rotation and movement cues ignore behaviour phase', () => {
  const d = new SoundDirector();
  d.update({ ...base, resting: true });
  assert.equal(d.update({ ...base, time: 0.1, resting: true, heading: 0.08 }).cue, 'scales');
  d.update({ ...base, time: 0.2, resting: true, heading: 0.08 });
  assert.equal(d.update({ ...base, time: 0.3, resting: true, heading: 0.08, motionSpeed: 0.12 }).cue, undefined);
  d.update({ ...base, time: 2, resting: true, heading: 0.08, motionSpeed: 0.02 });
  assert.equal(d.update({ ...base, time: 2.1, resting: true, heading: 0.08, motionSpeed: 0.12 }).cue, 'move');
});

void test('stationary contact acknowledges once without advancing enjoyment', () => {
  const d = new SoundDirector();
  d.update(base);
  assert.equal(d.update({ ...base, time: 0.1, touching: true }).cue, 'touch');
  for (let time = 0.2; time < 10; time += 0.1)
    assert.equal(d.update({ ...base, time, touching: true }).cue, undefined);
});

void test('turning during petting cannot steal or reset the enjoyment sequence', () => {
  const d = new SoundDirector();
  d.update(base);
  const cues: string[] = [];
  for (let frame = 1; frame < 1200; frame++) {
    const time = frame / 60;
    const e = d.update({ ...base, time, heading: time * 2, touching: true, stroked: true, enjoyment: 0.9 });
    if (e.cue) cues.push(e.cue);
  }
  assert.deepEqual(cues, ['scales', 'touch', 'voice', 'purr', 'roll']);
  assert.equal(d.update({ ...base, time: 20.1, enjoyment: 0.8 }).cue, 'settle');
  assert.equal(d.update({ ...base, time: 21, enjoyment: 0.8 }).cue, undefined);
});

void test('every fast turn onset speaks even during touch', () => {
  const d = new SoundDirector();
  d.update({ ...base, touching: true, stroked: true });
  assert.equal(
    d.update({ ...base, time: 0.1, heading: 0.2, touching: true, stroked: true }).cue,
    'scales',
  );
  d.update({ ...base, time: 0.2, heading: 0.4, touching: true, stroked: true });
  d.update({ ...base, time: 0.8, heading: 0.4, touching: true, stroked: true });
  assert.equal(d.update({ ...base, time: 0.9, heading: 1.1, touching: true, stroked: true }).cue, undefined);
  d.update({ ...base, time: 2, heading: 1.1, touching: true, stroked: true });
  assert.equal(d.update({ ...base, time: 2.1, heading: 1.4, touching: true, stroked: true }).cue, 'scales');
});

void test('actual creature movement emits one short whoosh per movement burst', () => {
  const d = new SoundDirector();
  d.update(base);
  assert.equal(d.update({ ...base, time: 0.1, motionSpeed: 0.3 }).cue, 'move');
  assert.equal(d.update({ ...base, time: 0.2, motionSpeed: 0.4 }).cue, undefined);
  d.update({ ...base, time: 0.8, motionSpeed: 0.05 });
  assert.equal(d.update({ ...base, time: 0.9, motionSpeed: 0.3 }).cue, undefined);
  d.update({ ...base, time: 2, motionSpeed: 0.05 });
  assert.equal(d.update({ ...base, time: 2.1, motionSpeed: 0.3 }).cue, 'move');
});

void test('movement overlays do not reset the long-enjoyment clock', () => {
  const d = new SoundDirector();
  d.update(base);
  d.update({ ...base, time: 0.1, stroked: true, enjoyment: 0.9 });
  d.update({ ...base, time: 1.2, stroked: true, enjoyment: 0.9, motionSpeed: 0.3 });
  d.update({ ...base, time: 1.3, stroked: true, enjoyment: 0.9, motionSpeed: 0.02 });
  assert.equal(
    d.update({ ...base, time: 4.2, stroked: true, enjoyment: 0.9, motionSpeed: 0.02 }).cue,
    'purr',
  );
});

void test('all petting cues respond within eight seconds without looping', () => {
  const d = new SoundDirector();
  d.update(base);
  const cues: { cue: string; time: number }[] = [];
  for (let frame = 1; frame <= 1200; frame++) {
    const time = frame / 60;
    const e = d.update({
      ...base,
      time,
      stroked: true,
      touching: true,
      enjoyment: 0.9,
    });
    if (e.cue) cues.push({ cue: e.cue, time });
  }
  assert.deepEqual(
    cues.map((x) => x.cue),
    ['touch', 'voice', 'purr', 'roll'],
  );
  assert.ok(cues[1].time < 1.2);
  assert.ok(cues[2].time < 4.1);
  assert.ok(cues[3].time < 8.1);
});
void test('brief stroke reversals retain the sequence; idle cannot advance it', () => {
  const d = new SoundDirector();
  d.update(base);
  assert.equal(
    d.update({ ...base, time: 0.1, stroked: true, touching: true }).cue,
    'touch',
  );
  assert.deepEqual(d.update({ ...base, time: 0.3, touching: true }), {
    stop: false,
  });
  assert.equal(
    d.update({ ...base, time: 0.4, stroked: true, touching: true }).cue,
    undefined,
  );
  d.update({ ...base, time: 1, stroked: true, touching: true });
  assert.equal(
    d.update({ ...base, time: 1.3, stroked: true, touching: true }).cue,
    'voice',
  );
  assert.equal(d.update({ ...base, time: 1.6, touching: true }).cue, undefined);
  assert.equal(d.update({ ...base, time: 2, touching: true }).stop, true);
  assert.equal(d.update({ ...base, time: 10, touching: true }).cue, undefined);
});
void test('busy playback does not consume the creature response', () => {
  const d = new SoundDirector();
  d.update(base);
  d.update({ ...base, time: 0.1, stroked: true });
  assert.equal(
    d.update({ ...base, time: 1.3, stroked: true }, true).cue,
    undefined,
  );
  assert.equal(
    d.update({ ...base, time: 1.4, stroked: true }, false).cue,
    'voice',
  );
});
