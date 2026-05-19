"use client";

import type { LivePresenceMember } from "@/lib/types/live";
import type { LiveSessionRow, QueueMode, RankingVisibility } from "@/lib/types/live";
import { cn } from "@/lib/utils";

function RadioOption({
  checked,
  label,
  description,
  onSelect,
  disabled,
}: {
  checked: boolean;
  label: string;
  description?: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
        checked ? "border-wam/50 bg-wam/10" : "border-white/10 bg-white/5 hover:bg-white/8",
        disabled && "opacity-50",
      )}
    >
      <span className="text-sm text-white">{label}</span>
      {description ? <span className="mt-0.5 block text-[10px] text-white/45">{description}</span> : null}
    </button>
  );
}

export type JamsHostSettingsProps = {
  session: LiveSessionRow;
  participants: LivePresenceMember[];
  disabled?: boolean;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
};

export function JamsHostSettings({
  session,
  participants,
  disabled,
  onPatch,
}: JamsHostSettingsProps) {
  const queueMode = session.queue_mode ?? "transparent";
  const rankingVisibility = session.ranking_visibility ?? "end_only";
  const duration = session.duration_minutes ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="mb-2 text-sm font-medium text-white">Queue visibility</p>
        <div className="space-y-2">
          <RadioOption
            checked={queueMode === "transparent"}
            label="Transparent"
            description="Everyone sees next 3 tracks and who queued them"
            disabled={disabled}
            onSelect={() => void onPatch({ queue_mode: "transparent" as QueueMode })}
          />
          <RadioOption
            checked={queueMode === "surprise"}
            label="Surprise"
            description="Only current track visible"
            disabled={disabled}
            onSelect={() => void onPatch({ queue_mode: "surprise" as QueueMode })}
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="mb-2 text-sm font-medium text-white">Ranking visibility</p>
        <div className="space-y-2">
          <RadioOption
            checked={rankingVisibility === "full"}
            label="Full"
            description="Live rankings visible at all times"
            disabled={disabled}
            onSelect={() => void onPatch({ ranking_visibility: "full" as RankingVisibility })}
          />
          <RadioOption
            checked={rankingVisibility === "masked"}
            label="Masked"
            description="Only your rank and top 3 visible"
            disabled={disabled}
            onSelect={() => void onPatch({ ranking_visibility: "masked" as RankingVisibility })}
          />
          <RadioOption
            checked={rankingVisibility === "end_only"}
            label="End only"
            description="Rankings revealed at session end (default)"
            disabled={disabled}
            onSelect={() => void onPatch({ ranking_visibility: "end_only" as RankingVisibility })}
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="mb-2 text-sm font-medium text-white">Session duration</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "No limit", value: null },
            { label: "30 min", value: 30 },
            { label: "60 min", value: 60 },
            { label: "90 min", value: 90 },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              disabled={disabled}
              onClick={() => void onPatch({ duration_minutes: opt.value })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                duration === opt.value
                  ? "border-wam bg-wam/15 text-wam"
                  : "border-white/15 text-white/60 hover:bg-white/5",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <label className="mb-2 block text-sm font-medium text-white" htmlFor="co-host-select">
          Co-host
        </label>
        <select
          id="co-host-select"
          disabled={disabled}
          value={session.co_host_user_id ?? ""}
          onChange={(e) =>
            void onPatch({ co_host_user_id: e.target.value || null })
          }
          className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
        >
          <option value="">None</option>
          {participants
            .filter((p) => p.userId !== session.host_user_id)
            .map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.displayName}
              </option>
            ))}
        </select>
        <p className="mt-2 text-[10px] text-white/40">
          If you leave, co-host takes over automatically after 5 minutes.
        </p>
      </div>
    </div>
  );
}
