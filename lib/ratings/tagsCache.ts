import { fetchWithRetry } from "@/lib/http/fetchRetry";
import type { GenreTagRow, MomentTagRow } from "@/lib/types/ratings";

export type TagsCatalog = {
  genre_tags: GenreTagRow[];
  moment_tags: MomentTagRow[];
};

let memory: TagsCatalog | null = null;
let inflight: Promise<TagsCatalog> | null = null;

export function peekCachedTags(): TagsCatalog | null {
  return memory;
}

export async function loadTagsCatalog(signal?: AbortSignal): Promise<TagsCatalog> {
  if (memory) return memory;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!inflight) {
    inflight = fetchWithRetry("/api/tags")
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          genre_tags?: GenreTagRow[];
          moment_tags?: MomentTagRow[];
        };
        if (!res.ok) throw new Error(body.error ?? "Failed to load tags");
        const catalog: TagsCatalog = {
          genre_tags: body.genre_tags ?? [],
          moment_tags: body.moment_tags ?? [],
        };
        memory = catalog;
        return catalog;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function prefetchTagsCatalog(): void {
  void loadTagsCatalog().catch(() => {});
}
