import { releaseYearFromSpotifyDate } from "@/lib/spotify/releaseYear";
import { getSpotifyToken } from "@/lib/spotify/token";

const API_BASE = "https://api.spotify.com/v1";

export class SpotifyHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "SpotifyHttpError";
  }
}

export type ItemType = "track" | "album" | "artist";

/** Row returned from search (and usable in UI). */
export interface SpotifySearchRow {
  spotify_id: string;
  type: ItemType;
  name: string;
  artist_name: string | null;
  image_url: string | null;
}

/** Payload aligned with `cached_items` insert/upsert. */
export interface CachedItemPayload {
  spotify_id: string;
  type: ItemType;
  name: string;
  artist_name: string | null;
  image_url: string | null;
  preview_url: string | null;
  genres: string[] | null;
  /** Tracks only: first credited artist’s Spotify id. */
  primary_artist_id?: string | null;
  release_year?: number | null;
}

interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

interface SpotifyArtistRef {
  id: string;
  name: string;
  genres?: string[];
}

interface SpotifyAlbumRef {
  id: string;
  name: string;
  images: SpotifyImage[];
  genres?: string[];
  release_date?: string;
}

interface SpotifyTrackSearch {
  id: string;
  name: string;
  preview_url: string | null;
  artists: SpotifyArtistRef[];
  album: SpotifyAlbumRef;
}

interface SpotifyAlbumSearch {
  id: string;
  name: string;
  artists: SpotifyArtistRef[];
  images: SpotifyImage[];
}

interface SpotifyArtistSearch {
  id: string;
  name: string;
  images: SpotifyImage[];
  genres: string[];
}

interface SpotifySearchResponse {
  tracks?: { items: SpotifyTrackSearch[] };
  albums?: { items: SpotifyAlbumSearch[] };
  artists?: { items: SpotifyArtistSearch[] };
}

function pickImage(images: SpotifyImage[] | undefined): string | null {
  if (!images?.length) return null;
  return images[0]?.url ?? null;
}

function uniqueGenres(genres: string[]): string[] | null {
  const u = [...new Set(genres.filter(Boolean))];
  return u.length ? u : null;
}

function artistNames(artists: SpotifyArtistRef[] | undefined): string | null {
  if (!artists?.length) return null;
  return artists.map((a) => a.name).join(", ");
}

function genresFromArtists(artists: SpotifyArtistRef[]): string[] | null {
  const g = artists.flatMap((a) => a.genres ?? []);
  return uniqueGenres(g);
}

export function mapTrackSearch(t: SpotifyTrackSearch): SpotifySearchRow {
  return {
    spotify_id: t.id,
    type: "track",
    name: t.name,
    artist_name: artistNames(t.artists),
    image_url: pickImage(t.album?.images),
  };
}

export function mapAlbumSearch(a: SpotifyAlbumSearch): SpotifySearchRow {
  return {
    spotify_id: a.id,
    type: "album",
    name: a.name,
    artist_name: artistNames(a.artists),
    image_url: pickImage(a.images),
  };
}

export function mapArtistSearch(a: SpotifyArtistSearch): SpotifySearchRow {
  return {
    spotify_id: a.id,
    type: "artist",
    name: a.name,
    artist_name: null,
    image_url: pickImage(a.images),
  };
}

export async function searchSpotify(
  query: string,
  types: ItemType[],
  limit: number,
): Promise<SpotifySearchRow[]> {
  const token = await getSpotifyToken();
  const typeParam = types.join(",");
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("type", typeParam);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new SpotifyHttpError(
      res.status,
      (await res.text()).slice(0, 200) || "Spotify search failed",
    );
  }

  const json = (await res.json()) as SpotifySearchResponse;
  const rows: SpotifySearchRow[] = [];

  if (types.includes("track")) {
    for (const t of json.tracks?.items ?? []) {
      rows.push(mapTrackSearch(t));
    }
  }
  if (types.includes("album")) {
    for (const a of json.albums?.items ?? []) {
      rows.push(mapAlbumSearch(a));
    }
  }
  if (types.includes("artist")) {
    for (const a of json.artists?.items ?? []) {
      rows.push(mapArtistSearch(a));
    }
  }

  return rows;
}

interface SpotifyTrackFull extends SpotifyTrackSearch {
  genres?: never;
}

interface SpotifyAlbumFull {
  id: string;
  name: string;
  artists: SpotifyArtistRef[];
  images: SpotifyImage[];
  genres: string[];
  release_date?: string;
}

interface SpotifyArtistFull {
  id: string;
  name: string;
  images: SpotifyImage[];
  genres: string[];
}

export type ArtistTopTrack = {
  spotify_id: string;
  name: string;
  artist_name: string | null;
  image_url: string | null;
  album_name: string | null;
};

export type ArtistAlbumRow = {
  spotify_id: string;
  name: string;
  image_url: string | null;
  release_year: number | null;
};

export async function fetchArtistTopTracks(
  artistId: string,
  market = "SE",
): Promise<ArtistTopTrack[]> {
  const token = await getSpotifyToken();
  const url = new URL(
    `${API_BASE}/artists/${encodeURIComponent(artistId)}/top-tracks`,
  );
  url.searchParams.set("market", market);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new SpotifyHttpError(
      res.status,
      (await res.text()).slice(0, 200) || "Artist top tracks failed",
    );
  }
  const json = (await res.json()) as { tracks?: SpotifyTrackSearch[] };
  return (json.tracks ?? []).map((t) => ({
    spotify_id: t.id,
    name: t.name,
    artist_name: artistNames(t.artists),
    image_url: pickImage(t.album?.images),
    album_name: t.album?.name ?? null,
  }));
}

export async function fetchArtistAlbums(
  artistId: string,
  limit = 8,
): Promise<ArtistAlbumRow[]> {
  const token = await getSpotifyToken();
  const url = new URL(
    `${API_BASE}/artists/${encodeURIComponent(artistId)}/albums`,
  );
  url.searchParams.set("include_groups", "album");
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new SpotifyHttpError(
      res.status,
      (await res.text()).slice(0, 200) || "Artist albums failed",
    );
  }
  const json = (await res.json()) as {
    items?: Array<{
      id: string;
      name: string;
      images: SpotifyImage[];
      release_date?: string;
      album_group?: string;
    }>;
  };
  const seen = new Set<string>();
  const rows: ArtistAlbumRow[] = [];
  for (const a of json.items ?? []) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    rows.push({
      spotify_id: a.id,
      name: a.name,
      image_url: pickImage(a.images),
      release_year: releaseYearFromSpotifyDate(a.release_date),
    });
  }
  return rows;
}

export async function fetchSpotifyItem(
  id: string,
  type: ItemType,
): Promise<CachedItemPayload> {
  const token = await getSpotifyToken();
  const segment =
    type === "track" ? "tracks" : type === "album" ? "albums" : "artists";
  const res = await fetch(`${API_BASE}/${segment}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new SpotifyHttpError(
      res.status,
      (await res.text()).slice(0, 200) || `${segment} fetch failed`,
    );
  }

  if (type === "track") {
    const data = (await res.json()) as SpotifyTrackFull;
    return {
      spotify_id: data.id,
      type: "track",
      name: data.name,
      artist_name: artistNames(data.artists),
      image_url: pickImage(data.album?.images),
      preview_url: data.preview_url,
      genres: genresFromArtists(data.artists),
      primary_artist_id: data.artists?.[0]?.id ?? null,
      release_year: releaseYearFromSpotifyDate(data.album?.release_date),
    };
  }

  if (type === "album") {
    const data = (await res.json()) as SpotifyAlbumFull;
    return {
      spotify_id: data.id,
      type: "album",
      name: data.name,
      artist_name: artistNames(data.artists),
      image_url: pickImage(data.images),
      preview_url: null,
      genres: uniqueGenres(data.genres ?? []),
      primary_artist_id: null,
      release_year: releaseYearFromSpotifyDate(data.release_date),
    };
  }

  const data = (await res.json()) as SpotifyArtistFull;
  return {
    spotify_id: data.id,
    type: "artist",
    name: data.name,
    artist_name: null,
    image_url: pickImage(data.images),
    preview_url: null,
    genres: uniqueGenres(data.genres ?? []),
    primary_artist_id: null,
  };
}
