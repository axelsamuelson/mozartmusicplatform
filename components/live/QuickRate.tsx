"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ScoreSlider } from "@/components/ScoreSlider";
import { Button } from "@/components/ui/button";
import type { LiveSessionRow } from "@/lib/types/live";
import { glassCard } from "@/lib/wamUi";

export type QuickRateProps = {
  sessionId: string;
  session: LiveSessionRow;
  userId: string;
  trackId: string | null;
  trackStartedAt?: string | null;
  previousTrack?: { id: string; name: string } | null;
  hasRatedCurrent: boolean;
  ratingCount?: number;
  participantCount?: number;
  averageScore?: number | null;
  canSeeOthers: boolean;
  onSubmitted?: () => void;
};

export function QuickRate({
  sessionId,
  trackId,
  trackStartedAt,
  previousTrack,
  hasRatedCurrent,
  ratingCount = 0,
  participantCount = 0,
  averageScore,
  canSeeOthers,
  onSubmitted,
}: QuickRateProps) {
  const [score, setScore] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [retroOpen, setRetroOpen] = useState(false);

  async function submit(retroactive = false, targetTrackId?: string) {
    const tid = targetTrackId ?? trackId;
    if (!tid) return;
    setSubmitting(true);
    try {
      const ratingTimeMs =
        !retroactive && trackStartedAt
          ? Date.now() - new Date(trackStartedAt).getTime()
          : null;

      const res = await fetch(`/api/live/${sessionId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score,
          spotify_track_id: tid,
          is_retroactive: retroactive,
          rating_time_ms: ratingTimeMs,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Could not submit rating");
      toast.success(retroactive ? "Previous track rated" : "Rating submitted");
      setRetroOpen(false);
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rate");
    } finally {
      setSubmitting(false);
    }
  }

  if (!trackId) {
    return (
      <section className={glassCard}>
        <p className="text-center text-sm text-white/50">Waiting for next track…</p>
      </section>
    );
  }

  return (
    <section className={glassCard}>
      {hasRatedCurrent ? (
        <div className="text-center text-sm text-white/60">
          <p>Your rating: {score}</p>
          <p className="mt-1 text-xs">
            {ratingCount} of {participantCount} rated
          </p>
          {canSeeOthers && averageScore != null ? (
            <p className="mt-2 text-lg font-semibold text-wam">Avg {averageScore.toFixed(0)}</p>
          ) : null}
        </div>
      ) : (
        <>
          <ScoreSlider value={score} onChange={setScore} />
          <Button
            type="button"
            disabled={submitting}
            className="mt-4 w-full rounded-full bg-wam font-semibold text-black hover:bg-wam/90"
            onClick={() => void submit(false)}
          >
            {submitting ? "Submitting…" : "Submit rating"}
          </Button>
        </>
      )}

      {previousTrack && !retroOpen ? (
        <button
          type="button"
          className="mt-3 w-full text-center text-xs text-white/40 hover:text-wam"
          onClick={() => setRetroOpen(true)}
        >
          Missed rating? Rate previous track →
        </button>
      ) : null}

      {retroOpen && previousTrack ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="mb-2 text-xs text-white/50">Previous: {previousTrack.name}</p>
          <ScoreSlider value={score} onChange={setScore} />
          <Button
            type="button"
            size="sm"
            className="mt-2 w-full bg-wam/20 text-wam"
            disabled={submitting}
            onClick={() => void submit(true, previousTrack.id)}
          >
            Submit retroactive
          </Button>
        </div>
      ) : null}
    </section>
  );
}
