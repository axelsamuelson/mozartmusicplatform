import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AuroraBackground } from "@/components/AuroraBackground";
import { Navigation } from "@/components/Navigation";
import { Player } from "@/components/Player";
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
  title: "WAM — Music Rating",
  description: "Rate and queue music with your team",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "WAM",
    statusBarStyle: "black",
  },
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
        <meta name="theme-color" content="#1DB954" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="WAM" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="relative min-h-full flex flex-col bg-background text-foreground font-sans antialiased">
        <AuroraBackground />
        <Navigation />
        <Player />
        <Toaster theme="dark" position="bottom-center" richColors />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col pb-[var(--wam-player-pad,0px)]">
          {children}
        </div>
      </body>
    </html>
  );
}
