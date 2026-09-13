import * as Schema from "effect/Schema";
import { Position } from "./Position";

export const BookId = Schema.NonEmptyString.pipe(Schema.brand("BookId"));
export type BookId = typeof BookId.Type;

export const ShelfId = Schema.NonEmptyString.pipe(Schema.brand("ShelfId"));
export type ShelfId = typeof ShelfId.Type;

export const Book = Schema.Struct({
  id: BookId,
  title: Schema.NonEmptyString,
  authors: Schema.Array(Schema.NonEmptyString),
  isbn: Schema.optionalKey(Schema.String),
  coverUrl: Schema.optionalKey(Schema.String),
  addedAt: Schema.DateTimeUtc,
});

export type Book = typeof Book.Type;

export const ShelfEntry = Schema.Struct({
  shelfId: ShelfId,
  bookId: BookId,
  position: Position,
});

export type ShelfEntry = typeof ShelfEntry.Type;
