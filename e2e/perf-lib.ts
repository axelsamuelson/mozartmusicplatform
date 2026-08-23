import type { Locator, Page } from "@playwright/test";

export type PerfSample = {
  label: string;
  shellMs: number;
  contentMs: number;
  apiMs: number | null;
  apiPath?: string;
};

export const PERF_BUDGET = {
  shell: { ok: 1500, slow: 3000 },
  content: { ok: 2500, slow: 5000 },
  api: { ok: 1500, slow: 4000 },
} as const;

function grade(ms: number, budget: { ok: number; slow: number }): string {
  if (ms <= budget.ok) return "ok";
  if (ms <= budget.slow) return "slow";
  return "BAD";
}

export function formatPerfReport(samples: PerfSample[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("Navigation performance");
  lines.push("─".repeat(72));
  lines.push(
    pad("Scenario", 28) +
      pad("Shell", 10) +
      pad("Content", 10) +
      pad("API", 10) +
      "Grade",
  );
  lines.push("─".repeat(72));

  for (const s of samples) {
    const shellG = grade(s.shellMs, PERF_BUDGET.shell);
    const contentG = grade(s.contentMs, PERF_BUDGET.content);
    const worst =
      shellG === "BAD" || contentG === "BAD"
        ? "BAD"
        : shellG === "slow" || contentG === "slow"
          ? "slow"
          : "ok";

    lines.push(
      pad(s.label, 28) +
        pad(`${s.shellMs}ms`, 10) +
        pad(`${s.contentMs}ms`, 10) +
        pad(s.apiMs != null ? `${s.apiMs}ms` : "—", 10) +
        worst,
    );
  }

  lines.push("─".repeat(72));
  lines.push(
    `Budgets: shell ≤${PERF_BUDGET.shell.ok}ms ok / ≤${PERF_BUDGET.shell.slow}ms slow · ` +
      `content ≤${PERF_BUDGET.content.ok}ms ok / ≤${PERF_BUDGET.content.slow}ms slow · ` +
      `API ≤${PERF_BUDGET.api.ok}ms ok / ≤${PERF_BUDGET.api.slow}ms slow`,
  );
  lines.push("");
  return lines.join("\n");
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

type MeasureNavOptions = {
  label: string;
  linkName?: string;
  click?: () => Promise<void>;
  heading: string | RegExp;
  headingLevel?: 1 | 2;
  content: Locator;
  apiPath?: string;
  apiQuery?: string;
  apiMethod?: string;
  requireApi?: boolean;
};

async function waitForApi(
  page: Page,
  t0: number,
  options: Pick<MeasureNavOptions, "apiPath" | "apiQuery" | "apiMethod" | "requireApi">,
): Promise<{ apiMs: number | null; apiPath?: string }> {
  if (!options.apiPath) return { apiMs: null };

  const method = options.apiMethod ?? "GET";
  try {
    const r = await page.waitForResponse(
      (res) => {
        const url = new URL(res.url());
        return (
          url.pathname.includes(options.apiPath!) &&
          (!options.apiQuery || url.search.includes(options.apiQuery)) &&
          res.request().method() === method &&
          res.status() < 500
        );
      },
      { timeout: options.requireApi ? 45_000 : 20_000 },
    );
    return { apiMs: Date.now() - t0, apiPath: new URL(r.url()).pathname };
  } catch {
    if (options.requireApi) throw new Error(`API not observed: ${options.apiPath}`);
    return { apiMs: null };
  }
}

export async function measureNavigation(
  page: Page,
  options: MeasureNavOptions,
): Promise<PerfSample> {
  const t0 = Date.now();
  let apiMs: number | null = null;
  let apiPath: string | undefined;

  const apiPromise = waitForApi(page, t0, options);

  if (options.click) {
    await options.click();
  } else if (options.linkName) {
    await page.getByRole("link", { name: options.linkName, exact: true }).click();
  } else {
    throw new Error("measureNavigation requires click or linkName");
  }

  const apiResult = await apiPromise;
  apiMs = apiResult.apiMs;
  apiPath = apiResult.apiPath;

  await page
    .getByRole("heading", {
      level: options.headingLevel ?? 1,
      name: options.heading,
    })
    .waitFor({ state: "visible", timeout: 45_000 });
  const shellMs = Date.now() - t0;

  await options.content.waitFor({ state: "visible", timeout: 45_000 });
  const contentMs = Date.now() - t0;

  return {
    label: options.label,
    shellMs,
    contentMs,
    apiMs,
    apiPath,
  };
}

export async function measureGoto(
  page: Page,
  url: string,
  options: Omit<MeasureNavOptions, "linkName" | "click">,
): Promise<PerfSample> {
  const t0 = Date.now();
  let apiMs: number | null = null;
  let apiPath: string | undefined;

  const apiPromise = waitForApi(page, t0, options);
  await page.goto(url);
  const apiResult = await apiPromise;
  apiMs = apiResult.apiMs;
  apiPath = apiResult.apiPath;

  await page
    .getByRole("heading", {
      level: options.headingLevel ?? 1,
      name: options.heading,
    })
    .waitFor({ state: "visible", timeout: 45_000 });
  const shellMs = Date.now() - t0;

  await options.content.waitFor({ state: "visible", timeout: 45_000 });
  const contentMs = Date.now() - t0;

  return {
    label: options.label,
    shellMs,
    contentMs,
    apiMs,
    apiPath,
  };
}
