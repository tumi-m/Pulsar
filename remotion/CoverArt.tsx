import { useState } from "react";
import { Img } from "remotion";
import { GeneratedCover } from "./GeneratedCover";
import type { NormalizedRecord } from "./props";

/**
 * A record's cover, with the app's fallback chain (components/Artwork.tsx):
 * the stored artwork, then the iTunes lookup, then the generated cassette.
 * A cover that never arrives — a 404 "no confident match", a dead CDN link, a
 * 502 offline — moves on to the next source instead of leaving a hole in the
 * video.
 */
export function CoverArt({ record, size, radius = 0 }: { record: NormalizedRecord; size: number; radius?: number }) {
  const sources = [record.artworkUrl, record.artworkFallbackUrl].filter(
    (src, i, all): src is string => Boolean(src) && all.indexOf(src) === i
  );
  // The Player keeps this mounted while the crate under it changes; a new
  // record starts from its first source again, not from the last one's luck.
  const chain = sources.join("\n");
  const [failed, setFailed] = useState({ chain, count: 0 });
  if (failed.chain !== chain) setFailed({ chain, count: 0 });
  const src = sources[failed.chain === chain ? failed.count : 0];

  if (!src) return <GeneratedCover title={record.title} artist={record.artist} size={size} />;
  return (
    <Img
      // A fresh element per source, so each gets its own load (and delayRender).
      key={src}
      src={src}
      // Fail straight to the next source: the default two retries with
      // backoff stall a render for seconds on every dead link.
      maxRetries={0}
      onError={() => setFailed((f) => (f.chain === chain ? { chain, count: f.count + 1 } : f))}
      style={{
        display: "block",
        width: size,
        height: size,
        maxWidth: "none",
        objectFit: "cover",
        borderRadius: radius,
      }}
    />
  );
}
