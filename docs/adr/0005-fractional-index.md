# 5. Shelf order is a fractional index, not integer positions

Status: Accepted — 2026-09-08

## Context

Targets are SQLite now, possibly Postgres or Notion later. Options considered: an ordered
array of ids on the shelf, integer positions, or a sortable key per entry.

## Decision

Each `ShelfEntry` carries a sortable string `position`. Moving a book generates a key
between its new neighbours and updates one row.

## Consequences

- Reads are `ORDER BY position`; a move is a single-row update in any of the three stores.
- The array option would put order in a JSON column separate from the join table, where
  the two can drift; integer positions rewrite the tail on every move.
- We own one pure function: `between(a, b)`. It is property-tested.
- Rebalancing is deferred until it is a real problem.
