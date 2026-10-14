import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR, FONT, MONO, RECAP_WIDTH } from "./tokens";

const CARD_W = 900;

/**
 * The title card: one big J-card with the crate's name written on it, the
 * record count beneath — the label you'd write before dubbing the tape.
 * It drops in, holds, and sinks away as the first record deals over it.
 */
export function Intro({
  crateName,
  shown,
  total,
  exitAt,
}: {
  crateName: string;
  /** Records in the video. */
  shown: number;
  /** Records in the crate (more than `shown` when the crate is over the cap). */
  total: number;
  /** Local frame at which the card starts to leave. */
  exitAt: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nameSize = crateName.length <= 10 ? 150 : crateName.length <= 18 ? 120 : crateName.length <= 30 ? 96 : 76;
  const count =
    total === 0 ? "EMPTY CRATE" : `${total} RECORD${total === 1 ? "" : "S"}`;
  const fade = (from: number, to: number) =>
    interpolate(frame, [from * fps, to * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <>
      {/* wordmark */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 140,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 18,
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 38,
          letterSpacing: "0.42em",
          color: COLOR.ink,
          // Gone before the header fades in over the same strip of screen.
          opacity: interpolate(frame, [0, 0.3 * fps, exitAt - 0.5 * fps, exitAt - 0.2 * fps], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: COLOR.sony }} />
        <span>PULSAR</span>
      </div>

      <div
        style={{
          position: "absolute",
          left: (RECAP_WIDTH - CARD_W) / 2,
          top: 330,
          width: CARD_W,
          transformOrigin: "50% 100%",
          translate: interpolate(frame, [0, 0.7 * fps, exitAt, exitAt + 0.34 * fps], ["0px 1300px", "0px 0px", "0px 0px", "0px -90px"], {
            easing: [Easing.spring({ damping: 16, stiffness: 110 }), Easing.linear, Easing.bezier(0.4, 0, 1, 1)],
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          rotate: interpolate(frame, [0, 0.7 * fps], ["-6deg", "0deg"], {
            easing: Easing.spring({ damping: 16, stiffness: 110 }),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [exitAt, exitAt + 0.34 * fps], [1, 0.88], {
            easing: Easing.bezier(0.4, 0, 1, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
          }),
          opacity: interpolate(frame, [exitAt, exitAt + 0.34 * fps], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          borderRadius: 26,
          overflow: "hidden",
          backgroundColor: COLOR.cream,
          backgroundImage: `linear-gradient(180deg, ${COLOR.creamTop} 0%, ${COLOR.creamBottom} 100%)`,
          boxShadow: "0 50px 100px rgba(0, 0, 0, 0.6)",
        }}
      >
        <div
          style={{
            height: 96,
            backgroundColor: COLOR.sony,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 48px",
            boxSizing: "border-box",
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 34,
            letterSpacing: "0.2em",
            color: COLOR.labelInk,
          }}
        >
          <span>CRATE RECAP</span>
          <span>SIDE A</span>
        </div>
        <div style={{ position: "relative", padding: "56px 56px 60px", boxSizing: "border-box", minHeight: 640 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 40,
                right: 40,
                top: 150 + i * 72,
                height: 3,
                backgroundColor: COLOR.rule,
              }}
            />
          ))}
          <div
            style={{
              position: "relative",
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 30,
              letterSpacing: "0.24em",
              color: COLOR.labelInkSoft,
              opacity: fade(0.35, 0.6),
            }}
          >
            TITLE
          </div>
          <div
            style={{
              position: "relative",
              marginTop: 18,
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: nameSize,
              lineHeight: 0.98,
              textTransform: "uppercase",
              color: COLOR.labelInk,
              overflowWrap: "anywhere",
              opacity: fade(0.4, 0.7),
              translate: interpolate(frame, [0.4 * fps, 0.8 * fps], ["0px 24px", "0px 0px"], {
                easing: Easing.bezier(0.22, 1, 0.36, 1),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {crateName}
          </div>
          <div
            style={{
              position: "relative",
              marginTop: 44,
              display: "flex",
              alignItems: "center",
              gap: 20,
              opacity: fade(0.6, 0.9),
            }}
          >
            <div
              style={{
                padding: "10px 22px",
                borderRadius: 12,
                backgroundColor: COLOR.labelInk,
                color: COLOR.lcd,
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 44,
                letterSpacing: "0.12em",
              }}
            >
              {count}
            </div>
            {total > shown ? (
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, color: COLOR.labelInkSoft, letterSpacing: "0.1em" }}>
                FIRST {shown}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
