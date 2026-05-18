"use client";

import { useEffect, useState } from "react";

import { signInWithSpotifyClient } from "@/lib/auth/signInWithSpotifyClient";
import { getAuthCooldownRemainingMs } from "@/components/AuthErrorAlert";
import { Button } from "@/components/ui/button";

function formatWait(ms: number): string {
  const sec = Math.ceil(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

export function SpotifyLoginButton() {
  const [cooldownMs, setCooldownMs] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tick = () => setCooldownMs(getAuthCooldownRemainingMs());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const blocked = cooldownMs > 0;

  async function handleLogin() {
    if (blocked || loading) return;
    setLoading(true);
    try {
      await signInWithSpotifyClient();
    } catch (e) {
      console.error("[SpotifyLoginButton]", e);
      window.location.assign("/?error=auth");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size="lg"
      disabled={blocked || loading}
      onClick={() => void handleLogin()}
      className="group relative cursor-pointer overflow-hidden rounded-full border-0 bg-white px-8 py-4 text-lg font-medium text-black shadow-lg transition-all duration-300 hover:scale-105 hover:bg-gray-50 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
    >
      {loading
        ? "Redirecting to Spotify…"
        : blocked
          ? `Wait ${formatWait(cooldownMs)} (Spotify rate limit)`
          : "Log in with Spotify"}
      {!blocked && !loading ? (
        <svg
          className="ml-2 inline-block size-5 transition-transform group-hover:translate-x-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      ) : null}
    </Button>
  );
}
