"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { PlaylistsSubnav } from "@/components/PlaylistsSubnav";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  SpotifyPlaylistListItem,
  SpotifyPlaylistStatsPayload,
} from "@/lib/types/spotifyLibrary";
import { glassCard, pageHeading, pageSub } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

type SortKey = "name" | "rated_percent" | "total_tracks";

type RowWithStats = {
  pl: SpotifyPlaylistListItem;
  stats: SpotifyPlaylistStatsPayload | null;
};

function sortRows(rows: RowWithStats[], key: SortKey): RowWithStats[] {
  const copy = [...rows];
  if (key === "name") {
    copy.sort((a, b) =>
      a.pl.name.localeCompare(b.pl.name, undefined, { sensitivity: "base" }),
    );
  } else if (key === "rated_percent") {
    copy.sort((a, b) => {
      const ap = a.stats?.rated_percent ?? -1;
      const bp = b.stats?.rated_percent ?? -1;
      return (
        bp - ap ||
        (b.stats?.rated_count ?? 0) - (a.stats?.rated_count ?? 0) ||
        a.pl.name.localeCompare(b.pl.name)
      );
    });
  } else {
    copy.sort((a, b) => {
      const at = a.stats?.total_tracks ?? a.pl.total_tracks;
      const bt = b.stats?.total_tracks ?? b.pl.total_tracks;
      return (
        bt - at ||
        (b.stats?.rated_percent ?? -1) - (a.stats?.rated_percent ?? -1) ||
        a.pl.name.localeCompare(b.pl.name)
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
  statsCacheRef: MutableRefObject<Map<string, SpotifyPlaylistStatsPayload>>;
  onStatsLoaded: (id: string, data: SpotifyPlaylistStatsPayload) => void;
};

function SpotifyPlaylistCard({
  playlist,
  statsCacheRef,
  onStatsLoaded,
}: PlaylistCardProps) {
  const [stats, setStats] = useState<SpotifyPlaylistStatsPayload | null>(() =>
    statsCacheRef.current.get(playlist.id) ?? null,
  );
  const [statsLoading, setStatsLoading] = useState(
    () => !statsCacheRef.current.has(playlist.id),
  );

  useEffect(() => {
    const cached = statsCacheRef.current.get(playlist.id);
    if (cached) {
      setStats(cached);
      setStatsLoading(false);
      return;
    }
    const ac = new AbortController();
    setStatsLoading(true);
    void fetch(`/api/spotify/playlist-stats?id=${encodeURIComponent(playlist.id)}`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as SpotifyPlaylistStatsPayload & {
          error?: string;
        };
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setStats(null);
          return;
        }
        statsCacheRef.current.set(playlist.id, body);
        setStats(body);
        onStatsLoaded(playlist.id, body);
      })
      .catch(() => {
        if (!ac.signal.aborted) setStats(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setStatsLoading(false);
      });
    return () => ac.abort();
  }, [playlist.id, statsCacheRef, onStatsLoaded]);

  const total = stats?.total_tracks ?? playlist.total_tracks;
  const ratedPercent = stats?.rated_percent ?? 0;
  const ratedCount = stats?.rated_count ?? 0;

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
            {statsLoading ? (
              <div className="h-full w-full animate-pulse rounded-full bg-white/25" />
            ) : (
              <div
                className="h-full rounded-full bg-wam transition-[width] duration-500"
                style={{ width: `${ratedPercent}%` }}
              />
            )}
          </div>
          <p className="mt-2 text-xs text-white/55">
            {statsLoading ? (
              <span className="inline-flex items-center gap-2 text-white/45">
                <span
                  className="size-3 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-wam"
                  aria-hidden
                />
                Loading stats…
              </span>
            ) : stats ? (
              <>
                {ratedCount} of {total} tracks rated
                {total > 0 ? ` (${ratedPercent}%)` : ""}
              </>
            ) : (
              "Could not load rating stats."
            )}
          </p>
        </div>
      </div>
    </a>
  );
}

export default function SpotifyLibraryPlaylistsPage() {
  const [items, setItems] = useState<SpotifyPlaylistListItem[] | null>(null);
  const [statsById, setStatsById] = useState<Record<string, SpotifyPlaylistStatsPayload>>({});
  const statsCacheRef = useRef<Map<string, SpotifyPlaylistStatsPayload>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("name");

  const onStatsLoaded = useCallback((id: string, data: SpotifyPlaylistStatsPayload) => {
    setStatsById((prev) => ({ ...prev, [id]: data }));
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    void fetch("/api/spotify/my-playlists", { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          playlists?: SpotifyPlaylistListItem[];
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || res.statusText);
        setItems(body.playlists ?? []);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load playlists");
        setItems(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, []);

  const rowsForSort = useMemo((): RowWithStats[] => {
    if (!items) return [];
    return items.map((pl) => ({
      pl,
      stats: statsById[pl.id] ?? statsCacheRef.current.get(pl.id) ?? null,
    }));
  }, [items, statsById]);

  const sorted = useMemo(() => sortRows(rowsForSort, sort), [rowsForSort, sort]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pb-16 pt-24 md:px-6">
      <PlaylistsSubnav />

      <div>
        <h1 className={pageHeading}>My Spotify Playlists</h1>
        <p className={pageSub}>
          All playlists in your Spotify library and how many tracks you have rated in WAM.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
          {sorted.map(({ pl }) => (
            <li key={pl.id}>
              <SpotifyPlaylistCard
                playlist={pl}
                statsCacheRef={statsCacheRef}
                onStatsLoaded={onStatsLoaded}
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
