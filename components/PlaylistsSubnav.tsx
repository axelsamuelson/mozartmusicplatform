"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function PlaylistsSubnav() {
  const pathname = usePathname();
  const isSpotifyLibrary =
    pathname === "/playlists/spotify" || pathname.startsWith("/playlists/spotify/");
  const isWamPlaylists =
    pathname === "/playlists" ||
    (pathname.startsWith("/playlists/") && !pathname.startsWith("/playlists/spotify"));

  return (
    <div className="flex w-full max-w-md flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-white/[0.04] p-1.5 sm:inline-flex sm:max-w-none">
      <Link
        href="/playlists"
        className={cn(
          "flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium transition-all duration-200 sm:flex-none",
          isWamPlaylists
            ? "bg-white/[0.07] text-white"
            : "text-white/70 hover:bg-white/10 hover:text-white",
        )}
      >
        WAM Playlists
      </Link>
      <Link
        href="/playlists/spotify"
        className={cn(
          "flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium transition-all duration-200 sm:flex-none",
          isSpotifyLibrary
            ? "bg-white/[0.07] text-white"
            : "text-white/70 hover:bg-white/10 hover:text-white",
        )}
      >
        Spotify Library
      </Link>
    </div>
  );
}
