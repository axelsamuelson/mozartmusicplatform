"use client";

import { useEffect, useState } from "react";

import { SpotifyItem } from "@/components/SpotifyItem";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { glassCardTight, glassPanel, pageHeading, pageSub } from "@/lib/wamUi";
import type { ItemType, SpotifySearchRow } from "@/lib/spotify/api";
import { cn } from "@/lib/utils";

type FilterTab = "all" | ItemType;

function typesQuery(tab: FilterTab): string {
  if (tab === "all") return "track,album,artist";
  return tab;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [results, setResults] = useState<SpotifySearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoresBySpotifyId, setScoresBySpotifyId] = useState<Record<string, number>>({});

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/ratings?scores_only=1", { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          scores?: Record<string, number>;
        };
        if (!res.ok) return;
        setScoresBySpotifyId(body.scores ?? {});
      })
      .catch(() => {
        /* ignore */
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!debounced) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    const url = `/api/spotify/search?q=${encodeURIComponent(debounced)}&type=${typesQuery(tab)}&limit=10`;

    fetch(url, { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          results?: SpotifySearchRow[];
        };
        if (!res.ok) {
          throw new Error(body.error || res.statusText);
        }
        setResults(body.results ?? []);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [debounced, tab]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pb-16 pt-24 md:px-6">
      <div>
        <h1 className={pageHeading}>Search</h1>
        <p className={pageSub}>Find tracks, albums, and artists on Spotify.</p>
      </div>

      <div className={cn("flex flex-col gap-4", glassPanel)}>
        <label className="sr-only" htmlFor="spotify-search">
          Search Spotify
        </label>
        <Input
          id="spotify-search"
          type="search"
          placeholder="Search tracks, albums, artists…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/45 focus-visible:border-white/30 focus-visible:ring-white/20"
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
          <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-xl border border-white/[0.08] bg-white/[0.04] p-1.5 text-white/70">
            <TabsTrigger
              value="all"
              className="flex-1 rounded-lg text-white/70 data-active:border-transparent data-active:bg-white/[0.07] data-active:text-white data-active:shadow-none"
            >
              All
            </TabsTrigger>
            <TabsTrigger
              value="track"
              className="flex-1 rounded-lg text-white/70 data-active:border-transparent data-active:bg-white/[0.07] data-active:text-white"
            >
              Tracks
            </TabsTrigger>
            <TabsTrigger
              value="album"
              className="flex-1 rounded-lg text-white/70 data-active:border-transparent data-active:bg-white/[0.07] data-active:text-white"
            >
              Albums
            </TabsTrigger>
            <TabsTrigger
              value="artist"
              className="flex-1 rounded-lg text-white/70 data-active:border-transparent data-active:bg-white/[0.07] data-active:text-white"
            >
              Artists
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <Skeleton className={`h-[4.5rem] w-full ${glassCardTight}`} />
              </li>
            ))
          : results.map((row) => (
              <li key={`${row.type}-${row.spotify_id}`}>
                <SpotifyItem
                  spotify_id={row.spotify_id}
                  type={row.type}
                  name={row.name}
                  artist_name={row.artist_name}
                  image_url={row.image_url}
                  existingScore={scoresBySpotifyId[row.spotify_id] ?? null}
                />
              </li>
            ))}
      </ul>

      {!loading && debounced && results.length === 0 && !error ? (
        <p className="text-center text-sm text-white/55">No results for &ldquo;{debounced}&rdquo;.</p>
      ) : null}

      {!debounced && !loading ? (
        <p className="text-center text-sm text-white/55">Type at least one character to search.</p>
      ) : null}
    </div>
  );
}
