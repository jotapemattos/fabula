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
