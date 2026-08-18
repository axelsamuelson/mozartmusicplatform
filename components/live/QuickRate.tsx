"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ScoreSlider } from "@/components/ScoreSlider";
import { TempoIntensitySlider } from "@/components/TempoIntensitySlider";
import { Button } from "@/components/ui/button";
import { fetchWithRetry, userFacingFetchError } from "@/lib/http/fetchRetry";
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
  const [tempo, setTempo] = useState<number | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retroOpen, setRetroOpen] = useState(false);
  const [optimisticRated, setOptimisticRated] = useState(false);

  const shownAsRated = hasRatedCurrent || optimisticRated;

  useEffect(() => {
    setOptimisticRated(false);
    setScore(50);
    setTempo(null);
    setIntensity(null);
    setRetroOpen(false);
  }, [trackId]);

  async function submit(retroactive = false, targetTrackId?: string) {
    const tid = targetTrackId ?? trackId;
    if (!tid) return;
    if (!retroactive) setOptimisticRated(true);
    setSubmitting(true);
    try {
      const ratingTimeMs =
        !retroactive && trackStartedAt
          ? Date.now() - new Date(trackStartedAt).getTime()
          : null;

      const res = await fetchWithRetry(`/api/live/${sessionId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score,
          tempo,
          intensity,
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
      if (!retroactive) setOptimisticRated(false);
      toast.error(userFacingFetchError(e, "Could not save rating. Try again."));
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
      {shownAsRated ? (
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
          <div className="mt-4">
            <TempoIntensitySlider
              tempo={tempo}
              intensity={intensity}
              onChange={(t, i) => {
                setTempo(t);
                setIntensity(i);
              }}
              disabled={submitting}
              variant="compact"
            />
          </div>
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
          <div className="mt-3">
            <TempoIntensitySlider
              tempo={tempo}
              intensity={intensity}
              onChange={(t, i) => {
                setTempo(t);
                setIntensity(i);
              }}
              disabled={submitting}
              variant="compact"
            />
          </div>
          <Button
            type="button"
            disabled={submitting}
            className="mt-3 w-full rounded-full bg-wam text-sm font-semibold text-black hover:bg-wam/90"
            onClick={() => void submit(true, previousTrack.id)}
          >
            {submitting ? "Submitting…" : "Rate previous track"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
