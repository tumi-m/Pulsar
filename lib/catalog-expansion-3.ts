/**
 * Pulsar — Expanded Catalog 3: canon deep-cut
 * 72 canonical albums across classic rock, soul, funk, jazz, post-punk,
 * electronic, hip-hop and modern R&B — eras and corners the first two
 * expansions didn't cover.
 *
 * Artwork resolves through /api/artwork — the iTunes official-cover
 * proxy with strict artist+title matching — so every tile shows the
 * album's REAL cover (or a letter tile, never someone else's art).
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

interface Entry {
  artist: string;
  title: string;
  release_date: string;
  genre: string | null;
  tags: string[];
  mood: Release["mood"];
  curator_note: string | null;
}

const ENTRIES: Entry[] = [
  {
    artist: "Pink Floyd",
    title: "The Dark Side of the Moon",
    release_date: "1973-03-01",
    genre: "Progressive Rock",
    tags: ["classic-rock", "prog", "concept-album"],
    mood: "hypnotic",
    curator_note: "Forty-three minutes on the machinery of madness that still plays in planetariums."
  },
  {
    artist: "Pink Floyd",
    title: "Wish You Were Here",
    release_date: "1975-09-12",
    genre: "Progressive Rock",
    tags: ["classic-rock", "prog", "syd-barrett"],
    mood: "melancholic",
    curator_note: "An elegy for a lost friend that happens to have the best riff Gilmour ever played."
  },
  {
    artist: "Led Zeppelin",
    title: "Led Zeppelin IV",
    release_date: "1971-11-08",
    genre: "Hard Rock / Blues Rock",
    tags: ["classic-rock", "blues", "folk"],
    mood: "raw",
    curator_note: "Four symbols, no title, and a folk-to-thunder arc that changed rock's vocabulary."
  },
  {
    artist: "Fleetwood Mac",
    title: "Rumours",
    release_date: "1977-02-04",
    genre: "Soft Rock / Pop",
    tags: ["classic-rock", "pop", "california"],
    mood: "euphoric",
    curator_note: "Five people divorcing each other into a diamond record. Cocaine and close harmony."
  },
  {
    artist: "Stevie Wonder",
    title: "Songs in the Key of Life",
    release_date: "1976-09-28",
    genre: "Soul / Funk",
    tags: ["soul", "funk", "motown", "double-album"],
    mood: "euphoric",
    curator_note: "Twenty-one songs and not one ounce of filler — Wonder's summary of everything music could be."
  },
  {
    artist: "David Bowie",
    title: "The Rise and Fall of Ziggy Stardust and the Spiders from Mars",
    release_date: "1972-06-16",
    genre: "Glam Rock",
    tags: ["glam", "rock", "concept-album"],
    mood: "cinematic",
    curator_note: "Rock'n'roll suicide as a five-year plan. The blueprint for every alter ego since."
  },
  {
    artist: "David Bowie",
    title: "Low",
    release_date: "1977-01-14",
    genre: "Art Rock / Electronic",
    tags: ["berlin-trilogy", "electronic", "art-rock"],
    mood: "ambient",
    curator_note: "Half fractured pop, half instrumental fog — the Berlin trilogy invents post-rock by accident."
  },
  {
    artist: "Queen",
    title: "A Night at the Opera",
    release_date: "1975-11-21",
    genre: "Rock",
    tags: ["classic-rock", "operatic", "uk"],
    mood: "cinematic",
    curator_note: "The most expensive single ever recorded rides an album that refuses to pick one genre."
  },
  {
    artist: "Neil Young",
    title: "Harvest",
    release_date: "1972-02-14",
    genre: "Folk Rock / Country Rock",
    tags: ["folk", "country-rock", "singer-songwriter"],
    mood: "melancholic",
    curator_note: "A broken heart, a London symphony, and the loneliest number one album of the decade."
  },
  {
    artist: "Joni Mitchell",
    title: "Blue",
    release_date: "1971-06-22",
    genre: "Singer-Songwriter / Folk",
    tags: ["folk", "confessional", "singer-songwriter"],
    mood: "tender",
    curator_note: "The confessional album every confessional album is measured against. No armour, all truth."
  },
  {
    artist: "Steely Dan",
    title: "Aja",
    release_date: "1977-09-23",
    genre: "Jazz Rock",
    tags: ["jazz-rock", "studio-perfectionism"],
    mood: "hypnotic",
    curator_note: "Two perfectionists and forty-three session legends make smooth music with real teeth."
  },
  {
    artist: "Marvin Gaye",
    title: "Let's Get It On",
    release_date: "1973-08-28",
    genre: "Soul / Funk",
    tags: ["soul", "motown", "romance"],
    mood: "tender",
    curator_note: "Spiritual and carnal at once — Gaye turns desire into theology."
  },
  {
    artist: "Curtis Mayfield",
    title: "Superfly",
    release_date: "1972-07-11",
    genre: "Soul / Funk",
    tags: ["soul", "funk", "blaxploitation", "soundtrack"],
    mood: "cinematic",
    curator_note: "A soundtrack that moralises the movie it scores — falsetto as social commentary."
  },
  {
    artist: "Bob Marley & The Wailers",
    title: "Exodus",
    release_date: "1977-06-03",
    genre: "Reggae",
    tags: ["reggae", "jamaica", "spiritual"],
    mood: "euphoric",
    curator_note: "Recorded in London exile after an assassination attempt; the survival album."
  },
  {
    artist: "King Crimson",
    title: "In the Court of the Crimson King",
    release_date: "1969-10-10",
    genre: "Progressive Rock",
    tags: ["prog", "art-rock"],
    mood: "cinematic",
    curator_note: "The album that invented prog in one stroke — that distorted scream on the cover says it all."
  },
  {
    artist: "The Velvet Underground",
    title: "The Velvet Underground & Nico",
    release_date: "1967-03-12",
    genre: "Art Rock / Proto-Punk",
    tags: ["proto-punk", "art-rock", "warhol", "nyc"],
    mood: "raw",
    curator_note: "Barely sold; everyone who bought it started a band. Heroin, Venus in furs, forever."
  },
  {
    artist: "Can",
    title: "Tago Mago",
    release_date: "1971-02-01",
    genre: "Krautrock / Experimental Rock",
    tags: ["krautrock", "experimental", "motorik"],
    mood: "hypnotic",
    curator_note: "A double album of groove disassembled — roots of post-punk, techno and Radiohead alike."
  },
  {
    artist: "Miles Davis",
    title: "Kind of Blue",
    release_date: "1959-08-17",
    genre: "Jazz",
    tags: ["jazz", "modal", "cool-jazz"],
    mood: "ambient",
    curator_note: "Modal jazz invented in two studio days by the greatest band ever assembled on paper."
  },
  {
    artist: "Miles Davis",
    title: "Bitches Brew",
    release_date: "1970-03-30",
    genre: "Jazz Fusion",
    tags: ["jazz", "fusion", "electric"],
    mood: "hypnotic",
    curator_note: "Jazz plugs in and heads into the storm — Teo Macero's splices made the future."
  },
  {
    artist: "John Coltrane",
    title: "A Love Supreme",
    release_date: "1965-02-01",
    genre: "Jazz",
    tags: ["jazz", "spiritual", "modal"],
    mood: "hypnotic",
    curator_note: "A four-part hymn Coltrane wrote in one sitting after kicking heroin. Gratitude, in sound."
  },
  {
    artist: "Television",
    title: "Marquee Moon",
    release_date: "1977-02-08",
    genre: "Art Punk / Post-Punk",
    tags: ["post-punk", "nyc", "guitar"],
    mood: "hypnotic",
    curator_note: "Two guitars weaving for ten minutes at a time — CBGB's answer to Coltrane."
  },
  {
    artist: "Talking Heads",
    title: "Remain in Light",
    release_date: "1980-10-08",
    genre: "Post-Punk / Funk",
    tags: ["post-punk", "afrobeat", "art-rock"],
    mood: "hypnotic",
    curator_note: "Byrne, Eno and a rhythm section possessed — 'how did I get here?' as a life's work."
  },
  {
    artist: "Joy Division",
    title: "Unknown Pleasures",
    release_date: "1979-06-15",
    genre: "Post-Punk",
    tags: ["post-punk", "manchester", "gothic"],
    mood: "melancholic",
    curator_note: "Peter Saville's pulsar waves over Martin Hannett's frozen Manchester. The sound of inside."
  },
  {
    artist: "The Smiths",
    title: "The Queen Is Dead",
    release_date: "1986-06-16",
    genre: "Indie / Jangle Pop",
    tags: ["indie", "jangle", "manchester", "uk"],
    mood: "melancholic",
    curator_note: "Morrissey and Marr at full power — the funniest, saddest, most British album ever made."
  },
  {
    artist: "The Cure",
    title: "Disintegration",
    release_date: "1989-05-02",
    genre: "Gothic Rock / Post-Punk",
    tags: ["goth", "post-punk", "atmospheric"],
    mood: "melancholic",
    curator_note: "Smith turns 30, sinks into the deep end, and makes the greatest sad album of the eighties."
  },
  {
    artist: "Prince",
    title: "Purple Rain",
    release_date: "1984-06-25",
    genre: "Pop / Rock / Funk",
    tags: ["funk", "rock", "pop", "soundtrack"],
    mood: "euphoric",
    curator_note: "A soundtrack that outgrew its film — Minneapolis funk arena rock, immaculate from first snare to last chord."
  },
  {
    artist: "Michael Jackson",
    title: "Thriller",
    release_date: "1982-11-30",
    genre: "Pop / R&B / Funk",
    tags: ["pop", "r&b", "funk", "quincy-jones"],
    mood: "energetic",
    curator_note: "Nine tracks, seven singles, one moonwalk — Quincy and Michael's perfectly engineered empire."
  },
  {
    artist: "Madonna",
    title: "Like a Prayer",
    release_date: "1989-03-21",
    genre: "Pop",
    tags: ["pop", "dance", "80s"],
    mood: "euphoric",
    curator_note: "The moment Madonna became an album artist — confession, gospel and controversy in one."
  },
  {
    artist: "Kate Bush",
    title: "Hounds of Love",
    release_date: "1985-09-16",
    genre: "Art Pop",
    tags: ["art-pop", "uk", "concept-album"],
    mood: "cinematic",
    curator_note: "Side one is perfect pop; side two is a drowning. Fairlight synths and total conviction."
  },
  {
    artist: "Brian Eno",
    title: "Ambient 1: Music for Airports",
    release_date: "1978-03-01",
    genre: "Ambient",
    tags: ["ambient", "generative", "minimalism"],
    mood: "ambient",
    curator_note: "The founding document of ambient music — loops built to be heard a hundred times, or not at all."
  },
  {
    artist: "Kraftwerk",
    title: "Trans-Europe Express",
    release_date: "1977-03-01",
    genre: "Electronic",
    tags: ["electronic", "krautrock", "synth"],
    mood: "hypnotic",
    curator_note: "Europe's electronic brothers seeding hip-hop, techno and every synth riff since from one train window."
  },
  {
    artist: "Aphex Twin",
    title: "Selected Ambient Works 85–92",
    release_date: "1992-11-09",
    genre: "Electronic / Ambient Techno",
    tags: ["electronic", "idm", "ambient", "techno"],
    mood: "ambient",
    curator_note: "A teenager's bedroom tapes that defined IDM — beautiful, patient, and slightly menacing."
  },
  {
    artist: "Massive Attack",
    title: "Blue Lines",
    release_date: "1991-04-08",
    genre: "Trip-Hop",
    tags: ["trip-hop", "bristol", "electronic"],
    mood: "cinematic",
    curator_note: "Trip-hop invented in a Bristol kitchen — hip-hop tempo, soul heart, dub shadows."
  },
  {
    artist: "Portishead",
    title: "Dummy",
    release_date: "1994-08-22",
    genre: "Trip-Hop",
    tags: ["trip-hop", "bristol", "cinematic"],
    mood: "melancholic",
    curator_note: "Beth Gibbons' cracked soul over spy-film turntablism — the sound of beautiful dread."
  },
  {
    artist: "Radiohead",
    title: "OK Computer",
    release_date: "1997-05-21",
    genre: "Alternative Rock / Art Rock",
    tags: ["alt-rock", "art-rock", "anxiety"],
    mood: "cinematic",
    curator_note: "Pre-millennial tension in three guitars and a detached calm — the last great rock statement of its century."
  },
  {
    artist: "Radiohead",
    title: "Kid A",
    release_date: "2000-10-02",
    genre: "Electronic / Experimental",
    tags: ["electronic", "experimental", "art-rock"],
    mood: "ambient",
    curator_note: "Rock's biggest band deletes itself — no singles, no guitars, no explanation. Somehow their best."
  },
  {
    artist: "A Tribe Called Quest",
    title: "The Low End Theory",
    release_date: "1991-09-24",
    genre: "Hip-Hop / Jazz Rap",
    tags: ["hip-hop", "jazz-rap", "native-tongues"],
    mood: "hypnotic",
    curator_note: "Ron Carter's bass meets Q-Tip's whisper — jazz rap's perfect thirty-seven minutes."
  },
  {
    artist: "Wu-Tang Clan",
    title: "Enter the Wu-Tang (36 Chambers)",
    release_date: "1993-11-09",
    genre: "Hip-Hop / East Coast",
    tags: ["hip-hop", "boom-bap", "staten-island"],
    mood: "raw",
    curator_note: "Nine MCs, one kung-fu plot, and RZA's dusty loops — nothing in rap was ever this cinematic again."
  },
  {
    artist: "Lauryn Hill",
    title: "The Miseducation of Lauryn Hill",
    release_date: "1998-08-25",
    genre: "R&B / Soul / Hip-Hop",
    tags: ["r&b", "neo-soul", "hip-hop", "grammy-winner"],
    mood: "tender",
    curator_note: "One album, ten Grammys' worth — hip-hop, soul and heartbreak reconciled in a New Jersey classroom."
  },
  {
    artist: "OutKast",
    title: "Speakerboxxx/The Love Below",
    release_date: "2003-09-23",
    genre: "Hip-Hop / Funk / Pop",
    tags: ["hip-hop", "atlanta", "double-album", "grammy-winner"],
    mood: "euphoric",
    curator_note: "Two solo albums in one sleeve — Big Boi's funk sermon and André's funk elegy. The South had something to say."
  },
  {
    artist: "Kanye West",
    title: "My Beautiful Dark Twisted Fantasy",
    release_date: "2010-11-22",
    genre: "Hip-Hop / Art Rap",
    tags: ["hip-hop", "maximalism", "art-rap"],
    mood: "cinematic",
    curator_note: "Exile in Hawaii, a thousand collaborators, one ego — maximalism that earned every excess."
  },
  {
    artist: "Kendrick Lamar",
    title: "To Pimp a Butterfly",
    release_date: "2015-03-15",
    genre: "Hip-Hop / Jazz Rap / Funk",
    tags: ["hip-hop", "jazz-rap", "funk", "west-coast"],
    mood: "cinematic",
    curator_note: "Compton meets Parliament and Coltrane — the greatest rap album of the century so far, poem by poem."
  },
  {
    artist: "Beyoncé",
    title: "Lemonade",
    release_date: "2016-04-23",
    genre: "R&B / Pop",
    tags: ["r&b", "pop", "visual-album"],
    mood: "raw",
    curator_note: "A betrayal turned into a 65-minute film and a genre tour — country, rock, reggae, all hers."
  },
  {
    artist: "Frank Ocean",
    title: "Blonde",
    release_date: "2016-08-20",
    genre: "R&B / Alternative",
    tags: ["r&b", "alternative", "experimental"],
    mood: "melancholic",
    curator_note: "Voice, guitar and silence — the most influential R&B album of its decade, and the least interested in radio."
  },
  {
    artist: "SZA",
    title: "SOS",
    release_date: "2022-12-09",
    genre: "R&B",
    tags: ["r&b", "pop", "grammy-winner"],
    mood: "melancholic",
    curator_note: "A distress letter from the middle of the ocean — revenge, self-loathing and pop in perfect ratio."
  },
  {
    artist: "D'Angelo",
    title: "Voodoo",
    release_date: "2000-01-25",
    genre: "Neo-Soul / Funk",
    tags: ["neo-soul", "funk", "soul"],
    mood: "hypnotic",
    curator_note: "The Roots' rhythm section drags soul a half-beat behind — one take, one groove, untouchable."
  },
  {
    artist: "Erykah Badu",
    title: "Baduizm",
    release_date: "1997-02-11",
    genre: "Neo-Soul",
    tags: ["neo-soul", "dallas", "soul"],
    mood: "tender",
    curator_note: "Neo-soul's opening statement — headwrap jazz and incense that launched a thousand open mics."
  },
  {
    artist: "J Dilla",
    title: "Donuts",
    release_date: "2006-02-07",
    genre: "Hip-Hop / Instrumental",
    tags: ["hip-hop", "instrumental", "beats", "detroit"],
    mood: "melancholic",
    curator_note: "Made in a hospital bed in his final months — thirty-one loops that rewired how producers think."
  },
  {
    artist: "Tyler, The Creator",
    title: "IGOR",
    release_date: "2019-05-17",
    genre: "Hip-Hop / Neo-Soul / Pop",
    tags: ["hip-hop", "neo-soul", "pop", "synth"],
    mood: "melancholic",
    curator_note: "A synth-voiced heartbreak musical — persona, pitch-shift and perfect songwriting on one album."
  },
  {
    artist: "Burial",
    title: "Untrue",
    release_date: "2007-11-05",
    genre: "Electronic / Dubstep",
    tags: ["electronic", "dubstep", "uk", "london"],
    mood: "melancholic",
    curator_note: "London at 3am — crackled voices, rave ghosts, rain on the bus shelter. Dubstep's only masterpiece."
  },
  {
    artist: "Daft Punk",
    title: "Discovery",
    release_date: "2001-03-12",
    genre: "Electronic / House",
    tags: ["electronic", "house", "filter-disco"],
    mood: "euphoric",
    curator_note: "Robot voices, Auto-Tuned heartbreak and the filter house that soundtracked two decades of neon."
  },
  {
    artist: "The Strokes",
    title: "Is This It",
    release_date: "2001-07-30",
    genre: "Indie Rock / Garage Rock Revival",
    tags: ["indie", "garage-rock", "nyc"],
    mood: "energetic",
    curator_note: "Eleven scrappy, perfect songs that ended nu-metal and restarted guitar music overnight."
  },
  {
    artist: "The White Stripes",
    title: "Elephant",
    release_date: "2003-04-01",
    genre: "Garage Rock",
    tags: ["garage-rock", "blues", "detroit"],
    mood: "raw",
    curator_note: "Two people, one riff, no bass — recorded in ten days on equipment from the seventies."
  },
  {
    artist: "Arcade Fire",
    title: "Funeral",
    release_date: "2004-09-14",
    genre: "Indie Rock / Baroque Pop",
    tags: ["indie", "baroque-pop", "montreal"],
    mood: "euphoric",
    curator_note: "Grief for their elders turned into the most life-affirming indie album of the 2000s."
  },
  {
    artist: "Sufjan Stevens",
    title: "Illinois",
    release_date: "2005-07-05",
    genre: "Indie Folk / Chamber Pop",
    tags: ["indie-folk", "chamber-pop", "concept-album"],
    mood: "melancholic",
    curator_note: "A state history as tone poem — serial killers, Superman and Casimir Pulaski Day, all devastated."
  },
  {
    artist: "Bon Iver",
    title: "For Emma, Forever Ago",
    release_date: "2008-02-19",
    genre: "Indie Folk",
    tags: ["indie-folk", "cabin-folk", "wisconsin"],
    mood: "tender",
    curator_note: "A broken heart in a Wisconsin cabin — one voice layered until it becomes a forest."
  },
  {
    artist: "Sonic Youth",
    title: "Daydream Nation",
    release_date: "1988-10-03",
    genre: "Noise Rock / Alternative",
    tags: ["noise-rock", "alt-rock", "nyc"],
    mood: "raw",
    curator_note: "Two guitars tuned to their own rules across a double album — the underground's high-water mark."
  },
  {
    artist: "Pixies",
    title: "Doolittle",
    release_date: "1989-04-18",
    genre: "Alternative Rock",
    tags: ["alt-rock", "boston", "loud-quiet-loud"],
    mood: "energetic",
    curator_note: "Loud-quiet-loud, Spanish and screams — Cobain's favourite band for a reason."
  },
  {
    artist: "R.E.M.",
    title: "Automatic for the People",
    release_date: "1992-10-05",
    genre: "Alternative Rock",
    tags: ["alt-rock", "athens", "orchestral"],
    mood: "melancholic",
    curator_note: "Mortality, strings and Stipe's clearest writing — the mandolin album that towered over grunge."
  },
  {
    artist: "Beck",
    title: "Odelay",
    release_date: "1996-06-18",
    genre: "Alternative / Sampledelia",
    tags: ["alt-rock", "sampledelia", "dust-brothers"],
    mood: "energetic",
    curator_note: "Two turntables and a broken folkie — the Dust Brothers collage where the nineties cut loose."
  },
  {
    artist: "Björk",
    title: "Homogenic",
    release_date: "1997-09-22",
    genre: "Art Pop / Electronic",
    tags: ["art-pop", "electronic", "iceland"],
    mood: "cinematic",
    curator_note: "Icelandic string storms over electronic glaciers — emotional extremes at full resolution."
  },
  {
    artist: "Solange",
    title: "A Seat at the Table",
    release_date: "2016-09-30",
    genre: "R&B / Art Pop",
    tags: ["r&b", "art-pop", "neo-soul"],
    mood: "tender",
    curator_note: "Protest as self-care — interludes, devotion and a quiet refusal to perform for anyone."
  },
  {
    artist: "Kacey Musgraves",
    title: "Golden Hour",
    release_date: "2018-03-30",
    genre: "Country / Country Pop",
    tags: ["country", "pop", "grammy-winner"],
    mood: "euphoric",
    curator_note: "Nashville meets the disco ball — a falling-back-in-love album that won everything."
  },
  {
    artist: "Tame Impala",
    title: "Currents",
    release_date: "2015-07-17",
    genre: "Psychedelic Pop",
    tags: ["psychedelic", "pop", "australia"],
    mood: "hypnotic",
    curator_note: "One man, one breakup, every keyboard in Perth — the moment psych became pop's production language."
  },
  {
    artist: "Doja Cat",
    title: "Planet Her",
    release_date: "2021-06-25",
    genre: "Pop / R&B",
    tags: ["pop", "r&b", "dance"],
    mood: "euphoric",
    curator_note: "A whole planet of hooks — rap, disco and balladry, all delivered with a raised eyebrow."
  },
  {
    artist: "Steve Lacy",
    title: "Gemini Rights",
    release_date: "2022-06-29",
    genre: "R&B / Funk / Indie",
    tags: ["r&b", "funk", "indie", "grammy-winner"],
    mood: "euphoric",
    curator_note: "The Internet's guitarist makes funk-pop sunshine for a generation raised on playlists."
  },
  {
    artist: "Fred again..",
    title: "Actual Life 3",
    release_date: "2022-10-28",
    genre: "Electronic / House",
    tags: ["electronic", "house", "uk", "dance"],
    mood: "euphoric",
    curator_note: "Voicemails and crowd chants turned into church — dance music as diary, grief and joy at 128bpm."
  }
];

export const EXPANSION3: Release[] = ENTRIES.map((e, i) => ({
  id: `exp3-${String(i).padStart(3, "0")}`,
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
}));





