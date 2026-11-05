import { z } from "zod";
import { CARD_LIMITS, tidy } from "./text";

/**
 * Request bodies for POST /api/card.
 *
 * Strict where the client can comply and lenient where it can't: lengths are
 * refused rather than silently cut (the client clips with the same limits in
 * lib/cards/text.ts, so a 400 means a caller that isn't ours), but an absent
 * artist is allowed — crates hold records whose artist never resolved, and
 * one of them shouldn't sink the whole card.
 */

const text = (max: number) => z.string().transform(tidy).pipe(z.string().max(max));
const required = (max: number) => z.string().transform(tidy).pipe(z.string().min(1).max(max));

const record = z.object({
  title: required(CARD_LIMITS.title),
  artist: text(CARD_LIMITS.artist).default(""),
});

export const crateCardBody = z.object({
  kind: z.literal("crate"),
  name: required(CARD_LIMITS.name),
  records: z.array(record).max(CARD_LIMITS.records),
  /** Records in the crate when it holds more than the card draws. */
  total: z.number().int().min(0).max(100_000).optional(),
});

export const titleCardBody = z.object({
  kind: z.literal("title"),
  title: required(CARD_LIMITS.title),
  artist: text(CARD_LIMITS.artist).default(""),
  meta: text(CARD_LIMITS.meta).optional(),
  eyebrow: text(CARD_LIMITS.eyebrow).optional(),
  variant: z.enum(["intro", "outro"]).optional(),
});

export const cardBody = z.discriminatedUnion("kind", [crateCardBody, titleCardBody]);

export type CardBody = z.infer<typeof cardBody>;
