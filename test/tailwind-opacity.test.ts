import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import defaultTheme from "tailwindcss/defaultTheme";

/**
 * Guard against silently-dropped colour opacity.
 *
 * Tailwind only understands `/NN` opacity modifiers whose step exists in the
 * theme scale — which stops at 95. `bg-[#07070d]/98` looks entirely reasonable
 * and compiles without complaint, but emits NO RULE AT ALL, so the element ends
 * up with `background-color: rgba(0,0,0,0)`.
 *
 * That bug shipped: seven full-screen overlays (samples, the sample breakdown,
 * lyrics, the crate export panels, the discography panel) rendered completely
 * transparent, letting the page underneath show through at full strength. It is
 * invisible in review and invisible in a typecheck, so it gets a test.
 *
 * The fix in every case is the bracketed alpha form — `bg-[#07070d]/[0.98]` —
 * which Tailwind does honour for any value.
 */

const SCALE = new Set(Object.keys(defaultTheme.opacity ?? {}));

/** Colour utilities where a trailing `/NN` means opacity (not a fraction). */
const COLOUR_PREFIXES = [
  "bg", "text", "border", "ring", "ring-offset", "divide", "outline",
  "shadow", "fill", "stroke", "from", "via", "to", "accent", "caret",
  "decoration", "placeholder",
];

const PATTERN = new RegExp(
  `\\b(?:hover:|focus:|active:|group-hover:|sm:|md:|lg:|xl:|dark:)*` +
    `(${COLOUR_PREFIXES.join("|")})-` +
    `(?:\\[[^\\]\\s]+\\]|[a-z0-9-]+)` +
    `/(\\d+)\\b`,
  "g"
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("tailwind opacity modifiers", () => {
  it("never uses an opacity step outside the theme scale", () => {
    const root = join(__dirname, "..");
    const files = [
      ...walk(join(root, "components")),
      ...walk(join(root, "app")),
      ...walk(join(root, "lib")),
    ];

    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(PATTERN)) {
          if (!SCALE.has(m[2])) {
            // /8 means 8% — the bracketed form needs two decimal places.
            const alpha = `0.${m[2].padStart(2, "0")}`;
            offenders.push(
              `${file.slice(root.length + 1)}:${i + 1}  ${m[0]}  ` +
                `(step ${m[2]} is not in the scale — use /[${alpha}])`
            );
          }
        }
      });
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("catches the exact class that shipped transparent overlays", () => {
    // Sanity check on the detector itself, so a future refactor of the regex
    // can't quietly turn this suite into a no-op.
    const hits = [...`className="bg-[#07070d]/98 backdrop-blur"`.matchAll(PATTERN)];
    expect(hits).toHaveLength(1);
    expect(SCALE.has(hits[0][2])).toBe(false);
  });

  it("leaves valid steps and layout fractions alone", () => {
    const ok = `className="w-1/2 top-1/2 bg-white/10 border-neon-violet/40 lg:w-1/3"`;
    const bad = [...ok.matchAll(PATTERN)].filter((m) => !SCALE.has(m[2]));
    expect(bad).toEqual([]);
  });
});
