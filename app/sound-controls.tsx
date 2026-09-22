'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Creature } from '@/lib/creature';
import { CreatureAudio, DEFAULT_SOUND_VOLUMES, type SoundVolumeKey } from '@/lib/creature-audio';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'xiaoying-sound-volumes';
const labels: Record<SoundVolumeKey, string> = { breathing: '呼吸', heartMouth: '心/口部声音', curiosityHand: '手部好奇', touch: '接触回应', enjoyment: '抚摸享受', scales: '鳞片', rotation: '旋转', movement: '快速移动', startle: '受惊/转场' };
const keys = Object.keys(DEFAULT_SOUND_VOLUMES) as SoundVolumeKey[];
type SavedVolumes = Record<SoundVolumeKey, number> & { music: number };
const readVolumes = (): SavedVolumes => {
  const next: SavedVolumes = { ...DEFAULT_SOUND_VOLUMES, music: 0.12 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, unknown>;
    for (const key of [...keys, 'music']) { const value = saved[key]; if (typeof value === 'number' && Number.isFinite(value)) next[key as keyof SavedVolumes] = Math.max(0, Math.min(key === 'music' ? 0.5 : 1, value)); }
  } catch { /* unavailable storage */ }
  return next;
};

export default function SoundControls({ creature }: { creature: RefObject<Creature> }) {
  const engine = useRef<CreatureAudio | null>(null), music = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0), activationPending = useRef(true), enabledRef = useRef(true), resumeAfterVisibility = useRef(false);
  const activateRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [soundOn, setSoundOn] = useState(true), [loading, setLoading] = useState(true), [volume, setVolume] = useState(0.45), [volumes, setVolumes] = useState<SavedVolumes>({ ...DEFAULT_SOUND_VOLUMES, music: 0.12 }), [message, setMessage] = useState('');
  const volumeRef = useRef(volume), volumesRef = useRef(volumes);
  const persist = useCallback((next: SavedVolumes) => { volumesRef.current = next; setVolumes(next); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ } }, []);

  const activate = useCallback(async () => {
    const token = ++generation.current; activationPending.current = true; setMessage('');
    const next = new CreatureAudio(volumeRef.current); for (const key of keys) next.setCueVolume(key, volumesRef.current[key]); engine.current = next;
    if (!music.current) { music.current = new Audio('/audio/kalimba.mp3'); music.current.loop = true; music.current.preload = 'auto'; music.current.onerror = () => setMessage('背景音乐暂时不可用，互动音效仍会继续。'); }
    const audio = music.current; audio.volume = volumesRef.current.music; setLoading(true);
    const [effects, musicResult] = await Promise.allSettled([next.start(), audio.play()]); if (generation.current !== token) return;
    const effectsReady = effects.status === 'fulfilled', musicReady = musicResult.status === 'fulfilled' && !audio.paused;
    if (!effectsReady && !musicReady) { next.close(); engine.current = null; audio.pause(); setSoundOn(false); setMessage('浏览器暂未允许自动播放，请点击“开启声音”一次。'); activationPending.current = true; }
    else { enabledRef.current = true; setSoundOn(true); if (!effectsReady) next.close(); if (!musicReady) audio.pause(); if (!effectsReady || !musicReady) setMessage('部分声音暂不可用；点击声音按钮可再次尝试。'); activationPending.current = false; }
    setLoading(false);
  }, []);
  useEffect(() => { activateRef.current = activate; }, [activate]);

  useEffect(() => {
    const saved = readVolumes(); volumesRef.current = saved; window.setTimeout(() => setVolumes(saved), 0);
    let raf = 0; const frame = () => { engine.current?.update(creature.current); raf = requestAnimationFrame(frame); }; raf = requestAnimationFrame(frame);
    const stop = () => { generation.current++; engine.current?.close(); engine.current = null; music.current?.pause(); setSoundOn(false); setLoading(false); };
    const visibility = () => { if (document.hidden) { resumeAfterVisibility.current = enabledRef.current && (!!engine.current || !!music.current); generation.current++; engine.current?.close(); engine.current = null; music.current?.pause(); if (resumeAfterVisibility.current) setMessage('页面已隐藏，声音将在返回后恢复。'); } else if (resumeAfterVisibility.current && enabledRef.current) { resumeAfterVisibility.current = false; void activateRef.current(); } };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', stop);
    return () => { cancelAnimationFrame(raf); stop(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', stop); };
  }, [creature]);

  const deactivate = () => { generation.current++; activationPending.current = false; enabledRef.current = false; engine.current?.close(); engine.current = null; music.current?.pause(); setSoundOn(false); setLoading(false); setMessage('声音已关闭。'); };
  const toggleSound = () => { if (loading || soundOn) deactivate(); else { enabledRef.current = true; void activate(); } };
  useEffect(() => { const timer = window.setTimeout(() => void activate(), 0); const retry = () => { if (activationPending.current) void activate(); }; window.addEventListener('pointerdown', retry, { once: true }); return () => { window.clearTimeout(timer); window.removeEventListener('pointerdown', retry); }; }, [activate]);
  const setCue = (key: SoundVolumeKey, value: number) => { const next = { ...volumesRef.current, [key]: value }; persist(next); engine.current?.setCueVolume(key, value); };
  return <div className="sound-controls"><div className="sound-row"><Button onClick={toggleSound} aria-pressed={soundOn || loading}>{loading || soundOn ? '关闭声音' : '开启声音'}</Button><details className="sound-options"><summary>声音设置</summary><div className="sound-panel">
    <label>总体互动音量 <input aria-label="总体互动音量" type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => { const n = +e.target.value; volumeRef.current = n; setVolume(n); engine.current?.volume(n); }} /></label>
    <label>背景音乐 <input aria-label="背景音乐" type="range" min="0" max="0.5" step="0.01" value={volumes.music} onChange={(e) => { const n = +e.target.value; const next = { ...volumesRef.current, music: n }; persist(next); if (music.current) music.current.volume = n; }} /><span>{Math.round(volumes.music * 100)}% / 默认 12%</span><button type="button" onClick={() => { const next = { ...volumesRef.current, music: 0.12 }; persist(next); if (music.current) music.current.volume = 0.12; }}>恢复默认</button></label>
    {keys.map((key) => <label key={key}>{labels[key]} <input aria-label={labels[key]} type="range" min="0" max="1" step="0.01" value={volumes[key]} onChange={(e) => setCue(key, +e.target.value)} /><span>{Math.round(volumes[key] * 100)}% / 默认 100%</span><button type="button" onClick={() => setCue(key, DEFAULT_SOUND_VOLUMES[key])}>恢复默认</button></label>)}
    <p>身体声包含鳞片、旋转和快速移动；心/口声包含呼吸与回应；手声只在接触、抚摸或好奇伸手事件发生时播放。呼吸保持低存在感，不因鼠标移动持续触发。若浏览器拦截自动播放，点击上方按钮即可恢复。</p><a href="/audio/credits.html" target="_blank" rel="noreferrer">声音来源与署名</a>
  </div></details></div>{message && <output className="sound-message">{message}</output>}</div>;
}
