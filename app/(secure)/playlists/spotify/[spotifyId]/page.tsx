"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { LoadingMark } from "@/components/LoadingMark";
import { PlaylistRankingView } from "@/components/PlaylistRankingView";
import { PlaylistsSubnav } from "@/components/PlaylistsSubnav";
import { Button } from "@/components/ui/button";
import type { PlaylistRankingPayload } from "@/lib/types/trackPlaylists";

export default function SpotifyPlaylistRankPage() {
  const params = useParams();
  const spotifyId = params.spotifyId as string;
  const [data, setData] = useState<PlaylistRankingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/spotify/playlists/${encodeURIComponent(spotifyId)}/ranking`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as PlaylistRankingPayload & {
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || res.statusText);
        setData(body);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load ranking");
        setData(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [spotifyId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-24 md:px-6">
        <PlaylistsSubnav />
        <div className="mt-10">
          <LoadingMark />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-24 md:px-6">
        <PlaylistsSubnav />
        <p className="text-sm text-red-400">{error || "Not found"}</p>
        <Button type="button" variant="outline" asChild className="rounded-full">
          <Link href="/playlists/spotify">Back to Spotify playlists</Link>
        </Button>
      </div>
    );
  }

  return (
    <PlaylistRankingView
      data={data}
      backHref="/playlists/spotify"
      backLabel="Spotify playlists"
    />
  );
}
