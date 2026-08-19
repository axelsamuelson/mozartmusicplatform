"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { PlaylistCover } from "@/components/PlaylistCover";
import { TempoIntensityPills } from "@/components/TempoIntensityPills";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { scoreBadgeClass } from "@/components/ScoreSlider";
import { PlaylistsSubnav } from "@/components/PlaylistsSubnav";
import { glassCard, glassCardTight, pageHeading, pageSub } from "@/lib/wamUi";
import { spotifyItemHref } from "@/lib/spotify/player";
import type { PlaylistRankingPayload } from "@/lib/types/trackPlaylists";
import { cn } from "@/lib/utils";

export function PlaylistRankingView({
  data,
  backHref,
  backLabel,
}: {
  data: PlaylistRankingPayload;
  backHref: string;
  backLabel: string;
}) {
  const { playlist, tracks } = data;
  const ratedCount = tracks.length;
  const playlistSize = playlist.total_tracks;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pb-16 pt-24 md:px-6">
      <PlaylistsSubnav />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit rounded-full px-0 text-white/70 hover:bg-white/10"
        asChild
      >
        <Link href={backHref}>← {backLabel}</Link>
      </Button>

      <header className={cn("flex flex-col gap-4 p-6 md:p-8", glassCard)}>
        <div className="flex items-start gap-4">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:size-28">
            {playlist.source === "wam" && !playlist.image_url ? (
              <PlaylistCover
                name={playlist.name}
                className="size-full rounded-2xl"
              />
            ) : playlist.image_url ? (
              <Image
                src={playlist.image_url}
                alt=""
                fill
                sizes="112px"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-white/25 text-xs text-white/80">
                {playlist.source === "wam" ? "WAM" : "Spotify"}
              </Badge>
            </div>
            <h1 className={`${pageHeading} text-balance`}>{playlist.name}</h1>
            <p className={pageSub}>
              {ratedCount === playlistSize
                ? `${ratedCount} ranked ${ratedCount === 1 ? "track" : "tracks"}`
                : `${ratedCount} rated of ${playlistSize} tracks`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
          {playlist.spotify_url ? (
            <Button
              type="button"
              className="rounded-full bg-wam font-semibold text-black hover:bg-wam/90"
              asChild
            >
              <a href={playlist.spotify_url} target="_blank" rel="noopener noreferrer">
                Spotify
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Button>
          ) : null}
          {playlist.edit_href ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10"
              asChild
            >
              <Link href={playlist.edit_href}>Edit playlist</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <section className={cn("p-6", glassCard)}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/50">
          Ranking
        </h2>
        {tracks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/50">
            No rated tracks in this playlist yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {tracks.map((t) => (
              <li key={t.spotify_id}>
                <Link
                  href={spotifyItemHref("track", t.spotify_id)}
                  className={cn(
                    glassCardTight,
                    "flex items-center gap-3 p-3 transition-colors hover:bg-white/[0.09] md:p-3",
                  )}
                >
                  <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-white/50">
                    #{t.rank.position}
                  </span>
                  <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/10">
                    {t.image_url ? (
                      <Image
                        src={t.image_url}
                        alt=""
                        width={44}
                        height={44}
                        className="size-11 object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{t.name}</p>
                    {t.artist_name ? (
                      <p className="truncate text-xs text-white/45">{t.artist_name}</p>
                    ) : null}
                    <TempoIntensityPills
                      tempo={t.tempo}
                      intensity={t.intensity}
                      className="mt-1"
                    />
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums",
                      scoreBadgeClass(t.score),
                    )}
                  >
                    {t.score}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
