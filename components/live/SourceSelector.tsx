"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, ListMusic, Loader2, Star } from "lucide-react";
import { toast } from "sonner";

import { PlaylistSourcePicker } from "@/components/live/PlaylistSourcePicker";
import { calculateSlots } from "@/lib/live/slotSystem";
import type { LiveSessionSourceRow, LiveSessionSourceType } from "@/lib/types/live";
import { glassCard } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export type SourceSelectorProps = {
  sessionId: string;
  onSelected?: (source: LiveSessionSourceRow) => void;
  compact?: boolean;
};

export function SourceSelector({ sessionId, onSelected, compact }: SourceSelectorProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectingPlaylistId, setSelectingPlaylistId] = useState<string | null>(null);
  const [mine, setMine] = useState<LiveSessionSourceRow | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingSource, setEditingSource] = useState(false);

  const startSlots = calculateSlots(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/live/${sessionId}/source`);
      const body = (await res.json()) as {
        mine?: LiveSessionSourceRow | null;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Failed to load source");
      setMine(body.mine ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load source");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function setSource(
    sourceType: LiveSessionSourceType,
    spotifyPlaylistId?: string,
  ) {
    setSubmitting(true);
    if (sourceType === "playlist" && spotifyPlaylistId) {
      setSelectingPlaylistId(spotifyPlaylistId);
    }
    try {
      const res = await fetch(`/api/live/${sessionId}/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: sourceType,
          spotify_playlist_id: spotifyPlaylistId,
        }),
      });
      const body = (await res.json()) as {
        source?: LiveSessionSourceRow;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Failed to set source");
      setMine(body.source ?? null);
      setPickerOpen(false);
      setEditingSource(false);
      toast.success("Music source updated");
      if (body.source) onSelected?.(body.source);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set source");
    } finally {
      setSubmitting(false);
      setSelectingPlaylistId(null);
    }
  }

  function openPlaylistPicker() {
    setPickerOpen(true);
  }

  function closePlaylistPicker() {
    if (submitting) return;
    setPickerOpen(false);
    if (mine) setEditingSource(false);
  }

  if (loading) {
    return (
      <div className={cn(glassCard, "flex justify-center py-8")}>
        <Loader2 className="size-6 animate-spin text-wam" />
      </div>
    );
  }

  if (mine && compact) {
    return (
      <button
        type="button"
        className="text-xs text-wam hover:underline"
        onClick={() => {
          setPickerOpen(false);
          void refresh();
        }}
      >
        Change source ({mine.source_type})
      </button>
    );
  }

  if (mine && !editingSource && !pickerOpen) {
    return (
      <div className={cn(glassCard, "text-sm text-white/60")}>
        <p>
          Source:{" "}
          <span className="text-white">
            {mine.source_type === "playlist"
              ? mine.playlist_name
              : mine.source_type === "top_rated"
                ? "Top rated in WAM"
                : "Rating only"}
          </span>
        </p>
        <button
          type="button"
          className="mt-2 text-xs text-wam hover:underline"
          onClick={() => setEditingSource(true)}
        >
          Change source
        </button>
      </div>
    );
  }

  return (
    <section className={cn(glassCard, "space-y-4")}>
      {pickerOpen ? (
        <PlaylistSourcePicker
          onBack={closePlaylistPicker}
          onSelect={(id) => setSource("playlist", id)}
          submitting={submitting}
          selectingId={selectingPlaylistId}
        />
      ) : (
        <>
          <div className="text-center">
            <h2 className="text-sm font-medium text-white">Choose your music source</h2>
            <p className="mt-1 text-xs text-white/45">
              You start with {startSlots} rotation slots
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SourceCard
              icon={<ListMusic className="size-6 text-wam" />}
              title="Choose a playlist"
              description="Search and pick from your Spotify playlists"
              disabled={submitting}
              onClick={openPlaylistPicker}
            />
            <SourceCard
              icon={<Star className="size-6 text-wam" />}
              title="My top rated in WAM"
              description="Based on your WAM library ratings"
              disabled={submitting}
              onClick={() => void setSource("top_rated")}
            />
            <SourceCard
              icon={<Eye className="size-6 text-wam/80" />}
              title="Just rate, don't play"
              description="Join ratings without contributing tracks"
              disabled={submitting}
              onClick={() => void setSource("none")}
            />
          </div>
        </>
      )}
    </section>
  );
}

function SourceCard({
  icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 text-center transition-colors hover:border-wam/40 hover:bg-wam/5 disabled:opacity-50"
    >
      {icon}
      <span className="text-sm font-medium text-white">{title}</span>
      <span className="text-[10px] text-white/45">{description}</span>
    </button>
  );
}
