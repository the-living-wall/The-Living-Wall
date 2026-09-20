'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import HandCamera from './hand-camera';
import SoundControls from './sound-controls';
import { Button } from '@/components/ui/button';
import { Creature, clamp, phaseCopy, type Phase } from '@/lib/creature';
import { CreatureRenderer } from '@/lib/draw-creature';
const storageKey = 'fragment-growth-v1';
const localDay = () => new Date().toLocaleDateString('sv-SE');
export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null),
    creature = useRef(new Creature()),
    renderer = useRef(new CreatureRenderer());
  const input = useRef({ x: 0.5, y: 0.5, speed: 0, active: false, time: 0 });
  const source = useRef<'mouse' | 'camera'>('mouse');
  const pure = useRef(false);
  const [camera, setCamera] = useState(false),
    [message, setMessage] = useState(''),
    [projection, setProjection] = useState(false),
    [phase, setPhase] = useState<Phase>('alone'),
    [feeling, setFeeling] = useState(''),
    [growth, setGrowth] = useState(0);
  const storageOK = useRef(true);
  const sample = useCallback((x: number, y: number, active: boolean) => {
    const p = input.current;
    if (!active) {
      p.active = false;
      return;
    }
    const now = performance.now(),
      dt = Math.max(0.008, (now - p.time) / 1000);
    const valid = p.active && now - p.time < 300;
    const factor = source.current === 'camera' ? 1 - Math.exp(-dt / 0.055) : 1;
    const nx = valid ? p.x + (clamp(x) - p.x) * factor : clamp(x),
      ny = valid ? p.y + (clamp(y) - p.y) * factor : clamp(y);
    const m = creature.current;
    const velocity = valid
      ? Math.hypot((nx - p.x) * m.aspectX, (ny - p.y) * m.aspectY) / dt
      : 0;
    p.speed = clamp(velocity, 0, 8);
    p.x = nx;
    p.y = ny;
    p.active = true;
    p.time = now;
  }, []);
  const reset = useCallback(() => {
    const c = new Creature();
    c.restore(creature.current.archive());
    c.resize(innerWidth, innerHeight);
    creature.current = c;
    renderer.current = new CreatureRenderer();
    input.current.active = false;
    input.current.speed = 0;
    setPhase('alone');
  }, []);
  const failure = useCallback((text: string) => {
    source.current = 'mouse';
    input.current.active = false;
    setCamera(false);
    setMessage(text);
  }, []);
  const toggleCamera = () => {
    const next = !camera;
    source.current = next ? 'camera' : 'mouse';
    input.current.active = false;
    input.current.speed = 0;
    setCamera(next);
    setMessage(next ? '正在准备摄像头…' : '摄像头已关闭，可以继续用鼠标互动。');
  };
  const exitProjection = useCallback(() => {
    pure.current = false;
    setProjection(false);
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
  }, []);
  const enterProjection = async () => {
    pure.current = true;
    setProjection(true);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* Pure canvas remains usable if fullscreen is unavailable. */
    }
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) creature.current.restore(JSON.parse(saved));
    } catch {
      storageOK.current = false;
      // Defer so react-compiler does not flag sync setState in effect body.
      queueMicrotask(() => setMessage('成长暂时无法保存，仍可继续互动。'));
    }
    creature.current.setDay(localDay());
    const save = () => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(creature.current.archive()),
        );
      } catch {
        if (storageOK.current) setMessage('成长暂时无法保存，仍可继续互动。');
        storageOK.current = false;
      }
    };
    const saver = window.setInterval(() => {
      creature.current.setDay(localDay());
      save();
    }, 5000);
    window.addEventListener('pagehide', save);
    const c = canvas.current!,
      ctx = c.getContext('2d');
    if (!ctx) {
      clearInterval(saver);
      window.removeEventListener('pagehide', save);
      queueMicrotask(() =>
        setMessage('此浏览器无法显示互动图形，请使用支持 Canvas 的浏览器。'),
      );
      return;
    }
    let w = innerWidth,
      h = innerHeight,
      raf = 0,
      last = 0,
      lastUI = 0;
    const resize = () => {
      w = innerWidth;
      h = innerHeight;
      const dpr = Math.min(devicePixelRatio, 2);
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      creature.current.resize(w, h);
    };
    resize();
    const move = (e: PointerEvent) => {
      if (source.current === 'mouse')
        sample(e.clientX / w, e.clientY / h, true);
    };
    const leave = () => {
      if (source.current === 'mouse') input.current.active = false;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') leave();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitProjection();
        return;
      }
      if (e.target instanceof HTMLButtonElement) return;
      if (e.key.toLowerCase() === 'r') {
        reset();
        return;
      }
      if (source.current === 'camera') return;
      const offsets: Record<string, [number, number]> = {
        ArrowLeft: [-0.02, 0],
        ArrowRight: [0.02, 0],
        ArrowUp: [0, -0.02],
        ArrowDown: [0, 0.02],
      };
      const d = offsets[e.key];
      if (d) {
        e.preventDefault();
        const p = input.current;
        sample(p.x + d[0], p.y + d[1], true);
        p.speed = 0.18;
      }
    };
    const fullscreen = () => {
      if (!document.fullscreenElement && pure.current) {
        pure.current = false;
        setProjection(false);
      }
    };
    const visibility = () => {
      last = 0;
      if (document.hidden) {
        input.current.active = false;
        input.current.speed = 0;
      }
    };
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerdown', move);
    c.addEventListener('pointerleave', leave);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', leave);
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', key);
    document.addEventListener('fullscreenchange', fullscreen);
    document.addEventListener('visibilitychange', visibility);
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000 || 0.016, 0.05);
      last = now;
      const p = input.current;
      if (now - p.time > 100) p.speed *= Math.exp(-dt * 12);
      const seen =
        p.active && (source.current === 'mouse' || now - p.time < 300);
      const model = creature.current;
      model.step(dt, { x: p.x, y: p.y, speed: p.speed, seen });
      renderer.current.draw(ctx, w, h, dt, model, !pure.current);
      if (now - lastUI > 200) {
        setPhase(model.phase);
        setGrowth(model.maturity);
        setFeeling(
          model.alarm > 0.1
            ? ''
            : model.resting
              ? '休息一下'
              : model.enjoyment > 0.45
                ? '享受抚摸'
                : model.touchZone === 'core' && model.trust <= 0.45
                  ? '核心还想藏一会儿'
                  : '',
        );
        lastUI = now;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      save();
      clearInterval(saver);
      window.removeEventListener('pagehide', save);
      cancelAnimationFrame(raf);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerdown', move);
      c.removeEventListener('pointerleave', leave);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', leave);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', key);
      document.removeEventListener('fullscreenchange', fullscreen);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [sample, reset, exitProjection]);
  useEffect(() => {
    type Tool = {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (v: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (t: Tool, o: { signal: AbortSignal }) => unknown;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const check = (v: unknown) => {
      if (
        !v ||
        typeof v !== 'object' ||
        Array.isArray(v) ||
        Object.keys(v).length
      )
        throw new Error('Expected an empty object');
    };
    const register = (t: Tool) => {
      try {
        void Promise.resolve(
          context.registerTool(t, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: 'reset_encounter',
      description: '重新开始相遇，保留本机成长与长期亲密度。不会开启摄像头。',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (v) => {
        check(v);
        reset();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return creature.current.snapshot();
      },
    });
    register({
      name: 'get_creature_state',
      description: '读取小莹当前行为与本轮互动经历；不包含图像或身份信息。',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: (v) => {
        check(v);
        return creature.current.snapshot();
      },
    });
    return () => lifecycle.abort();
  }, [reset]);
  return (
    <main className={'habitat' + (projection ? ' projection' : '')}>
      <canvas
        ref={canvas}
        className="stage"
        tabIndex={0}
        onDoubleClick={() => {
          if (pure.current) exitProjection();
        }}
        aria-label="小莹互动区域。慢慢靠近，停留，或挥动。方向键也可控制；纯画面时双击或按 Escape 返回。"
      />
      <header className="mast">
        <div className="brand">
          <span className="mark">✳</span>
          <div>
            <h1>小莹</h1>
            <div className="eyebrow">THE LIVING WALL</div>
          </div>
        </div>
        <span className="edition">实验 03 · 把陪伴长成光</span>
      </header>
      <section className="guide">
        <h2>
          轻轻摸一摸，
          <br />
          让它慢慢舒展开。
        </h2>
        <p>
          {camera ? '让手掌完整进入镜头。' : '把鼠标慢慢移向小莹。'}
          <br />
          沿身体外围，缓慢来回抚摸。
          <br />
          停下来，看看它会不会靠过来。
        </p>
      </section>
      <aside className="status" aria-live="polite">
        <span>
          <i className="dot" />
          此刻
        </span>
        <strong>{feeling || phaseCopy[phase][0]}</strong>
        <p>
          {feeling === '享受抚摸'
            ? '光随着呼吸舒展，把舒服的一侧靠向你。'
            : feeling === '休息一下'
              ? '它想安静呼吸一会儿，陪着它就好。'
              : feeling === '核心还想藏一会儿'
                ? '先摸摸外围，让它慢慢熟悉你。'
                : phaseCopy[phase][1]}
        </p>
      </aside>
      <footer className="bottom">
        <div className="help">
          {camera ? '手部互动 · 不录制、不上传' : '鼠标 / 触摸 / 方向键'}
          <br />
          {growth < 0.15
            ? '初生白光'
            : growth < 0.65
              ? '微色萌发'
              : '流彩渐成'}{' '}
          · 成长 {Math.round(growth * 100)}%
          <br />
          成长保存在本机浏览器 · 不识别身份
          <br />
          <kbd>R</kbd> 重新相遇　<kbd>Esc</kbd> / 双击退出纯画面
        </div>
        <div className="control-stack">
          <SoundControls creature={creature} />
          <div className="controls">
            <Button className="primary" onClick={toggleCamera}>
              {camera ? '关闭摄像头' : '启用摄像头'}
            </Button>
            <Button onClick={reset}>重新相遇</Button>
            <Button onClick={enterProjection}>全屏纯画面</Button>
          </div>
        </div>
      </footer>
      {camera && (
        <HandCamera
          onPoint={sample}
          onStatus={setMessage}
          onFailure={failure}
        />
      )}
      {message && !projection && <output className="message">{message}</output>}
      {projection && (
        <button className="exit-projection" onClick={exitProjection}>
          退出纯画面
        </button>
      )}
    </main>
  );
}
