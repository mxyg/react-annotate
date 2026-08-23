import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), dts({ include: ['src'], rollupTypes: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ReactAnnotate',
      formats: ['es', 'cjs'],
      fileName: (format) => `react-annotate.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      // snapdom 是可选 peer，动态 import；打成 external 让宿主自己决定装不装
      external: ['react', 'react-dom', 'react/jsx-runtime', '@zumer/snapdom'],
      output: { assetFileNames: 'react-annotate.[ext]' },
    },
    cssCodeSplit: false,
  },
});
