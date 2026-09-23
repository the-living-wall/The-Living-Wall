import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.QA_ORIGIN;
assert.ok(
  origin?.startsWith('https://'),
  'Set QA_ORIGIN to the independent test origin',
);
await mkdir('outputs/cross-device-qa', { recursive: true });
const token = () => randomBytes(32).toString('hex');
const report = {
  started: new Date().toISOString(),
  origin,
  checks: [],
  failures: [],
};
const pause = () => new Promise((r) => setTimeout(r, 2000));
async function req(path, method = 'GET', body, credential, from = origin) {
  await pause();
  const response = await fetch(origin + '/api' + path, {
    method,
    headers: {
      Origin: from,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(credential ? { Authorization: 'Bearer ' + credential } : {}),
    },
    ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (response.status >= 429)
    report.failures.push({
      status: response.status,
      body: value,
      requestId: response.headers.get('x-cloudbase-request-id'),
    });
  return { status: response.status, value };
}
const yes = (name) => report.checks.push({ name, status: 'passed' });
const owner = token(),
  invite = token(),
  other = token();
let id,
  friend = token();
try {
  const payload = {
    owner,
    invite,
    text: '云端自动化验证：这是一条虚构消息。',
    sender: '测试甲',
    friend: '测试乙',
  };
  let result = await req('/gifts', 'POST', payload);
  assert.equal(result.status, 201, JSON.stringify(result));
  id = result.value.id;
  const expiry = result.value.expires;
  result = await req('/gifts', 'POST', payload);
  assert.equal(result.status, 201);
  assert.equal(result.value.id, id);
  yes('create-idempotency');
  const claims = await Promise.all([
    req('/gifts/' + id + '/claim', 'POST', { invite, friend }),
    req('/gifts/' + id + '/claim', 'POST', { invite, friend: other }),
  ]);
  assert.deepEqual(
    claims.map((x) => x.status).sort((a, b) => a - b),
    [200, 409],
  );
  if (claims[1].status === 200) friend = other;
  assert.equal(
    (await req('/gifts/' + id + '/claim', 'POST', { invite, friend })).status,
    200,
  );
  yes('concurrent-claim-and-retry');
  assert.equal(
    (await req('/gifts/' + id, 'GET', undefined, invite)).status,
    403,
  );
  assert.equal(
    (await req('/gifts/' + id, 'DELETE', undefined, friend)).status,
    403,
  );
  yes('role-and-invite-isolation');
  const message = {
    revision: 0,
    op: token(),
    action: { type: 'message', text: '保持原样', actor: 'friend' },
  };
  const writers = await Promise.all([
    req('/gifts/' + id + '/actions', 'POST', message, owner),
    req(
      '/gifts/' + id + '/actions',
      'POST',
      {
        ...message,
        op: token(),
        action: { type: 'message', text: '另一个并发消息' },
      },
      friend,
    ),
  ]);
  assert.deepEqual(
    writers.map((x) => x.status).sort((a, b) => a - b),
    [200, 409],
  );
  yes('concurrent-revision-conflict');
  let current = (await req('/gifts/' + id, 'GET', undefined, owner)).value;
  assert.equal(current.state.messages.length, 2);
  assert.equal(current.state.active, 'original/v1');
  assert.equal(current.expires, expiry);
  if (writers[0].status === 200) {
    assert.equal(current.state.messages[1].actor, 'sender');
    assert.equal(
      (await req('/gifts/' + id + '/actions', 'POST', message, owner)).status,
      200,
    );
    yes('actor-authoritative-and-message-idempotency');
  }
  const propose = {
    revision: current.revision,
    op: token(),
    action: {
      type: 'propose',
      expected: null,
      sourceIds: [1],
      reason: '仅保留测试纪念',
      choice: { kind: 'memory' },
    },
  };
  current = (await req('/gifts/' + id + '/actions', 'POST', propose, owner))
    .value;
  assert.ok(current.state.pending);
  const version = current.state.pending.version;
  assert.equal(
    (
      await req(
        '/gifts/' + id + '/actions',
        'POST',
        {
          revision: current.revision,
          op: token(),
          action: { type: 'accept', version },
        },
        owner,
      )
    ).status,
    409,
  );
  current = (
    await req(
      '/gifts/' + id + '/actions',
      'POST',
      {
        revision: current.revision,
        op: token(),
        action: { type: 'accept', version },
      },
      friend,
    )
  ).value;
  assert.equal(current.state.memories.length, 1);
  assert.equal(current.state.active, 'original/v1');
  yes('two-party-confirmation-memory-does-not-change-style');
  const snapshot = JSON.stringify(current.state.memories[0].sources);
  current = (
    await req(
      '/gifts/' + id + '/actions',
      'POST',
      {
        revision: current.revision,
        op: token(),
        action: { type: 'rename', name: '测试改名' },
      },
      owner,
    )
  ).value;
  assert.equal(JSON.stringify(current.state.memories[0].sources), snapshot);
  yes('historical-name-snapshot');
  const rejected = await req(
    '/gifts/' + id + '/actions',
    'POST',
    {
      revision: current.revision,
      op: token(),
      action: { type: 'message', text: '跨域拒绝' },
    },
    owner,
    'https://untrusted.invalid',
  );
  assert.equal(rejected.status, 403);
  yes('foreign-origin-rejected');
  assert.equal(
    (await req('/gifts/' + id, 'DELETE', undefined, owner)).status,
    200,
  );
  assert.equal(
    (await req('/gifts/' + id, 'GET', undefined, friend)).status,
    404,
  );
  yes('sender-delete-and-recipient-revoked');
  id = undefined;
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.error = String(e);
  throw e;
} finally {
  if (id) await req('/gifts/' + id, 'DELETE', undefined, owner);
  report.finished = new Date().toISOString();
  await writeFile(
    'outputs/cross-device-qa/cloud-api.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
