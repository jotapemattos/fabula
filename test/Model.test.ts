import { assert, describe, it } from "@effect/vitest";
import { DateTime, Schema } from "effect";
import { Book, BookId, ShelfEntry, ShelfId } from "../src/Model.ts";

const isBook = Schema.is(Book);
const isShelfEntry = Schema.is(ShelfEntry);

const bookId = Schema.decodeSync(BookId)("book-1");
const shelfId = Schema.decodeSync(ShelfId)("shelf-1");

const book: Book = {
  id: bookId,
  title: "Dune",
  authors: ["Frank Herbert"],
  isbn: "9780441013593",
  coverUrl: "https://example.com/dune.jpg",
  addedAt: DateTime.makeUnsafe("2026-09-13T10:00:00Z"),
};

const BookJson = Schema.toCodecJson(Book);

const acceptsShelfId = (id: ShelfId): ShelfId => id;

describe("BookId and ShelfId", () => {
  it("are distinct types", () => {
    // @ts-expect-error a BookId is not a ShelfId
    acceptsShelfId(bookId);
    acceptsShelfId(shelfId);
  });

  it("reject an empty id", () => {
    assert.isFalse(Schema.is(BookId)(""));
    assert.isFalse(Schema.is(ShelfId)(""));
  });
});

describe("Book", () => {
  it("accepts a complete book", () => {
    assert.isTrue(isBook(book));
  });

  it("accepts a book without the optional fields", () => {
    const { isbn: _isbn, coverUrl: _coverUrl, ...required } = book;
    assert.isTrue(isBook(required));
  });

  it("accepts a book with no authors", () => {
    assert.isTrue(isBook({ ...book, authors: [] }));
  });

  it("rejects an empty title", () => {
    assert.isFalse(isBook({ ...book, title: "" }));
  });

  it("rejects an empty author name", () => {
    assert.isFalse(isBook({ ...book, authors: [""] }));
  });

  it("rejects an optional field present as undefined", () => {
    assert.isFalse(isBook({ ...book, isbn: undefined }));
  });

  it("rejects an addedAt that is not a UTC DateTime", () => {
    assert.isFalse(isBook({ ...book, addedAt: new Date("2026-09-13T10:00:00Z") }));
  });

  it("survives a JSON round trip", () => {
    const json = JSON.parse(JSON.stringify(Schema.encodeSync(BookJson)(book)));
    assert.isString(json.addedAt);
    const decoded = Schema.decodeSync(BookJson)(json);
    assert.deepStrictEqual(Schema.encodeSync(BookJson)(decoded), Schema.encodeSync(BookJson)(book));
  });
});

describe("ShelfEntry", () => {
  const entry = { shelfId, bookId, position: "k" };

  it("accepts a well-formed entry", () => {
    assert.isTrue(isShelfEntry(entry));
  });

  it("rejects a malformed position", () => {
    for (const position of ["", "30", "A"]) {
      assert.isFalse(isShelfEntry({ ...entry, position }), JSON.stringify(position));
    }
  });
});
