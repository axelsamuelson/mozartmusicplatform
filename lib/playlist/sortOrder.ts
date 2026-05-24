import type { RatingDetail } from "@/lib/types/ratings";
import type { PlaylistSortOrder } from "@/lib/types/playlists";

export const PLAYLIST_SORT_OPTIONS: {
  value: PlaylistSortOrder;
  label: string;
  description: string;
}[] = [
  {
    value: "recently_rated",
    label: "Recently rated",
    description: "Newest ratings first",
  },
  {
    value: "score_desc",
    label: "Highest score",
    description: "Best tracks at the top",
  },
  {
    value: "score_asc",
    label: "Lowest score",
    description: "Lowest scores at the top",
  },
  {
    value: "title_asc",
    label: "Title A–Z",
    description: "Alphabetical by track name",
  },
  {
    value: "title_desc",
    label: "Title Z–A",
    description: "Reverse alphabetical",
  },
];

const VALID_SORT_ORDERS = new Set(
  PLAYLIST_SORT_OPTIONS.map((o) => o.value),
);

export function parsePlaylistSortOrder(value: unknown): PlaylistSortOrder | null {
  if (typeof value !== "string") return null;
  return VALID_SORT_ORDERS.has(value as PlaylistSortOrder)
    ? (value as PlaylistSortOrder)
    : null;
}

export function playlistSortOrderLabel(order: PlaylistSortOrder | null | undefined): string {
  const found = PLAYLIST_SORT_OPTIONS.find((o) => o.value === order);
  return found?.label ?? "Recently rated";
}

function compareUpdatedDesc(a: RatingDetail, b: RatingDetail): number {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

export function sortPlaylistRatings(
  ratings: RatingDetail[],
  sortOrder: PlaylistSortOrder | null | undefined,
): RatingDetail[] {
  const order = sortOrder ?? "recently_rated";
  const copy = [...ratings];

  switch (order) {
    case "score_desc":
      return copy.sort(
        (a, b) => b.score - a.score || compareUpdatedDesc(a, b),
      );
    case "score_asc":
      return copy.sort(
        (a, b) => a.score - b.score || compareUpdatedDesc(a, b),
      );
    case "title_asc":
      return copy.sort((a, b) => {
        const ta = a.item?.name ?? a.spotify_id;
        const tb = b.item?.name ?? b.spotify_id;
        return ta.localeCompare(tb, undefined, { sensitivity: "base" });
      });
    case "title_desc":
      return copy.sort((a, b) => {
        const ta = a.item?.name ?? a.spotify_id;
        const tb = b.item?.name ?? b.spotify_id;
        return tb.localeCompare(ta, undefined, { sensitivity: "base" });
      });
    case "recently_rated":
    default:
      return copy.sort(compareUpdatedDesc);
  }
}
