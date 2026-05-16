import { createClient } from "@/lib/supabase/server";

export async function assertWamOwned(
  spotifyPlaylistId: string,
  userId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wam_playlists")
    .select("id")
    .eq("spotify_playlist_id", spotifyPlaylistId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("NOT_WAM_OWNED");
  }
}
