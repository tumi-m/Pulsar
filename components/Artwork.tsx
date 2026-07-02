"use client";

import { useState } from "react";
import Image from "next/image";

interface ArtworkProps {
  src: string;
  artist: string;
  title: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
}

/**
 * Album artwork with a resilient fallback chain:
 *   1. The stored artwork_url
 *   2. /api/artwork — official cover via the iTunes Search API
 *   3. A styled letter tile (never a broken-image icon)
 */
export function Artwork({
  src,
  artist,
  title,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  priority = false,
  className = "object-cover",
}: ArtworkProps) {
  // 0 = original url, 1 = iTunes proxy, 2 = letter tile
  const [stage, setStage] = useState(0);

  if (stage >= 2) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-nebula via-cosmos to-void">
        <span className="text-5xl font-bold text-dust/60 select-none">
          {artist.charAt(0).toUpperCase()}
        </span>
        <span className="px-4 text-center text-[10px] font-mono tracking-widest text-dust/40 line-clamp-2">
          {title.toUpperCase()}
        </span>
      </div>
    );
  }

  if (stage === 1) {
    const proxied = `/api/artwork?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxied}
        alt={`${artist} — ${title}`}
        className={`absolute inset-0 h-full w-full ${className}`}
        onError={() => setStage(2)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={`${artist} — ${title}`}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      onError={() => setStage(1)}
    />
  );
}
