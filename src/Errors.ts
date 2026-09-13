/**
 * The closed set of errors the bookshelf can fail with (ADR 6).
 *
 * Every error is a `Schema.TaggedError`: a real `Error` that can be yielded in
 * `Effect.gen`, matched exhaustively on `_tag`, and encoded to JSON so it survives
 * RPC and SSR hydration. Messages are for logs and developers; a UI should match on
 * `_tag` and write its own text.
 *
 * Programming mistakes are not in this set. They are defects, like `InvalidBounds`
 * in `Position`.
 */
import * as Schema from "effect/Schema";
import { BookId, ShelfId } from "./Model";

/**
 * The requested shelf does not exist.
 *
 * Raised by operations that name a shelf, such as listing it or adding a book to
 * it. An existing shelf with no books is not an error: it lists as empty.
 */
export class ShelfNotFound extends Schema.TaggedError<ShelfNotFound>()("ShelfNotFound", {
  shelfId: ShelfId,
}) {
  override get message() {
    return `Shelf ${JSON.stringify(this.shelfId)} does not exist`;
  }
}

/**
 * The requested book does not exist.
 *
 * Part of the closed set ahead of the operations that raise it, such as looking a
 * book up by id.
 */
export class BookNotFound extends Schema.TaggedError<BookNotFound>()("BookNotFound", {
  bookId: BookId,
}) {
  override get message() {
    return `Book ${JSON.stringify(this.bookId)} does not exist`;
  }
}

/**
 * Storage failed in a way the bookshelf cannot anticipate: a timeout, a dropped
 * connection, a bug in a host's own repository.
 *
 * The one home for unknown backend failures, so they never widen the error union.
 * `cause` carries the original failure. It survives JSON, but not unchanged: an
 * `Error` comes back as a plain `Error` with its message and no stack trace. The
 * message stays generic on purpose, so backend details such as SQL text or
 * hostnames are only ever in `cause`.
 */
export class RepositoryUnavailable extends Schema.TaggedError<RepositoryUnavailable>()(
  "RepositoryUnavailable",
  {
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return "The book repository is unavailable";
  }
}

/**
 * Every error a bookshelf operation or `BookRepository` method can fail with.
 *
 * Match on `_tag` to handle each one.
 */
export type BookshelfError = ShelfNotFound | BookNotFound | RepositoryUnavailable;
