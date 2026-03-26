# PULSAR — Daily Music Discovery

> The best new music, every day. Curated by AI. One-click access across all five major platforms.

**PULSAR** is a full-stack music aggregator powered by a Claude-based discovery agent. Every day it scans the internet for genuinely new releases, finds high-res artwork and verified platform links, and publishes them to a cinematic web interface.

---

## Architecture

```
pulsar/
├── agent/
│   ├── index.ts          ← Core agent loop (Claude claude-sonnet-4-6)
│   ├── tools.ts          ← Tool definitions + implementations
│   ├── system-prompt.ts  ← Agent role, goal, rules, output format
│   ├── scheduler.ts      ← Daily cron runner
│   └── env.ts            ← .env loader for script context
├── app/
│   ├── page.tsx          ← Main discovery page (ISR)
│   ├── layout.tsx        ← Root layout + particles + nav
│   ├── globals.css       ← Tailwind + custom vars
│   ├── admin/page.tsx    ← Admin trigger panel
│   └── api/
│       ├── releases/     ← GET /api/releases
│       └── agent/        ← POST /api/agent (trigger)
├── components/
│   ├── ParticleField     ← Canvas antigravity particle system
│   ├── HeroSection       ← Parallax hero with featured release
│   ├── ReleaseGrid       ← Filterable masonry grid
│   ├── ReleaseCard       ← Hover-reveal platform links
│   ├── ReleaseModal      ← Full release detail overlay
│   ├── MoodFilter        ← 8-mood filter pills
│   ├── PlatformLinks     ← Spotify/Apple/Tidal/SC/YTM buttons
│   └── Navbar            ← Scroll-aware nav
├── lib/
│   ├── types.ts          ← TypeScript interfaces
│   ├── supabase.ts       ← DB client + queries
│   └── utils.ts          ← Helpers, mood colors, platform meta
└── supabase/
    └── schema.sql        ← PostgreSQL schema + seed data
```

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/tumi-m/pulsar
cd pulsar
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. In the SQL editor, run: `supabase/schema.sql`
3. Copy your project URL and keys

### 3. Configure environment

```bash
cp .env.example .env.local
# Fill in all values (see .env.example for guidance)
```

### 4. Run the website

```bash
npm run dev
# Open http://localhost:3000
```

### 5. Run the agent (first time)

```bash
npm run agent
```

The agent will:
1. Get today's date
2. Search Pitchfork, Bandcamp, Reddit, FADER, RA, and more
3. For each release: find artwork + platform links
4. Save to Supabase
5. The website auto-refreshes via ISR (every 5 minutes)

---

## Daily Scheduled Run

```bash
# Start the scheduler (runs daily at 08:00 UTC)
npm run agent:schedule

# Or trigger immediately
RUN_ON_START=true npm run agent:schedule
```

Customize the schedule via `AGENT_CRON` in `.env.local`:
```bash
AGENT_CRON="0 8 * * *"   # 08:00 UTC daily (default)
AGENT_CRON="0 6,18 * * *" # twice daily
```

---

## Deployment

### Vercel + Supabase (recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard or:
vercel env add ANTHROPIC_API_KEY
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add BRAVE_SEARCH_API_KEY
vercel env add AGENT_TRIGGER_SECRET
```

### Triggering the agent daily on Vercel

Vercel doesn't run persistent background processes. Options:

**Option A — Vercel Cron (Pro)**
```json
// vercel.json
{
  "crons": [{
    "path": "/api/agent",
    "schedule": "0 8 * * *"
  }]
}
```
Note: Add your `AGENT_TRIGGER_SECRET` as an `Authorization` header via a Vercel Cron secret.

**Option B — GitHub Actions**
```yaml
# .github/workflows/daily-agent.yml
name: Daily Music Discovery
on:
  schedule:
    - cron: '0 8 * * *'
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run agent
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          BRAVE_SEARCH_API_KEY: ${{ secrets.BRAVE_SEARCH_API_KEY }}
```

**Option C — Self-hosted VPS**
```bash
# On a cheap VPS (e.g. Railway, Fly.io, DigitalOcean):
npm run agent:schedule
```

---

## Admin Panel

Visit `/admin` to trigger the agent manually from the browser.
Enter your `AGENT_TRIGGER_SECRET` and click **RUN DISCOVERY AGENT**.

---

## Agent Design (following the @hooeem methodology)

### The Four Questions

**Q1 — Desired Outcome**
Publish 10–20 genuinely new music releases daily, enriched with artwork and 5 platform links, to a public website.

**Q2 — Information Needed**
- Today's date
- New releases from Pitchfork, Bandcamp, Reddit r/newmusic, FADER, RA
- Official artwork URLs (Spotify CDN, Apple Music, Bandcamp)
- Verified platform links (Spotify, Apple Music, Tidal, SoundCloud, YouTube Music)

**Q3 — Actions Allowed**
- Web search (Brave/SerpAPI)
- Page fetching (artist pages, review pages)
- Platform link verification
- Artwork extraction from OG metadata
- Database write (Supabase via service role)
- Duplicate check

**Q4 — Rules**
- Only releases from today or yesterday
- Never hallucinate links — null is better than wrong
- Minimum 2 verified platform links per release
- Quality over quantity
- Mood + curator note required for every entry

### The Core Loop

```
User message → Claude (claude-sonnet-4-6) → [tool_use]
     ↑                                              ↓
     └──────────── tool_result ←── executeTool() ←─┘
                  (repeats until end_turn)
```

---

## Day-One Test Output (5 example releases)

```json
[
  {
    "artist": "James Blake",
    "title": "Paper Envelope",
    "type": "single",
    "artwork_url": "https://i.scdn.co/image/...",
    "release_date": "2026-03-26",
    "genre": "Electronic / Soul",
    "tags": ["electronic", "soul", "future-r&b"],
    "mood": "melancholic",
    "spotify": "https://open.spotify.com/track/...",
    "apple_music": "https://music.apple.com/...",
    "tidal": "https://tidal.com/browse/track/...",
    "soundcloud": "https://soundcloud.com/jamesblake/...",
    "youtube_music": "https://music.youtube.com/watch?v=...",
    "curator_note": "Glacial piano pools beneath a voice that sounds like grief learning to float."
  },
  {
    "artist": "Floating Points",
    "title": "Cascade Theory",
    "type": "album",
    "artwork_url": "https://f4.bcbits.com/img/...",
    "release_date": "2026-03-26",
    "genre": "Electronic / Jazz",
    "tags": ["electronic", "jazz", "ambient"],
    "mood": "hypnotic",
    "spotify": "https://open.spotify.com/album/...",
    "apple_music": "https://music.apple.com/...",
    "tidal": "https://tidal.com/browse/album/...",
    "soundcloud": "https://soundcloud.com/floating-points/...",
    "youtube_music": "https://music.youtube.com/playlist?list=...",
    "curator_note": "Like watching light refract through deep water — disorienting, gorgeous, total."
  },
  {
    "artist": "Ethel Cain",
    "title": "Crushed Glass",
    "type": "single",
    "artwork_url": "https://i.scdn.co/image/...",
    "release_date": "2026-03-26",
    "genre": "Art Pop / Gothic",
    "tags": ["art-pop", "gothic", "americana"],
    "mood": "cinematic",
    "spotify": "https://open.spotify.com/track/...",
    "apple_music": "https://music.apple.com/...",
    "tidal": "https://tidal.com/browse/track/...",
    "soundcloud": "https://soundcloud.com/ethelcain/...",
    "youtube_music": "https://music.youtube.com/watch?v=...",
    "curator_note": "A hymn written in exhaust fumes and stained glass. Her most visceral work yet."
  },
  {
    "artist": "Yves Tumor",
    "title": "Magnetic Meridian",
    "type": "ep",
    "artwork_url": "https://f4.bcbits.com/img/...",
    "release_date": "2026-03-26",
    "genre": "Avant-Pop / Noise",
    "tags": ["avant-pop", "noise", "psychedelic"],
    "mood": "energetic",
    "spotify": "https://open.spotify.com/album/...",
    "apple_music": "https://music.apple.com/...",
    "tidal": "https://tidal.com/browse/album/...",
    "soundcloud": null,
    "youtube_music": "https://music.youtube.com/playlist?list=...",
    "curator_note": "Genre as a concept is somewhere crying in a corner. Four tracks of pure frequency."
  },
  {
    "artist": "Kelela",
    "title": "Afterglow Drift",
    "type": "single",
    "artwork_url": "https://i.scdn.co/image/...",
    "release_date": "2026-03-26",
    "genre": "R&B / Club",
    "tags": ["r&b", "club", "experimental"],
    "mood": "euphoric",
    "spotify": "https://open.spotify.com/track/...",
    "apple_music": "https://music.apple.com/...",
    "tidal": "https://tidal.com/browse/track/...",
    "soundcloud": "https://soundcloud.com/kelela/...",
    "youtube_music": "https://music.youtube.com/watch?v=...",
    "curator_note": "The floor finds you before you find the floor. Kelela at maximum gravitational pull."
  }
]
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, ISR) |
| Styling | Tailwind CSS + custom design system |
| Animation | Framer Motion |
| Agent | Anthropic Claude claude-sonnet-4-6 via `@anthropic-ai/sdk` |
| Database | Supabase (PostgreSQL) |
| Search | Brave Search API / SerpAPI |
| Deployment | Vercel (frontend) + Supabase (DB) |
| Scheduler | node-cron / GitHub Actions / Vercel Cron |

---

## License

MIT
