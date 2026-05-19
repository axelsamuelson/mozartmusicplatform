import type { MoodTagRow } from "@/lib/types/ratings";

export type JukeboxRankingMode = "points" | "average";
export type QueueMode = "transparent" | "surprise";
export type RankingVisibility = "full" | "masked" | "end_only";
export type LiveSessionSourceType = "playlist" | "top_rated" | "none";

export type LiveSessionRow = {
  id: string;
  code: string;
  host_user_id: string;
  co_host_user_id?: string | null;
  spotify_track_id: string | null;
  track_name: string | null;
  artist_name: string | null;
  image_url: string | null;
  is_active: boolean;
  anonymous_mode?: boolean;
  jukebox_enabled?: boolean;
  jams_enabled?: boolean;
  wam_controls_playback?: boolean;
  jukebox_ranking_mode?: JukeboxRankingMode;
  hide_queue_names?: boolean;
  queue_mode?: QueueMode;
  ranking_visibility?: RankingVisibility;
  duration_minutes?: number | null;
  host_disconnected_at?: string | null;
  host_provider_token?: string | null;
  current_track_started_at?: string | null;
  ended_at?: string | null;
  current_queue_id?: string | null;
  current_track_user_id?: string | null;
  is_playing?: boolean;
  progress_ms?: number;
  duration_ms?: number;
  device_name?: string | null;
  playback_updated_at?: string | null;
  created_at: string;
  expires_at: string;
};

export type LiveRatingRow = {
  id: string;
  session_id: string;
  user_id: string;
  display_name: string | null;
  spotify_track_id?: string | null;
  score: number;
  mood_tag_id: number | null;
  genre_ids: number[];
  comment: string | null;
  submitted_at: string;
  mood?: MoodTagRow | null;
};

export type LiveSessionAggregate = {
  average_score: number | null;
  rated_count: number;
  participant_count: number;
  mood_counts: { mood: MoodTagRow; count: number }[];
};

export type ActiveLiveSessionRef = {
  sessionId: string;
  code: string;
};

export type LivePresenceMember = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  hasRated: boolean;
};

export type LiveQueueRow = {
  id: string;
  session_id: string;
  user_id: string;
  display_name: string | null;
  spotify_track_id: string;
  track_name: string;
  artist_name: string | null;
  image_url: string | null;
  position: number;
  queued_at: string;
  played_at: string | null;
  scores_applied?: boolean;
  is_manual?: boolean;
};

export type LiveSessionSourceRow = {
  session_id: string;
  user_id: string;
  source_type: LiveSessionSourceType;
  spotify_playlist_id: string | null;
  playlist_name: string | null;
  playlist_size: number | null;
  slots: number;
  flagged_as_bad_match: boolean;
  playlist_track_pool?: string[];
  joined_at: string;
  updated_at: string;
};

export type LiveQueueBufferRow = {
  id: string;
  session_id: string;
  user_id: string;
  position: number;
  spotify_track_id: string;
  track_name: string;
  artist_name: string | null;
  image_url: string | null;
  created_at: string;
};

export type LiveSessionRatingRow = {
  id: string;
  session_id: string;
  user_id: string;
  spotify_track_id: string;
  score: number;
  mood_tag_id: number | null;
  is_retroactive: boolean;
  rating_time_ms: number | null;
  submitted_at: string;
};

export type LiveScoreRow = {
  session_id: string;
  user_id: string;
  display_name: string | null;
  points: number;
  avg_score: number | null;
  tracks_played: number;
};
