import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: [
      "src/agents/**/*.test.ts",
      "src/orchestrator/**/*.test.ts",
      "src/preprocess/**/*.test.ts",
      "src/specialized/**/*.test.ts",
      "src/fusion/**/*.test.ts",
      // Sprint 5 — new pipeline-stages module.
      "src/pipeline-stages/**/*.test.ts",
      // Sprint 6 — new text-risk module (AC + DFA + regex + YAML).
      "src/text-risk/**/*.test.ts",
    ],
    environment: "node",
    coverage: {
      provider: "v8",
      // Sprint 4: coverage threshold raised from 50% to 70% (Generator
      // rules, Sprint 4+). The new modules (specialized + fusion) need
      // real coverage, not the 50% floor Sprint 1-3 used.
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
      include: [
        "src/agents/**/*.ts",
        "src/orchestrator/**/*.ts",
        "src/preprocess/**/*.ts",
        "src/specialized/**/*.ts",
        "src/fusion/**/*.ts",
        // Sprint 5 — new pipeline-stages module.
        "src/pipeline-stages/**/*.ts",
        // Sprint 6 — new text-risk module (AC + DFA + regex + YAML).
        "src/text-risk/**/*.ts",
      ],
      exclude: [
        "src/agents/index.ts",
        "src/orchestrator/index.ts",
        "src/preprocess/index.ts",
        "src/specialized/index.ts",
        "src/fusion/index.ts",
        "src/pipeline-stages/index.ts",
        // Sprint 6 — new text-risk barrel.
        "src/text-risk/index.ts",
        // Sprint 5 — exclude test files from coverage (they're
        // exercised at runtime, not "library code" to be covered).
        "**/*.test.ts",
      ],
      reporter: ["text", "text-summary"],
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
