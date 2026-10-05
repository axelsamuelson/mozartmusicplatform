"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Disc3 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRatingNeighbors } from "@/lib/ratings/fetchNeighbors";
import type {
  RatingNeighborItem,
  RatingNeighborsResult,
} from "@/lib/ratings/neighbors";
import { spotifyItemHref } from "@/lib/spotify/player";
import { glassCardTight } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export type RatingNeighborsProps = {
  spotifyId: string;
  /** Current score — refetch when the user changes their rating. */
  score: number;
};

function NeighborCard({
  item,
  arrow,
  emptyLabel,
}: {
  item: RatingNeighborItem | null;
  arrow: "↓" | "↑";
  emptyLabel: string;
}) {
  if (!item) {
    return (
      <Card
        size="sm"
        className={cn(
          glassCardTight,
          "bg-white/[0.04] py-0 shadow-none ring-0",
        )}
      >
        <CardContent className="flex min-h-[4.5rem] items-center justify-center px-3 py-3 md:min-h-[5rem] md:px-4">
          <p className="text-sm font-medium text-white/55">{emptyLabel}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link
      href={spotifyItemHref("track", item.track_id)}
      className="block min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wam/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      <Card
        size="sm"
        className={cn(
          glassCardTight,
          "bg-white/[0.04] py-0 shadow-none ring-0 transition-colors hover:bg-white/[0.07]",
        )}
      >
        <CardContent className="flex items-center gap-3 px-3 py-3 md:px-4">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/10">
            {item.image_url ? (
              <Image
                src={item.image_url}
                alt=""
                width={48}
                height={48}
                sizes="48px"
                className="size-12 object-cover"
              />
            ) : (
              <div className="flex size-12 items-center justify-center text-white/40">
                <Disc3 className="size-5" aria-hidden />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tabular-nums text-white/70">
              {arrow} {item.score}
            </p>
            <p className="truncate text-sm font-medium text-white">
              {item.name}
            </p>
            {item.artist_name ? (
              <p className="truncate text-xs text-white/50">{item.artist_name}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function NeighborsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Skeleton className={cn("h-[4.5rem] w-full md:h-[5rem]", glassCardTight)} />
      <Skeleton className={cn("h-[4.5rem] w-full md:h-[5rem]", glassCardTight)} />
    </div>
  );
}

export function RatingNeighbors({ spotifyId, score }: RatingNeighborsProps) {
  const [neighbors, setNeighbors] = useState<RatingNeighborsResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();

    void fetchRatingNeighbors(spotifyId, ac.signal)
      .then((result) => {
        if (ac.signal.aborted) return;
        setNeighbors(result);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        if (!ac.signal.aborted) setNeighbors(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [spotifyId, score]);

  if (loading) {
    return <NeighborsSkeleton />;
  }

  if (!neighbors) {
    return null;
  }

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      aria-label="Rating neighbors"
    >
      <NeighborCard
        item={neighbors.below}
        arrow="↓"
        emptyLabel="Din lägsta"
      />
      <NeighborCard
        item={neighbors.above}
        arrow="↑"
        emptyLabel="Din topplåt"
      />
    </div>
  );
}
