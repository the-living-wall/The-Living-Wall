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

void test('SDK boundary: no event-supplied identity, narrow routes, size limit and secret redaction', async () => {
  const { createSdkHandler } = await import('../services/gifts/sdk-handler.ts');
  const handler = createSdkHandler(new CloudGiftStore(database()));
  const data = input();
  const event = {
    protocol: 'gifts/1',
    request: { path: '', method: 'POST', body: data },
  };
  for (const uid of [undefined, '', {}, ' '.repeat(2)]) {
    assert.equal(
      (await handler({ ...event, uid: 'fake', userInfo: { uid: 'fake' } }, uid))
        .status,
      401,
    );
  }
  const created = await handler(event, 'visitor-a');
  assert.equal(created.status, 201);
  assert.ok(!JSON.stringify(created).includes(data.owner));
  assert.ok(!JSON.stringify(created).includes('visitor-a'));
  assert.equal(
    (await handler({ ...event, protocol: 'gifts/2' }, 'visitor-a')).status,
    400,
  );
  assert.equal(
    (
      await handler(
        { ...event, request: { method: 'GET', path: '/api/cleanup' } },
        'visitor-a',
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await handler(
        {
          ...event,
          request: {
            method: 'POST',
            path: '',
            body: { text: '光'.repeat(3000) },
          },
        },
        'visitor-a',
      )
    ).status,
    413,
  );
});

for (const [name, first, reply, choice, active] of [
  [
    '安静陪伴',
    '今天有点累。',
    '那就安静待一会儿。',
    { kind: 'style', style: 'calm/v2' },
    'calm/v2',
  ],
  [
    '轻松打趣',
    '又把钥匙忘家里了。',
    '给金鱼配个挂绳。',
    { kind: 'style', style: 'playful/v2' },
    'playful/v2',
  ],
  [
    '共同约定',
    '周末去海边好吗？',
    '到时再确认天气。',
    { kind: 'memory' },
    'original/v1',
  ],
] as const) {
  void test(`SDK contract: ${name}, two credentials, concurrent writes, snapshots and retry`, async () => {
    const { createSdkHandler } =
      await import('../services/gifts/sdk-handler.ts');
    const handler = createSdkHandler(new CloudGiftStore(database()));
    const data = { ...input(), text: first },
      friend = secret();
    const call = (
      method: string,
      path: string,
      body?: unknown,
      token?: string,
      uid = 'visitor',
    ) =>
      handler(
        { protocol: 'gifts/1', request: { method, path, body, token } },
        uid,
      );
    const created = await call('POST', '', data);
    const initial =
      created.value as import('../services/gifts/common.ts').GiftView;
    const id = '/' + initial.id;
    assert.equal(
      ((await call('POST', '', data)).value as typeof initial).id,
      initial.id,
    );
    assert.equal(
      (await call('POST', id + '/claim', { invite: data.invite, friend }))
        .status,
      200,
    );
    assert.equal(
      (
        await call('POST', id + '/claim', {
          invite: data.invite,
          friend: secret(),
        })
      ).status,
      409,
    );
    assert.equal((await call('GET', id, undefined, secret())).status, 403);
    // Platform UID deliberately identical: only business credentials determine the actor.
    const write = {
      revision: 0,
      op: secret(),
      action: { type: 'message', actor: 'sender', text: reply },
    };
    const responses = await Promise.all([
      call('POST', id + '/actions', write, friend),
      call('POST', id + '/actions', { ...write, op: secret() }, data.owner),
    ]);
    assert.deepEqual(
      responses.map((r) => r.status).sort((a, b) => a - b),
      [200, 409],
    );
    const winner = responses[0].status === 200 ? friend : data.owner;
    const after = (await call('GET', id, undefined, data.owner))
      .value as typeof initial;
    assert.equal(after.state.active, 'original/v1');
    if (winner === friend) {
      assert.equal(after.state.messages[1].actor, 'friend');
      assert.equal(
        (await call('POST', id + '/actions', write, friend)).status,
        200,
      );
    }
    const proposed = (
      await call(
        'POST',
        id + '/actions',
        {
          revision: after.revision,
          op: secret(),
          action: {
            type: 'propose',
            expected: null,
            sourceIds: [1, 2],
            reason: name,
            choice,
          },
        },
        data.owner,
      )
    ).value as typeof initial;
    const accept = {
      revision: proposed.revision,
      op: secret(),
      action: { type: 'accept', version: proposed.state.pending!.version },
    };
    assert.equal(
      (await call('POST', id + '/actions', accept, data.owner)).status,
      409,
    );
    const accepted = (await call('POST', id + '/actions', accept, friend))
      .value as typeof initial;
    assert.equal(accepted.state.memories.length, 1);
    assert.equal(accepted.state.active, active);
    assert.equal(accepted.expires, initial.expires);
    assert.equal(
      (await call('POST', id + '/actions', accept, friend)).status,
      200,
    );
    assert.equal((await call('DELETE', id, undefined, friend)).status, 403);
    assert.equal((await call('DELETE', id, undefined, data.owner)).status, 200);
    assert.equal((await call('GET', id, undefined, friend)).status, 404);
  });
}
