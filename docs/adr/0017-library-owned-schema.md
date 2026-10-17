# 17. The library owns the schema, and migrations never run implicitly

Status: Accepted — 2026-09-29

## Context

A SQL repository needs tables. Either the library ships migrations and owns the schema's
evolution, or it documents a schema for hosts to create. And whoever owns it must decide
when migrations run: on the repository layer being built, or only when asked.

## Decision

The library ships migrations and owns the schema. Tables are prefixed `fabula_`, and the
prefix is fixed, not configurable. Migrations run only through a layer the host composes
deliberately — never as a side effect of building the repository.

## Consequences

- Hosts get the same schema, so the same conformance suite means something for all of them.
- Building a repository does not create tables, which is the opposite of what most libraries
  do. It is deliberate: a read-only website opening the database must not be able to alter
  it, and two processes starting together must not race on migrating.
- The prefix keeps fabula's tables from colliding in a host's own database, and makes a
  later "configurable prefix" change non-breaking for the default.
- A host with strong opinions about its schema — extra indexes, its own migration tooling —
  is fighting this decision. The first host is us, so that trade is worth taking for now.
