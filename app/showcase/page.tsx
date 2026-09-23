'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Creature,
  clamp,
  phaseCopy,
  getGrowthStage,
  getGrowthStageInfo,
  type GrowthStage,
  type Phase,
} from '@/lib/creature';
import { CreatureRenderer } from '@/lib/draw-creature';
import SoundControls from '../sound-controls';

const PRESETS: readonly {
  stage: GrowthStage;
  label: string;
  maturity: number;
}[] = [
  { stage: 0, label: '初生白光', maturity: 0 },
  { stage: 1, label: '青痕萌发', maturity: 0.15 },
  { stage: 2, label: '流彩舒展', maturity: 0.35 },
  { stage: 3, label: '亲密共生', maturity: 0.65 },
  { stage: 4, label: '成熟光体', maturity: 0.85 },
];

export default function ShowcasePage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const creature = useRef(new Creature());
  const renderer = useRef(new CreatureRenderer());
  const maturityRef = useRef(0);
  const playingRef = useRef(false);
  const input = useRef({ x: 0.5, y: 0.45, speed: 0, seen: false, time: 0 });
  const [maturity, setMaturity] = useState(0);
  const [affection, setAffection] = useState(0);
  const [trust, setTrust] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>('alone');

  const reset = () => {
    const next = new Creature();
    const rect = canvas.current?.getBoundingClientRect();
    if (rect) next.resize(rect.width, rect.height);
    creature.current = next;
    renderer.current = new CreatureRenderer();
    input.current.seen = false;
    input.current.speed = 0;
    setPhase(next.phase);
    applyValues(0, 0, 0);
  };

  const applyValues = (
    nextMaturity: number,
    nextAffection = affection,
    nextTrust = trust,
  ) => {
    creature.current.care = nextMaturity * 1800;
    creature.current.affection = nextAffection;
    creature.current.trust = nextTrust;
    setMaturity(nextMaturity);
    maturityRef.current = nextMaturity;
    setAffection(nextAffection);
    setTrust(nextTrust);
  };

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    let width = 0;
    let height = 0;
    let last = 0;
    let raf = 0;
    let lastUI = 0;
    const leave = () => { input.current.seen = false; input.current.speed = 0; };
    const sample = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      const rect = c.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) { leave(); return; }
      const p = input.current;
      const now = performance.now();
      const dt = Math.max(0.008, (now - p.time) / 1000);
      p.speed = p.seen && now - p.time < 300
        ? clamp(Math.hypot((x - p.x) * creature.current.aspectX, (y - p.y) * creature.current.aspectY) / dt, 0, 8)
        : 0;
      p.x = x; p.y = y; p.seen = true; p.time = now;
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      c.setPointerCapture(event.pointerId);
      sample(event);
    };
    const up = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      if (c.hasPointerCapture(event.pointerId)) c.releasePointerCapture(event.pointerId);
      if (event.pointerType !== 'mouse') leave();
    };
    const visibility = () => { last = 0; if (document.hidden) leave(); };
    const resize = () => {
      width = innerWidth;
      height = Math.max(innerHeight * 0.66, 420);
      const dpr = Math.min(devicePixelRatio, 2);
      c.width = width * dpr;
      c.height = height * dpr;
      c.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      creature.current.resize(width, height);
    };
    resize();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000 || 0.016, 0.05);
      last = now;
      if (document.hidden) { raf = requestAnimationFrame(frame); return; }
      if (now - input.current.time > 100) input.current.speed *= Math.exp(-dt * 12);
      creature.current.step(dt, input.current);
      if (playingRef.current) {
        const next = Math.min(1, maturityRef.current + dt * 0.035);
        creature.current.care = next * 1800;
        maturityRef.current = next;
        if (next >= 1) {
          playingRef.current = false;
          setPlaying(false);
        }
      }
      maturityRef.current = creature.current.maturity;
      if (now - lastUI >= 200) {
        setMaturity(creature.current.maturity);
        setAffection(creature.current.affection);
        setTrust(creature.current.trust);
        setPhase(creature.current.phase);
        lastUI = now;
      }
      renderer.current.draw(ctx, width, height, dt, creature.current, true);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    addEventListener('resize', resize);
    addEventListener('blur', leave);
    document.addEventListener('visibilitychange', visibility);
    c.addEventListener('pointermove', sample);
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointerleave', leave);
    c.addEventListener('pointercancel', leave);
    c.addEventListener('lostpointercapture', leave);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      removeEventListener('blur', leave);
      document.removeEventListener('visibilitychange', visibility);
      c.removeEventListener('pointermove', sample);
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointerleave', leave);
      c.removeEventListener('pointercancel', leave);
      c.removeEventListener('lostpointercapture', leave);
    };
  }, []);

  const stage = getGrowthStage(maturity);
  const info = getGrowthStageInfo(stage);
  return (
    <main className="showcase-page">
      <canvas
        ref={canvas}
        className="showcase-canvas"
        aria-label="小莹成长阶段展示区域"
      />
      <section className="showcase-panel" aria-label="小莹展示控制台">
        <div className="showcase-heading">
          <div>
            <p className="showcase-kicker">THE LIVING WALL · SHOWCASE</p>
            <h1>小莹成长展示台</h1>
            <p>只用于展示，不会修改正式网站或真实成长档案。</p>
            <p>在上方画布慢慢移动鼠标，或用手指轻抚。滑块可随时调整演示值。</p>
            <p><output className="showcase-status">此刻 · {phaseCopy[phase][0]}</output></p>
          </div>
          <div className="showcase-current">
            <span>当前阶段</span>
            <strong>{info.name}</strong>
            <small>{info.description}</small>
          </div>
        </div>

        <div className="showcase-presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.stage}
              className={stage === preset.stage ? 'active' : ''}
              onClick={() => {
                playingRef.current = false;
                setPlaying(false);
                applyValues(
                  preset.maturity,
                  preset.stage / 4,
                  preset.stage / 4,
                );
              }}
            >
              <span>{preset.label}</span>
              <small>{Math.round(preset.maturity * 100)}%</small>
            </button>
          ))}
        </div>

        <div className="showcase-controls">
          <label>
            <span>
              成长 <b>{Math.round(maturity * 100)}%</b>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={maturity}
              onChange={(e) => {
                playingRef.current = false;
                setPlaying(false);
                applyValues(+e.target.value);
              }}
            />
          </label>
          <label>
            <span>
              亲密度 <b>{Math.round(affection * 100)}%</b>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={affection}
              onChange={(e) => {
                const value = +e.target.value;
                setAffection(value);
                creature.current.affection = value;
              }}
            />
          </label>
          <label>
            <span>
              当前信任 <b>{Math.round(trust * 100)}%</b>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={trust}
              onChange={(e) => {
                const value = +e.target.value;
                setTrust(value);
                creature.current.trust = value;
              }}
            />
          </label>
        </div>

        <div className="showcase-actions">
          <button
            onClick={() => {
              if (playingRef.current) {
                playingRef.current = false;
                setPlaying(false);
              } else {
                reset();
                playingRef.current = true;
                setPlaying(true);
              }
            }}
          >
            {playing ? '暂停成长播放' : '播放完整成长'}
          </button>
          <button
            className="quiet"
            onClick={() => {
              playingRef.current = false;
              setPlaying(false);
              reset();
            }}
          >
            恢复初始
          </button>
          <Link href="/">返回正式网站</Link>
        </div>
        <div className="showcase-sound"><SoundControls creature={creature} /></div>
      </section>
    </main>
  );
}
