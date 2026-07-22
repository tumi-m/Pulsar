"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, ListMusic, Share2, X, Trash2, Sparkles, Shuffle } from "lucide-react";
import type { Release } from "@/lib/types";
import type { MediaFormat } from "@/lib/format";
import { getFavorites, getPlaylist, toggleFavorite, removeFromPlaylist } from "@/lib/collection";
import { PhysicalMedia } from "./PhysicalMedia";
import { usePlayer } from "./player/PlayerProvider";

interface FloatingDockProps {
  format: MediaFormat;
  onOpen: (r: Release) => void;
}

type Panel = "favorites" | "playlist" | null;

/**
 * Floating 3D dock (bottom-right): heart, playlist, share. Opens a
 * "crate" panel where the collection is displayed as physical media.
 */
export function FloatingDock({ format, onOpen }: FloatingDockProps) {
  const { current, shuffle, toggleShuffle } = usePlayer();
  const [panel, setPanel] = useState<Panel>(null);
  const [favs, setFavs] = useState<Release[]>([]);
  const [list, setList] = useState<Release[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  // When the navbar hides on scroll-down, the Curator (AI) + Shuffle buttons
  // relocate here, stacking above the three dock buttons.
  const [navHidden, setNavHidden] = useState(false);

  const refresh = () => {
    setFavs(getFavorites());
    setList(getPlaylist());
  };

  useEffect(() => {
    refresh();
    const h = () => refresh();
    const openFromSidebar = (e: Event) => {
      const which = (e as CustomEvent<"favorites" | "playlist">).detail;
      setPanel(which);
    };
    const onNavHidden = (e: Event) => setNavHidden((e as CustomEvent<boolean>).detail);
    window.addEventListener("pulsar-collection-change", h);
    window.addEventListener("pulsar-open-crate", openFromSidebar);
    window.addEventListener("pulsar-nav-hidden", onNavHidden);
    return () => {
      window.removeEventListener("pulsar-collection-change", h);
      window.removeEventListener("pulsar-open-crate", openFromSidebar);
      window.removeEventListener("pulsar-nav-hidden", onNavHidden);
    };
  }, []);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const data = { title: "PULSAR — Daily Music Discovery", text: "A universe of music, one link away.", url };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(url);
        setToast("Link copied");
        setTimeout(() => setToast(null), 1600);
      }
    } catch {
      /* cancelled */
    }
  }

  const items = panel === "favorites" ? favs : list;

  const dockBtn = (
    key: string,
    Icon: typeof Heart,
    label: string,
    count: number | null,
    onClick: () => void,
    active: boolean
  ) => (
    <button
      key={key}
      onClick={onClick}
      aria-label={label}
      className="group relative flex h-14 w-14 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95"
      style={{
        background: active
          ? "linear-gradient(160deg, #f0f0f4, #c8c8d0)"
          : "linear-gradient(160deg, #2a2a32, #16161c)",
        boxShadow:
          "0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -2px 4px rgba(0,0,0,0.4)",
      }}
    >
      <Icon size={22} className={active ? "text-void" : "text-star-white/85"} />
      {count != null && count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon-pink px-1 text-[9px] font-bold text-void">
          {count}
        </span>
      )}
    </button>
  );

  return (
    <>
      {/* the dock */}
      <div
        className={`fixed right-5 z-40 flex flex-col gap-2.5 transition-[bottom] duration-300 ${
          current ? "bottom-24" : "bottom-5"
        }`}
      >
        {/* Curator + Shuffle fly in above the three when the navbar hides */}
        <AnimatePresence>
          {navHidden && (
            <>
              <motion.button
                key="curator"
                initial={{ opacity: 0, y: -18, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -18, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                onClick={() => window.dispatchEvent(new CustomEvent("pulsar-ai-activate"))}
                aria-label="Curator"
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{
                  background: "linear-gradient(120deg, #9b5de5, #ff5fa2 60%, #ffb347)",
                  boxShadow: "0 6px 18px rgba(155,93,229,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
                }}
              >
                <Sparkles size={22} className="text-white" />
              </motion.button>
              <motion.button
                key="shuffle"
                initial={{ opacity: 0, y: -14, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -14, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 500, damping: 30, delay: 0.04 }}
                onClick={() => toggleShuffle()}
                aria-label="Shuffle to your top picks"
                aria-pressed={shuffle}
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{
                  background: shuffle
                    ? "linear-gradient(160deg, #f4d780, #d4af37)"
                    : "linear-gradient(160deg, #3a3320, #201c10)",
                  boxShadow: shuffle
                    ? "0 6px 18px rgba(212,175,55,0.6), inset 0 1px 0 rgba(255,255,255,0.4)"
                    : "0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)",
                }}
              >
                <Shuffle size={20} className={shuffle ? "text-[#2a2410]" : "text-[#e8c66a]"} />
              </motion.button>
            </>
          )}
        </AnimatePresence>
        {dockBtn("share", Share2, "Share Pulsar", null, share, false)}
        {dockBtn(
          "playlist",
          ListMusic,
          "Your crate",
          list.length,
          () => setPanel(panel === "playlist" ? null : "playlist"),
          panel === "playlist"
        )}
        {dockBtn(
          "fav",
          Heart,
          "Your favorites",
          favs.length,
          () => setPanel(panel === "favorites" ? null : "favorites"),
          panel === "favorites"
        )}
      </div>

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-24 right-5 z-40 rounded-md border border-white/15 bg-void/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-star-white backdrop-blur"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* crate panel */}
      <AnimatePresence>
        {panel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPanel(null)}
              className="fixed inset-0 z-40 bg-void/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-md flex-col border-l border-white/10 bg-[#0b0b12]/95"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-star-white/40">
                    {panel === "favorites" ? "Favorites" : "The Crate"}
                  </p>
                  <h3 className="text-lg font-bold uppercase tracking-tight text-star-white">
                    {panel === "favorites" ? "Loved" : "Your Crate"} · {items.length}
                  </h3>
                </div>
                <button
                  onClick={() => setPanel(null)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-star-white/50 hover:bg-white/10 hover:text-star-white"
                >
                  <X size={16} />
                </button>
              </div>

              {items.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-sm font-bold uppercase tracking-widest text-star-white/40">
                    Empty {panel === "favorites" ? "loved" : "crate"}
                  </p>
                  <p className="text-xs text-star-white/35">
                    Hover any album and tap the {panel === "favorites" ? "♥ heart" : "＋ plus"} to
                    add it here.
                  </p>
                </div>
              ) : (
                <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3">
                  {items.map((r) => (
                    <div key={r.id} className="group relative">
                      <button
                        onClick={() => {
                          setPanel(null);
                          onOpen(r);
                        }}
                        className="block w-full"
                      >
                        <div className="relative aspect-square w-full">
                          <PhysicalMedia
                            src={r.artwork_url}
                            artist={r.artist}
                            title={r.title}
                            format={format}
                            hovered={false}
                          />
                        </div>
                        <p className="mt-1 truncate text-[10px] font-bold uppercase text-star-white">
                          {r.title}
                        </p>
                        <p className="truncate text-[9px] text-star-white/50">{r.artist}</p>
                      </button>
                      <button
                        onClick={() => {
                          if (panel === "favorites") toggleFavorite(r);
                          else removeFromPlaylist(r.id);
                        }}
                        aria-label="Remove"
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-void/70 text-star-white/60 opacity-0 backdrop-blur transition-opacity hover:text-neon-pink group-hover:opacity-100"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
