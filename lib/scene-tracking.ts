export type SceneBox = {
  label: string;
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TrackedSceneBox = SceneBox & { lastSeenAt: number };

const centerDistance = (a: SceneBox, b: SceneBox) => Math.hypot(
  (a.x + a.width / 2) - (b.x + b.width / 2),
  (a.y + a.height / 2) - (b.y + b.height / 2),
);

const intersectionOverUnion = (a: SceneBox, b: SceneBox) => {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
};

const blend = (oldValue: number, nextValue: number, alpha: number) => oldValue + (nextValue - oldValue) * alpha;

/**
 * Keeps detections visually stable between model updates. A short hold window
 * prevents a single blurred/occluded frame from making Xiaoying disappear;
 * this is smoothing only, not world tracking or a 3D anchor.
 */
export function stabilizeSceneObjects(
  previous: TrackedSceneBox[],
  detections: SceneBox[],
  now: number,
  options: { alpha?: number; holdMs?: number } = {},
): TrackedSceneBox[] {
  const alpha = options.alpha ?? 0.55;
  const holdMs = options.holdMs ?? 1200;
  const used = new Set<number>();
  const result: TrackedSceneBox[] = [];

  for (const old of previous) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    detections.forEach((candidate, index) => {
      if (used.has(index) || candidate.label !== old.label) return;
      const distance = centerDistance(old, candidate);
      if ((intersectionOverUnion(old, candidate) >= 0.08 || distance <= 0.2) && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      const next = detections[bestIndex];
      used.add(bestIndex);
      result.push({
        ...next,
        x: blend(old.x, next.x, alpha),
        y: blend(old.y, next.y, alpha),
        width: blend(old.width, next.width, alpha),
        height: blend(old.height, next.height, alpha),
        score: Math.max(old.score * 0.85, next.score),
        lastSeenAt: now,
      });
    } else if (now - old.lastSeenAt <= holdMs) {
      result.push({ ...old, score: old.score * 0.92 });
    }
  }

  detections.forEach((detection, index) => {
    if (!used.has(index)) result.push({ ...detection, lastSeenAt: now });
  });
  return result;
}
