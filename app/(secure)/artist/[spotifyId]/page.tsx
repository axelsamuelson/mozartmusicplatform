import type { Metadata } from "next";
import { Suspense } from "react";

import { ArtistView } from "./ArtistView";

export const metadata: Metadata = {
  title: "Artist · WAM",
  description: "Your ratings and popular tracks for a Spotify artist",
};

export default function ArtistPage() {
  return (
    <Suspense
      fallback={<p className="px-4 py-12 text-muted-foreground">Loading…</p>}
    >
      <ArtistView />
    </Suspense>
  );
}
