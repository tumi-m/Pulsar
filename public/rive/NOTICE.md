# public/rive — third-party notices

Used by `components/RiveDeck.tsx` (the LCD in the now-playing bar).

## digital_music_player.riv

- **What:** Rive's "digital music player" example. One artboard (`V2`, 500×500)
  and one state machine (`State Machine 1`) with the inputs `isPlaying`
  (boolean), `trackProgress` (number, 0–100), `volume` (number),
  `nextTrackTrig` / `prevTrackTrig` (triggers) and `knob 1–4 drag` (booleans),
  plus the text runs `track`, `trackDummy`, `artist`, `timeStart`, `timeEnd`.
  Pulsar shows only the LCD glass and drives `isPlaying`, `trackProgress`,
  `track`/`trackDummy` and `artist`. It blanks `timeStart`/`timeEnd`.
- **Source:** https://github.com/rive-app/rive-wasm,
  `js/examples/_frameworks/spotify-player-app/static/digital_music_player.riv`
  at commit `ff04f05c1a0e742cb1e1705dd9313f854594ef15` (2026-10-14).
- **SHA-256:** `c75414cd36e992c6013c003701a00286287e60aca309570a6a1746cb2d773d78`
  (byte-identical to the upstream file; not modified).
- **Licence:** MIT, from the repository's root `LICENSE`. The example directory
  has no licence of its own.

  > MIT License
  >
  > Copyright (c) 2020-2021 Rive
  >
  > Permission is hereby granted, free of charge, to any person obtaining a copy
  > of this software and associated documentation files (the "Software"), to deal
  > in the Software without restriction, including without limitation the rights
  > to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  > copies of the Software, and to permit persons to whom the Software is
  > furnished to do so, subject to the following conditions:
  >
  > The above copyright notice and this permission notice shall be included in all
  > copies or substantial portions of the Software.
  >
  > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  > IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  > FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  > AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  > LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  > OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  > SOFTWARE.

### Embedded font: Digital Numbers

The .riv embeds a copy of the segment font **Digital Numbers**, probably subset by
Rive's exporter. Its own `name` table reads "Copyright (c) 2015, Stephan Ahlf
(https://github.com/s-a/digital-numbers-font)" and "This Font Software is
licensed under the SIL Open Font License, Version 1.1". The upstream licence
declares no Reserved Font Name. The full licence text ships next to this file
as `OFL-DigitalNumbers.txt`, copied from
https://github.com/s-a/digital-numbers-font (`OFL.txt` at commit
`6c52a4a7c0ccb60ee0834ea680fe890224fc3a58`).

## rive-2.44.0.wasm

- **What:** the WebAssembly renderer of the `@rive-app/canvas` runtime, which
  `@rive-app/react-canvas` uses. It is byte-identical to
  `node_modules/@rive-app/canvas/rive.wasm` at version 2.44.0, and
  `test/rive-deck.test.ts` fails if the two drift apart.
- **Why it is copied here:** by default the runtime fetches this file from
  unpkg, then jsDelivr. A decoration should not depend on a third-party CDN, and
  that fetch fails behind a strict network. The version is in the filename, so a
  runtime upgrade cannot pair new JavaScript with a cached old binary.
- **On a Rive upgrade:** copy the new `rive.wasm` here under the new version
  and update `RIVE_WASM` in `components/RiveDeck.tsx`. The test says when this
  is needed.
- **Licence:** MIT. Copyright (c) Rive. Package: https://www.npmjs.com/package/@rive-app/canvas,
  source: https://github.com/rive-app/rive-wasm.
