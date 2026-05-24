"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PlaylistBuilder, type PlaylistFiltersState } from "@/components/PlaylistBuilder";
import { PlaylistFilterChips } from "@/components/PlaylistFilterChips";
import { PlaylistsSubnav } from "@/components/PlaylistsSubnav";
import { TempoIntensityPills } from "@/components/TempoIntensityPills";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { scoreBadgeClass } from "@/components/ScoreSlider";
import { summarizePlaylistFilters } from "@/lib/playlist/filterSummary";
import { glassCard, glassCardTight } from "@/lib/wamUi";
import type { GenreTagRow, MomentTagRow, RatingDetail } from "@/lib/types/ratings";
import type { WamPlaylistRow } from "@/lib/types/playlists";
import { cn } from "@/lib/utils";

function filtersFromRow(row: WamPlaylistRow): PlaylistFiltersState {
  return {
    filter_genres: row.filter_genres ?? [],
    filter_moments: row.filter_moments ?? [],
    filter_min_score: row.filter_min_score,
    filter_vibes: row.filter_vibes ?? [],
    filter_tempo_min: row.filter_tempo_min ?? null,
    filter_tempo_max: row.filter_tempo_max ?? null,
    filter_intensity_min: row.filter_intensity_min ?? null,
    filter_intensity_max: row.filter_intensity_max ?? null,
  };
}

export default function PlaylistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const playlistId = params.playlistId as string;

  const [playlist, setPlaylist] = useState<WamPlaylistRow | null>(null);
  const [tracks, setTracks] = useState<RatingDetail[]>([]);
  const [genreTags, setGenreTags] = useState<GenreTagRow[]>([]);
  const [momentTags, setMomentTags] = useState<MomentTagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      fetch("/api/tags", { signal: ac.signal }).then(async (r) => {
        const b = (await r.json()) as {
          genre_tags?: GenreTagRow[];
          moment_tags?: MomentTagRow[];
          error?: string;
        };
        if (!r.ok) throw new Error(b.error || r.statusText);
        return b;
      }),
    ])
      .then(([plBody, tags]) => {
        setPlaylist(plBody.playlist ?? null);
        setTracks(plBody.matched_tracks ?? []);
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
      const ref = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}`);
      const rb = (await ref.json()) as { matched_tracks?: RatingDetail[] };
      if (ref.ok && rb.matched_tracks) setTracks(rb.matched_tracks);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
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

  if (error || !playlist) {
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

  const filterReadOnly = filtersFromRow(playlist);
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                {playlist.name}
              </h1>
              <p className="text-sm text-white/50">{summarizePlaylistFilters(playlist)}</p>
              <PlaylistFilterChips playlist={playlist} />
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
              disabled={syncing || deleting}
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
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-white/50">
          Filters
        </h2>
        <p className="mb-4 text-xs text-white/45">
          Applied on every sync. Edit by creating a new playlist with updated filters.
        </p>
        <PlaylistBuilder
          genreTags={genreTags}
          momentTags={momentTags}
          value={filterReadOnly}
          onChange={() => {}}
          disabled
        />
      </section>

      <section className={cn("p-6", glassCard)}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/50">
          Matching tracks ({tracks.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {tracks.length === 0 ? (
            <li className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/50">
              No tracks match these filters yet. Rate more tracks with tempo and
              intensity, then sync.
            </li>
          ) : (
            tracks.map((t) => {
              const title = t.item?.name ?? t.spotify_id;
              const artist = t.item?.artist_name;
              const imageUrl = t.item?.image_url;
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
                      <p className="truncate text-xs text-white/45">{artist}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
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
