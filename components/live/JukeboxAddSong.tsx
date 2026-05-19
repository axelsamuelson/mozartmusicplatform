"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ClipboardPaste, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import type { SpotifySearchRow } from "@/lib/spotify/api";
import { normalizeSpotifyShareInput } from "@/lib/spotify/parseTrackUrl";
import { glassCard } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export type JukeboxAddSongProps = {
  sessionId: string;
  myQueueCount: number;
  /** When set (e.g. Jams manual jump), blocks adds at this count. Song queue has no cap. */
  maxPerUser?: number;
  disabled?: boolean;
  /** Jams: jump-queue manual track */
  isManual?: boolean;
  onAdded?: () => void;
  className?: string;
};

export function JukeboxAddSong({
  sessionId,
  myQueueCount,
  maxPerUser,
  disabled,
  isManual,
  onAdded,
  className,
}: JukeboxAddSongProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<SpotifySearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);

  const atLimit =
    maxPerUser != null && Number.isFinite(maxPerUser) && myQueueCount >= maxPerUser;

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!debounced || debounced.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    const url = `/api/spotify/search?q=${encodeURIComponent(debounced)}&type=track&limit=8`;

    fetch(url, { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json()) as {
          error?: string;
          results?: SpotifySearchRow[];
        };
        if (!res.ok) throw new Error(body.error || "Search failed");
        setResults((body.results ?? []).filter((r) => r.type === "track"));
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setResults([]);
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [debounced]);

  async function addTrackPayload(track: {
    spotify_track_id: string;
    track_name: string;
    artist_name: string | null;
    image_url: string | null;
  }) {
    if (atLimit || disabled) return;
    setAddingId(track.spotify_track_id);
    try {
      const res = await fetch(`/api/live/${sessionId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...track, is_manual: isManual ?? false }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Could not add track");
      toast.success("Added to queue");
      onAdded?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add track");
    } finally {
      setAddingId(null);
    }
  }

  async function addTrack(track: SpotifySearchRow) {
    await addTrackPayload({
      spotify_track_id: track.spotify_id,
      track_name: track.name,
      artist_name: track.artist_name,
      image_url: track.image_url,
    });
  }

  async function pasteSpotifyLink() {
    if (atLimit || disabled || pasting) return;
    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      const { primary, error: clipError } = normalizeSpotifyShareInput(text ?? "");
      if (!primary) {
        toast.error(clipError ?? "Clipboard is empty");
        return;
      }
      const params = new URLSearchParams({ url: primary, text: text.trim() });
      const res = await fetch(`/api/spotify/resolve-track?${params.toString()}`);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        trackId?: string;
        trackName?: string;
        artistName?: string | null;
        imageUrl?: string | null;
      };
      if (!res.ok) throw new Error(body.error || "Not a valid Spotify track link");
      if (!body.trackId || !body.trackName) {
        throw new Error("Could not resolve track");
      }
      await addTrackPayload({
        spotify_track_id: body.trackId,
        track_name: body.trackName,
        artist_name: body.artistName ?? null,
        image_url: body.imageUrl ?? null,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not paste link");
    } finally {
      setPasting(false);
    }
  }

  return (
    <section className={cn(glassCard, className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider text-white/40">Add a song</h2>
        {maxPerUser != null ? (
          <span className="text-xs text-white/50">
            {myQueueCount}/{maxPerUser} in queue
          </span>
        ) : myQueueCount > 0 ? (
          <span className="text-xs text-white/50">{myQueueCount} in queue</span>
        ) : null}
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search Spotify tracks…"
        disabled={disabled || atLimit}
        className="border-white/15 bg-white/5 text-white placeholder:text-white/35"
      />

      {atLimit ? (
        <p className="mt-2 text-xs text-wam/90">You already have {maxPerUser} tracks queued.</p>
      ) : null}

      <div className="mt-3 flex flex-col items-center gap-1">
        <button
          type="button"
          disabled={atLimit || disabled || pasting}
          onClick={() => void pasteSpotifyLink()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          {pasting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ClipboardPaste className="size-3.5" />
          )}
          Paste Spotify link
        </button>
        <p className="text-[10px] text-white/35">Or paste a Spotify link</p>
      </div>

      <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto">
        {loading ? (
          <li className="flex justify-center py-4 text-white/40">
            <Loader2 className="size-5 animate-spin" />
          </li>
        ) : null}
        {!loading &&
          results.map((track) => (
            <li
              key={track.spotify_id}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2"
            >
              <div className="relative size-8 shrink-0 overflow-hidden rounded-md bg-white/10">
                {track.image_url ? (
                  <Image
                    src={track.image_url}
                    alt=""
                    width={32}
                    height={32}
                    className="size-8 object-cover"
                    unoptimized
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{track.name}</p>
                <p className="truncate text-xs text-white/50">
                  {track.artist_name ?? "Unknown artist"}
                </p>
              </div>
              <button
                type="button"
                disabled={atLimit || disabled || addingId === track.spotify_id}
                onClick={() => void addTrack(track)}
                className="shrink-0 rounded-full bg-wam/15 px-2.5 py-1 text-xs font-medium text-wam hover:bg-wam/25 disabled:opacity-40"
              >
                {addingId === track.spotify_id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <span className="flex items-center gap-1">
                    <Plus className="size-3.5" />
                    Add
                  </span>
                )}
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}
