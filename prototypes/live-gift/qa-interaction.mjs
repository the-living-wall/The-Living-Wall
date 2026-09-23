import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
const target = process.env.QA_BASE_URL || 'http://127.0.0.1:4180/';
const output =
  process.env.QA_OUTPUT || join(tmpdir(), `xiaoying-interaction-${Date.now()}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {
  startedAt: new Date().toISOString(),
  target,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  cases: [],
};
try {
  for (const [name, id] of [
    ['沉静', 'calm'],
    ['俏皮', 'playful'],
    ['好奇', 'curious'],
  ]) {
    console.log(`Recording ${id}`);
    const dir = join(output, id);
    await mkdir(dir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 850 },
    });
    // Use the existing read-only integration point; never inject creature state.
    await context.addInitScript(() => {
      window.qaTools = {};
      Object.defineProperty(document, 'modelContext', {
        value: {
          registerTool(tool) {
            window.qaTools[tool.name] = tool;
          },
        },
      });
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const result = { name, id, status: 'running', samples: [], errors: [] };
    report.cases.push(result);
    page.on('pageerror', (e) => result.errors.push(e.message));
    const button = (name) => page.getByRole('button', { name, exact: true });
    const state = () =>
      page.evaluate(() => window.qaTools.get_creature_state.execute({}));
    const sample = async (phase) => {
      const value = await state();
      result.samples.push({ stage: phase, time: Date.now(), ...value });
      return value;
    };
    const shot = (label) =>
      page.screenshot({ path: join(dir, `${label}.png`) });
    try {
      await page.goto(target);
      await page.getByRole('button', { name: /送给朋友/ }).click();
      await page.getByRole('button', { name: /预览这份心意/ }).click();
      await button('一起塑造小莹').click();
      await page.getByRole('dialog').getByRole('checkbox').first().check();
      await page
        .getByRole('dialog')
        .getByRole('radio', { name, exact: true })
        .check();
      await button('提出这个选择').click();
      await page.getByLabel('体验身份').selectOption('sender');
      await button('就这样，一起留下').click();
      await page.evaluate(() => scrollTo(0, 0));
      await page.evaluate(() => {
        const stream = document.querySelector('canvas').captureStream(12);
        const recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
        });
        const chunks = [];
        window.qaVideo = { recorder, stream, chunks };
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.start();
      });
      await sample('idle');
      await shot('01-immediate');
      await page.waitForTimeout(2000);
      await sample('idle');
      await shot('02-idle');
      let c = await state();
      await page.mouse.move(c.x * 1280 + 70, c.y * 850 + 35, { steps: 100 });
      await sample('approach');
      await shot('03-approach');
      // Let the initial arrival settle before controlled, slow strokes.
      await page.waitForTimeout(9000);
      for (let i = 0; i < 180; i++) {
        c = await state();
        const angle = i * 0.065;
        await page.mouse.move(
          c.x * 1280 + 75 + Math.sin(angle) * 15,
          c.y * 850 + Math.cos(angle) * 30,
        );
        await page.waitForTimeout(65);
        if (i % 15 === 0) await sample('stroke');
      }
      await shot('04-stroke');
      assert.ok(
        result.samples.some((s) => s.stage === 'stroke' && s.enjoyment > 0.1),
        'No verified gentle stroke response',
      );
      c = await state();
      await page.mouse.move(c.x * 1280 - 40, c.y * 850, { steps: 1 });
      await page.waitForTimeout(20);
      await page.mouse.move(c.x * 1280 + 40, c.y * 850, { steps: 1 });
      await page.waitForTimeout(70);
      await sample('startle');
      await shot('05-startle');
      await page.mouse.move(1250, 20);
      await page.mouse.move(-1, -1);
      let recovered = false;
      for (let i = 0; i < 35; i++) {
        await page.waitForTimeout(700);
        const current = await sample('recovery');
        if (
          i > 5 &&
          current.alarm <= 0.1 &&
          !['startle', 'recover'].includes(current.phase)
        ) {
          recovered = true;
          break;
        }
      }
      assert.ok(
        result.samples.some((s) => s.alarm > 0.1),
        'No observed startle',
      );
      assert.ok(recovered, 'Recovery not observed');
      await shot('06-recovered');
      assert.equal(
        await page.getByTestId('active-temperament').textContent(),
        name,
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(300);
      await shot('07-reduced');
      assert.deepEqual(result.errors, []);
      result.status = 'passed';
    } catch (error) {
      result.status = 'failed';
      result.failure = error.stack;
      await shot('failure').catch(() => {});
      process.exitCode = 1;
    } finally {
      const encoded = await page
        .evaluate(async () => {
          const data = window.qaVideo;
          if (!data) return null;
          await new Promise((resolve) => {
            data.recorder.onstop = resolve;
            data.recorder.stop();
          });
          data.stream.getTracks().forEach((track) => track.stop());
          const bytes = new Uint8Array(
            await new Blob(data.chunks).arrayBuffer(),
          );
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          return btoa(binary);
        })
        .catch(() => null);
      if (encoded)
        await writeFile(
          join(dir, 'interaction.webm'),
          Buffer.from(encoded, 'base64'),
        );
      await context.tracing.stop({ path: join(dir, 'trace.zip') });
      await context.close();
      await writeFile(
        join(output, 'results.json'),
        JSON.stringify(report, null, 2),
      );
      console.log(
        `${id}: ${result.status}${result.failure ? ' ' + result.failure.split('\n')[0] : ''}`,
      );
    }
  }
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(report, null, 2),
  );
}
console.log(output);
