import { assert, describe, it } from "@effect/vitest";
import { DateTime, Effect, Latch, Layer, Schema } from "effect";
import { AsyncResult, AtomRegistry } from "effect/unstable/reactivity";
import { makeBookshelfAtoms } from "../src/atoms/index.ts";
import { BookRepository } from "../src/BookRepository.ts";
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

/** The seeded store, with every `storeBook` waiting for `release` to open first. */
const heldWrites = (release: Latch.Latch) =>
  Layer.effect(
    BookRepository,
    Effect.gen(function* () {
      const repository = yield* BookRepository;
      return BookRepository.of({
        ...repository,
        storeBook: (row) => release.await.pipe(Effect.andThen(repository.storeBook(row))),
      });
    }),
  ).pipe(Layer.provide(seededLayer()));

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

  it.effect("gives each call its own state, even in the same registry", () =>
    Effect.gen(function* () {
      // Same shelf id, different books, so reading the other call's state shows up.
      const first = makeBookshelfAtoms(
        inMemoryLayer({ shelves: [sciFi], books: [dune], entries: [entry(sciFi, dune, "a")] }),
      );
      const second = makeBookshelfAtoms(
        inMemoryLayer({
          shelves: [sciFi],
          books: [hyperion],
          entries: [entry(sciFi, hyperion, "a")],
        }),
      );
      const registry = AtomRegistry.make();

      const firstBooks = yield* AtomRegistry.getResult(registry, first.shelf(sciFi));
      const secondBooks = yield* AtomRegistry.getResult(registry, second.shelf(sciFi));
      assert.deepStrictEqual(
        firstBooks.map((book) => book.id),
        [dune.id],
      );
      assert.deepStrictEqual(
        secondBooks.map((book) => book.id),
        [hyperion.id],
      );
      registry.dispose();
    }),
  );

  it.effect("runs addBook, reporting progress and then the added book", () =>
    Effect.gen(function* () {
      // The in-memory store answers synchronously, so the write is held open until
      // the test releases it: otherwise the in-progress state is never observable.
      const release = Latch.makeUnsafe();
      const { shelf, addBook } = makeBookshelfAtoms(heldWrites(release));
      const registry = AtomRegistry.make();

      // Every state the action atom passes through, as the UI would see it.
      const states = [describeResult(registry.get(addBook))];
      const unsubscribe = registry.subscribe(addBook, (result) => {
        states.push(describeResult(result));
      });

      registry.set(addBook, { shelfId: sciFi, draft: { title: "Neuromancer", authors: [] } });
      assert.isTrue(registry.get(addBook).waiting, "addBook should be in progress");

      yield* release.open;
      const added = yield* AtomRegistry.getResult(registry, addBook, { suspendOnWaiting: true });

      assert.strictEqual(added.title, "Neuromancer");
      assert.deepStrictEqual(states, ["Initial", "Initial (waiting)", "Success"]);

      // A fresh read of the shelf sees the book; a mounted one refreshing is FAB-9.
      const books = yield* AtomRegistry.getResult(registry, shelf(sciFi));
      assert.deepStrictEqual(
        books.map((book) => book.title),
        ["Dune", "Foundation", "Hyperion", "Neuromancer"],
      );

      unsubscribe();
      registry.dispose();
    }),
  );

  it.effect("surfaces ShelfNotFound in addBook's result for a missing shelf", () =>
    Effect.gen(function* () {
      const { addBook } = makeBookshelfAtoms(seededLayer());
      const registry = AtomRegistry.make();
      const unsubscribe = registry.subscribe(addBook, () => {});

      registry.set(addBook, { shelfId: missing, draft: { title: "Neuromancer", authors: [] } });
      const error = yield* Effect.flip(AtomRegistry.getResult(registry, addBook));

      assert.instanceOf(error, ShelfNotFound);
      assert.strictEqual(error.shelfId, missing);

      unsubscribe();
      registry.dispose();
    }),
  );
});

const describeResult = (result: AsyncResult.AsyncResult<unknown, unknown>): string =>
  result.waiting ? `${result._tag} (waiting)` : result._tag;
