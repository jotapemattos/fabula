import { assert, describe, it } from "@effect/vitest";
import { DateTime, Effect, Latch, Layer, Schema } from "effect";
import { AsyncResult, AtomRegistry } from "effect/unstable/reactivity";
import { makeBookshelfAtoms } from "../src/atoms/index.ts";
import { BookRepository } from "../src/BookRepository.ts";
import { ShelfNotFound } from "../src/Errors.ts";
import { Book, BookId, ShelfEntry, ShelfId } from "../src/Model.ts";
import { layer as inMemoryLayer } from "../src/testing/InMemoryBookRepository.ts";

const sciFi = Schema.decodeSync(ShelfId)("sci-fi");
const reading = Schema.decodeSync(ShelfId)("currently-reading");
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
    shelves: [sciFi, reading],
    books: [dune, foundation, hyperion],
    // Seeded out of order, so insertion order cannot pass for position order.
    entries: [
      entry(sciFi, hyperion, "t"),
      entry(sciFi, dune, "a"),
      entry(sciFi, foundation, "k"),
      entry(reading, dune, "a"),
    ],
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

      // A fresh read of the shelf sees the book.
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

  it.effect("keeps an add running when a second one starts", () =>
    Effect.gen(function* () {
      const release = Latch.makeUnsafe();
      const { shelf, addBook } = makeBookshelfAtoms(heldWrites(release));
      const registry = AtomRegistry.make();
      const unsubscribe = registry.subscribe(addBook, () => {});

      registry.set(addBook, { shelfId: sciFi, draft: { title: "First", authors: [] } });
      registry.set(addBook, { shelfId: sciFi, draft: { title: "Second", authors: [] } });
      yield* release.open;
      yield* AtomRegistry.getResult(registry, addBook, { suspendOnWaiting: true });

      const books = yield* AtomRegistry.getResult(registry, shelf(sciFi));
      assert.deepStrictEqual(books.map((book) => book.title).slice(-2), ["First", "Second"]);

      unsubscribe();
      registry.dispose();
    }),
  );

  // Live time: the registry removes an unsubscribed atom on a later tick, and the
  // write must be released only after that removal has had its chance to cancel it.
  it.live("keeps an add running after its last subscriber leaves", () =>
    Effect.gen(function* () {
      const release = Latch.makeUnsafe();
      const { shelf, addBook } = makeBookshelfAtoms(heldWrites(release));
      const registry = AtomRegistry.make();
      const unsubscribe = registry.subscribe(addBook, () => {});

      registry.set(addBook, { shelfId: sciFi, draft: { title: "Neuromancer", authors: [] } });
      // The component that started the add unmounts before the write lands.
      unsubscribe();
      yield* Effect.sleep("50 millis");
      yield* release.open;
      yield* Effect.sleep("50 millis");

      // Read without touching `addBook`, which would run the write again.
      const books = yield* AtomRegistry.getResult(registry, shelf(sciFi));
      assert.strictEqual(books.at(-1)?.title, "Neuromancer");

      registry.dispose();
    }),
  );

  it.effect("refreshes a mounted shelf atom once the add succeeds", () =>
    Effect.gen(function* () {
      const { shelf, addBook } = makeBookshelfAtoms(seededLayer());
      const registry = AtomRegistry.make();

      // Mounted, as a component reading the shelf would be.
      const seen: Array<ReadonlyArray<string>> = [];
      const unmount = registry.subscribe(
        shelf(sciFi),
        (result) => {
          if (result._tag === "Success") seen.push(result.value.map((book) => book.title));
        },
        // As a component does: mounting reads the shelf, it does not wait to be told.
        { immediate: true },
      );
      const unsubscribeAdd = registry.subscribe(addBook, () => {});
      yield* settle;

      registry.set(addBook, { shelfId: sciFi, draft: { title: "Neuromancer", authors: [] } });
      yield* AtomRegistry.getResult(registry, addBook, { suspendOnWaiting: true });
      yield* settle;

      // Nobody asked the shelf atom to refetch: the add's own keys did it.
      assert.deepStrictEqual(seen.at(-1), ["Dune", "Foundation", "Hyperion", "Neuromancer"]);

      unsubscribeAdd();
      unmount();
      registry.dispose();
    }),
  );

  it.effect("leaves a mounted atom for another shelf alone", () =>
    Effect.gen(function* () {
      const { shelf, addBook } = makeBookshelfAtoms(seededLayer());
      const registry = AtomRegistry.make();

      const other: Array<ReadonlyArray<string>> = [];
      const unmountOther = registry.subscribe(
        shelf(reading),
        (result) => {
          if (result._tag === "Success") other.push(result.value.map((book) => book.title));
        },
        { immediate: true },
      );
      const unmountSciFi = registry.subscribe(shelf(sciFi), () => {}, { immediate: true });
      const unsubscribeAdd = registry.subscribe(addBook, () => {});
      yield* settle;

      // The shelf that was read first is not the shelf that is written to.
      assert.deepStrictEqual(other, [["Dune"]]);

      registry.set(addBook, { shelfId: sciFi, draft: { title: "Neuromancer", authors: [] } });
      yield* AtomRegistry.getResult(registry, addBook, { suspendOnWaiting: true });
      yield* settle;

      assert.deepStrictEqual(other, [["Dune"]]);

      unsubscribeAdd();
      unmountSciFi();
      unmountOther();
      registry.dispose();
    }),
  );

  it.effect("does not refresh a mounted shelf atom when the add fails", () =>
    Effect.gen(function* () {
      const { shelf, addBook } = makeBookshelfAtoms(seededLayer());
      const registry = AtomRegistry.make();

      const seen: Array<ReadonlyArray<string>> = [];
      const unmount = registry.subscribe(
        shelf(sciFi),
        (result) => {
          if (result._tag === "Success") seen.push(result.value.map((book) => book.title));
        },
        // As a component does: mounting reads the shelf, it does not wait to be told.
        { immediate: true },
      );
      const unsubscribeAdd = registry.subscribe(addBook, () => {});
      yield* settle;

      // An empty title is rejected by the `Book` schema, so nothing is stored.
      registry.set(addBook, { shelfId: sciFi, draft: { title: "", authors: [] } });
      yield* Effect.flip(AtomRegistry.getResult(registry, addBook, { suspendOnWaiting: true }));
      yield* settle;

      assert.deepStrictEqual(seen, [["Dune", "Foundation", "Hyperion"]]);

      unsubscribeAdd();
      unmount();
      registry.dispose();
    }),
  );
});

/**
 * Yields repeatedly, so a refresh a write set off has every chance to land before a
 * test looks. A test that expects no refresh fails only after the same wait.
 */
const settle = Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow, {
  discard: true,
});

const describeResult = (result: AsyncResult.AsyncResult<unknown, unknown>): string =>
  result.waiting ? `${result._tag} (waiting)` : result._tag;
