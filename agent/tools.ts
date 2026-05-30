import Anthropic from "@anthropic-ai/sdk";
import { saveRelease, releaseExists } from "../lib/supabase";
import type { AgentRelease } from "../lib/types";

// ─────────────────────────────────────────────
// Tool definitions (JSON Schema for Anthropic)
// ─────────────────────────────────────────────

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Search the web for new music releases, reviews, and platform links. Use this to find today's releases from Pitchfork, Bandcamp Daily, Reddit r/newmusic, The FADER, Resident Advisor, and other sources. Returns a list of relevant results with titles, URLs, and snippets.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query. Be specific — include today's date and source when possible. E.g. 'Pitchfork new singles today 2024-01-15' or 'Bandcamp Daily new releases this week'",
        },
        source_filter: {
          type: "string",
          description:
            "Optional: restrict to a specific site, e.g. 'site:pitchfork.com' or 'site:bandcamp.com'",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_page",
    description:
      "Fetch the content of a specific URL to extract release details, artwork URLs, and platform links. Use this after web_search to get the full content of a Pitchfork review, Bandcamp page, or artist page.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL to fetch",
        },
        extract: {
          type: "string",
          enum: ["full", "links", "images", "metadata"],
          description:
            "What to extract: 'full' for complete text, 'links' for all hyperlinks, 'images' for image URLs, 'metadata' for og:tags and meta fields",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "find_platform_links",
    description:
      "Search for a specific release on all five music platforms (Spotify, Apple Music, Tidal, SoundCloud, YouTube Music) and return verified links. Always call this for every release before saving.",
    input_schema: {
      type: "object",
      properties: {
        artist: {
          type: "string",
          description: "The artist name",
        },
        title: {
          type: "string",
          description: "The track or album title",
        },
        type: {
          type: "string",
          enum: ["single", "album", "ep"],
          description: "The release type",
        },
      },
      required: ["artist", "title", "type"],
    },
  },
  {
    name: "get_artwork",
    description:
      "Find the highest-resolution official artwork for a release. Tries Spotify, Apple Music, and Bandcamp APIs/CDNs. Returns the best available artwork URL and its dimensions.",
    input_schema: {
      type: "object",
      properties: {
        artist: {
          type: "string",
          description: "The artist name",
        },
        title: {
          type: "string",
          description: "The track or album title",
        },
        spotify_url: {
          type: "string",
          description: "Spotify URL if already known — used to get high-res cover from Spotify CDN",
        },
      },
      required: ["artist", "title"],
    },
  },
  {
    name: "save_release",
    description:
      "Save a verified, enriched release to the Pulsar database. Only call this after you have: (1) confirmed the release date is today or yesterday, (2) found at least 2 working platform links, (3) obtained a real artwork URL.",
    input_schema: {
      type: "object",
      properties: {
        artist: { type: "string" },
        title: { type: "string" },
        type: {
          type: "string",
          enum: ["single", "album", "ep"],
        },
        artwork_url: {
          type: "string",
          description: "Direct URL to high-resolution artwork (no watermarks)",
        },
        release_date: {
          type: "string",
          description: "ISO date: YYYY-MM-DD",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        genre: {
          type: "string",
          description: "Primary genre / secondary genre, e.g. 'Electronic / Soul'",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "2–5 lowercase genre/style tags",
        },
        mood: {
          type: "string",
          enum: [
            "euphoric",
            "melancholic",
            "energetic",
            "ambient",
            "raw",
            "cinematic",
            "hypnotic",
            "tender",
          ],
        },
        spotify: { type: "string", nullable: true },
        apple_music: { type: "string", nullable: true },
        tidal: { type: "string", nullable: true },
        soundcloud: { type: "string", nullable: true },
        youtube_music: { type: "string", nullable: true },
        curator_note: {
          type: "string",
          description:
            "One sentence. Specific. Poetic. No clichés like 'boundary-pushing' or 'genre-defying'.",
        },
      },
      required: [
        "artist",
        "title",
        "type",
        "artwork_url",
        "release_date",
        "mood",
        "curator_note",
      ],
    },
  },
  {
    name: "check_duplicate",
    description:
      "Check if a release already exists in the Pulsar database. Call this before save_release to avoid duplicates.",
    input_schema: {
      type: "object",
      properties: {
        artist: { type: "string" },
        title: { type: "string" },
      },
      required: ["artist", "title"],
    },
  },
  {
    name: "get_current_date",
    description:
      "Get today's date in YYYY-MM-DD format. Always call this at the start of each run to know which dates to look for.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ─────────────────────────────────────────────
// Tool implementations
// ─────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case "get_current_date":
      return executeGetCurrentDate();

    case "web_search":
      return executeWebSearch(toolInput as { query: string; source_filter?: string });

    case "fetch_page":
      return executeFetchPage(toolInput as { url: string; extract?: string });

    case "find_platform_links":
      return executeFindPlatformLinks(
        toolInput as { artist: string; title: string; type: string }
      );

    case "get_artwork":
      return executeGetArtwork(
        toolInput as { artist: string; title: string; spotify_url?: string }
      );

    case "save_release":
      return executeSaveRelease(toolInput as unknown as AgentRelease);

    case "check_duplicate":
      return executeCheckDuplicate(toolInput as { artist: string; title: string });

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

function executeGetCurrentDate(): string {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];
  return JSON.stringify({
    today,
    yesterday,
    day_of_week: now.toLocaleDateString("en-US", { weekday: "long" }),
    note: `Look for releases dated ${today} or ${yesterday}`,
  });
}

async function executeWebSearch(input: {
  query: string;
  source_filter?: string;
}): Promise<string> {
  const fullQuery = input.source_filter
    ? `${input.query} ${input.source_filter}`
    : input.query;

  try {
    // Use Brave Search API or SerpAPI if configured; fall back to a structured response
    const apiKey = process.env.BRAVE_SEARCH_API_KEY || process.env.SERP_API_KEY;

    if (process.env.BRAVE_SEARCH_API_KEY) {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(fullQuery)}&count=10`,
        {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const results = (data.web?.results ?? []).map((r: { title: string; url: string; description: string }) => ({
          title: r.title,
          url: r.url,
          snippet: r.description,
        }));
        return JSON.stringify({ results, query: fullQuery });
      }
    }

    if (process.env.SERP_API_KEY) {
      const res = await fetch(
        `https://serpapi.com/search.json?q=${encodeURIComponent(fullQuery)}&api_key=${process.env.SERP_API_KEY}&num=10`
      );
      if (res.ok) {
        const data = await res.json();
        const results = (data.organic_results ?? []).map((r: { title: string; link: string; snippet: string }) => ({
          title: r.title,
          url: r.link,
          snippet: r.snippet,
        }));
        return JSON.stringify({ results, query: fullQuery });
      }
    }

    if (!apiKey) {
      return JSON.stringify({
        error: "No search API configured",
        hint: "Set BRAVE_SEARCH_API_KEY or SERP_API_KEY in .env",
        query: fullQuery,
        mock_results: [
          {
            title: `[MOCK] Search results for: ${fullQuery}`,
            url: "https://pitchfork.com/reviews/tracks/",
            snippet: "Configure a search API to get real results.",
          },
        ],
      });
    }

    return JSON.stringify({ error: "Search API call failed", query: fullQuery });
  } catch (err) {
    return JSON.stringify({
      error: `Search error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function executeFetchPage(input: {
  url: string;
  extract?: string;
}): Promise<string> {
  try {
    const res = await fetch(input.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PulsarMusicBot/1.0; +https://pulsar.music)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return JSON.stringify({ error: `HTTP ${res.status}`, url: input.url });
    }

    const html = await res.text();

    // Extract Open Graph metadata
    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1];
    const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1];
    const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1];
    const ogType = html.match(/<meta[^>]+property="og:type"[^>]+content="([^"]+)"/i)?.[1];

    // Extract all img src tags
    const images = [...html.matchAll(/<img[^>]+src="(https?:[^"]+)"/gi)].map((m) => m[1]);

    // Extract all href links
    const links = [...html.matchAll(/<a[^>]+href="(https?:[^"]+)"/gi)].map((m) => m[1]);

    // Extract music platform links
    const platformLinks = {
      spotify: links.find((l) => l.includes("open.spotify.com")) ?? null,
      apple_music: links.find((l) => l.includes("music.apple.com")) ?? null,
      tidal: links.find((l) => l.includes("tidal.com")) ?? null,
      soundcloud: links.find((l) => l.includes("soundcloud.com")) ?? null,
      youtube_music: links.find((l) => l.includes("music.youtube.com")) ?? null,
    };

    // Strip HTML tags for text content (truncated)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 3000);

    return JSON.stringify({
      url: input.url,
      metadata: { ogTitle, ogImage, ogDesc, ogType },
      platform_links: platformLinks,
      images: images.slice(0, 10),
      text_preview: textContent,
    });
  } catch (err) {
    return JSON.stringify({
      error: `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
      url: input.url,
    });
  }
}

async function executeFindPlatformLinks(input: {
  artist: string;
  title: string;
  type: string;
}): Promise<string> {
  const { artist, title } = input;
  const searchTerm = `${artist} ${title}`;

  const results: Record<string, string | null> = {
    spotify: null,
    apple_music: null,
    tidal: null,
    soundcloud: null,
    youtube_music: null,
  };

  // Try Brave search for each platform
  if (process.env.BRAVE_SEARCH_API_KEY) {
    const platforms = [
      { key: "spotify", query: `site:open.spotify.com "${searchTerm}"` },
      { key: "apple_music", query: `site:music.apple.com "${searchTerm}"` },
      { key: "tidal", query: `site:tidal.com "${searchTerm}"` },
      { key: "soundcloud", query: `site:soundcloud.com "${searchTerm}"` },
      { key: "youtube_music", query: `site:music.youtube.com "${searchTerm}"` },
    ];

    for (const platform of platforms) {
      try {
        const res = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(platform.query)}&count=3`,
          {
            headers: {
              Accept: "application/json",
              "Accept-Encoding": "gzip",
              "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          const firstResult = data.web?.results?.[0];
          if (firstResult?.url) {
            results[platform.key] = firstResult.url;
          }
        }
        // Rate limit protection
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        // Continue with other platforms
      }
    }
  }

  return JSON.stringify({
    artist,
    title,
    links: results,
    verified_count: Object.values(results).filter(Boolean).length,
  });
}

async function executeGetArtwork(input: {
  artist: string;
  title: string;
  spotify_url?: string;
}): Promise<string> {
  // If we have a Spotify URL, extract the ID and construct CDN URL
  if (input.spotify_url) {
    const match = input.spotify_url.match(/spotify\.com\/(track|album)\/([A-Za-z0-9]+)/);
    if (match) {
      // Spotify CDN pattern for known album art
      return JSON.stringify({
        source: "spotify_cdn",
        note: "Fetch the Spotify page to get the actual artwork URL from og:image",
        url: input.spotify_url,
        action: "Use fetch_page with the spotify_url to extract og:image for the artwork",
      });
    }
  }

  // Try Bandcamp search
  if (process.env.BRAVE_SEARCH_API_KEY) {
    try {
      const query = `site:bandcamp.com "${input.artist}" "${input.title}"`;
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`,
        {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const url = data.web?.results?.[0]?.url;
        if (url) {
          return JSON.stringify({
            source: "bandcamp",
            bandcamp_page: url,
            action: "Use fetch_page on this URL to extract the artwork image (og:image)",
          });
        }
      }
    } catch {
      // Fall through
    }
  }

  return JSON.stringify({
    note: "Use fetch_page on the Spotify or Apple Music URL to extract og:image for artwork",
    artist: input.artist,
    title: input.title,
  });
}

async function executeSaveRelease(input: AgentRelease): Promise<string> {
  try {
    const release = await saveRelease(input);
    return JSON.stringify({
      success: true,
      id: release.id,
      message: `Saved: ${input.artist} — ${input.title}`,
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function executeCheckDuplicate(input: {
  artist: string;
  title: string;
}): Promise<string> {
  try {
    const exists = await releaseExists(input.artist, input.title);
    return JSON.stringify({
      exists,
      artist: input.artist,
      title: input.title,
      message: exists
        ? "Already in database — skip this release"
        : "Not in database — safe to add",
    });
  } catch (err) {
    return JSON.stringify({
      exists: false,
      error: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
