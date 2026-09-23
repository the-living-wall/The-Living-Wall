import { createHash, randomBytes } from 'node:crypto';
import {
  sharedReducer,
  type Actor,
  type SharedAction,
  type SharedState,
} from '../../prototypes/live-gift/shared-state.ts';
import { isStyle } from '../../prototypes/live-gift/temperaments.ts';

export const TTL = 7 * 24 * 60 * 60 * 1000;
export class GiftError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const digest = (s: string) =>
  createHash('sha256').update(s).digest('hex');
export const secret = () => randomBytes(32).toString('hex');
export function check(
  ok: unknown,
  status: number,
  message: string,
): asserts ok {
  if (!ok) throw new GiftError(status, message);
}
export function token(value: unknown): string {
  check(
    typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
    400,
    '凭证格式不正确。',
  );
  return value;
}
export function text(value: unknown, max: number, required = false): string {
  check(
    typeof value === 'string' && Array.from(value).length <= max,
    400,
    `文字最多 ${max} 字。`,
  );
  check(!required || value.trim(), 400, '请先写下一句话。');
  return value.trim();
}
export const number = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0;
export type Row = {
  id: string;
  owner: string;
  invite: string;
  friend: string | null;
  created: number;
  expires: number;
  revision: number;
  state: string;
  creation: string;
};
export type GiftView = {
  id: string;
  actor: Actor;
  expires: number;
  revision: number;
  state: SharedState;
};

export function parseAction(
  value: unknown,
  actor: Actor,
  now: number,
): SharedAction {
  check(
    value && typeof value === 'object' && !Array.isArray(value),
    400,
    '操作格式不正确。',
  );
  const a = value as Record<string, unknown>;
  if (a.type === 'message')
    return { type: 'message', actor, text: text(a.text, 80, true) };
  if (a.type === 'rename')
    return { type: 'rename', actor, name: text(a.name, 20) };
  if (a.type === 'accept' || a.type === 'decline' || a.type === 'withdraw') {
    check(number(a.version), 400, '提议版本不正确。');
    return a.type === 'accept'
      ? { type: a.type, actor, version: a.version, at: now }
      : { type: a.type, actor, version: a.version };
  }
  check(
    a.type === 'propose' && (a.expected === null || number(a.expected)),
    400,
    '不支持这项操作。',
  );
  check(
    Array.isArray(a.sourceIds) &&
      a.sourceIds.length <= 100 &&
      a.sourceIds.every(number),
    400,
    '选择的对话不正确。',
  );
  check(
    a.historyVersion === undefined || number(a.historyVersion),
    400,
    '历史版本不正确。',
  );
  const c = a.choice as Record<string, unknown> | undefined;
  check(c && typeof c === 'object', 400, '共同选择不正确。');
  let choice: Extract<SharedAction, { type: 'propose' }>['choice'];
  if (c.kind === 'memory') choice = { kind: 'memory' };
  else if (
    c.kind === 'style' &&
    typeof c.style === 'string' &&
    isStyle(c.style)
  )
    choice = { kind: 'style', style: c.style };
  else {
    check(
      c.kind === 'remove-memory' && number(c.memoryId),
      400,
      '表现版本不正确。',
    );
    choice = { kind: 'remove-memory', memoryId: c.memoryId };
  }
  return {
    type: 'propose',
    actor,
    expected: a.expected,
    choice,
    sourceIds: a.sourceIds,
    reason: text(a.reason, 80),
    historyVersion: a.historyVersion as number | undefined,
  };
}

export function advance(
  row: Row,
  actor: Actor,
  input: Record<string, unknown>,
  now: number,
): SharedState {
  check(
    number(input.revision) && input.revision === row.revision,
    409,
    '朋友刚刚更新了交流，请查看最新内容后再提交。',
  );
  check(row.revision < 300, 429, '这份测试交流已达到保存上限。');
  const state: SharedState = JSON.parse(row.state);
  const action = parseAction(input.action, actor, now);
  if (action.type === 'message')
    check(state.messages.length < 100, 429, '这份心意最多保存 100 条留言。');
  const next = sharedReducer(state, action);
  // Failed reducer actions change feedback only; never report these as saved.
  check(
    JSON.stringify({ ...next, feedback: '' }) !==
      JSON.stringify({ ...state, feedback: '' }),
    409,
    next.feedback || '内容没有变化。',
  );
  next.feedback =
    action.type === 'message'
      ? '已回复给朋友。'
      : action.type === 'propose'
        ? '已邀请朋友确认，共同选择尚未改变。'
        : next.feedback.replaceAll('本页的', '').replaceAll('体验身份', '朋友');
  check(
    Buffer.byteLength(JSON.stringify(next)) <= 262144,
    429,
    '共同记录已达到测试保存上限。',
  );

  return next;
}
