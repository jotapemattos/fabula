import { assert, describe, it, layer } from "@effect/vitest";
import { Brand, DateTime, Effect, Layer, Schema } from "effect";
import { TestClock } from "effect/testing";
import { BookIds } from "../src/BookIds.ts";
import { Bookshelf, layer as bookshelfLayer } from "../src/Bookshelf.ts";
import { ShelfNotFound } from "../src/Errors.ts";
import { Book, BookId, ShelfEntry, ShelfId } from "../src/Model.ts";
import type { BookDraft } from "../src/Model.ts";
import type { Seed } from "../src/testing/Conformance.ts";
import { layer as inMemoryLayer } from "../src/testing/InMemoryBookRepository.ts";

const sciFi = Schema.decodeSync(ShelfId)("sci-fi");
const reading = Schema.decodeSync(ShelfId)("currently-reading");
const empty = Schema.decodeSync(ShelfId)("empty");
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

const draft = (title: string): BookDraft => ({ title, authors: [] });

const titles = (books: ReadonlyArray<Book>): ReadonlyArray<string> =>
  books.map((book) => book.title);

const seed: Seed = {
  shelves: [sciFi, reading, empty],
  books: [dune, foundation, hyperion],
  // Seeded out of order, so insertion order cannot pass for position order.
  entries: [
    entry(sciFi, hyperion, "t"),
    entry(sciFi, dune, "a"),
    entry(sciFi, foundation, "k"),
    entry(reading, dune, "k"),
    entry(reading, hyperion, "a"),
  ],
};

const makeBookId = Brand.nominal<BookId>();

/** Ids as `book-1`, `book-2`, …: readable in failures, and proof the default layer is replaceable. */
const countingIds = Layer.sync(BookIds, () => {
  let issued = 0;
  return BookIds.of({ next: Effect.sync(() => makeBookId(`book-${++issued}`)) });
});

// Every read test only reads, so one layer is shared across them.
const TestLayer = bookshelfLayer.pipe(Layer.provide([inMemoryLayer(seed), countingIds]));

/**
 * A layer per write test, so one test's books never reach another, with time
 * fixed at the epoch: `addedAt` is then an assertable value rather than "now".
 */
const writeLayer = () =>
  Layer.merge(
    bookshelfLayer.pipe(Layer.provide([inMemoryLayer(seed), countingIds])),
    TestClock.layer(),
  );

layer(TestLayer)("Bookshelf.listShelf", (it) => {
  it.effect("lists a shelf's books in position order", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      const books = yield* bookshelf.listShelf(sciFi);
      assert.deepStrictEqual(
        books.map((book) => book.id),
        [dune.id, foundation.id, hyperion.id],
      );
    }),
  );

  it.effect("lists an existing empty shelf as no books", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      const books = yield* bookshelf.listShelf(empty);
      assert.deepStrictEqual(books, []);
    }),
  );

  it.effect("fails with ShelfNotFound for a missing shelf", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      const error = yield* Effect.flip(bookshelf.listShelf(missing));
      assert.instanceOf(error, ShelfNotFound);
      assert.strictEqual(error.shelfId, missing);
    }),
  );
});

describe("Bookshelf.addBook", () => {
  it.effect("adds a book after every book already on the shelf", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      yield* bookshelf.addBook(sciFi, draft("Neuromancer"));
      const books = yield* bookshelf.listShelf(sciFi);
      assert.deepStrictEqual(titles(books), ["Dune", "Foundation", "Hyperion", "Neuromancer"]);
    }).pipe(Effect.provide(writeLayer())),
  );

  it.effect("makes the book the only one on an empty shelf", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      yield* bookshelf.addBook(empty, draft("Neuromancer"));
      const books = yield* bookshelf.listShelf(empty);
      assert.deepStrictEqual(titles(books), ["Neuromancer"]);
    }).pipe(Effect.provide(writeLayer())),
  );

  it.effect("keeps insertion order across repeated calls", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      yield* bookshelf.addBook(empty, draft("First"));
      yield* bookshelf.addBook(empty, draft("Second"));
      yield* bookshelf.addBook(empty, draft("Third"));
      const books = yield* bookshelf.listShelf(empty);
      assert.deepStrictEqual(titles(books), ["First", "Second", "Third"]);
    }).pipe(Effect.provide(writeLayer())),
  );

  it.effect("leaves another shelf's order untouched", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      const before = titles(yield* bookshelf.listShelf(reading));
      yield* bookshelf.addBook(sciFi, draft("Neuromancer"));
      assert.deepStrictEqual(titles(yield* bookshelf.listShelf(reading)), before);
      assert.deepStrictEqual(before, ["Hyperion", "Dune"]);
    }).pipe(Effect.provide(writeLayer())),
  );

  it.effect("fails with ShelfNotFound for a missing shelf, and stores nothing", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      const error = yield* Effect.flip(bookshelf.addBook(missing, draft("Neuromancer")));
      assert.instanceOf(error, ShelfNotFound);
      assert.strictEqual(error.shelfId, missing);

      // The book must not have landed anywhere else on the way out.
      assert.deepStrictEqual(titles(yield* bookshelf.listShelf(sciFi)), [
        "Dune",
        "Foundation",
        "Hyperion",
      ]);
      assert.deepStrictEqual(titles(yield* bookshelf.listShelf(empty)), []);
    }).pipe(Effect.provide(writeLayer())),
  );

  it.effect("assigns the id and addedAt itself, and returns the stored book", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      const added = yield* bookshelf.addBook(empty, draft("Neuromancer"));

      // The id comes from BookIds, and the time from the Clock — not from the draft,
      // and not from `Date.now`, which the fixed test clock would not explain.
      assert.strictEqual(added.id, "book-1");
      assert.strictEqual(DateTime.formatIso(added.addedAt), "1970-01-01T00:00:00.000Z");
      assert.strictEqual(added.title, "Neuromancer");

      const [stored] = yield* bookshelf.listShelf(empty);
      assert.deepStrictEqual(stored, added);
    }).pipe(Effect.provide(writeLayer())),
  );
});
