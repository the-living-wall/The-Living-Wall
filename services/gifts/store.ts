import { DatabaseSync } from 'node:sqlite';
import {
  createSharedState,
  type Actor,
} from '../../prototypes/live-gift/shared-state.ts';
import { randomBytes } from 'node:crypto';
import {
  TTL,
  GiftError,
  digest,
  check,
  token,
  text,
  advance,
  type Row,
  type GiftView,
} from './common.ts';
export { TTL, GiftError, digest, secret, type GiftView } from './common.ts';

export class GiftStore {
  db: DatabaseSync;
  now: () => number;
  constructor(path: string, now = Date.now) {
    this.now = now;
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS gifts(id TEXT PRIMARY KEY, owner TEXT UNIQUE NOT NULL, invite TEXT NOT NULL, friend TEXT, created INTEGER NOT NULL, expires INTEGER NOT NULL, revision INTEGER NOT NULL, state TEXT NOT NULL, creation TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(gift TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE, actor TEXT NOT NULL, op TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(gift,actor,op));
      CREATE TABLE IF NOT EXISTS quotas(bucket INTEGER PRIMARY KEY, count INTEGER NOT NULL);`);
    this.purge();
  }
  close() {
    this.db.close();
  }
  purge() {
    this.db.prepare('DELETE FROM gifts WHERE expires <= ?').run(this.now());
    this.db
      .prepare('DELETE FROM quotas WHERE bucket < ?')
      .run(Math.floor(this.now() / 3600000));
  }
  atomic<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  row(id: string): Row {
    check(/^[a-f0-9]{32}$/.test(id), 404, '这份心意不存在或已到期。');
    this.purge();
    const row = this.db.prepare('SELECT * FROM gifts WHERE id=?').get(id) as
      | Row
      | undefined;
    check(row, 404, '这份心意不存在、已删除或已到期。');
    return row;
  }
  actor(row: Row, credential: unknown): Actor {
    const hash = digest(token(credential));
    if (hash === row.owner) return 'sender';
    if (hash === row.friend) return 'friend';
    throw new GiftError(403, '当前浏览器没有这份交流的访问凭证。');
  }
  view(row: Row, actor: Actor): GiftView {
    return {
      id: row.id,
      actor,
      expires: row.expires,
      revision: row.revision,
      state: JSON.parse(row.state),
    };
  }
  read(id: string, credential: unknown) {
    const row = this.row(id);
    return this.view(row, this.actor(row, credential));
  }
  create(input: Record<string, unknown>): GiftView {
    const owner = digest(token(input.owner)),
      invite = digest(token(input.invite));
    check(owner !== invite, 400, '邀请与管理凭证必须分开。');
    const greeting = text(input.text, 80),
      sender = text(input.sender, 20),
      friend = text(input.friend, 20);
    const creation = digest(
      JSON.stringify({ invite, greeting, sender, friend }),
    );
    this.purge();
    return this.atomic(() => {
      const existing = this.db
        .prepare('SELECT * FROM gifts WHERE owner=?')
        .get(owner) as Row | undefined;
      if (existing) {
        check(
          existing.creation === creation,
          409,
          '创建请求已变化，请先找回上一份心意。',
        );
        return this.view(existing, 'sender');
      }
      check(
        (this.db.prepare('SELECT count(*) AS n FROM gifts').get()!
          .n as number) < 1000,
        429,
        '测试服务暂时已满，请稍后再试。',
      );
      const bucket = Math.floor(this.now() / 3600000);
      const quota = this.db
        .prepare('SELECT count FROM quotas WHERE bucket=?')
        .get(bucket);
      check(
        !quota || (quota.count as number) < 100,
        429,
        '创建较频繁，请稍后再试。',
      );
      this.db
        .prepare(
          'INSERT INTO quotas VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1',
        )
        .run(bucket);
      const state = createSharedState(greeting);
      state.names = { sender, friend };
      const id = randomBytes(16).toString('hex'),
        created = this.now();
      this.db
        .prepare('INSERT INTO gifts VALUES(?,?,?,?,?,?,?,?,?)')
        .run(
          id,
          owner,
          invite,
          null,
          created,
          created + TTL,
          0,
          JSON.stringify(state),
          creation,
        );
      return this.view(
        this.db.prepare('SELECT * FROM gifts WHERE id=?').get(id) as Row,
        'sender',
      );
    });
  }
  claim(id: string, input: Record<string, unknown>): GiftView {
    const invitation = digest(token(input.invite)),
      friend = digest(token(input.friend));
    this.purge();
    return this.atomic(() => {
      const row = this.row(id);
      check(
        row.invite === invitation &&
          row.owner !== friend &&
          invitation !== friend,
        403,
        '邀请不可用。',
      );
      check(
        !row.friend || row.friend === friend,
        409,
        '这份邀请已被另一位朋友接受。请使用接受时的浏览器。',
      );
      if (!row.friend)
        this.db.prepare('UPDATE gifts SET friend=? WHERE id=?').run(friend, id);
      return this.view({ ...row, friend }, 'friend');
    });
  }
  remove(id: string, credential: unknown) {
    const row = this.row(id);
    check(
      this.actor(row, credential) === 'sender',
      403,
      '只有发送者可以删除整份心意。',
    );
    this.db.prepare('DELETE FROM gifts WHERE id=?').run(id);
  }
  mutate(
    id: string,
    credential: unknown,
    input: Record<string, unknown>,
  ): GiftView {
    this.purge();
    return this.atomic(() => {
      const row = this.row(id),
        actor = this.actor(row, credential),
        op = token(input.op);
      const fingerprint = digest(JSON.stringify(input));
      const previous = this.db
        .prepare(
          'SELECT body FROM operations WHERE gift=? AND actor=? AND op=?',
        )
        .get(id, actor, op);
      if (previous) {
        check(previous.body === fingerprint, 409, '同一请求不能更换内容。');
        return this.view(row, actor);
      }
      const next = advance(row, actor, input, this.now());
      this.db
        .prepare('UPDATE gifts SET state=?,revision=revision+1 WHERE id=?')
        .run(JSON.stringify(next), id);
      this.db
        .prepare('INSERT INTO operations VALUES(?,?,?,?)')
        .run(id, actor, op, fingerprint);
      return this.view(
        { ...row, state: JSON.stringify(next), revision: row.revision + 1 },
        actor,
      );
    });
  }
}
