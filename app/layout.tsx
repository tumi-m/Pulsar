import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ParticleField } from "@/components/ParticleField";

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
        {/* Cosmic background gradient */}
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(155,93,229,0.06) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(0,212,255,0.04) 0%, transparent 60%), #04040a",
          }}
        />

        {/* Particle field */}
        <ParticleField />

        {/* Navigation */}
        <Navbar />

        {/* Page content */}
        <main className="relative z-10">
          {children}
        </main>
      </body>
    </html>
  );
}
