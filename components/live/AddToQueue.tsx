"use client";

import { ClipboardPaste, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { JukeboxAddSong } from "@/components/live/JukeboxAddSong";
import { glassCard } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export type AddToQueueProps = {
  sessionId: string;
  hasManualPending: boolean;
  disabled?: boolean;
  onAdded?: () => void;
  className?: string;
};

/** Single manual track to jump the queue (max 1 pending per user). */
export function AddToQueue({
  sessionId,
  hasManualPending,
  disabled,
  onAdded,
  className,
}: AddToQueueProps) {
  const [pasting, setPasting] = useState(false);

  async function pasteLink() {
    if (hasManualPending || disabled || pasting) return;
    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      const res = await fetch(
        `/api/spotify/resolve-track?url=${encodeURIComponent(text.trim())}`,
      );
      const body = (await res.json()) as {
        error?: string;
        trackId?: string;
        trackName?: string;
        artistName?: string | null;
        imageUrl?: string | null;
      };
      if (!res.ok || !body.trackId) throw new Error(body.error || "Invalid link");

      const addRes = await fetch(`/api/live/${sessionId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotify_track_id: body.trackId,
          track_name: body.trackName,
          artist_name: body.artistName,
          image_url: body.imageUrl,
          is_manual: true,
        }),
      });
      const addBody = (await addRes.json()) as { error?: string };
      if (!addRes.ok) throw new Error(addBody.error || "Could not add");
      toast.success("Added to your next slot");
      onAdded?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not paste link");
    } finally {
      setPasting(false);
    }
  }

  return (
    <section className={cn(glassCard, className)}>
      <h2 className="mb-1 text-xs uppercase tracking-wider text-white/40">Add a track</h2>
      <p className="mb-3 text-[10px] text-white/40">
        Jump the queue for your next slot — max 1 manual track at a time.
      </p>

      {hasManualPending ? (
        <p className="mb-3 rounded-lg border border-wam/20 bg-wam/5 px-3 py-2 text-xs text-wam">
          You already have a manual track waiting.
        </p>
      ) : null}

      <JukeboxAddSong
        sessionId={sessionId}
        myQueueCount={hasManualPending ? 1 : 0}
        maxPerUser={1}
        isManual
        disabled={disabled || hasManualPending}
        onAdded={onAdded}
        className="!border-0 !bg-transparent !p-0 shadow-none"
      />

      <button
        type="button"
        disabled={disabled || hasManualPending || pasting}
        onClick={() => void pasteLink()}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 py-2 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
      >
        {pasting ? <Loader2 className="size-3.5 animate-spin" /> : <ClipboardPaste className="size-3.5" />}
        Paste Spotify link
      </button>
    </section>
  );
}
