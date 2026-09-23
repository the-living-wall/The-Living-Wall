import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
const output =
  process.env.QA_OUTPUT || join(tmpdir(), `xiaoying-v2-${Date.now()}`);
const target = process.env.QA_BASE_URL || 'http://127.0.0.1:4180/';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 850 },
});
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
page.setDefaultTimeout(7000);
const results = [],
  errors = [];
const report = {
  startedAt: new Date().toISOString(),
  target,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  results,
  errors,
};
page.on('pageerror', (error) => errors.push(error.message));
const button = (name) => page.getByRole('button', { name, exact: true });
const role = (actor) => page.getByLabel('体验身份').selectOption(actor);
const active = async (name) =>
  assert.equal(
    await page.getByTestId('active-temperament').textContent(),
    name,
  );
const shot = (name) =>
  page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
const say = async (text) => {
  await button('回一句给朋友').click();
  await page.getByLabel('想对朋友说的话').fill(text);
  await button('留在这次交流里').click();
};
const propose = async (style = '保留现在的样子') => {
  await button('一起塑造小莹').click();
  const dialog = page.getByRole('dialog');
  assert.ok(
    await dialog
      .getByRole('radio', { name: '保留现在的样子', exact: true })
      .isChecked(),
  );
  await dialog.getByRole('checkbox').first().check();
  await dialog.getByRole('radio', { name: style, exact: true }).check();
  await button('提出这个选择').click();
};
try {
  await page.addInitScript(() =>
    localStorage.setItem('fragment-growth-v1', 'qa-preserve-existing-growth'),
  );
  await page.goto(target);
  assert.ok(await page.locator('.growth-summary').isVisible());
  await page.getByRole('button', { name: /送给朋友/ }).click();
  assert.equal(await page.locator('.growth-summary').count(), 0);
  assert.equal(await button('编辑留言').count(), 0);
  const note = page.getByLabel('写给朋友的话，也可以留白');
  await note.fill('这是只想告诉你的话。');
  await page.getByLabel('你想对朋友说什么？').selectOption('thanks');
  assert.equal(await note.inputValue(), '这是只想告诉你的话。');
  await button('使用这句开头').click();
  assert.equal(await note.inputValue(), '谢谢你一直以来的陪伴。');
  await note.fill('一起慢慢来。');
  await page.getByLabel('给谁（可选）').fill('小满');
  await page.getByLabel('你的落款（可选）').fill('阿禾');
  await shot('composer');
  for (const [width, height] of [
    [820, 1200],
    [390, 844],
    [360, 740],
    [375, 667],
  ]) {
    await page.setViewportSize({ width, height });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const guide = await page.locator('.guide').boundingBox(),
      footer = await page.locator('.bottom').boundingBox();
    assert.ok(
      guide.y + guide.height <= footer.y,
      `composer footer overlap ${width}`,
    );
    const actions = await page.locator('.gift-actions').boundingBox(),
      sound = await page.locator('.sound-controls').boundingBox();
    assert.ok(
      actions.y + actions.height <= sound.y,
      `actions/sound overlap ${width}`,
    );
    await shot(`composer-${width}`);
  }
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.getByRole('button', { name: /预览这份心意/ }).click();
  assert.ok(
    (await page.locator('.gift-address').textContent()).includes('小满'),
  );
  assert.equal(await page.locator('.growth-summary').count(), 0);
  assert.ok(await button('开启声音').isVisible());
  await button('返回编辑').click();
  assert.equal(await note.inputValue(), '一起慢慢来。');
  await page.getByRole('button', { name: /预览这份心意/ }).click();
  results.push(
    '统一表达区域、替换保护、返回保留、四种窄屏布局、称呼和朋友页无成长面板',
  );
  await say('今天有点累，谢谢你在。');
  await role('sender');
  await say('不用着急，我们慢慢来。');
  await active('原来的样子');
  assert.equal(await button('留下这一刻').count(), 0);
  await button('一起塑造小莹').click();
  assert.equal(await button('提出这个选择').isEnabled(), false);
  await page.getByRole('dialog').getByRole('checkbox').first().check();
  for (const [name, file] of [
    ['沉静', 'calm'],
    ['俏皮', 'playful'],
    ['好奇', 'curious'],
  ]) {
    await page
      .getByRole('dialog')
      .getByRole('radio', { name, exact: true })
      .check();
    await button('试看这个样子').click();
    await page.waitForTimeout(300);
    await shot(`preview-${file}`);
    await active('原来的样子');
    await button('返回选择').click();
  }
  await page.keyboard.press('Escape');
  await active('原来的样子');
  assert.equal(await page.locator('.shared-trial').count(), 0);
  await propose('沉静');
  await active('原来的样子');
  assert.equal(await button('就这样，一起留下').count(), 0);
  await role('friend');
  await button('看看这个样子').click();
  await page.keyboard.press('Escape');
  await active('原来的样子');
  await button('调整这个选择').click();
  await page
    .getByRole('dialog')
    .getByRole('radio', { name: '俏皮', exact: true })
    .check();
  await button('提出修改后的选择').click();
  assert.equal(await button('就这样，一起留下').count(), 0);
  await role('sender');
  await button('就这样，一起留下').click();
  await active('俏皮');
  assert.equal(await page.locator('.shared-traces').getAttribute('open'), null);
  await page.locator('.shared-traces > summary').click();
  assert.ok(
    (await page.locator('.shared-traces').textContent()).includes('阿禾与小满'),
  );
  await button('修改我的称呼').click();
  await page.getByLabel('我的称呼', { exact: true }).fill('禾禾');
  await button('保存称呼').click();
  assert.ok(
    (await page.locator('.shared-message').last().textContent()).includes(
      '禾禾',
    ),
  );
  assert.ok(
    (await page.locator('.shared-traces').textContent()).includes('阿禾与小满'),
  );
  await button('提议取消这条纪念').click();
  await active('俏皮');
  await role('friend');
  await button('确认取消这条纪念').click();
  await active('俏皮');
  assert.equal(await page.locator('.shared-message').count(), 2);
  results.push(
    '三种试看可取消；改选需重新确认；称呼更改不改历史；取消纪念保留形态和对话',
  );
  await button('提议恢复此前的样子').click();
  await active('俏皮');
  await role('sender');
  await button('就这样，一起留下').click();
  await active('原来的样子');
  await propose();
  await role('friend');
  await button('就这样，一起留下').click();
  await active('原来的样子');
  assert.equal(await button('提议取消这条纪念').count(), 1);
  await propose('好奇');
  await button('撤回提议').click();
  await active('原来的样子');
  await propose('好奇');
  await role('sender');
  await button('先保持现在').click();
  await active('原来的样子');
  await say('很长的一句话，\n'.repeat(12));
  for (const [width, height] of [
    [820, 1200],
    [390, 844],
    [360, 740],
    [375, 667],
  ]) {
    await page.setViewportSize({ width, height });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const guide = await page.locator('.guide').boundingBox(),
      footer = await page.locator('.bottom').boundingBox();
    assert.ok(
      guide.y + guide.height <= footer.y,
      `receive footer overlap ${width}`,
    );
    await shot(`receive-${width}`);
    await button('一起塑造小莹').click();
    await page
      .getByRole('dialog')
      .getByRole('radio', { name: '好奇', exact: true })
      .check();
    await button('试看这个样子').click();
    await shot(`watch-${width}`);
    await page.keyboard.press('Escape');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await propose('沉静');
  await role('friend');
  await button('看看这个样子').click();
  await shot('reduced-motion');
  await page.keyboard.press('Escape');
  await button('就这样，一起留下').click();
  await active('沉静');
  await button('开启声音').click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (b) => b.textContent === '关闭声音',
    ),
  );
  await page.locator('.sound-options > summary').click();
  assert.ok(await page.getByLabel('互动音量', { exact: true }).isVisible());
  assert.ok(await page.getByLabel('背景音乐音量', { exact: true }).isVisible());
  await page.getByLabel('互动音量', { exact: true }).fill('0.2');
  await page.locator('.sound-options > summary').click();
  await button('关闭声音').click();
  await button('返回编辑').click();
  await note.fill('');
  await page.getByRole('button', { name: /预览这份心意/ }).click();
  await page.locator('.shared-traces > summary').click();
  await button('提议恢复此前的样子').first().click();
  await role('sender');
  await button('调整这个选择').click();
  assert.ok(
    await page.getByRole('dialog').getByRole('checkbox').first().isChecked(),
  );
  await page
    .getByRole('dialog')
    .getByRole('radio', { name: '好奇', exact: true })
    .check();
  await button('提出修改后的选择').click();
  await role('friend');
  await button('就这样，一起留下').click();
  await active('好奇');
  results.push(
    '恢复、只存纪念、撤回拒绝、四种窄屏、减少动态、原声音控件、清空赠言后的历史改选',
  );
  await button('返回编辑').click();
  await button('回到陪伴').click();
  assert.equal(await page.locator('.growth-summary').count(), 1);
  assert.equal(await page.locator('.shared-experience').count(), 0);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('fragment-growth-v1')),
    'qa-preserve-existing-growth',
  );
  await page.reload();
  await page.getByRole('button', { name: /送给朋友/ }).click();
  await page.getByRole('button', { name: /预览这份心意/ }).click();
  assert.equal(await page.locator('.shared-traces').count(), 0);
  await active('原来的样子');
  assert.deepEqual(errors, []);
  results.push('个人页成长保留、真实成长键未改、刷新清空、无脚本错误');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await context.tracing.stop({ path: join(output, 'trace.zip') });
  await browser.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify({ output, ...report }, null, 2));
}
