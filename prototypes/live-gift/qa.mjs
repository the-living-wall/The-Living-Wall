import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

// Run beside the standalone preview; outputs deliberately stay outside the repo.
const target = process.env.QA_BASE_URL || 'http://127.0.0.1:4180/';
const output =
  process.env.QA_OUTPUT || join(tmpdir(), 'xiaoying-shared-shaping-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const results = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
page.on('pageerror', (error) => errors.push(error.message));
page.setDefaultTimeout(5000);
const button = (name) => page.getByRole('button', { name, exact: true });
const dialog = () => page.getByRole('dialog');
const active = async (name) =>
  assert.equal(
    await page.getByTestId('active-temperament').textContent(),
    name,
  );
const role = (actor) => page.getByLabel('体验身份').selectOption(actor);
const screenshot = async (name) => {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({
    path: join(output, `${name}.png`),
    fullPage: !(
      name.startsWith('watch-') ||
      [
        'desktop-calm',
        'desktop-playful',
        'desktop-curious',
        'reduced-motion',
      ].includes(name)
    ),
  });
};
const enter = async () => {
  await page.goto(target);
  await page.getByRole('button', { name: /送给朋友/ }).click();
  await page.getByRole('button', { name: /预览这份心意/ }).click();
};
const say = async (text) => {
  await button('回一句给朋友').click();
  await page.getByLabel('想对朋友说的话').fill(text);
  await button('留在这次交流里').click();
};
try {
  await page.addInitScript(() =>
    localStorage.setItem('fragment-growth-v1', 'qa-preserve-existing-growth'),
  );
  await enter();
  await active('原来的样子');
  assert.ok(await button('开启声音').isVisible());
  await say('今天有点累，但看到你的话就松了一口气。');
  await role('sender');
  await say('不用着急回，周末有空我们去散散步。');
  assert.equal(await page.locator('.shared-message').count(), 2);
  await button('一起塑造小莹').click();
  assert.equal(await button('提出这个选择').isEnabled(), false);
  await dialog().getByRole('checkbox').first().check();
  for (const [name, file] of [
    ['沉静', 'calm'],
    ['俏皮', 'playful'],
    ['好奇', 'curious'],
  ]) {
    await dialog().getByRole('radio', { name, exact: true }).check();
    await button('试看这个样子').click();
    await page.waitForTimeout(1800);
    await screenshot(`desktop-${file}`);
    await active('原来的样子');
    await button('返回选择').click();
  }
  await page.keyboard.press('Escape');
  assert.equal(await dialog().count(), 0);
  assert.equal(await page.locator('.shared-trial').count(), 0);
  await active('原来的样子');
  results.push('三种试看、返回选择与 Escape 不改变共同结果');

  await button('一起塑造小莹').click();
  await dialog().getByRole('checkbox').first().check();
  await dialog().getByRole('radio', { name: '沉静', exact: true }).check();
  await button('提出这个选择').click();
  assert.equal(await button('就这样，一起留下').count(), 0);
  await active('原来的样子');
  await role('friend');
  await button('看看这个样子').click();
  assert.equal(await dialog().getAttribute('aria-label'), '看看这个样子');
  await active('原来的样子');
  await button('返回提议').click();
  await role('sender');
  assert.equal(await page.locator('.shared-trial').count(), 0);
  await role('friend');
  await button('换一种试试').click();
  await dialog().getByRole('radio', { name: '俏皮', exact: true }).check();
  await button('提出修改后的选择').click();
  assert.equal(await button('就这样，一起留下').count(), 0);
  await active('原来的样子');
  await role('sender');
  await button('就这样，一起留下').click();
  await active('俏皮');
  await page.locator('.shared-traces > summary').click();
  await screenshot('desktop-confirmed');
  results.push('来回留言、切换清除试看、改选重新确认、另一身份确认后生效');

  await button('提议恢复此前的样子').click();
  await active('俏皮');
  await role('friend');
  await button('就这样，一起留下').click();
  await active('原来的样子');
  await button('留下这一刻').click();
  await dialog().getByRole('checkbox').last().check();
  await page
    .getByLabel('为什么想留下它？也可以留白')
    .fill('一次散步的邀请，还没有发生。');
  await button('提出这个选择').click();
  await role('sender');
  await button('就这样，一起留下').click();
  await active('原来的样子');
  await button('提议取消这条纪念').click();
  await role('friend');
  await button('确认取消这条纪念').click();
  await active('原来的样子');
  assert.ok(
    await page
      .getByText('这条纪念已取消，原对话仍保留。', { exact: true })
      .isVisible(),
  );
  assert.equal(await page.locator('.shared-message').count(), 2);
  results.push(
    '历史来源、恢复旧表现、留下与取消纪念均由两个身份确认，保留原对话',
  );

  await button('一起塑造小莹').click();
  await dialog().getByRole('checkbox').first().check();
  await dialog().getByRole('radio', { name: '好奇', exact: true }).check();
  await button('提出这个选择').click();
  await button('撤回提议').click();
  await active('原来的样子');
  await button('留下这一刻').click();
  await dialog().getByRole('checkbox').first().check();
  await button('提出这个选择').click();
  await role('sender');
  await button('先保持现在').click();
  assert.equal(await page.locator('.shared-pending').count(), 0);
  await active('原来的样子');
  results.push('撤回、拒绝均保留现状');

  await page.locator('.shared-traces > summary').click();
  await say('很长的一句话，\n'.repeat(12));
  for (const [width, height] of [
    [820, 1200],
    [390, 844],
    [360, 740],
    [375, 667],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const guide = await page.locator('.gift-guide').boundingBox();
    const footer = await page.locator('.bottom').boundingBox();
    assert.ok(
      guide.y + guide.height <= footer.y,
      `content/footer overlap at ${width}`,
    );
    await screenshot(`layout-${width}`);
    await button('一起塑造小莹').click();
    await dialog().getByRole('radio', { name: '好奇', exact: true }).check();
    await button('试看这个样子').click();
    await page.waitForTimeout(1600);
    await screenshot(`watch-${width}`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.shared-trial').count(), 0);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button('一起塑造小莹').click();
  await dialog().getByRole('radio', { name: '沉静', exact: true }).check();
  await button('试看这个样子').click();
  await screenshot('reduced-motion');
  await page.keyboard.press('Escape');
  results.push(
    '820/390/360/375px 长内容无横向溢出、内容与页脚不重叠；窄屏试看和关闭可达；减少动态流程可操作',
  );

  await button('开启声音').scrollIntoViewIfNeeded();
  await button('开启声音').click();
  assert.ok(await button('关闭声音').isVisible());
  await button('关闭声音').click();
  await button('返回编辑').click();
  await button('回到陪伴').click();
  assert.equal(await page.locator('.shared-experience').count(), 0);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('fragment-growth-v1')),
    'qa-preserve-existing-growth',
  );
  await enter();
  await active('原来的样子');
  assert.equal(await page.locator('.shared-message').count(), 0);
  assert.equal(await page.locator('.shared-traces').count(), 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await button('一起塑造小莹').click();
  await dialog().getByRole('checkbox').first().check();
  await dialog().getByRole('radio', { name: '沉静', exact: true }).check();
  await button('提出这个选择').click();
  await role('sender');
  await button('就这样，一起留下').click();
  await button('返回编辑').click();
  await button('捎一句话').click();
  await page.locator('#gift-message').fill('');
  await button('保存留言').click();
  await page.getByRole('button', { name: /预览这份心意/ }).click();
  await page.locator('.shared-traces > summary').click();
  await button('提议恢复此前的样子').click();
  await role('sender');
  await button('看看这个样子').click();
  await screenshot('watch-pending-mobile');
  assert.equal(await dialog().getAttribute('aria-label'), '看看这个样子');
  await page.keyboard.press('Escape');
  await active('沉静');
  assert.equal(await page.locator('.shared-pending').count(), 1);
  await button('换一种试试').click();
  assert.equal(await dialog().getByRole('checkbox').count(), 1);
  assert.ok(await dialog().getByRole('checkbox').first().isChecked());
  await dialog().getByRole('radio', { name: '好奇', exact: true }).check();
  await button('提出修改后的选择').click();
  await active('沉静');
  await role('friend');
  await button('就这样，一起留下').click();
  await active('好奇');
  results.push(
    '清空原留言后，历史恢复仍可改选并保留原片段；待确认提议独立试看，返回/Escape 均不确认',
  );
  assert.deepEqual(errors, []);
  results.push(
    '原声音开关保留、回个人页无共同表现、真实成长键未改变、刷新清空、无页面脚本错误',
  );
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify({ target, results, errors }, null, 2),
  );
  console.log(JSON.stringify({ output, results, errors }, null, 2));
} finally {
  await browser.close();
}
