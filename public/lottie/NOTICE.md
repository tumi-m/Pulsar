# public/lottie — third-party notices

Written by `npm run motion:lottie` (scripts/motion/build-lottie.ts), which
also writes `tape-loader.json` (Pulsar's own, generated in code) and copies
the file below. `test/lottie.test.ts` fails if the copy or this notice drifts
from the installed package.

Used by `components/TapeLoader.tsx` (the cassette loader in the Selector).

## dotlottie-player.wasm

- **What:** the WebAssembly renderer of `@lottiefiles/dotlottie-web` 0.81.0, which
  `@lottiefiles/dotlottie-react` loads. Byte-identical to
  `node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm`; not modified.
- **SHA-256:** `92822207905406eee4f0785e8d4a99a504a24db6f658abfaec074a9420471b25`
- **Why it is copied here:** by default the runtime fetches this file from
  jsDelivr. A loader that waits on a third-party CDN shows nothing exactly when
  the network is slow or blocked.
- **Source:** https://github.com/LottieFiles/dotlottie-web (`packages/web`),
  package https://www.npmjs.com/package/@lottiefiles/dotlottie-web.
- **Licence:** MIT, from the package's `LICENSE`:

  > MIT License
  >
  > Copyright (c) 2023 LottieFiles.com
  >
  > Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
  > documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
  > rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
  > persons to whom the Software is furnished to do so, subject to the following conditions:
  >
  > The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
  > Software.
  >
  > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
  > WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
  > COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
  > OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
