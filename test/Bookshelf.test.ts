import { assert, describe, it, layer } from "@effect/vitest";
import { Brand, DateTime, Effect, Layer, Schema } from "effect";
import { TestClock } from "effect/testing";
import { BookIds } from "../src/BookIds.ts";
import { Bookshelf, layer as bookshelfLayer } from "../src/Bookshelf.ts";
import { BookRepository } from "../src/BookRepository.ts";
import type { ShelfBook } from "../src/BookRepository.ts";
import { InvalidBook, ShelfNotFound } from "../src/Errors.ts";
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
 * The seeded store, recording every row it accepts in `stored`, so a test can see
 * a write that no listing would show, such as a book stored on no shelf.
 *
 * Each `storeBook` yields to other fibers before storing, so two adds started
 * together interleave between reading the last position and storing after it.
 */
const recording = (stored: Array<ShelfBook>) =>
  Layer.effect(
    BookRepository,
    Effect.gen(function* () {
      const repository = yield* BookRepository;
      return BookRepository.of({
        ...repository,
        storeBook: (row) =>
          Effect.yieldNow.pipe(
            Effect.andThen(repository.storeBook(row)),
            Effect.tap(() => Effect.sync(() => stored.push(row))),
          ),
      });
    }),
  ).pipe(Layer.provide(inMemoryLayer(seed)));

/**
 * A layer per write test, so one test's books never reach another, with time
 * fixed at the epoch: `addedAt` is then an assertable value rather than "now".
 */
const writeLayer = (stored: Array<ShelfBook> = []) =>
  Layer.merge(
    bookshelfLayer.pipe(Layer.provide([recording(stored), countingIds])),
    TestClock.layer(),
  );

layer(TestLayer)("Bookshelf.listShelf", (shared) => {
  shared.effect("lists a shelf's books in position order", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      const books = yield* bookshelf.listShelf(sciFi);
      assert.deepStrictEqual(
        books.map((book) => book.id),
        [dune.id, foundation.id, hyperion.id],
      );
    }),
  );

  shared.effect("lists an existing empty shelf as no books", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      const books = yield* bookshelf.listShelf(empty);
      assert.deepStrictEqual(books, []);
    }),
  );

  shared.effect("fails with ShelfNotFound for a missing shelf", () =>
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

  it.effect("fails with ShelfNotFound for a missing shelf, and stores nothing", () => {
    const stored: Array<ShelfBook> = [];
    return Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      const error = yield* Effect.flip(bookshelf.addBook(missing, draft("Neuromancer")));
      assert.instanceOf(error, ShelfNotFound);
      assert.strictEqual(error.shelfId, missing);
      assert.deepStrictEqual(stored, []);
    }).pipe(Effect.provide(writeLayer(stored)));
  });

  it.effect(
    "fails with InvalidBook for a draft the Book schema rejects, and stores nothing",
    () => {
      const stored: Array<ShelfBook> = [];
      return Effect.gen(function* () {
        const bookshelf = yield* Bookshelf;
        for (const invalid of [
          { title: "", authors: [] },
          { title: "Dune", authors: [""] },
          { title: "Dune", authors: [], rating: 7 },
        ]) {
          const error = yield* Effect.flip(bookshelf.addBook(sciFi, invalid));
          assert.instanceOf(error, InvalidBook, JSON.stringify(invalid));
        }
        assert.deepStrictEqual(stored, []);
      }).pipe(Effect.provide(writeLayer(stored)));
    },
  );

  it.effect("drops draft properties that Book does not have", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      // Passed through a variable, as form state would be: TypeScript allows the extra key.
      const withNotes = { title: "Neuromancer", authors: [], notes: "lent to Ana" };
      const added = yield* bookshelf.addBook(empty, withNotes);

      assert.notProperty(added, "notes");
      const [stored] = yield* bookshelf.listShelf(empty);
      assert.notProperty(stored, "notes");
    }).pipe(Effect.provide(writeLayer())),
  );

  it.effect("gives adds that run at the same time their own positions", () =>
    Effect.gen(function* () {
      const bookshelf = yield* Bookshelf;
      yield* Effect.all(
        [bookshelf.addBook(empty, draft("First")), bookshelf.addBook(empty, draft("Second"))],
        { concurrency: "unbounded" },
      );
      assert.deepStrictEqual(titles(yield* bookshelf.listShelf(empty)), ["First", "Second"]);
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
