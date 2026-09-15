import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ShelfId, Book } from "./Model";
import type { RepositoryUnavailable, ShelfNotFound } from "./Errors";
import { BookRepository } from "./BookRepository";

export class Bookshelf extends Context.Service<
  Bookshelf,
  {
    readonly listShelf: (
      shelfId: ShelfId,
    ) => Effect.Effect<ReadonlyArray<Book>, ShelfNotFound | RepositoryUnavailable>;
  }
>()("fabula-ts/Bookshelf") {}

export const layer = Layer.effect(
  Bookshelf,
  Effect.gen(function* () {
    const repository = yield* BookRepository;
    return Bookshelf.of({
      listShelf: (shelfId) =>
        repository
          .listShelfEntries(shelfId)
          .pipe(Effect.map((rows) => rows.map((row) => row.book))),
    });
  }),
);
