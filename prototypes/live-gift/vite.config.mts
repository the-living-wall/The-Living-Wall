import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
// Only the standalone preview needs a subdirectory base (for GitHub Pages).
// Keep the shared production components' root-relative URLs unchanged in source.
const base = process.env.PREVIEW_BASE || '/';
const envDir = fileURLToPath(new URL('../..', import.meta.url));
if (!base.startsWith('/') || !base.endsWith('/') || base.includes('..')) {
  throw new Error(
    'PREVIEW_BASE must be an absolute directory path ending in /.',
  );
}
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, envDir, ''), ...process.env };
  const transport = env.VITE_GIFTS_TRANSPORT || 'http';
  if (!['http', 'cloudbase'].includes(transport))
    throw new Error('Unknown gift transport');
  if (transport === 'cloudbase') {
    for (const key of [
      'VITE_GIFTS_CLOUDBASE_ENV',
      'VITE_GIFTS_CLOUDBASE_REGION',
      'VITE_GIFTS_CLOUDBASE_FUNCTION',
    ]) {
      if (!env[key]) throw new Error(key + ' is required for SDK preview');
    }
  }
  return {
    base,
    envDir,
    root: fileURLToPath(new URL('.', import.meta.url)),
    publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
    resolve: {
      alias: { '@': fileURLToPath(new URL('../..', import.meta.url)) },
    },
    plugins: [
      {
        name: 'preview-public-paths',
        enforce: 'pre',
        transform(code, id) {
          if (
            base === '/' ||
            !/\/(?:lib\/creature-audio\.ts|app\/hand-camera\.tsx|prototypes\/live-gift\/SoundControls\.tsx)$/.test(
              id,
            )
          )
            return;
          return {
            code: code.replace(
              /(['"])\/(audio\/|models\/|mediapipe(?=['"]))/g,
              `$1${base}$2`,
            ),
            map: null,
          };
        },
      },
      react(),
    ],
    css: { postcss: { plugins: [tailwindcss()] } },
    server: { host: '127.0.0.1', port: 4180, strictPort: true },
    build: { outDir: '../../output/gift-layout-preview', emptyOutDir: true },
  };
});
