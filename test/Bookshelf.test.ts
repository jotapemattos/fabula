import { assert, layer } from "@effect/vitest";
import { DateTime, Effect, Layer, Schema } from "effect";
import { Bookshelf, layer as bookshelfLayer } from "../src/Bookshelf.ts";
import { ShelfNotFound } from "../src/Errors.ts";
import { Book, BookId, ShelfEntry, ShelfId } from "../src/Model.ts";
import { layer as inMemoryLayer } from "../src/testing/InMemoryBookRepository.ts";

const sciFi = Schema.decodeSync(ShelfId)("sci-fi");
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

// Every test only reads, so one layer is shared across them.
const TestLayer = bookshelfLayer.pipe(
  Layer.provide(
    inMemoryLayer({
      shelves: [sciFi, empty],
      books: [dune, foundation, hyperion],
      // Seeded out of order, so insertion order cannot pass for position order.
      entries: [
        entry(sciFi, hyperion, "t"),
        entry(sciFi, dune, "a"),
        entry(sciFi, foundation, "k"),
      ],
    }),
  ),
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
