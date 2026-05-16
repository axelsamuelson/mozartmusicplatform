"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Menu, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Search", href: "/search" },
  { name: "Playlists", href: "/playlists" },
  { name: "Profile", href: "/profile" },
] as const;

function linkActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function displayName(user: User): string {
  const m = user.user_metadata ?? {};
  const fromMeta =
    (typeof m.full_name === "string" && m.full_name) ||
    (typeof m.name === "string" && m.name) ||
    (typeof m.display_name === "string" && m.display_name) ||
    (typeof m.preferred_username === "string" && m.preferred_username);
  if (fromMeta) return fromMeta;
  if (user.email) return user.email.split("@")[0] ?? "User";
  return "User";
}

function avatarUrl(user: User): string | null {
  const m = user.user_metadata ?? {};
  if (typeof m.avatar_url === "string" && m.avatar_url) return m.avatar_url;
  if (typeof m.picture === "string" && m.picture) return m.picture;
  return null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const lastScrollY = useRef(0);

  const navShown = isVisible || isOpen;

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    queueMicrotask(() => setIsOpen(false));
  }, [pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHasLoaded(true), 100);

    const controlNavbar = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > 50) {
        if (currentScrollY > lastScrollY.current && currentScrollY - lastScrollY.current > 5) {
          setIsVisible(false);
        } else if (lastScrollY.current - currentScrollY > 5) {
          setIsVisible(true);
        }
      } else {
        setIsVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", controlNavbar, { passive: true });
    return () => {
      window.removeEventListener("scroll", controlNavbar);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (pathname === "/" || pathname === "/privacy" || pathname === "/terms") {
    return null;
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsOpen(false);
    router.refresh();
    router.push("/");
  }

  const name = user ? displayName(user) : null;
  const photo = user ? avatarUrl(user) : null;

  return (
    <>
      <nav
        className={cn(
          "pointer-events-none fixed top-0 right-0 left-0 z-50 transition-all duration-500 md:top-8",
          "pt-3 md:pt-0",
          !hasLoaded && "translate-y-4 opacity-0",
          hasLoaded && !navShown && "-translate-y-full opacity-0 md:-translate-y-24 md:opacity-0",
          hasLoaded && navShown && "translate-y-0 opacity-100",
        )}
        style={{
          transition: hasLoaded ? "all 0.5s ease-out" : "opacity 0.8s ease-out, transform 0.8s ease-out",
        }}
      >
        {/* Mobile: slim floating pill */}
        <div className="pointer-events-auto mx-auto mb-2 flex w-full max-w-[calc(100%-2rem)] items-center justify-between rounded-full border border-white/20 bg-white/10 px-4 py-2 backdrop-blur-md md:hidden">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2 transition-transform duration-200 hover:scale-105"
            onClick={() => setIsOpen(false)}
          >
            <span className="text-base font-semibold tracking-tight text-white">WAM</span>
            <span className="size-2 shrink-0 rounded-full bg-wam" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => setIsOpen((o) => !o)}
            className="cursor-pointer text-white/60 transition-colors hover:text-white"
            aria-expanded={isOpen}
            aria-label={isOpen ? "Close menu" : "Open menu"}
          >
            {isOpen ? <X className="size-6" strokeWidth={2} /> : <Menu className="size-6" strokeWidth={2} />}
          </button>
        </div>

        {/* Desktop: floating pill + links + avatar */}
        <div className="pointer-events-none hidden justify-center px-2 md:flex">
          <div className="pointer-events-auto w-[90vw] max-w-4xl">
            <div className="rounded-full border border-white/20 bg-white/10 px-6 py-2 backdrop-blur-md">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href="/dashboard"
                  className="flex shrink-0 items-center gap-2 transition-transform duration-200 hover:scale-105"
                >
                  <span className="text-lg font-semibold tracking-tight text-white">WAM</span>
                  <span className="size-2 shrink-0 rounded-full bg-wam" aria-hidden />
                </Link>

                <div className="flex items-center space-x-8">
                  {NAV.map((item) => {
                    const active = linkActive(item.href, pathname);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "cursor-pointer border-0 bg-transparent text-sm shadow-none ring-0 outline-none transition-colors duration-200 focus-visible:ring-0",
                          active
                            ? "font-medium text-wam"
                            : "font-medium text-white/80 transition-all duration-200 hover:scale-105 hover:text-white",
                        )}
                      >
                        {item.name}
                      </Link>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  {user ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          {photo ? <AvatarImage src={photo} alt="" /> : null}
                          <AvatarFallback className="border border-white/20 bg-white/10 text-xs text-white">
                            {initials(name ?? "?")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="max-w-[8rem] truncate text-sm font-medium text-white/90">
                          {name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className="cursor-pointer text-sm font-medium text-white/60 transition-colors duration-200 hover:text-white"
                      >
                        Log out
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile: menu sheet (below nav pill) */}
      {isOpen ? (
        <div className="fixed inset-0 z-[100] md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setIsOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Navigation menu"
            className="absolute inset-x-4 top-20 z-50 max-h-[min(70dvh,calc(100dvh-6rem))] overflow-y-auto overscroll-y-contain rounded-2xl border border-white/10 bg-black/90 p-4 shadow-2xl backdrop-blur-xl touch-scroll-y"
          >
            {user ? (
              <div className="flex items-center gap-3 pb-3">
                <Avatar size="sm">
                  {photo ? <AvatarImage src={photo} alt="" /> : null}
                  <AvatarFallback className="border border-white/20 bg-white/10 text-xs text-white">
                    {initials(name ?? "?")}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">{name}</span>
              </div>
            ) : null}
            {user ? <div className="mb-3 h-px bg-white/10" /> : null}

            <nav className="flex flex-col gap-0.5">
              {NAV.map((item) => {
                const active = linkActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                      active ? "text-wam" : "text-white/80 hover:bg-white/10 hover:text-white",
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            {user ? (
              <>
                <div className="my-3 h-px bg-white/10" />
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="w-full rounded-xl px-3 py-3 text-left text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Log out
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
