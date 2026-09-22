import { useEffect, useRef, useState, type Dispatch } from 'react';
import {
  ACTOR_NAMES,
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
  dispatch: Dispatch<SharedAction>;
  trial: StyleKey | null;
  onTrial: (key: StyleKey | null) => void;
};
type Mode = 'reply' | 'memory' | 'style' | 'watch';
export default function SharedExperience({
  state,
  dispatch,
  trial,
  onTrial,
}: Props) {
  const [actor, setActor] = useState<Actor>('friend');
  const [mode, setMode] = useState<Mode | null>(null);
  const [watching, setWatching] = useState(false);
  const [text, setText] = useState('');
  const [sources, setSources] = useState<number[]>([]);
  const [style, setStyle] = useState<StyleKey>(ORIGINAL);
  const [expected, setExpected] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = state.pending;
  const availableSources = getProposalSources(state, expected);
  const replies = state.messages.filter((m) => m.id !== 1);
  useEffect(() => {
    if (mode) dialog.current?.showModal();
  }, [mode]);
  const close = () => {
    dialog.current?.close();
    setMode(null);
    setWatching(false);
    onTrial(null);
  };
  const open = (next: Mode, proposal?: Proposal) => {
    onTrial(null);
    setWatching(false);
    setText(proposal?.reason ?? '');
    setSources(proposal?.sources.map((m) => m.id) ?? []);
    setStyle(
      proposal?.choice.kind === 'style' ? proposal.choice.style : state.active,
    );
    setExpected(proposal?.version ?? null);
    setMode(next);
  };
  const switchActor = (next: Actor) => {
    close();
    setActor(next);
  };
  const submit = () => {
    if (!mode || mode === 'watch') return;
    if (mode === 'reply') dispatch({ type: 'message', actor, text });
    else
      dispatch({
        type: 'propose',
        actor,
        expected,
        sourceIds: sources,
        reason: text,
        choice:
          mode === 'style' ? { kind: 'style', style } : { kind: 'memory' },
      });
    close();
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
      <span>{m.actor === actor ? '你' : '朋友'}留下的话</span>
      <p>{m.text}</p>
    </div>
  );
  return (
    <div className="shared-experience">
      <div className="shared-role">
        <label htmlFor="shared-role">体验身份</label>
        <select
          id="shared-role"
          value={actor}
          onChange={(e) => switchActor(e.target.value as Actor)}
        >
          <option value="sender">送出心意的人</option>
          <option value="friend">收到心意的人</option>
        </select>
        <small>同机演示两个身份 · 没有真实发送</small>
      </div>
      {replies.length > 2 && (
        <details className="shared-history">
          <summary>之前的话（{replies.length - 2}）</summary>
          {replies.slice(0, -2).map(renderMessage)}
        </details>
      )}
      {replies.slice(-2).map(renderMessage)}
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
            onClick={() => open('memory')}
          >
            留下这一刻
          </button>
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
            {pending.author === actor ? '你提出的选择' : '朋友想和你一起'}
          </span>
          <h3>{choiceName(pending)}</h3>
          {pending.reason && <p>{pending.reason}</p>}
          <details className="shared-history">
            <summary>来自哪段话</summary>
            {pending.sources.map((m) => (
              <blockquote key={m.id}>
                <small>{ACTOR_NAMES[m.actor]}</small>
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
                  等待另一个体验身份选择。你们可以慢慢来。
                </p>
                <button
                  className="gift-text"
                  onClick={() => {
                    dispatch({
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
                    dispatch({
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
                    dispatch({
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
                  open(
                    pending.choice.kind === 'style' ? 'style' : 'memory',
                    pending,
                  );
                }}
              >
                {pending.choice.kind === 'style' ? '换一种试试' : '修改提议'}
              </button>
            )}
          </div>
        </section>
      )}
      {state.history.length > 0 && (
        <details className="shared-history shared-traces">
          <summary>一起留下的痕迹（{state.history.length}）</summary>
          {state.history
            .slice()
            .reverse()
            .map((record) => (
              <article key={record.version}>
                <h3>{choiceName(record)}</h3>
                <small>
                  两个体验身份已确认 ·{' '}
                  {new Date(record.at).toLocaleDateString('zh-CN')}
                </small>
                {record.reason && <p>{record.reason}</p>}
                {record.sources.map((m) => (
                  <blockquote key={m.id}>
                    <small>{ACTOR_NAMES[m.actor]}</small>
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
                        dispatch({
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
                {record.choice.kind === 'memory' &&
                  (state.memories.some((m) => m.version === record.version) ? (
                    <button
                      className="gift-text"
                      disabled={!!pending}
                      onClick={() =>
                        dispatch({
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
                  : '留下这一刻'
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
                : mode === 'watch'
                  ? '看看这个样子'
                  : mode === 'style'
                    ? '一起塑造小莹'
                    : '留下这一刻'}
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
            <p className="shared-muted">
              {mode === 'reply'
                ? '只留在本页演示，不会发送给朋友。'
                : '你先选择，另一个体验身份确认后才生效。'}
            </p>
            {mode !== 'reply' && (
              <fieldset className="shared-sources">
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
                      <small>{ACTOR_NAMES[m.actor]}</small>
                      {m.text}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {mode === 'style' && (
              <fieldset className="shared-style-options">
                <legend>你希望它是什么样</legend>
                {STYLE_KEYS.map((key) => (
                  <label key={key} aria-label={TEMPERAMENTS[key].name}>
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
                      <strong>{TEMPERAMENTS[key].name}</strong>
                      <small>{TEMPERAMENTS[key].detail}</small>
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
              {mode === 'reply'
                ? '想对朋友说的话'
                : '为什么想留下它？也可以留白'}
            </label>
            <textarea
              id="shared-draft"
              rows={2}
              maxLength={80}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="shared-editor-actions">
              <button className="gift-text" onClick={close}>
                取消
              </button>
              <button
                className="gift-save"
                disabled={
                  mode === 'reply'
                    ? !text.trim()
                    : !availableSources.some((source) =>
                        sources.includes(source.id),
                      )
                }
                onClick={submit}
              >
                {mode === 'reply'
                  ? '留在这次交流里'
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
