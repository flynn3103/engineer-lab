/* Problem-based course data for ScyllaDB. Written from the original CHAPTERS in techstack/scylla/01-scylla-internals-end-to-end.html. */
window.COURSE = {
  name: `ScyllaDB`,
  kick: `10 chapters · problem-based · ScyllaDB 2025.x`,
  lead: `The order store runs on a ScyllaDB cluster because one PostgreSQL primary could no longer take the write load. Orders arrive faster than one machine can write, any node may fail at any hour, and a read must still find the latest data. Each chapter starts from one incident on this store, asks you to predict the outcome, then shows the mechanism step by step.`,
  chapters: [
    {
      title: `Partition Key and Token Ring`,
      problem: `The order store keys every order by <code>seller_id</code>: <code>PRIMARY KEY (seller_id, order_id)</code>. A famous seller runs a flash sale at 20:00 and takes about half of all order traffic (illustrative). One node sits at 100% CPU on a single shard with p99 write latency in seconds, while the other two nodes of the 3-node cluster stay mostly idle. Adding a fourth node does not unpin the hot node.`,
      predict: {
        q: `A 3-node ring gets a 4th node. Roughly what share of the keys moves, and where does it come from?`,
        opts: [
          `About 1/4 of the keys, taken only from the neighbours of the new node’s tokens`,
          `About half of the keys, because every key is re-hashed`,
          `Nothing moves until you run a manual rebalance of every key`
        ],
        ans: 0,
        why: `Placement is the hash of the key, then the next token clockwise. A new node only takes the ranges just before its own tokens, so about 1/N of the data moves, and only from its neighbours. Nothing is re-hashed. A single hot key hashes to one token, so it moves with its range.`
      },
      explain: `
<h3>The idea</h3>
<p>Scylla decides where a partition lives by hashing its partition key to a position on a ring. Any node can compute the owner of any key without asking anyone. The partition key picks the owner. Everything for one partition key then lives together, which is why one very busy key can overload one place.</p>
<h3>How it works, step by step</h3>
<p>1. <b>Partition key to token.</b> The Murmur3 partitioner hashes <code>seller_id</code> to a 64-bit token. The same key always gets the same token.</p>
<p>2. <b>The ring and vnodes.</b> Each node owns several token positions, set by <code>num_tokens</code>. The owner of a token is the first node position clockwise from it. More vnodes make the arcs more even.</p>
<p>3. <b>Replicas.</b> With a replication factor RF and <code>NetworkTopologyStrategy</code>, the next RF−1 distinct nodes (and racks) clockwise also store a copy.</p>
<p>4. <b>Clustering key.</b> <code>order_id</code> does not change placement. It only sorts rows inside one partition.</p>
<h3>The trade-off</h3>
<p>Hashing spreads different keys evenly, but it cannot spread one key. All orders for seller 77 sit in one partition, on one replica set, so a flash sale for that seller lands on one place. A new node takes about 1/N of the ring from its neighbours, and the hot key moves with its range. The fix is in the data model: give the partition key a bounded bucket, so one seller becomes several partitions with several tokens.</p>
`,
      diagnose: [
        {
          t: `Hot partition`,
          sym: `<b>One shard has high CPU and p99 latency while other shards have spare capacity.</b>`,
          ctx: `A marketplace stores every event for one celebrity seller under seller_id. One partition gets most reads and writes.`,
          why: `One partition key maps to one token and one replica set. Tablet moves cannot divide that key.`,
          log: `-- representative output, values illustrative
Monitoring: one shard p99 and CPU ≫ its peers`,
          note: `Metric pattern; there may be no single error log. Source: <a href="https://docs.scylladb.com/manual/stable/troubleshooting/large-partition-table.html" target="_blank" rel="noopener">Large partitions</a>`,
          fix: [
            `Confirm the key with per-shard metrics and partition tracing.`,
            `Add a bounded time or hash bucket to the partition key.`,
            `Update reads to target or merge only the needed buckets.`,
            `Trade-off: Bucketing spreads load but makes some reads fan out.`,
            `Verify: Per-shard load and p99 converge after the new data model is in use.`
          ]
        },
        {
          t: `Large partition`,
          sym: `<b>Long reads and compactions for a few keys; memory warnings may appear.</b>`,
          ctx: `An orders table keeps years of rows for one customer in a single partition.`,
          why: `A wide partition must be read and rewritten as one logical unit. Compaction can make its size more visible.`,
          log: `large_data: Writing large partition ...
SELECT * FROM system.large_partitions;`,
          note: `The warning text and local system table are documented; the query must be run on relevant nodes. Source: <a href="https://docs.scylladb.com/manual/stable/troubleshooting/large-partition-table.html" target="_blank" rel="noopener">Large partitions</a>`,
          fix: [
            `Find the offending key in system.large_partitions on each affected node.`,
            `Bound partition size by time or another stable bucket.`,
            `Migrate queries and data gradually; check row counts and read ranges.`,
            `Trade-off: More partitions add application-side key management and sometimes more reads.`,
            `Verify: Large partition warnings stop growing and the largest partitions shrink.`
          ]
        },
        {
          t: `Uneven token ownership with few vnodes`,
          sym: `<b>One node owns far more data than its peers and fills its disk first.</b>`,
          ctx: `A cluster was built with one token per node (<code>num_tokens: 1</code>). Three random tokens split the ring into three arcs of very different length.`,
          why: `With a single random position per node the arc lengths vary a lot, so one node owns a much larger range. Many vnodes per node average the arcs out, and tablets (the default for new keyspaces in current releases) let the balancer even out load automatically.`,
          log: `-- representative output, values illustrative
$ nodetool status ks_orders
UN  10.0.1.11  Load 612 GB  Owns (effective) 52.1%
UN  10.0.1.12  Load 371 GB  Owns (effective) 31.0%
UN  10.0.1.13  Load 205 GB  Owns (effective) 16.9%`,
          note: `Read the effective ownership column: for equal hardware it should be close to equal. Source: <a href="https://docs.scylladb.com/manual/stable/architecture/ringarchitecture/index.html" target="_blank" rel="noopener">Ring architecture</a>`,
          fix: [
            `Measure first: run <code>nodetool status &lt;keyspace&gt;</code> and compare effective ownership and load per node.`,
            `Fix: prefer a tablets keyspace for new tables, where the load balancer spreads tablets by size.`,
            `Fix: for a vnode keyspace, <code>num_tokens</code> is chosen when a node first joins, so a higher value needs a new or replaced node rather than an in-place edit.`,
            `Verify: effective ownership and disk usage are within a few percent of each other.`
          ]
        }
      ],
      scenarios: [
        {
          id: `hot-key`,
          label: `One hot seller`,
          desc: `One seller_id hashes to one token, so one replica set takes all of its writes (numbers illustrative).`,
          codeLabel: `Schema`,
          code: {
            bug: [
              `CREATE TABLE orders (`,
              `  seller_id bigint,`,
              `  order_id  uuid,`,
              `  status    text,`,
              `  PRIMARY KEY (seller_id, order_id)`,
              `);`,
              `-- flash sale: seller_id = 77 gets about 50% of writes (illustrative)`
            ],
            fix: [
              `CREATE TABLE orders (`,
              `  seller_id bigint,`,
              `  bucket    int,      -- bounded hash bucket of order_id`,
              `  order_id  uuid,`,
              `  PRIMARY KEY ((seller_id, bucket), order_id)`,
              `);`,
              `-- seller 77 now spreads over 16 partitions (illustrative)`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `key`,
                x: 10,
                y: 30,
                w: 170,
                h: 64,
                t: `seller_id = 77`,
                s: `one partition key`
              },
              {
                id: `tok`,
                x: 235,
                y: 30,
                w: 170,
                h: 64,
                t: `Murmur3 token`,
                s: `one fixed position`
              },
              {
                id: `ring`,
                x: 460,
                y: 30,
                w: 170,
                h: 64,
                t: `Token ring`,
                s: `owner: first clockwise`
              },
              {
                id: `a`,
                x: 235,
                y: 190,
                w: 170,
                h: 64,
                t: `Node A, shard 1`,
                s: `takes the writes`
              },
              {
                id: `b`,
                x: 10,
                y: 190,
                w: 170,
                h: 64,
                t: `Node B`,
                s: `mostly idle`
              },
              {
                id: `c`,
                x: 460,
                y: 190,
                w: 170,
                h: 64,
                t: `Node C`,
                s: `mostly idle`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `key`,
                b: `tok`,
                label: `hash`
              },
              {
                id: `e2`,
                a: `tok`,
                b: `ring`,
                label: `look up`
              },
              {
                id: `e3`,
                a: `ring`,
                b: `a`,
                label: `owner`
              },
              {
                id: `e4`,
                a: `ring`,
                b: `b`,
                label: `neighbour`
              },
              {
                id: `e5`,
                a: `ring`,
                b: `c`,
                label: `neighbour`
              }
            ]
          },
          bug: [
            {
              log: `A flash sale sends every order for seller_id 77 to one partition key (illustrative, about half of all traffic).`,
              code: 4,
              hl: {
                nodes: {
                  key: `bad`
                }
              },
              stats: [
                {
                  l: `share of writes`,
                  v: `~50%`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Murmur3 hashes seller_id 77 to one 64-bit token. Every write for this seller gets the same token.`,
              code: 4,
              hl: {
                nodes: {
                  key: `on`,
                  tok: `on`
                },
                edges: {
                  e1: `on`
                }
              },
              stats: [
                {
                  l: `tokens used`,
                  v: `1`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `That token lies in one arc of the ring. One owner and its replicas take all of the writes.`,
              code: 4,
              hl: {
                nodes: {
                  tok: `on`,
                  ring: `on`,
                  a: `bad`
                },
                edges: {
                  e2: `on`,
                  e3: `bad`
                }
              },
              stats: [
                {
                  l: `node A CPU`,
                  v: `100% (illustrative)`,
                  cls: `bad`
                },
                {
                  l: `p99 write`,
                  v: `seconds (illustrative)`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Nodes B and C hold other arcs and sit mostly idle (illustrative).`,
              code: 6,
              hl: {
                nodes: {
                  b: `dim`,
                  c: `dim`,
                  a: `bad`
                },
                edges: {
                  e4: `dim`,
                  e5: `dim`
                }
              },
              stats: [
                {
                  l: `node B and C load`,
                  v: `about 5% each`,
                  cls: `warn`
                }
              ]
            }
          ],
          fix: [
            {
              log: `The key becomes (seller_id, bucket). The bucket is a bounded hash of order_id (illustrative 16 buckets).`,
              code: 4,
              hl: {
                nodes: {
                  key: `ok`
                }
              },
              stats: [
                {
                  l: `partition key`,
                  v: `(seller_id, bucket)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `The 16 buckets hash to 16 different tokens, so their positions spread around the ring.`,
              code: 4,
              hl: {
                nodes: {
                  tok: `ok`,
                  ring: `ok`
                },
                edges: {
                  e1: `ok`,
                  e2: `ok`
                }
              },
              stats: [
                {
                  l: `tokens used`,
                  v: `16 (illustrative)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `Each token has an owner, so writes reach all three nodes instead of one. A read of one seller must now ask each bucket.`,
              code: 5,
              hl: {
                nodes: {
                  a: `ok`,
                  b: `ok`,
                  c: `ok`
                },
                edges: {
                  e3: `ok`,
                  e4: `ok`,
                  e5: `ok`
                }
              },
              stats: [
                {
                  l: `share per node`,
                  v: `about 33% (illustrative)`,
                  cls: `ok`
                },
                {
                  l: `read cost`,
                  v: `fan-out to buckets`,
                  cls: `warn`
                }
              ]
            }
          ]
        },
        {
          id: `add-node`,
          label: `Add a node`,
          desc: `A new node takes about 1/N of the ring from its neighbours, but a hot key moves with its range (numbers illustrative).`,
          codeLabel: `Command`,
          code: {
            bug: [
              `$ nodetool status ks_orders`,
              `UN  10.0.1.11  Owns (effective) 33.3%`,
              `UN  10.0.1.12  Owns (effective) 33.3%`,
              `UN  10.0.1.13  Owns (effective) 33.3%`,
              `# node 4 joins: takes about 1/4 of the ranges from its neighbours`,
              `# seller_id = 77 hashes to the same token before and after`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `n1`,
                x: 10,
                y: 30,
                w: 170,
                h: 64,
                t: `Node 1`,
                s: `owns about 1/3`
              },
              {
                id: `n2`,
                x: 235,
                y: 30,
                w: 170,
                h: 64,
                t: `Node 2`,
                s: `owns about 1/3`
              },
              {
                id: `n3`,
                x: 460,
                y: 30,
                w: 170,
                h: 64,
                t: `Node 3`,
                s: `owns about 1/3`
              },
              {
                id: `n4`,
                x: 235,
                y: 190,
                w: 170,
                h: 64,
                t: `Node 4 (new)`,
                s: `takes about 1/4`
              },
              {
                id: `hot`,
                x: 460,
                y: 190,
                w: 170,
                h: 64,
                t: `Hot seller 77`,
                s: `still one token`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `n1`,
                b: `n4`,
                label: `streams`
              },
              {
                id: `e2`,
                a: `n2`,
                b: `n4`,
                label: `streams`
              },
              {
                id: `e3`,
                a: `n3`,
                b: `hot`,
                label: `owns the arc`
              }
            ]
          },
          bug: [
            {
              log: `Before the join, three nodes own equal arcs. Seller 77 sits in one arc on node 3 (illustrative).`,
              code: 1,
              hl: {
                nodes: {
                  n3: `on`,
                  hot: `bad`
                },
                edges: {
                  e3: `bad`
                }
              },
              stats: [
                {
                  l: `node 3 CPU`,
                  v: `100% (illustrative)`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Node 4 joins with new tokens. It takes about 1/4 of the ring from its neighbours. Keys are not re-hashed.`,
              code: 4,
              hl: {
                nodes: {
                  n4: `new`,
                  n1: `on`,
                  n2: `on`
                },
                edges: {
                  e1: `on`,
                  e2: `on`
                }
              },
              stats: [
                {
                  l: `share of ring moved`,
                  v: `about 1/4`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `Seller 77 hashes to the same token as before. Its arc still belongs to one owner, so the hot partition stays pinned.`,
              code: 5,
              hl: {
                nodes: {
                  hot: `bad`,
                  n3: `warn`
                },
                edges: {
                  e3: `bad`
                }
              },
              stats: [
                {
                  l: `hot key share`,
                  v: `unchanged`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Node 3 still shows the highest CPU. Node 4 gives headroom to other keys, not to this one (illustrative).`,
              code: 5,
              hl: {
                nodes: {
                  n3: `bad`,
                  n4: `ok`
                }
              },
              stats: [
                {
                  l: `node 3 CPU`,
                  v: `100% (illustrative)`,
                  cls: `bad`
                },
                {
                  l: `node 4 CPU`,
                  v: `about 20% (illustrative)`,
                  cls: `ok`
                }
              ]
            }
          ]
        }
      ]
    },
    {
      title: `Coordinator and Consistency Levels`,
      problem: `An order's <code>price</code> is updated at 14:02 while one of its three replicas restarts (illustrative). The write returns OK, and the replica is back by 14:05. Support now sees two prices for the same order, depending on which request the customer refreshes, and no error is logged.`,
      predict: {
        q: `RF=3, write at QUORUM, read at QUORUM, one replica was down for the write. Can a read miss the latest write?`,
        opts: [
          `Yes, the down replica may be the one the read asks`,
          `No, a QUORUM read always overlaps a QUORUM write`,
          `Only if the coordinator is the stale replica`
        ],
        ans: 1,
        why: `QUORUM is 2 of 3. A write on 2 replicas and a read of 2 replicas must share at least one replica, because 2 + 2 is greater than 3. That shared replica holds the newest timestamp. A read at ONE has no such overlap, so it can land on the one replica that missed the write.`
      },
      explain: `
<h3>The idea</h3>
<p>Every write goes to all replicas of the row. The consistency level (CL) only says how many of them must answer before the client gets OK. Reads use the same count, so the overlap between the write set and the read set decides whether a read can be stale.</p>
<h3>How it works, step by step</h3>
<p>1. The client sends CQL with a consistency level to any node. That node becomes the coordinator for this request.</p>
<p>2. The coordinator hashes the key, finds the replicas, and sends the mutation to <em>all</em> of them in parallel.</p>
<p>3. It counts acknowledgements. With RF=3, <code>QUORUM</code> needs 2, <code>ONE</code> needs 1, and <code>ALL</code> needs 3.</p>
<p>4. A replica that is down misses the write. The coordinator stores a hint for it while the hint window allows, and repair covers what hints cannot.</p>
<p>5. When two versions meet, each cell’s write timestamp decides. The higher timestamp wins, not the arrival order.</p>
<h3>The trade-off</h3>
<p>The rule is R + W &gt; RF: QUORUM with QUORUM on RF=3 always overlaps. A higher CL waits for more replicas, so it becomes unavailable sooner when nodes fail. Overlap guarantees freshness, but it does not order two concurrent writes; the timestamps do that, and they depend on clocks being right.</p>
`,
      diagnose: [
        {
          t: `Stale read at ONE`,
          sym: `<b>The same key returns an old value on some reads.</b>`,
          ctx: `RF=3. A replica is down during an update; after restart, a ONE read asks that replica.`,
          why: `ONE write and ONE read sets need not overlap, and a missed replica remains behind until healed.`,
          log: `-- representative output, values illustrative
Client trace: read CL=ONE → replica B returned v1; latest completed write was v2`,
          note: `Illustrative trace, not a literal ScyllaDB log line. Source: <a href="https://docs.scylladb.com/manual/stable/cql/consistency.html" target="_blank" rel="noopener">Consistency levels</a>`,
          fix: [
            `Confirm the CL used by both operations and the replica versions.`,
            `Use a read/write CL pair whose counts overlap when the workload requires it.`,
            `Run repair for replicas that missed writes.`,
            `Trade-off: Higher CL waits for more replicas and becomes unavailable with more failures; it does not order concurrent writes.`,
            `Verify: The test key returns the expected completed version from every selected read path.`
          ]
        },
        {
          t: `Unavailable at ALL`,
          sym: `<b>Writes fail immediately even though two replicas are healthy.</b>`,
          ctx: `A deployment uses CL=ALL for writes while one of three replicas is down for maintenance.`,
          why: `ALL requires every replica to answer. Two live replicas cannot satisfy a three-replica request.`,
          log: `-- representative output, values illustrative
UnavailableException: CL=ALL, required=3, alive=2`,
          note: `Representative client error; exact formatting depends on the driver. Source: <a href="https://docs.scylladb.com/manual/stable/cql/consistency.html" target="_blank" rel="noopener">Consistency levels</a>`,
          fix: [
            `Check nodetool status and the request consistency level.`,
            `Restore or replace the unavailable replica.`,
            `If the application can tolerate the changed guarantee, evaluate QUORUM for that request.`,
            `Trade-off: Lowering CL improves availability but changes the consistency and durability envelope.`,
            `Verify: The required number of replicas is live and write failures stop.`
          ]
        },
        {
          t: `Client clock skew makes a newer write lose`,
          sym: `<b>An update that definitely happened later is silently ignored; the older value comes back.</b>`,
          ctx: `Two services update the same order. One of them sends client-side timestamps from a host whose clock runs 5 seconds ahead (illustrative).`,
          why: `Every cell carries a write timestamp and the highest timestamp wins, regardless of arrival order. A writer whose clock is ahead keeps winning against later writes from writers with correct clocks.`,
          log: `-- representative output, values illustrative
SELECT price, WRITETIME(price) FROM orders WHERE id = 42;
 price | writetime(price)
-------+------------------
   100 | 1760000005000000   <- writer 1, clock +5s, real time t
    90 | 1760000002000000   <- writer 2, correct clock, real time t+2s (lost)`,
          note: `WRITETIME shows the microsecond timestamp that LWW compares. The later real update has the lower number, so it loses. Source: <a href="https://docs.scylladb.com/manual/stable/cql/dml/insert.html" target="_blank" rel="noopener">INSERT and USING TIMESTAMP</a>`,
          fix: [
            `Measure first: compare <code>WRITETIME(col)</code> for the losing and winning writes and compare host clocks (<code>chronyc tracking</code> or similar).`,
            `Fix: keep every writer host on NTP or chrony, and alert on drift.`,
            `Fix: let the cluster assign timestamps (do not send client-side timestamps) or use a monotonic server-side generator.`,
            `Trade-off: for read-modify-write that must not lose updates, use a lightweight transaction (<code>IF</code> clause), which costs extra round trips.`,
            `Verify: WRITETIME ordering matches real ordering for a test update pair.`
          ]
        }
      ],
      scenarios: [
        {
          id: `down-replica`,
          label: `One replica down`,
          desc: `A QUORUM write succeeds while replica C is down. A ONE read can still land on C and return the old price (illustrative).`,
          codeLabel: `Query`,
          code: {
            bug: [
              `-- RF = 3, replica C is down (prices illustrative: old 100, new 90)`,
              `CONSISTENCY QUORUM;`,
              `UPDATE orders SET price = 90 WHERE seller_id = 77 AND order_id = 42;`,
              `-- A and B ack: 2 of 3 = QUORUM, the write is OK`,
              `CONSISTENCY ONE;`,
              `SELECT price FROM orders WHERE seller_id = 77 AND order_id = 42;`,
              `-- ONE is answered by C alone: price = 100 (stale)`
            ],
            fix: [
              `-- RF = 3, replica C is still down`,
              `CONSISTENCY QUORUM;`,
              `UPDATE orders SET price = 90 WHERE seller_id = 77 AND order_id = 42;`,
              `-- A and B ack: the write is OK`,
              `CONSISTENCY QUORUM;`,
              `SELECT price FROM orders WHERE seller_id = 77 AND order_id = 42;`,
              `-- a QUORUM read must include A or B: price = 90`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `client`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Client`,
                s: `sends CL and query`
              },
              {
                id: `coord`,
                x: 235,
                y: 120,
                w: 170,
                h: 60,
                t: `Coordinator`,
                s: `any node`
              },
              {
                id: `rA`,
                x: 460,
                y: 20,
                w: 170,
                h: 60,
                t: `Replica A`,
                s: `price = 90`
              },
              {
                id: `rB`,
                x: 460,
                y: 120,
                w: 170,
                h: 60,
                t: `Replica B`,
                s: `price = 90`
              },
              {
                id: `rC`,
                x: 460,
                y: 220,
                w: 170,
                h: 60,
                t: `Replica C`,
                s: `down, price = 100`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `client`,
                b: `coord`,
                label: `CQL`
              },
              {
                id: `e2`,
                a: `coord`,
                b: `rA`,
                label: `mutation`
              },
              {
                id: `e3`,
                a: `coord`,
                b: `rB`,
                label: `mutation`
              },
              {
                id: `e4`,
                a: `coord`,
                b: `rC`,
                label: `mutation or read`
              }
            ]
          },
          bug: [
            {
              log: `Replica C is down. The client sends the UPDATE at QUORUM (illustrative price 100 becomes 90).`,
              code: 2,
              hl: {
                nodes: {
                  client: `on`,
                  coord: `on`
                },
                edges: {
                  e1: `on`
                }
              },
              stats: [
                {
                  l: `write CL`,
                  v: `QUORUM (2 of 3)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `The coordinator sends the mutation to A, B and C. C does not answer.`,
              code: 2,
              hl: {
                nodes: {
                  rA: `ok`,
                  rB: `ok`,
                  rC: `dim`
                },
                edges: {
                  e2: `on`,
                  e3: `on`,
                  e4: `dim`
                }
              }
            },
            {
              log: `A and B acknowledge. Two of three meets QUORUM, so the client gets OK. C still holds 100.`,
              code: 3,
              hl: {
                nodes: {
                  rA: `ok`,
                  rB: `ok`,
                  rC: `dim`
                },
                edges: {
                  e2: `ok`,
                  e3: `ok`
                }
              },
              stats: [
                {
                  l: `replicas with 90`,
                  v: `2 of 3`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `Later, a read at ONE goes to the coordinator, which answers from C alone (illustrative).`,
              code: 5,
              hl: {
                nodes: {
                  client: `on`,
                  coord: `on`,
                  rC: `bad`
                },
                edges: {
                  e1: `on`,
                  e4: `bad`
                }
              }
            },
            {
              log: `C returns the old price 100. Nothing failed and no error is logged, so the customer sees a stale price.`,
              code: 6,
              hl: {
                nodes: {
                  rC: `bad`
                },
                edges: {
                  e4: `bad`
                }
              },
              stats: [
                {
                  l: `customer sees`,
                  v: `100 (stale)`,
                  cls: `bad`
                },
                {
                  l: `latest completed write`,
                  v: `90`,
                  cls: `warn`
                }
              ]
            }
          ],
          fix: [
            {
              log: `The same write: C is still down, and the write is OK at QUORUM (illustrative).`,
              code: 2,
              hl: {
                nodes: {
                  client: `on`,
                  coord: `on`
                },
                edges: {
                  e1: `on`
                }
              },
              stats: [
                {
                  l: `write CL`,
                  v: `QUORUM (2 of 3)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `The read also uses QUORUM. It asks 2 of 3 replicas, so it must include A or B.`,
              code: 4,
              hl: {
                nodes: {
                  coord: `on`,
                  rA: `ok`,
                  rB: `ok`,
                  rC: `dim`
                },
                edges: {
                  e2: `ok`,
                  e3: `ok`,
                  e4: `dim`
                }
              }
            },
            {
              log: `A and B both hold 90, so the newest value is among the answers. The read returns 90.`,
              code: 6,
              hl: {
                nodes: {
                  rA: `ok`,
                  rB: `ok`
                },
                edges: {
                  e2: `ok`,
                  e3: `ok`
                }
              },
              stats: [
                {
                  l: `quorum overlap`,
                  v: `at least 1 replica`,
                  cls: `ok`
                },
                {
                  l: `customer sees`,
                  v: `90`,
                  cls: `ok`
                }
              ]
            }
          ]
        },
        {
          id: `clock-skew`,
          label: `Clock skew wins`,
          desc: `Last write wins by timestamp, not by arrival. A writer whose clock is 5 s ahead beats a later write (times illustrative).`,
          codeLabel: `Query`,
          code: {
            bug: [
              `-- writer 1: host clock runs 5 s ahead (illustrative)`,
              `INSERT INTO orders (seller_id, order_id, price) VALUES (77, 42, 100);`,
              `-- real time t+2 s, writer 2: correct clock`,
              `INSERT INTO orders (seller_id, order_id, price) VALUES (77, 42, 90);`,
              `SELECT price, WRITETIME(price) FROM orders WHERE seller_id = 77 AND order_id = 42;`,
              `-- 100 wins: its timestamp is larger`
            ],
            fix: [
              `-- writer hosts run chrony or NTP and alert on drift`,
              `INSERT INTO orders (seller_id, order_id, price) VALUES (77, 42, 100);`,
              `INSERT INTO orders (seller_id, order_id, price) VALUES (77, 42, 90);`,
              `-- timestamps follow real time: the later write has the larger one`,
              `SELECT price, WRITETIME(price) FROM orders WHERE seller_id = 77 AND order_id = 42;`,
              `-- 90 wins (right)`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `w1`,
                x: 10,
                y: 30,
                w: 170,
                h: 64,
                t: `Writer 1`,
                s: `clock 5 s ahead`
              },
              {
                id: `t1`,
                x: 235,
                y: 30,
                w: 170,
                h: 64,
                t: `Timestamp 1`,
                s: `t + 5 s, price 100`
              },
              {
                id: `w2`,
                x: 10,
                y: 190,
                w: 170,
                h: 64,
                t: `Writer 2`,
                s: `correct clock`
              },
              {
                id: `t2`,
                x: 235,
                y: 190,
                w: 170,
                h: 64,
                t: `Timestamp 2`,
                s: `t + 2 s, price 90`
              },
              {
                id: `lww`,
                x: 460,
                y: 110,
                w: 170,
                h: 64,
                t: `Last write wins`,
                s: `largest timestamp`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `w1`,
                b: `t1`,
                label: `stamp`
              },
              {
                id: `e2`,
                a: `w2`,
                b: `t2`,
                label: `stamp`
              },
              {
                id: `e3`,
                a: `t1`,
                b: `lww`,
                label: `wins`
              },
              {
                id: `e4`,
                a: `t2`,
                b: `lww`,
                label: `loses`
              }
            ]
          },
          bug: [
            {
              log: `Writer 1 sends price 100 from a host whose clock is 5 s ahead (illustrative).`,
              code: 1,
              hl: {
                nodes: {
                  w1: `on`
                },
                edges: {
                  e1: `on`
                }
              },
              stats: [
                {
                  l: `writer 1 timestamp`,
                  v: `t + 5 s`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `Two seconds later in real time, writer 2 sends price 90 with a correct clock.`,
              code: 3,
              hl: {
                nodes: {
                  w2: `on`,
                  t2: `warn`
                },
                edges: {
                  e2: `on`
                }
              },
              stats: [
                {
                  l: `writer 2 timestamp`,
                  v: `t + 2 s`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Each cell keeps its write timestamp. The later real update carries the smaller number.`,
              code: 4,
              hl: {
                nodes: {
                  t1: `ok`,
                  t2: `bad`
                },
                edges: {
                  e3: `ok`,
                  e4: `bad`
                }
              }
            },
            {
              log: `Last-write-wins compares timestamps and keeps 100. The newer update is silently ignored.`,
              code: 5,
              hl: {
                nodes: {
                  lww: `bad`
                },
                edges: {
                  e3: `ok`
                }
              },
              stats: [
                {
                  l: `stored price`,
                  v: `100 (old)`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `Writer hosts keep their clocks in step with NTP or chrony, so timestamps follow real time.`,
              code: 0,
              hl: {
                nodes: {
                  w1: `ok`,
                  w2: `ok`
                }
              },
              stats: [
                {
                  l: `clock drift`,
                  v: `small (illustrative)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `The later write now has the larger timestamp.`,
              code: 3,
              hl: {
                nodes: {
                  t1: `ok`,
                  t2: `ok`
                },
                edges: {
                  e1: `ok`,
                  e2: `ok`
                }
              }
            },
            {
              log: `Last-write-wins keeps 90, which is the newest real update.`,
              code: 5,
              hl: {
                nodes: {
                  lww: `ok`
                },
                edges: {
                  e4: `ok`
                }
              },
              stats: [
                {
                  l: `stored price`,
                  v: `90 (latest)`,
                  cls: `ok`
                }
              ]
            }
          ]
        }
      ]
    },
    {
      title: `Timeouts, Retries and Routing`,
      problem: `A client-side retry loop runs in front of the order API. During a flash sale the API sees about twice its normal traffic (illustrative). The client timeout is 1 s, the server timeout is 2 s, and the driver retries each timeout 3 times. Within minutes, client timeouts grow faster than requests, and coordinator CPU rises on nodes that hold none of the hot data.`,
      predict: {
        q: `Client timeout 1 s, server timeout 2 s, 3 retries, and the cluster is overloaded so every request takes 1.5 s. How many requests can reach the replicas per user request?`,
        opts: [
          `Exactly 1, retries are free`,
          `Up to 4: the original plus 3 retries`,
          `Up to 2, because the server timeout cancels the first attempt`
        ],
        ans: 1,
        why: `The client gives up at 1 s and sends another attempt, but the server is still working on attempt 1 because its own timeout is 2 s. Each retry adds work to a cluster that is already behind, so up to 1 + 3 = 4 copies of the work can be in flight.`
      },
      explain: `
<h3>The idea</h3>
<p>A request should go straight to a replica that owns its data, and the client should wait longer than the server. Otherwise the cluster does the same work twice while it is already behind.</p>
<h3>How it works, step by step</h3>
<p>1. A token-aware and shard-aware driver computes the token from the prepared statement. It sends the request to a replica, on the shard that owns the data.</p>
<p>2. A random coordinator that does not own the key must forward the request. That is one extra hop and extra coordinator CPU.</p>
<p>3. <code>read_request_timeout_in_ms</code> and <code>write_request_timeout_in_ms</code> bound how long the server works on a request.</p>
<p>4. The client timeout should be larger than the server timeout. The server then finishes or drops the work before the client retries.</p>
<p>5. Retries are bounded and backed off, and only idempotent statements are retried. A timed-out write may already have been applied.</p>
<h3>The trade-off</h3>
<p>A longer timeout hides short spikes but does not add capacity. A retry helps when one packet is lost and hurts when the cluster is saturated, because each retry is new work. Routing awareness needs a driver that supports it, and its routing information must follow topology changes.</p>
`,
      diagnose: [
        {
          t: `Extra coordinator hop`,
          sym: `<b>Network hops and coordinator CPU rise although replica nodes are healthy.</b>`,
          ctx: `A client sends token-addressable queries to random nodes instead of a shard-aware driver.`,
          why: `The first node is not the shard holding the key, so it forwards the request.`,
          log: `-- representative output, values illustrative
Tracing: coordinator forwards request to owning node / shard`,
          note: `Illustrative trace description; wording depends on driver and server version. Source: <a href="https://python-driver.docs.scylladb.com/stable/scylla-specific.html" target="_blank" rel="noopener">Shard-aware routing</a>`,
          fix: [
            `Check that the driver exposes routing keys for prepared statements.`,
            `Enable token-aware and shard-aware routing supported by that driver.`,
            `Compare coordinator hops and p99 for the same workload.`,
            `Trade-off: A routing cache must follow topology and tablet changes; use a supported driver.`,
            `Verify: Fewer cross-node or cross-shard forwards and lower coordinator work.`
          ]
        },
        {
          t: `Retry storm after timeout`,
          sym: `<b>Timeouts climb faster than incoming business traffic.</b>`,
          ctx: `A traffic spike overloads replicas. The client times out earlier than the server and retries each request.`,
          why: `The original request may still be running when a retry adds more work to the same saturated cluster.`,
          log: `-- representative output, values illustrative
Client: ReadTimeout / WriteTimeout
Server: pending requests and queue delay rising`,
          note: `Representative exception names and metric pattern. Source: <a href="https://docs.scylladb.com/manual/stable/troubleshooting/timeouts.html" target="_blank" rel="noopener">Cluster timeouts</a>`,
          fix: [
            `Compare client and server timeouts and identify the overloaded shard or disk.`,
            `Bound retries with backoff; reduce aggressive speculative execution.`,
            `Remove the underlying hot key, I/O, or capacity bottleneck.`,
            `Trade-off: Longer timeouts hide short spikes but do not add capacity; retries may duplicate in-flight work.`,
            `Verify: Request queue and timeout rates fall together under the same offered load.`
          ]
        },
        {
          t: `A non-idempotent statement retried after a timeout`,
          sym: `<b>A counter or list ends up with double the expected value after a burst of timeouts.</b>`,
          ctx: `The order service counts views with <code>UPDATE orders_stats SET views = views + 1 WHERE id = ?</code>, and its driver retries on write timeout.`,
          why: `A write timeout means the client does not know whether the mutation was applied. A retry of a non-idempotent statement (counter increments, list appends) applies the change a second time.`,
          log: `-- representative output, values illustrative
WriteTimeout: Operation timed out - received only 1 responses (required 2)
client: attempt 1 timed out, retrying (attempt 2 of 3)
SELECT views FROM orders_stats WHERE id = 42;  ->  2   (expected 1)`,
          note: `The first attempt was still applied on a replica, and the retry applied it again. Source: <a href="https://docs.scylladb.com/manual/stable/cql/dml/update.html" target="_blank" rel="noopener">UPDATE and counters</a>`,
          fix: [
            `Measure first: list statements that use <code>col = col + n</code> on counters or list/set appends, and check the driver’s retry policy for them.`,
            `Fix: mark a statement idempotent only when running it twice has the same effect as once; leave counters and list appends unmarked so the driver does not retry them.`,
            `Fix: for counts that must be exact, insert one row per event with a unique id and aggregate, which is naturally idempotent.`,
            `Verify: replay a forced write timeout in a test and confirm the stored value changes only once.`
          ]
        }
      ],
      scenarios: [
        {
          id: `retry-storm`,
          label: `Retries pile up`,
          desc: `The client gives up at 1 s and retries while the server is still working on attempt 1 (times illustrative).`,
          codeLabel: `Config`,
          code: {
            bug: [
              `# client driver (illustrative values)`,
              `client timeout: 1 s`,
              `retries: 3`,
              `# server scylla.yaml`,
              `read_request_timeout_in_ms: 2000`,
              `write_request_timeout_in_ms: 2000`,
              `# overloaded cluster: each request takes 1.5 s`
            ],
            fix: [
              `# client driver (illustrative values)`,
              `client timeout: 3 s  (longer than the server timeout)`,
              `retries: 1, with backoff, idempotent statements only`,
              `# server scylla.yaml`,
              `read_request_timeout_in_ms: 2000`,
              `write_request_timeout_in_ms: 2000`,
              `# the server ends or drops work before the client retries`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `cl`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Client`,
                s: `gives up at 1 s`
              },
              {
                id: `a1`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `Attempt 1`,
                s: `server timeout 2 s`
              },
              {
                id: `a2`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `Retry 1`,
                s: `new copy of the work`
              },
              {
                id: `rep`,
                x: 460,
                y: 120,
                w: 170,
                h: 60,
                t: `Replica queue`,
                s: `1 to 4 copies queued`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `cl`,
                b: `a1`,
                label: `attempt 1`
              },
              {
                id: `e2`,
                a: `cl`,
                b: `a2`,
                label: `retry`
              },
              {
                id: `e3`,
                a: `a1`,
                b: `rep`,
                label: `still running`
              },
              {
                id: `e4`,
                a: `a2`,
                b: `rep`,
                label: `more work`
              }
            ]
          },
          bug: [
            {
              log: `The client sends attempt 1 and waits up to 1 s (illustrative).`,
              code: 1,
              hl: {
                nodes: {
                  cl: `on`,
                  a1: `on`
                },
                edges: {
                  e1: `on`
                }
              }
            },
            {
              log: `The overloaded replica needs 1.5 s. The client gives up at 1 s and sends a retry, while the server still works on attempt 1.`,
              code: 6,
              hl: {
                nodes: {
                  cl: `warn`,
                  a1: `warn`,
                  a2: `bad`
                },
                edges: {
                  e2: `bad`,
                  e3: `on`
                }
              },
              stats: [
                {
                  l: `copies in flight`,
                  v: `2`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `Retries 2 and 3 follow the same pattern. Up to 1 + 3 = 4 copies of the work reach the replicas (illustrative).`,
              code: 2,
              hl: {
                nodes: {
                  rep: `bad`
                },
                edges: {
                  e4: `bad`
                }
              },
              stats: [
                {
                  l: `copies in flight`,
                  v: `up to 4`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Every copy waits in the same queue. Queue delay rises, so more requests hit the server timeout.`,
              code: 4,
              hl: {
                nodes: {
                  rep: `bad`
                }
              },
              stats: [
                {
                  l: `queued work`,
                  v: `rising`,
                  cls: `bad`
                },
                {
                  l: `server timeout`,
                  v: `2 s`,
                  cls: `warn`
                }
              ]
            }
          ],
          fix: [
            {
              log: `The client timeout is now longer than the server timeout, so the server decides when work ends.`,
              code: 1,
              hl: {
                nodes: {
                  cl: `ok`
                },
                edges: {
                  e1: `ok`
                }
              },
              stats: [
                {
                  l: `client timeout`,
                  v: `3 s`,
                  cls: `ok`
                },
                {
                  l: `server timeout`,
                  v: `2 s`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `The server reaches its 2 s timeout first and stops or drops the work. The client does not send a duplicate copy at 1 s.`,
              code: 6,
              hl: {
                nodes: {
                  rep: `ok`,
                  a1: `ok`
                },
                edges: {
                  e2: `dim`,
                  e3: `ok`,
                  e4: `dim`
                }
              }
            },
            {
              log: `Retries are capped at 1 with backoff, and only idempotent statements are retried. Copies in flight stay low.`,
              code: 2,
              hl: {
                nodes: {
                  rep: `ok`
                }
              },
              stats: [
                {
                  l: `copies in flight`,
                  v: `1 to 2`,
                  cls: `ok`
                }
              ]
            }
          ]
        },
        {
          id: `extra-hop`,
          label: `Random coordinator hop`,
          desc: `A driver that is not token-aware sends each read to a random node, which forwards it to the owner (hop counts illustrative).`,
          codeLabel: `Query`,
          code: {
            bug: [
              `# driver without token or shard awareness`,
              `# random node chosen: 10.0.1.12 (illustrative)`,
              `SELECT price FROM orders WHERE seller_id = 77 AND order_id = 42;`,
              `# 10.0.1.12 does not own seller_id 77`,
              `# it forwards the read to the owning node and shard`,
              `# tracing: coordinator forwards request to owning node / shard`
            ],
            fix: [
              `# token-aware and shard-aware driver`,
              `# the driver computes the token from the prepared statement`,
              `SELECT price FROM orders WHERE seller_id = 77 AND order_id = 42;`,
              `# the request goes straight to a replica, on the right shard`,
              `# hops: 2 down to 1 (illustrative)`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `drv`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Driver`,
                s: `random node or aware`
              },
              {
                id: `rnd`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `Random node`,
                s: `not a replica of 77`
              },
              {
                id: `own`,
                x: 460,
                y: 120,
                w: 170,
                h: 60,
                t: `Owning node`,
                s: `holds seller_id 77`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `drv`,
                b: `rnd`,
                label: `random node`
              },
              {
                id: `e2`,
                a: `rnd`,
                b: `own`,
                label: `forward`
              },
              {
                id: `e3`,
                a: `drv`,
                b: `own`,
                label: `direct`
              }
            ]
          },
          bug: [
            {
              log: `The driver has no token awareness, so it picks a random node for the SELECT (illustrative).`,
              code: 1,
              hl: {
                nodes: {
                  drv: `on`
                },
                edges: {
                  e1: `on`
                }
              }
            },
            {
              log: `The random node does not own seller_id 77, so it adds a forwarding hop (illustrative: 2 hops).`,
              code: 3,
              hl: {
                nodes: {
                  rnd: `warn`
                },
                edges: {
                  e2: `on`
                }
              },
              stats: [
                {
                  l: `hops per read`,
                  v: `2`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `The owning node does the read and sends the answer back through the first node.`,
              code: 4,
              hl: {
                nodes: {
                  own: `on`
                },
                edges: {
                  e2: `on`,
                  e3: `dim`
                }
              }
            },
            {
              log: `Multiply by many requests and the random node pays CPU for every forward, while its own replicas stay healthy.`,
              code: 5,
              hl: {
                nodes: {
                  rnd: `bad`
                }
              },
              stats: [
                {
                  l: `coordinator CPU`,
                  v: `rising (illustrative)`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `A token-aware, shard-aware driver computes the token from the prepared statement.`,
              code: 1,
              hl: {
                nodes: {
                  drv: `ok`
                }
              },
              stats: [
                {
                  l: `routing`,
                  v: `token and shard aware`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `It sends the read straight to a replica, on the shard that owns the data.`,
              code: 3,
              hl: {
                nodes: {
                  own: `ok`,
                  drv: `ok`
                },
                edges: {
                  e1: `dim`,
                  e2: `dim`,
                  e3: `ok`
                }
              }
            },
            {
              log: `Forwarding is gone. Each read takes one hop instead of two (illustrative).`,
              code: 4,
              hl: {
                nodes: {
                  own: `ok`
                }
              },
              stats: [
                {
                  l: `hops per read`,
                  v: `1`,
                  cls: `ok`
                }
              ]
            }
          ]
        }
      ]
    },
    {
      title: `Replica Write Path`,
      problem: `A rack loses power for a few seconds at 03:12 (illustrative). The API had confirmed three orders to customers, but an audit finds them missing on one replica after the nodes come back. The cluster uses <code>commitlog_sync: periodic</code>. The data volume has plenty of free space, and no node logged an error before the power loss.`,
      predict: {
        q: `With periodic commitlog sync and RF=1, can an acknowledged write be lost on power loss?`,
        opts: [
          `No, the commitlog is written before the ACK`,
          `Yes, the ACK can come before the next fsync`,
          `Only if the memtable was already flushed`
        ],
        ans: 1,
        why: `Periodic mode acknowledges at once and syncs the commitlog every <code>commitlog_sync_period_in_ms</code>. A crash inside that window can lose acknowledged writes on that replica. With RF=3 the other replicas still hold the data, and batch mode acknowledges only after the sync.`
      },
      explain: `
<h3>The idea</h3>
<p>A replica has to accept writes fast and still survive a crash. It appends each mutation to a sequential commitlog first, applies it to a sorted in-memory memtable second, and writes immutable SSTables later. The sync mode decides whether the ACK waits for the disk.</p>
<h3>How it works, step by step</h3>
<p>1. The mutation arrives from the coordinator.</p>
<p>2. It is appended to a commitlog segment. Appends are sequential, so they are cheap, and the log is replayed after a crash.</p>
<p>3. It is applied to the memtable, a sorted table in RAM.</p>
<p>4. <code>commitlog_sync</code> decides when the ACK is sent. In <code>periodic</code> mode the ACK goes out at once and the commitlog is synced every <code>commitlog_sync_period_in_ms</code>. In <code>batch</code> mode the replica waits up to <code>commitlog_sync_batch_window_in_ms</code> for other writes, syncs, and then ACKs.</p>
<p>5. When the memtable is full it is flushed as an immutable SSTable, and the matching commitlog segments can be released.</p>
<p>6. Guards: a critical disk-utilization guard rejects user writes before the disk is completely full, and <code>batch_size_warn_threshold_in_kb</code> and <code>batch_size_fail_threshold_in_kb</code> limit batch size.</p>
<h3>The trade-off</h3>
<p><code>periodic</code> is faster, but one replica can lose the last window of acknowledged writes. <code>batch</code> waits for the disk on every ACK and costs latency. Other replicas on other racks still hold the write, so the real risk depends on how many copies are lost together.</p>
`,
      diagnose: [
        {
          t: `ACK before local fsync`,
          sym: `<b>A power loss can remove recent acknowledged mutations from that one replica.</b>`,
          ctx: `The application expects a single replica to survive power loss, but the cluster uses periodic commitlog sync.`,
          why: `Periodic commitlog mode prioritizes throughput; the model in chapter 3 demonstrates the stricter sync-before-ACK path.`,
          log: `scylla.yaml: commitlog_sync: periodic`,
          note: `Configuration signal. Periodic mode acknowledges before the next disk sync. Source: <a href="https://docs.scylladb.com/manual/stable/reference/configuration-parameters.html" target="_blank" rel="noopener">Configuration parameters</a>`,
          fix: [
            `Inspect commitlog_sync and the application’s durability requirement.`,
            `Rely on appropriate replication and CL for normal fault tolerance.`,
            `If each local ACK must be synced, evaluate batch mode and measure its latency cost.`,
            `Trade-off: Batch sync increases write latency; periodic sync depends more on surviving replicas.`,
            `Verify: Failure testing matches the durability requirement, and p99 remains acceptable.`
          ]
        },
        {
          t: `Critical disk rejects writes`,
          sym: `<b>Writes fail although nodes still appear up.</b>`,
          ctx: `A scale-out is delayed; compaction and new SSTables fill the data volume.`,
          why: `The critical disk guard prevents additional user writes while the node needs room to migrate or compact.`,
          log: `WriteFailure: Critical disk utilization: rejected write mutation`,
          note: `Documented client error; the full message includes CL and response counts. Source: <a href="https://docs.scylladb.com/manual/stable/troubleshooting/error-messages/critical-disk-utilization.html" target="_blank" rel="noopener">Critical disk utilization</a>`,
          fix: [
            `Confirm node state with nodetool status and disk usage with df.`,
            `Add capacity or complete a safe scale-out; keep space for compaction.`,
            `Verify writes resume after utilization falls below the guard threshold.`,
            `Trade-off: Reducing ingest buys time but delays writes; forcing major compaction near full disk can need even more temporary space.`,
            `Verify: Free space recovers and write failures stop without disabling the guard.`
          ]
        },
        {
          t: `Large multi-partition logged batches`,
          sym: `<b>Coordinators slow down or reject writes with batch-too-large errors after a bulk import.</b>`,
          ctx: `A migration job groups 500 order rows for many different customers in one logged <code>BEGIN BATCH ... APPLY BATCH</code> to “save round trips”.`,
          why: `A multi-partition logged batch is not a bulk-load tool. The coordinator must also store a batchlog entry on other nodes before applying it, so one large batch loads the coordinator and several replicas at once, and it trips the size thresholds.`,
          log: `-- representative output, values illustrative
WARN  Batch of prepared statements for [ks_orders.orders] is of size 140 KiB, exceeding specified threshold of 128 KiB
InvalidRequest: Batch too large`,
          note: `The warn and fail limits are <code>batch_size_warn_threshold_in_kb</code> (default 128) and <code>batch_size_fail_threshold_in_kb</code> (default 1024). Log wording varies by version. Source: <a href="https://docs.scylladb.com/manual/stable/cql/dml/batch.html" target="_blank" rel="noopener">BATCH statement</a>`,
          fix: [
            `Measure first: count batch size warnings in the logs and find the statements that batch across partitions.`,
            `Fix: send individual asynchronous writes from a token-aware driver, with a bounded number in flight.`,
            `Fix: keep a batch for rows of the <em>same</em> partition only, where it is applied atomically on one replica set.`,
            `Trade-off: raising the thresholds hides the symptom and can make nodes unstable; treat it as a last resort.`,
            `Verify: no batch-size warnings and a flat coordinator CPU profile during the next load.`
          ]
        }
      ],
      scenarios: [
        {
          id: `periodic-ack`,
          label: `ACK before fsync`,
          desc: `With periodic sync the ACK comes before the next fsync. A power loss in that window loses the write on one replica (times illustrative).`,
          codeLabel: `Config`,
          code: {
            bug: [
              `# scylla.yaml (the setting in this incident)`,
              `commitlog_sync: periodic`,
              `# commitlog_sync_period_in_ms bounds the unsynced window (value illustrative)`,
              `# 03:12:00.000  write appended, ACK sent to the client`,
              `# 03:12:00.180  power lost, no fsync yet`,
              `# on restart: the write is not in the commitlog`
            ],
            fix: [
              `# scylla.yaml`,
              `commitlog_sync: batch`,
              `# commitlog_sync_batch_window_in_ms: short window (illustrative)`,
              `# 03:12:00.000  append to the commitlog`,
              `# 03:12:00.004  fsync, then ACK (illustrative)`,
              `# power lost later: the commitlog replays the write`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `mut`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Mutation`,
                s: `from the coordinator`
              },
              {
                id: `cl`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `Commitlog`,
                s: `append, then sync`
              },
              {
                id: `mem`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `Memtable`,
                s: `sorted in RAM`
              },
              {
                id: `ack`,
                x: 460,
                y: 20,
                w: 170,
                h: 60,
                t: `ACK`,
                s: `sent to coordinator`
              },
              {
                id: `sst`,
                x: 460,
                y: 220,
                w: 170,
                h: 60,
                t: `SSTable`,
                s: `immutable on disk`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `mut`,
                b: `cl`,
                label: `append`
              },
              {
                id: `e2`,
                a: `mut`,
                b: `mem`,
                label: `apply`
              },
              {
                id: `e3`,
                a: `cl`,
                b: `ack`,
                label: `when?`
              },
              {
                id: `e4`,
                a: `mem`,
                b: `sst`,
                label: `flush`
              }
            ]
          },
          bug: [
            {
              log: `The coordinator sends a mutation to the replica, and the commitlog gets an append (illustrative 0 ms).`,
              code: 3,
              hl: {
                nodes: {
                  mut: `on`,
                  cl: `on`
                },
                edges: {
                  e1: `on`
                }
              },
              stats: [
                {
                  l: `fsync`,
                  v: `not yet`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `The mutation is applied to the memtable and the ACK goes out before any fsync (illustrative 1 ms).`,
              code: 3,
              hl: {
                nodes: {
                  mem: `on`,
                  ack: `warn`
                },
                edges: {
                  e2: `on`,
                  e3: `bad`
                }
              },
              stats: [
                {
                  l: `ACK time`,
                  v: `1 ms (illustrative)`,
                  cls: `warn`
                },
                {
                  l: `last fsync`,
                  v: `not yet`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Power is lost 180 ms after the ACK, inside the unsynced window. The append never reached the disk (illustrative).`,
              code: 4,
              hl: {
                nodes: {
                  cl: `bad`
                },
                edges: {
                  e1: `warn`
                }
              },
              stats: [
                {
                  l: `unsynced window`,
                  v: `180 ms (illustrative)`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `On restart the replica replays only what reached the disk. The acknowledged order is missing on this replica.`,
              code: 5,
              hl: {
                nodes: {
                  cl: `bad`,
                  mem: `dim`,
                  sst: `dim`
                }
              },
              stats: [
                {
                  l: `orders missing on this replica`,
                  v: `3 (illustrative)`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `Batch mode still appends first, so the write is in the commitlog file.`,
              code: 3,
              hl: {
                nodes: {
                  cl: `ok`
                },
                edges: {
                  e1: `ok`
                }
              }
            },
            {
              log: `The replica waits for the sync. One fsync can cover several writes in the same batch window.`,
              code: 2,
              hl: {
                nodes: {
                  cl: `ok`
                }
              },
              stats: [
                {
                  l: `sync wait`,
                  v: `up to the batch window`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `Only after the fsync is the ACK sent (illustrative 4 ms).`,
              code: 4,
              hl: {
                nodes: {
                  ack: `ok`
                },
                edges: {
                  e3: `ok`
                }
              },
              stats: [
                {
                  l: `ACK time`,
                  v: `4 ms (illustrative)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `A power loss now comes after the sync, so the replay restores the write.`,
              code: 5,
              hl: {
                nodes: {
                  cl: `ok`,
                  mem: `ok`
                }
              },
              stats: [
                {
                  l: `orders lost`,
                  v: `0`,
                  cls: `ok`
                }
              ]
            }
          ]
        },
        {
          id: `batch-overload`,
          label: `Bulk logged batch`,
          desc: `One logged batch for 500 customers loads a single coordinator and trips the size warning (numbers illustrative).`,
          codeLabel: `CQL`,
          code: {
            bug: [
              `-- migration job: one logged batch for 500 customers`,
              `BEGIN BATCH`,
              `  INSERT INTO orders (seller_id, order_id, status) VALUES (?, ?, ?);`,
              `  -- ... 498 more rows, many different seller_id values`,
              `APPLY BATCH;`,
              `-- WARN: batch size 140 KiB, threshold 128 KiB (illustrative)`
            ],
            fix: [
              `-- one write per row, from a token-aware driver`,
              `INSERT INTO orders (seller_id, order_id, status) VALUES (?, ?, ?);`,
              `-- async, with a bounded number in flight`,
              `-- a batch only for rows that share one partition key`,
              `BEGIN BATCH`,
              `  INSERT INTO orders (seller_id, order_id, status) VALUES (?, ?, ?);`,
              `APPLY BATCH;`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `coord`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Coordinator`,
                s: `holds the batch`
              },
              {
                id: `blog`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `Batchlog`,
                s: `copy on other nodes`
              },
              {
                id: `parts`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `500 partitions`,
                s: `many different keys`
              },
              {
                id: `rep`,
                x: 460,
                y: 120,
                w: 170,
                h: 60,
                t: `Replicas`,
                s: `apply each row`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `coord`,
                b: `blog`,
                label: `batchlog`
              },
              {
                id: `e2`,
                a: `coord`,
                b: `parts`,
                label: `apply`
              },
              {
                id: `e3`,
                a: `parts`,
                b: `rep`,
                label: `replicate`
              }
            ]
          },
          bug: [
            {
              log: `The migration sends one logged batch with 500 rows for many customers (illustrative).`,
              code: 1,
              hl: {
                nodes: {
                  coord: `warn`
                }
              },
              stats: [
                {
                  l: `partitions per batch`,
                  v: `500`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Before it is applied, the coordinator stores a batchlog entry on other nodes, so they do work for the batch too.`,
              code: 4,
              hl: {
                nodes: {
                  blog: `bad`
                },
                edges: {
                  e1: `bad`
                }
              }
            },
            {
              log: `The batch is 140 KiB, above the 128 KiB warning threshold (illustrative). Coordinator CPU climbs.`,
              code: 5,
              hl: {
                nodes: {
                  coord: `bad`
                },
                edges: {
                  e2: `warn`
                }
              },
              stats: [
                {
                  l: `batch size`,
                  v: `140 KiB`,
                  cls: `bad`
                },
                {
                  l: `warn threshold`,
                  v: `128 KiB`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `A batch that grows past batch_size_fail_threshold_in_kb (1024 by default) is refused with an error such as Batch too large.`,
              code: 3,
              hl: {
                nodes: {
                  parts: `bad`
                },
                edges: {
                  e3: `bad`
                }
              },
              stats: [
                {
                  l: `fail threshold`,
                  v: `1024 KB`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `Each row becomes its own single write, sent asynchronously by a token-aware driver.`,
              code: 1,
              hl: {
                nodes: {
                  coord: `ok`
                },
                edges: {
                  e2: `ok`
                }
              }
            },
            {
              log: `Each write goes straight to its replicas with a bounded number in flight. No batchlog is written.`,
              code: 2,
              hl: {
                nodes: {
                  blog: `dim`,
                  rep: `ok`
                },
                edges: {
                  e1: `dim`,
                  e3: `ok`
                }
              },
              stats: [
                {
                  l: `in flight`,
                  v: `bounded (illustrative)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `Rows that really share a partition key can stay in one small batch, applied atomically on one replica set.`,
              code: 4,
              hl: {
                nodes: {
                  parts: `ok`
                }
              },
              stats: [
                {
                  l: `batch size`,
                  v: `one partition, small`,
                  cls: `ok`
                },
                {
                  l: `coordinator CPU`,
                  v: `flat (illustrative)`,
                  cls: `ok`
                }
              ]
            }
          ]
        }
      ]
    },
    {
      title: `Read Path`,
      problem: `The order detail page answered in 3 ms (illustrative). After a month of growth p99 is 40 ms (illustrative), and a trace of one slow read shows the replica checking 11 SSTables to find one order that lives in only two. Memory is tight on the nodes, so someone proposes lowering <code>bloom_filter_fp_chance</code> without knowing what it costs.`,
      predict: {
        q: `Lowering <code>bloom_filter_fp_chance</code> from 0.01 to 0.001 costs about…`,
        opts: [
          `The same memory, it only changes the hash function`,
          `About 1.5× the Bloom filter memory per key`,
          `About 10× the memory, because the false-positive rate is 10× lower`
        ],
        ans: 1,
        why: `A Bloom filter needs about 1.44 · log₂(1/p) bits per key. That is about 9.6 bits at p = 0.01 and about 14.4 bits at p = 0.001: roughly 1.5× the memory for 10× fewer wasted probes.`
      },
      explain: `
<h3>The idea</h3>
<p>A read should touch only the files that might hold the key. Each SSTable has a Bloom filter that can answer “surely not here” cheaply. Only the few files that say “maybe” are opened and merged.</p>
<h3>How it works, step by step</h3>
<p>1. The read checks the memtable and the Bloom filter of each SSTable.</p>
<p>2. A Bloom filter says “definitely absent” or “maybe present”. Its size is about 1.44 · log₂(1/p) bits per key, where p is <code>bloom_filter_fp_chance</code>.</p>
<p>3. For a “maybe”, the partition index and summary jump close to the partition’s position in the data file.</p>
<p>4. The replica merges the matching cells from the memtable and the candidate SSTables, and keeps the newest version of each cell by timestamp.</p>
<p>5. Hot rows can come from the row cache. Scans can wash that cache out, and <code>BYPASS CACHE</code> tells a query not to use or fill it.</p>
<h3>The trade-off</h3>
<p>A lower false-positive target saves wasted probes but costs memory on every key. A filter can never skip a file that truly holds the key, so it cannot fix a read that must touch many files. When a query has no partition key restriction, no filter can jump to one partition, and the table has to be modelled for that query instead.</p>
`,
      diagnose: [
        {
          t: `Bloom false positives`,
          sym: `<b>The read path opens absent files despite a Bloom filter.</b>`,
          ctx: `A point lookup searches many SSTables and most do not contain the key.`,
          why: `A “maybe” can be false. A higher bloom_filter_fp_chance saves memory but allows more needless probes.`,
          log: `-- representative output, values illustrative
cfstats / monitoring: Bloom false-positive ratio and filter memory`,
          note: `Metric signal; a false positive is not an error log. Source: <a href="https://docs.scylladb.com/manual/stable/cql/ddl.html" target="_blank" rel="noopener">Table options and tombstone GC</a>`,
          fix: [
            `Measure false-positive ratio and SSTables per read.`,
            `Lower bloom_filter_fp_chance only if false probes are material.`,
            `Recheck filter memory and p99 after SSTables are rebuilt.`,
            `Trade-off: A lower false-positive target uses more memory; it cannot skip files that truly contain the key.`,
            `Verify: False probes fall without unacceptable memory pressure.`
          ]
        },
        {
          t: `Cache thrash from scans`,
          sym: `<b>Row-cache misses and point-read p99 jump after the scan.</b>`,
          ctx: `An analytics scan runs beside latency-sensitive point reads on the same table.`,
          why: `Large scans push hot rows out of cache, so later point reads go to disk.`,
          log: `-- representative output, values illustrative
scylla_cache_row_hits ↓
scylla_cache_row_misses ↑`,
          note: `Metric names, not an error log. Source: <a href="https://docs.scylladb.com/manual/branch-2025.2/operating-scylla/procedures/tips/benchmark-tips.html" target="_blank" rel="noopener">Performance tips</a>`,
          fix: [
            `Compare cache hit rate before, during, and after the scan.`,
            `Use BYPASS CACHE for scan-style queries where supported.`,
            `Throttle or isolate analytics work if it still competes for I/O.`,
            `Trade-off: Bypassing cache can make the scan itself slower; isolation uses more capacity.`,
            `Verify: Hot-key hit rate and p99 remain stable during the scan.`
          ]
        },
        {
          t: `ALLOW FILTERING turns a lookup into a full scan`,
          sym: `<b>A query that was fast in staging becomes a cluster-wide scan once the table is large.</b>`,
          ctx: `The support tool runs <code>SELECT * FROM orders WHERE status = 'open' ALLOW FILTERING</code>, because <code>status</code> is not part of the primary key.`,
          why: `Without a partition key restriction, the query cannot jump to one partition. The cluster reads rows and filters them afterwards, so cost grows with table size and not with the number of results.`,
          log: `-- representative output, values illustrative
cqlsh> TRACING ON;
cqlsh> SELECT * FROM orders WHERE status = 'open' ALLOW FILTERING;
(rows returned: 1,204)   rows scanned: ~38,000,000   duration: 41 s`,
          note: `Compare rows scanned with rows returned. The ratio is the waste. Source: <a href="https://docs.scylladb.com/manual/stable/cql/dml/select.html" target="_blank" rel="noopener">SELECT, ALLOW FILTERING and BYPASS CACHE</a>`,
          fix: [
            `Measure first: trace the query and compare rows scanned with rows returned.`,
            `Fix: model a table whose partition key matches the query (for example <code>PRIMARY KEY ((status, day), order_id)</code>), or use a materialized view or secondary index that fits.`,
            `Fix: if a scan is truly needed, run it as a bounded background job and use <code>BYPASS CACHE</code> so it does not wash out the row cache.`,
            `Verify: the same request returns in milliseconds and no longer scans the table.`
          ]
        }
      ],
      scenarios: [
        {
          id: `bloom-probes`,
          label: `Bloom skips files`,
          desc: `A point read checks every SSTable filter. A high false-positive rate opens more files than needed (counts illustrative).`,
          codeLabel: `Config`,
          code: {
            bug: [
              `# table options (illustrative)`,
              `bloom_filter_fp_chance: 0.01`,
              `SELECT price FROM orders WHERE seller_id = 77 AND order_id = 42;`,
              `# 12 SSTables on disk, 1 holds this partition`,
              `# filters say maybe for 7: 1 real hit, 6 false positives`,
              `# skipped 5 files, opened 7`
            ],
            fix: [
              `# table options (illustrative)`,
              `bloom_filter_fp_chance: 0.001  # only if false probes matter`,
              `SELECT price FROM orders WHERE seller_id = 77 AND order_id = 42;`,
              `# filters say maybe for 2: 1 real hit, 1 false positive`,
              `# skipped 10 files, opened 2`,
              `# memory: about 14.4 bits per key instead of 9.6`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `read`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Point read`,
                s: `seller_id 77, order 42`
              },
              {
                id: `bf`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `Bloom filters`,
                s: `one per SSTable`
              },
              {
                id: `cand`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `Candidate files`,
                s: `maybe: files opened`
              },
              {
                id: `idx`,
                x: 460,
                y: 20,
                w: 170,
                h: 60,
                t: `Partition index`,
                s: `jump to the position`
              },
              {
                id: `mrg`,
                x: 460,
                y: 220,
                w: 170,
                h: 60,
                t: `Merge`,
                s: `newest timestamp wins`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `read`,
                b: `bf`,
                label: `check each`
              },
              {
                id: `e2`,
                a: `bf`,
                b: `cand`,
                label: `maybe`
              },
              {
                id: `e3`,
                a: `cand`,
                b: `idx`,
                label: `open`
              },
              {
                id: `e4`,
                a: `idx`,
                b: `mrg`,
                label: `read cells`
              }
            ]
          },
          bug: [
            {
              log: `The point read checks the Bloom filter of each of the 12 SSTables (illustrative).`,
              code: 3,
              hl: {
                nodes: {
                  read: `on`,
                  bf: `on`
                },
                edges: {
                  e1: `on`
                }
              },
              stats: [
                {
                  l: `SSTables checked`,
                  v: `12`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `Seven filters answer maybe. One is the right file; six are false positives.`,
              code: 4,
              hl: {
                nodes: {
                  cand: `warn`
                },
                edges: {
                  e2: `warn`
                }
              },
              stats: [
                {
                  l: `files opened`,
                  v: `7`,
                  cls: `bad`
                },
                {
                  l: `false positives`,
                  v: `6`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Each opened file costs an index jump and a disk read, and most of that work finds nothing.`,
              code: 5,
              hl: {
                nodes: {
                  idx: `warn`,
                  cand: `warn`
                },
                edges: {
                  e3: `warn`
                }
              },
              stats: [
                {
                  l: `files skipped`,
                  v: `5`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `The replica merges the candidate cells by timestamp. Each extra open adds latency (p99 40 ms, illustrative).`,
              code: 5,
              hl: {
                nodes: {
                  mrg: `bad`
                },
                edges: {
                  e4: `bad`
                }
              },
              stats: [
                {
                  l: `p99 read`,
                  v: `40 ms (illustrative)`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `The filter target drops from 0.01 to 0.001. Each key now costs about 14.4 bits instead of 9.6 (illustrative memory cost).`,
              code: 1,
              hl: {
                nodes: {
                  bf: `ok`
                }
              },
              stats: [
                {
                  l: `bits per key`,
                  v: `14.4 (was 9.6)`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `Only one false positive is left. The read opens 2 files: the real hit and one false positive.`,
              code: 4,
              hl: {
                nodes: {
                  cand: `ok`
                },
                edges: {
                  e2: `ok`
                }
              },
              stats: [
                {
                  l: `files opened`,
                  v: `2`,
                  cls: `ok`
                },
                {
                  l: `files skipped`,
                  v: `10`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `Fewer opens means less index work and a shorter merge. Recheck filter memory and p99 after the SSTables are rebuilt.`,
              code: 2,
              hl: {
                nodes: {
                  mrg: `ok`
                },
                edges: {
                  e4: `ok`
                }
              },
              stats: [
                {
                  l: `p99 read`,
                  v: `lower (illustrative)`,
                  cls: `ok`
                }
              ]
            }
          ]
        },
        {
          id: `full-scan`,
          label: `ALLOW FILTERING scan`,
          desc: `Without a partition key restriction, the query reads every partition and throws most rows away (counts illustrative).`,
          codeLabel: `Query`,
          code: {
            bug: [
              `cqlsh> TRACING ON;`,
              `SELECT * FROM orders WHERE status = 'open' ALLOW FILTERING;`,
              `-- status is not part of PRIMARY KEY (seller_id, order_id)`,
              `-- no partition key restriction: every partition is a candidate`,
              `-- rows returned: 1,204; rows scanned: about 38,000,000 (illustrative)`
            ],
            fix: [
              `CREATE TABLE orders_by_status (`,
              `  status text, day date, order_id uuid, ...`,
              `  PRIMARY KEY ((status, day), order_id)`,
              `);`,
              `SELECT * FROM orders_by_status WHERE status = ? AND day = ?;`,
              `-- one partition read: rows scanned is close to rows returned`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `q`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Query`,
                s: `status = open`
              },
              {
                id: `all`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `All partitions`,
                s: `full table scan`
              },
              {
                id: `one`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `One partition`,
                s: `keyed by status, day`
              },
              {
                id: `res`,
                x: 460,
                y: 120,
                w: 170,
                h: 60,
                t: `Client`,
                s: `rows returned`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `q`,
                b: `all`,
                label: `scan`
              },
              {
                id: `e2`,
                a: `all`,
                b: `res`,
                label: `filter, 1,204 kept`
              },
              {
                id: `e3`,
                a: `q`,
                b: `one`,
                label: `key lookup`
              },
              {
                id: `e4`,
                a: `one`,
                b: `res`,
                label: `rows`
              }
            ]
          },
          bug: [
            {
              log: `The query has no partition key restriction, so the cluster cannot jump to one partition.`,
              code: 3,
              hl: {
                nodes: {
                  q: `on`,
                  all: `on`
                },
                edges: {
                  e1: `on`
                }
              }
            },
            {
              log: `Every partition is read, and each row is tested against status = open after it is read.`,
              code: 1,
              hl: {
                nodes: {
                  all: `warn`
                },
                edges: {
                  e1: `warn`
                }
              },
              stats: [
                {
                  l: `rows scanned`,
                  v: `about 38,000,000 (illustrative)`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Only 1,204 rows match. The rest were read and thrown away.`,
              code: 4,
              hl: {
                nodes: {
                  all: `bad`,
                  res: `warn`
                },
                edges: {
                  e2: `bad`
                }
              },
              stats: [
                {
                  l: `rows returned`,
                  v: `1,204`,
                  cls: `ok`
                },
                {
                  l: `duration`,
                  v: `41 s (illustrative)`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `The table is keyed for this query: the partition key is (status, day).`,
              code: 2,
              hl: {
                nodes: {
                  one: `new`
                }
              },
              stats: [
                {
                  l: `partition key`,
                  v: `(status, day)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `The query names status and day, so it reads one partition directly.`,
              code: 4,
              hl: {
                nodes: {
                  q: `on`,
                  one: `ok`
                },
                edges: {
                  e3: `ok`,
                  e1: `dim`,
                  e2: `dim`
                }
              }
            },
            {
              log: `Rows scanned now match rows returned, so the request takes milliseconds (illustrative).`,
              code: 5,
              hl: {
                nodes: {
                  one: `ok`,
                  res: `ok`
                },
                edges: {
                  e4: `ok`
                }
              },
              stats: [
                {
                  l: `rows scanned`,
                  v: `close to 1,204`,
                  cls: `ok`
                },
                {
                  l: `latency`,
                  v: `45 ms (illustrative)`,
                  cls: `ok`
                }
              ]
            }
          ]
        }
      ]
    },
    {
      title: `Compaction`,
      problem: `After a week of steady inserts and status updates, nobody touched the order table, yet p99 reads doubled and the disk alarm on node 3 fired at 85% (illustrative). <code>nodetool compactionstats</code> shows a long list of pending compactions and one huge merge in progress.`,
      predict: {
        q: `Which strategy minimises the number of SSTables a read must touch for an update-heavy table?`,
        opts: [
          `SizeTieredCompactionStrategy (STCS)`,
          `LeveledCompactionStrategy (LCS)`,
          `TimeWindowCompactionStrategy (TWCS)`
        ],
        ans: 1,
        why: `LCS keeps one sorted run per level, so a key lives in at most one file per level. The price is write amplification, because data is rewritten as it moves down the levels. STCS writes less but leaves many overlapping files. TWCS is built for time-series data with a TTL, not for random updates.`
      },
      explain: `
<h3>The idea</h3>
<p>Every flush creates a new immutable file. Reads must merge across the files that overlap, so their number matters. Background compaction merges files so reads touch fewer of them. Each strategy chooses which cost to pay: writes, disk space, or reads.</p>
<h3>How it works, step by step</h3>
<p>1. Each memtable flush creates a new SSTable.</p>
<p>2. <b>STCS</b> (SizeTieredCompactionStrategy) merges SSTables of similar size once enough of them exist. Writes are cheap, but overlapping files pile up, and a merge may need as much temporary space as its inputs.</p>
<p>3. <b>LCS</b> (LeveledCompactionStrategy) keeps small, non-overlapping SSTables in levels. A key lives in at most one file per level, so reads touch few files, but the data is rewritten several times.</p>
<p>4. <b>TWCS</b> (TimeWindowCompactionStrategy) groups data by time window and compacts inside each window. When everything in a window has expired, the whole window can be dropped.</p>
<p>5. <b>Headroom.</b> A merge writes its output before the inputs are deleted. If flushes outrun compaction, pending work and the number of SSTables per read keep growing.</p>
<h3>The trade-off</h3>
<p>LCS reads less and writes more. STCS writes less and reads more. TWCS suits time-series data with a consistent TTL. Compaction also uses the disk and CPU that foreground requests need, so pacing it is a balance between backlog and latency.</p>
`,
      diagnose: [
        {
          t: `Compaction backlog`,
          sym: `<b>SSTable count, read p99, and pending compactions climb together.</b>`,
          ctx: `A write burst flushes SSTables faster than background compaction merges them.`,
          why: `More overlapping immutable files accumulate on the read path.`,
          log: `-- representative output, values illustrative
scylla_column_family_pending_compaction ↑
nodetool compactionstats: pending work ↑`,
          note: `Metric and command signal; values depend on the table. Source: <a href="https://docs.scylladb.com/manual/stable/reference/metrics.html" target="_blank" rel="noopener">ScyllaDB metrics</a>`,
          fix: [
            `Inspect compactionstats and disk I/O headroom.`,
            `Reduce ingest pressure or add capacity if backlog keeps growing.`,
            `Recheck the table strategy against the actual read/write pattern.`,
            `Trade-off: More aggressive compaction consumes I/O that foreground requests need.`,
            `Verify: Pending work stops growing and SSTables per read stabilize.`
          ]
        },
        {
          t: `Compaction runs out of headroom`,
          sym: `<b>Disk fills during the merge; write failures may follow.</b>`,
          ctx: `A node is nearly full before a large STCS merge starts.`,
          why: `Compaction writes output before old input files can be removed.`,
          log: `-- representative output, values illustrative
df: data volume near capacity
compactionstats: large merge in progress`,
          note: `Command signals; exact thresholds depend on strategy and deployment. Source: <a href="https://docs.scylladb.com/manual/stable/getting-started/system-requirements.html" target="_blank" rel="noopener">Disk space requirements</a>`,
          fix: [
            `Check free space and the active compaction plan.`,
            `Add disk or nodes before large maintenance work.`,
            `Avoid forcing major compaction on a nearly full node.`,
            `Trade-off: Pausing or slowing writes protects the node but delays ingestion.`,
            `Verify: Free space stays above the operating target during the next merge.`
          ]
        },
        {
          t: `TWCS window stays alive`,
          sym: `<b>Expired windows do not disappear on schedule and disk use stays high.</b>`,
          ctx: `A TTL event table receives late updates to old time windows.`,
          why: `Out-of-order writes or mixed TTLs leave live data in a window that otherwise could be dropped whole.`,
          log: `-- representative output, values illustrative
SSTable age and disk usage: expired-window files persist`,
          note: `Observed storage pattern; there is no universal error log. Source: <a href="https://docs.scylladb.com/manual/stable/architecture/compaction/compaction-strategies.html" target="_blank" rel="noopener">Compaction strategies</a>`,
          fix: [
            `Check TTL variation and timestamps of late writes.`,
            `Keep the workload mostly append-only with a consistent TTL.`,
            `Choose another compaction strategy if old data must be updated often.`,
            `Trade-off: Strict time-window design limits late corrections; another strategy may rewrite more data.`,
            `Verify: Old windows become fully expired and whole SSTables can be removed.`
          ]
        }
      ],
      scenarios: [
        {
          id: `backlog`,
          label: `Backlog grows`,
          desc: `Flushes outpace compaction, so SSTables per read climb and p99 follows. Switching the strategy changes how many files a read touches (numbers illustrative).`,
          codeLabel: `Command`,
          code: {
            bug: [
              `$ nodetool compactionstats   # representative output, illustrative`,
              `pending compactions: 212`,
              `# strategy on orders: SizeTieredCompactionStrategy`,
              `# flushes add an SSTable every few seconds`,
              `# each merge clears fewer files than arrive`,
              `# scylla_column_family_pending_compaction keeps rising`
            ],
            fix: [
              `# change the table to LeveledCompactionStrategy (LCS)`,
              `# fewer SSTables per read, more write amplification`,
              `# reduce ingest pressure or add capacity if the backlog keeps growing`,
              `$ nodetool compactionstats   # pending work stops growing`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `flush`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Memtable flushes`,
                s: `a new SSTable each time`
              },
              {
                id: `sst`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `SSTables on disk`,
                s: `overlapping, many`
              },
              {
                id: `cmp`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `Compaction`,
                s: `merges, falls behind`
              },
              {
                id: `rd`,
                x: 460,
                y: 20,
                w: 170,
                h: 60,
                t: `Reads`,
                s: `touch many files`
              },
              {
                id: `bl`,
                x: 460,
                y: 220,
                w: 170,
                h: 60,
                t: `Backlog`,
                s: `pending keeps growing`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `flush`,
                b: `sst`,
                label: `adds files`
              },
              {
                id: `e2`,
                a: `sst`,
                b: `cmp`,
                label: `input`
              },
              {
                id: `e3`,
                a: `cmp`,
                b: `bl`,
                label: `behind`
              },
              {
                id: `e4`,
                a: `sst`,
                b: `rd`,
                label: `more files`
              },
              {
                id: `e5`,
                a: `bl`,
                b: `rd`,
                label: `p99 up`
              }
            ]
          },
          bug: [
            {
              log: `Writes keep flushing new SSTables into the same table. Each flush adds a file.`,
              code: 3,
              hl: {
                nodes: {
                  flush: `on`,
                  sst: `warn`
                },
                edges: {
                  e1: `on`
                }
              },
              stats: [
                {
                  l: `SSTables on disk`,
                  v: `rising`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `Compaction merges a few files at a time, but finishes fewer merges than flushes arrive.`,
              code: 4,
              hl: {
                nodes: {
                  cmp: `warn`
                },
                edges: {
                  e2: `warn`,
                  e3: `bad`
                }
              },
              stats: [
                {
                  l: `pending compactions`,
                  v: `212 (illustrative)`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Each read has to merge overlapping files, so it touches more of them.`,
              code: 5,
              hl: {
                nodes: {
                  rd: `bad`
                },
                edges: {
                  e4: `bad`
                }
              },
              stats: [
                {
                  l: `files touched per read`,
                  v: `9 (illustrative)`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Reads slow down. p99 doubles from 6 ms to 12 ms (illustrative), and the disk alarm fires at 85% on node 3.`,
              code: 5,
              hl: {
                nodes: {
                  bl: `bad`,
                  rd: `bad`
                },
                edges: {
                  e5: `bad`
                }
              },
              stats: [
                {
                  l: `p99 read`,
                  v: `12 ms (illustrative)`,
                  cls: `bad`
                },
                {
                  l: `disk used`,
                  v: `85% (illustrative)`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `The table moves to LeveledCompactionStrategy. Each key lives in at most one file per level.`,
              code: 0,
              hl: {
                nodes: {
                  sst: `ok`
                },
                edges: {
                  e4: `ok`
                }
              },
              stats: [
                {
                  l: `files per key`,
                  v: `at most one per level`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `Reads touch fewer files. The cost moves to writes, because data is rewritten as it goes down the levels.`,
              code: 1,
              hl: {
                nodes: {
                  rd: `ok`,
                  cmp: `warn`
                },
                edges: {
                  e2: `warn`
                }
              },
              stats: [
                {
                  l: `files touched per read`,
                  v: `fewer (illustrative)`,
                  cls: `ok`
                },
                {
                  l: `write cost`,
                  v: `higher`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `If the backlog still grows, reduce ingest or add capacity. Verify that pending work stops growing.`,
              code: 3,
              hl: {
                nodes: {
                  bl: `ok`
                },
                edges: {
                  e3: `ok`
                }
              },
              stats: [
                {
                  l: `pending compactions`,
                  v: `stops growing`,
                  cls: `ok`
                }
              ]
            }
          ]
        },
        {
          id: `headroom`,
          label: `Disk runs out`,
          desc: `A large STCS merge writes its output before the old inputs are deleted, so a nearly full disk has no room to finish (percentages illustrative).`,
          codeLabel: `Command`,
          code: {
            bug: [
              `$ df -h                      # data volume, illustrative`,
              `# data volume: 94% used`,
              `$ nodetool compactionstats`,
              `# large STCS merge in progress: inputs hold 72% of the disk`,
              `# output is written before the inputs are deleted`,
              `# free space runs out during the merge`
            ],
            fix: [
              `$ df -h                      # free space: 30% (illustrative)`,
              `# add disk or nodes before large maintenance work`,
              `# do not force a major compaction on a nearly full node`,
              `# pause or slow writes to protect the node`,
              `$ nodetool compactionstats   # the merge output fits in free space`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `disk`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Data volume`,
                s: `live SSTables`
              },
              {
                id: `inp`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `Merge inputs`,
                s: `old SSTables`
              },
              {
                id: `outp`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `Merge output`,
                s: `new SSTable`
              },
              {
                id: `free`,
                x: 460,
                y: 120,
                w: 170,
                h: 60,
                t: `Free space`,
                s: `what is left`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `disk`,
                b: `inp`,
                label: `live data`
              },
              {
                id: `e2`,
                a: `inp`,
                b: `outp`,
                label: `merge`
              },
              {
                id: `e3`,
                a: `outp`,
                b: `free`,
                label: `needs room`
              }
            ]
          },
          bug: [
            {
              log: `The data volume is 94% used (illustrative). Almost nothing is free.`,
              code: 1,
              hl: {
                nodes: {
                  disk: `bad`
                }
              },
              stats: [
                {
                  l: `disk used`,
                  v: `94%`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `A large STCS merge starts. It reads its input SSTables and begins writing a new output file.`,
              code: 3,
              hl: {
                nodes: {
                  inp: `warn`,
                  outp: `warn`
                },
                edges: {
                  e2: `warn`
                }
              }
            },
            {
              log: `The output grows while the inputs still exist. Free space falls to about 6% (illustrative).`,
              code: 4,
              hl: {
                nodes: {
                  outp: `bad`,
                  free: `bad`
                },
                edges: {
                  e3: `bad`
                }
              },
              stats: [
                {
                  l: `free space`,
                  v: `6% (illustrative)`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Old inputs are deleted only after the output is complete. If the disk fills first, writes can fail.`,
              code: 5,
              hl: {
                nodes: {
                  free: `bad`
                }
              },
              stats: [
                {
                  l: `write failures`,
                  v: `possible`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `Before the merge, free space is about 30% (illustrative). The output has room to finish.`,
              code: 0,
              hl: {
                nodes: {
                  free: `ok`
                }
              },
              stats: [
                {
                  l: `free space`,
                  v: `30% (illustrative)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `Maintenance waits until a disk or node is added. Writes can be paced to protect the node.`,
              code: 1,
              hl: {
                nodes: {
                  disk: `ok`
                },
                edges: {
                  e1: `ok`
                }
              }
            },
            {
              log: `The merge finishes with room to spare, and free space stays above the operating target.`,
              code: 4,
              hl: {
                nodes: {
                  outp: `ok`,
                  free: `ok`
                },
                edges: {
                  e3: `ok`
                }
              },
              stats: [
                {
                  l: `free space after merge`,
                  v: `above target`,
                  cls: `ok`
                }
              ]
            }
          ]
        }
      ]
    },
    {
      title: `Deletes, TTL and Tombstones`,
      problem: `A fulfilment service uses one table as a work queue: insert a task, read the oldest task, process it, then delete it. About 10 live tasks exist at any time (illustrative). Over a few hours the “read oldest task” query goes from 2 ms to hundreds of milliseconds (illustrative). Disk and CPU look normal, and the table is almost empty.`,
      predict: {
        q: `A partition has 10 live rows and 50,000 deleted ones. How many cells does a full-partition read scan?`,
        opts: [
          `10, only live rows exist`,
          `All of them: live cells plus the tombstones and the shadowed data`,
          `About 50, the read stops early`
        ],
        ans: 1,
        why: `Deleted data is not removed in place. A tombstone marks it, and until compaction purges both, the read must walk the shadowed cells and the tombstones to be sure nothing newer hides a row. A bounded slice that starts after the processed rows avoids most of that work.`
      },
      explain: `
<h3>The idea</h3>
<p>Replicas and immutable files make an in-place delete impossible. A delete writes a new marker, a tombstone, that hides older data until compaction can safely purge both. Deletes are cheap to write, but the markers still have to be read.</p>
<h3>How it works, step by step</h3>
<p>1. A <code>DELETE</code> writes tombstones. There are cell, row, range and partition tombstones. A range or partition tombstone is one marker that shadows many rows.</p>
<p>2. TTL works the same way. An expired cell is treated as a tombstone. It stops being returned once it expires, but it keeps using disk until compaction rewrites the SSTable.</p>
<p>3. A read merges the memtable and the SSTables, and must skip every shadowed cell it meets. A queue partition fills up with deleted rows at its front, so “the oldest live row” is found only after walking past them.</p>
<p>4. Compaction drops a tombstone only when it is old enough (<code>gc_grace_seconds</code> or repair, covered in the next chapter) and no older data outside the compaction inputs could come back.</p>
<h3>The trade-off</h3>
<p>Deletes are cheap for writes but not free for reads. Wide partitions that churn through deletes slow every read that starts at their front. Raising warning thresholds hides the symptom; a bounded read range or a different data model removes it.</p>
`,
      diagnose: [
        {
          t: `Tombstone-heavy read`,
          sym: `<b>Reads are slow although few live rows are returned.</b>`,
          ctx: `A queue-like table deletes rows after processing, then scans a wide partition for the next live row.`,
          why: `The reader must walk deletion markers while searching for live rows.`,
          log: `-- representative output, values illustrative
tombstone_warn_threshold: single-partition read scans many tombstones`,
          note: `Representative warning description; exact log wording varies by version. Source: <a href="https://docs.scylladb.com/manual/stable/reference/configuration-parameters.html" target="_blank" rel="noopener">Configuration parameters</a>`,
          fix: [
            `Trace the slow query and count tombstones scanned.`,
            `Use bounded partitions and narrower read ranges.`,
            `Change the queue-like model or TTL pattern; avoid raising warning thresholds as the main fix.`,
            `Trade-off: A new key model may need migration and more targeted queries.`,
            `Verify: Tombstones scanned per query and read p99 both fall.`
          ]
        },
        {
          t: `Binding null in prepared inserts creates tombstones`,
          sym: `<b>A table with few deletes still reports many tombstones and slow reads.</b>`,
          ctx: `The order service uses one prepared statement for all columns and binds <code>null</code> for missing optional fields such as <code>coupon_code</code>.`,
          why: `Writing an explicit null to a column is a delete of that cell, so every insert creates tombstones for each empty optional column. They add up in wide partitions and in every SSTable they are flushed to.`,
          log: `-- representative output, values illustrative
INSERT INTO orders (id, item, coupon_code, note) VALUES (?, ?, ?, ?)  -- coupon_code = null, note = null
result: 2 tombstone cells written per insert
nodetool tablestats ks_orders.orders: tombstones scanned per slice (avg) 38.4`,
          note: `The statement looks like a plain insert, but each null becomes a tombstone cell. Counts shown are illustrative. Source: <a href="https://docs.scylladb.com/manual/stable/cql/dml/insert.html" target="_blank" rel="noopener">INSERT statement</a>`,
          fix: [
            `Measure first: check tombstones in tracing or table statistics and compare with the number of explicit deletes the application issues.`,
            `Fix: leave a column unset (driver “unset” value, or build the statement without it) instead of binding null.`,
            `Fix: use null only when you really mean “delete this value”.`,
            `Verify: tombstones scanned per read stay near zero for a table without deletes.`
          ]
        },
        {
          t: `TTL-expired data keeps using disk until compaction`,
          sym: `<b>Disk usage keeps growing although most rows have already expired.</b>`,
          ctx: `A session table sets <code>default_time_to_live = 86400</code> (one day, illustrative) and the team expects disk usage to follow the last 24 hours.`,
          why: `Expiry does not delete bytes. An expired cell becomes a tombstone, and the space returns only when a compaction rewrites the SSTable and the purge rules allow dropping it. With TWCS and no user deletes, a whole expired window can be dropped at once.`,
          log: `-- representative output, values illustrative
$ nodetool tablestats ks_sessions.sessions
    Space used (live): 412 GB
    Table: sessions   default_time_to_live: 86400
rows returned by SELECT in the last 24 h: ~6 GB worth`,
          note: `The live data a query can return is far smaller than the bytes on disk. Source: <a href="https://docs.scylladb.com/manual/stable/cql/ddl.html" target="_blank" rel="noopener">Table options and tombstone GC</a>`,
          fix: [
            `Measure first: compare <code>nodetool tablestats</code> space used with the data a query can still return, and check SSTable ages.`,
            `Fix: for append-only TTL data use <code>TimeWindowCompactionStrategy</code> with one consistent TTL, so whole windows expire together.`,
            `Fix: the docs describe <code>tombstone_gc = {'mode': 'immediate'}</code> for TWCS tables without user deletes; use it only when that condition is true.`,
            `Verify: disk usage tracks the TTL horizon and old SSTables disappear after their window expires.`
          ]
        }
      ],
      scenarios: [
        {
          id: `queue-scan`,
          label: `Queue scans tombstones`,
          desc: `Deleted tasks pile up at the front of one queue partition. The oldest-live-task read walks past them (counts illustrative).`,
          codeLabel: `Query`,
          code: {
            bug: [
              `-- one partition per queue name (PRIMARY KEY (queue, task_id))`,
              `DELETE FROM tasks WHERE queue = 'fulfil' AND task_id = ?;   -- after processing`,
              `SELECT * FROM tasks WHERE queue = 'fulfil' LIMIT 1;   -- oldest live task`,
              `-- the read starts at the front of the partition`,
              `-- about 50,000 deleted rows still sit ahead of the live ones (illustrative)`
            ],
            fix: [
              `-- bound the read: start after the last processed id`,
              `SELECT * FROM tasks WHERE queue = 'fulfil' AND task_id > ? LIMIT 1;`,
              `-- or bucket the partition by time, so old buckets hold no live rows`,
              `-- tombstones scanned per read fall toward 0 (illustrative)`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `reader`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Oldest-task read`,
                s: `SELECT ... LIMIT 1`
              },
              {
                id: `dead`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `Tombstones ahead`,
                s: `about 50,000 deleted`
              },
              {
                id: `live`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `Live rows`,
                s: `about 10 rows`
              },
              {
                id: `res`,
                x: 460,
                y: 120,
                w: 170,
                h: 60,
                t: `Result`,
                s: `first live row`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `reader`,
                b: `dead`,
                label: `walks past`
              },
              {
                id: `e2`,
                a: `dead`,
                b: `live`,
                label: `then reaches`
              },
              {
                id: `e3`,
                a: `live`,
                b: `res`,
                label: `returns`
              },
              {
                id: `e4`,
                a: `reader`,
                b: `live`,
                label: `start after id`
              }
            ]
          },
          bug: [
            {
              log: `Each processed task is deleted, so a tombstone is written at its position in the partition (illustrative).`,
              code: 1,
              hl: {
                nodes: {
                  dead: `warn`
                },
                edges: {}
              },
              stats: [
                {
                  l: `tombstones written`,
                  v: `1 per task`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `After many hours, the front of the partition holds about 50,000 deleted rows, and only about 10 are live (illustrative).`,
              code: 4,
              hl: {
                nodes: {
                  dead: `bad`,
                  live: `ok`
                }
              },
              stats: [
                {
                  l: `deleted rows at the front`,
                  v: `about 50,000`,
                  cls: `bad`
                },
                {
                  l: `live rows`,
                  v: `about 10`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `The SELECT with LIMIT 1 starts at the front and must walk past the tombstones to find a live row.`,
              code: 2,
              hl: {
                nodes: {
                  reader: `on`,
                  dead: `bad`
                },
                edges: {
                  e1: `bad`
                }
              }
            },
            {
              log: `Each tombstone is read and skipped. Only then does the read reach the first live task.`,
              code: 3,
              hl: {
                nodes: {
                  live: `warn`,
                  res: `warn`
                },
                edges: {
                  e2: `warn`,
                  e3: `warn`
                }
              },
              stats: [
                {
                  l: `tombstones scanned`,
                  v: `about 50,000 (illustrative)`,
                  cls: `bad`
                },
                {
                  l: `latency`,
                  v: `hundreds of ms (illustrative)`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `The read starts after the last processed id, so it skips the deleted rows entirely.`,
              code: 1,
              hl: {
                nodes: {
                  reader: `ok`
                },
                edges: {
                  e1: `dim`,
                  e2: `dim`,
                  e4: `ok`
                }
              }
            },
            {
              log: `The first live row is found at once, with almost no tombstones on the way (illustrative).`,
              code: 3,
              hl: {
                nodes: {
                  live: `ok`,
                  res: `ok`
                },
                edges: {
                  e3: `ok`,
                  e4: `ok`
                }
              },
              stats: [
                {
                  l: `tombstones scanned`,
                  v: `about 0 (illustrative)`,
                  cls: `ok`
                },
                {
                  l: `latency`,
                  v: `2 ms (illustrative)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `Old time buckets stop holding live rows, so they can be read less and compacted sooner.`,
              code: 2,
              hl: {
                nodes: {
                  dead: `dim`
                }
              },
              stats: [
                {
                  l: `partition size`,
                  v: `bounded`,
                  cls: `ok`
                }
              ]
            }
          ]
        },
        {
          id: `null-tombstones`,
          label: `Null binding deletes`,
          desc: `Binding null in an INSERT writes a tombstone for every empty column. Leaving the column unset writes nothing (counts illustrative).`,
          codeLabel: `Query`,
          code: {
            bug: [
              `-- one prepared statement for every order`,
              `INSERT INTO orders (id, item, coupon_code, note) VALUES (?, ?, ?, ?);`,
              `-- bind coupon_code = null, note = null`,
              `-- an explicit null is a delete of that cell`,
              `-- 2 tombstone cells written per insert (illustrative)`,
              `-- tablestats: tombstones scanned per slice (avg) 38.4 (illustrative)`
            ],
            fix: [
              `-- same statement, but optional columns are left unset`,
              `INSERT INTO orders (id, item, coupon_code, note) VALUES (?, ?, ?, ?);`,
              `-- bind UNSET for coupon_code and note (driver unset value)`,
              `-- unset columns write nothing`,
              `-- tombstones per insert: 0 (illustrative)`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `stmt`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `INSERT statement`,
                s: `four bound values`
              },
              {
                id: `c1`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `coupon_code`,
                s: `optional column`
              },
              {
                id: `c2`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `note`,
                s: `optional column`
              },
              {
                id: `sst`,
                x: 460,
                y: 120,
                w: 170,
                h: 60,
                t: `SSTable`,
                s: `cells flushed to disk`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `stmt`,
                b: `c1`,
                label: `bind`
              },
              {
                id: `e2`,
                a: `stmt`,
                b: `c2`,
                label: `bind`
              },
              {
                id: `e3`,
                a: `c1`,
                b: `sst`,
                label: `flushed`
              },
              {
                id: `e4`,
                a: `c2`,
                b: `sst`,
                label: `flushed`
              }
            ]
          },
          bug: [
            {
              log: `The service binds null for coupon_code, because most orders have no coupon (illustrative).`,
              code: 2,
              hl: {
                nodes: {
                  stmt: `on`,
                  c1: `bad`
                },
                edges: {
                  e1: `bad`
                }
              }
            },
            {
              log: `An explicit null is written as a delete of that cell, so a tombstone is created for coupon_code.`,
              code: 3,
              hl: {
                nodes: {
                  c1: `bad`
                },
                edges: {
                  e1: `bad`,
                  e3: `warn`
                }
              },
              stats: [
                {
                  l: `tombstones per insert`,
                  v: `2 (illustrative)`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `The note column is null too, so a second tombstone is written. Both are flushed to SSTables.`,
              code: 4,
              hl: {
                nodes: {
                  c2: `bad`,
                  sst: `warn`
                },
                edges: {
                  e2: `bad`,
                  e3: `warn`,
                  e4: `warn`
                }
              }
            },
            {
              log: `Every read of these partitions now scans the tombstones too (38.4 per slice on average, illustrative).`,
              code: 5,
              hl: {
                nodes: {
                  sst: `bad`
                }
              },
              stats: [
                {
                  l: `tombstones scanned per slice`,
                  v: `38.4 (illustrative)`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `The statement is the same, but the optional columns are bound as UNSET, which the driver sends as nothing.`,
              code: 2,
              hl: {
                nodes: {
                  stmt: `ok`
                },
                edges: {
                  e1: `dim`,
                  e2: `dim`
                }
              }
            },
            {
              log: `An unset column is not written, so no cell and no tombstone are created.`,
              code: 3,
              hl: {
                nodes: {
                  c1: `ok`,
                  c2: `ok`
                }
              }
            },
            {
              log: `Tombstones per insert drop to 0, and reads scan only live cells (illustrative).`,
              code: 4,
              hl: {
                nodes: {
                  sst: `ok`
                }
              },
              stats: [
                {
                  l: `tombstones per insert`,
                  v: `0`,
                  cls: `ok`
                }
              ]
            }
          ]
        }
      ]
    },
    {
      title: `Repair and gc_grace_seconds`,
      problem: `An order was cancelled and deleted at QUORUM on day 1. Replica C was down for maintenance and stayed down for three days (illustrative). On day 14, right after the scheduled repair, a customer sees the cancelled order again, even though all three replicas are healthy now. The table uses <code>gc_grace_seconds = 864000</code> (10 days), and repair runs every 14 days (illustrative).`,
      predict: {
        q: `<code>gc_grace_seconds</code> is 10 days and repair runs every 14 days (timeout-based tombstone GC). Can a deleted row come back?`,
        opts: [
          `No, the delete was acknowledged by a quorum`,
          `Yes, tombstones can be purged before repair delivers them to a replica that missed the delete`,
          `Only if the clocks of the nodes differ by more than a day`
        ],
        ans: 1,
        why: `The tombstone can be purged after 10 days, but the next repair is at day 14. Replica C still holds the old row and never received the delete. Once the tombstone is gone, nothing marks the row as deleted, so repair copies the old row back as if it were new.`
      },
      explain: `
<h3>The idea</h3>
<p>A tombstone is the only evidence that a row was deleted. The full resurrection story, where a purge before repair brings a deleted row back, is in chapter 7. A replica that missed the delete still holds the old row, so the tombstone must survive until every replica has seen it. Repair and hints are how missed deletes reach a replica; the grace period is how long the tombstone is kept.</p>
<h3>How it works, step by step</h3>
<p>1. <b>Hinted handoff.</b> The coordinator stores a hint for a replica that is down, but only for the <code>max_hint_window_in_ms</code> window (3 hours by default).</p>
<p>2. <b>Row-level repair</b> (<code>nodetool repair</code>) compares the replicas and streams the differences, including tombstones.</p>
<p>3. <b>Timeout GC.</b> With <code>tombstone_gc</code> mode <code>timeout</code>, a tombstone can be purged after <code>gc_grace_seconds</code> (default 864000, 10 days), whether or not a repair ran.</p>
<p>4. <b>Repair GC.</b> With mode <code>repair</code>, a tombstone is purged only after a repair has made the replicas agree. Elapsed time alone does not release it. Check the table’s <code>tombstone_gc</code> option, because defaults can vary by version and table type.</p>
<p>5. If the purge happens first, the missed delete is gone for good. Repair then copies the old row back.</p>
<h3>The trade-off</h3>
<p>A longer <code>gc_grace_seconds</code> keeps tombstones longer, which costs disk and read time. Repair-based GC is safer, but it keeps dead data longer when repair is delayed. Hints cover only short outages; for longer ones, repair or replacement is the way to catch up.</p>
`,
      diagnose: [
        {
          t: `Deleted row resurfaces`,
          sym: `<b>An old row appears again when the replica rejoins.</b>`,
          ctx: `A replica misses a DELETE and remains offline beyond a timeout-based GC window.`,
          why: `The tombstone may be purged before that replica learns it, allowing the old value to spread.`,
          log: `-- representative output, values illustrative
Repair history: no completed repair inside gc_grace_seconds`,
          note: `Diagnostic schedule signal, not a literal error log. Source: <a href="https://docs.scylladb.com/manual/stable/cql/ddl.html" target="_blank" rel="noopener">Table options and tombstone GC</a>`,
          fix: [
            `Check the table’s tombstone_gc mode first.`,
            `For timeout mode, complete repair within the grace window.`,
            `Use the documented replacement path for replicas that have been absent too long.`,
            `Trade-off: Longer grace retains tombstones; repair-based GC waits for repair before purging.`,
            `Verify: All replicas agree on the deletion after repair or replacement.`
          ]
        },
        {
          t: `Wrong tombstone GC assumption`,
          sym: `<b>Disk usage remains high after the timeout passes.</b>`,
          ctx: `An operator lowers gc_grace_seconds on a tablet table expecting tombstones to vanish immediately.`,
          why: `Repair mode waits for a completed repair and is not governed by elapsed gc_grace_seconds alone.`,
          log: `DESCRIBE TABLE: tombstone_gc = {mode: repair}`,
          note: `Table option signal; default modes can vary by version and table type. Source: <a href="https://docs.scylladb.com/manual/stable/cql/ddl.html" target="_blank" rel="noopener">Table options and tombstone GC</a>`,
          fix: [
            `Read the actual tombstone_gc table option.`,
            `Confirm a repair completed after the relevant deletes.`,
            `Inspect overlapping SSTables and compaction progress before changing settings.`,
            `Trade-off: Repair-based GC favors safety; it can retain dead data longer if repair is delayed.`,
            `Verify: After repair and compaction, eligible tombstones and disk use decline.`
          ]
        },
        {
          t: `A node down past the hint window rejoins without repair`,
          sym: `<b>After a long outage the node serves stale reads at low consistency levels until it is repaired.</b>`,
          ctx: `Replica C was down for 5 hours. <code>max_hint_window_in_ms</code> is 3 hours (the default), so the coordinators stopped storing hints for C after hour 3. C rejoins and is not repaired.`,
          why: `Hints only cover the outage up to the hint window. Writes after that point were never recorded for C, so only repair can bring C back in line. Until then, a read that includes C at ONE may return old data.`,
          log: `-- representative output, values illustrative
node C: down 05:00 .. 10:00 (5 h)    max_hint_window_in_ms = 10800000 (3 h)
hints stored for C: 05:00 .. 08:00      writes 08:00 .. 10:00: no hint
SELECT ... CONSISTENCY ONE  -> served by C  -> stale order status`,
          note: `Compare the outage length with the hint window. Source: <a href="https://docs.scylladb.com/manual/stable/architecture/anti-entropy/hinted-handoff.html" target="_blank" rel="noopener">Hinted handoff</a>`,
          fix: [
            `Measure first: compare the outage duration with <code>max_hint_window_in_ms</code>.`,
            `Fix: run <code>nodetool repair</code> for the affected keyspace after the node rejoins, before relying on ONE reads.`,
            `Fix: read at <code>QUORUM</code> or <code>LOCAL_QUORUM</code> when the data must be current right after an outage.`,
            `Trade-off: a longer hint window stores more hints and floods the node on return; it does not replace repair.`,
            `Verify: after repair completes, the same key returns the same value from every replica.`
          ]
        }
      ],
      scenarios: [
        {
          id: `hint-window`,
          label: `Outage past hints`,
          desc: `Hints cover only the first 3 hours of a 5-hour outage. Writes after that are never stored for replica C, and only repair closes the gap (times illustrative).`,
          codeLabel: `Log`,
          code: {
            bug: [
              `node C: down 05:00 .. 10:00 (5 h)`,
              `max_hint_window_in_ms = 10800000 (3 h)`,
              `hints stored for C: 05:00 .. 08:00`,
              `writes 08:00 .. 10:00: no hint`,
              `SELECT ... CONSISTENCY ONE  -> served by C  -> stale order status`,
              `# C rejoins at 10:00 and is not repaired`
            ],
            fix: [
              `node C: down 05:00 .. 10:00 (5 h)`,
              `# hints still cover 05:00 .. 08:00 only`,
              `$ nodetool repair ks_orders   # after C rejoins`,
              `# read at QUORUM or LOCAL_QUORUM until repair completes`,
              `# the same key now returns the same value from every replica`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `c`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Replica C`,
                s: `down 05:00 to 10:00`
              },
              {
                id: `hint`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `Hints stored`,
                s: `05:00 to 08:00`
              },
              {
                id: `gap`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `No hints`,
                s: `08:00 to 10:00`
              },
              {
                id: `rep`,
                x: 460,
                y: 220,
                w: 170,
                h: 60,
                t: `nodetool repair`,
                s: `fills the gap`
              },
              {
                id: `rd`,
                x: 460,
                y: 20,
                w: 170,
                h: 60,
                t: `Read at ONE`,
                s: `may be served by C`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `hint`,
                b: `c`,
                label: `replayed`
              },
              {
                id: `e2`,
                a: `gap`,
                b: `c`,
                label: `never sent`
              },
              {
                id: `e3`,
                a: `rd`,
                b: `c`,
                label: `stale`
              },
              {
                id: `e4`,
                a: `rep`,
                b: `c`,
                label: `repair`
              }
            ]
          },
          bug: [
            {
              log: `Replica C is down for 5 hours. max_hint_window_in_ms is 3 hours, so hints have a limit (illustrative).`,
              code: 1,
              hl: {
                nodes: {
                  c: `bad`
                }
              },
              stats: [
                {
                  l: `outage`,
                  v: `5 h`,
                  cls: `bad`
                },
                {
                  l: `hint window`,
                  v: `3 h`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `Coordinators store hints for C from 05:00 to 08:00. After that they stop storing hints for it.`,
              code: 2,
              hl: {
                nodes: {
                  hint: `ok`
                },
                edges: {
                  e1: `warn`
                }
              },
              stats: [
                {
                  l: `hints stored`,
                  v: `3 h`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `Writes from 08:00 to 10:00 are never recorded for C, so nothing will replay them.`,
              code: 3,
              hl: {
                nodes: {
                  gap: `bad`
                },
                edges: {
                  e2: `bad`
                }
              },
              stats: [
                {
                  l: `writes missing on C`,
                  v: `2 h`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `C rejoins at 10:00 with stale data. A read at ONE that lands on C returns the old status.`,
              code: 4,
              hl: {
                nodes: {
                  c: `bad`,
                  rd: `bad`
                },
                edges: {
                  e3: `bad`
                }
              },
              stats: [
                {
                  l: `order status`,
                  v: `stale`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `Compare the outage with the hint window: 5 hours down, but hints cover only 3 hours.`,
              code: 0,
              hl: {
                nodes: {
                  c: `warn`,
                  hint: `ok`
                }
              },
              stats: [
                {
                  l: `hints cover`,
                  v: `3 of 5 h`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `After C rejoins, nodetool repair streams the missing writes from the other replicas.`,
              code: 2,
              hl: {
                nodes: {
                  rep: `ok`,
                  c: `ok`
                },
                edges: {
                  e4: `ok`,
                  e2: `dim`
                }
              }
            },
            {
              log: `Until repair completes, reads use QUORUM or LOCAL_QUORUM. Then every replica returns the same value.`,
              code: 4,
              hl: {
                nodes: {
                  rd: `ok`,
                  c: `ok`
                },
                edges: {
                  e3: `ok`
                }
              },
              stats: [
                {
                  l: `order status`,
                  v: `current on every replica`,
                  cls: `ok`
                }
              ]
            }
          ]
        }
      ]
    },
    {
      title: `Tablets and Migration`,
      problem: `The team adds a fourth node at 19:30, when the cluster is at 80% CPU (illustrative). While the new node streams data, p99 reads rise from 8 ms to 30 ms (illustrative). Writes keep succeeding, but node 1 still shows the highest CPU, and someone asks whether the new node is doing anything at all.`,
      predict: {
        q: `During a tablet move, which replica serves writes that arrive after the snapshot was taken?`,
        opts: [
          `Only the old owner, the new one gets the data at the end`,
          `Both, until ownership switches; then the new owner`,
          `Only the new owner, from the moment the move starts`
        ],
        ans: 1,
        why: `To avoid losing writes, a move copies a snapshot first, keeps both replicas receiving writes while it catches up, and only after a fence does the new replica become the owner. The docs describe the exact stages for your version; this is a simplified view.`
      },
      explain: `
<h3>The idea</h3>
<p>Capacity should grow while traffic keeps running. Tablets let the cluster move small units of data one at a time: copy a snapshot, catch up on the writes that arrive meanwhile, then switch ownership in one committed step. No global rebalance is needed.</p>
<h3>How it works, step by step</h3>
<p>1. A table is split into tablets. Each tablet has a token range, a replica set and a state. The tablet map is metadata, and it is changed through Raft (next chapter).</p>
<p>2. The load balancer runs in the background. It moves tablets from loaded nodes to emptier ones, and balances shards inside a node.</p>
<p>3. A move copies a snapshot to the new replica. Writes that arrive during the copy reach both replicas until the switch.</p>
<p>4. The move ends with a committed change to the map. Only then does the new replica become the owner.</p>
<p>5. Tablets split when they grow past a size target and merge when they shrink. A split divides a token range; it cannot divide one partition key.</p>
<p>6. Vnode keyspaces behave differently. A new node takes whole token ranges, and the old nodes keep the data until <code>nodetool cleanup</code> removes it.</p>
<h3>The trade-off</h3>
<p>Paced moves protect foreground latency, but the imbalance lasts longer. Moves, splits and merges are background work that shares disk and network with requests. A tablet move cannot make one hot partition key cooler, because the key stays in one piece.</p>
`,
      diagnose: [
        {
          t: `Migration hurts p99`,
          sym: `<b>Foreground read and write p99 rises while streaming progresses.</b>`,
          ctx: `A new node joins during peak traffic and many tablets stream to it.`,
          why: `Snapshot transfer and catch-up use resources shared with foreground work.`,
          log: `-- representative output, values illustrative
Monitoring: streaming bytes ↑, disk/network queue delay ↑, request p99 ↑`,
          note: `Metric pattern; no universal migration error message. Source: <a href="https://docs.scylladb.com/manual/stable/architecture/tablets.html" target="_blank" rel="noopener">Tablet distribution</a>`,
          fix: [
            `Check streaming progress beside network and disk saturation.`,
            `Pace topology changes or schedule them during lower traffic.`,
            `Keep capacity headroom so migration can finish without starving requests.`,
            `Trade-off: Slower moves prolong imbalance; faster moves can harm foreground latency.`,
            `Verify: p99 recovers while migration still makes steady progress.`
          ]
        },
        {
          t: `Hot tablet remains hot`,
          sym: `<b>The hot shard changes location; the hotspot itself remains.</b>`,
          ctx: `The balancer moves a busy tablet but one partition inside it owns most traffic.`,
          why: `Tablet balancing can move a token range, but a single partition key remains indivisible.`,
          log: `-- representative output, values illustrative
Per-shard CPU: hotspot follows the moved tablet`,
          note: `Metric pattern, not an error log. Source: <a href="https://docs.scylladb.com/manual/stable/architecture/tablets.html" target="_blank" rel="noopener">Tablet distribution</a>`,
          fix: [
            `Compare tablet load with per-partition request distribution.`,
            `Bucket the hot key or change the application access pattern.`,
            `Let the balancer handle the remaining range-level skew.`,
            `Trade-off: Bucketing can add fan-out to reads; moving alone cannot split one key.`,
            `Verify: Traffic from the hot logical key is spread across several physical partitions.`
          ]
        },
        {
          t: `Old data stays on disk after scale-out in a vnode keyspace`,
          sym: `<b>The new node has data, but the old nodes did not shrink.</b>`,
          ctx: `A cluster with a vnode keyspace gets a fourth node. A week later, nodes 1 to 3 still show nearly the same disk usage as before.`,
          why: `After a range movement, the old replicas still hold data for tokens they no longer own. That data keeps using disk until it is removed with <code>nodetool cleanup</code>.`,
          log: `-- representative output, values illustrative
$ nodetool status ks_orders
UN  10.0.1.11  Load 1.21 TB
UN  10.0.1.12  Load 1.19 TB
UN  10.0.1.13  Load 1.22 TB
UN  10.0.1.14  Load 0.81 TB   (joined 7 days ago)`,
          note: `If the old nodes keep their load after a node joined, the data they no longer own is still on disk. Source: <a href="https://docs.scylladb.com/manual/stable/operating-scylla/nodetool-commands/cleanup.html" target="_blank" rel="noopener">nodetool cleanup</a>`,
          fix: [
            `Measure first: compare <code>nodetool status</code> load on old and new nodes after the join has completed.`,
            `Fix: run <code>nodetool cleanup &lt;keyspace&gt;</code> on each old node, one node at a time, because it rewrites SSTables and uses I/O.`,
            `Trade-off: cleanup competes with foreground traffic, so schedule it in low-traffic hours.`,
            `Verify: the load on old nodes drops and the sum of loads matches the data size.`
          ]
        }
      ],
      scenarios: [
        {
          id: `tablet-move`,
          label: `Tablet moves`,
          desc: `A tablet is copied, catches up on new writes, then ownership switches. The streaming shares I/O with reads (times illustrative).`,
          codeLabel: `Log`,
          code: {
            bug: [
              `# node 4 joins; the balancer picks tablet 17 from node 1`,
              `# tablet 17: snapshot copied to node 4 (streaming)`,
              `# writes arriving now go to both replicas`,
              `# streaming and requests share disk and network I/O`,
              `# read p99: 8 ms to 30 ms (illustrative)`,
              `# node 1 still owns tablet 17 until the switch`
            ],
            fix: [
              `# pace streaming: schedule the join in low-traffic hours`,
              `# tablet 17: snapshot copied, catch-up writes applied`,
              `# fence: a committed map change moves ownership to node 4`,
              `# node 1 stops serving tablet 17`,
              `# read p99 recovers while streaming keeps moving`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `n1`,
                x: 10,
                y: 20,
                w: 170,
                h: 60,
                t: `Node 1`,
                s: `owns tablet 17`
              },
              {
                id: `tab`,
                x: 235,
                y: 120,
                w: 170,
                h: 60,
                t: `Tablet 17`,
                s: `token range, replicas`
              },
              {
                id: `n4`,
                x: 460,
                y: 20,
                w: 170,
                h: 60,
                t: `Node 4 (new)`,
                s: `receives tablet 17`
              },
              {
                id: `wr`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `New writes`,
                s: `arrive during the copy`
              },
              {
                id: `rd`,
                x: 460,
                y: 220,
                w: 170,
                h: 60,
                t: `Foreground reads`,
                s: `p99 8 to 30 ms`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `n1`,
                b: `tab`,
                label: `owns`
              },
              {
                id: `e2`,
                a: `tab`,
                b: `n4`,
                label: `snapshot`
              },
              {
                id: `e3`,
                a: `wr`,
                b: `n1`,
                label: `catch-up`
              },
              {
                id: `e4`,
                a: `wr`,
                b: `n4`,
                label: `catch-up`
              },
              {
                id: `e5`,
                a: `rd`,
                b: `n1`,
                label: `shared I/O`
              }
            ]
          },
          bug: [
            {
              log: `Node 4 joins. The balancer picks tablet 17 from node 1 and starts copying a snapshot to node 4.`,
              code: 0,
              hl: {
                nodes: {
                  n1: `on`,
                  n4: `new`,
                  tab: `on`
                },
                edges: {
                  e1: `on`,
                  e2: `on`
                }
              }
            },
            {
              log: `New writes keep arriving during the copy. They must reach the old replica and the new one.`,
              code: 2,
              hl: {
                nodes: {
                  wr: `warn`
                },
                edges: {
                  e3: `warn`,
                  e4: `warn`
                }
              },
              stats: [
                {
                  l: `replicas receiving writes`,
                  v: `2`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `Streaming uses the same disk and network as requests, so foreground reads slow down (illustrative).`,
              code: 3,
              hl: {
                nodes: {
                  rd: `bad`,
                  n1: `warn`
                },
                edges: {
                  e5: `bad`
                }
              },
              stats: [
                {
                  l: `read p99`,
                  v: `8 ms to 30 ms (illustrative)`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Node 1 still reports the highest CPU, because it owns tablet 17 until the switch. Node 4 looks idle for now.`,
              code: 5,
              hl: {
                nodes: {
                  n1: `bad`,
                  n4: `dim`
                },
                edges: {
                  e1: `bad`
                }
              },
              stats: [
                {
                  l: `node 4 CPU`,
                  v: `low while streaming`,
                  cls: `warn`
                }
              ]
            }
          ],
          fix: [
            {
              log: `Streaming is paced, and the join happens in low-traffic hours, so foreground traffic keeps headroom.`,
              code: 0,
              hl: {
                nodes: {
                  rd: `ok`
                },
                edges: {
                  e5: `dim`
                }
              },
              stats: [
                {
                  l: `read p99`,
                  v: `stays near 8 ms (illustrative)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `The copy and catch-up finish. A committed map change makes node 4 the owner of tablet 17.`,
              code: 2,
              hl: {
                nodes: {
                  n4: `ok`,
                  tab: `ok`
                },
                edges: {
                  e2: `ok`,
                  e1: `dim`
                }
              }
            },
            {
              log: `Node 1 stops serving tablet 17, so the load moves with the tablet.`,
              code: 3,
              hl: {
                nodes: {
                  n1: `dim`,
                  n4: `ok`
                },
                edges: {
                  e1: `dim`,
                  e2: `ok`
                }
              },
              stats: [
                {
                  l: `owner of tablet 17`,
                  v: `node 4`,
                  cls: `ok`
                }
              ]
            }
          ]
        },
        {
          id: `hot-tablet`,
          label: `Hot tablet`,
          desc: `Moving a tablet moves the hot spot with it, because one partition key cannot be split by a tablet move (percentages illustrative).`,
          codeLabel: `Log`,
          code: {
            bug: [
              `# per-shard CPU, before the move`,
              `shard A: 90% of traffic (tablet holding seller 77)`,
              `# balancer moves the tablet to shard D`,
              `shard D: 90% of traffic now`,
              `# one partition key is indivisible inside the tablet`,
              `# the hotspot follows the moved tablet`
            ],
            fix: [
              `# bucket the hot key in the data model`,
              `# seller 77 spreads over 16 partitions (illustrative)`,
              `# each bucket hashes to its own token`,
              `# the balancer now spreads the load across shards`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `a`,
                x: 10,
                y: 20,
                w: 170,
                h: 60,
                t: `Shard A`,
                s: `was hot (90%)`
              },
              {
                id: `d`,
                x: 235,
                y: 120,
                w: 170,
                h: 60,
                t: `Shard D`,
                s: `hot after the move`
              },
              {
                id: `b`,
                x: 460,
                y: 20,
                w: 170,
                h: 60,
                t: `Shard B`,
                s: `a few percent`
              },
              {
                id: `key`,
                x: 10,
                y: 220,
                w: 170,
                h: 60,
                t: `Seller 77 key`,
                s: `one partition key`
              },
              {
                id: `bk`,
                x: 235,
                y: 220,
                w: 170,
                h: 60,
                t: `Buckets 0 to 15`,
                s: `16 partitions`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `a`,
                b: `d`,
                label: `tablet moves`
              },
              {
                id: `e2`,
                a: `d`,
                b: `key`,
                label: `holds`
              },
              {
                id: `e3`,
                a: `bk`,
                b: `b`,
                label: `spread`
              },
              {
                id: `e4`,
                a: `key`,
                b: `bk`,
                label: `bucket`
              }
            ]
          },
          bug: [
            {
              log: `Before the move, shard A holds the tablet with seller 77 and takes 90% of traffic (illustrative).`,
              code: 1,
              hl: {
                nodes: {
                  a: `bad`
                }
              },
              stats: [
                {
                  l: `shard A share`,
                  v: `90% (illustrative)`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `The balancer moves the tablet to shard D. The hotspot moves with it.`,
              code: 2,
              hl: {
                nodes: {
                  a: `dim`,
                  d: `bad`
                },
                edges: {
                  e1: `bad`
                }
              },
              stats: [
                {
                  l: `shard D share`,
                  v: `90% (illustrative)`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Inside the tablet, one partition key still maps to one token and one replica set, so it cannot be split.`,
              code: 4,
              hl: {
                nodes: {
                  key: `bad`,
                  d: `bad`
                },
                edges: {
                  e2: `bad`
                }
              }
            },
            {
              log: `Shard B and the other shards stay near 3% each. Nothing was divided, so the load is still uneven (illustrative).`,
              code: 5,
              hl: {
                nodes: {
                  b: `dim`,
                  key: `bad`
                }
              },
              stats: [
                {
                  l: `shard B share`,
                  v: `3% (illustrative)`,
                  cls: `warn`
                }
              ]
            }
          ],
          fix: [
            {
              log: `The key is bucketed in the data model: seller 77 becomes 16 partitions (illustrative).`,
              code: 0,
              hl: {
                nodes: {
                  key: `ok`
                },
                edges: {
                  e4: `ok`
                }
              },
              stats: [
                {
                  l: `partitions for seller 77`,
                  v: `16 (illustrative)`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `Each bucket hashes to its own token, so the buckets land on different tablets and shards.`,
              code: 2,
              hl: {
                nodes: {
                  bk: `ok`
                },
                edges: {
                  e4: `ok`,
                  e2: `dim`
                }
              }
            },
            {
              log: `The balancer spreads the buckets, and each shard now carries about a quarter of the load (illustrative).`,
              code: 3,
              hl: {
                nodes: {
                  a: `ok`,
                  d: `ok`,
                  b: `ok`,
                  bk: `ok`
                },
                edges: {
                  e3: `ok`
                }
              },
              stats: [
                {
                  l: `each shard share`,
                  v: `about 25% (illustrative)`,
                  cls: `ok`
                }
              ]
            }
          ]
        }
      ]
    },
    {
      title: `Raft Metadata Consensus`,
      problem: `During a network incident a 3-node cluster splits: node 1 on one side, nodes 2 and 3 on the other. An engineer on node 1’s side runs <code>ALTER TABLE</code> to add a column. The statement hangs and then times out, while ordinary reads and writes on node 1 at a suitable consistency level still work. The engineer asks why one works and the other does not.`,
      predict: {
        q: `3 voters, and 2 are unreachable. Can the remaining node commit a schema change?`,
        opts: [
          `Yes, it is the only node that has the data`,
          `No, a commit needs a majority, which is 2 of 3`,
          `Yes, but only after a manual force flag`
        ],
        ans: 1,
        why: `A majority of 3 is 2. One node alone cannot commit, and that is what prevents a second, conflicting history on the other side. Row writes do not go through this metadata group, so they depend only on their own consistency level.`
      },
      explain: `
<h3>The idea</h3>
<p>Schema and topology changes must have exactly one agreed order. Raft lets a majority of voters agree on that order. A minority side of a split cannot commit anything, so two conflicting histories cannot both be committed.</p>
<h3>How it works, step by step</h3>
<p>1. <b>Group 0</b> is one Raft group. It holds the metadata for schema and topology, including the tablet map.</p>
<p>2. <b>Terms and leader.</b> An election creates a leader for a new term. Only the leader appends new entries.</p>
<p>3. <b>Commit rule.</b> An entry is committed once a majority of voters stores it. The commit index only moves forward.</p>
<p>4. With 3 voters a majority is 2. A single node, or 1 of 3 voters, cannot commit.</p>
<p>5. <b>Scope.</b> Row writes do not go through group 0. They use the coordinator and consistency-level path from chapter 2, so they can still succeed on a minority side if their own CL can be met.</p>
<h3>The trade-off</h3>
<p>Blocking metadata changes on the minority side prevents two authoritative histories, but schema and topology work stops until the majority is back. When an operation times out, check whether it already committed before you repeat it. Blind retries can hide the first result.</p>
`,
      diagnose: [
        {
          t: `Raft majority lost`,
          sym: `<b>DDL or topology changes cannot commit on that side; row traffic may still run if its own CL can be met.</b>`,
          ctx: `A five-node cluster splits 2 | 3; a schema change is sent to the two-node side.`,
          why: `The metadata log needs a majority of voters to commit one order of changes.`,
          log: `-- representative output, values illustrative
Schema/topology operation times out; scylla_raft_group0_status unhealthy`,
          note: `Representative error and metric pattern. Source: <a href="https://docs.scylladb.com/manual/stable/architecture/raft.html" target="_blank" rel="noopener">Raft consensus</a>`,
          fix: [
            `Verify which group 0 voters are reachable and whether a leader exists.`,
            `Restore the majority or use the documented recovery procedure for permanently lost voters.`,
            `Retry the metadata operation only after checking its final state.`,
            `Trade-off: Blocking minority-side metadata writes prevents two authoritative histories.`,
            `Verify: Group 0 has a stable leader and the intended schema/topology entry is committed once.`
          ]
        },
        {
          t: `Schema versions disagree`,
          sym: `<b>DDL reports a mismatch and applications may see schema-related errors.</b>`,
          ctx: `After a node outage or rolling change, a client times out waiting for schema agreement.`,
          why: `One node has not caught up to the committed schema version.`,
          log: `-- representative output, values illustrative
schema version mismatch detected
Request timed out while waiting for schema agreement`,
          note: `Documented client warning and timeout wording. Source: <a href="https://docs.scylladb.com/manual/stable/troubleshooting/error-messages/schema-mismatch.html" target="_blank" rel="noopener">Schema mismatch</a>`,
          fix: [
            `Run nodetool describecluster and compare schema versions.`,
            `Allow transient agreement to finish; inspect node health if it persists.`,
            `Follow the documented rolling recovery path and verify agreement again.`,
            `Trade-off: Blindly repeating DDL can obscure whether the first operation already committed.`,
            `Verify: All live nodes report one schema version.`
          ]
        },
        {
          t: `An aggressive rolling restart takes 2 of 3 voters down`,
          sym: `<b>During a rolling upgrade, DDL and topology changes hang until the restart finishes.</b>`,
          ctx: `An automation script restarts nodes in parallel batches. Two of three nodes are down at the same moment, even though row traffic at <code>LOCAL_ONE</code> still partly works.`,
          why: `With 3 voters a majority is 2. When 2 are down, group 0 has no quorum, so no schema or topology change can commit until enough nodes are back. Waiting for each node to be fully up before the next restart keeps a majority alive.`,
          log: `-- representative output, values illustrative
$ nodetool status
UN  10.0.1.11
DN  10.0.1.12
DN  10.0.1.13
cqlsh> ALTER TABLE ks_orders.orders ADD coupon text;
OperationTimedOut: errors={}, last_host=10.0.1.11`,
          note: `Two nodes down out of three means no quorum for metadata changes. The error wording varies by driver. Source: <a href="https://docs.scylladb.com/manual/stable/architecture/raft.html" target="_blank" rel="noopener">Raft consensus in ScyllaDB</a>`,
          fix: [
            `Measure first: run <code>nodetool status</code> and count the nodes in <code>UN</code> state against the majority.`,
            `Fix: restart one node at a time and wait until it is <code>UN</code> and caught up before touching the next.`,
            `Fix: do not run schema or topology changes during the restart window.`,
            `Verify: <code>nodetool describecluster</code> shows a single schema version and the DDL commits.`
          ]
        }
      ],
      scenarios: [
        {
          id: `majority`,
          label: `Minority cannot commit`,
          desc: `With 3 voters, the one-node side cannot reach a majority, so ALTER TABLE times out. Row writes at a suitable CL can still succeed (counts illustrative).`,
          codeLabel: `CQL`,
          code: {
            bug: [
              `# split: node 1 alone | nodes 2 and 3`,
              `$ nodetool status          # from node 1: two nodes are DN`,
              `ALTER TABLE ks_orders.orders ADD coupon text;`,
              `-- group 0 needs 2 of 3 voters, only 1 is reachable`,
              `OperationTimedOut: errors={}, last_host=10.0.1.11`,
              `-- row writes at a suitable CL still work here`
            ],
            fix: [
              `# the split heals: nodes 2 and 3 rejoin the majority`,
              `$ nodetool describecluster   # one schema version on every live node`,
              `ALTER TABLE ks_orders.orders ADD coupon text;`,
              `-- group 0 has a leader and 2 of 3 voters`,
              `-- the change is committed once, on every node`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `n1`,
                x: 10,
                y: 120,
                w: 170,
                h: 60,
                t: `Node 1`,
                s: `minority side, 1 of 3`
              },
              {
                id: `g0`,
                x: 235,
                y: 120,
                w: 170,
                h: 60,
                t: `Group 0 (Raft)`,
                s: `needs 2 of 3 to commit`
              },
              {
                id: `n2`,
                x: 460,
                y: 20,
                w: 170,
                h: 60,
                t: `Node 2`,
                s: `voter, unreachable`
              },
              {
                id: `n3`,
                x: 460,
                y: 220,
                w: 170,
                h: 60,
                t: `Node 3`,
                s: `voter, unreachable`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `n1`,
                b: `g0`,
                label: `ALTER TABLE`
              },
              {
                id: `e2`,
                a: `g0`,
                b: `n2`,
                label: `vote`
              },
              {
                id: `e3`,
                a: `g0`,
                b: `n3`,
                label: `vote`
              }
            ]
          },
          bug: [
            {
              log: `The engineer on node 1 sends ALTER TABLE. Node 1 asks group 0 to commit the change.`,
              code: 2,
              hl: {
                nodes: {
                  n1: `on`,
                  g0: `on`
                },
                edges: {
                  e1: `on`
                }
              }
            },
            {
              log: `Group 0 needs 2 of 3 voters. Only node 1 is reachable, so it cannot form a majority.`,
              code: 3,
              hl: {
                nodes: {
                  g0: `bad`,
                  n2: `dim`,
                  n3: `dim`
                },
                edges: {
                  e2: `dim`,
                  e3: `dim`
                }
              },
              stats: [
                {
                  l: `voters reachable`,
                  v: `1 of 3`,
                  cls: `bad`
                },
                {
                  l: `majority needed`,
                  v: `2`,
                  cls: `warn`
                }
              ]
            },
            {
              log: `The statement waits and then times out. Nothing is committed, so no conflicting schema history forms.`,
              code: 4,
              hl: {
                nodes: {
                  g0: `bad`,
                  n1: `warn`
                },
                edges: {
                  e1: `bad`
                }
              },
              stats: [
                {
                  l: `DDL result`,
                  v: `OperationTimedOut`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Ordinary row reads and writes on node 1 still run, if their own consistency level can be met.`,
              code: 5,
              hl: {
                nodes: {
                  n1: `ok`
                }
              },
              stats: [
                {
                  l: `row writes`,
                  v: `still work at a suitable CL`,
                  cls: `ok`
                }
              ]
            }
          ],
          fix: [
            {
              log: `The split heals. Nodes 2 and 3 are reachable again, so group 0 has 3 of 3 voters.`,
              code: 0,
              hl: {
                nodes: {
                  n2: `ok`,
                  n3: `ok`,
                  g0: `ok`
                },
                edges: {
                  e2: `ok`,
                  e3: `ok`
                }
              },
              stats: [
                {
                  l: `voters reachable`,
                  v: `3 of 3`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `A leader is elected for the term. The ALTER TABLE entry reaches a majority and is committed once.`,
              code: 3,
              hl: {
                nodes: {
                  g0: `ok`,
                  n1: `ok`
                },
                edges: {
                  e1: `ok`,
                  e2: `ok`
                }
              },
              stats: [
                {
                  l: `entry committed`,
                  v: `once`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `Run nodetool describecluster to confirm one schema version on every live node.`,
              code: 1,
              hl: {
                nodes: {
                  n1: `ok`,
                  n2: `ok`,
                  n3: `ok`
                }
              },
              stats: [
                {
                  l: `schema versions`,
                  v: `1`,
                  cls: `ok`
                }
              ]
            }
          ]
        },
        {
          id: `rolling-restart`,
          label: `Restart drops quorum`,
          desc: `Parallel restarts remove the voter majority, so DDL hangs. Restarting one node at a time keeps a majority up (counts illustrative).`,
          codeLabel: `Command`,
          code: {
            bug: [
              `$ nodetool status`,
              `UN  10.0.1.11`,
              `DN  10.0.1.12`,
              `DN  10.0.1.13`,
              `cqlsh> ALTER TABLE ks_orders.orders ADD coupon text;`,
              `OperationTimedOut: errors={}, last_host=10.0.1.11`
            ],
            fix: [
              `# restart one node at a time`,
              `$ nodetool status        # wait until the node shows UN`,
              `# the next node restarts only after the first is UN and caught up`,
              `# no schema or topology change during the restart window`,
              `$ nodetool describecluster   # one schema version`
            ]
          },
          diagram: {
            w: 640,
            h: 300,
            nodes: [
              {
                id: `r1`,
                x: 10,
                y: 20,
                w: 170,
                h: 60,
                t: `Node 1`,
                s: `voter`
              },
              {
                id: `r2`,
                x: 235,
                y: 20,
                w: 170,
                h: 60,
                t: `Node 2`,
                s: `voter`
              },
              {
                id: `r3`,
                x: 460,
                y: 20,
                w: 170,
                h: 60,
                t: `Node 3`,
                s: `voter`
              },
              {
                id: `g0`,
                x: 235,
                y: 190,
                w: 170,
                h: 60,
                t: `Group 0 voters`,
                s: `needs 2 of 3`
              }
            ],
            edges: [
              {
                id: `e1`,
                a: `r1`,
                b: `g0`,
                label: `vote`
              },
              {
                id: `e2`,
                a: `r2`,
                b: `g0`,
                label: `down`
              },
              {
                id: `e3`,
                a: `r3`,
                b: `g0`,
                label: `down`
              }
            ]
          },
          bug: [
            {
              log: `Automation restarts nodes 2 and 3 at once. nodetool status shows UN on node 1 only (illustrative).`,
              code: 2,
              hl: {
                nodes: {
                  r1: `ok`,
                  r2: `bad`,
                  r3: `bad`
                }
              },
              stats: [
                {
                  l: `nodes up`,
                  v: `1 of 3`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `Group 0 has 1 of 3 voters reachable. That is not a majority, so no metadata entry can commit.`,
              code: 4,
              hl: {
                nodes: {
                  g0: `bad`
                },
                edges: {
                  e2: `bad`,
                  e3: `bad`
                }
              },
              stats: [
                {
                  l: `voters reachable`,
                  v: `1 of 3`,
                  cls: `bad`
                }
              ]
            },
            {
              log: `The ALTER TABLE times out, even though row traffic at LOCAL_ONE still partly works (illustrative).`,
              code: 5,
              hl: {
                nodes: {
                  g0: `bad`
                },
                edges: {
                  e1: `warn`
                }
              },
              stats: [
                {
                  l: `DDL`,
                  v: `OperationTimedOut`,
                  cls: `bad`
                }
              ]
            }
          ],
          fix: [
            {
              log: `Restart one node. Wait until it shows UN and has caught up before touching the next one.`,
              code: 1,
              hl: {
                nodes: {
                  r2: `warn`
                }
              },
              stats: [
                {
                  l: `nodes restarting at once`,
                  v: `1`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `With two voters up, group 0 has a majority again, so metadata entries can commit.`,
              code: 2,
              hl: {
                nodes: {
                  r1: `ok`,
                  r2: `ok`,
                  g0: `ok`
                },
                edges: {
                  e1: `ok`,
                  e2: `ok`,
                  e3: `dim`
                }
              },
              stats: [
                {
                  l: `voters reachable`,
                  v: `2 of 3`,
                  cls: `ok`
                }
              ]
            },
            {
              log: `Keep DDL out of the restart window, then confirm that all live nodes report one schema version.`,
              code: 4,
              hl: {
                nodes: {
                  r3: `ok`
                }
              },
              stats: [
                {
                  l: `schema versions`,
                  v: `1`,
                  cls: `ok`
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};
