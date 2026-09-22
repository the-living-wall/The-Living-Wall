import type { Creature } from '../../lib/creature.ts';

// Existing entries are immutable. A redesign requires a new version key.
export const TEMPERAMENTS = Object.freeze({
  'original/v1': Object.freeze({
    name: '原来的样子',
    detail: '保留原有的呼吸与回应。',
  }),
  'calm/v1': Object.freeze({
    name: '沉静',
    detail: '两道微光缓缓舒展，再安静停留。',
  }),
  'playful/v1': Object.freeze({
    name: '俏皮',
    detail: '两点碎光轻轻跳动，再绕过身旁。',
  }),
  'curious/v1': Object.freeze({
    name: '好奇',
    detail: '一缕光向外试探，停一下，再收回来。',
  }),
});
export type StyleKey = keyof typeof TEMPERAMENTS;
export const ORIGINAL: StyleKey = 'original/v1';
export const STYLE_KEYS = Object.keys(TEMPERAMENTS) as StyleKey[];
export const isStyle = (key: string): key is StyleKey =>
  STYLE_KEYS.includes(key as StyleKey);
export function motionAllowed(
  c: Pick<Creature, 'resting' | 'alarm' | 'phase'>,
  reduced: boolean,
) {
  return (
    !reduced &&
    !c.resting &&
    c.alarm <= 0.1 &&
    c.phase !== 'startle' &&
    c.phase !== 'recover'
  );
}
export function drawTemperament(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  c: Creature,
  key: StyleKey,
  seconds: number,
  reduced: boolean,
) {
  if (key === ORIGINAL || !motionAllowed(c, reduced)) return;
  const unit = Math.min(w, h),
    radius = unit * 0.165 * c.growthScale * c.radius;
  const t = ((seconds % 8) + 8) % 8;
  const envelope = t < 5 ? Math.sin((Math.PI * t) / 5) ** 2 : 0;
  if (envelope < 0.001) return;
  ctx.save();
  ctx.translate(c.x * w, c.y * h);
  ctx.lineWidth = Math.max(1, unit / 900);
  ctx.strokeStyle = `rgba(193,221,213,${envelope * 0.4})`;
  ctx.fillStyle = `rgba(225,240,232,${envelope * 0.8})`;
  if (key === 'calm/v1') {
    const spread = 0.85 + Math.sin((Math.PI * t) / 5) * 0.3;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        radius * spread,
        radius * 0.8 * spread,
        0,
        side > 0 ? -0.5 : Math.PI - 0.5,
        side > 0 ? 0.5 : Math.PI + 0.5,
      );
      ctx.stroke();
    }
  } else if (key === 'playful/v1') {
    for (let i = 0; i < 2; i++) {
      const angle = -0.5 + t * 0.6 + i * 0.28;
      const r =
        radius *
        (1.05 + Math.max(0, Math.sin((t - i * 0.25) * Math.PI * 1.2)) * 0.13);
      ctx.save();
      ctx.translate(Math.cos(angle) * r, Math.sin(angle) * r * 0.7);
      ctx.rotate(angle + Math.PI / 4);
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    }
  } else {
    const extension = Math.sin((Math.PI * t) / 5) ** 2;
    const reach = radius * (0.8 + extension * 0.75);
    ctx.rotate(c.heading - 0.3);
    ctx.beginPath();
    ctx.moveTo(radius * 0.55, 0);
    ctx.quadraticCurveTo(
      reach * 0.85,
      -radius * 0.3 * extension,
      reach,
      -radius * 0.12,
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(reach, -radius * 0.12, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
