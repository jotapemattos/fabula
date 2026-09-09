# Architecture decision records

Decisions taken while designing fabula, newest last. Each records what was chosen, what it
was chosen over, and what it costs.

| # | Decision |
| --- | --- |
| [1](0001-headless-core.md) | The core depends on `effect` and nothing else |
| [2](0002-repository-port.md) | Persistence is a port the host provides |
| [3](0003-fixed-book-schema.md) | `Book` is a fixed, closed schema |
| [4](0004-many-to-many-shelves.md) | Books belong to many shelves, each with its own order |
| [5](0005-fractional-index.md) | Shelf order is a fractional index |
| [6](0006-closed-error-set.md) | A closed set of serialisable tagged errors |
| [7](0007-reactivity-keys.md) | Invalidation lives in the domain, via Reactivity keys |
| [8](0008-atom-factory.md) | Atoms are exported as a factory |
| [9](0009-port-is-the-seam.md) | The client/server boundary sits at the port |
| [10](0010-rpc-not-httpapi.md) | Typed RPC, with the contract in core |
| [11](0011-single-user-auth.md) | Two static tokens; no identity in the domain |
| [12](0012-workspace-layout.md) | Bun workspace, published under `@fabula-ts` |
| [13](0013-toolchain.md) | Bun, Vitest, tsdown, changesets, Effect pinned |
