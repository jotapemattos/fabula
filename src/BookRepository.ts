/**
 * The persistence port: what storage must be able to do, never how.
 *
 * Everything above it — `Bookshelf`, the atoms — sees only this interface, so
 * moving storage from memory to SQL to a server is a layer swap (ADRs 2, 9).
 */
import * as Context from "effect/Context";
import type { Book, ShelfEntry, ShelfId } from "./Model";
import type * as Effect from "effect/Effect";
import type { RepositoryUnavailable, ShelfNotFound } from "./Errors";

/**
 * One row of a shelf listing: a book, and the entry that places it on the shelf.
 *
 * The entry is kept alongside the book because it carries the `position`, which
 * operations that insert or move books need.
 */
export interface ShelfBook {
  readonly entry: ShelfEntry;
  readonly book: Book;
}

/**
 * Storage for books and shelves, provided by the host as a layer.
 *
 * An implementation must pass the conformance suite in `fabula-ts/testing`, and
 * may fail only with the closed error set (ADR 6). Every method can fail with
 * `RepositoryUnavailable`, since any real storage can; wrap unexpected failures
 * in it rather than letting them escape as defects.
 *
 * The interface grows with the operations that need it, never ahead of them.
 */
export class BookRepository extends Context.Service<
  BookRepository,
  {
    /**
     * Whether a shelf exists.
     *
     * A missing shelf is an answer, not an error: this returns `false` and never
     * fails with `ShelfNotFound`.
     */
    readonly shelfExists: (shelfId: ShelfId) => Effect.Effect<boolean, RepositoryUnavailable>;

    /**
     * The books on a shelf, each with its entry, in position order.
     *
     * An existing shelf with no books succeeds with an empty array; a shelf that
     * does not exist fails with `ShelfNotFound`. Existence and entries are read
     * together, so the two can never disagree.
     */
    readonly listShelfEntries: (
      shelfId: ShelfId,
    ) => Effect.Effect<ReadonlyArray<ShelfBook>, ShelfNotFound | RepositoryUnavailable>;
  }
>()("fabula-ts/BookRepository") {}
