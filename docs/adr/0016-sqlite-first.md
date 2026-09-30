# 16. SQLite first, with the design held dialect-clean

Status: Accepted — 2026-09-29

## Context

The library should work over SQLite, Postgres and MySQL. Core `effect` makes that cheap in
principle: the repository is written against `SqlClient`, and the host provides a driver
layer (ADR 14). What is not cheap is the proof — three schemas, three constraint-violation
mappings, and a CI that stands up two database servers, in a repo that had no CI at all.

## Decision

Only SQLite is implemented and tested. The repository is written against `SqlClient`, never
against a driver, and dialect-specific SQL is confined to named branches rather than assumed
away. The conformance suite runs against any `SqlClient` layer, so a second dialect is a
driver, a schema and a run of the suite.

## Consequences

- Postgres and MySQL are each a small later PRD, not a rewrite.
- A reader will find dialect-branching machinery with one dialect behind it. That is
  deliberate, not abandoned work.
- Anything SQLite-only that reaches the repository is a defect against this ADR, even when
  it passes every test.
- The position column's collation is pinned explicitly rather than inherited. For a
  lowercase base-36 alphabet every mainstream collation agrees, so this is cheap insurance
  that makes the ordering guarantee visible rather than lucky.
