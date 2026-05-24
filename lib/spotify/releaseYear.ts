/** Parse Spotify release_date (YYYY or YYYY-MM-DD) to calendar year. */
export function releaseYearFromSpotifyDate(
  date: string | null | undefined,
): number | null {
  if (!date || typeof date !== "string") return null;
  const y = Number.parseInt(date.slice(0, 4), 10);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  return y;
}
