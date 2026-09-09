# 9. The client/server boundary sits at the port, not the wire

Status: Accepted — 2026-09-08

## Context

Books must sync across the user's devices, so a server owns the database and the browser
talks to it. The atoms could be built on an RPC client directly.

## Decision

Keep `BookRepository` as the seam. Three implementations: in-memory, SQL, and an
RPC-client used by browsers.

## Consequences

- The atoms never learn whether a server exists; local-first with
  `@effect/sql-sqlite-wasm` would need no change above the port.
- Atoms and rules stay testable by layer swap, with no transport in the loop.
- Cost: the port and the RPC contract are maintained in parallel, and new operations are
  edited in more than one place.
