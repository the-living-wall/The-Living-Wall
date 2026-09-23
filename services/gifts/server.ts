import { createServer, type IncomingMessage } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { GiftError, GiftStore } from './store.ts';

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
};
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json')
    throw new GiftError(415, '请使用 JSON 请求。');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new GiftError(413, '内容太长。');
    chunks.push(chunk);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new GiftError(400, '请求内容不完整。');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GiftError(400, '请求格式不正确。');
  return value as Record<string, unknown>;
}
export function giftServer(
  store: GiftStore,
  options: { origin: string; staticDir: string; limit?: number },
) {
  const counters = new Map<string, { count: number; until: number }>();
  const cleanup = setInterval(() => {
    store.purge();
    for (const [key, v] of counters)
      if (v.until < Date.now()) counters.delete(key);
  }, 60_000);
  cleanup.unref();
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const json = (status: number, value: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url || '/', options.origin);
      if (url.pathname.startsWith('/api/')) {
        const ip = req.socket.remoteAddress || 'unknown',
          now = Date.now();
        if (counters.size >= 5000 && !counters.has(ip))
          throw new GiftError(429, '请求繁忙，请稍后再试。');
        const count = counters.get(ip);
        const current =
          count && count.until > now
            ? count
            : { count: 0, until: now + 60_000 };
        counters.set(ip, current);
        current.count++;
        if (current.count > (options.limit ?? 120)) {
          res.setHeader('Retry-After', '60');
          throw new GiftError(429, '操作较频繁，请稍后再试。');
        }
        const origin = req.headers.origin;
        if (
          (origin && origin !== options.origin) ||
          (req.method !== 'GET' && origin !== options.origin)
        )
          throw new GiftError(403, '只允许从测试站内进行操作。');
        if (url.pathname === '/api/health' && req.method === 'GET')
          return json(200, { ok: true });
        if (url.pathname === '/api/gifts' && req.method === 'POST')
          return json(201, store.create(await body(req)));
        const match =
          /^\/api\/gifts\/([a-f0-9]{32})(?:\/(claim|actions))?$/.exec(
            url.pathname,
          );
        if (!match) throw new GiftError(404, '没有找到这个入口。');
        const [, id, operation] = match;
        const credential = req.headers.authorization?.replace(/^Bearer /, '');
        if (operation === 'claim' && req.method === 'POST')
          return json(200, store.claim(id, await body(req)));
        if (operation === 'actions' && req.method === 'POST')
          return json(200, store.mutate(id, credential, await body(req)));
        if (!operation && req.method === 'GET')
          return json(200, store.read(id, credential));
        if (!operation && req.method === 'DELETE') {
          store.remove(id, credential);
          return json(200, { deleted: true });
        }
        throw new GiftError(405, '不支持这种请求。');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        throw new GiftError(405, '不支持这种请求。');
      const path = decodeURIComponent(
        url.pathname === '/' ? '/index.html' : url.pathname,
      );
      const root = await realpath(options.staticDir);
      const file = await realpath(resolve(root, '.' + path)).catch(() => {
        throw new GiftError(404, '文件不存在。');
      });
      if (!file.startsWith(root + sep) || !mime[extname(file)])
        throw new GiftError(404, '文件不存在。');
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      json(error instanceof GiftError ? error.status : 500, {
        error:
          error instanceof GiftError
            ? error.message
            : '服务暂时不可用，请稍后重试。',
      });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.on('close', () => clearInterval(cleanup));
  return server;
}
