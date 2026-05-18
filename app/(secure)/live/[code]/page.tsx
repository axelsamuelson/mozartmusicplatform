"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { LiveParticipants } from "@/components/LiveParticipants";
import { LiveRatingForm } from "@/components/LiveRatingForm";
import { scoreBadgeClass, scoreReadoutClass } from "@/components/ScoreSlider";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveSessionChannel } from "@/lib/live/useLiveSessionChannel";
import { liveAvatarUrl, liveDisplayName, liveInitials } from "@/lib/live/userDisplay";
import { createClient } from "@/lib/supabase/client";
import type { LiveRatingRow, LiveSessionAggregate, LiveSessionRow } from "@/lib/types/live";
import type { GenreTagRow, MoodTagRow } from "@/lib/types/ratings";
import { normalizeSessionCode } from "@/lib/utils/sessionCode";
import { glassCard, pageHeading, pageSub } from "@/lib/wamUi";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function LiveSessionPage() {
  const params = useParams();
  const rawCode = typeof params.code === "string" ? params.code : "";
  const code = normalizeSessionCode(rawCode);

  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("User");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [session, setSession] = useState<LiveSessionRow | null>(null);
  const [ratings, setRatings] = useState<LiveRatingRow[]>([]);
  const [aggregate, setAggregate] = useState<LiveSessionAggregate | null>(null);
  const [genreTags, setGenreTags] = useState<GenreTagRow[]>([]);
  const [moodTags, setMoodTags] = useState<MoodTagRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const myRating = useMemo(
    () => ratings.find((r) => r.user_id === userId) ?? null,
    [ratings, userId],
  );
  const hasSubmitted = Boolean(myRating);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setUserId(u.id);
      setDisplayName(liveDisplayName(u));
      setAvatarUrl(liveAvatarUrl(u));
    });
  }, []);

  const loadRatings = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/live/${sessionId}/ratings`);
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      ratings?: LiveRatingRow[];
      aggregate?: LiveSessionAggregate;
    };
    if (!res.ok) throw new Error(body.error || "Could not load ratings");
    setRatings(body.ratings ?? []);
    setAggregate(body.aggregate ?? null);
  }, []);

  useEffect(() => {
    if (!code) {
      setError("Invalid session code");
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/live?code=${encodeURIComponent(code)}`, { signal: ac.signal }).then(
        async (res) => {
          const body = (await res.json()) as { error?: string; session?: LiveSessionRow };
          if (!res.ok) throw new Error(body.error || "Session not found");
          return body.session!;
        },
      ),
      fetch("/api/tags", { signal: ac.signal }).then(async (res) => {
        const body = (await res.json()) as {
          genre_tags?: GenreTagRow[];
          mood_tags?: MoodTagRow[];
        };
        return body;
      }),
    ])
      .then(async ([sess, tags]) => {
        setSession(sess);
        setGenreTags(tags.genre_tags ?? []);
        setMoodTags(tags.mood_tags ?? []);
        await loadRatings(sess.id);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load session");
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [code, loadRatings]);

  const { participants } = useLiveSessionChannel({
    sessionId: session?.id ?? null,
    userId,
    displayName,
    avatarUrl,
    hasRated: hasSubmitted,
    enabled: Boolean(session?.id && userId),
    onRatingsChange: () => {
      if (session?.id) void loadRatings(session.id);
    },
  });

  const onlineCount = Math.max(participants.length, 1);
  const ratedCount = aggregate?.rated_count ?? ratings.length;

  async function handleSubmit(payload: {
    score: number;
    mood_tag_id: number | null;
    genre_ids: number[];
    comment: string | null;
  }) {
    if (!session) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/live/${session.id}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        ratings?: LiveRatingRow[];
        aggregate?: LiveSessionAggregate;
      };
      if (!res.ok) throw new Error(body.error || "Could not submit rating");
      setRatings(body.ratings ?? []);
      setAggregate(body.aggregate ?? null);
      toast.success("Rating submitted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit rating");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-lg px-4 pb-32 pt-24 md:pt-28">
        <Skeleton className="mb-6 h-8 w-48 rounded-lg bg-white/10" />
        <Skeleton className="h-64 w-full rounded-2xl bg-white/10" />
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="mx-auto max-w-lg px-4 pb-32 pt-24 md:pt-28">
        <h1 className={pageHeading}>Live session</h1>
        <p className={cn(pageSub, "text-red-300/90")}>{error ?? "Session not found"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-32 pt-24 md:pt-28">
      <header className="mb-6 text-center">
        <p className="text-xs uppercase tracking-widest text-white/40">Live session</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-wam">{code}</p>
        <p className={cn(pageSub, "mt-2")}>
          {ratedCount} of {onlineCount} rated
        </p>
      </header>

      <article className={cn(glassCard, "mb-6 flex flex-col items-center gap-4 text-center")}>
        <TrackArt url={session.image_url} name={session.track_name ?? "Track"} />
        <div>
          <h1 className="text-lg font-semibold text-white">{session.track_name ?? "Unknown track"}</h1>
          <p className="text-sm text-white/50">{session.artist_name ?? "Unknown artist"}</p>
        </div>
      </article>

      <section className={cn(glassCard, "mb-6")}>
        <p className="mb-3 text-center text-xs uppercase tracking-wider text-white/40">
          In the room
        </p>
        <LiveParticipants participants={participants} />
      </section>

      {!hasSubmitted ? (
        <section className={cn(glassCard, "mb-6")}>
          <h2 className="mb-4 text-center text-sm font-medium text-white">Your rating</h2>
          <LiveRatingForm
            genreTags={genreTags}
            moodTags={moodTags}
            disabled={submitting}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        </section>
      ) : null}

      <LiveResults
        ratings={ratings}
        aggregate={aggregate}
        showWaiting={ratedCount === 0}
      />
    </main>
  );
}

function TrackArt({ url, name }: { url: string | null; name: string }) {
  return (
    <div className="relative size-32 overflow-hidden rounded-xl border border-white/10 bg-white/10 shadow-lg">
      {url ? (
        <Image src={url} alt="" fill className="object-cover" sizes="128px" />
      ) : (
        <div className="flex size-full items-center justify-center text-white/30" aria-hidden>
          ♪
        </div>
      )}
    </div>
  );
}

function LiveResults({
  ratings,
  aggregate,
  showWaiting,
}: {
  ratings: LiveRatingRow[];
  aggregate: LiveSessionAggregate | null;
  showWaiting: boolean;
}) {
  if (showWaiting) {
    return (
      <section className={cn(glassCard, "space-y-3")}>
        <p className="text-center text-sm text-white/50">Waiting for ratings…</p>
        <Skeleton className="h-12 w-full rounded-xl bg-white/10" />
        <Skeleton className="h-20 w-full rounded-xl bg-white/10" />
      </section>
    );
  }

  const avg = aggregate?.average_score;

  return (
    <section className={cn(glassCard, "space-y-6")}>
      {avg != null ? (
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-white/40">Group average</p>
          <p className={cn("text-5xl font-bold tabular-nums", scoreReadoutClass(avg))}>{avg}</p>
        </div>
      ) : null}

      {aggregate && aggregate.mood_counts.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-white/40">Moods</p>
          <div className="flex flex-wrap justify-center gap-2">
            {aggregate.mood_counts.map(({ mood, count }) => (
              <span
                key={mood.id}
                className="rounded-full px-3 py-1 text-xs font-medium text-black"
                style={{ backgroundColor: mood.color }}
              >
                {mood.name} · {count}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="space-y-3">
        {ratings.map((r) => (
          <li
            key={r.id}
            className="animate-in fade-in duration-300 flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
          >
            <Avatar className="size-9 border border-white/15">
              <AvatarFallback className="bg-white/10 text-xs text-white">
                {liveInitials(r.display_name ?? "User")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <RatingHeader rating={r} />
              {r.comment ? (
                <p className="mt-1 text-sm text-white/60">{r.comment}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RatingHeader({ rating }: { rating: LiveRatingRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="truncate text-sm font-medium text-white">
        {rating.display_name ?? "User"}
      </span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
          scoreBadgeClass(rating.score),
        )}
      >
        {rating.score}
      </span>
      {rating.mood ? (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium text-black"
          style={{ backgroundColor: rating.mood.color }}
        >
          {rating.mood.name}
        </span>
      ) : null}
    </div>
  );
}
