"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListMusic, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { PlaylistBuilder } from "@/components/PlaylistBuilder";
import { emptyPlaylistFilters } from "@/lib/playlist/playlistFilters";
import type { PlaylistFiltersState } from "@/lib/playlist/playlistFilters";
import { PlaylistSortSelect } from "@/components/PlaylistSortSelect";
import { PlaylistCard } from "@/components/PlaylistCard";
import { PlaylistsSubnav } from "@/components/PlaylistsSubnav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { capRetryAfterSec } from "@/lib/spotify/errors";
import { loadTagsCatalog } from "@/lib/ratings/tagsCache";
import type { GenreTagRow, MomentTagRow } from "@/lib/types/ratings";
import type { PlaylistSortOrder, WamPlaylistRow } from "@/lib/types/playlists";
import { glassCard, glassCardTight } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<WamPlaylistRow[]>([]);
  const [genreTags, setGenreTags] = useState<GenreTagRow[]>([]);
  const [momentTags, setMomentTags] = useState<MomentTagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [filters, setFilters] = useState<PlaylistFiltersState>(emptyPlaylistFilters);
  const [sortOrder, setSortOrder] = useState<PlaylistSortOrder>("recently_rated");
  const [creating, setCreating] = useState(false);
  const createInFlightRef = useRef(false);

  const stats = useMemo(() => {
    const totalTracks = playlists.reduce((n, p) => n + p.track_count, 0);
    const synced = playlists.filter((p) => p.last_synced_at).length;
    return { totalTracks, synced };
  }, [playlists]);

  function loadAll() {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/playlists").then(async (r) => {
        const b = (await r.json()) as { playlists?: WamPlaylistRow[]; error?: string };
        if (!r.ok) throw new Error(b.error || r.statusText);
        return b.playlists ?? [];
      }),
      loadTagsCatalog(),
    ])
      .then(([pl, tags]) => {
        setPlaylists(pl);
        setGenreTags(tags.genre_tags ?? []);
        setMomentTags(tags.moment_tags ?? []);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load playlists");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function postCreatePlaylist(
    playlistName: string,
    signal: AbortSignal,
  ): Promise<{
    res: Response;
    body: { error?: string; retryAfter?: number; playlist?: WamPlaylistRow };
  }> {
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: playlistName,
        filter_genres: filters.filter_genres.length ? filters.filter_genres : undefined,
        filter_moments: filters.filter_moments.length ? filters.filter_moments : undefined,
        filter_vibes: filters.filter_vibes.length ? filters.filter_vibes : undefined,
        filter_tempo_min: filters.filter_tempo_min,
        filter_tempo_max: filters.filter_tempo_max,
        filter_intensity_min: filters.filter_intensity_min,
        filter_intensity_max: filters.filter_intensity_max,
        filter_min_score: filters.filter_min_score,
        filter_release_year_min: filters.filter_release_year_min,
        filter_release_year_max: filters.filter_release_year_max,
        sort_order: sortOrder,
      }),
      signal,
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      retryAfter?: number;
      playlist?: WamPlaylistRow;
    };
    return { res, body };
  }

  async function handleCreate() {
    if (createInFlightRef.current) return;
    const n = name.trim();
    if (!n) {
      toast.error("Enter a playlist name");
      return;
    }
    createInFlightRef.current = true;
    setCreating(true);
    const loadingToastId = toast.loading("Creating playlist on Spotify…");
    const clientTimeoutMs = 32_000;
    const ac = new AbortController();
    const timeoutId = window.setTimeout(() => ac.abort(), clientTimeoutMs);
    try {
      let { res, body } = await postCreatePlaylist(n, ac.signal);

      if (res.status === 429) {
        const retryAfter = capRetryAfterSec(
          typeof body.retryAfter === "number" && body.retryAfter > 0
            ? body.retryAfter
            : 30,
          30,
        );
        toast.dismiss(loadingToastId);
        const waitToastId = toast.loading(
          `Spotify rate limited — trying again in ${retryAfter}s…`,
        );
        await sleep(retryAfter * 1000);
        ({ res, body } = await postCreatePlaylist(n, ac.signal));
        toast.dismiss(waitToastId);
        if (res.status === 429) {
          toast.error("Please wait 60 seconds and try again");
          return;
        }
        toast.loading("Creating playlist on Spotify…", { id: loadingToastId });
      }

      if (res.status === 503) {
        toast.error(
          body.error ||
            "Spotify temporarily unavailable — try again in a few minutes",
        );
        return;
      }
      if (!res.ok) throw new Error(body.error || res.statusText);
      if (body.playlist) {
        setPlaylists((prev) => [body.playlist!, ...prev]);
      }
      toast.dismiss(loadingToastId);
      toast.success("Playlist created — use Sync to push tracks to Spotify");
      setOpen(false);
      setName("");
      setFilters(emptyPlaylistFilters());
      setSortOrder("recently_rated");
    } catch (e) {
      toast.dismiss(loadingToastId);
      if (e instanceof Error && e.name === "AbortError") {
        toast.error(
          "That took too long — Spotify or the network may be slow. Close the dialog and try again in a moment.",
        );
      } else {
        toast.error(e instanceof Error ? e.message : "Create failed");
      }
    } finally {
      window.clearTimeout(timeoutId);
      createInFlightRef.current = false;
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-20 pt-24 md:px-6">
      <PlaylistsSubnav />

      <header
        className={cn(
          "relative overflow-hidden rounded-2xl border border-white/10 p-6 md:p-8",
          "bg-gradient-to-br from-wam/12 via-white/[0.03] to-purple-500/8",
        )}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-wam/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl space-y-2">
            <div className="flex items-center gap-2 text-wam">
              <ListMusic className="size-5" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-widest">
                WAM Playlists
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              Playlists from your ratings
            </h1>
            <p className="text-sm leading-relaxed text-white/55 md:text-base">
              Build dynamic Spotify playlists filtered by score, tempo, intensity,
              genres, and moments. WAM-owned only — sync whenever your library changes.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                className="inline-flex shrink-0 rounded-full bg-wam px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-wam/20 transition-all hover:bg-wam/90"
              >
                <Plus className="mr-1.5 size-4" aria-hidden />
                New playlist
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[oklch(0.08_0_0)]/95 text-white backdrop-blur-xl sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Create playlist</DialogTitle>
                <p className="text-sm text-white/50">
                  Filters apply to your rated tracks. Sync pushes matches to Spotify.
                </p>
              </DialogHeader>
              <div className="flex flex-col gap-5 py-2">
                <div className="flex flex-col gap-2">
                  <label htmlFor="pl-name" className="text-sm font-medium text-white/80">
                    Name
                  </label>
                  <Input
                    id="pl-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. High-energy 80+"
                    disabled={creating}
                    className="border-white/15 bg-white/5 text-white placeholder:text-white/40"
                  />
                </div>
                <PlaylistBuilder
                  genreTags={genreTags}
                  momentTags={momentTags}
                  value={filters}
                  onChange={setFilters}
                  disabled={creating}
                />
                <PlaylistSortSelect
                  value={sortOrder}
                  onChange={setSortOrder}
                  disabled={creating}
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="rounded-full border-white/25 bg-transparent text-white hover:bg-white/10"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="rounded-full bg-wam px-6 font-semibold text-black hover:bg-wam/90"
                >
                  {creating ? "Creating…" : "Create on Spotify"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {!loading && playlists.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className={cn("px-4 py-3", glassCardTight)}>
            <p className="text-2xl font-bold tabular-nums text-white">
              {playlists.length}
            </p>
            <p className="text-xs text-white/45">Playlists</p>
          </div>
          <div className={cn("px-4 py-3", glassCardTight)}>
            <p className="text-2xl font-bold tabular-nums text-white">
              {stats.totalTracks}
            </p>
            <p className="text-xs text-white/45">Tracks on Spotify</p>
          </div>
          <div className={cn("col-span-2 px-4 py-3 sm:col-span-1", glassCardTight)}>
            <p className="text-2xl font-bold tabular-nums text-white">
              {stats.synced}/{playlists.length}
            </p>
            <p className="text-xs text-white/45">Synced at least once</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className={cn("h-52", glassCardTight)} />
          <Skeleton className={cn("h-52", glassCardTight)} />
        </div>
      ) : playlists.length === 0 ? (
        <div
          className={cn(
            "flex flex-col items-center gap-4 px-6 py-14 text-center",
            glassCard,
          )}
        >
          <div className="flex size-14 items-center justify-center rounded-2xl border border-wam/25 bg-wam/10 text-wam">
            <Sparkles className="size-7" strokeWidth={1.5} aria-hidden />
          </div>
          <div className="max-w-sm space-y-2">
            <h2 className="text-lg font-semibold text-white">No playlists yet</h2>
            <p className="text-sm leading-relaxed text-white/50">
              Create a playlist with vibe filters like Chill or High Energy, set a
              minimum score, and sync matching tracks to Spotify.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-wam px-6 font-semibold text-black hover:bg-wam/90"
          >
            <Plus className="mr-1.5 size-4" aria-hidden />
            Create your first playlist
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {playlists.map((p) => (
            <PlaylistCard
              key={p.id}
              playlist={p}
              onDeleted={(id) => setPlaylists((prev) => prev.filter((x) => x.id !== id))}
              onSynced={(row) =>
                setPlaylists((prev) => prev.map((x) => (x.id === row.id ? row : x)))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
