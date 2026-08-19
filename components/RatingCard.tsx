"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Disc3, Play } from "lucide-react";
import { toast } from "sonner";

import { NowPlayingRatingDialog } from "@/components/NowPlayingRatingDialog";
import { TempoIntensityPills } from "@/components/TempoIntensityPills";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { scoreBadgeClass } from "@/components/ScoreSlider";
import type { RatingDetail } from "@/lib/types/ratings";
import { play, spotifyItemHref, spotifyUri } from "@/lib/spotify/player";
import { userFacingFetchError } from "@/lib/http/fetchRetry";
import { isPlaybackCancelled } from "@/lib/spotify/playerCommandError";
import { liveInitials } from "@/lib/live/userDisplay";
import { glassCardTight } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export type RatingCardRater = {
  name: string;
  avatarUrl: string | null;
};

export interface RatingCardProps {
  rating: RatingDetail;
  className?: string;
  /** Small avatar on the cover — who rated this item. */
  rater?: RatingCardRater | null;
  /** When the user saves or deletes from the “Complete rating” dialog, sync parent state. */
  onRatingUpdated?: (rating: RatingDetail | null) => void;
}

export function RatingCard({
  rating,
  className,
  rater,
  onRatingUpdated,
}: RatingCardProps) {
  const item = rating.item;
  const title = item?.name ?? "Unknown item";
  const artist = item?.artist_name ?? null;
  const imageUrl = item?.image_url ?? null;
  const type = item?.type ?? "track";
  const href = spotifyItemHref(type, rating.spotify_id);
  const uri = spotifyUri(type, rating.spotify_id);

  const [completeOpen, setCompleteOpen] = useState(false);

  const ratingIncomplete =
    typeof rating.score !== "number" || !Number.isFinite(rating.score);

  async function handlePlay(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await play(uri);
    } catch (err) {
      if (isPlaybackCancelled(err)) return;
      toast.error(
        userFacingFetchError(err, "Could not start playback"),
      );
    }
  }

  const genres = rating.genres;
  const moments = rating.moments;
  const genreShown = genres.slice(0, 3);
  const genreExtra = genres.length - genreShown.length;
  const momentShown = moments.slice(0, 2);
  const momentExtra = moments.length - momentShown.length;

  return (
    <div
      className={cn(
        glassCardTight,
        "group flex w-full gap-2 transition-all duration-300 md:gap-3",
        className,
      )}
    >
      <Link
        href={href}
        className="flex min-w-0 flex-1 gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:gap-3"
      >
        <div className="relative size-12 shrink-0 md:size-16">
          <div className="size-full overflow-hidden rounded-lg border border-white/10 bg-white/10">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt=""
                width={64}
                height={64}
                sizes="(max-width: 768px) 48px, 64px"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-white/40">
                <Disc3 className="size-6 md:size-8" aria-hidden />
              </div>
            )}
          </div>
          {rater ? (
            <Avatar
              size="sm"
              className="absolute -right-1 -bottom-1 size-5 ring-2 ring-[#0b0b12] md:size-6"
              title={rater.name}
            >
              {rater.avatarUrl ? (
                <AvatarImage src={rater.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback className="bg-white/15 text-[9px] text-white md:text-[10px]">
                {liveInitials(rater.name)}
              </AvatarFallback>
            </Avatar>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:gap-2">
          <div>
            <p className="truncate font-medium text-white">{title}</p>
            {artist ? (
              <p className="truncate text-sm text-white/60">{artist}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                scoreBadgeClass(rating.score),
              )}
            >
              {rating.score}
            </span>
            <TempoIntensityPills tempo={rating.tempo} intensity={rating.intensity} />
          </div>

          {genreShown.length ? (
            <div className="flex flex-wrap items-center gap-1">
              {genreShown.map((g) => (
                <Badge key={g.id} variant="secondary" className="border-white/15 bg-white/10 text-xs font-normal text-white/90 hover:bg-white/15">
                  {g.name}
                </Badge>
              ))}
              {genreExtra > 0 ? (
                <span className="text-xs text-white/50">
                  +{genreExtra} till
                </span>
              ) : null}
            </div>
          ) : null}

          {momentShown.length ? (
            <div className="flex flex-wrap items-center gap-1">
              {momentShown.map((m) => (
                <Badge key={m.id} variant="outline" className="border-white/20 bg-transparent text-xs font-normal text-white/85 hover:bg-white/10">
                  {m.name}
                </Badge>
              ))}
              {momentExtra > 0 ? (
                <span className="text-xs text-white/50">
                  +{momentExtra} till
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Link>

      <div className="flex shrink-0 flex-col items-center justify-center gap-2 self-stretch">
        {ratingIncomplete ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCompleteOpen(true);
            }}
            className="max-w-[5.5rem] rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-1 text-center text-[10px] font-medium leading-tight text-amber-100/95 transition-colors hover:border-amber-400/55 hover:bg-amber-500/20"
          >
            Complete rating
          </button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="size-9 rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          aria-label="Play"
          onClick={handlePlay}
        >
          <Play className="size-4 fill-current" />
        </Button>
      </div>

      <NowPlayingRatingDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        spotifyId={rating.spotify_id}
        itemType={type}
        displayTitle={title}
        displayArtist={artist ?? "—"}
        displayImageUrl={imageUrl}
        onRatingUpdated={(r) => {
          onRatingUpdated?.(r);
          setCompleteOpen(false);
        }}
      />
    </div>
  );
}
