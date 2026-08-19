export type TrackPlaylistSource = "wam" | "spotify";

export interface TrackRank {
  position: number;
  total: number;
}

export interface TrackPlaylistHit {
  id: string;
  name: string;
  href: string;
  spotify_url: string | null;
  image_url: string | null;
  source: TrackPlaylistSource;
  rank: TrackRank | null;
}

export interface TrackPlaylistsPayload {
  platform: TrackRank | null;
  wam: TrackPlaylistHit[];
  spotify: TrackPlaylistHit[];
}

export interface RankedPlaylistTrack {
  spotify_id: string;
  name: string;
  artist_name: string | null;
  image_url: string | null;
  score: number;
  rank: TrackRank;
  tempo: number | null;
  intensity: number | null;
}

export interface PlaylistRankingPayload {
  playlist: {
    id: string;
    name: string;
    image_url: string | null;
    source: TrackPlaylistSource;
    spotify_url: string | null;
    edit_href: string | null;
    total_tracks: number;
  };
  tracks: RankedPlaylistTrack[];
}
