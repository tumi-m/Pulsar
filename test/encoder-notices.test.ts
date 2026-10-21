import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The in-browser Crate Recap exporter (@remotion/web-renderer) pulls in
 * Mediabunny's encoder extensions, whose wasm builds compile in FFmpeg's AAC
 * encoder and LAME (both LGPL) and libFLAC (BSD-3-Clause). They ship as app
 * chunks, not files in public/, so public/licenses/NOTICE.md records them.
 * A dependency bump that changes a package or the library inside it must
 * update that notice too.
 */

const root = path.resolve(__dirname, "..");
const LICENSES = path.join(root, "public", "licenses");
const notice = readFileSync(path.join(LICENSES, "NOTICE.md"), "utf8");
const fromRenderer = createRequire(path.join(root, "node_modules/@remotion/web-renderer/package.json"));

/** The installed package's directory, as the web renderer resolves it. */
function packageDir(name: string): string {
  // The packages export only ".", so resolve the entry (dist/bundles/x.mjs).
  return path.resolve(path.dirname(fromRenderer.resolve(name)), "..", "..");
}

function bundle(name: string): string {
  const dir = packageDir(name);
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { module: string };
  return readFileSync(path.join(dir, pkg.module), "latin1");
}

describe("public/licenses: the exporter's audio encoders", () => {
  const rendererDeps = Object.keys(
    (
      JSON.parse(readFileSync(path.join(root, "node_modules/@remotion/web-renderer/package.json"), "utf8")) as {
        dependencies: Record<string, string>;
      }
    ).dependencies,
  ).filter((d) => /^@mediabunny\/.+-encoder$/.test(d));

  it("names every encoder package the web renderer depends on, at its installed version", () => {
    expect(rendererDeps.sort()).toEqual([
      "@mediabunny/aac-encoder",
      "@mediabunny/flac-encoder",
      "@mediabunny/mp3-encoder",
    ]);
    for (const name of rendererDeps) {
      const pkg = JSON.parse(readFileSync(path.join(packageDir(name), "package.json"), "utf8")) as {
        version: string;
        license: string;
      };
      expect(notice).toContain(`\`${name}@${pkg.version}\``);
      expect(pkg.license).toBe("MPL-2.0");
    }
  });

  it("records the FFmpeg build the AAC encoder compiles in, with the LGPL text", () => {
    const lavc = [...bundle("@mediabunny/aac-encoder").matchAll(/Lavc(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
    expect(lavc.length).toBeGreaterThan(0);
    for (const v of lavc) expect(notice).toContain(`Lavc${v}`);
    expect(notice).toContain("LGPL-2.1-or-later");
    expect(notice).toContain("](./LGPL-2.1.txt)");
    const lgpl = readFileSync(path.join(LICENSES, "LGPL-2.1.txt"), "utf8");
    expect(lgpl).toContain("GNU LESSER GENERAL PUBLIC LICENSE");
    expect(lgpl).toContain("Version 2.1, February 1999");
  });

  it("records the LAME version the MP3 encoder compiles in", () => {
    const b64 = bundle("@mediabunny/mp3-encoder").match(/AGFzbQ[A-Za-z0-9+/=]+/)?.[0];
    expect(b64).toBeTruthy();
    const wasm = Buffer.from(b64!, "base64").toString("latin1");
    const versions = [...wasm.matchAll(/\0(3\.\d{2,3})\0/g)].map((m) => m[1]);
    expect(versions.length).toBeGreaterThan(0);
    for (const v of versions) expect(notice).toContain(`LAME ${v}`);
    expect(notice).toContain("https://lame.sourceforge.io/");
  });

  it("records the libFLAC build the FLAC encoder compiles in, with its BSD notice", () => {
    const ids = [...bundle("@mediabunny/flac-encoder").matchAll(/reference libFLAC (git-[0-9a-f]+ \d{8})/g)].map(
      (m) => m[1],
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(notice).toContain(id);
    expect(notice).toContain("Xiph.Org Foundation");
    expect(notice).toContain("Redistributions in binary form must reproduce the above copyright");
  });
});
