/**
 * The bookshelf's stored shapes: books, the shelves they sit on, and the entries
 * that place a book on a shelf.
 *
 * Every shape is an Effect schema, so it can be decoded at the edges (a SQL row,
 * an RPC payload — ADR 9) and serialised across them.
 */
import * as Schema from "effect/Schema";
import { Position } from "./Position";

/**
 * A book's identity.
 *
 * Branded, so it cannot be passed where a `ShelfId` is expected, and never empty.
 * No format is imposed: ids come from `addBook` or the storage layer.
 */
export const BookId = Schema.NonEmptyString.pipe(Schema.brand("BookId"));
export type BookId = typeof BookId.Type;

/**
 * A shelf's identity, and for now the whole of a shelf: there is no `Shelf`
 * schema until shelves gain fields of their own.
 *
 * Branded, so it cannot be passed where a `BookId` is expected, and never empty.
 */
export const ShelfId = Schema.NonEmptyString.pipe(Schema.brand("ShelfId"));
export type ShelfId = typeof ShelfId.Type;

/**
 * A book's rating, in half stars from 0.5 to 5.
 *
 * Zero is not a rating: an unrated book has no `rating` key at all.
 */
export const Rating = Schema.Finite.check(
  Schema.isBetween({ minimum: 0.5, maximum: 5 }),
  Schema.isMultipleOf(0.5),
);
export type Rating = typeof Rating.Type;

/**
 * A book in the library, independent of any shelf.
 *
 * Fixed and closed (ADR 3): hosts cannot add fields. `authors` may be empty, for
 * anonymous works and anthologies. `isbn` and `coverUrl` are either absent or
 * a string, never `undefined`; `coverUrl` is not validated as a URL. `addedAt` is
 * UTC and serialises as an ISO string.
 */
export const Book = Schema.Struct({
  id: BookId,
  title: Schema.NonEmptyString,
  authors: Schema.Array(Schema.NonEmptyString),
  rating: Schema.optionalKey(Rating),
  isbn: Schema.optionalKey(Schema.String),
  coverUrl: Schema.optionalKey(Schema.String),
  addedAt: Schema.DateTimeUtc,
});

export type Book = typeof Book.Type;
export type BookDraft = Omit<Book, "id" | "addedAt">;

/**
 * Places one book on one shelf, at a position in that shelf's order.
 *
 * Books and shelves are many-to-many (ADR 4), and order belongs to the entry, not
 * the book: the same book has an independent position on every shelf it sits on.
 * An entry is identified by its `shelfId` and `bookId` together. That a book sits
 * on a shelf at most once is the repository's rule, not this schema's.
 */
export const ShelfEntry = Schema.Struct({
  shelfId: ShelfId,
  bookId: BookId,
  position: Position,
});

export type ShelfEntry = typeof ShelfEntry.Type;
