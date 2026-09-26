import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { GiftStore } from '../services/gifts/store.ts';
import { giftServer } from '../services/gifts/server.ts';
const folder = resolve('outputs/friend-layout-qa');
await mkdir(folder, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), 'friend-layout-'));
const store = new GiftStore(join(temp, 'data.sqlite'));
const server = giftServer(store, {
  origin: 'http://127.0.0.1:4199',
  staticDir: resolve('outputs/gifts/site'),
  limit: 2000,
});
await new Promise((r) => server.listen(4199, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const report = { checks: [], errors: [], physicalWeChat: false };
page.on('pageerror', (e) => report.errors.push(e.message));
const check = (s) => {
  report.checks.push(s);
  console.log('PASS', s);
};
const inside = async (locator) =>
  locator.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.x >= 0 &&
      r.y >= 0 &&
      r.right <= innerWidth + 1 &&
      r.bottom <= innerHeight + 1
    );
  });
try {
  await page.goto('http://127.0.0.1:4199');
  await page.getByRole('button', { name: /送给朋友/ }).click();
  await page
    .getByLabel('写给朋友的话，也可以留白')
    .fill('这是虚构的长留言，只用于核对排版。'.repeat(4));
  await page
    .getByRole('button', { name: '生成分享链接 ↗', exact: true })
    .click();
  await page.locator('.shared-experience').waitFor();
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole('button', { name: '回一句给朋友', exact: true })
      .click();
    await page
      .getByLabel('想对朋友说的话')
      .fill(
        `${i + 1}：` +
          '愿你慢慢找到安心，也记得给自己留一点休息的时间。'.repeat(3),
      );
    await page.getByRole('button', { name: '回复给朋友', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
  for (const [width, height, large] of [
    [1280, 900, false],
    [850, 550, false],
    [760, 420, false],
    [390, 844, false],
    [320, 568, false],
    [850, 650, true],
  ]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await page.locator('.shared-experience').waitFor();
    if (large)
      await page.evaluate(() => {
        for (const e of document.querySelectorAll('.gift-guide *, .bottom *'))
          e.style.fontSize =
            Number.parseFloat(getComputedStyle(e).fontSize) * 1.5 + 'px';
      });
    await page
      .getByRole('button', { name: '关闭声音', exact: true })
      .waitFor({ state: 'hidden' });
    const footer = page.locator('.bottom'),
      guide = page.locator('.gift-guide');
    assert(await inside(footer), `${width} footer inside viewport`);
    assert(
      await inside(page.getByRole('button', { name: '开启声音', exact: true })),
      `${width} sound control visible`,
    );
    assert(
      await page.locator('.stage').evaluate((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.x === 0 &&
          r.y === 0 &&
          Math.abs(r.width - innerWidth) < 1 &&
          Math.abs(r.height - innerHeight) < 1
        );
      }),
    );
    if (width > 700) {
      assert(
        await guide.evaluate((e) => e.scrollHeight > e.clientHeight),
        'long content scrolls inside guide',
      );
      const bounds = await guide.boundingBox(),
        controls = await footer.boundingBox();
      assert(
        bounds.x + bounds.width <= controls.x,
        'left content does not overlap controls',
      );
      await guide.evaluate((e) => {
        e.scrollTop = e.scrollHeight;
      });
      assert(
        await inside(
          page.getByRole('button', { name: '共同选择', exact: true }),
        ),
      );
      assert.equal(await page.evaluate(() => window.scrollY), 0);
    } else {
      await page.getByRole('button', { name: '互动设置', exact: true }).tap();
      assert(
        await inside(
          page.getByRole('button', { name: '启用摄像头', exact: true }),
        ),
      );
      assert(
        await inside(
          page.getByRole('button', { name: '全屏纯画面', exact: true }),
        ),
      );
      await page.getByRole('button', { name: '收起设置', exact: true }).tap();
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      const content = await guide.boundingBox(),
        bar = await footer.boundingBox();
      assert(
        content.y + content.height <= bar.y,
        'bottom reservation keeps content above toolbar',
      );
    }
    const before = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await page.getByRole('button', { name: '保存说明', exact: true }).click();
    const notice = page.getByRole('dialog', { name: '保存说明', exact: true });
    assert(await inside(notice));
    assert.match(await notice.innerText(), /服务商的备份会按其保存期限清除/);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollHeight),
      before,
    );
    await notice.getByRole('button', { name: '关闭', exact: true }).click();
    await notice.waitFor({ state: 'hidden' });
    assert.equal(
      await page
        .getByRole('button', { name: '保存说明', exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.screenshot({
      path: join(folder, `${width}-${height}${large ? '-large' : ''}.png`),
      fullPage: width <= 700,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    check(
      `${width}x${height}${large ? ' 150% text' : ''}: scrolling, toolbar, full-screen canvas, bounded notice, focus return`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('.shared-experience').waitFor();
  await page.getByRole('button', { name: '互动设置', exact: true }).tap();
  await page.getByRole('button', { name: '全屏纯画面', exact: true }).tap();
  await page.locator('.habitat.projection').waitFor();
  assert.equal(await page.locator('.bottom').isVisible(), false);
  await page.keyboard.press('Escape');
  await page.locator('.habitat.projection').waitFor({ state: 'detached' });
  assert(await inside(page.locator('.bottom')));
  check('mobile pure view hides toolbar; Escape restores usable toolbar');
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = String(error);
  console.error(error);
  await page.screenshot({ path: join(folder, 'failure.png'), fullPage: true });
  throw error;
} finally {
  await writeFile(
    join(folder, 'results.json'),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  store.close();
  await rm(temp, { recursive: true, force: true });
}
