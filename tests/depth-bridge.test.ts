import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { handleDepthBridge } from '../lib/depth-dev-bridge.ts';

const port = 3017;
const original = async () =>
  Response.json({ mode: 'camera', image: 'raw-frame', age_ms: 12 });

async function call(
  path = '/__depth-lab/state',
  headers: Record<string, string> = {},
  method = 'GET',
  upstream: typeof fetch = original,
) {
  let code = 0;
  let body: Record<string, unknown> = {};
  let passed = false;
  const req = {
    url: path,
    method,
    headers: { host: `127.0.0.1:${port}`, ...headers },
  } as unknown as IncomingMessage;
  const res = {
    writeHead(status: number) {
      code = status;
      return this;
    },
    end(value: string) {
      body = JSON.parse(value);
      return this;
    },
  } as unknown as ServerResponse;
  await handleDepthBridge(
    req,
    res,
    () => {
      passed = true;
    },
    upstream,
  );
  return { code, body, passed };
}

void test('same-origin reads state without image', async () => {
  const result = await call('/__depth-lab/state', {
    origin: `http://127.0.0.1:${port}`,
  });
  assert.equal(result.code, 200);
  assert.deepEqual(result.body, { mode: 'camera', age_ms: 12 });
});

void test('rejects remote host, cross-origin, unknown path and writes', async () => {
  assert.equal(
    (await call('/__depth-lab/state', { host: 'example.com' })).code,
    403,
  );
  assert.equal(
    (await call('/__depth-lab/state', { origin: 'https://example.com' })).code,
    403,
  );
  assert.equal(
    (await call('/__depth-lab/state', { 'sec-fetch-site': 'cross-site' })).code,
    403,
  );
  assert.equal((await call('/__depth-lab/other')).code, 404);
  assert.equal((await call('/__depth-lab/state', {}, 'POST')).code, 405);
  assert.equal((await call('/outside')).passed, true);
});

void test('reports upstream failure and timeout', async () => {
  assert.equal(
    (
      await call(
        undefined,
        {},
        'GET',
        async () => new Response('', { status: 503 }),
      )
    ).code,
    502,
  );
  assert.equal(
    (
      await call(undefined, {}, 'GET', async () => {
        throw new DOMException('timed out', 'TimeoutError');
      })
    ).code,
    504,
  );
  assert.equal(
    (
      await call(undefined, {}, 'GET', async () => {
        throw Error('offline');
      })
    ).code,
    502,
  );
});
