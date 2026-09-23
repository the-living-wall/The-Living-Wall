import assert from 'node:assert/strict';
import test from 'node:test';
import {
  startDepthPolling,
  type PollClock,
  type DepthResponse,
  type PollMetric,
} from '../lib/depth-poller.ts';
import { summarizeDepthMetrics } from '../lib/depth-diagnostics.ts';
import type { DepthInput } from '../lib/depth-input.ts';

class Clock implements PollClock {
  time = 0;
  id = 0;
  tasks = new Map<number, { at: number; fn: () => void }>();
  now = () => this.time;
  set = (fn: () => void, ms: number) => {
    const id = ++this.id;
    this.tasks.set(id, { at: this.time + ms, fn });
    return id;
  };
  clear = (id: unknown) => {
    this.tasks.delete(id as number);
  };
  async advance(ms: number) {
    const end = this.time + ms;
    for (let i = 0; i < 10000; i++) {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      const next = [...this.tasks.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) {
        this.time = end;
        return;
      }
      this.time = next[1].at;
      this.tasks.delete(next[0]);
      next[1].fn();
    }
    throw Error('timer loop');
  }
}
const payload = (frameId = 1, streamId = 'session-a', sourceAgeMs = 0) => ({
  protocol_version: 1,
  stream_id: streamId,
  frame_id: frameId,
  source_age_ms: sourceAgeMs,
  processing_ms: 2,
  mode: 'pipe',
  result: {
    state: 'near',
    background_model: 'pixel-wall-v2',
    diagnostic_valid: true,
    near_regions: [{ center: [0.3, 0.6], area_px: 100 }],
  },
});
const ok = (data: unknown): DepthResponse => ({ ok: true, status: 200, data });
function harness(
  request: (signal: AbortSignal) => Promise<DepthResponse>,
  clock = new Clock(),
) {
  const inputs: DepthInput[] = [],
    metrics: PollMetric[] = [];
  const stop = startDepthPolling({
    request,
    clock,
    onInput: (i) => inputs.push(i),
    onMetric: (m) => metrics.push(m),
  });
  return { clock, inputs, metrics, stop };
}
void test('33ms cadence delivers >=25 distinct 30fps frames/s without overlap', async () => {
  const clock = new Clock();
  let inFlight = 0,
    maxInFlight = 0;
  const h = harness(
    () =>
      new Promise((resolve) => {
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        const frame = Math.floor(clock.now() / (1000 / 30)) + 1;
        clock.set(() => {
          inFlight--;
          resolve(ok(payload(frame)));
        }, 5);
      }),
    clock,
  );
  await clock.advance(3000);
  assert.equal(maxInFlight, 1);
  assert.ok(h.metrics.filter((m) => m.outcome === 'fresh').length >= 75);
  assert.ok(h.metrics.every((m) => (m.source_age_upper_ms ?? 0) <= 100));
  h.stop();
  assert.equal(clock.tasks.size, 0);
});
void test('duplicate and out-of-order frames cannot prolong a live coordinate', async () => {
  let count = 0;
  const h = harness(async () =>
    ok(payload(++count === 1 ? 2 : count % 2 ? 1 : 2)),
  );
  await h.clock.advance(350);
  assert.equal(h.inputs.filter((i) => i.point).length, 1);
  assert.equal(h.inputs.at(-1)?.point, null);
  assert.equal(h.metrics.filter((m) => m.dropout).length, 1);
  h.stop();
});
void test('upstream source age and full RTT reduce the remaining freshness lifetime', async () => {
  const clock = new Clock();
  const h = harness(
    () =>
      new Promise((resolve) =>
        clock.set(() => resolve(ok(payload(1, 'a', 200))), 50),
      ),
    clock,
  );
  await clock.advance(99);
  assert.ok(h.inputs.at(-1)?.point);
  await clock.advance(2);
  assert.equal(h.inputs.at(-1)?.point, null);
  assert.ok(h.metrics.some((m) => m.source_age_upper_ms === 250));
  h.stop();
});
void test('new session accepts a lower frame id; retired sessions cannot revive', async () => {
  const frames = [payload(90), payload(1, 'b'), payload(91)];
  const h = harness(async () => ok(frames.shift() ?? payload(91)));
  await h.clock.advance(120);
  assert.equal(h.inputs.filter((i) => i.point).length, 2);
  assert.equal(h.metrics.at(-1)?.outcome, 'out-of-order');
  h.stop();
});
void test('invalid same frame clears immediately and cannot reactivate via duplicate', async () => {
  let count = 0;
  const h = harness(async () => {
    const data = payload();
    if (++count === 2) data.result.near_regions = [];
    return ok(data);
  });
  await h.clock.advance(100);
  assert.equal(h.inputs.filter((i) => i.point).length, 1);
  assert.equal(h.inputs.at(-1)?.point, null);
  h.stop();
});
void test('slow requests skip slots instead of catch-up requests; dispose ignores late completion', async () => {
  const clock = new Clock();
  const starts: number[] = [];
  let active = 0,
    max = 0;
  const h = harness(
    () =>
      new Promise((resolve) => {
        starts.push(clock.now());
        max = Math.max(max, ++active);
        clock.set(() => {
          active--;
          resolve(ok(payload(starts.length)));
        }, 80);
      }),
    clock,
  );
  await clock.advance(250);
  assert.deepEqual(starts, [0, 99, 198]);
  assert.equal(max, 1);
  h.stop();
  const count = h.inputs.length;
  await clock.advance(500);
  assert.equal(h.inputs.length, count);
});
void test('hanging fetch expires input independently; timeout aborts request', async () => {
  let count = 0,
    aborted = false;
  const h = harness(async (signal) => {
    if (++count === 1) return ok(payload());
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(Error('abort'));
      }),
    );
  });
  await h.clock.advance(351);
  assert.equal(h.inputs.at(-1)?.point, null);
  await h.clock.advance(150);
  assert.equal(aborted, true);
  h.stop();
});
void test('protocol failures are actionable and do not fall back', async () => {
  const h = harness(async () => ({ ok: false, status: 426, data: {} }));
  await h.clock.advance(1);
  assert.match(h.inputs.at(-1)!.message, /更新并重启/);
  h.stop();
});
void test('diagnostics count unique frames and display samples separately', () => {
  const summary = summarizeDepthMetrics(
    [
      {
        at_ms: 1,
        rtt_ms: 4,
        outcome: 'fresh',
        dropout: false,
        processing_ms: 2,
        display_submit_age_upper_ms: 20,
      },
      { at_ms: 34, rtt_ms: 6, outcome: 'duplicate', dropout: false },
      { at_ms: 301, rtt_ms: 0, outcome: 'inactive', dropout: true },
    ],
    1000,
  );
  assert.equal(summary.unique_fps, 1);
  assert.equal(summary.duplicates, 1);
  assert.equal(summary.dropouts, 1);
  assert.equal(summary.display_samples, 1);
  assert.equal(summary.display_submit_age_upper_p95_ms, 20);
});
