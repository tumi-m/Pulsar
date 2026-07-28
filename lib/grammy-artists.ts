/**
 * Grammy-winning artists (any category), 1967 → today.
 *
 * This is the built-in seed list so the feature works with zero setup. It is
 * deliberately weighted toward winners with a real streaming catalogue —
 * the awards also honour engineers, producers, liner-note authors, classical
 * soloists, comedians and spoken-word artists, many of whom have nothing to
 * pull a discography from.
 *
 * To replace this with the COMPLETE machine-generated set (every winner in
 * every category, straight from Wikidata):
 *
 *     npm run grammy
 *
 * which rewrites this file via scripts/fetch-grammy-artists.ts.
 */

export const GRAMMY_ARTISTS: string[] = [
  // ── 1960s–70s ────────────────────────────────────────────────
  "The Beatles", "Aretha Franklin", "Ray Charles", "Frank Sinatra", "Ella Fitzgerald",
  "Simon & Garfunkel", "The 5th Dimension", "Blood, Sweat & Tears", "Crosby, Stills & Nash",
  "Bobbie Gentry", "Glen Campbell", "Johnny Cash", "Wes Montgomery", "Duke Ellington",
  "Count Basie", "Miles Davis", "Bill Evans", "Stan Getz", "Quincy Jones", "Herbie Hancock",
  "Isaac Hayes", "Marvin Gaye", "Stevie Wonder", "The Carpenters", "Roberta Flack",
  "Carole King", "James Taylor", "Joni Mitchell", "Paul McCartney", "John Lennon",
  "George Harrison", "Elton John", "Led Zeppelin", "The Rolling Stones", "The Who",
  "Pink Floyd", "David Bowie", "Rod Stewart", "Eagles", "Fleetwood Mac", "Steely Dan",
  "Chicago", "Santana", "Earth, Wind & Fire", "The Isley Brothers", "Al Green",
  "Curtis Mayfield", "Bill Withers", "Gladys Knight & The Pips", "The O'Jays",
  "Barbra Streisand", "Neil Diamond", "Billy Joel", "Bruce Springsteen", "Bob Dylan",
  "Van Morrison", "Jackson Browne", "Linda Ronstadt", "Emmylou Harris", "Dolly Parton",
  "Willie Nelson", "Waylon Jennings", "Merle Haggard", "Loretta Lynn", "Charlie Rich",
  "Olivia Newton-John", "Donna Summer", "Bee Gees", "ABBA", "Boz Scaggs", "George Benson",
  "Chick Corea", "Weather Report", "Return to Forever", "Grover Washington Jr.",
  "Bob Marley & The Wailers", "Peter Frampton", "Aerosmith", "Queen", "Heart",
  "Kris Kristofferson", "Anne Murray", "Helen Reddy", "Roger Miller", "Jim Croce",

  // ── 1980s ────────────────────────────────────────────────────
  "Michael Jackson", "Prince", "Madonna", "Whitney Houston", "Tina Turner",
  "Lionel Richie", "Diana Ross", "Luther Vandross", "Anita Baker", "Sade",
  "Phil Collins", "Genesis", "Sting", "The Police", "U2", "Dire Straits",
  "Peter Gabriel", "Talking Heads", "Paul Simon", "Bonnie Raitt", "Tracy Chapman",
  "Suzanne Vega", "Cyndi Lauper", "Pat Benatar", "Bruce Hornsby", "Huey Lewis and the News",
  "Toto", "Foreigner", "Journey", "Bon Jovi", "Van Halen", "AC/DC", "Metallica",
  "Guns N' Roses", "Def Leppard", "Jethro Tull", "Rush", "The Cars", "Devo",
  "Kool & The Gang", "Ray Parker Jr.", "Rick James", "The Pointer Sisters",
  "Chaka Khan", "Patti LaBelle", "Natalie Cole", "Al Jarreau", "Manhattan Transfer",
  "Bobby McFerrin", "Take 6", "Wynton Marsalis", "Branford Marsalis", "Pat Metheny",
  "David Sanborn", "Spyro Gyra", "Yellowjackets", "Sarah Vaughan", "Joe Williams",
  "Willie Nelson", "Randy Travis", "George Strait", "Ricky Skaggs", "The Judds",
  "Reba McEntire", "Rosanne Cash", "k.d. lang", "Lyle Lovett", "Steve Earle",
  "Run-DMC", "LL Cool J", "Public Enemy", "DJ Jazzy Jeff & The Fresh Prince",

  // ── 1990s ────────────────────────────────────────────────────
  "Mariah Carey", "Celine Dion", "Alanis Morissette", "Sheryl Crow", "Sarah McLachlan",
  "Shawn Colvin", "Jewel", "Fiona Apple", "Paula Cole", "Shania Twain", "Faith Hill",
  "LeAnn Rimes", "Trisha Yearwood", "Vince Gill", "Alan Jackson", "Garth Brooks",
  "Mary Chapin Carpenter", "Alison Krauss", "Dixie Chicks", "Lucinda Williams",
  "Nirvana", "Pearl Jam", "Soundgarden", "Alice in Chains", "Stone Temple Pilots",
  "Smashing Pumpkins", "Red Hot Chili Peppers", "Radiohead", "Beck", "R.E.M.",
  "Green Day", "The Offspring", "No Doubt", "Blur", "Oasis", "Nine Inch Nails",
  "Tool", "Rage Against the Machine", "Korn", "Rob Zombie", "Ozzy Osbourne",
  "Eric Clapton", "Bonnie Raitt", "Melissa Etheridge", "Counting Crows",
  "Dave Matthews Band", "Hootie & the Blowfish", "Blues Traveler", "Spin Doctors",
  "Boyz II Men", "TLC", "En Vogue", "Toni Braxton", "Brandy", "Monica", "Mary J. Blige",
  "Erykah Badu", "Lauryn Hill", "Fugees", "The Notorious B.I.G.", "2Pac", "Nas",
  "Jay-Z", "Puff Daddy", "Wu-Tang Clan", "Dr. Dre", "Snoop Dogg", "Eminem",
  "Missy Elliott", "Busta Rhymes", "OutKast", "A Tribe Called Quest", "Arrested Development",
  "Coolio", "Naughty by Nature", "Salt-N-Pepa", "Queen Latifah", "Will Smith",
  "Ricky Martin", "Gloria Estefan", "Carlos Vives", "Juan Luis Guerra", "Buena Vista Social Club",
  "Los Lobos", "Selena", "Marc Anthony", "Jennifer Lopez",
  "Björk", "Portishead", "Massive Attack", "The Chemical Brothers", "The Prodigy",
  "Fatboy Slim", "Daft Punk", "Moby", "Underworld", "Aphex Twin",

  // ── 2000s ────────────────────────────────────────────────────
  "Norah Jones", "Alicia Keys", "John Mayer", "Amy Winehouse", "Adele", "Duffy",
  "Christina Aguilera", "Britney Spears", "Pink", "Kelly Clarkson", "Beyoncé",
  "Destiny's Child", "Usher", "Justin Timberlake", "Ne-Yo", "Chris Brown",
  "John Legend", "Maxwell", "D'Angelo", "Jill Scott", "India.Arie", "Angie Stone",
  "Kanye West", "Ludacris", "T.I.", "Lil Wayne", "50 Cent", "Nelly", "Common",
  "Talib Kweli", "Mos Def", "The Roots", "Black Eyed Peas", "Gnarls Barkley",
  "Coldplay", "Muse", "Arcade Fire", "The White Stripes", "The Black Keys",
  "Kings of Leon", "Foo Fighters", "Linkin Park", "Evanescence", "System of a Down",
  "Audioslave", "Slipknot", "Mastodon", "Dream Theater", "Iron Maiden", "Judas Priest",
  "U2", "Bruce Springsteen", "Bob Dylan", "Tom Petty", "Robert Plant",
  "Norah Jones", "Ray LaMontagne", "Jason Mraz", "Colbie Caillat", "Corinne Bailey Rae",
  "Michael Bublé", "Tony Bennett", "Diana Krall", "Cassandra Wilson", "Esperanza Spalding",
  "Robert Glasper", "Brad Mehldau", "Joshua Redman", "Christian McBride", "Terence Blanchard",
  "Maroon 5", "Train", "OneRepublic", "The Fray", "Death Cab for Cutie", "Wilco",
  "Sufjan Stevens", "Bon Iver", "The National", "Vampire Weekend", "MGMT",
  "Carrie Underwood", "Taylor Swift", "Miranda Lambert", "Brad Paisley", "Keith Urban",
  "Rascal Flatts", "Lady A", "Sugarland", "Zac Brown Band", "Kenny Chesney",
  "Shakira", "Juanes", "Calle 13", "Café Tacvba", "Maná", "Alejandro Sanz",
  "Ricardo Arjona", "Luis Miguel", "Julieta Venegas", "Natalia Lafourcade",

  // ── 2010s ────────────────────────────────────────────────────
  "Bruno Mars", "Ed Sheeran", "Sam Smith", "Lorde", "Lana Del Rey", "Billie Eilish",
  "Ariana Grande", "Dua Lipa", "Halsey", "Camila Cabello", "Selena Gomez",
  "Rihanna", "Katy Perry", "Lady Gaga", "Miley Cyrus", "Sia", "Florence + The Machine",
  "St. Vincent", "Brandi Carlile", "Maggie Rogers", "Phoebe Bridgers", "boygenius",
  "Kendrick Lamar", "Drake", "J. Cole", "Travis Scott", "Childish Gambino",
  "Chance the Rapper", "Tyler, The Creator", "Cardi B", "Megan Thee Stallion",
  "Nicki Minaj", "Post Malone", "Macklemore & Ryan Lewis", "Logic", "Big Sean",
  "Frank Ocean", "The Weeknd", "SZA", "H.E.R.", "Daniel Caesar", "Anderson .Paak",
  "Silk Sonic", "Leon Bridges", "Gary Clark Jr.", "Fantastic Negrito", "Christone Ingram",
  "Imagine Dragons", "Twenty One Pilots", "Panic! At The Disco", "Fall Out Boy",
  "Paramore", "Cage the Elephant", "Alabama Shakes", "The 1975", "Tame Impala",
  "Beck", "Jack White", "Greta Van Fleet", "Ghost", "Baroness", "Gojira",
  "Skrillex", "Deadmau5", "Zedd", "Calvin Harris", "Diplo", "Major Lazer",
  "Flume", "Odesza", "Disclosure", "Bonobo", "Kaytranada", "Justice",
  "Chris Stapleton", "Kacey Musgraves", "Sturgill Simpson", "Jason Isbell",
  "Little Big Town", "Maren Morris", "Ashley McBryde", "Tanya Tucker",
  "Angelique Kidjo", "Youssou N'Dour", "Ladysmith Black Mambazo", "Tinariwen",
  "Femi Kuti", "Seun Kuti", "Soweto Gospel Choir", "Black Coffee", "Burna Boy",
  "Kirk Franklin", "Tasha Cobbs Leonard", "CeCe Winans", "Marvin Sapp",
  "Fred Hammond", "Yolanda Adams", "Take 6", "The Blind Boys of Alabama",
  "Hillsong Worship", "Lauren Daigle", "For King & Country", "TobyMac", "MercyMe",
  "Vince Staples", "Run the Jewels", "Danger Mouse", "Pharrell Williams",
  "Mark Ronson", "Jack Antonoff", "Finneas", "Greg Kurstin", "Jon Batiste",

  // ── 2020s ────────────────────────────────────────────────────
  "Olivia Rodrigo", "Doja Cat", "Lizzo", "Victoria Monét", "Tyla", "Ice Spice",
  "Sabrina Carpenter", "Chappell Roan", "Charli XCX", "Beabadoobee",
  "Bad Bunny", "Karol G", "Rosalía", "J Balvin", "Peso Pluma", "Rauw Alejandro",
  "Wet Leg", "Arooj Aftab", "Samara Joy", "Laufey", "Cécile McLorin Salvant",
  "Jazmine Sullivan", "Lucky Daye", "Giveon", "Coco Jones", "Muni Long",
  "Killer Mike", "Baby Keem", "GloRilla", "Latto", "Jack Harlow", "Lil Nas X",
  "Måneskin", "Turnstile", "Fontaines D.C.", "Idles", "Black Pumas",
  "Aoife O'Donovan", "Molly Tuttle", "Sierra Ferrell", "Billy Strings",
  "Zach Bryan", "Luke Combs", "Morgan Wallen", "Lainey Wilson", "Shaboozey",
  "Stromae", "Burna Boy", "Wizkid", "Tems", "Davido", "Asake", "Ayra Starr",
  "Arcángel", "Natanael Cano", "Fuerza Regida", "Grupo Frontera", "Carín León",
];

/** De-duplicated, trimmed list (the seed above intentionally repeats a few
 *  multi-era winners for readability). */
export const GRAMMY_ARTISTS_UNIQUE: string[] = [
  ...new Set(GRAMMY_ARTISTS.map((n) => n.trim()).filter(Boolean)),
];
