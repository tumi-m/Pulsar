/**
 * Pulsar — Physical Media Format
 *
 * The user chooses how music is displayed: each release renders as a
 * physical object — vinyl in a sleeve, cassette, CD case, floppy disk,
 * or USB flash drive — with the album art as its label. Persisted to
 * localStorage; selectable from the top of the home page / settings.
 */

export type MediaFormat = "vinyl" | "cassette" | "cd" | "floppy" | "usb";

export interface FormatMeta {
  id: MediaFormat;
  label: string;
  glyph: string; // small emoji-ish marker for the picker
  blurb: string;
}

export const FORMATS: FormatMeta[] = [
  { id: "vinyl", label: "Vinyl", glyph: "⬤", blurb: "Record in a sleeve" },
  { id: "cassette", label: "Cassette", glyph: "▭", blurb: "Tape with J-card" },
  { id: "cd", label: "CD", glyph: "◎", blurb: "Jewel case, Yeezy-bright" },
  { id: "floppy", label: "Floppy", glyph: "▢", blurb: "3.5\" disk, art sticker" },
  { id: "usb", label: "USB", glyph: "⬒", blurb: "Flash drive + art tag" },
];

const KEY = "pulsar_format_v1";

export function loadFormat(): MediaFormat {
  try {
    const v = localStorage.getItem(KEY) as MediaFormat | null;
    if (v && FORMATS.some((f) => f.id === v)) return v;
  } catch {
    /* noop */
  }
  return "vinyl";
}

export function saveFormat(f: MediaFormat): void {
  try {
    localStorage.setItem(KEY, f);
  } catch {
    /* noop */
  }
}
