import type { Metadata } from "next";
import { Suspense } from "react";

import { ItemView } from "./ItemView";

/** Track detail, rating form, and “now playing” pulse live in `ItemView`. */

export const metadata: Metadata = {
  title: "Item · WAM",
  description: "Rate and tag a Spotify item",
};

export default function ItemPage() {
  return (
    <Suspense
      fallback={<p className="px-4 py-12 text-muted-foreground">Loading…</p>}
    >
      <ItemView />
    </Suspense>
  );
}
