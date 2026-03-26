"use client";

import { motion } from "framer-motion";
import type { Release } from "@/lib/types";

interface PlatformLinksProps {
  release: Release;
  variant?: "card" | "modal";
}

const PLATFORMS = [
  {
    key: "spotify" as const,
    label: "Spotify",
    color: "#1DB954",
    bg: "rgba(29,185,84,0.15)",
    border: "rgba(29,185,84,0.3)",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    ),
  },
  {
    key: "apple_music" as const,
    label: "Apple Music",
    color: "#FC3C44",
    bg: "rgba(252,60,68,0.15)",
    border: "rgba(252,60,68,0.3)",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.064-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208a4.98 4.98 0 00-.35 1.458c-.055.47-.06.945-.068 1.415-.003.126 0 .252 0 .378v13.08c0 .302.01.605.04.905a5.06 5.06 0 001.808 3.388 5.13 5.13 0 002.384.988 11.028 11.028 0 001.807.116h11.438c.37 0 .742-.016 1.11-.05a5.296 5.296 0 002.374-.98 5.094 5.094 0 001.85-3.345c.048-.36.07-.72.07-1.082V6.12a.03.03 0 00-.003-.003zM12.0 17.523c-3.035 0-5.498-2.464-5.498-5.5s2.463-5.498 5.498-5.498 5.498 2.462 5.498 5.498-2.463 5.5-5.498 5.5zm5.713-9.951a1.29 1.29 0 01-1.29-1.289 1.29 1.29 0 012.579 0 1.29 1.29 0 01-1.289 1.29zM12 8.636a3.386 3.386 0 100 6.772 3.386 3.386 0 000-6.772z" />
      </svg>
    ),
  },
  {
    key: "tidal" as const,
    label: "Tidal",
    color: "#00FFFF",
    bg: "rgba(0,255,255,0.1)",
    border: "rgba(0,255,255,0.25)",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996l4.004 4.004L8.008 7.996l4.004 4.004 4.004-4.004zm4.004 4.004l-4.004 4.004 4.004 4.004L20.016 12zm-4.004 4.004L8.008 7.996l-4.004 4.004 4.004 4.004zM8.008 16.004L4.004 12 0 16.004l4.004 4.004zm8.008 0l-4.004-4.004-4.004 4.004 4.004 4.004z" />
      </svg>
    ),
  },
  {
    key: "soundcloud" as const,
    label: "SoundCloud",
    color: "#FF5500",
    bg: "rgba(255,85,0,0.15)",
    border: "rgba(255,85,0,0.3)",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M1.175 12.225c-.016 0-.018.008-.02.025l-.319 2.21.319 2.222c.002.016.005.024.02.024.014 0 .018-.008.02-.024l.363-2.222-.363-2.21c-.002-.016-.006-.025-.02-.025zm.59-.48c-.02 0-.025.01-.028.03l-.274 2.689.274 2.717c.003.02.008.03.028.03s.025-.01.028-.03l.311-2.717-.311-2.69c-.003-.019-.008-.028-.028-.028zm.602-.134c-.025 0-.03.015-.033.038l-.228 2.822.228 2.838c.003.023.008.038.033.038s.03-.015.033-.038l.259-2.838-.259-2.822c-.003-.023-.008-.038-.033-.038zm3.18.61c-.14 0-.25.112-.25.25v5.338c0 .138.11.25.25.25h11.5a2.5 2.5 0 000-5 2.47 2.47 0 00-.712.105A4.5 4.5 0 005.547 12.22zm-1.386-.082c-.03 0-.038.02-.04.048l-.185 2.857.185 2.876c.002.027.01.047.04.047.028 0 .036-.02.038-.047l.21-2.876-.21-2.857c-.002-.027-.01-.048-.038-.048z" />
      </svg>
    ),
  },
  {
    key: "youtube_music" as const,
    label: "YouTube Music",
    color: "#FF0000",
    bg: "rgba(255,0,0,0.12)",
    border: "rgba(255,0,0,0.28)",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z" />
      </svg>
    ),
  },
];

export function PlatformLinks({ release, variant = "card" }: PlatformLinksProps) {
  const availablePlatforms = PLATFORMS.filter((p) => release[p.key]);

  if (availablePlatforms.length === 0) return null;

  return (
    <div
      className={
        variant === "card"
          ? "flex flex-wrap gap-1.5"
          : "grid grid-cols-1 gap-2"
      }
    >
      {availablePlatforms.map((platform, i) => (
        <motion.a
          key={platform.key}
          href={release[platform.key]!}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          whileHover={{ scale: 1.05, y: -1 }}
          whileTap={{ scale: 0.97 }}
          style={{
            backgroundColor: platform.bg,
            borderColor: platform.border,
            color: platform.color,
          }}
          className={`
            flex items-center gap-2 border rounded-full
            text-xs font-medium tracking-wide
            transition-all duration-200
            ${variant === "card"
              ? "px-2.5 py-1"
              : "px-4 py-2.5 w-full justify-center text-sm"
            }
          `}
          onClick={(e) => e.stopPropagation()}
        >
          <platform.Icon />
          {variant === "modal" && (
            <span>{platform.label}</span>
          )}
        </motion.a>
      ))}
    </div>
  );
}
