"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuditReport } from "@/lib/audit/useAuditCollector";
import { glassCard, pageHeading, pageSub } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

function severityClass(severity: string): string {
  if (severity === "error") return "text-red-400 border-red-400/30 bg-red-500/10";
  if (severity === "warn") return "text-amber-200 border-amber-400/30 bg-amber-500/10";
  return "text-white/70 border-white/15 bg-white/5";
}

export default function AuditPage() {
  const [refreshMs] = useState(5_000);
  const { report, loading, error, refresh } = useAuditReport(refreshMs);

  const json = report ? JSON.stringify(report, null, 2) : "";

  async function copyReport() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      toast.success("Audit report copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pb-28 pt-24 md:px-6">
      <header className="space-y-2">
        <h1 className={pageHeading}>Playback & live audit</h1>
        <p className={pageSub}>
          Diagnostic snapshot for debugging smooth playback and WAM sessions. Copy the
          JSON and paste it into Cursor when investigating issues. Refreshes every{" "}
          {refreshMs / 1000}s.
        </p>
        <p className="text-xs text-white/45">
          Tip: reproduce the issue on another page (e.g. live session), then open this
          page or click Refresh — Player state is read from the bottom bar.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-full bg-wam text-black hover:bg-wam/90"
          >
            {loading ? "Refreshing…" : "Refresh now"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!json}
            onClick={() => void copyReport()}
            className="rounded-full border-white/25 text-white hover:bg-white/10"
          >
            Copy JSON for AI
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </header>

      {report ? (
        <>
          <section className={cn("space-y-3 p-5", glassCard)}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
              Signals
            </h2>
            <ul className="flex flex-col gap-2">
              {report.signals.map((s) => (
                <li
                  key={`${s.code}-${s.message}`}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    severityClass(s.severity),
                  )}
                >
                  <span className="font-mono text-[10px] uppercase opacity-70">
                    {s.code}
                  </span>
                  <p className="mt-0.5">{s.message}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className={cn("p-5", glassCard)}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
              Full report (JSON)
            </h2>
            <pre className="max-h-[60vh] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-white/80">
              {json}
            </pre>
          </section>
        </>
      ) : (
        <p className="text-sm text-white/50">Loading audit data…</p>
      )}
    </div>
  );
}
