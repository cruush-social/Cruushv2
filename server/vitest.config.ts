import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The project lives on a volume that writes AppleDouble sidecars; without
    // this they get collected as unparsable test files.
    exclude: ["dist/**", "node_modules/**", "**/._*"]
  }
});
