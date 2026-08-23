import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/** GitHub Pages 项目页：https://mxyg.github.io/react-annotate/ */
export default defineConfig({
  root: 'demo',
  base: '/react-annotate/',
  plugins: [react()],
  resolve: {
    alias: {
      '@liuman/react-annotate/style.css': fileURLToPath(new URL('./src/styles.css', import.meta.url)),
      '@liuman/react-annotate': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  build: {
    outDir: '../demo-dist',
    emptyOutDir: true,
  },
});
