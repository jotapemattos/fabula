# 7. Invalidation lives in the domain, via Reactivity keys

Status: Accepted — 2026-09-08

## Context

After adding a book, something must refresh the shelf. The alternative is components
calling `useAtomRefresh` after each mutation.

## Decision

Reads are `Reactivity.query(effect, { shelves: [id] })`; writes are `Reactivity.mutation`
with matching keys.

## Consequences

- Invalidation is a property of the operation, not of whichever component remembered.
- Adding an operation means choosing its keys — a decision made once, in one place.
- Depends on `Reactivity`, which is unstable API in this Effect RC.
