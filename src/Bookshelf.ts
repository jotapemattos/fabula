/**
 * The bookshelf's operations: what an app asks for, in its own terms.
 *
 * It sits between the atoms and the `BookRepository` port. The repository speaks
 * storage (entries, positions); the bookshelf speaks intent ("the books on this
 * shelf"). It depends only on the port, so any conforming repository layer runs it
 * (ADR 2).
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ShelfId, Book, BookDraft } from "./Model";
import type { RepositoryUnavailable, ShelfNotFound } from "./Errors";
import { BookRepository } from "./BookRepository";
import { BookIds } from "./BookIds";
import * as DateTime from "effect/DateTime";
import { between } from "./Position";
import * as Option from "effect/Option";

/**
 * The operations on a bookshelf, provided by `layer`.
 *
 * Methods fail only with the closed error set (ADR 6) and need nothing from the
 * caller: the repository they run on is supplied when the layer is built.
 *
 * The interface grows one operation at a time, as each is needed.
 */
export class Bookshelf extends Context.Service<
  Bookshelf,
  {
    /**
     * The books on a shelf, in position order.
     *
     * An existing shelf with no books succeeds with an empty array; a shelf that
     * does not exist fails with `ShelfNotFound`.
     */
    readonly listShelf: (
      shelfId: ShelfId,
    ) => Effect.Effect<ReadonlyArray<Book>, ShelfNotFound | RepositoryUnavailable>;

    /**
     * Creates a book from `draft` and places it after every book on the shelf.
     *
     * The bookshelf assigns `id` (from `BookIds`) and `addedAt` (from the `Clock`),
     * and succeeds with the book as stored. A shelf that does not exist fails with
     * `ShelfNotFound`, and nothing is stored.
     */
    readonly addBook: (
      shelfId: ShelfId,
      draft: BookDraft,
    ) => Effect.Effect<Book, ShelfNotFound | RepositoryUnavailable>;
  }
>()("fabula-ts/Bookshelf") {}

/**
 * Builds a `Bookshelf` on top of a `BookRepository` and a `BookIds`.
 *
 * Provide it with a repository layer, such as the in-memory one from
 * `fabula-ts/testing`, and with `BookIds.layer` unless ids come from elsewhere:
 *
 * ```ts
 * Bookshelf.layer.pipe(Layer.provide([InMemoryBookRepository.layer(seed), BookIds.layer]))
 * ```
 *
 * `makeBookshelfAtoms` does this wiring itself, so hosts using the atoms pass only
 * the repository layer.
 */
export const layer = Layer.effect(
  Bookshelf,
  Effect.gen(function* () {
    const repository = yield* BookRepository;
    const ids = yield* BookIds;
    return Bookshelf.of({
      listShelf: (shelfId) =>
        repository
          .listShelfEntries(shelfId)
          .pipe(Effect.map((rows) => rows.map((row) => row.book))),
      addBook: (shelfId, draft) =>
        Effect.gen(function* () {
          const last = yield* repository.lastPosition(shelfId);
          const book: Book = {
            ...draft,
            id: yield* ids.next,
            addedAt: yield* DateTime.now,
          };
          yield* repository.storeBook({
            book,
            entry: {
              shelfId,
              bookId: book.id,
              position: between(Option.getOrUndefined(last), undefined),
            },
          });
          return book;
        }),
    });
  }),
);
