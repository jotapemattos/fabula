# 12. Bun workspace, published under `@fabula-ts`

Status: Accepted — 2026-09-08

## Context

The SQL adapter binds `bun:sqlite`; the browser must never see it. The React app and the
website are separate deployments and cannot use workspace resolution.

## Decision

Bun workspace: `packages/core` and `packages/sql` published to npm, `apps/server` private.
Scope is `@fabula-ts` — `@fabula` was already taken on npm by an unrelated project.

## Consequences

- A browser host installs core alone and never pulls a database driver.
- The server sits in this repo so contract and handlers change together without a publish
  in between.
- The consuming apps install from npm, so contract changes reach them through a release.
