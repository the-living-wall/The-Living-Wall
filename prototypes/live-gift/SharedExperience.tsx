import { useEffect, useRef, useState } from 'react';
import type { Connection } from './OnlineApp';
import {
  actorName,
  getProposalSources,
  type Actor,
  type Proposal,
  type SharedAction,
  type SharedState,
} from './shared-state';
import {
  ORIGINAL,
  STYLE_KEYS,
  TEMPERAMENTS,
  type StyleKey,
} from './temperaments';

type Props = {
  state: SharedState;
  dispatch: (action: SharedAction) => void | Promise<boolean>;
  connection?: Connection;
  trial: StyleKey | null;
  onTrial: (key: StyleKey | null) => void;
};
type Mode = 'reply' | 'style' | 'watch' | 'name';
export default function SharedExperience({
  state,
  dispatch,
  connection,
  trial,
  onTrial,
}: Props) {
  const [localActor, setActor] = useState<Actor>('friend');
  const actor = connection?.view?.actor ?? localActor;
  const [mode, setMode] = useState<Mode | null>(null);
  const [watching, setWatching] = useState(false);
  const [text, setText] = useState('');
  const [sources, setSources] = useState<number[]>([]);
  const [style, setStyle] = useState<StyleKey>(ORIGINAL);
  const [expected, setExpected] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = state.pending;
  const availableSources = getProposalSources(state, expected);
  const messages = state.messages;
  useEffect(() => {
    if (mode) dialog.current?.showModal();
  }, [mode]);
  const close = () => {
    if (connection?.busy) return;
    dialog.current?.close();
    setMode(null);
    setWatching(false);
    onTrial(null);
  };
  const open = (next: Mode, proposal?: Proposal) => {
    const draft = connection?.pendingAction;
    const pendingProposal =
      next === 'style' && draft?.type === 'propose' ? draft : null;
    onTrial(null);
    setWatching(false);
    setText(
      next === 'name'
        ? draft?.type === 'rename'
          ? draft.name
          : state.names[actor]
        : next === 'reply' && draft?.type === 'message'
          ? draft.text
          : (pendingProposal?.reason ?? proposal?.reason ?? ''),
    );
    setSources(
      pendingProposal?.sourceIds ?? proposal?.sources.map((m) => m.id) ?? [],
    );
    setStyle(
      pendingProposal
        ? pendingProposal.choice.kind === 'style'
          ? pendingProposal.choice.style
          : state.active
        : proposal?.choice.kind === 'style'
          ? proposal.choice.style
          : state.active,
    );
    setExpected(
      pendingProposal ? pendingProposal.expected : (proposal?.version ?? null),
    );
    setMode(next);
  };
  const switchActor = (next: Actor) => {
    close();
    setActor(next);
  };
  const submit = async () => {
    if (!mode || mode === 'watch' || connection?.busy) return;
    let action: SharedAction;
    if (mode === 'name') action = { type: 'rename', actor, name: text };
    else if (mode === 'reply') action = { type: 'message', actor, text };
    else
      action = {
        type: 'propose',
        actor,
        expected,
        sourceIds: sources,
        reason: text,
        choice:
          style === state.active
            ? { kind: 'memory' }
            : { kind: 'style', style },
      };
    const result = await dispatch(action);
    if (result !== false) close();
  };
  const choiceName = (p: Proposal) =>
    p.choice.kind === 'style'
      ? p.choice.style === ORIGINAL
        ? '恢复原来的样子'
        : `让小莹多一点${TEMPERAMENTS[p.choice.style].name}`
      : p.choice.kind === 'memory'
        ? '把这一刻留下'
        : '取消这条纪念';
  const renderMessage = (m: SharedState['messages'][number]) => (
    <div className="shared-message" key={m.id}>
      <span>{actorName(state.names, m.actor)}留下的话</span>
      <p>{m.text}</p>
    </div>
  );
  return (
    <div className="shared-experience">
      <div className="shared-role">
        {connection?.view ? (
          <span>
            {actorName(state.names, actor)} ·{' '}
            {actor === 'sender' ? '送出心意' : '收到心意'}
          </span>
        ) : (
          <>
            <label htmlFor="shared-role">体验身份</label>
            <select
              id="shared-role"
              value={actor}
              onChange={(e) => switchActor(e.target.value as Actor)}
            >
              <option value="sender">
                {actorName(state.names, 'sender')} · 送出心意
              </option>
              <option value="friend">
                {actorName(state.names, 'friend')} · 收到心意
              </option>
            </select>
            <small>同机演示两个身份 · 没有真实发送</small>
          </>
        )}
        <button
          className="gift-text shared-name-edit"
          onClick={() => open('name')}
        >
          修改我的称呼
        </button>
      </div>
      <section className="shared-conversation" aria-label="我们的对话">
        {messages.length > 4 && (
          <details className="shared-history">
            <summary>之前的话（{messages.length - 4}）</summary>
            {messages.slice(0, -4).map(renderMessage)}
          </details>
        )}
        {messages.slice(-4).map(renderMessage)}
      </section>
      <button className="gift-text shared-reply" onClick={() => open('reply')}>
        回一句给朋友
      </button>
      <section className="shared-current" aria-label="共同小莹的选择">
        <span className="shared-eyebrow">我们的小莹</span>
        <strong data-testid="active-temperament">
          {TEMPERAMENTS[state.active].name}
        </strong>
        <p>{TEMPERAMENTS[state.active].detail}</p>
        <div className="shared-links">
          <button
            className="gift-text"
            disabled={!!pending}
            onClick={() => open('style')}
          >
            一起塑造小莹
          </button>
        </div>
      </section>
      {trial && (
        <output className="shared-trial">
          正在试看：{TEMPERAMENTS[trial].name}
          <small>共同选择尚未改变</small>
          <button className="gift-text" onClick={() => onTrial(null)}>
            结束试看
          </button>
        </output>
      )}
      {pending && (
        <section className="shared-pending" aria-label="待共同确认的提议">
          <span className="shared-eyebrow">
            {actorName(pending.names, pending.author)}提出的选择
          </span>
          <h3>{choiceName(pending)}</h3>
          {pending.reason && <p>{pending.reason}</p>}
          <details className="shared-history">
            <summary>来自哪段话</summary>
            {pending.sources.map((m) => (
              <blockquote key={m.id}>
                <small>{m.name ?? actorName(state.names, m.actor)}</small>
                {m.text}
              </blockquote>
            ))}
          </details>
          {pending.choice.kind === 'style' && (
            <button
              className="gift-text"
              onClick={() => {
                if (pending.choice.kind !== 'style') return;
                open('watch', pending);
                setWatching(true);
                onTrial(pending.choice.style);
              }}
            >
              看看这个样子
            </button>
          )}
          <div className="shared-links">
            {pending.author === actor ? (
              <>
                <p className="shared-muted">
                  等待
                  {actorName(
                    state.names,
                    actor === 'sender' ? 'friend' : 'sender',
                  )}
                  选择。你们可以慢慢来。
                </p>
                <button
                  className="gift-text"
                  onClick={() => {
                    void dispatch({
                      type: 'withdraw',
                      actor,
                      version: pending.version,
                    });
                    onTrial(null);
                  }}
                >
                  撤回提议
                </button>
              </>
            ) : (
              <>
                <button
                  className="gift-text gift-send"
                  onClick={() => {
                    void dispatch({
                      type: 'accept',
                      actor,
                      version: pending.version,
                      at: Date.now(),
                    });
                    onTrial(null);
                  }}
                >
                  {pending.choice.kind === 'remove-memory'
                    ? '确认取消这条纪念'
                    : '就这样，一起留下'}
                </button>
                <button
                  className="gift-text"
                  onClick={() => {
                    void dispatch({
                      type: 'decline',
                      actor,
                      version: pending.version,
                    });
                    onTrial(null);
                  }}
                >
                  先保持现在
                </button>
              </>
            )}
            {pending.choice.kind !== 'remove-memory' && (
              <button
                className="gift-text"
                onClick={() => {
                  open('style', pending);
                }}
              >
                调整这个选择
              </button>
            )}
          </div>
        </section>
      )}
      {state.history.length > 0 && (
        <details className="shared-history shared-traces">
          <summary>我们的共同记录（{state.history.length}）</summary>
          {state.history
            .slice()
            .reverse()
            .map((record) => (
              <article key={record.version}>
                <h3>{choiceName(record)}</h3>
                <small>
                  {actorName(record.names, 'sender')}与
                  {actorName(record.names, 'friend')}已确认 ·{' '}
                  {new Date(record.at).toLocaleDateString('zh-CN')}
                </small>
                {record.reason && <p>{record.reason}</p>}
                {record.sources.map((m) => (
                  <blockquote key={m.id}>
                    <small>{m.name ?? actorName(state.names, m.actor)}</small>
                    {m.text}
                  </blockquote>
                ))}
                {record.choice.kind === 'style' && (
                  <>
                    <p className="shared-muted">
                      {TEMPERAMENTS[record.previous].name} →{' '}
                      {TEMPERAMENTS[record.result].name}
                    </p>
                    <button
                      className="gift-text"
                      disabled={!!pending || state.active === record.previous}
                      onClick={() =>
                        void dispatch({
                          type: 'propose',
                          actor,
                          expected: null,
                          choice: { kind: 'style', style: record.previous },
                          sourceIds: [],
                          historyVersion: record.version,
                          reason: '想一起恢复这次选择前的样子。',
                        })
                      }
                    >
                      提议恢复此前的样子
                    </button>
                  </>
                )}
                {record.keepsMoment &&
                  (state.memories.some((m) => m.version === record.version) ? (
                    <button
                      className="gift-text"
                      disabled={!!pending}
                      onClick={() =>
                        void dispatch({
                          type: 'propose',
                          actor,
                          expected: null,
                          choice: {
                            kind: 'remove-memory',
                            memoryId: record.version,
                          },
                          sourceIds: [],
                          reason: '想一起取消这条纪念，保留原对话。',
                        })
                      }
                    >
                      提议取消这条纪念
                    </button>
                  ) : (
                    <p className="shared-muted">
                      这条纪念已取消，原对话仍保留。
                    </p>
                  ))}
              </article>
            ))}
        </details>
      )}
      <output className="shared-feedback">{state.feedback}</output>
      {mode && (
        <dialog
          ref={dialog}
          className={`shared-editor${watching ? ' is-watching' : ''}`}
          aria-label={
            mode === 'reply'
              ? '回一句给朋友'
              : mode === 'watch'
                ? '看看这个样子'
                : mode === 'style'
                  ? '一起塑造小莹'
                  : '修改我的称呼'
          }
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <div className="shared-editor-heading">
            <h3>
              {mode === 'reply'
                ? '回一句给朋友'
                : mode === 'name'
                  ? '修改我的称呼'
                  : mode === 'watch'
                    ? '看看这个样子'
                    : mode === 'style'
                      ? '一起塑造小莹'
                      : '修改我的称呼'}
            </h3>
            <button
              className="gift-text"
              onClick={close}
              aria-label={mode === 'watch' ? '关闭试看' : '关闭编辑'}
            >
              关闭
            </button>
          </div>
          {watching && (
            <div className="shared-watch-copy">
              <p>正在试看：{TEMPERAMENTS[style].name}</p>
              <small>
                {mode === 'watch'
                  ? '试看不代表同意，返回提议后再作决定。'
                  : '共同选择尚未改变，返回后可以继续选择。'}
              </small>
              <button
                className="gift-text gift-send"
                onClick={() => {
                  if (mode === 'watch') close();
                  else {
                    onTrial(null);
                    setWatching(false);
                  }
                }}
              >
                {mode === 'watch' ? '返回提议' : '返回选择'}
              </button>
            </div>
          )}
          <div hidden={watching}>
            {connection?.error && <p role="alert">{connection.error}</p>}
            {connection?.hasPending && (
              <button
                className="gift-text"
                disabled={connection.busy}
                onClick={async () => {
                  if (await connection.retry()) close();
                }}
              >
                重试上次操作
              </button>
            )}
            <p className="shared-muted">
              {mode === 'name'
                ? '只修改显示称呼，已有共同记录中的署名不变。'
                : mode === 'reply'
                  ? connection
                    ? '确认后回复给这位朋友，内容保存至这份心意到期。'
                    : '只留在本页演示，不会发送给朋友。'
                  : connection
                    ? '你先选择，朋友确认同一版本后才生效。'
                    : '你先选择，另一个体验身份确认后才生效。'}
            </p>
            {mode === 'style' && (
              <fieldset
                className="shared-sources"
                disabled={connection?.hasPending || connection?.busy}
              >
                <legend>从你们的话里，选一段来由</legend>
                {expected !== null && (
                  <p className="shared-muted">
                    保留提议时的原文，也可以选后来留下的话。
                  </p>
                )}
                {availableSources.length === 0 && (
                  <p>先回一句话，再留下这一刻。</p>
                )}
                {availableSources.map((m) => (
                  <label key={m.id}>
                    <input
                      type="checkbox"
                      checked={sources.includes(m.id)}
                      onChange={(e) =>
                        setSources(
                          e.target.checked
                            ? [...sources, m.id]
                            : sources.filter((id) => id !== m.id),
                        )
                      }
                    />
                    <span>
                      <small>{m.name ?? actorName(state.names, m.actor)}</small>
                      {m.text}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {mode === 'style' && (
              <fieldset
                className="shared-style-options"
                disabled={connection?.hasPending || connection?.busy}
              >
                <legend>你希望它是什么样</legend>
                {[
                  state.active,
                  ...STYLE_KEYS.filter((key) => key !== state.active),
                  ...(pending?.choice.kind === 'style' &&
                  pending.choice.style !== state.active &&
                  !STYLE_KEYS.includes(pending.choice.style)
                    ? [pending.choice.style]
                    : []),
                ].map((key) => (
                  <label
                    key={key}
                    aria-label={
                      key === state.active
                        ? '保留现在的样子'
                        : `${TEMPERAMENTS[key].name}${!STYLE_KEYS.includes(key) ? '（此前版本）' : ''}`
                    }
                  >
                    <input
                      type="radio"
                      name="shared-style"
                      value={key}
                      checked={style === key}
                      onChange={() => {
                        setStyle(key);
                        onTrial(null);
                      }}
                    />
                    <span>
                      <strong>
                        {key === state.active
                          ? '保留现在的样子'
                          : TEMPERAMENTS[key].name}
                      </strong>
                      <small>
                        {key === state.active
                          ? '把这段话留作纪念，样子不变。'
                          : TEMPERAMENTS[key].detail}
                      </small>
                    </span>
                  </label>
                ))}
                <button
                  className="gift-text gift-send"
                  type="button"
                  onClick={() => {
                    onTrial(style);
                    setWatching(true);
                  }}
                >
                  {trial === style ? '结束试看' : '试看这个样子'}
                </button>
                {trial && (
                  <p className="shared-muted">
                    正在试看 {TEMPERAMENTS[trial].name}；尚未共同选择。
                  </p>
                )}
              </fieldset>
            )}
            <label className="shared-draft-label" htmlFor="shared-draft">
              {mode === 'name'
                ? '我的称呼'
                : mode === 'reply'
                  ? '想对朋友说的话'
                  : '为什么想留下它？也可以留白'}
            </label>
            <textarea
              id="shared-draft"
              rows={2}
              maxLength={mode === 'name' ? undefined : 80}
              value={text}
              readOnly={connection?.hasPending || connection?.busy}
              onChange={(e) =>
                setText(
                  mode === 'name'
                    ? Array.from(e.target.value).slice(0, 20).join('')
                    : e.target.value,
                )
              }
            />
            <div className="shared-editor-actions">
              <button className="gift-text" onClick={close}>
                取消
              </button>
              <button
                className="gift-save"
                disabled={
                  connection?.busy ||
                  connection?.hasPending ||
                  (mode === 'name'
                    ? false
                    : mode === 'reply'
                      ? !text.trim()
                      : !availableSources.some((source) =>
                          sources.includes(source.id),
                        ))
                }
                onClick={submit}
              >
                {mode === 'name'
                  ? '保存称呼'
                  : mode === 'reply'
                    ? connection
                      ? '回复给朋友'
                      : '留在这次交流里'
                    : expected !== null
                      ? '提出修改后的选择'
                      : '提出这个选择'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
