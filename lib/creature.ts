/** A small, deterministic behaviour model. No identity recognition or trained decision model. */
export type Phase =
  | 'alone'
  | 'observe'
  | 'probe'
  | 'approach'
  | 'bond'
  | 'startle'
  | 'recover'
  | 'invite'
  | 'search';
export type TouchZone = 'none' | 'outer' | 'body' | 'core';
export type Growth = {
  version: 1;
  care: number;
  affection: number;
  day: string;
  dailyCare: number;
};
export type GrowthStage = 0 | 1 | 2 | 3 | 4;
export type GrowthStageInfo = {
  stage: GrowthStage;
  name: string;
  minMaturity: number;
  maxMaturity: number;
  description: string;
};
export const GROWTH_STAGES: readonly GrowthStageInfo[] = [
  {
    stage: 0,
    name: '初生白光',
    minMaturity: 0,
    maxMaturity: 0.15,
    description: '它还在学习这里是否安全。',
  },
  {
    stage: 1,
    name: '青痕萌发',
    minMaturity: 0.15,
    maxMaturity: 0.35,
    description: '它开始记住你的靠近。',
  },
  {
    stage: 2,
    name: '流彩舒展',
    minMaturity: 0.35,
    maxMaturity: 0.65,
    description: '它愿意向你展开了。',
  },
  {
    stage: 3,
    name: '亲密共生',
    minMaturity: 0.65,
    maxMaturity: 0.85,
    description: '它已经把你当作熟悉的光。',
  },
  {
    stage: 4,
    name: '成熟光体',
    minMaturity: 0.85,
    maxMaturity: 1,
    description: '它已经长成自己的样子。',
  },
] as const;

export function getGrowthStage(maturity: number): GrowthStage {
  const value = clamp(Number.isFinite(maturity) ? maturity : 0);
  if (value >= 0.85) return 4;
  if (value >= 0.65) return 3;
  if (value >= 0.35) return 2;
  if (value >= 0.15) return 1;
  return 0;
}

export function getGrowthStageInfo(stage: GrowthStage): GrowthStageInfo {
  return GROWTH_STAGES[stage] ?? GROWTH_STAGES[0];
}

export function getGrowthProgressToNextStage(maturity: number) {
  const value = clamp(Number.isFinite(maturity) ? maturity : 0);
  const info = getGrowthStageInfo(getGrowthStage(value));
  if (info.stage === 4) return 1;
  return clamp(
    (value - info.minMaturity) / (info.maxMaturity - info.minMaturity),
  );
}
/** A single stroke-born wave that expands from contact and fades out. */
export type Ripple = {
  x: number;
  y: number;
  age: number;
  life: number;
  amp: number;
};
/** FX-01 stroke-ripple tuning (documented in PR / PRD). */
export const RIPPLE_MAX = 3;
export const RIPPLE_LIFE = 0.9;
export const RIPPLE_SPAWN_GAP = 0.3;
export const RIPPLE_AMP = 0.18;
/** Aspect-corrected units per second; body radius is ~0.165 so a wave crosses the torso in ~0.5s. */
export const RIPPLE_SPEED = 0.32;
/** FX-02 local fragment disturbance tuning (documented in PR / PRD). */
export const DISTURB_RADIUS = 0.11;
/** Peak displacement scale at contact (renderer multiplies by body base). Near ≫ far via falloff. */
export const DISTURB_NEAR_AMP = 0.09;
/** Gaussian sharpness: weight ≈ e(-(d/R)^2 * k). At R ≈ 0.11 of near; beyond body weaker. */
export const DISTURB_FALLOFF = 2.4;
/** Ease rate while stroking toward full intensity. */
export const DISTURB_RISE = 7;
/** Seconds to mostly settle after leaving (~e^{-3} residual ≈ 5%). */
export const DISTURB_RECOVER = 0.7;
/** Radial falloff 0..1 from aspect-corrected distance to contact. */
export function disturbFalloff(
  dist: number,
  radius = DISTURB_RADIUS,
  falloff = DISTURB_FALLOFF,
) {
  const t = dist / Math.max(radius, 1e-6);
  return Math.exp(-t * t * falloff);
}
/** FX-03 directional stretch / rebound tuning (documented in PR / PRD). */
/** Peak elongation along a horizontal stroke (fraction of body base). */
export const STRETCH_GAIN = 0.2;
/** Vertical target is a bit higher so Y can reach the clamp on a locked V stroke. */
export const STRETCH_GAIN_Y = 0.24;
/** Hard clamp on |stretch| components — keeps body envelope conservative. */
export const STRETCH_MAX = 0.24;
/** Ease rate toward stroke-aligned target while stroking (responsive for slow strokes). */
export const STRETCH_RISE = 10;
/** Rebound duration target (~slightly underdamped spring period), mid of 0.3–0.8s. */
export const STRETCH_REBOUND = 0.55;
/** Underdamped spring ζ so stop shows a short rebound overshoot then settles. */
export const STRETCH_DAMPING = 0.78;
/** Lock to H or V when |major look-delta| exceeds this times |minor|. */
export const STRETCH_AXIS_LOCK = 1.25;
export type Signal = {
  x: number;
  y: number;
  speed: number;
  seen: boolean;
  /** Actual contact from a future calibrated depth adapter. Omitted = screen simulation. */
  contact?: boolean;
};
export const phaseCopy: Record<Phase, [string, string]> = {
  alone: ['独处', '小莹正随着自己的呼吸，缓慢游动。'],
  observe: ['观察', '它停了一下，想看清你的动作。'],
  probe: ['试探', '几片光先靠近，身体还留在原处。'],
  approach: ['靠近', '它愿意跟上来，但还留着一点距离。'],
  bond: ['亲近', '它舒展开来，轻轻围着你流动。'],
  startle: ['受惊', '核心缩紧，外面的碎片退了出去。'],
  recover: ['平复', '它还在远处，慢慢收回散落的光。'],
  invite: ['邀约', '它向你伸出一小束光，又收回来。'],
  search: ['寻找', '它朝你刚才的位置，望了一会儿。'],
};
export const clamp = (v: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, v));
export const ease = (a: number, b: number, rate: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-rate * dt));
export class Creature {
  enjoyment = 0;
  /** Existing valid-stroke decision, exposed for sound only. */
  stroked = false;
  /** Valid touch area, including a stationary pause between strokes. */
  touching = false;
  touchZone: TouchZone = 'none';
  touchAngle = 0;
  breathPhase = 0;
  breathPeriod = 5;
  breath = 0;
  fatigue = 0;
  resting = false;
  restTime = 0;
  care = 0;
  affection = 0;
  day = '';
  dailyCare = 0;
  get maturity() {
    return clamp(this.care / 1800);
  }
  get growthStage(): GrowthStage {
    return getGrowthStage(this.maturity);
  }
  get growthScale() {
    return 1 + this.maturity * 0.42;
  }
  setDay(day: string) {
    if (day !== this.day) {
      this.day = day;
      this.dailyCare = 0;
    }
  }
  restore(value: unknown) {
    const g = value as Growth;
    if (!g || g.version !== 1) return;
    if (
      ![g.care, g.affection, g.dailyCare].every(
        (v) => typeof v === 'number' && Number.isFinite(v),
      )
    )
      return;
    this.care = clamp(g.care, 0, 1800);
    this.affection = clamp(g.affection);
    this.trust = this.affection * 0.5;
    this.day = typeof g.day === 'string' ? g.day : '';
    this.dailyCare = clamp(g.dailyCare, 0, 120);
  }
  archive(): Growth {
    return {
      version: 1,
      care: this.care,
      affection: this.affection,
      day: this.day,
      dailyCare: this.dailyCare,
    };
  }
  phase: Phase = 'alone';
  phaseAge = 0;
  time = 0;
  x = 0.5;
  y = 0.53;
  /** Actual rendered body displacement per second, used by the sound layer. */
  motionSpeed = 0;
  lookX = 0.5;
  lookY = 0.53;
  trust = 0;
  alarm = 0;
  sensitivity = 0;
  gentleTime = 0;
  frightCount = 0;
  encounterCount = 0;
  presence = 0;
  absence = 10;
  stationary = 0;
  cooldown = 0;
  inviteCooldown = 0;
  radius = 1;
  core = 1;
  feeler = 0;
  openness = 0;
  recoil = 0;
  flash = 0;
  heading = 0;
  ripples: Ripple[] = [];
  private rippleCooldown = 0;
  /** Latest valid-stroke contact (normalized). */
  disturbX = 0.5;
  disturbY = 0.53;
  /** 0..1 envelope; rises while stroked, settles after leave. */
  disturbIntensity = 0;
  /** FX-03: aspect-corrected stretch components along recent stroke direction. */
  stretchX = 0;
  stretchY = 0;
  private stretchVx = 0;
  private stretchVy = 0;
  /** Short-window look-delta accumulator — stabilizes direction on slow strokes. */
  private strokeAccX = 0;
  private strokeAccY = 0;
  /** Latched dominant axis so jitter does not pull a clear H/V stroke diagonal. */
  private stretchAxis: '' | 'h' | 'v' = '';
  private prevLookX = 0.5;
  private prevLookY = 0.53;
  private hasPrevLook = false;
  private wasPresent = false;
  private calm = 0;
  private lost = false;
  aspectX = 1.78;
  aspectY = 1;
  resize(w: number, h: number) {
    const unit = Math.min(w, h);
    this.aspectX = w / unit;
    this.aspectY = h / unit;
  }
  /** Aspect-corrected weight at a normalized point: intensity × near-strong / far-weak falloff. */
  disturbWeight(px: number, py: number) {
    const dist = Math.hypot(
      (px - this.disturbX) * this.aspectX,
      (py - this.disturbY) * this.aspectY,
    );
    return this.disturbIntensity * disturbFalloff(dist);
  }
  /** Signed stretch amplitude (aspect-corrected); used by renderer and tests. */
  stretchAmp() {
    return Math.hypot(this.stretchX, this.stretchY);
  }
  private enter(phase: Phase) {
    if (phase !== this.phase) {
      this.phase = phase;
      this.phaseAge = 0;
    }
  }
  step(dt: number, s: Signal) {
    dt = clamp(dt, 0, 0.05);
    this.time += dt;
    this.phaseAge += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.inviteCooldown = Math.max(0, this.inviteCooldown - dt);
    if (s.seen) {
      this.absence = 0;
      this.lookX = clamp(s.x);
      this.lookY = clamp(s.y);
    } else this.absence += dt;
    // Keep a short occlusion from becoming a departure. Fade out rather than snapping.
    const held = this.absence < 0.65;
    this.presence = ease(this.presence, held ? 1 : 0, held ? 5 : 3, dt);
    const distance = Math.hypot(
      (this.lookX - this.x) * this.aspectX,
      (this.lookY - this.y) * this.aspectY,
    );
    const near = held && distance < 0.62;
    if (near && !this.wasPresent && !this.lost) {
      this.encounterCount++;
      this.enter('observe');
    }
    if (near) this.lost = false;
    if (!held && this.wasPresent && this.alarm < 0.2) {
      this.lost = true;
      this.enter('search');
    }
    this.wasPresent = near;
    const speed = s.seen ? s.speed : 0;
    this.stationary = near && speed < 0.08 ? this.stationary + dt : 0;
    const threatening =
      near && s.seen && speed > 1.7 + this.trust * 0.6 && distance < 0.5;
    if (threatening && this.cooldown === 0) {
      const severity = clamp((speed - 1.3) / 3, 0.25, 1);
      this.alarm = clamp(
        this.alarm + 0.55 + severity * 0.3 + this.sensitivity * 0.25,
      );
      this.sensitivity = clamp(this.sensitivity + 0.17 + severity * 0.1);
      this.trust = Math.max(0, this.trust - 0.1 - severity * 0.17);
      this.frightCount++;
      this.cooldown = 1.4;
      this.calm = 0;
      this.flash = 1;
      this.recoil = 1;
      this.enter('startle');
    }
    // The more often it is startled, the longer it needs to settle. Familiarity helps.
    this.alarm = Math.max(
      0,
      this.alarm -
        (dt * (0.15 + this.trust * 0.045)) / (1 + this.sensitivity * 2),
    );
    this.sensitivity = Math.max(0, this.sensitivity - dt * 0.003);
    if (near && s.seen && speed < 0.55 && this.alarm < 0.18) {
      this.calm += dt;
      this.gentleTime += dt;
      // An actively gentle hand earns confidence faster than an unattended cursor.
      this.trust = clamp(this.trust + dt * (speed > 0.035 ? 0.022 : 0.009));
    } else this.calm = Math.max(0, this.calm - dt * 0.6);
    this.trust = Math.max(0, this.trust - (held ? 0 : dt * 0.0008));
    const observeTime = 1.8 + this.sensitivity * 2 - this.trust * 0.65;
    const probeTime = 3 + this.sensitivity * 3 - this.trust;
    if (this.alarm > 0.38) this.enter('startle');
    else if (this.alarm > 0.1) this.enter('recover');
    else if (near) {
      if (['alone', 'search', 'recover', 'startle'].includes(this.phase))
        this.enter('observe');
      else if (
        this.phase === 'observe' &&
        this.phaseAge > observeTime &&
        speed < 0.6
      )
        this.enter('probe');
      else if (
        this.phase === 'probe' &&
        this.phaseAge > probeTime &&
        this.calm > 2
      )
        this.enter('approach');
      else if (
        this.phase === 'approach' &&
        this.phaseAge > 3 &&
        this.trust > 0.24
      )
        this.enter('bond');
      else if (
        this.phase === 'invite' &&
        (speed > 0.12 || this.phaseAge > 3.6)
      ) {
        this.inviteCooldown = 10;
        this.enter(this.trust > 0.24 ? 'bond' : 'approach');
      } else if (
        ['approach', 'bond'].includes(this.phase) &&
        this.stationary > 6 &&
        this.inviteCooldown === 0
      )
        this.enter('invite');
    } else if (!held) {
      if (this.phase === 'search' && this.phaseAge > 3.5) {
        this.enter('alone');
        this.lost = false;
      } else if (!['search', 'alone'].includes(this.phase) && this.alarm < 0.1)
        this.enter('alone');
    } else if (this.alarm < 0.1 && !['alone', 'search'].includes(this.phase))
      this.enter('alone');
    // Touch uses the same short-side scale as the rendered body, not wall contact.
    const bodyRadius = 0.165 * this.growthScale * this.radius;
    const ratio = distance / bodyRadius;
    this.touchZone =
      !s.seen || ratio > 1.15
        ? 'none'
        : ratio < 0.25
          ? 'core'
          : ratio < 0.78
            ? 'body'
            : 'outer';
    const permitted =
      s.contact !== false &&
      this.touchZone !== 'none' &&
      (this.touchZone !== 'core' || this.trust > 0.45);
    // Rest is a full recovery period, not a threshold that toggles every frame.
    if (!this.resting && this.fatigue >= 0.8) {
      this.resting = true;
      this.restTime = 0;
    }
    if (this.resting) {
      this.restTime += dt;
      if (this.restTime >= 8 && this.fatigue <= 0.35) this.resting = false;
    }
    const stroked =
      permitted &&
      speed > 0.025 &&
      speed < 0.48 &&
      this.alarm < 0.1 &&
      this.calm > 1.5 &&
      !this.resting;
    this.stroked = stroked;
    this.touching =
      permitted && speed < 0.48 && this.alarm < 0.1 && !this.resting;
    this.enjoyment = ease(
      this.enjoyment,
      stroked ? 1 : 0,
      this.alarm > 0.2 ? 5 : stroked ? 0.65 : 0.18,
      dt,
    );
    this.fatigue = clamp(this.fatigue + dt * (stroked ? 0.009 : -0.018));
    if (stroked) {
      this.touchAngle = Math.atan2(
        (this.lookY - this.y) * this.aspectY,
        (this.lookX - this.x) * this.aspectX,
      );
      const earned = Math.min(dt * this.enjoyment, 120 - this.dailyCare);
      this.dailyCare += earned;
      this.care = Math.min(1800, this.care + earned);
      this.affection = clamp(this.affection + earned / 2400);
    }
    // FX-01: valid stroke frames only; invalid fast swipes share the stroked gate and never spawn.
    this.rippleCooldown = Math.max(0, this.rippleCooldown - dt);
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].age += dt;
      if (this.ripples[i].age >= this.ripples[i].life)
        this.ripples.splice(i, 1);
    }
    if (
      stroked &&
      this.ripples.length < RIPPLE_MAX &&
      this.rippleCooldown === 0
    ) {
      this.ripples.push({
        x: this.lookX,
        y: this.lookY,
        age: 0,
        life: RIPPLE_LIFE,
        amp: RIPPLE_AMP,
      });
      this.rippleCooldown = RIPPLE_SPAWN_GAP;
    }
    // FX-02: same stroked gate as ripples; intensity settles after leave without residual shake.
    if (stroked) {
      this.disturbX = this.lookX;
      this.disturbY = this.lookY;
      this.disturbIntensity = ease(this.disturbIntensity, 1, DISTURB_RISE, dt);
    } else {
      this.disturbIntensity = ease(
        this.disturbIntensity,
        0,
        3 / DISTURB_RECOVER,
        dt,
      );
    }
    // FX-03: stretch along stroke motion while valid; spring rebound after leave (afterglow stays on enjoyment).
    let strokeDx = 0;
    let strokeDy = 0;
    if (s.seen && this.hasPrevLook) {
      strokeDx = (this.lookX - this.prevLookX) * this.aspectX;
      strokeDy = (this.lookY - this.prevLookY) * this.aspectY;
    }
    // Integrate ~0.14s of look-delta so slow/noisy strokes keep a readable axis.
    const accDecay = Math.exp(-dt / 0.14);
    this.strokeAccX = this.strokeAccX * accDecay + strokeDx;
    this.strokeAccY = this.strokeAccY * accDecay + strokeDy;
    const strokeLen = Math.hypot(this.strokeAccX, this.strokeAccY);
    if (stroked && strokeLen > 1e-4) {
      let ux = this.strokeAccX / strokeLen;
      let uy = this.strokeAccY / strokeLen;
      const absAccX = Math.abs(this.strokeAccX);
      const absAccY = Math.abs(this.strokeAccY);
      // Snap to the dominant screen axis; hysteresis keeps a clear H/V stroke locked.
      if (this.stretchAxis === 'h' && absAccY <= absAccX * STRETCH_AXIS_LOCK) {
        ux = ux < 0 ? -1 : 1;
        uy = 0;
      } else if (
        this.stretchAxis === 'v' &&
        absAccX <= absAccY * STRETCH_AXIS_LOCK
      ) {
        ux = 0;
        uy = uy < 0 ? -1 : 1;
      } else if (absAccX > absAccY * STRETCH_AXIS_LOCK) {
        this.stretchAxis = 'h';
        ux = ux < 0 ? -1 : 1;
        uy = 0;
      } else if (absAccY > absAccX * STRETCH_AXIS_LOCK) {
        this.stretchAxis = 'v';
        ux = 0;
        uy = uy < 0 ? -1 : 1;
      } else {
        this.stretchAxis = '';
      }
      const curAmp = this.stretchAmp();
      if (curAmp > 1e-4) {
        const curUx = this.stretchX / curAmp;
        const curUy = this.stretchY / curAmp;
        // Same axis on 180° reverse — avoid collapsing amp on oscillating strokes.
        if (ux * curUx + uy * curUy < 0) {
          ux = -ux;
          uy = -uy;
        }
      }
      const targetX = clamp(ux * STRETCH_GAIN, -STRETCH_MAX, STRETCH_MAX);
      const targetY = clamp(uy * STRETCH_GAIN_Y, -STRETCH_MAX, STRETCH_MAX);
      this.stretchX = ease(this.stretchX, targetX, STRETCH_RISE, dt);
      this.stretchY = ease(this.stretchY, targetY, STRETCH_RISE, dt);
      this.stretchVx = 0;
      this.stretchVy = 0;
    } else if (stroked) {
      // Valid contact without motion: hold pose; rebound only after leave.
      this.stretchVx = 0;
      this.stretchVy = 0;
    } else {
      this.strokeAccX = 0;
      this.strokeAccY = 0;
      this.stretchAxis = '';
      // ω ≈ 2π / rebound; ζ < 1 → short overshoot then settle inside the envelope.
      const omega = (Math.PI * 2) / STRETCH_REBOUND;
      const k = omega * omega;
      const damp = 2 * STRETCH_DAMPING * omega;
      this.stretchVx += (-k * this.stretchX - damp * this.stretchVx) * dt;
      this.stretchVy += (-k * this.stretchY - damp * this.stretchVy) * dt;
      this.stretchX = clamp(
        this.stretchX + this.stretchVx * dt,
        -STRETCH_MAX,
        STRETCH_MAX,
      );
      this.stretchY = clamp(
        this.stretchY + this.stretchVy * dt,
        -STRETCH_MAX,
        STRETCH_MAX,
      );
      if (this.stretchAmp() < 1e-4) {
        this.stretchX = 0;
        this.stretchY = 0;
        this.stretchVx = 0;
        this.stretchVy = 0;
      }
    }
    if (s.seen) {
      this.prevLookX = this.lookX;
      this.prevLookY = this.lookY;
      this.hasPrevLook = true;
    } else {
      this.hasPrevLook = false;
    }
    const targetPeriod =
      this.alarm > 0.2
        ? 2.1
        : this.enjoyment > 0.3
          ? 6.5
          : this.resting
            ? 7
            : this.phase === 'alone'
              ? 5.5
              : 4.2;
    this.breathPeriod = ease(this.breathPeriod, targetPeriod, 0.65, dt);
    if (!(this.phase === 'startle' && this.phaseAge < 0.3))
      this.breathPhase += (dt * Math.PI * 2) / this.breathPeriod;
    this.breath = (1 - Math.cos(this.breathPhase)) / 2;
    // Geometry is driven by continuous channels, never a discontinuous size switch.
    const scared = this.alarm;
    const friendly =
      this.phase === 'bond' ? 1 : this.phase === 'approach' ? 0.45 : 0.05;
    this.openness = ease(
      this.openness,
      scared > 0.1
        ? 0
        : this.resting
          ? 0.08
          : Math.max(friendly, this.enjoyment),
      1.5,
      dt,
    );
    this.core = ease(
      this.core,
      1 -
        scared * 0.65 +
        this.openness * 0.15 -
        (this.touchZone === 'core' && this.trust < 0.45 ? 0.2 : 0),
      4,
      dt,
    );
    this.radius = ease(
      this.radius,
      1 + scared * 0.48 + this.openness * 0.2,
      2.2,
      dt,
    );
    const probe =
      this.phase === 'probe'
        ? 0.22 + 0.65 * Math.pow(Math.sin(this.phaseAge * 1.35), 2)
        : this.phase === 'invite'
          ? 0.3 + 0.7 * Math.pow(Math.sin(this.phaseAge * 1.7), 2)
          : this.phase === 'search'
            ? 0.32
            : this.phase === 'observe'
              ? 0.07
              : this.phase === 'approach'
                ? 0.5
                : this.phase === 'bond'
                  ? 0.65
                  : 0;
    this.feeler = ease(this.feeler, this.resting ? 0.05 : probe, 3, dt);
    this.recoil = ease(this.recoil, 0, 1.8, dt);
    this.flash = ease(this.flash, 0, 6, dt);
    const dx = (this.lookX - this.x) * this.aspectX,
      dy = (this.lookY - this.y) * this.aspectY;
    const targetHeading = Math.atan2(dy, dx);
    this.heading +=
      Math.atan2(
        Math.sin(targetHeading - this.heading),
        Math.cos(targetHeading - this.heading),
      ) *
      (1 - Math.exp(-dt * 3));
    let tx = 0.5 + Math.sin(this.time * 0.17) * 0.035,
      ty = 0.53 + Math.cos(this.time * 0.22) * 0.025;
    if (near && ['approach', 'bond', 'invite'].includes(this.phase)) {
      const gap = this.phase === 'bond' ? 0.07 : 0.2 + this.sensitivity * 0.12;
      const len = Math.max(distance, 0.001);
      tx = this.lookX - ((dx / len) * gap) / this.aspectX;
      ty = this.lookY - ((dy / len) * gap) / this.aspectY;
    } else if (scared > 0.1) {
      const len = Math.max(distance, 0.001);
      tx = this.x - ((dx / len) * 0.15) / this.aspectX;
      ty = this.y - ((dy / len) * 0.15) / this.aspectY;
    }
    if (this.enjoyment > 0.25 && this.alarm < 0.1 && near && !this.resting) {
      // Offer the touched side, leaving room around the core instead of swallowing the hand.
      const gap = bodyRadius * (0.65 - this.enjoyment * 0.12);
      tx = this.lookX - (Math.cos(this.touchAngle) * gap) / this.aspectX;
      ty = this.lookY - (Math.sin(this.touchAngle) * gap) / this.aspectY;
    }
    const rate =
      scared > 0.38
        ? 1.2
        : ['observe', 'probe', 'recover'].includes(this.phase)
          ? 0.2
          : this.phase === 'bond'
            ? 1
            : 0.55;
    const previousX = this.x;
    const previousY = this.y;
    this.x = ease(this.x, clamp(tx, 0.18, 0.82), rate, dt);
    this.y = ease(this.y, clamp(ty, 0.25, 0.76), rate, dt);
    this.motionSpeed =
      dt > 0
        ? Math.hypot(
            (this.x - previousX) * this.aspectX,
            (this.y - previousY) * this.aspectY,
          ) / dt
        : 0;
    return this;
  }
  snapshot() {
    return {
      resting: this.resting,
      fatigue: +this.fatigue.toFixed(3),
      enjoyment: +this.enjoyment.toFixed(3),
      touchZone: this.touchZone,
      breathPeriod: +this.breathPeriod.toFixed(2),
      maturity: +this.maturity.toFixed(3),
      care: +this.care.toFixed(2),
      phase: this.phase,
      phaseAge: +this.phaseAge.toFixed(2),
      trust: +this.trust.toFixed(3),
      alarm: +this.alarm.toFixed(3),
      sensitivity: +this.sensitivity.toFixed(3),
      gentleSeconds: +this.gentleTime.toFixed(1),
      frightCount: this.frightCount,
      encounters: this.encounterCount,
      presence: +this.presence.toFixed(2),
      x: +this.x.toFixed(3),
      y: +this.y.toFixed(3),
      motionSpeed: +this.motionSpeed.toFixed(3),
      ripples: this.ripples.length,
      disturb: +this.disturbIntensity.toFixed(3),
      stretchX: +this.stretchX.toFixed(3),
      stretchY: +this.stretchY.toFixed(3),
      stretch: +this.stretchAmp().toFixed(3),
    };
  }
}
