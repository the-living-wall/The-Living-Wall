import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Creature } from '../lib/creature.ts';
import {
  createSharedState,
  getProposalSources,
  sharedReducer as reduce,
  type SharedState,
  type SharedAction,
} from '../prototypes/live-gift/shared-state.ts';
import {
  TEMPERAMENTS,
  ORIGINAL,
  drawTemperament,
  motionAllowed,
  type StyleKey,
} from '../prototypes/live-gift/temperaments.ts';

const propose = (
  state: SharedState,
  style: StyleKey = 'calm/v1',
  actor: 'sender' | 'friend' = 'sender',
) =>
  reduce(state, {
    type: 'propose',
    actor,
    expected: state.pending?.version ?? null,
    choice: { kind: 'style', style },
    sourceIds: [1],
    reason: '一起慢慢来',
  });
const accept = (state: SharedState, actor: 'sender' | 'friend' = 'friend') =>
  reduce(state, {
    type: 'accept',
    actor,
    version: state.pending!.version,
    at: 100,
  });

void test('a proposal needs the other identity; duplicate confirmation cannot apply twice', () => {
  const pending = propose(createSharedState('歇一会儿'));
  assert.equal(pending.active, ORIGINAL);
  assert.equal(accept(pending, 'sender').history.length, 0);
  const accepted = accept(pending);
  assert.equal(accepted.active, 'calm/v1');
  assert.deepEqual(accepted.history[0].agreedBy, ['sender', 'friend']);
  const again = reduce(accepted, {
    type: 'accept',
    actor: 'friend',
    version: pending.pending!.version,
    at: 200,
  });
  assert.equal(again.history.length, 1);
  assert.equal(again.active, 'calm/v1');
});

void test('counterproposal discards earlier agreement and rejects all stale operations', () => {
  const first = propose(createSharedState('一起玩'));
  const revised = propose(first, 'playful/v1', 'friend');
  assert.equal(revised.active, ORIGINAL);
  assert.equal(accept(revised, 'friend').history.length, 0);
  for (const type of ['accept', 'decline', 'withdraw'] as const) {
    const stale = reduce(revised, {
      type,
      actor: 'sender',
      version: first.pending!.version,
      at: 200,
    });
    assert.equal(stale.pending!.version, revised.pending!.version);
    assert.equal(stale.active, ORIGINAL);
  }
  const confirmed = accept(revised, 'sender');
  assert.equal(confirmed.active, 'playful/v1');
  assert.deepEqual(confirmed.history[0].agreedBy, ['friend', 'sender']);
});

void test('withdrawal belongs to proposer, refusal belongs to the other identity', () => {
  const pending = propose(createSharedState('在呢'));
  const version = pending.pending!.version;
  assert.ok(
    reduce(pending, { type: 'withdraw', actor: 'friend', version }).pending,
  );
  assert.ok(
    reduce(pending, { type: 'decline', actor: 'sender', version }).pending,
  );
  for (const action of [
    { type: 'withdraw', actor: 'sender', version },
    { type: 'decline', actor: 'friend', version },
  ] as SharedAction[]) {
    const result = reduce(pending, action);
    assert.equal(result.pending, null);
    assert.equal(result.active, ORIGINAL);
    assert.equal(result.history.length, 0);
  }
});

void test('memory and cancelling memory both require agreement without changing temperament or chat', () => {
  let state = accept(propose(createSharedState('周末一起散步')));
  state = reduce(state, { type: 'message', actor: 'friend', text: '好呀！' });
  const chat = state.messages;
  state = reduce(state, {
    type: 'propose',
    actor: 'friend',
    expected: null,
    choice: { kind: 'memory' },
    sourceIds: chat.map((m) => m.id),
    reason: '我们的约定',
  });
  assert.equal(state.memories.length, 0);
  state = accept(state, 'sender');
  const memory = state.memories[0];
  assert.equal(state.active, 'calm/v1');
  assert.equal(memory.sources.length, 2);
  state = reduce(state, {
    type: 'propose',
    actor: 'sender',
    expected: null,
    choice: { kind: 'remove-memory', memoryId: memory.version },
    sourceIds: [],
    reason: '',
  });
  assert.equal(state.memories.length, 1);
  state = accept(state);
  assert.equal(state.memories.length, 0);
  assert.equal(state.active, 'calm/v1');
  assert.deepEqual(state.messages, chat);
  assert.equal(state.history.length, 3);
});

void test('source edits invalidate pending proposals but preserve accepted evidence and restore its exact version', () => {
  const pending = propose(createSharedState('原来的话'));
  assert.equal(
    reduce(pending, { type: 'greeting', text: '改了的话' }).pending,
    null,
  );
  let state = accept(pending);
  const originalRecord = state.history[0];
  state = reduce(state, { type: 'greeting', text: '' });
  assert.equal(state.messages.length, 0);
  assert.equal(originalRecord.sources[0].text, '原来的话');
  state = reduce(state, {
    type: 'propose',
    actor: 'friend',
    expected: null,
    choice: { kind: 'style', style: originalRecord.previous },
    historyVersion: originalRecord.version,
    sourceIds: [],
    reason: '恢复',
  });
  assert.equal(state.active, 'calm/v1');
  assert.equal(state.pending!.sources[0].text, '原来的话');
  state = accept(state, 'sender');
  assert.equal(state.active, ORIGINAL);
  assert.equal(state.history[1].previous, 'calm/v1');
});

void test('invalid input and competing proposals cannot fabricate a choice', () => {
  const state = createSharedState('你好');
  assert.equal(
    reduce(state, { type: 'message', actor: 'sender', text: '   ' }).messages
      .length,
    1,
  );
  assert.equal(
    reduce(state, { type: 'message', actor: 'friend', text: '光'.repeat(100) })
      .messages[1].text.length,
    80,
  );
  const base = {
    type: 'propose',
    actor: 'sender',
    expected: null,
    sourceIds: [999],
    reason: '',
    choice: { kind: 'style', style: 'calm/v1' },
  } as const;
  assert.equal(reduce(state, { ...base, sourceIds: [999] }).pending, null);
  assert.equal(
    reduce(state, {
      ...base,
      sourceIds: [1],
      choice: { kind: 'style', style: 'calm/v9' as StyleKey },
    }).pending,
    null,
  );
  assert.equal(
    reduce(state, { ...base, sourceIds: [1], historyVersion: 999 }).pending,
    null,
  );
  assert.equal(
    reduce(state, {
      ...base,
      sourceIds: [1],
      choice: { kind: 'remove-memory', memoryId: 999 },
    }).pending,
    null,
  );
  const first = propose(state);
  const competing = reduce(first, { ...base, sourceIds: [1] });
  assert.equal(competing.pending, first.pending);
  assert.ok(Object.isFrozen(TEMPERAMENTS));
  assert.ok(Object.values(TEMPERAMENTS).every(Object.isFrozen));
});

void test('counterproposals keep historical excerpts even when the current greeting was removed or replaced', () => {
  for (const greeting of ['', '现在的新留言']) {
    let state = accept(propose(createSharedState('当时的原文')));
    const history = state.history[0];
    state = reduce(state, { type: 'greeting', text: greeting });
    state = reduce(state, {
      type: 'propose',
      actor: 'friend',
      expected: null,
      choice: { kind: 'style', style: history.previous },
      historyVersion: history.version,
      sourceIds: [],
      reason: '想恢复',
    });
    const originalVersion = state.pending!.version;
    const available = getProposalSources(state, originalVersion);
    assert.equal(available[0].text, '当时的原文');
    assert.equal(available.filter((message) => message.id === 1).length, 1);
    const revised = propose(state, 'curious/v1', 'sender');
    assert.equal(revised.pending!.sources[0].text, '当时的原文');
    assert.equal(revised.active, 'calm/v1');
    assert.equal(accept(revised, 'sender').history.length, 1);
    assert.equal(accept(revised, 'friend').active, 'curious/v1');
    assert.equal(getProposalSources(state, null)[0]?.text ?? '', greeting);
  }
});

void test('a counterproposal can explicitly combine the retained excerpt and a new reply', () => {
  let state = propose(createSharedState('一起慢慢来'));
  state = reduce(state, {
    type: 'message',
    actor: 'friend',
    text: '我们可以试着好奇一点',
  });
  const reply = state.messages.at(-1)!;
  const version = state.pending!.version;
  assert.deepEqual(
    getProposalSources(state, version).map((message) => message.text),
    ['一起慢慢来', reply.text],
  );
  state = reduce(state, {
    type: 'propose',
    actor: 'friend',
    expected: version,
    choice: { kind: 'style', style: 'curious/v1' },
    sourceIds: [1, reply.id],
    reason: '',
  });
  assert.equal(state.pending!.sources.length, 2);
  assert.equal(state.active, ORIGINAL);
  assert.equal(accept(state, 'sender').active, 'curious/v1');
});

void test('presentation respects reduced motion, rest, alarm and recovery', () => {
  const base = { resting: false, alarm: 0, phase: 'alone' } as const;
  assert.ok(motionAllowed(base, false));
  assert.equal(motionAllowed(base, true), false);
  assert.equal(motionAllowed({ ...base, resting: true }, false), false);
  assert.equal(motionAllowed({ ...base, alarm: 0.2 }, false), false);
  assert.equal(motionAllowed({ ...base, phase: 'startle' }, false), false);
  assert.equal(motionAllowed({ ...base, phase: 'recover' }, false), false);
});

void test('three presentation recipes draw distinct marks without mutating the creature', () => {
  const creature = new Creature();
  const snapshot = JSON.stringify(creature);
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    { get: (_target, name) => () => calls.push(String(name)) },
  ) as CanvasRenderingContext2D;
  for (const [style, method] of [
    ['calm/v1', 'ellipse'],
    ['playful/v1', 'fillRect'],
    ['curious/v1', 'quadraticCurveTo'],
  ] as const) {
    calls.length = 0;
    drawTemperament(ctx, 1200, 800, creature, style, 2.5, false);
    assert.ok(calls.includes(method));
    assert.equal(JSON.stringify(creature), snapshot);
    calls.length = 0;
    drawTemperament(ctx, 1200, 800, creature, style, 2.5, true);
    assert.equal(calls.length, 0);
  }
});
