"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus } from "lucide-react";
import type { Release } from "@/lib/types";
import { getCrates, createCrate, toggleInCrate, inCrate, type Crate } from "@/lib/collection";
import { CrateIcon } from "./CrateIcon";

/**
 * A global "add to crate" picker. Any crate button dispatches the
 * `pulsar-crate-picker` event (detail: Release); this single instance opens,
 * lets the user toggle the release across their many crates, and create a new
 * one. Rendered once (in ReleaseGrid).
 */
export function CratePicker() {
  const [release, setRelease] = useState<Release | null>(null);
  const [crates, setCrates] = useState<Crate[]>([]);
  const [newName, setNewName] = useState("");
  const [tick, setTick] = useState(0); // re-render after toggles

  const refresh = () => setCrates(getCrates());

  useEffect(() => {
    const open = (e: Event) => {
      setRelease((e as CustomEvent<Release>).detail);
      refresh();
    };
    window.addEventListener("pulsar-crate-picker", open);
    return () => window.removeEventListener("pulsar-crate-picker", open);
  }, []);

  const close = () => {
    setRelease(null);
    setNewName("");
  };

  return (
    <AnimatePresence>
      {release && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[60] bg-void/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
            className="fixed left-1/2 top-1/2 z-[60] flex max-h-[80vh] w-[min(90vw,22rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0d0d16]/95 backdrop-blur-2xl"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 24px 70px rgba(0,0,0,0.6)" }}
          >
            <div className="flex items-center justify-between border-b border-white/8 p-4">
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-star-white/40">Add to crate</p>
                <p className="truncate text-sm font-bold text-star-white">{release.title}</p>
              </div>
              <button onClick={close} aria-label="Close" className="text-star-white/50 hover:text-star-white">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {crates.map((c) => {
                const on = inCrate(c.id, release.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      toggleInCrate(c.id, release);
                      refresh();
                      setTick((t) => t + 1);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-white/[0.05]"
                  >
                    <span
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${
                        on ? "border-[#c08a4e]/50 bg-[#c08a4e]/15" : "border-white/12 bg-white/[0.03]"
                      }`}
                    >
                      <CrateIcon size={18} filled={on} className={on ? "text-[#c08a4e]" : "text-star-white/50"} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-star-white">{c.name}</span>
                      <span className="block text-[10px] text-star-white/40">{c.releases.length} saved</span>
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${on ? "text-[#c08a4e]" : "text-star-white/30"}`}>
                      {on ? "Added" : "Add"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* create a new crate */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                const c = createCrate(newName);
                toggleInCrate(c.id, release);
                setNewName("");
                refresh();
                setTick((t) => t + 1);
              }}
              className="flex items-center gap-2 border-t border-white/8 p-3"
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New crate name…"
                className="min-w-0 flex-1 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-star-white placeholder:text-star-white/35 focus:border-white/30 focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Create crate"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[#c08a4e]/50 bg-[#c08a4e]/15 text-[#c08a4e]"
              >
                <Plus size={16} />
              </button>
            </form>
            <span className="hidden">{tick}</span>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
