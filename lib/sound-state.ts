/** Decisions use simulation time; playback owns the independent audio channels. */
export type SoundCue =
  | 'touch'
  | 'voice'
  | 'curiosity'
  | 'purr'
  | 'scales'
  | 'move'
  | 'startle'
  | 'roll'
  | 'rest'
  | 'settle';
export type SoundState = {
  time: number;
  phase: string;
  stroked: boolean;
  touching: boolean;
  enjoyment: number;
  resting: boolean;
  alarm: number;
  heading: number;
  motionSpeed: number;
  frightCount: number;
  /** Actual Creature presence; omitted by older callers. */
  presence?: number;
};
export type SoundEvent = {
  stop: boolean;
  cue?: SoundCue;
  bodyCue?: 'scales' | 'roll';
  move?: boolean;
  purring: boolean;
};
export class SoundDirector {
  private previous?: SoundState;
  private lastStroke = -Infinity;
  private strokeSince = -Infinity;
  private voiceDone = false;
  private purring = false;
  private turning = false;
  private spinningSince = -Infinity;
  private moving = false;
  private nextTouch = 0;
  private nextTurn = 0;
  private nextRoll = 0;
  private nextMove = 0;
  private nextBreath = 0;
  private quietSince = 0;
  private curiosityUntil = -Infinity;
  private shockAt = -Infinity;
  reset() {
    this.previous = undefined;
    this.lastStroke = this.strokeSince = -Infinity;
    this.spinningSince = this.curiosityUntil = -Infinity;
    this.shockAt = -Infinity;
    this.voiceDone = this.purring = this.turning = this.moving = false;
    this.nextTouch = this.nextTurn = this.nextRoll = this.nextMove = 0;
    this.nextBreath = this.quietSince = 0;
  }
  update(s: SoundState, busy = false): SoundEvent {
    const p = this.previous;
    if (!p || s.time < p.time) {
      this.reset();
      this.previous = { ...s };
      this.quietSince = s.time;
      this.nextBreath = s.time + 10;
      return { stop: true, purring: false };
    }
    this.previous = { ...s };
    const dt = s.time - p.time;
    const event: SoundEvent = { stop: false, purring: false };
    const alarm = s.alarm >= 0.1;
    if (alarm) {
      this.lastStroke = this.strokeSince = -Infinity;
      this.purring = false;
      this.curiosityUntil = this.spinningSince = -Infinity;
      this.quietSince = s.time;
      this.nextBreath = s.time + 30;
      // One attack only; subsequent alarm frames must not cut its tail.
      if (p.alarm < 0.1) {
        this.shockAt = s.time;
        this.moving = false;
        return { ...event, stop: true, cue: 'startle' };
      }
      if (s.time - this.shockAt > 0.18) {
        const wasMoving = this.moving;
        this.moving = s.motionSpeed >= (this.moving ? 0.08 : 0.14);
        if (this.moving && !wasMoving && s.time >= this.nextMove) {
          event.move = true;
          this.nextMove = s.time + 1.2;
        }
      }
      return event;
    }
    // Keep post-alarm motion eligible: it is measured from the renderer's
    // heading and actual displacement, never the pointer's swipe speed.
    const speed =
      dt > 0 && dt <= 0.25
        ? Math.abs(
            Math.atan2(
              Math.sin(s.heading - p.heading),
              Math.cos(s.heading - p.heading),
            ),
          ) / dt
        : 0;
    const present = s.presence === undefined || s.presence > 0.1;
    this.turning = present && speed >= (this.turning ? 0.3 : 0.65);
    if (present && speed >= 1.8) {
      if (!Number.isFinite(this.spinningSince)) this.spinningSince = s.time;
    } else this.spinningSince = -Infinity;
    const roll =
      Number.isFinite(this.spinningSince) &&
      s.time - this.spinningSince >= 0.35 &&
      s.time >= this.nextRoll;
    if (roll) {
      event.bodyCue = 'roll';
      this.nextRoll = s.time + 2.5;
      this.nextTurn = s.time + 2.2;
    } else if (this.turning && s.time >= this.nextTurn) {
      event.bodyCue = 'scales';
      this.nextTurn = s.time + 1.4;
    }
    const wasMoving = this.moving;
    this.moving = present && s.motionSpeed >= (this.moving ? 0.08 : 0.14);
    if (this.moving && !wasMoving && s.time >= this.nextMove) {
      event.move = true;
      this.nextMove = s.time + 1.2;
    }

    if (s.stroked) {
      if (!Number.isFinite(this.strokeSince)) this.strokeSince = s.time;
      this.lastStroke = s.time;
    }
    const contact = s.stroked || s.touching;
    const continuing = !s.resting && contact && s.time - this.lastStroke <= 0.8;
    const wasPurring = this.purring;
    this.purring =
      continuing &&
      ((s.stroked && s.enjoyment > 0.45) || (wasPurring && s.enjoyment > 0.35));
    event.purring = this.purring;
    if (!continuing) {
      this.strokeSince = -Infinity;
      this.voiceDone = false;
    }
    if (
      contact ||
      s.phase !== 'alone' ||
      s.resting ||
      this.turning ||
      this.moving
    ) {
      this.quietSince = s.time;
      this.nextBreath = Math.max(this.nextBreath, s.time + 30);
    }

    if (s.resting && !p.resting) {
      this.nextBreath = s.time + 30;
      return { ...event, stop: true, cue: 'rest' };
    }
    if (p.resting && !s.resting) event.stop = true;
    if (wasPurring && !this.purring && !s.resting && s.enjoyment > 0.35) {
      return { ...event, stop: true, cue: 'settle' };
    }
    if (!contact && (p.stroked || p.touching)) event.stop = true;
    const curious = !s.stroked && (s.phase === 'probe' || s.phase === 'invite');
    if (curious && s.phase !== p.phase) this.curiosityUntil = s.time + 1;
    if (!curious) this.curiosityUntil = -Infinity;

    if (contact && !p.touching && !p.stroked && s.time >= this.nextTouch) {
      this.nextTouch = s.time + 1.5;
      return { ...event, stop: true, cue: 'touch' };
    }
    if (busy && !event.stop) return event;
    if (curious && s.time <= this.curiosityUntil) {
      this.curiosityUntil = -Infinity;
      return { ...event, cue: 'curiosity' };
    }
    if (s.stroked && !this.voiceDone && s.time - this.strokeSince >= 1) {
      this.voiceDone = true;
      return { ...event, cue: 'voice' };
    }
    if (
      !contact &&
      !s.resting &&
      !event.stop &&
      !event.bodyCue &&
      !event.move &&
      s.phase === 'alone' &&
      s.time >= this.nextBreath &&
      s.time - this.quietSince >= 10
    ) {
      this.nextBreath = s.time + 18;
      return { ...event, cue: 'rest' };
    }
    return event;
  }
}
