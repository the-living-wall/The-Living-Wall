import {
  SoundDirector,
  type SoundCue,
  type SoundState,
} from './sound-state.ts';
import { makeAirCandidate, makeCuriosityCandidate } from './air-candidates.ts';
const clips = [
  'purr',
  'voice',
  'touch',
  'scales',
  'move',
  'roll',
  'startle',
] as const;
const clipSources: Record<(typeof clips)[number], string> = {
  purr: '/audio/purr.mp3',
  voice: '/audio/voice.mp3',
  touch: '/audio/touch.mp3',
  // Return to the earlier crisp rattle while the B1 WAV is reworked; the WAV
  // stays in the archive for comparison and is not used by the live mix.
  scales: '/audio/scales.mp3',
  move: '/audio/move.mp3',
  roll: '/audio/roll.mp3',
  startle: '/audio/startle.wav',
};
export type SoundVolumeKey =
  | 'breathing'
  | 'heartMouth'
  | 'curiosityHand'
  | 'touch'
  | 'enjoyment'
  | 'scales'
  | 'movement'
  | 'rotation'
  | 'startle';
export const DEFAULT_SOUND_VOLUMES: Record<SoundVolumeKey, number> = {
  breathing: 1,
  heartMouth: 1,
  curiosityHand: 1,
  touch: 1,
  enjoyment: 1,
  scales: 1,
  movement: 1,
  rotation: 1,
  startle: 1,
};
const cueVolumeKey: Record<SoundCue, SoundVolumeKey> = {
  rest: 'breathing',
  settle: 'enjoyment',
  voice: 'heartMouth',
  curiosity: 'curiosityHand',
  touch: 'touch',
  purr: 'enjoyment',
  roll: 'rotation',
  scales: 'scales',
  move: 'movement',
  startle: 'startle',
};
const settings = {
  // The source purr is about 10 dB louder than the other clips. Keep it as
  // an intimate response instead of letting it dominate the interaction mix.
  // Purring is a low-frequency bed: loop the long source for as long as the
  // creature remains in the deeply-enjoying stroking state.
  purr: { rate: 0.7, seconds: 2.8, gain: 0.17, cutoff: 850, loop: true },
  rest: { rate: 1, seconds: 2.4, gain: 0.2, cutoff: 900 },
  settle: { rate: 1, seconds: 0.8, gain: 0.23, cutoff: 1400 },
  curiosity: { rate: 1, seconds: 0.78, gain: 0.28, cutoff: 2400 },
  // The touch-response voice was masking the quieter body cues in the test
  // mix, so keep it at half its previous level while preserving its tone.
  voice: { rate: 0.88, seconds: 1.2, gain: 0.25, cutoff: 3200 },
  touch: { rate: 0.8, seconds: 0.4, gain: 0.22, cutoff: 1800 },
  // Earlier rattle, with its transient and audible tail restored.
  scales: { rate: 0.6, seconds: 1.2, gain: 0.18, cutoff: 1900 },
  move: { rate: 1, seconds: 1, gain: 0.32, cutoff: 3000 },
  startle: { rate: 1, seconds: 0.82, gain: 0.55, cutoff: 3600 },
  roll: { rate: 0.7, seconds: 2, gain: 0.4, cutoff: 3500 },
};
export class CreatureAudio {
  private context: AudioContext;
  private master: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private director = new SoundDirector();
  private request = new AbortController();
  private active?: {
    cue: SoundCue;
    source: AudioBufferSourceNode;
    gain: GainNode;
    nodes: AudioNode[];
  };
  private purrBed?: {
    cue: SoundCue;
    source: AudioBufferSourceNode;
    gain: GainNode;
    nodes: AudioNode[];
  };
  private closed = false;
  private body?: NonNullable<CreatureAudio['active']>;
  private movement?: NonNullable<CreatureAudio['active']>;
  private previewUntil = 0;
  private ready = false;
  private cueVolumes = { ...DEFAULT_SOUND_VOLUMES };
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
          const response = await fetch(clipSources[name], {
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
  setCueVolume(key: SoundVolumeKey, value: number) {
    if (!this.closed) this.cueVolumes[key] = Math.max(0, Math.min(1, value));
  }
  update(state: SoundState) {
    if (!this.ready || this.closed || this.context.state !== 'running') return;
    if (this.context.currentTime < this.previewUntil) return;
    const event = this.director.update(state, !!this.active);
    if (
      event.stop &&
      (!event.cue || event.cue === 'startle' || event.cue === 'rest')
    )
      this.stop();
    else if (event.stop) this.stopTransient();
    if (event.purring) this.play('purr');
    else this.stopPurr();
    if (event.bodyCue) this.play(event.bodyCue);
    if (event.move) this.play('move');
    if (event.cue) this.play(event.cue);
  }
  private play(cue: SoundCue, preview = false) {
    const channel =
      cue === 'purr'
        ? 'purrBed'
        : cue === 'move'
          ? 'movement'
          : cue === 'scales' || cue === 'roll'
            ? 'body'
            : 'active';
    const current = this[channel];
    if (current) {
      // A sustained spin can replace its initial rattle, never the core voice.
      if (cue !== 'roll' || current.cue !== 'scales') return;
      this.fadeOut(current);
      this[channel] = undefined;
    }
    const buffer = this.buffers.get(cue);
    if (!buffer) return;
    const c = this.context,
      config = settings[cue],
      start = c.currentTime;
    const offset = cue === 'roll' ? 0.5 : 0;
    const looping = cue === 'purr' && !preview;
    const duration = Math.min(
      config.seconds,
      (buffer.duration - offset) / config.rate,
    );
    const source = c.createBufferSource(),
      gain = c.createGain(),
      filter = c.createBiquadFilter();
    source.buffer = buffer;
    source.playbackRate.value = config.rate;
    if (looping) {
      source.loop = true;
      source.loopStart = offset;
      source.loopEnd = buffer.duration;
    }
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
    const end = looping ? Number.POSITIVE_INFINITY : start + duration + tail;
    gain.gain.setValueAtTime(0, start);
    const attack = Math.min(0.08, duration / 4);
    const level = config.gain * this.cueVolumes[cueVolumeKey[cue]];
    gain.gain.linearRampToValueAtTime(level, start + attack);
    if (!looping) {
      gain.gain.setValueAtTime(
        level,
        start + Math.max(attack, duration + tail - Math.min(0.5, duration / 2)),
      );
      gain.gain.linearRampToValueAtTime(0, end);
    } else {
      gain.gain.setValueAtTime(level, start + attack);
    }
    const active = { cue, source, gain, nodes };
    this[channel] = active;
    if (looping) source.start(start, offset);
    else source.start(start, offset, duration * config.rate);
    // The source ending precedes delay tails; disconnect only after tail completion.
    source.onended = () => {
      setTimeout(
        () => {
          nodes.forEach((n) => n.disconnect());
          if (this[channel] === active) this[channel] = undefined;
        },
        tail * 1000 + 50,
      );
    };
  }
  audition(cue: SoundCue) {
    if (!this.ready || this.closed) return;
    this.stop();
    this.previewUntil =
      this.context.currentTime +
      settings[cue].seconds +
      (cue === 'voice' ? 0.8 : 0) +
      0.15;
    this.play(cue, true);
  }
  stop() {
    this.stopTransient();
    this.stopPurr();
    for (const key of ['body', 'movement'] as const) {
      if (this[key]) this.fadeOut(this[key]);
      this[key] = undefined;
    }
  }
  private stopTransient() {
    const a = this.active;
    if (!a) return;
    this.active = undefined;
    this.fadeOut(a);
  }
  private stopPurr() {
    const a = this.purrBed;
    if (!a) return;
    this.purrBed = undefined;
    this.fadeOut(a);
  }
  private fadeOut(a: NonNullable<CreatureAudio['active']>) {
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
