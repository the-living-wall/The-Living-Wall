export const XIAOYING_PHONEMES = [
  'curiosity', 'invite', 'comfort', 'refuse', 'startle',
  'remember', 'sleep', 'play', 'relocate', 'settle',
] as const;

export type XiaoyingPhoneme = (typeof XIAOYING_PHONEMES)[number];

export type PhonemeDefinition = {
  emotion: string;
  durationMs: readonly [number, number];
  pitchSemitones: readonly [number, number];
  brightness: number;
  motion: string;
  repeatable: boolean;
  cooldownMs: number;
};

export type VocalGesture = {
  phonemes: readonly XiaoyingPhoneme[];
  durationMs: number;
  pitchSemitones: number;
  brightness: number;
  priority: number;
  variant: number;
};

export const PHONEME_DEFINITIONS: Record<XiaoyingPhoneme, PhonemeDefinition> = {
  curiosity: { emotion: '好奇', durationMs: [280, 900], pitchSemitones: [-2, 5], brightness: 0.72, motion: 'look', repeatable: true, cooldownMs: 900 },
  invite: { emotion: '邀请', durationMs: [350, 1100], pitchSemitones: [-1, 4], brightness: 0.68, motion: 'approach', repeatable: true, cooldownMs: 1200 },
  comfort: { emotion: '安心', durationMs: [700, 1800], pitchSemitones: [-4, 1], brightness: 0.42, motion: 'breathe', repeatable: true, cooldownMs: 2200 },
  refuse: { emotion: '拒绝', durationMs: [250, 800], pitchSemitones: [-5, 0], brightness: 0.35, motion: 'retreat', repeatable: false, cooldownMs: 1800 },
  startle: { emotion: '受惊', durationMs: [180, 650], pitchSemitones: [1, 8], brightness: 0.9, motion: 'flinch', repeatable: false, cooldownMs: 2600 },
  remember: { emotion: '想念', durationMs: [800, 1900], pitchSemitones: [-3, 3], brightness: 0.5, motion: 'turn', repeatable: true, cooldownMs: 3200 },
  sleep: { emotion: '困倦', durationMs: [1100, 2600], pitchSemitones: [-6, -1], brightness: 0.2, motion: 'rest', repeatable: false, cooldownMs: 5000 },
  play: { emotion: '玩耍', durationMs: [250, 1000], pitchSemitones: [0, 7], brightness: 0.84, motion: 'bounce', repeatable: true, cooldownMs: 1000 },
  relocate: { emotion: '迁移', durationMs: [450, 1300], pitchSemitones: [-1, 6], brightness: 0.62, motion: 'fly', repeatable: false, cooldownMs: 1800 },
  settle: { emotion: '安定', durationMs: [900, 2200], pitchSemitones: [-5, 0], brightness: 0.3, motion: 'land', repeatable: false, cooldownMs: 3000 },
};

const PRIORITY: Record<XiaoyingPhoneme, number> = {
  curiosity: 1, invite: 2, comfort: 3, refuse: 6, startle: 10,
  remember: 2, sleep: 7, play: 2, relocate: 5, settle: 8,
};

function seeded(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function composeVocalGesture(phonemes: readonly XiaoyingPhoneme[], seed = 1): VocalGesture {
  if (phonemes.length === 0 || phonemes.length > 3) throw new Error('A gesture must contain one to three phonemes');
  const definitions = phonemes.map((phoneme) => PHONEME_DEFINITIONS[phoneme]);
  const random = seeded(seed);
  const durationMs = Math.round(definitions.reduce((total, definition) => total + definition.durationMs[0] + random * (definition.durationMs[1] - definition.durationMs[0]), 0));
  const pitchSemitones = definitions.reduce((total, definition) => total + definition.pitchSemitones[0] + random * (definition.pitchSemitones[1] - definition.pitchSemitones[0]), 0) / definitions.length;
  return {
    phonemes: [...phonemes], durationMs, pitchSemitones,
    brightness: definitions.reduce((total, definition) => total + definition.brightness, 0) / definitions.length,
    priority: Math.max(...phonemes.map((phoneme) => PRIORITY[phoneme])),
    variant: Math.floor(random * 3),
  };
}

export class VoiceCooldowns {
  private readonly lastPlayed = new Map<XiaoyingPhoneme, number>();

  canPlay(phoneme: XiaoyingPhoneme, nowMs: number): boolean {
    const last = this.lastPlayed.get(phoneme);
    return last === undefined || nowMs - last >= PHONEME_DEFINITIONS[phoneme].cooldownMs;
  }

  markPlayed(phoneme: XiaoyingPhoneme, nowMs: number): void { this.lastPlayed.set(phoneme, nowMs); }
}
