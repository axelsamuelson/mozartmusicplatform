"use client";

import Image from "next/image";
import { X } from "lucide-react";

import type { LiveQueueRow, LiveSessionRow } from "@/lib/types/live";
import { glassCard } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export type JukeboxQueueProps = {
  queue: LiveQueueRow[];
  session: LiveSessionRow;
  userId: string | null;
  /** Hide avatar + name beside each queued track (session setting). */
  hideQueueNames?: boolean;
  onRemove?: (queueId: string) => void;
  removingId?: string | null;
  className?: string;
};

export function JukeboxQueue({
  queue,
  session,
  userId,
  hideQueueNames = false,
  onRemove,
  removingId,
  className,
}: JukeboxQueueProps) {
  const visible = queue.slice(0, 5);
  const overflow = queue.length - visible.length;

  return (
    <section className={cn(glassCard, className)}>
      <h2 className="mb-3 text-center text-xs uppercase tracking-wider text-white/40">
        Queue
      </h2>

      {queue.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/50">
          Queue is empty — add a song!
        </p>
      ) : (
        <ul className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
          {visible.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              isCurrent={session.current_queue_id === item.id}
              isOwn={userId === item.user_id}
              hideQueueNames={hideQueueNames}
              onRemove={onRemove}
              removing={removingId === item.id}
            />
          ))}
        </ul>
      )}

      {overflow > 0 ? (
        <p className="mt-2 text-center text-xs text-white/40">+{overflow} more in queue</p>
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
  item: LiveQueueRow;
  isCurrent: boolean;
  isOwn: boolean;
  hideQueueNames?: boolean;
  onRemove?: (id: string) => void;
  removing?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2",
        isOwn && "border-l-2 border-l-wam",
        isCurrent && "ring-1 ring-wam/40",
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
          {item.display_name ?? "User"}
        </span>
      ) : null}

      {isOwn && onRemove && !isCurrent ? (
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
