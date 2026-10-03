'use client';

import { useEffect, useRef } from 'react';
import type { HandLandmarker } from '@mediapipe/tasks-vision';

export type AnchorDetection = {
  value: string;
  format: string;
  x: number;
  y: number;
};

type SpaceCameraProps = {
  onHand: (x: number, y: number, open: boolean) => void;
  onAnchor: (anchor: AnchorDetection | null) => void;
  onStatus: (status: string) => void;
  onScannerMode: (mode: 'native' | 'polyfill' | null) => void;
  onFailure: (message: string) => void;
};

type BarcodeDetectorLike = {
  detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string; format: string; boundingBox?: DOMRect }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export default function SpaceCamera({ onHand, onAnchor, onStatus, onScannerMode, onFailure }: SpaceCameraProps) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | undefined;
    let tracker: HandLandmarker | undefined;
    let detector: BarcodeDetectorLike | undefined;
    let frame = 0;
    let lastVideoTime = -1;
    let lastHandAt = 0;
    let lastScanAt = 0;

    const stop = () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      tracker?.close();
    };
    const fail = (message: string) => {
      if (!cancelled) onFailure(message);
      stop();
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera-unsupported');
        onStatus('正在准备后置摄像头…');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        const element = video.current;
        if (!element) throw new Error('video-unavailable');
        element.srcObject = stream;
        await element.play();

        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
        const files = await FilesetResolver.forVisionTasks('/mediapipe');
        const options = {
          baseOptions: { modelAssetPath: '/models/hand_landmarker.task' },
          runningMode: 'VIDEO' as const,
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        };
        try {
          tracker = await HandLandmarker.createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } });
        } catch {
          tracker = await HandLandmarker.createFromOptions(files, options);
        }
        if (window.BarcodeDetector) {
          detector = new window.BarcodeDetector({ formats: ['qr_code', 'data_matrix', 'aztec'] });
          onScannerMode('native');
        } else {
          try {
            const { BarcodeDetectorPolyfill } = await import('@undecaf/barcode-detector-polyfill');
            detector = new BarcodeDetectorPolyfill({ formats: ['qr_code'] });
            onScannerMode('polyfill');
          } catch {
            onScannerMode(null);
          }
        }
        onStatus(detector ? '后置摄像头已开启 · 请先让掌心进入画面，再对准床头锚点。' : '后置摄像头已开启 · 当前浏览器暂时无法扫描视觉锚点。');

        const loop = (now: number) => {
          if (cancelled) return;
          try {
            if (element.readyState >= 2 && element.currentTime !== lastVideoTime) {
              lastVideoTime = element.currentTime;
              const result = tracker?.detectForVideo(element, now);
              const hand = result?.landmarks[0];
              if (hand) {
                const palm = hand[9] ?? hand[0];
                const openness = Math.hypot(hand[8].x - hand[0].x, hand[8].y - hand[0].y) > 0.18;
                onHand(1 - palm.x, palm.y, openness);
                lastHandAt = now;
              } else if (now - lastHandAt > 250) onHand(0.5, 0.5, false);
            }
            if (detector && now - lastScanAt > 250 && element.readyState >= 2) {
              lastScanAt = now;
              void detector.detect(element).then((codes) => {
                if (cancelled) return;
                const code = codes[0];
                if (!code?.rawValue) {
                  onAnchor(null);
                  return;
                }
                const box = code.boundingBox;
                onAnchor({ value: code.rawValue, format: code.format, x: box ? box.x / element.videoWidth : 0.5, y: box ? box.y / element.videoHeight : 0.5 });
              }).catch(() => onAnchor(null));
            }
          } catch {
            fail('摄像头识别中断，请重新进入空间模式。');
            return;
          }
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      } catch (error) {
        const name = error instanceof Error ? error.message || error.name : '';
        fail(name === 'NotAllowedError' ? '请允许浏览器访问摄像头后重试。' : '后置摄像头或手部模型未能启动，请使用最新版 Safari 或 Chrome。');
      }
    };
    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [onAnchor, onFailure, onHand, onScannerMode, onStatus]);

  return <video ref={video} className="space-camera" autoPlay muted playsInline aria-label="后置摄像头预览，画面仅在本机处理" />;
}
