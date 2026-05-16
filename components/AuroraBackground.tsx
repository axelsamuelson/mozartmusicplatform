"use client";

import Aurora from "@/components/Aurora";

const WAM_AURORA_STOPS = ["#1DB954", "#052e16", "#1a1a2e"] as const;

/** Full-viewport WebGL aurora; sits behind app content (`z-0`). */
export function AuroraBackground() {
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
