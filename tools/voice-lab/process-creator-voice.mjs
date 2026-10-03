#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const args = process.argv.slice(2);
const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const input = value('--input');
const output = value('--output');
const dryRun = args.includes('--dry-run');
if (!input || !output) {
  console.error('Usage: node tools/voice-lab/process-creator-voice.mjs --input PRIVATE_WAV_DIR --output PRIVATE_DERIVED_DIR [--dry-run]');
  process.exit(1);
}

const phonemes = ['curiosity', 'invite', 'comfort', 'refuse', 'startle', 'remember', 'sleep', 'play'];
const inputDir = resolve(input); const outputDir = resolve(output);
const files = (await readdir(inputDir)).filter((file) => file.toLowerCase().endsWith('.wav'));
const invalid = files.filter((file) => !phonemes.some((phoneme) => basename(file).startsWith(`${phoneme}_`)));
if (invalid.length) throw new Error(`Unknown phoneme filename(s): ${invalid.join(', ')}`);
const manifest = { generatedAt: new Date().toISOString(), sourceCount: files.length, rawFilesRemainPrivate: true, assets: [] };
for (const file of files) {
  const source = join(inputDir, file); const stem = basename(file, '.wav');
  const destination = join(outputDir, `${stem}_v1.m4a`);
  // ffmpeg performs the destructive DSP only after an explicit output path is supplied.
  const command = ['-i', source, '-af', 'silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB:stop_periods=1:stop_duration=0.12:stop_threshold=-45dB,loudnorm=I=-20:TP=-2:LRA=7,highpass=f=70,lowpass=f=12000', '-ac', '1', '-ar', '48000', '-c:a', 'aac', '-b:a', '96k', destination];
  manifest.assets.push({ source: file, destination: `${stem}_v1.m4a`, command: ['ffmpeg', ...command], variants: 3 });
  if (!dryRun) {
    await mkdir(outputDir, { recursive: true });
    await exec('ffmpeg', command);
  }
}
if (!dryRun) await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`${dryRun ? 'Dry run' : 'Processed'} ${files.length} private recording(s). Raw audio was not copied to the repository.`);
