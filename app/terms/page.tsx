import type { Metadata } from "next";
import Link from "next/link";

import { LegalPageLayout } from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Terms of Service — Musicator (WAM)",
  description: "Terms of Service for Musicator (WAM) at musicator.app",
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

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms of Service — Musicator (WAM)"
      meta={meta}
      sections={[
        {
          title: "Acceptance",
          paragraphs: ["By using musicator.app you agree to these terms."],
        },
        {
          title: "Description",
          paragraphs: [
            "WAM is a personal music rating app for invited internal users. Connects to Spotify for ratings, tags, and playlist generation.",
          ],
        },
        {
          title: "Eligibility",
          paragraphs: [
            "Requires valid Spotify account and invitation from Axel Samuelson.",
          ],
        },
        {
          title: "Spotify Dependency",
          paragraphs: [
            <>
              Must comply with Spotify&apos;s{" "}
              <a
                href="https://www.spotify.com/legal/end-user-agreement/"
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms of Service
              </a>
              . Spotify Premium required for in-browser playback. Spotify API
              availability is outside our control.
            </>,
          ],
        },
        {
          title: "Acceptable Use",
          paragraphs: [
            "Do not: access other users' data, reverse engineer WAM, use for unlawful purposes, circumvent security measures.",
          ],
        },
        {
          title: "Playlist Management",
          paragraphs: [
            <>
              WAM only creates/modifies playlists it has created. Never touches
              external playlists. Revoke access at{" "}
              <a
                href="https://www.spotify.com/account/apps"
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                spotify.com/account/apps
              </a>
              .
            </>,
          ],
        },
        {
          title: "Privacy",
          paragraphs: [
            <>
              Governed by Privacy Policy at{" "}
              <Link
                href="/privacy"
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
              >
                musicator.app/privacy
              </Link>
              .
            </>,
          ],
        },
        {
          title: "Intellectual Property",
          paragraphs: [
            "WAM content owned by Axel Samuelson. Music content owned by Spotify and respective rights holders.",
          ],
        },
        {
          title: "Disclaimer",
          paragraphs: [
            'Service provided "as is". No guarantee of uptime or error-free operation.',
          ],
        },
        {
          title: "Limitation of Liability",
          paragraphs: [
            "Axel Samuelson not liable for indirect or consequential damages.",
          ],
        },
        {
          title: "Changes",
          paragraphs: ["Terms may update. Continued use = acceptance."],
        },
        {
          title: "Governing Law",
          paragraphs: ["Swedish law. Disputes in Swedish courts."],
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
