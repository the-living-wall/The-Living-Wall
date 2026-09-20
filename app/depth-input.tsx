'use client';
import { useEffect } from 'react';
import { adaptDepthState, type DepthPoint } from '@/lib/depth-input';

export default function DepthInputPoller({
  mirrorX,
  mirrorY,
  onPoint,
  onPosition,
  onStatus,
}: {
  mirrorX: boolean;
  mirrorY: boolean;
  onPoint: (x: number, y: number, active: boolean) => void;
  onPosition: (point: DepthPoint | null) => void;
  onStatus: (text: string) => void;
}) {
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let lastGood = 0;
    let lastMessage = '';
    const status = (message: string) => {
      if (!stopped && lastMessage !== message) {
        lastMessage = message;
        onStatus(message);
      }
    };
    const clear = (message: string) => {
      lastGood = 0;
      onPoint(0.5, 0.5, false);
      onPosition(null);
      status(message);
    };
    const watchdog = window.setInterval(() => {
      if (lastGood && performance.now() - lastGood > 300) {
        lastGood = 0;
        clear('深度数据超过 300 毫秒未更新，互动已暂停。');
      }
    }, 50);
    const poll = async () => {
      try {
        const response = await fetch('/__depth-lab/state', {
          cache: 'no-store',
          signal: AbortSignal.timeout(450),
        });
        const data: unknown = await response.json();
        if (stopped) return;
        if (!response.ok) {
          const error =
            data &&
            typeof data === 'object' &&
            'error' in data &&
            typeof data.error === 'string'
              ? data.error
              : '无法读取本地深度服务。';
          clear(error);
        } else {
          const adapted = adaptDepthState(data, mirrorX, mirrorY);
          if (adapted.point) {
            lastGood = performance.now();
            onPoint(adapted.point.x, adapted.point.y, true);
            onPosition(adapted.point);
            status(adapted.message);
          } else {
            lastGood = 0;
            clear(adapted.message);
          }
        }
      } catch {
        if (!stopped) clear('深度服务失联，互动已暂停。');
      } finally {
        if (!stopped) timer = window.setTimeout(poll, 100);
      }
    };
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(watchdog);
      onPoint(0.5, 0.5, false);
      onPosition(null);
    };
  }, [mirrorX, mirrorY, onPoint, onPosition, onStatus]);
  return null;
}
