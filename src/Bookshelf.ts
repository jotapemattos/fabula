/**
 * The bookshelf's operations: what an app asks for, in its own terms.
 *
 * It sits between the atoms and the `BookRepository` port. The repository speaks
 * storage (entries, positions); the bookshelf speaks intent ("the books on this
 * shelf"). It depends only on the port, so any conforming repository layer runs it
 * (ADR 2).
 */
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { Reactivity } from "effect/unstable/reactivity";
import { BookIds } from "./BookIds";
import { BookRepository } from "./BookRepository";
import { InvalidBook } from "./Errors";
import type { RepositoryUnavailable, ShelfNotFound } from "./Errors";
import { Book } from "./Model";
import type { BookDraft, ShelfId } from "./Model";
import { between } from "./Position";

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
     * and succeeds with the book as stored. The book is decoded before anything is
     * stored: a draft the `Book` schema rejects fails with `InvalidBook`, and
     * properties `Book` does not have are dropped. A shelf that does not exist
     * fails with `ShelfNotFound`. Either way, nothing is stored.
     */
    readonly addBook: (
      shelfId: ShelfId,
      draft: BookDraft,
    ) => Effect.Effect<Book, ShelfNotFound | InvalidBook | RepositoryUnavailable>;

    /**
     * The books on a shelf, in position order, re-read whenever the shelf changes.
     *
     * Emits the current books, then a fresh list each time an operation on this
     * shelf completes — `addBook`, today. A shelf that does not exist fails with
     * `ShelfNotFound`, and the stream ends there: a missing shelf stays missing.
     *
     * Any failed read ends it the same way, including a `RepositoryUnavailable`
     * that a later read would have survived: the subscription does not retry, so a
     * caller that wants to recover subscribes again.
     */
    readonly shelfChanges: (
      shelfId: ShelfId,
    ) => Stream.Stream<ReadonlyArray<Book>, ShelfNotFound | RepositoryUnavailable>;
  }
>()("fabula-ts/Bookshelf") {}

/**
 * What a read of one shelf registers under: the `shelves` group, and that shelf
 * within it. Registering under both is what lets a future operation over many
 * shelves wake every reader at once, with `{ shelves: [] }` (ADR 7).
 */
const shelfReadKeys = (shelfId: ShelfId) => ({ shelves: [shelfId] });

/**
 * What a write to one shelf invalidates: that shelf alone.
 *
 * Deliberately not the record form. `Reactivity` hashes a record as both the group
 * and each id, on registration and on invalidation alike, so invalidating
 * `{ shelves: [id] }` would also invalidate `shelves` and re-read every other
 * shelf's readers (ADR 7).
 */
const shelfWriteKeys = (shelfId: ShelfId) => [`shelves:${shelfId}`];

/**
 * Checks a candidate against `Book`'s own type, rather than its JSON form, and
 * keeps only `Book`'s properties.
 */
const decodeBook = Schema.decodeUnknownEffect(Schema.toType(Book));

/**
 * Builds a `Bookshelf` on top of a `BookRepository` and a `BookIds`.
 *
 * Provide it with a repository layer, such as the in-memory one from
 * `fabula-ts/testing`, with `BookIds.layer` unless ids come from elsewhere, and with
 * `Reactivity.layer`, which carries the invalidation the shelf streams run on:
 *
 * ```ts
 * Bookshelf.layer.pipe(
 *   Layer.provide([InMemoryBookRepository.layer(seed), BookIds.layer, Reactivity.layer]),
 * )
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

    // Reading the last position and storing after it are two calls, so two adds
    // running at once could both read the same position and store the same key.
    // One add at a time closes that gap within this bookshelf. Storage shared
    // between processes must still refuse a taken position (see `storeBook`).
    const appends = yield* Semaphore.make(1);

    const reactivity = yield* Reactivity.Reactivity;

    // The read itself, shared by the one-shot `listShelf` and the stream that
    // re-runs it.
    const listShelf = (shelfId: ShelfId) =>
      repository.listShelfEntries(shelfId).pipe(Effect.map((rows) => rows.map((row) => row.book)));

    return Bookshelf.of({
      listShelf,

      addBook: (shelfId, draft) =>
        // Invalidating after the write, not before, is what `mutation` does: an add
        // that fails leaves the shelf's readers alone.
        reactivity.mutation(
          shelfWriteKeys(shelfId),
          Effect.gen(function* () {
            const book = yield* decodeBook({
              ...draft,
              id: yield* ids.next,
              addedAt: yield* DateTime.now,
            }).pipe(Effect.mapError((error) => new InvalidBook({ reason: error.message })));

            yield* appends.withPermit(
              Effect.gen(function* () {
                const last = yield* repository.lastPosition(shelfId);
                yield* repository.storeBook({
                  book,
                  entry: {
                    shelfId,
                    bookId: book.id,
                    position: between(Option.getOrUndefined(last), undefined),
                  },
                });
              }),
            );
            return book;
          }),
        ),

      shelfChanges: (shelfId) => reactivity.stream(shelfReadKeys(shelfId), listShelf(shelfId)),
    });
  }),
);
