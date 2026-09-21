import {
  SoundDirector,
  type SoundCue,
  type SoundState,
} from './sound-state.ts';
import { makeAirCandidate, makeCuriosityCandidate } from './air-candidates.ts';
const clips = ['purr', 'voice', 'touch', 'scales', 'roll', 'move'] as const;
const settings = {
  // The source purr is about 10 dB louder than the other clips. Keep it as
  // an intimate response instead of letting it dominate the interaction mix.
  purr: { rate: 0.7, seconds: 2.8, gain: 0.17, cutoff: 850 },
  rest: { rate: 1, seconds: 2.4, gain: 0.2, cutoff: 900 },
  settle: { rate: 1, seconds: 0.8, gain: 0.23, cutoff: 1400 },
  curiosity: { rate: 1, seconds: 0.78, gain: 0.28, cutoff: 2400 },
  // Candidate B whoosh: play only its first second as the movement gesture.
  move: { rate: 1, seconds: 1, gain: 0.3, cutoff: 2400 },
  // The touch-response voice was masking the quieter body cues in the test
  // mix, so keep it at half its previous level while preserving its tone.
  voice: { rate: 0.88, seconds: 1.2, gain: 0.25, cutoff: 3200 },
  touch: { rate: 0.8, seconds: 0.4, gain: 0.22, cutoff: 1800 },
  scales: { rate: 0.75, seconds: 0.35, gain: 0.16, cutoff: 2200 },
  startle: { rate: 0.7, seconds: 0.65, gain: 0.24, cutoff: 2600 },
  roll: { rate: 0.7, seconds: 2, gain: 0.4, cutoff: 3500 },
};
export class CreatureAudio {
  private context: AudioContext;
  private master: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private director = new SoundDirector();
  private request = new AbortController();
  private active?: {
    source: AudioBufferSourceNode;
    gain: GainNode;
    nodes: AudioNode[];
  };
  private closed = false;
  private ready = false;
  constructor(volume: number) {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = volume;
    this.master.connect(this.context.destination);
  }
  async start() {
    // Resume immediately inside the click gesture, before fetching.
    // A rejected/blocked autoplay request can otherwise leave resume() pending
    // forever. Fail quickly so the unified UI can explain the gesture fallback.
    await Promise.race([
      this.context.resume(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Audio autoplay was blocked')), 1500),
      ),
    ]);
    const timer = setTimeout(() => this.request.abort(), 20000);
    try {
      await Promise.all(
        clips.map(async (name) => {
          const response = await fetch(`/audio/${name}.mp3`, {
            signal: this.request.signal,
          });
          if (!response.ok) throw new Error(`Audio ${response.status}`);
          const buffer = await this.context.decodeAudioData(
            await response.arrayBuffer(),
          );
          if (!this.closed) this.buffers.set(name, buffer);
        }),
      );
      if (this.closed) throw new Error('Audio closed');
      this.buffers.set('rest', makeAirCandidate(this.context, 2.4));
      this.buffers.set('settle', makeAirCandidate(this.context, 0.8));
      this.buffers.set('curiosity', makeCuriosityCandidate(this.context));
      this.ready = true;
    } finally {
      clearTimeout(timer);
    }
  }
  volume(value: number) {
    if (!this.closed)
      this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.08);
  }
  update(state: SoundState) {
    if (!this.ready || this.closed || this.context.state !== 'running') return;
    const event = this.director.update(state, !!this.active);
    if (event.stop) this.stop();
    if ((event.cue === 'scales' || event.cue === 'move') && this.active)
      this.stop();
    if (event.cue) this.play(event.cue);
  }
  private play(cue: SoundCue) {
    // Drop conflicting cues; no queue that could speak after the user leaves.
    if (this.active) return;
    const buffer = this.buffers.get(cue === 'startle' ? 'scales' : cue);
    if (!buffer) return;
    const c = this.context,
      config = settings[cue],
      start = c.currentTime;
    const offset = cue === 'roll' ? 0.5 : 0;
    const duration = Math.min(
      config.seconds,
      (buffer.duration - offset) / config.rate,
    );
    const source = c.createBufferSource(),
      gain = c.createGain(),
      filter = c.createBiquadFilter();
    source.buffer = buffer;
    source.playbackRate.value = config.rate;
    filter.type = 'lowpass';
    filter.frequency.value = config.cutoff;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    const nodes: AudioNode[] = [source, filter, gain];
    if (cue === 'voice') {
      // Finite echoes: a longer, fading tail without feedback or another voice.
      for (const [delay, level] of [
        [0.22, 0.2],
        [0.46, 0.1],
        [0.72, 0.045],
      ]) {
        const d = c.createDelay(1),
          wet = c.createGain();
        d.delayTime.value = delay;
        wet.gain.value = level;
        filter.connect(d);
        d.connect(wet);
        wet.connect(gain);
        nodes.push(d, wet);
      }
    }
    const tail = cue === 'voice' ? 0.8 : 0;
    gain.gain.setValueAtTime(0, start);
    const attack = Math.min(0.08, duration / 4);
    gain.gain.linearRampToValueAtTime(config.gain, start + attack);
    gain.gain.setValueAtTime(
      config.gain,
      start + Math.max(attack, duration + tail - Math.min(0.5, duration / 2)),
    );
    gain.gain.linearRampToValueAtTime(0, start + duration + tail);
    const active = { source, gain, nodes };
    this.active = active;
    source.start(start, offset, duration * config.rate);
    // The source ending precedes delay tails; disconnect only after tail completion.
    source.onended = () => {
      setTimeout(
        () => {
          nodes.forEach((n) => n.disconnect());
          if (this.active === active) this.active = undefined;
        },
        tail * 1000 + 50,
      );
    };
  }
  audition(cue: SoundCue) {
    if (!this.ready || this.closed) return;
    this.stop();
    this.play(cue);
  }
  stop() {
    const a = this.active;
    if (!a) return;
    this.active = undefined;
    const now = this.context.currentTime;
    a.gain.gain.cancelScheduledValues(now);
    a.gain.gain.setTargetAtTime(0, now, 0.04);
    try {
      a.source.stop(now + 0.16);
    } catch {
      /* Already ended. */
    }
    setTimeout(() => a.nodes.forEach((n) => n.disconnect()), 200);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.request.abort();
    this.stop();
    this.buffers.clear();
    void this.context.close().catch(() => {});
  }
}
