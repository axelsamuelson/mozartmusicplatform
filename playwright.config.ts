import { defineConfig, devices } from "@playwright/test";

import { isLocalSmokeBase } from "./lib/smoke/target";

const baseURL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const localTarget = isLocalSmokeBase(baseURL);
const webServerCommand =
  process.env.SMOKE_WEB_SERVER ?? (localTarget ? "npm run dev" : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  ...(webServerCommand
    ? {
        webServer: {
          command: webServerCommand,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }
    : {}),
});
