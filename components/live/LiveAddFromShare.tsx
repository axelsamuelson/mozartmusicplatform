"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Music2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getActiveLiveSession } from "@/lib/live/activeSessionStorage";
import { consumePendingShareReturnPath, savePendingShareReturnPath } from "@/lib/live/sharePending";
import { createClient } from "@/lib/supabase/client";
import { formatSessionCode, normalizeSessionCode } from "@/lib/utils/sessionCode";
import { glassCard, pageHeading, pageSub } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

type ResolvedTrack = {
  trackId: string;
  trackName: string;
  artistName: string | null;
  imageUrl: string | null;
};

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "login" }
  | { kind: "no_track" }
  | { kind: "join"; track: ResolvedTrack }
  | { kind: "success"; track: ResolvedTrack; sessionCode: string };

function buildReturnPath(params: URLSearchParams): string {
  const q = params.toString();
  return q ? `/live/add?${q}` : "/live/add";
}

export function LiveAddFromShare() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionCodeInput, setSessionCodeInput] = useState("");
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);

  const shareQuery = useCallback(() => {
    const url = searchParams.get("url");
    const title = searchParams.get("title");
    const text = searchParams.get("text");
    const parts = new URLSearchParams();
    if (url) parts.set("url", url);
    if (title) parts.set("title", title);
    if (text) parts.set("text", text);
    return parts;
  }, [searchParams]);

  const resolveTrack = useCallback(async (): Promise<ResolvedTrack | null> => {
    const parts = shareQuery();
    const res = await fetch(`/api/spotify/resolve-track?${parts.toString()}`);
    const body = (await res.json().catch(() => ({}))) as ResolvedTrack & {
      error?: string;
    };
    if (!res.ok) throw new Error(body.error || "Could not resolve Spotify link");
    return body;
  }, [shareQuery]);

  const addToQueue = useCallback(
    async (sessionId: string, track: ResolvedTrack) => {
      const res = await fetch(`/api/live/${sessionId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotify_track_id: track.trackId,
          track_name: track.trackName,
          artist_name: track.artistName,
          image_url: track.imageUrl,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Could not add to queue");
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const pending = consumePendingShareReturnPath();
      if (pending && !searchParams.get("url") && !searchParams.get("text")) {
        router.replace(pending);
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const returnPath = buildReturnPath(searchParams);
        savePendingShareReturnPath(returnPath);
        if (!cancelled) setState({ kind: "login" });
        return;
      }

      try {
        const track = await resolveTrack();
        if (!track?.trackId) {
          if (!cancelled) setState({ kind: "no_track" });
          return;
        }

        const active = getActiveLiveSession();
        if (active) {
          await addToQueue(active.sessionId, track);
          if (!cancelled) {
            setState({
              kind: "success",
              track,
              sessionCode: formatSessionCode(active.code),
            });
          }
          return;
        }

        if (!cancelled) setState({ kind: "join", track });
      } catch (e) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Something went wrong",
          });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [addToQueue, resolveTrack, router, searchParams]);

  async function handleJoinAndAdd() {
    const code = normalizeSessionCode(sessionCodeInput);
    if (!state || state.kind !== "join") return;
    setSubmitting(true);
    try {
      const sessRes = await fetch(`/api/live?code=${encodeURIComponent(code)}`);
      const sessBody = (await sessRes.json().catch(() => ({}))) as {
        error?: string;
        session?: { id: string; jukebox_enabled?: boolean; jams_enabled?: boolean };
      };
      if (!sessRes.ok) throw new Error(sessBody.error || "Session not found");
      if (!sessBody.session?.jukebox_enabled && !sessBody.session?.jams_enabled) {
        throw new Error("That session does not have queue mode enabled");
      }

      await addToQueue(sessBody.session.id, state.track);
      setState({
        kind: "success",
        track: state.track,
        sessionCode: formatSessionCode(code),
      });
      toast.success("Added to queue");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not join session");
    } finally {
      setSubmitting(false);
    }
  }

  function goToLogin() {
    const returnPath = buildReturnPath(searchParams);
    savePendingShareReturnPath(returnPath);
    router.push(`/?next=${encodeURIComponent(returnPath)}`);
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-32 pt-24 md:pt-28">
      <header className="mb-6 text-center">
        <h1 className={pageHeading}>Add to WAM</h1>
        <p className={pageSub}>From Spotify share</p>
      </header>

      {state.kind === "loading" ? (
        <section className={cn(glassCard, "flex flex-col items-center py-12")}>
          <Loader2 className="size-10 animate-spin text-wam" aria-hidden />
          <p className="mt-4 text-sm text-white/50">Resolving track…</p>
        </section>
      ) : null}

      {state.kind === "login" ? (
        <section className={cn(glassCard, "space-y-4 text-center")}>
          <Music2 className="mx-auto size-10 text-wam" aria-hidden />
          <p className="text-sm text-white/60">Log in to add this track to a live session.</p>
          <Button
            type="button"
            className="w-full bg-wam text-black hover:bg-wam/90"
            onClick={goToLogin}
          >
            Log in with Spotify
          </Button>
        </section>
      ) : null}

      {state.kind === "no_track" ? (
        <section className={cn(glassCard, "text-center")}>
          <p className="text-sm text-white/60">
            No Spotify track found in the shared link. Try sharing a song (not a playlist or
            album).
          </p>
        </section>
      ) : null}

      {state.kind === "error" ? (
        <section className={cn(glassCard, "text-center")}>
          <p className="text-sm text-red-300/90">{state.message}</p>
        </section>
      ) : null}

      {state.kind === "join" ? (
        <section className={cn(glassCard, "space-y-4")}>
          <TrackPreview track={state.track} />
          <p className="text-center text-sm text-white/50">
            No active Jukebox session on this device. Enter the 4-character room code.
          </p>
          <Input
            value={sessionCodeInput}
            onChange={(e) => setSessionCodeInput(e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="ABCD"
            className="border-white/15 bg-white/5 text-center font-mono text-lg tracking-[0.35em] text-white"
          />
          <Button
            type="button"
            disabled={sessionCodeInput.trim().length < 4 || submitting}
            className="w-full rounded-full bg-wam py-3 font-semibold text-black hover:bg-wam/90"
            onClick={() => void handleJoinAndAdd()}
          >
            {submitting ? "Adding…" : "Join & Add"}
          </Button>
        </section>
      ) : null}

      {state.kind === "success" ? (
        <section className={cn(glassCard, "space-y-6 text-center")}>
          <CheckCircle2 className="mx-auto size-16 text-wam" strokeWidth={1.5} aria-hidden />
          <div>
            <p className="text-xs uppercase tracking-wider text-white/40">Added to queue</p>
            <TrackPreview track={state.track} className="mt-4" />
            <p className="mt-3 text-sm text-wam">Session {state.sessionCode}</p>
          </div>
          <Button
            type="button"
            asChild
            className="w-full rounded-full bg-wam py-3 font-semibold text-black hover:bg-wam/90"
          >
            <Link href={`/live/${normalizeSessionCode(state.sessionCode)}`}>
              Back to session
            </Link>
          </Button>
        </section>
      ) : null}
    </main>
  );
}

function TrackPreview({
  track,
  className,
}: {
  track: ResolvedTrack;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3", className)}>
      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-white/10">
        {track.imageUrl ? (
          <Image
            src={track.imageUrl}
            alt=""
            width={56}
            height={56}
            className="size-14 object-cover"
            unoptimized
          />
        ) : (
          <div className="flex size-14 items-center justify-center">
            <Music2 className="size-6 text-white/30" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate font-medium text-white">{track.trackName}</p>
        <p className="truncate text-sm text-white/50">{track.artistName ?? "Unknown artist"}</p>
      </div>
    </div>
  );
}
