import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = new URL('./main.ts', import.meta.url);
const result = await build({
  entryPoints: [fileURLToPath(source)],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
});
const fragment = await readFile(
  new URL('./fragment.html', import.meta.url),
  'utf8',
);
const output = process.argv[2];
if (!output) throw new Error('Provide the output HTML fragment path.');
await writeFile(
  output,
  `${fragment}<script>\n${result.outputFiles[0].text}\n</script>\n`,
);
console.log(output);
