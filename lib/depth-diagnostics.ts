import type { PollMetric } from './depth-poller.ts';

const p95 = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null;
};
export function summarizeDepthMetrics(
  samples: PollMetric[],
  durationMs: number,
) {
  const fresh = samples.filter((s) => s.outcome === 'fresh');
  return {
    duration_ms: durationMs,
    unique_frames: fresh.length,
    unique_fps: durationMs > 0 ? (fresh.length * 1000) / durationMs : 0,
    duplicates: samples.filter((s) => s.outcome === 'duplicate').length,
    out_of_order: samples.filter((s) => s.outcome === 'out-of-order').length,
    errors: samples.filter((s) => s.outcome === 'error').length,
    dropouts: samples.filter((s) => s.dropout).length,
    rtt_p95_ms: p95(samples.map((s) => s.rtt_ms)),
    processing_p95_ms: p95(fresh.flatMap((s) => s.processing_ms ?? [])),
    update_interval_p95_ms: p95(
      fresh.flatMap((s) => s.update_interval_ms ?? []),
    ),
    display_submit_age_upper_p95_ms: p95(
      fresh.flatMap((s) => s.display_submit_age_upper_ms ?? []),
    ),
    display_samples: fresh.filter(
      (s) => s.display_submit_age_upper_ms !== undefined,
    ).length,
  };
}
