"use client";

import { Badge } from "@/components/ui/badge";
import type {
  GenreTagRow,
  MomentSubcategory,
  MomentTagRow,
} from "@/lib/types/ratings";
import { sectionHeading } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

const MOMENT_GROUPS: { key: MomentSubcategory; label: string }[] = [
  { key: "place", label: "Place" },
  { key: "occasion", label: "Occasion" },
  { key: "activity", label: "Activity" },
];

export interface TagPickerProps {
  genreTags: GenreTagRow[];
  momentTags: MomentTagRow[];
  selectedGenreIds: number[];
  selectedMomentIds: number[];
  onGenresChange: (ids: number[]) => void;
  onMomentsChange: (ids: number[]) => void;
  disabled?: boolean;
  className?: string;
  /** Dialog: tighter badges, no helper blurbs. */
  visualVariant?: "default" | "dialog";
}

function toggleId(ids: number[], id: number): number[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return [...ids, id];
}

export function TagPicker({
  genreTags,
  momentTags,
  selectedGenreIds,
  selectedMomentIds,
  onGenresChange,
  onMomentsChange,
  disabled,
  className,
  visualVariant = "default",
}: TagPickerProps) {
  const isDialog = visualVariant === "dialog";

  return (
    <div className={cn("flex flex-col", isDialog ? "gap-6" : "gap-8", className)}>
      <section className="flex flex-col gap-2">
        <h3 className={isDialog ? "text-sm text-white/60" : sectionHeading}>Genre</h3>
        {!isDialog ? (
          <p className="text-xs leading-relaxed text-white/55">
            Pick any genres that fit (optional).
          </p>
        ) : null}
        <div className={cn("flex flex-wrap", isDialog ? "gap-2" : "gap-1.5")}>
          {genreTags.map((g) => {
            const on = selectedGenreIds.includes(g.id);
            return (
              <Badge
                key={g.id}
                asChild
                variant="outline"
                className={cn(
                  "cursor-pointer rounded-full font-medium transition-colors",
                  isDialog
                    ? cn(
                        "border px-3 py-1 text-xs",
                        on
                          ? "border-wam bg-wam/10 text-wam hover:bg-wam/15"
                          : "border-white/15 text-white/60 hover:border-white/30 hover:text-white",
                      )
                    : cn(
                        "border px-2.5 py-1 text-xs transition-all duration-200 hover:scale-[1.02]",
                        on
                          ? "border-transparent bg-white text-black hover:bg-white"
                          : "border-white/20 bg-white/5 text-white/90 hover:border-white/30 hover:bg-white/10",
                      ),
                  disabled && "pointer-events-none opacity-50",
                )}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onGenresChange(toggleId(selectedGenreIds, g.id))}
                >
                  {g.name}
                </button>
              </Badge>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className={isDialog ? "text-sm text-white/60" : sectionHeading}>Moment</h3>
        {!isDialog ? (
          <p className="text-xs leading-relaxed text-white/55">
            Place, occasion, and activity — pick any that apply (optional).
          </p>
        ) : null}
        {MOMENT_GROUPS.map(({ key, label }) => {
          const tags = momentTags.filter((t) => t.subcategory === key);
          return (
            <div key={key} className="flex flex-col gap-2">
              <h4
                className={cn(
                  "font-medium uppercase",
                  isDialog
                    ? "text-xs tracking-wider text-white/40"
                    : "text-xs font-semibold tracking-wide text-white/70",
                )}
              >
                {label}
              </h4>
              <div className={cn("flex flex-wrap", isDialog ? "gap-2" : "gap-1.5")}>
                {tags.map((t) => {
                  const on = selectedMomentIds.includes(t.id);
                  return (
                    <Badge
                      key={t.id}
                      asChild
                      variant="outline"
                      className={cn(
                        "cursor-pointer rounded-full font-medium transition-colors",
                        isDialog
                          ? cn(
                              "border px-3 py-1 text-xs",
                              on
                                ? "border-wam bg-wam/10 text-wam hover:bg-wam/15"
                                : "border-white/15 text-white/60 hover:border-white/30 hover:text-white",
                            )
                          : cn(
                              "border px-2.5 py-1 text-xs transition-all duration-200 hover:scale-[1.02]",
                              on
                                ? "border-transparent bg-white/90 text-black hover:bg-white"
                                : "border-white/20 bg-white/5 text-white/85 hover:border-white/30 hover:bg-white/10",
                            ),
                        disabled && "pointer-events-none opacity-50",
                      )}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          onMomentsChange(toggleId(selectedMomentIds, t.id))
                        }
                      >
                        {t.name}
                      </button>
                    </Badge>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
