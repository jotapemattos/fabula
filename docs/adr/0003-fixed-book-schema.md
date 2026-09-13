# 3. `Book` is a fixed, closed schema

Status: Accepted — 2026-09-08

## Context

Hosts will want extra fields — a rating, a loan status, a personal note. The obvious
answer is to make the entity generic: `Bookshelf<A extends BookBase>`.

## Decision

No generic. One concrete `Book` schema: branded `BookId`, `title`, `authors`, optional
`isbn`, optional `coverUrl`, optional `rating`, `addedAt`.

`rating` was added on 2026-09-13, the first use of the escape hatch below: half stars from
0.5 to 5, with an absent key meaning unrated. It belongs to the book, not to a shelf.

## Consequences

- Every service, layer and atom signature stays readable, and so do inference errors.
- Fields can be added later; a type parameter could never be removed.
