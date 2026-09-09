# 2. Persistence is a port the host provides

Status: Accepted — 2026-09-08

## Context

A library that hardcodes IndexedDB, or a fetch client, or SQLite, can only be used in the
setup it was written for.

## Decision

Define `BookRepository` as a service tag. Ship an in-memory implementation for tests and
demos. Real storage is supplied by the host as a layer.

## Consequences

- Tests run against `it.layer(InMemoryBookRepository)` with no database.
- Every later decision about databases and transports becomes a layer swap.
- Two implementations exist from day one, so the interface is exercised, not theoretical.
