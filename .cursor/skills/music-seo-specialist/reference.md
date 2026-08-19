# Music SEO reference

Read this from the music-seo-specialist skill when implementing schema, mapping intent, or deciding what WAM can realistically rank for.

## Search intent map (music)

| Intent | Example queries | Who wins today | WAM fit |
|---|---|---|---|
| Play / stream | `play {track}`, `{artist} spotify` | Spotify, Apple, YouTube | Poor — do not target |
| Lyrics | `{track} lyrics` | Genius, Google lyrics | Poor — do not target |
| Identity | `{artist}`, `{artist} band` | Wikipedia, Google Knowledge Graph | Medium — only with a public artist page + unique data |
| Discography | `{artist} albums`, `{artist} songs` | Wikipedia, AllMusic, Spotify | Medium if WAM lists + ratings |
| Evaluation | `{album} review`, `{artist} best songs` | Pitchfork, Reddit, YouTube | **Strong** — ratings, ranked lists |
| Taste / mood | `playlist for {mood}`, `songs like {artist}` | Spotify, YouTube | **Strong** if playlists are public |
| Credits | `{track} producer`, `who sampled {track}` | Genius, Discogs, WhoSampled | Weak unless WAM stores credits |
| Live / tickets | `{artist} tour`, `{artist} concert` | Ticketmaster, Songkick | Out of scope |
| Commerce | `{album} vinyl`, `{artist} merch` | Stores | Out of scope |

Query modifiers that match WAM: `best`, `ranked`, `rating`, `top tracks`, `similar`, `tagged`, `for work` / mood words.

Query modifiers to avoid: `lyrics`, `download`, `mp3`, `flac`, `free`, `youtube`, `spotify link` (unless the page is a documented Spotify deep-link helper).

## How music SERPs work

- **Knowledge Graph panels** (artist) are dominated by Wikipedia + official profiles + listen-on links. WAM will not replace these; it can appear as a supporting result if entity pages are public and distinctive.
- **Listen / song carousels** go to DSPs. Do not chase.
- **Reviews and lists** still rank independent sites when the page has a clear entity, original scores, and crawlable HTML (not client-only).
- **Same recording, many titles.** Treat ISRC (track) and UPC/EAN (release) as identity keys when present. Spotify IDs are fine internally; they are not a web-wide identity.
- **Featuring and versions** are separate user intents (`Radio Edit` vs `Album Version` vs `Live`). Keep them in titles when they exist in the source metadata.

## Schema.org (only populated fields)

Use `@context: https://schema.org`. Omit empty keys. Do not output `AggregateRating` without a real `ratingValue` and `ratingCount`.

### Track

```json
{
  "@context": "https://schema.org",
  "@type": "MusicRecording",
  "name": "Track title",
  "byArtist": { "@type": "MusicGroup", "name": "Artist" },
  "inAlbum": { "@type": "MusicAlbum", "name": "Album" },
  "duration": "PT3M26S",
  "isrcCode": "USUM71234567",
  "image": "https://example.com/cover.jpg",
  "url": "https://example.com/item/spotifyId",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 82,
    "bestRating": 100,
    "worstRating": 0,
    "ratingCount": 12
  }
}
```

### Album

```json
{
  "@context": "https://schema.org",
  "@type": "MusicAlbum",
  "name": "Album title",
  "byArtist": { "@type": "MusicGroup", "name": "Artist" },
  "albumReleaseType": "AlbumRelease",
  "numTracks": 12,
  "datePublished": "2024-03-01",
  "image": "https://example.com/cover.jpg",
  "url": "https://example.com/item/spotifyId"
}
```

`albumReleaseType` when known: `AlbumRelease`, `SingleRelease`, `EPRelease`, `BroadcastRelease`.

### Artist

```json
{
  "@context": "https://schema.org",
  "@type": "MusicGroup",
  "name": "Artist name",
  "url": "https://example.com/artist/spotifyId",
  "image": "https://example.com/artist.jpg",
  "genre": ["Electronic", "Pop"]
}
```

Solo performers may be `"@type": "Person"`. Prefer `MusicGroup` when the Spotify type is artist and you do not know.

### Ranked playlist

```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Playlist name",
  "itemListOrder": "https://schema.org/ItemListOrderDescending",
  "numberOfItems": 25,
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "MusicRecording",
        "name": "Track",
        "byArtist": { "@type": "MusicGroup", "name": "Artist" }
      }
    }
  ]
}
```

### WAM as product (landing)

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "WAM",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Web",
  "description": "Rate and queue music with your team.",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
}
```

Only include `offers` if the product is actually free at that URL.

## Title and description patterns

Keep titles roughly 50–60 characters when possible; do not truncate mid-entity-name.

| Page | Title | Description seed |
|---|---|---|
| Landing | `WAM — Rate music with your team` | Rate tracks and artists, tag your library, build ranked playlists, listen together via Spotify. |
| Artist | `{Artist} ratings, tags, and top tracks \| WAM` | See how WAM listeners score {Artist}, browse tagged tracks, and open the catalog in Spotify. |
| Track | `{Track} by {Artist} — rating & tags \| WAM` | Community rating, tags, and album context for {Track}. |
| Album | `{Album} by {Artist} — album rating \| WAM` | Album score, track-level ratings, and tags. |
| Playlist | `{Name} — ranked playlist \| WAM` | A ranked playlist of {n} tracks {angle}. |

Social title (`openGraph.title`) can match the HTML title. OG description may be slightly longer.

## Indexation matrix for this codebase

| Route | Suggested robots | Sitemap |
|---|---|---|
| `/` | index, follow | yes |
| `/privacy`, `/terms` | index, follow | yes |
| `app/(secure)/*` | noindex, nofollow while auth-gated | no |
| Live `/live/*` | noindex unless a durable public recap exists | no |

If artist/track pages become public:

- One canonical URL per Spotify ID + type (`/artist/id`, `/item/id` with a stable type, not query-string `?type=artist` as the canonical).
- `generateMetadata` must await params and fetch the entity; never ship `"Artist · WAM"` on a public URL.
- Render the entity name in server HTML (`h1`), not only after a client fetch.

## IDs and duplicate content

- **Spotify ID** = WAM URL key.
- **ISRC** = recording identity across DSPs (tracks).
- **UPC/EAN** = specific commercial release (albums).
- Same song, different IDs (deluxe, regional, remaster): separate pages or a canonical to the primary recording if WAM treats them as one rated item.
- Playlist pages that are just "user's liked songs" should stay noindex.

## Artwork and social

- Prefer the largest Spotify image for `openGraph.images`.
- Set `width` / `height` when known (Spotify typically 640×640).
- Alt text: `{Track} cover` / `{Artist} photo` — no keyword lists.
- Do not claim `og:type` `music.song` unless the page is public and the object is complete; `website` / `article` is safer for rating pages.

## International and names

- Keep original Unicode artist names (`Björk`, `Sigur Rós`). Do not ASCII-fold in titles.
- If the UI is Swedish, metadata is Swedish (`betyg`, `låtar`, `spellista`) and `html lang="sv"`.
- Transliteration belongs in body copy or `alternateName` in JSON-LD, not as a stuffed title prefix.

## Measurement (when asked)

- Search Console: coverage, query pages, enhancements for structured data.
- Useful queries: branded `wam`, `{artist} rating`, `{album} ranked`.
- Ignore vanity metrics on noindex routes.
- Core Web Vitals still matter on the landing page; player chrome must not block LCP of the hero.
