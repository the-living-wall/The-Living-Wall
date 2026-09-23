// Run against a local branch preview: QA_URL=http://localhost:3018 node scripts/showcase-browser-qa.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const url = process.env.QA_URL || 'http://localhost:3018';
const browser = await chromium.launch({ headless: true });
try {
  await mkdir('outputs/showcase-qa', { recursive: true });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile, hasTouch: mobile,
    });
    await context.addInitScript(() => {
      localStorage.setItem('fragment-growth-v1', 'qa-sentinel-normal');
      localStorage.setItem('fragment-growth-depth-experiment-v1', 'qa-sentinel-depth');
    });
    const page = await context.newPage();
    const errors = [];
    const audioResponses = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { if (new URL(r.url()).pathname.startsWith('/audio/')) audioResponses.push(r.status()); });
    await page.goto(`${url}/showcase`);
    await page.waitForFunction(() => {
      const el = document.querySelector('.showcase-presets button');
      return el && Object.keys(el).some((key) => key.startsWith('__reactProps'));
    });
    const growth = page.locator('.showcase-controls input').nth(0);
    for (const [name, value] of [['初生白光', 0], ['青痕萌发', 0.15], ['流彩舒展', 0.35], ['亲密共生', 0.65], ['成熟光体', 0.85]]) {
      await page.getByRole('button', { name: new RegExp(name) }).click();
      await page.waitForFunction((expected) => Math.abs(+document.querySelector('.showcase-controls input').value - expected) < 0.001, value);
    }
    for (let i = 0; i < 3; i++) {
      await page.locator('.showcase-controls input').nth(i).fill('0.5');
      assert(Math.abs(+(await page.locator('.showcase-controls input').nth(i).inputValue()) - 0.5) < 0.02);
    }
    await page.getByRole('button', { name: '播放完整成长', exact: true }).click();
    await page.waitForFunction(() => +document.querySelector('.showcase-controls input').value > 0.01);
    await page.getByRole('button', { name: '暂停成长播放', exact: true }).click();
    const paused = +(await growth.inputValue());
    await page.waitForTimeout(350);
    assert.equal(+(await growth.inputValue()), paused);
    await page.getByRole('button', { name: '恢复初始', exact: true }).click();
    assert.equal(await growth.inputValue(), '0');
    const canvas = page.locator('canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    // Browser-generated mouse/touch input (including actual pointer capture).
    const cdp = mobile ? await context.newCDPSession(page) : null;
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.width / 2, y: box.y + box.height / 2 }] });
    } else {
      await page.mouse.move(box.width / 2, box.y + box.height / 2);
    }
    await page.waitForFunction(() => !document.querySelector('.showcase-status').textContent.includes('独处'));
    if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    else await page.mouse.move(1, box.y + box.height + 10);
    await page.getByRole('button', { name: '关闭声音', exact: true }).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: '关闭声音', exact: true }).click();
    await page.getByRole('button', { name: '开启声音', exact: true }).waitFor();
    await page.getByRole('button', { name: '开启声音', exact: true }).click();
    await page.getByRole('button', { name: '关闭声音', exact: true }).waitFor();
    assert(await page.locator('.sound-row > button').getAttribute('aria-pressed') === 'true');
    assert(audioResponses.some((s) => s === 200 || s === 206));
    assert(audioResponses.every((s) => s < 400), `Audio request errors: ${JSON.stringify(audioResponses)}`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.evaluate(() => localStorage.getItem('fragment-growth-v1')), 'qa-sentinel-normal');
    assert.equal(await page.evaluate(() => localStorage.getItem('fragment-growth-depth-experiment-v1')), 'qa-sentinel-depth');
    await page.screenshot({ path: `outputs/showcase-qa/${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.goto('about:blank');
    await context.close();
    console.log(`${mobile ? 'mobile' : 'desktop'}: controls, input, audio, archive isolation, overflow PASS`);
  }
} finally { await browser.close(); }
