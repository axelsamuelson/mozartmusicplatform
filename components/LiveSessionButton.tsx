"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Copy, EyeOff, ListMusic, Radio, X } from "lucide-react";
import { toast } from "sonner";

import { LiveNowPlaying } from "@/components/LiveNowPlaying";
import { LiveParticipants } from "@/components/LiveParticipants";
import { ShareFromSpotifyPanel } from "@/components/live/ShareFromSpotifyPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clearActiveLiveSession,
  getActiveLiveSession,
  setActiveLiveSession,
} from "@/lib/live/activeSessionStorage";
import { useLiveSessionChannel } from "@/lib/live/useLiveSessionChannel";
import { useLiveSessionDisplayName } from "@/lib/live/useLiveSessionDisplayName";
import { liveAvatarUrl } from "@/lib/live/userDisplay";
import { createClient } from "@/lib/supabase/client";
import { normalizeJukeboxRankingMode } from "@/lib/live/jukeboxRanking";
import type { ActiveLiveSessionRef, JukeboxRankingMode, LiveSessionRow } from "@/lib/types/live";
import { formatSessionCode } from "@/lib/utils/sessionCode";
import { cn } from "@/lib/utils";

export type LiveSessionButtonProps = {
  canStart: boolean;
  className?: string;
};

function AnonymousModeToggle({
  enabled,
  disabled,
  onChange,
}: {
  enabled: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        enabled ? "bg-wam" : "bg-white/20",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
          enabled && "translate-x-5",
        )}
      />
    </button>
  );
}

export function LiveSessionButton({ canStart, className }: LiveSessionButtonProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveLiveSessionRef | null>(null);
  const [session, setSession] = useState<LiveSessionRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [updatingAnonymous, setUpdatingAnonymous] = useState(false);
  const [updatingJukebox, setUpdatingJukebox] = useState(false);
  const [updatingRankingMode, setUpdatingRankingMode] = useState(false);
  const [updatingHideQueueNames, setUpdatingHideQueueNames] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setUserId(u.id);
      setAvatarUrl(liveAvatarUrl(u));
    });
  }, []);

  const refreshActive = useCallback(async () => {
    const ref = getActiveLiveSession();
    if (!ref) {
      setActive(null);
      setSession(null);
      return;
    }
    try {
      const res = await fetch(`/api/live/${ref.sessionId}`);
      if (!res.ok) {
        clearActiveLiveSession();
        setActive(null);
        setSession(null);
        return;
      }
      const body = (await res.json()) as { session?: LiveSessionRow };
      if (!body.session?.is_active) {
        clearActiveLiveSession();
        setActive(null);
        setSession(null);
        return;
      }
      setActive(ref);
      setSession(body.session);
    } catch {
      setActive(ref);
    }
  }, []);

  useEffect(() => {
    const ref = getActiveLiveSession();
    if (ref) setActive(ref);
    void refreshActive();
  }, [refreshActive]);

  const {
    displayName,
    isAnonymous,
    loading: displayNameLoading,
  } = useLiveSessionDisplayName(
    active?.sessionId ?? null,
    Boolean(session?.anonymous_mode),
  );

  const { participants } = useLiveSessionChannel({
    sessionId: active?.sessionId ?? null,
    userId,
    displayName,
    avatarUrl: isAnonymous ? null : avatarUrl,
    hasRated: false,
    enabled: dialogOpen && Boolean(active?.sessionId) && !displayNameLoading,
    onSessionUpdate: (next) => {
      setSession((prev) => (prev ? { ...prev, ...next } : next));
    },
  });

  async function handleStart() {
    if (!canStart) {
      toast.error("Play a track on Spotify before starting a live session.");
      return;
    }
    setStarting(true);
    try {
      const res = await fetch("/api/live", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        sessionId?: string;
        code?: string;
        session?: LiveSessionRow;
      };
      if (!res.ok) throw new Error(body.error || "Could not start session");
      const sessionId = body.sessionId ?? body.session?.id;
      const code = body.code ?? body.session?.code;
      if (!sessionId || !code) throw new Error("Invalid session response");
      const ref = { sessionId, code };
      setActiveLiveSession(ref);
      setActive(ref);
      setSession(body.session ?? null);
      setDialogOpen(true);
      toast.success("Live session started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start session");
    } finally {
      setStarting(false);
    }
  }

  async function handleJukeboxModeChange(next: boolean) {
    if (!active?.sessionId || !session) return;
    setUpdatingJukebox(true);
    try {
      const res = await fetch(`/api/live/${active.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jukebox_enabled: next }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        session?: LiveSessionRow;
      };
      if (!res.ok) throw new Error(body.error || "Could not update session");
      if (body.session) setSession(body.session);
      toast.success(next ? "Jukebox mode on" : "Jukebox mode off");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update session");
    } finally {
      setUpdatingJukebox(false);
    }
  }

  async function handleHideQueueNamesChange(next: boolean) {
    if (!active?.sessionId || !session) return;
    setUpdatingHideQueueNames(true);
    try {
      const res = await fetch(`/api/live/${active.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hide_queue_names: next }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        session?: LiveSessionRow;
      };
      if (!res.ok) throw new Error(body.error || "Could not update session");
      if (body.session) setSession(body.session);
      toast.success(next ? "Queue names hidden" : "Queue names visible");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update session");
    } finally {
      setUpdatingHideQueueNames(false);
    }
  }

  async function handleRankingModeChange(mode: JukeboxRankingMode) {
    if (!active?.sessionId || !session) return;
    if (normalizeJukeboxRankingMode(session.jukebox_ranking_mode) === mode) return;
    setUpdatingRankingMode(true);
    try {
      const res = await fetch(`/api/live/${active.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jukebox_ranking_mode: mode }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        session?: LiveSessionRow;
      };
      if (!res.ok) throw new Error(body.error || "Could not update ranking");
      if (body.session) setSession(body.session);
      toast.success(mode === "average" ? "Ranking: Average" : "Ranking: Points");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update ranking");
    } finally {
      setUpdatingRankingMode(false);
    }
  }

  async function handleNextTrack() {
    if (!active?.sessionId) return;
    setAdvancing(true);
    try {
      const res = await fetch(`/api/live/${active.sessionId}/queue/next`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        session?: LiveSessionRow;
      };
      if (!res.ok) throw new Error(body.error || "Could not advance queue");
      if (body.session) setSession(body.session);
      toast.success(body.session?.spotify_track_id ? "Next track" : "Queue finished");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not advance queue");
    } finally {
      setAdvancing(false);
    }
  }

  async function handleAnonymousModeChange(next: boolean) {
    if (!active?.sessionId || !session) return;
    setUpdatingAnonymous(true);
    try {
      const res = await fetch(`/api/live/${active.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymous_mode: next }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        session?: LiveSessionRow;
      };
      if (!res.ok) throw new Error(body.error || "Could not update session");
      if (body.session) setSession(body.session);
      toast.success(next ? "Anonymous mode on" : "Anonymous mode off");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update session");
    } finally {
      setUpdatingAnonymous(false);
    }
  }

  async function handleEnd() {
    if (!active) return;
    setEnding(true);
    try {
      const res = await fetch(`/api/live/${active.sessionId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Could not end session");
      }
      clearActiveLiveSession();
      setActive(null);
      setSession(null);
      setDialogOpen(false);
      toast.success("Live session ended");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not end session");
    } finally {
      setEnding(false);
    }
  }

  function copyLink() {
    if (!active) return;
    const url = `${window.location.origin}/live/${active.code}`;
    void navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied"),
      () => toast.error("Could not copy link"),
    );
  }

  const code = active?.code ?? session?.code;
  const formattedCode = code ? formatSessionCode(code) : "";

  return (
    <>
      {active && code ? (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className={cn(
            "shrink-0 rounded-full border border-wam/40 bg-wam/10 px-3 py-1 font-mono text-xs font-semibold tracking-widest text-wam transition-colors hover:bg-wam/20",
            className,
          )}
          aria-label={`Live session ${formattedCode}`}
        >
          {formattedCode}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={starting || !canStart}
          className={cn(
            "shrink-0 rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/60 transition-colors hover:border-wam hover:text-wam disabled:opacity-40",
            className,
          )}
          title={canStart ? "Start a live rating session" : "Play a track first"}
        >
          {starting ? "…" : "Live"}
        </button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[min(90dvh,720px)] max-w-md flex-col gap-0 overflow-hidden border-white/10 bg-black/90 p-0 text-white backdrop-blur-xl sm:max-w-md"
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-white/10 px-4 py-4">
            <HeaderText />
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          {code ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
              <p className="text-center font-mono text-4xl font-bold tracking-[0.35em] text-wam">
                {formattedCode}
              </p>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-white">
                      <ListMusic className="size-4 shrink-0 text-wam/90" aria-hidden />
                      Jukebox mode
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      Everyone queues — ranking decides priority.
                    </p>
                  </div>
                  <AnonymousModeToggle
                    enabled={Boolean(session?.jukebox_enabled)}
                    disabled={updatingJukebox}
                    onChange={(next) => void handleJukeboxModeChange(next)}
                  />
                </div>
              </div>

              {session?.jukebox_enabled ? (
                <JukeboxRankingModePicker
                  value={normalizeJukeboxRankingMode(session.jukebox_ranking_mode)}
                  disabled={updatingRankingMode}
                  onChange={(mode) => void handleRankingModeChange(mode)}
                />
              ) : null}

              {session?.jukebox_enabled ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">Hide queue names</p>
                      <p className="mt-1 text-xs text-white/45">
                        Do not show who queued each song in the list.
                      </p>
                    </div>
                    <AnonymousModeToggle
                      enabled={Boolean(session.hide_queue_names)}
                      disabled={updatingHideQueueNames}
                      onChange={(next) => void handleHideQueueNamesChange(next)}
                    />
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-white">
                      <EyeOff className="size-4 shrink-0 text-wam/90" aria-hidden />
                      Anonymous mode
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      Random names for everyone in the room. Turn on before sharing
                      the link.
                    </p>
                    {session?.anonymous_mode && !displayNameLoading ? (
                      <p className="mt-2 text-xs text-wam/90">
                        You appear as {displayName}
                      </p>
                    ) : null}
                  </div>
                  <AnonymousModeToggle
                    enabled={Boolean(session?.anonymous_mode)}
                    disabled={updatingAnonymous}
                    onChange={(next) => void handleAnonymousModeChange(next)}
                  />
                </div>
              </div>

              <p className="text-center text-xs text-white/40">
                Share link:{" "}
                <Link href={`/live/${code}`} className="text-wam hover:underline">
                  {typeof window !== "undefined"
                    ? `${window.location.host}/live/${code}`
                    : `/live/${code}`}
                </Link>
              </p>
              {session ? (
                <LiveNowPlaying session={session} className="!p-4" />
              ) : null}

              {session?.jukebox_enabled ? (
                <>
                  <ShareFromSpotifyPanel sessionCode={formattedCode} />
                  <Button
                    type="button"
                    disabled={advancing}
                    onClick={() => void handleNextTrack()}
                    className="w-full rounded-full bg-wam py-6 text-base font-semibold text-black hover:bg-wam/90"
                  >
                    {advancing ? "Loading…" : "Next track"}
                  </Button>
                </>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10"
                  onClick={copyLink}
                >
                  <Copy className="mr-2 size-4" />
                  Copy link
                </Button>
                <Button
                  type="button"
                  asChild
                  className="flex-1 bg-wam text-black hover:bg-wam/90"
                >
                  <Link href={`/live/${code}`}>Open room</Link>
                </Button>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="mb-3 text-center text-xs uppercase tracking-wider text-white/40">
                  Online now
                </p>
                <LiveParticipants
                  participants={participants}
                  size="sm"
                  hideAvatars={Boolean(session?.anonymous_mode)}
                />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full border-red-400/30 text-red-300 hover:bg-red-500/10"
                disabled={ending}
                onClick={() => void handleEnd()}
              >
                {ending ? "Ending…" : "End session"}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function JukeboxRankingModePicker({
  value,
  disabled,
  onChange,
}: {
  value: JukeboxRankingMode;
  disabled?: boolean;
  onChange: (mode: JukeboxRankingMode) => void;
}) {
  const options: { id: JukeboxRankingMode; title: string; description: string }[] = [
    {
      id: "points",
      title: "Points",
      description: "Accumulated score per song rating",
    },
    {
      id: "average",
      title: "Average",
      description: "Mean rating across your queued songs",
    },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/40">
        Ranking system
      </p>
      <div className="space-y-2" role="radiogroup" aria-label="Ranking system">
        {options.map((opt) => (
          <label
            key={opt.id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
              value === opt.id
                ? "border-wam/50 bg-wam/10"
                : "border-white/10 bg-white/[0.02] hover:bg-white/5",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name="jukebox-ranking-mode"
              value={opt.id}
              checked={value === opt.id}
              disabled={disabled}
              onChange={() => onChange(opt.id)}
              className="mt-0.5 accent-wam"
            />
            <span>
              <span className="block text-sm font-medium text-white">{opt.title}</span>
              <span className="block text-xs text-white/45">{opt.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function HeaderText() {
  return (
    <div>
      <DialogTitle className="flex items-center gap-2 text-lg">
        <Radio className="size-4 text-wam" aria-hidden />
        Live session
      </DialogTitle>
      <DialogDescription className="text-white/50">
        Share the code so others can rate the same track in real time.
      </DialogDescription>
    </div>
  );
}
