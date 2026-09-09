# 1. The core depends on `effect` and nothing else

Status: Accepted — 2026-09-08

## Context

The library must be embeddable in a React app, but React is not the only possible host,
and a domain that imports React cannot be tested without rendering.

## Decision

`@fabula-ts/core` depends on `effect` alone. `Atom` lives in core Effect
(`effect/unstable/reactivity/Atom`), so even the reactive layer needs no React.
`@effect/atom-react` is the *host's* dependency, not ours.

## Consequences

- Core is testable with no DOM and no renderer.
- Vue and Solid hosts work through the same registry.
- We do not ship `useBookshelf()`-style hooks; hosts call `useAtomValue` themselves.
