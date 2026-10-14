"use client";

/**
 * Interface sounds — the contract.
 *
 * Opt-in and off by default. Callers fire and forget: `playSfx` must never
 * throw, never create an AudioContext while sounds are off, and never block.
 *
 * (Stub: the implementation lands with the sound layer.)
 */

export type SfxName = "key" | "drop" | "success" | "error";

export function playSfx(_name: SfxName): void {
  /* no-op until the sound layer is implemented */
}

export function sfxEnabled(): boolean {
  return false;
}

export function setSfxEnabled(_on: boolean): void {
  /* no-op until the sound layer is implemented */
}

/** React binding for a settings toggle: [enabled, setEnabled]. */
export function useSfxEnabled(): [boolean, (on: boolean) => void] {
  return [false, setSfxEnabled];
}
