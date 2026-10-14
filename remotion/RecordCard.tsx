import { useMemo } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CoverArt } from "./CoverArt";
import { ARTIST_SIZES, fitArtist, fitTitle, TITLE_LINE_HEIGHT } from "./fit";
import { accentFor, type NormalizedRecord } from "./props";
import { CARD_TOP, CARD_WIDTH, COLOR, FONT, MONO, RECAP_WIDTH } from "./tokens";

/**
 * One record: its cover, and under it the cassette J-card it would have come
 * in — cream, lined, the maker's stripe across the top, the title in heavy
 * capitals and the artist beneath.
 *
 * It deals in from below the deck with a spring, turned a few degrees (to
 * alternate sides, like cards dealt from a hand), then sinks back while the
 * next one lands on top of it. Every value is a function of the frame.
 */
export function RecordCard({
  record,
  index,
  count,
  slot,
}: {
  record: NormalizedRecord;
  index: number;
  count: number;
  /** Frames this record owns before the next one starts dealing in. */
  slot: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tilt = index % 2 === 0 ? 7 : -6;
  const accent = accentFor(record.artist);
  // Laid out once per record, not once per frame.
  const title = useMemo(() => fitTitle(record.title), [record.title]);
  const artist = useMemo(() => fitArtist(record.artist), [record.artist]);
  // A fixed line box, so a long name that steps down a size doesn't pull the
  // card's bottom edge up with it.
  const artistLine = Math.ceil(ARTIST_SIZES[0] * 1.1);
  const land = 0.62 * fps;
  const sideLabel = `SIDE ${index % 2 === 0 ? "A" : "B"} · ${String(index + 1).padStart(2, "0")}/${String(count).padStart(2, "0")}`;

  return (
    <div
      style={{
        position: "absolute",
        left: (RECAP_WIDTH - CARD_WIDTH) / 2,
        top: CARD_TOP,
        width: CARD_WIDTH,
        display: "flex",
        flexDirection: "column",
        transformOrigin: "50% 100%",
        translate: interpolate(frame, [0, land, slot, slot + 0.34 * fps], ["0px 1240px", "0px 0px", "0px 0px", "0px -70px"], {
          easing: [Easing.spring({ damping: 15, stiffness: 120 }), Easing.linear, Easing.bezier(0.4, 0, 1, 1)],
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        rotate: interpolate(frame, [0, land, slot, slot + 0.34 * fps], [`${tilt}deg`, "0deg", "0deg", `${-tilt * 0.4}deg`], {
          easing: [Easing.spring({ damping: 15, stiffness: 120 }), Easing.linear, Easing.bezier(0.4, 0, 1, 1)],
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        scale: interpolate(frame, [slot, slot + 0.34 * fps], [1, 0.88], {
          easing: Easing.bezier(0.4, 0, 1, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          output: "perceptual-scale",
        }),
        opacity: interpolate(frame, [slot, slot + 0.34 * fps], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      <div
        style={{
          width: CARD_WIDTH,
          height: CARD_WIDTH,
          borderRadius: 30,
          backgroundColor: COLOR.deck700,
          boxShadow: "0 40px 80px rgba(0, 0, 0, 0.55)",
        }}
      >
        <CoverArt record={record} size={CARD_WIDTH} radius={30} />
      </div>

      {/* the J-card */}
      <div
        style={{
          position: "relative",
          marginTop: 22,
          borderRadius: 20,
          overflow: "hidden",
          backgroundColor: COLOR.cream,
          backgroundImage: `linear-gradient(180deg, ${COLOR.creamTop} 0%, ${COLOR.creamBottom} 100%)`,
          boxShadow: "0 30px 60px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div
          style={{
            height: 64,
            backgroundColor: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 40px",
            boxSizing: "border-box",
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 30,
            letterSpacing: "0.16em",
            color: COLOR.labelInk,
          }}
        >
          <span>{sideLabel}</span>
          {record.year ? <span>{record.year}</span> : null}
        </div>
        <div
          style={{
            padding: "22px 44px 28px",
            boxSizing: "border-box",
            opacity: interpolate(frame, [0.3 * fps, 0.55 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [0.3 * fps, 0.6 * fps], ["0px 18px", "0px 0px"], {
              easing: Easing.bezier(0.22, 1, 0.36, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: title.fontSize,
              lineHeight: TITLE_LINE_HEIGHT,
              letterSpacing: "0.005em",
              textTransform: "uppercase",
              color: COLOR.labelInk,
              // fitTitle has already sized and, if it must, cut the title (with
              // an ellipsis) to these lines — line-clamp and text-overflow are
              // not things the browser exporter draws. The clip is only a
              // backstop; these styles must match TITLE_FACE in fit.ts.
              maxHeight: Math.ceil(title.fontSize * TITLE_LINE_HEIGHT * title.maxLines) + 4,
              overflow: "hidden",
              overflowWrap: "anywhere",
            }}
          >
            {title.text}
          </div>
          <div
            style={{
              marginTop: 14,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: artist.fontSize,
              height: artistLine,
              lineHeight: `${artistLine}px`,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: COLOR.labelInkSoft,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {artist.text}
          </div>
        </div>
      </div>
    </div>
  );
}
