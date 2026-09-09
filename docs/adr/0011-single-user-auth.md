# 11. Two static tokens; no identity in the domain

Status: Accepted — 2026-09-08

## Context

One user, two consumers with different needs: the React app writes, the website only
reads. The server is reachable from the internet.

## Decision

A read-only token and a read-write token, checked in `RpcMiddleware`. No `userId` in
schemas, SQL, or atoms. The website's *server* holds the read token; visitors never see it.

## Consequences

- The website cannot add books. That is intended.
- Multi-user later is a scoping concern at the repository boundary, not a domain rewrite.
- If the React app becomes publicly reachable, its write token is exposed and this ADR
  must be revisited — a browser cannot keep a secret.
