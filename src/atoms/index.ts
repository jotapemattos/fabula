/**
 * Atoms for a bookshelf: the bridge from `Bookshelf` to a UI.
 *
 * The library never picks storage, so it exports a factory rather than atoms
 * bound to a layer at module load (ADR 8). Published as `fabula-ts/atoms`, so
 * hosts that do not use atoms never load the reactivity modules.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { Atom } from "effect/unstable/reactivity";
import type { BookRepository } from "../BookRepository";
import * as Bookshelf from "../Bookshelf";
import type { BookDraft, ShelfId } from "../Model";
import * as BookIds from "../BookIds";

/**
 * Builds the bookshelf's atoms on top of a host-supplied repository layer.
 *
 * Call it once, beside the host's other layer wiring, and keep the result: each call
 * reads and writes its own bookshelf, even when two calls share a layer or a registry.
 * Invalidation is the exception: a registry has one `Reactivity`, so an add through one
 * call also re-reads another call's mounted atoms for the same shelf id. Each still
 * re-reads its own repository, so the books are right; the extra read is wasted work.
 *
 * - `shelf(shelfId)` — the books on a shelf, in position order, as an
 *   `AsyncResult`. It fails with `ShelfNotFound` for a missing shelf. The same
 *   id returns the same atom.
 * - `addBook` — an action: write `{ shelfId, draft }` to it to add a book at the
 *   end of that shelf. Its value is an `AsyncResult` that is waiting while the
 *   call runs, then holds the added book, or `ShelfNotFound`, `InvalidBook` or
 *   `RepositoryUnavailable` — `addBook`'s whole error set, which a host matching on
 *   the result must cover. A mounted `shelf`
 *   atom for that shelf re-reads itself once the add succeeds; other shelves are
 *   left alone, and a failed add refreshes nothing.
 *
 * Ids come from `BookIds.layer`, so the repository layer is all a host provides.
 *
 * ```ts
 * const { shelf, addBook } = makeBookshelfAtoms(InMemoryBookRepository.layer(seed))
 * const books = useAtomValue(shelf(shelfId))
 * const add = useAtomSet(addBook)
 * add({ shelfId, draft: { title: "Dune", authors: ["Frank Herbert"] } })
 * ```
 */
export const makeBookshelfAtoms = (layer: Layer.Layer<BookRepository>) => {
  // A registry memoizes layers by identity, and `Bookshelf.layer` is one shared
  // constant. Without `fresh` around the whole stack, a second call in the same
  // registry would reuse the first call's `Bookshelf`, and read its repository.
  const bookshelfLayer = Layer.fresh(Bookshelf.layer.pipe(Layer.provide([layer, BookIds.layer])));
  const runtime = Atom.runtime(bookshelfLayer);
  const shelf = Atom.family((shelfId: ShelfId) =>
    runtime.atom(
      Stream.unwrap(
        Bookshelf.Bookshelf.use((bookshelf) => Effect.succeed(bookshelf.shelfChanges(shelfId))),
      ),
    ),
  );

  // A write must not be lost to the UI's lifecycle. An action atom interrupts its
  // running call when called again, so the write is uninterruptible: the first add
  // still lands, and the atom reports the latest call. Kept alive, so unmounting the
  // component that started it does not dispose the atom either. Not `concurrent`:
  // in this RC that mode reports the first running call's value, and loses the
  // result of a call that finishes before it is joined.
  const addBook = Atom.keepAlive(
    runtime.fn((input: { readonly shelfId: ShelfId; readonly draft: BookDraft }) =>
      Bookshelf.Bookshelf.use((bookshelf) =>
        Effect.uninterruptible(bookshelf.addBook(input.shelfId, input.draft)),
      ),
    ),
  );

  return { shelf, addBook };
};
