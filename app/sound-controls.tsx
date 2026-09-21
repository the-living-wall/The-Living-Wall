'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
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
  const activationPending = useRef(true);
  const [soundOn, setSoundOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [volume, setVolume] = useState(0.45);
  const [musicVolume, setMusicVolume] = useState(0.12);
  const [message, setMessage] = useState('');
  const volumeRef = useRef(volume);
  const musicVolumeRef = useRef(musicVolume);

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
      setSoundOn(false);
      setLoading(false);
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

  const activate = useCallback(async () => {
    const token = ++generation.current;
    activationPending.current = true;
    setMessage('');
    const next = new CreatureAudio(volumeRef.current);
    engine.current = next;
    if (!music.current) {
      music.current = new Audio('/audio/kalimba.mp3');
      music.current.loop = true;
      music.current.preload = 'auto';
      music.current.onerror = () =>
        setMessage('背景音乐暂时不可用，互动音效仍会继续。');
    }
    const audio = music.current;
    audio.volume = musicVolumeRef.current;
    setLoading(true);
    const [effects, musicResult] = await Promise.allSettled([
      next.start(),
      audio.play(),
    ]);
    if (generation.current !== token) return;
    const effectsReady = effects.status === 'fulfilled';
    const musicReady = musicResult.status === 'fulfilled' && !audio.paused;
    if (!effectsReady && !musicReady) {
      next.close();
      engine.current = null;
      audio.pause();
      setSoundOn(false);
      setMessage('浏览器暂未允许自动播放，请点击“开启声音”一次。');
      activationPending.current = true;
    } else {
      setSoundOn(true);
      if (!effectsReady) next.close();
      if (!musicReady) audio.pause();
      if (!effectsReady || !musicReady)
        setMessage('部分声音暂不可用；点击声音按钮可再次尝试。');
      activationPending.current = false;
    }
    setLoading(false);
  }, []);

  const deactivate = () => {
    generation.current++;
    activationPending.current = false;
    engine.current?.close();
    engine.current = null;
    music.current?.pause();
    setSoundOn(false);
    setLoading(false);
    setMessage('声音已关闭。');
  };
  const toggleSound = () => {
    if (loading || soundOn) deactivate();
    else void activate();
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void activate(), 0);
    // Browsers requiring a gesture reject the initial attempt. Retry both
    // channels on the first real interaction without adding another control.
    const retry = () => {
      if (activationPending.current) void activate();
    };
    window.addEventListener('pointerdown', retry, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', retry);
    };
  }, [activate]);

  return (
    <div className="sound-controls">
      <div className="sound-row">
        <Button onClick={toggleSound} aria-pressed={soundOn || loading}>
          {loading || soundOn ? '关闭声音' : '开启声音'}
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
                  volumeRef.current = n;
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
                  musicVolumeRef.current = n;
                  setMusicVolume(n);
                  if (music.current) music.current.volume = n;
                }}
              />
            </label>
            <p>
              默认会同时尝试开启互动音效与背景音乐。若浏览器拦截自动播放，点击上方按钮即可恢复。
              <br />
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
