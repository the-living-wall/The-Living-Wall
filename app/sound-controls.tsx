'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Creature } from '@/lib/creature';
import { CreatureAudio } from '@/lib/creature-audio';
import type { SoundCue } from '@/lib/sound-state';
import { Button } from '@/components/ui/button';
export default function SoundControls({
  creature,
}: {
  creature: RefObject<Creature>;
}) {
  const engine = useRef<CreatureAudio | null>(null);
  const generation = useRef(0);
  const [effects, setEffects] = useState(true);
  const [loading, setLoading] = useState(true);
  const [volume, setVolume] = useState(0.45);
  const [message, setMessage] = useState('');
  const volumeRef = useRef(volume);
  const effectsRef = useRef(effects);
  const loadingRef = useRef(loading);
  useEffect(() => {
    volumeRef.current = volume;
    effectsRef.current = effects;
    loadingRef.current = loading;
  }, [volume, effects, loading]);
  const startEffects = useCallback(async () => {
    const token = ++generation.current;
    setMessage('');
    let next = engine.current;
    try {
      if (!next) {
        next = new CreatureAudio(volumeRef.current);
        engine.current = next;
      }
      setLoading(true);
      await next.start();
      if (generation.current !== token) return;
      setLoading(false);
      setEffects(true);
    } catch {
      // AudioContext may wait for the first user gesture. Keep the UI enabled
      // and retry silently when the user first interacts with the page.
      if (generation.current !== token) return;
      setLoading(true);
      setEffects(true);
    }
  }, []);
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      engine.current?.update(creature.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const stop = () => {
      generation.current++;
      engine.current?.close();
      engine.current = null;
      setEffects(false);
      setLoading(false);
    };
    const hide = () => {
      if (document.hidden) {
        const wasOn = !!engine.current;
        stop();
        if (wasOn) setMessage('声音已暂停，回来后可重新开启。');
      }
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', stop);
    const initialStart = window.setTimeout(() => void startEffects(), 0);
    const retryOnGesture = () => {
      if (loadingRef.current || !engine.current || !effectsRef.current)
        void startEffects();
    };
    window.addEventListener('pointerdown', retryOnGesture, { once: true });
    return () => {
      cancelAnimationFrame(raf);
      stop();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', stop);
      window.removeEventListener('pointerdown', retryOnGesture);
      window.clearTimeout(initialStart);
    };
  }, [creature, startEffects]);
  const toggleEffects = async () => {
    setMessage('');
    if (engine.current) {
      generation.current++;
      engine.current.close();
      engine.current = null;
      setEffects(false);
      setLoading(false);
      return;
    }
    await startEffects();
  };
  return (
    <div className="sound-controls">
      <div className="sound-row">
        <Button onClick={toggleEffects} aria-pressed={effects || loading}>
          {effects || loading ? '关闭声音' : '开启声音'}
        </Button>
        <details className="sound-options">
          <summary>声音设置</summary>
          <div className="sound-panel">
            <label>
              互动音量{' '}
              <input
                aria-label="互动音量"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => {
                  const n = +e.target.value;
                  setVolume(n);
                  engine.current?.volume(n);
                }}
              />
            </label>
            <p>
              初次接触轻响；抚摸后逐渐回应、呼噜、翻动。快速转身只轻响一次，
              享受抚摸时不打断。休息呼吸与满足舒气为本地试听候选。
            </p>
            {import.meta.env.DEV && (
              <div>
                <p>逐段试听（声音默认开启，鼠标离开小莹）</p>
                {([
                  ['touch', '接触'], ['scales', '转身'], ['startle', '受惊'],
                  ['voice', '抚摸回应'], ['curiosity', '好奇 B'], ['purr', '享受'], ['roll', '翻动'],
                  ['rest', '呼吸候选'], ['settle', '舒气候选'],
                ] as [SoundCue, string][]).map(([cue, label]) => (
                  <Button key={cue} disabled={!effects} onClick={() => engine.current?.audition(cue)}>{label}</Button>
                ))}
              </div>
            )}
            <a href="/audio/credits.html" target="_blank" rel="noreferrer">
              声音来源与署名
            </a>
          </div>
        </details>
      </div>
      {message && <output className="sound-message">{message}</output>}
    </div>
  );
}
