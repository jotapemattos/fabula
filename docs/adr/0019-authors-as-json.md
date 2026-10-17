# 19. A book's authors live as a JSON array on the book row

Status: Accepted — 2026-09-29

## Context

A book's authors are an ordered list of names. The relational default is a separate table
keyed by book id with an ordinal column; the alternative is one JSON column on the book row.

## Decision

Authors are stored as a JSON array in a column on the book row, encoded and decoded by the
row schema.

## Consequences

- A book stays one row and one write, which keeps `storeBook`'s promise — a book and its
  entry stored together, never half of each — a single statement pair in one transaction.
- Listing a shelf needs no extra join, and author order needs no ordinal column to duplicate
  what array order already says.
- Nothing can query by author. Nothing does, and ADR 3 fixed the book's shape so no field
  will appear that wants to. If that changes, backfilling a table from the column is a
  migration, not a redesign.
- The schema is less useful to an outside reader — a report or a hand-written query. Fabula
  is the only thing reading this database.
