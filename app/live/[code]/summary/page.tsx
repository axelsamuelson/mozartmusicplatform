"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { SessionSummaryView } from "@/components/live/SessionSummaryView";
import { Button } from "@/components/ui/button";
import type { SessionSummaryPayload } from "@/lib/live/sessionSummary";
import { glassCard, pageHeading } from "@/lib/wamUi";

export default function LiveSessionSummaryPage() {
  const params = useParams();
  const code = typeof params.code === "string" ? params.code : "";
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SessionSummaryPayload | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [endOnly, setEndOnly] = useState(true);
  const [mergeAction, setMergeAction] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    void (async () => {
      try {
        const joinRes = await fetch(`/api/live?code=${encodeURIComponent(code)}`);
        const joinBody = (await joinRes.json()) as {
          session?: { id: string; ranking_visibility?: string };
        };
        if (!joinRes.ok || !joinBody.session?.id) return;
        setSessionId(joinBody.session.id);
        setEndOnly(joinBody.session.ranking_visibility === "end_only");

        await fetch(`/api/live/${joinBody.session.id}/summary`, { method: "POST" });
        const res = await fetch(`/api/live/${joinBody.session.id}/summary`);
        const body = (await res.json()) as { summary?: SessionSummaryPayload };
        setSummary(body.summary ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  async function merge(action: "update" | "keep" | "average") {
    if (!sessionId) return;
    setMergeAction(action);
    await fetch(`/api/live/${sessionId}/merge-ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setMergeAction(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-wam" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-32 pt-24">
      <header className="mb-8 text-center">
        <h1 className={pageHeading}>Session complete</h1>
      </header>

      {summary ? (
        <SessionSummaryView summary={summary} revealRanking={endOnly} />
      ) : null}

      <section className={`${glassCard} mt-8 space-y-3`}>
        <p className="text-sm text-white/70">
          Merge your session ratings into your WAM library?
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!!mergeAction} onClick={() => void merge("update")}>
            Update my library
          </Button>
          <Button type="button" variant="outline" disabled={!!mergeAction} onClick={() => void merge("keep")}>
            Keep existing
          </Button>
          <Button type="button" variant="outline" disabled={!!mergeAction} onClick={() => void merge("average")}>
            Average both
          </Button>
        </div>
      </section>

      <div className="mt-8 text-center">
        <Link href="/dashboard" className="text-sm text-wam hover:underline">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
