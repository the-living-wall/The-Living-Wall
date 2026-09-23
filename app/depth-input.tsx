'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DepthPoint } from '@/lib/depth-input';
import { startDepthPolling, type PollMetric } from '@/lib/depth-poller';
import { summarizeDepthMetrics } from '@/lib/depth-diagnostics';

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
  const recording = useRef(false);
  const started = useRef(0);
  const ended = useRef(0);
  const samples = useRef<PollMetric[]>([]);
  const pendingDisplay = useRef<PollMetric | null>(null);
  const recordingTimer = useRef(0);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState(() => ({
    duration: 0,
    count: 0,
    summary: summarizeDepthMetrics([], 0),
  }));
  const lastRefresh = useRef(0);
  useEffect(() => {
    let lastMessage = '';
    return startDepthPolling({
      mirrorX,
      mirrorY,
      onInput: (input) => {
        if (input.point) onPoint(input.point.x, input.point.y, true);
        else onPoint(0.5, 0.5, false);
        onPosition(input.point);
        if (lastMessage !== input.message) {
          lastMessage = input.message;
          onStatus(input.message);
        }
      },
      onMetric: (metric) => {
        if (!recording.current) return;
        samples.current.push(metric);
        if (metric.outcome === 'fresh') pendingDisplay.current = metric;
        if (performance.now() - lastRefresh.current > 500) {
          lastRefresh.current = performance.now();
          const duration = performance.now() - started.current;
          setView({
            duration,
            count: samples.current.length,
            summary: summarizeDepthMetrics(samples.current, duration),
          });
        }
      },
    });
  }, [mirrorX, mirrorY, onPoint, onPosition, onStatus]);
  useLayoutEffect(() => {
    const sample = pendingDisplay.current;
    if (sample && sample.source_age_upper_ms !== undefined) {
      // React has committed DOM changes, but this is NOT photon/display latency.
      sample.display_submit_age_upper_ms =
        sample.source_age_upper_ms + performance.now() - sample.at_ms;
      pendingDisplay.current = null;
    }
  });
  useEffect(() => () => window.clearTimeout(recordingTimer.current), []);
  const stopRecording = () => {
    window.clearTimeout(recordingTimer.current);
    ended.current = performance.now();
    recording.current = false;
    const duration = ended.current - started.current;
    setView({
      duration,
      count: samples.current.length,
      summary: summarizeDepthMetrics(samples.current, duration),
    });
    setRunning(false);
  };
  const beginRecording = () => {
    samples.current = [];
    pendingDisplay.current = null;
    started.current = performance.now();
    ended.current = 0;
    recording.current = true;
    setView({ duration: 0, count: 0, summary: summarizeDepthMetrics([], 0) });
    setRunning(true);
    recordingTimer.current = window.setTimeout(stopRecording, 60000);
  };
  const { duration, summary } = view;
  const download = () => {
    const report = {
      schema_version: 1,
      scope:
        'SDK交付帧后至React DOM提交的保守估计；不含曝光/SDK内部缓存/实际投影发光时间。请另记录Git提交、显示连接和设备配置。',
      created_at: new Date().toISOString(),
      mirror_x: mirrorX,
      mirror_y: mirrorY,
      summary: summarizeDepthMetrics(
        samples.current,
        ended.current - started.current,
      ),
      samples: samples.current.map((s) => ({
        ...s,
        at_ms: s.at_ms - started.current,
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'depth-latency.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <details className="depth-diagnostics">
      <summary>输入诊断</summary>
      <p>只记录数值，不录制画面。投影延迟需另测。</p>
      <button onClick={running ? stopRecording : beginRecording}>
        {running ? '停止记录' : '记录 60 秒'}
      </button>{' '}
      <button onClick={download} disabled={running || !view.count}>
        导出数值
      </button>
      <p>
        {Math.round(duration / 1000)} 秒 · {summary.unique_fps.toFixed(1)}{' '}
        新帧/秒
        <br />
        提交更新 P95：
        {summary.display_submit_age_upper_p95_ms?.toFixed(1) ?? '—'} ms
        <br />
        掉点 {summary.dropouts} 次 · 重复帧 {summary.duplicates} 次
      </p>
    </details>
  );
}
