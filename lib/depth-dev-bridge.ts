import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export const DEPTH_BRIDGE_PATH = '/__depth-lab/state';
const DEPTH_UPSTREAM = 'http://127.0.0.1:8769/api/state';

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
      reply(res, 502, { error: '本地深度服务响应失败。' });
      return;
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      reply(res, 502, { error: '本地深度服务返回无效数据。' });
      return;
    }
    const { image: _image, ...state } = payload as Record<string, unknown>;
    void _image;
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
