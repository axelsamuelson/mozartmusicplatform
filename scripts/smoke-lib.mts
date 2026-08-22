import { SMOKE_BASE_URL, SMOKE_TRACK_ID } from "../lib/smoke/constants";

export { SMOKE_BASE_URL, SMOKE_TRACK_ID };

export type SmokeLoginResult = {
  cookie: string;
  email: string;
  userId: string;
};

export function cookieHeaderFromResponse(res: Response): string {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")!]
        : [];
  return raw.map((c) => c.split(";")[0]?.trim()).filter(Boolean).join("; ");
}

export async function smokeLogin(
  base = SMOKE_BASE_URL,
): Promise<SmokeLoginResult> {
  const loginRes = await fetch(`${base}/api/dev/smoke/login`, { method: "POST" });
  const loginBody = (await loginRes.json().catch(() => ({}))) as {
    ok?: boolean;
    email?: string;
    userId?: string;
    error?: string;
  };
  if (!loginRes.ok || !loginBody.ok || !loginBody.email || !loginBody.userId) {
    throw new Error(
      `Login failed (${loginRes.status}): ${loginBody.error ?? "unknown"}`,
    );
  }
  const cookie = cookieHeaderFromResponse(loginRes);
  if (!cookie) {
    throw new Error("Login succeeded but no session cookies were returned");
  }
  return { cookie, email: loginBody.email, userId: loginBody.userId };
}

export async function smokeFetch(
  path: string,
  cookie: string,
  init?: RequestInit,
  base = SMOKE_BASE_URL,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Cookie", cookie);
  return fetch(`${base}${path}`, { ...init, headers });
}
