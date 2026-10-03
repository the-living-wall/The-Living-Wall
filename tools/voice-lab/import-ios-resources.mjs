#!/usr/bin/env node
/**
 * Copy only authorized, derived WAV files into an iOS resource directory.
 * Raw creator recordings must never be passed to this command.
 */
import fs from 'node:fs';
import path from 'node:path';

const PHONEMES = ['curiosity', 'invite', 'comfort', 'refuse', 'startle', 'remember', 'sleep', 'play'];
const usage = 'node tools/voice-lab/import-ios-resources.mjs --input <selected-dir> --resources <ios-resources-dir> [--dry-run]';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const input = arg('--input');
const resources = arg('--resources');
const dryRun = process.argv.includes('--dry-run');
if (!input || !resources || process.argv.includes('--help')) {
  console.error(usage);
  process.exit(input || resources ? 0 : 2);
}

function fail(message) {
  console.error(`错误：${message}`);
  process.exitCode = 1;
}

function parseWav(file) {
  const data = fs.readFileSync(file);
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是 RIFF/WAVE 文件');
  }
  let offset = 12;
  let fmt;
  while (offset + 8 <= data.length) {
    const id = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    if (id === 'fmt ' && size >= 16) {
      fmt = {
        format: data.readUInt16LE(offset + 8),
        channels: data.readUInt16LE(offset + 10),
        sampleRate: data.readUInt32LE(offset + 12),
        bits: data.readUInt16LE(offset + 22),
      };
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!fmt) throw new Error('缺少 fmt 音频格式块');
  return fmt;
}

const names = fs.readdirSync(input).filter((name) => name.toLowerCase().endsWith('.wav')).sort();
if (!names.length) {
  fail('输入目录没有 WAV；请只提供离线处理后的 selected 目录。');
  process.exit();
}
const expected = new Set();
for (const phoneme of PHONEMES) for (let i = 1; i <= 3; i += 1) expected.add(`${phoneme}_${String(i).padStart(2, '0')}.wav`);
const manifest = [];
for (const name of names) {
  if (!expected.has(name)) {
    fail(`${name} 不是允许的音素资源名（只允许 8 个已录制音素、每个最多 3 个变体）`);
    continue;
  }
  try {
    const fmt = parseWav(path.join(input, name));
    if (fmt.format !== 1 || fmt.channels !== 1 || fmt.sampleRate !== 48000 || fmt.bits !== 16) {
      fail(`${name} 格式为 ${fmt.format}/${fmt.channels}ch/${fmt.sampleRate}Hz/${fmt.bits}bit；要求 PCM、单声道、48kHz、16-bit`);
      continue;
    }
    manifest.push({ name, phoneme: name.slice(0, -7), format: 'pcm_s16le', channels: 1, sampleRate: 48000, bits: 16 });
  } catch (error) {
    fail(`${name}: ${error.message}`);
  }
}
if (process.exitCode) process.exit();
fs.mkdirSync(resources, { recursive: true });
for (const entry of manifest) {
  const destination = path.join(resources, entry.name);
  if (!dryRun) fs.copyFileSync(path.join(input, entry.name), destination);
}
const manifestPath = path.join(resources, 'voice-resource-manifest.json');
if (!dryRun) fs.writeFileSync(manifestPath, `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), source: 'authorized-derived-local-assets', assets: manifest }, null, 2)}\n`);
console.log(`${dryRun ? '将导入' : '已导入'} ${manifest.length} 个派生音频资源${dryRun ? '' : `，清单写入 ${manifestPath}`}`);
