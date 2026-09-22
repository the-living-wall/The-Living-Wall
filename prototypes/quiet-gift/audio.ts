import type { Creature } from '../../lib/creature';
import { SoundDirector } from '../../lib/sound-state';
declare const GIFT_AUDIO: Record<'touch' | 'voice', string>;
/** Only two existing cues for this standalone preview; no network or archive access. */
export class GiftAudio {
  private context?: AudioContext;
  private buffers = new Map<string, AudioBuffer>();
  private active?: AudioBufferSourceNode;
  private director = new SoundDirector();
  private generation = 0;
  enabled = false;
  async enable() {
    const generation = ++this.generation;
    const context = (this.context ??= new AudioContext());
    await Promise.race([
      context.resume(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('声音未能开启')), 2000),
      ),
    ]);
    for (const name of ['touch', 'voice'] as const) {
      if (!this.buffers.has(name)) {
        const bytes = Uint8Array.from(atob(GIFT_AUDIO[name]), (c) =>
          c.charCodeAt(0),
        );
        this.buffers.set(name, await context.decodeAudioData(bytes.buffer));
      }
    }
    if (generation !== this.generation) return;
    this.enabled = true;
    this.director.reset();
    this.play('touch');
  }
  disable() {
    this.generation++;
    this.enabled = false;
    this.stop();
    this.director.reset();
    void this.context?.suspend().catch(() => {});
  }
  private stop() {
    this.active?.stop();
    this.active = undefined;
  }
  private play(name: 'touch' | 'voice') {
    if (!this.enabled || !this.context || this.active) return;
    const c = this.context,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain();
    source.buffer = this.buffers.get(name)!;
    source.playbackRate.value = name === 'touch' ? 0.8 : 0.88;
    filter.type = 'lowpass';
    filter.frequency.value = name === 'touch' ? 1800 : 3200;
    const duration = name === 'touch' ? 0.4 : 1.2,
      start = c.currentTime;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.05);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    this.active = source;
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      if (this.active === source) this.active = undefined;
    };
    source.start(start, 0, duration * source.playbackRate.value);
  }
  update(c: Creature) {
    if (!this.enabled) return;
    const event = this.director.update(
      {
        time: c.time,
        phase: c.phase,
        stroked: c.stroked,
        touching: c.touching,
        enjoyment: c.enjoyment,
        resting: c.resting,
        alarm: c.alarm,
        heading: c.heading,
        motionSpeed: c.motionSpeed,
        frightCount: c.frightCount,
      },
      !!this.active,
    );
    if (event.stop) this.stop();
    if (event.cue === 'touch' || event.cue === 'voice') this.play(event.cue);
  }
}
