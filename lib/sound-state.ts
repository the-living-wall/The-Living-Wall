/** Discrete cues, never a looping soundtrack. Time is Creature simulation time. */
export type SoundCue = 'touch' | 'voice' | 'curiosity' | 'move' | 'purr' | 'scales' | 'startle' | 'roll' | 'rest' | 'settle';
export type SoundState = {
  time: number;
  phase: string;
  stroked: boolean;
  touching: boolean;
  enjoyment: number;
  resting: boolean;
  alarm: number;
  heading: number;
  /** Actual creature displacement speed, separate from hand/input speed. */
  motionSpeed: number;
  frightCount: number;
};
export class SoundDirector {
  private previous?: SoundState;
  private since = 0;
  private lastStroke = -Infinity;
  private stage = 0;
  private next = 0;
  private turning = false;
  private moving = false;
  private motionSound = false;
  private shockUntil = 0;
  private nextTouch = 0;
  private nextTurnCue = 0;
  reset() {
    this.previous = undefined;
    this.lastStroke = -Infinity;
    this.stage = 0;
    this.next = 0;
    this.turning = false;
    this.moving = false;
    this.motionSound = false;
    this.shockUntil = 0;
    this.nextTouch = 0;
    this.nextTurnCue = 0;
  }
  update(s: SoundState, busy = false): { stop: boolean; cue?: SoundCue } {
    const p = this.previous;
    this.previous = { ...s };
    if (!p || s.time < p.time) {
      this.reset();
      this.previous = { ...s };
      this.since = s.time;
      this.stage = 0;
      this.next = s.time;
      return { stop: true };
    }
    const dt = s.time - p.time;
    // This is the heading used by the renderer, not pointer speed. Wrap at ±π.
    const speed =
      dt > 0 && dt <= 0.25
        ? Math.abs(
            Math.atan2(
              Math.sin(s.heading - p.heading),
              Math.cos(s.heading - p.heading),
            ),
          ) / dt
        : 0;
    const wasTurning = this.turning;
    // Rotation and displacement are material events, not behaviour phases.
    // Use hysteresis so a single shape turn makes one cue, not one per frame.
    this.turning = speed >= (this.turning ? 0.3 : 0.65);
    // Startle is exclusively an alarm transition. Internal fright bookkeeping
    // must never make the cue audible in an otherwise calm state.
    const shock = s.alarm >= 0.1 && p.alarm < 0.1;
    if (shock) this.shockUntil = s.time + 1.2;
    if (shock || s.time < this.shockUntil) {
      this.stage = 0;
      this.lastStroke = -Infinity;
      this.since = s.time;
      if (shock) {
        this.motionSound = true;
        return { stop: true, cue: 'startle' };
      }
      // Don't stop the shock cue on every frame while alarm remains high.
      return { stop: false };
    }
    const fastTurnOnset = this.turning && !wasTurning;
    if (fastTurnOnset && s.time >= this.nextTurnCue) {
      // A visible rapid rotation is itself a body event. Emit it before the
      // petting sequence so contact cannot swallow the material cue.
      this.nextTurnCue = s.time + 1.4;
      return { stop: true, cue: 'scales' };
    }
    const wasMoving = this.moving;
    this.moving = s.motionSpeed >= (wasMoving ? 0.06 : 0.1);
    if (this.moving && !wasMoving) {
      return { stop: true, cue: 'move' };
    }
    const endedMotion = this.motionSound;
    this.motionSound = false;
    // A brief reversal in the same valid touch area is one petting interaction.
    // Hover/contact loss, leaving the body, or a longer pause still ends it.
    const continued = s.touching && s.time - this.lastStroke <= 0.5;
    const stoppedStroke = !s.stroked && !continued && this.stage > 0;
    const stop =
      endedMotion ||
      stoppedStroke ||
      (p.stroked && !s.stroked && !continued) ||
      (p.resting && !s.resting);
    if (endedMotion) {
      this.since = s.time;
      this.next = s.time + 0.2;
    }
    if (s.alarm >= 0.1) {
      this.stage = 0;
      this.since = s.time;
      return { stop };
    }
    const satisfied = stoppedStroke && this.stage >= 3 && p.enjoyment > 0.45;
    if (stoppedStroke) this.stage = 0;
    if (s.stroked) {
      if (this.stage === 0) this.since = s.time;
      this.lastStroke = s.time;
    }
    if (s.resting && !p.resting) {
      this.next = s.time + 5;
      return { stop: true, cue: 'rest' };
    }
    if (satisfied) return { stop: true, cue: 'settle' };
    if (
      !s.stroked &&
      !s.touching &&
      (s.phase === 'probe' || s.phase === 'invite') &&
      p.phase !== s.phase
    ) {
      return { stop: false, cue: 'curiosity' };
    }
    // Contact acknowledgment is independent of moving fast enough to stroke.
    if (s.touching && !p.touching && s.time >= this.nextTouch) {
      this.nextTouch = s.time + 1.5;
      if (s.stroked && this.stage === 0) {
        this.stage = 1;
        this.next = s.time + 1.1;
      }
      return { stop: true, cue: 'touch' };
    }
    if (s.stroked && this.stage === 0 && !endedMotion) {
      this.stage = 1;
      this.next = s.time + 1.1;
      if (s.time < this.nextTouch) return { stop };
      this.nextTouch = s.time + 1.5;
      return { stop: true, cue: 'touch' };
    }
    // A fast material turn remains audible even when another cue is playing;
    // other petting stages still wait for the real audio channel.
    if (s.time < this.next || (busy && !stop)) return { stop };
    let cue: SoundCue | undefined;
    if (s.stroked) {
      const elapsed = s.time - this.since;
      if (this.stage === 0) {
        cue = 'touch';
        this.stage = 1;
      } else if (this.stage === 1 && elapsed >= 1) {
        cue = 'voice';
        this.stage = 2;
      } else if (this.stage === 2 && elapsed >= 4 && s.enjoyment > 0.45) {
        cue = 'purr';
        this.stage = 3;
      } else if (this.stage === 3 && elapsed >= 8 && s.enjoyment > 0.65) {
        cue = 'roll';
        this.stage = 4;
      }
    }
    // Every fast turn onset is a material change in the creature's body.
    // It remains audible while touching or stroking, and has no cooldown;
    // the hysteresis above prevents repeated cues during one continuous turn.
    if (cue)
      this.next = s.time + (cue === 'purr' ? 3.3 : cue === 'voice' ? 2.2 : 1.1);
    // Deep enjoyment transitions from the sustained purr bed to the short
    // roll cue; stop the bed before that one-shot event starts.
    return { stop: stop || cue === 'roll', cue };
  }
}
