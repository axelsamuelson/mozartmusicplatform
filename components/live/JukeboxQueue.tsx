"use client";

import Image from "next/image";
import { X } from "lucide-react";

import type { LiveQueueDisplayItem } from "@/lib/live/liveQueueDisplay";
import type { LiveSessionRow } from "@/lib/types/live";
import { glassCard } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export type JukeboxQueueProps = {
  items: LiveQueueDisplayItem[];
  session: LiveSessionRow;
  userId: string | null;
  /** Section heading (default: Queue). */
  title?: string;
  /** Shown when items is empty. */
  emptyMessage?: string;
  /** Hide avatar + name beside each queued track (session setting). */
  hideQueueNames?: boolean;
  /** Fills with host Spotify up next when the room queue is short. */
  usesPlaybackPreview?: boolean;
  onRemove?: (queueId: string) => void;
  removingId?: string | null;
  /** User-queued tracks beyond the 5 visible rows. */
  userQueueOverflow?: number;
  className?: string;
};

export function JukeboxQueue({
  items,
  session,
  userId,
  title = "Queue",
  emptyMessage,
  hideQueueNames = false,
  usesPlaybackPreview = false,
  onRemove,
  removingId,
  userQueueOverflow = 0,
  className,
}: JukeboxQueueProps) {
  const visible = items;
  const emptyText =
    emptyMessage ??
    (usesPlaybackPreview
      ? "Nothing up next — play music on the host's Spotify."
      : "Queue is empty — add a song!");

  return (
    <section className={cn(glassCard, className)}>
      <h2 className="mb-3 text-center text-xs uppercase tracking-wider text-white/40">
        {title}
      </h2>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/50">{emptyText}</p>
      ) : (
        <ul className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
          {visible.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              isCurrent={
                item.kind === "queued" && session.current_queue_id === item.id
              }
              isOwn={item.kind === "queued" && userId === item.user_id}
              hideQueueNames={hideQueueNames}
              onRemove={onRemove}
              removing={removingId === item.id}
            />
          ))}
        </ul>
      )}

      {userQueueOverflow > 0 ? (
        <p className="mt-2 text-center text-xs text-white/40">
          +{userQueueOverflow} more in queue
        </p>
      ) : null}
    </section>
  );
}

function QueueRow({
  item,
  isCurrent,
  isOwn,
  hideQueueNames,
  onRemove,
  removing,
}: {
  item: LiveQueueDisplayItem;
  isCurrent: boolean;
  isOwn: boolean;
  hideQueueNames?: boolean;
  onRemove?: (id: string) => void;
  removing?: boolean;
}) {
  const fromPlayback = item.kind === "playback";

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2",
        isOwn && "border-l-2 border-l-wam",
        isCurrent && "ring-1 ring-wam/40",
        fromPlayback && "border-dashed opacity-90",
      )}
    >
      <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-white/50">
        {item.position}
      </span>

      {isCurrent ? (
        <span
          className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-400"
          aria-label="Now playing"
        />
      ) : (
        <span className="size-2 shrink-0" aria-hidden />
      )}

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
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{item.track_name}</p>
        <p className="truncate text-xs text-white/50">{item.artist_name ?? "Unknown artist"}</p>
      </div>

      {!hideQueueNames ? (
        <span className="max-w-[72px] shrink-0 truncate text-[10px] text-white/55">
          {item.display_name ?? (fromPlayback ? "Host" : "User")}
        </span>
      ) : fromPlayback ? (
        <span className="max-w-[72px] shrink-0 truncate text-[10px] text-white/40">Host</span>
      ) : null}

      {isOwn && onRemove && !isCurrent && item.kind === "queued" ? (
        <button
          type="button"
          aria-label="Remove from queue"
          disabled={removing}
          onClick={() => onRemove(item.id)}
          className="shrink-0 rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </li>
  );
}
