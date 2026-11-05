"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { motion, useIsPresent } from "motion/react";
import { RotateCcw, X } from "lucide-react";
import type { Release } from "@/lib/types";
import { useDialog } from "@/lib/useDialog";
import { useBackClose } from "@/lib/useBackClose";
import { DUR, useReducedMotion } from "@/lib/motion";

/**
 * The crate panel's Video sheet: its frame, drawn the moment Video is pressed.
 *
 * The sheet's contents, Remotion's Player and the Crate Recap composition
 * (CrateVideoSheet), are about 270 kB gzipped across six chunks, far too much
 * for the home page's first load. They are fetched here, inside a sheet that
 * is already on screen, with its title, record count and Close, and a
 * "Loading preview…" box where the preview will be. Before, the whole sheet
 * was in those chunks: on a slow connection a tap on Video showed nothing for
 * seconds, so it looked like it had failed.
 *
 * Not next/dynamic: React.lazy rethrows a chunk that fails to load (offline,
 * or a deploy that replaced the chunks mid-visit) while rendering, and the
 * home page went down to app/error.tsx over an optional sheet. Here a failure
 * is a message in the sheet with Try again, and it isn't cached, so the retry
 * really fetches again (see TapeLoader and RiveDeck for the same pattern).
 *
 * The frame also owns Back/Escape and focus for the sheet's whole life, so
 * the contents arriving is not a second dialog opening over the first.
 */

export interface CrateVideoProps {
  crateName: string;
  releases: Release[];
  onClose: () => void;
}

type Contents = ComponentType<CrateVideoProps>;

let loaded: Contents | null = null;
let loading: Promise<Contents> | null = null;

function loadContents(): Promise<Contents> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= import("./CrateVideoSheet").then(
    (m) => (loaded = m.CrateVideoSheet),
    (err: unknown) => {
      loading = null;
      throw err;
    },
  );
  return loading;
}

/**
 * Start fetching the contents before the tap lands (pointerenter, focus).
 * A failure here is not reported: the sheet asks again when it opens.
 */
export function preloadCrateVideo(): void {
  loadContents().catch(() => {});
}

/** The 9:16 preview frame: sized to the sheet's height, never wider than it. */
export const PREVIEW_BOX = {
  className: "mx-auto mt-3 overflow-hidden rounded-xl border border-white/10 bg-deck shadow-key",
  style: { width: "min(100%, calc(50dvh * 9 / 16))", aspectRatio: "9 / 16" },
} as const;

/** The sheet's header, shared by the frame's placeholder and the contents. */
export function VideoSheetHeader({ title, meta, onClose }: { title: string; meta: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-ink-400">Video</p>
        <p className="mt-0.5 truncate text-[15px] font-bold text-ink">{title} · Crate recap</p>
        <p className="mt-0.5 font-mono text-[10.5px] text-ink-400">{meta}</p>
      </div>
      <button
        onClick={onClose}
        aria-label="Close video"
        className="-mr-1 -mt-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-ink/60 hover:bg-white/10 hover:text-ink"
      >
        <X size={18} />
      </button>
    </div>
  );
}

export function CrateVideoFrame({ crateName, releases, onClose }: CrateVideoProps) {
  const reduce = useReducedMotion();
  // Inside AnimatePresence: stop owning Back/Escape and focus the moment the
  // exit starts, not when the exit animation has finished.
  const isPresent = useIsPresent();
  useBackClose(isPresent, onClose);
  // Opened before (or warmed by hover): the contents are drawn straight away.
  const [Contents, setContents] = useState<Contents | null>(() => loaded);
  const [failed, setFailed] = useState(false);
  // focusKey: when the contents arrive, focus moves to their Download button
  // (data-dialog-autofocus), as it would have had they been there at once.
  const dialogRef = useDialog<HTMLDivElement>(isPresent, {
    modal: true,
    focusKey: Contents ? "ready" : failed ? "failed" : "loading",
  });

  useEffect(() => {
    if (Contents || failed) return;
    let live = true;
    loadContents().then(
      (C) => live && setContents(() => C),
      (err: unknown) => {
        if (!live) return;
        console.warn("[crate video] couldn't load the video maker:", err);
        setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [Contents, failed]);

  const n = releases.length;

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
        {Contents ? (
          <Contents crateName={crateName} releases={releases} onClose={onClose} />
        ) : (
          <>
            <VideoSheetHeader title={crateName} meta={`${n} record${n === 1 ? "" : "s"}`} onClose={onClose} />
            <div {...PREVIEW_BOX}>
              {failed ? (
                <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                  <p className="text-[12px] font-bold uppercase tracking-widest text-ink">
                    Couldn&apos;t load the video maker
                  </p>
                  <p className="text-[11px] leading-relaxed text-ink-400">
                    Check your connection, then try again. Your crate is safe.
                  </p>
                  <button
                    data-dialog-autofocus
                    onClick={() => setFailed(false)}
                    className="flex min-h-11 w-full max-w-[12rem] items-center justify-center gap-1.5 rounded-[10px] border border-[#b84516] bg-transport text-[11px] font-bold uppercase tracking-widest text-deck shadow-key active:translate-y-px active:shadow-keyed"
                  >
                    <RotateCcw size={13} /> Try again
                  </button>
                  <button
                    onClick={onClose}
                    className="flex min-h-11 w-full max-w-[12rem] items-center justify-center rounded-[10px] border border-chrome-700/70 bg-deck-600 text-[11px] font-bold uppercase tracking-widest text-ink shadow-key active:translate-y-px active:shadow-keyed"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div role="status" className="flex h-full flex-col items-center justify-center gap-3">
                  <span
                    aria-hidden
                    className="h-7 w-7 animate-spin rounded-full border-2 border-chrome-700 border-t-sony motion-reduce:animate-none"
                  />
                  <p className="font-mono text-[11px] text-ink-400">Loading preview…</p>
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}
