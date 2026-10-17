# 18. Optimistic positions: storage refuses a taken position, the bookshelf retries

Status: Accepted — 2026-09-29 — amends the concurrency approach taken in FAB-8

## Context

Placing a book at the end of a shelf reads the last position and then stores after it. Two
adds can read the same position and compute the same key. FAB-8 closed that window with a
one-permit semaphore inside `Bookshelf`, which serialised every add in the process — across
all shelves — and, because the atom's write is uninterruptible, made waiting for the permit
uninterruptible too. Storage shared between processes was never covered by it at all.

## Decision

The lock goes. The schema carries a unique constraint on shelf and position, every
repository refuses a taken position, and the bookshelf re-reads the last position and retries
a bounded number of times. Exhausting the retries is reported as storage being unavailable.

## Consequences

- Adds to different shelves no longer wait for each other, and a process-level stall no
  longer blocks every writer.
- Cross-process races are covered by the same mechanism, because the enforcer is the database
  rather than an in-process permit.
- The in-memory repository stops treating a taken position as a defect and reports the same
  retryable failure. Two fibers interleaving in memory is normal concurrency, not a bug.
- "Position taken" stays private between storage and the bookshelf: it never appears in
  `addBook`'s signature, so the closed error set of ADR 6 is unchanged.
- Under heavy contention on one shelf, an add pays extra reads. With one writer that does not
  arise; if it ever does, the answer is a position strategy that does not read-then-write,
  not a lock.
