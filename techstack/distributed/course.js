/* Problem-based course data for Distributed Systems. Written from the original CHAPTERS in techstack/distributed/01-distributed-systems-end-to-end.html. Numbers are illustrative unless the source names them. */
window.COURSE = {
  name: 'Distributed Systems',
  kick: '13 chapters · problem-based · distributed systems concepts (no pinned version)',
  lead: `A checkout service stops scaling at one machine. Once there is a network between the parts, messages are lost, copies disagree, clocks lie and a paused leader keeps acting as if it still leads. Each chapter starts from one of these incidents, asks you to predict what happens, then animates the mechanism that copes with it: replication, quorums, consensus, atomic commit and the logs behind batch and stream processing.`,
  chapters: [
{
  title: 'When concurrency and async stop helping',
  problem: `Black Friday traffic is five times last year's peak (illustrative). The checkout service already uses a thread pool, async I/O and 64 cores, and still runs at 100% CPU. The team buys a bigger machine, which costs about 8 times more for 4 times the power. The next spike queues again, and when that one machine fails, every checkout stops.`,
  predict: {
    q: `You double the app servers behind the load balancer from 4 to 8, and all of them still write to one PostgreSQL primary. What happens to checkout throughput?`,
    opts: [
      `It doubles, because each new server adds its own capacity`,
      `It barely moves, because the single primary is the shared bottleneck`,
      `It halves, because each server needs its own copy of the database`
    ],
    ans: 1,
    why: `The app servers scale the easy part. Every server still sends its writes into one place, so extra servers only add more callers waiting for the same resource.`
  },
  explain: `
<h3>The idea</h3>
<p>Threads, cores and async I/O all work inside one machine. They make one box do more work at once. They cannot add a second box, remove a shared lock, survive the box dying, or make light travel faster. When one machine is not enough, the work and the data must be split across several machines.</p>
<h3>How it works, step by step</h3>
<p>1. Requests reach a <code>load balancer</code>, which spreads them over several app servers. Each app server is fast, so the CPU work is parallel.</p>
<p>2. Every app server writes to the same database. That database is the serial part: one writer, one lock, one set of connections. PostgreSQL only accepts a fixed number of connections (<code>max_connections</code>), so when the pools fill up, requests wait.</p>
<p>3. Amdahl's law says the serial part caps the total speedup. The Universal Scalability Law goes further: contention can make more workers <i>slower</i>.</p>
<p>4. Three more limits appear once you spread out. One machine at 99.9% availability is down about 9 hours a year. A request that fans out to many backends is as slow as its slowest part. And a round trip across an ocean takes about 70 ms each way, however async the client is.</p>
<h3>The trade-off</h3>
<p>Scaling out gets past the ceiling, but it creates new problems: network calls, partial failure and coordination. The fix is to find the serial resource, split it (caching, read replicas, sharding by key), and distribute only what you must. Measure before you split, because a 40-service system can be slower than the monolith it replaced.</p>
`,
  diagnose: [
    {
      t: 'The bottleneck just moves',
      sym: 'Doubling web servers makes the site slower; pools are exhausted',
      ctx: `A team doubles web servers and the site gets slower: PostgreSQL hit max_connections, connection pools were exhausted, and lock contention rose. Shopify, GitHub and others sharded or added read replicas for exactly this reason.`,
      why: `The parallel part scaled; the serial part (single writer, shared lock, one queue) did not, and contention grows with the number of clients.`,
      fix: [
        `Find the serial resource: check connection counts against max_connections and lock waits on the primary.`,
        `Split it: caching, read replicas, sharding by key, and queues to smooth bursts.`
      ]
    },
    {
      t: 'Scaling out multiplies the ways to fail',
      sym: 'A fan-out request is slow whenever one backend is slow',
      ctx: `With 1,000 machines each 99.9% available, on average one is down at any time. A request that fans out to 100 backends is slow whenever any one is slow (tail latency, "The Tail at Scale").`,
      why: `The chance that something fails grows with the number of parts; a fan-out takes the worst of N.`,
      fix: [
        `Measure the tail: look at p99 of each backend call, not only the average.`,
        `Replicate, use hedged requests and timeouts, and design so that losing a node is a normal event.`
      ]
    },
    {
      t: 'Async cannot shorten a round trip',
      sym: 'Each write waits about 250 ms from Singapore',
      ctx: `A multi-region app writes to a primary in us-east-1 from Singapore: each write waits about 250 ms however non-blocking the client is. Adding a read replica in Singapore fixes reads and creates stale reads.`,
      why: `The answer is on the other side of the planet; the speed of light and the routing are fixed.`,
      fix: [
        `Measure the round trip per write and count how many sequential writes one request makes.`,
        `Move data and compute nearer (CDN, regional replicas, regional shards) and decide which operations may be stale.`
      ]
    }
  ],
  source: { label: 'Original: When concurrency and async stop helping', href: '01-distributed-systems-end-to-end.html#ch0' },
  scenarios: [
    {
      id: 'bottleneck',
      label: 'Many servers, one DB',
      desc: 'Four app servers share one primary. The parallel part scales, the write path does not (illustrative numbers).',
      codeLabel: 'Config',
      code: {
        bug: [
          '# checkout tier at peak (illustrative)',
          'app servers: 4    threads per server: 64',
          'connections per server to primary: 50',
          'postgres: max_connections = 200',
          'open connections: 4 x 50 = 200 (pools full)',
          'new checkout: waits for a free connection'
        ],
        fix: [
          '# add servers: no help, the primary is still the limit',
          'reads: send to a read replica (caching, read replicas)',
          'writes: shard by key, orders 0-7 to shard A',
          'primary connections: 200 -> 60'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'cl', x: 10, y: 115, w: 100, h: 60, t: 'clients', s: 'Black Friday' },
          { id: 'lb', x: 135, y: 115, w: 130, h: 60, t: 'load balancer', s: 'round robin' },
          { id: 'a1', x: 290, y: 15, w: 130, h: 50, t: 'app server 1', s: 'thread pool 64' },
          { id: 'a2', x: 290, y: 115, w: 130, h: 50, t: 'app server 2', s: 'thread pool 64' },
          { id: 'a3', x: 290, y: 215, w: 130, h: 50, t: 'app server 3', s: 'thread pool 64' },
          { id: 'db', x: 470, y: 20, w: 160, h: 70, t: 'primary', s: 'writes only' },
          { id: 'rep', x: 470, y: 205, w: 160, h: 70, t: 'read replica', s: 'reads only' }
        ],
        edges: [
          { id: 'e1', a: 'cl', b: 'lb', label: 'requests' },
          { id: 'e2', a: 'lb', b: 'a1' },
          { id: 'e3', a: 'lb', b: 'a2' },
          { id: 'e4', a: 'lb', b: 'a3' },
          { id: 'e5', a: 'a1', b: 'db' },
          { id: 'e6', a: 'a2', b: 'db' },
          { id: 'e7', a: 'a3', b: 'db' },
          { id: 'e8', a: 'a1', b: 'rep' }
        ]
      },
      bug: [
        { log: 'Peak traffic is five times last year (illustrative). Every checkout request enters through the load balancer.', code: 0, hl: { nodes: { cl: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'peak load', v: '5x (illustrative)', cls: 'warn' }] },
        { log: 'Requests spread over the app servers. Their CPU work runs in parallel, but all three are near 100% CPU.', code: 1, hl: { nodes: { lb: 'on', a1: 'on', a2: 'on', a3: 'on' }, edges: { e2: 'on', e3: 'on', e4: 'on' } }, stats: [{ l: 'app CPU', v: '100%', cls: 'bad' }] },
        { log: 'Every server writes to the same primary. Each write needs a connection, and the primary allows max_connections = 200.', code: 2, hl: { nodes: { db: 'warn' }, edges: { e5: 'on', e6: 'on', e7: 'on' } }, stats: [{ l: 'open connections', v: '200 of 200', cls: 'warn' }] },
        { log: 'Adding servers adds callers waiting for the same primary. Checkout latency climbs (illustrative).', code: 4, hl: { nodes: { db: 'bad' }, edges: { e5: 'bad', e6: 'bad', e7: 'bad' } }, stats: [{ l: 'checkout p99', v: '2.4 s (illustrative)', cls: 'bad' }] },
        { log: 'Pools are exhausted. New checkouts fail even though the app servers still have spare threads.', code: 5, hl: { nodes: { a3: 'bad' } }, stats: [{ l: 'failed checkouts', v: '12% (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Adding servers is not the fix. The serial resource is the primary, so the team measures its connection count first.', code: 0, hl: { nodes: { db: 'warn' } }, stats: [{ l: 'primary connections', v: '200', cls: 'warn' }] },
        { log: 'Reads move to a read replica, which takes the read load off the primary.', code: 1, hl: { nodes: { rep: 'ok' }, edges: { e8: 'ok' } }, stats: [{ l: 'primary load', v: 'down', cls: 'ok' }] },
        { log: 'Writes are sharded by key, so each primary takes a share of the writes instead of all of them.', code: 2, hl: { nodes: { db: 'ok' }, edges: { e5: 'ok', e6: 'ok', e7: 'ok' } }, stats: [{ l: 'primary connections', v: '60', cls: 'ok' }] },
        { log: 'Checkout p99 drops and the pools stop filling. The serial part now has room.', code: 3, hl: { nodes: { a1: 'ok', a2: 'ok', a3: 'ok' } }, stats: [{ l: 'checkout p99', v: '0.4 s (illustrative)', cls: 'ok' }] }
      ]
    },
    {
      id: 'latency',
      label: 'Singapore to Virginia',
      desc: 'A write from Singapore must reach the primary in us-east-1. Light sets the floor, not the code (illustrative numbers).',
      codeLabel: 'Checkout',
      code: {
        bug: [
          '# checkout from Singapore (illustrative)',
          'await db.write(order)     # to us-east-1, ~250 ms',
          'await db.write(payment)   # second write, ~250 ms',
          '# async client: the thread is free, the travel time is not',
          'elapsed: about 500 ms of travel per checkout'
        ],
        fix: [
          '# product page: read from the Singapore replica',
          '# checkout write: still goes to us-east-1',
          '# decide per operation: which reads may be stale'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'sg', x: 10, y: 110, w: 140, h: 70, t: 'Singapore user', s: 'client, 250 ms' },
          { id: 'va', x: 470, y: 110, w: 160, h: 70, t: 'primary, us-east', s: 'writes wait here' },
          { id: 'rp', x: 240, y: 215, w: 170, h: 60, t: 'SG read replica', s: 'stale reads possible' }
        ],
        edges: [
          { id: 'e1', a: 'sg', b: 'va', label: 'write, ~250 ms' },
          { id: 'e2', a: 'va', b: 'rp', label: 'replicate' },
          { id: 'e3', a: 'sg', b: 'rp', label: 'read, ~15 ms' }
        ]
      },
      bug: [
        { log: 'The user in Singapore clicks Pay. The write has to reach the primary in us-east-1, about 250 ms away (illustrative).', code: 0, hl: { nodes: { sg: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'write latency', v: '~250 ms', cls: 'bad' }] },
        { log: 'The client is async, so its thread is free while it waits. The packets still cross the ocean and come back.', code: 2, hl: { edges: { e1: 'on' } }, stats: [{ l: 'thread busy', v: 'no', cls: 'warn' }] },
        { log: 'Two sequential writes per checkout add about 500 ms of pure travel time (illustrative).', code: 4, hl: { nodes: { va: 'warn' }, edges: { e1: 'bad' } }, stats: [{ l: 'checkout travel', v: '~500 ms', cls: 'bad' }] },
        { log: 'No code change makes light faster. The only levers are moving data and compute closer, or accepting stale reads.', code: 3, hl: { nodes: { va: 'bad' } }, stats: [{ l: 'speed of light floor', v: 'fixed', cls: 'bad' }] }
      ],
      fix: [
        { log: 'A read replica in Singapore serves the product pages, which are read-heavy.', code: 0, hl: { nodes: { rp: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'read latency', v: '~15 ms (illustrative)', cls: 'ok' }] },
        { log: 'Reads now take a few milliseconds, but a read can miss the latest write, so it may be stale.', code: 1, hl: { nodes: { rp: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'stale reads', v: 'possible', cls: 'warn' }] },
        { log: 'Writes still cross the ocean. Each operation is labelled: which reads may be stale, and which must be fresh.', code: 2, hl: { nodes: { va: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'payment writes', v: 'still ~250 ms', cls: 'warn' }] }
      ]
    }
  ],
},
{
  title: 'Remote calls & RPC',
  problem: `The payment service calls the bank with <code>charge(user, 10)</code> and a 3 second timeout (illustrative). The bank charges the card, but its reply is lost on the way back. The payment service retries, and the customer is charged twice. Nobody can tell from the logs whether the first call ever ran.`,
  predict: {
    q: `The first POST /charge timed out, but the bank had already charged the card. The payment service retries with a new request and no key. What does the customer see?`,
    opts: [
      `Charged once, because the retry is detected automatically`,
      `Charged twice, because the bank cannot tell the two requests apart`,
      `Charged zero times, because a timeout cancels the charge`
    ],
    ans: 1,
    why: `A timeout is only a guess. Without an identifier that says "this is the same payment", the bank must treat the retry as a new charge.`
  },
  explain: `
<h3>The idea</h3>
<p>A remote call looks like a local function call, but the network can lose the request, delay it, or lose the reply. A distributed system has no shared memory and no shared clock, and parts fail on their own. So when a call times out, the caller does not know whether the work happened.</p>
<h3>How it works, step by step</h3>
<p>1. An RPC stub <i>marshals</i> the arguments into bytes and sends them over the network. A server stub <i>unmarshals</i> them and calls the real code. An IDL such as protobuf or Thrift describes the interface.</p>
<p>2. The client waits for a reply until its timeout. A timeout is a guess, not a fact: the request may be lost, the server may have crashed, or only the reply may be lost.</p>
<p>3. Delivery has two simple modes. <b>At-most-once</b> never retries, so the work may be lost. <b>At-least-once</b> retries until a reply arrives, so the work may run twice.</p>
<p>4. Exactly-once effects come from making the operation <b>idempotent</b>. A client sends an <code>Idempotency-Key</code> header, the server stores the result under that key, and a retry with the same key returns the stored result instead of charging again.</p>
<h3>The trade-off</h3>
<p>Retries help with lost messages, but they add load exactly when the dependency is already struggling. Every layer needs a timeout shorter than the layer above it, retries limited by a budget, and backoff with jitter. Transparency is a trap: a remote call fails in ways a local call never does, so the caller must handle the timeout.</p>
`,
  diagnose: [
    {
      t: 'No timeout, or timeouts that do not add up',
      sym: 'A call hangs with no error; threads stay busy',
      ctx: `Go http.Client{} has no timeout by default; Python requests.get(url) without timeout= can hang forever; Java HttpURLConnection defaults to infinite. A 3-second timeout at each of 5 layers is a 15-second user wait.`,
      why: `Without a deadline one stuck dependency ties up threads or goroutines until the caller dies too.`,
      fix: [
        `Measure: list every outbound call and check whether it sets a connect and a read timeout.`,
        `Set connect and read timeouts everywhere, and propagate a deadline (context.WithTimeout, gRPC deadlines) so inner timeouts are shorter than outer ones.`,
        `Verify: make the dependency slow in a test and check that the caller returns within its deadline.`
      ]
    },
    {
      t: 'Retry storms and amplification',
      sym: 'One user request becomes 27 calls to a failing database',
      ctx: `Each of 3 layers retries 3 times on failure: one user request becomes 27 calls to the failing database, which keeps it down (a metastable failure; Amazon and Google SRE describe retry budgets for this).`,
      why: `Retries add load exactly when the dependency is already overloaded.`,
      fix: [
        `Measure: count calls per user request at each layer, not only the error rate.`,
        `Retry at one layer only, add a retry budget (for example at most 10% extra), exponential backoff with jitter, and circuit breakers.`,
        `Verify: the database call rate stays near normal traffic during a partial outage.`
      ]
    },
    {
      t: 'Non-idempotent retries: double charge',
      sym: 'A retried POST /charge bills the customer twice',
      ctx: `Retried POST /charge double-bills a customer; Stripe's API takes an Idempotency-Key header for exactly this. Message queues with at-least-once delivery (SQS, Kafka) redeliver after a consumer crash.`,
      why: `The client cannot tell "request lost" from "reply lost".`,
      fix: [
        `Measure: find every write endpoint that a client may retry, and check whether it has a key or a natural idempotent form.`,
        `Store an idempotency key with the result, or use naturally idempotent operations (set to a value, not add 10).`,
        `Verify: send the same request twice with the same key and check that the balance changed once.`
      ]
    },
    {
      t: 'Chatty calls and schema skew',
      sym: 'A loop makes one remote call per item; old and new nodes disagree',
      ctx: `The N+1 problem across services: a loop making one remote call per item. Rolling upgrades with a changed protobuf or Java-serialised class break old and new nodes talking to each other.`,
      why: `A remote call looks like a local one but costs about a million times more, and two versions run side by side during deploys.`,
      fix: [
        `Measure: count remote calls per request and compare the old and new schema versions during a rolling deploy.`,
        `Use batch APIs and coarse-grained calls, and keep schemas compatible: add optional fields, never reuse tags.`
      ]
    }
  ],
  source: { label: 'Original: Remote calls & RPC', href: '01-distributed-systems-end-to-end.html#ch1' },
  scenarios: [
    {
      id: 'timeout',
      label: 'Timeout, then retry',
      desc: 'A charge runs at the bank, but the reply is lost. The retry is a second charge because nothing says it is the same one.',
      codeLabel: 'Call',
      code: {
        bug: [
          'payment: charge(user, 10)    # timeout = 3 s',
          'bank: charge applied, reply lost',
          'payment: no reply after 3 s, treat as failed',
          'payment: retry POST /charge',
          'customer balance: charged twice'
        ],
        fix: [
          'POST /charge',
          'Idempotency-Key: 8f2c-pay-8812',
          'bank: store result under the key, then reply',
          'retry with same key -> bank returns stored result'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'client', x: 10, y: 60, w: 150, h: 70, t: 'payment service', s: 'charge(user, 10)' },
          { id: 'net', x: 250, y: 60, w: 130, h: 70, t: 'network', s: 'loss, delay' },
          { id: 'bank', x: 470, y: 180, w: 160, h: 80, t: 'bank', s: 'charges the card' }
        ],
        edges: [
          { id: 'e1', a: 'client', b: 'net', label: 'POST /charge' },
          { id: 'e2', a: 'net', b: 'bank', label: 'charge' },
          { id: 'e3', a: 'bank', b: 'client', label: 'reply (may be lost)' }
        ]
      },
      bug: [
        { log: 'The payment service sends charge(user, 10) to the bank and waits up to 3 seconds (illustrative).', code: 0, hl: { nodes: { client: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'timeout', v: '3 s', cls: 'warn' }] },
        { log: 'The request crosses the network. It can be lost or delayed, and the bank can crash halfway through.', code: 1, hl: { nodes: { net: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'bank state', v: 'unknown', cls: 'warn' }] },
        { log: 'The bank charges the card and sends the reply. The reply is lost on the way back.', code: 1, hl: { nodes: { bank: 'ok' }, edges: { e3: 'bad' } }, stats: [{ l: 'customer charged', v: 'yes', cls: 'bad' }] },
        { log: 'After 3 seconds the payment service gives up. It cannot tell "never ran" from "ran, reply lost".', code: 2, hl: { nodes: { client: 'warn' } }, stats: [{ l: 'payment service knows', v: 'nothing', cls: 'warn' }] },
        { log: 'The retry sends POST /charge again. The bank has no key, so it charges a second time.', code: 3, hl: { nodes: { client: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'customer charged', v: 'twice', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The client creates one Idempotency-Key per payment and sends it with every attempt.', code: 0, hl: { nodes: { client: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'key', v: 'one per payment', cls: 'ok' }] },
        { log: 'The bank stores the result under that key before it sends the reply.', code: 2, hl: { nodes: { bank: 'ok' } }, stats: [{ l: 'key result', v: 'stored', cls: 'ok' }] },
        { log: 'The reply is lost, the client times out, and it retries with the same key.', code: 1, hl: { edges: { e3: 'bad', e1: 'ok' } }, stats: [{ l: 'retry key', v: 'same', cls: 'ok' }] },
        { log: 'The bank sees the key already has a result and returns it. The customer is charged once.', code: 3, hl: { nodes: { bank: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'charges applied', v: '1', cls: 'ok' }] }
      ]
    },
    {
      id: 'storm',
      label: 'Retries multiply load',
      desc: 'Three layers each retry three times. One user request becomes 27 calls to a database that is already slow (illustrative).',
      codeLabel: 'Retries',
      code: {
        bug: [
          'web: retry 3 times on failure',
          'api: retry 3 times on failure',
          'database: slow, overloaded',
          'calls per user request: 1 x 3 x 3 x 3 = 27',
          'recovery: never, the retries keep it down'
        ],
        fix: [
          'web: retry at one layer only',
          'budget: at most 10% extra calls',
          'backoff: exponential, with jitter',
          'circuit breaker: stop calls while the db is down'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'u', x: 10, y: 120, w: 120, h: 60, t: 'user request', s: '1 call' },
          { id: 'w1', x: 170, y: 120, w: 120, h: 60, t: 'web', s: '3 calls' },
          { id: 'a1', x: 330, y: 120, w: 120, h: 60, t: 'api', s: '9 calls' },
          { id: 'db', x: 490, y: 120, w: 130, h: 60, t: 'database', s: '27 calls' },
          { id: 'bud', x: 170, y: 230, w: 150, h: 50, t: 'retry budget', s: 'at most 10% extra' }
        ],
        edges: [
          { id: 'e1', a: 'u', b: 'w1', label: 'x3 retries' },
          { id: 'e2', a: 'w1', b: 'a1', label: 'x3 retries' },
          { id: 'e3', a: 'a1', b: 'db', label: 'x3 retries' },
          { id: 'e4', a: 'bud', b: 'w1', label: 'caps retries' }
        ]
      },
      bug: [
        { log: 'One user request reaches the web tier once. The database is slow, but the first call is normal.', code: 0, hl: { nodes: { u: 'on' } }, stats: [{ l: 'calls at database', v: '1', cls: 'ok' }] },
        { log: 'The web tier retries three times on failure, so the api tier now sees 3 calls.', code: 0, hl: { nodes: { w1: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'calls at api', v: '3', cls: 'warn' }] },
        { log: 'The api tier retries too. The database now gets 9 calls for one user request.', code: 1, hl: { nodes: { a1: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'calls at database', v: '9', cls: 'warn' }] },
        { log: 'Every layer retries, so the database receives 27 calls for each user request (illustrative count).', code: 3, hl: { nodes: { db: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'calls at database', v: '27', cls: 'bad' }] },
        { log: 'The database is already overloaded. The extra calls keep it down, which is a metastable failure.', code: 4, hl: { nodes: { db: 'bad' } }, stats: [{ l: 'database recovers', v: 'no', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Retries happen at one layer only. The other layers pass the error up instead of retrying.', code: 0, hl: { nodes: { w1: 'ok' } }, stats: [{ l: 'calls at database', v: '3', cls: 'ok' }] },
        { log: 'A retry budget caps extra calls at about 10% of normal traffic. Beyond that, calls fail fast.', code: 1, hl: { nodes: { bud: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'extra calls', v: '≤ 10%', cls: 'ok' }] },
        { log: 'Backoff with jitter spaces the retries out, so the database gets room to recover.', code: 2, hl: { nodes: { db: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'database', v: 'recovers', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Leaders, followers and failover',
  problem: `An online shop keeps orders on one PostgreSQL primary with two read replicas. At 14:00 the primary's disk fails. The on-call promotes the replica that "looks most up to date", and the site is back in a minute. Next morning a customer reports order 8812: the confirmation showed it, and now it does not exist (illustrative).`,
  predict: {
    q: `The primary sends OK 8812 before any replica has the entry, then crashes. The replica with the newest log holds #8811 as its last entry. What does the customer see after failover?`,
    opts: [
      `The order is found, because the replica will eventually receive it`,
      `The order is not found, because the confirmed entry #8812 existed only on the crashed primary`,
      `The cluster refuses to start until the old primary's disk is repaired`
    ],
    ans: 1,
    why: `Asynchronous shipping leaves a tail of acknowledged entries that only the crashed primary holds. Promotion can only keep what some surviving copy has.`
  },
  explain: `
<h3>The idea</h3>
<p>A replicated database keeps copies of its data on several machines. Each change is appended to one ordered <b>replication log</b>, and each entry has a position (a log sequence number, LSN). A replica that has applied entries 1 to N is an exact copy of the primary as it was at position N.</p>
<h3>How it works, step by step</h3>
<p>1. The primary appends the write to its log. Then it either answers the client at once (asynchronous) or waits until one follower has the entry (semi-synchronous).</p>
<p>2. Lag is a position difference: the primary's position minus the replica's position. The entries that no follower holds yet form the unreplicated tail. A crash loses that tail, which is why a confirmed write can disappear.</p>
<p>3. Failover has four steps, and each can go wrong. (1) Detect that the primary is dead; this is only a timeout and may be a false alarm. (2) Choose the replica with the highest log position. (3) Make the others replicate from the new primary, discarding entries beyond its position. (4) Stop the old primary from accepting writes if it comes back.</p>
<p>4. A new replica is built from a consistent snapshot tagged with a log position, then it applies the log from that position. Copying live files gives a mixture of states that never existed together.</p>
<h3>The trade-off</h3>
<p>Synchronous replication removes the tail for the synchronous follower, at the cost of one network round trip per write and a stall if that follower is slow. Asynchronous replication is fast but can lose the last few seconds of confirmed writes. Failover without epochs can also leave two primaries accepting writes, so the storage layer must reject a stale epoch.</p>
`,
  diagnose: [
    {
      t: 'Asynchronous failover loses a confirmed write',
      sym: 'The client holds OK for an order the new primary cannot find',
      ctx: `Jepsen's 2013 analysis of MongoDB showed acknowledged writes rolled back after a failover under the default write concern of w:1. The client was told "saved" for writes that the new primary never had.`,
      note: `Seen in: Jepsen's 2013 analysis of MongoDB`,
      why: `The primary acknowledged after its own write. The entry was still in flight to the replicas when the primary crashed, so the promoted replica never received it. The loss window equals the lag at the moment of the crash.`,
      fix: [
        `Measure: compare the replication lag at the moment of the crash with the time window of acknowledged writes.`,
        `Acknowledge only after a replica has the entry (semi-synchronous). Then the promoted replica must have it, because it was the one that acknowledged it.`,
        `Verify: kill the primary during a write burst and read back every acknowledged order from the new primary.`
      ]
    },
    {
      t: 'The promoted follower is behind the old primary',
      sym: 'Failover promotes the first replica to answer, 40 seconds behind',
      ctx: `A failover script picks "the replica that answers first". Latency measurements show it was 40 seconds behind, and nobody compared log positions before the switch.`,
      why: `Failover chose a candidate without checking how much of the old primary's log it held. Entries between the two positions were acknowledged to clients and then silently dropped.`,
      fix: [
        `Measure: record the last acknowledged log position on the coordinator, and each replica's position before any switch.`,
        `Pick the replica with the highest log position, and refuse to promote anyone older than the newest acknowledged entry.`
      ]
    },
    {
      t: 'Two primaries accept writes after a partition',
      sym: 'Both sides of a partition accept writes for the same rows',
      ctx: `A cross-rack network partition isolates the old primary from the failover controller. The controller promotes a replica, and the old primary keeps serving writes from clients on its side of the partition.`,
      why: `Being primary is a belief held by one machine. The old primary never learned that it was replaced, so both machines accepted writes for the same rows.`,
      fix: [
        `Measure: check which node each client writes to, and the epoch number each primary holds.`,
        `Give each primary an epoch number, have storage reject writes from older epochs, and make the old primary step down when it sees a newer epoch. Use fencing (chapter 7) rather than trusting the old primary to stop itself.`,
        `Verify: cut the old primary off in a test and confirm that its write at the old epoch is rejected.`
      ]
    },
    {
      t: 'A new replica copied from live files',
      sym: 'A balance total is 800 where the real total is 700',
      ctx: `A team adds a replica by copying the data directory of a running primary with rsync. Queries on the new replica return a balance that matches neither the morning nor the evening state.`,
      why: `Files were copied over several minutes while the primary kept writing. Different pages came from different moments, so the copy contains a mixture of states that never coexisted.`,
      fix: [
        `Measure: compare the replica's totals with the primary's at one known log position.`,
        `Take a consistent snapshot at a known log position (most databases do this automatically), restore it on the new replica, then stream the log from that position until it catches up.`
      ]
    }
  ],
  source: { label: 'Original: Leaders, followers and failover', href: '01-distributed-systems-end-to-end.html#ch2' },
  scenarios: [
    {
      id: 'async',
      label: 'Async loses order',
      desc: 'The primary answers OK before the replica has the entry. The primary crashes, and the confirmed order is gone (illustrative).',
      codeLabel: 'Log',
      code: {
        bug: [
          'PUT order 8812',
          'primary: append #8812 (local log only)',
          'OK 8812',
          'ship #8812 to replica (still in flight)',
          'primary: CRASH, disk unreadable',
          'promote replica: log ends at #8811',
          'GET order 8812  ->  not found'
        ],
        fix: [
          'PUT order 8812',
          'primary: append #8812, hold the reply',
          'ship #8812 -> replica: ack',
          'primary: OK 8812 (2 copies)',
          'primary: CRASH',
          'GET order 8812  ->  found'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'C', x: 10, y: 115, w: 130, h: 70, t: 'Client', s: 'holds a receipt' },
          { id: 'P', x: 280, y: 20, w: 140, h: 70, t: 'Primary', s: 'holds #8812' },
          { id: 'R', x: 280, y: 210, w: 140, h: 70, t: 'Replica', s: 'log ends #8811' }
        ],
        edges: [
          { id: 'e1', a: 'C', b: 'P', label: 'PUT, then OK' },
          { id: 'e2', a: 'P', b: 'R', label: 'ship #8812' },
          { id: 'e3', a: 'C', b: 'R', label: 'GET order 8812' }
        ]
      },
      bug: [
        { log: 'The client sends PUT order 8812 to the primary.', code: 0, hl: { nodes: { C: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'copies of #8812', v: '0', cls: 'warn' }] },
        { log: 'The primary appends #8812 to its own log. No replica has it yet.', code: 1, hl: { nodes: { P: 'warn' } }, stats: [{ l: 'copies of #8812', v: '1', cls: 'warn' }] },
        { log: 'The primary answers OK at once, which is the asynchronous choice. The client now holds a receipt.', code: 2, hl: { edges: { e1: 'ok' }, nodes: { C: 'ok' } }, stats: [{ l: 'copies of #8812', v: '1', cls: 'warn' }] },
        { log: 'The shipment is still in flight when the primary crashes. Its disk is unreadable, so #8812 exists nowhere else.', code: 4, hl: { nodes: { P: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'copies of #8812', v: '0', cls: 'bad' }] },
        { log: 'Failover promotes the replica. Its log ends at #8811, the newest entry it has.', code: 5, hl: { nodes: { R: 'bad' } }, stats: [{ l: 'replica log ends', v: '#8811', cls: 'bad' }] },
        { log: 'The client asks for the order it was told about. The new primary returns not found.', code: 6, hl: { edges: { e3: 'bad' } }, stats: [{ l: 'customer sees', v: 'OK, then not found', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Semi-synchronous: the primary appends #8812 and holds the reply until a replica confirms.', code: 1, hl: { nodes: { P: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'copies before OK', v: '1', cls: 'warn' }] },
        { log: 'The entry is shipped to the synchronous replica, which stores it and acknowledges. Two machines now have it.', code: 2, hl: { edges: { e2: 'ok' }, nodes: { R: 'ok' } }, stats: [{ l: 'copies before OK', v: '2', cls: 'ok' }] },
        { log: 'Only now does the primary send OK 8812. The receipt is backed by two machines.', code: 3, hl: { edges: { e1: 'ok' }, nodes: { C: 'ok' } }, stats: [{ l: 'copies before OK', v: '2', cls: 'ok' }] },
        { log: 'The primary crashes. The replica holds #8812 and has the newest log, so it can safely become primary.', code: 4, hl: { nodes: { P: 'bad', R: 'ok' } }, stats: [{ l: 'replica log ends', v: '#8812', cls: 'ok' }] },
        { log: 'GET order 8812 returns found. The receipt and the database agree.', code: 5, hl: { edges: { e3: 'ok' } }, stats: [{ l: 'customer sees', v: 'OK, then found', cls: 'ok' }] }
      ]
    },
    {
      id: 'highest',
      label: 'Pick the newest',
      desc: 'The same crash, but the script compares log positions before it promotes anyone (illustrative positions).',
      codeLabel: 'Script',
      code: {
        bug: [
          'script: first replica to answer wins',
          'A: log 1..97 (answered first)',
          'promote A -> primary',
          'acked 98, 99, 100 are missing on A',
          'B rejoins: old 98..100 rolled back'
        ],
        fix: [
          'script: ask every replica for its position',
          'A: position 97',
          'B: position 100',
          'promote B (highest position)',
          'A replays 98..100 from B'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'P', x: 10, y: 30, w: 130, h: 60, t: 'Primary', s: 'acked up to 100' },
          { id: 'K', x: 250, y: 115, w: 150, h: 60, t: 'failover script', s: 'compares positions' },
          { id: 'A', x: 470, y: 20, w: 150, h: 60, t: 'Replica A', s: 'position 97' },
          { id: 'B', x: 470, y: 200, w: 150, h: 60, t: 'Replica B', s: 'position 100' }
        ],
        edges: [
          { id: 'e1', a: 'K', b: 'A', label: 'ask: position?' },
          { id: 'e2', a: 'K', b: 'B', label: 'ask: position?' },
          { id: 'e3', a: 'B', b: 'A', label: 'catch up 98..100' }
        ]
      },
      bug: [
        { log: 'The primary crashes after acknowledging entries up to 100.', code: 0, hl: { nodes: { P: 'bad' } }, stats: [{ l: 'acked entries', v: '1..100', cls: 'bad' }] },
        { log: 'The script asks the replicas. Replica A answers first.', code: 1, hl: { nodes: { K: 'warn', A: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'answer order', v: 'A first', cls: 'warn' }] },
        { log: 'The script takes the first answer and promotes A, which has entries only up to 97.', code: 2, hl: { nodes: { A: 'bad' } }, stats: [{ l: 'new primary log', v: '1..97', cls: 'bad' }] },
        { log: 'Entries 98, 99 and 100 were acknowledged and are now gone from the new primary. Replica B still holds them.', code: 3, hl: { nodes: { B: 'warn' } }, stats: [{ l: 'lost acked entries', v: '3', cls: 'bad' }] },
        { log: 'The new primary reuses position 98 for a new order. When B rejoins, its old 98 to 100 are rolled back.', code: 4, hl: { nodes: { B: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'rolled back', v: '98..100', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The script asks every replica for its last applied position, not just the first one to reply.', code: 0, hl: { nodes: { K: 'ok' }, edges: { e1: 'ok', e2: 'ok' } }, stats: [{ l: 'replies', v: 'A = 97, B = 100', cls: 'ok' }] },
        { log: 'It promotes the replica with the highest position, which covers every acknowledged entry.', code: 3, hl: { nodes: { B: 'ok' } }, stats: [{ l: 'new primary log', v: '1..100', cls: 'ok' }] },
        { log: 'Replica A replays 98 to 100 from the new primary. Nothing acknowledged is lost.', code: 4, hl: { nodes: { A: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'acked entries lost', v: '0', cls: 'ok' }] }
      ]
    },
    {
      id: 'epochs',
      label: 'Two primaries',
      desc: 'A partition splits the old primary from the controller. Without epochs, both sides accept writes for position 100.',
      codeLabel: 'Log',
      code: {
        bug: [
          'controller: no heartbeat, promote replica (epoch 2)',
          'old primary (epoch 1): accepts write #100',
          'new primary (epoch 2): accepts write #100',
          'partition heals: histories conflict',
          'one confirmed write is lost'
        ],
        fix: [
          'controller: promote P2 at epoch 2, tell storage',
          'old primary: write #100 (epoch 1)',
          'storage: rejected, stale epoch',
          'new primary: write #100 (epoch 2)'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'K', x: 10, y: 110, w: 130, h: 60, t: 'controller', s: 'epoch 2' },
          { id: 'P1', x: 250, y: 20, w: 150, h: 60, t: 'old primary', s: 'epoch 1' },
          { id: 'P2', x: 250, y: 200, w: 150, h: 60, t: 'new primary', s: 'epoch 2' },
          { id: 'St', x: 470, y: 110, w: 160, h: 60, t: 'storage', s: 'accepts epoch ≥ 2' }
        ],
        edges: [
          { id: 'e1', a: 'K', b: 'P2', label: 'you lead, epoch 2' },
          { id: 'e2', a: 'K', b: 'P1', label: 'heartbeat lost' },
          { id: 'e3', a: 'P1', b: 'St', label: 'write #100 (epoch 1)' },
          { id: 'e4', a: 'P2', b: 'St', label: 'write #100 (epoch 2)' }
        ]
      },
      bug: [
        { log: 'A partition cuts the old primary off from the controller, so the controller stops hearing its heartbeat.', code: 0, hl: { nodes: { P1: 'warn' }, edges: { e2: 'bad' } }, stats: [{ l: 'heartbeat', v: 'lost', cls: 'bad' }] },
        { log: 'The controller promotes a replica at epoch 2. Clients on its side write to it.', code: 0, hl: { nodes: { P2: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'primaries', v: '1 (new side)', cls: 'ok' }] },
        { log: 'The old primary still thinks it leads, so it accepts write #100 at epoch 1.', code: 1, hl: { nodes: { P1: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'primaries accepting', v: '2', cls: 'bad' }] },
        { log: 'The new primary accepts write #100 at epoch 2. Two different entries now claim position 100.', code: 2, hl: { nodes: { P2: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'conflicting #100', v: '2', cls: 'bad' }] },
        { log: 'The partition heals. The two histories cannot both be kept, so one confirmed write is discarded.', code: 4, hl: { nodes: { St: 'bad' } }, stats: [{ l: 'confirmed writes lost', v: '1 of 2', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The controller promotes the new primary at epoch 2 and tells storage the new epoch.', code: 0, hl: { nodes: { K: 'ok', St: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'storage epoch', v: '2', cls: 'ok' }] },
        { log: 'The old primary still sends write #100, tagged with its old epoch 1.', code: 1, hl: { nodes: { P1: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'stale write', v: 'sent', cls: 'warn' }] },
        { log: 'Storage rejects the stale epoch. The old primary steps down, and it confirms nothing.', code: 2, hl: { nodes: { P1: 'ok' }, edges: { e3: 'dim' } }, stats: [{ l: 'stale writes accepted', v: '0', cls: 'ok' }] },
        { log: 'Only the current epoch can extend the log, so the history stays single.', code: 3, hl: { nodes: { P2: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'history', v: 'single', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Replication lag and what users see',
  problem: `A forum sends writes to a leader and page views to two followers, which are normally 100 to 300 ms behind (illustrative). Alice saves a new profile title, reloads, and sees the old one. Her save succeeded. The follower that answered was correct for its own position, but Alice's view went back in time.`,
  predict: {
    q: `Alice's write got log position 812 on the leader. Her reload is served by follower 2, which has applied only up to 809. What should she see, given that the follower answered correctly for its position?`,
    opts: [
      `The new title, because followers always copy the leader within a second`,
      `The old title, because follower 2 cannot yet show entries it has not applied`,
      `An error, because a stale replica refuses every read`
    ],
    ans: 1,
    why: `Each replica is correct for the position it has reached. Nothing ties Alice's read to her own write, so a lagging follower can show her the state from before her save.`
  },
  explain: `
<h3>The idea</h3>
<p>Followers copy the leader's log, so they are always a little behind. A follower that is at position P_f while the leader is at P_l has a lag of P_l minus P_f, measured in entries or seconds. Usually the lag is small. During a load spike, a long query or a network problem it can grow to minutes, and the application cannot see it unless it asks.</p>
<h3>How it works, step by step</h3>
<p>1. A write returns the log position it was stored at, such as 812. The client keeps the highest position it has seen as a token.</p>
<p>2. Each read sends the token. A replica may answer only once it has applied at least that position. If it has not, it waits a few milliseconds, or the read goes to a replica that has.</p>
<p>3. This gives three guarantees, each per user. <b>Read-your-writes</b>: a user's own saved change is always visible to them. <b>Monotonic reads</b>: a user never sees an older state after a newer one. <b>Consistent prefix reads</b>: if write A happened before write B, anyone who sees B also sees A.</p>
<p>4. Simpler tools exist. Reading from the leader is always fresh but carries all the load. Pinning a user to one follower keeps their view moving forward, but a failed follower moves them to an arbitrary position.</p>
<h3>The trade-off</h3>
<p>Position tokens give the guarantees without sending everything to the leader. The cost is that every read carries a token, a replica may wait, and the token has to be stored somewhere the client can reach from any device. Choose per operation: a bank balance is read from the leader, while a comment count can come from a follower.</p>
`,
  diagnose: [
    {
      t: 'Read-your-writes broken by a lagging replica',
      sym: 'A saved job title disappears after reload',
      ctx: `A user saves a new job title. The page is rendered from a follower that has not yet applied the write, and the old title comes back.`,
      why: `The write went to the leader at position 812. The read went to follower 2, which had only reached 809. The client had no way to say "I need at least 812".`,
      fix: [
        `Measure: compare the position returned by the write with the replica's applied position at read time.`,
        `Return the write's log position to the client, have the client send it with reads, and let the replica wait until it has applied that position. Or send the user's reads to the leader for data they just wrote.`,
        `Verify: save, then reload 20 times through the load balancer and check the title never flips back.`
      ]
    },
    {
      t: 'Comments flicker when each request hits a different replica',
      sym: 'Comment 7 appears, disappears, then reappears on refresh',
      ctx: `A discussion thread is loaded through a load balancer that spreads requests over three replicas. Refreshing shows comment 7, then no comment 7, then comment 7 again.`,
      why: `Each refresh lands on a replica with a different lag. The user's view moves forward and backward in time with every request, because no request remembers what the user already saw.`,
      fix: [
        `Measure: log the replica that served each read and its applied position, next to the position the client has already seen.`,
        `Monotonic reads: remember the highest position the user has seen, and never serve a replica below it. Pinning the user to one replica is the cheap version, and the token is the robust one.`
      ]
    },
    {
      t: 'A reply appears before the question',
      sym: 'Carol sees an answer to a question she cannot see',
      note: `Seen in: Designing Data-Intensive Applications`,
      ctx: `Designing Data-Intensive Applications describes an observer who reads a conversation from two partitions, one slow and one fast, and sees the answer before the question it answers.`,
      why: `The question and the answer were written to different partitions with different lag. The reader saw a state of the conversation that never existed in the real order of events.`,
      fix: [
        `Measure: check whether the question and the answer live in the same partition, and the lag of each.`,
        `Keep causally related writes in the same partition (one log, one order). If that is impossible, make the answer wait until the question is visible, using the positions of both writes.`
      ]
    },
    {
      t: 'The second device still shows the old state',
      sym: 'The laptop shows the note from before the edit made on the phone',
      ctx: `A user edits a note on a phone, then opens the web app on a laptop. The laptop shows the note as it was before the edit.`,
      why: `The position token lived only in the phone's session. The laptop started a new session with no token, so its reads had no requirement to meet.`,
      fix: [
        `Measure: check whether the token is stored per session or per user.`,
        `Store the last write position on the user, not on the session or device. Every device reads the user's stored position and sends it as the minimum.`
      ]
    }
  ],
  source: { label: 'Original: Replication lag and what users see', href: '01-distributed-systems-end-to-end.html#ch3' },
  scenarios: [
    {
      id: 'ryw',
      label: 'Reload, old title',
      desc: 'Alice saves a title on the leader. Her reload is served by a follower that is 3 entries behind (illustrative).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'save title: Lead',
          'leader: append entry 812, reply OK',
          'OK, saved',
          'GET profile -> follower 2 (applied 809)',
          'title: Engineer (old)'
        ],
        fix: [
          'leader: entry 812, reply OK position 812',
          'client keeps token: 812',
          'GET profile, min 812',
          'follower 2 waits: applied 809 < 812',
          'entries 810-812 arrive, follower reaches 812',
          'title: Lead'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'U', x: 10, y: 115, w: 130, h: 60, t: 'Alice', s: 'title: Engineer' },
          { id: 'L', x: 250, y: 20, w: 150, h: 60, t: 'Leader', s: 'applied: 812' },
          { id: 'F2', x: 250, y: 200, w: 150, h: 60, t: 'Follower 2', s: 'applied: 809' }
        ],
        edges: [
          { id: 'e1', a: 'U', b: 'L', label: 'save title: Lead' },
          { id: 'e2', a: 'U', b: 'F2', label: 'GET profile' },
          { id: 'e3', a: 'L', b: 'F2', label: 'replicate' }
        ]
      },
      bug: [
        { log: 'Alice saves a new title. The leader stores it as entry 812.', code: 0, hl: { nodes: { U: 'on', L: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'leader position', v: '812', cls: 'ok' }] },
        { log: 'The leader confirms. Alice knows she saved "Lead".', code: 2, hl: { nodes: { U: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'alice expects', v: 'Lead', cls: 'ok' }] },
        { log: 'The reload is routed to follower 2, which has not applied entry 812 yet.', code: 3, hl: { nodes: { F2: 'warn' }, edges: { e2: 'on', e3: 'dim' } }, stats: [{ l: 'follower 2 position', v: '809', cls: 'warn' }] },
        { log: 'Follower 2 answers truthfully for position 809. Alice sees the old title and thinks the save failed.', code: 4, hl: { nodes: { F2: 'bad', U: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'title shown', v: 'Engineer (old)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The write returns its position, 812, and the client keeps it as a token.', code: 1, hl: { nodes: { L: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'token', v: '812', cls: 'ok' }] },
        { log: 'The reload carries the token. Follower 2 must not answer before it has applied 812.', code: 2, hl: { edges: { e2: 'ok' }, nodes: { U: 'ok' } }, stats: [{ l: 'minimum position', v: '812', cls: 'ok' }] },
        { log: 'Follower 2 knows it is behind, so it waits for entries 810 to 812 instead of answering with stale data.', code: 3, hl: { nodes: { F2: 'warn' }, edges: { e3: 'ok' } }, stats: [{ l: 'follower 2 position', v: '809, waiting', cls: 'warn' }] },
        { log: 'The entries arrive and follower 2 reaches 812. The reload shows the new title, so read-your-writes holds.', code: 5, hl: { nodes: { F2: 'ok', U: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'title shown', v: 'Lead', cls: 'ok' }] }
      ]
    },
    {
      id: 'flicker',
      label: 'Refresh goes backward',
      desc: 'Bob refreshes a thread through a load balancer. The second request reaches a lagging replica, so comment 7 disappears (illustrative positions).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'refresh 1: GET thread -> replica A',
          'replica A: comments 1..7 (pos 701)',
          'refresh 2: GET thread -> replica B',
          'replica B: comments 1..6 (behind)',
          'refresh 3: GET thread -> replica A'
        ],
        fix: [
          'refresh: GET thread, min pos 701',
          'replica A: comments 1..7, pos 701',
          'replica B: at 690, refuses',
          'balancer: redirect to replica A',
          'Bob sees comments 1..7, nothing goes backwards'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'U', x: 10, y: 115, w: 120, h: 60, t: 'Bob', s: 'seen: 1..7' },
          { id: 'LB', x: 230, y: 115, w: 150, h: 60, t: 'load balancer', s: 'round robin' },
          { id: 'A', x: 460, y: 20, w: 160, h: 60, t: 'Replica A', s: 'comments 1..7' },
          { id: 'B', x: 460, y: 200, w: 160, h: 60, t: 'Replica B', s: 'comments 1..6' }
        ],
        edges: [
          { id: 'e1', a: 'U', b: 'LB', label: 'GET thread' },
          { id: 'e2', a: 'LB', b: 'A' },
          { id: 'e3', a: 'LB', b: 'B' }
        ]
      },
      bug: [
        { log: 'The first refresh goes to replica A, which is up to date. Bob sees comment 7.', code: 0, hl: { nodes: { U: 'on', LB: 'on', A: 'ok' }, edges: { e1: 'on', e2: 'ok' } }, stats: [{ l: 'comments seen', v: '1..7', cls: 'ok' }] },
        { log: 'The second refresh is balanced to replica B, which is lagging behind replica A.', code: 2, hl: { nodes: { B: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'replica B', v: '1..6', cls: 'warn' }] },
        { log: 'Comment 7 is gone. Replica B is correct for its own position, but Bob has seen time go backwards.', code: 3, hl: { nodes: { U: 'bad', B: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'comment 7', v: 'missing', cls: 'bad' }] },
        { log: 'The third refresh returns to replica A, and comment 7 comes back. The thread flickers.', code: 4, hl: { nodes: { A: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'comment 7', v: 'flickers', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The client remembers the highest position it has seen, 701, and asks for at least that on every refresh.', code: 0, hl: { nodes: { U: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'seen position', v: '701', cls: 'ok' }] },
        { log: 'Replica B is at 690, so it refuses. It cannot serve a view older than what Bob already saw.', code: 2, hl: { nodes: { B: 'warn' }, edges: { e3: 'dim' } }, stats: [{ l: 'replica B position', v: '690', cls: 'warn' }] },
        { log: 'The balancer redirects the request to replica A, which has position 701 or more.', code: 3, hl: { nodes: { A: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'comment 7', v: 'stays', cls: 'ok' }] },
        { log: 'Bob sees comment 7 again, and nothing goes backwards.', code: 4, hl: { nodes: { U: 'ok' } }, stats: [{ l: 'views going backwards', v: '0', cls: 'ok' }] }
      ]
    },
    {
      id: 'question',
      label: 'Answer before question',
      desc: 'Alice and Bob write to two partitions with different lag. Carol can see the answer without the question. A single log keeps the order (illustrative lags).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'Alice: question at t=1 -> partition 1 (slow)',
          'Bob: answer at t=2 -> partition 2 (fast)',
          'Carol: GET conversation -> partition 2',
          'partition 2: answer "Yes, do it"',
          'Carol sees the answer, not the question'
        ],
        fix: [
          'Alice: question at position 40',
          'Bob: answer at position 41',
          'Carol: read up to 41, so 40 is there too'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'al', x: 10, y: 20, w: 130, h: 60, t: 'Alice', s: 'asks at t=1' },
          { id: 'bob', x: 10, y: 200, w: 130, h: 60, t: 'Bob', s: 'answers at t=2' },
          { id: 'P1', x: 250, y: 20, w: 160, h: 60, t: 'Partition 1', s: 'slow: lag 4' },
          { id: 'P2', x: 250, y: 200, w: 160, h: 60, t: 'Partition 2', s: 'fast: lag 1' },
          { id: 'log', x: 250, y: 110, w: 160, h: 60, t: 'one log', s: 'Q 40, then A 41' },
          { id: 'carol', x: 470, y: 110, w: 150, h: 60, t: 'Carol', s: 'reads both' }
        ],
        edges: [
          { id: 'e1', a: 'al', b: 'P1', label: 'question' },
          { id: 'e2', a: 'bob', b: 'P2', label: 'answer' },
          { id: 'e3', a: 'carol', b: 'P2', label: 'GET conversation' },
          { id: 'e4', a: 'al', b: 'log', label: 'question at 40' },
          { id: 'e5', a: 'log', b: 'carol', label: 'read up to 41' },
          { id: 'e6', a: 'bob', b: 'log', label: 'answer at 41' }
        ]
      },
      bug: [
        { log: 'Alice writes her question at t=1. It lands on partition 1, which replicates slowly (lag 4, illustrative).', code: 0, hl: { nodes: { al: 'on', P1: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'partition 1 lag', v: '4', cls: 'warn' }] },
        { log: 'Bob reads the question from his own cache and writes the answer to partition 2, which is fast.', code: 1, hl: { nodes: { bob: 'on', P2: 'ok' }, edges: { e2: 'on' } }, stats: [{ l: 'partition 2 lag', v: '1', cls: 'ok' }] },
        { log: 'Carol reads from partition 2, which has the answer, while partition 1 still lacks the question.', code: 2, hl: { nodes: { carol: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'question visible to Carol', v: 'no', cls: 'bad' }] },
        { log: 'Carol sees an answer to a question she cannot see. The conversation looks broken.', code: 3, hl: { nodes: { carol: 'bad' } }, stats: [{ l: 'order seen', v: 'answer, then nothing', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Alice\'s question takes position 40 in one shared log, so it has an order.', code: 0, hl: { nodes: { al: 'ok', log: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'question position', v: '40', cls: 'ok' }] },
        { log: 'Bob\'s answer takes position 41, strictly after the question in the same log.', code: 1, hl: { nodes: { bob: 'ok' }, edges: { e6: 'ok' } }, stats: [{ l: 'answer position', v: '41', cls: 'ok' }] },
        { log: 'Any replica that has position 41 also has position 40, so Carol always sees the question first.', code: 2, hl: { nodes: { carol: 'ok' }, edges: { e5: 'ok' } }, stats: [{ l: 'question before answer', v: 'always', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Writes everywhere: conflicts and quorums',
  problem: `A shopping cart is stored on five replicas, and any replica accepts writes. A data centre is cut off for ten minutes. A phone adds a book in one data centre, and a laptop removes an item on the other side (illustrative). When the link returns, the cart shows the book on one device, not on the other, and a removed item reappears.`,
  predict: {
    q: `With N = 3 replicas, a write is confirmed by W = 1 replica and a read asks R = 1 replica. Which result can a read return after a confirmed write?`,
    opts: [
      `Always the new value, because one confirmed copy is enough`,
      `Sometimes the previous value, because the read may pick a replica the write never reached`,
      `An error, because the quorum sizes do not add up to a majority`
    ],
    ans: 1,
    why: `The quorum rule W + R > N forces overlap. With W = 1 and R = 1 the write set and the read set can be different replicas, so a read can miss the write.`
  },
  explain: `
<h3>The idea</h3>
<p>With several replicas that all accept writes, there is no single leader to decide the order. A write is confirmed when enough replicas store it, and a read must ask enough replicas to see the latest confirmed value. The rule that ties these together is a quorum: with N replicas, a write set of size W and a read set of size R must share at least one replica when <code>W + R > N</code>.</p>
<h3>How it works, step by step</h3>
<p>1. The coordinator sends each write to all N replicas and waits for W acknowledgements. Example: N = 5, W = 3.</p>
<p>2. A read asks R replicas and returns the reply with the highest version. Example: R = 3. Because 3 + 3 is greater than 5, at least one replica in the read set has the newest write.</p>
<p>3. The overlap is not the whole answer. The reader must still choose the newest version among the replies. Concurrent writes that neither knew about are kept as <b>siblings</b> by version vectors, and the application merges them. Last-write-wins instead keeps one timestamp and silently drops the loser.</p>
<p>4. Repairs keep the copies in step. Read repair writes the newest value back to stale replicas, and anti-entropy compares Merkle trees in the background.</p>
<h3>The trade-off</h3>
<p>Strict quorums keep the overlap guarantee but refuse writes when too many replicas are down. A sloppy quorum accepts the write on stand-in nodes with a hint, so it stays available. The price is that the overlap argument no longer holds until the hints are delivered, so a confirmed write can be hidden from strict readers.</p>
`,
  diagnose: [
    {
      t: 'Concurrent edits silently lost by last-write-wins',
      sym: 'Bob\'s added item vanishes with no error logged',
      note: `Seen in: the Dynamo paper (2007)`,
      ctx: `The Dynamo paper (2007) describes a shopping cart where concurrent versions had to be merged rather than overwritten, and where a merged cart could show an item the user had removed.`,
      why: `Last-write-wins keeps one version by timestamp. Two writes made without knowledge of each other have no real order, so the timestamp chooses a winner by accident, and the loser disappears without any error.`,
      fix: [
        `Measure: find writes that were concurrent, meaning neither knew about the other, and check which timestamp decided the winner.`,
        `Keep both versions as siblings when their version vectors are concurrent, and merge them explicitly. Record removals as tombstones so a merge cannot resurrect them.`,
        `Verify: make two concurrent edits in two data centres and check that both items are present after the link returns.`
      ]
    },
    {
      t: 'W + R ≤ N lets a read miss a confirmed write',
      sym: 'A read returns the previous value after a confirmed write',
      ctx: `A three-replica table is written and read at consistency ONE. A user writes a value, the confirmation is correct, and the next read returns the previous value from another replica.`,
      why: `With N = 3, W = 1 and R = 1, the write set and the read set can be disjoint. The read may pick a replica that the write never reached, and nothing in the protocol forces the reader to consult a newer copy.`,
      fix: [
        `Measure: write the replication settings as W and R, and check whether W + R is greater than N.`,
        `Choose W and R so that W + R > N, for example QUORUM on both sides (2 + 2 > 3). Document which operations accept stale reads, and measure the extra latency of the larger sets.`
      ]
    },
    {
      t: 'Sloppy quorum: a confirmed write is invisible to strict readers',
      sym: 'A confirmed book is missing from the cart until hints are delivered',
      ctx: `During a rack failure, writes succeed on stand-in nodes. A reader that asks only the home replicas gets the old value, and the application reports the change as lost until the hints are delivered.`,
      why: `The write was confirmed by nodes outside the home set. The read consulted only home nodes, which never received the write. The quorum overlap argument depends on which nodes are counted, and the stand-ins were not counted by the reader.`,
      fix: [
        `Measure: count the hint backlog on the stand-in nodes, and how long a hint waits before it reaches its home node.`,
        `Use sloppy quorums only where stale reads are acceptable. Expose "accepted but not yet on home replicas" to the application, and alarm on the hint backlog so that the window stays short.`
      ]
    },
    {
      t: 'A deleted row comes back after a long outage',
      sym: 'A deleted row reappears after a node rejoins',
      note: `Cassandra: gc_grace_seconds`,
      ctx: `In Cassandra, a delete is stored as a tombstone that is removed after gc_grace_seconds. A replica that was offline longer than that window, and then rejoins without repair, can bring back the rows that were deleted.`,
      why: `The tombstone expired on the replicas that saw the delete. The replica that missed it still holds the old row, and no peer remembers that the row was deleted, so the old row spreads back to everyone.`,
      fix: [
        `Measure: check how long each replica was offline compared with gc_grace_seconds.`,
        `Run repair on every replica within the gc_grace window, and treat any node that was down longer than the window as a new node that must be rebuilt, not a node that rejoins.`,
        `Verify: after repair, the deleted row is absent on every replica.`
      ]
    }
  ],
  source: { label: 'Original: Writes everywhere: conflicts and quorums', href: '01-distributed-systems-end-to-end.html#ch4' },
  scenarios: [
    {
      id: 'lww',
      label: 'Timestamp drops edit',
      desc: 'Two data centres edit the same note while the link is down. Last-write-wins keeps the later timestamp and drops the other edit (illustrative times).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'Alice: add "buy milk" at 12:00:01 (DC 1)',
          'Bob: add "call mum" at 12:00:00 (DC 2)',
          'link down: no sync',
          'sync: last-write-wins keeps 12:00:01',
          'Bob sees +milk, "call mum" is gone'
        ],
        fix: [
          'Alice: +milk, vv {R1:1}',
          'Bob: +call mum, vv {R2:1}',
          'sync: concurrent, keep both as siblings',
          'app: merge siblings into one note'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'A', x: 10, y: 20, w: 150, h: 60, t: 'Alice (DC 1)', s: 'adds milk 12:00:01' },
          { id: 'R1', x: 250, y: 20, w: 150, h: 60, t: 'Replica DC 1', s: 'ts 12:00:01' },
          { id: 'R2', x: 250, y: 200, w: 150, h: 60, t: 'Replica DC 2', s: 'ts 12:00:00' },
          { id: 'B', x: 470, y: 200, w: 150, h: 60, t: 'Bob (DC 2)', s: 'adds call mum' }
        ],
        edges: [
          { id: 'e1', a: 'A', b: 'R1', label: 'add milk' },
          { id: 'e2', a: 'B', b: 'R2', label: 'add call mum' },
          { id: 'e3', a: 'R1', b: 'R2', label: 'sync' },
          { id: 'e4', a: 'R2', b: 'B', label: 'your note' }
        ]
      },
      bug: [
        { log: 'Alice adds an item in data centre 1 at 12:00:01 on her clock.', code: 0, hl: { nodes: { A: 'on', R1: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'timestamp', v: '12:00:01', cls: 'ok' }] },
        { log: 'Bob adds a different item in data centre 2 at 12:00:00. The two edits do not know about each other.', code: 1, hl: { nodes: { B: 'on', R2: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'timestamp', v: '12:00:00', cls: 'warn' }] },
        { log: 'The link between the data centres is down, so neither replica sees the other edit.', code: 2, hl: { nodes: { R1: 'warn', R2: 'warn' }, edges: { e3: 'dim' } }, stats: [{ l: 'sync', v: 'down', cls: 'warn' }] },
        { log: 'When the link returns, the replicas compare timestamps. 12:00:01 beats 12:00:00, so Bob edit is discarded.', code: 3, hl: { nodes: { R2: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'Bob edit', v: 'discarded', cls: 'bad' }] },
        { log: 'Bob device now shows Alice version. His edit vanished, and no error was logged.', code: 4, hl: { nodes: { B: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'error logged', v: 'none', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Alice edit gets the version vector {R1:1}, because replica 1 accepted it.', code: 0, hl: { nodes: { A: 'ok', R1: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'vector', v: '{R1:1}', cls: 'ok' }] },
        { log: 'Bob edit is accepted by replica 2 with {R2:1}. Neither vector dominates the other.', code: 1, hl: { nodes: { B: 'ok', R2: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'vector', v: '{R2:1}', cls: 'ok' }] },
        { log: 'On sync, the replicas see concurrent versions and keep both as siblings.', code: 2, hl: { edges: { e3: 'ok' } }, stats: [{ l: 'versions kept', v: '2 siblings', cls: 'ok' }] },
        { log: 'Bob device receives both siblings and merges them into one note. Nothing is lost.', code: 3, hl: { nodes: { B: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'items lost', v: '0', cls: 'ok' }] }
      ]
    },
    {
      id: 'quorum',
      label: 'W=1 misses write',
      desc: 'Three replicas, consistency ONE on both sides. The confirmed write is on replica 1 only, and the read asks replica 3 (illustrative).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'write v2 (W = 1) -> replica 1',
          'client: confirmed v2',
          'read (R = 1) -> replica 3',
          'replica 3: v1 (never saw v2)'
        ],
        fix: [
          'write v2 to replicas, W = 2',
          'replica 2: ack, 2 of 3',
          'read R = 2: replica 3 and replica 2',
          'replica 2 holds v2, newest of the two'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'C', x: 10, y: 115, w: 130, h: 60, t: 'Client', s: 'write, then read' },
          { id: 'R1', x: 250, y: 20, w: 150, h: 60, t: 'Replica 1', s: 'store v1 or v2' },
          { id: 'R2', x: 250, y: 115, w: 150, h: 60, t: 'Replica 2', s: 'store v1 or v2' },
          { id: 'R3', x: 250, y: 210, w: 150, h: 60, t: 'Replica 3', s: 'store v1 or v2' }
        ],
        edges: [
          { id: 'e1', a: 'C', b: 'R1', label: 'write v2' },
          { id: 'e2', a: 'R1', b: 'C', label: 'confirmed' },
          { id: 'e3', a: 'C', b: 'R3', label: 'read' },
          { id: 'e4', a: 'C', b: 'R2', label: 'write v2 (W = 2)' },
          { id: 'e5', a: 'R2', b: 'C', label: 'ack' },
          { id: 'e6', a: 'C', b: 'R2', label: 'read (R = 2)' }
        ]
      },
      bug: [
        { log: 'The write goes to replica 1. W = 1, so one acknowledgement is enough.', code: 0, hl: { nodes: { C: 'on', R1: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'W', v: '1', cls: 'warn' }] },
        { log: 'The client receives confirmed. Replicas 2 and 3 have not seen v2.', code: 1, hl: { nodes: { C: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'copies of v2', v: '1 of 3', cls: 'warn' }] },
        { log: 'The next read asks replica 3, which the write never reached.', code: 2, hl: { nodes: { R3: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'R', v: '1', cls: 'warn' }] },
        { log: 'The read returns v1. The write set and the read set did not overlap, so the stale value wins.', code: 3, hl: { nodes: { R3: 'bad', C: 'bad' } }, stats: [{ l: 'read result', v: 'v1 (stale)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The write is sent to the replicas. Two of the three must store it before it is confirmed.', code: 0, hl: { nodes: { C: 'ok' }, edges: { e1: 'ok', e4: 'ok' } }, stats: [{ l: 'W', v: '2', cls: 'ok' }] },
        { log: 'Replicas 1 and 2 store v2. Two of three is enough, so the write is confirmed.', code: 1, hl: { nodes: { R1: 'ok', R2: 'ok' }, edges: { e5: 'ok' } }, stats: [{ l: 'copies of v2', v: '2 of 3', cls: 'ok' }] },
        { log: 'The read asks two replicas, replica 3 and replica 2. Any two of three must overlap with the write set.', code: 2, hl: { nodes: { R3: 'ok' }, edges: { e3: 'ok', e6: 'ok' } }, stats: [{ l: 'R', v: '2', cls: 'ok' }] },
        { log: 'Whatever two replicas are asked, one of them stored v2. The newest version is returned.', code: 3, hl: { nodes: { C: 'ok', R2: 'ok' } }, stats: [{ l: 'read result', v: 'v2 (newest)', cls: 'ok' }] }
      ]
    },
    {
      id: 'sloppy',
      label: 'Confirmed, then hidden',
      desc: 'Two home replicas are down. A sloppy quorum confirms a write on a stand-in, and a strict reader cannot see it yet (illustrative).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'write cart+book (sloppy quorum)',
          'stand-in accepts, hint for H1, H2',
          'client: confirmed (W = 2 counted)',
          'read cart from home replicas only',
          'home 3: cart: old'
        ],
        fix: [
          'write cart+book (strict, W = 2)',
          'home 3: FAILED, only 1 of 2 home replicas',
          'client: cart unchanged, retry later'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'C', x: 10, y: 115, w: 130, h: 60, t: 'Client', s: 'writes the cart' },
          { id: 'H1', x: 250, y: 20, w: 150, h: 60, t: 'Homes 1 and 2', s: 'down' },
          { id: 'H3', x: 250, y: 200, w: 150, h: 60, t: 'Home 3', s: 'cart: old' },
          { id: 'S', x: 470, y: 115, w: 150, h: 60, t: 'Stand-in', s: 'hint for H1, H2' }
        ],
        edges: [
          { id: 'e1', a: 'C', b: 'S', label: 'write (sloppy)' },
          { id: 'e2', a: 'S', b: 'C', label: 'confirmed' },
          { id: 'e3', a: 'C', b: 'H3', label: 'read (home only)' },
          { id: 'e4', a: 'H3', b: 'C', label: 'cart: old' },
          { id: 'e6', a: 'C', b: 'H3', label: 'write (strict)' },
          { id: 'e7', a: 'H3', b: 'C', label: 'FAILED' }
        ]
      },
      bug: [
        { log: 'Homes 1 and 2 are down. The sloppy quorum accepts the write on a stand-in outside the home set.', code: 0, hl: { nodes: { H1: 'bad', C: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'home replicas up', v: '1 of 3', cls: 'bad' }] },
        { log: 'The stand-in stores the cart with a hint for H1 and H2, to be delivered when they return.', code: 1, hl: { nodes: { S: 'warn' } }, stats: [{ l: 'hint', v: 'for H1, H2', cls: 'warn' }] },
        { log: 'The client receives a confirmation, because the stand-in and a second node acknowledged.', code: 2, hl: { nodes: { C: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'write', v: 'confirmed', cls: 'ok' }] },
        { log: 'The reader asks the home replicas, as the strict rule requires. Home 3 is the one that answers.', code: 3, hl: { nodes: { H3: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'answer from', v: 'home 3 only', cls: 'warn' }] },
        { log: 'Home 3 holds the old cart, so the confirmed book is invisible until the hint is delivered.', code: 4, hl: { nodes: { H3: 'bad', C: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'cart shows book', v: 'no', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The write uses the strict rule. It needs two acknowledgements from home replicas.', code: 0, hl: { nodes: { C: 'on' }, edges: { e6: 'on' } }, stats: [{ l: 'home acks needed', v: '2', cls: 'warn' }] },
        { log: 'Only one home replica is reachable, so the write is refused.', code: 1, hl: { nodes: { H3: 'warn' }, edges: { e7: 'bad' } }, stats: [{ l: 'home acks', v: '1 of 2', cls: 'bad' }] },
        { log: 'Nothing was confirmed, so nothing can disappear. The application shows an error and can retry.', code: 2, hl: { nodes: { C: 'ok' } }, stats: [{ l: 'write', v: 'refused, nothing confirmed', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Splitting data: partitioning',
  problem: `A messages table holds about 2 billion rows (illustrative) and is split over four servers by user ID modulo four. A fifth server is added. Almost every row now belongs to another server, so the migration copies most of the table over a weekend. Afterwards one server runs at 95% CPU, because the newest users, who write the most, all land in the same range.`,
  predict: {
    q: `You change the function from user_id mod 4 to user_id mod 5. Roughly how many keys change owner?`,
    opts: [
      `About one in five, because only the new server takes keys`,
      `About four in five, because a key stays put only when both divisors give the same answer`,
      `None, because the keys are stored by user and the servers only read them`
    ],
    ans: 1,
    why: `The owner of a key depends on the divisor. Going from 4 to 5 servers changes the answer for most keys, so most of the table has to be copied.`
  },
  explain: `
<h3>The idea</h3>
<p>Partitioning splits one large dataset across machines so that each machine holds a share of the data and of the traffic. A good split has three properties: an equal share for each machine, a query for one record that goes to one machine, and adding a machine later that moves only a small part of the data.</p>
<h3>How it works, step by step</h3>
<p>1. Key-range partitioning gives each machine a contiguous range of keys. A range scan reads one or a few partitions, but monotonically growing keys send every new write to the last range.</p>
<p>2. Hash partitioning hashes each key first, which spreads keys evenly and removes the arrival-order hot spot. A range query then has to ask every partition.</p>
<p>3. Modulo partitioning (hash mod N) is simple, but changing N changes the owner of most keys. The fix is a fixed number of partitions, for example 1,000 partitions on 10 machines. A key's partition, hash(key) mod 1000, never changes. Only the partition-to-machine map changes when a machine is added, so adding an eleventh machine moves about 1/11 of the partitions.</p>
<p>4. Clients find the machine for a key through that map, using a routing tier, the client library, or a coordination service. A secondary index must be partitioned too: a local index is cheap to write but needs a scatter-gather read, while a global index is fast to read but lags behind the table.</p>
<h3>The trade-off</h3>
<p>Hash partitioning gives even load but loses cheap range scans. Range partitioning keeps scans cheap but needs boundaries and can concentrate writes. Fixed partitions limit movement, but a single hot key still lives on one partition, and no partitioning function can split it. That needs its own design, such as sub-keys that are summed on read.</p>
`,
  diagnose: [
    {
      t: 'Hash mod N forces a full reshuffle on resize',
      sym: 'Adding a fifth server moves about 80% of keys',
      note: `Seen in: Karger and colleagues (1997), consistent hashing for web caches`,
      ctx: `Karger and colleagues (1997) introduced consistent hashing for web caches for exactly this reason: when the number of cache servers changed under hash mod N, most cached keys mapped to a different server and the caches were effectively emptied.`,
      why: `The partition of a key depends on N. Change N and the answer changes for most keys, because h mod 4 and h mod 5 agree only for about one key in five.`,
      fix: [
        `Measure: count how many keys change owner when N changes, before you resize.`,
        `Use a fixed number of partitions, or consistent hashing with virtual nodes, so that a new machine takes over only the partitions that move to it.`,
        `Verify: after the resize, check that only the partitions handed over have moved.`
      ]
    },
    {
      t: 'Time-ordered keys send all new writes to one partition',
      sym: 'One range is at 98% load while the other ranges sit idle',
      note: `Seen in: HBase reference guide`,
      ctx: `HBase's reference guide warns against monotonically increasing row keys, because every new row is written to the region that holds the largest key, and that region server becomes the bottleneck while the others stay idle.`,
      why: `Range partitioning places neighbouring keys together. A key derived from the current time or an auto-increment ID is always larger than the previous one, so every insert lands at the right edge of the key space.`,
      fix: [
        `Measure: compare the write load per partition, and check whether the keys grow over time.`,
        `Salt or hash the leading part of the key so that new writes spread over the partitions, and accept that scans over recent data now touch several partitions.`
      ]
    },
    {
      t: 'One celebrity key overwhelms its partition',
      sym: 'One partition saturates while the others are idle',
      ctx: `A single account or product page receives far more reads and writes than any other key. Hash partitioning spreads keys evenly, yet that one key still lives on one partition, and that partition saturates while the others are idle.`,
      why: `Partitioning spreads keys, not the traffic of one key. Every request for the same key must go to the partition that owns it, so no function of the key can divide the load.`,
      fix: [
        `Measure: find the top keys by request rate, not only the top partitions by CPU.`,
        `Split the hot key into sub-keys (for example a like counter with 16 random suffixes, summed on read), cache the read path for the hot key, and move the key to a dedicated partition if it stays hot.`
      ]
    },
    {
      t: 'Global secondary index lags behind the table',
      sym: 'Login says no account for an account that exists',
      note: `Seen in: Amazon DynamoDB global secondary indexes`,
      ctx: `Amazon DynamoDB's global secondary indexes are updated asynchronously from the base table, so a query on the index can briefly miss a row that was just written. Applications that treat the index as current see rows missing from search results.`,
      why: `A global index is partitioned by the indexed value, so the index entry for a row lives on a different partition from the row. The two cannot be changed in one local step, so the index is updated after the base write.`,
      fix: [
        `Measure: compare the index lookup result with the base row for recent writes.`,
        `Read the base item when the index result must be exact, accept and document the lag where the query is approximate, or keep the index local to the row's partition when the query allows it.`
      ]
    }
  ],
  source: { label: 'Original: Splitting data: partitioning', href: '01-distributed-systems-end-to-end.html#ch5' },
  scenarios: [
    {
      id: 'modn',
      label: 'Fifth server moves keys',
      desc: 'Four servers hold keys by hash mod 4. Adding a fifth server changes the divisor, so most keys must move (illustrative keys).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'add server, divisor 4 -> 5',
          'key 1: 1 mod 4 = 1, 1 mod 5 = 1 (stays)',
          'key 4: 4 mod 4 = 0 -> 4 mod 5 = 4 (moves)',
          'key 8: 8 mod 4 = 0 -> 8 mod 5 = 3 (moves)',
          'moved: about 80% of keys (illustrative)'
        ],
        fix: [
          'add server 4: hash(key) mod 12 never changes',
          'server 0 hands partition 2 to server 4',
          'server 2 hands partition 8 to server 4',
          'moved: 2 of 12 partitions, about 17% of keys'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'K', x: 10, y: 115, w: 130, h: 60, t: 'Admin', s: 'divisor 4 -> 5' },
          { id: 'S0', x: 250, y: 20, w: 150, h: 60, t: 'Server 0', s: 'keys 0, 4, 8' },
          { id: 'S1', x: 250, y: 210, w: 150, h: 60, t: 'Server 1', s: 'key 1 stays' },
          { id: 'S3', x: 470, y: 20, w: 150, h: 60, t: 'Server 3', s: 'takes key 8' },
          { id: 'S4', x: 470, y: 210, w: 150, h: 60, t: 'Server 4 (new)', s: 'takes key 4' }
        ],
        edges: [
          { id: 'e1', a: 'K', b: 'S0', label: 'divisor 4 -> 5' },
          { id: 'e2', a: 'S0', b: 'S4', label: 'key 4 moves' },
          { id: 'e3', a: 'S0', b: 'S3', label: 'key 8 moves' },
          { id: 'e4', a: 'K', b: 'S1', label: 'key 1' }
        ]
      },
      bug: [
        { log: 'The admin adds a fifth server and changes the function to hash mod 5. Every key is recomputed.', code: 0, hl: { nodes: { K: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'divisor', v: '4 -> 5', cls: 'warn' }] },
        { log: 'Key 1 stays. It is one of the few keys where both divisors give the same answer.', code: 1, hl: { nodes: { S1: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'key 1', v: 'stays', cls: 'ok' }] },
        { log: 'Key 4 moves from server 0 to server 4. Its old copy is now on the wrong server.', code: 2, hl: { nodes: { S0: 'bad', S4: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'keys moved so far', v: '1', cls: 'bad' }] },
        { log: 'Key 8 moves from server 0 to server 3. Each move is a network copy of data.', code: 3, hl: { nodes: { S3: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'keys moved so far', v: '2', cls: 'bad' }] },
        { log: 'About 80% of keys change owner going from 4 to 5 servers. Reads for moving keys can hit the wrong server during the copy.', code: 4, hl: { nodes: { K: 'bad' } }, stats: [{ l: 'keys moved', v: 'about 80%', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The admin adds a server. The key-to-partition function is unchanged, because hash(key) mod 12 never changes.', code: 0, hl: { nodes: { K: 'ok' } }, stats: [{ l: 'partition function', v: 'unchanged', cls: 'ok' }] },
        { log: 'Server 0 hands partition 2 to the new server. Only the keys in partition 2 move.', code: 1, hl: { nodes: { S0: 'ok', S4: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'partitions moved', v: '1 of 12', cls: 'ok' }] },
        { log: 'Server 2 hands partition 8 over. The new server now owns two whole partitions.', code: 2, hl: { nodes: { S4: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'partitions moved', v: '2 of 12', cls: 'ok' }] },
        { log: 'Only two partitions moved. Clients only need the updated partition map.', code: 3, hl: { nodes: { K: 'ok' } }, stats: [{ l: 'routing map', v: 'updated', cls: 'ok' }] }
      ]
    },
    {
      id: 'hotrange',
      label: 'Inserts hit one range',
      desc: 'New users get increasing IDs, so every insert lands on the last range. Hashing the key spreads the same inserts (illustrative loads).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'insert user 2001 -> range 3 (ids >= 2000)',
          'insert user 2002 -> range 3',
          'insert user 2003 .. 2999 -> range 3',
          'range 1 and 2: idle, reads only'
        ],
        fix: [
          'insert user 2001: hash -> partition 2',
          'insert user 2002: hash -> partition 3',
          'insert user 2003: hash -> partition 1',
          'scan of users registered today: all 3 partitions'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'A', x: 10, y: 115, w: 130, h: 60, t: 'App server', s: 'inserts' },
          { id: 'R1', x: 250, y: 20, w: 150, h: 60, t: 'Range 1', s: 'ids < 1000' },
          { id: 'R2', x: 250, y: 115, w: 150, h: 60, t: 'Range 2', s: 'ids 1000..1999' },
          { id: 'R3', x: 250, y: 210, w: 150, h: 60, t: 'Range 3', s: 'ids >= 2000' }
        ],
        edges: [
          { id: 'e1', a: 'A', b: 'R3', label: 'insert 2001, 2002, ...' },
          { id: 'e2', a: 'A', b: 'R2', label: 'hashed insert' },
          { id: 'e3', a: 'A', b: 'R1', label: 'hashed insert' }
        ]
      },
      bug: [
        { log: 'The first new user has ID 2001, which belongs to the last range. Range 3 is now busy (illustrative load).', code: 0, hl: { nodes: { A: 'on', R3: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'range 3 load', v: '33%', cls: 'bad' }] },
        { log: 'The next user has ID 2002. It also lands in the last range.', code: 1, hl: { nodes: { R3: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'range 3 load', v: '66%', cls: 'bad' }] },
        { log: 'Every insert goes to range 3, which is now the only busy machine.', code: 2, hl: { nodes: { R3: 'bad' } }, stats: [{ l: 'range 3 load', v: '98%', cls: 'bad' }] },
        { log: 'Ranges 1 and 2 hold old data and serve reads only. Adding machines does not help, because new writes still go to the right edge.', code: 3, hl: { nodes: { R1: 'dim', R2: 'dim' } }, stats: [{ l: 'range 1 and 2 load', v: '0%', cls: 'warn' }] }
      ],
      fix: [
        { log: 'The hash of user 2001 places it on partition 2.', code: 0, hl: { nodes: { R2: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'partition 2 load', v: '33%', cls: 'ok' }] },
        { log: 'The next ID hashes to partition 3. Consecutive IDs no longer share a partition.', code: 1, hl: { nodes: { R3: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'partition 3 load', v: '33%', cls: 'ok' }] },
        { log: 'The third ID goes to partition 1. Writes now spread across all machines.', code: 2, hl: { nodes: { R1: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'writes', v: 'spread over 3', cls: 'ok' }] },
        { log: 'The trade-off: a scan of recent users now asks all three partitions.', code: 3, hl: { nodes: { A: 'warn' } }, stats: [{ l: 'partitions per scan', v: '3', cls: 'warn' }] }
      ]
    },
    {
      id: 'celeb',
      label: 'One hot key',
      desc: 'A celebrity post gets a like on every request. The counter is one key, so one partition takes all the writes (illustrative rates).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'like post 77 -> partition 3 (one row)',
          'like post 77 -> partition 3',
          'row lock: increments run one at a time',
          'partition 1 and 2: CPU 4% and 3%'
        ],
        fix: [
          'like: sub-counter 0..15, chosen at random',
          'sub 3 on partition 1: +1',
          'sub 13 on partition 3: +1',
          'sub 8 on partition 2: +1',
          'total = sum of 16 sub-counters'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'U', x: 10, y: 115, w: 130, h: 60, t: 'Users', s: 'likes/sec: 50k' },
          { id: 'P1', x: 250, y: 20, w: 150, h: 60, t: 'Partition 1', s: 'likes: 0' },
          { id: 'P2', x: 250, y: 115, w: 150, h: 60, t: 'Partition 2', s: 'likes: 0' },
          { id: 'P3', x: 250, y: 210, w: 150, h: 60, t: 'Partition 3', s: 'post 77 (celeb)' }
        ],
        edges: [
          { id: 'e1', a: 'U', b: 'P3', label: 'like post 77' },
          { id: 'e2', a: 'U', b: 'P1', label: 'like sub 3' },
          { id: 'e3', a: 'U', b: 'P2', label: 'like sub 8' }
        ]
      },
      bug: [
        { log: 'Every like increments the counter for post 77. Post 77 lives on partition 3.', code: 0, hl: { nodes: { U: 'on', P3: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'likes per second', v: '50k (illustrative)', cls: 'bad' }] },
        { log: 'Thousands of likes per second now queue on one row.', code: 1, hl: { nodes: { P3: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'queue', v: 'growing', cls: 'warn' }] },
        { log: 'The row lock serialises the increments, so partition 3 saturates.', code: 2, hl: { nodes: { P3: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'partition 3 CPU', v: '100%', cls: 'bad' }] },
        { log: 'The other partitions are almost idle. Adding machines does not help this key.', code: 3, hl: { nodes: { P1: 'dim', P2: 'dim' } }, stats: [{ l: 'partition 1 and 2 CPU', v: 'about 4% and 3%', cls: 'warn' }] }
      ],
      fix: [
        { log: 'Each like picks a random sub-counter, here sub 3 on partition 1.', code: 1, hl: { nodes: { U: 'ok', P1: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'sub-counters', v: '16', cls: 'ok' }] },
        { log: 'The next like goes to sub 13 on partition 3. The row lock is no longer the single queue.', code: 2, hl: { nodes: { P3: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'row lock queue', v: 'short', cls: 'ok' }] },
        { log: 'The load is split across the sub-counters, so writes land on three partitions.', code: 3, hl: { nodes: { P2: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'partitions taking writes', v: '3', cls: 'ok' }] },
        { log: 'Reading the total costs 16 reads, which is acceptable for a counter that is shown approximately.', code: 4, hl: { nodes: { U: 'warn' } }, stats: [{ l: 'reads per total', v: '16', cls: 'warn' }] }
      ]
    }
  ]
},
{
  title: 'Pauses, leases and fencing',
  problem: `Two workers process invoices from one shared file. A lock service grants a 10-second lease. Worker A's JVM freezes for 40 seconds in a stop-the-world garbage collection (illustrative). The lease expires, worker B takes the lock and writes invoice 4417. When A wakes up, it is certain it still holds the lock, and it writes its stale batch on top of B's result. No log shows an error.`,
  predict: {
    q: `Worker A checked its lease at 12:00:04, then froze until 12:00:44. The lease ended at 12:00:10 and B wrote in between. What stops A's write from landing?`,
    opts: [
      `Nothing, because A checked the lease before it froze`,
      `The storage, if every write carries a token that only increases and storage rejects lower tokens`,
      `The lock service, which kills A's process when its lease expires`
    ],
    ans: 1,
    why: `A's check happened before the pause, so it cannot protect the later write. Only a check made where the write lands, against state a paused process cannot change, can refuse it.`
  },
  explain: `
<h3>The idea</h3>
<p>A process can freeze at any point: a garbage collection pause, a VM migration, a swapped-out page, or a CPU throttle. When it resumes, it continues with the beliefs it had before the pause. A lease that a holder believes is still valid may already belong to someone else.</p>
<h3>How it works, step by step</h3>
<p>1. The lock service grants a lease and decides when it ends, using its own clock. The holder's clock plays no part in that decision.</p>
<p>2. Each grant comes with a <b>fencing token</b> that only goes up: 33 for worker A, then 34 for worker B. The token comes from a counter in the lock service's consensus log.</p>
<p>3. Every write carries its token. The storage remembers the highest token it has accepted and refuses anything lower. A paused holder can still send its write, but storage has already accepted 34, so 33 is refused.</p>
<p>4. Checking the lease in the worker is not enough. "Check, then act" is not atomic when the process can pause between the two steps. The check must move to the resource, where it is done together with the write.</p>
<p>5. Majorities decide who may issue tokens. If each side of a split believes it is the whole cluster, both can grant the lock. Requiring a strict majority of voters means only one side can grant.</p>
<h3>The trade-off</h3>
<p>Longer leases make pauses less likely to outlast the lease, but they delay recovery when a worker really crashes. Fencing removes the danger without relying on timing. Byzantine faults, where a node sends wrong data while still responding, need a different defence: checksums, signatures and independent verification.</p>
`,
  diagnose: [
    {
      t: 'Stop-the-world GC longer than the lease',
      sym: 'A stale batch overwrites newer work after a long GC pause',
      note: `Seen in: Martin Kleppmann's analysis of distributed locking (2016)`,
      ctx: `Martin Kleppmann's analysis of distributed locking (2016) walks through this exact sequence: a client holds a lock, pauses for garbage collection past its lease, and writes after another client has taken the lock.`,
      why: `The lease is decided by the lock service's clock. The paused client's own clock keeps running, but nothing in the paused code reads it, so the client continues as if it still holds the lock.`,
      fix: [
        `Measure: compare GC pause times in the worker with the lease length.`,
        `Attach a fencing token to every grant and make the storage reject lower tokens. Keep leases short, and tune heap size and pause time so that pauses stay well below the lease length.`,
        `Verify: pause a worker past its lease in a test, and check that its late write is refused.`
      ]
    },
    {
      t: 'Check-then-act: the check passes, then the pause happens',
      sym: 'Two rollouts run on the same hosts at the same time',
      ctx: `A deployment script checks that no other deploy holds the lock, then starts the rollout. A slow host pauses between the check and the rollout, and two deploys run at once.`,
      why: `The check and the action are two separate steps. A pause, a context switch or a network delay between them makes the check out of date by the time the action runs.`,
      fix: [
        `Measure: log the time between the lock check and the first rollout step for each deploy.`,
        `Make the check part of the action. Use a conditional write at the resource (compare-and-set on a version or a fencing token), so the resource refuses the action when the condition is no longer true.`
      ]
    },
    {
      t: 'Two lock services both grant the lock',
      sym: 'Two masters accept writes for the same data after a network split',
      note: `Seen in: Elasticsearch before version 7.0`,
      ctx: `Elasticsearch before version 7.0 could elect two masters during a network split when discovery.zen.minimum_master_nodes was set too low. Each side saw the other as gone and kept accepting writes.`,
      why: `Without a majority rule, each side of a partition may decide that it is the whole cluster. Both sides then issue leadership or locks, and nothing ties the two decisions together.`,
      fix: [
        `Measure: check the minimum number of master-eligible nodes that each side of a split would need.`,
        `Require a strict majority of the voting nodes for every election and every lock grant, use an odd number of voters, and make the minority side refuse writes.`
      ]
    },
    {
      t: 'A corrupt message spreads through gossip',
      sym: 'Many nodes agree on a wrong state, and no alarm fires',
      note: `Seen in: Amazon's post-mortem of the July 2008 S3 outage`,
      ctx: `Amazon's post-mortem of the July 2008 S3 outage describes a single corrupted message whose bad state spread through the system, so the failure looked like many nodes crashing at once.`,
      why: `The system assumed a node either works or stops. A node that sends a wrong value is a Byzantine fault: it is still responding, so the other nodes accept its data and forward it.`,
      fix: [
        `Measure: compare the state on each node against an independent source when a value changes shared state.`,
        `Checksum every message and every stored block, validate inputs at each boundary, and compare results from independent replicas before accepting a value that changes shared state.`
      ]
    }
  ],
  source: { label: 'Original: Pauses, leases and fencing', href: '01-distributed-systems-end-to-end.html#ch6' },
  scenarios: [
    {
      id: 'zombie',
      label: 'Paused, then writes',
      desc: 'Worker A holds the lease, freezes for 40 seconds, and writes after worker B has taken over. Without fencing, the stale write lands (illustrative times).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'lease until 10 s, held by A',
          'A: GC pause 40 s, no code runs',
          'lease expires, lock service grants B',
          'B: writes total 1100',
          'A wakes up, still believes it holds the lock',
          'A: writes stale total 1050 over B result'
        ],
        fix: [
          'lock granted to A, token 33',
          'A pauses 40 s, still holds token 33',
          'lease expired, lock granted to B, token 34',
          'B: write total 1100 with token 34, accepted',
          'A: write total 1050 with token 33, refused'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'A', x: 10, y: 20, w: 150, h: 60, t: 'Worker A', s: 'lock: yes (until 10)' },
          { id: 'L', x: 250, y: 115, w: 150, h: 60, t: 'Lock service', s: 'holder: A, then B' },
          { id: 'B', x: 470, y: 20, w: 150, h: 60, t: 'Worker B', s: 'writes 1100' },
          { id: 'S', x: 250, y: 210, w: 150, h: 60, t: 'Shared file', s: 'invoice total' }
        ],
        edges: [
          { id: 'e1', a: 'L', b: 'A', label: 'lease until 10, token 33' },
          { id: 'e2', a: 'L', b: 'B', label: 'grant lock, token 34' },
          { id: 'e3', a: 'B', b: 'S', label: 'write 1100' },
          { id: 'e4', a: 'A', b: 'S', label: 'write 1050 (stale)' }
        ]
      },
      bug: [
        { log: 'Worker A renews its lease at 0 seconds. The lease now runs until 10 (illustrative).', code: 0, hl: { nodes: { A: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'lease until', v: '10 s', cls: 'ok' }] },
        { log: 'A enters a garbage collection pause of 40 seconds. No code in A runs, so its beliefs stop updating.', code: 1, hl: { nodes: { A: 'bad' } }, stats: [{ l: 'A paused for', v: '40 s', cls: 'bad' }] },
        { log: 'The lock service sees no renewal and gives the lock to worker B after the lease expires.', code: 2, hl: { nodes: { L: 'warn', B: 'ok' }, edges: { e2: 'on' } }, stats: [{ l: 'lock holder', v: 'B', cls: 'warn' }] },
        { log: 'B writes the correct total of 1100 to the shared file.', code: 3, hl: { nodes: { B: 'ok', S: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'invoice total', v: '1100', cls: 'ok' }] },
        { log: 'A wakes up and still believes it holds the lock. It has no reason to doubt that.', code: 4, hl: { nodes: { A: 'bad' } }, stats: [{ l: 'A believes', v: 'it holds the lock', cls: 'bad' }] },
        { log: 'A writes its stale batch over B result. The total is now wrong, and no error appears in any log.', code: 5, hl: { nodes: { S: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'invoice total', v: '1050 (wrong)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The lock service grants the lock to A with token 33. Tokens only go up.', code: 0, hl: { nodes: { L: 'ok', A: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'A token', v: '33', cls: 'ok' }] },
        { log: 'A pauses for 40 seconds. It still holds token 33 in memory.', code: 1, hl: { nodes: { A: 'bad' } }, stats: [{ l: 'A holds', v: 'token 33', cls: 'bad' }] },
        { log: 'The lease expires. The lock service grants the lock to B with token 34.', code: 2, hl: { nodes: { L: 'ok', B: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'B token', v: '34', cls: 'ok' }] },
        { log: 'B writes 1100 with token 34. Storage accepts it and records 34 as the highest token seen.', code: 3, hl: { nodes: { S: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'storage max token', v: '34', cls: 'ok' }] },
        { log: 'A wakes up and writes with token 33. Storage refuses it, because 33 is lower than 34.', code: 4, hl: { nodes: { S: 'warn' }, edges: { e4: 'dim' } }, stats: [{ l: 'stale write', v: 'refused', cls: 'ok' }] }
      ]
    },
    {
      id: 'checkact',
      label: 'Check, then pause',
      desc: 'Two deploys check the same lock. A pauses between its check and its write, so both proceed. A conditional write at the lock file stops the second one (illustrative).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'A: checks the lock, it is free',
          'A: pauses before writing its owner record',
          'B: checks, sees free, writes owner B',
          'A: resumes, writes owner A over B',
          'both roll out v2 on the same hosts'
        ],
        fix: [
          'A: read owner none, version 7',
          'B: read owner none, version 7',
          'B: CAS set owner B if version 7 -> ok, now version 8',
          'A: CAS set owner A if version 7 -> rejected, version is 8'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'A', x: 10, y: 20, w: 150, h: 60, t: 'Deploy A', s: 'checks: free' },
          { id: 'L', x: 250, y: 115, w: 150, h: 60, t: 'Lock file', s: 'owner: none' },
          { id: 'B', x: 470, y: 20, w: 150, h: 60, t: 'Deploy B', s: 'takes the lock' },
          { id: 'H', x: 250, y: 210, w: 150, h: 60, t: 'Hosts', s: 'running: 2 deploys' }
        ],
        edges: [
          { id: 'e1', a: 'A', b: 'L', label: 'is the lock free?' },
          { id: 'e2', a: 'B', b: 'L', label: 'take it' },
          { id: 'e3', a: 'A', b: 'L', label: 'write owner A (late)' },
          { id: 'e4', a: 'A', b: 'H', label: 'roll out v2' }
        ]
      },
      bug: [
        { log: 'Deploy A checks the lock file. It is free.', code: 0, hl: { nodes: { A: 'on', L: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'lock', v: 'free', cls: 'ok' }] },
        { log: 'Before A writes its owner record, its host is overloaded and A is delayed.', code: 1, hl: { nodes: { A: 'warn' } }, stats: [{ l: 'A delayed', v: 'yes', cls: 'warn' }] },
        { log: 'Deploy B checks, sees the lock free, and writes itself as owner.', code: 2, hl: { nodes: { B: 'ok', L: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'owner', v: 'B', cls: 'ok' }] },
        { log: 'A resumes and writes itself as owner, overwriting B. Both believe they hold the lock.', code: 3, hl: { nodes: { L: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'owner', v: 'A (B overwritten)', cls: 'bad' }] },
        { log: 'Both rollouts run on the same hosts at the same time.', code: 4, hl: { nodes: { H: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'running', v: '2 deploys', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Deploy A reads the lock and its version, 7.', code: 0, hl: { nodes: { A: 'on', L: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'A reads version', v: '7', cls: 'ok' }] },
        { log: 'Deploy B reads the same version, 7.', code: 1, hl: { nodes: { B: 'on' } }, stats: [{ l: 'B reads version', v: '7', cls: 'ok' }] },
        { log: 'B writes only if the version is still 7. It is, so the write succeeds and the version becomes 8.', code: 2, hl: { nodes: { B: 'ok', L: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'owner', v: 'B, version 8', cls: 'ok' }] },
        { log: 'A writes with the condition version 7. That condition is now false, so the write is rejected.', code: 3, hl: { nodes: { A: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'A condition (version 7)', v: 'false', cls: 'bad' }] }
      ]
    },
    {
      id: 'split',
      label: 'Majority stops two masters',
      desc: 'Four nodes split into two groups of two. With a "half or more" rule, each side elects a master. With a strict majority, only one side can (illustrative).',
      codeLabel: 'Vote',
      code: {
        bug: [
          'network split: {1,2} | {3,4}',
          'node 1: vote me master, asks node 2',
          'node 2: yes (2 of 4 is taken as enough)',
          'node 3: vote me master, asks node 4',
          'node 4: yes, two masters now'
        ],
        fix: [
          'network split: {1,2} | {3,4}',
          'node 1: vote me master, needs 3 of 4',
          'node 2: yes, but 2 of 4 is not a majority',
          'node 3 and 4: yes, yes (3 of 4)'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'N1', x: 10, y: 20, w: 130, h: 60, t: 'Node 1', s: 'master: none yet' },
          { id: 'N2', x: 10, y: 200, w: 130, h: 60, t: 'Node 2', s: 'master: none yet' },
          { id: 'N3', x: 470, y: 20, w: 150, h: 60, t: 'Node 3', s: 'master: none yet' },
          { id: 'N4', x: 470, y: 200, w: 150, h: 60, t: 'Node 4', s: 'master: none yet' }
        ],
        edges: [
          { id: 'e1', a: 'N1', b: 'N2', label: 'vote' },
          { id: 'e3', a: 'N3', b: 'N4', label: 'vote' },
          { id: 'e4', a: 'N4', b: 'N3', label: 'yes' },
          { id: 'e5', a: 'N2', b: 'N3', label: 'network split' }
        ]
      },
      bug: [
        { log: 'The network splits the four nodes into two groups of two.', code: 0, hl: { nodes: { N2: 'warn', N3: 'warn' }, edges: { e5: 'bad' } }, stats: [{ l: 'groups', v: '2 + 2', cls: 'bad' }] },
        { log: 'Group one holds an election. Node 1 votes for itself and asks node 2.', code: 1, hl: { nodes: { N1: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'votes', v: '2 of 4', cls: 'warn' }] },
        { log: 'Two of four votes is taken as enough, because the rule was "half or more". Node 1 becomes master.', code: 2, hl: { nodes: { N1: 'bad', N2: 'bad' } }, stats: [{ l: 'master on side one', v: 'node 1', cls: 'bad' }] },
        { log: 'Group two holds its own election at the same time, and node 3 becomes master.', code: 3, hl: { nodes: { N3: 'bad', N4: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'master on side two', v: 'node 3', cls: 'bad' }] },
        { log: 'Now there are two masters, and both accept writes for the same data.', code: 4, hl: { edges: { e5: 'bad' } }, stats: [{ l: 'masters', v: '2', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The same split happens. Each side now needs a strict majority of all four voters.', code: 0, hl: { nodes: { N2: 'warn' }, edges: { e5: 'bad' } }, stats: [{ l: 'votes needed', v: '3 of 4', cls: 'warn' }] },
        { log: 'Group one asks for votes and gets two. Two of four is not a majority, so no master is chosen.', code: 2, hl: { nodes: { N1: 'dim', N2: 'dim' } }, stats: [{ l: 'master on side one', v: 'none', cls: 'ok' }] },
        { log: 'Group one refuses writes. Its nodes stay in the minority and cannot grant anything.', code: 1, hl: { nodes: { N1: 'ok' } }, stats: [{ l: 'writes on side one', v: 'refused', cls: 'ok' }] },
        { log: 'Group two gets three of four votes, a majority, so exactly one master exists.', code: 3, hl: { nodes: { N3: 'ok', N4: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'masters', v: '1', cls: 'ok' }] }
      ]
    },
    {
      id: 'corrupt',
      label: 'One bad bit spreads',
      desc: 'A bit flips in one node. Gossip without checksums copies the bad value to every node. With checksums, the receiver rejects it (illustrative).',
      codeLabel: 'Gossip',
      code: {
        bug: [
          'node 1: bit flip in memory, status corrupt',
          'gossip: status corrupt -> node 2',
          'node 2 forwards: status corrupt -> node 3',
          'all nodes agree: no quorum detects it'
        ],
        fix: [
          'node 1: gossip + checksum (computed before the flip)',
          'node 2: checksum mismatch, reject',
          'node 2: forward status ok to node 3'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'N1', x: 10, y: 115, w: 150, h: 60, t: 'Node 1', s: 'bit flipped' },
          { id: 'N2', x: 250, y: 20, w: 150, h: 60, t: 'Node 2', s: 'status: ok' },
          { id: 'N3', x: 470, y: 115, w: 150, h: 60, t: 'Node 3', s: 'status: ok' },
          { id: 'CK', x: 250, y: 210, w: 150, h: 60, t: 'Checksum', s: 'checked on arrival' }
        ],
        edges: [
          { id: 'e1', a: 'N1', b: 'N2', label: 'gossip' },
          { id: 'e2', a: 'N2', b: 'N3', label: 'forward' },
          { id: 'e3', a: 'N1', b: 'CK', label: 'checksum' }
        ]
      },
      bug: [
        { log: 'A bit flips in node 1 memory. Node 1 still answers health checks.', code: 0, hl: { nodes: { N1: 'bad' } }, stats: [{ l: 'node 1 health', v: 'ok (still answers)', cls: 'warn' }] },
        { log: 'Node 1 gossips its state. Node 2 has no checksum, so it accepts the value.', code: 1, hl: { nodes: { N2: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'node 2 accepts', v: 'yes', cls: 'bad' }] },
        { log: 'Node 2 forwards the same value to node 3, which accepts it as well.', code: 2, hl: { nodes: { N3: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'nodes with bad state', v: '3 of 3', cls: 'bad' }] },
        { log: 'Every node agrees on the wrong state, so no quorum detects the error. The system looks healthy.', code: 3, hl: { nodes: { N1: 'bad', N2: 'bad', N3: 'bad' } }, stats: [{ l: 'alarm raised', v: 'none', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Node 1 sends the value with the checksum it computed from the correct state.', code: 0, hl: { nodes: { N1: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'checksum', v: 'from correct state', cls: 'ok' }] },
        { log: 'Node 2 recomputes the checksum, sees the mismatch, and rejects the message.', code: 1, hl: { nodes: { N2: 'ok' }, edges: { e1: 'bad' } }, stats: [{ l: 'messages rejected', v: '1', cls: 'ok' }] },
        { log: 'Node 2 keeps its good copy and forwards only that. Node 1 is flagged for inspection.', code: 2, hl: { nodes: { N3: 'ok', N1: 'warn' }, edges: { e2: 'ok' } }, stats: [{ l: 'node 3 status', v: 'ok', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Clocks and order',
  problem: `A user profile is replicated to three data centres, and the store keeps the write with the largest timestamp (last-write-wins). One app server's clock runs 3 seconds fast and another runs 2 seconds slow (illustrative). The user changes their address on the slow server, then a minute later on the fast one. The store keeps the first address. The user's last change is gone, and no log shows an error.`,
  predict: {
    q: `Bob writes one second after Alice in real time. Alice's clock is 3 seconds fast, so she is stamped 12:00:04, and Bob's clock is 2 seconds slow, so he is stamped 12:00:00. Which address does the store keep?`,
    opts: [
      `Bob's, because his write happened later in real time`,
      `Alice's, because 12:00:04 is the largest timestamp, even though her write came first`,
      `Both, because last-write-wins keeps every version`
    ],
    ans: 1,
    why: `Last-write-wins compares the stamps, not the real order. A clock that runs fast wins every race, so the earlier write survives and the later one is discarded.`
  },
  explain: `
<h3>The idea</h3>
<p>Machines do not share one clock. Each clock drifts, NTP corrects it in steps, and two readings from different machines cannot be compared exactly. A protocol that orders writes by wall-clock time is therefore ordering them by whichever clock is fastest, not by what really happened first.</p>
<h3>How it works, step by step</h3>
<p>1. Use the right clock for the job. A <b>monotonic clock</b> only counts elapsed time on one machine and never goes backwards, so use it for durations and timeouts (in Java, System.nanoTime; in Go, time.Since). A <b>wall clock</b> is meant to match calendar time, so it can jump when NTP corrects it. Use it only to show a time to people or to stamp a log.</p>
<p>2. Clock error has a bound, not a value. NTP on a good network keeps clocks within a few milliseconds, and on a bad network within hundreds of milliseconds. Two writes 20 ms apart can still be ordered backwards.</p>
<p>3. A <b>Lamport counter</b> gives an order that respects cause and effect. A local event increments the counter, a send attaches it, and a receive sets it to the larger of the two plus one. If A happened before B, then L(A) is smaller than L(B), but the reverse is not true.</p>
<p>4. A <b>vector clock</b> keeps one counter per writer in each version. Version A is before B only when every entry of A is at most the matching entry of B. If neither vector is at most the other, the writes were concurrent, and the store keeps both as siblings for the application to merge.</p>
<h3>The trade-off</h3>
<p>Server-assigned sequence numbers give a clean order, but every write waits for a round trip to one counter, which is a bottleneck and a single point of failure. Vector clocks avoid that round trip and expose concurrency, but each version carries a vector that grows with the number of writers, and the application must merge siblings. A total order for every node needs consensus, which costs more than causal order.</p>
`,
  diagnose: [
    {
      t: 'Last-write-wins with skewed client clocks',
      sym: 'The latest write is lost, and no log records an error',
      note: `Seen in: Cassandra, client-supplied write timestamps`,
      ctx: `Cassandra resolves conflicting cells by the highest client-supplied write timestamp. A client whose clock runs fast keeps overwriting newer data from correct clients, and a client with a slow clock writes values that disappear immediately.`,
      why: `The store compares timestamps from different machines as if they measured the same clock. A 3 second offset is larger than the real gap between the two writes, so the earlier write wins.`,
      fix: [
        `Measure: compare each writer's clock offset with the real gap between the conflicting writes.`,
        `Use server-assigned timestamps for conflict resolution, or hybrid logical clocks, or store concurrent versions and resolve them explicitly. Monitor the clock offset of every writer and reject writers that drift.`,
        `Verify: write from a writer with a fast clock and a writer with a slow clock, and check that the later write is kept.`
      ]
    },
    {
      t: 'Timestamp IDs go backwards after a clock step',
      sym: 'Two rows get the same primary key after an NTP correction',
      ctx: `An ID generator packs a millisecond timestamp, a worker number and a counter into 64 bits. After an NTP correction moves the clock back by 50 ms, the generator issues IDs that repeat IDs it already issued.`,
      why: `The uniqueness argument silently assumed the wall clock never goes backwards. When it does, the timestamp part repeats, and the counter restarts, so two different rows get the same key.`,
      fix: [
        `Measure: log the wall clock at each ID issue, and alert on any step backwards.`,
        `Refuse to issue IDs while the clock is behind the last issued timestamp (wait it out), persist a high-water mark so a restart cannot reuse a range, and use a monotonic clock or a sequence from storage where possible.`
      ]
    },
    {
      t: 'A timeout measured with the wall clock never fires',
      sym: 'A request hangs, and latency dashboards show negative values',
      ctx: `Code measures a request timeout with the wall clock. After an NTP correction moves the clock back an hour, the timeout computed as now minus start is negative, so the request waits forever. A similar bug reports negative latencies in dashboards.`,
      why: `The wall clock is designed to be set by people and by NTP. Subtracting two readings is only valid when the clock moved forward between them, and nothing checks that.`,
      fix: [
        `Measure: search the code for timeouts and latency metrics computed from wall-clock readings.`,
        `Use a monotonic clock for every duration and timeout (in Java, System.nanoTime; in Go, time.Since on a value that carries the monotonic reading). Keep the wall clock for timestamps that people read.`
      ]
    },
    {
      t: 'Replies arrive before the questions that caused them',
      sym: 'A reply shows in the thread before the comment it answers',
      ctx: `A comment thread is stored as one message per comment on a queue with several partitions. A reply and the comment it answers land on different partitions, and a consumer shows the reply before the comment, and sometimes not at all for a while.`,
      why: `Each partition keeps its own order, but nothing orders messages across partitions. The reply's causal dependency on the comment was never recorded, so the consumer had no way to wait for it.`,
      fix: [
        `Measure: check whether a reply and its parent share a partition key.`,
        `Route causally related messages to the same partition (for example by thread ID), or record the dependency (the parent ID or a vector clock) and have the consumer hold a reply until its parent has been applied.`
      ]
    }
  ],
  source: { label: 'Original: Clocks and order', href: '01-distributed-systems-end-to-end.html#ch7' },
  scenarios: [
    {
      id: 'fastclock',
      label: 'Fast clock wins',
      desc: 'Alice writes first, but her clock is 3 seconds fast. Bob writes later with a slow clock, and the store keeps the earlier write (illustrative times).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'Alice: real 12:00:01, stamp 12:00:04',
          'Alice: address = Oslo @12:00:04, stored',
          'Bob: real 12:00:02, stamp 12:00:00',
          'store: 12:00:00 < 12:00:04, discard Paris',
          'Bob newest address is lost, no error logged'
        ],
        fix: [
          'Alice: address = Oslo',
          'store: stored as sequence 11',
          'Bob: address = Paris',
          'store: stored as sequence 12, Bob wins',
          'cost: one round trip to the store per write'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'A', x: 10, y: 20, w: 170, h: 60, t: 'Alice, clock +3 s', s: 'writes Oslo' },
          { id: 'S', x: 330, y: 110, w: 170, h: 60, t: 'Store (LWW)', s: 'keeps max stamp' },
          { id: 'B', x: 10, y: 200, w: 170, h: 60, t: 'Bob, clock -2 s', s: 'writes Paris' }
        ],
        edges: [
          { id: 'e1', a: 'A', b: 'S', label: 'Oslo @12:00:04' },
          { id: 'e2', a: 'B', b: 'S', label: 'Paris @12:00:00' },
          { id: 'e3', a: 'S', b: 'B', label: 'Oslo kept' }
        ]
      },
      bug: [
        { log: 'Alice writes at real time 12:00:01, but her clock is 3 seconds fast and stamps the write 12:00:04.', code: 0, hl: { nodes: { A: 'on' } }, stats: [{ l: 'Alice stamp', v: '12:00:04', cls: 'warn' }] },
        { log: 'The store keeps Alice write, because its stamp is the newest so far.', code: 1, hl: { nodes: { S: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'stored', v: 'Oslo', cls: 'ok' }] },
        { log: 'Bob writes one second later in real time, at 12:00:02. His clock is 2 seconds slow and stamps 12:00:00.', code: 2, hl: { nodes: { B: 'on' }, edges: { e2: 'on' } }, stats: [{ l: 'Bob stamp', v: '12:00:00', cls: 'bad' }] },
        { log: 'The store compares the stamps, sees 12:00:00 is older than 12:00:04, and discards Bob write.', code: 3, hl: { nodes: { S: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'Bob write', v: 'discarded', cls: 'bad' }] },
        { log: 'Bob newest address is gone. No error is logged.', code: 4, hl: { nodes: { B: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'last change', v: 'lost', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Alice write reaches the store first. The store does not compare client clocks at all.', code: 0, hl: { nodes: { A: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'store sequence', v: '11', cls: 'ok' }] },
        { log: 'The store stamps the write with its own counter.', code: 1, hl: { nodes: { S: 'ok' } }, stats: [{ l: 'stored', v: 'Oslo', cls: 'ok' }] },
        { log: 'Bob write arrives a second later and gets the next number.', code: 2, hl: { nodes: { B: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'store sequence', v: '12', cls: 'ok' }] },
        { log: 'The store stamps it 12, which is later, so Bob write wins, as it should.', code: 3, hl: { nodes: { S: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'winner', v: 'Paris (Bob)', cls: 'ok' }] },
        { log: 'The price is a round trip to the store for every write, and a component that must be highly available.', code: 4, hl: { nodes: { S: 'warn' } }, stats: [{ l: 'round trip per write', v: 'yes', cls: 'warn' }] }
      ]
    },
    {
      id: 'idgen',
      label: 'Clock steps back',
      desc: 'An ID generator packs the wall-clock millisecond into each ID. After an NTP step back, it issues an ID it already issued (illustrative IDs).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'issue 1000-3-0 to row 1 (counter 0)',
          'NTP: clock steps back 50 ms, now 950',
          'clock 950: counter resets, issue 950-3-0',
          'clock reaches 1000 again, counter 0',
          'issue 1000-3-0 again: duplicate key'
        ],
        fix: [
          'issue 1000-3-0, high-water mark 1000',
          'NTP: clock steps back to 950, below 1000',
          'generator waits until the clock passes 1000',
          'issue 1001-3-0, high-water mark 1001'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'G', x: 10, y: 115, w: 150, h: 60, t: 'ID generator', s: 'last: t=1000' },
          { id: 'D1', x: 250, y: 20, w: 150, h: 60, t: 'Row 1', s: 'id: 1000-3-0' },
          { id: 'D2', x: 250, y: 210, w: 150, h: 60, t: 'Row 2', s: 'id: 950-3-0' },
          { id: 'N', x: 470, y: 115, w: 150, h: 60, t: 'NTP', s: 'clock 1000 -> 950' }
        ],
        edges: [
          { id: 'e1', a: 'G', b: 'D1', label: 'issue 1000-3-0' },
          { id: 'e2', a: 'G', b: 'D2', label: 'issue 950-3-0' },
          { id: 'e3', a: 'N', b: 'G', label: 'step back 50 ms' },
          { id: 'e4', a: 'G', b: 'D2', label: 'duplicate 1000-3-0' }
        ]
      },
      bug: [
        { log: 'The generator issues ID 1000-3-0 to row 1 at time 1000. The counter is 0.', code: 0, hl: { nodes: { G: 'ok', D1: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'last issued', v: '1000', cls: 'ok' }] },
        { log: 'NTP corrects the clock back by 50 ms. The wall clock now reads 950.', code: 1, hl: { nodes: { N: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'clock', v: '950', cls: 'bad' }] },
        { log: 'The generator sees a new millisecond, resets its counter, and issues a fresh ID to row 2.', code: 2, hl: { nodes: { D2: 'warn' }, edges: { e2: 'bad' } }, stats: [{ l: 'row 2 id', v: '950-3-0', cls: 'warn' }] },
        { log: 'When the clock comes back to 1000, the counter restarts at 0 and the generator issues 1000-3-0 again.', code: 3, hl: { nodes: { G: 'bad' } }, stats: [{ l: 'counter', v: 'restarts at 0', cls: 'bad' }] },
        { log: 'Two different rows now share one primary key. The insert fails, or worse, overwrites the first row.', code: 4, hl: { nodes: { D2: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'primary keys', v: 'duplicate', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The generator issues 1000-3-0 and records 1000 as its high-water mark.', code: 0, hl: { nodes: { G: 'ok', D1: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'high-water mark', v: '1000', cls: 'ok' }] },
        { log: 'The clock steps back to 950, below the high-water mark.', code: 1, hl: { nodes: { N: 'warn' }, edges: { e3: 'on' } }, stats: [{ l: 'clock', v: '950 (below 1000)', cls: 'warn' }] },
        { log: 'The generator refuses to issue an ID until the clock passes 1000 again. A few milliseconds of delay costs nothing.', code: 2, hl: { nodes: { G: 'warn' } }, stats: [{ l: 'generator', v: 'waiting', cls: 'warn' }] },
        { log: 'Once the clock passes the high-water mark, new IDs are strictly larger. No duplicate is possible.', code: 3, hl: { nodes: { G: 'ok', D2: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'row 2 id', v: '1001-3-0', cls: 'ok' }] }
      ]
    },
    {
      id: 'timeout',
      label: 'Timeout never fires',
      desc: 'A 5 second timeout is measured on the wall clock. An hour-long NTP step makes the elapsed time negative. A monotonic clock fixes it (illustrative times).',
      codeLabel: 'Code',
      code: {
        bug: [
          'start = wall clock 10:00:00   # timeout: 5 s',
          'check at 10:00:02: elapsed 2 s, keep waiting',
          'NTP: step wall clock back 1 hour',
          'elapsed = 09:00:03 - 10:00:00 = -1 h',
          'timeout never fires: the request hangs'
        ],
        fix: [
          'start = monotonic 500 s   # timeout: 5 s',
          'NTP steps the wall clock, monotonic unchanged',
          'monotonic 502 s: elapsed 2 s',
          'monotonic 505 s: elapsed 5 s, timeout fires'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'R', x: 10, y: 115, w: 150, h: 70, t: 'Request code', s: 'timeout: 5 s' },
          { id: 'C', x: 250, y: 20, w: 170, h: 60, t: 'Wall clock', s: '10:00:02 -> 09:00:03' },
          { id: 'N', x: 470, y: 200, w: 150, h: 60, t: 'NTP', s: 'steps clock -1 h' },
          { id: 'M', x: 250, y: 210, w: 170, h: 60, t: 'Monotonic clock', s: 'counts elapsed only' }
        ],
        edges: [
          { id: 'e1', a: 'R', b: 'C', label: 'elapsed = now - start' },
          { id: 'e2', a: 'N', b: 'C', label: 'step back 1 hour' },
          { id: 'e3', a: 'C', b: 'R', label: 'elapsed -1 h' },
          { id: 'e4', a: 'R', b: 'M', label: 'elapsed 2 s, 5 s' }
        ]
      },
      bug: [
        { log: 'The code records the start time from the wall clock, 10:00:00, with a timeout of 5 seconds.', code: 0, hl: { nodes: { R: 'on' } }, stats: [{ l: 'timeout', v: '5 s', cls: 'ok' }] },
        { log: 'After 2 seconds the check runs. 2 seconds is under the timeout, so the code keeps waiting.', code: 1, hl: { nodes: { C: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'elapsed', v: '2 s', cls: 'ok' }] },
        { log: 'NTP corrects a drifting clock by stepping it back an hour. The wall clock now reads 09:00:03.', code: 2, hl: { nodes: { N: 'bad', C: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'wall clock', v: '09:00:03', cls: 'bad' }] },
        { log: 'The elapsed time is negative, which is less than the timeout. The code keeps waiting.', code: 3, hl: { nodes: { R: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'elapsed', v: '-1 h', cls: 'bad' }] },
        { log: 'The timeout never fires, and the request hangs.', code: 4, hl: { nodes: { R: 'bad' } }, stats: [{ l: 'request', v: 'hangs', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The code records the monotonic reading, which only counts elapsed time, at 500 seconds.', code: 0, hl: { nodes: { R: 'ok' }, edges: { e4: 'on' } }, stats: [{ l: 'start', v: 'mono 500 s', cls: 'ok' }] },
        { log: 'NTP steps the wall clock back an hour. The monotonic clock does not change.', code: 1, hl: { nodes: { N: 'warn', M: 'ok' }, edges: { e2: 'dim' } }, stats: [{ l: 'monotonic clock', v: 'unchanged', cls: 'ok' }] },
        { log: 'Two seconds later the elapsed time is correct, 2 seconds, whatever the wall clock says.', code: 2, hl: { nodes: { M: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'elapsed', v: '2 s', cls: 'ok' }] },
        { log: 'The timeout fires on time, and the wall clock was never consulted.', code: 3, hl: { nodes: { R: 'ok' } }, stats: [{ l: 'timeout', v: 'fires at 5 s', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Linearizability',
  problem: `A customer transfers money and sees the new balance (1,200) on their phone. A moment later their laptop shows the old balance (1,000). Both reads came from correct replicas, but the balance seemed to go up and then back down (illustrative numbers). The bank needs one rule for each object, not just copies that agree eventually.`,
  predict: {
    q: `The transfer finished on the leader. The phone read a follower that had it and saw 1,200. Then the laptop read a second follower that had not applied the write yet. What does the laptop show?`,
    opts: [
      `1,200, because the write had already finished when the laptop read`,
      `1,000, because the second follower is correct for its own position and has not applied the write`,
      `An error, because the two followers disagree`
    ],
    ans: 1,
    why: `The laptop read started after the write finished, so a linearizable system would have to return 1,200. Plain follower reads do not promise that, so the stale copy answers.`
  },
  explain: `
<h3>The idea</h3>
<p>Linearizability is a rule for one object, such as one account balance. Each operation seems to take effect at one instant between its start and its end, and those instants respect real time. If operation A finishes before operation B starts, then A's effect comes before B's. The system behaves as if there were one copy of the data.</p>
<h3>How it works, step by step</h3>
<p>1. Reads from ordinary followers break the rule. A follower is correct for its own position, but nothing ties its answer to the latest write that has already completed somewhere else.</p>
<p>2. Read from the leader after a leadership check. A stale leader that has been partitioned away must not answer, so the leader first asks a majority whether it is still the leader. If no majority agrees, the read is refused.</p>
<p>3. Or read, then write back, then return. A reader finds the newest value on a majority, writes it to a majority, and only then returns it. Any later reader then overlaps a majority that holds the value.</p>
<p>4. Consensus protocols do the same thing by committing a read through the log. The read takes a place in the one order that every replica follows.</p>
<h3>The trade-off</h3>
<p>A linearizable read needs a majority round trip, so caching cannot skip it. During a network partition, the minority side must refuse such operations to stay linearizable. This is the CAP choice: consistency or availability for the requests that cross the partition. Linearizability is about one object and real time. Serializability is about transactions over many objects, and it is a separate property.</p>
`,
  diagnose: [
    {
      t: 'Read from a lagging follower after a newer read',
      sym: 'Balance shows 1,200 on one device, then 1,000 on another',
      ctx: `A customer sees the new balance on one device. Moments later another device reads the same account from a follower that has not applied the write, and shows the previous balance.`,
      why: `Each read was answered by a replica that was correct for its own position. Without a rule tying reads to the latest completed write, the history contains a value going backwards.`,
      fix: [
        `Measure: find the operations that need the newest value, such as balances and locks, and check which read path they use.`,
        `Serve linearizable reads from the leader after a leadership check, or from a quorum with a write-back step, or via the consensus log. Keep plain follower reads for data where a stale answer is acceptable.`,
        `Verify: write a value, then read it through each read path and check the answer is never older.`
      ]
    },
    {
      t: 'A deposed leader keeps answering reads',
      sym: 'The old leader returns a value that the new leader already overwrote',
      ctx: `During a network partition the old leader keeps serving reads from its local state. The rest of the cluster has elected a new leader and accepted newer writes. Clients on the old side read values that were already overwritten.`,
      why: `Being the leader is a belief held by one node. The old leader never learned it was replaced, and it had no majority check before answering.`,
      fix: [
        `Measure: check whether the leader asks a majority before it answers a read.`,
        `Confirm leadership with a majority (read index, or a lease that the leader's clock bounds) before answering any linearizable read. A node that cannot reach a majority refuses reads.`
      ]
    },
    {
      t: 'Uniqueness checked by reading, then inserting',
      sym: 'Two accounts are created with the same username',
      ctx: `Two users register the same username within the same second. Each request first checks that the name is free on a replica, and both checks pass before either insert becomes visible. Both accounts are created.`,
      why: `A read followed by a write is not atomic. Between the check and the insert, another request can claim the same name, and a non-linearizable check cannot see that claim.`,
      fix: [
        `Measure: find each check-then-insert in the code path, and check which replica the check reads from.`,
        `Enforce uniqueness at the place of the write: a unique constraint on the leader, or a single compare-and-set on the name. Do not rely on a read followed by a write.`
      ]
    },
    {
      t: 'A quorum read returns a value that a later read cannot see',
      sym: 'Reader A sees v2, then reader B sees v1',
      ctx: `A key-value store with N = 3, quorum reads (R = 2) and quorum writes (W = 2). During a write, one reader sees the new value and a later reader, who reads a different pair of replicas, sees the old one.`,
      why: `The write had reached only one replica when the first read happened. The first read returned the new value from that replica without making sure a majority held it, so the next read could pick two replicas that both still had the old value.`,
      fix: [
        `Measure: check whether a quorum read returns a value that fewer than a majority hold.`,
        `Read repair before returning: after reading a value from a quorum, write it back to the replicas that had an older one, and only then return it. The next quorum read then overlaps a majority that holds the value.`
      ]
    }
  ],
  source: { label: 'Original: Linearizability', href: '01-distributed-systems-end-to-end.html#ch8' },
  scenarios: [
    {
      id: 'balance',
      label: 'Balance goes back',
      desc: 'The transfer completes on the leader. The phone reads a follower that has it, and the laptop reads a follower that does not (illustrative values).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'transfer: balance = 1200 on the leader',
          'replicate 1200 to follower 1',
          'phone reads follower 1: 1200',
          'laptop reads follower 2 (not replicated yet)',
          'follower 2 answers 1000'
        ],
        fix: [
          'transfer: balance = 1200, on leader and a majority',
          'phone: read from the leader',
          'leader: asks a majority, still leader? yes',
          'leader answers: balance 1200',
          'laptop: follower read, not linearizable',
          'laptop: the app must pick the read path per operation'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'L', x: 10, y: 115, w: 150, h: 60, t: 'Leader', s: 'balance: 1200' },
          { id: 'F1', x: 250, y: 20, w: 160, h: 60, t: 'Follower 1', s: 'balance: 1200' },
          { id: 'F2', x: 250, y: 210, w: 160, h: 60, t: 'Follower 2', s: 'balance: 1000' },
          { id: 'P', x: 470, y: 20, w: 150, h: 60, t: 'Phone', s: 'saw 1200' },
          { id: 'LT', x: 470, y: 210, w: 150, h: 60, t: 'Laptop', s: 'saw 1000' }
        ],
        edges: [
          { id: 'e1', a: 'L', b: 'F1', label: 'replicate 1200' },
          { id: 'e2', a: 'P', b: 'F1', label: 'read' },
          { id: 'e3', a: 'LT', b: 'F2', label: 'read, later' },
          { id: 'e4', a: 'F2', b: 'LT', label: 'balance 1000' },
          { id: 'e5', a: 'L', b: 'P', label: 'read from leader' }
        ]
      },
      bug: [
        { log: 'The transfer writes 1200 to the leader. The write is complete at this point.', code: 0, hl: { nodes: { L: 'on' } }, stats: [{ l: 'leader balance', v: '1200', cls: 'ok' }] },
        { log: 'Follower 1 receives the new value quickly.', code: 1, hl: { nodes: { F1: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'follower 1', v: '1200', cls: 'ok' }] },
        { log: 'The phone reads from follower 1 and sees 1200. The read starts after the write finished.', code: 2, hl: { nodes: { P: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'phone saw', v: '1200', cls: 'ok' }] },
        { log: 'A later read from the laptop goes to follower 2, which has not received the write yet.', code: 3, hl: { nodes: { LT: 'warn', F2: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'follower 2', v: 'behind', cls: 'warn' }] },
        { log: 'The answer is 1000. The history shows 1200 then 1000, which no single copy of the balance ever had.', code: 4, hl: { nodes: { LT: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'laptop saw', v: '1000 after 1200', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The write completes on the leader and on a majority, so the new value is durable.', code: 1, hl: { nodes: { L: 'ok' } }, stats: [{ l: 'write', v: 'on a majority', cls: 'ok' }] },
        { log: 'The phone reads from the leader, not from the nearest replica.', code: 1, hl: { nodes: { P: 'ok' }, edges: { e5: 'ok' } }, stats: [{ l: 'phone read path', v: 'leader', cls: 'ok' }] },
        { log: 'Before answering, the leader asks a majority whether it is still the leader. A majority confirms.', code: 2, hl: { nodes: { L: 'ok' } }, stats: [{ l: 'leadership check', v: 'majority yes', cls: 'ok' }] },
        { log: 'The answer is 1200, the newest value.', code: 3, hl: { nodes: { P: 'ok' }, edges: { e5: 'ok' } }, stats: [{ l: 'phone saw', v: '1200', cls: 'ok' }] },
        { log: 'A later read from the laptop uses a follower, and follower reads are not linearizable.', code: 4, hl: { nodes: { LT: 'warn' }, edges: { e3: 'on' } }, stats: [{ l: 'laptop read path', v: 'follower', cls: 'warn' }] },
        { log: 'The application must choose the read path per operation, not once for the whole deployment.', code: 5, hl: { nodes: { LT: 'warn' } }, stats: [{ l: 'read path', v: 'chosen per operation', cls: 'warn' }] }
      ]
    },
    {
      id: 'deposed',
      label: 'Old leader answers',
      desc: 'A partition cuts the old leader off. The majority elects a new leader and writes value 2. Without a majority check, the old leader still answers value 1 (illustrative values).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'partition: old leader cut off from majority',
          'majority: new leader, write value 2',
          'client: read value on the old side',
          'old leader: answers 1 from local state, no check'
        ],
        fix: [
          'partition: old leader cut off',
          'client: read value from the old leader',
          'old leader: ask majority, still leader?',
          'no majority reply: refuse the read',
          'client: retry on the new leader, sees 2'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'O', x: 10, y: 115, w: 150, h: 60, t: 'Old leader', s: 'value: 1' },
          { id: 'M', x: 250, y: 20, w: 150, h: 60, t: 'Majority', s: 'elected new leader' },
          { id: 'N', x: 470, y: 115, w: 150, h: 60, t: 'New leader', s: 'value: 2' },
          { id: 'C', x: 250, y: 210, w: 150, h: 60, t: 'Client', s: 'reads value' }
        ],
        edges: [
          { id: 'e1', a: 'C', b: 'O', label: 'read value' },
          { id: 'e2', a: 'O', b: 'C', label: 'value: 1' },
          { id: 'e3', a: 'O', b: 'M', label: 'cut off' },
          { id: 'e4', a: 'M', b: 'N', label: 'elects leader' },
          { id: 'e5', a: 'C', b: 'N', label: 'retry' }
        ]
      },
      bug: [
        { log: 'The network partitions the old leader from the cluster. It cannot reach the other nodes.', code: 0, hl: { nodes: { O: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'old leader reaches majority', v: 'no', cls: 'bad' }] },
        { log: 'The majority elects a new leader, which accepts value 2.', code: 1, hl: { nodes: { M: 'ok', N: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'value', v: '2 (new leader)', cls: 'ok' }] },
        { log: 'A client on the old side reads from the old leader.', code: 2, hl: { nodes: { C: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'read goes to', v: 'old leader', cls: 'warn' }] },
        { log: 'The old leader answers from its own state without asking anyone. The answer is 1, which was already overwritten.', code: 3, hl: { nodes: { O: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'client saw', v: '1 (stale)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The old leader is isolated again, and it cannot reach a majority.', code: 0, hl: { nodes: { O: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'old leader reaches majority', v: 'no', cls: 'bad' }] },
        { log: 'The client asks the old leader for the value.', code: 1, hl: { nodes: { C: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'read goes to', v: 'old leader', cls: 'warn' }] },
        { log: 'Before answering, the leader asks the other nodes whether it is still their leader.', code: 2, hl: { nodes: { O: 'warn' } }, stats: [{ l: 'leadership check', v: 'sent', cls: 'warn' }] },
        { log: 'No majority answers. The old leader refuses the read instead of returning stale data.', code: 3, hl: { nodes: { O: 'ok' } }, stats: [{ l: 'old leader answer', v: 'refused', cls: 'ok' }] },
        { log: 'The client retries against the new leader, and it sees 2.', code: 4, hl: { nodes: { N: 'ok' }, edges: { e5: 'ok' } }, stats: [{ l: 'client saw', v: '2', cls: 'ok' }] }
      ]
    },
    {
      id: 'unique',
      label: 'Check, then insert',
      desc: 'Two users claim the same name. Each checks a follower, sees it free, and inserts. Without a unique constraint on the leader, both inserts succeed (illustrative).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'user 1: is ann free? follower says free',
          'user 2: is ann free? follower says free',
          'user 1: insert ann, leader accepts',
          'user 2: insert ann, no unique constraint, accepts'
        ],
        fix: [
          'user 1: insert ann (unique), accepted',
          'user 2: insert ann (unique), arrives second',
          'leader: rejected, name taken'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'U1', x: 10, y: 20, w: 150, h: 60, t: 'User 1', s: 'name: ann' },
          { id: 'U2', x: 10, y: 210, w: 150, h: 60, t: 'User 2', s: 'name: ann' },
          { id: 'F', x: 250, y: 115, w: 150, h: 60, t: 'Follower', s: 'ann: free' },
          { id: 'L', x: 470, y: 115, w: 150, h: 60, t: 'Leader', s: 'unique(name)' }
        ],
        edges: [
          { id: 'e1', a: 'U1', b: 'F', label: 'is ann free?' },
          { id: 'e2', a: 'U2', b: 'F', label: 'is ann free?' },
          { id: 'e3', a: 'U1', b: 'L', label: 'insert ann' },
          { id: 'e4', a: 'U2', b: 'L', label: 'insert ann' }
        ]
      },
      bug: [
        { log: 'User 1 checks the name on a follower. It is free.', code: 0, hl: { nodes: { U1: 'on', F: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'follower says', v: 'free', cls: 'warn' }] },
        { log: 'User 2 checks at the same moment. The follower still says free.', code: 1, hl: { nodes: { U2: 'on' }, edges: { e2: 'on' } }, stats: [{ l: 'follower says', v: 'free', cls: 'warn' }] },
        { log: 'User 1 insert reaches the leader first and succeeds.', code: 2, hl: { nodes: { L: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'accounts named ann', v: '1', cls: 'ok' }] },
        { log: 'The leader has no unique constraint, so user 2 insert also succeeds. Two accounts now claim one name.', code: 3, hl: { nodes: { L: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'accounts named ann', v: '2', cls: 'bad' }] }
      ],
      fix: [
        { log: 'User 1 insert is the first, and the leader accepts it.', code: 0, hl: { nodes: { U1: 'ok', L: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'accounts named ann', v: '1', cls: 'ok' }] },
        { log: 'User 2 insert arrives second.', code: 1, hl: { nodes: { U2: 'warn' }, edges: { e4: 'on' } }, stats: [{ l: 'order', v: 'second', cls: 'warn' }] },
        { log: 'The leader refuses the second insert atomically. User 2 is told to choose another name.', code: 2, hl: { nodes: { U2: 'ok', L: 'ok' }, edges: { e4: 'bad' } }, stats: [{ l: 'accounts named ann', v: '1', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Agreeing on a leader: consensus',
  problem: `A configuration service runs on five nodes and decides which application server owns each shard. The leader's host freezes, and the link between two racks fails at the same time (illustrative). Two nodes on one side still see the old leader and accept "shard 7 moves to server B". Three nodes on the other side elect a new leader and assign shard 7 to server C. The cluster must end with one history.`,
  predict: {
    q: `The side with two nodes cannot reach three nodes. Its old leader accepts shard 7 -> B and confirms it at once. What should happen to that confirmation?`,
    opts: [
      `It stands, because the old leader already wrote the entry and confirmed it`,
      `It must not stand, because an entry is committed only when a majority stores it, and two nodes are not a majority of five`,
      `It stands only if the three-node side later agrees with it`
    ],
    ans: 1,
    why: `A majority of five is three. The minority leader cannot gather three copies, so it cannot commit. Its confirmation was premature, and the entry may be overwritten.`
  },
  explain: `
<h3>The idea</h3>
<p>Consensus lets a group of nodes agree on one value, such as who the leader is, and on one order of log entries, even when messages are lost and some nodes are cut off. Any two majorities of five nodes share at least one node, and that shared node remembers the earlier decision. Almost every guarantee comes from this counting fact.</p>
<h3>How it works, step by step</h3>
<p>1. Each election starts a new <b>term</b>, a number that only goes up. Every message carries its sender's term. A node that sees a higher term steps down at once.</p>
<p>2. A follower that hears no heartbeat for its election timeout becomes a candidate, raises the term, and votes for itself. Random timeouts make a split vote unlikely. A node votes at most once per term.</p>
<p>3. The <b>up-to-date rule</b>: a node votes only for a candidate whose log is at least as current as its own. The log is compared first by the term of its last entry, then by its length. A stale node therefore cannot win and roll back entries the cluster already committed.</p>
<p>4. The <b>commit rule</b>: the leader counts how many nodes store each entry. When a majority stores an entry from its own term, the entry is committed and the client is confirmed. Followers learn the commit from the next heartbeat.</p>
<h3>The trade-off</h3>
<p>Writes wait for a majority, so a slow majority slows every write, and a leader change takes at least one election timeout. A minority cannot make progress, which is the right behaviour, but clients must treat an unconfirmed write as unknown, not as saved. Consensus is also expensive per byte, so keep only small metadata in it, such as locks, leader records and shard maps.</p>
`,
  diagnose: [
    {
      t: 'Even-sized clusters and split halves',
      sym: 'A four-node cluster stops accepting writes after a 2 and 2 split',
      ctx: `A team runs four nodes across two data centres, reasoning that the extra node adds fault tolerance. The network splits two and two, and no side has a majority, so the whole cluster stops accepting changes.`,
      why: `A majority of four is three. Four nodes survive one failure, exactly like three nodes, but they add the cost of a fourth machine and a split that stops everyone.`,
      fix: [
        `Measure: count the voting nodes and the majority needed, and check how the nodes are split across data centres.`,
        `Use odd sizes (three or five). With five nodes placed 3 and 2, the three-node side keeps its leader through a split, and the two-node side refuses writes.`,
        `Verify: cut the link between the sites in a test and check that the larger side keeps accepting writes.`
      ]
    },
    {
      t: 'A stale node wins the election',
      sym: 'A rejoining node with an old log wins, and committed entries roll back',
      ctx: `A node that was down for a while rejoins with an old log and asks for votes. Without the up-to-date rule in the vote, it could be elected and roll back entries that the cluster had already committed.`,
      why: `The vote must check that the candidate has every committed entry the voter knows about. Checking only the term, or only the length, lets a short but stale log win.`,
      fix: [
        `Measure: check the last entry's term and index in each vote request and reply.`,
        `Implement the log comparison in the vote: last entry's term first, then length. A voter refuses any candidate whose log is older than its own.`
      ]
    },
    {
      t: 'A minority leader confirms writes that will be undone',
      sym: 'A client was confirmed for a write that was later overwritten',
      ctx: `A leader is partitioned with one follower out of five nodes. It keeps accepting writes and confirms them to clients, because its own log has them. When the partition heals, the majority's history replaces those entries.`,
      why: `The confirmation was sent before a majority stored the entry. The leader could not know that it had lost its majority, and a leader that confirms on its own write is not a consensus leader.`,
      fix: [
        `Measure: compare the entries each client was confirmed for with the entries that survive after the partition heals.`,
        `Confirm a write only after a majority has stored it. A leader in the minority cannot reach that point, so its clients see a timeout or an error, not a false success, and they retry against the new leader.`
      ]
    },
    {
      t: 'A consensus log used as a bulk data store',
      sym: 'Every coordination operation slows down after a 2 MB write',
      ctx: `A team stores 2 MB documents directly in the consensus log of a coordination service. Every write is copied to a majority across a wide-area link, and write latency reaches seconds, which slows every other coordination operation sharing the cluster.`,
      why: `Consensus cost is paid per entry and per byte copied to a majority. A large value multiplies that cost, and the same log also carries the small, critical metadata that must stay fast.`,
      fix: [
        `Measure: check the size of the entries written to the consensus log and the commit latency for each.`,
        `Keep only small metadata in the consensus cluster: locks, leader records, shard maps. Store the bulk data in a replicated store, and put a pointer (or a checksum) into the consensus log.`
      ]
    }
  ],
  source: { label: 'Original: Agreeing on a leader: consensus', href: '01-distributed-systems-end-to-end.html#ch9' },
  scenarios: [
    {
      id: 'evensplit',
      label: 'Even split stalls',
      desc: 'Four nodes split two and two. Neither side reaches the majority of three, so the cluster stops. Five nodes placed 3 and 2 keep a leader (illustrative).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'link fails: split 2 | 2',
          'vote me leader: 2 of 4, no majority',
          'write shard 7 -> B: refused, no leader',
          'whole cluster down, 4 machines healthy'
        ],
        fix: [
          'link fails: split 3 | 2 (five nodes)',
          'three-node side: votes 3 of 5, keeps leader A1',
          'write shard 7 -> B: committed by 3 nodes',
          'two-node side: refuses writes'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'DA', x: 10, y: 60, w: 200, h: 120, t: 'Data centre A', s: '2 nodes, votes 2 of 4' },
          { id: 'DB', x: 430, y: 60, w: 200, h: 120, t: 'Data centre B', s: '2 nodes, votes 2 of 4' },
          { id: 'C', x: 220, y: 215, w: 200, h: 60, t: 'Clients', s: 'writes: refused' }
        ],
        edges: [
          { id: 'e1', a: 'DA', b: 'DB', label: 'vote me leader' },
          { id: 'e2', a: 'C', b: 'DA', label: 'write shard 7 -> B' },
          { id: 'e3', a: 'C', b: 'DB', label: 'write' }
        ]
      },
      bug: [
        { log: 'The link between the data centres goes down. Each side has two nodes, and a majority of four needs three.', code: 0, hl: { nodes: { DA: 'warn', DB: 'warn' }, edges: { e1: 'bad' } }, stats: [{ l: 'link', v: 'down', cls: 'bad' }] },
        { log: 'Each side asks for votes, but each can gather only its own two votes.', code: 1, hl: { edges: { e1: 'bad' } }, stats: [{ l: 'votes per side', v: '2 of 4', cls: 'bad' }] },
        { log: 'A client writes to either side. The write is refused, because no leader exists.', code: 2, hl: { nodes: { C: 'warn' }, edges: { e2: 'bad' } }, stats: [{ l: 'writes', v: 'refused', cls: 'bad' }] },
        { log: 'The cluster stops, although four healthy machines are running.', code: 3, hl: { nodes: { C: 'bad', DA: 'bad', DB: 'bad' } }, stats: [{ l: 'healthy machines', v: '4', cls: 'warn' }] }
      ],
      fix: [
        { log: 'The same failure, but this cluster has five nodes. This time the sides are three and two.', code: 0, hl: { nodes: { DA: 'ok', DB: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'split', v: '3 | 2', cls: 'warn' }] },
        { log: 'The three-node side has a majority, so its leader keeps going.', code: 1, hl: { nodes: { DA: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'votes', v: '3 of 5', cls: 'ok' }] },
        { log: 'Writes on side A are committed by three nodes, which is a majority.', code: 2, hl: { nodes: { DA: 'ok', C: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'committed by', v: '3 of 5', cls: 'ok' }] },
        { log: 'The two-node side cannot commit anything, so it refuses writes instead of accepting them silently.', code: 3, hl: { nodes: { DB: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'two-node side', v: 'refuses writes', cls: 'ok' }] }
      ]
    },
    {
      id: 'stale',
      label: 'Old log, no check',
      desc: 'Node S was offline and has an old log. Without the up-to-date rule, X and Y vote for it, and the committed entries 6 and 7 are lost (illustrative terms).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'S: vote for me, term 4 (no log check)',
          'Y: votes for S too',
          'S becomes leader with log 1..5',
          'leader replicates: X drops entries 6 and 7'
        ],
        fix: [
          'S: vote for me, term 4, last entry 5 at term 3',
          'X: refused, my last entry is 7 at term 3',
          'Y: refused, same reason',
          'X: vote for me, term 5, last 7 at term 3 -> leader'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'S', x: 10, y: 115, w: 150, h: 60, t: 'Node S', s: 'old log: 1..5' },
          { id: 'X', x: 250, y: 20, w: 170, h: 60, t: 'Node X', s: 'log 1..7, committed' },
          { id: 'Y', x: 250, y: 210, w: 170, h: 60, t: 'Node Y', s: 'log 1..7, committed' }
        ],
        edges: [
          { id: 'e1', a: 'S', b: 'X', label: 'vote, term 4' },
          { id: 'e2', a: 'S', b: 'Y', label: 'vote, term 4' },
          { id: 'e3', a: 'X', b: 'S', label: 'refused' },
          { id: 'e4', a: 'Y', b: 'S', label: 'refused' },
          { id: 'e5', a: 'X', b: 'Y', label: 'vote, term 5' }
        ]
      },
      bug: [
        { log: 'Node S starts an election in term 4. Its log ends at entry 5, and the voter does not compare logs.', code: 0, hl: { nodes: { S: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'S last entry', v: '5', cls: 'warn' }] },
        { log: 'Node Y also grants its vote, so S has two votes out of three and becomes leader.', code: 1, hl: { nodes: { Y: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'votes for S', v: '2 of 3', cls: 'bad' }] },
        { log: 'The new leader log does not contain entries 6 and 7, which were committed.', code: 2, hl: { nodes: { S: 'bad' } }, stats: [{ l: 'leader log', v: '1..5', cls: 'bad' }] },
        { log: 'The leader replicates its log, and X overwrites entries 6 and 7. Committed entries are gone.', code: 3, hl: { nodes: { X: 'bad' } }, stats: [{ l: 'committed entries', v: '6, 7 lost', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Node S asks for a vote and reports its last entry: index 5, from term 3.', code: 0, hl: { nodes: { S: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'S last entry', v: 'index 5, term 3', cls: 'warn' }] },
        { log: 'Node X compares logs. Its last entry is index 7, so S is not up to date, and X refuses.', code: 1, hl: { nodes: { X: 'ok' }, edges: { e3: 'bad' } }, stats: [{ l: 'vote from X', v: 'refused', cls: 'ok' }] },
        { log: 'Node Y refuses for the same reason. S cannot reach a majority.', code: 2, hl: { nodes: { Y: 'ok' }, edges: { e4: 'bad' } }, stats: [{ l: 'votes for S', v: '0 of 3', cls: 'ok' }] },
        { log: 'Node X, which holds the committed entries, stands in a later term and collects a majority. Entry 7 survives.', code: 3, hl: { nodes: { X: 'ok', Y: 'ok' }, edges: { e5: 'ok' } }, stats: [{ l: 'entry 7', v: 'survives', cls: 'ok' }] }
      ]
    },
    {
      id: 'minority',
      label: 'Early confirm, undone',
      desc: 'The old leader sees only two of five nodes. It confirms a write with its own copy, then the majority overwrites it when the partition heals (illustrative).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'partition: old leader sees 2 of 5 nodes',
          'client: write shard 8 -> A to old leader',
          'old leader: stores locally, replies OK',
          'majority: new leader in term 3, shard 8 -> C',
          'heal: term 3 seen, shard 8 -> A removed'
        ],
        fix: [
          'partition: old leader sees 2 of 5 nodes',
          'client: write shard 8 -> A',
          'old leader: stored, not committed (2 of 5)',
          'client: timeout, unknown, will retry',
          'new leader: commits with 3 nodes'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'C', x: 10, y: 20, w: 150, h: 60, t: 'Client', s: 'confirmed: none' },
          { id: 'L', x: 250, y: 115, w: 150, h: 60, t: 'Old leader', s: 'minority, term 2' },
          { id: 'N', x: 470, y: 115, w: 150, h: 60, t: 'New leader', s: 'majority, term 3' }
        ],
        edges: [
          { id: 'e1', a: 'C', b: 'L', label: 'write shard 8' },
          { id: 'e2', a: 'L', b: 'C', label: 'OK, committed' },
          { id: 'e3', a: 'N', b: 'L', label: 'term 3 overwrites' },
          { id: 'e4', a: 'C', b: 'N', label: 'retry' }
        ]
      },
      bug: [
        { log: 'The old leader can reach only one follower, so it sees two of five nodes.', code: 0, hl: { nodes: { L: 'warn' } }, stats: [{ l: 'nodes reachable', v: '2 of 5', cls: 'warn' }] },
        { log: 'A client writes shard 8 to the old leader, which still believes it leads.', code: 1, hl: { nodes: { C: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'leader believes', v: 'it leads', cls: 'warn' }] },
        { log: 'The old leader stores the entry locally and confirms it, without waiting for a majority.', code: 2, hl: { nodes: { L: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'client saw', v: 'OK, saved', cls: 'bad' }] },
        { log: 'The majority side elects a new leader in term 3, which accepts a different write for shard 8.', code: 3, hl: { nodes: { N: 'ok' }, edges: { e3: 'on' } }, stats: [{ l: 'term', v: '3', cls: 'ok' }] },
        { log: 'When the partition heals, the old leader sees term 3 and steps down. Its confirmed write is overwritten.', code: 4, hl: { nodes: { L: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'confirmed write', v: 'overwritten', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The partition is the same. The old leader can reach only two of five nodes.', code: 0, hl: { nodes: { L: 'warn' } }, stats: [{ l: 'nodes reachable', v: '2 of 5', cls: 'warn' }] },
        { log: 'The client writes shard 8 to the old leader.', code: 1, hl: { nodes: { C: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'write', v: 'sent', cls: 'warn' }] },
        { log: 'The entry is stored locally, but it is not committed. Only two of five nodes have it.', code: 2, hl: { nodes: { L: 'warn' } }, stats: [{ l: 'copies', v: '2 of 5', cls: 'warn' }] },
        { log: 'The client gets no confirmation. Its request is unknown, not saved, and it will retry.', code: 3, hl: { nodes: { C: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'client', v: 'no confirmation, retries', cls: 'ok' }] },
        { log: 'The client retries on the new leader, which commits the write with three nodes. Nothing confirmed is undone.', code: 4, hl: { nodes: { N: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'copies', v: '3 of 5, committed', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Atomic commit: two-phase commit',
  problem: `A payments service moves 100 from account A (shard 1) to account B (shard 2). It calls shard 1 to debit, then shard 2 to credit, and works in every test. In production, shard 2 times out during the second call, and the service retries the whole request. Account A is debited twice, or account B never gets the money, depending on which retry runs (illustrative).`,
  predict: {
    q: `Both shards voted yes, then the coordinator crashed before it wrote its decision. The shards cannot ask anyone else. What should they do?`,
    opts: [
      `Commit, because both voted yes`,
      `Abort on their own, because nobody is coordinating`,
      `Wait with their locks held until the coordinator recovers and reads its decision log`
    ],
    ans: 2,
    why: `After a yes vote a shard has promised to follow the coordinator's decision. It cannot commit or abort alone, because the coordinator may already have decided either way.`
  },
  explain: `
<h3>The idea</h3>
<p>A transfer touches two databases, so a crash between the two writes leaves money in one account and not the other. <b>Two-phase commit</b> (2PC) makes the transfer all-or-nothing by splitting it into a vote and a decision, with a coordinator that writes the decision to its own log.</p>
<h3>How it works, step by step</h3>
<p>1. <b>Prepare.</b> Each participant does its part, takes locks, writes a prepare record, and votes yes or no.</p>
<p>2. <b>Decide.</b> The coordinator writes COMMIT or ABORT to its decision log first. Only then does it tell every participant.</p>
<p>3. <b>In doubt.</b> A participant that voted yes must wait for the decision. It holds its locks. If the coordinator dies, the shard cannot decide alone.</p>
<p>4. <b>Recovery.</b> A restarted coordinator reads its log. If it finds COMMIT, it resends commit. If it finds nothing, it can abort safely, because no commit was ever sent (the presumed-abort rule).</p>
<h3>The trade-off</h3>
<p>2PC is atomic, but it blocks. While a shard is in doubt, the rows it locked stay locked, and other transactions on the same accounts wait. This is a choice of consistency over availability for transactions that span participants. Keep cross-service transactions rare, and where the business allows, use sagas with compensating actions instead. A coordinator that logs its decision before it sends it is what makes recovery possible at all.</p>
`,
  diagnose: [
    {
      t: 'Naive dual writes lose money',
      sym: 'A debit with no matching credit, found days later',
      ctx: `A service debits one database and then credits another in two separate calls. A crash or timeout between them leaves the debit with no matching credit, and the reconciliation job finds the gap days later.`,
      why: `Nothing records that the two writes belong to one transfer, so no later step can finish or undo the first one.`,
      fix: [
        `Measure: list every operation that writes to two systems in sequence, and check whether it records an ID first.`,
        `Give the transfer one ID, record the intent durably before the first write, and make each step idempotent. Or use a single database transaction when both accounts live in one place.`
      ]
    },
    {
      t: 'Participants stuck holding locks',
      sym: 'Other requests on the same accounts time out',
      ctx: `The coordinator process is killed after all participants voted yes. Every row touched by the transfer stays locked, and other requests on the same accounts time out for as long as the coordinator is down.`,
      why: `A prepared participant cannot decide alone. The locks protect a decision that only the coordinator can make.`,
      fix: [
        `Measure: monitor how long each transaction stays prepared.`,
        `Have the coordinator's decision log replicated and recoverable, add a recovery process that resolves in-doubt transactions, and alarm when a transaction stays prepared too long.`
      ]
    },
    {
      t: 'Recovery that aborts a committed transfer',
      sym: 'Two sides disagree after the coordinator restarts',
      ctx: `A coordinator restarts without its decision log, finds no record of the transfer, and aborts. A participant that had already committed on the coordinator's earlier message keeps the change, so the two sides disagree.`,
      why: `The presumed-abort rule is only safe if a commit decision is written to durable storage before any commit message is sent.`,
      fix: [
        `Measure: check whether the coordinator writes COMMIT to its log before it sends any commit message.`,
        `Force the decision to the log before sending COMMIT, and make the recovery path read that log rather than assuming an absent record means abort after a crash mid-commit.`
      ]
    },
    {
      t: 'Assuming 2PC gives availability',
      sym: 'Transactions block while one service is down',
      ctx: `A team puts a global transaction across three services and expects it to keep working when one service is down. Every transaction that touches the down service blocks until it returns, which the team did not expect.`,
      why: `2PC is atomic and blocking: it chooses consistency over availability for the transactions that span participants.`,
      fix: [
        `Measure: list the transactions that span more than one service, and the services each one needs.`,
        `Keep cross-service transactions rare, design them as sagas with compensating actions where the business allows it, and state clearly which operations block.`
      ]
    }
  ],
  source: { label: 'Original: Atomic commit: two-phase commit', href: '01-distributed-systems-end-to-end.html#ch10' },
  scenarios: [
    {
      id: 'coordcrash',
      label: 'Coordinator crashes',
      desc: 'Both shards vote yes, then the coordinator crashes before it writes its decision. The shards hold their locks until it recovers (illustrative).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'prepare: debit A on shard 1, credit B on shard 2',
          'shard 1: yes, shard 2: yes (both locked)',
          'coordinator: crashes before writing COMMIT',
          'shard 1 and shard 2: in doubt, cannot decide alone',
          'accounts A and B stay locked until recovery'
        ],
        fix: [
          'coordinator restarts and reads its decision log',
          'log has COMMIT: resend commit to both shards',
          'log is empty: presumed abort, nothing was sent',
          'locks released, transfer is all-or-nothing'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'CO', x: 10, y: 115, w: 150, h: 60, t: 'Coordinator', s: 'runs the transfer' },
          { id: 'P1', x: 250, y: 20, w: 170, h: 60, t: 'Shard 1 (debit A)', s: 'prepared, locked' },
          { id: 'P2', x: 250, y: 210, w: 170, h: 60, t: 'Shard 2 (credit B)', s: 'prepared, locked' },
          { id: 'LOG', x: 470, y: 115, w: 160, h: 60, t: 'Decision log', s: 'COMMIT or nothing' }
        ],
        edges: [
          { id: 'e1', a: 'CO', b: 'P1', label: 'prepare' },
          { id: 'e2', a: 'CO', b: 'P2', label: 'prepare' },
          { id: 'e3', a: 'P1', b: 'CO', label: 'vote yes' },
          { id: 'e4', a: 'P2', b: 'CO', label: 'vote yes' },
          { id: 'e5', a: 'CO', b: 'LOG', label: 'write decision' }
        ]
      },
      bug: [
        { log: 'Both shards prepare. Each does its part, locks its rows, and votes yes.', code: 0, hl: { nodes: { CO: 'on', P1: 'warn', P2: 'warn' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'locks held', v: 'both shards', cls: 'warn' }] },
        { log: 'Both votes arrive: yes and yes. The coordinator is about to write its decision.', code: 1, hl: { edges: { e3: 'ok', e4: 'ok' } }, stats: [{ l: 'votes', v: 'yes, yes', cls: 'ok' }] },
        { log: 'The coordinator crashes before it writes COMMIT to its decision log.', code: 2, hl: { nodes: { CO: 'bad', LOG: 'warn' }, edges: { e5: 'dim' } }, stats: [{ l: 'decision', v: 'none written', cls: 'bad' }] },
        { log: 'Both shards are in doubt. They promised yes, so they cannot abort alone, and they cannot commit alone.', code: 3, hl: { nodes: { P1: 'warn', P2: 'warn' } }, stats: [{ l: 'state', v: 'in doubt', cls: 'bad' }] },
        { log: 'The locks stay held. Other transactions on accounts A and B wait until the coordinator returns.', code: 4, hl: { nodes: { P1: 'bad', P2: 'bad' } }, stats: [{ l: 'locks', v: 'held, others wait', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The coordinator restarts and reads its own decision log.', code: 0, hl: { nodes: { CO: 'ok', LOG: 'ok' } }, stats: [{ l: 'decision log', v: 'read', cls: 'ok' }] },
        { log: 'The log is empty, so no commit was ever sent. Under presumed abort, the coordinator tells both shards to abort.', code: 2, hl: { nodes: { P1: 'ok', P2: 'ok' } }, stats: [{ l: 'decision', v: 'abort', cls: 'ok' }] },
        { log: 'Both shards release their locks. The transfer is all-or-nothing, so neither account changed.', code: 3, hl: { nodes: { P1: 'ok', P2: 'ok' } }, stats: [{ l: 'locks', v: 'released', cls: 'ok' }, { l: 'balances', v: 'unchanged', cls: 'ok' }] }
      ]
    },
    {
      id: 'dualwrite',
      label: 'Two writes, no record',
      desc: 'The service debits shard 1 and credits shard 2 in two calls. The credit times out, a retry runs the debit again, and nothing links the writes (illustrative balances).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'shard 1: debit A 100 (500 -> 400)',
          'shard 2: credit B 100 (timeout)',
          'service: retry the whole request',
          'shard 1: debit A 100 again (400 -> 300)',
          'no transfer ID recorded, nothing can undo it',
          'reconciliation: gap found days later'
        ],
        fix: [
          'record transfer 7731 (intent) before any write',
          'shard 1: debit A 100, id 7731',
          'shard 2: credit B 100, id 7731 (retry is a no-op)',
          'reconciliation: pending transfers only'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'S', x: 10, y: 115, w: 150, h: 60, t: 'Transfer service', s: 'debit, then credit' },
          { id: 'D1', x: 250, y: 20, w: 170, h: 60, t: 'Shard 1: debit A', s: 'A: 500 -> 400' },
          { id: 'D2', x: 250, y: 210, w: 170, h: 60, t: 'Shard 2: credit B', s: 'B: 200 (no credit)' },
          { id: 'R', x: 470, y: 115, w: 150, h: 60, t: 'Reconciliation', s: 'finds the gap later' }
        ],
        edges: [
          { id: 'e1', a: 'S', b: 'D1', label: 'debit 100' },
          { id: 'e2', a: 'S', b: 'D2', label: 'credit 100' },
          { id: 'e3', a: 'R', b: 'D2', label: 'compare later' }
        ]
      },
      bug: [
        { log: 'The service debits 100 from account A on shard 1. This call works.', code: 0, hl: { nodes: { S: 'on', D1: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'A', v: '500 -> 400', cls: 'ok' }] },
        { log: 'The credit to account B on shard 2 times out. The service does not know whether it ran.', code: 1, hl: { nodes: { D2: 'warn' }, edges: { e2: 'bad' } }, stats: [{ l: 'B', v: 'unknown', cls: 'warn' }] },
        { log: 'The service retries the whole request. The debit runs again on shard 1.', code: 3, hl: { nodes: { S: 'warn', D1: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'A', v: '400 -> 300 (debited twice)', cls: 'bad' }] },
        { log: 'Nothing recorded that the two writes belong to one transfer, so no later step can finish or undo the first one.', code: 4, hl: { nodes: { S: 'bad' } }, stats: [{ l: 'transfer ID', v: 'none', cls: 'bad' }] },
        { log: 'Days later the reconciliation job finds the gap between the two accounts.', code: 5, hl: { nodes: { R: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'gap found', v: 'days later', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The service records transfer 7731 with its intent before it touches any account.', code: 0, hl: { nodes: { S: 'ok' } }, stats: [{ l: 'transfer 7731', v: 'recorded first', cls: 'ok' }] },
        { log: 'The debit carries the ID. A repeated debit with the same ID changes nothing.', code: 1, hl: { nodes: { D1: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'debits applied', v: 'once', cls: 'ok' }] },
        { log: 'A retry after the timeout finds the ID already applied on shard 2, so the credit is not repeated.', code: 2, hl: { nodes: { D2: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'credit', v: 'applied once', cls: 'ok' }] },
        { log: 'Reconciliation has nothing to find: each transfer is either complete or still pending.', code: 3, hl: { nodes: { R: 'ok' } }, stats: [{ l: 'gap', v: 'none', cls: 'ok' }] }
      ]
    }
  ],
},
{
  title: 'Batch processing: MapReduce',
  problem: `The analytics team counts page views per page for 500 files spread across 50 machines (illustrative). One script takes 9 days. Split across machines, one machine's disk fails halfway, and its partial counts are added to the total anyway. Retried by hand, some pages are counted twice and others are missing from the report.`,
  predict: {
    q: `A map task is retried on another machine after its first attempt half-wrote its output. What must the framework do with the first attempt's output?`,
    opts: [
      `Merge both attempts, because more counts are always better`,
      `Discard the partial output and publish only one successful attempt`,
      `Keep the first attempt's output and skip the retry, because the work is already started`
    ],
    ans: 1,
    why: `Recovery by re-running is only safe when a discarded partial output can never be merged. Only one attempt's result should become visible.`
  },
  explain: `
<h3>The idea</h3>
<p>A batch job reads a large set of files, splits the work into many small tasks, and combines the results. MapReduce fixes the structure so that failures, slow machines and retries are handled by the framework, not by hand.</p>
<h3>How it works, step by step</h3>
<p>1. <b>Map.</b> A map function turns each input record into key-value pairs, such as (page, 1).</p>
<p>2. <b>Shuffle.</b> The framework groups the pairs by key and sends each key to one reducer.</p>
<p>3. <b>Reduce.</b> A reduce function combines the values for each key, for example by summing them.</p>
<p>4. Input and output are immutable. Batch jobs read files and write new files, so a failed task can run again from the same input. A failed map task is simply executed again on another machine.</p>
<p>5. Stragglers are handled by backup copies. The job waits for its slowest task, so the framework starts a second copy of the last tasks still running and uses whichever finishes first.</p>
<h3>The trade-off</h3>
<p>Re-running is safe only if the functions are deterministic and only one attempt's output is kept. The framework, not the job author, is responsible for choosing which attempt wins. Skew is the weak point: the shuffle sends every value of one key to one reducer, so a hot key can make the job wait on one machine. A combiner that pre-aggregates on the map side, or salting the key, reduces that cost.</p>
`,
  diagnose: [
    {
      t: 'One hot key makes one reducer the bottleneck',
      sym: 'One reducer runs for hours while the others finish in minutes',
      note: `Seen in: the MapReduce paper's combiner function`,
      ctx: `A job that counts events per country sends every record for the largest country to a single reducer, which runs for hours while the other reducers finish in minutes. The MapReduce paper's combiner function exists to merge repeated keys on the map side before they cross the network.`,
      why: `Hash partitioning spreads keys, not records. A key with most of the data still lands on one reducer.`,
      fix: [
        `Measure: compare the record count per reducer, not only the number of keys.`,
        `Split the hot key across several reducers (add a random salt to the key, aggregate in two rounds), or use a combiner to pre-aggregate on the map side before the shuffle.`
      ]
    },
    {
      t: 'Non-deterministic mapper output on retry',
      sym: 'Totals differ between runs of the same job',
      ctx: `A map function adds a timestamp to every output record. A retried task produces different values, and when two attempts' outputs are mixed, the totals differ between runs of the same job.`,
      why: `A retry is only harmless when the second run reproduces the first. The framework assumes determinism to keep one attempt's output.`,
      fix: [
        `Measure: run the same map task twice on the same input and diff the outputs.`,
        `Keep map and reduce functions pure, take time and randomness from the job's input (or a seeded source), and commit only the output of one successful attempt.`
      ]
    },
    {
      t: 'Intermediate results written to disk between stages',
      sym: 'Each iteration writes and reads the same intermediate data from disk',
      note: `Seen in: the Spark paper (2012)`,
      ctx: `The Spark paper (2012) motivates its in-memory design by noting that iterative jobs in MapReduce write every intermediate result to the distributed file system, and each iteration reads it back.`,
      why: `Each stage materialises its output for fault tolerance, which costs disk and network time even when nothing fails.`,
      fix: [
        `Measure: time the write and read of intermediate output against the time of the computation.`,
        `Choose how much intermediate state to keep: recompute from lineage where recomputation is cheap, or persist only the expensive stages.`
      ]
    },
    {
      t: 'Counting partial output from a failed attempt',
      sym: 'Totals are wrong after a machine fails, with no error',
      ctx: `A job appends the output of every attempt to the same file. A machine that failed after writing half of its output has its partial records added to the report, so the totals are wrong without any error.`,
      why: `The output was written in place, without a commit step that makes one attempt's result visible.`,
      fix: [
        `Measure: count the records per task in the report and compare them with the input count.`,
        `Write each task's output to a temporary location, and rename it atomically when the task succeeds. Let the framework discard the losers.`
      ]
    }
  ],
  source: { label: 'Original: Batch processing: MapReduce', href: '01-distributed-systems-end-to-end.html#ch11' },
  scenarios: [
    {
      id: 'hotkey',
      label: 'One reducer, hot key',
      desc: 'Most records share one key, so the shuffle sends them all to reducer 1. Salting the key spreads them over several reducers (illustrative counts).',
      codeLabel: 'Job',
      code: {
        bug: [
          'map: emit (US, 1) for each US page view',
          'shuffle: all US pairs go to reducer 1',
          'reducer 1: sums hours of US records',
          'reducer 2: VN finishes in minutes, then idle',
          'job waits for reducer 1 (skew)'
        ],
        fix: [
          'map: emit (US#0..US#3, 1), salted key',
          'combiner: sum repeated keys before the shuffle',
          'shuffle: salted keys spread over reducers',
          'round 2: sum the partial totals per country'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'M1', x: 10, y: 20, w: 140, h: 60, t: 'Map task 1', s: 'emits (US, 1)' },
          { id: 'M2', x: 10, y: 115, w: 140, h: 60, t: 'Map task 2', s: 'emits (US, 1)' },
          { id: 'M3', x: 10, y: 210, w: 140, h: 60, t: 'Map task 3', s: 'emits (VN, 1)' },
          { id: 'SH', x: 250, y: 115, w: 140, h: 60, t: 'Shuffle', s: 'group by key' },
          { id: 'R1', x: 470, y: 20, w: 150, h: 60, t: 'Reducer 1', s: 'key US: most records' },
          { id: 'R2', x: 470, y: 210, w: 150, h: 60, t: 'Reducer 2', s: 'key VN: few records' }
        ],
        edges: [
          { id: 'e1', a: 'M1', b: 'SH', label: 'US' },
          { id: 'e2', a: 'M2', b: 'SH', label: 'US' },
          { id: 'e3', a: 'M3', b: 'SH', label: 'VN' },
          { id: 'e4', a: 'SH', b: 'R1', label: 'all US' },
          { id: 'e5', a: 'SH', b: 'R2', label: 'VN' }
        ]
      },
      bug: [
        { log: 'Map tasks turn each page view into a (country, 1) pair. Most pairs carry the same key, US.', code: 0, hl: { nodes: { M1: 'on', M2: 'on' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'US pairs', v: 'most of the data', cls: 'warn' }] },
        { log: 'The shuffle sends every US pair to one reducer, because hash partitioning spreads keys, not records.', code: 1, hl: { nodes: { SH: 'warn' }, edges: { e4: 'bad' } }, stats: [{ l: 'records to reducer 1', v: 'most', cls: 'bad' }] },
        { log: 'Reducer 1 runs for hours. Reducer 2 finishes VN in minutes and then sits idle.', code: 2, hl: { nodes: { R1: 'bad', R2: 'dim' } }, stats: [{ l: 'reducer 1', v: 'hours (illustrative)', cls: 'bad' }] },
        { log: 'The job cannot end until the hot reducer finishes. One key sets the total time.', code: 4, hl: { nodes: { R1: 'bad' } }, stats: [{ l: 'job time', v: 'set by reducer 1', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The map side adds a salt to the hot key, so one US key becomes several keys.', code: 0, hl: { nodes: { M1: 'ok', M2: 'ok' } }, stats: [{ l: 'hot key', v: 'split into 4 salted keys', cls: 'ok' }] },
        { log: 'A combiner adds up repeated keys on the map side before they cross the network.', code: 1, hl: { nodes: { SH: 'ok' } }, stats: [{ l: 'records shuffled', v: 'far fewer', cls: 'ok' }] },
        { log: 'The shuffle now spreads the salted US keys across reducers, so no single reducer holds them all.', code: 2, hl: { nodes: { R1: 'ok', R2: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'largest reducer load', v: 'about a quarter', cls: 'ok' }] },
        { log: 'A second round sums the partial totals for each country. The answer matches the single-key result.', code: 3, hl: { nodes: { SH: 'ok' } }, stats: [{ l: 'result', v: 'same total', cls: 'ok' }] }
      ]
    },
    {
      id: 'attempts',
      label: 'Failed attempt output',
      desc: 'A task writes straight into the shared report. Its first attempt fails halfway, and the retry adds more records, so the total is wrong (illustrative counts).',
      codeLabel: 'Job',
      code: {
        bug: [
          'attempt 1: append output to the shared report',
          'attempt 1: machine fails, half written',
          'attempt 2: append full output to the same report',
          'report: partial + full, totals wrong'
        ],
        fix: [
          'attempt 1: write to a temporary location',
          'attempt 1: machine fails, temp output ignored',
          'attempt 2: complete temp output',
          'rename temp to final output: one attempt only'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'T1', x: 10, y: 20, w: 170, h: 60, t: 'Task 3, attempt 1', s: 'half written, fails' },
          { id: 'T2', x: 10, y: 200, w: 170, h: 60, t: 'Task 3, attempt 2', s: 'full output' },
          { id: 'OUT', x: 250, y: 115, w: 160, h: 60, t: 'Report file', s: 'counts so far' },
          { id: 'TMP', x: 470, y: 200, w: 150, h: 60, t: 'Temp output', s: 'attempt 2 only' }
        ],
        edges: [
          { id: 'e1', a: 'T1', b: 'OUT', label: 'appends half' },
          { id: 'e2', a: 'T2', b: 'OUT', label: 'appends full' },
          { id: 'e3', a: 'T2', b: 'TMP', label: 'write temp' },
          { id: 'e4', a: 'TMP', b: 'OUT', label: 'rename on success' }
        ]
      },
      bug: [
        { log: 'Task 3, attempt 1, appends its output to the shared report as it writes.', code: 0, hl: { nodes: { T1: 'warn' }, edges: { e1: 'bad' } }, stats: [{ l: 'report records', v: 'half of task 3', cls: 'warn' }] },
        { log: 'The machine fails after half the output is written. Nothing marks that output as failed.', code: 1, hl: { nodes: { T1: 'bad' } }, stats: [{ l: 'attempt 1 output', v: 'still in report', cls: 'bad' }] },
        { log: 'The framework retries the task. Attempt 2 appends its full output to the same report.', code: 2, hl: { nodes: { T2: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'report records', v: 'half + full', cls: 'bad' }] },
        { log: 'The report has partial and full output for task 3. The totals are wrong, and no error appears.', code: 3, hl: { nodes: { OUT: 'bad' } }, stats: [{ l: 'total', v: 'wrong, no error', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Attempt 1 writes its output to a temporary location, not to the report.', code: 0, hl: { nodes: { T1: 'ok' } }, stats: [{ l: 'report', v: 'untouched', cls: 'ok' }] },
        { log: 'The machine fails. Its temporary output is ignored and can be discarded.', code: 1, hl: { nodes: { T1: 'dim' } }, stats: [{ l: 'partial output', v: 'not visible', cls: 'ok' }] },
        { log: 'Attempt 2 writes a complete temporary output.', code: 2, hl: { nodes: { T2: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'temp output', v: 'complete', cls: 'ok' }] },
        { log: 'Only one attempt is renamed to the final output, so the report counts each record once.', code: 3, hl: { nodes: { TMP: 'ok', OUT: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'records counted', v: 'once', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Stream processing: logs and events',
  problem: `Orders are saved to PostgreSQL, then the search index and the warehouse are updated in two more calls. One day the search index is down for a minute, the call fails, and the service logs a warning and moves on (illustrative). Search now shows the order as not existing. A month later a reconciliation job finds 2,000 such orders.`,
  predict: {
    q: `A consumer commits its offset to 110 on a timer, then crashes before it writes records 101 to 110 to the warehouse. After the restart, which records are handled?`,
    opts: [
      `Records 101 to 110 are replayed, because the offset was saved`,
      `Records 101 to 110 are never handled, because the offset says they are done`,
      `All records from 1, because the consumer starts over after a crash`
    ],
    ans: 1,
    why: `The committed offset claims the work is done before it is. A restart resumes after the records that were never processed, so they are skipped.`
  },
  explain: `
<h3>The idea</h3>
<p>Write each change once, to an ordered, durable log. Every other system (search, cache, warehouse) is then a consumer of that log, and each consumer keeps its own offset: how far it has read. A consumer can crash, restart and resume from its offset, and a slow consumer does not hold back a fast one.</p>
<h3>How it works, step by step</h3>
<p>1. The database change becomes an event in the log. This is done with the outbox pattern, which writes the event in the same transaction as the change, or with change data capture, which reads the database's own log.</p>
<p>2. A consumer polls records, does its side effect, and then commits its offset. The order matters. Commit the offset before the work and a crash loses the event. Commit it after a durable write and a crash repeats the event.</p>
<p>3. Since a repeat is possible, the side effect must be idempotent. Use the event ID as a unique key or an upsert, or store the offset in the same transaction as the result, and skip events at or below it.</p>
<p>4. Time windows need a rule for late events. A window closes on the job's notion of time, so a late event is dropped, sent to a correction stream, or merged within an allowed-lateness period. Choose one on purpose.</p>
<h3>The trade-off</h3>
<p>At-least-once delivery means a consumer must handle duplicates, which costs a unique key or a transaction on every write. Exactly-once effects are built from at-least-once delivery plus idempotent processing, not from the transport alone. The benefit is that every system can fall behind or fail without the others losing data.</p>
`,
  diagnose: [
    {
      t: 'Offset committed before processing',
      sym: 'Records are never processed after a restart',
      note: `Seen in: Kafka consumer auto-commit`,
      ctx: `Kafka's consumer auto-commit commits the position of records returned by poll on a timer. If the process dies after the commit and before the records are handled, those records are never handled again.`,
      why: `The offset claims the work is done before it is, so a restart resumes after the unprocessed records.`,
      fix: [
        `Measure: compare the commit time with the time the side effect is durably written.`,
        `Turn off auto-commit for work that must not be lost, and commit the offset after the side effect has been durably written.`
      ]
    },
    {
      t: 'Duplicates after a crash',
      sym: 'The database has two rows for one event',
      ctx: `A consumer writes each event to a database, then commits its offset. A crash between the two makes the broker redeliver the last batch, and the database gets two rows for one event.`,
      why: `At-least-once delivery means every event may arrive more than once, and the consumer's side effects were not keyed by event.`,
      fix: [
        `Measure: count rows per event ID in the target table.`,
        `Make the write idempotent: use the event ID as a unique key, or an upsert, or store the offset in the same transaction as the result.`
      ]
    },
    {
      t: 'Dual writes diverge',
      sym: 'An order exists in the database but never reaches the search index',
      note: `Debezium and similar tools implement the outbox pattern`,
      ctx: `An application saves an order to the database and then publishes it to a queue. The publish fails after the commit, so the order exists in the database and never reaches the queue or the search index.`,
      why: `Two systems cannot be updated atomically without a protocol, and a retry only helps if the first step is recorded.`,
      fix: [
        `Measure: find the orders in the database that have no matching event on the queue.`,
        `Write the event to an outbox table in the same transaction as the change, and let change data capture or a relay publish it. Debezium and similar tools implement this pattern.`
      ]
    },
    {
      t: 'Windows close before late events arrive',
      sym: 'Hourly revenue totals are quietly too low',
      ctx: `A stream job computes revenue per hour and emits each hour when its window closes. Events from mobile devices that were offline arrive ten minutes late, and the reported totals for those hours are quietly too low.`,
      why: `The window closed on the job's notion of time, and the event's real time fell outside it.`,
      fix: [
        `Measure: count the events that arrive after their window has closed, per hour.`,
        `Set an allowed-lateness period, emit corrections when late events arrive, or report the lateness rate so that a wrong total is at least visible.`
      ]
    }
  ],
  source: { label: 'Original: Stream processing: logs and events', href: '01-distributed-systems-end-to-end.html#ch12' },
  scenarios: [
    {
      id: 'offsetahead',
      label: 'Offset ahead of work',
      desc: 'The offset is committed to 110 before records 101 to 110 reach the warehouse. A crash in between skips them on restart (illustrative offsets).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'poll: records 101..110 returned',
          'auto-commit: offset = 110',
          'crash before the warehouse write',
          'restart: resume from offset 110',
          'records 101..110: never handled'
        ],
        fix: [
          'poll: records 101..110 returned',
          'write records to the warehouse, durable',
          'commit offset 110 after the write',
          'crash before commit: replay 101..110, safe if idempotent'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'K', x: 10, y: 115, w: 150, h: 60, t: 'Log (Kafka)', s: 'offsets per consumer' },
          { id: 'C', x: 250, y: 115, w: 150, h: 60, t: 'Consumer', s: 'poll, then work' },
          { id: 'DB', x: 470, y: 115, w: 150, h: 60, t: 'Warehouse', s: 'side effect' }
        ],
        edges: [
          { id: 'e1', a: 'K', b: 'C', label: 'records 101..110' },
          { id: 'e2', a: 'C', b: 'K', label: 'commit offset 110' },
          { id: 'e3', a: 'C', b: 'DB', label: 'write' }
        ]
      },
      bug: [
        { log: 'The consumer polls records 101 to 110 from the log.', code: 0, hl: { nodes: { K: 'ok', C: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'records', v: '101..110', cls: 'ok' }] },
        { log: 'The auto-commit timer records offset 110, which claims the records are done.', code: 1, hl: { edges: { e2: 'bad' }, nodes: { K: 'warn' } }, stats: [{ l: 'committed offset', v: '110', cls: 'bad' }] },
        { log: 'The process crashes before it writes the records to the warehouse.', code: 2, hl: { nodes: { C: 'bad' }, edges: { e3: 'dim' } }, stats: [{ l: 'warehouse writes', v: '0 of 10', cls: 'bad' }] },
        { log: 'On restart the consumer resumes from offset 110, after the records it never handled.', code: 3, hl: { nodes: { C: 'warn', K: 'warn' } }, stats: [{ l: 'resume at', v: '110', cls: 'warn' }] },
        { log: 'Records 101 to 110 are never handled again. The warehouse is missing them.', code: 4, hl: { nodes: { DB: 'bad' } }, stats: [{ l: 'lost records', v: '10', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The consumer polls records 101 to 110.', code: 0, hl: { nodes: { K: 'ok', C: 'on' }, edges: { e1: 'ok' } }, stats: [{ l: 'records', v: '101..110', cls: 'ok' }] },
        { log: 'The records are written to the warehouse first, and the write is durable.', code: 1, hl: { nodes: { C: 'ok', DB: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'warehouse writes', v: 'durable first', cls: 'ok' }] },
        { log: 'Only after the write is durable does the consumer commit offset 110.', code: 2, hl: { nodes: { K: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'committed offset', v: '110, after the write', cls: 'ok' }] },
        { log: 'If the process crashes before the commit, the restart replays 101 to 110. The write is idempotent, so the replay is safe.', code: 3, hl: { nodes: { C: 'warn' } }, stats: [{ l: 'duplicates', v: 'possible, made harmless', cls: 'warn' }] }
      ]
    },
    {
      id: 'dupe',
      label: 'Duplicate after crash',
      desc: 'The consumer writes a row, then crashes before it commits. The broker redelivers the batch and the naive write adds a second row. An upsert keyed by event ID does not (illustrative counts).',
      codeLabel: 'Trace',
      code: {
        bug: [
          'deliver batch 101..110',
          'consumer writes 10 rows',
          'crash before offset commit',
          'broker redelivers batch 101..110',
          'database: 20 rows for 10 events'
        ],
        fix: [
          'deliver batch 101..110',
          'upsert each row, keyed by event ID',
          'crash, then redelivery of 101..110',
          'upsert finds the same key: row updated, not added'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'K', x: 10, y: 115, w: 150, h: 60, t: 'Log', s: 'batch 101..110' },
          { id: 'C', x: 250, y: 115, w: 150, h: 60, t: 'Consumer', s: 'writes, then commits' },
          { id: 'DBX', x: 470, y: 115, w: 150, h: 60, t: 'Database', s: 'rows per event' }
        ],
        edges: [
          { id: 'e1', a: 'K', b: 'C', label: 'deliver batch' },
          { id: 'e2', a: 'C', b: 'DBX', label: 'write row or upsert' },
          { id: 'e3', a: 'C', b: 'K', label: 'commit offset' }
        ]
      },
      bug: [
        { log: 'The broker delivers batch 101 to 110 to the consumer.', code: 0, hl: { nodes: { K: 'ok' }, edges: { e1: 'on' } }, stats: [{ l: 'batch', v: '101..110', cls: 'ok' }] },
        { log: 'The consumer writes one row for each event. The database now holds 10 rows.', code: 1, hl: { nodes: { C: 'ok', DBX: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'rows written', v: '10', cls: 'ok' }] },
        { log: 'The consumer crashes before it commits the offset, so the broker does not know the batch was handled.', code: 2, hl: { nodes: { C: 'bad' }, edges: { e3: 'dim' } }, stats: [{ l: 'offset', v: 'not committed', cls: 'bad' }] },
        { log: 'The broker redelivers batch 101 to 110 after the restart.', code: 3, hl: { nodes: { K: 'warn' }, edges: { e1: 'bad' } }, stats: [{ l: 'redelivered', v: '101..110', cls: 'warn' }] },
        { log: 'The naive insert adds a second row for each event, so the database holds 20 rows for 10 events.', code: 4, hl: { nodes: { DBX: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'rows for 10 events', v: '20', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The same batch 101 to 110 is delivered.', code: 0, hl: { nodes: { K: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'batch', v: '101..110', cls: 'ok' }] },
        { log: 'Each row is an upsert keyed by its event ID.', code: 1, hl: { nodes: { C: 'ok', DBX: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'row key', v: 'event ID', cls: 'ok' }] },
        { log: 'The consumer crashes before the commit, and the broker redelivers the batch.', code: 2, hl: { nodes: { K: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'redelivered', v: '101..110', cls: 'warn' }] },
        { log: 'The upsert finds the same key, so the row is updated, not added.', code: 3, hl: { nodes: { DBX: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'rows for 10 events', v: '10', cls: 'ok' }] }
      ]
    }
  ]
},
  ]
};
