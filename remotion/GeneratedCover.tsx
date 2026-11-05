import { useCurrentFrame, useVideoConfig } from "remotion";
import { Reel, Screw } from "./Reel";
import { accentFor, hashString, initialOf, secondaryAccentFor } from "./props";
import { COLOR, MONO, FONT } from "./tokens";

const TAPE_TYPES = ["C-46", "C-60", "C-90"] as const;

/**
 * The cover a record gets when it has no artwork, or its artwork fails to
 * load: the cassette itself, front-on — graphite shell, a cream J-card label
 * with the maker's stripe, and a tape window whose reels turn.
 *
 * The video's version of the app's .jcard fallback (components/Artwork.tsx),
 * and the same tape: the stripe colour and the big initial come from the
 * artist, as they do there. What the app's card doesn't have — the diagonal
 * band, tape length, screw slots — is hashed from the title, so the same
 * record always gets the same tape and a crate of coverless records still
 * reads as a shelf of different cassettes.
 *
 * Drawn in an 820px design space and scaled by `size`, so the outro's
 * thumbnails are the same object, smaller.
 */
export function GeneratedCover({ title, artist, size }: { title: string; artist: string; size: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const u = size / 820;
  const h = hashString(title.toLowerCase());
  const accent = accentFor(artist);
  const band = secondaryAccentFor(artist, title);
  const bandAngle = 100 + (h % 40);
  const tapeType = TAPE_TYPES[(h >>> 3) % TAPE_TYPES.length];
  // This cassette plays for as long as its card is up: constant speed, local frame.
  const spin = (frame / fps) * 200;
  const px = (n: number) => Math.round(n * u);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: px(30),
        overflow: "hidden",
        backgroundColor: COLOR.deck700,
        backgroundImage: "linear-gradient(160deg, #2a333d 0%, #181d23 55%, #0f1216 100%)",
      }}
    >
      {[
        { left: px(26), top: px(26) },
        { right: px(26), top: px(26) },
        { left: px(26), bottom: px(26) },
        { right: px(26), bottom: px(26) },
      ].map((pos, i) => (
        <Screw key={i} size={px(26)} slot={((h >>> (i * 4)) % 180) - 90} style={pos} />
      ))}

      {/* the J-card label */}
      <div
        style={{
          position: "absolute",
          left: px(70),
          right: px(70),
          top: px(70),
          height: px(470),
          borderRadius: px(18),
          overflow: "hidden",
          backgroundColor: COLOR.cream,
          backgroundImage: `linear-gradient(180deg, ${COLOR.creamTop} 0%, ${COLOR.creamBottom} 100%)`,
        }}
      >
        {/* the diagonal band a TDK or Maxell card is remembered by */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `linear-gradient(${bandAngle}deg, transparent 0%, transparent 58%, ${band} 58%, ${band} 71%, transparent 71%, transparent 100%)`,
            opacity: 0.85,
          }}
        />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px(36),
              right: px(36),
              top: px(170 + i * 62),
              height: Math.max(1, px(3)),
              backgroundColor: COLOR.rule,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: px(92),
            backgroundColor: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `0 ${px(34)}px`,
            boxSizing: "border-box",
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: px(34),
            letterSpacing: "0.18em",
            color: COLOR.labelInk,
          }}
        >
          <span>{tapeType}</span>
          <span>TYPE I</span>
        </div>
        <div
          style={{
            position: "absolute",
            left: px(40),
            bottom: px(10),
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: px(330),
            lineHeight: 1,
            color: COLOR.labelInk,
          }}
        >
          {initialOf(artist)}
        </div>
      </div>

      {/* tape window */}
      <div
        style={{
          position: "absolute",
          left: px(150),
          width: px(520),
          top: px(580),
          height: px(150),
          borderRadius: px(75),
          backgroundColor: COLOR.deck900,
          backgroundImage: "linear-gradient(180deg, #07090b 0%, #111519 100%)",
          border: `${Math.max(1, px(3))}px solid #05070a`,
          boxSizing: "border-box",
        }}
      >
        <Reel size={px(124)} pack={0.9} angle={spin} style={{ left: px(26), top: px(10) }} />
        <Reel size={px(124)} pack={0.66} angle={spin * 1.35} style={{ right: px(26), top: px(10) }} />
      </div>

      {/* the head opening along the bottom edge */}
      <div
        style={{
          position: "absolute",
          left: px(210),
          width: px(400),
          bottom: 0,
          height: px(62),
          backgroundColor: "#0d1013",
          clipPath: "polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)",
        }}
      />
    </div>
  );
}
