// Validate persisted synthetic state across an immutable CloudBase function version.
// The published version is invoked directly; no online route is changed.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
const exec = promisify(execFile),
  env = 'env-d1g2bv5sn355fc36e';
const origin = `https://${env}-1301641054.ap-shanghai.app.tcloudbase.com`;
const cli = process.env.TCB_CLI,
  qualifier = process.env.QA_FUNCTION_VERSION,
  output = process.env.QA_OUTPUT;
assert(
  cli && output && /^\d+$/.test(qualifier || ''),
  'Set CLI, output, and an existing immutable version',
);
await mkdir(output, { recursive: false });
const report = {
  started: new Date().toISOString(),
  env,
  qualifier,
  checks: [],
  invocations: [],
};
const token = () => randomBytes(32).toString('hex');
const owner = token(),
  invite = token(),
  friend = token();
let id;
async function api(path, method = 'GET', body, credential = owner) {
  await new Promise((r) => setTimeout(r, 2000));
  const r = await fetch(origin + '/api' + path, {
    method,
    headers: {
      Origin: origin,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${credential}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, value: await r.json() };
}
async function version(path, method = 'GET', body, credential = owner) {
  const event = {
    httpMethod: method,
    path: '/api' + path,
    headers: {
      origin,
      authorization: `Bearer ${credential}`,
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  let stdout;
  try {
    ({ stdout } = await exec(
      cli,
      [
        'api',
        'scf',
        'Invoke',
        '-r',
        'ap-shanghai',
        '--json',
        '--body',
        JSON.stringify({
          Namespace: env,
          FunctionName: 'xiaoying-gifts-api',
          Qualifier: qualifier,
          InvocationType: 'RequestResponse',
          LogType: 'Tail',
          ClientContext: JSON.stringify(event),
        }),
      ],
      { maxBuffer: 2 * 1024 * 1024 },
    ));
  } catch {
    throw new Error(
      'Official CLI Invoke failed; request credentials omitted from report',
    );
  }
  const raw = JSON.parse(stdout.slice(stdout.indexOf('{'))),
    result = raw.data?.Result;
  assert(result, 'Missing function invocation result');
  let log = result.Log || '';
  if (!/RequestId|Coldstart/.test(log))
    log = Buffer.from(log, 'base64').toString('utf8');
  const lines = log
    .split('\n')
    .filter((s) => /^(START |END |Init Report |Report )/.test(s));
  report.invocations.push({
    requestId: result.FunctionRequestId || result.RequestId,
    invokeResult: result.InvokeResult,
    errMsg: result.ErrMsg,
    duration: result.Duration,
    platformLog: lines,
    coldstartObserved: /Coldstart/.test(log),
    responseWasInTail: /Response RequestId/.test(log),
  });
  const returned = JSON.parse(result.RetMsg);
  return { status: returned.statusCode, value: JSON.parse(returned.body) };
}
try {
  let r = await api('/gifts', 'POST', {
    owner,
    invite,
    text: '实例恢复验证，虚构内容。',
    sender: '测试甲',
    friend: '测试乙',
  });
  assert.equal(r.status, 201);
  id = createHash('sha256').update(owner).digest('hex').slice(0, 32);
  assert.equal(r.value.id, id);
  r = await api(`/gifts/${id}/claim`, 'POST', { invite, friend });
  assert.equal(r.status, 200);
  r = await api(
    `/gifts/${id}/actions`,
    'POST',
    {
      revision: 0,
      op: token(),
      action: { type: 'message', text: '这是切换前保存的回复。' },
    },
    friend,
  );
  assert.equal(r.status, 200);
  r = await api(`/gifts/${id}/actions`, 'POST', {
    revision: r.value.revision,
    op: token(),
    action: {
      type: 'propose',
      expected: null,
      sourceIds: [1],
      reason: '恢复检查',
      choice: { kind: 'memory' },
    },
  });
  assert.equal(r.status, 200);
  r = await api(
    `/gifts/${id}/actions`,
    'POST',
    {
      revision: r.value.revision,
      op: token(),
      action: { type: 'accept', version: r.value.state.pending.version },
    },
    friend,
  );
  assert.equal(r.status, 200);
  const before = r.value;
  const v = await version(`/gifts/${id}`);
  assert.equal(v.status, 200);
  assert.deepEqual(v.value.state, before.state);
  assert.equal(v.value.revision, before.revision);
  report.checks.push('immutable-version-reads-same-confirmed-state');
  const payload = {
    revision: v.value.revision,
    op: token(),
    action: { type: 'message', text: '另一个函数版本保存的回复。' },
  };
  const write = await version(`/gifts/${id}/actions`, 'POST', payload, friend);
  assert.equal(write.status, 200);
  const retry = await api(`/gifts/${id}/actions`, 'POST', payload, friend);
  assert.equal(retry.status, 200);
  assert.equal(
    retry.value.state.messages.filter((m) => m.text === payload.action.text)
      .length,
    1,
  );
  assert.equal(retry.value.state.memories.length, 1);
  report.checks.push(
    'version-write-visible-through-existing-public-route',
    'cross-version-idempotency-and-memory-preserved',
  );
  report.coldstartObserved = report.invocations.some(
    (x) => x.coldstartObserved,
  );
  report.status = report.coldstartObserved
    ? 'passed'
    : 'partial-no-coldstart-evidence';
  if (!report.coldstartObserved) process.exitCode = 2;
} catch (e) {
  report.status = 'failed';
  report.error = e instanceof Error ? e.message : 'Unknown failure';
  process.exitCode = 1;
} finally {
  if (id) {
    const r = await api(`/gifts/${id}`, 'DELETE');
    report.syntheticCleanupStatus = r.status;
  }
  report.finished = new Date().toISOString();
  await writeFile(output + '/recovery.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
