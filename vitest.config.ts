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
    // Each fork loads jsdom + React + maplibre-gl, so an unbounded pool (one
    // fork per core) exhausts memory on this machine. Cap it.
    pool: 'forks',
    minWorkers: 1,
    maxWorkers: 4,
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'server/**',
      // The project lives on a volume that writes AppleDouble sidecars; without
      // this they get collected as unparsable test files.
      '**/._*',
    ],
  }
});
