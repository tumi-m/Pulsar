"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Link as LinkIcon } from "lucide-react";
import type { Release } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Artwork } from "./Artwork";

interface ReleaseModalProps {
  release: Release | null;
  onClose: () => void;
}

const PLATFORMS = [
  {
    key: "spotify" as const,
    label: "Spotify",
    hint: "Play on Spotify",
    color: "#1DB954",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    ),
  },
  {
    key: "apple_music" as const,
    label: "Apple Music",
    hint: "Open in Apple Music",
    color: "#FC3C44",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.064-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208a4.98 4.98 0 00-.35 1.458c-.055.47-.06.945-.068 1.415-.003.126 0 .252 0 .378v13.08c0 .302.01.605.04.905a5.06 5.06 0 001.808 3.388 5.13 5.13 0 002.384.988 11.028 11.028 0 001.807.116h11.438c.37 0 .742-.016 1.11-.05a5.296 5.296 0 002.374-.98 5.094 5.094 0 001.85-3.345c.048-.36.07-.72.07-1.082V6.12a.03.03 0 00-.003-.003zM17.5 16.116c0 .397-.06.79-.24 1.147-.28.556-.735.925-1.325 1.108-.328.102-.67.152-1.013.16-.897.02-1.66-.567-1.788-1.455-.11-.74.222-1.55 1.06-1.916.331-.145.68-.226 1.035-.294.387-.075.775-.14 1.16-.23.28-.064.466-.235.522-.525a.9.9 0 00.014-.166V9.34c0-.336-.155-.512-.484-.44-.32.07-3.63.74-3.63.74-.29.07-.44.244-.44.552v6.32c0 .398-.045.792-.222 1.155-.278.565-.735.938-1.33 1.123a3.travel4 3.4 0 01-1.02.16c-.9.02-1.664-.57-1.79-1.462-.108-.756.244-1.573 1.104-1.933.325-.135.664-.212 1.008-.278.264-.05.53-.098.79-.157.35-.08.53-.29.542-.65V6.906c0-.116.01-.232.033-.345.06-.278.245-.446.52-.51.09-.02 3.955-.803 4.83-.98.16-.032.323-.062.485-.062.34.003.55.22.577.563.005.06.006.12.006.18v10.364z" />
      </svg>
    ),
  },
  {
    key: "tidal" as const,
    label: "Tidal",
    hint: "Hi-fi on Tidal",
    color: "#33FFEE",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996l4.004 4.004 4.004-4.004 4.004 4.004 4.004-4.004-4.004-4.004zm4.004 12.011l4.004-4.003L24.023 16l-4.003 4.004L16.016 16z M12.012 12.008l-4.004 4.004 4.004 4.004 4.004-4.004-4.004-4.004z" />
      </svg>
    ),
  },
  {
    key: "soundcloud" as const,
    label: "SoundCloud",
    hint: "Stream on SoundCloud",
    color: "#FF5500",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M1.175 12.225c-.016 0-.018.008-.02.025l-.319 2.21.319 2.222c.002.016.005.024.02.024.014 0 .018-.008.02-.024l.363-2.222-.363-2.21c-.002-.016-.006-.025-.02-.025zm1.192-.614c-.02 0-.025.01-.028.03l-.274 2.819.274 2.717c.003.02.008.03.028.03s.025-.01.028-.03l.311-2.717-.311-2.82c-.003-.019-.008-.028-.028-.028zm1.202-.24c-.025 0-.03.015-.033.038l-.228 3.062.228 2.938c.003.023.008.038.033.038s.03-.015.033-.038l.259-2.938-.259-3.062c-.003-.023-.008-.038-.033-.038zm3.978.85c-.14 0-.25.112-.25.25v5.338c0 .138.11.25.25.25h11.5a2.5 2.5 0 000-5 2.47 2.47 0 00-.712.105A4.5 4.5 0 007.547 12.22zm-1.386-.082c-.03 0-.038.02-.04.048l-.185 2.857.185 2.876c.002.027.01.047.04.047.028 0 .036-.02.038-.047l.21-2.876-.21-2.857c-.002-.027-.01-.048-.038-.048z" />
      </svg>
    ),
  },
  {
    key: "youtube_music" as const,
    label: "YouTube Music",
    hint: "Watch on YouTube Music",
    color: "#FF0000",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z" />
      </svg>
    ),
  },
];

/**
 * Listen panel — the whole point of Pulsar. One release, five services,
 * rendered as rich rows so the user taps whichever platform they pay for.
 */
export function ReleaseModal({ release, onClose }: ReleaseModalProps) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = release ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [release]);

  const available = release
    ? PLATFORMS.filter((p) => Boolean(release[p.key]))
    : [];

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
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-void/85 backdrop-blur-md"
          />

          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 48, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label={`Listen to ${release.title} by ${release.artist}`}
          >
            <div
              className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-star-white/10 bg-[#0b0b13]/95 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* header: art + meta */}
              <div className="flex items-center gap-4 p-4">
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg">
                  <Artwork
                    src={release.artwork_url}
                    artist={release.artist}
                    title={release.title}
                    sizes="80px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-star-white">
                    {release.title}
                  </p>
                  <p className="truncate text-sm text-star-white/55">{release.artist}</p>
                  <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-star-white/35">
                    {release.type} · {formatDate(release.release_date)}
                    {release.genre ? ` · ${release.genre}` : ""}
                  </p>
                  {release.label && (
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-neon-green/70">
                      ▪ {release.label}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-star-white/50 transition-colors hover:bg-star-white/10 hover:text-star-white"
                >
                  <X size={16} />
                </button>
              </div>

              {release.curator_note && (
                <p className="border-t border-star-white/5 px-4 py-3 text-[13px] italic leading-relaxed text-star-white/60">
                  “{release.curator_note}”
                </p>
              )}

              {/* platform rows */}
              <div className="border-t border-star-white/5 p-2.5">
                <p className="px-2 pb-2 pt-1 text-[10px] font-mono uppercase tracking-[0.22em] text-star-white/35">
                  Listen on your service
                </p>
                <div className="space-y-1">
                  {available.map((p, i) => (
                    <motion.div
                      key={p.key}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + i * 0.05, duration: 0.3 }}
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
                          <span className="block text-sm font-medium text-star-white">
                            {p.label}
                          </span>
                          <span className="block text-[11px] text-star-white/40">
                            {p.hint}
                          </span>
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
