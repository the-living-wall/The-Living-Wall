// Uses the already-authenticated official CLI, never reads credentials.
// Only synthetic gifts created by this run are updated or removed.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
const exec = promisify(execFile);
const env = 'env-d1g2bv5sn355fc36e';
const origin = `https://${env}-1301641054.ap-shanghai.app.tcloudbase.com`;
const cli = process.env.TCB_CLI;
const output = process.env.QA_OUTPUT;
assert(cli && output, 'Set TCB_CLI and a new QA_OUTPUT directory');
await mkdir(output, { recursive: false });
const report = {
  started: new Date().toISOString(),
  env,
  origin,
  checks: [],
  probes: [],
  limitations: [
    'Two measured timer boundaries, not a worst-case SLA or backup-erasure proof.',
    'Times measured on client; API Date and request timing retained.',
  ],
};
const probes = [];
const token = () => randomBytes(32).toString('hex');
const flush = () =>
  writeFile(`${output}/lifecycle.json`, JSON.stringify(report, null, 2));
async function mongo(type, command) {
  const { stdout } = await exec(
    cli,
    [
      'db',
      'nosql',
      'execute',
      '-e',
      env,
      '--command',
      JSON.stringify([
        {
          TableName: command.find || command.update || command.delete,
          CommandType: type,
          Command: JSON.stringify(command),
        },
      ]),
      '--json',
    ],
    { maxBuffer: 1024 * 1024 },
  );
  const value = JSON.parse(stdout.slice(stdout.indexOf('{')));
  assert(Array.isArray(value.data?.results), 'Unexpected CLI response');
  return value.data.results[0];
}
async function api(path, method, body, credential) {
  const started = Date.now();
  const r = await fetch(origin + '/api' + path, {
    method,
    headers: {
      Origin: origin,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    value: await r.json(),
    started,
    ended: Date.now(),
    serverDate: r.headers.get('date'),
  };
}
try {
  for (const label of ['before-minute', 'after-minute']) {
    const owner = token(),
      invite = token();
    const r = await api('/gifts', 'POST', {
      owner,
      invite,
      text: '发布准备自动探针，仅虚构测试数据。',
      sender: '测试甲',
      friend: '测试乙',
    });
    assert.equal(r.status, 201);
    const id = createHash('sha256').update(owner).digest('hex').slice(0, 32);
    assert.equal(r.value.id, id);
    const record = { label, id, observations: [] };
    probes.push({ id, owner, record });
    report.probes.push(record);
  }
  const boundary = Math.ceil((Date.now() + 40000) / 60000) * 60000;
  for (const [i, p] of probes.entries()) {
    p.record.expires = boundary + (i === 0 ? -5000 : 5000);
    const existing = await api('/gifts/' + p.id, 'GET', undefined, p.owner);
    assert.equal(existing.status, 200);
    assert.equal(
      existing.value.state.messages[0].text,
      '发布准备自动探针，仅虚构测试数据。',
    );
    await mongo('UPDATE', {
      update: 'xiaoying_gifts',
      updates: [
        {
          q: { _id: p.id, id: p.id },
          u: { $set: { expires: p.record.expires } },
          multi: false,
          upsert: false,
        },
      ],
    });
    await mongo('UPDATE', {
      update: 'xiaoying_limits',
      updates: [
        {
          q: { _id: 'creation' },
          u: { $set: { ['live.' + p.id]: p.record.expires } },
          multi: false,
          upsert: false,
        },
      ],
    });
    const live = await api('/gifts/' + p.id, 'GET', undefined, p.owner);
    assert.equal(live.status, 200);
    assert.equal(live.value.expires, p.record.expires);
    p.record.beforeExpiryStatus = live.status;
  }
  await flush();
  const deadline = boundary + 95000;
  while (Date.now() < deadline && probes.some((p) => !p.record.firstMissing)) {
    for (const p of probes.filter((p) => !p.record.firstMissing)) {
      if (Date.now() < p.record.expires + 1000) continue;
      if (!p.record.afterExpiry) {
        const r = await api('/gifts/' + p.id, 'GET', undefined, p.owner);
        p.record.afterExpiry = {
          status: r.status,
          started: r.started,
          ended: r.ended,
          serverDate: r.serverDate,
        };
        assert.equal(
          r.status,
          404,
          'Expired record must not remain accessible',
        );
      }
      const started = Date.now();
      const rows = await mongo('QUERY', {
        find: 'xiaoying_gifts',
        filter: { _id: p.id },
        projection: { _id: 1, expires: 1 },
        limit: 1,
      });
      assert(Array.isArray(rows));
      const observed = { started, ended: Date.now(), exists: rows.length > 0 };
      p.record.observations.push(observed);
      if (rows.length) p.record.lastPresent = observed;
      else {
        p.record.firstMissing = observed;
        p.record.deletionUpperBoundMs = observed.ended - p.record.expires;
      }
    }
    await flush();
    if (probes.some((p) => !p.record.firstMissing))
      await new Promise((r) => setTimeout(r, 4000));
  }
  for (const p of probes) {
    assert(
      p.record.firstMissing,
      'Timer did not remove synthetic probe within observation window',
    );
    assert(
      p.record.deletionUpperBoundMs <= 60000,
      'Observed deletion upper bound exceeds 60 seconds',
    );
  }
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.error = String(e);
  process.exitCode = 1;
} finally {
  // Exact IDs generated and verified in this process, never collection-wide deletion.
  for (const p of probes) {
    const rows = await mongo('QUERY', {
      find: 'xiaoying_gifts',
      filter: { _id: p.id },
      projection: { _id: 1 },
      limit: 1,
    });
    if (rows.length) {
      await mongo('DELETE', {
        delete: 'xiaoying_gifts',
        deletes: [{ q: { _id: p.id, id: p.id }, limit: 1 }],
      });
      p.record.manualCleanup = true;
    }
    await mongo('UPDATE', {
      update: 'xiaoying_limits',
      updates: [
        {
          q: { _id: 'creation' },
          u: { $unset: { ['live.' + p.id]: '' } },
          multi: false,
          upsert: false,
        },
      ],
    });
  }
  report.finished = new Date().toISOString();
  await flush();
  console.log(JSON.stringify(report, null, 2));
}
