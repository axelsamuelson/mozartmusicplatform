import { renderPlaylistCoverJpeg } from "@/lib/playlist/coverImage";
import { uploadSpotifyPlaylistCover } from "@/lib/spotify/userPlaylistSpotify";

/** Best-effort: generate the pink/blue cover and set it on the Spotify playlist. */
export async function tryUploadGeneratedPlaylistCover(
  accessToken: string,
  spotifyPlaylistId: string,
  name: string,
): Promise<void> {
  try {
    const jpeg = await renderPlaylistCoverJpeg(name);
    await uploadSpotifyPlaylistCover(accessToken, spotifyPlaylistId, jpeg);
  } catch (e) {
    console.warn("[playlist-cover] upload failed", {
      spotifyPlaylistId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
