import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export const DEPTH_BRIDGE_PATH = '/__depth-lab/state';
const DEPTH_UPSTREAM = 'http://127.0.0.1:8769/api/input';

function reply(res: ServerResponse, code: number, body: object) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

export async function handleDepthBridge(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
  fetchState: typeof fetch = fetch,
  upstream = DEPTH_UPSTREAM,
) {
  if (!req.url?.startsWith('/__depth-lab')) return next();
  if (req.url !== DEPTH_BRIDGE_PATH) {
    reply(res, 404, { error: '未知深度测试路径。' });
    return;
  }
  if (req.method !== 'GET') {
    reply(res, 405, { error: '深度桥接只允许读取。' });
    return;
  }
  const host = req.headers.host?.toLowerCase() ?? '';
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (
    !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
    (origin && origin !== `http://${host}`) ||
    (site && !['same-origin', 'none'].includes(String(site)))
  ) {
    reply(res, 403, { error: '仅允许本机同源页面读取深度状态。' });
    return;
  }
  try {
    const response = await fetchState(upstream, {
      signal: AbortSignal.timeout(450),
      cache: 'no-store',
    });
    if (!response.ok) {
      reply(res, response.status === 404 ? 426 : 502, {
        error:
          response.status === 404
            ? '请更新并重启深度服务与采集脚本（需要 /api/input）。'
            : '本地深度服务响应失败。',
      });
      return;
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      reply(res, 502, { error: '本地深度服务返回无效数据。' });
      return;
    }
    const state = compactDepthPayload(payload);
    if (!state) {
      reply(res, 426, {
        error: '深度协议不匹配，请更新并重启深度服务与采集脚本。',
      });
      return;
    }
    reply(res, 200, state);
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError';
    reply(res, timeout ? 504 : 502, {
      error: timeout ? '本地深度服务响应超时。' : '无法连接本地深度服务。',
    });
  }
}

export function depthDevBridge(): Plugin {
  return {
    name: 'depth-dev-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleDepthBridge(req, res, next);
      });
    },
  };
}

/** Allowlist instead of merely removing image: no preview/contour crosses this bridge. */
export function compactDepthPayload(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.protocol_version !== 1) return null;
  const result =
    data.result &&
    typeof data.result === 'object' &&
    !Array.isArray(data.result)
      ? (data.result as Record<string, unknown>)
      : {};
  const pick = (obj: Record<string, unknown>, keys: string[]) =>
    Object.fromEntries(
      keys
        .filter(
          (key) =>
            key in obj &&
            (obj[key] === null ||
              typeof obj[key] === 'string' ||
              typeof obj[key] === 'boolean' ||
              (typeof obj[key] === 'number' && Number.isFinite(obj[key]))),
        )
        .map((key) => [key, obj[key]]),
    );
  const regions = Array.isArray(result.near_regions)
    ? result.near_regions.slice(0, 12)
    : [];
  const state = pick(data, [
    'protocol_version',
    'mode',
    'message',
    'stream_id',
    'frame_id',
    'source_age_ms',
    'processing_ms',
    'received_mono_ms',
  ]);
  state.result = {
    ...pick(result, ['state', 'background_model', 'diagnostic_valid']),
    near_regions: regions
      .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
      .map((r) => ({
        ...pick(r, ['area_px']),
        ...(Array.isArray(r.center) &&
        r.center.length === 2 &&
        r.center.every(
          (v: unknown) => typeof v === 'number' && Number.isFinite(v),
        )
          ? { center: r.center }
          : {}),
      })),
  };
  for (const [field, keys] of [
    [
      'diagnostics',
      [
        'received_frames',
        'processed_frames',
        'capture_dropped',
        'processing_dropped',
        'preview_frames',
        'preview_dropped',
        'capture_fps',
      ],
    ],
    [
      'device',
      [
        'model',
        'width',
        'height',
        'configured_fps',
        'connection',
        'sdk_frame_index',
        'sdk_timestamp_us',
      ],
    ],
  ] as const) {
    const item = data[field];
    if (item && typeof item === 'object' && !Array.isArray(item))
      state[field] = pick(item as Record<string, unknown>, [...keys]);
  }
  return state;
}
