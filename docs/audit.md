# WAM audit diagnostics

Internal tooling for playback and live-session debugging.

## UI

Open **`/audit`** while logged in (development only by default).

- **Signals** — human-readable issues (circuit open, poll skipped, SDK errors, etc.)
- **Copy JSON for AI** — full structured report for Cursor or other agents

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/audit` | Server + in-process client bridge snapshot |
| `POST` | `/api/audit` | Body: `{ client?, activeLiveSession? }` — merged report |

### Access

- **Development:** always allowed when authenticated.
- **Production:** set `AUDIT_SECRET` in env and send header `x-audit-secret: <value>`.

## Workflow with Cursor

1. Reproduce the playback or live issue in the app.
2. Open `/audit` (or call `POST /api/audit` with cookies).
3. Click **Copy JSON for AI** and paste into chat: “Here is the WAM audit snapshot; diagnose playback/live issues.”

## What is included

**Server:** Spotify circuit breaker, credentials check, env flags, live session row from DB (when `activeLiveSession` is sent from client).

**Client (from Player):** SDK ready, token, poll leader, skip API poll, host sync, current track, live session ref, circuit header hint.

No secrets or OAuth tokens are included.
