/**
 * The persistence port: what storage must be able to do, never how.
 *
 * Everything above it — `Bookshelf`, the atoms — sees only this interface, so
 * moving storage from memory to SQL to a server is a layer swap (ADRs 2, 9).
 */
import * as Context from "effect/Context";
import type * as Option from "effect/Option";
import type { Book, ShelfEntry, ShelfId } from "./Model";
import type * as Effect from "effect/Effect";
import type { RepositoryUnavailable, ShelfNotFound } from "./Errors";
import type { Position } from "./Position";

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

    /**
     * The position of the shelf's last book, in position order.
     *
     * `Option.none()` for an existing shelf with no books; `ShelfNotFound` for a
     * shelf that does not exist. It is the bound a new book is placed after, and
     * asks for the one key that answers it, so storage need not read every row.
     */
    readonly lastPosition: (
      shelfId: ShelfId,
    ) => Effect.Effect<Option.Option<Position>, ShelfNotFound | RepositoryUnavailable>;

    /**
     * Stores a new book together with the entry that places it on a shelf.
     *
     * Both in one call, so a book with no entry — or an entry pointing at no book
     * — can never exist, whatever the storage. Fails with `ShelfNotFound` if the
     * shelf does not exist.
     *
     * The row must be new: its book id unused, and its position not already taken
     * on that shelf. A row that is not is a bug in the caller, and must be refused
     * rather than stored — as a defect, or as `RepositoryUnavailable` wrapping a
     * storage constraint — since storing it would leave two books with one id, or
     * two entries whose order is undefined.
     */
    readonly storeBook: (
      row: ShelfBook,
    ) => Effect.Effect<void, ShelfNotFound | RepositoryUnavailable>;
  }
>()("fabula-ts/BookRepository") {}
