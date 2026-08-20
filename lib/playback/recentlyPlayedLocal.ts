/** Client-side recently played history (localStorage). */

export type LocalRecentTrack = {
  spotifyId: string;
  name: string;
  artistName: string;
  artistId: string | null;
  imageUrl: string | null;
  playedAt: string;
};

const STORAGE_KEY = "wam-recently-played-v1";
const MAX_TRACKS = 30;

function readStore(): LocalRecentTrack[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is LocalRecentTrack =>
        Boolean(
          t &&
            typeof t === "object" &&
            typeof (t as LocalRecentTrack).spotifyId === "string" &&
            typeof (t as LocalRecentTrack).name === "string" &&
            typeof (t as LocalRecentTrack).playedAt === "string",
        ),
    );
  } catch {
    return [];
  }
}

function writeStore(tracks: LocalRecentTrack[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks.slice(0, MAX_TRACKS)));
  } catch {
    /* quota / private mode */
  }
}

export function loadLocalRecentlyPlayed(): LocalRecentTrack[] {
  return readStore();
}

/** Record a track play at the front of the list (deduped by spotifyId). */
export function recordLocalRecentlyPlayed(
  track: Omit<LocalRecentTrack, "playedAt"> & { playedAt?: string },
): void {
  if (!track.spotifyId || !track.name) return;
  const next: LocalRecentTrack = {
    spotifyId: track.spotifyId,
    name: track.name,
    artistName: track.artistName || "Unknown",
    artistId: track.artistId ?? null,
    imageUrl: track.imageUrl ?? null,
    playedAt: track.playedAt ?? new Date().toISOString(),
  };
  const prev = readStore().filter((t) => t.spotifyId !== next.spotifyId);
  writeStore([next, ...prev]);
}
