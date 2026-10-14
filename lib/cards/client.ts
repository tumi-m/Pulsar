import { getCrates, getFavorites } from "@/lib/collection";
import { CARD_LIMITS, cardFilename, clip } from "./text";

/**
 * Pulsar — the crate share card, browser side.
 *
 * Loaded with import() from the Share card key, so none of this (nor the
 * request/raster/share plumbing) is in the home route's first load.
 *
 * The server draws an SVG; the share sheet and every social app want a PNG.
 * Rasterising here costs one canvas and keeps a rasteriser (resvg ships as a
 * multi-megabyte native or wasm binary) out of the serverless function.
 */

export interface CardSourceRecord {
  title: string;
  artist: string;
  clean_title?: string;
}

const CARD_W = 1080;
const CARD_H = 1350;

/** What FloatingDock calls the favourites list when it opens the export sheet. */
const FAVORITES_NAME = "PULSAR Favorites";
/** And a crate it couldn't name. */
const FALLBACK_NAME = "PULSAR Crate";

/**
 * A failure the sheet can explain in a sentence. Recognised by `name`, not
 * instanceof: the sheet catches it across a dynamic-import boundary.
 */
export class CardError extends Error {
  override name = "CardError";
}

/** What the card would show of a list: the records it draws, and how many there are. */
const cardKey = (list: readonly CardSourceRecord[]) =>
  JSON.stringify([
    list.length,
    list.slice(0, CARD_LIMITS.records).map((r) => [r.clean_title || r.title, r.artist]),
  ]);

/**
 * The records behind the export sheet, read back from storage — the fallback
 * for when ExportSheet isn't handed its `records`.
 *
 * All the sheet knows then is a name and a count, and names repeat: the dock
 * names a new crate "Crate N" from the crate count, so deleting one and adding
 * one gives two "Crate 3"s. Favourites go by their fixed name, a crate by its
 * name, and among same-named crates the one with that many records. If that
 * still leaves crates whose cards would differ, it throws rather than share
 * a crate the listener didn't pick.
 */
export function crateRecordsFromStorage(name: string, count: number): CardSourceRecord[] | null {
  const crates = getCrates();
  const candidates = new Set<CardSourceRecord[]>();
  if (name === FAVORITES_NAME) candidates.add(getFavorites());
  for (const c of crates) if (c.name === name) candidates.add(c.releases);
  if (name === FALLBACK_NAME && crates[0]) candidates.add(crates[0].releases);

  const all = [...candidates];
  const sized = all.filter((list) => list.length === count);
  // A count that matches nothing means storage moved on since the sheet
  // opened; the name alone is still enough if only one crate has it.
  const pool = sized.length ? sized : all;
  if (new Set(pool.map(cardKey)).size > 1) {
    throw new CardError("Two crates share this name — rename one to make its card.");
  }
  return pool[0] ?? null;
}

/** The POST body: clipped to the route's limits, so a long crate never 400s. */
export function crateCardRequest(name: string, records: readonly CardSourceRecord[]) {
  return {
    kind: "crate" as const,
    name: clip(name, CARD_LIMITS.name) || "Crate",
    records: records.slice(0, CARD_LIMITS.records).map((r) => ({
      title: clip(r.clean_title || r.title, CARD_LIMITS.title) || "Untitled",
      artist: clip(r.artist, CARD_LIMITS.artist),
    })),
    // The route caps the total too; a crate that size is a bug, not a card.
    total: Math.min(records.length, 100_000),
  };
}

/**
 * Stop here if the sheet has gone. A DOMException by hand rather than
 * signal.throwIfAborted(), which Safari only gained in 15.4.
 */
function bailIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("The card was cancelled.", "AbortError");
}

async function fetchCardSvg(body: ReturnType<typeof crateCardRequest>, signal?: AbortSignal): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch("/api/card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    bailIfAborted(signal);
    throw new CardError("Couldn't reach Pulsar — check your connection.");
  }
  if (res.status === 429) throw new CardError("Too many cards just now — try again in a minute.");
  if (!res.ok) throw new CardError("Couldn't draw the card. Try again.");
  // Typed explicitly: an <img> only decodes a blob URL as SVG when the blob says so.
  return new Blob([await res.text()], { type: "image/svg+xml" });
}

/**
 * SVG → PNG at the card's own size. onload/onerror rather than img.decode():
 * Safari has rejected decode() for SVG sources that then draw perfectly well.
 * A same-origin blob URL keeps the canvas untainted, so toBlob is allowed.
 */
export async function rasterise(svg: Blob, width = CARD_W, height = CARD_H): Promise<Blob> {
  const url = URL.createObjectURL(svg);
  try {
    const img = new Image(width, height);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new CardError("Couldn't draw the card. Try again."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new CardError("This browser can't draw the card.");
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new CardError("Couldn't save the card."))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // In the document, and the URL kept alive a moment: Safari and Firefox ignore
  // a click on a detached anchor, and revoking in the same tick can cancel it.
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/**
 * Draw the card and hand it over: the system share sheet where the browser can
 * share files (phones, mostly), a PNG download everywhere else.
 *
 * `signal` is the export sheet closing. The card takes a second or so, and a
 * download or a share sheet arriving after the listener dismissed the panel
 * is a surprise, so it rejects with an AbortError instead of handing over.
 */
export async function shareCrateCard(
  name: string,
  records: readonly CardSourceRecord[],
  signal?: AbortSignal,
): Promise<ShareOutcome> {
  const body = crateCardRequest(name, records);
  const svg = await fetchCardSvg(body, signal);
  bailIfAborted(signal);
  const png = await rasterise(svg);
  bailIfAborted(signal);
  const filename = cardFilename(body.name);
  const file = new File([png], filename, { type: "image/png" });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${body.name} — PULSAR` });
      return "shared";
    } catch (err) {
      // Closing the sheet is a choice, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // NotAllowedError: the tap's activation ran out while the card was
      // drawing (Safari is strict about this). The PNG is ready — save it.
    }
    bailIfAborted(signal);
  }
  download(png, filename);
  return "downloaded";
}
