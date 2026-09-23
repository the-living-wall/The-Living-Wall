import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  ApiError,
  httpTransport,
  sdkTransport,
  type GiftRequest,
  type SdkClient,
} from '../prototypes/live-gift/gift-transport.ts';

const view = { id: 'a'.repeat(32), actor: 'sender', revision: 0, state: {} };
const ok = { result: { status: 200, value: view } };
const request: GiftRequest = {
  path: '',
  method: 'POST',
  body: { owner: 'synthetic-owner' },
};
void test('SDK transport: lazy load, shared login, fixed function payload, refresh rechecks session', async () => {
  let loads = 0,
    sessions = 0,
    calls = 0;
  const transport = sdkTransport(async () => {
    loads++;
    return {
      ensureSession: async () => {
        sessions++;
        await new Promise((r) => setTimeout(r, 3));
      },
      invoke: async (data) => {
        calls++;
        assert.deepEqual(data, { protocol: 'gifts/1', request });
        return ok;
      },
    };
  });
  assert.equal(loads, 0);
  await Promise.all([transport(request), transport(request)]);
  assert.equal(loads, 1);
  assert.equal(sessions, 1);
  assert.equal(calls, 2);
  await transport(request);
  assert.equal(sessions, 2);
});
void test('SDK transport: failed import/login retries without fallback or invoking while unauthenticated', async () => {
  let loads = 0,
    sessions = 0,
    calls = 0;
  const transport = sdkTransport(async () => {
    if (++loads === 1) throw new Error('secret internal path');
    return {
      ensureSession: async () => {
        if (++sessions === 1)
          throw { code: 'AUTH_DISABLED', message: 'private' };
      },
      invoke: async () => {
        calls++;
        return ok;
      },
    };
  });
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      transport(request),
      (e: ApiError) =>
        e.status === 503 && e.retryable && !e.message.includes('private'),
    );
  assert.equal(calls, 0);
  assert.equal((await transport(request)).id, view.id);
  assert.equal(calls, 1);
});
void test('SDK transport: platform errors are sanitized, business conflict is distinct, malformed responses reject', async () => {
  for (const [response, status] of [
    [{ code: 'TOO_MANY_REQUESTS', message: 'secret' }, 429],
    [{ code: 'PERMISSION_DENIED', message: 'secret' }, 503],
    [{ result: { status: 401, value: { error: 'private' } } }, 503],
    [{ result: { status: 409, value: { error: '版本已变化' } } }, 409],
    [{ result: '<html>secret</html>' }, 502],
    [{ result: { status: 200, value: { something: true } } }, 502],
  ] as const) {
    const transport = sdkTransport(async () => ({
      ensureSession: async () => {},
      invoke: async () => response,
    }));
    await assert.rejects(
      transport(request),
      (e: ApiError) =>
        e.status === status &&
        !e.message.includes('secret') &&
        !e.message.includes('private') &&
        e.retryable === (status !== 409),
    );
  }
});
void test('SDK transport: timeout preserves identical request for idempotent retry, late response is ignored', async () => {
  const seen: unknown[] = [];
  let resolveFirst: ((value: unknown) => void) | undefined;
  const client: SdkClient = {
    ensureSession: async () => {},
    invoke: async (data) => {
      seen.push(structuredClone(data));
      if (seen.length === 1)
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      return ok;
    },
  };
  const transport = sdkTransport(async () => client, 10);
  await assert.rejects(
    transport(request),
    (e: ApiError) => e.status === 504 && e.retryable,
  );
  assert.equal((await transport(request)).id, view.id);
  assert.deepEqual(seen[0], seen[1]);
  resolveFirst!(ok);
});
void test('HTTP transport: non-JSON 429 and 403 are recoverable, errors cannot leak platform body', async () => {
  for (const status of [429, 403, 502]) {
    const transport = httpTransport(
      async () => new Response('<html>private token</html>', { status }),
    );
    await assert.rejects(
      transport(request),
      (e: ApiError) =>
        e.retryable &&
        !e.message.includes('private') &&
        e.status === (status === 429 ? 429 : 503),
    );
  }
  const transport = httpTransport(async (_url, init) => {
    assert.equal(init?.cache, 'no-store');
    assert.equal(
      (init?.headers as Record<string, string> | undefined)?.Authorization,
      'Bearer sample',
    );
    return Response.json(view);
  });
  assert.equal((await transport({ ...request, token: 'sample' })).id, view.id);
});
void test('SDK runtime entry: disabled by default, per-invocation context only, no residual identity', async () => {
  const code = await readFile(
    new URL('../services/gifts/cloudbase/index.cjs', import.meta.url),
    'utf8',
  );
  const received: unknown[] = [];
  const env: Record<string, string> = {
    GIFT_ENV_ID: 'test',
    TCB_UUID: 'stale-admin',
  };
  const exports: {
    sdk?: (event: unknown, context?: unknown) => Promise<unknown>;
  } = {};
  runInNewContext(code, {
    exports,
    process: { env },
    require: (name: string) =>
      name === '@cloudbase/node-sdk'
        ? {
            init: () => ({ database: () => ({}) }),
            parseContext: (context: unknown) => {
              if (!context) throw Error();
              return context;
            },
          }
        : {
            CloudGiftStore: class {},
            createSdkHandler: () => async (_event: unknown, uid: unknown) => {
              received.push(uid);
              return {};
            },
          },
  });
  const forged = {
    TCB_UUID: 'forged-admin',
    userInfo: { uid: 'forged-admin' },
  };
  assert.equal(
    ((await exports.sdk!(forged)) as { status: number }).status,
    503,
  );
  assert.equal(received.length, 0);
  env.GIFT_SDK_ENABLED = 'true';
  await exports.sdk!(forged, { environment: { TCB_UUID: 'current-visitor' } });
  await exports.sdk!(forged, {});
  await exports.sdk!(forged);
  assert.deepEqual(received, ['current-visitor', undefined, undefined]);
});

void test('SDK transport: timed-out login does not later submit; a new attempt can recover', async () => {
  let finish: (() => void) | undefined;
  let sessions = 0,
    calls = 0;
  const client: SdkClient = {
    ensureSession: async () => {
      if (++sessions === 1)
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
    },
    invoke: async () => {
      calls++;
      return ok;
    },
  };
  const transport = sdkTransport(async () => client, 10);
  await assert.rejects(transport(request), { status: 504 });
  assert.equal(calls, 0);
  assert.equal((await transport(request)).id, view.id);
  finish!();
  await new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal(calls, 1);
});

void test('SDK runtime diagnostics exclude messages, credentials, context and unexpected errors', async () => {
  const code = await readFile(
    new URL('../services/gifts/cloudbase/index.cjs', import.meta.url),
    'utf8',
  );
  const logs: string[] = [];
  const exports: {
    sdk?: (event: unknown, context?: unknown) => Promise<unknown>;
  } = {};
  let fail = false;
  runInNewContext(code, {
    exports,
    console: { info: (line: string) => logs.push(line) },
    process: { env: { GIFT_ENV_ID: 'test', GIFT_SDK_ENABLED: 'true' } },
    require: (name: string) =>
      name === '@cloudbase/node-sdk'
        ? {
            init: () => ({ database: () => ({}) }),
            parseContext: () => ({ environment: { TCB_UUID: 'private-user' } }),
          }
        : {
            CloudGiftStore: class {},
            createSdkHandler: () => async () => {
              if (fail) throw new Error('private-error');
              return {
                status: 200,
                value: { text: 'private-message', token: 'private-token' },
              };
            },
          },
  });
  await exports.sdk!({ text: 'private-input' }, { secret: 'private-context' });
  fail = true;
  const failure = await exports.sdk!({});
  assert.equal((failure as { status: number }).status, 500);
  assert.ok(!JSON.stringify(failure).includes('private'));
  assert.deepEqual(
    logs.map((line) => JSON.parse(line).status),
    [200, 500],
  );
  for (const line of logs) {
    const item = JSON.parse(line);
    assert.deepEqual(Object.keys(item).sort(), [
      'durationMs',
      'event',
      'status',
    ]);
    assert.ok(item.durationMs >= 0);
    assert.ok(!line.includes('private'));
  }
});
