"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { usePlayer } from "./player/PlayerProvider";
import { DUR, ms, useReducedMotion } from "@/lib/motion";

/**
 * Rive deck: the LCD from Rive's own "digital music player", set into the
 * transport bar beside Pulsar's time readout and driven by the real player.
 *
 * The file is a whole player (cream case, keys, four faders) whose state
 * machine was built for exactly this binding: `isPlaying` swaps the glass's ▷
 * for ‖, `trackProgress` runs the line along its foot, and two text runs carry
 * the title and the artist. Only the glass is shown. The artboard is drawn
 * larger than the slot and cropped, and its keys and faders, which carry Rive
 * listeners of their own, never see a pointer.
 *
 * Decorative, so aria-hidden: the bar's buttons stay the controls, and its
 * title and LCD already say everything this does. The glass's own time
 * readouts are blanked so it never repeats the one beside it. It moves only
 * while the tape runs: paused, it settles and holds a still frame.
 *
 * Loaded on demand, and only where there's room. A phone's bar is already a
 * title and three keys, so below `lg` nothing is fetched at all. Anything that
 * fails (the chunk, the wasm, the file) renders nothing.
 *
 * Source, commit and licences: public/rive/NOTICE.md.
 */

const SRC = "/rive/digital_music_player.riv";
/**
 * Self-hosted, with the runtime's version in the name. By default the runtime
 * fetches this from unpkg, which is a third-party dependency for a decoration
 * and fails behind a strict network. The CDN fallback is switched off for the
 * same reason. test/rive-deck.test.ts checks this file is the installed one.
 */
export const RIVE_WASM = "/rive/rive-2.44.0.wasm";
const STATE_MACHINE = "State Machine 1";
/** Below this the bar has no width to spare (see NowPlayingBar). */
const WIDE = "(min-width: 1024px)";

/**
 * The glass's title window: twelve cells of a monospace segment font. The
 * file's marquee ping-pongs any title narrower or wider than the window. A
 * title of exactly this many cells has nowhere to go: measured, it eases about
 * a third of a CSS pixel, which nobody can see.
 */
export const LCD_CHARS = 12;
/**
 * The artist row: fifteen cells of the same font, smaller. Its text box wraps
 * at a space and only the first line sits behind the glass, so an artist one
 * cell too long loses its whole last word ("THE VELVET UNDERGROUND & NICO"
 * read "THE VELVET"). Measured by rendering strings of known length.
 */
export const ARTIST_CHARS = 15;

/**
 * The glass, in the 500×500 artboard's own units. Measured from rendered pixels
 * and inset half a unit so no anti-aliased cream from the case shows at the edges.
 */
const ARTBOARD = 500;
const GLASS = { x: 145, y: 89, w: 210, h: 108 };

/**
 * Whenever the tape isn't running (paused, buffering, or any time under
 * reduced motion) the state machine runs only this long after a change, then
 * holds still. That covers the ▷/‖ swap and the line's move. It matters for
 * more than stillness: the file's animations mark the artboard dirty every
 * frame, and Rive only stops its frame loop once the state machine is paused.
 * A paused deck left running redrew the whole 500×500 player, case and keys
 * nobody sees, thousands of canvas calls a second for as long as the bar was up.
 */
const SETTLE_MS = 500;

/** Folds that NFKD leaves alone, onto letters the segment font has. */
const FOLD: Record<string, string> = {
  ß: "SS", Æ: "AE", æ: "AE", Œ: "OE", œ: "OE", Ø: "O", ø: "O",
  Ð: "D", ð: "D", Đ: "D", đ: "D", Þ: "TH", þ: "TH", Ł: "L", ł: "L", ı: "I",
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "“": '"', "”": '"', "„": '"',
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-",
};

/**
 * Text the LCD can draw. The embedded font covers printable ASCII. Anything
 * else, such as Cyrillic or CJK, renders as a row of tofu boxes, which looks
 * broken rather than retro. So accents are folded away and unknown characters
 * drop out. A title with no letters or digits left shows a blank row rather
 * than a stray dash.
 */
export function lcdText(raw: string): string {
  const text = raw
    .replace(/[^\x20-\x7e]/g, (c) => FOLD[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return /[A-Z0-9]/.test(text) ? text : "";
}

/**
 * Cut to a window the way a hardware LCD does: hard, at the cell, mid-word if
 * need be, so the cut reads as a cut and not as a shorter name. A separator
 * left dangling at the edge goes too: "BOB MARLEY &" looks like a typo.
 */
export function lcdCut(text: string, cells: number): string {
  if (text.length <= cells) return text;
  return text.slice(0, cells).replace(/[\s&+,/:;([-]+$/, "");
}

export interface DeckSnapshot {
  playing: boolean;
  loading: boolean;
  /** 0..1: the position the bar shows, which is the scrub while dragging. */
  progress: number;
  title: string;
  artist: string;
}

export interface DeckInputs {
  isPlaying: boolean;
  /** The file's own scale: 0..100. */
  trackProgress: number;
  track: string;
  artist: string;
}

/**
 * Player state → the file's inputs and text runs.
 *
 * Every title is padded out to the window, so a short one stays put instead of
 * drifting from side to side. A long one scrolls while the tape runs, which is
 * the reason to have a marquee. Whenever the deck holds still (paused,
 * buffering, or under reduced motion, see SETTLE_MS) the title is cut to the
 * window instead, so the held frame reads from its first letter rather than
 * from wherever the marquee stopped. The artist row has no marquee at all, so
 * it is always cut.
 */
export function deckInputs(s: DeckSnapshot, reduced: boolean): DeckInputs {
  // While the audio is still buffering the key shows a spinner, not ‖, and
  // so does the glass: "LOADING" over ▷.
  const isPlaying = s.playing && !s.loading;
  const title = s.loading ? "LOADING" : lcdText(s.title);
  const fitted = reduced || !isPlaying ? lcdCut(title, LCD_CHARS) : title;
  const progress = Number.isFinite(s.progress) ? Math.min(1, Math.max(0, s.progress)) : 0;
  return {
    isPlaying,
    // Whole percent: a 30s preview moves 0.3s per step, finer than the
    // line can show at this size, and Rive isn't re-poked on every tick.
    trackProgress: Math.round(progress * 100),
    track: fitted.padEnd(LCD_CHARS, " "),
    artist: lcdCut(lcdText(s.artist), ARTIST_CHARS),
  };
}

/* ── the lazy half ───────────────────────────────────────────── */

interface CanvasProps {
  inputs: DeckInputs;
  reduced: boolean;
  onFail: () => void;
}

type Kit = typeof import("@rive-app/react-canvas");
type RiveInstance = InstanceType<Kit["Rive"]>;

function writeText(rive: RiveInstance, i: Pick<DeckInputs, "track" | "artist">) {
  // `trackDummy` is the marquee's second copy, for a seamless wrap.
  rive.setTextRunValue("track", i.track);
  rive.setTextRunValue("trackDummy", i.track);
  rive.setTextRunValue("artist", i.artist);
}

function writeInputs(rive: RiveInstance, i: Pick<DeckInputs, "isPlaying" | "trackProgress">) {
  for (const input of rive.stateMachineInputs(STATE_MACHINE) ?? []) {
    if (input.name === "isPlaying") input.value = i.isPlaying;
    else if (input.name === "trackProgress") input.value = i.trackProgress;
  }
}

/**
 * Built once, when the runtime arrives, so the component's identity is stable
 * and it can call the package's hooks without the page importing them.
 */
function makeCanvas(kit: Kit): ComponentType<CanvasProps> {
  const { useRive, Layout, Fit, Alignment } = kit;
  // The slot below is the artboard's own aspect (square), so Contain maps the
  // artboard onto it exactly and the crop offsets hold.
  const layout = new Layout({ fit: Fit.Contain, alignment: Alignment.Center });

  return function DeckCanvas({ inputs, reduced, onFail }: CanvasProps) {
    // useRive reads its parameters once, when the canvas mounts, so the load
    // callback reads the latest values through a ref.
    const latest = useRef(inputs);
    latest.current = inputs;

    const { rive, RiveComponent } = useRive({
      src: SRC,
      stateMachine: STATE_MACHINE,
      autoplay: !reduced,
      layout,
      shouldDisableRiveListeners: true,
      // The file embeds its only asset (the font); never reach for Rive's CDN.
      enableRiveAssetCDN: false,
      onLoadError: onFail,
      // Before React hears about the load, so the file's demo copy ("SUPER
      // DUPER LONG TRACK TITLE", 0:22 / 3:37) is never drawn.
      onRiveReady: (r) => {
        r.setTextRunValue("timeStart", "");
        r.setTextRunValue("timeEnd", "");
        writeText(r, latest.current);
        writeInputs(r, latest.current);
      },
    });

    const { track, artist, isPlaying, trackProgress } = inputs;
    useEffect(() => {
      if (rive) writeText(rive, { track, artist });
    }, [rive, track, artist]);
    useEffect(() => {
      if (rive) writeInputs(rive, { isPlaying, trackProgress });
    }, [rive, isPlaying, trackProgress]);

    // A paused state machine is never advanced, so new inputs would not show.
    // Run it on every change; unless the tape is running in full motion, stop
    // it again once it has settled (SETTLE_MS) and hold that frame. Declared
    // after the writes so they land first.
    useEffect(() => {
      if (!rive) return;
      if (!rive.isPlaying) rive.play(STATE_MACHINE);
      if (isPlaying && !reduced) return;
      const t = window.setTimeout(() => rive.pause(STATE_MACHINE), SETTLE_MS);
      return () => window.clearTimeout(t);
    }, [rive, reduced, track, artist, isPlaying, trackProgress]);

    return (
      <span
        className="absolute block"
        style={{
          left: `${(-GLASS.x / GLASS.w) * 100}%`,
          top: `${(-GLASS.y / GLASS.h) * 100}%`,
          width: `${(ARTBOARD / GLASS.w) * 100}%`,
          height: `${(ARTBOARD / GLASS.h) * 100}%`,
          // The glass lights up once the file is drawn, rather than flashing
          // in over the unlit slot.
          opacity: rive ? 1 : 0,
          transition: `opacity ${ms(DUR.base, reduced)}ms`,
        }}
      >
        <RiveComponent className="h-full w-full" />
      </span>
    );
  };
}

let pending: Promise<ComponentType<CanvasProps>> | null = null;

/**
 * Not next/dynamic: React.lazy rethrows a failed chunk while rendering, which
 * would take the route down to app/error.tsx over a decoration (see
 * TapeLoader). A failure here is swallowed by the caller and isn't cached, so
 * the next mount asks again.
 *
 * The runtime is about 115 kB gzipped plus the wasm (~820 kB gzipped). Neither
 * may reach "/"'s first load: the bar is on the home page.
 */
function loadCanvas(): Promise<ComponentType<CanvasProps>> {
  pending ??= import("@rive-app/react-canvas").then(
    (kit) => {
      kit.RuntimeLoader.setWasmUrl(RIVE_WASM);
      kit.RuntimeLoader.setWasmFallbackUrl(null);
      // This file predates data binding: it has no view model, so inputs and
      // text runs are the only handles it offers. Re-authoring it with view
      // model properties is what retires these two warnings, not this line.
      kit.Rive.suppressDeprecationWarnings = ["state-machine-inputs", "text-runs"];
      return makeCanvas(kit);
    },
    (err: unknown) => {
      pending = null;
      throw err;
    },
  );
  return pending;
}

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** False on the server and until the media query says otherwise. */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

/**
 * `progress` comes from the bar rather than useTransport: while the scrubber
 * is held the bar shows the dragged position, and the glass's line must agree
 * with the scrubber and the time readout beside it, not with the audio.
 */
export function RiveDeck({ progress }: { progress: number }) {
  const { current, playing, loading } = usePlayer();
  const reduced = !!useReducedMotion();
  const wide = useWide();
  const [Canvas, setCanvas] = useState<ComponentType<CanvasProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);

  useEffect(() => {
    if (!wide || Canvas || failed) return;
    let live = true;
    loadCanvas().then(
      (C) => live && setCanvas(() => C),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [wide, Canvas, failed]);

  if (!wide || failed || !current) return null;

  const inputs = deckInputs(
    { playing, loading, progress, title: current.title, artist: current.artist },
    reduced,
  );

  return (
    // The unlit glass holds the slot while the runtime downloads, so the bar
    // doesn't shift when it lights.
    <span
      aria-hidden="true"
      className="pointer-events-none relative block h-11 flex-shrink-0 overflow-hidden rounded-md"
      style={{
        aspectRatio: `${GLASS.w} / ${GLASS.h}`,
        background: "#0d0e10",
        boxShadow: "0 1px 0 rgba(231,235,238,0.08)",
      }}
    >
      {Canvas && <Canvas inputs={inputs} reduced={reduced} onFail={fail} />}
      {/* The bezel, matching the time readout's. It is a layer over the glass,
          not a border on the slot: a border would shrink the box the crop's
          percentages are measured against, and an inset shadow on the slot
          would be painted under the canvas. */}
      <span
        className="absolute inset-0 rounded-md border border-black/60"
        style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.9)" }}
      />
    </span>
  );
}
