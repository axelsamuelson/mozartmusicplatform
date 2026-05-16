"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PlaylistBuilder, type PlaylistFiltersState } from "@/components/PlaylistBuilder";
import { PlaylistsSubnav } from "@/components/PlaylistsSubnav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { summarizePlaylistFilters } from "@/lib/playlist/filterSummary";
import { glassCard, glassCardTight, pageHeading, sectionHeading } from "@/lib/wamUi";
import type {
  GenreTagRow,
  MomentTagRow,
  MoodTagRow,
  RatingDetail,
} from "@/lib/types/ratings";
import type { WamPlaylistRow } from "@/lib/types/playlists";
import { cn } from "@/lib/utils";

function filtersFromRow(row: WamPlaylistRow): PlaylistFiltersState {
  return {
    filter_genres: row.filter_genres ?? [],
    filter_mood_levels: row.filter_mood_levels ?? [],
    filter_moments: row.filter_moments ?? [],
    filter_min_score: row.filter_min_score,
  };
}

export default function PlaylistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const playlistId = params.playlistId as string;

  const [playlist, setPlaylist] = useState<WamPlaylistRow | null>(null);
  const [tracks, setTracks] = useState<RatingDetail[]>([]);
  const [genreTags, setGenreTags] = useState<GenreTagRow[]>([]);
  const [moodTags, setMoodTags] = useState<MoodTagRow[]>([]);
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
          mood_tags?: MoodTagRow[];
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
        setMoodTags(tags.mood_tags ?? []);
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
      const rb = (await ref.json()) as {
        matched_tracks?: RatingDetail[];
      };
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
      <div className="mx-auto max-w-4xl space-y-10 px-4 pb-16 pt-24 md:px-6">
        <PlaylistsSubnav />
        <Skeleton className={`h-10 w-2/3 ${glassCardTight}`} />
        <Skeleton className={`h-64 w-full ${glassCard}`} />
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-24 md:px-6">
        <PlaylistsSubnav />
        <p className="text-sm text-red-400">{error || "Not found"}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 rounded-full border-white/25 text-white hover:bg-white/10 hover:text-white"
          asChild
        >
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pb-16 pt-24 md:px-6">
      <PlaylistsSubnav />

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit rounded-full px-0 text-white/70 hover:bg-white/10 hover:text-white"
          asChild
        >
          <Link href="/playlists">← Playlists</Link>
        </Button>
        <h1 className={pageHeading}>{playlist.name}</h1>
        <p className="text-base text-white/50">{summarizePlaylistFilters(playlist)}</p>
        <p className="text-xs text-white/50">
          {playlist.track_count} tracks on Spotify · Last synced: {last}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleSync}
          disabled={syncing || deleting}
          className="rounded-full border border-white/20 bg-white/10 px-6 text-white transition-all duration-300 hover:scale-105 hover:bg-white/20 hover:shadow-md disabled:scale-100"
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

      <Card
        className={cn(
          "gap-2 border-0 bg-transparent text-white shadow-none ring-0",
          glassCard,
        )}
      >
        <CardHeader className="space-y-1 px-0 pb-2 pt-0">
          <CardTitle className={sectionHeading}>Filters</CardTitle>
          <p className="text-xs leading-relaxed text-white/50">
            These filters are stored on the playlist and applied every time you sync.
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          <PlaylistBuilder
            genreTags={genreTags}
            moodTags={moodTags}
            momentTags={momentTags}
            value={filterReadOnly}
            onChange={() => {}}
            disabled
          />
        </CardContent>
      </Card>

      <Card
        className={cn(
          "gap-2 border-0 bg-transparent text-white shadow-none ring-0",
          glassCard,
        )}
      >
        <CardHeader className="space-y-1 px-0 pb-2 pt-0">
          <CardTitle className={sectionHeading}>Matching tracks ({tracks.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          <ul className="flex flex-col gap-2">
            {tracks.length === 0 ? (
              <li className="text-sm text-white/50">No tracks match these filters.</li>
            ) : (
              tracks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link
                    href={`/item/${encodeURIComponent(t.spotify_id)}?type=track`}
                    className="min-w-0 truncate font-medium text-white transition-colors hover:text-wam hover:underline"
                  >
                    {t.item?.name ?? t.spotify_id}
                  </Link>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-wam">{t.score}</span>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
