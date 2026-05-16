import { cn } from "@/lib/utils";

/** Base glass (no padding — use inside shadcn Card with px-0 slots, or compose with p-6). */
export const glassSurface =
  "rounded-xl border border-white/[0.08] bg-white/[0.04] shadow-none backdrop-blur-md transition-all duration-300 hover:bg-white/[0.07] md:rounded-2xl";

export const glassCard = cn(glassSurface, "p-4 md:p-6");

export const glassCardTight = cn(
  "rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm transition-all duration-300 hover:bg-white/[0.07]",
  "p-3 md:p-6 md:rounded-2xl",
);

export const glassPanel = cn(glassSurface, "p-4 md:p-6");

export const pageHeading =
  "text-2xl font-bold tracking-tight text-white md:text-3xl";

export const pageSub = "mt-1 text-base text-white/50";

export const sectionHeading =
  "text-base font-semibold text-white/90 md:text-lg";
