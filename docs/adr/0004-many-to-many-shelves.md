# 4. Books belong to many shelves, each with its own order

Status: Accepted — 2026-09-08

## Context

Exclusive membership — a book lives on exactly one shelf, like a file in a folder — is
simpler to model and to store.

## Decision

Many-to-many via an explicit `ShelfEntry { shelfId, bookId, position }`. Order is
per-shelf and first-class.

## Consequences

- "Currently Reading" *and* "Sci-Fi" on the same book works without a migration.
- One extra type up front; nothing recurring afterwards.
- Shelf atoms are naturally an `Atom.family` keyed by `ShelfId`.
