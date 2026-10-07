import { defineConfig } from 'vite';

// Base path is injected by CI (VITE_BASE). Default '/' for local dev.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['src/**/*.test.ts'] },
});
