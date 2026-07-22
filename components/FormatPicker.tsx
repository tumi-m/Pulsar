"use client";

import { motion } from "framer-motion";
import { FORMATS, type MediaFormat } from "@/lib/format";

interface FormatPickerProps {
  active: MediaFormat;
  onChange: (f: MediaFormat) => void;
}

/**
 * NeXT/macOS-style beveled toggle for the physical-media format. Lives
 * at the top of the home page — pick how every album is displayed.
 */
export function FormatPicker({ active, onChange }: FormatPickerProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[9px] font-bold uppercase tracking-[0.24em] text-star-white/35 sm:block">
        Format
      </span>
      <div
        className="flex items-center gap-0.5 rounded-lg p-1"
        style={{
          background: "linear-gradient(160deg, #26262e, #14141a)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 4px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        {FORMATS.map((f) => {
          const isActive = active === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onChange(f.id)}
              title={f.blurb}
              aria-label={`Show music as ${f.label}`}
              aria-pressed={isActive}
              className="relative rounded-md px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors"
            >
              {isActive && (
                <motion.span
                  layoutId="format-active"
                  className="absolute inset-0 rounded-md"
                  style={{
                    background: "linear-gradient(160deg, #f0f0f4, #c8c8d0)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.6)",
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className={`relative ${isActive ? "text-void" : "text-star-white/55"}`}>
                {f.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
