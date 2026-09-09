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

  subgraph lib["@fabula-ts/core — written once, runs everywhere"]
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

**Read it in one sentence:** the blue box is written once and never changes; the green
boxes are interchangeable, so the same shelf UI works against a server, a local file, or
nothing at all.

That yellow interface is the whole design. If the UI called the server directly, the
library would only work in one setup — with the interface in between, a test swaps in a
fake, a browser swaps in the network, a server swaps in SQLite, and nothing above the
line notices.

---

## What you would actually write

```tsx
function AddBookForm({ shelfId }: { shelfId: ShelfId }) {
  const [result, addBook] = useAtom(atoms.addBook)

  return (
    <form onSubmit={() => addBook({ shelfId, title, authors })}>
      <button disabled={result._tag === "Loading"}>Add</button>
      {result._tag === "Failure" && <Error cause={result.cause} />}
    </form>
  )
}
```

No loading state to declare, no error handling to wire up, and **no refetching the
shelf** — the list updates itself, because reads and writes share invalidation tags
inside the library.

<details>
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

## Design decisions worth arguing about

The reasoning behind each, and what it was chosen over, is in [`docs/adr/`](docs/adr/).

| Question | Answer | Why |
| --- | --- | --- |
| Can a book be on two shelves? | Yes — each shelf keeps its own order | "Currently Reading" *and* "Sci-Fi" is the normal case, not an edge case. |
| How is order stored? | A sort key per book, not positions 1..n | Moving a book updates one row. Works identically in SQLite, Postgres, or a Notion property. |
| Can apps add fields to `Book`? | No — the schema is fixed | Making it customisable puts a type parameter in every function signature. Apps keep extra data in their own table, keyed by book id. |
| Who owns the database? | The app, not the library | A library that hardcodes its storage can only be used once. |
| Browser to server | Typed RPC, contract shared by import | Both sides are TypeScript, so they share one definition and cannot drift. |
| Accounts? | None. Two tokens: read, and read-write | One user. A user id threaded everywhere would be ceremony with no payoff today. |

---

## Packages

| Package | Published | Needs |
| --- | --- | --- |
| `@fabula-ts/core` | yes | `effect` only — safe in a browser |
| `@fabula-ts/sql` | yes | core + SQLite — server-side only |
| `apps/server` | no | core + sql |

## Development

```sh
bun install
bun run test      # vitest, with Effect's test helpers
bun run build     # tsdown; type declarations built by tsc
```

Effect is pinned at `4.0.0-rc.112`. `.vendor/effect` is a read-only checkout at that exact
commit, kept for reading the source — not part of the build.

> **Status:** design settled, implementation not started. Everything above describes the
> target; the first milestone is the core domain with in-memory storage.
