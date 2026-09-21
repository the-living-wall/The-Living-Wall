import { Creature, ease, RIPPLE_SPEED, DISTURB_NEAR_AMP } from './creature';
import { getVisualStageParams } from './visual-stage';
/** Rest pose is squat (~0.82 Y) and enjoyment facing often adds X; boost world-Y. */
const STRETCH_VISUAL_Y = 0.75;
const STRETCH_SQUASH = 0.5;
const STRETCH_SQUASH_Y = 0.75;
export class CreatureRenderer {
  particles = Array.from({ length: 210 }, (_, i) => ({
    i,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: i * 2.399963,
    size: 2 + ((i * 17) % 9),
    seed: i * 1.791,
    ready: false,
  }));
  draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dt: number,
    c: Creature,
    marker: boolean,
  ) {
    const unit = Math.min(w, h),
      cx = c.x * w,
      cy = c.y * h,
      visual = getVisualStageParams(c.growthStage),
      base = unit * 0.165 * c.growthScale * visual.bodyScale,
      t = c.time;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const breathe = 1 + (c.breath - 0.5) * (0.09 + c.enjoyment * 0.12);
    const heading = c.heading,
      cos = Math.cos(heading),
      sin = Math.sin(heading);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.95);
    glow.addColorStop(
      0,
      `rgba(225,242,255,${0.06 + c.breath * 0.16 + c.enjoyment * 0.08 + c.flash * 0.16})`,
    );
    glow.addColorStop(0.3, 'rgba(198,227,248,.045)');
    glow.addColorStop(1, 'rgba(198,227,248,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - base, cy - base, base * 2, base * 2);
    const towardX = c.lookX * w - cx,
      towardY = c.lookY * h - cy;
    const towardLength = Math.max(1, Math.hypot(towardX, towardY));
    const tipLength = Math.min(towardLength, base * 2.4) * c.feeler;
    for (const p of this.particles) {
      if (p.i >= visual.particleLimit) continue;
      const isCore = p.i < 28,
        isScout = p.i >= 194;
      const phase = p.seed;
      let qx = 0,
        qy = 0;
      if (isCore) {
        const radius =
          base *
          (0.025 + Math.sqrt(p.i / 28) * 0.21) *
          c.core *
          visual.coreScale *
          breathe;
        const a = p.angle + t * 0.16;
        qx = Math.cos(a) * radius * (1 + c.openness * 0.15);
        qy = Math.sin(a) * radius * 0.8;
      } else if (isScout) {
        const n = (p.i - 194) / 15;
        const reach =
          base * 0.55 * visual.scoutScale + n * tipLength * visual.scoutScale;
        const beat = Math.sin(t * 2 - n * 4) * base * 0.028;
        qx = reach;
        qy =
          Math.sin(n * Math.PI) * base * 0.12 * Math.sin(t * 0.8) +
          beat +
          (p.i % 2 ? 1 : -1) * base * 0.025;
        // Scouts fold back into the body when not attending to anyone.
        const a = p.angle + t * 0.06;
        qx = ease(Math.cos(a) * base * 0.8, qx, 7, Math.max(0.005, c.feeler));
        qy = ease(Math.sin(a) * base * 0.8, qy, 7, Math.max(0.005, c.feeler));
      } else {
        const n = (p.i - 28) / 166;
        const a =
          p.angle +
          t * (0.06 + c.openness * 0.045) +
          Math.sin(t * 0.5 + phase) * 0.1;
        const r =
          base *
          (0.28 + Math.sqrt(n) * 0.75) *
          c.radius *
          visual.bodyRadius *
          breathe;
        const wave =
          1 +
          Math.sin(a * 3 + t * 0.65) * 0.1 +
          Math.cos(a * 5 - t * 0.4) * 0.035;
        qx = Math.cos(a) * r * wave * (1 + c.openness * 0.17);
        qy =
          Math.sin(a) * r * wave * (0.82 - c.alarm * 0.2 + c.openness * 0.12);
        // A slight forward opening lets the core and the scouts remain legible.
        if (qx > 0) {
          qx += c.feeler * base * 0.06;
          qy *= 1 + c.feeler * 0.18;
        }
        qx += Math.cos(a) * c.recoil * base * (0.4 + n * 0.9);
        qy += Math.sin(a) * c.recoil * base * (0.3 + n * 0.8);
      }
      if (!isCore && !isScout) {
        const localTouch = c.touchAngle - heading;
        const facing = Math.max(0, Math.cos(Math.atan2(qy, qx) - localTouch));
        qx += Math.cos(localTouch) * base * c.enjoyment * facing * 0.2;
        qy += Math.sin(localTouch) * base * c.enjoyment * facing * 0.2;
      }
      // FX-03: anisotropic stretch along stroke axis (aspect-corrected → body-local).
      let stretchBoost = 0;
      const stretchAmp = c.stretchAmp();
      if (stretchAmp > 0.001 && !isScout) {
        // World/aspect unit direction of stretch.
        const wux = c.stretchX / stretchAmp;
        const wuy = c.stretchY / stretchAmp;
        // Rotate world direction into body-local space (inverse of heading).
        const lux = wux * cos + wuy * sin;
        const luy = -wux * sin + wuy * cos;
        const along = qx * lux + qy * luy;
        const ax = qx - lux * along;
        const ay = qy - luy * along;
        // Extra world-Y elongate+squash so vertical reads taller/narrower, not just less-wide.
        const yAmt = Math.abs(wuy);
        const elongate = stretchAmp * (1 + STRETCH_VISUAL_Y * yAmt);
        const squash = Math.min(
          0.38,
          stretchAmp * (STRETCH_SQUASH + STRETCH_SQUASH_Y * yAmt),
        );
        qx = lux * along * (1 + elongate) + ax * (1 - squash);
        qy = luy * along * (1 + elongate) + ay * (1 - squash);
        stretchBoost = elongate;
      }
      // World-space sample shared by FX-01 ripples and FX-02 local disturbance.
      const wx = cx + qx * cos - qy * sin;
      const wy = cy + qx * sin + qy * cos;
      let disturbBoost = 0;
      if (c.disturbIntensity > 0.001 && !isScout) {
        const weight = c.disturbWeight(wx / w, wy / h);
        if (weight > 0.001) {
          disturbBoost = weight;
          const dx = wx - c.disturbX * w;
          const dy = wy - c.disturbY * h;
          const distPx = Math.hypot(dx, dy);
          // Near ≫ far via weight; shimmer stays a fraction so springs settle after leave.
          const push = base * DISTURB_NEAR_AMP * weight;
          const shim = Math.sin(t * 5 + phase * 3) * 0.18;
          if (distPx > 0.5) {
            const ux = dx / distPx;
            const uy = dy / distPx;
            // Perpendicular shimmer in world space, then convert to body-local.
            const pwx = ux * push - uy * push * shim;
            const pwy = uy * push + ux * push * shim;
            qx += pwx * cos + pwy * sin;
            qy += -pwx * sin + pwy * cos;
          } else {
            const br = Math.hypot(qx, qy) || 1;
            qx += (qx / br) * push;
            qy += (qy / br) * push * (1 + shim);
          }
        }
      }
      let rippleBoost = 0;
      if (c.ripples.length && !isScout) {
        // World-space sample before spring so the wave rides the body, not the cursor alone.
        for (const ripple of c.ripples) {
          const rx = ripple.x * w;
          const ry = ripple.y * h;
          const dx = wx - rx;
          const dy = wy - ry;
          const dist = Math.hypot(dx, dy);
          const front = ripple.age * RIPPLE_SPEED * unit;
          const band = base * 0.22;
          const envelope = Math.exp(
            -((dist - front) * (dist - front)) / (2 * band * band),
          );
          const fade = Math.max(0, 1 - ripple.age / ripple.life);
          const strength = ripple.amp * envelope * fade;
          rippleBoost = Math.max(rippleBoost, strength);
          if (dist > 0.5 && strength > 0.001) {
            const push = base * strength;
            // Convert world radial push back into local body space.
            const pwx = (dx / dist) * push;
            const pwy = (dy / dist) * push;
            qx += pwx * cos + pwy * sin;
            qy += -pwx * sin + pwy * cos;
          }
        }
      }
      const tx = cx + qx * cos - qy * sin,
        ty = cy + qx * sin + qy * cos;
      if (!p.ready) {
        p.x = tx;
        p.y = ty;
        p.ready = true;
      }
      const stiffness = isCore ? 35 : isScout ? 15 : 10 + (p.i % 4) * 2;
      p.vx += (tx - p.x) * stiffness * dt;
      p.vy += (ty - p.y) * stiffness * dt;
      const damping = Math.exp(-dt * (isCore ? 9 : 6));
      p.vx *= damping;
      p.vy *= damping;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = isCore
        ? 0.8 + 0.2 * Math.sin(t * 1.4 + phase) ** 2
        : isScout
          ? 0.5 + c.feeler * 0.4
          : 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(phase + t * 0.8));
      const size =
        p.size *
        (0.6 + unit / 1400) *
        visual.fragmentScale *
        (isCore ? 0.7 : 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(
        isCore
          ? p.angle + t * 0.13
          : isScout
            ? heading + Math.sin(phase + t) * 0.15
            : heading * 0.22 + Math.sin(phase + t * 0.17) * 0.6,
      );
      const wave = (1 - Math.cos(c.breathPhase - (isCore ? 0 : 0.55))) / 2;
      const luminous = Math.min(
        1,
        alpha *
          (0.46 + wave * 0.54) *
          (1 + rippleBoost * 0.9 + disturbBoost * 0.3 + stretchBoost * 0.25),
      );
      const saturation = Math.min(
        78,
        visual.saturation + (isCore ? c.maturity * 8 : c.maturity * 16),
      );
      const hue =
        (visual.hue +
          ((p.i % 28) / 27 - 0.5) * visual.hueRange +
          c.enjoyment * 35) %
        360;
      ctx.fillStyle = `hsla(${hue},${saturation}%,${isCore ? 96 : 88 - c.maturity * 16}%,${luminous})`;
      ctx.shadowColor = 'rgba(210,234,255,.65)';
      ctx.shadowBlur = isCore ? 12 : isScout ? 7 : 2;
      ctx.beginPath();
      if (isCore) {
        ctx.moveTo(-size * 0.6, -size * 0.65);
        ctx.lineTo(size * 0.75, -size * 0.18);
        ctx.lineTo(size * 0.4, size * 0.65);
        ctx.lineTo(-size * 0.7, size * 0.25);
      } else {
        ctx.moveTo(-size, -size * 0.22);
        ctx.lineTo(size * 0.6, -size * 0.35);
        ctx.lineTo(size, size * 0.22);
        ctx.lineTo(-size * 0.55, size * 0.28);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (marker && c.presence > 0.1) {
      ctx.strokeStyle = `rgba(198,239,188,${c.presence * 0.45})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.lookX * w, c.lookY * h, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
