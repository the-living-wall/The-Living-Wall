/** Discrete cues, never a looping soundtrack. Time is Creature simulation time. */
export type SoundCue = 'touch' | 'voice' | 'purr' | 'scales' | 'roll' | 'rest';
export type SoundState = {
  time: number;
  phase: string;
  stroked: boolean;
  enjoyment: number;
  resting: boolean;
  alarm: number;
  heading: number;
  frightCount: number;
};
export class SoundDirector {
  private previous?: SoundState;
  private since = 0;
  private stage = 0;
  private next = 0;
  private turning = false;
  private motionSound = false;
  private nextScales = 0;
  private shockUntil = 0;
  reset() {
    this.previous = undefined;
    this.stage = 0;
    this.next = 0;
    this.turning = false;
    this.motionSound = false;
    this.nextScales = 0;
    this.shockUntil = 0;
  }
  update(s: SoundState): { stop: boolean; cue?: SoundCue } {
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
    const stop =
      endedMotion || (p.stroked && !s.stroked) || (p.resting && !s.resting);
    if (endedMotion) {
      this.since = s.time;
      this.next = s.time + 0.2;
    }
    if (s.alarm >= 0.1) {
      this.stage = 0;
      this.since = s.time;
      return { stop };
    }
    if (!s.stroked) this.stage = 0;
    if (s.stroked && !p.stroked) this.since = s.time;
    if (s.resting && !p.resting) {
      this.next = s.time + 5;
      return { stop: true, cue: 'rest' };
    }
    if (s.time < this.next) return { stop };
    let cue: SoundCue | undefined;
    if (s.stroked) {
      const elapsed = s.time - this.since;
      if (this.stage === 0) {
        cue = 'touch';
        this.stage = 1;
      } else if (this.stage === 1 && elapsed >= 1.5) {
        cue = 'voice';
        this.stage = 2;
      } else if (this.stage === 2 && elapsed >= 6 && s.enjoyment > 0.45) {
        cue = 'purr';
        this.stage = 3;
      } else if (this.stage === 3 && elapsed >= 15) {
        cue = 'roll';
        this.stage = 4;
      }
    } else if (s.phase === 'observe' && p.phase !== 'observe') cue = 'scales';
    if (cue)
      this.next = s.time + (cue === 'purr' ? 8 : cue === 'voice' ? 4 : 1.5);
    return { stop, cue };
  }
}
