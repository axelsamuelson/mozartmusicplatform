import type { Metadata } from "next";
import Link from "next/link";

import { LegalPageLayout } from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — Musicator (WAM)",
  description: "Privacy Policy for Musicator (WAM) at musicator.app",
};

const meta = (
  <>
    Last updated: May 16, 2026 | Contact: Axel Samuelson —{" "}
    <a
      href="mailto:ave.samuelson@gmail.com"
      className="text-white/80 underline-offset-2 hover:text-white hover:underline"
    >
      ave.samuelson@gmail.com
    </a>
  </>
);

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy — Musicator (WAM)"
      meta={meta}
      sections={[
        {
          title: "Overview",
          paragraphs: [
            "Musicator (WAM) is a personal music rating and tagging application at musicator.app, operated by Axel Samuelson for internal use by a small group of invited users.",
          ],
        },
        {
          title: "Data We Collect",
          paragraphs: [
            <>
              <strong className="text-white/90">From Spotify:</strong> Spotify user
              ID, display name, profile picture, email, access token. We do not
              store your Spotify password.
            </>,
            <>
              <strong className="text-white/90">Data you create:</strong> ratings
              (0–100), tags (Genre/Mood/Moment), comments, WAM-created playlist
              IDs.
            </>,
            <>
              <strong className="text-white/90">Cached metadata:</strong> track/album/artist
              names, IDs, cover images from Spotify API.
            </>,
          ],
        },
        {
          title: "How We Use Your Data",
          paragraphs: [
            "Only to provide the WAM service. We do not sell data, use it for ads, or share it with third parties. We never access playlists not created by WAM.",
          ],
        },
        {
          title: "Spotify API Usage",
          paragraphs: [
            <>
              WAM uses Spotify Web API and Web Playback SDK. Users must comply
              with Spotify&apos;s{" "}
              <a
                href="https://www.spotify.com/legal/end-user-agreement/"
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="https://www.spotify.com/legal/privacy-policy/"
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
              .
            </>,
            <>
              Scopes used: user-read-private, user-read-email, playlist-read-private,
              playlist-modify-public, playlist-modify-private, streaming,
              user-read-playback-state, user-modify-playback-state,
              user-read-currently-playing.
            </>,
            "WAM will never modify playlists it did not create.",
          ],
        },
        {
          title: "Data Storage",
          paragraphs: [
            "Stored in Supabase (PostgreSQL) with Row Level Security. Hosted on Vercel. Each user can only access their own data.",
          ],
        },
        {
          title: "Data Retention",
          paragraphs: [
            <>
              Data kept until account deletion. Request deletion at{" "}
              <a
                href="mailto:ave.samuelson@gmail.com"
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
              >
                ave.samuelson@gmail.com
              </a>
              . Deleted within 30 days of request.
            </>,
          ],
        },
        {
          title: "Cookies",
          paragraphs: [
            "Used only for authentication/session management. No tracking or ad cookies.",
          ],
        },
        {
          title: "Your Rights",
          paragraphs: [
            <>
              Access, correct, or delete your data. Revoke Spotify access at{" "}
              <a
                href="https://www.spotify.com/account/apps"
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                spotify.com/account/apps
              </a>
              . Contact{" "}
              <a
                href="mailto:ave.samuelson@gmail.com"
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
              >
                ave.samuelson@gmail.com
              </a>
              .
            </>,
          ],
        },
        {
          title: "Changes",
          paragraphs: [
            "Last updated date changes when policy updates. Continued use = acceptance.",
          ],
        },
        {
          title: "Contact",
          paragraphs: [
            <>
              Axel Samuelson,{" "}
              <a
                href="mailto:ave.samuelson@gmail.com"
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
              >
                ave.samuelson@gmail.com
              </a>
              ,{" "}
              <Link
                href="/"
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
              >
                musicator.app
              </Link>
            </>,
          ],
        },
      ]}
    />
  );
}
