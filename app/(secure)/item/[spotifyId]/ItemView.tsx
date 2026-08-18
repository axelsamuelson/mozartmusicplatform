"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { LoadingMark } from "@/components/LoadingMark";
import { RatingForm } from "@/components/RatingForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { userFacingFetchError } from "@/lib/http/fetchRetry";
import { play, spotifyUri } from "@/lib/spotify/player";
import { glassCardTight, glassPanel, pageHeading, pageSub, sectionHeading } from "@/lib/wamUi";
import type { ItemType } from "@/lib/spotify/api";
import type {
  GenreTagRow,
  MomentTagRow,
  MoodTagRow,
  RatingDetail,
} from "@/lib/types/ratings";

const ALLOWED_TYPES: ItemType[] = ["track", "album"];

type CachedRow = {
  spotify_id: string;
  type: ItemType;
  name: string;
  artist_name: string | null;
  image_url: string | null;
};

function typeLabel(t: ItemType): string {
  if (t === "track") return "Track";
  if (t === "album") return "Album";
  return "Artist";
}

export function ItemView() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const spotifyId = params.spotifyId as string;
  const typeRaw = searchParams.get("type");
  const type =
    typeRaw && (ALLOWED_TYPES as readonly string[]).includes(typeRaw)
      ? (typeRaw as ItemType)
      : null;

  useEffect(() => {
    if (typeRaw === "artist" && spotifyId) {
      router.replace(`/artist/${spotifyId}`);
    }
  }, [typeRaw, spotifyId, router]);

  const [item, setItem] = useState<CachedRow | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [itemLoading, setItemLoading] = useState(true);

  const [genreTags, setGenreTags] = useState<GenreTagRow[]>([]);
  const [moodTags, setMoodTags] = useState<MoodTagRow[]>([]);
  const [momentTags, setMomentTags] = useState<MomentTagRow[]>([]);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [tagsLoading, setTagsLoading] = useState(false);

  const [rating, setRating] = useState<RatingDetail | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (typeRaw === "artist") {
      setItemLoading(true);
      setItemError(null);
      return;
    }
    if (!spotifyId || !type) {
      setItemLoading(false);
      setItemError(
        !spotifyId
          ? "Missing item id."
          : "Missing or invalid type. Open this page from search results.",
      );
      return;
    }
    const ac = new AbortController();
    setItemLoading(true);
    setItemError(null);
    setItem(null);

    fetch(
      `/api/spotify/item/${encodeURIComponent(spotifyId)}?type=${encodeURIComponent(type)}`,
      { signal: ac.signal },
    )
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          item?: CachedRow;
        };
        if (!res.ok) throw new Error(body.error || res.statusText);
        setItem(body.item ?? null);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setItemError(e instanceof Error ? e.message : "Could not load item");
      })
      .finally(() => {
        if (!ac.signal.aborted) setItemLoading(false);
      });

    return () => ac.abort();
  }, [spotifyId, type, typeRaw]);

  useEffect(() => {
    if (!spotifyId || !type || itemLoading || itemError || !item) return;

    const ac = new AbortController();
    setTagsLoading(true);
    setRatingLoading(true);
    setTagsError(null);

    fetch("/api/tags", { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          genre_tags?: GenreTagRow[];
          mood_tags?: MoodTagRow[];
          moment_tags?: MomentTagRow[];
        };
        if (!res.ok) throw new Error(body.error || "Failed to load tags");
        setGenreTags(body.genre_tags ?? []);
        setMoodTags(body.mood_tags ?? []);
        setMomentTags(body.moment_tags ?? []);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setTagsError(e instanceof Error ? e.message : "Failed to load tags");
      })
      .finally(() => {
        if (!ac.signal.aborted) setTagsLoading(false);
      });

    fetch(`/api/ratings?spotify_id=${encodeURIComponent(spotifyId)}`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          rating?: RatingDetail | null;
        };
        if (!res.ok) throw new Error(body.error || "Failed to load rating");
        setRating(body.rating ?? null);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setRating(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setRatingLoading(false);
      });

    return () => ac.abort();
  }, [spotifyId, type, item, itemLoading, itemError]);

  const handleSaved = useCallback((r: RatingDetail) => {
    setRating(r);
  }, []);

  const handleDeleted = useCallback(() => {
    setRating(null);
  }, []);

  async function handlePlay() {
    if (!item || playing) return;
    setPlaying(true);
    try {
      await play(spotifyUri(item.type, item.spotify_id));
    } catch (e) {
      toast.error(userFacingFetchError(e, "Could not start playback. Try again."));
    } finally {
      setPlaying(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pb-16 pt-24 md:px-6">
      <Button
        variant="ghost"
        className="w-fit rounded-full px-0 text-white/70 hover:bg-white/10 hover:text-white"
        asChild
      >
        <Link href="/search">← Back to search</Link>
      </Button>

      {itemLoading ? (
        <LoadingMark />
      ) : itemError ? (
        <p className="text-sm text-red-400">{itemError}</p>
      ) : item ? (
        <>
          <header
            className={`flex gap-5 border-b border-white/[0.08] pb-8 ${glassPanel}`}
          >
            <div className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/10">
              {item.image_url ? (
                <Image
                  src={item.image_url}
                  alt=""
                  width={96}
                  height={96}
                  className="size-24 object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-white/25 text-xs text-white/80">
                  {typeLabel(item.type)}
                </Badge>
              </div>
              <h1 className={`${pageHeading} text-balance`}>{item.name}</h1>
              {item.artist_name ? (
                <p className={pageSub}>{item.artist_name}</p>
              ) : null}
              <Button
                type="button"
                disabled={playing}
                onClick={() => void handlePlay()}
                className="mt-3 rounded-full bg-wam px-5 font-semibold text-black hover:bg-wam/90"
              >
                <Play className="size-4 fill-current" aria-hidden />
                {playing ? "Starting…" : item.type === "track" ? "Play" : "Play on Spotify"}
              </Button>
            </div>
          </header>

          <section className="flex flex-col gap-6">
            <h2 className={sectionHeading}>Your rating</h2>
            {tagsError ? (
              <p className="text-sm text-red-400">{tagsError}</p>
            ) : tagsLoading || ratingLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className={`h-24 w-full ${glassCardTight}`} />
                <Skeleton className={`h-40 w-full ${glassCardTight}`} />
              </div>
            ) : (
              <RatingForm
                spotifyId={item.spotify_id}
                genreTags={genreTags}
                momentTags={momentTags}
                initialRating={rating}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
