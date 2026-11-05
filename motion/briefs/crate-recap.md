# Brief: Crate Recap

<!-- The brief the shipped CrateRecap composition was built against — kept as
     a worked example of motion/briefs/TEMPLATE.md. -->

## Deliverable
Video (Remotion composition `CrateRecap`, `remotion/`).

## Where it appears
Crate panel → **Video**: previewed with `@remotion/player`, downloaded as
MP4/WebM rendered on the listener's device (`@remotion/web-renderer`, encoded
by Mediabunny). Also rendered from the CLI with `npm run motion:render` for
promo use. Meant for Stories/Reels/TikTok on a phone.

## Format
1080×1920, 30 fps. ~2 s intro + ~1.6 s per record (max 12) + ~2 s outro, so
5.6–23.2 s (1–12 records; a bigger crate is capped at 12). Soundtrack:
`public/sfx/recap-bed.mp3` (80 BPM, 24 s, seamless loop), optional.

## Feeling
Warm, tactile, a little nostalgic — dubbing a mixtape for a friend. Reference:
the J-card cassettes in the app.

## Beats
- 0–2 s — the crate's own J-card: name and record count.
- per record — a cassette deals in, its J-card label reads title / artist /
  year, reels turn, the deck counter ticks.
- last 2 s — the whole crate in a row, "Made with Pulsar".

## Constraints
- Frame-driven only (no CSS animation, no `Date.now()`).
- Titles of any length: fitted to the card, never cut without an ellipsis.
- Missing or cross-origin artwork: same-origin proxy, then a generated
  cassette cover — a browser render must never taint its canvas.
- Not uploaded anywhere; the in-app render stays on the device.

## Done when
- [x] `npm run motion:review` passes: H.264, 1080×1920, 30 fps, duration
      within a frame, AAC present, no blank frames.
- [x] Contact sheet reads well at thumbnail size.
- [x] Browser export works where WebCodecs can encode (WebM fallback where
      H.264 can't), with progress and cancel.
- [x] The preview doesn't autoplay under reduced motion.
