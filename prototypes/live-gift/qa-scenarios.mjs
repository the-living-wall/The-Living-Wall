import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

// Synthetic dialogue in isolated contexts; never attach to a user's browser.
const target = process.env.QA_BASE_URL || 'http://127.0.0.1:4180/';
const output =
  process.env.QA_OUTPUT || join(tmpdir(), `xiaoying-scenarios-${Date.now()}`);
const report = {
  startedAt: new Date().toISOString(),
  target,
  applicationCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  workingTree: execFileSync('git', ['status', '--short'], {
    encoding: 'utf8',
  }).trim(),
  viewport: { width: 1280, height: 850 },
  scenarios: [],
};
const cases = [
  {
    id: 'quiet',
    name: '安静陪伴',
    style: '沉静',
    lines: ['今天有点累，不太想说话。', '那就安静待一会儿，不用急着回复。'],
    reason: '记住这次不用勉强说话的陪伴。',
  },
  {
    id: 'playful',
    name: '轻松打趣',
    style: '俏皮',
    lines: [
      '今天又把钥匙忘在家里了，我真是金鱼记忆。',
      '给金鱼配个钥匙挂绳，下次一起出门。',
    ],
    reason: '我们喜欢这样轻轻开个玩笑。',
  },
  {
    id: 'promise',
    name: '共同约定',
    style: null,
    lines: [
      '周末如果有空，我们去海边散步吧。',
      '好呀，到时候再确认天气和时间。',
    ],
    reason: '一个还没发生的散步约定，先把邀请留下。',
  },
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
report.browser = browser.version();
try {
  for (const test of cases) {
    const dir = join(output, test.id);
    await mkdir(dir, { recursive: true });
    const context = await browser.newContext({ viewport: report.viewport });
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const result = { ...test, status: 'running', steps: [], errors: [] };
    report.scenarios.push(result);
    page.on('pageerror', (error) => result.errors.push(error.message));
    const button = (name) => page.getByRole('button', { name, exact: true });
    const active = async (name) =>
      assert.equal(
        await page.getByTestId('active-temperament').textContent(),
        name,
      );
    const role = (actor) => page.getByLabel('体验身份').selectOption(actor);
    const shot = (name, fullPage = true) =>
      page.screenshot({ path: join(dir, `${name}.png`), fullPage });
    const step = async (name, action) => {
      const entry = {
        name,
        startedAt: new Date().toISOString(),
        status: 'running',
      };
      result.steps.push(entry);
      await action();
      entry.status = 'passed';
      entry.finishedAt = new Date().toISOString();
    };
    try {
      await step('进入朋友视角；当前原样，接收默认静音', async () => {
        await page.goto(target);
        await page.getByRole('button', { name: /送给朋友/ }).click();
        await page.getByRole('button', { name: /预览这份心意/ }).click();
        await active('原来的样子');
        assert.ok(await button('开启声音').isVisible());
      });
      await step('两个模拟身份来回留言；对话本身不改变性情', async () => {
        for (const [index, actor] of ['friend', 'sender'].entries()) {
          await role(actor);
          await button('回一句给朋友').click();
          await page.getByLabel('想对朋友说的话').fill(test.lines[index]);
          await button('留在这次交流里').click();
        }
        assert.equal(await page.locator('.shared-message').count(), 2);
        await active('原来的样子');
        await shot('01-dialogue');
      });
      await step('手动选双方原话和理由；主题不自动识别', async () => {
        await button(test.style ? '一起塑造小莹' : '留下这一刻').click();
        const dialog = page.getByRole('dialog');
        assert.equal(await button('提出这个选择').isEnabled(), false);
        for (const line of test.lines) {
          await dialog
            .locator('label')
            .filter({ hasText: line })
            .getByRole('checkbox')
            .check();
        }
        await page.getByLabel('为什么想留下它？也可以留白').fill(test.reason);
        if (test.style)
          await dialog
            .getByRole('radio', { name: test.style, exact: true })
            .check();
      });
      if (test.style)
        await step('试看和返回不代表同意', async () => {
          await button('试看这个样子').click();
          await page.waitForTimeout(1800);
          await shot('02-preview', false);
          await active('原来的样子');
          await button('返回选择').click();
        });
      await step('单方提出仍是原样；不能确认自己的提议', async () => {
        await button('提出这个选择').click();
        await active('原来的样子');
        assert.equal(await button('就这样，一起留下').count(), 0);
        assert.equal(await page.locator('.shared-traces').count(), 0);
        await shot('03-pending');
      });
      await step('另一身份明确确认；结果保留双方原文与理由', async () => {
        await role('friend');
        await button('就这样，一起留下').click();
        await active(test.style || '原来的样子');
        await page.locator('.shared-traces > summary').click();
        const record = page.locator('.shared-traces article');
        assert.equal(await record.count(), 1);
        for (const line of test.lines)
          assert.ok((await record.textContent()).includes(line));
        assert.ok((await record.textContent()).includes(test.reason));
        if (!test.style) {
          assert.equal(await button('提议取消这条纪念').count(), 1);
          assert.equal(await button('提议恢复此前的样子').count(), 0);
        }
        await shot('04-confirmed');
      });
      await step('没有页面脚本错误', async () =>
        assert.deepEqual(result.errors, []),
      );
      result.status = 'passed';
    } catch (error) {
      result.status = 'failed';
      result.failure = error.stack;
      const pendingStep = result.steps.find(
        (entry) => entry.status === 'running',
      );
      if (pendingStep) pendingStep.status = 'failed';
      await shot('failure').catch(() => {});
    } finally {
      await context.tracing.stop({ path: join(dir, 'trace.zip') });
      await context.close();
      await writeFile(
        join(output, 'results.json'),
        JSON.stringify(report, null, 2),
      );
    }
  }
} finally {
  await browser.close();
}
report.finishedAt = new Date().toISOString();
await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      output,
      results: report.scenarios.map(({ name, status, failure }) => ({
        name,
        status,
        failure,
      })),
    },
    null,
    2,
  ),
);
if (report.scenarios.some(({ status }) => status !== 'passed'))
  process.exitCode = 1;
