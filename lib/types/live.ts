import type { MoodTagRow } from "@/lib/types/ratings";

export type LiveSessionRow = {
  id: string;
  code: string;
  host_user_id: string;
  spotify_track_id: string | null;
  track_name: string | null;
  artist_name: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  expires_at: string;
};

export type LiveRatingRow = {
  id: string;
  session_id: string;
  user_id: string;
  display_name: string | null;
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
