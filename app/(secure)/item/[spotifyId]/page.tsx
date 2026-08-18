import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ItemView } from "./ItemView";

/** Track/album detail and rating form. Artists redirect to `/artist/[id]`. */

export const metadata: Metadata = {
  title: "Item · WAM",
  description: "Rate and tag a Spotify item",
};

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ spotifyId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { spotifyId } = await params;
  const { type } = await searchParams;
  if (type === "artist" && spotifyId) {
    redirect(`/artist/${spotifyId}`);
  }

  return (
    <Suspense
      fallback={<p className="px-4 py-12 text-muted-foreground">Loading…</p>}
    >
      <ItemView />
    </Suspense>
  );
}
