import { Creature } from '../../lib/creature';
import { CreatureRenderer } from '../../lib/draw-creature';
type WidgetState = {
  modelContent?: { prototype?: string; intent?: string; view?: string };
  privateContent?: { note?: string; echo?: string; noteSaved?: boolean };
};
const host = (
  window as Window & {
    openai?: {
      widgetState?: WidgetState;
      setWidgetState?: (state: WidgetState) => Promise<void>;
    };
  }
).openai;
const root = document.getElementById('quiet-gift')!;
const get = <T extends HTMLElement = HTMLElement>(id: string) =>
  root.querySelector<T>('#q-' + id)!;
const presets = {
  rest: ['陪你一会儿', '最近辛苦了。\n没什么要紧的事，只是想陪你歇一会儿。'],
  thanks: ['想谢谢你', '你陪我说的那些话，我一直记得。\n谢谢你在。'],
  joy: ['分你一点开心', '今天遇到一件开心的小事，\n第一个就想告诉你。'],
};
let intent: keyof typeof presets = 'rest',
  view = 'create',
  note = presets.rest[1],
  echo = '',
  noteSaved = false,
  paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
const editor = get<HTMLTextAreaElement>('message');
function save() {
  host
    ?.setWidgetState?.({
      modelContent: { prototype: 'quiet-gift-v2', view, intent },
      privateContent: { note, echo, noteSaved },
    })
    ?.catch(() => {});
}
function restore(s?: WidgetState) {
  if (s?.modelContent?.prototype !== 'quiet-gift-v2') return;
  const m = s.modelContent,
    p = s.privateContent;
  if (m.intent && Object.hasOwn(presets, m.intent))
    intent = m.intent as keyof typeof presets;
  if (m.view && ['create', 'receive'].includes(m.view)) view = m.view;
  if (typeof p?.note === 'string') note = p.note.slice(0, 80);
  if (typeof p?.echo === 'string') echo = p.echo.slice(0, 80);
  noteSaved = p?.noteSaved === true;
}
function close() {
  get('editor').hidden = true;
  get('intents').hidden = true;
  get('change').setAttribute('aria-expanded', 'false');
}
function render() {
  const receiving = view === 'receive';
  get('title').textContent = receiving
    ? '这束光，\n是为你留下的。'
    : '给一个人，\n留一点光。';
  get('copy').textContent = receiving
    ? note
    : '有些心意，不必说很多。\n让小莹，陪你一起表达。';
  get('mood').hidden = receiving;
  get('intent-label').textContent = presets[intent][0];
  get('sub').textContent = receiving
    ? echo
      ? '回声已留在本页演示里。'
      : '不必回应，歇一会儿就好。'
    : '慢慢靠近，按你的节奏来。';
  get('note').textContent = receiving
    ? echo
      ? '编辑回声'
      : '留一点回声'
    : noteSaved
      ? '编辑留言'
      : '捎一句话';
  get('save').textContent = receiving ? '留下回声' : '保存留言';
  get('next').textContent = receiving ? '安静收下' : '看看收到的样子 ↗';
  get('next').classList.toggle('q-primary', !receiving);
  get('pause').textContent = paused ? '播放' : '暂停';
  get('pause').setAttribute('aria-pressed', String(paused));
  root
    .querySelectorAll<HTMLButtonElement>('[data-view]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.view === view)),
    );
  root
    .querySelectorAll<HTMLButtonElement>('[data-intent]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.intent === intent)),
    );
  updateStatus();
}
function navigate(next: string) {
  view = next;
  close();
  render();
  save();
}
root
  .querySelectorAll<HTMLButtonElement>('[data-view]')
  .forEach((b) => (b.onclick = () => navigate(b.dataset.view!)));
get('change').onclick = () => {
  get('editor').hidden = true;
  get('intents').hidden = !get('intents').hidden;
  get('change').setAttribute('aria-expanded', String(!get('intents').hidden));
  if (!get('intents').hidden)
    get('intents')
      .querySelector<HTMLButtonElement>('[aria-pressed=true]')
      ?.focus();
};
root.querySelectorAll<HTMLButtonElement>('[data-intent]').forEach(
  (b) =>
    (b.onclick = () => {
      const prev = presets[intent][1];
      intent = b.dataset.intent as keyof typeof presets;
      if (!noteSaved && note === prev) note = presets[intent][1];
      close();
      render();
      save();
      get('change').focus();
    }),
);
get('note').onclick = () => {
  get('intents').hidden = true;
  get('change').setAttribute('aria-expanded', 'false');
  get('editor').hidden = !get('editor').hidden;
  editor.value = view === 'create' ? note : echo;
  get('editor-label').textContent =
    view === 'create' ? '捎一句话，也可以留白' : '只在你想回应的时候';
  if (!get('editor').hidden) editor.focus();
};
get('save').onclick = () => {
  if (view === 'create') {
    note = editor.value.trim();
    noteSaved = true;
  } else echo = editor.value.trim();
  close();
  render();
  save();
  get('note').focus();
};
get('cancel').onclick = () => {
  close();
  get('note').focus();
};
get('next').onclick = () => {
  if (view === 'create') navigate('receive');
  else {
    close();
    get('sub').textContent = '愿这点光，陪你走回自己的生活。';
  }
};
get('pause').onclick = () => {
  paused = !paused;
  render();
};
root.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const editing = !get('editor').hidden;
    close();
    get(editing ? 'note' : 'change').focus();
  }
});
const canvas = get<HTMLCanvasElement>('canvas'),
  ctx = canvas.getContext('2d')!,
  creature = new Creature(),
  renderer = new CreatureRenderer();
creature.care = 800;
creature.trust = 0.65;
creature.affection = 0.65;
creature.time = 10;

const phaseCopy: Record<string, string> = {
  alone: '安静地呼吸着',
  observe: '正在留意你的靠近',
  probe: '轻轻试探着',
  approach: '慢慢靠近你',
  bond: '安心地陪着你',
  startle: '有一点受惊',
  recover: '正在缓缓恢复',
  invite: '轻轻邀请你靠近',
  search: '还在寻找你的身影',
};
function updateStatus() {
  const text = paused
    ? '小莹 · 已暂停'
    : `小莹 · ${creature.resting ? '正在休息' : phaseCopy[creature.phase] || '安静地呼吸着'}`;
  if (get('hint').textContent !== text) get('hint').textContent = text;
}
let w = 1000,
  h = 650,
  last = 0,
  lastMove = 0,
  signal = { x: 0.5, y: 0.53, speed: 0, seen: false },
  needsDraw = true;
new ResizeObserver(() => {
  const b = canvas.getBoundingClientRect();
  w = b.width;
  h = b.height;
  const d = Math.min(devicePixelRatio || 1, 2);
  canvas.width = w * d;
  canvas.height = h * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  creature.resize(w, h);
  renderer.particles.forEach((p) => (p.ready = false));
  needsDraw = true;
}).observe(canvas);
function move(e: PointerEvent) {
  const b = canvas.getBoundingClientRect(),
    x = (e.clientX - b.left) / b.width,
    y = (e.clientY - b.top) / b.height,
    now = performance.now(),
    speed = signal.seen
      ? Math.min(
          2,
          Math.hypot(x - signal.x, y - signal.y) /
            Math.max(0.02, (now - lastMove) / 1000),
        )
      : 0;
  signal = { x, y, speed, seen: true };
  lastMove = now;
  needsDraw = true;
}
canvas.onpointermove = move;
canvas.onpointerdown = move;
canvas.onpointerleave = () => (signal.seen = false);
canvas.onpointerup = (e) => {
  if (e.pointerType !== 'mouse') signal.seen = false;
};
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  if (document.hidden || (paused && !needsDraw)) return;
  needsDraw = false;
  if (now - lastMove > 1600) signal.seen = false;
  if (!paused) creature.step(dt, signal);
  updateStatus();
  creature.care = 800;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const scale = w < 680 ? 1.35 : 1.18;
  ctx.save();
  ctx.translate(creature.x * w, creature.y * h);
  ctx.scale(scale, scale);
  ctx.translate(-creature.x * w, -creature.y * h);
  renderer.draw(ctx, w, h, paused ? 0 : dt, creature, false);
  ctx.restore();
}
restore(host?.widgetState);
window.addEventListener('openai:set_globals', (event: Event) => {
  const e = event as CustomEvent<{ globals?: { widgetState?: WidgetState } }>;
  if (e.detail?.globals?.widgetState) {
    restore(e.detail.globals.widgetState);
    render();
  }
});
render();
requestAnimationFrame(frame);
