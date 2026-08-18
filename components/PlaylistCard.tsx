"use client";

import Link from "next/link";
import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PlaylistFilterChips } from "@/components/PlaylistFilterChips";
import { PlaylistCover } from "@/components/PlaylistCover";
import { Button } from "@/components/ui/button";
import { summarizePlaylistFilters } from "@/lib/playlist/filterSummary";
import { glassCard } from "@/lib/wamUi";
import type { WamPlaylistRow } from "@/lib/types/playlists";
import { cn } from "@/lib/utils";

export interface PlaylistCardProps {
  playlist: WamPlaylistRow;
  onDeleted?: (id: string) => void;
  onSynced?: (row: WamPlaylistRow) => void;
}

function syncStatus(lastSynced: string | null): {
  label: string;
  dotClass: string;
} {
  if (!lastSynced) {
    return { label: "Not synced yet", dotClass: "bg-amber-400" };
  }
  const ageMs = Date.now() - new Date(lastSynced).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (ageMs < day) {
    return { label: "Synced recently", dotClass: "bg-emerald-400" };
  }
  return { label: "Sync recommended", dotClass: "bg-white/35" };
}

export function PlaylistCard({ playlist, onDeleted, onSynced }: PlaylistCardProps) {
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const status = syncStatus(playlist.last_synced_at);
  const last =
    playlist.last_synced_at != null
      ? new Date(playlist.last_synced_at).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

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

  return (
    <article
      className={cn(
        "group flex h-full flex-col gap-4 p-5 transition-all duration-300 hover:border-white/15",
        glassCard,
      )}
    >
      <div className="flex items-start gap-3">
        <PlaylistCover
          name={playlist.name}
          className="size-16 shrink-0 rounded-xl border border-white/10 md:size-20"
        />
        <div className="min-w-0 flex-1">
          <Link
            href={`/playlists/${playlist.id}`}
            className="block truncate text-lg font-semibold leading-tight text-white transition-colors hover:text-wam"
          >
            {playlist.name}
          </Link>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/45">
            {summarizePlaylistFilters(playlist)}
          </p>
        </div>
      </div>

      <PlaylistFilterChips playlist={playlist} />

      <div className="flex items-end justify-between gap-3 border-t border-white/[0.06] pt-3">
        <div>
          <p className="text-2xl font-bold tabular-nums text-white">
            {playlist.track_count}
            <span className="ml-1.5 text-sm font-normal text-white/45">tracks</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
            <span
              className={cn("size-1.5 shrink-0 rounded-full", status.dotClass)}
              aria-hidden
            />
            {status.label}
            {last ? <span className="text-white/30">· {last}</span> : null}
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleSync}
          disabled={syncing || deleting}
          className="rounded-full bg-wam px-4 text-sm font-medium text-black hover:bg-wam/90"
        >
          <RefreshCw
            className={cn("mr-1.5 size-3.5", syncing && "animate-spin")}
            aria-hidden
          />
          {syncing ? "Syncing…" : "Sync"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          asChild
          className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10"
        >
          <Link href={`/playlists/${playlist.id}`}>Details</Link>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleDelete}
          disabled={syncing || deleting}
          className="ml-auto rounded-full text-white/40 hover:bg-red-500/10 hover:text-red-400"
          aria-label="Delete playlist"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </article>
  );
}
