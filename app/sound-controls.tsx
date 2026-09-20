'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Creature } from '@/lib/creature';
import { CreatureAudio } from '@/lib/creature-audio';
import { Button } from '@/components/ui/button';
export default function SoundControls({
  creature,
}: {
  creature: RefObject<Creature>;
}) {
  const engine = useRef<CreatureAudio | null>(null);
  const music = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const [effects, setEffects] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.45);
  const [musicVolume, setMusicVolume] = useState(0.12);
  const [message, setMessage] = useState('');
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
      music.current?.pause();
      setEffects(false);
      setLoading(false);
      setPlaying(false);
    };
    const hide = () => {
      if (document.hidden) {
        const wasOn =
          !!engine.current || (!!music.current && !music.current.paused);
        stop();
        if (wasOn) setMessage('声音已暂停，回来后可重新开启。');
      }
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', stop);
    const disposeMusic = () => {
      const a = music.current;
      if (a) {
        a.onerror = null;
        a.pause();
        a.removeAttribute('src');
        a.load();
        music.current = null;
      }
    };
    return () => {
      cancelAnimationFrame(raf);
      stop();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', stop);
      disposeMusic();
    };
  }, [creature]);
  const toggleEffects = async () => {
    const token = ++generation.current;
    setMessage('');
    if (engine.current) {
      engine.current.close();
      engine.current = null;
      setEffects(false);
      setLoading(false);
      return;
    }
    let next: CreatureAudio | null = null;
    try {
      next = new CreatureAudio(volume);
      engine.current = next;
      setLoading(true);
      await next.start();
      if (generation.current !== token) return;
      setLoading(false);
      setEffects(true);
    } catch {
      next?.close();
      if (generation.current !== token) return;
      engine.current = null;
      setLoading(false);
      setEffects(false);
      setMessage('音效未能加载，请点「开启互动声音」重试。仍可正常互动。');
    }
  };
  const toggleMusic = async () => {
    setMessage('');
    if (!music.current) {
      music.current = new Audio('/audio/kalimba.mp3');
      music.current.loop = true;
      music.current.onerror = () => {
        setPlaying(false);
        setMessage('背景音乐未能加载，可重新开启。');
      };
    }
    const a = music.current;
    if (!a.paused) {
      a.pause();
      setPlaying(false);
      return;
    }
    a.volume = musicVolume;
    try {
      await a.play();
      if (document.hidden) a.pause();
      else setPlaying(!a.paused);
    } catch {
      setPlaying(false);
      setMessage('背景音乐未能播放，可重新开启。');
    }
  };
  return (
    <div className="sound-controls">
      <div className="sound-row">
        <Button onClick={toggleEffects} aria-pressed={effects || loading}>
          {loading ? '取消加载音效' : effects ? '关闭互动声音' : '开启互动声音'}
        </Button>
        <Button onClick={toggleMusic} aria-pressed={playing}>
          {playing ? '关闭背景音乐' : '开启背景音乐'}
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
            <label>
              音乐音量{' '}
              <input
                aria-label="音乐音量"
                type="range"
                min="0"
                max="0.5"
                step="0.01"
                value={musicVolume}
                onChange={(e) => {
                  const n = +e.target.value;
                  setMusicVolume(n);
                  if (music.current) music.current.volume = n;
                }}
              />
            </label>
            <p>
              触碰轻响 → 抚摸约 1 秒小生物回应 → 约 4 秒呼噜 → 约 8
              秒翻动。受惊、快速转身会响起鳞片声，安静时留白。
            </p>
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
