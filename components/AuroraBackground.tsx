"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Aurora = dynamic(() => import("@/components/Aurora"), {
  ssr: false,
});

const WAM_AURORA_STOPS = ["#1DB954", "#052e16", "#1a1a2e"] as const;

function StaticAuroraFallback() {
  return (
    <div
      className="aurora-container pointer-events-none fixed inset-0 z-0 bg-[#05080a]"
      aria-hidden
      style={{
        backgroundImage:
          "radial-gradient(120% 80% at 50% -10%, rgba(29,185,84,0.28), transparent 55%), radial-gradient(90% 60% at 80% 100%, rgba(26,26,46,0.9), #05080a)",
      }}
    />
  );
}

/** Full-viewport aurora behind app content. Uses a static gradient when motion is reduced. */
export function AuroraBackground() {
  const [useWebGl, setUseWebGl] = useState<boolean | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData =
      "connection" in navigator &&
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
        ?.saveData;
    setUseWebGl(!reduce && !saveData);
  }, []);

  if (useWebGl !== true) return <StaticAuroraFallback />;

  return (
    <div className="aurora-container pointer-events-none fixed inset-0 z-0" aria-hidden>
      <Aurora
        colorStops={[...WAM_AURORA_STOPS]}
        amplitude={1.2}
        blend={0.6}
        speed={0.8}
      />
    </div>
  );
}
