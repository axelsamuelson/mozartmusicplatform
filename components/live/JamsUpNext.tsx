"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Music2 } from "lucide-react";

import type { UpNextItem } from "@/lib/live/jamsUpNext";
import type { LiveSessionRow } from "@/lib/types/live";
import { glassCard } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export function JamsUpNext({
  session,
  userId,
  hideNames,
  refreshKey = 0,
  className,
}: {
  session: LiveSessionRow;
  userId: string | null;
  hideNames?: boolean;
  /** Increment to refetch (e.g. on live_queue_buffer realtime). */
  refreshKey?: number;
  className?: string;
}) {
  const [items, setItems] = useState<UpNextItem[]>([]);
  const [loading, setLoading] = useState(true);
  const surprise = session.queue_mode === "surprise";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/${session.id}/up-next`);
      const body = (await res.json()) as { items?: UpNextItem[] };
      if (res.ok) setItems(body.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, refreshKey]);

  if (surprise) {
    return (
      <section className={cn(glassCard, className)}>
        <h2 className="mb-2 text-xs uppercase tracking-wider text-white/40">Coming up</h2>
        <p className="py-4 text-center text-sm text-white/50">🎵 Surprise</p>
      </section>
    );
  }

  return (
    <section className={cn(glassCard, className)}>
      <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">Coming up</h2>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-wam" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-white/45">Buffer filling…</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={`${item.user_id}-${item.spotify_track_id}`}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2",
                userId === item.user_id && "border-l-2 border-l-wam",
              )}
            >
              <div className="relative size-8 shrink-0 overflow-hidden rounded-md bg-white/10">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt=""
                    width={32}
                    height={32}
                    className="size-8 object-cover"
                    unoptimized
                  />
                ) : (
                  <Music2 className="m-2 size-4 text-white/30" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {item.track_name ? (
                  <>
                    <p className="truncate text-sm text-white">{item.track_name}</p>
                    <p className="truncate text-xs text-white/45">
                      {item.artist_name ?? "Unknown"}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="h-4 w-3/4 max-w-[12rem] animate-pulse rounded bg-white/10" />
                    <div className="mt-1 h-3 w-24 animate-pulse rounded bg-white/10" />
                  </>
                )}
              </div>
              {!hideNames ? (
                <span className="shrink-0 text-[10px] text-white/35">
                  {item.is_manual ? "jump" : item.display_name ?? "…"}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
