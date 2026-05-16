import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedPlaybackPlaylistContext = {
  contextName: string | null;
  contextImageUrl: string | null;
  isWamPlaylist: boolean;
  wamPlaylistId: string | null;
};

/** Resolve playlist context from Supabase only — no Spotify API calls. */
export async function resolvePlaybackPlaylistContext(
  supabase: SupabaseClient,
  userId: string,
  _accessToken: string,
  spotifyPlaylistId: string,
): Promise<ResolvedPlaybackPlaylistContext> {
  const empty: ResolvedPlaybackPlaylistContext = {
    contextName: null,
    contextImageUrl: null,
    isWamPlaylist: false,
    wamPlaylistId: null,
  };

  const { data: wamRow, error: wamError } = await supabase
    .from("wam_playlists")
    .select("id, name")
    .eq("user_id", userId)
    .eq("spotify_playlist_id", spotifyPlaylistId)
    .maybeSingle();

  if (wamError) {
    throw new Error(wamError.message);
  }

  if (wamRow?.name) {
    return {
      contextName: wamRow.name as string,
      contextImageUrl: null,
      isWamPlaylist: true,
      wamPlaylistId: wamRow.id as string,
    };
  }

  const { data: cachedRow, error: cacheError } = await supabase
    .from("playlist_tracks")
    .select("name, image_url")
    .eq("user_id", userId)
    .eq("playlist_id", spotifyPlaylistId)
    .maybeSingle();

  if (cacheError) {
    throw new Error(cacheError.message);
  }

  if (cachedRow) {
    const cachedName =
      typeof cachedRow.name === "string" && cachedRow.name.trim().length > 0
        ? cachedRow.name.trim()
        : null;
    const cachedImage =
      typeof cachedRow.image_url === "string" && cachedRow.image_url.length > 0
        ? cachedRow.image_url
        : null;
    return {
      contextName: cachedName,
      contextImageUrl: cachedImage,
      isWamPlaylist: false,
      wamPlaylistId: null,
    };
  }

  return empty;
}
