import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authFile = path.join("e2e", ".auth", "user.json");
const baseURL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

setup("dev smoke login", async ({ browser }) => {
  const context = await browser.newContext();
  const res = await context.request.post(`${baseURL}/api/dev/smoke/login`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { ok?: boolean; email?: string };
  expect(body.ok).toBe(true);
  expect(body.email).toContain("@musicator.dev");

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await context.storageState({ path: authFile });
  await context.close();
});
