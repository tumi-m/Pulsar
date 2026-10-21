# public/licenses — third-party notices for code in the app bundle

The other notices in `public/` sit next to the files they cover (`rive/`,
`lottie/`, `explainers/`). This one covers third-party code that ships inside
the app's JavaScript chunks (`/_next/static/chunks/…`) instead, so it has no
file in `public/` to sit beside. `test/encoder-notices.test.ts` fails if the
installed packages, or the library versions compiled into them, drift from
what this file records.

## The audio encoders under the Crate Recap exporter

The crate panel's **Video** sheet renders the Crate Recap on the listener's
device with `@remotion/web-renderer` (`components/CrateVideoSheet.tsx`). When
the browser's WebCodecs can't encode an audio codec the render needs, the
renderer registers a WebAssembly encoder from one of three Mediabunny extension
packages. Each one is a separate chunk that is loaded by dynamic import only
then, but `next build` emits all three, so every deployment serves them.

| Package (MPL-2.0, unmodified) | Library compiled into its wasm | Library licence |
|---|---|---|
| `@mediabunny/aac-encoder@1.61.3` | FFmpeg's AAC encoder: libavcodec and libavutil, reporting `Lavc62.23.103` | LGPL-2.1-or-later |
| `@mediabunny/mp3-encoder@1.61.3` | LAME 3.100 (libmp3lame, built with `--disable-decoder`) | LGPL-2.0-or-later |
| `@mediabunny/flac-encoder@1.61.3` | libFLAC, reporting `git-3f1ecff8 20260304` | BSD-3-Clause |

The packages themselves are Mediabunny's, MPL-2.0, from
https://github.com/Vanilagy/mediabunny (`packages/aac-encoder`,
`packages/mp3-encoder`, `packages/flac-encoder`). Each npm tarball contains the
C bridge it compiles against the library (`src/bridge.c` or
`src/lame-bridge.c`). Its README has the exact configure and `emcc` steps.

### FFmpeg: AAC encoder

This software uses code of [FFmpeg](https://ffmpeg.org), licensed under the
GNU Lesser General Public License version 2.1 or later. The full text is
[`LGPL-2.1.txt`](./LGPL-2.1.txt), next to this file. Copyright (c) the FFmpeg
developers.

- **Build:** configured with `--disable-everything --enable-avcodec
  --enable-encoder=aac` and without `--enable-gpl` or `--enable-nonfree`, so
  no GPL or non-free part of FFmpeg is included.
- **Source:** https://github.com/FFmpeg/FFmpeg (also https://ffmpeg.org/download.html).
  The binary reports libavcodec 62.23.103. Mediabunny's build steps clone
  FFmpeg without pinning a commit, so that version string is the closest
  identifier available.

### LAME: MP3 encoder

This software uses [LAME](https://lame.sourceforge.io/) ("LAME Ain't an MP3
Encoder"), copyright The LAME Project and its contributors (see the source file
headers). LAME is licensed under the GNU Library General Public License
version 2 or, at your option, any later version. It is redistributed here under
version 2.1 of that licence, [`LGPL-2.1.txt`](./LGPL-2.1.txt). LAME asks that
programs using it say so and link to its website, which this section does.

- **Build:** LAME 3.100, configured with `--disable-decoder --disable-frontend`,
  so neither the mpglib decoder nor the command-line frontend is included.
  Not modified.
- **Source:** https://sourceforge.net/projects/lame/files/lame/3.100/

### libFLAC: FLAC encoder

[libFLAC](https://xiph.org/flac/), source https://github.com/xiph/flac (the
binary reports `git-3f1ecff8`). Licence from `COPYING.Xiph` at that commit:

> Copyright (C) 2000-2009  Josh Coalson
> Copyright (C) 2011-2025  Xiph.Org Foundation
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions
> are met:
>
> - Redistributions of source code must retain the above copyright
> notice, this list of conditions and the following disclaimer.
>
> - Redistributions in binary form must reproduce the above copyright
> notice, this list of conditions and the following disclaimer in the
> documentation and/or other materials provided with the distribution.
>
> - Neither the name of the Xiph.Org Foundation nor the names of its
> contributors may be used to endorse or promote products derived from
> this software without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
> ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
> LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
> A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE FOUNDATION OR
> CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
> EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
> PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
> PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
> LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
> NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
> SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

### Using your own build of an LGPL library

Pulsar does not modify these packages or merge them into its own modules.
Each encoder stays a separate chunk built from the package as published. To
run the exporter with a modified FFmpeg or LAME, rebuild the extension from its
source with your library, following the steps in its README. Then install it in
place of the published version and run `next build`.
