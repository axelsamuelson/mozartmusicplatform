# Test WAM sessions (dev)

Local development includes a one-click test flow — no env flag, no Spotify, no manual seeding.

## Start (one click)

1. Run `npm run dev`
2. Click **Test WAM** in the player bar (or open **`/dev/live`** → **Start test session**)

You land in a live room with:

- Simulated playback (first preset track)
- **4 test participants** (Alex, Bea, Cruz, Dana)
- **4 sample ratings** on the current track

## While testing

| Action | Where |
|--------|--------|
| **Next track** | Live page (host) — also seeds ratings for the new track |
| **Play / Pause** | Live page (host) |
| Real Spotify session | **Live** button (only when a track is playing) — hidden in dev in favor of Test WAM |

## Requirements

- `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (creates test auth users on first run)

Test logins (optional, for real guest forms): `wam-test-*@musicator.dev` / `wam-dev-test-12!`

## APIs (advanced)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/dev/live/quick-start` | **Recommended** — users + session + ratings |
| `PATCH` | `/api/dev/live/{id}/playback` | Next track / play state |
| `POST` | `/api/dev/live/test-users` | Ensure auth users only |
| `POST` | `/api/dev/live/{id}/seed` | Ratings only |

Production: set `NEXT_PUBLIC_LIVE_SIMULATE=true` or use `DEV_LIVE_SECRET` header.

Pair with **`/audit`** for debugging snapshots.
