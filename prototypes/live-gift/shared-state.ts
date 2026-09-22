import { ORIGINAL, isStyle, type StyleKey } from './temperaments.ts';

export type Actor = 'sender' | 'friend';
export const ACTOR_NAMES: Record<Actor, string> = {
  sender: '送出心意的人',
  friend: '收到心意的人',
};
export type Message = { id: number; actor: Actor; text: string };
export type Choice =
  | { kind: 'style'; style: StyleKey }
  | { kind: 'memory' }
  | { kind: 'remove-memory'; memoryId: number };
export type Proposal = {
  version: number;
  author: Actor;
  choice: Choice;
  sources: Message[];
  reason: string;
};
export type SharedRecord = Proposal & {
  previous: StyleKey;
  result: StyleKey;
  agreedBy: [Actor, Actor];
  at: number;
};
export type SharedState = {
  nextId: number;
  messages: Message[];
  active: StyleKey;
  pending: Proposal | null;
  memories: SharedRecord[];
  history: SharedRecord[];
  feedback: string;
};
export type SharedAction =
  | { type: 'message'; actor: Actor; text: string }
  | { type: 'greeting'; text: string }
  | {
      type: 'propose';
      actor: Actor;
      choice: Choice;
      sourceIds: number[];
      reason: string;
      expected: number | null;
      historyVersion?: number;
    }
  | { type: 'accept'; actor: Actor; version: number; at: number }
  | { type: 'decline'; actor: Actor; version: number }
  | { type: 'withdraw'; actor: Actor; version: number };
const clean = (text: string) => text.trim().slice(0, 80);
export function createSharedState(greeting: string): SharedState {
  return {
    nextId: 2,
    messages: clean(greeting)
      ? [{ id: 1, actor: 'sender', text: clean(greeting) }]
      : [],
    active: ORIGINAL,
    pending: null,
    memories: [],
    history: [],
    feedback: '',
  };
}
const fail = (state: SharedState, feedback: string): SharedState => ({
  ...state,
  feedback,
});
export function sharedReducer(
  state: SharedState,
  action: SharedAction,
): SharedState {
  if (action.type === 'greeting') {
    const text = clean(action.text);
    if ((state.messages.find((m) => m.id === 1)?.text ?? '') === text)
      return state;
    const messages = state.messages.filter((m) => m.id !== 1);
    if (text) messages.unshift({ id: 1, actor: 'sender', text });
    const changedSource = state.pending?.sources.some((m) => m.id === 1);
    return {
      ...state,
      messages,
      pending: changedSource ? null : state.pending,
      feedback: changedSource
        ? '原留言已修改，请重新提出共同选择。'
        : state.feedback,
    };
  }
  if (action.type === 'message') {
    const text = clean(action.text);
    if (!text) return fail(state, '写下一句话，再留在这次交流里。');
    return {
      ...state,
      nextId: state.nextId + 1,
      messages: [
        ...state.messages,
        { id: state.nextId, actor: action.actor, text },
      ],
      feedback: '已留在本页演示里，尚未发送。',
    };
  }
  if (action.type === 'propose') {
    if ((state.pending?.version ?? null) !== action.expected)
      return fail(state, '提议已经变化，请查看当前选择。');
    if (action.choice.kind === 'style' && !isStyle(action.choice.style))
      return fail(state, '这个表现版本暂不可用。');
    const choice = action.choice;
    const memory =
      choice.kind === 'remove-memory'
        ? state.memories.find((m) => m.version === choice.memoryId)
        : undefined;
    if (choice.kind === 'remove-memory' && !memory)
      return fail(state, '这条纪念已不在当前列表中。');
    const historical =
      action.historyVersion === undefined
        ? undefined
        : state.history.find((h) => h.version === action.historyVersion);
    if (
      action.historyVersion !== undefined &&
      (!historical ||
        choice.kind !== 'style' ||
        choice.style !== historical.previous)
    )
      return fail(state, '找不到要恢复的那次选择。');
    const sources =
      memory?.sources ??
      historical?.sources ??
      state.messages.filter((m) => action.sourceIds.includes(m.id));
    if (!sources.length) return fail(state, '先选一段你们想留下的话。');
    return {
      ...state,
      nextId: state.nextId + 1,
      pending: {
        version: state.nextId,
        author: action.actor,
        choice: { ...choice },
        sources: sources.map((m) => ({ ...m })),
        reason: clean(action.reason),
      },
      feedback: '提议已留在本页，切换体验身份后可查看；共同选择尚未改变。',
    };
  }
  const proposal = state.pending;
  if (!proposal || proposal.version !== action.version)
    return fail(state, '这份提议已经变化，当前选择保持不变。');
  if (action.type === 'withdraw') {
    if (proposal.author !== action.actor)
      return fail(state, '只有提出这次选择的人可以撤回。');
    return {
      ...state,
      pending: null,
      feedback: '已撤回提议，保持原来的样子。',
    };
  }
  if (proposal.author === action.actor)
    return fail(state, '这次提议需要另一个体验身份作出选择。');
  if (action.type === 'decline')
    return {
      ...state,
      pending: null,
      feedback: '这次先保持现在，不影响已有的共同记忆。',
    };
  const active =
    proposal.choice.kind === 'style' ? proposal.choice.style : state.active;
  const record: SharedRecord = {
    ...proposal,
    previous: state.active,
    result: active,
    agreedBy: [proposal.author, action.actor],
    at: action.at,
  };
  const removeId =
    proposal.choice.kind === 'remove-memory' ? proposal.choice.memoryId : null;
  const memories =
    proposal.choice.kind === 'memory'
      ? [...state.memories, record]
      : removeId !== null
        ? state.memories.filter((m) => m.version !== removeId)
        : state.memories;
  return {
    ...state,
    active,
    pending: null,
    memories,
    history: [...state.history, record],
    feedback:
      proposal.choice.kind === 'style'
        ? '两个体验身份已共同选择，小莹的样子已更新。'
        : proposal.choice.kind === 'memory'
          ? '这一刻已成为本页的共同纪念。'
          : '已取消这条纪念，原对话仍保留。',
  };
}
