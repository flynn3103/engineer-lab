# Distributed Systems learning journey

Open `course.html`. The course starts in Explain so vocabulary and a healthy mechanism precede the incident playback. Its shell, Problem → Predict → Mechanism → Diagnose structure, chapter overrides and static Explain figures follow the Scylla course.

The canonical lessons are in `course.js`; `chapters/chNN.js` supplies only that lesson’s chosen visual scenarios. Chapter and URL numbers are zero-based; displayed lesson numbers start at 1. The original `01-distributed-systems-end-to-end.html` remains a reference archive. Catalogue and search links use the redesigned course.

## Sequence and visual decisions

| Lesson | What it adds | Chosen visual and why |
| --- | --- | --- |
| 1. Why use more than one machine? | Capacity, latency, availability, shared resource | Static capacity bars and a limiting-resource table. The comparison needs no playback. |
| 2. Separate processes and partial failure | Local state, messages, network partitions, timeout uncertainty | Memory-boundary diagram and a healthy request/reply ladder; static table compares indistinguishable timeout causes. |
| 3. Remote calls, retries and idempotency | One logical effect versus several attempts | Lost-reply ladder traces the duplicate effect; a retry tree shows multiplication of load across layers. |
| 4. Replication: building a second copy | Replica, leader, follower, ordered log, storage versus application | A healthy copy trace shows both the log and the actual record on two disks. No crash, failover or advanced consistency rule is needed yet. |
| 5. Replication lag and session guarantees | Read-your-writes and monotonic reads | Progress tanks make a required position visible; comment strips show a reader going backward between copies. |
| 6. Acknowledgments, leaders and failover | What OK promises and what survives | Static acknowledgment timeline; log strips expose the missing tail, and a ruler compares compatible prefix logs. |
| 7. Partitioning: splitting distinct records | Placement, routing, movement, hot keys | Side-by-side copy/split diagram; key-column rearrangement, range-insert distribution and per-key heat show different kinds of imbalance. |
| 8. Clocks, causality and logical order | Clock rollback, happened-before, concurrent changes | Causal message diagram; an ID tape shows rollback and a space-time view follows logical counters. Last-write-wins stays in the next lesson. |
| 9. Leaderless writes, conflicts and quorums | Response sets, intersection assumptions, version resolution | A set table and replica brackets make overlap explicit; edit cards show the separate conflict-resolution question. |
| 10. Consistency contracts and linearizability | Invocation/response intervals, scope of guarantees, atomic condition | Interval diagram and operation history; a uniqueness table shows why a read followed by an insert still races. |
| 11. Pauses, leases and fencing | Authority at the actual effect boundary | Static storage gate and a pause Gantt chart; conditional lock writes show the check/action gap. Election demonstrations belong in consensus. |
| 12. Consensus: one committed history | Terms, election, log freshness, commitment | Role-state diagram, vote tally, term/index matrix and partition timeline. Each answers a different protocol question. |
| 13. Atomic commit across data owners | Prepare, durable decision, uncertainty, workflow alternative | Participant-state table; prepare/decision trace and transfer journal expose different recovery and visibility promises. |
| 14. Batch processing: map, shuffle and reduce | Grouping, skew, attempts, accepted output | Static key-routing diagram; shuffle-group sizing and attempt folders explain placement and output publication separately. |
| 15. Stream processing: offsets, state and event time | Recovery boundary, replay, windows, corrections | Crash-window table; offset/effect tape and event-time/arrival-time scatter plot. No second duplicate-row animation repeats the retry lesson. |

Repeated representations are retained only when they extend an earlier mental model: the healthy replication log becomes the log whose unreplicated tail can be lost. Redundant partition-election, old-leader and last-write-wins scenarios are removed from unrelated lessons.

## Teaching contract

Each lesson states its prerequisites and outcome, introduces terms before relying on them, develops a worked example, distinguishes the guarantee from its limits, and ends with a reasoning checkpoint and journey links. Numbers are illustrative. Primary references are attached to relevant lessons.

Avoid these shortcuts when editing:

- A timeout is not evidence that no remote effect happened.
- A second copy is not a split of distinct records, or a historical backup.
- Received, stored, committed and applied are different progress boundaries.
- One follower ACK does not make any replica safe to promote.
- A longest-log rule applies only to the compatible-prefix example; Raft checks term before index.
- `R + W > N` proves set overlap under the fixed-set assumption, not arbitrary linearizability.
- An odd voter count does not guarantee a majority can communicate in every partition.
- Fencing rejects obsolete authority at an enforcing resource; it is not effect deduplication.
- A journal with idempotent steps is recoverable but may expose partial state.
- Exactly-once state processing needs an explicit boundary for external effects.
- Watermarks express a progress policy and late results may need correction semantics.

## Validation

The redesign was checked in headless Chrome at desktop and narrow window sizes. Validation draws all selected scenes forward and backward in both available modes, checks text against card and stage bounds, exercises chapter navigation, prediction reveal and scrubbing, and checks static scenarios hide playback. All local figure paths, journey links, script syntax and search-index chapter mappings are checked separately.
