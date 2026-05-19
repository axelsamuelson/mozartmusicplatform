-- Anonymous mode for live sessions — random display names per participant.
-- Run after live-sessions.sql (and playback-sync if applicable).

alter table live_sessions
  add column if not exists anonymous_mode boolean not null default false;

create table if not exists live_session_aliases (
  session_id uuid references live_sessions (id) on delete cascade not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  alias text not null,
  created_at timestamptz default now(),
  primary key (session_id, user_id)
);

create unique index if not exists live_session_aliases_session_alias_uidx
  on live_session_aliases (session_id, alias);

alter table live_session_aliases enable row level security;

drop policy if exists "Read aliases for active sessions" on live_session_aliases;
create policy "Read aliases for active sessions"
  on live_session_aliases for select
  to authenticated
  using (
    exists (
      select 1 from live_sessions ls
      where ls.id = session_id
        and ls.is_active = true
        and ls.expires_at > now()
    )
  );

drop policy if exists "Users insert own alias" on live_session_aliases;
create policy "Users insert own alias"
  on live_session_aliases for insert
  to authenticated
  with check (auth.uid() = user_id);
