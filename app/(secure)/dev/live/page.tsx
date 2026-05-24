"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { isLiveSimulateEnabled } from "@/lib/dev/liveSimulateGate";
import { startQuickTestSession } from "@/lib/dev/startQuickTestSession";
import { glassCard, pageHeading, pageSub } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export default function DevLiveSimulatePage() {
  const router = useRouter();
  const simulateOn = isLiveSimulateEnabled();
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    setStarting(true);
    try {
      const { code } = await startQuickTestSession();
      toast.success("Test session ready");
      router.push(`/live/${code}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start");
    } finally {
      setStarting(false);
    }
  }

  if (!simulateOn) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-28 pt-24 md:px-6">
        <h1 className={pageHeading}>Test WAM</h1>
        <p className={cn("mt-4", pageSub)}>
          Live simulation is only available in local development.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-4 pb-28 pt-24 md:px-6">
      <header className="space-y-2 text-center">
        <h1 className={pageHeading}>Test WAM</h1>
        <p className={pageSub}>
          One click: simulated session, 4 test participants, and sample ratings. No
          Spotify required.
        </p>
      </header>

      <section className={cn("flex flex-col items-center gap-4 p-8", glassCard)}>
        <Button
          type="button"
          disabled={starting}
          onClick={() => void handleStart()}
          className="h-12 rounded-full bg-wam px-8 text-base font-semibold text-black hover:bg-wam/90"
        >
          {starting ? "Starting…" : "Start test session"}
        </Button>
        <p className="max-w-sm text-center text-xs text-white/45">
          Same as the <strong className="text-white/60">Test WAM</strong> button in the
          player bar. Use <strong>Next track</strong> on the live page to change songs
          (ratings update automatically).
        </p>
      </section>
    </div>
  );
}
