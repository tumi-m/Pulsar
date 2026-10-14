import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CoverArt } from "./CoverArt";
import type { NormalizedRecord } from "./props";
import { COLOR, DECK_TOP, FONT, MONO, RECAP_WIDTH } from "./tokens";

const GAP = 18;
/** Height of the "Made with Pulsar" block below the wall, for centring. */
const BRAND_HEIGHT = 400;
/** The free band between the top safe area and the deck. */
const AREA_TOP = 100;

/**
 * The sign-off: the whole crate laid out as a wall of covers, then
 * "Made with Pulsar" over the transport-key gradient.
 */
export function Outro({
  records,
  crateName,
  total,
}: {
  records: NormalizedRecord[];
  crateName: string;
  total: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // A short crate gets bigger covers in one row; a full one a 4 × 3 wall.
  const cols = records.length <= 3 ? Math.max(1, records.length) : 4;
  const thumb = records.length <= 3 ? 250 : records.length <= 8 ? 210 : 184;
  const rows = Math.ceil(records.length / cols);
  const wallHeight = rows === 0 ? 0 : rows * (thumb + GAP) - GAP + 70;
  // Centred in the band between the top safe area and the deck.
  const gridTop = Math.round(AREA_TOP + (DECK_TOP - AREA_TOP - wallHeight - BRAND_HEIGHT) / 2);
  const brandTop = gridTop + wallHeight;
  const rise = (delay: number) => ({
    opacity: interpolate(frame, [delay * fps, (delay + 0.3) * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    translate: interpolate(frame, [delay * fps, (delay + 0.45) * fps], ["0px 30px", "0px 0px"], {
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  });

  return (
    <>
      {records.map((r, i) => {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, records.length - row * cols);
        const rowWidth = inRow * thumb + (inRow - 1) * GAP;
        const col = i % cols;
        // Stagger shrinks as the wall grows, so twelve land as fast as four.
        const delay = (i * Math.min(2.5, 24 / Math.max(1, records.length))) / fps;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: (RECAP_WIDTH - rowWidth) / 2 + col * (thumb + GAP),
              top: gridTop + row * (thumb + GAP),
              width: thumb,
              height: thumb,
              borderRadius: 14,
              overflow: "hidden",
              backgroundColor: COLOR.deck700,
              boxShadow: "0 16px 30px rgba(0, 0, 0, 0.5)",
              opacity: interpolate(frame, [delay * fps, (delay + 0.2) * fps], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              scale: interpolate(frame, [delay * fps, (delay + 0.5) * fps], [0.6, 1], {
                easing: Easing.spring({ damping: 14, stiffness: 140 }),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                output: "perceptual-scale",
              }),
            }}
          >
            <CoverArt record={r} size={thumb} />
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: brandTop,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 36,
            letterSpacing: "0.42em",
            color: COLOR.ink400,
            ...rise(0.35),
          }}
        >
          MADE WITH
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 168,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: COLOR.sony,
            ...rise(0.45),
          }}
        >
          PULSAR
        </div>
        <div
          style={{
            marginTop: 22,
            height: 12,
            borderRadius: 6,
            width: interpolate(frame, [0.6 * fps, 1.1 * fps], [0, 460], {
              easing: Easing.bezier(0.22, 1, 0.36, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            backgroundColor: COLOR.sony,
            backgroundImage: "linear-gradient(118deg, #f2662c 0%, #ff8c39 46%, #ffce0a 100%)",
          }}
        />
        <div
          style={{
            marginTop: 34,
            maxWidth: 900,
            textAlign: "center",
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 44,
            lineHeight: 1.2,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: COLOR.ink,
            ...rise(0.7),
          }}
        >
          {crateName}
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: MONO,
            fontSize: 32,
            letterSpacing: "0.14em",
            color: COLOR.ink400,
            ...rise(0.8),
          }}
        >
          {total === 0
            ? "ADD RECORDS TO YOUR CRATE"
            : total > records.length
              ? `${records.length} OF ${total} RECORDS`
              : `${total} RECORD${total === 1 ? "" : "S"}`}
        </div>
      </div>
    </>
  );
}
