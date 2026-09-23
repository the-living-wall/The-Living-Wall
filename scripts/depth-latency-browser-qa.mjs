// Synthetic input only. Does not open a camera or record images.
// Run against an existing local dev server: node scripts/depth-latency-browser-qa.mjs URL OUTPUT
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile, readFile } from 'node:fs/promises';
const base = process.argv[2] || 'http://127.0.0.1:3098/';
const output = process.argv[3] || '/tmp/depth-optimized.json';
const browser = await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  let requests = 0, mode = 'active', delay = 5, session = 'software-only', fixed = false;
  let frozen = null;
  const origin = performance.now();
  await page.route('**/__depth-lab/state', async route => {
    requests++;
    const t = performance.now()-origin, id = Math.floor(t/(1000/30));
    const payload = { protocol_version: 1, stream_id: session, frame_id: id,
      source_age_ms: t-id*(1000/30), processing_ms: 1, mode: 'pipe', age_ms: 1,
      result: { state: 'near', background_model: 'pixel-wall-v2', diagnostic_valid: true,
        near_regions: [{ area_px: 80, center: [fixed ? .2 : .3+(id%300)/1000, .4] }] } };
    if (mode === 'frozen') frozen ??= payload;
    if (mode === 'calibrating') payload.result.state = 'calibrating';
    if (mode === 'empty') payload.result.near_regions = [];
    await new Promise(resolve => setTimeout(resolve, delay));
    try { await route.fulfill({ status: mode === 'old' ? 426 : 200, json: mode === 'frozen' ? frozen : payload }); }
    catch { /* aborted on teardown */ }
  });
  await page.goto(base);
  await page.waitForTimeout(2000); // hydration; first baseline attempt omitted this and timed out
  await page.getByRole('button', { name: '启用深度实验', exact: true }).click();
  // Entering depth mode legitimately creates/saves the current normal archive.
  const archive = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.includes('depth'))));
  const marker = page.locator('.depth-position');
  await marker.waitFor();
  await page.waitForTimeout(2000);
  await page.getByText('输入诊断', { exact: true }).click();
  await page.getByRole('button', { name: '记录 60 秒', exact: true }).click();
  const cadence = await page.evaluate(async () => {
    let last = '';
    const samples = [], begin = performance.now();
    return await new Promise(resolve => {
      function frame(t) {
        const p = document.querySelector('.depth-position')?.getAttribute('style');
        if (p && p !== last) { samples.push(t); last = p; }
        if (t-begin >= 10000) resolve({ duration_ms: t-begin, updates: samples.length,
          unique_updates_per_second: (samples.length-1)*1000/(samples.at(-1)-samples[0]),
          intervals_ms: samples.slice(1).map((v,i) => v-samples[i]) });
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  });
  await page.getByRole('button', { name: '停止记录', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出数值', exact: true }).click();
  const download = await downloadPromise;
  const diagnostic = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.ok(cadence.unique_updates_per_second >= 25);
  assert.ok(diagnostic.summary.unique_fps >= 25);
  assert.ok(diagnostic.summary.display_submit_age_upper_p95_ms <= 100);
  assert.ok(diagnostic.summary.display_samples >= diagnostic.summary.unique_frames*.9);
  assert.equal(diagnostic.summary.dropouts, 0);
  mode = 'frozen';
  await page.waitForTimeout(100); // let the frozen frame become the last accepted input
  const frozenStarted = performance.now();
  await marker.waitFor({ state: 'hidden', timeout: 350 });
  const frozenClearObserved = performance.now()-frozenStarted+100;
  mode = 'active'; session = 'new-session';
  await marker.waitFor();
  for (const state of ['calibrating', 'empty', 'old']) {
    mode = state;
    await marker.waitFor({ state: 'hidden', timeout: 350 });
    if (state === 'old') assert.match(await page.locator('body').innerText(), /更新并重启深度服务/);
    mode = 'active';
    await marker.waitFor();
  }
  fixed = true;
  await page.waitForTimeout(150);
  const position = async () => marker.evaluate(el => [parseFloat(el.style.left), parseFloat(el.style.top)]);
  assert.deepEqual(await position(), [20, 40]);
  await page.getByLabel('左右镜像').check();
  await page.getByLabel('上下镜像').check();
  await page.waitForTimeout(150);
  assert.deepEqual(await position(), [80, 60]);
  delay = 500;
  await marker.waitFor({ state: 'hidden', timeout: 350 });
  await page.getByRole('button', { name: '关闭深度实验', exact: true }).click();
  await page.waitForTimeout(600);
  assert.equal(await marker.count(), 0);
  const after = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.includes('depth'))));
  assert.deepEqual(after, archive, 'normal growth archive must remain unchanged during depth mode');
  const report = { kind: 'software-only browser comparison; route-mocked 30fps; 5ms artificial response delay; no hardware',
    browser: browser.version(), requests, ...cadence, frozen_clear_observed_ms: frozenClearObserved,
    checks: ['numeric export', '>=25Hz', 'DOM submit P95<=100ms', 'frozen frames expire', 'new session', 'calibration', 'no region', 'old protocol', 'both mirrors', 'slow request expiry', 'exit with request pending', 'normal archive unchanged'], diagnostic };
  await writeFile(output, JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify({ ...report, intervals_ms: undefined, diagnostic: diagnostic.summary }));
} finally { await browser.close(); }
