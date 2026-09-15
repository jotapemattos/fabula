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
import type { ShelfId, Book } from "./Model";
import type { RepositoryUnavailable, ShelfNotFound } from "./Errors";
import { BookRepository } from "./BookRepository";

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
  }
>()("fabula-ts/Bookshelf") {}

/**
 * Builds a `Bookshelf` on top of a `BookRepository`.
 *
 * Provide it with a repository layer, such as the in-memory one from
 * `fabula-ts/testing`:
 *
 * ```ts
 * Bookshelf.layer.pipe(Layer.provide(InMemoryBookRepository.layer(seed)))
 * ```
 */
export const layer = Layer.effect(
  Bookshelf,
  Effect.gen(function* () {
    const repository = yield* BookRepository;
    return Bookshelf.of({
      listShelf: (shelfId) =>
        repository
          .listShelfEntries(shelfId)
          .pipe(Effect.map((rows) => rows.map((row) => row.book))),
    });
  }),
);
