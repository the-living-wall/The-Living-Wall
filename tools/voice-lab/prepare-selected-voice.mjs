#!/usr/bin/env node
/** Convert the creator's Chinese selection export into canonical iOS assets. */
import fs from 'node:fs';
import path from 'node:path';

const map = new Map([
  ['好奇', 'curiosity'], ['邀请', 'invite'], ['安心', 'comfort'], ['拒绝', 'refuse'],
  ['受惊', 'startle'], ['想念', 'remember'], ['困倦', 'sleep'], ['玩耍', 'play'],
]);
function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const selectionFile = arg('--selection'); const variantsDir = arg('--variants'); const outputDir = arg('--output');
if (!selectionFile || !variantsDir || !outputDir || process.argv.includes('--help')) {
  console.error('node tools/voice-lab/prepare-selected-voice.mjs --selection <json> --variants <dir> --output <dir>');
  process.exit(selectionFile || variantsDir || outputDir ? 0 : 2);
}
const selection = JSON.parse(fs.readFileSync(selectionFile, 'utf8'));
if (!Array.isArray(selection.selected)) throw new Error('selection.selected 必须是数组');
const grouped = new Map();
for (const sourceId of selection.selected) {
  const match = sourceId.match(/^(.+)_([0-9]{2})_v([1-3])$/);
  if (!match || !map.has(match[1])) throw new Error(`无法识别选择项：${sourceId}`);
  const phoneme = map.get(match[1]);
  const source = path.join(variantsDir, `${sourceId}.wav`);
  if (!fs.existsSync(source)) throw new Error(`缺少音频文件：${source}`);
  if (!grouped.has(phoneme)) grouped.set(phoneme, []);
  grouped.get(phoneme).push({ sourceId, source });
}
fs.mkdirSync(outputDir, { recursive: true });
const assets = [];
for (const [phoneme, entries] of grouped) {
  entries.forEach((entry, index) => {
    const name = `${phoneme}_${String(index + 1).padStart(2, '0')}.wav`;
    fs.copyFileSync(entry.source, path.join(outputDir, name));
    assets.push({ name, phoneme, sourceId: entry.sourceId });
  });
}
const manifest = { version: 2, source: path.basename(selectionFile), selectedCount: assets.length, assets };
fs.writeFileSync(path.join(outputDir, 'voice-resource-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`已准备 ${assets.length} 个授权派生 iOS 声音资源`);
