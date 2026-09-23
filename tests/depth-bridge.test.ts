import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import {
  handleDepthBridge,
  compactDepthPayload,
} from '../lib/depth-dev-bridge.ts';

const port = 3017;
const original = async () =>
  Response.json({
    protocol_version: 1,
    mode: 'camera',
    image: 'raw-frame',
    source_age_ms: 12,
    result: {
      near_regions: [{ center: [0.2, 0.3], area_px: 40, contour: [[1, 2]] }],
    },
  });

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
  assert.deepEqual(result.body, {
    protocol_version: 1,
    mode: 'camera',
    source_age_ms: 12,
    result: { near_regions: [{ center: [0.2, 0.3], area_px: 40 }] },
  });
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

void test('old endpoint and protocol fail explicitly, without legacy retry', async () => {
  assert.equal(
    (
      await call(
        undefined,
        {},
        'GET',
        async () => new Response('', { status: 404 }),
      )
    ).code,
    426,
  );
  assert.equal(
    (
      await call(undefined, {}, 'GET', async () =>
        Response.json({ mode: 'camera', age_ms: 1 }),
      )
    ).code,
    426,
  );
});

void test('only the lightweight endpoint is requested and nested images cannot pass the allowlist', async () => {
  const urls: string[] = [];
  await call(undefined, {}, 'GET', async (url) => {
    urls.push(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    return original();
  });
  assert.deepEqual(urls, ['http://127.0.0.1:8769/api/input']);
  const data = compactDepthPayload({
    protocol_version: 1,
    message: { image: 'hidden' },
    device: { model: { image: 'hidden' } },
    result: {
      near_regions: [{ center: [{ image: 'hidden' }, 0], area_px: 40 }],
    },
  });
  assert.ok(!JSON.stringify(data).includes('hidden'));
});
