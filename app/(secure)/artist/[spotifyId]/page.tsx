import type { Metadata } from "next";
import { Suspense } from "react";

import { ArtistView } from "./ArtistView";
import { PageLoadingFallback } from "@/components/LoadingMark";

export const metadata: Metadata = {
  title: "Artist · WAM",
  description: "Your ratings and popular tracks for a Spotify artist",
};

export default function ArtistPage() {
  return (
    <Suspense
      fallback={<PageLoadingFallback />}
    >
      <ArtistView />
    </Suspense>
  );
}
