# fabula

**A bookshelf you can embed in any TypeScript app.**

Store books, organise them onto shelves, keep them in the order you arranged them.

It ships as a *library*, not an app — so the same code runs in a browser talking to a
server, on a server talking straight to SQLite, or entirely in memory inside a test.
Built with [Effect](https://effect.website). No React dependency; React only shows up
when an app decides to render a shelf.

---

## The big picture

```mermaid
flowchart TB
  subgraph apps["Apps that use it"]
    direction LR
    react["<b>React app</b><br/>add · reorder · remove"]
    site["<b>Website</b><br/>display only"]
  end

  subgraph lib["fabula-ts — written once, runs everywhere"]
    direction TB
    atoms["<b>Atoms</b><br/>what the UI subscribes to.<br/>Refresh themselves when data changes."]
    rules["<b>Bookshelf rules</b><br/>add · move · remove · list<br/><i>a book can be on many shelves, each in its own order</i>"]
    seam["<b>BookRepository</b><br/>an interface: <i>“something can store books”</i><br/>— and nothing more"]
    atoms --> rules --> seam
  end

  subgraph store["Storage — pick one, swap freely"]
    direction LR
    mem["<b>In memory</b><br/><i>tests</i>"]
    net["<b>Over the network</b><br/><i>browser</i>"]
    sql["<b>SQLite</b><br/><i>server</i>"]
  end

  server["<b>Server</b><br/>small Bun process<br/>owns the database"]
  db[("books.db")]

  react -->|"read + write"| atoms
  site -->|"read only"| atoms
  seam --> mem
  seam --> net
  seam --> sql
  net -.->|"typed RPC over HTTP"| server
  server --> sql
  sql --> db

  classDef app fill:#fff7ed,stroke:#ea580c,stroke-width:2px,color:#7c2d12
  classDef core fill:#eef2ff,stroke:#4f46e5,stroke-width:2px,color:#1e1b4b
  classDef face fill:#fefce8,stroke:#ca8a04,stroke-width:3px,color:#713f12
  classDef impl fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#064e3b
  classDef srv fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d
  class react,site app
  class atoms,rules core
  class seam face
  class mem,net,sql impl
  class server,db srv
```

---

<summary>How that self-refresh works</summary>

```mermaid
sequenceDiagram
  autonumber
  participant C as Component
  participant A as Atoms
  participant R as Bookshelf rules
  participant S as Storage

  Note over A: the shelf list is tagged "shelf #42"
  C->>A: add this book to shelf #42
  A->>R: addBook(#42, book)
  R->>S: store it
  Note over R: this operation is also tagged "shelf #42"
  R-->>A: anything tagged "shelf #42" is now stale
  A->>R: re-fetch shelf #42
  A-->>C: re-render with the new book
```

Reads and writes carry the same tags, so a write automatically refreshes every read it
affected. Nothing has to remember to do it by hand.
</details>

---

## Packages

One package, `fabula-ts`, with `effect` as its only peer dependency and no dependencies
at all. Import only what you need:

| Module | Contents |
| --- | --- |
| `fabula-ts` | model, errors, ordering, the repository interface, the rules |
| `fabula-ts/sql` | the SQL implementation, written against `SqlClient` — no database driver |
| `fabula-ts/atoms` | `makeBookshelfAtoms` |
| `fabula-ts/rpc` | the wire contract |
| `fabula-ts/testing` | the in-memory implementation |

A browser app importing `fabula-ts` never resolves `fabula-ts/sql`, so server-only code
stays out of the build by module resolution. `sideEffects: false` strips unused exports
on top of that.

`apps/server` stays private and picks the driver layer — `@effect/sql-sqlite-bun` today,
Postgres or libSQL later, without the library changing.
