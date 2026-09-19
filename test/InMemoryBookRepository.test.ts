import { assert, describe, it } from "@effect/vitest";
import { Cause, DateTime, Effect, Exit, Schema } from "effect";
import { BookRepository } from "../src/BookRepository.ts";
import { Book, BookId, ShelfEntry, ShelfId } from "../src/Model.ts";
import { InvalidSeed, layer } from "../src/testing/InMemoryBookRepository.ts";
import * as Conformance from "../src/testing/Conformance.ts";
import type { Seed } from "../src/testing/Conformance.ts";

// The port's contract is checked by the conformance suite. These tests cover only
// what is specific to the in-memory implementation: rejecting a broken seed.

const shelf = Schema.decodeSync(ShelfId)("shelf-1");
const unknownShelf = Schema.decodeSync(ShelfId)("unknown-shelf");

const book = Schema.decodeSync(Book)({
  id: Schema.decodeSync(BookId)("book-1"),
  title: "Dune",
  authors: ["Frank Herbert"],
  addedAt: DateTime.makeUnsafe("2026-09-14T10:00:00Z"),
});

const unknownBook = Schema.decodeSync(BookId)("unknown-book");

const entry = (overrides: Partial<Record<keyof ShelfEntry, string>> = {}): ShelfEntry =>
  Schema.decodeSync(ShelfEntry)({
    shelfId: shelf,
    bookId: book.id,
    position: "k",
    ...overrides,
  });

/** Builds the layer by using it, and returns how the build ended. */
const build = (seed: Seed) =>
  Effect.exit(
    Effect.gen(function* () {
      const repository = yield* BookRepository;
      return yield* repository.shelfExists(shelf);
    }).pipe(Effect.provide(layer(seed))),
  );

/** Asserts that building died with `InvalidSeed`, whose message contains `detail`. */
const assertInvalidSeed = (exit: Exit.Exit<unknown, unknown>, detail: string): void => {
  assert.isTrue(Exit.isFailure(exit), "the build should fail");
  if (Exit.isFailure(exit)) {
    assert.isTrue(Cause.hasDies(exit.cause), "the build should die, not fail with a typed error");
    assert.include(String(Cause.squash(exit.cause)), detail);
    assert.instanceOf(Cause.squash(exit.cause), InvalidSeed);
  }
};

describe("InMemoryBookRepository.layer", () => {
  it.effect("builds from a consistent seed", () =>
    Effect.gen(function* () {
      const exit = yield* build({
        shelves: [shelf],
        books: [book],
        entries: [entry()],
      });
      assert.isTrue(Exit.isSuccess(exit));
    }),
  );

  it.effect("rejects an entry on an unknown shelf", () =>
    Effect.gen(function* () {
      const exit = yield* build({
        shelves: [shelf],
        books: [book],
        entries: [entry({ shelfId: unknownShelf })],
      });
      assertInvalidSeed(exit, "unknown-shelf");
    }),
  );

  it.effect("rejects an entry for an unknown book", () =>
    Effect.gen(function* () {
      const exit = yield* build({
        shelves: [shelf],
        books: [book],
        entries: [entry({ bookId: unknownBook })],
      });
      assertInvalidSeed(exit, "unknown-book");
    }),
  );

  it.effect("rejects the same book twice on one shelf", () =>
    Effect.gen(function* () {
      const exit = yield* build({
        shelves: [shelf],
        books: [book],
        entries: [entry({ position: "k" }), entry({ position: "t" })],
      });
      assertInvalidSeed(exit, "more than once");
    }),
  );
});

describe("InMemoryBookRepository conformance", () => {
  for (const { name, seed, test } of Conformance.cases) {
    it.effect(name, () => test.pipe(Effect.provide(layer(seed))));
  }
});
