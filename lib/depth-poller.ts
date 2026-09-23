import {
  adaptDepthState,
  depthFrameMetadata,
  type DepthInput,
  type DepthFrameMetadata,
} from './depth-input.ts';

export const DEPTH_POLL_MS = 33;
export const DEPTH_MAX_AGE_MS = 300;
export type PollMetric = {
  at_ms: number;
  rtt_ms: number;
  outcome: 'fresh' | 'duplicate' | 'out-of-order' | 'inactive' | 'error';
  frame_id?: number;
  received_mono_ms?: number;
  source_age_ms?: number;
  stream_epoch?: number;
  source_age_upper_ms?: number;
  processing_ms?: number;
  update_interval_ms?: number;
  display_submit_age_upper_ms?: number;
  dropout: boolean;
  counters?: Record<string, number>;
};
export type PollClock = {
  now: () => number;
  set: (fn: () => void, ms: number) => unknown;
  clear: (timer: unknown) => void;
};
export type DepthResponse = { ok: boolean; status: number; data: unknown };
const browserClock: PollClock = {
  now: () => performance.now(),
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id as number),
};
export async function requestDepth(
  signal: AbortSignal,
): Promise<DepthResponse> {
  const response = await fetch('/__depth-lab/state', {
    cache: 'no-store',
    signal,
  });
  return {
    ok: response.ok,
    status: response.status,
    data: await response.json(),
  };
}

/** Timers and transport are injected so cadence and expiry can be tested without hardware. */
export function startDepthPolling({
  onInput,
  onMetric,
  mirrorX = false,
  mirrorY = false,
  clock = browserClock,
  request = requestDepth,
}: {
  onInput: (input: DepthInput) => void;
  onMetric?: (metric: PollMetric) => void;
  mirrorX?: boolean;
  mirrorY?: boolean;
  clock?: PollClock;
  request?: (signal: AbortSignal) => Promise<DepthResponse>;
}) {
  let stopped = false,
    active = false;
  let timer: unknown, expiry: unknown, timeout: unknown;
  let controller: AbortController | undefined;
  let previous: DepthFrameMetadata | null = null;
  let lastUpdate: number | undefined;
  let streamEpoch = 1;
  const retired = new Set<string>();
  const clear = (message: string, kind: DepthInput['kind'] = 'invalid') => {
    const dropout = active;
    active = false;
    clock.clear(expiry);
    onInput({ kind, message, point: null });
    return dropout;
  };
  const poll = async () => {
    const started = clock.now();
    controller = new AbortController();
    timeout = clock.set(() => controller?.abort(), 450);
    try {
      const response = await request(controller.signal);
      if (stopped) return;
      const ended = clock.now();
      const rtt = Math.max(0, ended - started);
      const metric: PollMetric = {
        at_ms: ended,
        rtt_ms: rtt,
        outcome: 'inactive',
        dropout: false,
      };
      if (!response.ok) {
        const data = response.data as { error?: unknown } | null;
        const message =
          response.status === 404 || response.status === 426
            ? '深度协议不匹配，请更新并重启深度服务与采集脚本。'
            : typeof data?.error === 'string'
              ? data.error
              : '无法读取本地深度服务。';
        metric.outcome = 'error';
        metric.dropout = clear(message, 'offline');
      } else {
        const input = adaptDepthState(response.data, mirrorX, mirrorY);
        const meta = depthFrameMetadata(response.data);
        if (!input.point || !meta) {
          metric.dropout = clear(input.message, input.kind);
        } else {
          const age = meta.sourceAgeMs + rtt; // conservative: includes full round trip
          Object.assign(metric, {
            frame_id: meta.frameId,
            source_age_ms: meta.sourceAgeMs,
            source_age_upper_ms: age,
            processing_ms: meta.processingMs,
          });
          if (age > DEPTH_MAX_AGE_MS) {
            metric.dropout = clear('深度帧已过期，互动已暂停。');
          } else if (
            retired.has(meta.streamId) ||
            (previous?.streamId === meta.streamId &&
              meta.frameId < previous.frameId)
          ) {
            metric.outcome = 'out-of-order';
          } else if (
            previous?.streamId === meta.streamId &&
            meta.frameId === previous.frameId
          ) {
            metric.outcome = 'duplicate';
          } else {
            if (previous && previous.streamId !== meta.streamId) {
              retired.add(previous.streamId);
              metric.dropout = clear('深度服务已重启，等待新会话输入。');
              lastUpdate = undefined;
              streamEpoch++;
            }
            previous = meta;
            active = true;
            metric.outcome = 'fresh';
            metric.update_interval_ms =
              lastUpdate === undefined ? undefined : ended - lastUpdate;
            lastUpdate = ended;
            clock.clear(expiry);
            expiry = clock.set(
              () => {
                if (stopped) return;
                const dropout = clear(
                  '深度数据超过 300 毫秒未更新，互动已暂停。',
                );
                onMetric?.({
                  at_ms: clock.now(),
                  rtt_ms: 0,
                  outcome: 'inactive',
                  dropout,
                });
              },
              Math.max(0, DEPTH_MAX_AGE_MS - age),
            );
            onInput(input);
          }
        }
        const counters = (response.data as { diagnostics?: unknown })
          .diagnostics;
        metric.stream_epoch = streamEpoch;
        const received = (response.data as { received_mono_ms?: unknown })
          .received_mono_ms;
        if (
          typeof received === 'number' &&
          Number.isFinite(received) &&
          received >= 0
        )
          metric.received_mono_ms = received;
        if (counters && typeof counters === 'object') {
          metric.counters = Object.fromEntries(
            Object.entries(counters).filter(
              ([key, value]) =>
                [
                  'received_frames',
                  'processed_frames',
                  'capture_dropped',
                  'processing_dropped',
                  'preview_frames',
                  'preview_dropped',
                  'capture_fps',
                ].includes(key) &&
                typeof value === 'number' &&
                Number.isFinite(value) &&
                value >= 0,
            ),
          );
        }
      }
      onMetric?.(metric);
    } catch {
      if (!stopped) {
        const dropout = clear('深度服务失联，互动已暂停。', 'offline');
        onMetric?.({
          at_ms: clock.now(),
          rtt_ms: clock.now() - started,
          outcome: 'error',
          dropout,
        });
      }
    } finally {
      clock.clear(timeout);
      if (!stopped) {
        const elapsed = clock.now() - started;
        // Skip missed slots, never issue catch-up bursts or overlap requests.
        const delay = DEPTH_POLL_MS - (elapsed % DEPTH_POLL_MS);
        timer = clock.set(() => {
          void poll();
        }, delay);
      }
    }
  };
  void poll();
  return () => {
    stopped = true;
    clock.clear(timer);
    clock.clear(expiry);
    clock.clear(timeout);
    controller?.abort();
    clear('深度实验已关闭。', 'offline');
  };
}
