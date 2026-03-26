import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  return dateStr === today;
}

export function isYesterday(dateStr: string): boolean {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  return dateStr === yesterday;
}

export const MOOD_COLORS: Record<string, { text: string; glow: string; bg: string }> = {
  euphoric:    { text: "text-neon-amber",  glow: "shadow-[0_0_20px_rgba(255,165,0,0.4)]",   bg: "bg-neon-amber/10" },
  melancholic: { text: "text-neon-blue",   glow: "shadow-[0_0_20px_rgba(0,212,255,0.4)]",   bg: "bg-neon-blue/10" },
  energetic:   { text: "text-neon-pink",   glow: "shadow-[0_0_20px_rgba(255,0,128,0.4)]",   bg: "bg-neon-pink/10" },
  ambient:     { text: "text-neon-violet", glow: "shadow-[0_0_20px_rgba(155,93,229,0.4)]",  bg: "bg-neon-violet/10" },
  raw:         { text: "text-neon-pink",   glow: "shadow-[0_0_20px_rgba(255,0,128,0.4)]",   bg: "bg-neon-pink/10" },
  cinematic:   { text: "text-neon-violet", glow: "shadow-[0_0_20px_rgba(155,93,229,0.4)]",  bg: "bg-neon-violet/10" },
  hypnotic:    { text: "text-neon-green",  glow: "shadow-[0_0_20px_rgba(0,255,136,0.4)]",   bg: "bg-neon-green/10" },
  tender:      { text: "text-star-white",  glow: "shadow-[0_0_20px_rgba(232,232,244,0.3)]", bg: "bg-star-white/5" },
};

export const MOOD_LABELS: Record<string, string> = {
  euphoric: "EUPHORIC",
  melancholic: "MELANCHOLIC",
  energetic: "ENERGETIC",
  ambient: "AMBIENT",
  raw: "RAW",
  cinematic: "CINEMATIC",
  hypnotic: "HYPNOTIC",
  tender: "TENDER",
};

export const PLATFORM_META = {
  spotify: {
    label: "Spotify",
    color: "#1DB954",
    hoverBg: "hover:bg-[#1DB954]/20",
    icon: "spotify",
  },
  apple_music: {
    label: "Apple Music",
    color: "#FC3C44",
    hoverBg: "hover:bg-[#FC3C44]/20",
    icon: "apple",
  },
  tidal: {
    label: "Tidal",
    color: "#00FFFF",
    hoverBg: "hover:bg-[#00FFFF]/20",
    icon: "tidal",
  },
  soundcloud: {
    label: "SoundCloud",
    color: "#FF5500",
    hoverBg: "hover:bg-[#FF5500]/20",
    icon: "soundcloud",
  },
  youtube_music: {
    label: "YouTube Music",
    color: "#FF0000",
    hoverBg: "hover:bg-[#FF0000]/20",
    icon: "youtube",
  },
};
