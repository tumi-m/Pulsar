import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Reel } from "./Reel";
import { reelAngle, reelPack, recordIndexAt, type RecapTimeline } from "./props";
import { COLOR, DECK_HEIGHT, DECK_TOP, FONT, MONO, RECAP_WIDTH, SAFE_X } from "./tokens";

/**
 * The room the tape plays in: a dark housing with one slow sheen across it.
 * One linear gradient per element — the browser exporter draws exactly one.
 */
export function Backdrop() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: COLOR.deck900,
          backgroundImage: "linear-gradient(180deg, #161b21 0%, #0b0d10 46%, #0b0d10 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -600,
          top: -200,
          width: 1400,
          height: 2400,
          rotate: "18deg",
          translate: interpolate(frame, [0, durationInFrames], ["-200px 0px", "600px 0px"]),
          backgroundImage:
            "linear-gradient(90deg, rgba(242,102,44,0) 0%, rgba(242,102,44,0.07) 50%, rgba(242,102,44,0) 100%)",
        }}
      />
    </>
  );
}

/**
 * Top bar while the records play: the crate's name, and a Walkman-style LCD
 * reading which record this is.
 */
export function Header({ crateName, timeline }: { crateName: string; timeline: RecapTimeline }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = recordIndexAt(frame, timeline);
  const showAt = timeline.intro - 0.25 * fps;
  const hideAt = timeline.outroStart;
  const opacity = interpolate(frame, [showAt, showAt + 0.3 * fps, hideAt, hideAt + 0.3 * fps], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (opacity === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE_X,
        right: SAFE_X,
        top: 104,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 30,
        opacity,
        translate: interpolate(frame, [showAt, showAt + 0.4 * fps], ["0px -20px", "0px 0px"], {
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: "0.32em",
            color: COLOR.sony,
          }}
        >
          CRATE RECAP
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 54,
            lineHeight: 1.1,
            textTransform: "uppercase",
            color: COLOR.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {crateName.length > 20 ? `${crateName.slice(0, 19).trimEnd()}…` : crateName}
        </div>
      </div>
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "baseline",
          padding: "12px 22px",
          borderRadius: 14,
          backgroundColor: COLOR.lcdWell,
          border: "2px solid #1f3328",
          fontFamily: MONO,
          fontWeight: 700,
          color: COLOR.lcd,
        }}
      >
        <span style={{ fontSize: 64, lineHeight: 1 }}>{String(Math.max(1, n)).padStart(2, "0")}</span>
        <span style={{ fontSize: 34, lineHeight: 1, color: "rgba(126,217,174,0.55)" }}>
          /{String(timeline.recordCount).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

/**
 * The deck along the bottom, always running: a tape window whose reels wind
 * from left to right over the whole video, a tape counter, and a play lamp.
 * Cards deal in from behind it — it is drawn after them — so each record
 * reads as coming out of the machine.
 */
export function Deck() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const progress = Math.min(1, frame / Math.max(1, durationInFrames - 1));
  const width = RECAP_WIDTH - SAFE_X * 2;
  const windowW = 600;
  const windowH = 196;
  const reel = 168;
  // Tape time, as on the real thing: a Walkman counter ticks about four digits
  // a second at play speed.
  const counter = String(Math.floor((frame / fps) * 4) % 1000).padStart(3, "0");
  const stopped = frame >= durationInFrames - 0.9 * fps;

  return (
    <div
      style={{
        position: "absolute",
        left: SAFE_X,
        top: DECK_TOP,
        width,
        height: DECK_HEIGHT,
        borderRadius: 40,
        backgroundColor: COLOR.deck700,
        backgroundImage: "linear-gradient(180deg, #2a323b 0%, #1a2027 55%, #151b21 100%)",
        border: "2px solid rgba(255,255,255,0.09)",
        boxSizing: "border-box",
        boxShadow: "0 -20px 60px rgba(0,0,0,0.55)",
        translate: interpolate(frame, [0, 0.5 * fps], ["0px 380px", "0px 0px"], {
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      {/* tape window */}
      <div
        style={{
          position: "absolute",
          left: 36,
          top: 34,
          width: windowW,
          height: windowH,
          borderRadius: windowH / 2,
          backgroundColor: COLOR.deck900,
          backgroundImage: "linear-gradient(180deg, #05070a 0%, #111519 100%)",
          border: "3px solid #05070a",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* the tape running between the packs, across the heads */}
        <div
          style={{
            position: "absolute",
            left: windowW * 0.28,
            right: windowW * 0.28,
            bottom: 18,
            height: 8,
            borderRadius: 4,
            backgroundColor: COLOR.tape,
          }}
        />
        <Reel
          size={reel}
          pack={reelPack(progress, "supply")}
          angle={reelAngle(frame, durationInFrames, fps, "supply")}
          style={{ left: windowW * 0.28 - reel / 2, top: (windowH - 6 - reel) / 2 }}
        />
        <Reel
          size={reel}
          pack={reelPack(progress, "takeup")}
          angle={reelAngle(frame, durationInFrames, fps, "takeup")}
          style={{ left: windowW * 0.72 - reel / 2, top: (windowH - 6 - reel) / 2 }}
        />
      </div>

      {/* counter + lamp */}
      <div
        style={{
          position: "absolute",
          right: 36,
          top: 34,
          width: width - windowW - 36 * 3,
          height: windowH,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            padding: "14px 0",
            borderRadius: 16,
            backgroundColor: COLOR.lcdWell,
            border: "2px solid #1f3328",
            textAlign: "center",
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 66,
            lineHeight: 1,
            letterSpacing: "0.08em",
            color: COLOR.lcd,
          }}
        >
          {counter}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingLeft: 6 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: stopped ? COLOR.deck600 : COLOR.lcd,
              boxShadow: stopped ? "none" : "0 0 18px rgba(126,217,174,0.85)",
            }}
          />
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, letterSpacing: "0.2em", color: COLOR.ink400 }}>
            {stopped ? "STOP" : "PLAY"}
          </span>
        </div>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: "0.3em", color: COLOR.chrome700 }}>
          PULSAR
        </div>
      </div>

      {/* tape progress */}
      <div
        style={{
          position: "absolute",
          left: 36,
          right: 36,
          bottom: 34,
          height: 12,
          borderRadius: 6,
          backgroundColor: COLOR.deck900,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${(progress * 100).toFixed(2)}%`,
            height: "100%",
            borderRadius: 6,
            backgroundColor: COLOR.sony,
            backgroundImage: "linear-gradient(90deg, #f2662c 0%, #ff8c39 70%, #ffce0a 100%)",
          }}
        />
      </div>
    </div>
  );
}
