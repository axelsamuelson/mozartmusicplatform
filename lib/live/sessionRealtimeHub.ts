import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { LivePresenceMember, LiveSessionRow } from "@/lib/types/live";

type PresencePayload = {
  display_name?: string;
  avatar_url?: string | null;
  has_rated?: boolean;
};

export type PresenceMeta = {
  displayName: string;
  avatarUrl: string | null;
  hasRated: boolean;
};

/** Partial presence update — omit hasRated to avoid resetting rating status (e.g. host dialog). */
export type PresenceMetaUpdate = {
  displayName?: string;
  avatarUrl?: string | null;
  hasRated?: boolean;
};

function mergePresenceMeta(
  existing: PresenceMeta | undefined,
  incoming: PresenceMetaUpdate,
  fallbackDisplayName: string,
): PresenceMeta {
  const base =
    existing ??
    ({
      displayName: incoming.displayName ?? fallbackDisplayName,
      avatarUrl: incoming.avatarUrl ?? null,
      hasRated: incoming.hasRated ?? false,
    } satisfies PresenceMeta);

  return {
    displayName: incoming.displayName ?? base.displayName,
    avatarUrl:
      incoming.avatarUrl !== undefined ? incoming.avatarUrl : base.avatarUrl,
    hasRated:
      incoming.hasRated !== undefined ? incoming.hasRated : base.hasRated,
  };
}

type HubEntry = {
  channel: RealtimeChannel;
  participants: LivePresenceMember[];
  listeners: Set<(members: LivePresenceMember[]) => void>;
  ratingsListeners: Set<() => void>;
  queueListeners: Set<() => void>;
  scoresListeners: Set<() => void>;
  bufferListeners: Set<() => void>;
  sessionListeners: Set<(session: LiveSessionRow) => void>;
  sessionEndedListeners: Set<() => void>;
  refCount: number;
  presenceMeta: PresenceMeta;
};

const hubs = new Map<string, HubEntry>();

function channelTopic(sessionId: string): string {
  return `live-session:${sessionId}`;
}

function parsePresenceState(
  state: Record<string, PresencePayload[]>,
): LivePresenceMember[] {
  const members: LivePresenceMember[] = [];

  for (const [userId, entries] of Object.entries(state)) {
    const latest = entries[entries.length - 1];
    if (!latest) continue;
    members.push({
      userId,
      displayName: latest.display_name ?? "User",
      avatarUrl: latest.avatar_url ?? null,
      hasRated: Boolean(latest.has_rated),
    });
  }

  return members.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function notifyParticipants(entry: HubEntry): void {
  for (const listener of entry.listeners) {
    listener(entry.participants);
  }
}

function notifySession(entry: HubEntry, session: LiveSessionRow): void {
  for (const listener of entry.sessionListeners) {
    listener(session);
  }
}

function notifySessionEnded(entry: HubEntry): void {
  for (const listener of entry.sessionEndedListeners) {
    listener();
  }
}

function syncPresence(entry: HubEntry): void {
  entry.participants = parsePresenceState(
    entry.channel.presenceState<PresencePayload>(),
  );
  notifyParticipants(entry);
}

async function trackPresence(entry: HubEntry): Promise<void> {
  const { displayName, avatarUrl, hasRated } = entry.presenceMeta;
  await entry.channel.track({
    display_name: displayName,
    avatar_url: avatarUrl,
    has_rated: hasRated,
  });
  syncPresence(entry);
}

function removeHub(supabase: SupabaseClient, sessionId: string): void {
  const entry = hubs.get(sessionId);
  if (!entry) return;
  void supabase.removeChannel(entry.channel);
  hubs.delete(sessionId);
}

function attachHub(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  meta: PresenceMetaUpdate,
  callbacks?: {
    onRatingsChange?: () => void;
    onQueueChange?: () => void;
    onScoresChange?: () => void;
    onBufferChange?: () => void;
    onSessionUpdate?: (session: LiveSessionRow) => void;
    onSessionEnded?: () => void;
  },
): HubEntry {
  const existing = hubs.get(sessionId);
  if (existing) {
    existing.refCount += 1;
    existing.presenceMeta = mergePresenceMeta(
      existing.presenceMeta,
      meta,
      meta.displayName ?? existing.presenceMeta.displayName,
    );
    if (callbacks?.onRatingsChange) {
      existing.ratingsListeners.add(callbacks.onRatingsChange);
    }
    if (callbacks?.onQueueChange) {
      existing.queueListeners.add(callbacks.onQueueChange);
    }
    if (callbacks?.onScoresChange) {
      existing.scoresListeners.add(callbacks.onScoresChange);
    }
    if (callbacks?.onBufferChange) {
      existing.bufferListeners.add(callbacks.onBufferChange);
    }
    if (callbacks?.onSessionUpdate) {
      existing.sessionListeners.add(callbacks.onSessionUpdate);
    }
    if (callbacks?.onSessionEnded) {
      existing.sessionEndedListeners.add(callbacks.onSessionEnded);
    }
    if (existing.channel.state === "joined") {
      void trackPresence(existing);
    }
    return existing;
  }

  const channel = supabase.channel(channelTopic(sessionId), {
    config: { presence: { key: userId } },
  });

  const entry: HubEntry = {
    channel,
    participants: [],
    listeners: new Set(),
    ratingsListeners: new Set(),
    queueListeners: new Set(),
    scoresListeners: new Set(),
    bufferListeners: new Set(),
    sessionListeners: new Set(),
    sessionEndedListeners: new Set(),
    refCount: 1,
    presenceMeta: mergePresenceMeta(
      undefined,
      meta,
      meta.displayName ?? "User",
    ),
  };
  if (callbacks?.onRatingsChange) {
    entry.ratingsListeners.add(callbacks.onRatingsChange);
  }
  if (callbacks?.onQueueChange) {
    entry.queueListeners.add(callbacks.onQueueChange);
  }
  if (callbacks?.onScoresChange) {
    entry.scoresListeners.add(callbacks.onScoresChange);
  }
  if (callbacks?.onBufferChange) {
    entry.bufferListeners.add(callbacks.onBufferChange);
  }
  if (callbacks?.onSessionUpdate) {
    entry.sessionListeners.add(callbacks.onSessionUpdate);
  }
  if (callbacks?.onSessionEnded) {
    entry.sessionEndedListeners.add(callbacks.onSessionEnded);
  }

  channel
    .on("presence", { event: "sync" }, () => syncPresence(entry))
    .on("presence", { event: "join" }, () => syncPresence(entry))
    .on("presence", { event: "leave" }, () => syncPresence(entry))
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "live_ratings",
        filter: `session_id=eq.${sessionId}`,
      },
      () => {
        for (const cb of entry.ratingsListeners) cb();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "live_queue",
        filter: `session_id=eq.${sessionId}`,
      },
      () => {
        for (const cb of entry.queueListeners) cb();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "live_scores",
        filter: `session_id=eq.${sessionId}`,
      },
      () => {
        for (const cb of entry.scoresListeners) cb();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "live_queue_buffer",
        filter: `session_id=eq.${sessionId}`,
      },
      () => {
        for (const cb of entry.bufferListeners) cb();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "live_sessions",
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        const row = payload.new as LiveSessionRow | undefined;
        if (!row?.id) return;

        if (row.ended_at || !row.is_active) {
          notifySessionEnded(entry);
          return;
        }

        notifySession(entry, row);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void trackPresence(entry);
      }
    });

  hubs.set(sessionId, entry);
  return entry;
}

export type LiveSessionRealtimeSubscription = {
  release: () => void;
  updatePresence: (meta: PresenceMetaUpdate) => void;
};

export function subscribeLiveSessionRealtime(options: {
  sessionId: string;
  userId: string;
  meta: PresenceMetaUpdate;
  onParticipants: (members: LivePresenceMember[]) => void;
  onConnected?: (connected: boolean) => void;
  onRatingsChange?: () => void;
  onQueueChange?: () => void;
  onScoresChange?: () => void;
  onBufferChange?: () => void;
  onSessionUpdate?: (session: LiveSessionRow) => void;
  onSessionEnded?: () => void;
}): LiveSessionRealtimeSubscription {
  const supabase = createClient();
  const entry = attachHub(supabase, options.sessionId, options.userId, options.meta, {
    onRatingsChange: options.onRatingsChange,
    onQueueChange: options.onQueueChange,
    onScoresChange: options.onScoresChange,
    onBufferChange: options.onBufferChange,
    onSessionUpdate: options.onSessionUpdate,
    onSessionEnded: options.onSessionEnded,
  });

  entry.listeners.add(options.onParticipants);
  options.onParticipants(entry.participants);
  options.onConnected?.(entry.channel.state === "joined");

  return {
    updatePresence: (meta) => {
      entry.presenceMeta = mergePresenceMeta(
        entry.presenceMeta,
        meta,
        entry.presenceMeta.displayName,
      );
      if (entry.channel.state === "joined") {
        void trackPresence(entry);
      }
    },
    release: () => {
      entry.listeners.delete(options.onParticipants);
      if (options.onRatingsChange) {
        entry.ratingsListeners.delete(options.onRatingsChange);
      }
      if (options.onQueueChange) {
        entry.queueListeners.delete(options.onQueueChange);
      }
      if (options.onScoresChange) {
        entry.scoresListeners.delete(options.onScoresChange);
      }
      if (options.onBufferChange) {
        entry.bufferListeners.delete(options.onBufferChange);
      }
      if (options.onSessionUpdate) {
        entry.sessionListeners.delete(options.onSessionUpdate);
      }
      if (options.onSessionEnded) {
        entry.sessionEndedListeners.delete(options.onSessionEnded);
      }
      entry.refCount -= 1;
      if (entry.refCount <= 0) {
        removeHub(supabase, options.sessionId);
      }
    },
  };
}
