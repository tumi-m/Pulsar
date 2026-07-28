# Pulsar — `window` event bus inventory (P0)

The app uses an **informal event bus on `window`** — `CustomEvent`s dispatched and
listened on the global `window` object. There is no `EventBus` helper, no `emit()`
wrapper, no pub-sub module in `lib/`. Every site calls the DOM API directly:

```ts
window.dispatchEvent(new CustomEvent("pulsar-collection-change", { detail }));
window.addEventListener("pulsar-collection-change", handler);
```

This bus is **load-bearing** (it wires the grid, the player, the crate, the selector,
overlays, theme, and settings) and was previously undocumented. This file is the
reference. **16** distinct custom event names are in use (the plan estimated ~12).

Conventions:
- All custom event names are prefixed `pulsar-`.
- All listeners are registered on `window` and cleaned up in the effect's return
  (except where noted as dead below).
- `detail` payloads are untyped (`CustomEvent` without a generic) — a future phase may
  want typed events.

---

## Inventory (grouped by event name)

| # | Event | Dispatchers | Listeners | Listener count |
|---:|---|---|---|---:|
| 1 | `pulsar-collection-change` | `lib/collection.ts:40`, `lib/collection.ts:91` | `ReleaseCard.tsx:48`, `FloatingDock.tsx:117`, `Sidebar.tsx:45`, `ReleaseGrid.tsx:244`, `player/NowPlayingBar.tsx:27`, `AiChat.tsx:405` | 6 |
| 2 | `pulsar-detail-open` | `ReleaseGrid.tsx:207` | `Visualizer.tsx:45`, `Navbar.tsx:23`, `FloatingDock.tsx:120`, `HeroSection.tsx:24` | 4 |
| 3 | `pulsar-crate-picker` | `ReleaseCard.tsx:241`, `AiChat.tsx:410`, `player/NowPlayingBar.tsx:92` | `CratePicker.tsx:32` | 1 |
| 4 | `pulsar-open-crate` | `Navbar.tsx:98`, `Sidebar.tsx:53` | `FloatingDock.tsx:118` | 1 |
| 5 | `pulsar-ai-activate` | `Navbar.tsx:86`, `FloatingDock.tsx:291` | `AiChat.tsx:116` | 1 |
| 6 | `pulsar-retake-quiz` | `AiChat.tsx:123`, `Sidebar.tsx:251` | `ReleaseGrid.tsx:247` | 1 |
| 7 | `pulsar-theme-change` | `lib/theme.ts:92` | `ThemedBackground.tsx:19` | 1 |
| 8 | `pulsar-type-change` | `lib/settings.ts:39` | `ReleaseGrid.tsx:246` | 1 |
| 9 | `pulsar-format-change` | `Sidebar.tsx:139` | `ReleaseGrid.tsx:245` | 1 |
| 10 | `pulsar-toggle-sidebar` | `ReleaseGrid.tsx:444` | `Sidebar.tsx:44` | 1 |
| 11 | `pulsar-crate-open` | `FloatingDock.tsx:47` | `Navbar.tsx:24` | 1 |
| 12 | `pulsar-nav-hidden` | `Navbar.tsx:34` | `FloatingDock.tsx:119` | 1 |
| 13 | `pulsar-ai-mode-change` | `lib/settings.ts:22` | — | 0 |
| 14 | `pulsar-visualizing` | `ReleaseGrid.tsx:212` | — | 0 |
| 15 | `pulsar-close-detail` | — | `ReleaseGrid.tsx:242` | 1 |
| 16 | `pulsar-search` | — | `ReleaseGrid.tsx:243` | 1 |

Totals: **16** event names, **21** dispatch sites (4 in `lib/`, 17 in `components/`),
**22** listener registrations.

---

## Orphans / dead wiring

- **Dispatched but never listened (2):**
  - `pulsar-ai-mode-change` — `lib/settings.ts:22`. The setting changes but nothing
    reacts. Either wire a listener or remove the dispatch.
  - `pulsar-visualizing` — `components/ReleaseGrid.tsx:212`. Appears to be a leftover
    signal that no component consumes.
- **Listened but never dispatched (2):**
  - `pulsar-close-detail` — `components/ReleaseGrid.tsx:242` (cleanup at `:254`).
    Dead listener; the detail overlay is closed by other means.
  - `pulsar-search` — `components/ReleaseGrid.tsx:243` (cleanup at `:253`). Dead
    listener; search is now handled differently (P4 will rebuild search server-side).

A cleanup pass could remove all four, but they are harmless. Logged here so a later
phase can decide.

---

## Note on the "60+ duplicate listeners" claim (P2 item #4)

The improvement plan (P2, item 4) states that each `ReleaseCard` subscribes to
`pulsar-collection-change`, producing 60+ duplicate listeners. **Static analysis does
not support this**: there are exactly 6 subscribers to `pulsar-collection-change`, each
registering one listener with proper `removeEventListener` cleanup. `ReleaseCard` is one
of the six, not many.

If 60+ duplicates are observed at runtime, the likely cause is **component remounts**
re-running effects (HMR, or list re-renders that unmount/remount cards), not multiple
static subscriptions per component. **P2 should verify with a runtime listener count
before refactoring** — see `docs/FINDINGS.md`. The lift-to-a-shared-store refactor is
still a good idea (single source of truth, fewer localStorage re-reads) but the
"60+" justification should be confirmed, not assumed.

---

## Standard DOM events (excluded from the bus inventory)

These `window`/`document` listeners are standard browser events, not app custom events,
and are intentionally not part of the bus: `resize` (`ParticleField.tsx:47`,
`ReleaseGrid.tsx:94`), `mousemove` (`ParticleField.tsx:66`), `pointermove`/`pointerup`
(`Visualizer.tsx:39`/`40`), `scroll` (`ReleaseGrid.tsx:193`), `keydown`
(`ReleaseDetail.tsx:282`, `ReleaseModal.tsx:85`), plus `document` and `<audio>` element
listeners in `player/PlayerProvider.tsx` and `WmpVisual.tsx`.