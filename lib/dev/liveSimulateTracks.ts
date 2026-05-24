export type SimulatedTrack = {
  spotify_track_id: string;
  track_name: string;
  artist_name: string;
  image_url: string | null;
  duration_ms: number;
};

/** Well-known Spotify track IDs for dev playback simulation (no API calls). */
export const SIMULATED_LIVE_TRACKS: SimulatedTrack[] = [
  {
    spotify_track_id: "4cOdK2wGLETKBW3PvgPWqT",
    track_name: "Never Gonna Give You Up",
    artist_name: "Rick Astley",
    image_url: null,
    duration_ms: 213_000,
  },
  {
    spotify_track_id: "0VjIjW4GlUZAMYd2vXMi3b",
    track_name: "Blinding Lights",
    artist_name: "The Weeknd",
    image_url: null,
    duration_ms: 200_000,
  },
  {
    spotify_track_id: "6habFhsOpGty0sjxBCuzo6",
    track_name: "Take On Me",
    artist_name: "a-ha",
    image_url: null,
    duration_ms: 225_000,
  },
  {
    spotify_track_id: "3n3Ppam7vgaVa1iaRUc9Lp",
    track_name: "Mr. Brightside",
    artist_name: "The Killers",
    image_url: null,
    duration_ms: 222_000,
  },
];

export function simulatedTrackByIndex(index: number): SimulatedTrack {
  const list = SIMULATED_LIVE_TRACKS;
  return list[((index % list.length) + list.length) % list.length]!;
}
