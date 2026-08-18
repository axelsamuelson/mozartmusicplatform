"use client";

import Image from "next/image";
import Link from "next/link";
import { Disc3, Play } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { scoreBadgeClass } from "@/components/ScoreSlider";
import type { ItemType } from "@/lib/spotify/api";
import { play, spotifyUri } from "@/lib/spotify/player";
import { glassCardTight } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export interface SpotifyItemProps {
  spotify_id: string;
  type: ItemType;
  name: string;
  artist_name: string | null;
  image_url: string | null;
  /** When set, shows the user’s existing score for this Spotify id. */
  existingScore?: number | null;
  className?: string;
}

function typeLabel(type: ItemType): string {
  switch (type) {
    case "track":
      return "Track";
    case "album":
      return "Album";
    case "artist":
      return "Artist";
  }
}

function subtitle(props: SpotifyItemProps): string {
  if (props.artist_name) return props.artist_name;
  if (props.type === "artist") return "Artist";
  return "";
}

export function SpotifyItem({ className, ...props }: SpotifyItemProps) {
  const sub = subtitle(props);
  const uri = spotifyUri(props.type, props.spotify_id);

  async function handlePlay(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await play(uri);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start playback",
      );
    }
  }

  return (
    <div
      className={cn(
        glassCardTight,
        "group flex items-center gap-3 transition-all duration-300",
        className,
      )}
    >
      <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/10">
        {props.image_url ? (
          <Image
            src={props.image_url}
            alt=""
            width={48}
            height={48}
            sizes="48px"
            className="size-12 object-cover"
          />
        ) : (
          <div className="flex size-12 items-center justify-center text-white/40">
            <Disc3 className="size-6" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-white">{props.name}</p>
          <Badge variant="outline" className="shrink-0 border-white/25 capitalize text-white/80">
            {typeLabel(props.type)}
          </Badge>
          {props.existingScore != null ? (
            <span
              className={cn(
                "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
                scoreBadgeClass(props.existingScore),
              )}
            >
              {props.existingScore}
            </span>
          ) : null}
        </div>
        {sub ? (
          <p className="truncate text-sm text-white/60">{sub}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="size-9 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          aria-label="Play on Spotify"
          onClick={handlePlay}
        >
          <Play className="size-4 fill-current" />
        </Button>
        <Button
          asChild
          size="sm"
          className="rounded-full bg-wam px-4 font-medium text-white shadow-md transition-all duration-300 hover:scale-105 hover:bg-wam/90 hover:text-white hover:shadow-lg"
        >
          <Link href={`/item/${props.spotify_id}?type=${props.type}`}>
            Rate
          </Link>
        </Button>
      </div>
    </div>
  );
}
