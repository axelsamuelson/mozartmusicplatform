import type { MoodTagRow } from "@/lib/types/ratings";

export type JukeboxRankingMode = "points" | "average";

export type LiveSessionRow = {
  id: string;
  code: string;
  host_user_id: string;
  spotify_track_id: string | null;
  track_name: string | null;
  artist_name: string | null;
  image_url: string | null;
  is_active: boolean;
  anonymous_mode?: boolean;
  jukebox_enabled?: boolean;
  jukebox_ranking_mode?: JukeboxRankingMode;
  hide_queue_names?: boolean;
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
};

export type LiveScoreRow = {
  session_id: string;
  user_id: string;
  display_name: string | null;
  points: number;
  avg_score: number | null;
  tracks_played: number;
};
