"use client";

import Link from "next/link";
import { ExternalLink, Share2 } from "lucide-react";

/** Host dialog: how to add tracks from Spotify (PWA share, iOS Shortcut, paste). */
export function ShareFromSpotifyPanel({ sessionCode }: { sessionCode?: string }) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://musicator.app";
  const addUrl = `${origin}/live/add?url=`;
  /** Replace with your published iCloud Shortcut URL once created. */
  const shortcutUrl = `https://www.icloud.com/shortcuts/00000000000000000000000000000000`;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-white">
        <Share2 className="size-4 text-wam/90" aria-hidden />
        Add songs from Spotify
      </p>
      <ul className="space-y-2 text-xs text-white/50">
        <li>
          <strong className="font-medium text-white/70">iPhone:</strong> Share any Spotify track
          → <span className="text-wam">WAM</span> to add it here.
        </li>
        <li>
          <strong className="font-medium text-white/70">Android:</strong> Share any Spotify track
          → <span className="text-wam">WAM</span> (install from browser first).
        </li>
        <li>
          <strong className="font-medium text-white/70">iOS Shortcut:</strong>{" "}
          <Link
            href={shortcutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-wam hover:underline"
          >
            Install iOS Shortcut
            <ExternalLink className="size-3" aria-hidden />
          </Link>
          {" "}— opens <code className="text-white/60">{addUrl}[link]</code>
        </li>
        <li>
          <strong className="font-medium text-white/70">Paste link:</strong> In the room, use
          &quot;Paste Spotify link&quot; under Add a song.
        </li>
      </ul>
      {sessionCode ? (
        <p className="mt-3 text-center font-mono text-xs tracking-widest text-wam/80">
          Room {sessionCode}
        </p>
      ) : null}
    </div>
  );
}
