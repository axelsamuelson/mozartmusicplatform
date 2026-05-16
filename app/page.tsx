import { redirect } from "next/navigation";

import { signInWithSpotify } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

function IconRate() {
  return (
    <svg className="size-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    </svg>
  );
}

function IconTag() {
  return (
    <svg className="size-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
  );
}

function IconPlaylist() {
  return (
    <svg className="size-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
      />
    </svg>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const features = [
    {
      title: "Rate",
      description: "Score tracks, albums, and artists on your own 0–100 scale.",
      icon: <IconRate />,
    },
    {
      title: "Tag",
      description: "Capture genres, mood, and moments so your library stays searchable.",
      icon: <IconTag />,
    },
    {
      title: "Create playlists",
      description: "Sync Spotify playlists from your ratings and saved filters — WAM-owned only.",
      icon: <IconPlaylist />,
    },
  ] as const;

  return (
    <section className="relative flex min-h-screen items-center justify-center px-4 py-20">
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <div className="animate-fade-in-badge mb-8 mt-8 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md sm:mt-12">
          <span className="mr-2 size-2 animate-pulse rounded-full bg-white/60" />
          Your music, your scores
        </div>

        <h1 className="animate-fade-in-heading mb-6 text-balance text-3xl font-bold text-white sm:text-4xl md:text-6xl">
          Your personal music diary
          <br />
          <span className="mt-3 inline-block text-white/95 sm:mt-4 md:mt-6">Rate, tag &amp; build playlists</span>
        </h1>

        <p className="animate-fade-in-subheading mx-auto mb-8 max-w-sm px-4 text-base leading-relaxed font-light text-white sm:max-w-3xl sm:px-0 sm:text-xl md:text-2xl">
          Sign in with Spotify to search your library vibe, capture scores, and sync playlists you own through WAM.
        </p>

        <div className="animate-fade-in-buttons mb-12 flex flex-col items-center justify-center gap-4 sm:mb-16">
          <form action={signInWithSpotify}>
            <Button
              type="submit"
              size="lg"
              className="group relative cursor-pointer overflow-hidden rounded-full border-0 bg-white px-8 py-4 text-lg font-medium text-black shadow-lg transition-all duration-300 hover:scale-105 hover:bg-gray-50 hover:shadow-lg"
            >
              Log in with Spotify
              <svg
                className="ml-2 inline-block size-5 transition-transform group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          </form>
        </div>

        <div
          id="features"
          className="animate-fade-in-trust mx-auto grid max-w-5xl grid-cols-1 gap-6 text-left sm:grid-cols-3"
        >
          {features.map((f) => (
            <div key={f.title} className="group">
              <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg backdrop-blur-md transition-all duration-500 hover:-translate-y-2 hover:border-white/20 hover:bg-white/10 hover:shadow-2xl sm:p-8">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition-colors duration-300 group-hover:border-white/20 group-hover:bg-white/15">
                  {f.icon}
                </div>
                <h3 className="mb-4 text-xl font-bold text-white transition-colors duration-300 group-hover:text-white/90 sm:text-2xl">
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed text-white/65 sm:text-base">{f.description}</p>
              </div>
            </div>
          ))}
        </div>

        <footer className="animate-fade-in-trust mt-16 text-center text-xs text-white/30 pb-8">
          <a href="/privacy" className="transition-colors hover:text-white/50">
            Privacy Policy
          </a>
          {" · "}
          <a href="/terms" className="transition-colors hover:text-white/50">
            Terms of Service
          </a>
        </footer>
      </div>
    </section>
  );
}
