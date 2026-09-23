import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GiftStore, GiftError, secret, TTL } from '../services/gifts/store.ts';
import { giftServer } from '../services/gifts/server.ts';

void test('HTTP rate limits and no-origin writes do not create or disclose gifts', async (t) => {
  const x = setup(t),
    origin = 'http://127.0.0.1:4199';
  const server = giftServer(x.store, { origin, staticDir: x.dir, limit: 3 });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  assert.equal(
    (
      await fetch(base + '/api/gifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(x.input),
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(base + '/api/gifts/' + x.id + '/claim')).status,
    405,
  );
  assert.equal(x.store.row(x.id).friend, null);
  await fetch(base + '/api/health');
  const limited = await fetch(base + '/api/health');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
});

function setup(t: { after: (fn: () => void) => void }, now = Date.now) {
  const dir = mkdtempSync(join(tmpdir(), 'gifts-test-'));
  const store = new GiftStore(join(dir, 'data.sqlite'), now);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const owner = secret(),
    invite = secret(),
    friend = secret();
  const input = {
    owner,
    invite,
    text: '一起慢慢来',
    sender: '阿禾',
    friend: '小满',
  };
  const view = store.create(input);
  return { dir, store, owner, invite, friend, input, id: view.id };
}
function rejects(fn: () => unknown, status: number) {
  assert.throws(
    fn,
    (e: unknown) => e instanceof GiftError && e.status === status,
  );
}

void test('creation and explicit claim are idempotent; tokens are separate and hashed', (t) => {
  const x = setup(t);
  assert.equal(x.store.create(x.input).id, x.id);
  rejects(() => x.store.read(x.id, x.invite), 403);
  rejects(
    () => x.store.claim(x.id, { invite: x.invite, friend: x.owner }),
    403,
  );
  x.store.claim(x.id, { invite: x.invite, friend: x.friend });
  assert.equal(
    x.store.claim(x.id, { invite: x.invite, friend: x.friend }).actor,
    'friend',
  );
  rejects(
    () => x.store.claim(x.id, { invite: x.invite, friend: secret() }),
    409,
  );
  const row = x.store.db.prepare('SELECT * FROM gifts WHERE id=?').get(x.id)!;
  assert.ok(!JSON.stringify(row).includes(x.owner));
  assert.ok(!JSON.stringify(row).includes(x.invite));
});
void test('roles and timestamps come from authentication, not submitted actor; stale and duplicate writes are safe', (t) => {
  const x = setup(t);
  x.store.claim(x.id, { invite: x.invite, friend: x.friend });
  const proposal = {
    op: secret(),
    revision: 0,
    action: {
      type: 'propose',
      actor: 'friend',
      expected: null,
      choice: { kind: 'style', style: 'calm/v2' },
      sourceIds: [1],
      reason: '一起安静',
    },
  };
  const p = x.store.mutate(x.id, x.owner, proposal);
  assert.equal(p.state.pending!.author, 'sender');
  assert.equal(x.store.mutate(x.id, x.owner, proposal).revision, 1);
  const accept = {
    type: 'accept',
    actor: 'friend',
    version: p.state.pending!.version,
    at: -1,
  };
  rejects(
    () =>
      x.store.mutate(x.id, x.owner, {
        revision: 1,
        op: secret(),
        action: accept,
      }),
    409,
  );
  rejects(
    () =>
      x.store.mutate(x.id, x.friend, {
        revision: 0,
        op: secret(),
        action: accept,
      }),
    409,
  );
  const accepted = x.store.mutate(x.id, x.friend, {
    revision: 1,
    op: secret(),
    action: accept,
  });
  assert.equal(accepted.state.active, 'calm/v2');
  assert.ok(accepted.state.history[0].at > 0);
  const message = {
    revision: 2,
    op: secret(),
    action: { type: 'message', actor: 'sender', text: '手机回复' },
  };
  const result = x.store.mutate(x.id, x.friend, message);
  assert.equal(result.state.messages.at(-1)!.actor, 'friend');
  assert.equal(
    x.store.mutate(x.id, x.friend, message).state.messages.length,
    2,
  );
  rejects(
    () =>
      x.store.mutate(x.id, x.friend, {
        ...message,
        action: { ...message.action, text: '不同内容' },
      }),
    409,
  );
  assert.equal(result.state.active, 'calm/v2');
});
void test('state survives reopening; names preserve snapshots; deleting memory preserves shape and original dialogue', (t) => {
  const x = setup(t);
  x.store.claim(x.id, { invite: x.invite, friend: x.friend });
  let revision = 0;
  const act = (who: string, action: object) =>
    x.store.mutate(x.id, who, { op: secret(), revision: revision++, action });
  const p = act(x.owner, {
    type: 'propose',
    expected: null,
    sourceIds: [1],
    choice: { kind: 'style', style: 'playful/v2' },
    reason: '笑一笑',
  });
  act(x.friend, { type: 'accept', version: p.state.pending!.version });
  const renamed = act(x.owner, { type: 'rename', name: '新名字' });
  assert.equal(renamed.state.memories[0].sources[0].name, '阿禾');
  const cancel = act(x.owner, {
    type: 'propose',
    expected: null,
    sourceIds: [],
    choice: { kind: 'remove-memory', memoryId: p.state.pending!.version },
    reason: '',
  });
  act(x.friend, { type: 'accept', version: cancel.state.pending!.version });
  const reopened = new GiftStore(join(x.dir, 'data.sqlite'));
  const restored = reopened.read(x.id, x.friend);
  reopened.close();
  assert.equal(restored.state.memories.length, 0);
  assert.equal(restored.state.active, 'playful/v2');
  assert.equal(restored.state.messages[0].text, '一起慢慢来');
});
void test('expiry is fixed from creation; deletion cascades and recipient cannot delete', (t) => {
  let now = 1000;
  const x = setup(t, () => now);
  x.store.claim(x.id, { invite: x.invite, friend: x.friend });
  rejects(() => x.store.remove(x.id, x.friend), 403);
  x.store.mutate(x.id, x.owner, {
    op: secret(),
    revision: 0,
    action: { type: 'message', text: '保存' },
  });
  assert.equal(x.store.read(x.id, x.owner).expires, 1000 + TTL);
  now += TTL;
  rejects(() => x.store.read(x.id, x.owner), 404);
  assert.equal(
    x.store.db.prepare('SELECT count(*) AS n FROM operations').get()!.n,
    0,
  );
  assert.equal(
    x.store.db.prepare('SELECT count(*) AS n FROM gifts').get()!.n,
    0,
  );
  const nextOwner = secret();
  const next = x.store.create({ ...x.input, owner: nextOwner });
  const other = secret(),
    otherGift = x.store.create({ ...x.input, owner: other });
  rejects(() => x.store.read(otherGift.id, x.owner), 403);
  x.store.remove(next.id, nextOwner);
  rejects(() => x.store.read(next.id, nextOwner), 404);
  assert.equal(x.store.read(otherGift.id, other).id, otherGift.id);
});
void test('input and per-conversation capacity are bounded', (t) => {
  const x = setup(t);
  rejects(() => x.store.create({ ...x.input, text: 'a'.repeat(81) }), 400);
  rejects(
    () =>
      x.store.mutate(x.id, x.owner, {
        revision: 0,
        op: secret(),
        action: { type: 'greeting', text: 'rewrite' },
      }),
    400,
  );
  for (let n = 0; n < 99; n++)
    x.store.mutate(x.id, x.owner, {
      revision: n,
      op: secret(),
      action: { type: 'message', text: '一句话' },
    });
  rejects(
    () =>
      x.store.mutate(x.id, x.owner, {
        revision: 99,
        op: secret(),
        action: { type: 'message', text: '过多' },
      }),
    429,
  );
  assert.equal(x.store.read(x.id, x.owner).state.active, 'original/v1');
});
void test('HTTP rejects wrong origins, malformed payloads, unauthenticated reads and traversal; concurrent writes conflict', async (t) => {
  const x = setup(t);
  writeFileSync(join(x.dir, 'index.html'), '<h1>test</h1>');
  const origin = 'http://127.0.0.1:4198';
  const server = giftServer(x.store, { origin, staticDir: x.dir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const port = (server.address() as { port: number }).port,
    base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/data.sqlite')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/etc/passwd')).status, 404);
  assert.equal((await fetch(base + '/api/gifts/' + x.id)).status, 400);
  const post = (body: unknown, from = origin) =>
    fetch(base + '/api/gifts/' + x.id + '/actions', {
      method: 'POST',
      headers: {
        Origin: from,
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + x.owner,
      },
      body: JSON.stringify(body),
    });
  assert.equal((await post({}, 'https://elsewhere.invalid')).status, 403);
  assert.equal((await post({ pad: 'x'.repeat(9000) })).status, 413);
  const mutation = {
    revision: 0,
    op: secret(),
    action: { type: 'message', text: '电脑消息' },
  };
  const statuses = await Promise.all([
    post(mutation),
    post({ ...mutation, op: secret() }),
  ]);
  assert.deepEqual(
    statuses.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  const get = await fetch(base + '/api/gifts/' + x.id, {
    headers: { Authorization: 'Bearer ' + x.owner },
  });
  assert.equal(get.headers.get('cache-control'), 'no-store');
  assert.equal(get.headers.get('referrer-policy'), 'no-referrer');
});
