/**
 * Atoms for a bookshelf: the bridge from `Bookshelf` to a UI.
 *
 * The library never picks storage, so it exports a factory rather than atoms
 * bound to a layer at module load (ADR 8). Published as `fabula-ts/atoms`, so
 * hosts that do not use atoms never load the reactivity modules.
 */
import * as Layer from "effect/Layer";
import { Atom } from "effect/unstable/reactivity";
import type { BookRepository } from "../BookRepository";
import * as Bookshelf from "../Bookshelf";
import type { ShelfId } from "../Model";
import * as BookIds from "../BookIds";

/**
 * Builds the bookshelf's atoms on top of a host-supplied repository layer.
 *
 * Call it once, beside the host's other layer wiring, and keep the result: each
 * call has its own state, even when two calls share a layer or a registry.
 *
 * - `shelf(shelfId)` — the books on a shelf, in position order, as an
 *   `AsyncResult`. It fails with `ShelfNotFound` for a missing shelf. The same
 *   id returns the same atom.
 *
 * ```ts
 * const { shelf } = makeBookshelfAtoms(InMemoryBookRepository.layer(seed))
 * const books = useAtomValue(shelf(shelfId))
 * ```
 */
export const makeBookshelfAtoms = (layer: Layer.Layer<BookRepository>) => {
  // A registry memoizes layers by identity, and `Bookshelf.layer` is one shared
  // constant. Without `fresh` around the whole stack, a second call in the same
  // registry would reuse the first call's `Bookshelf`, and read its repository.
  const bookshelfLayer = Layer.fresh(Bookshelf.layer.pipe(Layer.provide([layer, BookIds.layer])));
  const runtime = Atom.runtime(bookshelfLayer);
  const shelf = Atom.family((shelfId: ShelfId) =>
    runtime.atom(Bookshelf.Bookshelf.use((bookshelf) => bookshelf.listShelf(shelfId))),
  );

  return { shelf };
};
