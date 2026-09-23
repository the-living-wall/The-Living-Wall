export type DepthPoint = { x: number; y: number };
export type DepthInput = {
  kind:
    | 'active'
    | 'waiting'
    | 'calibrating'
    | 'uncalibrated'
    | 'invalid'
    | 'offline';
  message: string;
  point: DepthPoint | null;
};

const inactive = (kind: DepthInput['kind'], message: string): DepthInput => ({
  kind,
  message,
  point: null,
});
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function adaptDepthState(
  value: unknown,
  mirrorX = false,
  mirrorY = false,
): DepthInput {
  const data = record(value);
  if (!data) return inactive('invalid', '深度数据格式无效。');
  if (data.protocol_version !== 1)
    return inactive(
      'invalid',
      '深度协议不匹配，请更新并重启深度服务与采集脚本。',
    );
  if (data.mode === 'simulation')
    return inactive('invalid', '当前是模拟模式，请连接并核对真实深度相机。');
  if (data.mode !== 'camera' && data.mode !== 'pipe')
    return inactive('offline', '等待真实深度相机连接。');
  const result = record(data.result);
  if (!result) return inactive('waiting', '等待深度画面。');
  if (result.state === 'calibrating')
    return inactive('calibrating', '正在校准空墙，请移开手和身体。');
  if (result.state === 'uncalibrated')
    return inactive('uncalibrated', '请先在深度测试台校准空墙。');
  const age = data.source_age_ms;
  if (typeof age !== 'number' || !Number.isFinite(age) || age < 0 || age > 300)
    return inactive('invalid', '深度帧已过期，互动已暂停。');
  if (
    result.background_model !== 'pixel-wall-v2' ||
    result.diagnostic_valid !== true
  )
    return inactive('invalid', '深度数据暂不可用于互动。');
  if (!depthFrameMetadata(data))
    return inactive('invalid', '深度帧编号或计时无效，请更新并重启深度服务。');
  const regions = result.near_regions;
  if (!Array.isArray(regions) || regions.length === 0)
    return inactive('waiting', '空墙 / 等待物体靠近墙面。');
  const candidate = regions
    .map(record)
    .filter(
      (item): item is Record<string, unknown> =>
        !!item &&
        typeof item.area_px === 'number' &&
        Number.isFinite(item.area_px) &&
        item.area_px > 0,
    )
    .sort((a, b) => (b.area_px as number) - (a.area_px as number))[0];
  if (!candidate) return inactive('invalid', '近墙区域数据无效。');
  const center = candidate.center;
  if (
    !Array.isArray(center) ||
    center.length !== 2 ||
    center.some(
      (n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1,
    )
  )
    return inactive('invalid', '近墙区域坐标无效。');
  const [x, y] = center as [number, number];
  return {
    kind: 'active',
    message: '检测到近墙区域，小莹跟随中（尚未识别手或确认触碰）。',
    point: { x: mirrorX ? 1 - x : x, y: mirrorY ? 1 - y : y },
  };
}

export type DepthFrameMetadata = {
  streamId: string;
  frameId: number;
  sourceAgeMs: number;
  processingMs: number;
};

export function depthFrameMetadata(value: unknown): DepthFrameMetadata | null {
  const data = record(value);
  if (
    !data ||
    data.protocol_version !== 1 ||
    typeof data.stream_id !== 'string' ||
    !data.stream_id ||
    data.stream_id.length > 128 ||
    !Number.isSafeInteger(data.frame_id) ||
    (data.frame_id as number) < 1 ||
    typeof data.source_age_ms !== 'number' ||
    !Number.isFinite(data.source_age_ms) ||
    data.source_age_ms < 0 ||
    typeof data.processing_ms !== 'number' ||
    !Number.isFinite(data.processing_ms) ||
    data.processing_ms < 0
  )
    return null;
  return {
    streamId: data.stream_id,
    frameId: data.frame_id as number,
    sourceAgeMs: data.source_age_ms,
    processingMs: data.processing_ms,
  };
}
