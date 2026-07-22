import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ParticleField } from "@/components/ParticleField";
import { FloatingObjects } from "@/components/FloatingObjects";
import { ThemedBackground } from "@/components/ThemedBackground";
import { Sidebar } from "@/components/Sidebar";
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
        {/* Themed nebula background (reacts to the chosen theme) */}
        <ThemedBackground />

        {/* Particle field */}
        <ParticleField />

        {/* Immersive drifting physical-media silhouettes */}
        <FloatingObjects />

        <PlayerProvider>
          {/* Navigation */}
          <Navbar />

          {/* Left hub — crates, format, theme, taste */}
          <Sidebar />

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
