"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizePlaylistFilters } from "@/lib/playlist/filterSummary";
import { glassCard } from "@/lib/wamUi";
import type { WamPlaylistRow } from "@/lib/types/playlists";
import { cn } from "@/lib/utils";

export interface PlaylistCardProps {
  playlist: WamPlaylistRow;
  onDeleted?: (id: string) => void;
  onSynced?: (row: WamPlaylistRow) => void;
}

export function PlaylistCard({ playlist, onDeleted, onSynced }: PlaylistCardProps) {
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/sync`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        playlist?: WamPlaylistRow;
      };
      if (!res.ok) throw new Error(body.error || res.statusText);
      if (body.playlist) onSynced?.(body.playlist);
      toast.success("Playlist synced to Spotify");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete playlist “${playlist.name}” from WAM and Spotify?`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || res.statusText);
      }
      onDeleted?.(playlist.id);
      toast.success("Playlist removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const last =
    playlist.last_synced_at != null
      ? new Date(playlist.last_synced_at).toLocaleString()
      : "Never";

  return (
    <Card
      className={cn(
        "flex flex-col gap-4 border-0 bg-transparent text-white shadow-none ring-0",
        glassCard,
      )}
    >
      <CardHeader className="space-y-1 px-0 pb-2 pt-0">
        <CardTitle className="text-xl font-bold leading-tight text-white sm:text-2xl">
          <Link
            href={`/playlists/${playlist.id}`}
            className="transition-colors duration-300 hover:text-wam"
          >
            {playlist.name}
          </Link>
        </CardTitle>
        <p className="text-xs leading-relaxed text-white/60">{summarizePlaylistFilters(playlist)}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 px-0 text-sm text-white/65">
        <p>
          <span className="font-semibold text-white">{playlist.track_count}</span> tracks
        </p>
        <p className="text-xs text-white/50">Last synced: {last}</p>
      </CardContent>
      <CardFooter className="mt-auto flex flex-wrap gap-2 border-t border-white/[0.08] bg-white/[0.03] px-0 pb-0 pt-4">
        <Button
          type="button"
          size="sm"
          onClick={handleSync}
          disabled={syncing || deleting}
          className="rounded-full border border-white/20 bg-white/10 px-5 text-white transition-all duration-300 hover:scale-105 hover:bg-white/20 hover:shadow-md"
        >
          {syncing ? "Syncing…" : "Sync"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={syncing || deleting}
          className="rounded-full"
        >
          {deleting ? "Deleting…" : "Delete"}
        </Button>
        <Button type="button" size="sm" variant="outline" asChild className="rounded-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white">
          <Link href={`/playlists/${playlist.id}`}>Details</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
