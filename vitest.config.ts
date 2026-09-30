import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';

const maplibrePackagePath = fs.realpathSync(path.resolve(__dirname, 'node_modules/maplibre-gl'));
const maplibreStyleSpecPath = path.resolve(maplibrePackagePath, '../@maplibre/maplibre-gl-style-spec');

export default defineConfig({
  resolve: {
    alias: {
      '@maplibre/maplibre-gl-style-spec': maplibreStyleSpecPath,
    },
  },
  test: {
    // Keep one jsdom + React + maplibre-gl worker. Parallel workers can hang
    // on this checkout's lazy MapLibre modules and exhaust memory.
    pool: 'threads',
    maxWorkers: 1,
    fileParallelism: false,
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'e2e/**',
      'server/**',
      // Tool packages carry their own dependencies and Vitest configuration.
      'tools/**',
      // Agent worktrees hold whole checkouts of this repo. Collected, every
      // suite runs once per worktree, and a CLI path argument is a substring
      // filter, so naming one file runs every copy of it.
      '.claude/**',
      '.agents/**',
      // The project lives on a volume that writes AppleDouble sidecars; without
      // this they get collected as unparsable test files.
      '**/._*',
    ],
  }
});
