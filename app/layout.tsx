import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AuroraBackground } from "@/components/AuroraBackground";
import { Navigation } from "@/components/Navigation";
import { PlayerLoader } from "@/components/PlayerLoader";
import {
  BRAND_DESCRIPTION,
  BRAND_NAME,
  BRAND_TITLE,
  SITE_URL,
} from "@/lib/seo/site";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: BRAND_TITLE,
    template: `%s | ${BRAND_NAME}`,
  },
  description: BRAND_DESCRIPTION,
  applicationName: BRAND_NAME,
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: BRAND_NAME,
    title: BRAND_TITLE,
    description: BRAND_DESCRIPTION,
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: BRAND_NAME }],
  },
  twitter: {
    card: "summary",
    title: BRAND_TITLE,
    description: BRAND_DESCRIPTION,
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: BRAND_NAME,
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  themeColor: "#1DB954",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="Musicator" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="relative min-h-full flex flex-col bg-background text-foreground font-sans antialiased">
        <AuroraBackground />
        <Navigation />
        <PlayerLoader />
        <Toaster theme="dark" position="bottom-center" richColors />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col pb-[var(--wam-player-pad,0px)]">
          {children}
        </div>
      </body>
    </html>
  );
}
