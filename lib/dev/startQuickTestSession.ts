import { activeLiveSessionRefFromRow } from "@/lib/live/activeSessionMeta";
import { setActiveLiveSession } from "@/lib/live/activeSessionStorage";
import type { LiveSessionRow } from "@/lib/types/live";

export type QuickTestSessionResult = {
  code: string;
  sessionId: string;
  session: LiveSessionRow;
};

export async function startQuickTestSession(): Promise<QuickTestSessionResult> {
  const res = await fetch("/api/dev/live/quick-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const body = (await res.json()) as QuickTestSessionResult & { error?: string };
  if (!res.ok) throw new Error(body.error || res.statusText);
  if (!body.session?.id || !body.code) {
    throw new Error("Invalid quick-start response");
  }

  setActiveLiveSession(
    activeLiveSessionRefFromRow(body.session, { simulated: true }),
  );

  return {
    code: body.code,
    sessionId: body.sessionId ?? body.session.id,
    session: body.session,
  };
}
