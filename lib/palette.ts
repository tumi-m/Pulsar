/**
 * Album-artwork palette extraction.
 *
 * Every release should be coloured by its own cover — that single change does
 * more for "each visual feels bespoke" than any amount of shader complexity.
 *
 * Deliberately dependency-free and forgiving: artwork comes from remote CDNs
 * and our own /api/artwork proxy, so a tainted canvas or a failed load is
 * normal, not exceptional. Any failure resolves to the Pulsar house palette
 * rather than throwing, and results are cached per URL.
 */

export interface Palette {
  /** Normalised 0..1 RGB triples, ready to hand straight to a GL uniform. */
  primary: [number, number, number];
  accent: [number, number, number];
  shadow: [number, number, number];
  /** Same colours as CSS, for surrounding chrome. */
  css: { primary: string; accent: string; shadow: string };
  /** True when extraction failed and these are the house defaults. */
  isFallback: boolean;
}

const rgbCss = ([r, g, b]: [number, number, number]) =>
  `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

function makePalette(
  primary: [number, number, number],
  accent: [number, number, number],
  shadow: [number, number, number],
  isFallback = false
): Palette {
  return {
    primary,
    accent,
    shadow,
    css: { primary: rgbCss(primary), accent: rgbCss(accent), shadow: rgbCss(shadow) },
    isFallback,
  };
}

/** Pulsar's own neon violet → cyan, used whenever the cover can't be read. */
export const FALLBACK_PALETTE: Palette = makePalette(
  [0.608, 0.365, 0.898], // #9b5de5
  [0.0, 0.831, 1.0], // #00d4ff
  [0.016, 0.016, 0.039], // #04040a
  true
);

const cache = new Map<string, Palette>();
const inflight = new Map<string, Promise<Palette>>();

/** Relative luminance, for ordering swatches light→dark. */
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Nudge a colour toward something that reads well on a near-black backdrop.
 * Raw dominant colours are often muddy or near-black themselves, which would
 * make the visual disappear entirely.
 */
function vivify(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max <= 0 ? 0 : (max - min) / max;

  // Lift very dark swatches so they're visible against #04040a.
  let scale = 1;
  if (max < 0.35) scale = 0.35 / Math.max(max, 0.02);

  let nr = Math.min(1, r * scale);
  let ng = Math.min(1, g * scale);
  let nb = Math.min(1, b * scale);

  // Push weakly-saturated colours away from grey so the visuals aren't washed.
  if (sat < 0.25) {
    const m = (nr + ng + nb) / 3;
    const boost = 1.6;
    nr = Math.min(1, m + (nr - m) * boost + 0.06);
    ng = Math.min(1, m + (ng - m) * boost);
    nb = Math.min(1, m + (nb - m) * boost + 0.1);
  }
  return [nr, ng, nb];
}

/**
 * Extract a palette from an image URL.
 *
 * Downscales to a 24×24 offscreen canvas and buckets pixels into a coarse 4³
 * RGB histogram — plenty for "what colour is this cover" and cheap enough to
 * run on a phone without a frame hitch.
 */
export function extractPalette(src: string | null | undefined): Promise<Palette> {
  if (!src) return Promise.resolve(FALLBACK_PALETTE);
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(src);
  if (pending) return pending;

  const job = new Promise<Palette>((resolve) => {
    if (typeof window === "undefined") return resolve(FALLBACK_PALETTE);

    const img = new Image();
    let settled = false;
    const finish = (p: Palette) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      cache.set(src, p);
      inflight.delete(src);
      resolve(p);
    };

    // Never let a hanging image block the caller.
    const timer = setTimeout(() => finish(FALLBACK_PALETTE), 6000);

    img.crossOrigin = "anonymous";
    img.onerror = () => {
      clearTimeout(timer);
      finish(FALLBACK_PALETTE);
    };
    img.onload = () => {
      clearTimeout(timer);
      try {
        const S = 24;
        const canvas = document.createElement("canvas");
        canvas.width = S;
        canvas.height = S;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return finish(FALLBACK_PALETTE);
        ctx.drawImage(img, 0, 0, S, S);
        // Throws a SecurityError on a tainted canvas — expected for some CDNs.
        const { data } = ctx.getImageData(0, 0, S, S);

        const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 128) continue; // skip transparent padding
          const r = data[i] / 255;
          const g = data[i + 1] / 255;
          const b = data[i + 2] / 255;
          // Ignore near-black and near-white: both are usually background or
          // print, and neither says anything about the record's colour.
          const l = luma(r, g, b);
          if (l < 0.06 || l > 0.96) continue;
          const key = ((r * 3.99) | 0) * 16 + ((g * 3.99) | 0) * 4 + ((b * 3.99) | 0);
          const cur = buckets.get(key);
          if (cur) {
            cur.r += r;
            cur.g += g;
            cur.b += b;
            cur.n++;
          } else {
            buckets.set(key, { r, g, b, n: 1 });
          }
        }
        if (buckets.size === 0) return finish(FALLBACK_PALETTE);

        const swatches = [...buckets.values()]
          .map((s) => ({
            rgb: [s.r / s.n, s.g / s.n, s.b / s.n] as [number, number, number],
            weight: s.n,
          }))
          // Favour colourful swatches over merely common ones — the most
          // frequent colour on a cover is often a flat neutral.
          .sort((a, b) => {
            const sat = (c: [number, number, number]) =>
              Math.max(...c) <= 0 ? 0 : (Math.max(...c) - Math.min(...c)) / Math.max(...c);
            return b.weight * (0.45 + sat(b.rgb)) - a.weight * (0.45 + sat(a.rgb));
          });

        const primary = vivify(...swatches[0].rgb);
        // Accent: the most chromatically distant of the next few swatches, so
        // the pair actually contrasts instead of being two shades of one hue.
        let accent = primary;
        let best = -1;
        for (const s of swatches.slice(1, 6)) {
          const d =
            Math.abs(s.rgb[0] - primary[0]) +
            Math.abs(s.rgb[1] - primary[1]) +
            Math.abs(s.rgb[2] - primary[2]);
          if (d > best) {
            best = d;
            accent = vivify(...s.rgb);
          }
        }
        // If the cover is essentially monochrome, borrow the house cyan so
        // there's still a second colour to work with.
        if (best < 0.25) accent = FALLBACK_PALETTE.accent;

        const shadow: [number, number, number] = [
          primary[0] * 0.16,
          primary[1] * 0.16,
          primary[2] * 0.22,
        ];
        finish(makePalette(primary, accent, shadow));
      } catch {
        finish(FALLBACK_PALETTE); // tainted canvas, decode failure, etc.
      }
    };
    img.src = src;
  });

  inflight.set(src, job);
  return job;
}

/** Synchronous read for render loops — null until extraction resolves. */
export function cachedPalette(src: string | null | undefined): Palette | null {
  return src ? cache.get(src) ?? null : null;
}
