import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ParticleField } from "@/components/ParticleField";
import { FloatingObjects } from "@/components/FloatingObjects";
import { Bubbles } from "@/components/Bubbles";
import { ThemedBackground } from "@/components/ThemedBackground";
import { Sidebar } from "@/components/Sidebar";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { NowPlayingBar } from "@/components/player/NowPlayingBar";
import { SyncBridge } from "@/components/SyncBridge";

export const metadata: Metadata = {
  title: "PULSAR — Daily Music Discovery",
  description:
    "The best new music — every day. Curated by AI across genres. One-click access to Spotify, Apple Music, Tidal, SoundCloud, and YouTube Music.",
  keywords: ["music discovery", "new music", "daily releases", "indie music", "electronic music"],
  manifest: "/manifest.json",
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

/**
 * `viewport-fit: cover` lets the page use the full screen on notched phones and
 * — crucially — makes `env(safe-area-inset-*)` resolve to real values. Without
 * it those insets are always 0, so the safe-area padding on the bottom-fixed
 * elements (player bar, dock, sheets) would silently do nothing.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#04040a",
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
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="noise-overlay vignette bg-void min-h-screen">
        {/* Themed nebula background (reacts to the chosen theme) */}
        <ThemedBackground />

        {/* Particle field */}
        <ParticleField />

        {/* Immersive drifting physical-media silhouettes */}
        <FloatingObjects />

        {/* Quiet ambient bubbles drifting upward */}
        <Bubbles />

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

          {/* Cross-device collection sync (inert unless signed in) */}
          <SyncBridge />
        </PlayerProvider>
      </body>
    </html>
  );
}
