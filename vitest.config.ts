import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';

const maplibrePackagePath = fs.realpathSync(path.resolve(__dirname, 'node_modules/maplibre-gl'));
const maplibreStyleSpecPath = path.resolve(maplibrePackagePath, '../@maplibre/maplibre-gl-style-spec');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@maplibre/maplibre-gl-style-spec': maplibreStyleSpecPath,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'server/**',
      // Git worktrees created under .claude/ are full checkouts of this repo, so
      // without this every test file is collected twice — once from src/ and
      // once from a stale copy — which starves the worker pool.
      '**/.claude/worktrees/**',
    ],
  }
});
