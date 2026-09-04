import type { Metadata, Viewport } from "next";
import { Inter, Space_Mono } from "next/font/google";
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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://pulsar-ten-sigma.vercel.app"
  ),
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

/**
 * Premium-minimal type scale — self-hosted via next/font (no render-blocking
 * Google Fonts request). Display/body share Inter; labels stay Space Mono.
 * Tailwind maps `font-display/body/mono` to these vars (tailwind.config.ts).
 */
const fontDisplay = Inter({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700", "800"],
  display: "swap",
});
const fontBody = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const fontMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "700"],
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}
    >
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="noise-overlay vignette bg-void min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[90] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-xs focus:font-bold focus:text-black"
        >
          Skip to content
        </a>
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
          <main id="main" className="relative z-10">
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
