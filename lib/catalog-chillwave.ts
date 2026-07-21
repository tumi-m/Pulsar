/**
 * Pulsar — Chillwave / Dream Pop set (35 albums)
 * Washed Out, Beach House, Toro y Moi, Neon Indian, Tycho, Cocteau Twins,
 * Slowdive, Mazzy Star, Mac DeMarco, Clairo and more. Artwork via the
 * strict-matching /api/artwork iTunes proxy.
 */

import type { Release } from "./types";

const enc = encodeURIComponent;
const links = (artist: string, title: string) => {
  const q = `${artist} ${title}`;
  return {
    spotify: `https://open.spotify.com/search/${enc(q)}`,
    apple_music: `https://music.apple.com/search?term=${enc(q)}`,
    tidal: `https://tidal.com/search?q=${enc(q)}`,
    soundcloud: `https://soundcloud.com/search?q=${enc(q)}`,
    youtube_music: `https://music.youtube.com/search?q=${enc(q)}`,
  };
};

interface CWEntry { artist: string; title: string; release_date: string; genre: string; tags: string[]; mood: Release["mood"]; label: string; curator_note: string; }

const ENTRIES: CWEntry[] = [
  {
    "artist": "Washed Out",
    "title": "Within and Without",
    "release_date": "2011-07-12",
    "genre": "Chillwave / Dream Pop",
    "tags": [
      "chillwave",
      "synth-pop",
      "hazy"
    ],
    "mood": "hypnotic",
    "label": "Sub Pop",
    "curator_note": "Ernest Greene smears synth-pop into soft focus, every hook reaching you as if through a warm swimming pool."
  },
  {
    "artist": "Washed Out",
    "title": "Paracosm",
    "release_date": "2013-08-13",
    "genre": "Chillwave / Dream Pop",
    "tags": [
      "chillwave",
      "psychedelic",
      "loops"
    ],
    "mood": "euphoric",
    "label": "Sub Pop",
    "curator_note": "Built from hundreds of overdubbed loops, it hums with the green haze of a backyard in late August."
  },
  {
    "artist": "Beach House",
    "title": "Teen Dream",
    "release_date": "2010-01-26",
    "genre": "Dream Pop",
    "tags": [
      "dream pop",
      "organ",
      "reverb"
    ],
    "mood": "melancholic",
    "label": "Sub Pop",
    "curator_note": "Victoria Legrand's organ drones and Alex Scally's chiming guitar turn adolescent longing into cathedral music."
  },
  {
    "artist": "Beach House",
    "title": "Bloom",
    "release_date": "2012-05-15",
    "genre": "Dream Pop",
    "tags": [
      "dream pop",
      "crystalline",
      "shoegaze"
    ],
    "mood": "cinematic",
    "label": "Sub Pop",
    "curator_note": "The duo tightens their reverb into something crystalline, each song opening like a slow-motion firework."
  },
  {
    "artist": "Beach House",
    "title": "Depression Cherry",
    "release_date": "2015-08-28",
    "genre": "Dream Pop",
    "tags": [
      "dream pop",
      "velvet",
      "minimal"
    ],
    "mood": "tender",
    "label": "Sub Pop",
    "curator_note": "A retreat into velvet quiet, where the drum machine ticks like a clock in an empty room."
  },
  {
    "artist": "Toro y Moi",
    "title": "Causers of This",
    "release_date": "2010-01-25",
    "genre": "Chillwave",
    "tags": [
      "chillwave",
      "bedroom",
      "sampled"
    ],
    "mood": "hypnotic",
    "label": "Carpark",
    "curator_note": "Chaz Bear stitches R&B samples into woozy, pitch-bent bedroom funk that never quite stands up straight."
  },
  {
    "artist": "Toro y Moi",
    "title": "Anything in Return",
    "release_date": "2013-01-22",
    "genre": "Chillwave / House",
    "tags": [
      "chillwave",
      "house",
      "dance"
    ],
    "mood": "energetic",
    "label": "Carpark",
    "curator_note": "He trades bedroom murk for clean dancefloor lines, chasing house music through a Bay Area window."
  },
  {
    "artist": "Neon Indian",
    "title": "Psychic Chasms",
    "release_date": "2009-10-13",
    "genre": "Chillwave",
    "tags": [
      "chillwave",
      "lo-fi",
      "synth"
    ],
    "mood": "hypnotic",
    "label": "Lefse",
    "curator_note": "Alan Palomo's debut crackles like a corrupted VHS tape of a party you half-remember."
  },
  {
    "artist": "Tycho",
    "title": "Dive",
    "release_date": "2011-11-08",
    "genre": "Ambient / Chillwave",
    "tags": [
      "ambient",
      "instrumental",
      "downtempo"
    ],
    "mood": "ambient",
    "label": "Ghostly International",
    "curator_note": "Scott Hansen builds patient instrumentals engineered for watching coastlines blur past a car window."
  },
  {
    "artist": "Tycho",
    "title": "Awake",
    "release_date": "2014-03-18",
    "genre": "Ambient / Chillwave",
    "tags": [
      "ambient",
      "instrumental",
      "krautrock"
    ],
    "mood": "energetic",
    "label": "Ghostly International",
    "curator_note": "Live drums and bass push the ambient postcards into motion without losing their sunrise glow."
  },
  {
    "artist": "Boards of Canada",
    "title": "Music Has the Right to Children",
    "release_date": "1998-04-20",
    "genre": "IDM / Ambient",
    "tags": [
      "idm",
      "analog",
      "nostalgic"
    ],
    "mood": "hypnotic",
    "label": "Warp",
    "curator_note": "Detuned analog synths and half-buried children's voices make nostalgia sound faintly sinister."
  },
  {
    "artist": "Boards of Canada",
    "title": "Geogaddi",
    "release_date": "2002-02-18",
    "genre": "IDM / Ambient",
    "tags": [
      "idm",
      "eerie",
      "tape"
    ],
    "mood": "hypnotic",
    "label": "Warp",
    "curator_note": "The Scottish duo goes darker and more numerological, threading unease through every warm tape loop."
  },
  {
    "artist": "Cocteau Twins",
    "title": "Heaven or Las Vegas",
    "release_date": "1990-09-17",
    "genre": "Dream Pop",
    "tags": [
      "dream pop",
      "ethereal",
      "4ad"
    ],
    "mood": "euphoric",
    "label": "4AD",
    "curator_note": "Elizabeth Fraser sings in a private language while the guitars shimmer like light on chrome."
  },
  {
    "artist": "Slowdive",
    "title": "Souvlaki",
    "release_date": "1993-05-17",
    "genre": "Shoegaze / Dream Pop",
    "tags": [
      "shoegaze",
      "reverb",
      "guitars"
    ],
    "mood": "melancholic",
    "label": "Creation",
    "curator_note": "Guitars dissolve into weightless clouds as Neil Halstead and Rachel Goswell trade whispered heartbreak."
  },
  {
    "artist": "Slowdive",
    "title": "Slowdive",
    "release_date": "2017-05-05",
    "genre": "Shoegaze / Dream Pop",
    "tags": [
      "shoegaze",
      "reunion",
      "luminous"
    ],
    "mood": "cinematic",
    "label": "Dead Oceans",
    "curator_note": "A reunion that skips nostalgia, arriving fully grown and luminous after two decades of silence."
  },
  {
    "artist": "Mazzy Star",
    "title": "So Tonight That I Might See",
    "release_date": "1993-10-05",
    "genre": "Dream Pop / Desert Rock",
    "tags": [
      "dream pop",
      "desert",
      "narcotic"
    ],
    "mood": "melancholic",
    "label": "Capitol",
    "curator_note": "Hope Sandoval's narcotic drawl drifts over desert-blues guitar like smoke that won't clear."
  },
  {
    "artist": "Beach Fossils",
    "title": "Beach Fossils",
    "release_date": "2010-05-25",
    "genre": "Dream Pop / Indie",
    "tags": [
      "jangle",
      "lo-fi",
      "reverb"
    ],
    "mood": "melancholic",
    "label": "Captured Tracks",
    "curator_note": "Dustin Payseur's jangling guitars loop endlessly, sketching sun-bleached boredom in a Brooklyn apartment."
  },
  {
    "artist": "Wild Nothing",
    "title": "Gemini",
    "release_date": "2010-05-25",
    "genre": "Dream Pop",
    "tags": [
      "dream pop",
      "bedroom",
      "cassette"
    ],
    "mood": "tender",
    "label": "Captured Tracks",
    "curator_note": "Jack Tatum's bedroom debut answers 1980s British pop with cassette hiss and lovestruck reverb."
  },
  {
    "artist": "Wild Nothing",
    "title": "Nocturne",
    "release_date": "2012-08-28",
    "genre": "Dream Pop",
    "tags": [
      "dream pop",
      "synth",
      "glossy"
    ],
    "mood": "cinematic",
    "label": "Captured Tracks",
    "curator_note": "Cleaner and more confident, it wraps its melancholy in glossy, moonlit synth-pop."
  },
  {
    "artist": "DIIV",
    "title": "Oshin",
    "release_date": "2012-06-26",
    "genre": "Dream Pop / Shoegaze",
    "tags": [
      "shoegaze",
      "motorik",
      "guitars"
    ],
    "mood": "hypnotic",
    "label": "Captured Tracks",
    "curator_note": "Zachary Cole Smith spins circular guitar figures that feel like swimming underwater with your eyes open."
  },
  {
    "artist": "Real Estate",
    "title": "Days",
    "release_date": "2011-10-18",
    "genre": "Indie / Jangle Pop",
    "tags": [
      "jangle",
      "suburban",
      "guitars"
    ],
    "mood": "tender",
    "label": "Domino",
    "curator_note": "Suburban New Jersey guitar-pop so unhurried it practically smells of cut grass and screen doors."
  },
  {
    "artist": "Ducktails",
    "title": "The Flower Lane",
    "release_date": "2013-01-22",
    "genre": "Indie / Soft Rock",
    "tags": [
      "soft rock",
      "breezy",
      "lo-fi"
    ],
    "mood": "tender",
    "label": "Domino",
    "curator_note": "Matt Mondanile softens his lo-fi sketches into breezy, soft-rock daydreams with a wink."
  },
  {
    "artist": "Ariel Pink",
    "title": "Before Today",
    "release_date": "2010-06-08",
    "genre": "Hypnagogic Pop",
    "tags": [
      "hypnagogic",
      "am-pop",
      "warped"
    ],
    "mood": "raw",
    "label": "4AD",
    "curator_note": "The bedroom auteur finally records in a studio, and his warped AM-radio pop snaps into focus."
  },
  {
    "artist": "Panda Bear",
    "title": "Person Pitch",
    "release_date": "2007-03-20",
    "genre": "Psychedelic / Dream Pop",
    "tags": [
      "psychedelic",
      "samples",
      "dub"
    ],
    "mood": "euphoric",
    "label": "Paw Tracks",
    "curator_note": "Noah Lennox loops surf harmonies and dub echo into a sun-drunk hymn to fatherhood and Lisbon."
  },
  {
    "artist": "Animal Collective",
    "title": "Merriweather Post Pavilion",
    "release_date": "2009-01-06",
    "genre": "Psychedelic Pop",
    "tags": [
      "psychedelic",
      "sampladelic",
      "experimental"
    ],
    "mood": "euphoric",
    "label": "Domino",
    "curator_note": "Sampladelic and blissed-out, the Baltimore group finds pop songs inside their swirling clatter."
  },
  {
    "artist": "Youth Lagoon",
    "title": "The Year of Hibernation",
    "release_date": "2011-09-27",
    "genre": "Dream Pop / Bedroom",
    "tags": [
      "bedroom",
      "reverb",
      "lo-fi"
    ],
    "mood": "melancholic",
    "label": "Fat Possum",
    "curator_note": "Trevor Powers buries fragile piano and cracked vocals under blankets of reverb, like a diary read aloud."
  },
  {
    "artist": "Clairo",
    "title": "Immunity",
    "release_date": "2019-08-02",
    "genre": "Bedroom Pop",
    "tags": [
      "bedroom pop",
      "indie",
      "intimate"
    ],
    "mood": "tender",
    "label": "Fader Label",
    "curator_note": "Rostam's production frames Claire Cottrill's bedroom confessions with a grown-up's steady hand."
  },
  {
    "artist": "Men I Trust",
    "title": "Oncle Jazz",
    "release_date": "2019-09-27",
    "genre": "Dream Pop / Indie",
    "tags": [
      "dream pop",
      "bass",
      "montreal"
    ],
    "mood": "hypnotic",
    "label": "Return to Analog",
    "curator_note": "The Montreal trio strings together two dozen featherlight songs, each built on a bassline you could nap inside."
  },
  {
    "artist": "Chromatics",
    "title": "Kill for Love",
    "release_date": "2012-03-26",
    "genre": "Synth-pop / Dream Pop",
    "tags": [
      "synth-pop",
      "noir",
      "italo"
    ],
    "mood": "cinematic",
    "label": "Italians Do It Better",
    "curator_note": "Johnny Jewel drapes noir synth-pop over a ninety-minute descent into neon-lit paranoia."
  },
  {
    "artist": "Air",
    "title": "Moon Safari",
    "release_date": "1998-01-16",
    "genre": "Downtempo / Dream Pop",
    "tags": [
      "downtempo",
      "lounge",
      "vocoder"
    ],
    "mood": "ambient",
    "label": "Virgin",
    "curator_note": "Two Frenchmen conjure a lounge for the space age, all Rhodes piano and vocoder daydreams."
  },
  {
    "artist": "Mac DeMarco",
    "title": "Salad Days",
    "release_date": "2014-04-01",
    "genre": "Indie / Slacker Rock",
    "tags": [
      "slacker",
      "jangle",
      "lo-fi"
    ],
    "mood": "tender",
    "label": "Captured Tracks",
    "curator_note": "Jangly and unbothered, DeMarco slouches through songs about aging he wrote before turning twenty-four."
  },
  {
    "artist": "Mac DeMarco",
    "title": "2",
    "release_date": "2012-10-16",
    "genre": "Indie / Slacker Rock",
    "tags": [
      "slacker",
      "wobbly",
      "guitars"
    ],
    "mood": "raw",
    "label": "Captured Tracks",
    "curator_note": "The gap-toothed slacker introduces his wobbly, cigarette-stained guitar tone to the world."
  },
  {
    "artist": "Homeshake",
    "title": "Fresh Air",
    "release_date": "2017-02-03",
    "genre": "Bedroom R&B",
    "tags": [
      "bedroom",
      "funk",
      "drum-machine"
    ],
    "mood": "hypnotic",
    "label": "Sinderlyn",
    "curator_note": "Peter Sagar melts his guitar into syrupy drum-machine funk, sounding both lovesick and half-asleep."
  },
  {
    "artist": "Still Woozy",
    "title": "If This Isn't Nice, I Don't Know What Is",
    "release_date": "2021-08-13",
    "genre": "Bedroom Pop",
    "tags": [
      "bedroom pop",
      "rubbery",
      "indie"
    ],
    "mood": "euphoric",
    "label": "Interscope",
    "curator_note": "Sven Gamsky bounces bright, rubbery bedroom-pop off his own anxious murmur."
  },
  {
    "artist": "Yeule",
    "title": "Glitch Princess",
    "release_date": "2022-02-04",
    "genre": "Ambient Pop / Glitch",
    "tags": [
      "glitch",
      "ambient",
      "avant-pop"
    ],
    "mood": "ambient",
    "label": "Bayonet",
    "curator_note": "Nat Cmiel fractures ambient pop into something tender and glitch-ridden, part lullaby, part machine."
  }
];

export const CHILLWAVE: Release[] = ENTRIES.map((e, i) => ({
  id: `cw-${String(i).padStart(3, "0")}`,
  artist: e.artist,
  title: e.title,
  type: "album",
  artwork_url: `/api/artwork?artist=${enc(e.artist)}&title=${enc(e.title)}`,
  release_date: e.release_date,
  genre: e.genre,
  tags: e.tags,
  mood: e.mood,
  ...links(e.artist, e.title),
  created_at: e.release_date + "T00:00:00Z",
  curator_note: e.curator_note,
  label: e.label,
}));
