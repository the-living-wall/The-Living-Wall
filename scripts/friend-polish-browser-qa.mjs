import { chromium } from 'playwright';
import { createServer as viteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { GiftStore } from '../services/gifts/store.ts';
import { giftServer } from '../services/gifts/server.ts';

const output = resolve('outputs/friend-polish-qa');
await mkdir(output, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), 'friend-polish-'));
const store = new GiftStore(join(temp, 'qa.sqlite'));
const origin = 'http://127.0.0.1:4195';
const gifts = giftServer(store, {
  origin,
  staticDir: resolve('outputs/gifts/site'),
  limit: 2000,
});
await new Promise((r) => gifts.listen(4195, '127.0.0.1', r));
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
};
const home = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const file = resolve(
      'dist/client',
      '.' +
        (url.pathname.endsWith('/')
          ? url.pathname + 'index.html'
          : url.pathname),
    );
    if (!file.startsWith(resolve('dist/client') + '/')) throw Error();
    const data = await readFile(file);
    res.setHeader(
      'Content-Type',
      mime[extname(file)] || 'application/octet-stream',
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => home.listen(4196, '127.0.0.1', r));
const fixture = `import React from 'react'; import {createRoot} from 'react-dom/client'; import Sound from '/app/sound-controls.tsx'; import '/app/globals.css';
createRoot(document.getElementById('root')).render(React.createElement(Sound,{creature:{current:{}},autoStart:false}));`;
const audioMock = `export const DEFAULT_SOUND_VOLUMES={breathing:1,heartMouth:1,curiosityHand:1,touch:1,enjoyment:1,scales:1,movement:1,rotation:1,startle:1};
export class CreatureAudio { constructor(){window.__engines=(window.__engines||0)+1;} setCueVolume(){} volume(){} update(){} audition(){} close(){if(!this.closed){this.closed=true;window.__engines--;}} async start(){if(!window.__effects)throw Error('effects blocked');} }`;
const sound = await viteServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: { '@': process.cwd() } },
  plugins: [
    {
      name: 'sound-qa-fixture',
      configureServer(server) {
        server.middlewares.use('/_qa', async (_req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end(
            await server.transformIndexHtml(
              '/_qa',
              '<div id="root"></div><script type="module" src="/virtual-sound-qa.jsx"></script>',
            ),
          );
        });
      },
      resolveId(id) {
        if (id === '/virtual-sound-qa.jsx') return '\0sound-qa.jsx';
      },
      load(id) {
        if (id === '\0sound-qa.jsx') return fixture;
      },
      transform(code, id) {
        if (id.endsWith('/lib/creature-audio.ts'))
          return { code: audioMock, map: null };
      },
    },
    react(),
  ],
  server: { host: '127.0.0.1', port: 4197, strictPort: true },
  logLevel: 'error',
});
await sound.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const check = (name) => {
  results.push(name);
  console.log('PASS', name);
};
try {
  for (const [effects, music] of [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ]) {
    const context = await browser.newContext();
    const p = await context.newPage();
    await p.addInitScript(
      ({ effects, music }) => {
        window.__effects = effects;
        window.__music = music;
        window.Audio = class {
          paused = true;
          async play() {
            if (!window.__music) throw Error('music blocked');
            this.paused = false;
          }
          pause() {
            this.paused = true;
          }
        };
      },
      { effects, music },
    );
    await p.goto('http://127.0.0.1:4197/_qa');
    await p.getByRole('button', { name: '开启声音', exact: true }).click();
    const on = effects || music;
    await p
      .getByRole('button', { name: on ? '关闭声音' : '开启声音', exact: true })
      .waitFor();
    assert.equal(
      await p
        .getByRole('button', {
          name: on ? '关闭声音' : '开启声音',
          exact: true,
        })
        .getAttribute('aria-pressed'),
      String(on),
    );
    if (effects !== music) {
      assert.match(
        await p.locator('.sound-message').innerText(),
        effects
          ? /互动音效已开启，背景音乐暂未启动/
          : /背景音乐已开启，互动音效暂未启动/,
      );
      await p.evaluate(() => {
        window.__effects = true;
        window.__music = true;
      });
      await p.getByRole('button', { name: '重试未启动的声音' }).click();
      await p.locator('.sound-message').waitFor({ state: 'hidden' });
    }
    if (on) {
      await p.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await p.getByRole('button', { name: '开启声音', exact: true }).waitFor();
      await p.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          value: false,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await p.getByRole('button', { name: '关闭声音', exact: true }).click();
      await p.getByRole('button', { name: '开启声音', exact: true }).waitFor();
      assert.equal(await p.evaluate(() => window.__engines), 0);
      await p.evaluate(() => {
        for (const value of [true, false]) {
          Object.defineProperty(document, 'hidden', {
            configurable: true,
            value,
          });
          document.dispatchEvent(new Event('visibilitychange'));
        }
      });
      assert.equal(
        await p.getByRole('button', { name: '开启声音', exact: true }).count(),
        1,
      );
    }
    check(`audio effects=${effects} music=${music}, retry/toggle/visibility`);
    await context.close();
  }
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: width === 390,
    });
    const p = await context.newPage();
    await p.goto('http://127.0.0.1:4196/');
    const entry = p.getByRole('link', { name: /给朋友留一份心意/ });
    await entry.waitFor();
    const hit = await entry.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return {
        hit: e.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        ),
        height: r.height,
      };
    });
    assert(hit.hit && hit.height >= 44);
    await p.screenshot({ path: join(output, `home-${width}.png`) });
    await p.route('**/friends/', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Friends navigation reached</h1>',
      }),
    );
    if (width === 390) await entry.tap();
    else await entry.click();
    await p
      .getByRole('heading', { name: 'Friends navigation reached' })
      .waitFor();
    check(
      `homepage ${width}: actual anchor receives touch/click and navigates`,
    );
    await context.close();
  }
  const sender = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    friend = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
  const a = await sender.newPage(),
    b = await friend.newPage();
  a.setDefaultTimeout(10000);
  b.setDefaultTimeout(10000);
  await a.goto(origin);
  await a.getByRole('button', { name: /送给朋友/ }).click();
  assert.equal(await a.locator('.friend-guide').count(), 0);
  const create = a.getByRole('button', { name: '生成分享链接 ↗', exact: true });
  assert(await create.evaluate((e) => !!e.closest('.gift-guide')));
  await a.screenshot({
    path: join(output, 'create-desktop.png'),
    fullPage: true,
  });
  await a.setViewportSize({ width: 390, height: 844 });
  assert(
    await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await a.screenshot({
    path: join(output, 'create-mobile.png'),
    fullPage: true,
  });
  await a.setViewportSize({ width: 1280, height: 900 });
  // Simulate a lost response AFTER the local server has saved the creation.
  const payloads = [];
  await a.route('**/api/gifts', async (route) => {
    payloads.push(route.request().postData());
    const response = await route.fetch();
    if (payloads.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await create.click();
  await a
    .getByText('暂未收到保存确认，内容已保留。', { exact: true })
    .waitFor();
  const pending = await a.evaluate(() =>
    localStorage.getItem('gift-create-pending'),
  );
  assert(pending);
  await a.getByRole('button', { name: '重试生成链接', exact: true }).click();
  await a.locator('.shared-experience').waitFor();
  assert.equal(payloads[0], payloads[1]);
  assert.equal(
    await a.evaluate(() => localStorage.getItem('gift-create-pending')),
    null,
  );
  check(
    'lost creation response: persistent error, same request retry, one recovered gift',
  );
  const intro = a.locator('.friend-guide-intro');
  await intro.locator('p').first().waitFor();
  await a.locator('.friend-guide-help summary').focus();
  await a.waitForTimeout(2400);
  assert.equal(await intro.getAttribute('aria-hidden'), 'false');
  await a.getByRole('button', { name: '复制邀请链接 ↗' }).focus();
  await a.mouse.move(1100, 100);
  await a.waitForTimeout(2400);
  assert.equal(await intro.getAttribute('aria-hidden'), 'true');
  await a.locator('.friend-guide-help summary').click();
  await a
    .getByText('留言互动：在这里，和朋友说说话。', { exact: true })
    .last()
    .waitFor();
  await a.locator('.friend-guide-help summary').click();
  await a.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(Error('clipboard denied')) },
    });
  });
  await a.getByRole('button', { name: '复制邀请链接 ↗' }).click();
  const invite = await a.getByLabel('朋友的邀请链接').inputValue();
  assert.equal(
    await a
      .getByLabel('朋友的邀请链接')
      .evaluate((e) => e.selectionEnd - e.selectionStart),
    invite.length,
  );
  await b.goto(invite);
  await b.getByRole('button', { name: '接受这份心意', exact: true }).click();
  await b.locator('.shared-experience').waitFor();
  const say = async (p, text) => {
    await p.getByRole('button', { name: '回一句给朋友', exact: true }).click();
    await p.getByLabel('想对朋友说的话').fill(text);
    await p.getByRole('button', { name: '回复给朋友', exact: true }).click();
    await p.getByRole('dialog').waitFor({ state: 'hidden' });
  };
  for (let i = 0; i < 3; i++) await say(b, `虚构验证留言 ${i + 1}`);
  await a.getByText('虚构验证留言 3', { exact: true }).waitFor();
  assert.equal(
    await a.locator('.shared-conversation > .shared-message').count(),
    3,
  );
  const history = a.locator('.shared-conversation details');
  await history.locator('summary').click();
  await say(b, '虚构验证留言 4');
  await a.getByText('虚构验证留言 4', { exact: true }).waitFor();
  assert(await history.evaluate((e) => e.open));
  assert.equal(
    await a.getByRole('button', { name: '复制邀请链接 ↗' }).count(),
    1,
  );
  assert(
    await a
      .getByRole('button', { name: '复制邀请链接 ↗' })
      .evaluate((e) => !!e.closest('.gift-guide')),
  );
  await a.screenshot({
    path: join(output, 'conversation-desktop.png'),
    fullPage: true,
    mask: [a.getByLabel('朋友的邀请链接')],
  });
  await b.screenshot({
    path: join(output, 'conversation-mobile.png'),
    fullPage: true,
  });
  assert(
    await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await a.reload();
  await a.locator('.shared-experience').waitFor();
  assert.equal(
    await a.locator('.friend-guide-intro').getAttribute('aria-hidden'),
    'true',
  );
  check(
    'conversation: guide focus/timing/re-read/once, manual copy fallback, three messages, expanded history survives new reply, single left share, mobile fits',
  );
  await a.addInitScript(() => {
    for (const name of ['getItem', 'setItem']) {
      const original = Storage.prototype[name];
      Storage.prototype[name] = function (key, ...rest) {
        if (key === 'xiaoying-friends-guide-v1')
          throw new DOMException('blocked', 'SecurityError');
        return original.call(this, key, ...rest);
      };
    }
  });
  await a.emulateMedia({ reducedMotion: 'reduce' });
  await a.reload();
  await a.locator('.friend-guide-intro.is-visible').waitFor();
  assert.equal(
    await a
      .locator('.friend-guide-intro')
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    '0s',
  );
  await a.locator('.friend-guide').hover();
  await a.waitForTimeout(2400);
  assert.equal(
    await a.locator('.friend-guide-intro').getAttribute('aria-hidden'),
    'false',
  );
  await a.mouse.move(1100, 100);
  await a.waitForTimeout(2400);
  assert.equal(
    await a.locator('.friend-guide-intro').getAttribute('aria-hidden'),
    'true',
  );
  await a.locator('.friend-guide-help summary').focus();
  await a.keyboard.press('Enter');
  assert(await a.locator('.friend-guide-help').evaluate((e) => e.open));
  check(
    'guide: unavailable storage, reduced motion, hover pause, keyboard persistent help',
  );
  await sender.close();
  await friend.close();
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify({ results, physicalWeChat: false }, null, 2),
  );
  await browser.close();
  await sound.close();
  home.closeAllConnections();
  gifts.closeAllConnections();
  await new Promise((r) => home.close(r));
  await new Promise((r) => gifts.close(r));
  store.close();
  await rm(temp, { recursive: true, force: true });
}
