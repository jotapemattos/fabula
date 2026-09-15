import * as Layer from "effect/Layer";
import { Atom } from "effect/unstable/reactivity";
import type { BookRepository } from "../BookRepository";
import * as Bookshelf from "../Bookshelf";
import type { ShelfId } from "../Model";

export const makeBookshelfAtoms = (layer: Layer.Layer<BookRepository>) => {
  const bookshelfLayer = Layer.fresh(Bookshelf.layer.pipe(Layer.provide(layer)));
  const runtime = Atom.runtime(bookshelfLayer);
  const shelf = Atom.family((shelfId: ShelfId) =>
    runtime.atom(Bookshelf.Bookshelf.use((bookshelf) => bookshelf.listShelf(shelfId))),
  );

  return { shelf };
};
