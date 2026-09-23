import { GiftError } from './common.ts';
import { CloudGiftStore } from './cloud-store.ts';

export type HttpEvent = {
  httpMethod?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
};
const securityHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
export function createHandler(store: CloudGiftStore, origin: string) {
  if (
    !origin ||
    new URL(origin).origin !== origin ||
    !origin.startsWith('https://')
  )
    throw new Error('PUBLIC_ORIGIN must be an explicit HTTPS origin');
  return async (event: HttpEvent) => {
    const respond = (statusCode: number, value: unknown) => ({
      statusCode,
      headers: securityHeaders,
      isBase64Encoded: false,
      body: JSON.stringify(value),
    });
    try {
      if (!event.httpMethod || !event.path)
        throw new GiftError(403, '仅允许通过测试站访问。');
      const headers = Object.fromEntries(
        Object.entries(event.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );
      if (
        (headers.origin && headers.origin !== origin) ||
        (event.httpMethod !== 'GET' && headers.origin !== origin)
      )
        throw new GiftError(403, '只允许从测试站内进行操作。');
      await store.allowRequest();
      const method = event.httpMethod;
      const path = event.path;
      if (path === '/api/health' && method === 'GET')
        return respond(200, { ok: true });
      const readBody = () => {
        if (headers['content-type']?.split(';')[0] !== 'application/json')
          throw new GiftError(415, '请使用 JSON 请求。');
        if (typeof event.body !== 'string' || event.body.length > 12000)
          throw new GiftError(413, '内容太长或不完整。');
        const bytes = Buffer.from(
          event.body,
          event.isBase64Encoded ? 'base64' : 'utf8',
        );
        if (bytes.length > 8192) throw new GiftError(413, '内容太长。');
        let value: unknown;
        try {
          value = JSON.parse(bytes.toString('utf8'));
        } catch {
          throw new GiftError(400, '请求内容不完整。');
        }
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new GiftError(400, '请求格式不正确。');
        return value as Record<string, unknown>;
      };
      if (path === '/api/gifts' && method === 'POST')
        return respond(201, await store.create(readBody()));
      const match = /^\/api\/gifts\/([a-f0-9]{32})(?:\/(claim|actions))?$/.exec(
        path,
      );
      if (!match) throw new GiftError(404, '没有找到这个入口。');
      const [, id, operation] = match,
        credential = headers.authorization?.replace(/^Bearer /, '');
      if (operation === 'claim' && method === 'POST')
        return respond(200, await store.claim(id, readBody()));
      if (operation === 'actions' && method === 'POST')
        return respond(200, await store.mutate(id, credential, readBody()));
      if (!operation && method === 'GET')
        return respond(200, await store.read(id, credential));
      if (!operation && method === 'DELETE') {
        await store.remove(id, credential);
        return respond(200, { deleted: true });
      }
      throw new GiftError(405, '不支持这种请求。');
    } catch (e) {
      return respond(e instanceof GiftError ? e.status : 500, {
        error:
          e instanceof GiftError ? e.message : '服务暂时不可用，请稍后重试。',
      });
    }
  };
}
