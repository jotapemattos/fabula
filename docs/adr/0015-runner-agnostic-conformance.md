# 15. The conformance suite is runner-agnostic

Status: Accepted — 2026-09-13

## Context

`fabula-ts/testing` exports a conformance suite, so that any `BookRepository`
implementation — the in-memory one, the SQL one, a host's own — can prove it honours the
port's contract. A test suite normally imports a test runner. If the exported suite
imports Vitest or `@effect/vitest`, `fabula-ts` gains a third-party dependency, and
ADR 14 says it has none.

Everything the suite needs besides a runner is already in `effect`: `Effect` and `Layer`
to run cases, `Exit` and `Cause` to inspect outcomes, and `effect/testing` for
`FastCheck` and `TestClock`. `fast-check` is a dependency of `effect` itself, so using it
adds nothing to `fabula-ts`.

## Decision

The suite exports named test cases as data, not as test registrations:

```ts
interface ConformanceCase {
  readonly name: string;
  readonly test: Effect.Effect<void, unknown, BookRepository>;
}
```

Each case asks for `BookRepository` from context, and the caller gives each one a fresh
build of its layer, so cases never share state. A failed check is a defect raised by the
suite's own assertion helpers, not a runner's `expect`. The suite imports nothing but
`effect` and `fabula-ts` itself.

The caller decides how the cases run. Fabula's own tests loop over them with
`@effect/vitest`, which stays a dev dependency:

```ts
for (const { name, test } of conformance) {
  it.effect(name, () => test.pipe(Effect.provide(InMemoryBookRepository.layer(seed))));
}
```

Considered and rejected:

- **Import `@effect/vitest` in the suite, and declare it an optional peer dependency.**
  Callers would get `it.layer`-style registration for free. But the dependency list is
  no longer just `effect`, every consumer's package manager has to evaluate a peer
  dependency only testers need, and anyone using another runner cannot use the suite.
- **Publish the suite as a separate `@fabula-ts/testing` package.** `fabula-ts` stays
  dependency-free, but this brings back the second package ADR 14 removed, with its own
  version to keep in step. That buys nothing a runner-agnostic suite doesn't already
  give.

## Consequences

- ADR 14 holds unchanged: `effect` is still the only peer dependency and there are no
  runtime dependencies.
- The suite works under any runner that can run a promise — Vitest, `bun test`,
  `node:test` — through `Effect.runPromise`.
- Callers write a few lines of glue to register the cases. That glue is the same for
  every implementation, and it is the only thing an implementer adapts.
- The suite can't use a runner's matchers, snapshots or per-test hooks. Assertions are
  plain Effect code, and a failure message is only as good as the helper that raised it.
- Adding a case is a change to exported data. Implementers get it by upgrading, without
  editing their test files.
