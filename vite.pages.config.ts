import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/avito-dashboard/',
  publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  build: { outDir: 'docs', emptyOutDir: true },
});
