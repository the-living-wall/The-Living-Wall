import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
// Only the standalone preview needs a subdirectory base (for GitHub Pages).
// Keep the shared production components' root-relative URLs unchanged in source.
const base = process.env.PREVIEW_BASE || '/';
if (!base.startsWith('/') || !base.endsWith('/') || base.includes('..')) {
  throw new Error('PREVIEW_BASE must be an absolute directory path ending in /.');
}
export default defineConfig({
  base,
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../..', import.meta.url)) } },
  plugins: [
    {
      name: 'preview-public-paths',
      enforce: 'pre',
      transform(code, id) {
        if (base === '/' || !/\/(?:lib\/creature-audio\.ts|app\/hand-camera\.tsx|prototypes\/live-gift\/SoundControls\.tsx)$/.test(id)) return;
        return {
          code: code.replace(/(['"])\/(audio\/|models\/|mediapipe(?=['"]))/g, `$1${base}$2`),
          map: null,
        };
      },
    },
    react(),
  ],
  css: { postcss: { plugins: [tailwindcss()] } },
  server: { host: '127.0.0.1', port: 4180, strictPort: true },
  build: { outDir: '../../output/gift-layout-preview', emptyOutDir: true },
});
