'use client';

import { useEffect, useRef } from 'react';
import { Creature, type Signal } from '@/lib/creature';
import { normalArchiveKey } from '@/lib/creature-archive';
import { CreatureRenderer } from '@/lib/draw-creature';

type SpaceCreatureProps = { x: number; y: number; active: boolean };

/** Renders the same particle creature used by the main experience over camera video. */
export default function SpaceCreature({ x, y, active }: SpaceCreatureProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef({ x: 0.5, y: 0.5, active: false });

  useEffect(() => {
    target.current = { x, y, active };
  }, [active, x, y]);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    const creature = new Creature();
    const saved = window.localStorage.getItem(normalArchiveKey);
    if (saved) {
      try { creature.restore(JSON.parse(saved)); } catch { /* use a fresh creature */ }
    }
    const renderer = new CreatureRenderer();
    let width = 0;
    let height = 0;
    let last = 0;
    let raf = 0;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = width * dpr;
      element.height = height * dpr;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      creature.resize(width, height);
    };
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000 || 0.016, 0.05);
      last = now;
      const current = target.current;
      const signal: Signal = { x: current.x, y: current.y, speed: 0, seen: current.active };
      creature.step(dt, signal);
      renderer.draw(ctx, width, height, dt, creature, false, false);
      raf = requestAnimationFrame(frame);
    };
    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvas} className="space-creature-canvas" aria-label="小莹" />;
}
