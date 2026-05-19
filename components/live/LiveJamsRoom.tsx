"use client";

import { useMemo, useState } from "react";

import { AddToQueue } from "@/components/live/AddToQueue";
import { JamsUpNext } from "@/components/live/JamsUpNext";
import { JukeboxScoreboard } from "@/components/live/JukeboxScoreboard";
import { QuickRate } from "@/components/live/QuickRate";
import { SourceSelector } from "@/components/live/SourceSelector";
import { WamJamsController } from "@/components/live/WamJamsController";
import { LiveNowPlaying } from "@/components/LiveNowPlaying";
import { LiveParticipants } from "@/components/LiveParticipants";
import { LiveRatingForm } from "@/components/LiveRatingForm";
import type { LivePresenceMember } from "@/lib/types/live";
import type {
  LiveQueueRow,
  LiveRatingRow,
  LiveScoreRow,
  LiveSessionAggregate,
  LiveSessionRow,
} from "@/lib/types/live";
import type { GenreTagRow, MoodTagRow } from "@/lib/types/ratings";
import { glassCard } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

type Tab = "now" | "queue" | "people";

export type LiveJamsRoomProps = {
  session: LiveSessionRow;
  userId: string | null;
  participants: LivePresenceMember[];
  hideAvatars: boolean;
  queue: LiveQueueRow[];
  scores: LiveScoreRow[];
  allRatings: LiveRatingRow[];
  aggregate: LiveSessionAggregate | null;
  genreTags: GenreTagRow[];
  moodTags: MoodTagRow[];
  ratedCount: number;
  onlineCount: number;
  canControlPlayback: boolean;
  advancing: boolean;
  submitting: boolean;
  hasSource: boolean;
  onSessionUpdate: (s: LiveSessionRow) => void;
  onAdvance: () => void;
  onEndSession: () => void;
  onSubmitRating: (payload: {
    score: number;
    mood_tag_id: number | null;
    genre_ids: number[];
    comment: string | null;
  }) => void;
  onRefresh: () => void;
  bufferRefreshKey?: number;
};

export function LiveJamsRoom({
  session,
  userId,
  participants,
  hideAvatars,
  queue,
  scores,
  allRatings,
  aggregate,
  genreTags,
  moodTags,
  ratedCount,
  onlineCount,
  canControlPlayback,
  advancing,
  submitting,
  hasSource,
  onSessionUpdate,
  onAdvance,
  onEndSession,
  onSubmitRating,
  onRefresh,
  bufferRefreshKey = 0,
}: LiveJamsRoomProps) {
  const [tab, setTab] = useState<Tab>("now");
  const [sourceSet, setSourceSet] = useState(hasSource);

  const myManualPending = queue.some(
    (q) => q.user_id === userId && q.is_manual && !q.played_at,
  );
  const isTrackOwner = Boolean(userId && session.current_track_user_id === userId);
  const myRating = allRatings.find(
    (r) => r.user_id === userId && r.spotify_track_id === session.spotify_track_id,
  );
  const hasRated = Boolean(myRating) || isTrackOwner;
  const canSeeOthers = hasRated;

  const previousTrack = useMemo(() => {
    const played = queue.filter((q) => q.played_at);
    const last = played[played.length - 1];
    if (!last || last.spotify_track_id === session.spotify_track_id) return null;
    return { id: last.spotify_track_id, name: last.track_name };
  }, [queue, session.spotify_track_id]);

  const ratingBlock =
    hasRated && userId ? (
      <QuickRate
        sessionId={session.id}
        session={session}
        userId={userId}
        trackId={session.spotify_track_id}
        trackStartedAt={session.current_track_started_at}
        previousTrack={previousTrack}
        hasRatedCurrent={hasRated}
        ratingCount={ratedCount}
        participantCount={onlineCount}
        averageScore={canSeeOthers ? aggregate?.average_score : null}
        canSeeOthers={canSeeOthers}
        onSubmitted={onRefresh}
      />
    ) : !isTrackOwner && session.spotify_track_id ? (
      <section className={glassCard}>
        <h2 className="mb-4 text-center text-sm font-medium text-white">Your rating</h2>
        <LiveRatingForm
          genreTags={genreTags}
          moodTags={moodTags}
          disabled={submitting}
          submitting={submitting}
          onSubmit={onSubmitRating}
        />
      </section>
    ) : null;

  return (
    <>
      <WamJamsController
        session={session}
        userId={userId}
        participants={participants}
        onSessionUpdate={onSessionUpdate}
      />

      <div className="mb-4 flex gap-2 lg:hidden">
        {(
          [
            ["now", "Now Playing"],
            ["queue", "Queue"],
            ["people", "People"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-full py-2 text-xs font-medium",
              tab === t ? "bg-wam text-black" : "bg-white/10 text-white/60",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className={cn("space-y-4", tab !== "now" && "hidden lg:block")}>
          <LiveNowPlaying session={session} />
          {session.queue_mode === "surprise" ? (
            <p className="text-center text-xs text-white/45">Up next: 🎵 Surprise</p>
          ) : null}
          {ratingBlock}
          <div className={cn(tab !== "queue" && "lg:hidden")}>
            <JamsUpNext
              session={session}
              userId={userId}
              hideNames={session.hide_queue_names}
              refreshKey={bufferRefreshKey}
            />
          </div>
        </div>

        <div className={cn("space-y-4", tab !== "people" && tab !== "queue" && "hidden lg:block")}>
          {tab === "queue" ? (
            <JamsUpNext
              session={session}
              userId={userId}
              hideNames={session.hide_queue_names}
              refreshKey={bufferRefreshKey}
            />
          ) : (
            <>
              {!sourceSet ? (
                <SourceSelector
                  sessionId={session.id}
                  onSelected={() => {
                    setSourceSet(true);
                    onRefresh();
                  }}
                />
              ) : (
                <SourceSelector sessionId={session.id} compact onSelected={onRefresh} />
              )}
              <AddToQueue
                sessionId={session.id}
                hasManualPending={myManualPending}
                onAdded={onRefresh}
              />
              <section className={glassCard}>
                <p className="mb-3 text-center text-xs uppercase tracking-wider text-white/40">
                  In the room
                </p>
                <LiveParticipants participants={participants} hideAvatars={hideAvatars} />
              </section>
              <JukeboxScoreboard
                scores={scores}
                rankingMode={session.jukebox_ranking_mode}
                rankingVisibility={session.ranking_visibility}
                userId={userId}
                hideAvatars={hideAvatars}
              />
            </>
          )}
        </div>
      </div>

      <div className="sticky bottom-[var(--wam-player-pad,5rem)] z-20 mt-4 border-t border-white/10 bg-black/80 p-3 backdrop-blur lg:hidden">
        <AddToQueue
          sessionId={session.id}
          hasManualPending={myManualPending}
          onAdded={onRefresh}
        />
      </div>

      {canControlPlayback ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={advancing}
            onClick={onAdvance}
            className="flex-1 rounded-full bg-wam py-3.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {advancing ? "…" : "Next track"}
          </button>
          <button
            type="button"
            onClick={onEndSession}
            className="rounded-full border border-red-400/40 px-4 py-3.5 text-sm text-red-300"
          >
            End session
          </button>
        </div>
      ) : null}
    </>
  );
}
