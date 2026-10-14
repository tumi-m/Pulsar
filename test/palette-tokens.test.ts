import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import tailwind from "tailwindcss";
import config from "../tailwind.config";

/**
 * The Walkman palette's tokens must accept opacity modifiers.
 *
 * Tailwind 3 can only apply `/60`-style opacity to a colour it can take apart:
 * a literal like `#f2662c`, or the channel form `rgb(var(--x-rgb) / <alpha-value>)`.
 * A token defined as a bare `var(--x)` compiles without a warning and makes
 * every `text-ink/60`, `bg-sony/20` and `border-chrome-700/70` emit NO CSS.
 *
 * That shipped for one commit: 517 class usages, 115 distinct, all dead. Dimmed
 * text rendered at full strength, tints disappeared, and borders fell back to
 * preflight's light grey — white rings round every chip and key. Nothing in a
 * typecheck, a build or a unit test noticed, because nothing is wrong until
 * you look at the page.
 *
 * So this compiles real class strings with the real config and asserts rules
 * come out, rather than inspecting the config's shape and hoping.
 */

const ROOT = join(__dirname, "..");
const globals = readFileSync(join(ROOT, "app/globals.css"), "utf8");

async function compile(classes: string[]): Promise<string> {
  const result = await postcss([
    tailwind({
      ...config,
      content: [{ raw: `<div class="${classes.join(" ")}"></div>`, extension: "html" }],
    }),
  ]).process("@tailwind utilities;", { from: undefined });
  return result.css;
}

/** Every leaf colour token in the config, as a Tailwind colour name. */
function tokens(): string[] {
  const colors = (config.theme?.extend as { colors: Record<string, unknown> }).colors;
  const out: string[] = [];
  for (const [name, v] of Object.entries(colors)) {
    if (typeof v === "string") out.push(name);
    else
      for (const shade of Object.keys(v as object))
        out.push(shade === "DEFAULT" ? name : `${name}-${shade}`);
  }
  return out;
}

describe("palette tokens accept opacity modifiers", () => {
  it("emits a rule for text-, bg- and border- at /60 on every token", async () => {
    const names = tokens();
    expect(names.length).toBeGreaterThan(10);
    const classes = names.flatMap((n) => [`text-${n}/60`, `bg-${n}/20`, `border-${n}/70`]);
    const css = await compile(classes);
    const missing = classes.filter((c) => !css.includes(`.${c.replace("/", "\\/")}`));
    expect(missing, `no CSS emitted for: ${missing.join(", ")}`).toEqual([]);
  });

  it("actually applies the alpha rather than dropping it", async () => {
    const css = await compile(["text-ink/60"]);
    // rgb(var(--ink-100-rgb) / 0.6) — the modifier has to land in the value.
    expect(css).toMatch(/\.text-ink\\\/60\s*\{[^}]*\/\s*0?\.6\)/);
  });
});

describe("every channel variable the config reads is declared", () => {
  it("has a -rgb twin in globals.css for each token", () => {
    const src = readFileSync(join(ROOT, "tailwind.config.ts"), "utf8");
    const read = [...src.matchAll(/var\((--[a-z0-9-]+-rgb)\)/g)].map((m) => m[1]);
    expect(read.length).toBeGreaterThan(10);
    const undeclared = [...new Set(read)].filter((v) => !new RegExp(`${v}\\s*:`).test(globals));
    expect(undeclared).toEqual([]);
  });

  it("keeps each -rgb twin in step with its hex value", () => {
    for (const m of globals.matchAll(/(--[a-z0-9-]+):\s*#([0-9a-f]{6});/gi)) {
      const [, name, hex] = m;
      const twin = globals.match(new RegExp(`${name}-rgb:\\s*([0-9]+) ([0-9]+) ([0-9]+);`));
      expect(twin, `${name} has no -rgb twin`).not.toBeNull();
      const want = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(twin!.slice(1, 4).map(Number), `${name} drifted from its hex`).toEqual(want);
    }
  });
});

describe("named easing compiles", () => {
  it("emits a rule for ease-settle (the arbitrary cubic-bezier form emitted none)", async () => {
    const css = await compile(["ease-settle"]);
    expect(css).toMatch(/\.ease-settle\s*\{[^}]*cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  });
});
