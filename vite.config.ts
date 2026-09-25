/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [preact()],
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
        offscreen: resolve('offscreen.html'),
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
