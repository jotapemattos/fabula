# 8. Atoms are exported as a factory, not module-level constants

Status: Accepted — 2026-09-08

## Context

`Atom.runtime(layer)` binds a layer at definition time, but the host supplies the
repository layer (ADR 2). Module-level atoms would have to choose a layer before the host
has spoken.

## Decision

Export `makeBookshelfAtoms(layer)`, returning the atoms the library provides.

## Consequences

- Hosts call it once beside their existing layer wiring.
- Two embeddings on one page get independent state instead of sharing a singleton.
- Consumers must hold the result somewhere; we do not do it for them.
