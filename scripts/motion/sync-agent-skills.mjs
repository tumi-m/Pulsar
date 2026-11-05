#!/usr/bin/env node
/**
 * Vendors the motion-design agent skills into .claude/ at pinned commits.
 *
 *   node scripts/motion/sync-agent-skills.mjs            # sync to the pins below
 *   node scripts/motion/sync-agent-skills.mjs --check    # exit 1 if .claude/ has drifted
 *
 * Skills are instructions a future Claude Code session will follow, so they
 * are pinned to a reviewed commit rather than tracking a branch. To update:
 * bump a `commit`, run this, read the diff under .claude/ in full, and commit.
 *
 * Sources:
 *   remotion-dev/skills     — Remotion's official agent skills
 *   greensock/gsap-skills   — GSAP's official agent skills (MIT)
 *   motiondivision/ai-kit   — Motion's AI kit for Claude Code (MIT)
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const SKILLS = path.join(ROOT, ".claude", "skills");
const MANIFEST = path.join(ROOT, ".claude", "skills", "VENDORED.json");

export const SOURCES = [
  {
    repo: "remotion-dev/skills",
    commit: "7ba4dcf8ebe1626b00baa41e1f2478113719b60b",
    license: "See https://www.remotion.dev/license (no LICENSE file in the skills repo)",
    // remotion-best-practices is a router that embeds every other Remotion
    // skill, maps included. The standalone map skill (Cesium/MapTiler/Mapbox
    // flyovers) has nothing to do in a music app, so only the embedded copy
    // is kept.
    skills: [
      "remotion-best-practices",
      "remotion-create",
      "remotion-markup",
      "remotion-render",
      "remotion-studio",
      "remotion-multimedia",
      "remotion-captions",
      "remotion-interactivity",
      "remotion-saas",
      "remotion-docs",
      "remotion-upgrade",
    ].map((name) => ({ from: `skills/${name}`, to: name })),
  },
  {
    repo: "greensock/gsap-skills",
    commit: "aed9cfd3277740755f6bfc1155c7aa645403b760",
    license: "MIT",
    licenseFile: "LICENSE",
    // gsap-frameworks covers Vue/Nuxt/Svelte only.
    skills: ["gsap-core", "gsap-timeline", "gsap-react", "gsap-plugins", "gsap-scrolltrigger", "gsap-utils", "gsap-performance"].map(
      (name) => ({ from: `skills/${name}`, to: name })
    ),
  },
  {
    repo: "motiondivision/ai-kit",
    commit: "d1c5c26f424adfd47c112d894e9d424b57338c7e",
    license: "MIT",
    licenseFile: "packages/motion-ai/package.json#license",
    skills: [{ from: "plugins/motion/skills/motion", to: "motion" }],
  },
];

/** Stable digest of a directory tree, for drift detection. */
function digest(dir) {
  const h = createHash("sha256");
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(path.relative(dir, p)).update("\0").update(readFileSync(p)).update("\0");
    }
  };
  walk(dir);
  return h.digest("hex");
}

function fetchRepo(repo, commit) {
  const dir = mkdtempSync(path.join(tmpdir(), "pulsar-skills-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: ["ignore", "ignore", "inherit"] });
  git("init", "-q");
  git("remote", "add", "origin", `https://github.com/${repo}`);
  git("fetch", "-q", "--depth", "1", "origin", commit);
  git("checkout", "-q", "FETCH_HEAD");
  return dir;
}

function main() {
  const check = process.argv.includes("--check");
  const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { skills: {} };
  const manifest = { generatedBy: "scripts/motion/sync-agent-skills.mjs", sources: [], skills: {} };
  let drift = false;

  for (const src of SOURCES) {
    manifest.sources.push({ repo: src.repo, commit: src.commit, license: src.license });
    if (check) {
      for (const s of src.skills) {
        const dest = path.join(SKILLS, s.to);
        const now = existsSync(dest) ? digest(dest) : null;
        if (!now || now !== previous.skills[s.to]?.sha256) {
          console.error(`drift: .claude/skills/${s.to}`);
          drift = true;
        }
      }
      continue;
    }
    const dir = fetchRepo(src.repo, src.commit);
    try {
      for (const s of src.skills) {
        const from = path.join(dir, s.from);
        const dest = path.join(SKILLS, s.to);
        rmSync(dest, { recursive: true, force: true });
        cpSync(from, dest, { recursive: true });
        // Codex-only metadata; Claude Code ignores it.
        rmSync(path.join(dest, "agents", "openai.yaml"), { force: true });
        manifest.skills[s.to] = { repo: src.repo, commit: src.commit, path: s.from, sha256: digest(dest) };
        console.log(`synced ${s.to} ← ${src.repo}@${src.commit.slice(0, 7)}`);
      }
      if (src.licenseFile && !src.licenseFile.includes("#")) {
        cpSync(path.join(dir, src.licenseFile), path.join(SKILLS, `LICENSE.${src.repo.replace("/", "_")}`));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (check) {
    if (drift) {
      console.error("Vendored skills differ from VENDORED.json — re-run without --check and review the diff.");
      process.exit(1);
    }
    console.log("Vendored skills match their pins.");
    return;
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
}

main();
