"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, ListMusic } from "lucide-react";

import { PlaylistCover } from "@/components/PlaylistCover";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { glassCardTight, sectionHeading } from "@/lib/wamUi";
import type { TrackPlaylistHit, TrackPlaylistsPayload } from "@/lib/types/trackPlaylists";
import { cn } from "@/lib/utils";

function PlaylistRow({
  playlist,
  external,
}: {
  playlist: TrackPlaylistHit;
  external?: boolean;
}) {
  const cover = (
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
  );

  const body = (
    <>
      {cover}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
        {playlist.name}
      </span>
      <Badge variant="outline" className="shrink-0 border-white/20 text-[10px] text-white/70">
        {playlist.source === "wam" ? "WAM" : "Spotify"}
      </Badge>
      {external ? (
        <ExternalLink className="size-3.5 shrink-0 text-white/40" aria-hidden />
      ) : null}
    </>
  );

  const className = cn(
    glassCardTight,
    "flex items-center gap-3 p-2 transition-colors hover:bg-white/[0.09] md:p-2",
  );

  if (external) {
    return (
      <a
        href={playlist.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {body}
      </a>
    );
  }

  return (
    <Link href={playlist.href} className={className}>
      {body}
    </Link>
  );
}

export function TrackPlaylists({
  spotifyId,
  refreshKey,
}: {
  spotifyId: string;
  refreshKey: number;
}) {
  const [data, setData] = useState<TrackPlaylistsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setData({ wam: body.wam ?? [], spotify: body.spotify ?? [] });
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load playlists");
        setData(null);
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
                    <PlaylistRow playlist={pl} external />
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
