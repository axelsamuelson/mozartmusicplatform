"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { JukeboxAddSong } from "@/components/live/JukeboxAddSong";
import { JukeboxQueue } from "@/components/live/JukeboxQueue";
import { JukeboxScoreboard } from "@/components/live/JukeboxScoreboard";
import { LiveJamsRoom } from "@/components/live/LiveJamsRoom";
import { SessionTimer } from "@/components/live/SessionTimer";
import { LiveNowPlaying } from "@/components/LiveNowPlaying";
import { LiveParticipants } from "@/components/LiveParticipants";
import { LiveRatingForm } from "@/components/LiveRatingForm";
import { scoreBadgeClass, scoreReadoutClass } from "@/components/ScoreSlider";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  clearActiveLiveSession,
  getActiveLiveSession,
  setActiveLiveSession,
} from "@/lib/live/activeSessionStorage";
import { activeLiveSessionRefFromRow } from "@/lib/live/activeSessionMeta";
import { ratingsForCurrentTrack } from "@/lib/live/filterRatingsForTrack";
import { aggregateLiveRatings } from "@/lib/live/aggregateLiveRatings";
import { MAX_QUEUE_TRACKS_PER_USER } from "@/lib/live/jukeboxPriority";
import {
  getEffectiveLiveSessionMode,
  sessionHasQueue,
  sessionHasScores,
} from "@/lib/live/sessionMode";
import { useLiveSessionChannel } from "@/lib/live/useLiveSessionChannel";
import { useLiveSessionDisplayName } from "@/lib/live/useLiveSessionDisplayName";
import { liveAvatarUrl, liveInitials } from "@/lib/live/userDisplay";
import { createClient } from "@/lib/supabase/client";
import type {
  LiveQueueRow,
  LiveRatingRow,
  LiveScoreRow,
  LiveSessionAggregate,
  LiveSessionRow,
} from "@/lib/types/live";
import type { GenreTagRow, MoodTagRow } from "@/lib/types/ratings";
import { normalizeSessionCode } from "@/lib/utils/sessionCode";
import { glassCard, pageHeading, pageSub } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export default function LiveSessionPage() {
  const router = useRouter();
  const params = useParams();
  const rawCode = typeof params.code === "string" ? params.code : "";
  const code = normalizeSessionCode(rawCode);

  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [session, setSession] = useState<LiveSessionRow | null>(null);
  const [allRatings, setAllRatings] = useState<LiveRatingRow[]>([]);
  const [aggregate, setAggregate] = useState<LiveSessionAggregate | null>(null);
  const [queue, setQueue] = useState<LiveQueueRow[]>([]);
  const [scores, setScores] = useState<LiveScoreRow[]>([]);
  const [myQueueCount, setMyQueueCount] = useState(0);
  const [genreTags, setGenreTags] = useState<GenreTagRow[]>([]);
  const [moodTags, setMoodTags] = useState<MoodTagRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [hasSource, setHasSource] = useState(false);
  const [bufferRefreshKey, setBufferRefreshKey] = useState(0);
  const advanceCooldownUntilRef = useRef(0);

  const sessionMode = session ? getEffectiveLiveSessionMode(session) : "legacy";
  const jams = sessionMode === "jams";
  const fifoQueue = sessionMode === "queue";
  const jukebox = sessionMode === "jukebox";
  const hasQueue = session ? sessionHasQueue(session) : false;
  const showSongQueue = fifoQueue || jukebox;
  const isHost = Boolean(session && userId && session.host_user_id === userId);
  const isCoHost = Boolean(session && userId && session.co_host_user_id === userId);
  const canControlPlayback = isHost || isCoHost;
  const isTrackOwner = Boolean(
    showSongQueue && userId && session?.current_track_user_id === userId,
  );

  const currentRatings = useMemo(
    () => (session ? ratingsForCurrentTrack(allRatings, session) : []),
    [allRatings, session],
  );

  const myRating = useMemo(
    () => currentRatings.find((r) => r.user_id === userId) ?? null,
    [currentRatings, userId],
  );
  const hasSubmitted = Boolean(myRating) || isTrackOwner;

  const displayAggregate = useMemo(() => {
    if (aggregate) return aggregate;
    if (!session || currentRatings.length === 0) return null;
    return aggregateLiveRatings(currentRatings, moodTags);
  }, [aggregate, session, currentRatings, moodTags]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setUserId(u.id);
      setAvatarUrl(liveAvatarUrl(u));
    });
  }, []);

  const handleSessionEnded = useCallback(() => {
    clearActiveLiveSession();
    toast.success("Session ended");
    router.push("/dashboard");
  }, [router]);

  const applySession = useCallback((next: LiveSessionRow) => {
    setSession((prev) => (prev ? { ...prev, ...next } : next));
    const active = getActiveLiveSession();
    if (active?.sessionId === next.id) {
      setActiveLiveSession(activeLiveSessionRefFromRow(next));
    }
  }, []);

  const loadQueue = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/live/${sessionId}/queue`);
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      queue?: LiveQueueRow[];
      myQueueCount?: number;
      session?: LiveSessionRow;
    };
    if (!res.ok) throw new Error(body.error || "Could not load queue");
    if (body.session) applySession(body.session);
    setQueue(body.queue ?? []);
    setMyQueueCount(body.myQueueCount ?? 0);
  }, [applySession]);

  const loadScores = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/live/${sessionId}/scores`);
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      scores?: LiveScoreRow[];
    };
    if (!res.ok) throw new Error(body.error || "Could not load scores");
    setScores(body.scores ?? []);
  }, []);

  const loadRatings = useCallback(
    async (sessionId: string) => {
      const res = await fetch(`/api/live/${sessionId}/ratings`);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        ratings?: LiveRatingRow[];
        allRatings?: LiveRatingRow[];
        aggregate?: LiveSessionAggregate;
        session?: LiveSessionRow;
        scores?: LiveScoreRow[];
      };
      if (!res.ok) throw new Error(body.error || "Could not load ratings");
      if (body.session) applySession(body.session);
      setAllRatings(body.allRatings ?? body.ratings ?? []);
      setAggregate(body.aggregate ?? null);
      if (body.scores) setScores(body.scores);
    },
    [applySession],
  );

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
        const active = getActiveLiveSession();
        if (active?.sessionId === sess.id) {
          setActiveLiveSession(activeLiveSessionRefFromRow(sess));
        }
        setGenreTags(tags.genre_tags ?? []);
        setMoodTags(tags.mood_tags ?? []);
        await loadRatings(sess.id);
        if (sessionHasQueue(sess)) {
          await Promise.all([loadQueue(sess.id), loadScores(sess.id)]);
        }
        if (getEffectiveLiveSessionMode(sess) === "jams") {
          const srcRes = await fetch(`/api/live/${sess.id}/source`);
          const srcBody = (await srcRes.json()) as { mine?: { source_type?: string } | null };
          setHasSource(Boolean(srcBody.mine && srcBody.mine.source_type !== "none"));
        }
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load session");
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [code, loadRatings, loadQueue, loadScores]);

  const {
    displayName,
    isAnonymous,
    loading: displayNameLoading,
  } = useLiveSessionDisplayName(
    session?.id ?? null,
    Boolean(session?.anonymous_mode),
  );

  const { participants } = useLiveSessionChannel({
    sessionId: session?.id ?? null,
    userId,
    displayName,
    avatarUrl: isAnonymous ? null : avatarUrl,
    hasRated: hasSubmitted,
    enabled: Boolean(session?.id && userId && !displayNameLoading),
    onRatingsChange: () => {
      if (session?.id) void loadRatings(session.id);
    },
    onQueueChange: () => {
      if (session?.id && hasQueue) void loadQueue(session.id);
    },
    onScoresChange: () => {
      if (session?.id && sessionHasScores(session)) void loadScores(session.id);
    },
    onSessionUpdate: applySession,
    onSessionEnded: handleSessionEnded,
    onBufferChange: () => setBufferRefreshKey((k) => k + 1),
  });

  const onlineCount = Math.max(participants.length, 1);
  const ratedCount = displayAggregate?.rated_count ?? currentRatings.length;
  const hideAvatars = Boolean(session?.anonymous_mode);

  async function handleSubmit(payload: {
    score: number;
    mood_tag_id: number | null;
    genre_ids: number[];
    comment: string | null;
  }) {
    if (!session || isTrackOwner) return;
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
        allRatings?: LiveRatingRow[];
        aggregate?: LiveSessionAggregate;
        session?: LiveSessionRow;
        scores?: LiveScoreRow[];
      };
      if (!res.ok) throw new Error(body.error || "Could not submit rating");
      if (body.session) applySession(body.session);
      setAllRatings(body.allRatings ?? body.ratings ?? []);
      setAggregate(body.aggregate ?? null);
      if (body.scores) setScores(body.scores);
      toast.success("Rating submitted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit rating");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNextTrack() {
    if (!session || !canControlPlayback) return;
    if (Date.now() < advanceCooldownUntilRef.current) return;
    advanceCooldownUntilRef.current = Date.now() + 3000;
    setAdvancing(true);
    try {
      const endpoint = jams
        ? `/api/live/${session.id}/advance`
        : `/api/live/${session.id}/queue/next`;
      const res = await fetch(endpoint, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        session?: LiveSessionRow;
        queue?: LiveQueueRow[];
      };
      if (res.status === 401 && body.error === "host_token_expired") {
        toast.error(body.message ?? "Host Spotify session expired — log in again");
        return;
      }
      if (res.status === 409) {
        toast.error("Advance already in progress");
        return;
      }
      if (!res.ok) throw new Error(body.error || "Could not advance queue");
      if (body.session) applySession(body.session);
      if (body.queue) setQueue(body.queue);
      await loadScores(session.id);
      await loadRatings(session.id);
      toast.success(body.session?.spotify_track_id ? "Next track" : "Queue finished");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not advance queue");
    } finally {
      setAdvancing(false);
    }
  }

  async function handleRemoveFromQueue(queueId: string) {
    if (!session) return;
    setRemovingId(queueId);
    try {
      const res = await fetch(
        `/api/live/${session.id}/queue?trackId=${encodeURIComponent(queueId)}`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        queue?: LiveQueueRow[];
      };
      if (!res.ok) throw new Error(body.error || "Could not remove track");
      if (body.queue) {
        setQueue(body.queue);
        setMyQueueCount(body.queue.filter((q) => q.user_id === userId).length);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove track");
    } finally {
      setRemovingId(null);
    }
  }

  const wideLayout = jukebox;
  const mainClass = wideLayout
    ? "mx-auto max-w-5xl px-4 pb-32 pt-24 md:pt-28"
    : "mx-auto max-w-lg px-4 pb-32 pt-24 md:pt-28";

  async function handleEndSession() {
    if (!session || !canControlPlayback) return;
    const res = await fetch(`/api/live/${session.id}/end`, { method: "POST" });
    if (res.ok) {
      clearActiveLiveSession();
      window.location.href = `/live/${code}/summary`;
    }
  }

  function handleRefresh() {
    if (!session) return;
    void loadRatings(session.id);
    if (hasQueue) {
      void loadQueue(session.id);
    }
    if (sessionHasScores(session)) {
      void loadScores(session.id);
    }
  }

  if (loading) {
    return (
      <main className={mainClass}>
        <Skeleton className="mb-6 h-8 w-48 rounded-lg bg-white/10" />
        <Skeleton className="h-64 w-full rounded-2xl bg-white/10" />
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className={mainClass}>
        <h1 className={pageHeading}>Live session</h1>
        <p className={cn(pageSub, "text-red-300/90")}>{error ?? "Session not found"}</p>
      </main>
    );
  }

  return (
    <main className={mainClass}>
      <header className="sticky top-16 z-30 mb-6 rounded-xl border border-white/10 bg-black/70 py-4 text-center backdrop-blur">
        <p className="text-xs uppercase tracking-widest text-white/40">
          {jams ? "WAM Jams" : jukebox ? "Jukebox session" : "Live session"}
        </p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-wam">{code}</p>
        {session.anonymous_mode ? (
          <p className="mt-2 text-xs font-medium text-wam/90">
            Anonymous mode — you are {displayName}
          </p>
        ) : null}
        <SessionTimer
          session={session}
          onExpire={() => {
            if (!canControlPlayback) return;
            void fetch(`/api/live/${session.id}/end`, { method: "POST" }).then(() => {
              window.location.href = `/live/${code}/summary`;
            });
          }}
        />
        <p className={cn(pageSub, "mt-2")}>
          {ratedCount} of {onlineCount} rated this track
        </p>
        {session.wam_controls_playback ? (
          <p className="mt-1 text-xs text-wam">● WAM controls playback</p>
        ) : null}
      </header>

      {jams ? (
        <LiveJamsRoom
          session={session}
          userId={userId}
          participants={participants}
          hideAvatars={hideAvatars}
          queue={queue}
          scores={scores}
          allRatings={allRatings}
          aggregate={displayAggregate}
          genreTags={genreTags}
          moodTags={moodTags}
          ratedCount={ratedCount}
          onlineCount={onlineCount}
          canControlPlayback={canControlPlayback}
          advancing={advancing}
          submitting={submitting}
          hasSource={hasSource}
          onSessionUpdate={applySession}
          onAdvance={() => void handleNextTrack()}
          onEndSession={() => void handleEndSession()}
          onSubmitRating={handleSubmit}
          onRefresh={handleRefresh}
          bufferRefreshKey={bufferRefreshKey}
        />
      ) : (
      <div className={cn(wideLayout && "grid gap-6 lg:grid-cols-[1fr_280px]")}>
        <div className="min-w-0 space-y-6">
          <LiveNowPlaying session={session} />

          {canControlPlayback && (showSongQueue || jams) ? (
            <button
              type="button"
              disabled={advancing || (!jams && queue.length === 0)}
              onClick={() => void handleNextTrack()}
              className="w-full rounded-full bg-wam py-3.5 text-sm font-semibold text-black transition-opacity hover:bg-wam/90 disabled:opacity-40"
            >
              {advancing ? "Loading…" : "Next track"}
            </button>
          ) : null}

          {showSongQueue ? (
            <>
              <JukeboxQueue
                queue={queue}
                session={session}
                userId={userId}
                hideQueueNames={Boolean(session.hide_queue_names)}
                onRemove={(id) => void handleRemoveFromQueue(id)}
                removingId={removingId}
              />
              <JukeboxAddSong
                sessionId={session.id}
                myQueueCount={myQueueCount}
                maxPerUser={MAX_QUEUE_TRACKS_PER_USER}
                onAdded={() => void loadQueue(session.id)}
              />
            </>
          ) : null}

          <section className={cn(glassCard)}>
            <p className="mb-3 text-center text-xs uppercase tracking-wider text-white/40">
              In the room
            </p>
            <LiveParticipants participants={participants} hideAvatars={hideAvatars} />
          </section>

          {isTrackOwner ? (
            <section className={cn(glassCard)}>
              <p className="text-center text-sm text-white/50">
                This is your queued track — you cannot rate it.
              </p>
            </section>
          ) : null}

          {!hasSubmitted && session.spotify_track_id && !isTrackOwner ? (
            <section className={cn(glassCard)}>
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

          {!session.spotify_track_id ? (
            <section className={cn(glassCard)}>
              <p className="text-center text-sm text-white/50">
                {showSongQueue
                  ? isHost
                    ? "Press Next track when the room is ready to play from the queue."
                    : "Waiting for the host to start the queue…"
                  : "Rate when the host starts playing a track."}
              </p>
            </section>
          ) : null}

          <LiveResults
            ratings={currentRatings}
            aggregate={displayAggregate}
            hideAvatars={hideAvatars}
            showWaiting={ratedCount === 0 && Boolean(session.spotify_track_id)}
          />
        </div>

        {jukebox ? (
          <JukeboxScoreboard
            scores={scores}
            rankingMode={session.jukebox_ranking_mode}
            rankingVisibility={session.ranking_visibility}
            userId={userId}
            hideAvatars={hideAvatars}
          />
        ) : null}
      </div>
      )}
    </main>
  );
}

function LiveResults({
  ratings,
  aggregate,
  hideAvatars,
  showWaiting,
}: {
  ratings: LiveRatingRow[];
  aggregate: LiveSessionAggregate | null;
  hideAvatars?: boolean;
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
      {avg != null ? <GroupAverage score={avg} /> : null}

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
            className="flex animate-in fade-in items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 duration-300"
          >
            {!hideAvatars ? (
              <Avatar className="size-9 border border-white/15">
                <AvatarFallback className="bg-white/10 text-xs text-white">
                  {liveInitials(r.display_name ?? "?")}
                </AvatarFallback>
              </Avatar>
            ) : null}
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

function GroupAverage({ score }: { score: number }) {
  return (
    <div className="text-center">
      <p className="text-xs uppercase tracking-wider text-white/40">Group average</p>
      <p className={cn("text-5xl font-bold tabular-nums", scoreReadoutClass(score))}>{score}</p>
    </div>
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
