export type ReleaseType = "single" | "album" | "ep";

export type MoodTag =
  | "euphoric"
  | "melancholic"
  | "energetic"
  | "ambient"
  | "raw"
  | "cinematic"
  | "hypnotic"
  | "tender";

export interface PlatformLinks {
  spotify: string | null;
  apple_music: string | null;
  tidal: string | null;
  soundcloud: string | null;
  youtube_music: string | null;
}

export interface Release {
  id: string;
  artist: string;
  title: string;
  type: ReleaseType;
  artwork_url: string;
  artwork_blur_hash?: string;
  release_date: string;
  genre: string | null;
  tags: string[];
  mood: MoodTag | null;
  spotify: string | null;
  apple_music: string | null;
  tidal: string | null;
  soundcloud: string | null;
  youtube_music: string | null;
  created_at: string;
  curator_note: string | null;
  /** Cross-DSP chart strength (higher = more streamed right now).
   *  Present only on releases currently charting; not persisted to DB. */
  popularity?: number | null;
  /** Record label (e.g. "Sub Pop", "Griselda"). Optional metadata. */
  label?: string | null;
}

export interface AgentRelease {
  artist: string;
  title: string;
  type: ReleaseType;
  artwork_url: string;
  release_date: string;
  genre?: string;
  tags?: string[];
  mood?: MoodTag;
  spotify: string | null;
  apple_music: string | null;
  tidal: string | null;
  soundcloud: string | null;
  youtube_music: string | null;
  curator_note?: string;
}

export interface AgentRunResult {
  success: boolean;
  releases_found: number;
  releases_saved: number;
  errors: string[];
  run_at: string;
}
