"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";

interface ArtworkProps {
  src: string;
  artist: string;
  title: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Fired when no artwork could be resolved (stored URL + proxy both failed). */
  onUnavailable?: () => void;
}

/**
 * A load event is not proof of an image — and the absence of one is not proof
 * of success.
 *
 * Two separate failures conspired here, and between them they put the browser's
 * broken-image glyph plus oversized alt text on a fifth of the tiles in the
 * main grid, where the designed letter placeholder should have been:
 *
 * 1. `/api/artwork` answers a failed lookup with a 502 and a JSON body. Some
 *    browsers report that as a *successful* load with `naturalWidth === 0`
 *    rather than firing `error`, so `decoded()` below checks what actually
 *    arrived rather than trusting the event.
 *
 * 2. Many feed records store the proxy URL as their own `artwork_url`, so the
 *    <img> is server-rendered and the browser starts fetching it while parsing
 *    the HTML. Its `error` had already been and gone by the time React hydrated
 *    and attached a handler — 55 such tags on the home page, 0 fallbacks
 *    reached. Nothing an event handler can do fixes that, so on mount we ask
 *    the element directly whether it has already settled.
 */
function decoded(el: HTMLImageElement): boolean {
  return el.naturalWidth > 0 && el.naturalHeight > 0;
}

/**
 * Album artwork with a resilient fallback chain:
 *   1. The stored artwork_url (remote CDN via next/image, or our own
 *      /api/artwork iTunes proxy via a plain <img>)
 *   2. /api/artwork — official cover via the iTunes Search API
 *   3. A styled letter tile (never a broken-image icon)
 */
export function Artwork({
  src,
  artist,
  title,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw",
  priority = false,
  className = "object-cover",
  onUnavailable,
}: ArtworkProps) {
  // 0 = original url, 1 = iTunes proxy, 2 = letter tile
  const [stage, setStage] = useState(0);
  // Artwork used to pop in the instant it decoded, which reads as jumpy across
  // a grid of hundreds. It now fades up from a shimmering placeholder.
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const proxied = `/api/artwork?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
  const isProxySrc = src.startsWith("/api/");
  const exhausted = stage >= 2 || (stage === 1 && isProxySrc);

  /** Give up on the current source and move to the next one in the chain. */
  const fail = useCallback(() => {
    setStage((s) => (s === 0 && !isProxySrc ? 1 : 2));
  }, [isProxySrc]);

  /** Decide from the element itself, not from which event we happened to get. */
  const settle = useCallback(
    (el: HTMLImageElement) => {
      if (decoded(el)) setLoaded(true);
      else fail();
    },
    [fail]
  );

  useEffect(() => {
    setLoaded(false);
    // The pre-hydration case: a server-rendered <img> that already finished
    // will never call onLoad or onError, so read its state once on mount.
    const el = imgRef.current;
    if (el?.complete) settle(el);
  }, [src, stage, settle]);

  useEffect(() => {
    if (exhausted) onUnavailable?.();
  }, [exhausted, onUnavailable]);

  if (exhausted) return <ArtworkFallback artist={artist} title={title} />;

  if (stage === 1 || isProxySrc) {
    return (
      <>
        <ArtworkPlaceholder show={!loaded} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={isProxySrc ? src : proxied}
          alt={`${artist} — ${title}`}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
            loaded ? "opacity-100" : "opacity-0"
          } ${className}`}
          onLoad={(e) => settle(e.currentTarget)}
          onError={fail}
        />
      </>
    );
  }

  return (
    <>
      <ArtworkPlaceholder show={!loaded} />
      <Image
        ref={imgRef}
        src={src}
        alt={`${artist} — ${title}`}
        fill
        sizes={sizes}
        priority={priority}
        className={`transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
        onLoad={(e) => settle(e.currentTarget)}
        onError={fail}
      />
    </>
  );
}

/**
 * A stable Walkman accent per artist, so a run of records without covers reads
 * as a shelf of different tapes rather than one tape repeated. Same artist, same
 * stripe, every session. Drawn from the palette rather than an arbitrary hue, so
 * a J-card never clashes with the deck around it.
 */
const JCARD_ACCENTS = ["#f2662c", "#4e86c7", "#ffce0a", "#7ed9ae", "#e23b2e"] as const;

export function jcardAccent(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return JCARD_ACCENTS[h % JCARD_ACCENTS.length];
}

/**
 * The end of the fallback chain, drawn as a cassette.
 *
 * Not an error state as far as the visitor is concerned — the record is real,
 * playable and crate-able; it just has no cover we could resolve, like a
 * home-dubbed tape. Layout lives in the .jcard rules in app/globals.css, which
 * size everything from the container: the same element is a 36px thumbnail, a
 * 176px tile and a 460px sideways tile.
 */
function ArtworkFallback({ artist, title }: { artist: string; title: string }) {
  return (
    <div
      role="img"
      aria-label={`${artist} — ${title}`}
      className="jcard"
      style={{ ["--jcard-accent" as string]: jcardAccent(artist.toLowerCase()) }}
    >
      <div className="jcard-shell" aria-hidden>
        <div className="jcard-label">
          <span className="jcard-initial">{artist.charAt(0).toUpperCase()}</span>
          <span className="jcard-title">{title}</span>
          <span className="jcard-artist">{artist}</span>
        </div>
        <div className="jcard-window" />
      </div>
    </div>
  );
}

/**
 * Placeholder shown until the cover decodes. A slow sheen rather than a static
 * block, so a grid mid-load looks alive instead of broken — and it disappears
 * under reduced-motion via the global animation guard.
 */
function ArtworkPlaceholder({ show }: { show: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
        show ? "opacity-100" : "opacity-0"
      }`}
      style={{ background: "linear-gradient(135deg, #12121c 0%, #191926 50%, #12121c 100%)" }}
    >
      <span className="art-sheen absolute inset-0" />
    </span>
  );
}
