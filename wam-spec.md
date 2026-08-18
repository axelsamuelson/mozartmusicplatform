# WAM – Cursor project spec
> WAM stands for Wolfgang Amadeus Mozart. A personal music rating and tagging app powered by the Spotify API.

---

## Concept
WAM is a personal music diary. Log in with Spotify, search for tracks, albums, and artists, rate them 0–100, and tag them across three dimensions: Genre, Mood, and Moment. Based on ratings and tags, WAM can generate and update Spotify playlists — but only playlists it created itself.

**Core features**
- Log in with Spotify OAuth
- Search tracks, albums, and artists via the Spotify API
- Rate anything 0–100
- Tag items with Genre, Mood, and Moment tags
- Feed of recently rated/tagged items
- Profile page: top-rated items, genre breakdown, mood distribution, monthly activity
- Generate and manage Spotify playlists from any tag combination
- Strict write protection: WAM never modifies playlists it did not create

---

## Tech stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: Supabase (PostgreSQL + Row Level Security)
- **Auth**: Supabase Auth with Spotify as OAuth provider
- **External API**: Spotify Web API
- **Charts**: Recharts
- **Deploy**: Vercel

---

## Environment variables
Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Setup commands

### 1. Create the project
```bash
npx create-next-app@latest wam --typescript --tailwind --app --eslint
cd wam
```

### 2. Initialise shadcn/ui
```bash
npx shadcn@latest init
```
When prompted: choose **Default** style, **Slate** as base color, **yes** to CSS variables.

### 3. Add shadcn components
```bash
npx shadcn@latest add card badge button input slider avatar separator skeleton toast tabs scroll-area dialog dropdown-menu toggle-group
```

### 4. Install additional dependencies
```bash
npm install @supabase/supabase-js @supabase/ssr recharts lucide-react
```

### 5. Install 21st.dev MCP in Cursor
In Cursor → Settings → MCP → Add server, paste:

```json
{
  "mcpServers": {
    "21st-dev": {
      "command": "npx",
      "args": ["-y", "@21st-dev/mcp@latest", "YOUR_API_KEY"]
    }
  }
}
```

Get your API key at [21st.dev](https://21st.dev). Once connected, use `@21st` in Cursor Composer to pull in components.

---

## Cursor rules
Create `.cursorrules` in the project root:

```
You are building WAM (Wolfgang Amadeus Mozart) — a personal music rating and tagging app.
Full spec: wam-spec.md

Stack: Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui, Supabase, Spotify Web API, Recharts.

Rules:
- All components go in /components and follow shadcn/ui conventions
- Use server components by default; add "use client" only when necessary
- All Supabase server calls use lib/supabase/server.ts
- All Supabase client calls use lib/supabase/client.ts
- Spotify data is always cached in cached_items before saving a rating or tag
- Never expose SUPABASE_SERVICE_ROLE_KEY or SPOTIFY_CLIENT_SECRET to the client
- Use Tailwind for all styling — no inline styles, no CSS modules
- Accent color: #1DB954 (Spotify green) — use as Tailwind custom color `wam`
- CRITICAL: Never call the Spotify playlist write API without first verifying the
  playlist_id exists in the wam_playlists table for the current user. This check
  must happen server-side in the API route, never on the client.
```

---

## Tag system

### Genre
Predefined flat list. Users can apply multiple genre tags to one item.

```
Pop, Rock, Hip-Hop, R&B, EDM, House, Techno, Trance, Drum & Bass,
Jazz, Blues, Soul, Funk, Classical, Folk, Country, Metal, Punk,
Indie, Alternative, Reggae, Latin, Afrobeats, Ambient, Lo-fi
```

### Mood (energy scale)
Five fixed levels from low to high energy. Each level has a name, a description, and a color. Users pick **one** mood per rating.

| Level | Name | Description | Color |
|-------|------|-------------|-------|
| 1 | Dreamy | Slow, introspective, sleepy | `#818cf8` (indigo) |
| 2 | Chill | Relaxed, easy-going | `#34d399` (emerald) |
| 3 | Neutral | Balanced, background listening | `#94a3b8` (slate) |
| 4 | Energetic | Upbeat, motivating | `#fb923c` (orange) |
| 5 | Hype | Intense, peak energy | `#f43f5e` (rose) |

### Moment
Three subcategories. Users can apply **multiple** moment tags to one item.

**Place**
```
Home, Gym, Commute, Office, Outdoors, Party, Café, Car
```

**Occasion**
```
Morning, Evening, Late night, Weekend, Weekday
```

**Activity**
```
Working out, Studying, Working, Cooking, Road trip, Date night, Falling asleep, Pregame
```

---

## Project structure

```
wam/
├── .cursorrules
├── wam-spec.md
├── .env.local
├── app/
│   ├── layout.tsx
│   ├── page.tsx                        # Landing — login CTA
│   ├── auth/
│   │   └── callback/route.ts           # Supabase OAuth callback
│   ├── dashboard/
│   │   └── page.tsx                    # Recent ratings feed
│   ├── search/
│   │   └── page.tsx                    # Spotify search
│   ├── item/
│   │   └── [spotifyId]/
│   │       └── page.tsx                # Item detail + rating + tags
│   ├── playlists/
│   │   ├── page.tsx                    # WAM playlist overview
│   │   └── [playlistId]/
│   │       └── page.tsx                # Playlist detail + edit
│   ├── profile/
│   │   └── page.tsx                    # Stats and charts
│   └── api/
│       ├── spotify/
│       │   ├── search/route.ts         # GET ?q=&type=&limit=
│       │   └── item/[id]/route.ts      # GET — fetch and cache item
│       ├── ratings/
│       │   ├── route.ts                # GET, POST
│       │   └── [id]/route.ts           # PATCH, DELETE
│       └── playlists/
│           ├── route.ts                # GET (list WAM playlists), POST (create)
│           └── [playlistId]/
│               ├── route.ts            # GET, DELETE
│               └── sync/route.ts       # POST — sync tracks to Spotify
├── components/
│   ├── ui/                             # shadcn/ui primitives
│   ├── RatingCard.tsx                  # Item card: cover, score, mood chip, tags
│   ├── RatingForm.tsx                  # Score slider + tag pickers + save
│   ├── ScoreSlider.tsx                 # 0–100 slider with live color-coded readout
│   ├── TagPicker.tsx                   # Genre / Mood / Moment selector
│   ├── MoodSelector.tsx                # 5-button energy picker with colors
│   ├── SpotifyItem.tsx                 # Search result row
│   ├── PlaylistCard.tsx                # WAM playlist summary card
│   ├── PlaylistBuilder.tsx             # Tag filter UI → playlist preview
│   ├── ActivityChart.tsx               # Recharts — monthly ratings bar chart
│   └── GenreChart.tsx                  # Recharts — genre breakdown
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # Browser Supabase client
│   │   └── server.ts                   # Server Supabase client (cookies)
│   └── spotify/
│       ├── api.ts                      # Typed Spotify API wrappers
│       ├── token.ts                    # Client credentials token cache
│       └── playlistGuard.ts            # assertWamOwned() — write protection
└── types/
    └── index.ts                        # Shared TypeScript types
```

---

## Database schema

Run this SQL in the Supabase SQL editor:

```sql
-- ─────────────────────────────────────────
-- Profiles
-- ─────────────────────────────────────────
create table profiles (
  id            uuid references auth.users on delete cascade primary key,
  spotify_id    text unique,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- Spotify metadata cache
-- ─────────────────────────────────────────
create table cached_items (
  spotify_id   text primary key,
  type         text not null check (type in ('track', 'album', 'artist')),
  name         text not null,
  artist_name  text,
  image_url    text,
  preview_url  text,
  genres       text[],
  primary_artist_id text,
  cached_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- Ratings (0–100)
-- ─────────────────────────────────────────
create table ratings (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users on delete cascade not null,
  spotify_id   text references cached_items(spotify_id) not null,
  score        integer not null check (score between 0 and 100),
  comment      text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(user_id, spotify_id)
);

-- ─────────────────────────────────────────
-- Tags
-- ─────────────────────────────────────────

-- Genre tags (predefined, flat list)
create table genre_tags (
  id    serial primary key,
  name  text not null unique
);

insert into genre_tags (name) values
  ('Pop'), ('Rock'), ('Hip-Hop'), ('R&B'), ('EDM'), ('House'),
  ('Techno'), ('Trance'), ('Drum & Bass'), ('Jazz'), ('Blues'),
  ('Soul'), ('Funk'), ('Classical'), ('Folk'), ('Country'),
  ('Metal'), ('Punk'), ('Indie'), ('Alternative'), ('Reggae'),
  ('Latin'), ('Afrobeats'), ('Ambient'), ('Lo-fi');

-- Mood tags (fixed 5-level energy scale)
create table mood_tags (
  id          serial primary key,
  level       integer not null unique check (level between 1 and 5),
  name        text not null,
  description text,
  color       text not null
);

insert into mood_tags (level, name, description, color) values
  (1, 'Dreamy',    'Slow, introspective, sleepy',   '#818cf8'),
  (2, 'Chill',     'Relaxed, easy-going',            '#34d399'),
  (3, 'Neutral',   'Balanced, background listening', '#94a3b8'),
  (4, 'Energetic', 'Upbeat, motivating',             '#fb923c'),
  (5, 'Hype',      'Intense, peak energy',           '#f43f5e');

-- Moment subcategories
create type moment_subcategory as enum ('place', 'occasion', 'activity');

create table moment_tags (
  id          serial primary key,
  subcategory moment_subcategory not null,
  name        text not null,
  unique(subcategory, name)
);

insert into moment_tags (subcategory, name) values
  ('place',    'Home'),          ('place',    'Gym'),
  ('place',    'Commute'),       ('place',    'Office'),
  ('place',    'Outdoors'),      ('place',    'Party'),
  ('place',    'Café'),          ('place',    'Car'),
  ('occasion', 'Morning'),       ('occasion', 'Evening'),
  ('occasion', 'Late night'),    ('occasion', 'Weekend'),
  ('occasion', 'Weekday'),
  ('activity', 'Working out'),   ('activity', 'Studying'),
  ('activity', 'Working'),       ('activity', 'Cooking'),
  ('activity', 'Road trip'),     ('activity', 'Date night'),
  ('activity', 'Falling asleep'),('activity', 'Pregame');

-- ─────────────────────────────────────────
-- Rating ↔ tag joins
-- ─────────────────────────────────────────

-- Many-to-many: ratings ↔ genre_tags
create table rating_genres (
  rating_id    uuid references ratings(id) on delete cascade,
  genre_tag_id integer references genre_tags(id) on delete cascade,
  primary key (rating_id, genre_tag_id)
);

-- One-to-one: ratings → mood (one mood per rating)
create table rating_moods (
  rating_id   uuid references ratings(id) on delete cascade primary key,
  mood_tag_id integer references mood_tags(id) on delete cascade not null
);

-- Many-to-many: ratings ↔ moment_tags
create table rating_moments (
  rating_id     uuid references ratings(id) on delete cascade,
  moment_tag_id integer references moment_tags(id) on delete cascade,
  primary key (rating_id, moment_tag_id)
);

-- ─────────────────────────────────────────
-- WAM-owned playlists
-- CRITICAL: Only playlists in this table may ever be written to via Spotify API.
-- ─────────────────────────────────────────
create table wam_playlists (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references auth.users on delete cascade not null,
  spotify_playlist_id text not null unique,
  name                text not null,
  description         text,
  -- Stored filters (used for re-sync)
  filter_genres       text[],
  filter_mood_levels  integer[],
  filter_moments      text[],
  filter_min_score    integer default 0,
  track_count         integer default 0,
  last_synced_at      timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ─────────────────────────────────────────
-- Triggers: auto-update updated_at
-- ─────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger ratings_updated_at
  before update on ratings
  for each row execute function update_updated_at();

create trigger wam_playlists_updated_at
  before update on wam_playlists
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────
alter table profiles        enable row level security;
alter table ratings         enable row level security;
alter table cached_items    enable row level security;
alter table rating_genres   enable row level security;
alter table rating_moods    enable row level security;
alter table rating_moments  enable row level security;
alter table wam_playlists   enable row level security;

create policy "Users manage own profile"
  on profiles for all using (auth.uid() = id);

create policy "Users manage own ratings"
  on ratings for all using (auth.uid() = user_id);

create policy "Users manage own rating_genres"
  on rating_genres for all using (
    exists (select 1 from ratings r where r.id = rating_id and r.user_id = auth.uid())
  );

create policy "Users manage own rating_moods"
  on rating_moods for all using (
    exists (select 1 from ratings r where r.id = rating_id and r.user_id = auth.uid())
  );

create policy "Users manage own rating_moments"
  on rating_moments for all using (
    exists (select 1 from ratings r where r.id = rating_id and r.user_id = auth.uid())
  );

create policy "Anyone can read cached items"
  on cached_items for select using (true);

create policy "Authenticated users can write cached items"
  on cached_items for insert with check (auth.role() = 'authenticated');

create policy "Users manage own WAM playlists"
  on wam_playlists for all using (auth.uid() = user_id);
```

---

## TypeScript types

```typescript
// types/index.ts

export type ItemType = 'track' | 'album' | 'artist';
export type MomentSubcategory = 'place' | 'occasion' | 'activity';

export interface CachedItem {
  spotify_id: string;
  type: ItemType;
  name: string;
  artist_name?: string;
  image_url?: string;
  preview_url?: string;
  genres?: string[];
}

export interface GenreTag { id: number; name: string; }

export interface MoodTag {
  id: number;
  level: 1 | 2 | 3 | 4 | 5;
  name: string;
  description: string;
  color: string;
}

export interface MomentTag {
  id: number;
  subcategory: MomentSubcategory;
  name: string;
}

export interface RatingTags {
  genres: GenreTag[];
  mood: MoodTag | null;
  moments: MomentTag[];
}

export interface Rating {
  id: string;
  user_id: string;
  spotify_id: string;
  score: number;           // 0–100
  comment?: string;
  created_at: string;
  updated_at: string;
  item?: CachedItem;
  tags?: RatingTags;
}

export interface WamPlaylist {
  id: string;
  user_id: string;
  spotify_playlist_id: string;
  name: string;
  description?: string;
  filter_genres?: string[];
  filter_mood_levels?: number[];
  filter_moments?: string[];
  filter_min_score: number;
  track_count: number;
  last_synced_at?: string;
  created_at: string;
}

export interface Profile {
  id: string;
  spotify_id?: string;
  display_name?: string;
  avatar_url?: string;
}

export interface PlaylistFilter {
  genres: string[];
  moodLevels: number[];
  moments: string[];
  minScore: number;
}
```

---

## Spotify setup

### OAuth scopes
Request exactly these scopes — nothing more:

```
user-read-private
user-read-email
playlist-read-private
playlist-modify-public
playlist-modify-private
ugc-image-upload
```

> `playlist-read-private` is used only to avoid naming conflicts when creating playlists.
> WAM never reads or modifies the content of any playlist it did not create.

### Redirect URI
In Spotify Developer Dashboard, add:
```
https://<your-supabase-project>.supabase.co/auth/v1/callback
```

### Client credentials token

```typescript
// lib/spotify/token.ts
let cache: { token: string; expiresAt: number } | null = null;

export async function getSpotifyToken(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt) return cache.token;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });

  const data = await res.json();
  cache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cache.token;
}
```

---

## Playlist safety — critical

WAM must never modify a Spotify playlist it did not create. Enforced in three layers:

### Layer 1 — Database
`wam_playlists` tracks every playlist WAM has created, per user. Row Level Security ensures users can only see their own rows.

### Layer 2 — Server-side guard
```typescript
// lib/spotify/playlistGuard.ts
import { createClient } from '@/lib/supabase/server';

export async function assertWamOwned(
  spotifyPlaylistId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('wam_playlists')
    .select('id')
    .eq('spotify_playlist_id', spotifyPlaylistId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new Error(
      `Playlist ${spotifyPlaylistId} is not owned by WAM for this user. Write blocked.`
    );
  }
}
```

Every API route that writes to Spotify must call `assertWamOwned()` before the Spotify call — no exceptions.

### Layer 3 — Scope limitation
The OAuth token only has `playlist-modify-public` and `playlist-modify-private`. Even if the guard failed, it cannot touch collaborative playlists or playlists owned by other users.

### Playlist sync flow
```
User configures filters in PlaylistBuilder (genres, mood levels, moments, min score)
→ POST /api/playlists             (first time: create playlist on Spotify + register in wam_playlists)
→ POST /api/playlists/[id]/sync  (subsequent: update existing playlist)
   → assertWamOwned() called      ← write guard
   → query Supabase for matching rated tracks
   → PUT tracks to Spotify playlist
   → update wam_playlists.last_synced_at + track_count
```

---

## Pages

### `/` — Landing
- Logo + one-line pitch for WAM
- "Log in with Spotify" button (`#1DB954`)
- Redirect to `/dashboard` if already logged in

### `/dashboard` — Feed
- Quick stats strip: total rated, average score, items this month
- List of recently rated items (RatingCard), newest first
- Each card shows: cover art, name, score badge (0–100), mood chip, genre badges

### `/search` — Search
- Debounced search input (300ms) → `/api/spotify/search`
- Type filter tabs: All / Tracks / Albums / Artists
- If already rated: show existing score inline on the result row

### `/item/[spotifyId]` — Detail + rating
- Cover art, name, artist, type badge
- **ScoreSlider**: 0–100 with large live readout, color shifts with value
- **TagPicker**:
  - Genre: multi-select badge grid
  - Mood: 5-button energy selector, colored per level
  - Moment: three grouped sections (Place / Occasion / Activity), multi-select
- Optional comment textarea
- "Save rating" / "Update rating" / "Delete rating"

### `/playlists` — Overview
- Grid of WAM-created playlists (PlaylistCard)
- Each card: name, track count, active filters summary, last synced timestamp
- "New playlist" button → opens PlaylistBuilder dialog

### `/playlists/[playlistId]` — Detail
- Active filter set: genres, mood levels, moments, min score
- Track list preview from Supabase
- "Sync to Spotify" button → POST `/api/playlists/[id]/sync`
- Edit filters and re-sync
- Delete playlist (removes from Spotify + removes from wam_playlists)

### `/profile` — Stats
- Top 10 tracks / albums by best single-item score; **top artists** = average of each artist’s up to five highest **track** scores (see `topArtistsFromTrackScores` in `aggregateRatings.ts`).
- Genre distribution bar chart
- Mood distribution: 5-bar chart, colored per mood level
- Monthly activity chart (last 12 months)
- "Export ratings as CSV" button

---

## Route protection

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/search', '/item', '/playlists', '/profile'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          ),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && PROTECTED.some(p => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

## UI guidelines
- Dark theme as default; light theme via `dark:` Tailwind classes
- Accent: `#1DB954` (Spotify green) — add to `tailwind.config.ts` as color `wam`
- Score display: 0–100 slider, color-coded (slate <40, green 40–70, orange 70–90, rose 90–100)
- Mood chips: colored dot + label using the exact hex from `mood_tags`
- Genre and Moment tags: small rounded badges
- Skeleton loaders for all async content
- Toast notifications: "Rating saved", "Playlist synced", "Rating deleted"
- Mobile-first: single column below 640px

---

## Build order

1. Supabase project → run schema SQL in full
2. Spotify OAuth via Supabase (login/logout, session handling)
3. Middleware (route protection)
4. Spotify Client Credentials token util + search API route
5. Search page + SpotifyItem component
6. Item detail page + ScoreSlider + TagPicker + rating API routes
7. Dashboard feed + RatingCard component
8. Playlist system: PlaylistBuilder + `/api/playlists` routes + assertWamOwned guard
9. Profile page + charts
10. Polish: skeletons, toasts, empty states, mobile layout
