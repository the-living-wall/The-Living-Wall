import { SoundDirector, type SoundCue, type SoundState } from './sound-state';
const clips = ['purr', 'voice', 'touch', 'scales', 'roll'] as const;
const settings = {
  purr: { rate: 0.7, seconds: 6, gain: 0.38, cutoff: 850 },
  rest: { rate: 0.6, seconds: 4, gain: 0.15, cutoff: 650 },
  voice: { rate: 0.88, seconds: 2.5, gain: 0.35, cutoff: 3200 },
  touch: { rate: 0.8, seconds: 0.8, gain: 0.2, cutoff: 1800 },
  scales: { rate: 0.6, seconds: 1.2, gain: 0.14, cutoff: 1700 },
  roll: { rate: 0.7, seconds: 2, gain: 0.12, cutoff: 1400 },
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
    await this.context.resume();
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
    const event = this.director.update(state);
    if (event.stop) this.stop();
    if (event.cue) this.play(event.cue);
  }
  private play(cue: SoundCue) {
    // Drop conflicting cues; no queue that could speak after the user leaves.
    if (this.active) return;
    const buffer = this.buffers.get(cue === 'rest' ? 'purr' : cue);
    if (!buffer) return;
    const c = this.context,
      config = settings[cue],
      start = c.currentTime;
    const duration = Math.min(config.seconds, buffer.duration / config.rate);
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
    gain.gain.linearRampToValueAtTime(
      config.gain,
      start + Math.min(0.25, duration / 4),
    );
    gain.gain.setValueAtTime(
      config.gain,
      start + Math.max(0.25, duration + tail - 0.5),
    );
    gain.gain.linearRampToValueAtTime(0, start + duration + tail);
    const active = { source, gain, nodes };
    this.active = active;
    source.start(start, 0, duration * config.rate);
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
