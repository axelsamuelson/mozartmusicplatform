import { PLAYLIST_COVER_BG, PLAYLIST_COVER_FG } from "@/lib/playlist/coverStyle";
import { cn } from "@/lib/utils";

export function PlaylistCover({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const len = name.trim().length;
  const textClass =
    len > 36 ? "text-[11px] leading-tight" : len > 22 ? "text-xs" : "text-sm";

  return (
    <div
      className={cn(
        "flex aspect-square items-center justify-center overflow-hidden p-2 text-center",
        className,
      )}
      style={{ backgroundColor: PLAYLIST_COVER_BG }}
      aria-hidden
    >
      <span
        className={cn("line-clamp-4 font-bold break-words", textClass)}
        style={{ color: PLAYLIST_COVER_FG }}
      >
        {name.trim() || "Playlist"}
      </span>
    </div>
  );
}
