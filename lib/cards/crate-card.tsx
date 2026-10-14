/** @jsxRuntime automatic @jsxImportSource react */
// The pragma pins the automatic JSX runtime: tsconfig says "preserve" (Next
// compiles JSX itself), and tsx would otherwise fall back to React.createElement
// with no React in scope when scripts/motion/build-cards.tsx imports this.
import { renderSvg, type Fix } from "./render";
import { CARD_LIMITS, clip, recordCount } from "./text";
import { CARD_COLOR as C, CARD_FONT, cardAccent } from "./theme";

/**
 * The crate share card: 1080×1350 (4:5, the portrait size Instagram and most
 * feeds show uncropped).
 *
 * The crate is drawn as what it would be on a shelf — a pile of cassettes seen
 * from the spine, each one cream and ruled like the J-cards in the app, with
 * the record's stripe colour at one end, its title in heavy capitals and the
 * artist beneath. The pile is slightly uneven on purpose: tapes stacked by
 * hand never line up, and a perfectly straight column reads as a table.
 *
 * Satori lays this out with Yoga (flexbox only, no grid), so every element
 * with more than one child says display:flex explicitly.
 */

export const CRATE_CARD_SIZE = { width: 1080, height: 1350 } as const;

export interface CardRecord {
  title: string;
  artist: string;
}

export interface CrateCardInput {
  name: string;
  records: readonly CardRecord[];
  /** Records in the crate, when it holds more than the card can draw. */
  total?: number;
}

const PAD_X = 72;
const STACK_W = CRATE_CARD_SIZE.width - PAD_X * 2;
/** Height the pile may take; a full 8-tape pile uses all of it. */
const STACK_MAX_H = 664;
const STACK_GAP = 10;

/** Fewer tapes, bigger tapes — a 2-record crate shouldn't be two slivers. */
function spineHeight(n: number): number {
  if (n <= 0) return 0;
  return Math.round(Math.min(150, (STACK_MAX_H - STACK_GAP * (n - 1)) / n));
}

/** Text fitting by length: a short crate name can be poster-sized. */
function nameSize(name: string): number {
  const n = name.length;
  return n <= 12 ? 124 : n <= 20 ? 104 : n <= 34 ? 86 : 72;
}

/** Hand-stacked: a few pixels and a fraction of a degree, alternating. */
const NUDGE = [
  { x: -4, r: -0.4 },
  { x: 6, r: 0.3 },
  { x: -1, r: -0.15 },
  { x: 8, r: 0.45 },
  { x: -6, r: -0.3 },
  { x: 3, r: 0.2 },
  { x: -8, r: -0.45 },
  { x: 4, r: 0.15 },
];

/** A tape as drawn: its text after the glyph fix, its stripe from before it. */
interface SpineRecord extends CardRecord {
  accent: string;
}

function Spine({ record, index, height }: { record: SpineRecord; index: number; height: number }) {
  const { accent } = record;
  const titleSize = Math.round(Math.min(56, height * 0.4));
  const artistSize = Math.round(Math.min(26, height * 0.21));
  const nudge = NUDGE[index % NUDGE.length];
  return (
    <div
      style={{
        display: "flex",
        width: STACK_W,
        height,
        marginTop: index === 0 ? 0 : STACK_GAP,
        marginLeft: nudge.x,
        transform: `rotate(${nudge.r}deg)`,
        borderRadius: 12,
        overflow: "hidden",
        // The case: a dark rim around the card, and the shadow it throws on
        // the tape beneath.
        border: `3px solid ${C.deck800}`,
        boxShadow: "0 10px 22px rgba(0, 0, 0, 0.5)",
        backgroundColor: C.creamTop,
        backgroundImage: `linear-gradient(180deg, ${C.creamTop} 0%, ${C.creamBottom} 100%)`,
      }}
    >
      {/* The maker's stripe, at the spine's end. */}
      <div style={{ width: 26, height: "100%", backgroundColor: accent }} />
      {/* Written on the rules, the way you fill in a J-card: each line of
          text sits on a faint blue rule that runs the width of the label. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flexGrow: 1,
          minWidth: 0,
          padding: "0 28px",
        }}
      >
        <div
          style={{
            display: "block",
            paddingBottom: Math.round(height * 0.04),
            borderBottom: `2px solid ${C.rule}`,
            fontFamily: CARD_FONT.sans,
            fontWeight: 900,
            fontSize: titleSize,
            lineHeight: 1.02,
            textTransform: "uppercase",
            letterSpacing: "0.01em",
            color: C.labelInk,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {record.title}
        </div>
        {record.artist ? (
          <div
            style={{
              display: "block",
              paddingTop: Math.round(height * 0.05),
              paddingBottom: Math.round(height * 0.03),
              borderBottom: `2px solid ${C.rule}`,
              fontFamily: CARD_FONT.sans,
              fontWeight: 700,
              fontSize: artistSize,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: C.labelInkSoft,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {record.artist}
          </div>
        ) : null}
      </div>
      {/* Track number, as you'd write it on the spine. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: Math.round(height * 0.9),
          maxWidth: 104,
          height: "100%",
          borderLeft: `2px solid ${C.rule}`,
          fontFamily: CARD_FONT.mono,
          fontWeight: 700,
          fontSize: Math.round(Math.min(30, height * 0.28)),
          color: C.labelInkSoft,
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>
    </div>
  );
}

function CrateCard({ name, records, total }: { name: string; records: SpineRecord[]; total: number }) {
  const height = spineHeight(records.length);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: CRATE_CARD_SIZE.width,
        height: CRATE_CARD_SIZE.height,
        boxSizing: "border-box",
        padding: `64px ${PAD_X}px 56px`,
        backgroundColor: C.deck900,
        // An orange glow off the top corner, like light on the deck's face.
        backgroundImage: `radial-gradient(circle at 88% 0%, rgba(242, 102, 44, 0.2) 0%, rgba(242, 102, 44, 0) 46%), linear-gradient(180deg, ${C.deck800} 0%, ${C.deck900} 58%)`,
        fontFamily: CARD_FONT.sans,
        color: C.ink,
      }}
    >
      {/* header: wordmark + side */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.sony, marginRight: 16 }} />
          <div style={{ fontFamily: CARD_FONT.mono, fontWeight: 700, fontSize: 30, letterSpacing: "0.42em", color: C.ink }}>
            PULSAR
          </div>
        </div>
        <div style={{ fontFamily: CARD_FONT.mono, fontWeight: 400, fontSize: 22, letterSpacing: "0.28em", color: C.ink400 }}>
          CRATE · SIDE A
        </div>
      </div>

      <div style={{ display: "flex", flexGrow: 1, minHeight: 32 }} />

      {/* name + LCD count */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "block",
            fontWeight: 900,
            fontSize: nameSize(name),
            lineHeight: 0.98,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
            color: C.ink,
            lineClamp: 2,
            wordBreak: "break-word",
          }}
        >
          {name}
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 30 }}>
          <div
            style={{
              display: "flex",
              padding: "12px 22px",
              borderRadius: 12,
              backgroundColor: C.lcdWell,
              border: "2px solid rgba(126, 217, 174, 0.28)",
              fontFamily: CARD_FONT.mono,
              fontWeight: 700,
              fontSize: 32,
              letterSpacing: "0.14em",
              color: C.lcd,
            }}
          >
            {recordCount(total)}
          </div>
          {total > records.length && records.length > 0 ? (
            <div
              style={{
                marginLeft: 22,
                fontFamily: CARD_FONT.mono,
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: "0.14em",
                color: C.ink400,
              }}
            >
              {`FIRST ${records.length}`}
            </div>
          ) : null}
        </div>
      </div>

      {records.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 44 }}>
          {records.map((r, i) => (
            <Spine key={i} record={r} index={i} height={height} />
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", flexGrow: 1, minHeight: 32 }} />

      {/* footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 22,
          borderTop: "2px solid rgba(89, 98, 107, 0.45)",
        }}
      >
        <div style={{ fontFamily: CARD_FONT.mono, fontWeight: 400, fontSize: 20, letterSpacing: "0.3em", color: C.ink600 }}>
          DUBBED ON PULSAR
        </div>
        <div style={{ display: "flex" }}>
          {[C.sony, C.tps, C.sport, C.lcd, C.vu].map((c) => (
            <div key={c} style={{ width: 14, height: 14, borderRadius: 7, marginLeft: 10, backgroundColor: c }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Bound everything before it reaches the layout: the route has validated the
 * request, but the build script and tests call this directly, and a card has
 * to come out right for whatever a crate in localStorage holds.
 */
export function normalizeCrate(input: CrateCardInput) {
  const records = input.records.slice(0, CARD_LIMITS.records).map((r) => ({
    title: clip(r.title, CARD_LIMITS.title) || "Untitled",
    artist: clip(r.artist, CARD_LIMITS.artist),
  }));
  const total = Math.max(records.length, Math.floor(Number(input.total) || 0), input.records.length);
  return { name: clip(input.name, CARD_LIMITS.name) || "Crate", records, total };
}

export function renderCrateCard(input: CrateCardInput): Promise<string> {
  const card = normalizeCrate(input);
  return renderSvg(
    (fix: Fix) => (
      <CrateCard
        name={fix(card.name)}
        records={card.records.map((r) => ({
          title: fix(r.title),
          artist: fix(r.artist),
          // Seeded by the artist as written, not as drawn: fix() can turn
          // 米津玄師 into "—", and every such artist would share one stripe
          // instead of the colour the tape has in the crate.
          accent: cardAccent(r.artist),
        }))}
        total={card.total}
      />
    ),
    CRATE_CARD_SIZE,
  );
}
