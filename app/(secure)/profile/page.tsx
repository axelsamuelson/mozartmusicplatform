"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ActivityChart } from "@/components/ActivityChart";
import { GenreChart } from "@/components/GenreChart";
import { MoodChart } from "@/components/MoodChart";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { glassCard, pageHeading, pageSub, sectionHeading } from "@/lib/wamUi";
import type {
  ActivityMonth,
  GenreCountRow,
  MoodLevelCount,
  TopItem,
} from "@/lib/profile/aggregateRatings";
import type { MoodTagRow } from "@/lib/types/ratings";
import { spotifyItemHref } from "@/lib/spotify/player";
import { cn } from "@/lib/utils";

type OverviewPayload = {
  mood_tags: MoodTagRow[];
  top_tracks: TopItem[];
  top_albums: TopItem[];
  top_artists: TopItem[];
  activity_by_month: ActivityMonth[];
  genre_counts: GenreCountRow[];
  mood_by_level: MoodLevelCount[];
};

function TopList({
  title,
  description,
  items,
  type,
  seeAllHref,
  seeAllLabel,
}: {
  title: string;
  description?: string;
  items: TopItem[];
  type: "track" | "album" | "artist";
  seeAllHref?: string;
  seeAllLabel?: string;
}) {
  return (
    <Card className={cn("gap-2 border-0 bg-transparent text-white shadow-none ring-0", glassCard)}>
      <CardHeader className="space-y-1 px-0 pb-2 pt-0">
        <CardTitle className={sectionHeading}>{title}</CardTitle>
        {description ? (
          <p className="text-xs leading-snug text-white/45">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="px-0 pb-0 pt-0">
        <ol className="flex flex-col gap-2">
          {items.length === 0 ? (
            <li className="text-sm text-white/50">No data yet.</li>
          ) : (
            items.map((it, i) => (
              <li
                key={`${type}-${it.spotify_id || "x"}-${it.name}-${i}`}
                className="flex items-baseline justify-between gap-2 text-sm"
              >
                <span className="tabular-nums text-white/45">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  {it.spotify_id ? (
                    <Link
                      href={spotifyItemHref(type, it.spotify_id)}
                      className="font-medium text-white transition-colors hover:text-wam hover:underline"
                    >
                      {it.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-white">{it.name}</span>
                  )}
                  {it.artist ? (
                    <p className="truncate text-xs text-white/50">{it.artist}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-xs font-bold tabular-nums text-wam">
                    {it.score}
                  </span>
                  {type === "artist" && it.track_count != null ? (
                    <p className="text-[10px] tabular-nums text-white/40">
                      {it.rated_count != null && it.rated_count > it.track_count
                        ? `${it.track_count} of ${it.rated_count} tracks`
                        : `${it.track_count} ${it.track_count === 1 ? "track" : "tracks"}`}
                    </p>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ol>
      </CardContent>
      {seeAllHref && seeAllLabel ? (
        <CardFooter className="border-t border-white/[0.08] bg-transparent p-0 pt-3">
          <Link
            href={seeAllHref}
            className="text-sm font-medium text-wam transition-colors hover:text-wam/85 hover:underline"
          >
            {seeAllLabel}
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export default function ProfilePage() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/profile/overview", { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as OverviewPayload & {
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || res.statusText);
        setData(body);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load profile");
        setData(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pb-16 pt-24 md:px-6">
      <div>
        <h1 className={pageHeading}>Profile</h1>
        <p className={pageSub}>
          Your highest scores, listening context, and rating activity.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading || !data ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className={`h-64 ${glassCard}`} />
          <Skeleton className={`h-64 ${glassCard}`} />
          <Skeleton className={`h-64 ${glassCard}`} />
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-3">
          <TopList
            title="Top 10 tracks"
            items={data.top_tracks}
            type="track"
            seeAllHref="/profile/tracks"
            seeAllLabel="See all rated tracks"
          />
          <TopList title="Top 10 albums" items={data.top_albums} type="album" />
          <TopList
            title="Top 10 artists"
            description="Each score is the average of that artist’s up to five highest-rated tracks (or all tracks if fewer than five)."
            items={data.top_artists}
            type="artist"
            seeAllHref="/profile/artists"
            seeAllLabel="See all rated artists"
          />
        </section>
      )}

      {loading || !data ? (
        <Skeleton className={`h-72 w-full ${glassCard}`} />
      ) : (
        <ActivityChart data={data.activity_by_month} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {loading || !data ? (
          <>
            <Skeleton className={`h-80 ${glassCard}`} />
            <Skeleton className={`h-80 ${glassCard}`} />
          </>
        ) : (
          <>
            <GenreChart data={data.genre_counts} />
            <MoodChart data={data.mood_by_level} />
          </>
        )}
      </div>
    </div>
  );
}
