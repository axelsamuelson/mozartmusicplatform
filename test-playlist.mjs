/**
 * Diagnose POST /api/playlists locally.
 *
 * Add to .env.local (copy from browser after Spotify login):
 *   TEST_SUPABASE_ACCESS_TOKEN=...
 *   TEST_SUPABASE_REFRESH_TOKEN=...
 *   TEST_SPOTIFY_PROVIDER_TOKEN=...      (optional but needed for playlist create)
 *   TEST_SPOTIFY_PROVIDER_REFRESH_TOKEN=...
 *
 * Or paste full session JSON:
 *   TEST_SUPABASE_SESSION_JSON={"access_token":"...", ...}
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

globalThis.WebSocket = WebSocket;

function loadEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnvFile(".env.local");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

/** @type {{ name: string; value: string; options?: object }[]} */
const collectedCookies = [];

const supabase = createServerClient(url, anonKey, {
  cookies: {
    getAll() {
      return collectedCookies.map(({ name, value }) => ({ name, value }));
    },
    setAll(cookies) {
      for (const c of cookies) {
        const i = collectedCookies.findIndex((x) => x.name === c.name);
        if (i >= 0) collectedCookies[i] = c;
        else collectedCookies.push(c);
      }
    },
  },
});

async function establishSession() {
  if (env.TEST_SUPABASE_COOKIE) {
    console.log("Using TEST_SUPABASE_COOKIE from .env.local (raw Cookie header)");
    return;
  }

  if (env.TEST_SUPABASE_SESSION_JSON) {
    const session = JSON.parse(env.TEST_SUPABASE_SESSION_JSON);
    const { error } = await supabase.auth.setSession(session);
    if (error) throw new Error(`setSession from JSON failed: ${error.message}`);
    return;
  }

  const access = env.TEST_SUPABASE_ACCESS_TOKEN;
  const refresh = env.TEST_SUPABASE_REFRESH_TOKEN;
  if (!access || !refresh) {
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      console.log("No TEST_* tokens — trying admin createSession via service role…");
      const admin = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: usersData, error: listErr } =
        await admin.auth.admin.listUsers({ perPage: 1 });
      if (listErr) throw new Error(`admin listUsers: ${listErr.message}`);
      const userId = usersData.users[0]?.id;
      if (!userId) throw new Error("No users in Supabase project");
      const { data: sessData, error: sessErr } =
        await admin.auth.admin.createSession({ user_id: userId });
      if (sessErr) throw new Error(`admin createSession: ${sessErr.message}`);
      const { error } = await supabase.auth.setSession({
        access_token: sessData.session.access_token,
        refresh_token: sessData.session.refresh_token,
      });
      if (error) throw new Error(`setSession after admin: ${error.message}`);
      console.log(
        "Admin session created for user",
        userId,
        "(no Spotify provider_token expected)",
      );
      return;
    }

    throw new Error(
      "Add one of to .env.local:\n" +
        "  TEST_SUPABASE_COOKIE=<paste Cookie header from browser after login>\n" +
        "  TEST_SUPABASE_ACCESS_TOKEN + TEST_SUPABASE_REFRESH_TOKEN (+ TEST_SPOTIFY_PROVIDER_TOKEN)\n" +
        "  TEST_SUPABASE_SESSION_JSON=<full session object>\n" +
        "Or ensure SUPABASE_SERVICE_ROLE_KEY is set for admin fallback (no Spotify token).",
    );
  }

  const { error } = await supabase.auth.setSession({
    access_token: access,
    refresh_token: refresh,
    provider_token: env.TEST_SPOTIFY_PROVIDER_TOKEN ?? undefined,
    provider_refresh_token: env.TEST_SPOTIFY_PROVIDER_REFRESH_TOKEN ?? undefined,
  });
  if (error) throw new Error(`setSession failed: ${error.message}`);
}

console.log("=== test-playlist.mjs ===");
console.log("Supabase URL ref:", url.replace(/^https:\/\/([^.]+).*/, "$1"));
console.log("Env flags:", {
  SPOTIFY_CLIENT_ID: Boolean(env.SPOTIFY_CLIENT_ID),
  SPOTIFY_CLIENT_SECRET: Boolean(env.SPOTIFY_CLIENT_SECRET),
  SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  TEST_SUPABASE_ACCESS_TOKEN: Boolean(env.TEST_SUPABASE_ACCESS_TOKEN),
  TEST_SPOTIFY_PROVIDER_TOKEN: Boolean(env.TEST_SPOTIFY_PROVIDER_TOKEN),
});

await establishSession();

let cookieHeader = env.TEST_SUPABASE_COOKIE ?? "";

if (!env.TEST_SUPABASE_COOKIE) {
  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();

  if (sessionErr) {
    console.error("getSession error:", sessionErr.message);
    process.exit(1);
  }

  console.log("Session:", {
    hasSession: Boolean(session),
    userId: session?.user?.id ?? null,
    hasProviderToken: Boolean(session?.provider_token),
    hasProviderRefresh: Boolean(session?.provider_refresh_token),
    expiresAt: session?.expires_at ?? null,
  });

  cookieHeader = collectedCookies
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");
}

console.log("Cookie names sent:", collectedCookies.map((c) => c.name).join(", ") || "(none)");

const payload = {
  name: "Test playlist",
  filter_genres: [],
  filter_vibes: ["high_energy"],
  filter_moments: [],
  filter_min_score: 0,
};

console.log("\nPOST http://localhost:3000/api/playlists");
console.log("Payload:", JSON.stringify(payload));

const res = await fetch("http://localhost:3000/api/playlists", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: cookieHeader,
  },
  body: JSON.stringify(payload),
});

console.log("\n--- Response ---");
console.log("Status:", res.status, res.statusText);
console.log("Headers:", Object.fromEntries(res.headers.entries()));
const text = await res.text();
console.log("Body:", text);

try {
  console.log("Body (parsed):", JSON.parse(text));
} catch {
  /* raw text only */
}
