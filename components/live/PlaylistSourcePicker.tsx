"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import {
  filterEligiblePlaylists,
  filterPlaylistsByQuery,
  JAMS_MIN_PLAYLIST_TRACKS,
  sortSpotifyPlaylists,
  type PlaylistSortKey,
} from "@/lib/spotify/playlistListUtils";
import type { SpotifyPlaylistListItem } from "@/lib/types/spotifyLibrary";
import { cn } from "@/lib/utils";

export type PlaylistSourcePickerProps = {
  onSelect: (playlistId: string) => void | Promise<void>;
  onBack: () => void;
  submitting?: boolean;
  selectingId?: string | null;
};

export function PlaylistSourcePicker({
  onSelect,
  onBack,
  submitting = false,
  selectingId = null,
}: PlaylistSourcePickerProps) {
  const [items, setItems] = useState<SpotifyPlaylistListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PlaylistSortKey>("name");
  const [eligibleOnly, setEligibleOnly] = useState(false);

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
      setItems(body.playlists ?? []);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Could not load playlists";
      setError(message);
      setItems(null);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  const eligibleCount = useMemo(
    () =>
      (items ?? []).filter((p) => p.total_tracks >= JAMS_MIN_PLAYLIST_TRACKS)
        .length,
    [items],
  );

  const visible = useMemo(() => {
    if (!items) return [];
    const filtered = filterEligiblePlaylists(
      filterPlaylistsByQuery(items, query),
      eligibleOnly,
    );
    return sortSpotifyPlaylists(filtered, sort);
  }, [items, query, sort, eligibleOnly]);

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-white">Choose a playlist</h3>
          <p className="text-[11px] text-white/45">
            At least {JAMS_MIN_PLAYLIST_TRACKS} tracks required for Jams rotation
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or owner…"
          disabled={loading || Boolean(error)}
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/35 outline-none focus-visible:ring-2 focus-visible:ring-wam/40 disabled:opacity-50"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-white/55">
          <span className="shrink-0">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as PlaylistSortKey)}
            disabled={loading || Boolean(error) || !items?.length}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-wam/40 disabled:opacity-50"
          >
            <option value="name">Name (A–Z)</option>
            <option value="name_desc">Name (Z–A)</option>
            <option value="total_tracks">Most tracks</option>
            <option value="total_tracks_asc">Fewest tracks</option>
            <option value="rated_percent">WAM rated % (high first)</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/55">
          <input
            type="checkbox"
            checked={eligibleOnly}
            onChange={(e) => setEligibleOnly(e.target.checked)}
            disabled={loading || Boolean(error)}
            className="size-3.5 rounded border-white/20 accent-wam"
          />
          Eligible only ({JAMS_MIN_PLAYLIST_TRACKS}+ tracks)
        </label>
      </div>

      {!loading && !error && items ? (
        <p className="text-[11px] text-white/40">
          {visible.length} shown
          {query.trim() ? ` matching “${query.trim()}”` : ""}
          {" · "}
          {eligibleCount} of {items.length} eligible
        </p>
      ) : null}

      {error ? (
        <div className="space-y-2 py-4 text-center">
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void loadPlaylists()}
            className="text-xs text-wam hover:underline"
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-wam" />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/45">
          {items?.length
            ? eligibleOnly
              ? "No playlists with enough tracks match your search."
              : "No playlists match your search."
            : "No Spotify playlists found."}
        </p>
      ) : (
        <ul className="max-h-[min(24rem,50vh)] space-y-1 overflow-y-auto pr-1">
          {visible.map((pl) => {
            const eligible = pl.total_tracks >= JAMS_MIN_PLAYLIST_TRACKS;
            const isSelecting = selectingId === pl.id;
            const disabled = submitting || !eligible || isSelecting;

            return (
              <li key={pl.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void onSelect(pl.id)}
                  title={
                    eligible
                      ? undefined
                      : `Needs at least ${JAMS_MIN_PLAYLIST_TRACKS} tracks (has ${pl.total_tracks})`
                  }
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left transition-colors",
                    eligible
                      ? "hover:border-wam/30 hover:bg-wam/5"
                      : "opacity-50",
                    isSelecting && "border-wam/40 bg-wam/10",
                  )}
                >
                  <div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-white/10">
                    {pl.image_url ? (
                      <Image
                        src={pl.image_url}
                        alt=""
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {pl.name}
                    </p>
                    <p className="truncate text-xs text-white/45">
                      {pl.owner}
                      {" · "}
                      {pl.total_tracks} tracks
                      {pl.rated_percent != null
                        ? ` · ${pl.rated_percent}% rated in WAM`
                        : pl.needs_sync
                          ? " · sync for WAM stats"
                          : ""}
                    </p>
                    {!eligible ? (
                      <p className="mt-0.5 text-[10px] text-amber-400/90">
                        Too few tracks for Jams (min {JAMS_MIN_PLAYLIST_TRACKS})
                      </p>
                    ) : null}
                  </div>
                  {isSelecting ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-wam" />
                  ) : eligible ? (
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-wam">
                      Select
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
