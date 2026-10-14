"use client";

import { useSyncExternalStore } from "react";
import type { Howl } from "howler";

/**
 * Interface sounds — a tape-deck click for the player's transport keys (and to
 * confirm the setting), a thunk when a record lands in a crate, and a chime or
 * buzz when an export finishes. The Sidebar switch's copy promises exactly
 * these; a new sound for a new place should update it too.
 *
 * Opt-in and off by default. Callers fire and forget: `playSfx` must never
 * throw, never create an AudioContext while sounds are off, and never block.
 *
 * Howler is the only heavy part, so it is not imported until sounds are on:
 * on the toggle's click, or on the first sound after a reload. A visitor who
 * never opts in never downloads it and never gets an AudioContext. Turning
 * sounds off unloads every sound and closes the context again.
 *
 * Why this cannot disturb music playback: previews play through PlayerProvider's
 * plain <audio> element, which is deliberately NOT routed through Web Audio on
 * touch devices (see LevelMeter — a suspended AudioContext silenced mobile
 * playback). Here Howler runs with html5: false, so every sound is a decoded
 * buffer on this module's OWN AudioContext. It never calls
 * createMediaElementSource and never sees that element, so if the context is
 * suspended, interrupted or closed, the only thing that goes quiet is these
 * clicks.
 *
 * Why the context is opened here and not by Howler: almost nothing plays inside
 * the tap that caused it. The drop waits for the flight to land, the chimes
 * wait for the export, the confirmation waits for its file to decode. WebKit
 * only starts an AudioContext from inside a gesture: one created outside a
 * gesture stays suspended, and resume() outside one waits for the next tap.
 * Howler would open its context after its chunk downloads, outside the click,
 * so on an iPhone nothing would ever sound. Instead the context is created and
 * resumed synchronously in the toggle's click, then handed to Howler. While
 * sounds are on, a capture-phase listener also resumes it on every click and
 * key, so a sound deferred from that tap finds it awake. This covers the first
 * tap after a reload, an iOS interruption, and a context that has gone idle.
 * Howler's own auto-unlock stays off: on any context that isn't 44.1 kHz,
 * which means most phones, it unloads every sound and reopens the context
 * outside the gesture. It also fills a pool of spare <audio> elements.
 *
 * The files are built by scripts/motion/build-sfx.mjs (npm run motion:sfx).
 */

export type SfxName = "key" | "drop" | "success" | "error";

const KEY = "pulsar_sfx_v1";
/** Same-tab change signal (`storage` only fires in OTHER tabs). Dispatched and
 *  heard only in this module, so it isn't on the typed bus in lib/events.ts. */
const CHANGE = "pulsar-sfx-change";
const NAMES: readonly SfxName[] = ["key", "drop", "success", "error"];
/** The files already peak at -3 dBFS; this puts them well under the music. */
const VOLUME = 0.35;
/** A double-fired handler or a held key shouldn't machine-gun a sound. */
const THROTTLE_MS = 60;
/** How long a resume may take and still count as "now" — see `fire`. */
const RESUME_GRACE_MS = 150;
/** The enable confirmation is dropped if decoding takes longer than this. */
const CONFIRM_WINDOW_MS = 1500;
/** Howler's own idle rule: with nothing to play, suspend the context and let
 *  the audio hardware go. Here a tap counts as activity too (see `onGesture`). */
const IDLE_MS = 30_000;
/** Every control that can lead to a sound is a button, so a press of one
 *  arrives as a click, which is a gesture in every engine. keydown covers Enter
 *  submitting the new-crate form, which never clicks. Capture phase, as in
 *  PlayerProvider: a stopPropagation() lower down can't hide it. */
const GESTURES = ["click", "keydown"] as const;
const LISTEN = { capture: true } as const;

type HowlerModule = typeof import("howler");
type Bank = Record<SfxName, Howl>;

let howler: HowlerModule | null = null;
let bank: Bank | null = null;
let loading: Promise<Bank | null> | null = null;
/** Bumped by unload so a load that was in flight when sounds went off is discarded. */
let generation = 0;
let confirmUntil = 0;
const lastPlayed: Partial<Record<SfxName, number>> = {};
/** This page's context and the master gain Howler routes every sound into. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

/* ── the setting ─────────────────────────────────────────────────── */

/** Used when storage is unavailable (blocked site data, some private modes):
 *  the toggle still works for the visit, it just isn't remembered. */
let sessionValue = false;
let storageUsable = true;

export function sfxEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (storageUsable) {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      storageUsable = false;
    }
  }
  return sessionValue;
}

export function setSfxEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  const was = sfxEnabled();
  sessionValue = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    storageUsable = false;
  }
  window.dispatchEvent(new Event(CHANGE));
  if (!on) return unload();
  // Turning sounds on is its own confirmation: the key click plays as soon as
  // it has decoded, which is the only honest proof the setting works.
  if (!was) confirmUntil = performance.now() + CONFIRM_WINDOW_MS;
  // Still inside the toggle's click: load() opens and starts the AudioContext
  // before it awaits anything, which is the whole point of calling it here.
  void load();
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange();
  };
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** React binding for a settings toggle: [enabled, setEnabled]. */
export function useSfxEnabled(): [boolean, (on: boolean) => void] {
  // The server snapshot is "off", so hydration always matches and a stored
  // "on" arrives on the first client pass.
  const on = useSyncExternalStore(subscribe, sfxEnabled, () => false);
  return [on, setSfxEnabled];
}

/* ── playback ────────────────────────────────────────────────────── */

export function playSfx(name: SfxName): void {
  try {
    if (typeof document === "undefined" || document.hidden) return;
    if (!sfxEnabled()) return;
    if (!bank) {
      // On since an earlier visit (or another tab) but not loaded in this
      // page: start loading now. The sound itself is dropped rather than
      // queued, because late feedback is worse than none. If the visitor
      // hasn't touched the page yet (a sound on mount after a redirect), wait:
      // no browser would let that context start.
      if (navigator.userActivation?.hasBeenActive !== false) void load();
      return;
    }
    const now = performance.now();
    if (now - (lastPlayed[name] ?? -Infinity) < THROTTLE_MS) return;
    lastPlayed[name] = now;
    fire(name);
  } catch {
    /* A sound is decoration; it must never break the click that asked for it. */
  }
}

function fire(name: SfxName) {
  const howl = bank?.[name];
  // Not decoded yet: drop it. Howler would queue the play and fire it
  // whenever the file arrived, long after the moment it belonged to.
  if (!howl || howl.state() !== "loaded") return;
  // Howler swaps a Howl to an HTML5 <audio> element when its download errors.
  // A second media element is what the player must never have to share the
  // audio session with, so such a Howl stays silent.
  if ((howl as unknown as { _webAudio?: boolean })._webAudio === false) return;
  const c = ctx;
  if (!c || c.state === "closed") return;
  restartIdle();
  if (c.state !== "running") {
    // Idle, or opened after a reload and no tap has started it yet. This
    // resume is outside any gesture. That is fine once the context has run,
    // but before that WebKit holds it until the next tap, and a click
    // arriving then would be about nothing. So: play only if it resumed
    // promptly.
    const asked = performance.now();
    c.resume().then(
      () => {
        if (performance.now() - asked < RESUME_GRACE_MS && bank?.[name] === howl) howl.play();
      },
      () => {}
    );
    return;
  }
  howl.play();
}

/* ── the AudioContext ────────────────────────────────────────────── */

/** Synchronous on purpose: called from a click, the context is created and
 *  resumed inside that gesture, the only place WebKit will start one. */
function openContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const c = new Ctor();
    // What Howler builds for a context of its own; it routes every sound here.
    const gain = c.createGain();
    gain.connect(c.destination);
    ctx = c;
    master = gain;
  } catch {
    return null;
  }
  for (const type of GESTURES) document.addEventListener(type, onGesture, LISTEN);
  window.addEventListener("storage", onStorage);
  onGesture();
  return ctx;
}

function onGesture() {
  const c = ctx;
  if (!c) return;
  try {
    // Suspended (opened outside a gesture, or idle) or, on iOS, interrupted.
    // Done on every tap, not only the ones that will sound: a crate add plays
    // its drop 620 ms later, and here it looks like any other click.
    if (c.state !== "running" && c.state !== "closed") void c.resume().catch(() => {});
  } catch {
    /* old WebKit without a promise-returning resume: nothing to be done */
  }
  // While someone is tapping, the context stays up, so a deferred sound
  // never waits on the audio hardware. It goes idle once they stop.
  restartIdle();
}

function restartIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (ctx?.state === "running") void ctx.suspend().catch(() => {});
  }, IDLE_MS);
}

/* ── loading and unloading Howler ────────────────────────────────── */

function load(): Promise<Bank | null> {
  if (bank) return Promise.resolve(bank);
  if (loading) return loading;
  // The context comes first and synchronously, while this may still be the
  // click that turned sounds on. Without Web Audio nothing here could play (a
  // Howl on an HTML5 <audio> fallback never plays, see fire), so Howler isn't
  // fetched at all.
  if (!openContext()) return Promise.resolve(null);
  const gen = generation;
  loading = import("howler").then(
    (mod) => {
      // Superseded by an unload, which has already reset `loading`.
      if (gen !== generation || !ctx || !master) return null;
      // Turned off in another tab mid-download.
      if (!sfxEnabled()) {
        unload();
        return null;
      }
      howler = mod;
      const { Howler } = mod;
      Howler.autoUnlock = false;
      // restartIdle decides when the context goes idle, counting taps as well
      // as sounds. Howler's own timer counts only sounds, so it would suspend
      // the context while someone is still tapping.
      Howler.autoSuspend = false;
      // A Howl opens a context only when Howler has none, so ours is used.
      // Howler's state machine catches up on the first play(): its resume of
      // a context that is already running resolves at once.
      Howler.ctx = ctx;
      Howler.masterGain = master;
      const next = {} as Bank;
      bank = next;
      for (const name of NAMES) next[name] = makeHowl(mod, name, false);
      return next;
    },
    () => {
      // Chunk failed (offline, deploy in progress): try again on the next
      // sound. The context stays open and goes idle as usual, because it was
      // started inside the gesture, which a retry outside one couldn't do.
      loading = null;
      return null;
    }
  );
  return loading;
}

function makeHowl({ Howl }: HowlerModule, name: SfxName, mp3Only: boolean): Howl {
  const howl: Howl = new Howl({
    src: mp3Only ? [`/sfx/${name}.mp3`] : [`/sfx/${name}.webm`, `/sfx/${name}.mp3`],
    html5: false,
    volume: VOLUME,
    preload: true,
    onload: () => {
      if (name === "key" && performance.now() < confirmUntil) {
        confirmUntil = 0;
        playSfx("key");
      }
    },
    onloaderror: () => {
      // Howler picks WebM from a *Vorbis* capability check, so a browser that
      // says yes but can't decode Opus lands here. Retry once as mp3, which
      // every browser decodes.
      if (mp3Only || !bank || !howler || bank[name] !== howl) return;
      howl.unload();
      bank[name] = makeHowl(howler, name, true);
    },
  });
  return howl;
}

function onStorage(e: StorageEvent) {
  // Turned off in another tab: this tab's context goes too.
  if ((e.key === KEY || e.key === null) && !sfxEnabled()) unload();
}

function unload() {
  generation++;
  const current = bank;
  const c = ctx;
  bank = null;
  loading = null;
  ctx = null;
  master = null;
  confirmUntil = 0;
  clearTimeout(idleTimer);
  for (const type of GESTURES) document.removeEventListener(type, onGesture, LISTEN);
  window.removeEventListener("storage", onStorage);
  try {
    if (current) for (const name of NAMES) current[name].unload();
    // Not Howler.unload(): that closes the context and immediately opens a
    // new one, and "off" means no AudioContext at all. The closed context is
    // left on Howler rather than nulled because a download still in flight
    // decodes through Howler.ctx when it lands; on a closed context that fails
    // quietly into the onloaderror above, where null would throw. The next
    // "on" hands Howler a fresh one.
    void c?.close().catch(() => {});
  } catch {
    /* already gone */
  }
}
