import { defineConfig } from 'vite';

// Relative base ('./') makes the build work at a subdomain root, a subpath, or the
// default github.io URL with no configuration (the app has no client-side routing).
// Override with VITE_BASE only if you need an absolute base.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  build: { target: 'es2022', sourcemap: true },
  // Agent worktrees live under .claude/; their edits must not reload the dev page.
  server: { watch: { ignored: ['**/.claude/**', '**/dist/**'] } },
  test: { include: ['src/**/*.test.ts'] },
});
