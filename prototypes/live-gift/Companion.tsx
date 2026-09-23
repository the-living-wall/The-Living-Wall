'use client';
import { useCallback, useEffect, useRef, useState, useReducer } from 'react';
import HandCamera from '../../app/hand-camera';
import DepthInputPoller from '../../app/depth-input';
import SoundControls from './SoundControls';
import SharedExperience from './SharedExperience';
import { ConnectionPanel, type Connection } from './OnlineApp';
import {
  cleanName,
  actorName,
  sharedReducer,
  createSharedState,
} from './shared-state';
import { drawTemperament, ORIGINAL, type StyleKey } from './temperaments';
import { Button } from '@/components/ui/button';
import {
  Creature,
  clamp,
  getGrowthStageInfo,
  phaseCopy,
  type Phase,
  type GrowthStage,
} from '@/lib/creature';
import { CreatureRenderer } from '@/lib/draw-creature';
import { trustCopy } from '@/lib/trust-copy';
import type { DepthPoint } from '@/lib/depth-input';
import {
  normalArchiveKey,
  saveCreatureArchive,
  switchCreatureArchive,
} from '@/lib/creature-archive';
const localDay = () => new Date().toLocaleDateString('sv-SE');
const intimacyCopy = (affection: number) =>
  affection >= 0.7
    ? '安心相伴'
    : affection >= 0.45
      ? '愿意靠近'
      : affection >= 0.2
        ? '开始熟悉'
        : '初次相遇';
export default function Companion({
  connection,
}: { connection?: Connection } = {}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    creature = useRef(new Creature()),
    renderer = useRef(new CreatureRenderer());
  const input = useRef({ x: 0.5, y: 0.5, speed: 0, active: false, time: 0 });
  const source = useRef<'mouse' | 'camera' | 'depth'>('mouse');
  const archiveKey = useRef(normalArchiveKey);
  const pure = useRef(false);
  const [camera, setCamera] = useState(false),
    [depth, setDepth] = useState(false),
    [mirrorX, setMirrorX] = useState(false),
    [mirrorY, setMirrorY] = useState(false),
    [depthPoint, setDepthPoint] = useState<DepthPoint | null>(null),
    [message, setMessage] = useState(''),
    [projection, setProjection] = useState(false),
    [phase, setPhase] = useState<Phase>('alone'),
    [feeling, setFeeling] = useState(''),
    [growth, setGrowth] = useState(0),
    [growthStage, setGrowthStage] = useState<GrowthStage>(0),
    [affection, setAffection] = useState(0),
    [trust, setTrust] = useState(0);
  const [giftView, setGiftView] = useState<'home' | 'create' | 'receive'>(
    connection?.view ? 'receive' : 'home',
  );
  const [intent, setIntent] = useState('rest');
  const openings: Record<string, string> = {
    rest: '最近辛苦了。没什么要紧的事，只是想陪你歇一会儿。',
    thanks: '谢谢你一直以来的陪伴。',
    joy: '遇到一件开心的小事，第一个就想告诉你。',
  };
  const [note, setNote] = useState(
    connection?.creationDraft?.text ?? openings.rest,
  );
  const [noteEdited, setNoteEdited] = useState(!!connection?.creationDraft);
  const [localShared, dispatchLocal] = useReducer(
    sharedReducer,
    connection?.creationDraft,
    (draft) => ({
      ...createSharedState(draft?.text ?? openings.rest),
      ...(draft ? { names: draft.names } : {}),
    }),
  );
  const shared = connection?.view?.state ?? localShared;
  const dispatchShared = connection?.view ? connection.send : dispatchLocal;
  const [trial, setTrial] = useState<StyleKey | null>(null);
  const shapingView = useRef({
    enabled: false,
    style: ORIGINAL as StyleKey,
    startedAt: 0,
  });
  const reducedMotion = useRef(false);
  useEffect(() => {
    shapingView.current = {
      enabled: giftView === 'receive',
      style: trial ?? shared.active,
      startedAt: performance.now(),
    };
  }, [giftView, trial, shared.active]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reducedMotion.current = media.matches;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const previewArchive = useRef(new Map<string, string>());
  const previewStorage = useRef({
    getItem: (key: string) => previewArchive.current.get(key) ?? null,
    setItem: (key: string, value: string) => {
      previewArchive.current.set(key, value);
    },
  });
  const go = (next: 'home' | 'create' | 'receive') => {
    setTrial(null);
    if (next === 'receive') dispatchShared({ type: 'greeting', text: note });
    setGiftView(next);
    setMessage('');
    setCamera(false);
    source.current = 'mouse';
    input.current.active = false;
  };
  const storageOK = useRef(true);
  const saveArchive = useCallback(() => {
    try {
      saveCreatureArchive(
        previewStorage.current,
        archiveKey.current,
        creature.current,
      );
    } catch {
      if (storageOK.current) setMessage('成长暂时无法保存，仍可继续互动。');
      storageOK.current = false;
    }
  }, []);
  const switchArchive = useCallback((key: string) => {
    let next: Creature;
    try {
      next = switchCreatureArchive(
        previewStorage.current,
        creature.current,
        archiveKey.current,
        key,
      );
    } catch {
      next = new Creature();
      storageOK.current = false;
      setMessage('成长暂时无法读取，仍可继续互动。');
    }
    archiveKey.current = key;
    next.setDay(localDay());
    next.resize(innerWidth, innerHeight);
    creature.current = next;
    renderer.current = new CreatureRenderer();
    input.current.active = false;
    input.current.speed = 0;
    setGrowth(next.maturity);
    setGrowthStage(next.growthStage);
    setAffection(next.affection);
    setTrust(next.trust);
    setPhase('alone');
  }, []);
  const sample = useCallback((x: number, y: number, active: boolean) => {
    const p = input.current;
    if (!active) {
      p.active = false;
      return;
    }
    const now = performance.now(),
      dt = Math.max(0.008, (now - p.time) / 1000);
    const valid = p.active && now - p.time < 300;
    const factor = source.current === 'mouse' ? 1 : 1 - Math.exp(-dt / 0.055);
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
    setGrowth(c.maturity);
    setGrowthStage(c.growthStage);
    setAffection(c.affection);
    setTrust(c.trust);
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
    if (depth) {
      setDepth(false);
      setDepthPoint(null);
      switchArchive(normalArchiveKey);
    }
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
      const saved = previewStorage.current.getItem(normalArchiveKey);
      if (saved) creature.current.restore(JSON.parse(saved));
    } catch {
      storageOK.current = false;
      // Defer so react-compiler does not flag sync setState in effect body.
      queueMicrotask(() => setMessage('成长暂时无法保存，仍可继续互动。'));
    }
    creature.current.setDay(localDay());
    const saver = window.setInterval(() => {
      creature.current.setDay(localDay());
      saveArchive();
    }, 5000);
    window.addEventListener('pagehide', saveArchive);
    const c = canvas.current!,
      ctx = c.getContext('2d');
    if (!ctx) {
      clearInterval(saver);
      window.removeEventListener('pagehide', saveArchive);
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
      if (
        e.target instanceof HTMLButtonElement ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key.toLowerCase() === 'r') {
        reset();
        return;
      }
      if (source.current !== 'mouse') return;
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
      const view = shapingView.current;
      if (view.enabled)
        drawTemperament(
          ctx,
          w,
          h,
          model,
          view.style,
          (now - view.startedAt) / 1000,
          reducedMotion.current,
        );
      if (now - lastUI > 200) {
        setPhase(model.phase);
        setGrowth(model.maturity);
        setGrowthStage(model.growthStage);
        setAffection(model.affection);
        setTrust(model.trust);
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
      saveArchive();
      clearInterval(saver);
      window.removeEventListener('pagehide', saveArchive);
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
  }, [sample, reset, exitProjection, saveArchive]);
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
  const growthInfo = getGrowthStageInfo(growthStage);
  const growthPercent = Math.round(growth * 100);
  const affectionPercent = Math.round(affection * 100);
  const trustLabel = trustCopy(trust, phase, feeling === '休息一下');
  return (
    <main
      data-gift-view={giftView}
      className={'habitat gift-preview' + (projection ? ' projection' : '')}
    >
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
        {connection && import.meta.env.BASE_URL === '/friends/' ? (
          // oxlint-disable-next-line next/no-html-link-for-pages -- Leave the standalone bundle with a full page navigation.
          <a className="edition" href="/">
            回到个人陪伴
          </a>
        ) : (
          <span className="edition">小莹 · 把陪伴长成光</span>
        )}
      </header>
      {giftView === 'home' ? (
        <section className="guide">
          <h2>
            轻轻摸一摸，
            <br />
            让它慢慢舒展开。
          </h2>
          <p>
            {depth
              ? '在深度测试台校准空墙，再将物体靠近墙面。'
              : camera
                ? '让手掌完整进入镜头。'
                : '把鼠标慢慢移向小莹。'}
            <br />
            沿身体外围，缓慢来回抚摸。
            <br />
            停下来，看看它会不会靠过来。
          </p>
          {connection && (
            <ConnectionPanel connection={connection} mode="home" />
          )}
        </section>
      ) : (
        <section className="guide gift-guide">
          <button
            className="gift-text"
            onClick={() =>
              connection?.view
                ? connection.exit()
                : go(giftView === 'receive' ? 'create' : 'home')
            }
          >
            {connection?.view
              ? '回到小莹'
              : giftView === 'receive'
                ? '返回编辑'
                : '回到陪伴'}
          </button>
          <h2>
            {giftView === 'create' ? (
              <>
                给朋友，
                <br />
                送一份心意。
              </>
            ) : (
              <>
                这束光，
                <br />
                是为你留下的。
              </>
            )}
          </h2>
          {giftView === 'receive' && (
            <div className="gift-address">
              给 {actorName(shared.names, 'friend')} · 来自{' '}
              {actorName(shared.names, 'sender')}
            </div>
          )}
          {giftView === 'create' && (
            <p>留一点光，也捎一句话。让朋友知道，你在惦记着。</p>
          )}
          {giftView === 'receive' && (
            <SharedExperience
              connection={connection}
              state={shared}
              dispatch={dispatchShared}
              trial={trial}
              onTrial={setTrial}
            />
          )}
          {giftView === 'create' && (
            <div className="gift-intent">
              <label htmlFor="gift-intent">你想对朋友说什么？</label>
              <select
                disabled={connection?.creationPending}
                id="gift-intent"
                value={intent}
                onChange={(e) => {
                  setIntent(e.target.value);
                  if (!noteEdited) setNote(openings[e.target.value]);
                }}
              >
                <option value="rest">陪你歇一会儿</option>
                <option value="thanks">想谢谢你</option>
                <option value="joy">分你一点开心</option>
              </select>
              {noteEdited && note !== openings[intent] && (
                <button
                  className="gift-text"
                  disabled={connection?.creationPending}
                  onClick={() => {
                    setNote(openings[intent]);
                    setNoteEdited(false);
                  }}
                >
                  使用这句开头
                </button>
              )}
              <label htmlFor="gift-message">写给朋友的话，也可以留白</label>
              <textarea
                id="gift-message"
                rows={3}
                maxLength={80}
                readOnly={connection?.creationPending}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setNoteEdited(true);
                }}
              />
              <div className="gift-names">
                <label>
                  给谁（可选）
                  <input
                    aria-label="给谁（可选）"
                    disabled={connection?.creationPending}
                    defaultValue={shared.names.friend}
                    onBlur={(e) => {
                      e.target.value = cleanName(e.target.value);
                      dispatchShared({
                        type: 'rename',
                        actor: 'friend',
                        name: e.target.value,
                      });
                    }}
                    placeholder="你对朋友的称呼"
                  />
                </label>
                <label>
                  你的落款（可选）
                  <input
                    aria-label="你的落款（可选）"
                    disabled={connection?.creationPending}
                    defaultValue={shared.names.sender}
                    onBlur={(e) => {
                      e.target.value = cleanName(e.target.value);
                      dispatchShared({
                        type: 'rename',
                        actor: 'sender',
                        name: e.target.value,
                      });
                    }}
                    placeholder="朋友熟悉的你"
                  />
                </label>
              </div>
            </div>
          )}
        </section>
      )}
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
        <em className="trust-state">{trustLabel}</em>
      </aside>
      <footer className="bottom">
        <div className="help">
          {depth
            ? '本地近墙区域实验 · 不等于手部识别或物理触碰'
            : camera
              ? '手部互动 · 不录制、不上传'
              : '鼠标 / 触摸 / 方向键'}
          {giftView === 'home' && (
            <>
              <div className="growth-summary" aria-label="小莹的成长与亲密度">
                <div className="growth-summary-heading">
                  <strong>{growthInfo.name}</strong>
                  <span>成长 {growthPercent}%</span>
                </div>
                <p>{growthInfo.description}</p>
                <div className="growth-meter">
                  <span>成长</span>
                  <progress
                    value={growth}
                    max={1}
                    aria-label={`成长 ${growthPercent}%`}
                  />
                </div>
                <div className="growth-meter">
                  <span>亲密</span>
                  <progress
                    value={affection}
                    max={1}
                    aria-label={`亲密度 ${affectionPercent}%`}
                  />
                  <em>{intimacyCopy(affection)}</em>
                </div>
              </div>
              <div className="help-note">预览成长仅在本页 · 不读取真实存档</div>
            </>
          )}
          <br />
          <kbd>R</kbd> 重新相遇　<kbd>Esc</kbd> / 双击退出纯画面
        </div>
        <div className="control-stack">
          {connection && giftView !== 'home' && (
            <ConnectionPanel connection={connection} mode={giftView} />
          )}
          {message && !projection && (
            <output className="message">{message}</output>
          )}
          {giftView !== 'receive' && (
            <div className="gift-actions">
              {giftView === 'home' ? (
                <button
                  className="gift-text gift-send"
                  onClick={() => go('create')}
                >
                  送给朋友 ↗
                </button>
              ) : (
                <>
                  <button
                    className="gift-text gift-send"
                    disabled={connection?.busy}
                    onClick={() =>
                      connection
                        ? connection.create(note, shared.names)
                        : go('receive')
                    }
                  >
                    {connection
                      ? connection.busy
                        ? '正在生成…'
                        : '生成分享链接 ↗'
                      : '预览这份心意 ↗'}
                  </button>
                </>
              )}
            </div>
          )}
          <SoundControls
            key={giftView}
            creature={creature}
            autoStart={giftView !== 'receive'}
          />
          <div className="controls">
            <Button className="primary" onClick={toggleCamera}>
              {camera ? '关闭摄像头' : '启用摄像头'}
            </Button>
            {depth && (
              <>
                <label className="depth-option">
                  <input
                    type="checkbox"
                    checked={mirrorX}
                    onChange={(e) => setMirrorX(e.target.checked)}
                  />
                  左右镜像
                </label>
                <label className="depth-option">
                  <input
                    type="checkbox"
                    checked={mirrorY}
                    onChange={(e) => setMirrorY(e.target.checked)}
                  />
                  上下镜像
                </label>
                <a
                  className="depth-lab-link"
                  href="http://127.0.0.1:8769/"
                  target="_blank"
                  rel="noreferrer"
                >
                  打开深度测试台校准
                </a>
              </>
            )}
            <Button onClick={reset}>重新相遇</Button>
            <Button onClick={enterProjection}>全屏纯画面</Button>
          </div>
        </div>
      </footer>
      {!projection && (
        <div className="gift-preview-label">
          {connection
            ? '朋友互动 · 七天到期 · 无站外通知'
            : '共同塑造预览 · 同机演示 · 刷新清空'}
        </div>
      )}
      {camera && (
        <HandCamera
          onPoint={sample}
          onStatus={setMessage}
          onFailure={failure}
        />
      )}
      {depth && (
        <DepthInputPoller
          mirrorX={mirrorX}
          mirrorY={mirrorY}
          onPoint={sample}
          onPosition={setDepthPoint}
          onStatus={setMessage}
        />
      )}
      {depth && depthPoint && (
        <div
          className="depth-position"
          style={{
            left: `${depthPoint.x * 100}%`,
            top: `${depthPoint.y * 100}%`,
          }}
          aria-label={`深度输入位置：横向 ${Math.round(depthPoint.x * 100)}%，纵向 ${Math.round(depthPoint.y * 100)}%`}
        />
      )}
      {projection && (
        <button className="exit-projection" onClick={exitProjection}>
          退出纯画面
        </button>
      )}
    </main>
  );
}
