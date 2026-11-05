/** @jsxRuntime automatic @jsxImportSource react */
// The pragma pins the automatic JSX runtime: tsconfig says "preserve" (Next
// compiles JSX itself), and tsx would otherwise fall back to React.createElement
// with no React in scope when scripts/motion/build-cards.tsx imports this.
import { renderSvg, type Fix } from "./render";
import { CARD_LIMITS, clip } from "./text";
import { CARD_COLOR as C, CARD_FONT, cardAccent } from "./theme";

/**
 * The release title card: 1920×1080, a still for the head or tail of a video.
 *
 * Type on the left, held well inside the title-safe area (text 120px+ from
 * every edge, so nothing is lost to a player's overscan or a platform's UI
 * chrome); on the right, the record's cassette J-card, tilted as if it has
 * just been put down on the deck. The J-card is the same object the app draws
 * for a record without a cover, in the record's own stripe colour.
 *
 * "intro" opens on what's coming; "outro" closes on where to find it.
 */

export const TITLE_CARD_SIZE = { width: 1920, height: 1080 } as const;

export interface TitleCardInput {
  title: string;
  artist: string;
  /** Small line under the artist: label, year, format. */
  meta?: string;
  /** Overrides the default line above the title. */
  eyebrow?: string;
  variant?: "intro" | "outro";
}

const SAFE = 120;
const TEXT_W = 1020;

function titleSize(title: string): number {
  const n = title.length;
  return n <= 12 ? 176 : n <= 22 ? 140 : n <= 36 ? 112 : 92;
}

function JCard({ title, artist, accent }: { title: string; artist: string; accent: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 600,
        height: 384,
        padding: 22,
        boxSizing: "border-box",
        borderRadius: 26,
        transform: "rotate(-5deg)",
        backgroundImage: `linear-gradient(160deg, #262e37 0%, #181d23 55%, #101317 100%)`,
        boxShadow: "0 40px 80px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
      }}
    >
      {/* the label */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          borderRadius: 14,
          overflow: "hidden",
          backgroundImage: `linear-gradient(180deg, ${C.creamTop} 0%, ${C.creamBottom} 100%)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 48,
            padding: "0 24px",
            backgroundColor: accent,
            fontFamily: CARD_FONT.mono,
            fontWeight: 700,
            fontSize: 20,
            letterSpacing: "0.2em",
            color: C.labelInk,
          }}
        >
          <div>PULSAR</div>
          <div>SIDE A</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "18px 26px 0" }}>
          <div
            style={{
              display: "block",
              paddingBottom: 6,
              borderBottom: `2px solid ${C.rule}`,
              fontFamily: CARD_FONT.sans,
              fontWeight: 900,
              fontSize: 40,
              lineHeight: 1.04,
              textTransform: "uppercase",
              color: C.labelInk,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "block",
              padding: "10px 0 6px",
              borderBottom: `2px solid ${C.rule}`,
              fontFamily: CARD_FONT.sans,
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: C.labelInkSoft,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {artist || " "}
          </div>
        </div>
      </div>
      {/* the window, with the two reels behind it */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          height: 84,
          marginTop: 18,
          padding: "0 70px",
          borderRadius: 42,
          backgroundImage: "linear-gradient(180deg, #07090b, #111519)",
        }}
      >
        {[66, 46].map((size, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 66,
              height: 66,
              borderRadius: 33,
              backgroundColor: C.tape,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: size * 0.62,
                height: size * 0.62,
                borderRadius: size,
                backgroundColor: C.creamBottom,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.deck900 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TitleCard({ title, artist, meta, eyebrow, variant, accent }: Required<TitleCardInput> & { accent: string }) {
  return (
    <div
      style={{
        display: "flex",
        width: TITLE_CARD_SIZE.width,
        height: TITLE_CARD_SIZE.height,
        boxSizing: "border-box",
        padding: SAFE,
        backgroundColor: C.deck900,
        backgroundImage: `radial-gradient(circle at 78% 46%, rgba(242, 102, 44, 0.16) 0%, rgba(242, 102, 44, 0) 42%), linear-gradient(180deg, ${C.deck800} 0%, ${C.deck900} 70%)`,
        fontFamily: CARD_FONT.sans,
        color: C.ink,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: TEXT_W, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.sony, marginRight: 18 }} />
          <div style={{ fontFamily: CARD_FONT.mono, fontWeight: 700, fontSize: 34, letterSpacing: "0.42em" }}>PULSAR</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontFamily: CARD_FONT.mono,
              fontWeight: 700,
              fontSize: 30,
              letterSpacing: "0.3em",
              color: accent,
            }}
          >
            <div style={{ width: 48, height: 6, marginRight: 20, backgroundColor: accent }} />
            <div>{eyebrow}</div>
          </div>
          <div
            style={{
              display: "block",
              marginTop: 28,
              fontWeight: 900,
              fontSize: titleSize(title),
              lineHeight: 0.96,
              letterSpacing: "-0.015em",
              textTransform: "uppercase",
              lineClamp: 2,
              wordBreak: "break-word",
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "block",
              marginTop: 30,
              fontWeight: 700,
              fontSize: 54,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: C.ink400,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {artist}
          </div>
          {meta ? (
            <div
              style={{
                display: "block",
                marginTop: 22,
                fontFamily: CARD_FONT.mono,
                fontWeight: 400,
                fontSize: 28,
                letterSpacing: "0.16em",
                color: C.ink600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {meta}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", fontFamily: CARD_FONT.mono, fontSize: 24, letterSpacing: "0.3em", color: C.ink600 }}>
          {variant === "outro" ? "FIND IT ON PULSAR" : "MUSIC DISCOVERY · PULSAR"}
        </div>
      </div>

      <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "flex-end" }}>
        <JCard title={title} artist={artist} accent={accent} />
      </div>
    </div>
  );
}

export function normalizeTitle(input: TitleCardInput): Required<TitleCardInput> {
  const variant = input.variant === "outro" ? "outro" : "intro";
  return {
    title: clip(input.title, CARD_LIMITS.title) || "Untitled",
    artist: clip(input.artist, CARD_LIMITS.artist),
    meta: clip(input.meta, CARD_LIMITS.meta),
    eyebrow: clip(input.eyebrow, CARD_LIMITS.eyebrow).toUpperCase() || (variant === "outro" ? "OUT NOW" : "NEW RELEASE"),
    variant,
  };
}

export function renderTitleCard(input: TitleCardInput): Promise<string> {
  const card = normalizeTitle(input);
  return renderSvg(
    (fix: Fix) => (
      <TitleCard
        title={fix(card.title)}
        artist={fix(card.artist)}
        meta={fix(card.meta)}
        eyebrow={fix(card.eyebrow)}
        variant={card.variant}
        // From the artist before fix(), which may have dashed it: the J-card
        // keeps the stripe the record has in the app.
        accent={cardAccent(card.artist)}
      />
    ),
    TITLE_CARD_SIZE,
  );
}
