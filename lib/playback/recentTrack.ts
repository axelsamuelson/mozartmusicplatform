export type RecentTrack = {
  spotifyId: string;
  name: string;
  artistName: string;
  artistId: string | null;
  imageUrl: string | null;
  playedAt: string;
  score: number | null;
};
