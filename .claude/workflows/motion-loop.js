export const meta = {
  name: 'motion-loop',
  description: 'Pulsar motion loop: brief → design → animate → build → sound → render → review → ship',
  whenToUse: 'Any motion piece in Pulsar bigger than a one-line tweak — UI motion, a Remotion video, a Motion Canvas explainer, a 3D scene, a generated asset or sound. args: { brief: "motion/briefs/<name>.md" or a one-line idea }.',
  phases: [
    { title: 'Brief', detail: 'read or write motion/briefs/<name>.md' },
    { title: 'Design', detail: 'three independent designs, judged against the brief' },
    { title: 'Animate', detail: 'author the motion with the chosen tools' },
    { title: 'Build', detail: 'wire it into the app, lazy-load, test' },
    { title: 'Sound', detail: 'SFX / soundtrack where the brief wants it' },
    { title: 'Render', detail: 'render and build the outputs' },
    { title: 'Review', detail: 'three adversarial lenses, fix, repeat' },
    { title: 'Ship', detail: 'full gate and a ship report' },
  ],
}

// Every agent works from the same ground rules; the skill holds the detail.
const GROUND = `You are working in /home/user/Pulsar (Pulsar, a Next.js 15 / React 19 music-discovery app) as one stage of its motion-design loop.
Read .claude/skills/pulsar-motion/SKILL.md first and follow it: the tool-per-layer table, the rules (reduced-motion form for everything, no Motion whileTap or focus reveals on tappables, content visible before lazy libraries load, heavy libraries never statically imported from the home page, clean-up), and the commands. Read the vendored skill for any library you touch (.claude/skills/remotion-*, gsap-*, motion) and package READMEs/types for libraries without one. docs/motion-stack.md maps where each tool already lives — extend what exists rather than adding a parallel system.
Never git commit, push, reset, checkout or stash. Don't install or remove root dependencies unless the design explicitly calls for it and says why.`

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'repo-relative path of the brief file' },
    name: { type: 'string' },
    deliverable: { type: 'string', enum: ['ui-motion', 'video', 'explainer', '3d', 'asset', 'sound'] },
    where: { type: 'string' },
    format: { type: 'string' },
    feeling: { type: 'string' },
    constraints: { type: 'array', items: { type: 'string' } },
    doneWhen: { type: 'array', items: { type: 'string' } },
  },
  required: ['path', 'name', 'deliverable', 'where', 'format', 'doneWhen'],
}

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    angle: { type: 'string' },
    tools: { type: 'array', items: { type: 'object', properties: { layer: { type: 'string' }, tool: { type: 'string' }, why: { type: 'string' } }, required: ['layer', 'tool', 'why'] } },
    beats: { type: 'array', items: { type: 'object', properties: { at: { type: 'string' }, what: { type: 'string' }, easing: { type: 'string' } }, required: ['at', 'what'] } },
    reducedMotion: { type: 'string' },
    files: { type: 'array', items: { type: 'string' }, description: 'files to create or change' },
    sound: { type: 'string', description: 'what sound, if any, and how it is produced' },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['angle', 'tools', 'beats', 'reducedMotion', 'files'],
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    scores: { type: 'array', items: { type: 'object', properties: { angle: { type: 'string' }, score: { type: 'number' }, reason: { type: 'string' } }, required: ['angle', 'score', 'reason'] } },
    winner: { type: 'string' },
    plan: { type: 'string', description: 'the final design: the winner with the best ideas from the others grafted in, concrete enough to implement' },
  },
  required: ['scores', 'winner', 'plan'],
}

const WORK_SCHEMA = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    verification: { type: 'string', description: 'what was run and what it showed (tsc, tests, screenshots, renders)' },
    open: { type: 'array', items: { type: 'string' }, description: 'anything unfinished or unverified' },
  },
  required: ['files', 'summary', 'verification', 'open'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['major', 'minor'] },
          file: { type: 'string' },
          issue: { type: 'string' },
          evidence: { type: 'string', description: 'how it was confirmed: command output, screenshot path, file:line' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'issue', 'evidence', 'fix'],
      },
    },
    briefMet: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, met: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['criterion', 'met'] } },
  },
  required: ['findings'],
}

const SHIP_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    gate: { type: 'object', properties: { typecheck: { type: 'string' }, tests: { type: 'string' }, lint: { type: 'string' }, build: { type: 'string' }, e2e: { type: 'string' }, homeFirstLoad: { type: 'string' } }, required: ['typecheck', 'tests', 'lint', 'build'] },
    files: { type: 'array', items: { type: 'string' } },
    commitMessage: { type: 'string', description: 'a proposed commit message (not committed)' },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['ready', 'gate', 'files', 'commitMessage'],
}

const input = typeof args === 'string' ? args : args && args.brief
if (!input) throw new Error('motion-loop needs args: { brief: "motion/briefs/<name>.md" or a one-line idea }')
const isPath = /\.md$/i.test(input.trim()) && !/\s/.test(input.trim())

// ── Brief ──────────────────────────────────────────────────────────
phase('Brief')
const brief = await agent(
  `${GROUND}
## Stage: brief
${isPath
    ? `Read the brief at ${input.trim()}. If any heading of motion/briefs/TEMPLATE.md is missing or vague (especially "Done when"), fill it in sensibly in the file and say what you added.`
    : `Turn this idea into a brief: "${input}". Copy motion/briefs/TEMPLATE.md to motion/briefs/<kebab-name>.md and fill every heading. Look at the app first so "Where it appears" names real routes/components and the format fits them. "Done when" must be checkable.`}
Return the brief's fields.`,
  { label: 'brief', phase: 'Brief', schema: BRIEF_SCHEMA }
)
log(`Brief: ${brief.name} (${brief.deliverable}) → ${brief.where}`)

// ── Design: judge panel ────────────────────────────────────────────
phase('Design')
const ANGLES = [
  { key: 'story', lens: 'story-first: the clearest sequence of beats for what the viewer should feel and understand, with timings' },
  { key: 'system', lens: 'system-first: reuse what Pulsar already has (lib/motion tokens, remotion/ components, lib/cards, TapeLoader, the loaders in lib/*Loader.ts) so this reads as the same product' },
  { key: 'craft', lens: 'constraints-first: the reduced-motion form, touch, bundle budget, data edge cases (long titles, empty lists, missing artwork) and frame budget, designed in rather than patched on' },
]
const designs = (await parallel(ANGLES.map((a) => () =>
  agent(`${GROUND}
## Stage: design (${a.key})
Brief (${brief.path}): ${JSON.stringify(brief)}
Design this piece from one angle — ${a.lens}. Choose the tool for each layer from the skill's table (justify any departure), the beats with timings and easings, the reduced-motion form, the sound, and the exact files. Read the code you'd build on. Do not write code.`,
    { label: `design:${a.key}`, phase: 'Design', schema: DESIGN_SCHEMA })))).filter(Boolean)

const judged = await agent(`${GROUND}
## Stage: design judge
Brief: ${JSON.stringify(brief)}
Designs: ${JSON.stringify(designs)}
Score each 1–10 against the brief's "Done when", Pulsar's rules and how well it fits the existing code. Pick a winner and write the final plan, grafting in the best ideas of the others. Be concrete: files, tools, beats, reduced-motion form, sound.`,
  { label: 'design:judge', phase: 'Design', schema: JUDGE_SCHEMA })
log(`Design: ${judged.winner} wins`)

// ── Animate → Build → Sound → Render ───────────────────────────────
phase('Animate')
const animated = await agent(`${GROUND}
## Stage: animate
Brief: ${JSON.stringify(brief)}
Plan: ${judged.plan}
Author the motion itself — the composition, timeline, scene or animation module — following the plan and the library's skill. Keep it self-contained so the build stage can wire it in. Verify it in isolation (tsc; for video a Remotion still via \`npx remotion still remotion/index.ts <Comp> out.png\`; for UI a quick Playwright render).`,
  { label: 'animate', phase: 'Animate', schema: WORK_SCHEMA })

phase('Build')
const built = await agent(`${GROUND}
## Stage: build
Brief: ${JSON.stringify(brief)}
Plan: ${judged.plan}
Animate stage: ${JSON.stringify(animated)}
Wire it into the app: the trigger/route, data, lazy loading (check the build's First Load JS for / does not grow beyond the budget), error and empty states, the reduced-motion form, and focused unit tests in test/. Run tsc and the tests.`,
  { label: 'build', phase: 'Build', schema: WORK_SCHEMA })

phase('Sound')
const sound = await agent(`${GROUND}
## Stage: sound
Brief: ${JSON.stringify(brief)}
Plan: ${judged.plan}
Built: ${JSON.stringify(built)}
If the brief or plan wants sound: produce it deterministically (extend scripts/motion/build-sfx.mjs; encode with the bundled FFmpeg; -18 LUFS; check with ffprobe), and wire it — UI sounds only through playSfx() in lib/sfx.ts (opt-in), video through Remotion <Audio> from @remotion/media. If no sound is wanted, change nothing and say so.`,
  { label: 'sound', phase: 'Sound', schema: WORK_SCHEMA })

phase('Render')
const rendered = await agent(`${GROUND}
## Stage: render
Brief: ${JSON.stringify(brief)}
Work so far: ${JSON.stringify({ animated, built, sound })}
Produce the real outputs: for video, render it (npm run motion:render, or bundle+renderMedia for a different composition) into motion/out/; for an explainer, npm run motion:explainers; for UI, a production next build served on a free port, with Playwright screenshots at 390x844 (touch) and 1280x800 plus reducedMotion:"reduce" saved under motion/out/review/. Look at every image you produce with the Read tool. Report paths.`,
  { label: 'render', phase: 'Render', schema: WORK_SCHEMA })

// ── Review: adversarial lenses, fix, repeat ────────────────────────
const LENSES = [
  { key: 'craft', ask: 'motion craft against the brief: timing, easing, choreography, legibility at phone size, palette/type consistency, and each "Done when" item — mark each met or not with evidence. For video run npm run motion:review on the render and read the contact sheet.' },
  { key: 'access', ask: 'accessibility and touch: the reduced-motion form really shows the final state, no whileTap/focus reveals on tappables, keyboard and screen-reader paths, focus not lost when UI swaps, live regions not spamming.' },
  { key: 'engineering', ask: 'engineering: bundle (heavy imports reachable from the home page?), leaks and clean-up, SSR safety, error/empty states, wrong library API use, flaky tests.' },
]
let reviewRound = 0
let findings = []
let lastReview = []
while (reviewRound < 3) {
  reviewRound++
  phase('Review')
  lastReview = (await parallel(LENSES.map((l) => () =>
    agent(`${GROUND}
## Stage: review (${l.key}, round ${reviewRound})
Brief: ${JSON.stringify(brief)}
Plan: ${judged.plan}
Work: ${JSON.stringify({ animated, built, sound, rendered })}
Try to break it. Lens — ${l.ask}
Only report what you have confirmed (command output, screenshot, file:line). Don't modify files.`,
      { label: `review:${l.key}:${reviewRound}`, phase: 'Review', schema: FINDINGS_SCHEMA })))).filter(Boolean)
  findings = lastReview.flatMap((r) => r.findings || [])
  const unmet = lastReview.flatMap((r) => (r.briefMet || []).filter((c) => !c.met))
  const major = findings.filter((f) => f.severity === 'major')
  log(`Review round ${reviewRound}: ${major.length} major, ${findings.length - major.length} minor, ${unmet.length} unmet criteria`)
  if (!major.length && !unmet.length && (reviewRound > 1 || !findings.length)) break
  if (reviewRound === 3) break
  await agent(`${GROUND}
## Stage: fix (round ${reviewRound})
Brief: ${JSON.stringify(brief)}
Findings: ${JSON.stringify(findings)}
Unmet criteria: ${JSON.stringify(unmet)}
Re-check each against the current code; fix what's real (majors and unmet criteria first, then minors), skip what isn't with a reason. Re-run the checks that cover what you changed, including re-rendering if output changed.`,
    { label: `fix:${reviewRound}`, phase: 'Review', schema: WORK_SCHEMA })
}

// ── Ship ───────────────────────────────────────────────────────────
phase('Ship')
const ship = await agent(`${GROUND}
## Stage: ship
Brief: ${JSON.stringify(brief)}
Outstanding review findings: ${JSON.stringify(findings)}
Run the full gate from the repo root: npx tsc --noEmit -p . ; npx vitest run ; npx eslint . (0 errors) ; npx next build (record the "/" First Load JS) ; the Playwright e2e specs in test/e2e against the production build. Mark ready only if all pass and no major finding is outstanding. List every changed file and propose a commit message — do NOT commit or push; the session that ran this workflow decides.`,
  { label: 'ship', phase: 'Ship', schema: SHIP_SCHEMA })

return { brief, design: { winner: judged.winner, scores: judged.scores }, work: { animated, built, sound, rendered }, review: { rounds: reviewRound, outstanding: findings }, ship }
