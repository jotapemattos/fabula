/**
 * Where new books get their ids.
 *
 * A service rather than a function so the source can be replaced: tests swap in a
 * counter for readable, predictable ids, and a host whose ids are assigned
 * elsewhere provides its own layer. The library ships a default, so hosts that do
 * not care provide nothing.
 */
import * as Brand from "effect/Brand";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { BookId } from "./Model";

/** Issues fresh `BookId`s. Every id it returns must be unused. */
export class BookIds extends Context.Service<
  BookIds,
  {
    /** A fresh id for a book that does not exist yet. */
    readonly next: Effect.Effect<BookId>;
  }
>()("fabula-ts/BookIds") {}

/**
 * Brands a generated id without checking it: a UUID is a non-empty string by
 * construction, so only the type is missing. Ids from outside go through the schema.
 */
const makeBookId = Brand.nominal<BookId>();

/**
 * The default: random UUIDs from `crypto.randomUUID`.
 *
 * Available in Bun, Node 19+ and browsers; browsers expose it only in a secure
 * context (HTTPS or localhost).
 */
export const layer = Layer.sync(BookIds, () =>
  BookIds.of({
    next: Effect.sync(() => makeBookId(crypto.randomUUID())),
  }),
);
