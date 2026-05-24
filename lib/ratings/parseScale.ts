/** Parse optional 1–10 scale from API body; null clears, undefined = omit. */
export function parseOptionalScale1to10(
  value: unknown,
  field: string,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error(`${field} must be an integer between 1 and 10`);
  }
  return value;
}
