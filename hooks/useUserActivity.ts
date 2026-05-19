"use client";

import { useEffect, useState } from "react";

/** True while the user is interacting with the page or the tab is visible. */
export function useUserActivity(): boolean {
  const [active, setActive] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const markActive = () => {
      setActive(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setActive(false), 60_000);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") markActive();
      else setActive(false);
    };

    document.addEventListener("mousemove", markActive, { passive: true });
    document.addEventListener("keydown", markActive);
    document.addEventListener("touchstart", markActive, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);

    markActive();

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("mousemove", markActive);
      document.removeEventListener("keydown", markActive);
      document.removeEventListener("touchstart", markActive);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return active;
}
