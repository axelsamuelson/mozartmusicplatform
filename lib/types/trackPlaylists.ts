export type TrackPlaylistSource = "wam" | "spotify";

export interface TrackPlaylistHit {
  id: string;
  name: string;
  href: string;
  image_url: string | null;
  source: TrackPlaylistSource;
}

export interface TrackPlaylistsPayload {
  wam: TrackPlaylistHit[];
  spotify: TrackPlaylistHit[];
}
