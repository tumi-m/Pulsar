/**
 * Regional and canonical artist sweeps.
 *
 * The feed already covers African/South African, gospel and Grammy-winning
 * artists. These lists fill the remaining gaps — Latin America, the Caribbean,
 * Asia, the Arab world and Europe, plus the jazz, blues and electronic canons
 * that a discovery app looks hollow without.
 *
 * Grouped by region so the coverage is legible and easy to extend: it should be
 * obvious at a glance what the catalogue does and doesn't reach.
 */

export const WORLD_ARTISTS: Record<string, string[]> = {
  // ── Latin America ─────────────────────────────────────────
  latin: [
    "Bad Bunny", "Karol G", "J Balvin", "Shakira", "Daddy Yankee", "Ozuna",
    "Rauw Alejandro", "Feid", "Anuel AA", "Maluma", "Nicky Jam", "Wisin & Yandel",
    "Peso Pluma", "Grupo Frontera", "Carin León", "Natanael Cano", "Fuerza Regida",
    "Christian Nodal", "Vicente Fernández", "Juan Gabriel", "Luis Miguel",
    "Marc Anthony", "Romeo Santos", "Aventura", "Prince Royce", "Juan Luis Guerra",
    "Celia Cruz", "Héctor Lavoe", "Willie Colón", "Rubén Blades", "Fania All-Stars",
    "Buena Vista Social Club", "Compay Segundo", "Ibrahim Ferrer",
    "Rosalía", "Alejandro Sanz", "Julieta Venegas", "Natalia Lafourcade",
    "Café Tacvba", "Maná", "Soda Stereo", "Gustavo Cerati", "Los Fabulosos Cadillacs",
    "Bomba Estéreo", "Calle 13", "Residente", "Mon Laferte", "Silvio Rodríguez",
  ],

  // ── Brazil ────────────────────────────────────────────────
  brazil: [
    "Gilberto Gil", "Caetano Veloso", "João Gilberto", "Antônio Carlos Jobim",
    "Elis Regina", "Jorge Ben Jor", "Seu Jorge", "Marisa Monte", "Milton Nascimento",
    "Tim Maia", "Djavan", "Chico Buarque", "Gal Costa", "Os Mutantes",
    "Anitta", "Ludmilla", "Racionais MC's", "Emicida", "Liniker",
  ],

  // ── Caribbean: reggae, dancehall, soca ────────────────────
  caribbean: [
    "Peter Tosh", "Burning Spear", "Toots and the Maytals", "Jimmy Cliff",
    "Dennis Brown", "Gregory Isaacs", "Augustus Pablo", "Lee \"Scratch\" Perry",
    "King Tubby", "Black Uhuru", "Steel Pulse", "Third World",
    "Buju Banton", "Beenie Man", "Bounty Killer", "Shabba Ranks", "Sean Paul",
    "Vybz Kartel", "Popcaan", "Chronixx", "Protoje", "Koffee", "Shenseea",
    "Sister Nancy", "Damian Marley", "Ziggy Marley", "Stephen Marley",
    "Machel Montano", "Kes", "Calypso Rose",
  ],

  // ── East & South Asia ─────────────────────────────────────
  asia: [
    "BTS", "BLACKPINK", "NewJeans", "SEVENTEEN", "TWICE", "Stray Kids",
    "IU", "G-Dragon", "BIGBANG", "EXO", "Red Velvet", "aespa", "LE SSERAFIM",
    "TOMORROW X TOGETHER", "ATEEZ", "ITZY",
    "Utada Hikaru", "Kenshi Yonezu", "YOASOBI", "Fujii Kaze", "King Gnu",
    "Babymetal", "Perfume", "Ryuichi Sakamoto", "Cornelius", "Hikaru Utada",
    "Jay Chou", "Teresa Teng", "Faye Wong", "JJ Lin",
    "A.R. Rahman", "Arijit Singh", "Lata Mangeshkar", "Kishore Kumar",
    "Diljit Dosanjh", "Ravi Shankar", "Nusrat Fateh Ali Khan", "Shreya Ghoshal",
  ],

  // ── Arab world & North Africa ─────────────────────────────
  arab: [
    "Fairuz", "Umm Kulthum", "Abdel Halim Hafez", "Amr Diab", "Nancy Ajram",
    "Cheb Khaled", "Rachid Taha", "Souad Massi", "Mashrou' Leila",
    "Elyanna", "Saint Levant", "Nour", "Marcel Khalife", "Omar Souleyman",
  ],

  // ── Europe ────────────────────────────────────────────────
  europe: [
    "Stromae", "Angèle", "Aya Nakamura", "Booba", "PNL", "Orelsan",
    "Christine and the Queens", "Serge Gainsbourg", "Édith Piaf", "Jacques Brel",
    "Air", "Justice", "Phoenix", "Sébastien Tellier",
    "Kraftwerk", "Can", "Neu!", "Rammstein", "Nina Hagen",
    "Lucio Battisti", "Mina", "Måneskin", "Paolo Nutini",
    "Björk", "Sigur Rós", "Of Monsters and Men", "Robyn", "Lykke Li",
    "The Cardigans", "José González", "Fever Ray",
  ],

  // ── Jazz canon ────────────────────────────────────────────
  jazz: [
    "Miles Davis", "John Coltrane", "Charles Mingus", "Thelonious Monk",
    "Duke Ellington", "Count Basie", "Louis Armstrong", "Ella Fitzgerald",
    "Billie Holiday", "Sarah Vaughan", "Nina Simone", "Dave Brubeck",
    "Herbie Hancock", "Wayne Shorter", "Sonny Rollins", "Art Blakey",
    "Cannonball Adderley", "Bill Evans", "Chet Baker", "Stan Getz",
    "Alice Coltrane", "Sun Ra", "Pharoah Sanders", "Ornette Coleman",
    "Kamasi Washington", "Robert Glasper", "Esperanza Spalding", "Nubya Garcia",
    "Ezra Collective", "Sons of Kemet", "Samara Joy", "Cécile McLorin Salvant",
  ],

  // ── Blues & early soul ────────────────────────────────────
  blues: [
    "B.B. King", "Muddy Waters", "Howlin' Wolf", "John Lee Hooker",
    "Robert Johnson", "Etta James", "Big Mama Thornton", "Sister Rosetta Tharpe",
    "Albert King", "Freddie King", "Buddy Guy", "Son House", "Lead Belly",
    "Bessie Smith", "Ma Rainey", "Gary Clark Jr.", "Christone \"Kingfish\" Ingram",
  ],

  // ── Electronic & dance canon ──────────────────────────────
  electronic: [
    "Aphex Twin", "Boards of Canada", "Autechre", "Squarepusher",
    "Burial", "Four Tet", "Jamie xx", "Caribou", "Bicep", "Bonobo",
    "Fred again..", "Peggy Gou", "Nina Kraviz", "Jeff Mills", "Carl Craig",
    "Derrick May", "Juan Atkins", "Frankie Knuckles", "Larry Heard",
    "Theo Parrish", "Moodymann", "Floating Points", "Jon Hopkins",
    "The Chemical Brothers", "The Prodigy", "Orbital", "Leftfield",
    "Massive Attack", "Portishead", "Tricky", "Thievery Corporation",
    "Röyksopp", "Kaytranada", "Disclosure", "Overmono", "Skee Mask",
  ],
};

/** Flat, de-duplicated list across every region. */
export const WORLD_ARTISTS_FLAT: string[] = [
  ...new Set(Object.values(WORLD_ARTISTS).flat().map((n) => n.trim()).filter(Boolean)),
];
