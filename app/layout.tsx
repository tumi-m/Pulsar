import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ParticleField } from "@/components/ParticleField";
import { FloatingObjects } from "@/components/FloatingObjects";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { NowPlayingBar } from "@/components/player/NowPlayingBar";

export const metadata: Metadata = {
  title: "PULSAR — Daily Music Discovery",
  description:
    "The best new music — every day. Curated by AI across genres. One-click access to Spotify, Apple Music, Tidal, SoundCloud, and YouTube Music.",
  keywords: ["music discovery", "new music", "daily releases", "indie music", "electronic music"],
  openGraph: {
    title: "PULSAR — Daily Music Discovery",
    description: "The best new music — every day.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PULSAR — Daily Music Discovery",
    description: "The best new music — every day.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="noise-overlay vignette bg-void min-h-screen">
        {/* Neon nebula background — brighter, more colour */}
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(155,93,229,0.22) 0%, transparent 60%)," +
              "radial-gradient(ellipse 55% 45% at 82% 78%, rgba(0,212,255,0.16) 0%, transparent 62%)," +
              "radial-gradient(ellipse 50% 40% at 12% 68%, rgba(255,0,128,0.14) 0%, transparent 62%)," +
              "radial-gradient(ellipse 45% 40% at 88% 12%, rgba(0,255,136,0.10) 0%, transparent 60%)," +
              "radial-gradient(ellipse 60% 50% at 30% 110%, rgba(255,165,0,0.08) 0%, transparent 60%)," +
              "#06061a",
          }}
        />
        {/* soft animated nebula bloom */}
        <div
          className="fixed inset-0 pointer-events-none z-0 animate-pulse-glow"
          style={{
            background:
              "radial-gradient(ellipse 40% 30% at 65% 40%, rgba(155,93,229,0.10) 0%, transparent 70%)",
            opacity: 0.6,
          }}
        />

        {/* Particle field */}
        <ParticleField />

        {/* Immersive drifting physical-media silhouettes */}
        <FloatingObjects />

        <PlayerProvider>
          {/* Navigation */}
          <Navbar />

          {/* Page content */}
          <main className="relative z-10">
            {children}
          </main>

          {/* Persistent now-playing transport */}
          <NowPlayingBar />
        </PlayerProvider>
      </body>
    </html>
  );
}
