import { cn } from "@/lib/utils";

function EqBars({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex h-3.5 items-end gap-[3px]", className)}
      aria-hidden
    >
      <span className="animate-wam-eq h-2 w-[3px] rounded-full bg-wam [animation-delay:-0.32s]" />
      <span className="animate-wam-eq h-3.5 w-[3px] rounded-full bg-wam [animation-delay:-0.16s]" />
      <span className="animate-wam-eq h-2.5 w-[3px] rounded-full bg-wam" />
    </span>
  );
}

export function LoadingMark({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-sm text-white/55", className)}
      role="status"
      aria-live="polite"
    >
      <EqBars />
      <span>{label}</span>
    </span>
  );
}

export function PageLoadingFallback({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center px-4 py-16", className)}>
      <LoadingMark />
    </div>
  );
}
