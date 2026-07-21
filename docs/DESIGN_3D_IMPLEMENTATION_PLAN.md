# PULSAR — 3D Immersive Design & Motion Implementation Plan

> "Somewhere, something incredible is waiting to be known." — a music library built like a cathedral to the cosmos.

**Status:** proposal · **Owner:** design-eng · **Build model:** GLM 5.2 (agent execution) · **Token budget:** ~2,000,000 output tokens · **Target:** a cutting-edge, immersive 3D redesign of the Pulsar music-discovery experience.

---

## 0. Purpose & Constraints

This plan converts a seven-way aesthetic brief into a **buildable, verifiable** 3D/motion system for Pulsar. It is written to be executed by **research → build → experiment → verify** agent workflows, with quality gates at every phase so we spend the 2M-token budget on *finished, shipped* work — not experiments that rot on a branch.

**Non-negotiables**
- Ships on the existing **Next.js 16 / React 19 / Tailwind** stack — additive, never a rewrite.
- **60fps on a 2021 laptop; graceful 2D fallback** on low-power / `prefers-reduced-motion`.
- **Accessibility is a feature**, not an afterthought (keyboard, reduced-motion, contrast, screen-reader labels).
- Every phase ends with a **verification gate** (below). No gate, no merge.

---

## 1. The North Star — Seven Masters, One Doctrine

The brief fuses seven sensibilities. Each contributes **one enforceable principle**, not a mood board cliché.

| Master | Contributes | How it manifests in Pulsar |
|---|---|---|
| **Carl Sagan** | *Cosmic scale & reverent awe* | The library is a starfield you fly through. Depth is real (parallax, fog, true z). Numbers feel vast ("billions of plays"). Slowness as respect. |
| **Alfred Hitchcock** | *Suspense, framing & the reveal* | Nothing appears — it is **revealed**. Dolly-zoom (vertigo) on focus. Deep depth-of-field. Tension before a drop, release on play. Saul-Bass-style kinetic titles. |
| **Virgil Abloh** | *Deconstruction & meta-labeling* | "QUOTATION MARKS." Industrial callouts, ×-marks, `01/04` numbering, caution-tape dividers, the 3% shift that makes the familiar strange. |
| **Dieter Rams** | *"Less, but better"* | Ruthless restraint. Every element earns its pixels. Honest materials (no fake skeuomorph noise). Unobtrusive until needed. The 10 principles as a code-review checklist. |
| **Yohji Yamamoto** | *Black, asymmetry, negative space* | Void as the primary color. Off-center compositions. Drape and texture over gloss. Silhouette over ornament. Wabi-sabi imperfection in motion. |
| **Mies van der Rohe** | *Structural clarity & the grid* | "God is in the details." A visible, honest **structural grid** in 3D space. Glass-and-steel materiality. Less is more — the frame *is* the design. |
| **Kith** | *Editorial curation & the drop* | Everything is a curated **drop**. Monochrome lookbook framing. Storytelling over listing. Premium retail pacing — anticipation, arrival, artifact. |

### The Unified Doctrine
> **A weightless black cathedral, built on an honest grid, where music is revealed — never displayed — with the restraint of a Braun dial and the awe of a night sky.** Motion is cinematic and earned. Type is industrial and quoted. Color is void, with light used like a scalpel. Nothing is decorative; everything is structural or revelatory.

---

## 2. Design Language System (the spec agents build against)

### 2.1 Typography
- **Display:** Helvetica Neue / Neue Haas Grotesk, **bold, uppercase, quoted** (`"PULSAR"`), tight tracking. Off-White industrial numbering (`01 / 04`, `EST. 2026`).
- **Body / label:** the same grotesk at low weight; **Space Mono** for machine labels (coordinates, timecodes, "NOW VISUALIZING").
- **Rule:** text is either **structural** (labels a thing) or **kinetic** (a Saul-Bass title event). Never ambient.

### 2.2 Color & Material
- **Void** `#04040A` is 90% of every frame (Yohji black).
- **Light as scalpel:** near-white `#E8E8F4`, used sparingly for focus.
- **Cosmic accents** (single-hue-per-view, never rainbow): nebula violet `#9B5DE5`, ion blue `#00D4FF`, ember `#FFA500`.
- **Materials (Mies honesty):** real glass (transmission + roughness), brushed steel, matte concrete — physically-based, never plastic gloss. No drop-shadow theatrics; light and depth do the work.

### 2.3 Grid & Layout
- A **12-column structural grid** that exists **in 3D** — album objects snap to it, and the grid lines are faintly visible (Mies). Asymmetric weighting (Yohji): large void margins, off-center focal points.

### 2.4 Motion Grammar
- **Easing:** `cubic-bezier(0.22, 1, 0.36, 1)` (authoritative), plus a slow `easeInOutSine` for cosmic drift.
- **Choreography:** *anticipation → reveal → settle*. Nothing pops; everything is dollied, faded, or focus-pulled in.
- **Signature moves:** the **Vertigo focus** (dolly-zoom on select), the **Curtain reveal** (fog/aperture opens), the **Constellation snap** (particles resolve into the grid).
- **Reduced-motion:** all of the above degrade to crossfades; no vestibular triggers.

### 2.5 Sound (optional, tasteful)
- Sub-audible UI feedback ticks (Rams-Braun); off by default, opt-in.

---

## 3. Technical Architecture

### 3.1 Rendering Stack (additive to current app)
- **React Three Fiber** (`@react-three/fiber`) + **three.js** — declarative 3D inside React 19.
- **drei** (`@react-three/drei`) — cameras, loaders, `<Html>`, instancing helpers.
- **postprocessing** (`@react-three/postprocessing`) — **Bloom, Depth-of-Field (Hitchcock), Vignette, Film Grain, Chromatic Aberration** (subtle), N8AO.
- **Custom GLSL shaders** — GPGPU particle systems (visualizer, constellation), fog, grid.
- **WebGPU where available**, WebGL2 fallback (three's WebGPURenderer with automatic fallback).
- **Lenis** for inertial scroll driving camera dolly.

### 3.2 Performance Budget (enforced by the perf harness)
- **≤ 1.5ms JS / frame**, **≤ 8ms GPU / frame** on the reference device (M1 Air / mid RTX laptop).
- **Instanced meshes** for the grid (one draw call for N albums). **GPGPU** particles (positions on a float texture, never per-particle JS).
- **Adaptive quality:** `PerformanceMonitor` (drei) scales DPR, particle count, and postprocessing down before frames drop.
- **Lazy + code-split:** the 3D bundle loads only for the home experience; `/admin` and API stay lean.

### 3.3 Fallback & Integration
- A **capability probe** (WebGL2 support, device memory, `prefers-reduced-motion`, save-data) chooses **`<Experience3D />`** or the current **2D grid**. The 2D path remains the accessible baseline — it never regresses.
- 3D mounts behind a `<Suspense>` with a designed loader (a Saul-Bass title sequence, not a spinner).

---

## 4. The Set-Pieces (what we actually build)

Each is a discrete, shippable module with its own verification gate.

### 4.1 "The Observatory" — Hero
A slow drift through a volumetric starfield; the wordmark **"PULSAR"** assembles from particles (Constellation snap) then the grid materializes below through opening fog (Curtain reveal). Sagan awe + Hitchcock reveal + Bass titles.

### 4.2 "The Hall" — Grid as Architecture
Albums are **objects on a real 3D grid** (Mies), receding into fog with true depth-of-field. Scroll dollies the camera down the hall. Hover **focus-pulls** the album forward; select triggers the **Vertigo** move into the detail view. Asymmetric spacing and vast void margins (Yohji/Kith editorial).

### 4.3 Physical Media in True 3D
Upgrade the current CSS vinyl/cassette/CD/floppy/USB into **real 3D meshes** (glTF or procedural), PBR materials, that rotate with real lighting and cast honest shadows. Format switch = a satisfying mechanical transform. (Rams honesty: the object behaves like the object.)

### 4.4 "The Visualizer 2.0" — GPGPU Shader Particles
Rebuild the current canvas-2D visualizer as **GPU particle systems** (100k–1M points) reacting to the preview's FFT: nebula, album-art **silhouette** (particles sampled to the cover, dispersing on the beat), and an aurora corona — now with bloom, DOF, and volumetric feel. This is the "million dots harmonising" at full fidelity.

### 4.5 Cinematic Transitions
A shared-camera transition system: home → detail → visualizer are **one continuous camera move**, not cuts. Hitchcock's grammar of tension and release throughout.

### 4.6 The Taste Quiz as a Sequence
Reframe the 4-question visual quiz as an **immersive on-rails sequence** — each choice is a 3D vignette you move *through*, ending in a personalized "constellation" of your taste that seeds the grid.

---

## 5. Agent Operating Model

Every set-piece runs the same loop. Agents are cheap; wrong-but-shipped is expensive — so we **verify adversarially** before merge.

```
RESEARCH  →  DESIGN  →  BUILD  →  EXPERIMENT  →  VERIFY  →  (gate) → MERGE
```

- **Research agents** (parallel): survey R3F/shader techniques, reference implementations, and perf patterns for the specific set-piece; produce a short spec + risk list.
- **Design agents:** turn the spec into concrete parameters (counts, easings, materials, shader math) against §2.
- **Build agents** (worktree-isolated): implement the module; one agent per module to avoid file conflicts.
- **Experiment agents:** produce 2–3 variants of the hard creative call (e.g., silhouette dispersion math), captured as screenshots/metrics for a judged pick.
- **Verify agents (adversarial):** independently try to **break** the module against the Quality Bar (§7) — perf, a11y, visual regressions, fallback. Majority-must-pass.

**Workflow shape (per set-piece):**
```
pipeline(
  module,
  research,           // parallel survey → spec
  design,             // spec → parameters
  build,              // implement (worktree)
  experiment,         // N variants
  verify(adversarial) // panel; gate
)
```

---

## 6. Phased Roadmap + Token Budget (~2,000,000)

| Phase | Scope | Verification gate | Token budget |
|---|---|---|---|
| **P0 — Foundations** | Design-system doc lock, capability probe, R3F + postprocessing scaffold, **perf harness & CI budget**, 2D-fallback wiring | Perf harness green; fallback proven on a throttled device | **200k** |
| **P1 — The Observatory** | Hero starfield, particle wordmark, curtain reveal, Bass loader | 60fps; reduced-motion crossfade; a11y title | **250k** |
| **P2 — The Hall** | 3D instanced grid, camera dolly on scroll, focus-pull, Vertigo select | 60fps @ 300 albums; keyboard nav; DOF tasteful | **350k** |
| **P3 — Physical Media 3D** | 5 real media meshes, PBR, mechanical format switch | Correct on all 5; shadow/light honest; no jank | **300k** |
| **P4 — Visualizer 2.0** | GPGPU FFT particles, 3 modes, bloom/DOF | 100k+ particles @ 60fps; audio-reactive verified; no-preview idle | **300k** |
| **P5 — Transitions + Quiz** | Continuous-camera transitions; on-rails taste sequence | One-camera proof; quiz seeds grid; reduced-motion path | **250k** |
| **P6 — Verification & Optimization** | Cross-device sweep, a11y audit, bundle/perf tuning, visual QA | Full Quality Bar pass on device matrix | **200k** |
| **Reserve** | Buffer for re-experiments / hardening | — | **150k** |
| | | **Total** | **~2,000k** |

Each phase merges via **its own PR** for approval before the next begins.

---

## 7. Quality Bar & Verification (the gate)

A module merges only if **all** pass:

1. **Performance** — 60fps sustained on the reference device; adaptive-quality proven under load; no memory growth over 5 min.
2. **Accessibility** — full keyboard path; `prefers-reduced-motion` honored; AA contrast on all text; screen-reader labels; no vestibular triggers.
3. **Fallback** — 2D baseline renders identically-usable on no-WebGL / save-data / low-memory.
4. **Cross-device** — passes on the device matrix (see §8).
5. **Visual QA** — matches the design spec; screenshot diff reviewed; the **"awe test"** (does it make you lean in?) signed off by a human.
6. **Adversarial verify** — a majority of independent verifier agents fail to break it.
7. **Rams checklist** — every added element defended against "is this necessary?"

---

## 8. Risks & Guardrails

- **Perf on mobile** → strict budget + adaptive quality + honest 2D fallback; test on a real mid-tier Android.
- **Scope creep / over-decoration** → the Rams gate; "3% not 300%" — deconstruction is a scalpel.
- **Bundle bloat** → 3D is code-split and route-scoped; measure with every PR.
- **Accessibility regressions** → automated axe pass + manual keyboard run each gate.
- **Motion sickness** → reduced-motion is first-class; no unbidden camera moves.
- **Device matrix:** M1 Air (Safari), mid RTX laptop (Chrome), iPhone 13 (Safari), mid Android (Chrome), + a throttled/no-WebGL profile.

---

## 9. Deliverables & File Structure

```
app/
  (experience)/            # 3D route group, code-split
components/three/
  Experience3D.tsx         # root canvas + capability gate
  Observatory.tsx          # P1 hero
  Hall.tsx                 # P2 grid-as-architecture
  media/                   # P3 3D media meshes
  Visualizer3D.tsx         # P4 GPGPU visualizer
  transitions/             # P5 shared-camera system
  quiz/                    # P5 on-rails sequence
  shaders/                 # .glsl: particles, fog, grid, silhouette
lib/
  capabilities.ts          # WebGL/reduced-motion/save-data probe
  perf-harness.ts          # frame budget instrumentation
docs/
  DESIGN_3D_IMPLEMENTATION_PLAN.md   # this file
  design-system.md         # locked tokens (P0 output)
```

---

## 10. Definition of Done

- The home experience opens in the **Observatory**, flies into **The Hall**, reveals albums as **3D objects on an honest grid**, plays previews through **Visualizer 2.0**, all in **one continuous cinematic language** — and degrades gracefully to today's accessible 2D grid.
- Every set-piece passed its **Quality Bar gate** and shipped via an **approved PR**.
- It feels like **Sagan's cosmos, framed by Hitchcock, labeled by Abloh, disciplined by Rams, draped by Yohji, structured by Mies, and curated by Kith** — and it runs at 60fps.

---

### Immediate next step
On approval of this plan, kick off **P0 (Foundations)** — lock the design-system tokens, stand up the R3F scaffold + capability probe, and build the **perf harness** so every later phase has a hard, measurable gate. Then P1 "The Observatory" as the first visible set-piece.
