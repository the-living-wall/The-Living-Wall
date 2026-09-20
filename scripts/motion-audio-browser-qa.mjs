// Real UI + Web Audio output check. QA_URL may also target the deployed site.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.addInitScript(() => {
    window.audioQA = { starts: [], peak: 0, errors: [] };
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(...args) {
        super(...args);
        const analyser = this.createAnalyser();
        // Explicitly rebound with .call below.
        // oxlint-disable-next-line typescript/unbound-method
        const connect = AudioNode.prototype.connect;
        const destination = this.destination;
        // Observe the existing output in parallel; do not replace audible routing.
        AudioNode.prototype.connect = function (target, ...rest) {
          if (target === destination) connect.call(this, analyser);
          return connect.call(this, target, ...rest);
        };
        const samples = new Float32Array(analyser.fftSize);
        const timer = setInterval(() => {
          if (this.state === 'closed') return clearInterval(timer);
          analyser.getFloatTimeDomainData(samples);
          window.audioQA.peak = Math.max(
            window.audioQA.peak,
            ...samples.map(Math.abs),
          );
        }, 10);
        const create = this.createBufferSource.bind(this);
        this.createBufferSource = () => {
          const source = create();
          const start = source.start.bind(source);
          source.start = (...a) => {
            window.audioQA.starts.push({
              rate: source.playbackRate.value,
              duration: a[2],
              at: this.currentTime,
            });
            return start(...a);
          };
          return source;
        };
      }
    };
  });
  page.on('pageerror', (error) => console.error(error.message));
  await page.goto(process.env.QA_URL || 'http://[::1]:3023/');
  await page.waitForLoadState('networkidle');
  const button = page.getByRole('button', {
    name: '开启互动声音',
    exact: true,
  });
  await button.waitFor();
  const box = await button.boundingBox();
  assert.ok(box);
  // Actual coordinate hit testing (not programmatic click handlers).
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByText('关闭互动声音', { exact: true }).waitFor();
  await page.mouse.move(500, 470);
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => window.audioQA.starts.length);
  for (let i = 0; i < 24; i++) {
    const angle = i * 0.55;
    await page.mouse.move(
      640 + Math.cos(angle) * 130,
      470 + Math.sin(angle) * 130,
    );
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => ({
    ...window.audioQA,
    body: document.body.innerText,
  }));
  assert.ok(result.starts.length > before, 'motion must start audio');
  assert.ok(
    result.starts.slice(before).some((s) => Math.abs(s.rate - 0.6) < 0.001),
    'motion must play scales',
  );
  assert.ok(result.peak > 0.001, `non-silent audio output: ${result.peak}`);
  console.log(
    JSON.stringify(
      { url: page.url(), before, ...result, body: result.body.slice(0, 250) },
      null,
      2,
    ),
  );
  await page.mouse.move(5, 5);
  await page.waitForTimeout(6000);
  const endCount = await page.evaluate(() => window.audioQA.starts.length);
  await page.waitForTimeout(2000);
  assert.equal(
    await page.evaluate(() => window.audioQA.starts.length),
    endCount,
    'settled state must not repeat sounds',
  );
  const beforeShock = await page.evaluate(() => window.audioQA.starts.length);
  await page.mouse.move(420, 460);
  await page.waitForTimeout(30);
  await page.mouse.move(790, 460);
  await page.waitForTimeout(30);
  await page.mouse.move(520, 460);
  await page.waitForTimeout(250);
  assert.ok(
    (await page.locator('body').innerText()).includes('受惊'),
    'fast swipe must actually startle creature',
  );
  const shockCues = await page.evaluate(
    (n) => window.audioQA.starts.slice(n),
    beforeShock,
  );
  assert.ok(
    shockCues.some((s) => Math.abs(s.rate - 0.6) < 0.001),
    'startle must emit scales',
  );
  console.log('PASS: actual startled state with scales', shockCues);
  await page.getByText('关闭互动声音', { exact: true }).click();
  console.log(
    'PASS: real button, motion scales, nonzero Web Audio output, settled silence, off control',
  );
} finally {
  await browser.close();
}
