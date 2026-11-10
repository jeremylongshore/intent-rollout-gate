import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary", "lcov"],
      thresholds: {
        lines: 85,
        branches: 80,
      },
    },
  },
});
