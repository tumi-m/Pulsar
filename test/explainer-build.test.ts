import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * public/explainers/ — the built Motion Canvas explainer, as the app serves it.
 *
 * The app loads it by URL at runtime (components/SampleExplainer.tsx), so
 * nothing in the Next build notices if it goes missing or stops fitting
 * together. These checks are what does: the one module exists, carries the
 * player element and its guards, imports nothing else, and its fonts resolve
 * to files that are there.
 *
 * Rebuild with `npm run motion:explainers` after editing explainers/.
 */

const DIR = path.resolve(__dirname, "../public/explainers");
const read = (rel: string) => fs.readFileSync(path.join(DIR, rel), "utf8");

/**
 * Module specifiers a built file imports, statically or not: a `.js` file
 * (a split-out chunk) or a bare @motion-canvas package nobody would serve.
 */
function moduleImports(source: string): string[] {
  const specs = new Set<string>();
  for (const m of source.matchAll(/\b(?:from|import)\s*\(?\s*"([^"]+\.js|@motion-canvas\/[^"]*)"/g)) specs.add(m[1]);
  return [...specs];
}

describe("built explainer bundle", () => {
  it("is the one file the app asks for", () => {
    const file = path.join(DIR, "project.js");
    expect(fs.existsSync(file), "project.js — run npm run motion:explainers").toBe(true);
    expect(fs.statSync(file).size).toBeGreaterThan(1000);
  });

  it("default-exports the project, which is what <motion-canvas-player src> imports", () => {
    expect(read("project.js")).toMatch(/export\s*\{[^}]*\bas default\b[^}]*\}/);
    // Built for the player, not the editor: the editor bootstrap awaits
    // plugins and would leave the player holding a promise.
    expect(read("project.js")).not.toContain("editorBootstrap");
  });

  it("registers the player element itself", () => {
    expect(read("project.js")).toMatch(/customElements\.define\(/);
    expect(read("project.js")).toContain("motion-canvas-player");
  });

  it("carries explainers/src/player.ts's guards for the 3.17.2 element", () => {
    const bundle = read("project.js");
    // `quality` set before the project loads waits instead of throwing.
    expect(bundle).toMatch(/prototype\.updateSettings\s*=/);
    // A project that finishes loading on a detached element doesn't leave a
    // Player running its frame loop off-page.
    expect(bundle).toMatch(/prototype\.updateSource\s*=/);
    expect(bundle).toMatch(/isConnected[^;]*deactivate\(\)/);
  });

  it("imports no other module, so a retry under a fresh URL refetches all of it", () => {
    // Browsers keep a failed module import for the life of the page. The app
    // retries under a new URL, which can't reach a chunk this file imports.
    expect(moduleImports(read("project.js"))).toEqual([]);
    expect(fs.existsSync(path.join(DIR, "chunks"))).toBe(false);
    expect(fs.existsSync(path.join(DIR, "player.js"))).toBe(false);
  });

  it("loads its fonts relative to itself, from files that exist", () => {
    const project = read("project.js");
    const fonts = [...project.matchAll(/new URL\("([^"]+\.woff2)",\s*import\.meta\.url\)/g)].map((m) => m[1]);
    // Inter 600 + 800 and Space Mono 700: the weights the scene draws with.
    expect(fonts).toHaveLength(3);
    for (const font of fonts) expect(fs.existsSync(path.join(DIR, font)), font).toBe(true);
    // A root-absolute URL would break as soon as it's served under /explainers/.
    expect(project).not.toMatch(/"\/assets\//);
  });

  it("ships the licence notice for the bundled code and fonts", () => {
    // Copied in from explainers/public/ by the build; the OFL and MIT both
    // require their text to travel with the files.
    const notice = read("NOTICE.md");
    expect(notice).toContain("SIL Open Font License");
    expect(notice).toContain("Copyright (c) 2022 motion-canvas");
  });

  it("stays small", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else files.push(p);
      }
    };
    walk(DIR);
    const size = (f: string) => fs.statSync(f).size;
    const js = files.filter((f) => f.endsWith(".js")).reduce((n, f) => n + size(f), 0);
    const all = files.reduce((n, f) => n + size(f), 0);
    // ~220 kB of JS (~70 kB gzipped) and ~65 kB of fonts today. Headroom, not
    // a target: a jump past these means something got bundled twice.
    expect(js).toBeLessThan(280_000);
    expect(all).toBeLessThan(400_000);
  });
});
