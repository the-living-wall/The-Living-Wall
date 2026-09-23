import type { Creature } from '../../lib/creature.ts';

// Existing entries are immutable. A redesign requires a new version key.
export const TEMPERAMENTS = Object.freeze({
  'calm/v2': Object.freeze({
    name: '沉静',
    detail: '舒展的弧光，轻抚时也从容回应。',
  }),
  'playful/v2': Object.freeze({
    name: '俏皮',
    detail: '身旁的碎光轻跳，回应你的靠近。',
  }),
  'curious/v2': Object.freeze({
    name: '好奇',
    detail: '一缕探光向外伸展，跟随你的方向。',
  }),
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
export const STYLE_KEYS: StyleKey[] = [
  'original/v1',
  'calm/v2',
  'playful/v2',
  'curious/v2',
];
export const isStyle = (key: string): key is StyleKey =>
  Object.hasOwn(TEMPERAMENTS, key);
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
  if (key.endsWith('/v2')) {
    drawContinuous(ctx, w, h, c, key, seconds, reduced);
    return;
  }
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

// Presentation only: never write to the creature, its care or contact rules.
function drawContinuous(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  c: Creature,
  key: StyleKey,
  seconds: number,
  reduced: boolean,
) {
  const moving = motionAllowed(c, reduced);
  const t = moving ? seconds : 0;
  const response = moving ? c.enjoyment : 0;
  const unit = Math.min(w, h);
  const radius = Math.max(28, unit * 0.165 * c.growthScale * c.radius);
  ctx.save();
  ctx.translate(c.x * w, c.y * h);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, unit / 430);
  ctx.strokeStyle = 'rgba(193,221,213,0.68)';
  ctx.fillStyle = 'rgba(216,241,224,0.92)';
  ctx.shadowColor = 'rgba(182,225,205,0.45)';
  ctx.shadowBlur = 10;
  if (key === 'calm/v2') {
    const breath = 1.06 + Math.sin(t * 0.65) * 0.045 + response * 0.035;
    for (const side of [0, Math.PI]) {
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        radius * breath,
        radius * 0.77 * breath,
        -0.12,
        side - 0.85,
        side + 0.85,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      radius * breath * 1.09,
      radius * 0.77 * breath * 1.09,
      -0.12,
      0.2,
      Math.PI - 0.2,
    );
    ctx.stroke();
  } else if (key === 'playful/v2') {
    for (let i = 0; i < 3; i++) {
      const angle = -1.2 + i * 2.1 + t * (0.23 + response * 0.1);
      const hop = moving
        ? Math.max(0, Math.sin(t * 2.8 - i * 0.8)) * (0.09 + response * 0.04)
        : 0;
      const r = radius * (1.13 + hop);
      ctx.save();
      ctx.translate(Math.cos(angle) * r, Math.sin(angle) * r * 0.78);
      ctx.rotate(angle + Math.PI / 4);
      const size = Math.max(5, unit / 140);
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    }
  } else {
    const reach = radius * (1.27 + Math.sin(t * 0.95) * 0.12 + response * 0.12);
    ctx.rotate(moving ? c.heading - 0.3 : -0.6);
    ctx.beginPath();
    ctx.moveTo(radius * 0.58, 0);
    ctx.quadraticCurveTo(reach * 0.9, -radius * 0.45, reach, -radius * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(reach, -radius * 0.18, Math.max(3, unit / 210), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
