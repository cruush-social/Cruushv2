import { defineConfig } from "vitest/config";

// Server half of the fast tier. A spec joins by being named *.smoke.test.ts.
// Run from the repo root with `pnpm smoke`, which runs this and the frontend half.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.smoke.test.ts"],
    exclude: ["dist/**", "node_modules/**"]
  }
});
