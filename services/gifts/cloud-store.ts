import {
  createSharedState,
  type Actor,
} from '../../prototypes/live-gift/shared-state.ts';
import {
  TTL,
  GiftError,
  digest,
  token,
  text,
  check,
  advance,
  type Row,
  type GiftView,
} from './common.ts';

// A small SDK boundary also lets contract tests inject a transactional test double.
export type Document = {
  get(): Promise<{ data: unknown }>;
  set(data: object): Promise<unknown>;
  remove(): Promise<unknown>;
};
export type Transaction = {
  collection(name: string): { doc(id: string): Document };
};
export type CloudDatabase = {
  runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  collection(name: string): {
    doc(id: string): Document;
    where(filter: object): {
      limit(n: number): { get(): Promise<{ data: unknown[] }> };
    };
  };
  command: { lte(value: number): unknown };
};
type GiftDocument = Row & { operations: Record<string, string> };
type Quota = { bucket: number; count: number; live: Record<string, number> };
export const GIFTS = 'xiaoying_gifts';
export const LIMITS = 'xiaoying_limits';
const first = async <T>(doc: Document): Promise<T | undefined> => {
  const { data } = await doc.get();
  return (Array.isArray(data) ? data[0] : (data ?? undefined)) as T | undefined;
};

export class CloudGiftStore {
  db: CloudDatabase;
  now: () => number;
  constructor(db: CloudDatabase, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  async atomic<T>(fn: (tx: Transaction) => Promise<T>) {
    try {
      return await this.db.runTransaction(fn);
    } catch (e) {
      if (e instanceof GiftError) throw e;
      if (
        typeof e === 'object' &&
        e &&
        'code' in e &&
        e.code === 'DATABASE_TRANSACTION_CONFLICT'
      )
        throw new GiftError(409, '交流正在更新，请查看最新内容后重试。');
      throw e;
    }
  }
  private async row(tx: Transaction, id: string) {
    check(/^[a-f0-9]{32}$/.test(id), 404, '这份心意不存在或已到期。');
    const row = await first<GiftDocument>(tx.collection(GIFTS).doc(id));
    check(
      row && row.expires > this.now(),
      404,
      '这份心意不存在、已删除或已到期。',
    );
    return row;
  }
  private actor(row: Row, credential: unknown): Actor {
    const hash = digest(token(credential));
    if (hash === row.owner) return 'sender';
    if (hash === row.friend) return 'friend';
    throw new GiftError(403, '当前浏览器没有这份交流的访问凭证。');
  }
  private view(row: Row, actor: Actor): GiftView {
    return {
      id: row.id,
      actor,
      expires: row.expires,
      revision: row.revision,
      state: JSON.parse(row.state),
    };
  }
  async read(id: string, credential: unknown) {
    const row = await this.row(this.db, id);
    return this.view(row, this.actor(row, credential));
  }
  async create(input: Record<string, unknown>) {
    const owner = digest(token(input.owner)),
      invite = digest(token(input.invite));
    check(owner !== invite, 400, '邀请与管理凭证必须分开。');
    const greeting = text(input.text, 80),
      sender = text(input.sender, 20),
      friend = text(input.friend, 20);
    const creation = digest(
      JSON.stringify({ invite, greeting, sender, friend }),
    );
    // Derive an unguessable ID from the 256-bit owner secret: no separate identity index.
    const id = owner.slice(0, 32),
      now = this.now();
    return this.atomic(async (tx) => {
      const doc = tx.collection(GIFTS).doc(id);
      const existing = await first<GiftDocument>(doc);
      if (existing && existing.expires > now) {
        check(
          existing.owner === owner && existing.creation === creation,
          409,
          '创建请求已变化，请先找回上一份心意。',
        );
        return this.view(existing, 'sender');
      }
      const quotaDoc = tx.collection(LIMITS).doc('creation');
      const saved = await first<Quota>(quotaDoc);
      const bucket = Math.floor(now / 3600000);
      const live = Object.fromEntries(
        Object.entries(saved?.live ?? {}).filter(
          ([, expires]) => expires > now,
        ),
      );
      const count = saved?.bucket === bucket ? saved.count : 0;
      check(
        Object.keys(live).length < 1000 && count < 100,
        429,
        '测试服务创建额度暂满，请稍后再试。',
      );
      const state = createSharedState(greeting);
      state.names = { sender, friend };
      const row: GiftDocument = {
        id,
        owner,
        invite,
        friend: null,
        created: now,
        expires: now + TTL,
        revision: 0,
        state: JSON.stringify(state),
        creation,
        operations: {},
      };
      await quotaDoc.set({
        bucket,
        count: count + 1,
        live: { ...live, [id]: row.expires },
      });
      await doc.set(row);
      return this.view(row, 'sender');
    });
  }
  async claim(id: string, input: Record<string, unknown>) {
    const invite = digest(token(input.invite)),
      friend = digest(token(input.friend));
    return this.atomic(async (tx) => {
      const row = await this.row(tx, id);
      check(
        row.invite === invite && row.owner !== friend && invite !== friend,
        403,
        '邀请不可用。',
      );
      check(
        !row.friend || row.friend === friend,
        409,
        '这份邀请已被另一位朋友接受。请使用接受时的浏览器。',
      );
      if (!row.friend)
        await tx
          .collection(GIFTS)
          .doc(id)
          .set(writable({ ...row, friend }));
      return this.view(row, 'friend');
    });
  }
  async mutate(
    id: string,
    credential: unknown,
    input: Record<string, unknown>,
  ) {
    return this.atomic(async (tx) => {
      const row = await this.row(tx, id),
        actor = this.actor(row, credential);
      const key = actor + '-' + token(input.op),
        fingerprint = digest(JSON.stringify(input));
      if (row.operations[key]) {
        check(
          row.operations[key] === fingerprint,
          409,
          '同一请求不能更换内容。',
        );
        return this.view(row, actor);
      }
      const state = advance(row, actor, input, this.now());
      const next: GiftDocument = {
        ...row,
        revision: row.revision + 1,
        state: JSON.stringify(state),
        operations: { ...row.operations, [key]: fingerprint },
      };
      // _id is returned by the SDK; never try to change the SDK-managed primary key.
      await tx.collection(GIFTS).doc(id).set(writable(next));
      return this.view(next, actor);
    });
  }
  async remove(id: string, credential: unknown) {
    await this.atomic(async (tx) => {
      const row = await this.row(tx, id);
      check(
        this.actor(row, credential) === 'sender',
        403,
        '只有发送者可以删除整份心意。',
      );
      const quotaDoc = tx.collection(LIMITS).doc('creation');
      const quota = await first<Quota>(quotaDoc);
      if (quota) {
        delete quota.live[id];
        await quotaDoc.set(writable(quota));
      }
      await tx.collection(GIFTS).doc(id).remove();
    });
  }
  async allowRequest() {
    // Retry only aborted quota transactions, never business mutations or
    // ambiguous transport errors (which may already have committed).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.db.runTransaction(async (tx) => {
          const bucket = Math.floor(this.now() / 60000);
          const doc = tx.collection(LIMITS).doc('requests');
          const previous = await first<{ bucket: number; count: number }>(doc);
          const count = previous?.bucket === bucket ? previous.count : 0;
          check(count < 120, 429, '测试站访问较频繁，请稍后再试。');
          await doc.set({ bucket, count: count + 1 });
        });
        return;
      } catch (e) {
        if (
          e instanceof GiftError ||
          typeof e !== 'object' ||
          !e ||
          !('code' in e) ||
          e.code !== 'DATABASE_TRANSACTION_CONFLICT'
        )
          throw e;
        if (attempt === 2) throw new GiftError(503, '服务繁忙，请稍后重试。');
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            25 * (attempt + 1) + Math.floor(Math.random() * 50),
          ),
        );
      }
    }
  }
  async purge() {
    // Up to the entire 1000-gift test capacity per scheduled run, in bounded batches.
    let removed = 0;
    for (let batch = 0; batch < 10; batch++) {
      const { data } = await this.db
        .collection(GIFTS)
        .where({ expires: this.db.command.lte(this.now()) })
        .limit(100)
        .get();
      if (!data.length) break;
      for (const item of data as GiftDocument[]) {
        await this.atomic(async (tx) => {
          const doc = tx.collection(GIFTS).doc(item.id),
            current = await first<GiftDocument>(doc);
          if (current && current.expires <= this.now()) {
            await doc.remove();
            removed++;
          }
        });
      }
    }
    await this.atomic(async (tx) => {
      const doc = tx.collection(LIMITS).doc('creation'),
        quota = await first<Quota>(doc);
      if (quota)
        await doc.set({
          ...writable(quota),
          live: Object.fromEntries(
            Object.entries(quota.live).filter(
              ([, expires]) => expires > this.now(),
            ),
          ),
        });
    });
    return removed;
  }
}
function writable<T extends object>(value: T) {
  const copy = { ...value } as T & { _id?: string };
  delete copy._id;
  return copy;
}
