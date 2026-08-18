"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { LoadingMark } from "@/components/LoadingMark";
import { scoreBadgeClass } from "@/components/ScoreSlider";
import { Skeleton } from "@/components/ui/skeleton";
import type { TopItem } from "@/lib/profile/aggregateRatings";
import { spotifyItemHref } from "@/lib/spotify/player";
import { cn } from "@/lib/utils";
import { glassCardTight, pageHeading, pageSub, sectionHeading } from "@/lib/wamUi";

export default function ProfileRatedArtistsPage() {
  const [artists, setArtists] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/profile/artists", { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          artists?: TopItem[];
        };
        if (!res.ok) throw new Error(body.error || res.statusText);
        setArtists(body.artists ?? []);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load artists");
        setArtists([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pb-16 pt-24 md:px-6">
      <div>
        <Link
          href="/profile"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/55 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Profile
        </Link>
        <h1 className={pageHeading}>Rated artists</h1>
        <p className={pageSub}>
          All artists from your rated tracks, ranked by the average of each
          artist’s up to five highest-rated tracks.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-6">
        <h2 className={sectionHeading}>
          {loading ? (
            <LoadingMark />
          ) : (
            `${artists.length} artist${artists.length === 1 ? "" : "s"}`
          )}
        </h2>

        {loading ? (
          <ul className="flex flex-col gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i}>
                <Skeleton className={`h-16 w-full ${glassCardTight}`} />
              </li>
            ))}
          </ul>
        ) : artists.length === 0 ? (
          <p className="text-sm text-white/50">
            No rated artists yet. Score some tracks and they will show up here.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {artists.map((it, i) => {
              const href = it.spotify_id
                ? spotifyItemHref("artist", it.spotify_id)
                : null;
              const name = (
                <span className="truncate font-medium text-white">{it.name}</span>
              );
              return (
                <li key={`${it.spotify_id || "n"}-${it.name}-${i}`}>
                  <div
                    className={cn(
                      glassCardTight,
                      "flex items-center gap-3 py-3",
                    )}
                  >
                    <span className="w-7 shrink-0 text-right text-sm tabular-nums text-white/40">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      {href ? (
                        <Link
                          href={href}
                          className="block truncate font-medium text-white transition-colors hover:text-wam hover:underline"
                        >
                          {it.name}
                        </Link>
                      ) : (
                        name
                      )}
                      {it.rated_count != null ? (
                        <p className="text-xs tabular-nums text-white/45">
                          {it.rated_count > (it.track_count ?? 0)
                            ? `${it.track_count} of ${it.rated_count} tracks`
                            : `${it.rated_count} ${it.rated_count === 1 ? "track" : "tracks"}`}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                        scoreBadgeClass(it.score),
                      )}
                    >
                      {it.score}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
