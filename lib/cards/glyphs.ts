import { inflateSync } from "node:zlib";

/**
 * Which characters the card fonts can actually draw — server only.
 *
 * Satori decides a font per grapheme by its FIRST character alone, so a
 * cluster that starts with something covered sails through even when the rest
 * of it isn't: a keycap (1 + U+FE0F + U+20E3) or an underlined e (e + U+0332)
 * comes out as Inter's "NO GLYPH" box after the digit or letter. Reading each
 * face's cmap — the table Satori's own lookup consults — answers the question
 * for every character, before anything is drawn.
 *
 * Just enough of the format for that: WOFF (what fonts.ts loads) and plain
 * TrueType/OpenType, cmap formats 4 and 12, chosen the way opentype.js
 * (Satori's parser) chooses them.
 */

const WOFF = 0x774f4646; // "wOFF"
const WOFF2 = 0x774f4632; // "wOF2"
const SFNT = new Set([0x00010000, 0x4f54544f /* OTTO */, 0x74727565 /* true */]);

/** A font file's tables by tag, decompressed. */
export function fontTables(data: Uint8Array): Map<string, Buffer> {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const sig = buf.readUInt32BE(0);
  const tables = new Map<string, Buffer>();
  if (sig === WOFF) {
    const count = buf.readUInt16BE(12);
    for (let i = 0; i < count; i++) {
      const at = 44 + i * 20;
      const offset = buf.readUInt32BE(at + 4);
      const stored = buf.readUInt32BE(at + 8);
      const raw = buf.subarray(offset, offset + stored);
      // WOFF stores a table uncompressed when deflate wouldn't shrink it.
      tables.set(buf.toString("latin1", at, at + 4), stored < buf.readUInt32BE(at + 12) ? inflateSync(raw) : raw);
    }
  } else if (SFNT.has(sig)) {
    const count = buf.readUInt16BE(4);
    for (let i = 0; i < count; i++) {
      const at = 12 + i * 16;
      const offset = buf.readUInt32BE(at + 8);
      tables.set(buf.toString("latin1", at, at + 4), buf.subarray(offset, offset + buf.readUInt32BE(at + 12)));
    }
  } else {
    // Loud, not empty: an unreadable face would otherwise mark every
    // character undrawable and every card would come out as dashes.
    throw new Error(sig === WOFF2 ? "Card fonts must be WOFF, not WOFF2" : "Unrecognised font format");
  }
  return tables;
}

/** Every code point a font maps to a real glyph (not glyph 0, .notdef). */
export function fontCodePoints(data: Uint8Array): Set<number> {
  const cmap = fontTables(data).get("cmap");
  if (!cmap) throw new Error("Font has no cmap table");

  // opentype.js takes the LAST Unicode subtable it finds; match it, so this
  // agrees with Satori about any font where the subtables disagree.
  let sub = -1;
  for (let i = cmap.readUInt16BE(2) - 1; i >= 0 && sub < 0; i--) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const encoding = cmap.readUInt16BE(6 + i * 8);
    if ((platform === 3 && (encoding === 0 || encoding === 1 || encoding === 10)) || (platform === 0 && encoding <= 4)) {
      sub = cmap.readUInt32BE(8 + i * 8);
    }
  }
  if (sub < 0) throw new Error("Font has no Unicode cmap");

  const points = new Set<number>();
  const format = cmap.readUInt16BE(sub);
  if (format === 4) {
    const segX2 = cmap.readUInt16BE(sub + 6);
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const rangeOffsets = deltas + segX2;
    for (let s = 0; s < segX2; s += 2) {
      const start = cmap.readUInt16BE(starts + s);
      const end = cmap.readUInt16BE(ends + s);
      const delta = cmap.readInt16BE(deltas + s);
      const rangeOffset = cmap.readUInt16BE(rangeOffsets + s);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let glyph: number;
        if (rangeOffset === 0) {
          glyph = (c + delta) & 0xffff;
        } else {
          // idRangeOffset counts from its own slot into glyphIdArray, and a 0
          // there is "no glyph" before idDelta is applied.
          const raw = cmap.readUInt16BE(rangeOffsets + s + rangeOffset + (c - start) * 2);
          glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
        }
        if (glyph !== 0) points.add(c);
      }
    }
  } else if (format === 12) {
    const groups = cmap.readUInt32BE(sub + 12);
    for (let g = 0; g < groups; g++) {
      const at = sub + 16 + g * 12;
      const start = cmap.readUInt32BE(at);
      const end = cmap.readUInt32BE(at + 4);
      const glyph = cmap.readUInt32BE(at + 8);
      for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) points.add(c);
    }
  } else {
    throw new Error(`Unsupported cmap format ${format}`);
  }
  return points;
}
