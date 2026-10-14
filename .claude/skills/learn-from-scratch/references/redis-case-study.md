# Worked example: the Redis course

Live page: `techstack/redis/design/design.html` in `flynn3103/engineer-lab`. Reference implementation of the framework.
Scope default used: internals, one marketplace scenario (sessions, carts, leaderboard), Redis 7.2, no installation guide.

## Features and use cases (9 features, 25 use cases, 25 distinct picture forms)
| Feature | Use cases (picture form) |
| --- | --- |
| Protocol and event loop | split frame (`tape`) · pipelining (`lanes`) · one slow command (`swim`) |
| Data structures and encodings | listpack to hashtable (`gauge`) · skip list + dict (`skiplist`) · incremental rehash (`rehash`) |
| Expiry, eviction, memory bound | lazy + active expiry (`sweep`) · sampled LRU (`scatter`) · noeviction OOM (`bullet`) |
| Persistence | RDB fork copy-on-write (`pages`) · AOF everysec window (`window`) · AOF rewrite (`ledger`) |
| Replication | PSYNC backlog (`ring`) · acked write lost (`ack`) · offsets and WAIT (`offsets`) |
| High availability (Sentinel) | SDOWN to ODOWN (`votes`) · election (`roles`) · split brain (`split`) |
| Cluster | key to slot, hash tags (`hash`) · MOVED and ASK (`redirect`) · CROSSSLOT and coverage (`grid`) |
| Transactions, streams, messaging | MULTI and WATCH (`diff`) · stream PEL (`pel`) · Pub/Sub loss (`fan`) |
| End to end (capstone) | one SET across every layer (`flow`) |

## How it was built, in rounds
1. Found the skill in `flynn3103/agent-skills` (it was not in the session's skill list), read `SKILL.md` and its references.
2. Pinned facts: fetched `redis.conf`, `sentinel.conf` and `src/{config,dict,expire,evict,server,multi,cluster,t_hash,replication}.c` from the 7.2 branch, grepped each default.
3. Wrote spec, 25 use cases, 25 painters, a data-driven page; validated in Node (every step painted, forms unique) and in a browser.
4. Added the Mermaid layer after noticing Spark has it (36 diagrams: 1 overall, 9 feature, 26 use case).
5. Restyled to Spark's look after a side-by-side comparison, then extracted the framework so the look cannot drift again.

## Corrections the source check produced
- `hash-max-listpack-entries` is 512 in 7.2 (older notes say 128).
- Active expiry repeats while more than 10% of sampled keys are stale (`ACTIVE_EXPIRE_CYCLE_ACCEPTABLE_STALE`); 25% is the CPU cap, not the repeat threshold.
- Hash conversion goes only toward hashtable; deleting fields does not convert back (`t_hash.c`).
- `WAITAOF` exists from 7.2.0; `flushAppendOnlyFile` runs before client replies in `beforeSleep`, so the reply follows the AOF `write()`, not the fsync.
- A slot example that looked scattered (three keys on one node) was found by computing real CRC16 slots, not by reasoning; the page computes slots live and was checked against known values (`foo` = 12182).

## Left unverified (labelled in the course)
Stream and consumer-group semantics, Sentinel replica-selection order, the "up to about 2 s" AOF delay, fork cost and THP behaviour (from knowledge, redis.io not re-read); every size, timing and throughput figure (examples or assumptions).

## Mistakes made, so you do not repeat them
| Mistake | Fix and rule |
| --- | --- |
| Assumed the skill was installed; it was not | Search the skill repo (`flynn3103/agent-skills`, `add_repo`) before concluding a skill is missing. |
| Left out the Mermaid diagram layer and said "step pictures instead" | The diagram per use case and per feature is required. `check.js` now fails without it. |
| Styled the page my own way, then claimed it matched | Open the reference course next to yours and compare screenshots before saying it is consistent. |
| Picture classes `.lab`, `.row`, `.chip`, `.bar`, `.box` inherited styles from `assets/lab.css` | Use the kit's unique class names (`cap strip tag meter panel hero faint`), styled only under `.pv`. |
| Chip text was near-invisible (inherited pale colour) | Set `color` explicitly on every picture element. |
| Page scrolled sideways at 390 px (wide `pre`, grid children) | `min-width:0` on grid children; wide content scrolls inside its card. `browse.js` measures overflow. |
| CDN blocked in the sandbox, so Mermaid could not be tested | `npm install mermaid@10.9.1` into a temp dir and serve it for the CDN URL (`browse.js` does this). |
| `tools/` was gitignored, so scripts would not be committed | Un-ignore `tools/course/` (`tools/*` then `!tools/course/`). |
| Narration claimed "three different nodes" for keys that hashed to one node | Compute, do not guess: the page's own CRC16 found the real example. |
| A tick label near the axis edge wrapped and a label sat on the axis | Give ticks `white-space:nowrap`, a card background, and margin on the axis. Look at screenshots. |
| Mermaid labels with `;` or `#` | They end a statement or start a comment. The validator lints them. |
