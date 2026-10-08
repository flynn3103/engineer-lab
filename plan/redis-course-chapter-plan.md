# Redis Course Chapter Plan (11 chapters)

## Objective
Rewrite `techstack/redis/01-redis-internals-end-to-end.html` in the problem-based format. The course problem is one Redis serving sessions, carts, a leaderboard and an order-event queue for a marketplace, from one node up to a cluster. Pin Redis 7.2+, using listpack naming.

## Source coverage
- **Docs:** redis.io/docs/latest (verify each path when writing):
  - RESP protocol spec
  - pipelining
  - transactions
  - key eviction
  - EXPIRE command page
  - persistence
  - replication
  - high availability with Sentinel
  - scaling with Redis Cluster
  - cluster specification
  - Streams
  - latency diagnosis
  - SLOWLOG
  - memory optimisation
  - CONFIG parameters
- **Source code** (redis/redis, verify at the 7.2 tag): src/ae.c, networking.c, server.c, db.c, object.c, t_hash.c, t_zset.c, expire.c, evict.c, lazyfree.c, aof.c, rdb.c, replication.c, multi.c, sentinel.c, cluster_legacy.c (cluster.c before 7.2), t_stream.c, slowlog.c.

## Design constraints
- The count of 11 comes from the 10 old chapters plus "Command cost and the single thread", which is the old ch0 extra "What each command costs".
- The old extra "Mini redis-cli" becomes the ch2 playground.
- The old scenarios fold in: "insert → update → delete" into ch2/ch3, and "primary failure (async replication)" into ch8.
- Order: protocol and executor → per-command cost → data model → lifetime → memory → durability → copies → atomic groups → HA → sharding → streams.
- `archSteps` only in ch0.

## Chapters

### ch0 · RESP and the Event Loop (`s:'RESP · event loop · one executor'`, pg `resp`, archSteps)
- **Source:** RESP spec; ae.c and networking.c (`processInputBuffer`).
- **Problem:** Two services each send 10,000 `INCR` on a counter. A custom proxy splits TCP packets mid-command, and the counter ends wrong.
- **Predict:** "A request arrives split across 3 TCP reads. When does Redis execute it?"
  - Answer: only after the full frame is parsed.
- **Core idea:** Length-prefixed frames make any byte safe. One thread runs complete commands one at a time, so each command is atomic without locks.
- **Mechanism:**
  - RESP arrays and bulk strings;
  - per-client query buffer;
  - the ae event loop (epoll/kqueue);
  - command dispatch;
  - output buffers;
  - io-threads do I/O only.
- **archSteps modes:** "one complete frame" and "fragmented frame".
- **Playground:**
  - Controls: input bytes of one or two commands; slider for TCP chunk size 1–32; seg for clients 1–3 interleaving.
  - Stats: frames completed, commands executed, partial-buffer bytes, final counter vs expected.
- **Common:**
  1. A slow Pub/Sub subscriber hits `client-output-buffer-limit pubsub` and is disconnected.
  2. `ERR max number of clients reached`. Fix: `maxclients` and pooling.
  3. A buggy client sends a malformed frame: `ERR Protocol error: …` and the connection closes.

### ch1 · Command Cost and the Single Thread (`s:'O(1) vs O(N) · SLOWLOG · lazyfree'`, pg `cost`)
- **Source:** SLOWLOG and LATENCY docs; command pages (time complexity); lazyfree.c; `lazyfree-lazy-user-del`.
- **Problem:** Every client times out for 2 s at 03:00 (illustrative). One cron job ran `KEYS session:*`.
- **Predict:** "One client runs `KEYS *` over 5M keys. What happens to a concurrent `GET`?"
  - Answer: it waits until KEYS finishes.
- **Core idea:** With one executor, the cost of any command is everyone's latency. Prefer O(1) or bounded work, cursor iteration and background freeing.
- **Mechanism:**
  - complexity per command;
  - SCAN cursors;
  - big keys;
  - `UNLINK` / lazyfree;
  - SLOWLOG and LATENCY monitor;
  - Lua/Functions blocking.
- **Playground:**
  - Controls: queue of client commands (GET×N plus one heavy command: KEYS / SCAN COUNT 100 / DEL bigkey / UNLINK bigkey / long Lua); slider for key count.
  - Stats: p99 latency of the GETs, max blocking time, SLOWLOG entries.
- **Common:**
  1. `KEYS *` blocks the server. Fix: `SCAN`.
  2. `DEL` of a multi-million-element key blocks. Fix: `UNLINK`/lazyfree.
  3. A long script: `BUSY Redis is busy running a script. You can only call SCRIPT KILL or SHUTDOWN NOSAVE.`

### ch2 · Typed Keyspace and Encodings (`s:'types · listpack · WRONGTYPE'`, pg `keyspace`)
- **Source:** data types docs; object.c and t_hash.c; config `hash-max-listpack-entries`, `hash-max-listpack-value`, `zset-max-listpack-entries`.
- **Problem:** A cart, a leaderboard and a session share one keyspace. After a deploy, cart reads fail and memory jumps 3× (illustrative).
- **Predict:** "A hash grows from 100 to 200 fields with the default config. What changes?"
  - Answer: its encoding converts from listpack to hashtable and memory per field rises.
- **Core idea:** Every value has a type with its own structure and commands. The type is checked before a command touches data, and small values use compact encodings.
- **Mechanism:**
  - redisObject type and encoding;
  - listpack versus hashtable/skiplist;
  - conversion thresholds;
  - `OBJECT ENCODING`, `TYPE`, `MEMORY USAGE`.
- **Playground** (the old "Mini redis-cli", a scripted CLI over a fixed keyspace):
  - Controls: input of commands from an allow-list (TYPE, OBJECT ENCODING, HSET, HGETALL, ZADD, ZRANGE, INCR, SET, GET, MEMORY USAGE); Reset.
  - Stats: per-key type and encoding, illustrative bytes.
  - Error replies use the real strings.
- **Common:**
  1. `WRONGTYPE Operation against a key holding the wrong kind of value` after a deploy changed a key's type.
  2. Crossing `hash-max-listpack-entries` triggers a sudden memory jump.
  3. `ERR value is not an integer or out of range` from INCR on a JSON or float string.

### ch3 · Key Expiration (`s:'TTL · lazy · active cycle'`, pg `expire`)
- **Source:** EXPIRE docs (how keys expire); expire.c (`activeExpireCycle`); db.c (`expireIfNeeded`); `active-expire-effort`; `SET … KEEPTTL`.
- **Problem:** A million 30-minute sessions. At :00 latency spikes, and memory never drops after a campaign ends.
- **Predict:** "A key expired 10 min ago and nobody touched it. Is it still using memory?"
  - Answer: possibly, until the active cycle samples it.
- **Core idea:** Store an absolute deadline. Check it on every access (lazy), and reclaim untouched keys with a random-sampling cycle that repeats while many sampled keys are expired.
- **Mechanism:**
  - expires dict;
  - lazy expiry on lookup;
  - the active cycle (sample of 20, repeat if more than 10% are expired, time-bounded);
  - replicas wait for the primary's DEL.
- **Playground:**
  - Controls: slider for keys; seg for TTL pattern (all same deadline / jittered); slider for access rate; Play over a clock.
  - Stats: expired-but-in-memory, memory freed per tick, max cycle time (illustrative).
- **Common:**
  1. Synchronised TTLs expire at once and cause a latency spike. Fix: TTL jitter.
  2. Expired keys pile up in memory under low access. Fix: tune `active-expire-effort`.
  3. A plain `SET` overwrite drops the TTL and keys live forever. Fix: `KEEPTTL`, or set the TTL on every write.

### ch4 · Memory and Eviction (`s:'maxmemory · sampled LRU/LFU'`, pg `eviction`)
- **Source:** key eviction docs; evict.c (eviction pool); config `maxmemory`, `maxmemory-policy`, `maxmemory-samples`; INFO memory (`mem_fragmentation_ratio`); `activedefrag`.
- **Problem:** At the 21:00 login spike, checkout fails on SET while reads work (spec §2.3 example).
- **Predict:** see spec §2.3.
- **Core idea:** Do not keep a global order. Sample a few keys and evict the worst by idle time or decayed frequency.
- **Mechanism:**
  - used memory versus maxmemory;
  - policies noeviction, allkeys-*, volatile-*;
  - eviction pool;
  - LFU counter with decay;
  - fragmentation.
- **Playground:**
  - Controls: seg for policy; slider for maxmemory; slider for maxmemory-samples 1–10; seg for workload (hot set + scan / uniform); toggle "keys have TTL".
  - Stats: writes rejected, hit rate, evictions, hot keys evicted.
- **Common:**
  1. `OOM command not allowed when used memory > 'maxmemory'.` under noeviction.
  2. A volatile-* policy with no TTL keys behaves like noeviction.
  3. High `mem_fragmentation_ratio`: RSS far above used memory. Fix: `activedefrag`, or a restart via failover.

### ch5 · Persistence: AOF and RDB (`s:'AOF · RDB · fork · fsync'`, pg `persistence`)
- **Source:** persistence docs; aof.c and rdb.c; config `appendonly`, `appendfsync`, `aof-load-truncated`, `save`; INFO `latest_fork_usec`; `redis-check-aof`.
- **Problem:** The machine loses power right after OK. What survives the restart?
- **Predict:** "`appendfsync everysec`, power loss. What is the worst-case loss?"
  - Answer: about 1–2 s of writes.
- **Core idea:** Durability is a declared policy: the AOF plus an fsync policy, and point-in-time snapshots written to a temp file and atomically renamed.
- **Mechanism:**
  - AOF append and fsync policies;
  - AOF rewrite (multi-part AOF in 7.x);
  - RDB via fork with copy-on-write;
  - load order on restart;
  - truncated-tail handling.
- **Playground:**
  - Controls: write stream; seg for appendfsync (always / everysec / no); toggle RDB every N s; button "power loss at t"; slider for dataset size (drives fork time and copy-on-write).
  - Stats: acknowledged writes lost, fsyncs/s, fork pause (illustrative), copy-on-write memory.
- **Common:**
  1. `MISCONF Redis is configured to save RDB snapshots, but it's currently unable to persist to disk…`
  2. A fork on a large dataset stalls and copy-on-write doubles memory, leading to the OOM killer.
  3. A truncated AOF after a crash. Use `aof-load-truncated` and `redis-check-aof --fix`.

### ch6 · Replication (`s:'replication offset · backlog · resync'`, pg `replication`)
- **Source:** replication docs; replication.c; config `repl-backlog-size`, `client-output-buffer-limit replica`; `INFO replication` (`master_repl_offset`).
- **Problem:** A replica on a flaky link does a full resync every few minutes and the primary's network saturates.
- **Predict:** "The replica disconnects for 30 s at 10 MB/s of writes with a 1 MB backlog. Partial or full resync?"
  - Answer: full.
- **Core idea:** Stream writes in order, numbered by byte offset. A reconnecting replica continues from its offset if the backlog still holds the gap.
- **Mechanism:**
  - replication ID and offset;
  - PSYNC;
  - backlog ring;
  - full sync (RDB plus a buffered stream);
  - asynchronous acknowledgement.
- **Playground:**
  - Controls: slider for write rate; slider for backlog size; slider for disconnect duration; slider for replica output-buffer limit.
  - Stats: resync type, bytes transferred, replica lag, sync attempts.
- **Common:**
  1. A backlog that is too small turns every blip into a full resync.
  2. A full sync exceeds the replica output-buffer limit, causing an endless sync loop.
  3. Reads from a replica are stale under asynchronous lag (read-your-writes is broken).

### ch7 · Pipelining and Transactions (`s:'pipeline · MULTI/EXEC · WATCH'`, pg `multi`)
- **Source:** pipelining docs; transactions docs; multi.c.
- **Problem:** Moving 10 credits between balances: another client changes the balance halfway, and money is created.
- **Predict:** "Client A pipelines 3 INCRs. Can client B's GET run between them?"
  - Answer: yes.
- **Core idea:** Pipelining saves round trips but is not atomic. MULTI/EXEC runs queued commands back-to-back, and WATCH aborts EXEC if a watched key changed.
- **Mechanism:**
  - pipeline;
  - the MULTI queue;
  - EXEC;
  - `EXECABORT` for queue-time errors;
  - runtime errors do not roll back;
  - optimistic WATCH; key expiry counts as a change.
- **Playground** (the old 4 cases):
  - Controls: seg for mode (pipeline / MULTI / MULTI+WATCH / WATCH and expire); slider for client B's timing.
  - Stats: intermediate states visible to B, EXEC result (nil / OK), final balances.
- **Common:**
  1. Pipelining is not atomic: an intermediate state is visible.
  2. A runtime error inside EXEC: other commands still apply, with no rollback.
  3. A WATCH retry loop starves under contention. Fix: a Lua script or Function.

### ch8 · Sentinel Failover (`s:'SDOWN · ODOWN · promotion'`, pg `sentinel`)
- **Source:** Sentinel docs; sentinel.c; config `down-after-milliseconds`, `quorum`, `min-replicas-to-write`, `min-replicas-max-lag`.
- **Problem:** At 3 a.m. the primary stops answering. Who decides it is dead and who takes over? The old scenario "primary failure, async replication" belongs here.
- **Predict:** "The primary is partitioned with 1 client and keeps accepting writes. After it heals, what happens to those writes?"
  - Answer: lost when it is demoted.
- **Core idea:** Several sentinels must agree (quorum). An elected leader promotes the replica with the highest offset, and the new epoch fences the old primary.
- **Mechanism:**
  - SDOWN then ODOWN;
  - leader election;
  - replica selection (priority, offset);
  - config epoch;
  - clients discover the primary via Sentinel.
- **Playground:**
  - Controls: slider for sentinels 3/5; slider for quorum; seg for failure (crash / partition primary + 1 client); toggle `min-replicas-to-write 1`; Play.
  - Stats: failover time (ticks), writes lost, new primary, epoch.
- **Common:**
  1. Split brain loses writes. Fix: `min-replicas-to-write`.
  2. Sentinels co-located on one host fail together, so there is no quorum.
  3. Clients keep a hard-coded primary address and write to the demoted node.
  4. A `down-after-milliseconds` that is too low causes failover flapping on GC or network blips.

### ch9 · Cluster Slots (`s:'CRC16 · MOVED/ASK · resharding'`, pg `slots`)
- **Source:** cluster specification; cluster_legacy.c; `CLUSTER KEYSLOT`, `CLUSTER SHARDS`; hash tags.
- **Problem:** The data outgrows one machine. After sharding, a checkout MULTI fails and one node is hot.
- **Predict:** "Do keys `{user:42}:cart` and `{user:42}:orders` land in the same slot?"
  - Answer: yes.
- **Core idea:** CRC16 maps keys into 16,384 slots and slot ranges are assigned to nodes. A slot moves while nodes redirect stale clients with MOVED and ASK.
- **Mechanism:**
  - key → slot;
  - hash tags;
  - slot map;
  - MOVED versus ASK;
  - MIGRATING/IMPORTING;
  - MIGRATE.
- **Playground:**
  - Controls: input of keys (with or without hash tags); slider for nodes 3–6; button "migrate slot N"; toggle "client caches slot map".
  - Stats: per-node key load, redirects per 100 requests, cross-slot errors.
- **Common:**
  1. `CROSSSLOT Keys in request don't hash to the same slot`.
  2. Over-broad hash tags make one hot slot.
  3. Clients without slot-map caching hit a MOVED storm.
  4. Migrating a slot with big keys blocks and MIGRATE times out.

### ch10 · Streams and Consumer Groups (`s:'entry IDs · PEL · XACK'`, pg `streams`)
- **Source:** Streams docs; t_stream.c; XADD, XREADGROUP, XACK, XPENDING, XAUTOCLAIM, XTRIM.
- **Problem:** A worker crashes mid-job. Is that order event lost or processed twice?
- **Predict:** "A consumer reads entry 5 and crashes before XACK. Where is entry 5?"
  - Answer: in the group's pending entries list (PEL), owned by the dead consumer.
- **Core idea:** An append-only log with time-ordered IDs. A group remembers what it delivered to whom until it is acknowledged.
- **Mechanism:**
  - entry IDs;
  - last-delivered ID;
  - PEL with delivery counts;
  - claim;
  - trimming (`MAXLEN ~`).
- **Playground:**
  - Controls: slider for producers rate; slider for consumers 1–3; button "kill consumer before XACK"; slider for XAUTOCLAIM min-idle; toggle MAXLEN.
  - Stats: pending entries, redeliveries, stream length, entries lost.
- **Common:**
  1. Entries stuck pending after a crash. Fix: `XAUTOCLAIM`.
  2. Unbounded stream growth. Fix: `XADD … MAXLEN ~ n`.
  3. A poison message is redelivered forever. Fix: a delivery-count threshold and a dead-letter stream.

## Old-page → new mapping

| Old item | New |
|---|---|
| ch0 RESP & event loop | ch0 |
| ch0 extra "What each command costs" | ch1 |
| ch1 Typed keyspace + extra "Mini redis-cli" | ch2 |
| ch2 Key expiration | ch3 |
| ch3 Memory & eviction | ch4 |
| ch4 Persistence | ch5 |
| ch5 Replication | ch6 |
| ch6 Transactions (4 cases) | ch7 |
| ch7 Failover + scenario "primary failure" | ch8 |
| ch8 Cluster slots | ch9 |
| ch9 Streams | ch10 |
| scenario "insert → update → delete" | ch2 playground (set/update/del), ch3 (TTL) |

## Dropped or merged, and why
- **"Use your own data, key layout and workload" panel:** dropped, so results stay deterministic.
- **Milestones** (build-your-own tests): dropped as a section. Each milestone's test assertion now appears as the playground's "Apply the fix" outcome.
