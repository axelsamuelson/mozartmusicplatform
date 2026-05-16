"use client";

import { useEffect, useState } from "react";

const AUTH_COOLDOWN_KEY = "wam_auth_cooldown_until_ms";
const AUTH_COOLDOWN_MS = 5 * 60 * 1000;

type AuthErrorAlertProps = {
  authFailed?: boolean;
  reason?: string | null;
};

function parseHashAuthError(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const code = params.get("error_code") ?? params.get("error");
  const desc = params.get("error_description");
  if (!code && !desc) return null;
  const parts = [
    desc ? decodeURIComponent(desc.replace(/\+/g, " ")) : null,
    code ? `(${code})` : null,
  ].filter(Boolean);
  return parts.join(" ") || null;
}

export function getAuthCooldownRemainingMs(): number {
  if (typeof window === "undefined") return 0;
  const raw = sessionStorage.getItem(AUTH_COOLDOWN_KEY);
  if (!raw) return 0;
  const until = Number.parseInt(raw, 10);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - Date.now());
}

export function startAuthCooldown(ms = AUTH_COOLDOWN_MS): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(AUTH_COOLDOWN_KEY, String(Date.now() + ms));
}

export function AuthErrorAlert({ authFailed, reason }: AuthErrorAlertProps) {
  const [hashDetail, setHashDetail] = useState<string | null>(null);

  useEffect(() => {
    const fromHash = parseHashAuthError();
    if (fromHash) setHashDetail(fromHash);
    if (fromHash || window.location.hash.includes("error")) {
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);

  useEffect(() => {
    if (authFailed || hashDetail) {
      startAuthCooldown();
    }
  }, [authFailed, hashDetail]);

  const detail = hashDetail ?? reason ?? null;
  const show = authFailed || Boolean(detail);
  if (!show) return null;

  const isProfileError =
    detail?.toLowerCase().includes("profile") ||
    detail?.toLowerCase().includes("external provider");

  return (
    <div
      role="alert"
      className="mx-auto mb-8 max-w-lg rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-4 text-left text-sm text-amber-50"
    >
      <p className="font-semibold text-amber-100">Inloggningen misslyckades</p>
      {isProfileError ? (
        <>
          <p className="mt-2 text-sm text-amber-100/95">
            Spotify svarade <strong>429 Too many requests</strong> när Supabase
            hämtade din profil. Det är en tillfällig rate limit — inte fel e-post,
            SQL eller User Management.
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1.5 text-xs text-amber-100/85">
            <li>
              <strong>Vänta 15–60 minuter</strong> utan att klicka “Log in” igen
              (varje försök förlänger blockeringen).
            </li>
            <li>
              Stäng flikar med WAM som pollar Spotify (spellist-synk, uppspelning).
            </li>
            <li>
              Försök sedan igen i inkognito med kontot{" "}
              <code className="rounded bg-black/30 px-1">axelrib@hotmail.com</code>.
            </li>
          </ul>
        </>
      ) : (
        <>
          {detail ? (
            <p className="mt-2 text-xs text-amber-100/90">{detail}</p>
          ) : null}
          <p className="mt-2 text-xs text-amber-100/85">
            Vänta några minuter och försök igen.
          </p>
        </>
      )}
    </div>
  );
}
