# 6. A closed set of serialisable tagged errors

Status: Accepted — 2026-09-08

## Context

Host implementations of the port can fail in ways we cannot enumerate.

## Decision

`Schema.TaggedError` for `BookNotFound`, `ShelfNotFound`, and `RepositoryUnavailable(cause)`
as the wrapper for everything else.

## Consequences

- The UI can exhaustively `Match` and render a real message.
- `Schema.` rather than `Data.` because errors cross the RPC boundary and SSR hydration.
- Unknown backend failures have one honest home instead of widening the union.

## Amendment — 2026-09-19

`InvalidBook(reason)` joins the set. `addBook` builds a `Book` from caller input, and the
type of that input cannot rule out an empty title or a rating out of range. Storing such a
book would make every later read fail wherever rows are decoded (ADR 9), so `addBook`
decodes the book first and rejects it with this error. It is a failure the UI must handle,
not a defect: the input comes from a user.
