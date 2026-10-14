import type React from "react";
import { COLOR } from "./tokens";

/**
 * A cassette reel: wound tape, a cream hub with six teeth, a spindle hole.
 *
 * Built from plain circles and rectangles, not SVG or radial/conic gradients.
 * The browser exporter re-draws the DOM itself and supports only a single
 * linear gradient per element (the app's .jcard-window reels are a conic
 * gradient under a mask, which it would drop); an inline SVG would be
 * rasterised again on every frame. Same reason the teeth exist at all: a
 * radially symmetric hub turning looks like nothing.
 */
export function Reel({
  size,
  pack,
  angle,
  style,
}: {
  /** Outer diameter, px. */
  size: number;
  /** How much tape is wound on, as a fraction of `size` (0.6–0.96). */
  pack: number;
  /** Rotation of the hub, degrees. */
  angle: number;
  style?: React.CSSProperties;
}) {
  const tape = Math.round(size * pack);
  const hub = Math.round(size * 0.46);
  const hole = Math.round(size * 0.13);
  const tooth = { w: Math.max(3, Math.round(size * 0.05)), h: Math.max(6, Math.round(size * 0.1)) };
  return (
    <div style={{ position: "absolute", width: size, height: size, ...style }}>
      {/* the wound tape: doesn't turn visibly, so it sits outside the rotor */}
      <div
        style={{
          position: "absolute",
          left: (size - tape) / 2,
          top: (size - tape) / 2,
          width: tape,
          height: tape,
          borderRadius: "50%",
          backgroundColor: COLOR.tape,
          backgroundImage: "linear-gradient(160deg, #4a3628 0%, #3a2a20 45%, #24190f 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: (size - hub) / 2,
          top: (size - hub) / 2,
          width: hub,
          height: hub,
          rotate: `${angle}deg`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            backgroundColor: COLOR.cream,
            border: `${Math.max(2, Math.round(size * 0.02))}px solid ${COLOR.hubShadow}`,
            boxSizing: "border-box",
          }}
        />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <div
            key={deg}
            style={{
              position: "absolute",
              left: (hub - tooth.w) / 2,
              top: (hub - tooth.h) / 2,
              width: tooth.w,
              height: tooth.h,
              borderRadius: tooth.w / 2,
              backgroundColor: COLOR.deck900,
              // Out from the centre to just inside the rim.
              transform: `rotate(${deg}deg) translateY(${-(hub / 2 - tooth.h / 2 - size * 0.035)}px)`,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: (hub - hole) / 2,
            top: (hub - hole) / 2,
            width: hole,
            height: hole,
            borderRadius: "50%",
            backgroundColor: COLOR.deck900,
          }}
        />
      </div>
    </div>
  );
}

/** A screw head in a cassette shell's corner. The slot angle varies per tape. */
export function Screw({ size, slot, style }: { size: number; slot: number; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#3a434d",
        backgroundImage: "linear-gradient(150deg, #5a646e 0%, #2a3139 100%)",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: size * 0.18,
          top: size / 2 - 1.5,
          width: size * 0.64,
          height: 3,
          backgroundColor: "#14181c",
          rotate: `${slot}deg`,
        }}
      />
    </div>
  );
}
