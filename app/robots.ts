import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/search",
        "/playlists",
        "/profile",
        "/artist/",
        "/item/",
        "/live/",
        "/audit",
        "/dev/",
        "/auth/",
        "/api/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
