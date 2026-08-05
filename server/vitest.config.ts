import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep the pool bounded so a server run alongside the root suite does not
    // spawn one fork per core in each.
    pool: "forks",
    minWorkers: 1,
    maxWorkers: 4,
    environment: "node",
    // The project lives on a volume that writes AppleDouble sidecars; without
    // this they get collected as unparsable test files.
    exclude: ["dist/**", "node_modules/**", "**/._*"]
  }
});
