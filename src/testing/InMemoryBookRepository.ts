/**
 * A `BookRepository` held in memory, for tests and demos.
 *
 * State comes from a seed, since there is no operation to create shelves yet, and
 * is built fresh every time the layer is built, so tests never share it. Nothing
 * here can fail the way real storage does, so it never raises
 * `RepositoryUnavailable`.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { BookRepository } from "../BookRepository.ts";
import type { ShelfBook } from "../BookRepository.ts";
import { ShelfNotFound } from "../Errors.ts";
import type { ShelfId } from "../Model.ts";
import type { Seed } from "./Conformance.ts";

/**
 * A seed that describes state no real storage could hold.
 *
 * A broken seed is a mistake in the test that wrote it, so building the layer
 * dies with this rather than returning results that look plausible.
 */
export class InvalidSeed extends Error {
  override readonly name = "InvalidSeed";
}

/**
 * The repository's state: which shelves exist, and every entry already joined to
 * its book, so a row can never point at a book that is not there.
 */
interface State {
  readonly shelves: Set<ShelfId>;
  readonly rows: Array<ShelfBook>;
}

/**
 * Turns a seed into fresh state, joining each entry to its book on the way.
 *
 * Checking and joining are one step: a lookup that finds no book is the check that
 * fails, so no later lookup has to trust that it succeeded.
 */
const load = (seed: Seed): State => {
  const shelves = new Set(seed.shelves);
  const books = new Map(seed.books.map((book) => [book.id, book]));
  const placed = new Set<string>();
  const rows: Array<ShelfBook> = [];

  for (const entry of seed.entries) {
    if (!shelves.has(entry.shelfId)) {
      throw new InvalidSeed(`entry refers to unknown shelf ${JSON.stringify(entry.shelfId)}`);
    }
    const book = books.get(entry.bookId);
    if (book === undefined) {
      throw new InvalidSeed(`entry refers to unknown book ${JSON.stringify(entry.bookId)}`);
    }
    const key = JSON.stringify([entry.shelfId, entry.bookId]);
    if (placed.has(key)) {
      throw new InvalidSeed(
        `book ${JSON.stringify(entry.bookId)} is on shelf ${JSON.stringify(entry.shelfId)} more than once`,
      );
    }
    placed.add(key);
    rows.push({ entry, book });
  }

  return { shelves, rows };
};

const byPosition = (a: ShelfBook, b: ShelfBook): number =>
  a.entry.position < b.entry.position ? -1 : a.entry.position > b.entry.position ? 1 : 0;

/**
 * Builds a `BookRepository` layer starting from `seed`.
 *
 * Each build copies the seed into its own state. A seed with an entry for an
 * unknown shelf or book, or the same book twice on one shelf, dies with
 * `InvalidSeed` when the layer is built.
 */
export const layer = (seed: Seed): Layer.Layer<BookRepository> =>
  Layer.sync(BookRepository, () => {
    const { shelves, rows } = load(seed);

    return BookRepository.of({
      shelfExists: (shelfId) => Effect.sync(() => shelves.has(shelfId)),

      listShelfEntries: (shelfId) =>
        Effect.gen(function* () {
          if (!shelves.has(shelfId)) {
            return yield* new ShelfNotFound({ shelfId });
          }
          return rows.filter((row) => row.entry.shelfId === shelfId).toSorted(byPosition);
        }),

      lastPosition: (shelfId) =>
        Effect.gen(function* () {
          if (!shelves.has(shelfId)) {
            return yield* new ShelfNotFound({ shelfId });
          }
          const shelfRows = rows
            .filter((row) => row.entry.shelfId === shelfId)
            .toSorted(byPosition);
          const last = shelfRows.at(-1);
          return last === undefined ? Option.none() : Option.some(last.entry.position);
        }),
      storeBook: (row) =>
        Effect.gen(function* () {
          if (!shelves.has(row.entry.shelfId)) {
            return yield* new ShelfNotFound({ shelfId: row.entry.shelfId });
          }
          rows.push(row);
        }),
    });
  });
