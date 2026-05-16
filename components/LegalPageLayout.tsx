import Link from "next/link";
import type { ReactNode } from "react";

import { glassCard } from "@/lib/wamUi";

export type LegalSection = {
  title: string;
  paragraphs: ReactNode[];
};

type LegalPageLayoutProps = {
  title: string;
  meta: ReactNode;
  sections: LegalSection[];
};

export function LegalPageLayout({ title, meta, sections }: LegalPageLayoutProps) {
  return (
    <section className="relative flex min-h-screen flex-col px-4 py-20 md:py-24">
      <div className="relative z-10 mx-auto w-full max-w-3xl">
        <Link
          href="/"
          className="mb-8 inline-flex text-sm font-medium text-white/60 transition-colors hover:text-white"
        >
          ← Back to Musicator
        </Link>

        <article className={glassCard}>
          <header className="border-b border-white/10 pb-8">
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/70">{meta}</p>
          </header>

          <div className="mt-8 space-y-10">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="mb-3 text-lg font-semibold text-wam md:text-xl">
                  {section.title}
                </h2>
                <div className="space-y-3 text-sm leading-relaxed text-white/70 md:text-base">
                  {section.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
