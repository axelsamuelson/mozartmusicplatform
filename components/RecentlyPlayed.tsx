"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import type { RecentTrack } from "@/lib/playback/recentTrack";
import { applyRecentTrackScores } from "@/lib/playback/applyRecentTrackScores";
import { loadLocalRecentlyPlayed } from "@/lib/playback/recentlyPlayedLocal";
import { WAM_RATINGS_MUTATED } from "@/lib/wamRatingEvents";

const CLIENT_FETCH_TIMEOUT_MS = 8_000;
const SCORES_FETCH_TIMEOUT_MS = 5_000;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function mergeRecentTracks(
  local: RecentTrack[],
  remote: RecentTrack[],
): RecentTrack[] {
  const byId = new Map<string, RecentTrack>();
  for (const t of [...local, ...remote]) {
    const prev = byId.get(t.spotifyId);
    if (!prev) {
      byId.set(t.spotifyId, t);
      continue;
    }
    const newer =
      new Date(t.playedAt).getTime() >= new Date(prev.playedAt).getTime()
        ? t
        : prev;
    byId.set(t.spotifyId, {
      ...newer,
      score: newer.score ?? prev.score ?? t.score ?? null,
      imageUrl: newer.imageUrl ?? prev.imageUrl ?? t.imageUrl,
      artistId: newer.artistId ?? prev.artistId ?? t.artistId,
    });
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
  );
}

function applyScores(
  tracks: RecentTrack[],
  scores: Record<string, number>,
  authoritativeIds?: string[],
): RecentTrack[] {
  return applyRecentTrackScores(tracks, scores, authoritativeIds);
}

async function fetchScoresForIds(
  ids: string[],
): Promise<Record<string, number>> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 80);
  if (unique.length === 0) return {};
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SCORES_FETCH_TIMEOUT_MS);
    const res = await fetch(
      `/api/ratings?spotify_ids=${unique.map(encodeURIComponent).join(",")}`,
      { cache: "no-store", signal: ac.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return {};
    const body = (await res.json()) as { scores?: Record<string, number> };
    const raw = body.scores ?? {};
    const scores: Record<string, number> = {};
    for (const [id, value] of Object.entries(raw)) {
      const n = Number(value);
      if (Number.isFinite(n)) scores[id] = n;
    }
    return scores;
  } catch {
    return {};
  }
}

export function RecentlyPlayed() {
  const [tracks, setTracks] = useState<RecentTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [open, setOpen] = useState(false);
  const fetchGenRef = useRef(0);
  const tracksRef = useRef<RecentTrack[]>([]);
  tracksRef.current = tracks;

  const refreshScores = useCallback(async (list: RecentTrack[]) => {
    const ids = list.map((t) => t.spotifyId);
    const scores = await fetchScoresForIds(ids);
    const next = applyScores(list, scores, ids);
    setTracks(next);
    return next;
  }, []);

  const fetchTracks = useCallback(() => {
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError(null);
    setNeedsReconnect(false);

    const local = loadLocalRecentlyPlayed().map(
      (t): RecentTrack => ({ ...t, score: null }),
    );
    if (local.length > 0) {
      setTracks(local);
      void fetchScoresForIds(local.map((t) => t.spotifyId)).then((scores) => {
        if (gen !== fetchGenRef.current) return;
        const ids = local.map((t) => t.spotifyId);
        setTracks((prev) => applyScores(prev, scores, ids));
      });
    }

    void (async () => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), CLIENT_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch("/api/spotify/recently-played", {
          cache: "no-store",
          signal: ac.signal,
        });
        const body = (await res.json().catch(() => ({}))) as {
          tracks?: RecentTrack[];
          error?: string;
          spotifyError?: string | null;
        };

        if (gen !== fetchGenRef.current) return;

        const remote = body.tracks ?? [];
        let merged = mergeRecentTracks(local, remote);
        // Prefer server scores, then fill any gaps via targeted lookup.
        const missing = merged
          .filter((t) => t.score == null)
          .map((t) => t.spotifyId);
        if (missing.length > 0) {
          const scores = await fetchScoresForIds(missing);
          merged = applyScores(merged, scores, missing);
        }
        if (gen !== fetchGenRef.current) return;

        setTracks(merged);

        const reconnectHint =
          res.status === 401 ||
          res.status === 403 ||
          body.spotifyError?.toLowerCase().includes("reconnect") ||
          body.spotifyError?.toLowerCase().includes("permission");

        if (merged.length === 0) {
          if (reconnectHint) {
            setNeedsReconnect(true);
            setError(
              body.spotifyError ??
                body.error ??
                "Reconnect Spotify to enable listening history.",
            );
          } else if (!res.ok) {
            setError(body.error ?? `Could not load recent tracks (${res.status})`);
          } else {
            setError(null);
          }
        } else if (reconnectHint) {
          setNeedsReconnect(true);
        }
      } catch (e) {
        if (gen !== fetchGenRef.current) return;
        const scored = await refreshScores(local);
        if (gen !== fetchGenRef.current) return;
        setTracks(scored);
        if (scored.length === 0) {
          const timedOut = e instanceof Error && e.name === "AbortError";
          setError(
            timedOut
              ? "Timed out loading history. Try again."
              : "Could not load recent tracks",
          );
        }
      } finally {
        clearTimeout(timer);
        if (gen === fetchGenRef.current) setLoading(false);
      }
    })();
  }, [refreshScores]);

  useEffect(() => {
    if (open) fetchTracks();
  }, [open, fetchTracks]);

  useEffect(() => {
    if (!open) return;
    const onMutated = () => {
      void refreshScores(tracksRef.current);
    };
    window.addEventListener(WAM_RATINGS_MUTATED, onMutated);
    return () => window.removeEventListener(WAM_RATINGS_MUTATED, onMutated);
  }, [open, refreshScores]);

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
        className="z-[80] max-h-[min(24rem,70vh)] w-80 overflow-y-auto border-white/10 bg-black/95 text-white backdrop-blur-xl"
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
        {loading && tracks.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-white/40">
            Loading…
          </div>
        ) : error && tracks.length === 0 ? (
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
          <div className="space-y-2 px-3 py-6 text-center text-sm text-white/40">
            <p>Nothing here yet.</p>
            <p className="text-xs text-white/30">
              Keep Musicator open while you listen on your phone — tracks will
              appear here.
            </p>
          </div>
        ) : (
          <>
            {needsReconnect ? (
              <div className="px-3 py-2 text-[11px] text-amber-300/80">
                Spotify history unavailable.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-amber-200"
                  onClick={() => void signInWithSpotifyClient()}
                >
                  Reconnect
                </button>
              </div>
            ) : null}
            {tracks.map((t) => (
              <DropdownMenuItem
                key={t.spotifyId}
                asChild
                className="cursor-pointer p-0 focus:bg-white/10"
              >
                <Link
                  href={`/item/${t.spotifyId}?type=track`}
                  className="flex items-center gap-3 px-3 py-2"
                  onClick={() => setOpen(false)}
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
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                        {t.name}
                      </p>
                      {t.score != null ? (
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${scoreBadgeClass(t.score)}`}
                        >
                          {t.score}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-xs text-white/50">
                        {t.artistName}
                      </p>
                      <span className="shrink-0 text-[10px] text-white/30">
                        {timeAgo(t.playedAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
