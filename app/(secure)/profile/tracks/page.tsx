"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { RatingCard } from "@/components/RatingCard";
import { Skeleton } from "@/components/ui/skeleton";
import { WAM_RATINGS_MUTATED } from "@/lib/wamRatingEvents";
import { glassCardTight, pageHeading, pageSub, sectionHeading } from "@/lib/wamUi";
import type { RatingDetail } from "@/lib/types/ratings";

export default function ProfileRatedTracksPage() {
  const [ratings, setRatings] = useState<RatingDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/ratings?item_type=track", { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          ratings?: RatingDetail[];
        };
        if (!res.ok) throw new Error(body.error || res.statusText);
        const list = body.ratings ?? [];
        list.sort(
          (a, b) =>
            b.score - a.score ||
            (a.item?.name ?? "").localeCompare(b.item?.name ?? "", undefined, {
              sensitivity: "base",
            }),
        );
        setRatings(list);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load tracks");
        setRatings([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, []);

  useEffect(() => {
    function refetch() {
      void fetch("/api/ratings?item_type=track", { cache: "no-store" })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as {
            ratings?: RatingDetail[];
          };
          if (!res.ok) return;
          const list = body.ratings ?? [];
          list.sort(
            (a, b) =>
              b.score - a.score ||
              (a.item?.name ?? "").localeCompare(b.item?.name ?? "", undefined, {
                sensitivity: "base",
              }),
          );
          setRatings(list);
        })
        .catch(() => {});
    }
    window.addEventListener(WAM_RATINGS_MUTATED, refetch);
    return () => window.removeEventListener(WAM_RATINGS_MUTATED, refetch);
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
        <h1 className={pageHeading}>Rated tracks</h1>
        <p className={pageSub}>
          All tracks you have scored in WAM, highest score first.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-6">
        <h2 className={sectionHeading}>
          {loading ? "Loading…" : `${ratings.length} track${ratings.length === 1 ? "" : "s"}`}
        </h2>

        {loading ? (
          <ul className="flex flex-col gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i}>
                <Skeleton className={`h-28 w-full ${glassCardTight}`} />
              </li>
            ))}
          </ul>
        ) : ratings.length === 0 ? (
          <p className="text-sm text-white/50">
            No rated tracks yet. Search for a song and save a score.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {ratings.map((r) => (
              <li key={r.id}>
                <RatingCard
                  rating={r}
                  onRatingUpdated={(updated) =>
                    setRatings((prev) =>
                      updated
                        ? prev.map((x) =>
                            x.spotify_id === updated.spotify_id ? updated : x,
                          )
                        : prev.filter((x) => x.spotify_id !== r.spotify_id),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
