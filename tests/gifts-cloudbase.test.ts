import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudGiftStore,
  GIFTS,
  type CloudDatabase,
  type Transaction,
} from '../services/gifts/cloud-store.ts';
import { createHandler } from '../services/gifts/cloud-handler.ts';
import { secret, TTL } from '../services/gifts/common.ts';

// SDK-faithful return shapes: document inside a transaction, array outside it.
// This checks our storage contract, not the availability/correctness of Tencent Cloud.
function database() {
  let rows = new Map<string, object>(),
    revision = 0;
  const collection =
    (data: Map<string, object>, transactional: boolean) => (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const value = data.get(name + '/' + id);
          const copy = value ? { ...structuredClone(value), _id: id } : null;
          return { data: transactional ? copy : copy ? [copy] : [] };
        },
        set: async (value: object) => {
          assert.ok(!('_id' in value), 'SDK manages _id');
          data.set(name + '/' + id, structuredClone(value));
        },
        remove: async () => {
          data.delete(name + '/' + id);
        },
      }),
      where: (filter: object) => ({
        limit: (n: number) => ({
          get: async () => ({
            data: [...data.entries()]
              .filter(
                ([key, value]) =>
                  key.startsWith(name + '/') &&
                  (value as { expires: number }).expires <=
                    (filter as { expires: number }).expires,
              )
              .slice(0, n)
              .map(([, value]) => structuredClone(value)),
          }),
        }),
      }),
    });
  const db: CloudDatabase = {
    command: { lte: (value) => value },
    collection: (name) => collection(rows, false)(name),
    runTransaction: async <T>(fn: (tx: Transaction) => Promise<T>) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const version = revision,
          pending = structuredClone(rows);
        const result = await fn({ collection: collection(pending, true) });
        if (version !== revision) continue;
        rows = pending;
        revision++;
        return result;
      }
      throw { code: 'DATABASE_TRANSACTION_CONFLICT' };
    },
  };
  return db;
}
const input = () => ({
  owner: secret(),
  invite: secret(),
  text: '一起歇一会儿。',
  sender: '阿禾',
  friend: '小满',
});

void test('CloudBase: creation/claim retries and concurrent claims preserve separate credentials', async () => {
  const db = database(),
    store = new CloudGiftStore(db),
    data = input();
  const a = await store.create(data);
  assert.equal((await store.create(data)).id, a.id);
  const one = secret(),
    two = secret();
  const results = await Promise.allSettled([
    store.claim(a.id, { invite: data.invite, friend: one }),
    store.claim(a.id, { invite: data.invite, friend: two }),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  const winner = results[0].status === 'fulfilled' ? one : two;
  assert.equal(
    (await store.claim(a.id, { invite: data.invite, friend: winner })).actor,
    'friend',
  );
  await assert.rejects(store.read(a.id, data.invite), { status: 403 });
  await assert.rejects(store.remove(a.id, winner), { status: 403 });
  const reopened = new CloudGiftStore(db);
  assert.equal(
    (await reopened.read(a.id, winner)).state.messages[0].text,
    data.text,
  );
});

void test('CloudBase: two writers, idempotency and exact-version joint confirmation', async () => {
  const store = new CloudGiftStore(database()),
    data = input(),
    a = await store.create(data),
    friend = secret();
  await store.claim(a.id, { invite: data.invite, friend });
  const first = {
    revision: 0,
    op: secret(),
    action: { type: 'message', text: '你好', actor: 'friend' },
  };
  const writes = await Promise.allSettled([
    store.mutate(a.id, data.owner, first),
    store.mutate(a.id, friend, {
      ...first,
      op: secret(),
      action: { type: 'message', text: '我在' },
    }),
  ]);
  assert.equal(writes.filter((x) => x.status === 'fulfilled').length, 1);
  let current = await store.read(a.id, data.owner);
  assert.equal(current.state.messages.length, 2);
  if (writes[0].status === 'fulfilled') {
    assert.equal(current.state.messages[1].actor, 'sender');
    await store.mutate(a.id, data.owner, first);
    await assert.rejects(
      store.mutate(a.id, data.owner, {
        ...first,
        action: { type: 'message', text: '替换' },
      }),
      { status: 409 },
    );
  }
  current = await store.mutate(a.id, data.owner, {
    revision: current.revision,
    op: secret(),
    action: {
      type: 'propose',
      expected: null,
      sourceIds: [1],
      reason: '一起留下',
      choice: { kind: 'memory' },
    },
  });
  const version = current.state.pending!.version;
  await assert.rejects(
    store.mutate(a.id, data.owner, {
      revision: current.revision,
      op: secret(),
      action: { type: 'accept', version },
    }),
    { status: 409 },
  );
  current = await store.mutate(a.id, friend, {
    revision: current.revision,
    op: secret(),
    action: { type: 'accept', version },
  });
  assert.equal(current.state.memories.length, 1);
  assert.equal(current.state.active, 'original/v1');
  const snapshot = current.state.memories[0].sources[0].name;
  current = await store.mutate(a.id, data.owner, {
    revision: current.revision,
    op: secret(),
    action: { type: 'rename', name: '新称呼' },
  });
  assert.equal(current.state.memories[0].sources[0].name, snapshot);
  await store.remove(a.id, data.owner);
  await assert.rejects(store.read(a.id, friend), { status: 404 });
});

void test('CloudBase: expiry and cleanup remove dialogue, credentials and operation summaries', async () => {
  let now = 100000;
  const db = database(),
    store = new CloudGiftStore(db, () => now),
    data = input(),
    a = await store.create(data);
  now += 1000;
  const b = await store.mutate(a.id, data.owner, {
    revision: 0,
    op: secret(),
    action: { type: 'message', text: '不延长有效期' },
  });
  assert.equal(b.expires, a.expires);
  now = a.expires;
  await assert.rejects(store.read(a.id, data.owner), { status: 404 });
  assert.equal(await store.purge(), 1);
  assert.deepEqual((await db.collection(GIFTS).doc(a.id).get()).data, []);
  assert.equal(TTL, 7 * 24 * 60 * 60 * 1000);
});

void test('CloudBase: distributed rate limit survives creating another function instance', async () => {
  const db = database();
  const store = new CloudGiftStore(db);
  for (let i = 0; i < 120; i++) await store.allowRequest();
  await assert.rejects(new CloudGiftStore(db).allowRequest(), { status: 429 });
});

void test('CloudBase HTTP: origin, base64 body, auth, no secrets and no SDK invocation bypass', async () => {
  const data = input(),
    origin = 'https://test.example',
    handler = createHandler(new CloudGiftStore(database()), origin);
  const event = {
    httpMethod: 'POST',
    path: '/api/gifts',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
  assert.equal(
    (await handler({ ...event, headers: { Origin: 'https://other.example' } }))
      .statusCode,
    403,
  );
  assert.equal((await handler({ body: event.body })).statusCode, 403);
  const result = await handler({
    ...event,
    body: Buffer.from(event.body).toString('base64'),
    isBase64Encoded: true,
  });
  assert.equal(result.statusCode, 201);
  assert.ok(!result.body.includes(data.owner));
  const id = JSON.parse(result.body).id;
  assert.equal(
    (await handler({ httpMethod: 'GET', path: '/api/gifts/' + id })).statusCode,
    400,
  );
  assert.equal(
    (
      await handler({
        ...event,
        path: '/api/gifts/' + id + '/claim',
        httpMethod: 'GET',
      })
    ).statusCode,
    405,
  );
  assert.equal(
    (
      await handler({
        ...event,
        body: JSON.stringify({ text: 'x'.repeat(9000) }),
      })
    ).statusCode,
    413,
  );
  assert.equal(result.headers['Cache-Control'], 'no-store');
});
