"use client";

import { motion } from "framer-motion";
import type { MediaFormat } from "@/lib/format";
import { Artwork } from "./Artwork";

interface PhysicalMediaProps {
  src: string;
  artist: string;
  title: string;
  format: MediaFormat;
  hovered: boolean;
  big?: boolean;
}

/**
 * Renders the album art as a 3D physical object — NeXT/macOS-inspired
 * beveled hardware. Each format frames the same <Artwork> differently.
 */
export function PhysicalMedia({ src, artist, title, format, hovered, big }: PhysicalMediaProps) {
  const art = (className = "") => (
    <Artwork src={src} artist={artist} title={title} className={`object-cover ${className}`} />
  );

  switch (format) {
    // ── VINYL: record sliding out of a printed sleeve ──────────────
    case "vinyl":
      return (
        <div className="relative flex h-full w-full items-center justify-center [perspective:900px]">
          {/* the black disc, slides right + spins on hover */}
          <motion.div
            className="absolute right-[8%] top-1/2 aspect-square h-[86%] -translate-y-1/2 rounded-full"
            style={{
              background:
                "repeating-radial-gradient(circle at center, #0a0a0a 0px, #16161a 1px, #0a0a0a 2px)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
            }}
            animate={{
              x: hovered ? "34%" : "0%",
              rotate: hovered ? 360 : 0,
            }}
            transition={{
              x: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
              rotate: { duration: 3, ease: "linear", repeat: hovered ? Infinity : 0 },
            }}
          >
            <div className="absolute inset-[33%] overflow-hidden rounded-full ring-1 ring-black/40">
              {art()}
            </div>
            <div className="absolute inset-[47%] rounded-full bg-black/70" />
          </motion.div>
          {/* printed sleeve holding the album art */}
          <div
            className="relative aspect-square h-[92%] overflow-hidden rounded-[3px]"
            style={{
              boxShadow:
                "0 14px 40px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.06)",
            }}
          >
            {art()}
            {/* sleeve opening shadow */}
            <div className="absolute right-0 top-0 h-full w-[3px] bg-gradient-to-l from-black/50 to-transparent" />
          </div>
        </div>
      );

    // ── CASSETTE: tape shell with art as the J-card label ──────────
    case "cassette":
      return (
        <div className="flex h-full w-full items-center justify-center p-[6%]">
          <motion.div
            className="relative aspect-[3/2] w-full rounded-[8px]"
            style={{
              background: "linear-gradient(160deg, #2a2a32 0%, #14141a 100%)",
              boxShadow:
                "0 12px 30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 4px rgba(0,0,0,0.5)",
            }}
            animate={{ rotateX: hovered ? -6 : 0, y: hovered ? -4 : 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* label = album art */}
            <div className="absolute inset-x-[8%] top-[8%] h-[46%] overflow-hidden rounded-[3px] ring-1 ring-black/50">
              {art()}
            </div>
            {/* window with two reels */}
            <div className="absolute inset-x-[16%] bottom-[12%] flex h-[30%] items-center justify-around rounded-[4px] bg-[#0b0b0f] ring-1 ring-black/60">
              {[0, 1].map((i) => (
                <motion.div
                  key={i}
                  className="h-[70%] aspect-square rounded-full border-2 border-[#3a3a44]"
                  style={{ background: "conic-gradient(#1a1a20 0deg 30deg, #2c2c34 30deg 60deg)" }}
                  animate={{ rotate: hovered ? 360 : 0 }}
                  transition={{ duration: 2, repeat: hovered ? Infinity : 0, ease: "linear" }}
                />
              ))}
            </div>
            {/* screw dots */}
            {[
              "left-[4%] top-[4%]",
              "right-[4%] top-[4%]",
              "left-[4%] bottom-[4%]",
              "right-[4%] bottom-[4%]",
            ].map((p) => (
              <span key={p} className={`absolute h-1 w-1 rounded-full bg-black/50 ${p}`} />
            ))}
          </motion.div>
        </div>
      );

    // ── CD: jewel case, bright Yeezy-style tint, disc peeking ──────
    case "cd":
      return (
        <div className="relative flex h-full w-full items-center justify-center [perspective:900px]">
          <motion.div
            className="absolute right-[10%] top-1/2 aspect-square h-[80%] -translate-y-1/2 rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, #ff9a9e, #a1c4fd, #c2ffd8, #fbc2eb, #ff9a9e)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
            animate={{ x: hovered ? "30%" : "6%", rotate: hovered ? 360 : 0 }}
            transition={{
              x: { duration: 0.5 },
              rotate: { duration: 4, repeat: hovered ? Infinity : 0, ease: "linear" },
            }}
          >
            <div className="absolute inset-[42%] rounded-full bg-void ring-2 ring-white/40" />
          </motion.div>
          <div
            className="relative aspect-square h-[90%] overflow-hidden rounded-[2px]"
            style={{ boxShadow: "0 14px 40px rgba(0,0,0,0.6)" }}
          >
            {art()}
            {/* jewel-case plastic sheen */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-transparent" />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-white/20" />
            {/* spine */}
            <div className="absolute left-0 top-0 h-full w-[6%] bg-white/10 backdrop-blur-sm" />
          </div>
        </div>
      );

    // ── FLOPPY: 3.5" disk with the art as its sticker ──────────────
    case "floppy":
      return (
        <div className="flex h-full w-full items-center justify-center p-[7%]">
          <motion.div
            className="relative aspect-square w-full rounded-[6px]"
            style={{
              background: "linear-gradient(150deg, #3a3f4b 0%, #21242c 100%)",
              boxShadow:
                "0 12px 28px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
            animate={{ rotate: hovered ? -3 : 0, y: hovered ? -4 : 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* metal shutter */}
            <div className="absolute left-[18%] right-[18%] top-[6%] h-[22%] rounded-[3px] bg-gradient-to-b from-[#c8ccd4] to-[#8b8f98] shadow-inner">
              <div className="absolute left-[30%] top-[15%] h-[70%] w-[24%] rounded-[2px] bg-[#2a2d34]" />
            </div>
            {/* art sticker */}
            <div className="absolute inset-x-[10%] bottom-[8%] h-[56%] overflow-hidden rounded-[2px] ring-1 ring-black/30 shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
              {art()}
              <div className="pointer-events-none absolute inset-0 bg-white/5" />
            </div>
            {/* write-protect notch */}
            <div className="absolute right-[6%] top-[36%] h-[7%] w-[6%] rounded-[1px] bg-black/40" />
          </motion.div>
        </div>
      );

    // ── USB: flash drive with a hanging art tag ────────────────────
    case "usb":
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-[3%] p-[8%]">
          {/* art tag */}
          <motion.div
            className="relative aspect-square w-[62%] overflow-hidden rounded-[4px] ring-1 ring-white/15"
            style={{ boxShadow: "0 10px 24px rgba(0,0,0,0.5)" }}
            animate={{ rotate: hovered ? [0, -2, 2, 0] : 0, y: hovered ? -3 : 0 }}
            transition={{ duration: 0.6 }}
          >
            {art()}
            {/* punch hole + string */}
            <div className="absolute right-[8%] top-[8%] h-2 w-2 rounded-full bg-void ring-1 ring-white/40" />
          </motion.div>
          {/* drive body */}
          <motion.div
            className="relative h-[24%] w-[46%] rounded-[4px]"
            style={{
              background: "linear-gradient(160deg, #4a4f5c 0%, #23262e 100%)",
              boxShadow: "0 8px 18px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
            animate={{ y: hovered ? 2 : 0 }}
          >
            <div className="absolute left-[6%] top-1/2 h-[46%] w-[26%] -translate-y-1/2 rounded-[2px] bg-[#c8ccd4]" />
            <div className="absolute right-[10%] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-neon-green shadow-[0_0_6px_rgba(0,255,136,0.8)]" />
          </motion.div>
        </div>
      );
  }
}
