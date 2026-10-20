/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

// Fontsource lists a .woff fallback after each .woff2; Chrome only ever loads the .woff2, so the
// fallbacks would just add ~14 MB to the package.
const woff2Only = (): Plugin => ({
  name: 'woff2-only',
  enforce: 'pre',
  transform(code, id) {
    if (!/@fontsource[\\/].*\.css$/.test(id)) return;
    return code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, '');
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [woff2Only(), preact()],
  // the scene worker imports onnxruntime-web, which needs ES modules (import.meta.url for its wasm)
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode === 'development',
    minify: mode !== 'development',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        newtab: resolve('newtab.html'),
        options: resolve('options.html'),
        help: resolve('help.html'),
        updates: resolve('updates.html'),
        offscreen: resolve('offscreen.html'),
        blocked: resolve('blocked.html'),
        background: resolve('src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  test: {
    include: ['src/test/**/*.test.ts'],
  },
}));
