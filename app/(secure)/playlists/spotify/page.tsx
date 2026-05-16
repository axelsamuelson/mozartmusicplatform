"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PlaylistsSubnav } from "@/components/PlaylistsSubnav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SpotifyPlaylistListItem } from "@/lib/types/spotifyLibrary";
import { glassCard, pageHeading, pageSub } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

type SortKey = "name" | "rated_percent" | "total_tracks";

const MAX_PARALLEL_SYNCS = 1;

type SyncJob = {
  playlistId: string;
  force: boolean;
};

function sortPlaylists(items: SpotifyPlaylistListItem[], key: SortKey): SpotifyPlaylistListItem[] {
  const copy = [...items];
  if (key === "name") {
    copy.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  } else if (key === "rated_percent") {
    copy.sort((a, b) => {
      const ap = a.rated_percent ?? -1;
      const bp = b.rated_percent ?? -1;
      return (
        bp - ap ||
        (b.rated_count ?? 0) - (a.rated_count ?? 0) ||
        a.name.localeCompare(b.name)
      );
    });
  } else {
    copy.sort((a, b) => {
      return (
        b.total_tracks - a.total_tracks ||
        (b.rated_percent ?? -1) - (a.rated_percent ?? -1) ||
        a.name.localeCompare(b.name)
      );
    });
  }
  return copy;
}

function spotifyPlaylistUrl(id: string): string {
  return `https://open.spotify.com/playlist/${encodeURIComponent(id)}`;
}

type PlaylistCardProps = {
  playlist: SpotifyPlaylistListItem;
  syncing: boolean;
};

function SpotifyPlaylistCard({ playlist, syncing }: PlaylistCardProps) {
  const hasStats = playlist.rated_count !== null;
  const showSkeleton = playlist.missing_tracks_cache || syncing;
  const ratedPercent = playlist.rated_percent ?? 0;
  const ratedCount = playlist.rated_count ?? 0;
  const total = playlist.total_tracks;

  return (
    <a
      href={spotifyPlaylistUrl(playlist.id)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        glassCard,
        "group block transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.07]",
      )}
    >
      <div className="flex gap-4">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.04]">
          {playlist.image_url ? (
            <Image
              src={playlist.image_url}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-white/40">
              —
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white transition-colors group-hover:text-wam">
            {playlist.name}
          </p>
          <p className="truncate text-xs text-white/50">{playlist.owner}</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/15">
            {showSkeleton ? (
              <div className="h-full w-full animate-pulse rounded-full bg-white/25" />
            ) : (
              <div
                className="h-full rounded-full bg-wam transition-[width] duration-500"
                style={{ width: `${hasStats ? ratedPercent : 0}%` }}
              />
            )}
          </div>
          <p className="mt-2 text-xs text-white/55">
            {showSkeleton ? (
              <span className="inline-flex items-center gap-2 text-white/45">
                <span
                  className="size-3 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-wam"
                  aria-hidden
                />
                Syncing tracks…
              </span>
            ) : hasStats ? (
              <>
                {ratedCount} of {total} tracks rated
                {total > 0 ? ` (${ratedPercent}%)` : ""}
              </>
            ) : (
              "Waiting to sync…"
            )}
          </p>
        </div>
      </div>
    </a>
  );
}

export default function SpotifyLibraryPlaylistsPage() {
  const [items, setItems] = useState<SpotifyPlaylistListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("name");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(() => new Set());
  const [syncAllRunning, setSyncAllRunning] = useState(false);

  const syncQueueRef = useRef<SyncJob[]>([]);
  const activeSyncsRef = useRef(0);
  const syncingIdsRef = useRef<Set<string>>(new Set());
  const itemsRef = useRef<SpotifyPlaylistListItem[] | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const applyStatsToPlaylist = useCallback(
    (playlistId: string, stats: {
      rated_count: number;
      unrated_count: number;
      rated_percent: number;
      total_tracks: number;
    }) => {
      setItems((prev) => {
        if (!prev) return prev;
        return prev.map((pl) =>
          pl.id === playlistId
            ? {
                ...pl,
                total_tracks: stats.total_tracks,
                rated_count: stats.rated_count,
                unrated_count: stats.unrated_count,
                rated_percent: stats.rated_percent,
                needs_sync: false,
              }
            : pl,
        );
      });
    },
    [],
  );

  const runSyncPlaylist = useCallback(
    async (playlistId: string, force = false): Promise<boolean> => {
      const res = await fetch("/api/spotify/sync-playlist-tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_id: playlistId, force }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        retryAfter?: number;
        rated_count?: number;
        unrated_count?: number;
        rated_percent?: number;
        total_tracks?: number;
      };

      if (res.status === 429) {
        const wait = typeof body.retryAfter === "number" ? body.retryAfter : 30;
        await new Promise((r) => setTimeout(r, wait * 1000));
        return runSyncPlaylist(playlistId, force);
      }

      if (!res.ok || typeof body.rated_count !== "number") {
        return false;
      }

      applyStatsToPlaylist(playlistId, {
        rated_count: body.rated_count,
        unrated_count: body.unrated_count ?? 0,
        rated_percent: body.rated_percent ?? 0,
        total_tracks: body.total_tracks ?? 0,
      });
      return true;
    },
    [applyStatsToPlaylist],
  );

  const pumpSyncQueue = useCallback(() => {
    while (
      activeSyncsRef.current < MAX_PARALLEL_SYNCS &&
      syncQueueRef.current.length > 0
    ) {
      const job = syncQueueRef.current.shift();
      if (!job) break;

      activeSyncsRef.current += 1;
      syncingIdsRef.current.add(job.playlistId);
      setSyncingIds(new Set(syncingIdsRef.current));

      void runSyncPlaylist(job.playlistId, job.force)
        .catch(() => undefined)
        .finally(() => {
          activeSyncsRef.current -= 1;
          syncingIdsRef.current.delete(job.playlistId);
          setSyncingIds(new Set(syncingIdsRef.current));
          if (
            syncQueueRef.current.length === 0 &&
            activeSyncsRef.current === 0
          ) {
            setSyncAllRunning(false);
          }
          pumpSyncQueue();
        });
    }
  }, [runSyncPlaylist]);

  const enqueueSyncs = useCallback(
    (ids: string[], force = false) => {
      const queued = new Set(
        syncQueueRef.current.map((job) => job.playlistId),
      );
      const unique = ids.filter(
        (id) => !queued.has(id) && !syncingIdsRef.current.has(id),
      );
      if (unique.length === 0) return;

      const jobs: SyncJob[] = unique.map((playlistId) => ({
        playlistId,
        force,
      }));

      if (force) {
        syncQueueRef.current = [...jobs, ...syncQueueRef.current];
      } else {
        syncQueueRef.current.push(...jobs);
      }
      pumpSyncQueue();
    },
    [pumpSyncQueue],
  );

  const enqueueSyncsRef = useRef(enqueueSyncs);
  enqueueSyncsRef.current = enqueueSyncs;

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/spotify/my-playlists", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as {
        playlists?: SpotifyPlaylistListItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || res.statusText);
      const playlists = body.playlists ?? [];
      setItems(playlists);
      const needAutoSync = playlists
        .filter((p) => p.missing_tracks_cache)
        .map((p) => p.id);
      if (needAutoSync.length > 0) {
        enqueueSyncsRef.current(needAutoSync);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load playlists");
      setItems(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  const handleSyncAll = useCallback(() => {
    const current = itemsRef.current;
    if (!current?.length) return;
    setSyncAllRunning(true);
    enqueueSyncs(
      current.map((p) => p.id),
      true,
    );
  }, [enqueueSyncs]);

  const sorted = useMemo(() => {
    if (!items) return [];
    return sortPlaylists(items, sort);
  }, [items, sort]);

  const needsSyncCount = items?.filter((p) => p.needs_sync).length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pb-16 pt-24 md:px-6">
      <PlaylistsSubnav />

      <div>
        <h1 className={pageHeading}>My Spotify Playlists</h1>
        <p className={pageSub}>
          All playlists in your Spotify library and how many tracks you have rated in WAM.
          Track lists are cached in Supabase and refreshed when needed.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex flex-wrap items-center gap-2 text-sm text-white/60">
          <span>Sort by</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            disabled={loading || Boolean(error) || !items}
            className="rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50"
          >
            <option value="name">Name (A–Z)</option>
            <option value="rated_percent">Rated % (high first)</option>
            <option value="total_tracks">Track count (high first)</option>
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={loading || Boolean(error) || !items?.length || syncAllRunning}
          onClick={handleSyncAll}
          className="rounded-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
        >
          {syncAllRunning ? "Syncing…" : "Sync all"}
          {needsSyncCount > 0 ? ` (${needsSyncCount} pending)` : ""}
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i}>
              <Skeleton className={`h-36 w-full ${glassCard}`} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sorted.map((pl) => (
            <li key={pl.id}>
              <SpotifyPlaylistCard
                playlist={pl}
                syncing={syncingIds.has(pl.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && sorted.length === 0 ? (
        <p className="text-sm text-white/50">No playlists found in your Spotify account.</p>
      ) : null}
    </div>
  );
}
