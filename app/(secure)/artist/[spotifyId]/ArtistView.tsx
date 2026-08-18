"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { RatingCard } from "@/components/RatingCard";
import { SpotifyItem } from "@/components/SpotifyItem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { scoreBadgeClass } from "@/components/ScoreSlider";
import { userFacingFetchError } from "@/lib/http/fetchRetry";
import type { ArtistAlbumRow, ArtistTopTrack } from "@/lib/spotify/api";
import { play, spotifyItemHref, spotifyUri } from "@/lib/spotify/player";
import type { RatingDetail } from "@/lib/types/ratings";
import { cn } from "@/lib/utils";
import {
  glassCardTight,
  glassPanel,
  pageHeading,
  pageSub,
  sectionHeading,
} from "@/lib/wamUi";

type ArtistPagePayload = {
  artist: {
    spotify_id: string;
    name: string;
    image_url: string | null;
    genres: string[];
  };
  stats: {
    score: number | null;
    track_count: number;
    rated_count: number;
  };
  ratings: RatingDetail[];
  top_tracks: ArtistTopTrack[];
  albums: ArtistAlbumRow[];
};

export function ArtistView() {
  const params = useParams();
  const spotifyId = params.spotifyId as string;

  const [data, setData] = useState<ArtistPagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!spotifyId) {
        setLoading(false);
        setError("Missing artist id.");
        return Promise.resolve();
      }
      return fetch(`/api/artists/${encodeURIComponent(spotifyId)}`, { signal })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as ArtistPagePayload & {
            error?: string;
          };
          if (!res.ok) throw new Error(body.error || res.statusText);
          setData(body);
          setError(null);
        })
        .catch((e: unknown) => {
          if (e instanceof Error && e.name === "AbortError") return;
          setData(null);
          setError(e instanceof Error ? e.message : "Could not load artist");
        });
    },
    [spotifyId],
  );

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    void load(ac.signal).finally(() => {
      if (!ac.signal.aborted) setLoading(false);
    });
    return () => ac.abort();
  }, [load]);

  async function handlePlay() {
    if (!data || playing) return;
    setPlaying(true);
    try {
      await play(spotifyUri("artist", data.artist.spotify_id));
    } catch (e) {
      toast.error(userFacingFetchError(e, "Could not start playback. Try again."));
    } finally {
      setPlaying(false);
    }
  }

  const scoresById: Record<string, number> = {};
  for (const r of data?.ratings ?? []) {
    if (typeof r.score === "number" && Number.isFinite(r.score)) {
      scoresById[r.spotify_id] = r.score;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pb-16 pt-24 md:px-6">
      <Button
        variant="ghost"
        className="w-fit rounded-full px-0 text-white/70 hover:bg-white/10 hover:text-white"
        asChild
      >
        <Link href="/search">← Back to search</Link>
      </Button>

      {loading ? (
        <div className="flex flex-col gap-6">
          <div className={`flex gap-5 ${glassPanel}`}>
            <Skeleton className="size-32 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-3 pt-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-36 rounded-full" />
            </div>
          </div>
          <Skeleton className={`h-40 w-full ${glassCardTight}`} />
        </div>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : data ? (
        <>
          <header className={`flex gap-5 ${glassPanel}`}>
            <div className="relative size-28 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/10 md:size-36">
              {data.artist.image_url ? (
                <Image
                  src={data.artist.image_url}
                  alt=""
                  width={144}
                  height={144}
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <Badge variant="outline" className="border-white/25 text-xs text-white/80">
                Artist
              </Badge>
              <h1 className={`${pageHeading} text-balance`}>{data.artist.name}</h1>
              {data.artist.genres.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {data.artist.genres.slice(0, 6).map((g) => (
                    <Badge
                      key={g}
                      variant="secondary"
                      className="border-white/15 bg-white/10 text-xs font-normal text-white/85 hover:bg-white/15"
                    >
                      {g}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className={pageSub}>Spotify artist</p>
              )}
              {data.stats.score != null ? (
                <p className="flex flex-wrap items-center gap-2 text-sm text-white/70">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                      scoreBadgeClass(data.stats.score),
                    )}
                  >
                    {data.stats.score}
                  </span>
                  <span>
                    {data.stats.rated_count > data.stats.track_count
                      ? `Average of your ${data.stats.track_count} highest of ${data.stats.rated_count} rated tracks`
                      : `Average of your ${data.stats.rated_count} rated ${data.stats.rated_count === 1 ? "track" : "tracks"}`}
                  </span>
                </p>
              ) : null}
              <Button
                type="button"
                disabled={playing}
                onClick={() => void handlePlay()}
                className="rounded-full bg-wam px-5 font-semibold text-black hover:bg-wam/90"
              >
                <Play className="size-4 fill-current" aria-hidden />
                {playing ? "Starting…" : "Play artist"}
              </Button>
            </div>
          </header>

          <section className="flex flex-col gap-4">
            <h2 className={sectionHeading}>Your ratings</h2>
            {data.ratings.length === 0 ? (
              <p className="text-sm text-white/50">
                You haven't rated any tracks by this artist yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.ratings.map((r) => (
                  <li key={r.id}>
                    <RatingCard
                      rating={r}
                      onRatingUpdated={() => {
                        void load();
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.top_tracks.length ? (
            <section className="flex flex-col gap-4">
              <h2 className={sectionHeading}>Popular</h2>
              <ul className="flex flex-col gap-2">
                {data.top_tracks.map((t) => (
                  <li key={t.spotify_id}>
                    <SpotifyItem
                      spotify_id={t.spotify_id}
                      type="track"
                      name={t.name}
                      artist_name={t.artist_name}
                      image_url={t.image_url}
                      existingScore={scoresById[t.spotify_id] ?? null}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.albums.length ? (
            <section className="flex flex-col gap-4">
              <h2 className={sectionHeading}>Albums</h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {data.albums.map((a) => (
                  <li key={a.spotify_id}>
                    <Link
                      href={spotifyItemHref("album", a.spotify_id)}
                      className={cn(
                        glassCardTight,
                        "flex flex-col gap-2 p-2 transition-colors hover:bg-white/[0.09]",
                      )}
                    >
                      <div className="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/10">
                        {a.image_url ? (
                          <Image
                            src={a.image_url}
                            alt=""
                            fill
                            sizes="(max-width: 640px) 45vw, 160px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 px-0.5 pb-1">
                        <p className="truncate text-sm font-medium text-white">
                          {a.name}
                        </p>
                        {a.release_year ? (
                          <p className="text-xs text-white/50">{a.release_year}</p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
