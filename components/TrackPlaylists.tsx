"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ListMusic } from "lucide-react";

import { PlaylistCover } from "@/components/PlaylistCover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { glassCardTight, sectionHeading } from "@/lib/wamUi";
import type {
  TrackPlaylistHit,
  TrackPlaylistsPayload,
  TrackRank,
} from "@/lib/types/trackPlaylists";
import { cn } from "@/lib/utils";

export function RankLabel({
  rank,
  className,
}: {
  rank: TrackRank;
  className?: string;
}) {
  return (
    <span className={cn("shrink-0 tabular-nums", className)}>
      #{rank.position}
      <span className="text-white/35"> of {rank.total}</span>
    </span>
  );
}

function PlaylistRow({ playlist }: { playlist: TrackPlaylistHit }) {
  return (
    <div className={cn(glassCardTight, "flex items-center gap-2 !p-1.5 md:!p-2")}>
      <Link
        href={playlist.href}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-0.5 transition-colors hover:text-wam md:gap-3"
      >
        <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/10 md:size-11">
          {playlist.source === "wam" && !playlist.image_url ? (
            <PlaylistCover name={playlist.name} className="size-9 p-1 text-[8px] md:size-11 md:text-[9px]" />
          ) : playlist.image_url ? (
            <Image
              src={playlist.image_url}
              alt=""
              width={44}
              height={44}
              className="size-9 object-cover md:size-11"
            />
          ) : null}
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white md:text-sm">
          {playlist.name}
        </span>
        {playlist.rank ? (
          <RankLabel rank={playlist.rank} className="text-[11px] text-white/55 md:text-xs" />
        ) : null}
      </Link>
      {playlist.spotify_url ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 rounded-full px-2 text-[11px] text-white/45 hover:bg-white/10 hover:text-white md:px-3 md:text-xs"
          asChild
        >
          <a href={playlist.spotify_url} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        </Button>
      ) : null}
    </div>
  );
}

export function TrackPlaylists({
  spotifyId,
  refreshKey,
  onPlatformRank,
}: {
  spotifyId: string;
  refreshKey: number;
  onPlatformRank?: (rank: TrackRank | null) => void;
}) {
  const [data, setData] = useState<TrackPlaylistsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onPlatformRankRef = useRef(onPlatformRank);
  onPlatformRankRef.current = onPlatformRank;

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/tracks/${encodeURIComponent(spotifyId)}/playlists`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as TrackPlaylistsPayload & {
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || res.statusText);
        const next: TrackPlaylistsPayload = {
          platform: body.platform ?? null,
          wam: body.wam ?? [],
          spotify: body.spotify ?? [],
        };
        setData(next);
        onPlatformRankRef.current?.(next.platform);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load playlists");
        setData(null);
        onPlatformRankRef.current?.(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [spotifyId, refreshKey]);

  const empty =
    !loading && !error && data && data.wam.length === 0 && data.spotify.length === 0;

  return (
    <section className="flex flex-col gap-3 md:gap-4">
      <h2 className={`${sectionHeading} flex items-center gap-2`}>
        <ListMusic className="size-4 text-white/50" aria-hidden />
        In playlists
      </h2>

      {loading ? (
        <div className="flex flex-col gap-1.5 md:gap-2">
          <Skeleton className={`h-11 w-full ${glassCardTight}`} />
          <Skeleton className={`h-11 w-full ${glassCardTight}`} />
        </div>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : empty ? (
        <p className="text-sm text-white/50">
          Not in any of your playlists yet. Spotify lists show up after you{" "}
          <Link href="/playlists/spotify" className="text-white/80 underline underline-offset-2">
            sync them
          </Link>
          .
        </p>
      ) : data ? (
        <div className="flex flex-col gap-3 md:gap-5">
          {data.wam.length ? (
            <div className="flex flex-col gap-1.5 md:gap-2">
              <h3 className="text-[10px] font-medium uppercase tracking-wide text-white/45 md:text-xs">
                WAM
              </h3>
              <ul className="flex flex-col gap-1.5 md:gap-2">
                {data.wam.map((pl) => (
                  <li key={pl.id}>
                    <PlaylistRow playlist={pl} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.spotify.length ? (
            <div className="flex flex-col gap-1.5 md:gap-2">
              <h3 className="text-[10px] font-medium uppercase tracking-wide text-white/45 md:text-xs">
                Spotify
              </h3>
              <ul className="flex flex-col gap-1.5 md:gap-2">
                {data.spotify.map((pl) => (
                  <li key={pl.id}>
                    <PlaylistRow playlist={pl} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
