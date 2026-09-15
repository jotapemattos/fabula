import { assert, describe, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Schema } from "effect";
import { AtomRegistry } from "effect/unstable/reactivity";
import { makeBookshelfAtoms } from "../src/atoms/index.ts";
import { ShelfNotFound } from "../src/Errors.ts";
import { Book, BookId, ShelfEntry, ShelfId } from "../src/Model.ts";
import { layer as inMemoryLayer } from "../src/testing/InMemoryBookRepository.ts";

const sciFi = Schema.decodeSync(ShelfId)("sci-fi");
const missing = Schema.decodeSync(ShelfId)("missing");

const makeBook = (id: string, title: string): Book =>
  Schema.decodeSync(Book)({
    id: Schema.decodeSync(BookId)(id),
    title,
    authors: [],
    addedAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
  });

const dune = makeBook("dune", "Dune");
const foundation = makeBook("foundation", "Foundation");
const hyperion = makeBook("hyperion", "Hyperion");

const entry = (shelfId: ShelfId, book: Book, position: string): ShelfEntry =>
  Schema.decodeSync(ShelfEntry)({ shelfId, bookId: book.id, position });

// Each test builds its own layer from this function.
const seededLayer = () =>
  inMemoryLayer({
    shelves: [sciFi],
    books: [dune, foundation, hyperion],
    // Seeded out of order, so insertion order cannot pass for position order.
    entries: [entry(sciFi, hyperion, "t"), entry(sciFi, dune, "a"), entry(sciFi, foundation, "k")],
  });

describe("makeBookshelfAtoms", () => {
  it.effect("resolves a shelf atom to its books in position order", () =>
    Effect.gen(function* () {
      const { shelf } = makeBookshelfAtoms(seededLayer());
      const registry = AtomRegistry.make();
      const books = yield* AtomRegistry.getResult(registry, shelf(sciFi));
      assert.deepStrictEqual(
        books.map((book) => book.id),
        [dune.id, foundation.id, hyperion.id],
      );
      registry.dispose();
    }),
  );

  it.effect("surfaces ShelfNotFound in the result for a missing shelf", () =>
    Effect.gen(function* () {
      const { shelf } = makeBookshelfAtoms(seededLayer());
      const registry = AtomRegistry.make();
      const error = yield* Effect.flip(AtomRegistry.getResult(registry, shelf(missing)));
      assert.instanceOf(error, ShelfNotFound);
      assert.strictEqual(error.shelfId, missing);
      registry.dispose();
    }),
  );

  it.effect("gives each call its own state, even with the same layer and registry", () =>
    Effect.gen(function* () {
      let builds = 0;
      const counted = Layer.merge(seededLayer(), Layer.effectDiscard(Effect.sync(() => builds++)));
      const first = makeBookshelfAtoms(counted);
      const second = makeBookshelfAtoms(counted);
      const registry = AtomRegistry.make();

      assert.notStrictEqual(first.shelf(sciFi), second.shelf(sciFi));
      yield* AtomRegistry.getResult(registry, first.shelf(sciFi));
      yield* AtomRegistry.getResult(registry, second.shelf(sciFi));
      assert.strictEqual(builds, 2);
      registry.dispose();
    }),
  );
});
