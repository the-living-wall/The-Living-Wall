'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Creature } from '@/lib/creature';
import { CreatureAudio, DEFAULT_SOUND_VOLUMES, type SoundVolumeKey } from '@/lib/creature-audio';
import type { SoundCue } from '@/lib/sound-state';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'xiaoying-sound-volumes';
const labels: Record<SoundVolumeKey, string> = { breathing: '呼吸', heartMouth: '心 / 口部回应', curiosityHand: '好奇伸手', touch: '接触回应', enjoyment: '抚摸享受', scales: '鳞片碎响', movement: '快速移动', rotation: '快速旋转', startle: '受惊 / 转场' };
const keys = Object.keys(DEFAULT_SOUND_VOLUMES) as SoundVolumeKey[];
const previewCues: Record<SoundVolumeKey, SoundCue> = { breathing: 'rest', heartMouth: 'voice', curiosityHand: 'curiosity', touch: 'touch', enjoyment: 'purr', scales: 'scales', movement: 'move', rotation: 'roll', startle: 'startle' };
type SavedVolumes = Record<SoundVolumeKey, number> & { music: number };
const readVolumes = (): SavedVolumes => {
  const next: SavedVolumes = { ...DEFAULT_SOUND_VOLUMES, music: 0.12 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, unknown>;
    const value = saved.music;
    if (typeof value === 'number' && Number.isFinite(value)) next.music = Math.max(0, Math.min(0.5, value));
  } catch { /* unavailable storage */ }
  return next;
};

export default function SoundControls({ creature }: { creature: RefObject<Creature> }) {
  const engine = useRef<CreatureAudio | null>(null), music = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0), activationPending = useRef(true), enabledRef = useRef(true), resumeAfterVisibility = useRef(false);
  const activateRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [soundOn, setSoundOn] = useState(true), [effectsReady, setEffectsReady] = useState(false), [loading, setLoading] = useState(true), [volume, setVolume] = useState(0.45), [volumes, setVolumes] = useState<SavedVolumes>({ ...DEFAULT_SOUND_VOLUMES, music: 0.12 }), [message, setMessage] = useState('');
  const volumeRef = useRef(volume), volumesRef = useRef(volumes);
  const persist = useCallback((next: SavedVolumes) => { volumesRef.current = next; setVolumes(next); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ } }, []);

  const activate = useCallback(async () => {
    const token = ++generation.current; activationPending.current = true; setEffectsReady(false); setMessage('');
    const next = new CreatureAudio(volumeRef.current); for (const key of keys) next.setCueVolume(key, 1); engine.current = next;
    if (!music.current) { music.current = new Audio('/audio/kalimba.mp3'); music.current.loop = true; music.current.preload = 'auto'; music.current.onerror = () => setMessage('背景音乐暂时不可用，互动音效仍会继续。'); }
    const audio = music.current; audio.volume = volumesRef.current.music; setLoading(true);
    const [effects, musicResult] = await Promise.allSettled([next.start(), audio.play()]); if (generation.current !== token) return;
    const effectsReady = effects.status === 'fulfilled', musicReady = musicResult.status === 'fulfilled' && !audio.paused;
    if (!effectsReady && !musicReady) { next.close(); engine.current = null; audio.pause(); setSoundOn(false); setEffectsReady(false); setMessage('浏览器暂未允许自动播放，请点击“开启声音”一次。'); activationPending.current = true; }
    else {
      enabledRef.current = true;
      setSoundOn(true);
      setEffectsReady(effectsReady);
      if (!effectsReady) {
        // Music can be allowed independently from Web Audio on mobile. Keep
        // the failed effects activation retryable instead of treating music
        // playback as proof that interaction cues are ready.
        next.close();
        engine.current = null;
      }
      if (!musicReady) audio.pause();
      if (!effectsReady || !musicReady) setMessage('互动音效尚未启动，点击“开启声音”即可开启。');
      activationPending.current = !effectsReady;
    }
    setLoading(false);
  }, []);
  useEffect(() => { activateRef.current = activate; }, [activate]);

  useEffect(() => {
    const saved = readVolumes(); volumesRef.current = saved; window.setTimeout(() => setVolumes(saved), 0);
    let raf = 0; const frame = () => { engine.current?.update(creature.current); raf = requestAnimationFrame(frame); }; raf = requestAnimationFrame(frame);
    const stop = () => { generation.current++; engine.current?.close(); engine.current = null; music.current?.pause(); setSoundOn(false); setEffectsReady(false); setLoading(false); };
    const visibility = () => { if (document.hidden) { resumeAfterVisibility.current = enabledRef.current && (!!engine.current || !!music.current); generation.current++; engine.current?.close(); engine.current = null; music.current?.pause(); if (resumeAfterVisibility.current) setMessage('页面已隐藏，声音将在返回后恢复。'); } else if (resumeAfterVisibility.current && enabledRef.current) { resumeAfterVisibility.current = false; void activateRef.current(); } };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', stop);
    return () => { cancelAnimationFrame(raf); stop(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', stop); };
  }, [creature]);

  const deactivate = () => { generation.current++; activationPending.current = false; enabledRef.current = false; engine.current?.close(); engine.current = null; music.current?.pause(); setSoundOn(false); setEffectsReady(false); setLoading(false); setMessage('声音已关闭。'); };
  const toggleSound = () => {
    // A failed autoplay attempt leaves the first activation in a loading
    // state. Treat the button tap as an explicit gesture and retry activation;
    // it must never be interpreted as a request to turn sound off.
    if (loading || !engine.current) { enabledRef.current = true; void activate(); return; }
    if (soundOn) deactivate();
    else { enabledRef.current = true; void activate(); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void activate(), 0); const retry = () => { if (activationPending.current) void activate(); }; window.addEventListener('pointerdown', retry, { once: true }); return () => { window.clearTimeout(timer); window.removeEventListener('pointerdown', retry); }; }, [activate]);
  const setInteractionVolume = (value: number) => {
    volumeRef.current = value;
    setVolume(value);
    const next = { ...volumesRef.current, ...Object.fromEntries(keys.map((key) => [key, 1])) } as SavedVolumes;
    persist(next);
    engine.current?.volume(value);
    for (const key of keys) engine.current?.setCueVolume(key, 1);
  };
  const preview = async (key: SoundVolumeKey) => {
    if (loading || !engine.current || !soundOn) {
      enabledRef.current = true;
      await activate();
    }
    engine.current?.audition(previewCues[key]);
  };
  return <div className="sound-controls"><div className="sound-row"><Button onClick={toggleSound} aria-pressed={effectsReady}>{loading ? '声音准备中…' : effectsReady ? '关闭声音' : '开启声音'}</Button><details className="sound-options"><summary>声音设置</summary><div className="sound-panel">
    <div className="sound-mix"><label><span>互动音量</span><output>{Math.round(volume * 100)}%</output><input aria-label="互动音量" type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setInteractionVolume(+e.target.value)} /></label><button type="button" onClick={() => setInteractionVolume(0.45)}>恢复默认</button></div>
    <div className="sound-mix"><label><span>背景音乐</span><output>{Math.round(volumes.music * 100)}%</output><input aria-label="背景音乐音量" type="range" min="0" max="0.5" step="0.01" value={volumes.music} onChange={(e) => { const n = +e.target.value; const next = { ...volumesRef.current, music: n }; persist(next); if (music.current) music.current.volume = n; }} /></label><button type="button" onClick={() => { const next = { ...volumesRef.current, music: 0.12 }; persist(next); if (music.current) music.current.volume = 0.12; }}>恢复默认</button></div>
    <div className="sound-library"><div className="sound-library-title">互动声音 <span>点击试听 · 共用互动音量</span></div><div className="sound-tags">{keys.map((key) => <button className="sound-tag" type="button" key={key} onClick={() => void preview(key)} aria-label={`试听${labels[key]}`}>{labels[key]}</button>)}</div></div>
    <p className="sound-hint">身体声：鳞片与旋转；心 / 口声：呼吸与回应；手声：接触、抚摸和好奇伸手。呼吸保持低存在感，不因鼠标移动持续触发。</p><a className="sound-credits" href="/audio/credits.html" target="_blank" rel="noreferrer">声音来源与署名 ↗</a>
  </div></details></div>{message && <output className="sound-message">{message}</output>}</div>;
}
