"use client";

import { useEffect, useRef, useState } from "react";
import { Laptop, Smartphone, Speaker, Tv } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  registerPlaybackDeviceChooser,
  type PlaybackDevice,
} from "@/lib/spotify/playbackDeviceChoice";
import { cn } from "@/lib/utils";

function deviceIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("smartphone") || t.includes("tablet")) return Smartphone;
  if (t.includes("tv") || t.includes("cast")) return Tv;
  if (t.includes("speaker") || t.includes("avr")) return Speaker;
  return Laptop;
}

export function PlaybackDevicePicker() {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<PlaybackDevice[]>([]);
  const resolveRef = useRef<(id: string | null) => void>(() => {});

  useEffect(() => {
    registerPlaybackDeviceChooser((list) => {
      return new Promise((resolve) => {
        resolveRef.current(null);
        resolveRef.current = resolve;
        setDevices(list);
        setOpen(true);
      });
    });
    return () => {
      registerPlaybackDeviceChooser(null);
      resolveRef.current(null);
    };
  }, []);

  function finish(id: string | null) {
    setOpen(false);
    const resolve = resolveRef.current;
    resolveRef.current = () => {};
    resolve(id);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish(null);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="border border-white/10 bg-black/90 p-0 text-white shadow-2xl backdrop-blur-xl sm:max-w-md"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="space-y-1.5">
            <DialogTitle className="text-base font-semibold text-white">
              Choose a speaker
            </DialogTitle>
            <DialogDescription className="text-sm text-white/55">
              Spotify isn’t playing on an active device. Pick where to continue.
            </DialogDescription>
          </div>
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {devices.map((d) => {
              const Icon = deviceIcon(d.type);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => finish(d.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      d.is_this_browser
                        ? "border-wam/40 bg-wam/10 hover:bg-wam/15"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-white/70" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">
                        {d.is_this_browser ? "This browser" : d.name}
                      </span>
                      <span className="block truncate text-xs text-white/45">
                        {d.is_this_browser ? "Musicator player" : d.type}
                        {d.is_active ? " · active" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            variant="ghost"
            className="self-end text-white/60 hover:bg-white/10 hover:text-white"
            onClick={() => finish(null)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
