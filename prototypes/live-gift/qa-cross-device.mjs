import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GiftStore } from '../../services/gifts/store.ts';
import { giftServer } from '../../services/gifts/server.ts';

const output =
  process.env.QA_OUTPUT || resolve('outputs/cross-device-qa/browser');
await mkdir(output, { recursive: true });
const data = await mkdtemp(join(tmpdir(), 'xiaoying-two-devices-'));
const remote = process.env.QA_ORIGIN;
const selectedScenario = process.env.QA_SCENARIO_INDEX;
if (selectedScenario !== undefined && !/^[0-2]$/.test(selectedScenario)) {
  throw new Error('QA_SCENARIO_INDEX must be 0, 1 or 2');
}
const origin = remote || 'http://127.0.0.1:4191';
let store, server;
const start = async () => {
  if (remote) return;
  store = new GiftStore(join(data, 'gifts.sqlite'));
  server = giftServer(store, {
    origin,
    staticDir: resolve('outputs/gifts/site'),
    limit: 1000,
  });
  await new Promise((r) => server.listen(4191, '127.0.0.1', r));
};
const stop = async () => {
  if (remote) return;
  await new Promise((r) => server.close(r));
  store.close();
};
await start();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  workingTree: execFileSync('git', ['status', '--short'], {
    encoding: 'utf8',
  }).trim(),
  started: new Date().toISOString(),
  origin,
  mode: remote ? 'cloud-isolated-browser-contexts' : 'local-sqlite',
  physicalDevices: false,
  selectedScenario: selectedScenario ?? 'all',
  defaultDomainWarmup: process.env.QA_WARMUP_DEFAULT_DOMAIN === 'true',
  scenarios: [],
  errors: [],
};
const open = async (page, url) => {
  await page.goto(url);
  if ((await page.locator('body').innerText()).includes('页面访问提示')) {
    await page
      .getByRole('button', { name: '确定访问', exact: true })
      .click({ timeout: 15000 });
    await page.locator('#root').waitFor({ state: 'visible' });
  }
};
const btn = (p, name) => p.getByRole('button', { name, exact: true });
const appears = async (locator) =>
  locator.waitFor({ state: 'visible', timeout: 12000 });
const say = async (p, message) => {
  await btn(p, '回一句给朋友').click();
  await p.getByLabel('想对朋友说的话').fill(message);
  await btn(p, '回复给朋友').click();
  await p.getByRole('dialog').waitFor({ state: 'hidden' });
};
try {
  for (const [index, name, style, first, second] of [
    [0, '安静陪伴', '沉静', '今天有点累，想休息一下。', '那就安静待一会儿。'],
    [1, '轻松打趣', '俏皮', '又把钥匙忘家里了。', '给金鱼配个钥匙挂绳。'],
    [2, '共同约定', null, '周末去海边散步好吗？', '好，到时再确认天气。'],
  ]) {
    if (selectedScenario !== undefined && String(index) !== selectedScenario)
      continue;
    if (remote && report.scenarios.length > 0)
      await new Promise((resolve) => setTimeout(resolve, 45000));
    const folder = join(output, String(index));
    await mkdir(folder, { recursive: true });
    const sender = await browser.newContext({
      viewport: { width: 1280, height: 850 },
    });
    const friend = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await sender.tracing.start({ screenshots: true, snapshots: true });
    await friend.tracing.start({ screenshots: true, snapshots: true });
    const a = await sender.newPage(),
      b = await friend.newPage();
    for (const p of [a, b]) {
      p.setDefaultTimeout(12000);
      p.on('pageerror', (e) => report.errors.push(e.message));
    }
    if (process.env.QA_WARMUP_DEFAULT_DOMAIN === 'true') await open(b, origin);
    await open(a, origin);
    await a.getByRole('button', { name: /送给朋友/ }).click();
    await a.getByLabel('写给朋友的话，也可以留白').fill(first);
    await a.getByLabel('给谁（可选）').fill('小满');
    await a.getByLabel('你的落款（可选）').fill('阿禾');
    if (index === 0 && !remote) {
      await sender.setOffline(true);
      await a.getByRole('button', { name: /生成分享链接/ }).click();
      await appears(
        a.getByText('连接暂时中断，请稍后重试；未发送的内容仍保留。', {
          exact: true,
        }),
      );
      await sender.setOffline(false);
      await a.reload();
      await a.getByRole('button', { name: /送给朋友/ }).click();
      assert.equal(
        await a.getByLabel('写给朋友的话，也可以留白').inputValue(),
        first,
      );
      assert.equal(await a.getByLabel('给谁（可选）').inputValue(), '小满');
      assert.equal(await a.getByLabel('你的落款（可选）').inputValue(), '阿禾');
      await a.screenshot({
        path: join(folder, 'creation-recovered.png'),
        fullPage: true,
      });
    }
    await a.getByRole('button', { name: /生成分享链接/ }).click();
    const copyButton = btn(a, '复制邀请链接 ↗');
    await appears(copyButton);
    await appears(
      a.getByText('心意已创建，复制链接发给这位朋友。', { exact: true }),
    );
    assert.equal(await a.getByLabel('朋友的邀请链接').count(), 0);
    assert.equal(await a.getByText('手动复制链接', { exact: true }).count(), 0);
    await sender.grantPermissions(['clipboard-read', 'clipboard-write']);
    await a.bringToFront();
    await copyButton.click();
    await appears(
      a.getByText('链接已复制，粘贴给这位朋友即可。', {
        exact: true,
      }),
    );
    const invite = await a.evaluate(() => navigator.clipboard.readText());
    assert.match(new URL(invite).hash, /^#invite=[a-f0-9]{64}$/);
    await a.screenshot({
      path: join(folder, 'share-desktop.png'),
      fullPage: true,
    });
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({
      path: join(folder, 'share-mobile.png'),
      fullPage: true,
    });
    assert.ok(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (index === 0) {
      await a.evaluate(() => {
        Object.defineProperty(navigator.clipboard, 'writeText', {
          configurable: true,
          value: () =>
            Promise.reject(
              new DOMException('Clipboard denied', 'NotAllowedError'),
            ),
        });
      });
      await copyButton.click();
      await appears(
        a.getByText('没能自动复制，请选中下方完整链接，手动复制。', {
          exact: true,
        }),
      );
      await appears(a.getByLabel('朋友的邀请链接'));
      assert.equal(
        await a
          .getByText('链接已复制，粘贴给这位朋友即可。', {
            exact: true,
          })
          .count(),
        0,
      );
      assert.equal(await a.getByLabel('朋友的邀请链接').inputValue(), invite);
      await a.screenshot({
        path: join(folder, 'copy-fallback.png'),
        fullPage: true,
        mask: [a.getByLabel('朋友的邀请链接')],
      });
      await a.evaluate(() => {
        delete navigator.clipboard.writeText;
      });
      await copyButton.click();
      await a.getByLabel('朋友的邀请链接').waitFor({ state: 'detached' });
    }
    await a.setViewportSize({ width: 1280, height: 850 });
    assert.ok(invite.includes('#invite='));
    if (index === 0) {
      await btn(a, '回到小莹').click();
      assert.equal(
        await a.getByText('管理这份心意', { exact: true }).count(),
        0,
      );
      assert.equal(await a.getByLabel('这份交流的保存期限').count(), 0);
      await a.getByText(/^我的心意/).click();
      await btn(a, '送给 小满').click();
      await appears(copyButton);
    }
    await open(b, invite);
    assert.equal(
      await b.getByText(first, { exact: true }).count(),
      0,
      'Invitation landing does not disclose dialogue',
    );
    assert.ok(!b.url().includes('#invite='));
    await btn(b, '接受这份心意').click();
    await appears(b.getByText(first, { exact: true }));
    assert.equal(await b.getByLabel('体验身份', { exact: true }).count(), 0);
    if (index === 0) {
      // Verify the shared audio engine remains usable after main is merged.
      // Browser activation and asset success do not certify subjective sound.
      await btn(b, '开启声音').click();
      await appears(btn(b, '关闭声音'));
      await b.getByText('声音设置', { exact: true }).click();
      await btn(b, '试听快速移动').click();
      assert.equal(
        await b.getByRole('slider', { name: '互动音量' }).count(),
        1,
      );
      await b.screenshot({
        path: join(folder, 'sound-settings.png'),
        fullPage: true,
      });
      await b.getByText('声音设置', { exact: true }).click();
      await btn(b, '关闭声音').click();
      await appears(btn(b, '开启声音'));
    }
    await say(b, second);
    await appears(a.getByText(second, { exact: true }));
    await appears(a.getByText('朋友已回复，可以继续聊。', { exact: true }));
    for (const page of [a, b]) {
      const conversation = page.getByLabel('我们的对话', { exact: true });
      await appears(conversation.getByText(first, { exact: true }));
      await appears(conversation.getByText(second, { exact: true }));
      const texts = await conversation
        .locator('.shared-message p')
        .allTextContents();
      assert.deepEqual(texts, [first, second]);
      assert.equal(await page.getByText(first, { exact: true }).count(), 1);
      assert.equal(
        await page.locator('.guide').getByLabel('这份交流的保存期限').count(),
        0,
      );
      assert.equal(
        await page
          .locator('.control-stack')
          .getByLabel('这份交流的保存期限')
          .count(),
        1,
      );
    }
    if (index === 0) {
      await friend.setOffline(true);
      await btn(b, '回一句给朋友').click();
      await b.getByLabel('想对朋友说的话').fill('断线后重试，只有一条。');
      await btn(b, '回复给朋友').click();
      await appears(
        b.getByRole('dialog').getByRole('button', { name: '重试上次操作' }),
      );
      assert.equal(
        await b.getByLabel('想对朋友说的话').inputValue(),
        '断线后重试，只有一条。',
      );
      await friend.setOffline(false);
      await b
        .getByRole('dialog')
        .getByRole('button', { name: '重试上次操作' })
        .click();
      await b.getByRole('dialog').waitFor({ state: 'hidden' });
      await appears(a.getByText('断线后重试，只有一条。', { exact: true }));
      assert.equal(
        await a.getByText('断线后重试，只有一条。', { exact: true }).count(),
        1,
      );
      await stop();
      await start();
      await a.reload();
      await b.reload();
      await appears(b.getByText('断线后重试，只有一条。', { exact: true }));
      await appears(a.getByText('断线后重试，只有一条。', { exact: true }));
    }
    await btn(a, '一起塑造小莹').click();
    await a.getByRole('dialog').getByRole('checkbox').first().check();
    if (style) await a.getByRole('radio', { name: style, exact: true }).check();
    await btn(a, '提出这个选择').click();
    await appears(b.getByLabel('待共同确认的提议'));
    // Use the actual accept button label already defined by the shared UI.
    const labels = await b
      .getByLabel('待共同确认的提议')
      .getByRole('button')
      .allTextContents();
    const label = labels.find((s) => /就按这个|确认|一起留下/.test(s));
    assert.ok(label, JSON.stringify(labels));
    await btn(b, label.trim()).click();
    await b.getByLabel('待共同确认的提议').waitFor({ state: 'hidden' });
    if (style)
      await a
        .getByTestId('active-temperament')
        .filter({ hasText: style })
        .waitFor();
    await a.getByText(/我们的共同记录/).click();
    await b.getByText(/我们的共同记录/).click();
    await a.screenshot({ path: join(folder, 'desktop.png'), fullPage: true });
    await b.screenshot({ path: join(folder, 'mobile.png'), fullPage: true });
    assert.ok(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const active = await b.getByTestId('active-temperament').innerText();
    if (!style) assert.equal(active, '原来的样子');
    await a.getByText('管理这份心意', { exact: true }).click();
    a.once('dialog', (d) => d.accept());
    await btn(a, '删除整份心意').click();
    await appears(a.getByRole('button', { name: /送给朋友/ }));
    await b.reload();
    await appears(b.getByRole('alert'));
    assert.match(await b.getByRole('alert').innerText(), /删除|到期/);
    await sender.tracing.stop({ path: join(folder, 'sender-trace.zip') });
    await friend.tracing.stop({ path: join(folder, 'friend-trace.zip') });
    await sender.close();
    await friend.close();
    report.scenarios.push({
      name,
      status: 'passed',
      active,
      offlineRetry: index === 0,
      creationRefreshPreserved: index === 0 && !remote,
      serverRestart: index === 0 && !remote,
      browserReload: index === 0,
      visibleCopyAndClipboard: true,
      copyFailureFallback: index === 0,
      replyStatusFromMessage: true,
      unifiedConversation: true,
      retentionInFooter: true,
      homeSavedGiftClickable: index === 0,
      soundActivationMovementPreviewAndStop: index === 0,
    });
  }
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.error = String(e);
  for (const [i, context] of browser.contexts().entries()) {
    for (const [j, page] of context.pages().entries()) {
      await page
        .screenshot({
          path: join(output, `failure-${i}-${j}.png`),
          fullPage: true,
        })
        .catch(() => {});
      await writeFile(
        join(output, `failure-${i}-${j}.txt`),
        await page.locator('body').innerText(),
      );
    }
    await context.tracing
      .stop({ path: join(output, `failure-${i}-trace.zip`) })
      .catch(() => {});
  }
  throw e;
} finally {
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await stop();
  await rm(data, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
