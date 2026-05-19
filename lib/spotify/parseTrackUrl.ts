const TRACK_PATH_RE = /\/track\/([a-zA-Z0-9]{22})\b/i;

const SPOTIFY_URI_TRACK_RE = /spotify:track:([a-zA-Z0-9]{22})\b/i;

const SPOTIFY_LINK_HOST_RE = /spotify\.link/i;

const SPOTIFY_HTTP_URL_RE =
  /https?:\/\/(?:[\w-]+\.)*spotify\.(?:com|link)\/[^\s<>"')\]]+/gi;

/** Extract a 22-char Spotify track ID from a URL or URI string, if present. */
export function extractSpotifyTrackId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const uriMatch = trimmed.match(SPOTIFY_URI_TRACK_RE);
  if (uriMatch?.[1]) return uriMatch[1];

  const pathMatch = trimmed.match(TRACK_PATH_RE);
  if (pathMatch?.[1]) return pathMatch[1];

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const fromPath = url.pathname.match(TRACK_PATH_RE);
    if (fromPath?.[1]) return fromPath[1];
  } catch {
    /* not a bare URL — path regex above already scanned full string */
  }

  return null;
}

/** Find Spotify HTTP URLs embedded in arbitrary text (share messages, etc.). */
export function findSpotifyUrlsInText(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(SPOTIFY_HTTP_URL_RE)) {
    const url = match[0].replace(/[.,;:!?)]+$/, "");
    if (url) found.push(url);
  }
  const uriMatches = text.match(/spotify:track:[a-zA-Z0-9]{22}\b/gi);
  if (uriMatches) found.push(...uriMatches);
  return [...new Set(found)];
}

export type NormalizedSpotifyShare = {
  candidates: string[];
  primary: string | null;
  error?: string;
};

/** Validate clipboard / pasted text and extract Spotify link candidates. */
export function normalizeSpotifyShareInput(raw: string): NormalizedSpotifyShare {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { candidates: [], primary: null, error: "Clipboard is empty" };
  }

  if (trimmed.startsWith("{") && trimmed.includes('"error"')) {
    return {
      candidates: [],
      primary: null,
      error:
        "Clipboard does not contain a Spotify link. In Spotify: Share → Copy link, then try again.",
    };
  }

  const fromShare = spotifyCandidatesFromShare({
    url: trimmed,
    text: trimmed,
    title: trimmed,
  });
  const fromRegex = findSpotifyUrlsInText(trimmed);
  const candidates = [...new Set([...fromShare, ...fromRegex, trimmed])].filter(
    (c) =>
      c.includes("spotify.com") ||
      c.includes("spotify:") ||
      c.includes("spotify.link"),
  );

  if (candidates.length === 0) {
    return {
      candidates: [],
      primary: null,
      error:
        "No Spotify track link found. Copy a song link (open.spotify.com/track/… or spotify.link).",
    };
  }

  return { candidates, primary: candidates[0] ?? null };
}

export function isSpotifyShortLink(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return SPOTIFY_LINK_HOST_RE.test(url.hostname);
  } catch {
    return SPOTIFY_LINK_HOST_RE.test(input);
  }
}

/** Collect candidate URL strings from share payload fields. */
export function spotifyCandidatesFromShare(params: {
  url?: string | null;
  title?: string | null;
  text?: string | null;
}): string[] {
  const candidates: string[] = [];
  for (const value of [params.url, params.text, params.title]) {
    if (!value?.trim()) continue;
    const parts = value.split(/\s+/);
    for (const part of parts) {
      if (
        part.includes("spotify.com") ||
        part.includes("spotify:") ||
        part.includes("spotify.link")
      ) {
        candidates.push(part.trim());
      }
    }
    if (value.includes("spotify")) candidates.push(value.trim());
  }
  return [...new Set(candidates)];
}
