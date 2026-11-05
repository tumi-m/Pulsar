# Vendored agent skills

These skills are copied from their vendors' official repositories at the commits
pinned in `scripts/motion/sync-agent-skills.mjs` (digests in `VENDORED.json`).
Claude Code loads them as instructions, so they are pinned and reviewed rather
than tracking a branch.

| Skills | Source | Licence |
|---|---|---|
| `remotion-*` (11) | [remotion-dev/skills](https://github.com/remotion-dev/skills) @ `7ba4dcf` | No licence file in the repo. Remotion itself is under the [Remotion License](https://www.remotion.dev/license): free for individuals and companies of up to 3 people; larger for-profit companies need a company licence. Check before redistributing this repository publicly. |
| `gsap-*` (7) | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) @ `aed9cfd` | MIT — `LICENSE.greensock_gsap-skills` |
| `motion` | [motiondivision/ai-kit](https://github.com/motiondivision/ai-kit) @ `d1c5c26` | MIT (declared in `packages/motion-ai/package.json`, © Matt Perry; upstream ships no LICENSE file) |

Left out on purpose: `remotion-maps` as a standalone skill (map flyovers; its
content is still embedded under `remotion-best-practices/`), `gsap-frameworks`
(Vue/Svelte only), and Motion's `motion-reviewer` agent (it needs a paid Motion+
sign-in to do anything).

## Updating

```bash
# bump a commit in scripts/motion/sync-agent-skills.mjs, then:
npm run motion:skills          # re-vendor at the new pins
git diff .claude/skills        # read ALL of it before committing
npm run motion:skills:check    # CI-style drift check
```

Do not update these with `npx skills update … --yes` or `npx remotion upgrade`
(which also refreshes project skills): both pull unreviewed upstream content
straight into instructions this repo's agents follow.

## Security review (October 2026)

Every vendored file was read and checked byte-for-byte against upstream at the
pinned commits: no prompt injection, exfiltration, telemetry instructions,
hidden or bidi characters, or encoded payloads. Low-severity notes worth
knowing when following them:

- `motion/performance-audit` fetches its audit methodology live from the
  Motion+ MCP server and runs `npx motionscore` (Motion's own package, unpinned,
  pulls in Puppeteer). Ask before running runtime audits.
- `motion/codex` says to install packages a fetched example references; confirm
  with the user first.
- Inside `remotion-best-practices/remotion-maps`: one guide hides map
  attribution with CSS (provider terms require it to stay visible) and suggests
  an unrestricted MapTiler key in a `REMOTION_`-prefixed variable (those are
  bundled into client code). Don't follow either.
- `remotion-markup/voiceover.md` says to ask the user for an ElevenLabs key;
  keys belong in `.env`, never in chat. `remotion-markup/sfx.md` links meme
  sound effects of unclear licence — don't use them in shipped videos.
- GSAP's skills recommend GSAP by default and Motion's recommend Motion. Pulsar
  uses Motion (`motion/react`) for UI, GSAP for SVG/text timelines, and Anime.js
  for SVG path drawing — see `docs/motion-stack.md`.
