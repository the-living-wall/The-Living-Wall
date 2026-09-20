import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Creature,
  disturbFalloff,
  DISTURB_RADIUS,
  STRETCH_GAIN,
  STRETCH_GAIN_Y,
  STRETCH_MAX,
  STRETCH_REBOUND,
  type Signal,
  type Phase,
} from '../lib/creature.ts';
const gentle: Signal = { x: 0.57, y: 0.53, speed: 0.16, seen: true };
function run(c: Creature, seconds: number, s: Signal, phases?: Set<Phase>) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    c.step(1 / 60, s);
    phases?.add(c.phase);
  }
}
void test('first encounter observes and probes before approaching and bonding', () => {
  const c = new Creature(),
    phases = new Set<Phase>();
  run(c, 0.8, gentle, phases);
  assert.equal(c.phase, 'observe');
  assert.ok(Math.abs(c.x - 0.5) < 0.01);
  run(c, 14, gentle, phases);
  for (const p of ['observe', 'probe', 'approach', 'bond'] as Phase[])
    assert.ok(phases.has(p), p);
  assert.equal(c.frightCount, 0);
});
void test('short occlusion holds engagement; a departure searches then rests', () => {
  const c = new Creature();
  run(c, 15, gentle);
  const before = c.phase;
  run(c, 0.3, { ...gentle, seen: false });
  assert.equal(c.phase, before);
  assert.ok(c.presence > 0.9);
  run(c, 0.7, { ...gentle, seen: false });
  assert.equal(c.phase, 'search');
  run(c, 4, { ...gentle, seen: false });
  assert.equal(c.phase, 'alone');
  assert.ok(c.presence < 0.02);
});
void test('repeated shocks accumulate caution and extend recovery', () => {
  const fresh = new Creature(),
    repeated = new Creature();
  for (const c of [fresh, repeated]) {
    run(c, 1, gentle);
    c.step(1 / 60, { x: c.x, y: c.y, speed: 4, seen: true });
  }
  assert.equal(fresh.phase, 'startle');
  assert.ok(fresh.core < 1);
  run(repeated, 1.5, { ...gentle, seen: false });
  repeated.step(1 / 60, { x: repeated.x, y: repeated.y, speed: 4, seen: true });
  assert.equal(repeated.frightCount, 2);
  assert.ok(repeated.sensitivity > fresh.sensitivity);
  function settle(c: Creature) {
    let time = 0;
    while (c.alarm > 0.1 && time < 40) {
      c.step(1 / 60, { ...gentle, seen: false });
      time += 1 / 60;
    }
    return time;
  }
  assert.ok(settle(repeated) > settle(fresh));
});
void test('standing still invites; a gentle answer ends invitation', () => {
  const c = new Creature();
  run(c, 16, gentle);
  run(c, 7, { ...gentle, speed: 0 });
  assert.equal(c.phase, 'invite');
  run(c, 0.3, gentle);
  assert.ok(['approach', 'bond'].includes(c.phase));
  assert.ok(c.inviteCooldown > 0);
});
void test('new encounter inherits trust but still observes before moving', () => {
  const c = new Creature();
  run(c, 20, gentle);
  const trust = c.trust;
  run(c, 5, { ...gentle, seen: false });
  run(c, 0.3, gentle);
  assert.equal(c.phase, 'observe');
  assert.ok(c.trust > trust - 0.02);
  assert.equal(c.encounterCount, 2);
});
void test('recovery geometry stays continuous at all phase boundaries', () => {
  const c = new Creature();
  run(c, 1, gentle);
  c.step(1 / 60, { x: c.x, y: c.y, speed: 5, seen: true });
  let old = c.radius;
  for (let i = 0; i < 1800; i++) {
    c.step(1 / 60, { ...gentle, seen: false });
    assert.ok(Math.abs(c.radius - old) < 0.025);
    old = c.radius;
    assert.ok(Number.isFinite(c.x + c.y + c.core));
  }
});

void test('gentle body strokes bring pleasure with a lingering afterglow; idle cannot grow', () => {
  const c = new Creature();
  for (let i = 0; i < 480; i++)
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  assert.ok(c.enjoyment > 0.7);
  assert.ok(c.care > 1);
  const care = c.care;
  run(c, 1, { ...gentle, seen: false, speed: 0 });
  assert.ok(c.enjoyment > 0.4);
  run(c, 30, { ...gentle, speed: 0 });
  assert.equal(c.care, care);
});
void test('growth survives restore, is capped daily and never decays through absence', () => {
  const c = new Creature();
  c.restore({
    version: 1,
    care: 500,
    affection: 0.5,
    day: '2026-09-11',
    dailyCare: 120,
  });
  for (let i = 0; i < 300; i++)
    c.step(1 / 60, { x: c.x + 0.07, y: c.y, speed: 0.15, seen: true });
  assert.equal(c.care, 500);
  c.setDay('2026-09-12');
  assert.equal(c.dailyCare, 0);
  run(c, 100, { ...gentle, seen: false });
  const restored = new Creature();
  restored.restore(c.archive());
  assert.equal(restored.care, 500);
  assert.equal(restored.affection, 0.5);
  restored.restore({ version: 1, care: NaN, affection: 1, dailyCare: 0 });
  assert.equal(restored.care, 500);
});
void test('breathing remains continuous and becomes slower with pleasure', () => {
  const c = new Creature();
  for (let i = 0; i < 600; i++) {
    const before = c.breathPhase;
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
    assert.ok(c.breathPhase >= before && c.breathPhase - before < 0.06);
    assert.ok(c.breath >= 0 && c.breath <= 1);
  }
  assert.ok(c.breathPeriod > 6);
});

void test('fatigue causes sustained rest instead of rapidly toggling at the threshold', () => {
  const c = new Creature();
  c.fatigue = 0.81;
  const stroke = () =>
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  stroke();
  assert.equal(c.resting, true);
  for (let i = 0; i < 600; i++) stroke();
  assert.equal(c.resting, true);
  assert.equal(c.care, 0);
  for (let i = 0; i < 1100; i++) stroke();
  assert.equal(c.resting, false);
});
void test('explicit hover can attract attention but cannot count as a wall stroke', () => {
  const c = new Creature();
  for (let i = 0; i < 600; i++)
    c.step(1 / 60, {
      x: c.x + 0.065,
      y: c.y,
      speed: 0.15,
      seen: true,
      contact: false,
    });
  assert.equal(c.enjoyment, 0);
  assert.equal(c.care, 0);
  assert.ok(c.encounterCount > 0);
  for (let i = 0; i < 300; i++)
    c.step(1 / 60, {
      x: c.x + 0.065,
      y: c.y,
      speed: 0.15,
      seen: true,
      contact: true,
    });
  assert.ok(c.enjoyment > 0.7);
});
void test('a sudden scare interrupts pleasure promptly', () => {
  const c = new Creature();
  for (let i = 0; i < 480; i++)
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  assert.ok(c.enjoyment > 0.7);
  c.step(1 / 60, { x: c.x, y: c.y, speed: 5, seen: true });
  run(c, 0.6, { ...gentle, seen: false });
  assert.ok(c.enjoyment < 0.1);
});

void test('valid strokes spawn decaying ripples; fast swipes and idle do not', () => {
  const stroked = new Creature();
  for (let i = 0; i < 480; i++)
    stroked.step(1 / 60, {
      x: stroked.x + 0.065,
      y: stroked.y,
      speed: 0.15,
      seen: true,
    });
  assert.ok(stroked.enjoyment > 0.7);
  assert.ok(stroked.ripples.length >= 1);
  assert.ok(stroked.ripples.length <= 3);
  const ages = stroked.ripples.map((r) => r.age);
  run(stroked, 1.2, { ...gentle, seen: false, speed: 0 });
  assert.equal(stroked.ripples.length, 0);
  assert.ok(ages.every((a) => a >= 0));

  const swipe = new Creature();
  for (let i = 0; i < 480; i++)
    swipe.step(1 / 60, {
      x: swipe.x + 0.12,
      y: swipe.y,
      speed: 1.2,
      seen: true,
    });
  assert.equal(swipe.ripples.length, 0);
  assert.ok(swipe.enjoyment < 0.2);

  const idle = new Creature();
  run(idle, 8, { ...gentle, speed: 0 });
  assert.equal(idle.ripples.length, 0);
});

void test('continuous stroking keeps concurrent ripples within the cap', () => {
  const c = new Creature();
  for (let i = 0; i < 900; i++) {
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
    assert.ok(c.ripples.length <= 3);
  }
  assert.ok(c.ripples.length >= 2);
  assert.ok(c.enjoyment > 0.7);
});

void test('startle clears new ripple spawning without freezing breath recovery path', () => {
  const c = new Creature();
  for (let i = 0; i < 480; i++)
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  assert.ok(c.ripples.length > 0);
  c.step(1 / 60, { x: c.x, y: c.y, speed: 5, seen: true });
  assert.equal(c.phase, 'startle');
  const before = c.ripples.length;
  for (let i = 0; i < 60; i++)
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  assert.ok(c.ripples.length <= before);
  assert.ok(c.breathPeriod > 0);
});

void test('gentle strokes raise local disturbance near contact more than far', () => {
  const c = new Creature();
  for (let i = 0; i < 480; i++)
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  assert.ok(c.enjoyment > 0.7);
  assert.ok(c.disturbIntensity > 0.7);
  const near = c.disturbWeight(c.disturbX, c.disturbY);
  const mid = c.disturbWeight(c.disturbX + 0.06 / c.aspectX, c.disturbY);
  const far = c.disturbWeight(c.disturbX + 0.22 / c.aspectX, c.disturbY);
  assert.ok(near > mid);
  assert.ok(mid > far);
  assert.ok(near > far * 4);
});

void test('after leaving, local disturbance settles without long residual shake', () => {
  const c = new Creature();
  for (let i = 0; i < 480; i++)
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  assert.ok(c.disturbIntensity > 0.7);
  run(c, 1.0, { ...gentle, seen: false, speed: 0 });
  assert.ok(c.disturbIntensity < 0.08);
  run(c, 0.5, { ...gentle, seen: false, speed: 0 });
  assert.ok(c.disturbIntensity < 0.02);
});

void test('local disturbance coexists with ripples and stays bounded', () => {
  const c = new Creature();
  for (let i = 0; i < 900; i++) {
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
    assert.ok(c.ripples.length <= 3);
    assert.ok(c.disturbIntensity <= 1);
  }
  assert.ok(c.ripples.length >= 1);
  assert.ok(c.disturbIntensity > 0.7);
  assert.ok(c.enjoyment > 0.7);
});

void test('fast swipe does not drive local disturbance; startle still works', () => {
  const swipe = new Creature();
  for (let i = 0; i < 480; i++)
    swipe.step(1 / 60, {
      x: swipe.x + 0.12,
      y: swipe.y,
      speed: 1.2,
      seen: true,
    });
  assert.ok(swipe.disturbIntensity < 0.05);
  assert.equal(swipe.ripples.length, 0);

  const c = new Creature();
  for (let i = 0; i < 480; i++)
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  assert.ok(c.disturbIntensity > 0.7);
  c.step(1 / 60, { x: c.x, y: c.y, speed: 5, seen: true });
  assert.equal(c.phase, 'startle');
  for (let i = 0; i < 60; i++)
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  assert.ok(c.disturbIntensity < 0.35);
});

void test('disturbFalloff is near-strong and far-weak within the influence radius', () => {
  assert.ok(disturbFalloff(0) > 0.99);
  assert.ok(disturbFalloff(DISTURB_RADIUS * 0.5) < disturbFalloff(0));
  assert.ok(
    disturbFalloff(DISTURB_RADIUS) < disturbFalloff(DISTURB_RADIUS * 0.5),
  );
  assert.ok(disturbFalloff(DISTURB_RADIUS * 2) < 0.05);
});

void test('horizontal vs vertical strokes stretch in distinguishable directions', () => {
  const horiz = new Creature();
  for (let i = 0; i < 480; i++)
    horiz.step(1 / 60, {
      x: horiz.x + 0.065,
      y: horiz.y,
      speed: 0.15,
      seen: true,
    });
  assert.ok(horiz.enjoyment > 0.7);
  // Fixed world Y, oscillate X within body so stroke delta is horizontal.
  const baseY = horiz.y;
  let x = horiz.x + 0.05;
  let lateSX = 0;
  let lateSY = 0;
  for (let i = 0; i < 200; i++) {
    x += i % 40 < 20 ? 0.0012 : -0.0012;
    horiz.step(1 / 60, { x, y: baseY, speed: 0.14, seen: true });
    // Ignore early frames while the stretch axis reorients from warm-up motion.
    if (i >= 80) {
      lateSX = Math.max(lateSX, Math.abs(horiz.stretchX));
      lateSY = Math.max(lateSY, Math.abs(horiz.stretchY));
    }
  }
  assert.ok(lateSX > 0.1);
  assert.ok(lateSX > lateSY * 4);
  assert.ok(lateSY < 0.03);
  assert.ok(horiz.stretchAmp() <= STRETCH_MAX + 1e-6);

  const vert = new Creature();
  for (let i = 0; i < 480; i++)
    vert.step(1 / 60, {
      x: vert.x + 0.065,
      y: vert.y,
      speed: 0.15,
      seen: true,
    });
  const baseX = vert.x + 0.05;
  let y = vert.y;
  let lateVX = 0;
  let lateVY = 0;
  for (let i = 0; i < 200; i++) {
    y += i % 40 < 20 ? 0.0012 : -0.0012;
    vert.step(1 / 60, { x: baseX, y, speed: 0.14, seen: true });
    if (i >= 80) {
      lateVX = Math.max(lateVX, Math.abs(vert.stretchX));
      lateVY = Math.max(lateVY, Math.abs(vert.stretchY));
    }
  }
  assert.ok(lateVY > 0.1);
  assert.ok(lateVY > lateVX * 4);
  assert.ok(lateVX < 0.03);
  assert.ok(lateSX > lateVX);
  assert.ok(lateVY > lateSY);
  // Locked peaks should sit near the per-axis gains (Y uses the higher gain).
  assert.ok(lateSX > STRETCH_GAIN * 0.7);
  assert.ok(lateVY > STRETCH_GAIN_Y * 0.7);
});

void test('after stop, stretch rebounds while enjoyment afterglow remains', () => {
  const c = new Creature();
  for (let i = 0; i < 480; i++)
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  const baseY = c.y;
  let x = c.x + 0.05;
  for (let i = 0; i < 120; i++) {
    x += i % 40 < 20 ? 0.0012 : -0.0012;
    c.step(1 / 60, { x, y: baseY, speed: 0.15, seen: true });
  }
  assert.ok(c.stretchAmp() > 0.08);
  assert.ok(c.enjoyment > 0.7);
  const peak = c.stretchAmp();
  // Rebound window: mostly settled by ~STRETCH_REBOUND, not an instant cut.
  run(c, STRETCH_REBOUND * 0.25, { ...gentle, seen: false, speed: 0 });
  assert.ok(c.stretchAmp() < peak * 1.15); // may briefly overshoot
  assert.ok(c.enjoyment > 0.45);
  run(c, STRETCH_REBOUND * 1.6, { ...gentle, seen: false, speed: 0 });
  assert.ok(c.stretchAmp() < 0.02);
  assert.ok(c.enjoyment > 0.2);
});

void test('directional stretch coexists with ripples and local disturbance', () => {
  const c = new Creature();
  let hx = 0.57;
  for (let i = 0; i < 900; i++) {
    hx += i % 40 < 20 ? 0.0015 : -0.0015;
    c.step(1 / 60, { x: hx, y: c.y, speed: 0.15, seen: true });
    assert.ok(c.ripples.length <= 3);
    assert.ok(c.disturbIntensity <= 1);
    assert.ok(c.stretchAmp() <= STRETCH_MAX + 1e-6);
  }
  assert.ok(c.ripples.length >= 1);
  assert.ok(c.disturbIntensity > 0.7);
  assert.ok(c.stretchAmp() > 0.08);
  assert.ok(c.enjoyment > 0.7);
});

void test('fast swipe does not drive stretch; startle still works', () => {
  const swipe = new Creature();
  for (let i = 0; i < 480; i++)
    swipe.step(1 / 60, {
      x: swipe.x + 0.12,
      y: swipe.y,
      speed: 1.2,
      seen: true,
    });
  assert.ok(swipe.stretchAmp() < 0.02);
  assert.ok(swipe.disturbIntensity < 0.05);
  assert.equal(swipe.ripples.length, 0);

  const c = new Creature();
  for (let i = 0; i < 480; i++)
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  assert.ok(c.stretchAmp() > 0.08);
  c.step(1 / 60, { x: c.x, y: c.y, speed: 5, seen: true });
  assert.equal(c.phase, 'startle');
  for (let i = 0; i < 60; i++)
    c.step(1 / 60, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
  // Startled gate blocks stroked stretch drive; spring continues to settle.
  assert.ok(c.stretchAmp() < 0.1);
});

void test('audio stroke signal obeys the existing physical contact gate', () => {
  const c = new Creature();
  for (let i = 0; i < 600; i++) c.step(1 / 60, { x:c.x+0.1, y:c.y, speed:0.16, seen:true, contact:false });
  assert.equal(c.stroked, false);
  assert.equal(c.enjoyment, 0);
  for (let i = 0; i < 180; i++) c.step(1 / 60, { x:c.x+0.1, y:c.y, speed:0.16, seen:true, contact:true });
  assert.equal(c.stroked, true);
});
