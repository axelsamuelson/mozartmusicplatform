import type { User } from "@supabase/supabase-js";

export function liveDisplayName(user: User): string {
  const m = user.user_metadata ?? {};
  const fromMeta =
    (typeof m.full_name === "string" && m.full_name) ||
    (typeof m.name === "string" && m.name) ||
    (typeof m.display_name === "string" && m.display_name);
  if (fromMeta) return fromMeta;
  if (user.email) return user.email.split("@")[0] ?? "User";
  return "User";
}

export function liveAvatarUrl(user: User): string | null {
  const m = user.user_metadata ?? {};
  if (typeof m.avatar_url === "string" && m.avatar_url) return m.avatar_url;
  if (typeof m.picture === "string" && m.picture) return m.picture;
  return null;
}

export function liveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}
