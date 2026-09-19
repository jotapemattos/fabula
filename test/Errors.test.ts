import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { BookNotFound, InvalidBook, RepositoryUnavailable, ShelfNotFound } from "../src/Errors.ts";
import type { BookshelfError } from "../src/Errors.ts";
import { BookId, ShelfId } from "../src/Model.ts";

const shelfId = Schema.decodeSync(ShelfId)("shelf-1");
const bookId = Schema.decodeSync(BookId)("book-1");
const missing = Schema.decodeSync(ShelfId)("missing");

/** Sends a JSON-encoded value through JSON text and back, as RPC and SSR hydration would. */
const throughJsonText = (encoded: unknown): unknown => JSON.parse(JSON.stringify(encoded));

const ShelfNotFoundJson = Schema.toCodecJson(ShelfNotFound);
const BookNotFoundJson = Schema.toCodecJson(BookNotFound);
const RepositoryUnavailableJson = Schema.toCodecJson(RepositoryUnavailable);
const InvalidBookJson = Schema.toCodecJson(InvalidBook);

/** Exhaustive over the union: adding an error without handling it here fails to compile. */
const describeError = (error: BookshelfError): string => {
  switch (error._tag) {
    case "ShelfNotFound":
      return `shelf ${error.shelfId}`;
    case "BookNotFound":
      return `book ${error.bookId}`;
    case "InvalidBook":
      return `invalid: ${error.reason}`;
    case "RepositoryUnavailable":
      return "storage";
  }
};

describe("ShelfNotFound", () => {
  const error = new ShelfNotFound({ shelfId });

  it("is tagged and names the missing shelf", () => {
    assert.strictEqual(error._tag, "ShelfNotFound");
    assert.instanceOf(error, Error);
    assert.include(error.message, "shelf-1");
  });

  it.effect("fails an Effect with its fields intact", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(Effect.fail(error));
      assert.instanceOf(failure, ShelfNotFound);
      assert.strictEqual(failure.shelfId, shelfId);
    }),
  );

  it("survives a JSON round trip", () => {
    const json = throughJsonText(Schema.encodeSync(ShelfNotFoundJson)(error));
    const decoded = Schema.decodeUnknownSync(ShelfNotFoundJson)(json);
    assert.instanceOf(decoded, ShelfNotFound);
    assert.strictEqual(decoded.shelfId, shelfId);
  });
});

describe("BookNotFound", () => {
  const error = new BookNotFound({ bookId });

  it("is tagged and names the missing book", () => {
    assert.strictEqual(error._tag, "BookNotFound");
    assert.instanceOf(error, Error);
    assert.include(error.message, "book-1");
  });

  it.effect("fails an Effect with its fields intact", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(Effect.fail(error));
      assert.instanceOf(failure, BookNotFound);
      assert.strictEqual(failure.bookId, bookId);
    }),
  );

  it("survives a JSON round trip", () => {
    const json = throughJsonText(Schema.encodeSync(BookNotFoundJson)(error));
    const decoded = Schema.decodeUnknownSync(BookNotFoundJson)(json);
    assert.instanceOf(decoded, BookNotFound);
    assert.strictEqual(decoded.bookId, bookId);
  });
});

describe("InvalidBook", () => {
  const error = new InvalidBook({ reason: "title must not be empty" });

  it("is tagged and carries the reason", () => {
    assert.strictEqual(error._tag, "InvalidBook");
    assert.instanceOf(error, Error);
    assert.include(error.message, "title must not be empty");
  });

  it("survives a JSON round trip", () => {
    const json = throughJsonText(Schema.encodeSync(InvalidBookJson)(error));
    const decoded = Schema.decodeUnknownSync(InvalidBookJson)(json);
    assert.instanceOf(decoded, InvalidBook);
    assert.strictEqual(decoded.reason, "title must not be empty");
  });
});

describe("RepositoryUnavailable", () => {
  const error = new RepositoryUnavailable({
    cause: new Error("connection refused: db.internal"),
  });

  it("is tagged and keeps backend details out of its message", () => {
    assert.strictEqual(error._tag, "RepositoryUnavailable");
    assert.instanceOf(error, Error);
    assert.notInclude(error.message, "db.internal");
  });

  it.effect("fails an Effect with its fields intact", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(Effect.fail(error));
      assert.instanceOf(failure, RepositoryUnavailable);
    }),
  );

  it("keeps an Error cause's message across a JSON round trip", () => {
    const json = throughJsonText(Schema.encodeSync(RepositoryUnavailableJson)(error));
    const decoded = Schema.decodeUnknownSync(RepositoryUnavailableJson)(json);
    assert.instanceOf(decoded, RepositoryUnavailable);
    assert.instanceOf(decoded.cause, Error);
    assert.strictEqual((decoded.cause as Error).message, "connection refused: db.internal");
  });

  it("carries a non-Error cause across a JSON round trip", () => {
    const timeout = new RepositoryUnavailable({ cause: "timeout" });
    const json = throughJsonText(Schema.encodeSync(RepositoryUnavailableJson)(timeout));
    const decoded = Schema.decodeUnknownSync(RepositoryUnavailableJson)(json);
    assert.strictEqual(decoded.cause, "timeout");
  });
});

describe("BookshelfError", () => {
  /** The way operations raise these errors: yielded directly, no `Effect.fail`. */
  const findShelf = (requested: ShelfId) =>
    Effect.gen(function* () {
      if (requested !== shelfId) {
        return yield* new ShelfNotFound({ shelfId: requested });
      }
      return requested;
    });

  it.effect("can be yielded directly inside Effect.gen", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(findShelf(missing));
      assert.instanceOf(failure, ShelfNotFound);
      assert.strictEqual(failure.shelfId, missing);
      assert.strictEqual(yield* findShelf(shelfId), shelfId);
    }),
  );

  it("can be matched exhaustively on _tag", () => {
    assert.strictEqual(describeError(new ShelfNotFound({ shelfId })), "shelf shelf-1");
    assert.strictEqual(describeError(new BookNotFound({ bookId })), "book book-1");
    assert.strictEqual(describeError(new InvalidBook({ reason: "empty" })), "invalid: empty");
    assert.strictEqual(describeError(new RepositoryUnavailable({ cause: "x" })), "storage");
  });
});
