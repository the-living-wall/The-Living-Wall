import { GiftError } from './common.ts';
import type { CloudGiftStore } from './cloud-store.ts';

// A separate entry, never an HTTP event with a client-supplied trusted Origin.
// callerUid must come from this invocation's platform context, not event/env.
export function createSdkHandler(store: CloudGiftStore) {
  return async (event: unknown, callerUid: unknown) => {
    try {
      if (
        typeof callerUid !== 'string' ||
        !callerUid.trim() ||
        callerUid.length > 256
      )
        throw new GiftError(401, '连接授权暂不可用，请稍后重试。');
      if (!event || typeof event !== 'object' || Array.isArray(event))
        throw new GiftError(400, '请求格式不正确。');
      const envelope = event as Record<string, unknown>;
      if (envelope.protocol !== 'gifts/1')
        throw new GiftError(400, '请刷新页面后重试。');
      const request = envelope.request;
      if (!request || typeof request !== 'object' || Array.isArray(request))
        throw new GiftError(400, '请求格式不正确。');
      if (Buffer.byteLength(JSON.stringify(request), 'utf8') > 8192)
        throw new GiftError(413, '内容太长。');
      const { method, path, body, token } = request as Record<string, unknown>;
      if (typeof path !== 'string')
        throw new GiftError(404, '没有找到这个入口。');
      if (method !== 'GET' && method !== 'POST' && method !== 'DELETE')
        throw new GiftError(405, '不支持这种请求。');
      await store.allowRequest();
      const readBody = () => {
        if (!body || typeof body !== 'object' || Array.isArray(body))
          throw new GiftError(400, '请求格式不正确。');
        return body as Record<string, unknown>;
      };
      if (path === '' && method === 'POST')
        return { status: 201, value: await store.create(readBody()) };
      const match = /^\/([a-f0-9]{32})(?:\/(claim|actions))?$/.exec(path);
      if (!match) throw new GiftError(404, '没有找到这个入口。');
      const [, id, operation] = match;
      if (operation === 'claim' && method === 'POST')
        return { status: 200, value: await store.claim(id, readBody()) };
      if (operation === 'actions' && method === 'POST')
        return {
          status: 200,
          value: await store.mutate(id, token, readBody()),
        };
      if (!operation && method === 'GET')
        return { status: 200, value: await store.read(id, token) };
      if (!operation && method === 'DELETE') {
        await store.remove(id, token);
        return { status: 200, value: { deleted: true } };
      }
      throw new GiftError(405, '不支持这种请求。');
    } catch (e) {
      return {
        status: e instanceof GiftError ? e.status : 500,
        value: {
          error:
            e instanceof GiftError ? e.message : '服务暂时不可用，请稍后重试。',
        },
      };
    }
  };
}
