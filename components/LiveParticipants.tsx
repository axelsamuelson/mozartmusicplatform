"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { liveInitials } from "@/lib/live/userDisplay";
import type { LivePresenceMember } from "@/lib/types/live";
import { cn } from "@/lib/utils";

export type LiveParticipantsProps = {
  participants: LivePresenceMember[];
  className?: string;
  size?: "sm" | "md";
  emptyLabel?: string;
  /** Hide profile photos (anonymous sessions). */
  hideAvatars?: boolean;
};

export function LiveParticipants({
  participants,
  className,
  size = "md",
  emptyLabel = "Waiting for others to join…",
  hideAvatars = false,
}: LiveParticipantsProps) {
  if (participants.length === 0) {
    return <p className="text-center text-sm text-white/40">{emptyLabel}</p>;
  }

  const avatarSize = size === "sm" ? "size-8" : "size-10";

  return (
    <ul className={cn("flex flex-wrap justify-center gap-3", className)}>
      {participants.map((p) => (
        <li key={p.userId} className="flex flex-col items-center gap-1">
          <div className="relative">
            <Avatar className={cn(avatarSize, "border border-white/15")}>
              {!hideAvatars && p.avatarUrl ? (
                <AvatarImage src={p.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback className="bg-white/10 text-[10px] text-white">
                {liveInitials(p.displayName)}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-black/80",
                p.hasRated ? "bg-green-400" : "bg-white/30",
              )}
              aria-label={p.hasRated ? "Has rated" : "Not rated yet"}
            />
          </div>
          <span className="max-w-[4.5rem] truncate text-[10px] text-white/50">
            {p.displayName}
          </span>
        </li>
      ))}
    </ul>
  );
}
