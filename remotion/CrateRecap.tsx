import { useMemo } from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Deck, Header } from "./Deck";
import { Intro } from "./Intro";
import { Outro } from "./Outro";
import { normalizeRecapProps, recapTimeline, type CrateRecapProps } from "./props";
import { RecordCard } from "./RecordCard";
import { COLOR, FONT, RECAP_BED } from "./tokens";

/**
 * Crate Recap — a vertical video of a crate: a title card, each record dealt
 * in as a cassette J-card, and a "Made with Pulsar" sign-off, over a deck whose
 * reels wind the whole way through.
 *
 * Rendered three ways from this one component: `npm run motion:render` (CLI),
 * the <Player> preview in the crate panel, and "Download video" in the browser
 * (@remotion/web-renderer). The last one redraws the DOM onto a canvas itself
 * and supports a subset of CSS — one linear gradient per element, no inset
 * shadows, no z-index (DOM order is paint order) — so the whole design keeps
 * to that subset.
 */
export function CrateRecap(input: CrateRecapProps) {
  // calculateMetadata already normalises for the CLI; the Player and the web
  // renderer pass props straight through, and Studio can edit them into any
  // shape, so normalise here too — it is idempotent.
  const { crateName, records, withAudio, totalRecords } = useMemo(() => normalizeRecapProps(input), [input]);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = recapTimeline(records.length, fps);

  return (
    // Font and colour set here, not inherited: in the app this renders inside
    // Pulsar's document, whose body styles would otherwise leak in.
    <AbsoluteFill style={{ backgroundColor: COLOR.deck900, color: COLOR.ink, fontFamily: FONT, overflow: "hidden" }}>
      <Backdrop />
      <Header crateName={crateName} timeline={t} />

      <Sequence name="Intro" durationInFrames={t.intro + t.cardExit} premountFor={fps}>
        <Intro crateName={crateName} shown={records.length} total={totalRecords} exitAt={t.intro - 0.1 * fps} />
      </Sequence>

      {/* One template for every record: they are data, not hand-placed scenes. */}
      {records.map((record, i) => (
        <Sequence
          key={i}
          name={`Record ${i + 1}`}
          from={t.intro + i * t.perRecord}
          durationInFrames={t.perRecord + t.cardExit}
          premountFor={fps}
        >
          <RecordCard record={record} index={i} count={records.length} slot={t.perRecord} />
        </Sequence>
      ))}

      <Sequence name="Outro" from={t.outroStart - Math.round(0.1 * fps)} premountFor={fps}>
        <Outro records={records} crateName={crateName} total={totalRecords} />
      </Sequence>

      <Deck />

      {withAudio ? (
        <Audio
          name="Recap bed"
          src={staticFile(RECAP_BED)}
          loop
          premountFor={fps}
          volume={interpolate(frame, [0, 0.4 * fps, durationInFrames - 1.6 * fps, durationInFrames - 1], [0, 0.9, 0.9, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
      ) : null}
    </AbsoluteFill>
  );
}
