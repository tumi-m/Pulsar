"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, GitBranch, Pause, Play, RotateCcw } from "lucide-react";
import { fadeUp, useReducedMotion } from "@/lib/motion";

/**
 * "How sampling works" — a Motion Canvas explainer at the top of the Samples
 * panel, collapsed until someone asks for it.
 *
 * The animation is its own project (explainers/, `npm run motion:explainers`)
 * built into one self-contained module, public/explainers/project.js: the
 * scene, the <motion-canvas-player> element and the one copy of
 * @motion-canvas/core they share. It is fetched by URL at runtime, on first
 * open, so nothing here touches the home page's bundle (this panel is on "/")
 * — and the app's webpack never sees @motion-canvas/core, which the player
 * imports but doesn't install.
 */
export const EXPLAINER_PROJECT = "/explainers/project.js";

/** The scene's own width (explainers/src/project.meta). */
const SCENE_WIDTH = 1920;

/**
 * What the canvas shows, for anyone who can't see it. It is the whole
 * explainer in words, beat by beat, not a label for a video.
 */
export const EXPLAINER_DESCRIPTION =
  "Animated explainer, about 30 seconds, no sound. " +
  "One: the original — a 1973 record plays up to one moment. " +
  "Two: the cut — four seconds of it, 2:14 to 2:18, are highlighted and lifted out. That is the sample. " +
  "Three: the flip — the slice travels into a 1994 song's timeline, is stretched to fill a bar and looped four times, " +
  "sped up from 88 to 93 BPM and pitched up two semitones, with new drums underneath. " +
  "Four: the chain — two bars of that 1994 song are cut the same way and flipped into a 2016 track, " +
  "at 75 BPM and three semitones down. " +
  "Finally the three records fold into a sample graph, 1973 to 1994 to 2016, each with more branches to follow: " +
  "every record is a branch. Dig the chain.";

type PlayerElement = HTMLElement & {
  /** The element's own play/pause (3.17.2). `auto` ignores a pause while it is set. */
  setPlaying?: (playing: boolean) => void;
  /** Core's Player, once the project has loaded. */
  player?: { requestReset(): void } | null;
};

let loading: Promise<string> | null = null;
let failures = 0;

/**
 * Imports the explainer and resolves to the URL it came from: a runtime
 * import of a file in public/, not a module webpack bundles.
 *
 * The card imports it itself, not only through the element's `src`. A failure
 * then lands on the card's Try again instead of the player's own error box.
 * The card can't close under a slow download either: the element only exists
 * once the file is in, and its own import of the same URL is a module-cache
 * hit (explainers/src/player.ts covers the instant that takes). Browsers
 * remember a failed module import for the life of the page, so each retry
 * asks under a URL this page hasn't tried.
 */
function loadExplainer(): Promise<string> {
  if (!loading) {
    const url = failures ? `${EXPLAINER_PROJECT}?retry=${failures}` : EXPLAINER_PROJECT;
    loading = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url).then(
      () => url,
      (err: unknown) => {
        loading = null;
        failures++;
        throw err;
      },
    );
  }
  return loading;
}

let shared: PlayerElement | null = null;

/**
 * One player for the page, made on first open and moved in and out of the
 * card after that. Every Player subscribes to the project's module-level scene
 * descriptions and the 3.17.2 element has no way to undo that, so a fresh
 * element per open could never be freed (~29 MB each time). Detached, this one
 * is asleep — disconnectedCallback deactivates its Player and stops the frame
 * loop — and attaching it again wakes it.
 */
function playerElement(src: string): PlayerElement {
  if (!shared) {
    shared = document.createElement("motion-canvas-player") as PlayerElement;
    // Created by hand, not as JSX: React 19 assigns custom-element props as
    // properties when the element has them, and `auto`/`quality` are
    // getter-only here, so React would throw setting them.
    shared.setAttribute("src", src);
    // The surface around it is the control and carries the description; the
    // canvas itself says nothing to assistive tech.
    shared.setAttribute("aria-hidden", "true");
    shared.className = PLAYER_CLASS;
  }
  return shared;
}

function attachPlayer(host: HTMLElement, src: string): PlayerElement {
  const el = playerElement(src);
  // Re-sized per open: the box can have changed since (rotation, resize).
  el.setAttribute("quality", String(explainerQuality(host.clientWidth, window.devicePixelRatio)));
  // Every open starts at the title frame, which is also reduced motion's
  // poster. Applied on the first frame after it wakes.
  el.player?.requestReset();
  host.appendChild(el);
  return el;
}

/** Paused before it goes, so it wakes paused rather than mid-play. */
function detachPlayer(el: PlayerElement) {
  el.removeAttribute("auto");
  el.setPlaying?.(false);
  el.remove();
}

/**
 * Resolution scale for the player: enough pixels for the box it is drawn in
 * and no more. The scene is 1920 wide, and drawing every pixel of it 30 times
 * a second for a 360-px slot on a phone is battery spent on nothing. Rounded
 * up to quarters so the text stays crisp.
 */
export function explainerQuality(cssWidth: number, dpr: number): number {
  const needed = (Math.max(0, cssWidth) * Math.max(1, dpr || 1)) / SCENE_WIDTH;
  return Math.min(1, Math.max(0.25, Math.ceil(needed * 4) / 4));
}

type Status = "loading" | "ready" | "error";

export function SampleExplainer() {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  // What the viewer wants. Whether it actually plays also depends on the
  // card being on screen.
  const [playing, setPlaying] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  // State, not a ref: the error state swaps the frame out, and Try again
  // brings a new one in, so the effects below re-run for each frame. A ref
  // would leave them on the old, detached one.
  const [host, setHost] = useState<HTMLSpanElement | null>(null);
  const playerRef = useRef<PlayerElement | null>(null);
  const bodyId = useId();
  const descId = useId();

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      setStatus("loading");
      // Reduced motion opens on the title frame and waits for a press.
      setPlaying(!reduced);
    }
  }

  // The player is in the card only while it is open. Closing detaches it,
  // which stops its frame loop; the element itself is kept for the next open.
  // A new frame (Try again) is a new attempt.
  useEffect(() => {
    if (!open || !host) return;
    let cancelled = false;
    let el: PlayerElement | null = null;
    loadExplainer().then(
      (src) => {
        if (cancelled) return;
        el = attachPlayer(host, src);
        playerRef.current = el;
        setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("error");
      },
    );
    return () => {
      cancelled = true;
      // Another card may have taken it since; only put away our own.
      if (el?.parentNode === host) detachPlayer(el);
      playerRef.current = null;
    };
  }, [open, host]);

  // Scrolled out of the panel, it stops drawing; back in view, it resumes if
  // it was playing.
  useEffect(() => {
    if (!open || !host || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      threshold: 0.2,
    });
    io.observe(host);
    return () => io.disconnect();
  }, [open, host]);

  // `auto` is the player's documented way to play, and it waits for the
  // project to load by itself. It also overrides a pause, so pausing has to
  // take it off first.
  useEffect(() => {
    const el = playerRef.current;
    if (!el || status !== "ready") return;
    if (playing && onScreen) {
      el.setAttribute("auto", "true");
    } else {
      el.removeAttribute("auto");
      el.setPlaying?.(false);
    }
  }, [playing, onScreen, status]);

  const fade = fadeUp(reduced, 8);

  return (
    <section className="mt-6">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-tps/[0.08] active:bg-tps/[0.14]"
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-tps/15 text-tps">
            <GitBranch size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold text-ink">How sampling works</span>
            <span className="block truncate text-[11px] text-ink/50">
              Cut, flip, chain — a 30-second explainer
            </span>
          </span>
          <ChevronDown
            size={16}
            className={`flex-shrink-0 text-ink/45 transition-transform motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={bodyId}
              variants={fade}
              initial="hidden"
              animate="show"
              exit="exit"
              className="border-t border-white/10"
            >
              <figure className="m-0">
                {status === "error" ? (
                  <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-deck px-6 text-center">
                    <p className="text-[12px] leading-relaxed text-ink/55">
                      The explainer didn&rsquo;t load.
                    </p>
                    <button
                      type="button"
                      // Brings the frame back, and with it a fresh attempt.
                      onClick={() => setStatus("loading")}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/15 px-4 text-[11px] font-bold uppercase tracking-widest text-ink/70 hover:border-white/30 hover:text-ink active:bg-white/10"
                    >
                      <RotateCcw size={12} /> Try again
                    </button>
                  </div>
                ) : (
                  // The whole frame is the play/pause control: a big target,
                  // and on a phone it's where a thumb goes anyway.
                  <button
                    type="button"
                    onClick={() => status === "ready" && setPlaying((p) => !p)}
                    aria-label={
                      status === "loading"
                        ? "Loading the explainer"
                        : playing
                          ? "Pause the explainer"
                          : "Play the explainer"
                    }
                    aria-describedby={descId}
                    className="group relative block aspect-video w-full overflow-hidden bg-deck text-left active:opacity-90"
                  >
                    <span ref={setHost} className="absolute inset-0 block" />
                    {status === "loading" && (
                      <span className="absolute inset-0 flex flex-col justify-center gap-1 px-[6%]">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-tps/70">
                          Pulsar · explainer
                        </span>
                        <span className="text-xl font-extrabold tracking-tight text-ink/80">
                          How sampling works
                        </span>
                      </span>
                    )}
                    {status === "ready" && !playing && (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sony text-[#0b0d10] shadow-sony">
                          <Play size={22} fill="currentColor" className="translate-x-[1px]" />
                        </span>
                      </span>
                    )}
                    {status === "ready" && playing && (
                      <span className="pointer-events-none absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#0b0d10]/70 text-ink/80 opacity-70 group-hover:opacity-100">
                        <Pause size={13} fill="currentColor" />
                      </span>
                    )}
                  </button>
                )}
                <figcaption className="px-3 py-2.5 text-[11px] leading-relaxed text-ink/55">
                  A slice gets cut from one record, looped into a new song — and that song gets
                  sampled in turn. Every record below is a branch: tap one to dig its chain.
                  <span id={descId} className="sr-only">
                    {EXPLAINER_DESCRIPTION}
                  </span>
                </figcaption>
              </figure>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/*
 * The element's own overlay is switched off: its play button (the frame
 * above is the control), its click handling (it ignores clicks while `auto`
 * is set) and, with reduced motion, its spinning loader. Its paused dimming is
 * kept but lighter, so the title frame stays readable as a poster.
 */
const PLAYER_CLASS = [
  "block w-full",
  "[&::part(play-button)]:hidden",
  "[&::part(overlay)]:pointer-events-none",
  "[&::part(overlay)]:bg-[rgba(11,13,16,0.35)]",
  "motion-reduce:[&::part(loader)]:hidden",
].join(" ");
