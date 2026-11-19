import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  projects: [
    {
      name: "local",
      testIgnore: "**/providers.spec.ts",
      // Balance CI shards by test; restart.spec.ts keeps its explicit serial group.
      fullyParallel: true,
    },
    { name: "providers", testMatch: "**/providers.spec.ts" },
  ],
  workers: 1,
  reporter: process.env.CI
    ? [
        ["list"],
        ["github"],
        [
          "json",
          {
            outputFile:
              process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ??
              "tests/results/browser-report.json",
          },
        ],
      ]
    : "list",
  use: { trace: "retain-on-failure" },
  webServer: {
    command: "python3 scripts/playground-server.py",
    url: "http://127.0.0.1:4318",
    reuseExistingServer: !process.env.CI,
  },
});
