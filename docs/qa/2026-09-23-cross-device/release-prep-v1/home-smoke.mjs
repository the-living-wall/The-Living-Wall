import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: {width, height:844} });
    const page = await context.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4195');
    await page.getByLabel('小莹的成长与亲密度', {exact:true}).waitFor();
    await page.getByRole('button', {name:'启用摄像头',exact:true}).waitFor();
    if (width > 700) {
      await page.getByText('声音设置', {exact:true}).click();
      await page.getByRole('button', {name:'试听快速移动',exact:true}).click();
      await page.getByRole('button', {name:'关闭声音',exact:true}).waitFor();
      await page.getByText('声音设置', {exact:true}).click();
    } else {
      // Existing production CSS hides advanced settings on narrow screens.
      assert.equal(await page.getByText('声音设置', {exact:true}).isVisible(), false);
      await page.getByRole('button', {name:'关闭声音',exact:true}).waitFor();
    }
    await page.getByRole('button', {name:'关闭声音',exact:true}).click();
    await page.getByRole('button', {name:'开启声音',exact:true}).waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`outputs/cross-device-qa/release-prep-v1/main-showcase/home-${width}.png`,fullPage:true});
    assert.deepEqual(errors, []);
    console.log(`${width}: personal growth, camera entry, sound stop, overflow PASS (movement preview desktop only)`);
    await context.close();
  }
} finally { await browser.close(); }
