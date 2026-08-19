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
    <div className={cn(glassCardTight, "flex items-center gap-2 p-2 md:p-2")}>
      <Link
        href={playlist.href}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-0.5 transition-colors hover:text-wam"
      >
        <div className="relative size-11 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/10">
          {playlist.source === "wam" && !playlist.image_url ? (
            <PlaylistCover name={playlist.name} className="size-11 p-1 text-[9px]" />
          ) : playlist.image_url ? (
            <Image
              src={playlist.image_url}
              alt=""
              width={44}
              height={44}
              className="size-11 object-cover"
            />
          ) : null}
        </div>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
          {playlist.name}
        </span>
        {playlist.rank ? (
          <RankLabel rank={playlist.rank} className="text-xs text-white/55" />
        ) : null}
      </Link>
      {playlist.spotify_url ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full border-white/20 bg-transparent px-3 text-xs text-white hover:bg-white/10"
          asChild
        >
          <a href={playlist.spotify_url} target="_blank" rel="noopener noreferrer">
            Spotify
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
    <section className="flex flex-col gap-4">
      <h2 className={`${sectionHeading} flex items-center gap-2`}>
        <ListMusic className="size-4 text-white/50" aria-hidden />
        In playlists
      </h2>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className={`h-14 w-full ${glassCardTight}`} />
          <Skeleton className={`h-14 w-full ${glassCardTight}`} />
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
        <div className="flex flex-col gap-5">
          {data.wam.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-white/45">
                WAM
              </h3>
              <ul className="flex flex-col gap-2">
                {data.wam.map((pl) => (
                  <li key={pl.id}>
                    <PlaylistRow playlist={pl} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.spotify.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-white/45">
                Spotify
              </h3>
              <ul className="flex flex-col gap-2">
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
