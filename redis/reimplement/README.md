# Redis, rebuilt for learning

Build a small Go in-memory data server that makes these pieces explicit:

- a RESP-like request/response protocol;
- strings, hashes, lists, sets, and sorted sets;
- expiration and eviction;
- event-loop or goroutine-based connection handling;
- RDB-like snapshots and append-only recovery;
- basic pub/sub.

This is a learning implementation, not a Redis protocol replacement.
