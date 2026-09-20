/** Discrete cues, never a looping soundtrack. Time is Creature simulation time. */
export type SoundCue = 'touch' | 'voice' | 'purr' | 'scales' | 'roll' | 'rest';
export type SoundState = {
  time: number;
  phase: string;
  stroked: boolean;
  touching: boolean;
  enjoyment: number;
  resting: boolean;
  alarm: number;
  heading: number;
  frightCount: number;
};
export class SoundDirector {
  private previous?: SoundState;
  private since = 0;
  private lastStroke = -Infinity;
  private stage = 0;
  private next = 0;
  private turning = false;
  private motionSound = false;
  private nextScales = 0;
  private shockUntil = 0;
  reset() {
    this.previous = undefined;
    this.lastStroke = -Infinity;
    this.stage = 0;
    this.next = 0;
    this.turning = false;
    this.motionSound = false;
    this.nextScales = 0;
    this.shockUntil = 0;
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
    this.turning = speed >= (this.turning ? 0.65 : 1.2);
    const shock =
      (s.alarm >= 0.1 && p.alarm < 0.1) || s.frightCount > p.frightCount;
    if (shock) this.shockUntil = s.time + 1.2;
    const moving = this.turning || s.time < this.shockUntil;
    if (moving) {
      this.stage = 0;
      this.lastStroke = -Infinity;
      this.since = s.time;
      if (shock || s.time >= this.nextScales) {
        this.nextScales = s.time + 1.3;
        this.motionSound = true;
        return { stop: true, cue: 'scales' };
      }
      // Don't stop the shock cue on every frame while alarm remains high.
      return { stop: false };
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
    if (stoppedStroke) this.stage = 0;
    if (s.stroked) {
      if (this.stage === 0) this.since = s.time;
      this.lastStroke = s.time;
    }
    if (s.resting && !p.resting) {
      this.next = s.time + 5;
      return { stop: true, cue: 'rest' };
    }
    if (s.stroked && this.stage === 0 && !endedMotion) {
      this.stage = 1;
      this.next = s.time + 1.1;
      return { stop: true, cue: 'touch' };
    }
    // Never advance the sequence if the real audio channel is still occupied.
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
    } else if (s.phase === 'observe' && p.phase !== 'observe') cue = 'scales';
    if (cue)
      this.next = s.time + (cue === 'purr' ? 3.3 : cue === 'voice' ? 2.2 : 1.1);
    return { stop, cue };
  }
}
