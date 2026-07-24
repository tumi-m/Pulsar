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

// ─────────────────────────────────────────────
// Genre buckets — broad, data-driven categories used for filtering.
// The card still shows each release's full genre string; these are only
// the filter pills.
// ─────────────────────────────────────────────

export const GENRE_BUCKETS = [
  "Hip-Hop",
  "Afrobeats",
  "Amapiano",
  "House",
  "Electronic",
  "Reggae",
  "Soul / R&B",
  "Gospel",
  "Pop",
  "Rock",
  "Metal",
  "Jazz",
  "Blues",
  "Latin",
  "Classical",
  "Folk / Country",
] as const;

export type GenreBucket = (typeof GENRE_BUCKETS)[number];

// Ordered keyword rules — first match wins, so more specific buckets come first.
const GENRE_RULES: { bucket: GenreBucket; keywords: string[] }[] = [
  { bucket: "Amapiano", keywords: ["amapiano", "yanos", "private school piano"] },
  { bucket: "Afrobeats", keywords: ["afrobeat", "afrobeats", "afro-pop", "afropop", "afro-fusion", "naija", "highlife"] },
  { bucket: "Gospel", keywords: ["gospel", "worship", "praise", "christian", "spiritual", "hymn"] },
  { bucket: "Hip-Hop", keywords: ["hip-hop", "hip hop", "rap", "trap", "drill", "boom bap"] },
  { bucket: "Reggae", keywords: ["reggae", "dancehall", "ragga", "dub", "ska"] },
  { bucket: "Metal", keywords: ["metal", "doom", "sludge", "stoner", "hardcore"] },
  { bucket: "House", keywords: ["house", "gqom", "kwaito", "afro house", "afro tech", "deep house", "soulful house"] },
  { bucket: "Electronic", keywords: ["electronic", "techno", "idm", "ambient", "dance", "disco", "synth", "edm", "trance", "dubstep", "drum and bass", "dnb", "electro"] },
  { bucket: "Soul / R&B", keywords: ["soul", "r&b", "rnb", "funk", "neo-soul", "motown"] },
  { bucket: "Latin", keywords: ["latin", "reggaeton", "salsa", "bachata", "cumbia", "bossa", "samba", "tango", "merengue"] },
  { bucket: "Blues", keywords: ["blues"] },
  { bucket: "Jazz", keywords: ["jazz", "bebop", "swing", "fusion", "big band"] },
  { bucket: "Classical", keywords: ["classical", "orchestra", "symphony", "opera", "baroque", "concerto", "chamber"] },
  { bucket: "Folk / Country", keywords: ["folk", "country", "americana", "singer-songwriter", "bluegrass"] },
  { bucket: "Rock", keywords: ["rock", "punk", "grunge", "shoegaze", "psychedel", "indie", "alternative", "new wave", "art rock"] },
  { bucket: "Pop", keywords: ["pop", "k-pop", "j-pop"] },
];

export function genreBucket(genre: string | null | undefined): GenreBucket | null {
  if (!genre) return null;
  const g = genre.toLowerCase();
  for (const rule of GENRE_RULES) {
    if (rule.keywords.some((k) => g.includes(k))) return rule.bucket;
  }
  return null;
}

// Color theming per bucket (reuses the neon palette).
export const GENRE_COLORS: Record<GenreBucket, { text: string; bg: string }> = {
  "Hip-Hop":        { text: "text-neon-amber",  bg: "bg-neon-amber/10" },
  "Afrobeats":      { text: "text-neon-amber",  bg: "bg-neon-amber/10" },
  "Amapiano":       { text: "text-neon-green",  bg: "bg-neon-green/10" },
  "House":          { text: "text-neon-blue",   bg: "bg-neon-blue/10" },
  "Electronic":     { text: "text-neon-blue",   bg: "bg-neon-blue/10" },
  "Reggae":         { text: "text-neon-green",  bg: "bg-neon-green/10" },
  "Soul / R&B":     { text: "text-neon-violet", bg: "bg-neon-violet/10" },
  "Gospel":         { text: "text-neon-amber",  bg: "bg-neon-amber/10" },
  "Pop":            { text: "text-neon-green",  bg: "bg-neon-green/10" },
  "Rock":           { text: "text-neon-pink",   bg: "bg-neon-pink/10" },
  "Metal":          { text: "text-neon-pink",   bg: "bg-neon-pink/10" },
  "Jazz":           { text: "text-neon-amber",  bg: "bg-neon-amber/10" },
  "Blues":          { text: "text-neon-blue",   bg: "bg-neon-blue/10" },
  "Latin":          { text: "text-neon-pink",   bg: "bg-neon-pink/10" },
  "Classical":      { text: "text-star-white",  bg: "bg-star-white/5" },
  "Folk / Country": { text: "text-star-white",  bg: "bg-star-white/5" },
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
