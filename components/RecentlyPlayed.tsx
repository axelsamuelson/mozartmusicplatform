"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { History } from "lucide-react";

import { scoreBadgeClass } from "@/components/ScoreSlider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signInWithSpotifyClient } from "@/lib/auth/signInWithSpotifyClient";
import type { RecentTrack } from "@/app/api/spotify/recently-played/route";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RecentlyPlayed() {
  const [tracks, setTracks] = useState<RecentTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchTracks = useCallback(() => {
    setLoading(true);
    setError(null);
    setNeedsReconnect(false);
    fetch("/api/spotify/recently-played")
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          tracks?: RecentTrack[];
          error?: string;
        };
        if (!res.ok) {
          const msg = body.error ?? `Could not load recent tracks (${res.status})`;
          setError(msg);
          setNeedsReconnect(res.status === 401 || res.status === 403);
          setTracks([]);
          return;
        }
        setTracks(body.tracks ?? []);
      })
      .catch(() => {
        setError("Could not load recent tracks");
        setTracks([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) fetchTracks();
  }, [open, fetchTracks]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
          title="Recently played"
        >
          <History className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={10}
        className="z-[80] w-80 border-white/10 bg-black/95 text-white backdrop-blur-xl"
      >
        <DropdownMenuLabel className="flex items-center justify-between text-white/60">
          <span>Recently played</span>
          {!loading ? (
            <button
              type="button"
              className="text-[11px] text-white/40 hover:text-white/70"
              onClick={(e) => {
                e.preventDefault();
                fetchTracks();
              }}
            >
              Refresh
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10" />
        {loading ? (
          <div className="px-3 py-6 text-center text-sm text-white/40">
            Loading…
          </div>
        ) : error ? (
          <div className="flex flex-col gap-2 px-3 py-4 text-center">
            <p className="text-sm text-amber-300/90">
              {needsReconnect
                ? "Reconnect Spotify to enable listening history."
                : error}
            </p>
            {needsReconnect ? (
              <button
                type="button"
                className="text-xs text-wam underline underline-offset-2 hover:text-wam/80"
                onClick={() => void signInWithSpotifyClient()}
              >
                Reconnect Spotify
              </button>
            ) : (
              <button
                type="button"
                className="text-xs text-white/50 underline underline-offset-2 hover:text-white/80"
                onClick={() => fetchTracks()}
              >
                Try again
              </button>
            )}
          </div>
        ) : tracks.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-white/40">
            No recent tracks
          </div>
        ) : (
          tracks.map((t) => (
            <DropdownMenuItem key={t.spotifyId} asChild className="cursor-pointer p-0 focus:bg-white/10">
              <Link
                href={`/item/${t.spotifyId}?type=track`}
                className="flex items-center gap-3 px-3 py-2"
              >
                <div className="relative size-9 shrink-0 overflow-hidden rounded bg-white/10">
                  {t.imageUrl ? (
                    <Image
                      src={t.imageUrl}
                      alt=""
                      width={36}
                      height={36}
                      className="size-9 object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {t.name}
                  </p>
                  <p className="truncate text-xs text-white/50">
                    {t.artistName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {t.score != null ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreBadgeClass(t.score)}`}
                    >
                      {t.score}
                    </span>
                  ) : null}
                  <span className="text-xs text-white/30">
                    {timeAgo(t.playedAt)}
                  </span>
                </div>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
