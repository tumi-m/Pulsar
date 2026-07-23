"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, ListMusic, X, Trash2, Sparkles, Shuffle, Play, Share2, Upload } from "lucide-react";
import type { Release } from "@/lib/types";
import type { MediaFormat } from "@/lib/format";
import { getFavorites, getPlaylist, toggleFavorite, removeFromPlaylist } from "@/lib/collection";
import { PhysicalMedia } from "./PhysicalMedia";
import { PLATFORMS } from "./platforms";
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
  const { current, shuffle, toggleShuffle, play } = usePlayer();
  const [panel, setPanel] = useState<Panel>(null);
  const [favs, setFavs] = useState<Release[]>([]);
  const [list, setList] = useState<Release[]>([]);
  // When the navbar hides on scroll-down, the Selector + Shuffle buttons
  // relocate here, stacking above the dock buttons.
  const [navHidden, setNavHidden] = useState(false);
  // Crate → playlist export sheet.
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

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

  // Crate/favorites only show entries that actually have artwork.
  const items = (panel === "favorites" ? favs : list).filter(
    (r) => r.artwork_url && r.artwork_url.trim().length > 0
  );

  // Platform links for the currently-playing song (only those with a URL).
  const currentLinks = current ? PLATFORMS.filter((p) => Boolean(current[p.key])) : [];

  async function shareRelease(r: Release) {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title: `${r.title} — ${r.artist}`, text: "Found on PULSAR", url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* cancelled */
    }
  }

  // ── Crate export → a playlist on the DSP of choice ──────────────
  const crateName = () => `PULSAR Crate ${new Date().toISOString().slice(0, 10)}`;
  const asLines = () => items.map((r) => `${r.artist} — ${r.title}`).join("\n");

  const download = (filename: string, text: string, type = "text/plain") => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const rows = [
      "Title,Artist,Album",
      ...items.map((r) => {
        const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
        return [esc(r.title), esc(r.artist), esc(r.title)].join(",");
      }),
    ].join("\n");
    download(`${crateName()}.csv`, rows, "text/csv");
  };

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(asLines());
      flash("Crate copied to clipboard");
    } catch {
      download(`${crateName()}.txt`, asLines());
      flash("Crate downloaded as text");
    }
  };

  // Where each DSP lets you build/import a playlist.
  const DSP_HOME: Record<string, string> = {
    spotify: "https://open.spotify.com/collection/playlists",
    apple_music: "https://music.apple.com/library/playlists",
    tidal: "https://tidal.com/my-collection/playlists",
    soundcloud: "https://soundcloud.com/you/library",
    youtube_music: "https://music.youtube.com/library/playlists",
  };

  const exportTo = async (key: string, label: string) => {
    // Keyless flow: copy the tracklist + drop a CSV, then open the service's
    // playlist area so the list can be pasted / imported into a new playlist.
    downloadCsv();
    try {
      await navigator.clipboard.writeText(asLines());
    } catch {
      /* clipboard blocked — the CSV still downloaded */
    }
    window.open(DSP_HOME[key] ?? "https://pulsar.app", "_blank", "noopener,noreferrer");
    setExporting(false);
    flash(`Crate copied + CSV ready for ${label}`);
  };

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

        {/* platform links for the current song — Spotify/Apple/Tidal/SC/YT */}
        <AnimatePresence>
          {currentLinks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 480, damping: 32 }}
              className="flex flex-col items-center gap-1.5 rounded-full border border-white/15 p-1.5"
              style={{
                background: "rgba(255,255,255,0.1)",
                backdropFilter: "blur(12px) saturate(150%)",
                WebkitBackdropFilter: "blur(12px) saturate(150%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 22px rgba(0,0,0,0.45)",
              }}
            >
              {currentLinks.map((p) => (
                <a
                  key={p.key}
                  href={current![p.key]!}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={p.hint}
                  title={p.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95"
                  style={{ backgroundColor: `${p.color}26`, color: p.color }}
                >
                  <p.Icon />
                </a>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

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
              className="crate-weave fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-md flex-col border-l border-[#5a3d24]/60"
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
                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <button
                      onClick={() => setExporting(true)}
                      className="flex items-center gap-1.5 rounded-full border border-neon-green/40 bg-neon-green/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neon-green transition-colors hover:bg-neon-green/20"
                    >
                      <Upload size={13} />
                      Export
                    </button>
                  )}
                  <button
                    onClick={() => setPanel(null)}
                    aria-label="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-star-white/50 hover:bg-white/10 hover:text-star-white"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* export → playlist sheet */}
              <AnimatePresence>
                {exporting && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setExporting(false)}
                      className="absolute inset-0 z-10 bg-void/70 backdrop-blur-sm"
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 16 }}
                      transition={{ type: "spring", stiffness: 460, damping: 34 }}
                      className="absolute inset-x-4 top-20 z-20 rounded-2xl border border-white/15 bg-[#0d0d16]/95 p-4 backdrop-blur-2xl"
                      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 24px 60px rgba(0,0,0,0.6)" }}
                    >
                      <p className="text-sm font-bold uppercase tracking-wide text-star-white">
                        Export {items.length} to a playlist
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-star-white/45">
                        Pick a service — Pulsar copies the tracklist &amp; downloads a CSV, then opens
                        your playlists so you can paste or import it into a new playlist.
                      </p>
                      <div className="mt-3 grid grid-cols-1 gap-1.5">
                        {PLATFORMS.map((p) => (
                          <button
                            key={p.key}
                            onClick={() => exportTo(p.key, p.label)}
                            className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
                          >
                            <span
                              className="flex h-8 w-8 items-center justify-center rounded-lg"
                              style={{ backgroundColor: `${p.color}26`, color: p.color }}
                            >
                              <p.Icon />
                            </span>
                            <span className="flex-1 text-sm font-medium text-star-white">{p.label}</span>
                            <span className="text-star-white/30">→</span>
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={copyList}
                          className="flex-1 rounded-lg border border-white/15 py-2 text-[10px] font-bold uppercase tracking-widest text-star-white/70 hover:text-star-white"
                        >
                          Copy list
                        </button>
                        <button
                          onClick={() => {
                            downloadCsv();
                            flash("CSV downloaded");
                          }}
                          className="flex-1 rounded-lg border border-white/15 py-2 text-[10px] font-bold uppercase tracking-widest text-star-white/70 hover:text-star-white"
                        >
                          Download CSV
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

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
                        <div className="relative aspect-square w-full overflow-hidden rounded-lg">
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

                      {/* liquid-glass play triangle — like the home tiles */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          play(r);
                        }}
                        aria-label="Play"
                        className="absolute left-1/2 top-[calc(50%-11px)] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full opacity-0 ring-1 ring-white/40 transition-opacity group-hover:opacity-100"
                        style={{
                          background: "rgba(255,255,255,0.14)",
                          backdropFilter: "blur(10px) saturate(140%)",
                          WebkitBackdropFilter: "blur(10px) saturate(140%)",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5)",
                        }}
                      >
                        <Play size={15} className="ml-0.5 text-white drop-shadow" fill="currentColor" />
                      </button>

                      {/* home-style actions: heart · share · remove */}
                      <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(r);
                          }}
                          aria-label="Favorite"
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-void/70 text-star-white/70 backdrop-blur hover:text-neon-pink"
                        >
                          <Heart size={11} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            shareRelease(r);
                          }}
                          aria-label="Share"
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-void/70 text-star-white/70 backdrop-blur hover:text-star-white"
                        >
                          <Share2 size={11} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (panel === "favorites") toggleFavorite(r);
                            else removeFromPlaylist(r.id);
                          }}
                          aria-label="Remove"
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-void/70 text-star-white/60 backdrop-blur hover:text-neon-pink"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* export toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-neon-green/40 bg-void/90 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-neon-green backdrop-blur"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
