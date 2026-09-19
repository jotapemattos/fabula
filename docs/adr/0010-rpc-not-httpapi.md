# 10. Typed RPC, with the contract in core

Status: Accepted — 2026-09-08

## Context

Two consumers: a React app that writes and a website that reads. Both are TypeScript, in
separate deployments. `HttpApi` offers REST semantics and OpenAPI; `RpcGroup` offers
function-call semantics.

## Decision

`RpcGroup` from `effect/unstable/rpc`. The contract lives in `fabula-ts/rpc`, which is
`effect`-only, so both sides import it.

## Consequences

- Typed errors survive end to end; no status-code translation.
- Worker and WebSocket transports are available later without contract changes.
- RPC calls are POSTs, so public reads are not CDN-cacheable. If that matters, a few plain
  cached `GET` routes get added to the same server rather than adopting `HttpApi` wholesale.
