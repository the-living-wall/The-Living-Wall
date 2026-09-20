/** Discrete cues, never a looping soundtrack. Time is Creature simulation time. */
export type SoundCue = 'touch' | 'voice' | 'purr' | 'scales' | 'roll' | 'rest';
export type SoundState = {
  time: number;
  phase: string;
  stroked: boolean;
  enjoyment: number;
  resting: boolean;
  alarm: number;
};
export class SoundDirector {
  private previous?: SoundState;
  private since = 0;
  private stage = 0;
  private next = 0;
  reset() {
    this.previous = undefined;
    this.stage = 0;
    this.next = 0;
  }
  update(s: SoundState): { stop: boolean; cue?: SoundCue } {
    const p = this.previous;
    this.previous = { ...s };
    if (!p || s.time < p.time) {
      this.since = s.time;
      this.stage = 0;
      this.next = s.time;
      return { stop: true };
    }
    const stop =
      (p.stroked && !s.stroked) || s.alarm >= 0.1 || (p.resting && !s.resting);
    if (s.alarm >= 0.1) {
      this.stage = 0;
      return { stop: true };
    }
    if (!s.stroked) this.stage = 0;
    if (s.stroked && !p.stroked) this.since = s.time;
    if (s.time < this.next) return { stop };
    let cue: SoundCue | undefined;
    if (s.resting && !p.resting) cue = 'rest';
    else if (s.stroked) {
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
