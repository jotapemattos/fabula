/**
 * The conformance suite: what every `BookRepository` must do, whatever its storage.
 *
 * Cases are data, not test registrations (ADR 15). Each names a seed and an Effect
 * that checks the port's observable behaviour; the caller builds its own layer from
 * the seed and runs the Effect with whatever test runner it uses. A failed check
 * dies with `ConformanceFailure`, so any runner reports it as a failed test.
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { BookRepository } from "../BookRepository";
import type { ShelfBook } from "../BookRepository";
import type { BookshelfError } from "../Errors";
import { BookId, ShelfId } from "../Model";
import type { Book, ShelfEntry } from "../Model";
import { Position } from "../Position";

/**
 * The state a repository starts with.
 *
 * Shaped like storage: three flat collections. `shelves` is listed separately from
 * `entries` so that a shelf with no books still exists. Every implementation must
 * be able to start from a seed, since the port has no way to create shelves yet.
 */
export interface Seed {
  readonly shelves: ReadonlyArray<ShelfId>;
  readonly books: ReadonlyArray<Book>;
  readonly entries: ReadonlyArray<ShelfEntry>;
}

/**
 * One behaviour every `BookRepository` must have.
 *
 * Run `test` against a fresh layer built from `seed`. It succeeds when the
 * repository conforms, fails only with the closed error set when a repository call
 * fails unexpectedly, and dies with `ConformanceFailure` when a check does not hold.
 */
export interface ConformanceCase {
  readonly name: string;
  readonly seed: Seed;
  readonly test: Effect.Effect<void, BookshelfError, BookRepository>;
}

/** A conformance check that did not hold. The message says what was expected. */
export class ConformanceFailure extends Error {
  override readonly name = "ConformanceFailure";
}

const check = (condition: boolean, message: string): Effect.Effect<void> =>
  condition ? Effect.void : Effect.die(new ConformanceFailure(message));

/** Checks a listing by book ids in order, which says nothing about how rows are stored. */
const checkBooks = (
  shelfId: ShelfId,
  rows: ReadonlyArray<ShelfBook>,
  expected: ReadonlyArray<Book>,
): Effect.Effect<void> => {
  const actual = JSON.stringify(rows.map((row) => row.book.id));
  const wanted = JSON.stringify(expected.map((book) => book.id));
  return check(actual === wanted, `shelf ${shelfId}: expected ${wanted}, got ${actual}`);
};

const sciFi = Schema.decodeSync(ShelfId)("sci-fi");
const reading = Schema.decodeSync(ShelfId)("currently-reading");
const empty = Schema.decodeSync(ShelfId)("empty");
const missing = Schema.decodeSync(ShelfId)("missing");

const makeBook = (id: string, title: string): Book => ({
  id: Schema.decodeSync(BookId)(id),
  title,
  authors: [],
  addedAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
});

const dune = makeBook("dune", "Dune");
const foundation = makeBook("foundation", "Foundation");
const hyperion = makeBook("hyperion", "Hyperion");

const entry = (shelfId: ShelfId, book: Book, position: string): ShelfEntry => ({
  shelfId,
  bookId: book.id,
  position: Schema.decodeSync(Position)(position),
});

const positionOrder: ConformanceCase = {
  name: "lists a shelf's books in position order",
  seed: {
    shelves: [sciFi],
    books: [dune, foundation, hyperion],
    // Seeded out of order, so insertion order cannot pass for position order.
    entries: [entry(sciFi, hyperion, "t"), entry(sciFi, dune, "a"), entry(sciFi, foundation, "k")],
  },
  test: Effect.gen(function* () {
    const repository = yield* BookRepository;
    const rows = yield* repository.listShelfEntries(sciFi);
    yield* checkBooks(sciFi, rows, [dune, foundation, hyperion]);
  }),
};

const independentOrder: ConformanceCase = {
  name: "keeps each shelf's order independent",
  seed: {
    shelves: [sciFi, reading],
    books: [dune, foundation],
    // Seeded so insertion order differs from position order on sci-fi, which a
    // missing sort would expose.
    entries: [
      entry(sciFi, foundation, "t"),
      entry(reading, foundation, "a"),
      entry(sciFi, dune, "a"),
      entry(reading, dune, "t"),
    ],
  },
  test: Effect.gen(function* () {
    const repository = yield* BookRepository;
    yield* checkBooks(sciFi, yield* repository.listShelfEntries(sciFi), [dune, foundation]);
    yield* checkBooks(reading, yield* repository.listShelfEntries(reading), [foundation, dune]);
  }),
};

const bookOnTwoShelves: ConformanceCase = {
  name: "lists one book on every shelf it sits on",
  seed: {
    shelves: [sciFi, reading],
    books: [dune],
    entries: [entry(sciFi, dune, "k"), entry(reading, dune, "k")],
  },
  test: Effect.gen(function* () {
    const repository = yield* BookRepository;
    for (const shelfId of [sciFi, reading]) {
      const rows = yield* repository.listShelfEntries(shelfId);
      yield* checkBooks(shelfId, rows, [dune]);
      yield* check(
        rows.every((row) => row.entry.shelfId === shelfId),
        `shelf ${shelfId}: every row's entry should belong to the shelf that was listed`,
      );
    }
  }),
};

const emptyVersusMissing: ConformanceCase = {
  name: "tells an empty shelf from a missing one",
  seed: { shelves: [empty], books: [], entries: [] },
  test: Effect.gen(function* () {
    const repository = yield* BookRepository;

    yield* check(yield* repository.shelfExists(empty), `shelf ${empty} should exist`);
    yield* check(!(yield* repository.shelfExists(missing)), `shelf ${missing} should not exist`);

    const rows = yield* repository.listShelfEntries(empty);
    yield* check(rows.length === 0, `shelf ${empty}: expected no books, got ${rows.length}`);

    // Only a ShelfNotFound for this shelf passes: a success fails the check, and any
    // other error fails the case through the error channel.
    const reportedMissing = yield* repository.listShelfEntries(missing).pipe(
      Effect.as(false),
      Effect.catchTag("ShelfNotFound", (error) => Effect.succeed(error.shelfId === missing)),
    );
    yield* check(reportedMissing, `shelf ${missing}: expected ShelfNotFound naming it`);
  }),
};

/** Every conformance case. Run each against a fresh layer built from its own seed. */
export const cases: ReadonlyArray<ConformanceCase> = [
  positionOrder,
  independentOrder,
  bookOnTwoShelves,
  emptyVersusMissing,
];
