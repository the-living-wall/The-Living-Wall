import { build } from 'esbuild';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const directory = 'outputs/gifts/cloudbase';
await mkdir(directory, { recursive: true });
await build({
  entryPoints: ['services/gifts/cloud-bundle.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: directory + '/service.cjs',
  sourcemap: false,
});
for (const name of ['package.json', 'package-lock.json'])
  await cp('services/gifts/cloudbase/' + name, directory + '/' + name);
await cp('services/gifts/cloudbase/index.cjs', directory + '/index.js');
const files = ['index.js', 'service.cjs', 'package.json', 'package-lock.json'];
const hashes = {};
for (const name of files)
  hashes[name] = createHash('sha256')
    .update(await readFile(directory + '/' + name))
    .digest('hex');
await writeFile(
  directory + '/manifest.json',
  JSON.stringify(
    {
      source: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      workingTree: execFileSync('git', ['status', '--short'], {
        encoding: 'utf8',
      }).trim(),
      builtAt: new Date().toISOString(),
      hashes,
    },
    null,
    2,
  ),
);
console.log('CloudBase function files built in ' + directory);
