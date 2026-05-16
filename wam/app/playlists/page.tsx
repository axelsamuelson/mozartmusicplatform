"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  PlaylistBuilder,
  type PlaylistFiltersState,
} from "@/components/PlaylistBuilder";
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
import type {
  GenreTagRow,
  MomentTagRow,
  MoodTagRow,
} from "@/lib/types/ratings";
import type { WamPlaylistRow } from "@/lib/types/playlists";
import { glassCardTight, pageHeading, pageSub } from "@/lib/wamUi";

const emptyFilters = (): PlaylistFiltersState => ({
  filter_genres: [],
  filter_mood_levels: [],
  filter_moments: [],
  filter_min_score: 0,
});

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<WamPlaylistRow[]>([]);
  const [genreTags, setGenreTags] = useState<GenreTagRow[]>([]);
  const [moodTags, setMoodTags] = useState<MoodTagRow[]>([]);
  const [momentTags, setMomentTags] = useState<MomentTagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [filters, setFilters] = useState<PlaylistFiltersState>(emptyFilters);
  const [creating, setCreating] = useState(false);
  const createInFlightRef = useRef(false);

  function loadAll() {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/playlists").then(async (r) => {
        const b = (await r.json()) as { playlists?: WamPlaylistRow[]; error?: string };
        if (!r.ok) throw new Error(b.error || r.statusText);
        return b.playlists ?? [];
      }),
      fetch("/api/tags").then(async (r) => {
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
      .then(([pl, tags]) => {
        setPlaylists(pl);
        setGenreTags(tags.genre_tags ?? []);
        setMoodTags(tags.mood_tags ?? []);
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
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          filter_genres: filters.filter_genres.length ? filters.filter_genres : undefined,
          filter_mood_levels: filters.filter_mood_levels.length
            ? filters.filter_mood_levels
            : undefined,
          filter_moments: filters.filter_moments.length ? filters.filter_moments : undefined,
          filter_min_score: filters.filter_min_score,
        }),
        signal: ac.signal,
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        playlist?: WamPlaylistRow;
      };
      if (!res.ok) throw new Error(body.error || res.statusText);
      if (body.playlist) {
        setPlaylists((prev) => [body.playlist!, ...prev]);
      }
      toast.dismiss(loadingToastId);
      toast.success("Playlist created — use Sync to push tracks to Spotify");
      setOpen(false);
      setName("");
      setFilters(emptyFilters());
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pb-16 pt-24 md:px-6">
      <PlaylistsSubnav />

      <div className="flex justify-between items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className={pageHeading}>Playlists</h1>
          <p className={pageSub}>
            WAM-owned Spotify playlists synced from your ratings and filters.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              className="inline-flex shrink-0 rounded-full bg-wam px-5 py-2 text-sm font-medium text-black transition-all hover:bg-wam/90 focus-visible:ring-0"
            >
              New playlist
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[oklch(0.08_0_0)]/95 text-white backdrop-blur-xl sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New playlist</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
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
                moodTags={moodTags}
                momentTags={momentTags}
                value={filters}
                onChange={setFilters}
                disabled={creating}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="rounded-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="rounded-full bg-white px-6 text-black hover:bg-gray-50"
              >
                {creating ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className={`h-48 ${glassCardTight}`} />
          <Skeleton className={`h-48 ${glassCardTight}`} />
        </div>
      ) : playlists.length === 0 ? (
        <p className="text-sm text-white/60">No playlists yet. Create one to get started.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
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
