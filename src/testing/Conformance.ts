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
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { BookRepository } from "../BookRepository";
import type { ShelfBook } from "../BookRepository";
import type { BookshelfError } from "../Errors";
import { BookId, ShelfId } from "../Model";
import type { Book, ShelfEntry } from "../Model";
import { between, Position } from "../Position";

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

/** Never seeded: the write cases store it, so finding it proves the write happened. */
const neuromancer = makeBook("neuromancer", "Neuromancer");

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

const storesBookAndEntry: ConformanceCase = {
  name: "stores a book with its entry, and reads both back",
  seed: {
    shelves: [sciFi],
    books: [dune, foundation],
    // Seeded out of order, so the books already there must be sorted by position.
    // The stored book is also inserted last: where it lands says nothing about order.
    entries: [entry(sciFi, foundation, "k"), entry(sciFi, dune, "a")],
  },
  test: Effect.gen(function* () {
    const repository = yield* BookRepository;
    const last = yield* repository.lastPosition(sciFi);
    yield* repository.storeBook({
      book: neuromancer,
      entry: {
        shelfId: sciFi,
        bookId: neuromancer.id,
        position: between(Option.getOrUndefined(last), undefined),
      },
    });

    const rows = yield* repository.listShelfEntries(sciFi);
    yield* checkBooks(sciFi, rows, [dune, foundation, neuromancer]);

    // The book itself must come back, not only an entry pointing at its id.
    const stored = rows.at(-1)?.book;
    yield* check(
      stored?.title === neuromancer.title,
      `shelf ${sciFi}: expected the stored book's title, got ${JSON.stringify(stored?.title)}`,
    );

    // Only a ShelfNotFound for this shelf passes: a success fails the check, and any
    // other error fails the case through the error channel.
    const reportedMissing = yield* repository
      .storeBook({
        book: hyperion,
        entry: { shelfId: missing, bookId: hyperion.id, position: between(undefined, undefined) },
      })
      .pipe(
        Effect.as(false),
        Effect.catchTag("ShelfNotFound", (error) => Effect.succeed(error.shelfId === missing)),
      );
    yield* check(reportedMissing, `shelf ${missing}: expected ShelfNotFound naming it`);
  }),
};

const lastPositionFollowsOrder: ConformanceCase = {
  name: "reports the last position in order, and none for an empty shelf",
  seed: {
    shelves: [sciFi, empty],
    books: [dune, foundation, hyperion],
    // Seeded out of order: the entry added last is not the one that sorts last.
    entries: [entry(sciFi, hyperion, "t"), entry(sciFi, dune, "a"), entry(sciFi, foundation, "k")],
  },
  test: Effect.gen(function* () {
    const repository = yield* BookRepository;

    // Compared against the listing's own last row, never against a literal key.
    const rows = yield* repository.listShelfEntries(sciFi);
    const last = yield* repository.lastPosition(sciFi);
    yield* check(
      Option.getOrUndefined(last) === rows.at(-1)?.entry.position,
      `shelf ${sciFi}: the last position should be the position of the last book listed`,
    );

    yield* check(
      Option.isNone(yield* repository.lastPosition(empty)),
      `shelf ${empty}: an existing shelf with no books should have no last position`,
    );

    // A book stored past the end becomes the shelf's new last position.
    const appended = between(Option.getOrUndefined(last), undefined);
    yield* repository.storeBook({
      book: neuromancer,
      entry: { shelfId: sciFi, bookId: neuromancer.id, position: appended },
    });
    yield* check(
      Option.getOrUndefined(yield* repository.lastPosition(sciFi)) === appended,
      `shelf ${sciFi}: the last position should follow the newest entry`,
    );

    const reportedMissing = yield* repository.lastPosition(missing).pipe(
      Effect.as(false),
      Effect.catchTag("ShelfNotFound", (error) => Effect.succeed(error.shelfId === missing)),
    );
    yield* check(reportedMissing, `shelf ${missing}: expected ShelfNotFound naming it`);
  }),
};

const duneOnSciFi = entry(sciFi, dune, "k");

const refusesRowThatIsNotNew: ConformanceCase = {
  name: "refuses a row whose book id or position is already taken",
  seed: { shelves: [sciFi], books: [dune], entries: [duneOnSciFi] },
  test: Effect.gen(function* () {
    const repository = yield* BookRepository;

    // How it is refused is up to the storage (a defect, or a wrapped constraint
    // violation); only that it is refused, and nothing changes, is checked.
    const sameId = yield* Effect.exit(
      repository.storeBook({
        book: { ...dune, title: "Dune, again" },
        entry: {
          shelfId: sciFi,
          bookId: dune.id,
          position: between(duneOnSciFi.position, undefined),
        },
      }),
    );
    yield* check(
      Exit.isFailure(sameId),
      "storing a book id that is already stored should be refused",
    );

    const samePosition = yield* Effect.exit(
      repository.storeBook({
        book: neuromancer,
        entry: { shelfId: sciFi, bookId: neuromancer.id, position: duneOnSciFi.position },
      }),
    );
    yield* check(
      Exit.isFailure(samePosition),
      `storing at a position already taken on shelf ${sciFi} should be refused`,
    );

    const rows = yield* repository.listShelfEntries(sciFi);
    yield* checkBooks(sciFi, rows, [dune]);
    yield* check(
      rows[0]?.book.title === dune.title,
      `shelf ${sciFi}: the book already stored should be unchanged`,
    );
  }),
};

/** Every conformance case. Run each against a fresh layer built from its own seed. */
export const cases: ReadonlyArray<ConformanceCase> = [
  positionOrder,
  independentOrder,
  bookOnTwoShelves,
  emptyVersusMissing,
  storesBookAndEntry,
  lastPositionFollowsOrder,
  refusesRowThatIsNotNew,
];
