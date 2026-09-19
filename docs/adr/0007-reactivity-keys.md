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

## Amendment — 2026-09-19

Reads and writes use different forms of the same key. A read of one shelf registers with
the record `{ shelves: [shelfId] }`; `addBook` invalidates the array `["shelves:<shelfId>"]`.

`Reactivity` hashes a record as the group *and* each id — `"shelves"` and
`"shelves:sci-fi"` — on registration and on invalidation alike. Using the record on both
sides therefore invalidates `"shelves"`, under which every shelf's readers are also
registered, so adding to one shelf re-read all of them, and the shelf written to emitted
twice. The array form hashes only what it names, so the write reaches exactly the readers
of that shelf.

Readers keep the record form on purpose: they stay registered under the group, so a later
operation spanning shelves can still refresh all of them at once with `{ shelves: [] }`.

`Reactivity.query` returns a `Queue.Dequeue`, not a value, so the query is its own member:
`listShelf` remains the one-shot read and `shelfChanges` is the subscription, built with
`Reactivity.stream`. The keys live in `Bookshelf` either way; `makeBookshelfAtoms` names
none of them.
