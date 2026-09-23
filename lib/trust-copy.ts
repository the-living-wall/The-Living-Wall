import type { Phase } from './creature';

/** Current response, not a persistent relationship level or reward. */
export function trustCopy(trust: number, phase: Phase, resting = false): string {
  if (phase === 'startle') return '先给它一点空间';
  if (phase === 'recover') return '慢慢找回安心';
  if (resting) return '陪它歇一会儿';
  if (phase === 'alone') return '等一次温柔的相遇';
  if (phase === 'search') return '还望着你离开的方向';
  if (trust >= 0.7) return '安心相伴';
  if (trust > 0.45) return '愿意靠近';
  if (trust >= 0.2) return '还在观察';
  return '小心试探';
}
