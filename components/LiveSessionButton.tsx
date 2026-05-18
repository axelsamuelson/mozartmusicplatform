"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Copy, Radio, X } from "lucide-react";
import { toast } from "sonner";

import { LiveParticipants } from "@/components/LiveParticipants";
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
import { liveAvatarUrl, liveDisplayName } from "@/lib/live/userDisplay";
import { createClient } from "@/lib/supabase/client";
import type { ActiveLiveSessionRef, LiveSessionRow } from "@/lib/types/live";
import { formatSessionCode } from "@/lib/utils/sessionCode";
import { cn } from "@/lib/utils";

export type LiveSessionButtonProps = {
  canStart: boolean;
  className?: string;
};

export function LiveSessionButton({ canStart, className }: LiveSessionButtonProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("User");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveLiveSessionRef | null>(null);
  const [session, setSession] = useState<LiveSessionRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setUserId(u.id);
      setDisplayName(liveDisplayName(u));
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

  const { participants } = useLiveSessionChannel({
    sessionId: active?.sessionId ?? null,
    userId,
    displayName,
    avatarUrl,
    hasRated: false,
    enabled: dialogOpen && Boolean(active?.sessionId),
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
        <DialogContent className="max-w-md border-white/10 bg-black/90 text-white backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Radio className="size-4 text-wam" aria-hidden />
                Live session
              </DialogTitle>
              <DialogDescription className="text-white/50">
                Share the code so others can rate the same track in real time.
              </DialogDescription>
            </div>
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
            <>
              <p className="text-center font-mono text-4xl font-bold tracking-[0.35em] text-wam">
                {formattedCode}
              </p>
              <p className="text-center text-xs text-white/40">
                Share link:{" "}
                <Link href={`/live/${code}`} className="text-wam hover:underline">
                  {typeof window !== "undefined"
                    ? `${window.location.host}/live/${code}`
                    : `/live/${code}`}
                </Link>
              </p>
              {session?.track_name ? (
                <p className="text-center text-sm text-white/60">
                  {session.track_name}
                  {session.artist_name ? ` · ${session.artist_name}` : ""}
                </p>
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
                <LiveParticipants participants={participants} size="sm" />
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
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
