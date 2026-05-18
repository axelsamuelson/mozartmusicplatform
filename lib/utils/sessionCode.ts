const CODE_LENGTH = 4;
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Random 4-character join code (excludes ambiguous 0/O/1/I). */
export function generateSessionCode(): string {
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARSET[bytes[i]! % CHARSET.length];
  }
  return code;
}

/** Uppercase alphanumeric only (strips hyphens/spaces). */
export function normalizeSessionCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Display helper — e.g. ABCD-EF for longer codes. */
export function formatSessionCode(code: string): string {
  const n = normalizeSessionCode(code);
  if (n.length <= 4) return n;
  return `${n.slice(0, 4)}-${n.slice(4)}`;
}
