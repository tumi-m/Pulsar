"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Link as LinkIcon, AudioLines } from "lucide-react";
import type { Release } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Artwork } from "./Artwork";
import { PLATFORMS } from "./platforms";

interface ReleaseDetailProps {
  release: Release | null;
  onClose: () => void;
  onVisualize?: (release: Release) => void;
}

/**
 * Half-page detail — a right-side sheet. On large screens it occupies the
 * right half of the viewport while the grid reflows into the left half
 * (see ReleaseGrid). On small screens it becomes a full-height overlay.
 */
export function ReleaseDetail({ release, onClose, onVisualize }: ReleaseDetailProps) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const available = release ? PLATFORMS.filter((p) => Boolean(release[p.key])) : [];

  async function copyLink(key: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <AnimatePresence>
      {release && (
        <>
          {/* dim only the LEFT (grid) half on small screens; on lg the grid
              reflows so we keep a very light scrim just for focus */}
          <motion.button
            aria-label="Close detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 cursor-default bg-void/60 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-0"
          />

          <motion.aside
            key={release.id}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="fixed right-0 top-14 bottom-0 z-40 flex w-full flex-col border-l border-star-white/10 bg-[#08080f]/95 backdrop-blur-xl lg:w-1/2"
            role="dialog"
            aria-modal="false"
            aria-label={`${release.title} by ${release.artist}`}
          >
            {/* header row — artwork, meta, close */}
            <div className="flex items-start gap-4 border-b border-star-white/5 p-5">
              <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg">
                <Artwork src={release.artwork_url} artist={release.artist} title={release.title} sizes="96px" />
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <h2 className="text-lg font-bold uppercase leading-tight tracking-tight text-star-white">
                  {release.title}
                </h2>
                <p className="mt-0.5 text-sm text-star-white/55">{release.artist}</p>
                <p className="mt-2 text-[10px] font-mono uppercase tracking-[0.18em] text-star-white/35">
                  {release.type} · {formatDate(release.release_date)}
                  {release.genre ? ` · ${release.genre}` : ""}
                </p>
                {release.label && (
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neon-green/70">
                    ▪ {release.label}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-star-white/15 text-star-white/55 transition-colors hover:border-star-white/40 hover:text-star-white"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>

            {/* scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {release.curator_note && (
                <p className="border-b border-star-white/5 px-5 py-4 text-sm italic leading-relaxed text-star-white/60">
                  “{release.curator_note}”
                </p>
              )}

              {onVisualize && (
                <div className="border-b border-star-white/5 p-3">
                  <button
                    onClick={() => onVisualize(release)}
                    className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-neon-violet/10"
                    style={{ background: "linear-gradient(100deg, rgba(155,93,229,0.12), rgba(0,212,255,0.06))" }}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-violet/20 text-neon-violet">
                      <AudioLines size={18} />
                    </span>
                    <span className="flex-1 text-left">
                      <span className="block text-sm font-bold uppercase tracking-wide text-star-white">
                        Play & Visualize
                      </span>
                      <span className="block text-[11px] text-star-white/45">
                        30-second preview · live 3D particle visuals
                      </span>
                    </span>
                    <span className="text-star-white/30 transition-all group-hover:translate-x-0.5 group-hover:text-star-white/70">
                      →
                    </span>
                  </button>
                </div>
              )}

              <div className="p-3">
                <p className="px-2 pb-2 pt-1 text-[10px] font-mono uppercase tracking-[0.22em] text-star-white/35">
                  Listen on your service
                </p>
                <div className="space-y-1">
                  {available.map((p, i) => (
                    <motion.div
                      key={p.key}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 + i * 0.05, duration: 0.3 }}
                      className="group flex items-stretch gap-1"
                    >
                      <a
                        href={release[p.key]!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-star-white/[0.06]"
                      >
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${p.color}1f`, color: p.color }}
                        >
                          <p.Icon />
                        </span>
                        <span className="flex-1">
                          <span className="block text-sm font-medium text-star-white">{p.label}</span>
                          <span className="block text-[11px] text-star-white/40">{p.hint}</span>
                        </span>
                        <svg
                          viewBox="0 0 16 16"
                          className="h-3.5 w-3.5 text-star-white/25 transition-all group-hover:translate-x-0.5 group-hover:text-star-white/70"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M5 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                      <button
                        onClick={() => copyLink(p.key, release[p.key]!)}
                        aria-label={`Copy ${p.label} link`}
                        className="flex w-9 items-center justify-center rounded-xl text-star-white/25 transition-colors hover:bg-star-white/[0.06] hover:text-star-white/70"
                      >
                        {copied === p.key ? (
                          <Check size={14} className="text-neon-green" />
                        ) : (
                          <LinkIcon size={13} />
                        )}
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
