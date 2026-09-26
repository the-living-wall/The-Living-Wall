import { useEffect, useRef, useState } from 'react';
import Companion from './Companion';
import { api, ApiError } from './gift-api';
import type { GiftView } from '../../services/gifts/store';
import type { SharedAction, SharedState } from './shared-state';

const KEY = 'xiaoying-friends-access-v1';
const RETENTION_NOTICE =
  '这份心意保留 7 天，到期后就不能再打开了，留言和共同记录也会被清理。';
const BACKUP_NOTICE = '服务商的备份会按其保存期限清除，可能不会立即消失。';
const RETURN_NOTICE =
  '想回来看看，请继续使用这个浏览器；清除浏览器的网站数据后，可能找不回来。';
type Access = {
  id: string;
  token: string;
  invite?: string;
  label: string;
  actor: 'sender' | 'friend';
};
type Pending = { action: SharedAction; revision: number; op: string };
export type Connection = {
  view: GiftView | null;
  busy: boolean;
  error: string;
  saved: Access[];
  create: (text: string, names: SharedState['names']) => Promise<void>;
  send: (action: SharedAction) => Promise<boolean>;
  remove: () => Promise<void>;
  exit: () => void;
  open: (id: string) => void;
  invitation: string;
  retry: () => Promise<boolean>;
  hasPending: boolean;
  pendingAction: SharedAction | null;
  creationPending: boolean;
  creationDraft: { text: string; names: SharedState['names'] } | null;
};
function random() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
export default function OnlineApp() {
  const [selected, setSelected] = useState(
    () => new URL(location.href).searchParams.get('gift') || '',
  );
  const [saved, setSaved] = useState<Access[]>(() => read(KEY, []));
  const [view, setView] = useState<GiftView | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [hasPending, setHasPending] = useState(false);
  const lock = useRef(false),
    epoch = useRef(0);
  const [invitation, setInvitation] = useState(() => {
    const params = new URLSearchParams(location.hash.slice(1)),
      invite = params.get('invite');
    if (invite && /^[a-f0-9]{64}$/.test(invite)) {
      sessionStorage.setItem('gift-invite:' + selected, invite);
      history.replaceState(null, '', location.pathname + location.search);
    }
    return invite || sessionStorage.getItem('gift-invite:' + selected) || '';
  });
  const access = saved.find((item) => item.id === selected);
  const merge = (v: GiftView) =>
    setView((old) => (old?.id === v.id && old.revision > v.revision ? old : v));
  const saveAccess = (entry: Access) => {
    const list = [
      entry,
      ...read<Access[]>(KEY, []).filter((item) => item.id !== entry.id),
    ].slice(0, 50);
    write(KEY, list);
    setSaved(list);
  };
  const open = (id: string) => {
    epoch.current++;
    setView(null);
    setError('');
    setInvitation('');
    setSelected(id);
    history.pushState(null, '', id ? `?gift=${id}` : location.pathname);
  };
  useEffect(() => {
    const pop = () => location.reload();
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    if (!access) return;
    let stopped = false,
      running = false;

    const sync = async () => {
      if (stopped || running || document.hidden) return;
      running = true;
      try {
        setHasPending(!!read('gift-pending:' + selected, null));
        const value = await api(
          '/' + access.id,
          'GET',
          undefined,
          access.token,
        );
        if (!stopped) merge(value);
      } catch (e) {
        if (!stopped) {
          setError(
            e instanceof ApiError
              ? e.message
              : '连接暂时中断，未发送的文字会保留。',
          );
          if (e instanceof ApiError && [403, 404].includes(e.status)) {
            stopped = true;
            setView(null);
          }
        }
      } finally {
        running = false;
      }
    };
    void sync();
    const timer = setInterval(sync, 3000);
    document.addEventListener('visibilitychange', sync);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [selected, access]);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
      return true;
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : '连接或本机保存失败，请重试；输入仍保留。',
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const create = async (text: string, names: SharedState['names']) => {
    await run(async () => {
      const key = 'gift-create-pending';
      const pending = read<Record<string, string> | null>(key, null) || {
        owner: random(),
        invite: random(),
        text,
        sender: names.sender,
        friend: names.friend,
      };
      write(key, pending); // Persist before the request so a lost response is recoverable.
      let result: GiftView;
      try {
        result = await api('', 'POST', pending);
      } catch (e) {
        if (e instanceof ApiError && !e.retryable) localStorage.removeItem(key);
        throw e;
      }
      saveAccess({
        id: result.id,
        token: pending.owner,
        invite: pending.invite,
        actor: 'sender',
        label: pending.friend || '朋友',
      });
      localStorage.removeItem(key);
      open(result.id);
      merge(result);
    });
  };
  const claim = async () => {
    await run(async () => {
      const key = 'gift-claim:' + selected;
      const credential = read<string | null>(key, null) || random();
      write(key, credential);
      const result = await api('/' + selected + '/claim', 'POST', {
        invite: invitation,
        friend: credential,
      });
      saveAccess({
        id: result.id,
        token: credential,
        actor: 'friend',
        label: result.state.names.sender || '朋友',
      });
      localStorage.removeItem(key);
      sessionStorage.removeItem('gift-invite:' + selected);
      setInvitation('');
      merge(result);
    });
  };
  const transmit = async (pending: Pending) => {
    if (!access) throw new Error('No access');
    const key = 'gift-pending:' + selected,
      generation = epoch.current;
    write(key, pending);
    setHasPending(true);
    try {
      const result = await api(
        '/' + selected + '/actions',
        'POST',
        pending,
        access.token,
      );
      localStorage.removeItem(key);
      setHasPending(false);
      if (generation === epoch.current) merge(result);
    } catch (e) {
      if (e instanceof ApiError && !e.retryable) {
        localStorage.removeItem(key);
        setHasPending(false);
        if (e.status === 409) {
          const result = await api(
            '/' + selected,
            'GET',
            undefined,
            access.token,
          );
          if (generation === epoch.current) merge(result);
        }
      }
      throw e;
    }
  };
  const send = async (action: SharedAction) =>
    run(async () => {
      if (!view) throw new Error('No view');
      const pending = read<Pending | null>('gift-pending:' + selected, null);
      if (pending)
        throw new ApiError(
          409,
          '上次操作结果尚未确认，请先点击“重试上次操作”。',
        );
      await transmit({ action, revision: view.revision, op: random() });
    });
  const retry = async () =>
    run(async () => {
      const pending = read<Pending | null>('gift-pending:' + selected, null);
      if (pending) await transmit(pending);
    });
  const remove = async () => {
    await run(async () => {
      if (
        !access ||
        !confirm(
          '删除后，双方的留言和共同记录都会移除，无法恢复。确定删除整份心意吗？',
        )
      )
        return;
      await api('/' + selected, 'DELETE', undefined, access.token);
      const list = saved.filter((item) => item.id !== selected);
      write(KEY, list);
      setSaved(list);
      localStorage.removeItem('gift-pending:' + selected);
      open('');
    });
  };
  if (selected && !view)
    return (
      <main className="online-entry">
        <p className="eyebrow">小莹 · 给朋友的一份心意</p>
        <h1>{access ? '正在找回这份交流' : '有人为你留了一点光。'}</h1>
        <p>接受后，这个浏览器成为接收方。发送者可以删除整份心意。无需注册。</p>
        <p>{RETENTION_NOTICE}</p>
        <p>{BACKUP_NOTICE}</p>
        {error && <p role="alert">{error}</p>}
        {!access && invitation ? (
          <button
            className="gift-text gift-send"
            disabled={busy}
            onClick={claim}
          >
            {busy ? '正在接受…' : '接受这份心意'}
          </button>
        ) : (
          !access && <p>请使用完整邀请链接，或回到原来接受邀请的浏览器。</p>
        )}
        <button className="gift-text" onClick={() => open('')}>
          回到小莹
        </button>
      </main>
    );
  const creation = read<Record<string, string> | null>(
    'gift-create-pending',
    null,
  );
  const connection: Connection = {
    view,
    busy,
    error,
    saved,
    create,
    send,
    remove,
    retry,
    hasPending,
    pendingAction: hasPending
      ? (read<Pending | null>('gift-pending:' + selected, null)?.action ?? null)
      : null,
    creationPending: !!creation,
    creationDraft: creation
      ? {
          text: creation.text,
          names: { sender: creation.sender, friend: creation.friend },
        }
      : null,
    open,
    exit: () => open(''),
    invitation: access?.invite
      ? `${location.origin}${location.pathname}?gift=${selected}#invite=${access.invite}`
      : '',
  };
  return <Companion key={selected || 'new'} connection={connection} />;
}

export function ConnectionPanel({
  connection: c,
  mode,
}: {
  connection: Connection;
  mode: 'home' | 'create' | 'receive';
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 4000);
    return () => window.clearTimeout(timer);
  }, [copyState]);
  const linkInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (copyState === 'failed') {
      linkInput.current?.focus();
      linkInput.current?.select();
    }
  }, [copyState]);
  const friendReplied = c.view?.state.messages.some(
    (message) => message.actor === 'friend',
  );
  return (
    <div className={`connection-panel connection-${mode}`}>
      {c.view && mode === 'receive' ? (
        <>
          {c.invitation && (
            <section className="gift-share" aria-label="把心意分享给朋友">
              <button
                className={`gift-text${friendReplied ? '' : ' gift-send'}`}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(c.invitation);
                    setCopyState('copied');
                  } catch {
                    setCopyState('failed');
                  }
                }}
              >
                复制邀请链接 ↗
              </button>
              <output>
                {copyState === 'failed'
                  ? '没能自动复制，请选中下方完整链接，手动复制。'
                  : copyState === 'copied'
                    ? '链接已复制，粘贴给这位朋友即可。'
                    : ''}
              </output>
              {copyState === 'failed' && (
                <input
                  ref={linkInput}
                  aria-label="朋友的邀请链接"
                  readOnly
                  value={c.invitation}
                  onFocus={(e) => e.target.select()}
                />
              )}
            </section>
          )}
          {c.view.actor === 'sender' && (
            <details className="gift-management">
              <summary>管理这份心意</summary>
              <button
                className="gift-text"
                disabled={c.busy}
                onClick={c.remove}
              >
                删除整份心意
              </button>
            </details>
          )}
        </>
      ) : (
        <>
          {mode === 'create' && (
            <div className="gift-storage-summary">
              <span>交流保存 7 天</span>
              <StorageNotice />
            </div>
          )}
          {c.saved.length > 0 && (
            <details>
              <summary>我的心意（{c.saved.length}）</summary>
              {c.saved.map((item) => (
                <button
                  key={item.id}
                  className="gift-text"
                  onClick={() => c.open(item.id)}
                >
                  {item.actor === 'sender' ? '送给' : '来自'} {item.label}
                </button>
              ))}
            </details>
          )}
        </>
      )}
      {(c.error || (c.creationPending && !c.busy)) && (
        <p role="alert">
          {c.creationPending ? '暂未收到保存确认，内容已保留。' : c.error}
        </p>
      )}
      {c.hasPending && (
        <button className="gift-text" disabled={c.busy} onClick={c.retry}>
          重试上次操作
        </button>
      )}
    </div>
  );
}

function StorageNotice() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        className="gift-text gift-storage-trigger"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        保存说明
      </button>
      <dialog
        ref={dialog}
        className="gift-storage-dialog"
        aria-label="保存说明"
      >
        <div className="gift-storage-heading">
          <h3>关于这份心意</h3>
          <button
            className="gift-text"
            onClick={() => dialog.current?.close()}
            autoFocus
          >
            关闭
          </button>
        </div>
        <p>{RETENTION_NOTICE}</p>
        <p>{RETURN_NOTICE}</p>
        <p>{BACKUP_NOTICE}</p>
      </dialog>
    </>
  );
}

export function RetentionPanel({ connection: c }: { connection: Connection }) {
  if (!c.view) return null;
  return (
    <div className="connection-panel connection-retention">
      <p className="gift-retention" aria-label="这份交流的保存期限">
        这份心意可查看至{' '}
        {new Date(c.view.expires).toLocaleDateString('zh-CN', {
          month: 'long',
          day: 'numeric',
        })}
      </p>
      <StorageNotice />
    </div>
  );
}
