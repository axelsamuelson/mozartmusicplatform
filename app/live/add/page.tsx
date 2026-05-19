import { Suspense } from "react";

import { LiveAddFromShare } from "@/components/live/LiveAddFromShare";
import { Skeleton } from "@/components/ui/skeleton";
import { glassCard } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export default function LiveAddPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-md px-4 pb-32 pt-24 md:pt-28">
          <Skeleton className="mb-6 h-10 w-48 rounded-lg bg-white/10" />
          <section className={cn(glassCard, "h-48 w-full rounded-2xl bg-white/10")} />
        </main>
      }
    >
      <LiveAddFromShare />
    </Suspense>
  );
}
