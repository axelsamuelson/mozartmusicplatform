/** Fired after a rating is saved or deleted so listeners (e.g. dashboard) can refresh. */
export const WAM_RATINGS_MUTATED = "wam-ratings-mutated";

export function dispatchRatingsMutated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WAM_RATINGS_MUTATED));
}
