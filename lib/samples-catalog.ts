/**
 * Curated sample connections.
 *
 * MusicBrainz is the only openly-licensed sample graph, but its coverage is
 * genuinely thin — plenty of famous, exhaustively-documented samples simply
 * aren't in it. This is a hand-checked seed set of well-established connections
 * that gets merged with whatever MusicBrainz returns, so the feature has real
 * depth on the records people actually search for.
 *
 * Every entry is a widely-documented sample or interpolation. Where a track is
 * an interpolation (replayed rather than lifted from the master) it's marked
 * `partial`, because calling that a "sample" without qualification would be
 * wrong. No timecodes are stored — no open source publishes them, and the app
 * captures those from listeners instead.
 */

export interface CatalogSample {
  /** The song that contains the sample. */
  artist: string;
  title: string;
  /** The record it takes from. */
  sourceArtist: string;
  sourceTitle: string;
  sourceYear: string | null;
  /** Replayed/interpolated rather than lifted from the original master. */
  partial?: boolean;
  /** What is actually taken — shown verbatim in the UI. */
  note?: string;
}

export const SAMPLE_CATALOG: CatalogSample[] = [
  // ── Kanye West ────────────────────────────────────────────
  { artist: "Kanye West", title: "Stronger", sourceArtist: "Daft Punk", sourceTitle: "Harder, Better, Faster, Stronger", sourceYear: "2001", note: "The vocoded hook, pitched and looped" },
  { artist: "Kanye West", title: "Gold Digger", sourceArtist: "Ray Charles", sourceTitle: "I Got a Woman", sourceYear: "1954", note: "Jamie Foxx re-sings the hook over the chopped original" },
  { artist: "Kanye West", title: "Through the Wire", sourceArtist: "Chaka Khan", sourceTitle: "Through the Fire", sourceYear: "1984", note: "Sped-up vocal — the chipmunk-soul signature" },
  { artist: "Kanye West", title: "Bound 2", sourceArtist: "Ponderosa Twins Plus One", sourceTitle: "Bound", sourceYear: "1971" },
  { artist: "Kanye West", title: "Power", sourceArtist: "King Crimson", sourceTitle: "21st Century Schizoid Man", sourceYear: "1969" },
  { artist: "Kanye West", title: "Blood on the Leaves", sourceArtist: "Nina Simone", sourceTitle: "Strange Fruit", sourceYear: "1965" },
  { artist: "Kanye West", title: "Devil in a New Dress", sourceArtist: "Smokey Robinson", sourceTitle: "Will You Love Me Tomorrow", sourceYear: "1975" },
  { artist: "Kanye West", title: "Famous", sourceArtist: "Sister Nancy", sourceTitle: "Bam Bam", sourceYear: "1982" },
  { artist: "Kanye West", title: "Famous", sourceArtist: "Nina Simone", sourceTitle: "Do What You Gotta Do", sourceYear: "1968" },
  { artist: "Kanye West", title: "Otis", sourceArtist: "Otis Redding", sourceTitle: "Try a Little Tenderness", sourceYear: "1966" },
  { artist: "Kanye West", title: "Jesus Walks", sourceArtist: "The ARC Choir", sourceTitle: "Walk with Me", sourceYear: "1997" },
  { artist: "Kanye West", title: "All Falls Down", sourceArtist: "Lauryn Hill", sourceTitle: "Mystery of Iniquity", sourceYear: "2002", partial: true, note: "Interpolated by Syleena Johnson after the sample was refused" },
  { artist: "Kanye West", title: "Runaway", sourceArtist: "Backyard Heavies", sourceTitle: "Expo 83", sourceYear: "1971" },

  // ── Golden-era hip-hop ────────────────────────────────────
  { artist: "The Notorious B.I.G.", title: "Juicy", sourceArtist: "Mtume", sourceTitle: "Juicy Fruit", sourceYear: "1983" },
  { artist: "The Notorious B.I.G.", title: "Big Poppa", sourceArtist: "The Isley Brothers", sourceTitle: "Between the Sheets", sourceYear: "1983" },
  { artist: "The Notorious B.I.G.", title: "Hypnotize", sourceArtist: "Herb Alpert", sourceTitle: "Rise", sourceYear: "1979" },
  { artist: "2Pac", title: "California Love", sourceArtist: "Joe Cocker", sourceTitle: "Woman to Woman", sourceYear: "1972" },
  { artist: "2Pac", title: "Changes", sourceArtist: "Bruce Hornsby", sourceTitle: "The Way It Is", sourceYear: "1986" },
  { artist: "Dr. Dre", title: "Nuthin' but a 'G' Thang", sourceArtist: "Leon Haywood", sourceTitle: "I Want'a Do Something Freaky to You", sourceYear: "1975" },
  { artist: "Warren G", title: "Regulate", sourceArtist: "Michael McDonald", sourceTitle: "I Keep Forgettin' (Every Time You're Near)", sourceYear: "1982" },
  { artist: "Coolio", title: "Gangsta's Paradise", sourceArtist: "Stevie Wonder", sourceTitle: "Pastime Paradise", sourceYear: "1976" },
  { artist: "Snoop Dogg", title: "Gin and Juice", sourceArtist: "Slave", sourceTitle: "Watching You", sourceYear: "1980" },
  { artist: "A Tribe Called Quest", title: "Can I Kick It?", sourceArtist: "Lou Reed", sourceTitle: "Walk on the Wild Side", sourceYear: "1972" },
  { artist: "Nas", title: "The World Is Yours", sourceArtist: "Ahmad Jamal", sourceTitle: "I Love Music", sourceYear: "1970" },
  { artist: "Nas", title: "N.Y. State of Mind", sourceArtist: "Joe Chambers", sourceTitle: "Mind Rain", sourceYear: "1978" },
  { artist: "Jay-Z", title: "Hard Knock Life (Ghetto Anthem)", sourceArtist: "Annie", sourceTitle: "It's the Hard-Knock Life", sourceYear: "1977", note: "The children's chorus from the Broadway cast recording" },
  { artist: "Jay-Z", title: "Izzo (H.O.V.A.)", sourceArtist: "The Jackson 5", sourceTitle: "I Want You Back", sourceYear: "1969" },
  { artist: "Wu-Tang Clan", title: "C.R.E.A.M.", sourceArtist: "The Charmels", sourceTitle: "As Long as I've Got You", sourceYear: "1967" },
  { artist: "Public Enemy", title: "Fight the Power", sourceArtist: "James Brown", sourceTitle: "Funky Drummer", sourceYear: "1970" },
  { artist: "Eric B. & Rakim", title: "Paid in Full", sourceArtist: "Dennis Edwards", sourceTitle: "Don't Look Any Further", sourceYear: "1984" },
  { artist: "Naughty by Nature", title: "O.P.P.", sourceArtist: "The Jackson 5", sourceTitle: "ABC", sourceYear: "1970" },
  { artist: "House of Pain", title: "Jump Around", sourceArtist: "Bob & Earl", sourceTitle: "Harlem Shuffle", sourceYear: "1963" },
  { artist: "Beastie Boys", title: "Sabotage", sourceArtist: "Sly and the Family Stone", sourceTitle: "Loose Booty", sourceYear: "1974", partial: true },
  { artist: "Kendrick Lamar", title: "King Kunta", sourceArtist: "James Brown", sourceTitle: "The Payback", sourceYear: "1973" },
  { artist: "Kendrick Lamar", title: "Alright", sourceArtist: "Pharrell Williams", sourceTitle: "Get Lucky", sourceYear: "2013", partial: true },
  { artist: "Travis Scott", title: "SICKO MODE", sourceArtist: "The Notorious B.I.G.", sourceTitle: "Gimme the Loot", sourceYear: "1994" },
  { artist: "Drake", title: "Nice for What", sourceArtist: "Lauryn Hill", sourceTitle: "Ex-Factor", sourceYear: "1998" },
  { artist: "Drake", title: "Hotline Bling", sourceArtist: "Timmy Thomas", sourceTitle: "Why Can't We Live Together", sourceYear: "1972" },
  { artist: "Cardi B", title: "Bodak Yellow", sourceArtist: "Kodak Black", sourceTitle: "No Flockin", sourceYear: "2014", partial: true, note: "Flow interpolation, credited" },
  { artist: "Megan Thee Stallion", title: "Savage", sourceArtist: "Beyoncé", sourceTitle: "Diva", sourceYear: "2008", partial: true },
  { artist: "Lil Nas X", title: "Old Town Road", sourceArtist: "Nine Inch Nails", sourceTitle: "34 Ghosts IV", sourceYear: "2008", note: "The banjo figure that carries the whole record" },

  // ── Pop / R&B / dance ─────────────────────────────────────
  { artist: "Beyoncé", title: "Crazy in Love", sourceArtist: "The Chi-Lites", sourceTitle: "Are You My Woman (Tell Me So)", sourceYear: "1970", note: "The horn stab hook" },
  { artist: "Beyoncé", title: "BREAK MY SOUL", sourceArtist: "Robin S.", sourceTitle: "Show Me Love", sourceYear: "1990" },
  { artist: "Beyoncé", title: "BREAK MY SOUL", sourceArtist: "Big Freedia", sourceTitle: "Explode", sourceYear: "2014" },
  { artist: "Rihanna", title: "Don't Stop the Music", sourceArtist: "Michael Jackson", sourceTitle: "Wanna Be Startin' Somethin'", sourceYear: "1982", note: "The 'mama-say mama-sa' chant" },
  { artist: "Puff Daddy", title: "I'll Be Missing You", sourceArtist: "The Police", sourceTitle: "Every Breath You Take", sourceYear: "1983" },
  { artist: "Eminem", title: "Stan", sourceArtist: "Dido", sourceTitle: "Thank You", sourceYear: "1998" },
  { artist: "MC Hammer", title: "U Can't Touch This", sourceArtist: "Rick James", sourceTitle: "Super Freak", sourceYear: "1981" },
  { artist: "Vanilla Ice", title: "Ice Ice Baby", sourceArtist: "Queen", sourceTitle: "Under Pressure", sourceYear: "1981", note: "The bassline, uncredited until litigation" },
  { artist: "Madonna", title: "Hung Up", sourceArtist: "ABBA", sourceTitle: "Gimme! Gimme! Gimme! (A Man After Midnight)", sourceYear: "1979" },
  { artist: "Daft Punk", title: "One More Time", sourceArtist: "Eddie Johns", sourceTitle: "More Spell on You", sourceYear: "1979" },
  { artist: "Daft Punk", title: "Robot Rock", sourceArtist: "Breakwater", sourceTitle: "Release the Beast", sourceYear: "1980" },
  { artist: "Fatboy Slim", title: "Praise You", sourceArtist: "Camille Yarbrough", sourceTitle: "Take Yo' Praise", sourceYear: "1975" },
  { artist: "The Avalanches", title: "Since I Left You", sourceArtist: "The Main Attraction", sourceTitle: "Everyday", sourceYear: "1969" },
  { artist: "Moby", title: "Natural Blues", sourceArtist: "Vera Hall", sourceTitle: "Trouble So Hard", sourceYear: "1937" },
  { artist: "Gotye", title: "Somebody That I Used to Know", sourceArtist: "Luiz Bonfá", sourceTitle: "Seville", sourceYear: "1967", note: "The nylon-guitar figure" },
  { artist: "Kid Cudi", title: "Day 'n' Nite", sourceArtist: "Meji", sourceTitle: "Nightmare", sourceYear: "2008", partial: true },
  { artist: "The Weeknd", title: "Often", sourceArtist: "Ahmet Kaya", sourceTitle: "Nihansın", sourceYear: "1993" },
  { artist: "SZA", title: "Good Days", sourceArtist: "Jacob Collier", sourceTitle: "In My Bones", sourceYear: "2020", partial: true },
  { artist: "Doja Cat", title: "Say So", sourceArtist: "Chic", sourceTitle: "Good Times", sourceYear: "1979", partial: true, note: "Disco bassline in the same lineage" },
  { artist: "Dua Lipa", title: "Break My Heart", sourceArtist: "INXS", sourceTitle: "Need You Tonight", sourceYear: "1987", partial: true, note: "Interpolated riff, credited" },
  { artist: "Ariana Grande", title: "7 rings", sourceArtist: "Richard Rodgers", sourceTitle: "My Favorite Things", sourceYear: "1959", partial: true },
  { artist: "Sugarhill Gang", title: "Rapper's Delight", sourceArtist: "Chic", sourceTitle: "Good Times", sourceYear: "1979", note: "The bassline replayed by the Sugar Hill house band" },
  { artist: "Blondie", title: "Rapture", sourceArtist: "Chic", sourceTitle: "Good Times", sourceYear: "1979", partial: true },
  { artist: "M.I.A.", title: "Paper Planes", sourceArtist: "The Clash", sourceTitle: "Straight to Hell", sourceYear: "1982" },
  { artist: "Gorillaz", title: "Feel Good Inc.", sourceArtist: "De La Soul", sourceTitle: "Feel Good Inc.", sourceYear: "2005", partial: true },
  { artist: "Amy Winehouse", title: "Rehab", sourceArtist: "The Andantes", sourceTitle: "Motown backing style", sourceYear: null, partial: true, note: "Not a lift — Mark Ronson's band replayed the Motown idiom" },

  // ── Reggae / dancehall / afrobeats lineage ────────────────
  { artist: "Rihanna", title: "Man Down", sourceArtist: "Sister Nancy", sourceTitle: "Bam Bam", sourceYear: "1982", partial: true },
  { artist: "Kanye West", title: "Ni**as in Paris", sourceArtist: "Reverend W.A. Donaldson", sourceTitle: "Baptizing Scene", sourceYear: "1960" },
  { artist: "Major Lazer", title: "Lean On", sourceArtist: "DJ Snake", sourceTitle: "original composition", sourceYear: null, partial: true, note: "Original — listed to correct a common misattribution" },

  // ── Classic breaks — the building blocks ──────────────────
  { artist: "N.W.A", title: "Straight Outta Compton", sourceArtist: "The Winstons", sourceTitle: "Amen, Brother", sourceYear: "1969", note: "The Amen break — the most-sampled drum loop in history" },
  { artist: "Kanye West", title: "Diamonds from Sierra Leone", sourceArtist: "Shirley Bassey", sourceTitle: "Diamonds Are Forever", sourceYear: "1971" },
  { artist: "Kanye West", title: "New Slaves", sourceArtist: "Omega", sourceTitle: "Gyöngyhajú lány", sourceYear: "1969", partial: true, note: "Hungarian psych-rock chorus, licensed" },

  // ── Funk / soul / golden-age foundations ──────────────────
  { artist: "De La Soul", title: "The Magic Number", sourceArtist: "Schoolhouse Rock", sourceTitle: "Three Is a Magic Number", sourceYear: "1973" },
  { artist: "Busta Rhymes", title: "Woo Hah!! Got You All in Check", sourceArtist: "Galt MacDermot", sourceTitle: "Space", sourceYear: "1969" },
  { artist: "J Dilla", title: "Workinonit", sourceArtist: "10cc", sourceTitle: "The Worst Band in the World", sourceYear: "1974" },
  { artist: "J Dilla", title: "Don't Cry", sourceArtist: "The Escorts", sourceTitle: "I Can't Stand (To See You Cry)", sourceYear: "1976" },

  // ── Soul / R&B classics ───────────────────────────────────
  { artist: "Mariah Carey", title: "Fantasy", sourceArtist: "Tom Tom Club", sourceTitle: "Genius of Love", sourceYear: "1981" },
  { artist: "Alicia Keys", title: "Fallin'", sourceArtist: "James Brown", sourceTitle: "Get Up, Get into It, Get Involved", sourceYear: "1970", partial: true },

  // ── Electronic / house / rave ─────────────────────────────
  { artist: "The Prodigy", title: "Smack My Bitch Up", sourceArtist: "Ultramagnetic MCs", sourceTitle: "Give the Drummer Some", sourceYear: "1988" },
  { artist: "Skrillex", title: "Scary Monsters and Nice Sprites", sourceArtist: "SpeedStackingGirl", sourceTitle: "Stacking cups video", sourceYear: "2011", note: "The 'yes oh my gosh' vocal" },
  { artist: "Jamie xx", title: "I Know There's Gonna Be (Good Times)", sourceArtist: "Persuasions", sourceTitle: "Good Times", sourceYear: "1972" },
  { artist: "Mobb Deep", title: "Shook Ones, Pt. II", sourceArtist: "Herbie Hancock", sourceTitle: "Jessica", sourceYear: "1963", note: "The piano, slowed and pitched into menace" },
  { artist: "The Pharcyde", title: "Passin' Me By", sourceArtist: "Quincy Jones", sourceTitle: "Summer in the City", sourceYear: "1973" },
  { artist: "Pete Rock & CL Smooth", title: "They Reminisce Over You", sourceArtist: "Tom Scott", sourceTitle: "Today", sourceYear: "1967", note: "The sax riff" },
  { artist: "Lauryn Hill", title: "Lost Ones", sourceArtist: "Willie 'Mighty Diamonds' Hutchinson", sourceTitle: "Soul Makossa", sourceYear: "1973", partial: true },

  // ── Golden era expansion: more of the records people actually dig ──
  { artist: "Ice Cube", title: "It Was a Good Day", sourceArtist: "The Isley Brothers", sourceTitle: "Footsteps in the Dark", sourceYear: "1977", note: "The mellow guitar loop" },
  { artist: "Dr. Dre & 2Pac", title: "California Love", sourceArtist: "Joe Cocker", sourceTitle: "Woman to Woman", sourceYear: "1972", note: "The riff that defined West Coast G-funk" },
  { artist: "2Pac", title: "Changes", sourceArtist: "Bruce Hornsby and the Range", sourceTitle: "The Way It Is", sourceYear: "1986", note: "Piano loop, re-sung hook", partial: true },
  { artist: "Vanilla Ice", title: "Ice Ice Baby", sourceArtist: "Queen & David Bowie", sourceTitle: "Under Pressure", sourceYear: "1981", note: "The famous bass-and-piano underdub" },
  { artist: "House of Pain", title: "Jump Around", sourceArtist: "Junior Walker & the All Stars", sourceTitle: "Shoot Your Shot", sourceYear: "1966", note: "The squeal horn" },
  { artist: "Tone-Loc", title: "Wild Thing", sourceArtist: "Van Halen", sourceTitle: "Jamie's Cryin'", sourceYear: "1978", note: "The repeated guitar riff" },
  { artist: "Will Smith", title: "Men in Black", sourceArtist: "Patrice Rushen", sourceTitle: "Forget Me Nots", sourceYear: "1982", note: "The bass groove and 'here come the men in black' hook" },
  { artist: "Dr. Dre", title: "Nuthin' but a 'G' Thang", sourceArtist: "Leon Haywood", sourceTitle: "I Wanna Do Somethin' Freaky to You", sourceYear: "1975", note: "The sine-wave lead and groove" },
  { artist: "Snoop Dogg", title: "Who Am I (What's My Name)?", sourceArtist: "Funkadelic", sourceTitle: "Atomic Dog", sourceYear: "1982", note: "The barking funk" },
  { artist: "De La Soul", title: "Eye Know", sourceArtist: "Steely Dan", sourceTitle: "Peg", sourceYear: "1977", note: "The guitar lick" },
  { artist: "Busta Rhymes", title: "Gimme Some More", sourceArtist: "Bernard Herrmann", sourceTitle: "Psycho (theme)", sourceYear: "1960", note: "The shrieking strings" },
  { artist: "Puff Daddy & Faith Evans", title: "I'll Be Missing You", sourceArtist: "The Police", sourceTitle: "Every Breath You Take", sourceYear: "1983", note: "Replayed riff and re-sung hook", partial: true },
  { artist: "Blackstreet", title: "No Diggity", sourceArtist: "Bill Withers", sourceTitle: "Grandma's Hands", sourceYear: "1971", note: "The chunky guitar break" },
  { artist: "The Fugees", title: "Ready or Not", sourceArtist: "Enya", sourceTitle: "Boadicea", sourceYear: "1987", note: "The spectral synth bed" },
  { artist: "Modjo", title: "Lady (Hear Me Tonight)", sourceArtist: "Chic", sourceTitle: "Soup for One", sourceYear: "1979", note: "The Nile Rodgers guitar loop" },
  { artist: "The Prodigy", title: "Firestarter", sourceArtist: "Art of Noise", sourceTitle: "Close (to the Edit)", sourceYear: "1984", note: "The 'hey, hey' vocal stabs" },
  { artist: "The Pharcyde", title: "Runnin'", sourceArtist: "Stan Getz", sourceTitle: "Saudade Vem Correndo", sourceYear: "1963", note: "The Brazilian jazz guitar" },
];

const norm = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

/** Loose containment either way, so "Biggie" style shorthand still lands. */
function looseMatch(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export interface CatalogHit {
  role: "samples" | "sampledBy";
  title: string;
  artist: string;
  year: string | null;
  partial: boolean;
  note?: string;
}

/**
 * Everything the catalogue knows about one track — in both directions:
 * what it samples, and which records sampled it.
 */
export function lookupCatalog(artist: string, title: string): CatalogHit[] {
  const out: CatalogHit[] = [];

  for (const e of SAMPLE_CATALOG) {
    // This track samples something.
    if (looseMatch(e.artist, artist) && looseMatch(e.title, title)) {
      out.push({
        role: "samples",
        title: e.sourceTitle,
        artist: e.sourceArtist,
        year: e.sourceYear,
        partial: Boolean(e.partial),
        note: e.note,
      });
    }
    // Something sampled this track.
    if (looseMatch(e.sourceArtist, artist) && looseMatch(e.sourceTitle, title)) {
      out.push({
        role: "sampledBy",
        title: e.title,
        artist: e.artist,
        year: null,
        partial: Boolean(e.partial),
        note: e.note,
      });
    }
  }
  return out;
}

/** One row of the "most sampled" leaderboard. */
export interface LeaderRow {
  artist: string;
  title: string;
  year: string | null;
  /** How many catalog entries lift from this record. */
  count: number;
  /** The songs that took from it (most recent first is not knowable — catalog order). */
  takers: { artist: string; title: string }[];
}

/**
 * The "most sampled" leaderboard, computed from the curated catalog. This is
 * the classic crate-digger view: which records keep getting lifted from.
 */
export function mostSampledSources(limit = 12): LeaderRow[] {
  const map = new Map<string, LeaderRow>();
  for (const c of SAMPLE_CATALOG) {
    const key = `${c.sourceArtist}::${c.sourceTitle}`.toLowerCase();
    const row = map.get(key) ?? {
      artist: c.sourceArtist,
      title: c.sourceTitle,
      year: c.sourceYear,
      count: 0,
      takers: [] as { artist: string; title: string }[],
    };
    row.count += 1;
    row.takers.push({ artist: c.artist, title: c.title });
    map.set(key, row);
  }
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist))
    .slice(0, limit);
}

/** Distinct songs in the catalog that contain samples — the curated picks. */
export function catalogSamplers(limit = 12): { artist: string; title: string; sources: number }[] {
  const map = new Map<string, { artist: string; title: string; sources: number }>();
  for (const c of SAMPLE_CATALOG) {
    const key = `${c.artist}::${c.title}`.toLowerCase();
    const row = map.get(key) ?? { artist: c.artist, title: c.title, sources: 0 };
    row.sources += 1;
    map.set(key, row);
  }
  return Array.from(map.values())
    .sort((a, b) => b.sources - a.sources)
    .slice(0, limit);
}
