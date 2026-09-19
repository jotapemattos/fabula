import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { BookId } from "./Model";
import * as Brand from "effect/Brand";

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

export const layer = Layer.sync(BookIds, () =>
  BookIds.of({
    next: Effect.sync(() => makeBookId(crypto.randomUUID())),
  }),
);
