import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

import {
  generateAnonymousAlias,
  generateAnonymousAliasWithSuffix,
} from "@/lib/live/anonymousNames";
import { liveDisplayName } from "@/lib/live/userDisplay";
import type { LiveSessionRow } from "@/lib/types/live";

const MAX_ALIAS_ATTEMPTS = 24;

export type ResolvedLiveDisplay = {
  displayName: string;
  isAnonymous: boolean;
};

export function displayNameFromUser(user: User): string {
  return liveDisplayName(user);
}

async function aliasTaken(
  supabase: SupabaseClient,
  sessionId: string,
  alias: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("live_session_aliases")
    .select("user_id")
    .eq("session_id", sessionId)
    .eq("alias", alias)
    .maybeSingle();
  return Boolean(data);
}

async function allocateUniqueAlias(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<string> {
  for (let i = 0; i < MAX_ALIAS_ATTEMPTS; i++) {
    const alias = i < MAX_ALIAS_ATTEMPTS - 1
      ? generateAnonymousAlias()
      : generateAnonymousAliasWithSuffix();
    if (!(await aliasTaken(supabase, sessionId, alias))) {
      return alias;
    }
  }
  return generateAnonymousAliasWithSuffix();
}

/** Real name, or a stable random alias when the session has anonymous mode on. */
export async function resolveLiveDisplayName(
  supabase: SupabaseClient,
  session: LiveSessionRow,
  user: User,
): Promise<ResolvedLiveDisplay> {
  if (!session.anonymous_mode) {
    return {
      displayName: displayNameFromUser(user),
      isAnonymous: false,
    };
  }

  const { data: existing } = await supabase
    .from("live_session_aliases")
    .select("alias")
    .eq("session_id", session.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.alias) {
    return { displayName: existing.alias as string, isAnonymous: true };
  }

  const alias = await allocateUniqueAlias(supabase, session.id);

  const { error } = await supabase.from("live_session_aliases").insert({
    session_id: session.id,
    user_id: user.id,
    alias,
  });

  if (error) {
    const { data: raced } = await supabase
      .from("live_session_aliases")
      .select("alias")
      .eq("session_id", session.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (raced?.alias) {
      return { displayName: raced.alias as string, isAnonymous: true };
    }
    throw new Error(error.message);
  }

  return { displayName: alias, isAnonymous: true };
}
