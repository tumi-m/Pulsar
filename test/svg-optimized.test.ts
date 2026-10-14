import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadConfig, optimize, type Config } from "svgo";

/**
 * Every SVG Pulsar serves from public/ is already in the shape
 * `npm run motion:svg` produces — so one added straight from a design tool
 * (editor metadata, 12-digit coordinates, comments) fails here rather than
 * shipping. The check is idempotence: optimising an optimised file with the
 * project config changes nothing. Fix a failure with `npm run motion:svg`.
 */

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");

const svgs = (readdirSync(PUBLIC, { recursive: true }) as string[])
  .filter((f) => f.endsWith(".svg"))
  .map((f) => path.join(PUBLIC, f));

/**
 * Rename ids in order of first appearance. SVGO's cleanupIds can swap two ids
 * on every run when one is referenced before it is defined (Satori's output
 * does this), so a file `motion:svg` just wrote would fail an exact compare
 * for a difference of letters, forever. Same structure, same ids after this.
 */
function canonicalIds(svg: string): string {
  const names = new Map<string, string>();
  const name = (id: string) => {
    if (!names.has(id)) names.set(id, `id${names.size}`);
    return names.get(id)!;
  };
  return svg.replace(/\bid="([^"]+)"|url\(#([^)]+)\)|href="#([^"]+)"/g, (_m, def, url, href) =>
    def ? `id="${name(def)}"` : url ? `url(#${name(url)})` : `href="#${name(href)}"`,
  );
}

async function projectConfig(): Promise<Config> {
  const config = await loadConfig("svgo.config.mjs", ROOT);
  if (!config) throw new Error("svgo.config.mjs missing");
  return config;
}

describe("SVGs under public/", () => {
  it("there is at least one to check (the glob still matches)", () => {
    expect(svgs.length).toBeGreaterThan(0);
  });

  it.each(svgs.map((f) => [path.relative(ROOT, f), f]))("%s is already SVGO-optimised", async (_rel, file) => {
    const config = await projectConfig();
    const source = readFileSync(file, "utf8");
    const { data } = optimize(source, { ...config, path: file });
    // Trimmed: an editor's final newline isn't an unoptimised file.
    expect(canonicalIds(data.trim())).toBe(canonicalIds(source.trim()));
  });
});

describe("svgo.config.mjs", () => {
  it("keeps what accessibility and scaling need", async () => {
    const config = await projectConfig();
    const input = `<?xml version="1.0"?>
      <!-- exported from a design tool -->
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-labelledby="t d">
        <title id="t">Pulsar</title>
        <desc id="d">An orange dot on a graphite deck</desc>
        <metadata>editor junk</metadata>
        <circle cx="32.000000" cy="32.000000" r="10.000000" fill="#f2662c"/>
      </svg>`;
    const { data } = optimize(input, config);
    expect(data).toContain('viewBox="0 0 64 64"');
    expect(data).toContain('role="img"');
    expect(data).toContain("aria-labelledby");
    expect(data).toContain("<title");
    expect(data).toContain("<desc");
    // ...and it is actually optimising.
    expect(data).not.toContain("<!--");
    expect(data).not.toContain("<metadata");
    expect(data).not.toContain("32.000000");
  });

  it("runs multipass, so one run reaches the fixed point", async () => {
    const config = await projectConfig();
    expect(config.multipass).toBe(true);
  });

  it("the idempotence check does catch an unoptimised file", async () => {
    const config = await projectConfig();
    const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!-- hi --><g><rect x="0" y="0" width="10" height="10" fill="#ff0000"/></g></svg>`;
    expect(canonicalIds(optimize(raw, config).data)).not.toBe(canonicalIds(raw));
  });
});
