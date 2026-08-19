"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { RatingCard, type RatingCardRater } from "@/components/RatingCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { liveAvatarUrl, liveDisplayName } from "@/lib/live/userDisplay";
import { createClient } from "@/lib/supabase/client";
import { WAM_RATINGS_MUTATED } from "@/lib/wamRatingEvents";
import { glassCardTight, glassSurface, pageHeading, pageSub, sectionHeading } from "@/lib/wamUi";
import type { DashboardStats, RatingDetail } from "@/lib/types/ratings";

export default function DashboardPage() {
  const [ratings, setRatings] = useState<RatingDetail[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rater, setRater] = useState<RatingCardRater | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      setRater({
        name: liveDisplayName(user),
        avatarUrl: liveAvatarUrl(user),
      });
    });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/ratings?limit=20&stats=1", { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          ratings?: RatingDetail[];
          stats?: DashboardStats;
        };
        if (!res.ok) throw new Error(body.error || res.statusText);
        setRatings(body.ratings ?? []);
        setStats(body.stats ?? null);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load dashboard");
        setRatings([]);
        setStats(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, []);

  useEffect(() => {
    function refreshFromMutation() {
      void fetch("/api/ratings?limit=20&stats=1", { cache: "no-store" })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            ratings?: RatingDetail[];
            stats?: DashboardStats;
          };
          if (!res.ok) return;
          setRatings(body.ratings ?? []);
          setStats(body.stats ?? null);
        })
        .catch(() => {
          /* ignore background refresh errors */
        });
    }
    window.addEventListener(WAM_RATINGS_MUTATED, refreshFromMutation);
    return () => window.removeEventListener(WAM_RATINGS_MUTATED, refreshFromMutation);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-3 pb-16 pt-24 md:px-6">
      <div>
        <h1 className={pageHeading}>Dashboard</h1>
        <p className={pageSub}>
          Your latest ratings and a quick snapshot of your library.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <section aria-label="Statistics" className="grid grid-cols-3 gap-2 md:gap-4">
        {loading ? (
          <>
            <Skeleton className={`h-[4.5rem] md:h-24 ${glassCardTight}`} />
            <Skeleton className={`h-[4.5rem] md:h-24 ${glassCardTight}`} />
            <Skeleton className={`h-[4.5rem] md:h-24 ${glassCardTight}`} />
          </>
        ) : (
          <>
            <div className={`group flex flex-col gap-0.5 ${glassSurface} p-2.5 md:p-6`}>
              <p className="text-[10px] font-medium tracking-wide text-white/60 uppercase">
                Rated
              </p>
              <p className="text-lg font-bold tabular-nums text-white md:text-3xl">
                {stats?.total_rated ?? 0}
              </p>
              <p className="text-[10px] text-white/55">items total</p>
            </div>
            <div className={`group flex flex-col gap-0.5 ${glassSurface} p-2.5 md:p-6`}>
              <p className="text-[10px] font-medium tracking-wide text-white/60 uppercase">
                Average
              </p>
              <p className="text-lg font-bold tabular-nums text-white md:text-3xl">
                {stats && stats.total_rated > 0 ? stats.avg_score : "—"}
              </p>
              <p className="text-[10px] text-white/55">score 0–100</p>
            </div>
            <div className={`group flex flex-col gap-0.5 ${glassSurface} p-2.5 md:p-6`}>
              <p className="text-[10px] font-medium tracking-wide text-white/60 uppercase">
                This month
              </p>
              <p className="text-lg font-bold tabular-nums text-white md:text-3xl">
                {stats?.rated_this_month ?? 0}
              </p>
              <p className="text-[10px] text-white/55">new or updated</p>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-6">
        <h2 className={sectionHeading}>Recent ratings</h2>

        {loading ? (
          <ul className="flex flex-col gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i}>
                <Skeleton className={`h-28 w-full ${glassCardTight}`} />
              </li>
            ))}
          </ul>
        ) : ratings.length === 0 ? (
          <div
            className={`flex flex-col items-center gap-5 border border-dashed border-white/[0.12] px-6 py-14 text-center ${glassCardTight}`}
          >
            <p className="max-w-sm text-sm leading-relaxed text-white/50">
              You have not rated anything yet. Search Spotify and save your first score.
            </p>
            <Button
              asChild
              size="lg"
              className="rounded-full bg-white px-8 py-3 text-base font-medium text-black shadow-lg transition-all duration-300 hover:scale-105 hover:bg-gray-50 hover:shadow-lg"
            >
              <Link href="/search">Go to search</Link>
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {ratings.map((r) => (
              <li key={r.id}>
                <RatingCard
                  rating={r}
                  rater={rater}
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
