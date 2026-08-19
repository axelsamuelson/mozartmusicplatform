"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PlaylistBuilder } from "@/components/PlaylistBuilder";
import { PlaylistCover } from "@/components/PlaylistCover";
import { PlaylistFilterChips } from "@/components/PlaylistFilterChips";
import { PlaylistSortSelect } from "@/components/PlaylistSortSelect";
import { PlaylistsSubnav } from "@/components/PlaylistsSubnav";
import { TempoIntensityPills } from "@/components/TempoIntensityPills";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { scoreBadgeClass } from "@/components/ScoreSlider";
import { summarizePlaylistFilters } from "@/lib/playlist/filterSummary";
import {
  filtersFromPlaylistRow,
  filtersStateKey,
  type PlaylistFiltersState,
} from "@/lib/playlist/playlistFilters";
import { loadTagsCatalog } from "@/lib/ratings/tagsCache";
import { glassCard, glassCardTight } from "@/lib/wamUi";
import type { GenreTagRow, MomentTagRow, RatingDetail } from "@/lib/types/ratings";
import type { PlaylistSortOrder, WamPlaylistRow } from "@/lib/types/playlists";
import { cn } from "@/lib/utils";

export default function PlaylistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const playlistId = params.playlistId as string;

  const [playlist, setPlaylist] = useState<WamPlaylistRow | null>(null);
  const [previewTracks, setPreviewTracks] = useState<RatingDetail[]>([]);
  const [filters, setFilters] = useState<PlaylistFiltersState | null>(null);
  const [savedFiltersKey, setSavedFiltersKey] = useState("");
  const [sortOrder, setSortOrder] = useState<PlaylistSortOrder>("recently_rated");
  const [savedSortOrder, setSavedSortOrder] = useState<PlaylistSortOrder>("recently_rated");
  const [genreTags, setGenreTags] = useState<GenreTagRow[]>([]);
  const [momentTags, setMomentTags] = useState<MomentTagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const previewAbortRef = useRef<AbortController | null>(null);
  const skipInitialPreview = useRef(true);

  const filtersDirty =
    filters != null && filtersStateKey(filters) !== savedFiltersKey;
  const sortDirty = sortOrder !== savedSortOrder;
  const settingsDirty = filtersDirty || sortDirty;

  const fetchPreview = useCallback(
    async (f: PlaylistFiltersState, sort: PlaylistSortOrder) => {
      previewAbortRef.current?.abort();
      const ac = new AbortController();
      previewAbortRef.current = ac;
      setPreviewLoading(true);
      try {
        const res = await fetch(
          `/api/playlists/${encodeURIComponent(playlistId)}/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...f, sort_order: sort }),
            signal: ac.signal,
          },
        );
        const body = (await res.json()) as {
          matched_tracks?: RatingDetail[];
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || "Preview failed");
        if (!ac.signal.aborted) setPreviewTracks(body.matched_tracks ?? []);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (!ac.signal.aborted) {
          toast.error(e instanceof Error ? e.message : "Could not preview tracks");
        }
      } finally {
        if (!ac.signal.aborted) setPreviewLoading(false);
      }
    },
    [playlistId],
  );

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/playlists/${encodeURIComponent(playlistId)}`, { signal: ac.signal }).then(
        async (r) => {
          const b = (await r.json()) as {
            playlist?: WamPlaylistRow;
            matched_tracks?: RatingDetail[];
            error?: string;
          };
          if (!r.ok) throw new Error(b.error || r.statusText);
          return b;
        },
      ),
      loadTagsCatalog(ac.signal),
    ])
      .then(([plBody, tags]) => {
        const pl = plBody.playlist ?? null;
        setPlaylist(pl);
        setPreviewTracks(plBody.matched_tracks ?? []);
        if (pl) {
          const f = filtersFromPlaylistRow(pl);
          setFilters(f);
          setSavedFiltersKey(filtersStateKey(f));
          const order = pl.sort_order ?? "recently_rated";
          setSortOrder(order);
          setSavedSortOrder(order);
        }
        setGenreTags(tags.genre_tags ?? []);
        setMomentTags(tags.moment_tags ?? []);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load playlist");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [playlistId]);

  useEffect(() => {
    skipInitialPreview.current = true;
  }, [playlistId]);

  useEffect(() => {
    if (!filters || loading) return;
    if (skipInitialPreview.current) {
      skipInitialPreview.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void fetchPreview(filters, sortOrder);
    }, 400);
    return () => window.clearTimeout(t);
  }, [filters, sortOrder, loading, fetchPreview]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}/sync`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        playlist?: WamPlaylistRow;
      };
      if (!res.ok) throw new Error(body.error || res.statusText);
      if (body.playlist) setPlaylist(body.playlist);
      toast.success("Synced to Spotify");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveSettings() {
    if (!filters) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...filters, sort_order: sortOrder }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        playlist?: WamPlaylistRow;
        matched_tracks?: RatingDetail[];
      };
      if (!res.ok) throw new Error(body.error || "Could not save");
      if (body.playlist) setPlaylist(body.playlist);
      if (body.matched_tracks) setPreviewTracks(body.matched_tracks);
      setSavedFiltersKey(filtersStateKey(filters));
      setSavedSortOrder(sortOrder);
      toast.success("Settings saved — sync to update Spotify");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!playlist) return;
    if (!window.confirm(`Delete “${playlist.name}” from WAM and Spotify?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error || res.statusText);
      }
      toast.success("Playlist removed");
      router.push("/playlists");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  if (loading && !playlist) {
    return (
      <div className="mx-auto max-w-5xl space-y-8 px-4 pb-16 pt-24 md:px-6">
        <PlaylistsSubnav />
        <Skeleton className={cn("h-32 w-full", glassCardTight)} />
        <Skeleton className={cn("h-64 w-full", glassCard)} />
      </div>
    );
  }

  if (error || !playlist || !filters) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-24 md:px-6">
        <PlaylistsSubnav />
        <p className="text-sm text-red-400">{error || "Not found"}</p>
        <Button type="button" variant="outline" asChild className="rounded-full">
          <Link href="/playlists">Back to playlists</Link>
        </Button>
      </div>
    );
  }

  const last =
    playlist.last_synced_at != null
      ? new Date(playlist.last_synced_at).toLocaleString()
      : "Never";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-20 pt-24 md:px-6">
      <PlaylistsSubnav />

      <div className="flex flex-col gap-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit rounded-full px-0 text-white/70 hover:bg-white/10"
          asChild
        >
          <Link href="/playlists">← Playlists</Link>
        </Button>

        <div className={cn("flex flex-col gap-4 p-6 md:p-8", glassCard)}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <PlaylistCover
                name={playlist.name}
                className="size-24 shrink-0 rounded-2xl border border-white/10 md:size-28"
              />
              <div className="min-w-0 space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {playlist.name}
                </h1>
                <p className="text-sm text-white/50">{summarizePlaylistFilters(playlist)}</p>
                <PlaylistFilterChips playlist={playlist} />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-3xl font-bold tabular-nums text-white">
                {playlist.track_count}
              </p>
              <p className="text-xs text-white/45">tracks on Spotify</p>
              <p className="mt-2 text-[11px] text-white/40">Last synced: {last}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
            <Button
              type="button"
              onClick={handleSync}
              disabled={syncing || deleting || settingsDirty}
              className="rounded-full bg-wam font-semibold text-black hover:bg-wam/90"
            >
              {syncing ? "Syncing…" : "Sync to Spotify"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={syncing || deleting}
              className="rounded-full"
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </div>

      <section className={cn("p-6", glassCard)}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
              Filters & sort
            </h2>
            <p className="mt-1 text-xs text-white/45">
              Changes preview below automatically. Save, then sync to apply on Spotify.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!settingsDirty || saving}
            onClick={() => void handleSaveSettings()}
            className="rounded-full bg-wam text-black hover:bg-wam/90 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
        <div className="flex flex-col gap-8">
          <PlaylistBuilder
            genreTags={genreTags}
            momentTags={momentTags}
            value={filters}
            onChange={setFilters}
            disabled={saving}
          />
          <PlaylistSortSelect
            value={sortOrder}
            onChange={setSortOrder}
            disabled={saving}
          />
        </div>
        {settingsDirty ? (
          <p className="mt-4 text-xs text-amber-200/80">
            Unsaved changes — save before syncing to Spotify.
          </p>
        ) : null}
      </section>

      <section className={cn("p-6", glassCard)}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/50">
          Matching tracks ({previewLoading ? "…" : previewTracks.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {previewTracks.length === 0 && !previewLoading ? (
            <li className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/50">
              No tracks match these filters. Open tracks from search once to refresh release
              year metadata, then try again.
            </li>
          ) : (
            previewTracks.map((t) => {
              const title = t.item?.name ?? t.spotify_id;
              const artist = t.item?.artist_name;
              const imageUrl = t.item?.image_url;
              const year = t.item?.release_year;
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.05]"
                >
                  <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/10">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt=""
                        width={44}
                        height={44}
                        className="size-11 object-cover"
                      />
                    ) : (
                      <div className="flex size-11 items-center justify-center text-[10px] text-white/30">
                        —
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/item/${encodeURIComponent(t.spotify_id)}?type=track`}
                      className="block truncate font-medium text-white hover:text-wam"
                    >
                      {title}
                    </Link>
                    {artist ? (
                      <p className="truncate text-xs text-white/45">
                        {artist}
                        {year != null ? ` · ${year}` : ""}
                      </p>
                    ) : year != null ? (
                      <p className="text-xs text-white/45">{year}</p>
                    ) : null}
                    <div className="mt-1">
                      <TempoIntensityPills tempo={t.tempo} intensity={t.intensity} />
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums",
                      scoreBadgeClass(t.score),
                    )}
                  >
                    {t.score}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </div>
  );
}
