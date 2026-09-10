# 14. One package with subpath modules

Status: Accepted — 2026-09-10 — supersedes [ADR 12](0012-workspace-layout.md)

## Context

ADR 12 split the library in two so that a browser install would not pull down a database
driver. There is no such driver. `SqlClient` lives in core `effect`, which declares no
dependencies, and `@effect/sql-sqlite-bun` declares none either — `bun:sqlite` is a Bun
builtin, not an npm install. A repository written against `SqlClient` needs nothing but
`effect`; the application picks the driver layer.

## Decision

One package, `fabula-ts`, `effect` its only peer dependency:

| Module | Contents |
| --- | --- |
| `fabula-ts` | model, errors, ordering, the repository interface, the rules |
| `fabula-ts/sql` | the SQL implementation, written against `SqlClient` |
| `fabula-ts/atoms` | `makeBookshelfAtoms` |
| `fabula-ts/rpc` | the wire contract |
| `fabula-ts/testing` | the in-memory implementation |

Declare `sideEffects: false`. Subpaths are what keep server code out of a browser build;
this is the optimisation on top, stripping unused exports from a module that genuinely
was imported.

## Consequences

- One version, one changelog; core and SQL can never be out of step at a consumer.
- Server code stays out of browser builds by module resolution, not tree-shaking: an
  unimported subpath is never read, so no bundler heuristic has to get it right.
- Nothing stops a root-module file importing `sql/`. Two packages made that impossible;
  one package makes it a lint rule — with tree-shaking as the backstop if one slips past.
