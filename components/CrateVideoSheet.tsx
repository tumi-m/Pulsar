"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useIsPresent } from "motion/react";
import { Player, type PlayerRef } from "@remotion/player";
import { Download, Share2, Square, X } from "lucide-react";
import type { Release } from "@/lib/types";
import { useDialog } from "@/lib/useDialog";
import { useBackClose } from "@/lib/useBackClose";
import { useReducedMotion, EASE, DUR } from "@/lib/motion";
import { useIsTouch } from "@/lib/useIsTouch";
import { playSfx } from "@/lib/sfx";
import { CrateRecap } from "@/remotion/CrateRecap";
import { normalizeRecapProps, recapDurationInFrames, slugify } from "@/remotion/props";
import { recapPropsFromReleases } from "@/remotion/from-releases";
import { browserCanEncode, chooseExportTarget, exportFilename } from "@/remotion/export-target";
import { RECAP_COMPOSITION_ID, RECAP_FPS, RECAP_HEIGHT, RECAP_WIDTH } from "@/remotion/tokens";

/**
 * "Video" in the crate panel: a live preview of the Crate Recap and a button
 * that renders it to a file on this device.
 *
 * Everything heavy is behind a door. FloatingDock loads this file with
 * next/dynamic only when Video is pressed, so the Player and the composition
 * never touch the home page's first load; the web renderer (and Mediabunny
 * under it) is a further dynamic import inside the Download handler, so
 * previewing doesn't download an encoder.
 *
 * Licensing, so nobody is surprised later: Remotion is free for individuals
 * and companies of up to three people; a bigger company needs a Remotion
 * Company License and sets NEXT_PUBLIC_REMOTION_LICENSE_KEY to its public
 * key. renderMediaOnWeb() reports every render to remotion.pro (the page's
 * origin, success/failure, production or not — no video content) whatever the
 * key; "free-license" declares free-tier eligibility and silences its console
 * warning.
 */
const REMOTION_LICENSE_KEY = process.env.NEXT_PUBLIC_REMOTION_LICENSE_KEY || "free-license";

/**
 * That usage report is sent fire-and-forget after a successful render, with
 * no .catch (4.0.535): when remotion.pro is unreachable — offline, an ad
 * blocker, a strict network — its last retry rejects ~7 s later as an
 * uncaught "Failed to fetch", although the video was saved fine. Swallow
 * exactly that rejection (it is thrown from internalRegisterUsageEvent) and
 * nothing else. Installed on the first render, kept for the page's life since
 * it can land after this sheet has closed.
 */
let telemetryGuarded = false;
function guardRemotionTelemetry() {
  if (telemetryGuarded) return;
  telemetryGuarded = true;
  window.addEventListener("unhandledrejection", (e) => {
    const stack = e.reason instanceof Error ? (e.reason.stack ?? "") : "";
    if (!stack.includes("internalRegisterUsageEvent")) return;
    e.preventDefault();
    console.info("Remotion licence telemetry couldn't reach remotion.pro; the video is unaffected.");
  });
}

type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "rendering"; progress: number; frames: number }
  | { kind: "done"; url: string; filename: string; size: number; blob: Blob; note: string | null }
  | { kind: "failed"; message: string }
  | { kind: "cancelled" };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function CrateVideoSheet({
  crateName,
  releases,
  onClose,
}: {
  crateName: string;
  releases: Release[];
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const isTouch = useIsTouch();
  // Inside AnimatePresence: stop owning Back/Escape and focus the moment the
  // exit starts, not when the exit animation has finished.
  const isPresent = useIsPresent();
  useBackClose(isPresent, onClose);
  const dialogRef = useDialog<HTMLDivElement>(isPresent, { modal: true });

  const [withAudio, setWithAudio] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Client-only (FloatingDock loads this with ssr: false), so no hydration to match.
  const [canEncode] = useState(browserCanEncode);
  const playerRef = useRef<PlayerRef>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const saveAgainRef = useRef<HTMLAnchorElement>(null);

  const props = useMemo(
    () => normalizeRecapProps(recapPropsFromReleases(crateName, releases, withAudio)),
    [crateName, releases, withAudio]
  );
  const durationInFrames = recapDurationInFrames(props.records.length, RECAP_FPS);
  const seconds = (durationInFrames / RECAP_FPS).toFixed(1);
  const busy = phase.kind === "checking" || phase.kind === "rendering";

  // Leaving mid-render cancels it; a finished file's object URL is released.
  const doneUrl = phase.kind === "done" ? phase.url : null;
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!doneUrl) return;
    return () => URL.revokeObjectURL(doneUrl);
  }, [doneUrl]);
  // On a phone the result lands below the fold; bring it up.
  useEffect(() => {
    if (doneUrl) resultRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [doneUrl, reduce]);

  // Each step swaps the focused button out of the DOM — Download for the
  // progress card's Cancel, Cancel for the result — which drops focus to
  // <body> and a screen reader back to the top of the page. Hand it to the
  // control that took its place; only when it really fell out, never taking
  // it from somewhere the visitor moved it.
  const view = busy ? "busy" : phase.kind === "done" ? "done" : "idle";
  const lastView = useRef(view);
  useEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    if (document.activeElement && document.activeElement !== document.body) return;
    const next = view === "busy" ? cancelRef : view === "done" ? saveAgainRef : primaryRef;
    next.current?.focus({ preventScroll: true });
  }, [view]);

  const save = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  async function render() {
    if (busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    // One thing drawing frames at a time: the export renders the composition
    // again, off-screen, and a playing preview would halve its speed.
    playerRef.current?.pause();
    guardRemotionTelemetry();
    setPhase({ kind: "checking" });
    try {
      const web = await import("@remotion/web-renderer");
      const choice = await chooseExportTarget(web.canRenderMediaOnWeb, {
        width: RECAP_WIDTH,
        height: RECAP_HEIGHT,
        withAudio: props.withAudio,
      });
      if (controller.signal.aborted) {
        setPhase({ kind: "cancelled" });
        return;
      }
      if (!choice.target) {
        setPhase({ kind: "failed", message: choice.reason });
        playSfx("error");
        return;
      }
      const target = choice.target;
      setPhase({ kind: "rendering", progress: 0, frames: 0 });
      const inputProps = { ...props, withAudio: props.withAudio && !target.muted };
      const { getBlob } = await web.renderMediaOnWeb({
        composition: {
          id: RECAP_COMPOSITION_ID,
          component: CrateRecap,
          width: RECAP_WIDTH,
          height: RECAP_HEIGHT,
          fps: RECAP_FPS,
          durationInFrames,
          defaultProps: inputProps,
        },
        inputProps,
        container: target.container,
        videoCodec: target.videoCodec,
        videoBitrate: target.videoBitrate,
        muted: target.muted,
        signal: controller.signal,
        onProgress: ({ progress, encodedFrames }) =>
          setPhase({ kind: "rendering", progress, frames: encodedFrames }),
        metadata: { title: `${props.crateName} — Crate Recap`, artist: "Pulsar" },
        licenseKey: REMOTION_LICENSE_KEY,
        isProduction: process.env.NODE_ENV === "production",
      });
      const blob = await getBlob();
      // The renderer stops watching the signal once the last frame is
      // encoded, so a Cancel — or closing the sheet — while it finalises the
      // file lands here. Honour it: no download, no chime, and no object URL
      // minted for a sheet that may already be gone.
      if (controller.signal.aborted) {
        setPhase({ kind: "cancelled" });
        return;
      }
      const filename = exportFilename(slugify(props.crateName), target);
      const url = URL.createObjectURL(blob);
      const notes = [
        target.container === "webm" ? "Saved as WebM — this browser has no H.264 encoder." : null,
        choice.droppedAudio ? "Saved without the soundtrack — this browser couldn't encode the audio." : null,
      ].filter(Boolean);
      setPhase({ kind: "done", url, filename, size: blob.size, blob, note: notes.join(" ") || null });
      save(url, filename);
      playSfx("success");
    } catch (err) {
      if (controller.signal.aborted) {
        setPhase({ kind: "cancelled" });
        return;
      }
      console.error("Crate Recap export failed", err);
      setPhase({
        kind: "failed",
        message: `The video couldn't be made on this device${err instanceof Error && err.message ? `: ${err.message}` : "."}`,
      });
      playSfx("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  const cancel = () => abortRef.current?.abort();

  const share = async (blob: Blob, filename: string) => {
    try {
      const file = new File([blob], filename, { type: blob.type });
      await navigator.share({ files: [file], title: `${props.crateName} — Crate Recap` });
    } catch {
      /* dismissed */
    }
  };
  // Phones can hand the file straight to Stories/Messages; desktops mostly can't.
  const canShareFile = useMemo(() => {
    if (phase.kind !== "done" || typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
    try {
      return navigator.canShare({ files: [new File([phase.blob], phase.filename, { type: phase.blob.type })] });
    } catch {
      return false;
    }
  }, [phase]);

  // What a screen reader hears: a few coarse steps, not the ~4-a-second
  // progress ticks (the renderer reports every 250 ms) the visible card shows.
  const quarter = phase.kind === "rendering" ? Math.min(3, Math.floor(phase.progress * 4)) : 0;
  const announcement =
    phase.kind === "checking"
      ? "Preparing the video…"
      : phase.kind === "rendering"
        ? quarter > 0
          ? `Rendering the video, ${quarter * 25}% done.`
          : "Rendering the video…"
        : phase.kind === "done"
          ? `Video ready: ${phase.filename} saved.`
          : phase.kind === "cancelled"
            ? "Cancelled — nothing was saved."
            : "";

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? DUR.instant : DUR.fast }}
        onClick={onClose}
        className="absolute inset-0 z-10 bg-deck/70 backdrop-blur-sm"
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-label="Crate recap video"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
        transition={reduce ? { duration: DUR.instant } : { type: "spring", stiffness: 460, damping: 34 }}
        className="absolute inset-x-3 bottom-3 top-16 z-20 overflow-y-auto overscroll-contain rounded-2xl border border-chrome-700/60 bg-[#151b21]/[0.98] p-4 backdrop-blur-2xl sm:inset-x-4 sm:top-20"
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 24px 60px rgba(0,0,0,0.6)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-ink-400">Video</p>
            <p className="mt-0.5 truncate text-[15px] font-bold text-ink">{props.crateName} · Crate recap</p>
            <p className="mt-0.5 font-mono text-[10.5px] text-ink-400">
              {props.records.length} record{props.records.length === 1 ? "" : "s"}
              {props.totalRecords > props.records.length ? ` (first ${props.records.length} of ${props.totalRecords})` : ""} ·{" "}
              {seconds}s · 1080×1920
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close video"
            className="-mr-1 -mt-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-ink/60 hover:bg-white/10 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* preview — a 9:16 frame sized to the sheet's height, never wider than it */}
        <div
          className="mx-auto mt-3 overflow-hidden rounded-xl border border-white/10 bg-deck shadow-key"
          style={{ width: "min(100%, calc(50dvh * 9 / 16))", aspectRatio: "9 / 16" }}
        >
          <Player
            ref={playerRef}
            component={CrateRecap}
            inputProps={props}
            durationInFrames={durationInFrames}
            compositionWidth={RECAP_WIDTH}
            compositionHeight={RECAP_HEIGHT}
            fps={RECAP_FPS}
            style={{ width: "100%", height: "100%" }}
            controls
            loop
            // Motion the visitor asked not to get doesn't start by itself.
            autoPlay={!reduce}
            // Starts quiet: a sheet that opens talking is rude. The bar's
            // speaker button brings the soundtrack in.
            initiallyMuted
            alwaysShowControls={isTouch}
            clickToPlay
            doubleClickToFullscreen={false}
            spaceKeyToPlayOrPause={false}
            acknowledgeRemotionLicense
          />
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={() => setWithAudio((v) => !v)}
            aria-pressed={withAudio}
            disabled={busy}
            className="flex min-h-11 items-center justify-between rounded-xl border border-chrome-700/50 bg-deck-700/70 px-3 text-left text-[11px] font-bold uppercase tracking-widest text-ink shadow-key transition-colors hover:bg-deck-600 active:translate-y-px active:shadow-keyed disabled:opacity-50"
          >
            Soundtrack
            <span className="flex items-center gap-2 font-mono text-[10px] text-ink-400">
              {withAudio ? "On" : "Off"}
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${withAudio ? "bg-lcd shadow-[0_0_8px_rgba(126,217,174,0.85)]" : "bg-deck-600 ring-1 ring-chrome-700"}`}
              />
            </span>
          </button>

          {phase.kind === "rendering" || phase.kind === "checking" ? (
            <div className="rounded-xl border border-sony/30 bg-deck-700/70 p-3">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-ink">
                <span>{phase.kind === "checking" ? "Checking encoder…" : `Rendering ${Math.round(phase.progress * 100)}%`}</span>
                {phase.kind === "rendering" && (
                  <span className="font-mono text-[10px] font-normal text-ink-400">
                    {phase.frames}/{durationInFrames}
                  </span>
                )}
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-deck"
                role="progressbar"
                aria-label="Render progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={phase.kind === "rendering" ? Math.round(phase.progress * 100) : 0}
              >
                <div
                  className="h-full rounded-full bg-transport transition-[width] duration-200 ease-settle motion-reduce:transition-none"
                  style={{ width: `${phase.kind === "rendering" ? Math.max(2, phase.progress * 100) : 2}%` }}
                />
              </div>
              <button
                ref={cancelRef}
                onClick={cancel}
                className="mt-3 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[10px] border border-chrome-700/70 bg-deck-600 text-[10px] font-bold uppercase tracking-widest text-ink shadow-key active:translate-y-px active:shadow-keyed"
              >
                <Square size={11} fill="currentColor" /> Cancel
              </button>
            </div>
          ) : (
            <button
              ref={primaryRef}
              data-dialog-autofocus
              onClick={render}
              disabled={!canEncode}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#b84516] bg-transport text-[12px] font-bold uppercase tracking-widest text-deck shadow-key transition-[box-shadow,transform] active:translate-y-px active:shadow-keyed disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={15} />
              {phase.kind === "done" ? "Render again" : "Download video"}
            </button>
          )}

          {phase.kind === "done" && (
            <motion.div
              ref={resultRef}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? DUR.instant : DUR.base, ease: EASE.out }}
              className="rounded-xl border border-lcd/30 bg-lcd/10 p-3"
            >
              <p className="text-[11px] font-bold uppercase tracking-widest text-lcd">Video ready</p>
              <p className="mt-0.5 truncate font-mono text-[10.5px] text-ink-400">
                {phase.filename} · {mb(phase.size)}
              </p>
              {phase.note && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">{phase.note}</p>}
              <div className={`mt-2 grid gap-2 ${canShareFile ? "grid-cols-2" : "grid-cols-1"}`}>
                {/* A real link, not only the automatic save: a browser that blocked
                    the download, or a visitor who dismissed it, can save again. */}
                <a
                  ref={saveAgainRef}
                  href={phase.url}
                  download={phase.filename}
                  className="flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] border border-chrome-700/70 bg-deck-600 text-[10px] font-bold uppercase tracking-widest text-ink shadow-key active:translate-y-px active:shadow-keyed"
                >
                  <Download size={12} /> Save again
                </a>
                {canShareFile ? (
                  <button
                    onClick={() => share(phase.blob, phase.filename)}
                    className="flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] border border-chrome-700/70 bg-deck-600 text-[10px] font-bold uppercase tracking-widest text-ink shadow-key active:translate-y-px active:shadow-keyed"
                  >
                    <Share2 size={12} /> Share
                  </button>
                ) : null}
              </div>
            </motion.div>
          )}

          {(phase.kind === "failed" || !canEncode) && (
            <p role="alert" className="rounded-xl border border-vu/40 bg-vu/10 px-3 py-2.5 text-[11px] leading-relaxed text-ink">
              {phase.kind === "failed"
                ? phase.message
                : "This browser can't encode video (it has no WebCodecs). The preview still plays; to download, use recent Chrome, Edge or Firefox, or Safari 26."}
            </p>
          )}
          {phase.kind === "cancelled" && <p className="text-[11px] text-ink-400">Cancelled — nothing was saved.</p>}
          {/* Mounted from the start: a live region that appears with its text
              in it is often not read at all. */}
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {announcement}
          </p>

          <p className="text-[10px] leading-relaxed text-ink-600">
            Made on this device — the video isn&apos;t uploaded anywhere. Keep this sheet open while it renders.
          </p>
        </div>
      </motion.div>
    </>
  );
}
