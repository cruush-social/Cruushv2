import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

// The fast tier. A spec joins it by being named *.smoke.test.ts(x) — no list to maintain
// here. Keep the whole run under about 30 seconds; anything slower belongs in the full
// suite instead. Run with `pnpm test:smoke`, or `pnpm smoke` to include the server.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['**/*.smoke.test.{ts,tsx}'],
    },
  }),
);
