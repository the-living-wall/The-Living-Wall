import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Creature } from '../lib/creature.ts';
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
const start = () => {
  const d = new SoundDirector();
  d.update(base);
  return d;
};

void test('real unattended Creature breathes without initial heading rustle', () => {
  const c = new Creature();
  c.resize(1280, 900);
  const d = new SoundDirector();
  d.update(c);
  const cues: string[] = [];
  for (let frame = 0; frame < 750; frame++) {
    c.step(1 / 60, { x: 0.5, y: 0.5, speed: 0, seen: false });
    const e = d.update(c);
    if (e.cue) cues.push(e.cue);
    assert.equal(e.bodyCue, undefined);
    assert.equal(e.move, undefined);
  }
  assert.deepEqual(cues, ['rest']);
});

void test('idle breath is sparse, gated by actual quiet, and does not require fatigue', () => {
  const d = start();
  assert.equal(d.update({ ...base, time: 9 }).cue, undefined);
  assert.equal(d.update({ ...base, time: 10 }).cue, 'rest');
  assert.equal(d.update({ ...base, time: 27 }).cue, undefined);
  assert.equal(d.update({ ...base, time: 28 }).cue, 'rest');
  d.update({ ...base, time: 29, phase: 'observe' });
  assert.equal(d.update({ ...base, time: 40 }).cue, undefined);
  assert.equal(d.update({ ...base, time: 59 }).cue, 'rest');
});
void test('busy channel postpones idle breath instead of consuming it', () => {
  const d = start();
  assert.equal(d.update({ ...base, time: 10 }, true).cue, undefined);
  assert.equal(d.update({ ...base, time: 10.1 }, false).cue, 'rest');
});
void test('stationary touch acknowledges once and never earns enjoyment', () => {
  const d = start();
  assert.equal(d.update({ ...base, time: 0.1, touching: true }).cue, 'touch');
  for (let time = 0.2; time < 12; time += 0.1) {
    const e = d.update({ ...base, time, touching: true });
    assert.equal(e.cue, undefined);
    assert.equal(e.purring, false);
  }
});
void test('enjoyment begins with the visible threshold even while core is busy', () => {
  const d = start();
  d.update({ ...base, time: 0.1, touching: true, stroked: true });
  const e = d.update(
    { ...base, time: 0.2, touching: true, stroked: true, enjoyment: 0.46 },
    true,
  );
  assert.equal(e.purring, true);
});
void test('brief reversals preserve purr; long pause and lost contact release it', () => {
  const d = start();
  d.update({ ...base, time: 1, touching: true, stroked: true, enjoyment: 0.8 });
  assert.equal(
    d.update({ ...base, time: 1.6, touching: true, enjoyment: 0.7 }).purring,
    true,
  );
  const end = d.update({ ...base, time: 1.9, touching: true, enjoyment: 0.6 });
  assert.equal(end.purring, false);
  assert.equal(end.cue, 'settle');
  d.update({ ...base, time: 2, touching: true, stroked: true, enjoyment: 0.8 });
  assert.equal(d.update({ ...base, time: 2.1, enjoyment: 0.8 }).purring, false);
});
void test('core response retries after busy playback without replaying its sequence', () => {
  const d = start();
  const stroke = { ...base, touching: true, stroked: true, enjoyment: 0.8 };
  d.update({ ...stroke, time: 0.1 });
  assert.equal(d.update({ ...stroke, time: 1.2 }, true).cue, undefined);
  assert.equal(d.update({ ...stroke, time: 1.3 }).cue, 'voice');
  assert.equal(d.update({ ...stroke, time: 8 }).cue, undefined);
  // Sustained enjoyment does not manufacture a rotation event.
  assert.equal(d.update({ ...stroke, time: 9 }).bodyCue, undefined);
});
void test('contact and curiosity at the same moment do not lose curiosity', () => {
  const d = start();
  const probe = { ...base, phase: 'probe', touching: true };
  assert.equal(d.update({ ...probe, time: 1 }).cue, 'touch');
  assert.equal(d.update({ ...probe, time: 1.2 }, true).cue, undefined);
  assert.equal(d.update({ ...probe, time: 1.5 }).cue, 'curiosity');
  assert.equal(d.update({ ...probe, time: 1.6 }).cue, undefined);
});
void test('stale curiosity never plays after leaving the phase or expiry', () => {
  const d = start();
  d.update({ ...base, time: 1, phase: 'probe' }, true);
  assert.equal(
    d.update({ ...base, time: 1.5, phase: 'search' }).cue,
    undefined,
  );
  d.update({ ...base, time: 2, phase: 'invite' }, true);
  assert.equal(
    d.update({ ...base, time: 3.1, phase: 'invite' }).cue,
    undefined,
  );
});
void test('real fast rotation starts scales then roll without stroking', () => {
  const d = start();
  const events = [];
  for (let frame = 1; frame <= 180; frame++) {
    const time = frame / 60;
    const e = d.update({ ...base, time, heading: time * 2.5 });
    if (e.bodyCue) events.push({ cue: e.bodyCue, time });
  }
  assert.equal(events[0].cue, 'scales');
  assert.equal(events[1].cue, 'roll');
  assert.ok(events[1].time < 0.5);
  assert.ok(events.length <= 4, 'bounded bursts, not per-frame sounds');
});
void test('wrapped angles, slow breath drift and resumed frames stay quiet', () => {
  const d = start();
  d.update({ ...base, time: 1, heading: Math.PI - 0.001 });
  assert.equal(
    d.update({ ...base, time: 1.02, heading: -Math.PI + 0.001 }).bodyCue,
    undefined,
  );
  assert.equal(d.update({ ...base, time: 3, heading: 0 }).bodyCue, undefined);
  assert.equal(
    d.update({ ...base, time: 3.02, heading: 0.001 }).bodyCue,
    undefined,
  );
});
void test('simultaneous displacement and rotation survive without stealing enjoyment', () => {
  const d = start();
  const e = d.update({
    ...base,
    time: 0.1,
    heading: 0.2,
    motionSpeed: 0.2,
    touching: true,
    stroked: true,
    enjoyment: 0.8,
  });
  assert.equal(e.bodyCue, 'scales');
  assert.equal(e.move, true);
  assert.equal(e.purring, true);
  assert.equal(e.cue, 'touch');
  assert.equal(
    d.update({ ...base, time: 0.2, motionSpeed: 0.2 }).move,
    undefined,
  );
});
void test('displacement needs a new onset and cooldown; slow movement is silent', () => {
  const d = start();
  assert.equal(
    d.update({ ...base, time: 0.1, motionSpeed: 0.03 }).move,
    undefined,
  );
  assert.equal(d.update({ ...base, time: 0.2, motionSpeed: 0.2 }).move, true);
  assert.equal(
    d.update({ ...base, time: 2, motionSpeed: 0.2 }).move,
    undefined,
  );
  d.update({ ...base, time: 2.1, motionSpeed: 0.02 });
  assert.equal(d.update({ ...base, time: 2.2, motionSpeed: 0.2 }).move, true);
});
void test('startle preempts once, removes enjoyment and never repeats on bookkeeping', () => {
  const d = start();
  d.update({
    ...base,
    time: 0.1,
    touching: true,
    stroked: true,
    enjoyment: 0.8,
  });
  const e = d.update({
    ...base,
    time: 0.2,
    alarm: 0.8,
    heading: 1,
    motionSpeed: 0.3,
  });
  assert.equal(e.cue, 'startle');
  assert.equal(e.stop, true);
  assert.equal(e.purring, false);
  assert.equal(e.bodyCue, undefined);
  assert.equal(
    d.update({ ...base, time: 0.3, alarm: 0.9, frightCount: 2 }).cue,
    undefined,
  );
});
void test('rest transition preempts once and new encounter resets all pending sounds', () => {
  const d = start();
  d.update({ ...base, time: 0.1, touching: true });
  assert.equal(
    d.update({ ...base, time: 0.2, resting: true }, true).cue,
    'rest',
  );
  assert.equal(d.update({ ...base, time: 50, resting: true }).cue, undefined);
  assert.equal(d.update(base).stop, true);
  assert.equal(d.update({ ...base, time: 0.1, touching: true }).cue, 'touch');
});
void test('a real retreat during alarm has a movement overlay without restarting startle', () => {
  const d = start();
  d.update({ ...base, time: 0.1, alarm: 0.8, motionSpeed: 0.3 });
  const e = d.update({ ...base, time: 0.4, alarm: 0.7, motionSpeed: 0.2 });
  assert.equal(e.move, true);
  assert.equal(e.cue, undefined);
  assert.equal(e.stop, false);
});
void test('real Creature gentle input reaches audible enjoyment at the UI threshold', () => {
  const c = new Creature();
  c.resize(1280, 900);
  const d = new SoundDirector();
  d.update(c);
  let visibleAt: number | undefined, purrAt: number | undefined;
  const heard = new Set<string>();
  for (let frame = 1; frame <= 900; frame++) {
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
    const e = d.update(c);
    if (e.cue) heard.add(e.cue);
    if (c.enjoyment > 0.45 && visibleAt === undefined) visibleAt = c.time;
    if (e.purring && purrAt === undefined) purrAt = c.time;
  }
  assert.ok(visibleAt !== undefined && purrAt !== undefined);
  assert.ok(Math.abs(purrAt - visibleAt) < 1 / 30);
  assert.ok(heard.has('touch') && heard.has('voice'));
  assert.equal(c.frightCount, 0);
});
