'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Creature,
  getGrowthStage,
  getGrowthStageInfo,
  type GrowthStage,
} from '@/lib/creature';
import { CreatureRenderer } from '@/lib/draw-creature';

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
  const [maturity, setMaturity] = useState(0);
  const [affection, setAffection] = useState(0);
  const [trust, setTrust] = useState(0);
  const [, setPlaying] = useState(false);

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
      if (playingRef.current) {
        const next = Math.min(1, maturityRef.current + dt * 0.035);
        creature.current.care = next * 1800;
        maturityRef.current = next;
        setMaturity(next);
        if (next >= 1) {
          playingRef.current = false;
          setPlaying(false);
        }
      }
      creature.current.step(dt, { x: 0.5, y: 0.45, speed: 0, seen: false });
      renderer.current.draw(ctx, width, height, dt, creature.current, false);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
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
              playingRef.current = true;
              setPlaying(true);
              applyValues(0, 0, 0);
            }}
          >
            播放完整成长
          </button>
          <button
            className="quiet"
            onClick={() => {
              playingRef.current = false;
              setPlaying(false);
              applyValues(0, 0, 0);
            }}
          >
            恢复初始
          </button>
          <Link href="/">返回正式网站</Link>
        </div>
      </section>
    </main>
  );
}
