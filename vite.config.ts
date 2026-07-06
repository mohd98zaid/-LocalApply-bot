import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const manifest = require('./manifest.json');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),
  ],

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },

  build: {
    // Chrome Extensions don't need the modulepreload polyfill.
    modulePreload: false,

    rollupOptions: {
      input: {
        popup:      resolve(__dirname, 'popup.html'),
        sidepanel:  resolve(__dirname, 'sidepanel.html'),
        options:    resolve(__dirname, 'options.html'),
        offscreen:  resolve(__dirname, 'offscreen.html'),
        // Named differently from content/index.ts to avoid CRXJS chunk confusion
        background: resolve(__dirname, 'src/background/serviceWorker.ts'),
      },

      output: {
        manualChunks(id) {
          // React family — browser-only, must never reach the SW
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          // idb is SW-safe (uses IndexedDB, not DOM)
          if (id.includes('node_modules/idb')) {
            return 'vendor-idb';
          }
        },
      },
    },

    target: 'esnext',
    minify: true,
    sourcemap: process.env.NODE_ENV === 'development',
  },

  server: {
    port: 5173,
    hmr: { protocol: 'ws', host: 'localhost', port: 5173 },
  },
});
