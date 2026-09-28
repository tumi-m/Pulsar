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
  euphoric:    { text: "text-sport",  glow: "shadow-[0_0_20px_rgba(255,206,10,0.4)]",   bg: "bg-sport/10" },
  melancholic: { text: "text-tps",   glow: "shadow-[0_0_20px_rgba(78,134,199,0.4)]",   bg: "bg-tps/10" },
  energetic:   { text: "text-vu",   glow: "shadow-[0_0_20px_rgba(226,59,46,0.4)]",   bg: "bg-vu/10" },
  ambient:     { text: "text-sony", glow: "shadow-[0_0_20px_rgba(242,102,44,0.4)]",  bg: "bg-sony/10" },
  raw:         { text: "text-vu",   glow: "shadow-[0_0_20px_rgba(226,59,46,0.4)]",   bg: "bg-vu/10" },
  cinematic:   { text: "text-sony", glow: "shadow-[0_0_20px_rgba(242,102,44,0.4)]",  bg: "bg-sony/10" },
  hypnotic:    { text: "text-lcd",  glow: "shadow-[0_0_20px_rgba(126,217,174,0.4)]",   bg: "bg-lcd/10" },
  tender:      { text: "text-ink",  glow: "shadow-[0_0_20px_rgba(237,241,244,0.3)]", bg: "bg-ink/5" },
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
  "Hip-Hop":        { text: "text-sport",  bg: "bg-sport/10" },
  "Afrobeats":      { text: "text-sport",  bg: "bg-sport/10" },
  "Amapiano":       { text: "text-lcd",  bg: "bg-lcd/10" },
  "House":          { text: "text-tps",   bg: "bg-tps/10" },
  "Electronic":     { text: "text-tps",   bg: "bg-tps/10" },
  "Reggae":         { text: "text-lcd",  bg: "bg-lcd/10" },
  "Soul / R&B":     { text: "text-sony", bg: "bg-sony/10" },
  "Gospel":         { text: "text-sport",  bg: "bg-sport/10" },
  "Pop":            { text: "text-lcd",  bg: "bg-lcd/10" },
  "Rock":           { text: "text-vu",   bg: "bg-vu/10" },
  "Metal":          { text: "text-vu",   bg: "bg-vu/10" },
  "Jazz":           { text: "text-sport",  bg: "bg-sport/10" },
  "Blues":          { text: "text-tps",   bg: "bg-tps/10" },
  "Latin":          { text: "text-vu",   bg: "bg-vu/10" },
  "Classical":      { text: "text-ink",  bg: "bg-ink/5" },
  "Folk / Country": { text: "text-ink",  bg: "bg-ink/5" },
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
  boomplay: {
    label: "Boomplay",
    color: "#2F6BFF",
    hoverBg: "hover:bg-[#2F6BFF]/20",
    icon: "boomplay",
  },
};

/**
 * Boomplay search deep link.
 *
 * Boomplay has no public API, so like Tidal and SoundCloud this is a search
 * URL rather than a direct track link. It is worth having despite that:
 * Boomplay is the largest streaming service in Africa at roughly 95M monthly
 * active users, which is an order of magnitude more reach than Tidal, and it
 * is where a lot of Pulsar's amapiano, gqom, kwaito and SA gospel catalogue
 * actually lives.
 *
 * ⚠ UNVERIFIED PATH. This session could not reach boomplay.com — the egress
 * proxy refuses it — so the path below could not be confirmed against the live
 * site. It is deliberately the only place the format appears: if tapping a
 * Boomplay icon lands somewhere wrong, correct this one line and every link in
 * the app follows.
 */
export const BOOMPLAY_SEARCH_PATH = "https://www.boomplay.com/search/default/";

export const boomplaySearchUrl = (q: string): string =>
  `${BOOMPLAY_SEARCH_PATH}${encodeURIComponent(q)}`;
