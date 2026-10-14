/* Performance, caching and concurrency: six lessons. Running scenario: a classifieds marketplace. All numbers are invented examples. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['performance'] = [
{
  title: `Latency, percentiles and throughput`,
  short: `Turn "it is slow" into a target, a percentile and a load, and learn why queues make the tail explode.`,
  why: `Every performance claim from an agent is a number or it is noise. Reviewers who know how latency, throughput and utilization relate can spot a benchmark that proves nothing, and a design that works at 50 percent load and collapses at 85.`,
  concept: [
    `<b>Latency</b> is the time one request takes. <b>Throughput</b> is how many requests finish per second. They are different questions: a system can have low latency and low throughput (one fast worker) or the reverse (a large batch). State both, and state the load at which you measured them.`,
    `A <b>percentile</b> orders all measured latencies and reads one position. p50 is the median, p99 is the value that 99 percent of requests beat. Averages hide the slow ones. Averaging percentiles across servers is also wrong: merge the histograms, then read the percentile. Set a <b>service level objective</b> (SLO) as "99 percent of requests under 300 ms over 30 days", not "fast".`,
    `<b>Little's law</b>: requests in the system = arrival rate x average time in the system. It tells you how many workers or connections a given load needs. And <b>queues</b> make the tail grow: as <b>utilization</b> (busy time divided by capacity) approaches 100 percent, waiting time grows without bound. In the simplest queue model the average time in system is service time divided by (1 minus utilization), so a server at 90 percent utilization has about 10 times the service time, not 1.1 times. This is why capacity is planned for headroom.`,
    `When you load test, use an <b>open</b> workload (requests arrive on a schedule whether or not earlier ones finished) to look like real users. A closed loop that waits for each response before sending the next slows down exactly when the server slows down, and hides the tail. This effect is called coordinated omission.`
  ],
  terms: [
    [`Percentile (p95, p99)`, `The latency that 95 or 99 percent of requests are faster than.`],
    [`SLO`, `A target for a percentile over a window, such as p99 under 300 ms for 30 days.`],
    [`Utilization`, `Fraction of time (or capacity) a resource is busy. Waiting time rises steeply near 100 percent.`],
    [`Saturation`, `Work waiting because the resource is full: queue length, pool wait time.`],
    [`Coordinated omission`, `A load generator that slows down when the server does, so it under-reports the tail.`]
  ],
  example: {
    setup: `The agent reports: "Ad search is faster. Average latency fell from 180 ms to 120 ms." The target is p99 under 400 ms at 300 requests per second (all numbers invented).`,
    body: [
      `Ask for percentiles on the same load. The measurement comes back: p50 90 ms, p95 350 ms, p99 1,900 ms. The average improved, but the target is missed by almost five times at the tail. By Little's law the system holds about 300 x 0.12 = 36 requests in flight on average, so a pool of 20 database connections is already short, which would explain a queue forming and the long tail.`,
      `Next ask how the test was run. A loop of 20 threads that each wait for a reply is a closed model: when the database slows, the test sends fewer requests and the tail looks better than production will.`
    ],
    table: {
      head: [`Claim`, `Number to ask for`, `Why`],
      rows: [
        [`Faster`, `p50, p95, p99, same load, same data`, `The tail is what users and SLOs feel`],
        [`Handles the load`, `Throughput at which p99 first breaks the target`, `Shows the knee, not a single comfortable point`],
        [`Enough workers`, `Arrival rate x service time vs pool size`, `Little's law gives a first estimate`],
        [`Benchmark is valid`, `Open or closed model, warm-up, data size`, `A closed loop at tiny data proves little`]
      ]
    }
  },
  technique: [
    { t: `Write the target as an SLO`, x: `One path, one percentile, one threshold, one load: "GET /ads p99 under 400 ms at 300 per second".` },
    { t: `Measure percentiles, not means`, x: `Collect a histogram, report p50, p95 and p99, and keep the raw histogram for later merging.` },
    { t: `Estimate concurrency with Little's law`, x: `In flight = rate x time. Compare it with pool sizes and worker counts before blaming code.` },
    { t: `Find the knee`, x: `Raise the load in steps and record where p99 bends upward. Plan to run well below that point.` },
    { t: `Check the test itself`, x: `Open arrival model, warm caches stated, realistic data size, same hardware before and after.` }
  ],
  mistakes: [
    { t: `Optimizing the average`, ctx: `The report says mean latency is down 33 percent. A few percent of requests still take seconds, and these are the ones that time out and retry.`, fix: `Ask for p95 and p99, and a histogram. Accept the change only if the percentile named in the SLO moved.` },
    { t: `Testing on an empty database`, ctx: `A benchmark on 1,000 ads shows 5 ms. Production has 20 million ads and the plan changes.`, fix: `Test on data of production size and shape, with a realistic mix of queries.` },
    { t: `Running hot`, ctx: `The design is sized so that the server runs at 90 percent utilization at peak. Any burst makes the queue grow without bound.`, fix: `Plan peak utilization well below the knee you measured, and add backpressure or load shedding for the rest.` }
  ],
  review: [
    `What is the SLO (percentile, threshold, load), and which measurement shows it is met or missed?`,
    `Are the numbers percentiles from the same load before and after, with data of realistic size?`,
    `Was the load generator open or closed? Was there a warm-up, and is the cache state stated?`,
    `At what load does p99 break the target, and how far is peak traffic from that point?`,
    `Red flag: a performance claim that gives only an average or a single run on a laptop.`
  ],
  exercise: {
    prompt: `Peak traffic is 400 requests per second and the average request holds a database connection for 50 ms. How many connections are in use on average? The pool has 20. What do you expect and what do you ask?`,
    answer: `<p>Little's law: 400 x 0.05 = 20 connections busy on average. The pool of 20 is at about 100 percent utilization at the average, so queueing is certain and the tail will be long. Even a pool of 25 runs hot.</p><p>Ask for pool wait time (saturation) and p99 under that load. Fix by cutting the connection hold time (a faster query, no work held inside the transaction) before enlarging the pool, because the database has a limit on useful concurrency.</p>`
  },
  checklist: [
    `The target is an SLO: path, percentile, threshold and load.`,
    `Every claim has p50, p95 and p99 measured on the same load and data.`,
    `I estimated in-flight requests with Little's law and compared with pool sizes.`,
    `The load test is open, warmed up and uses realistic data.`,
    `I know where the knee is and how far peak is from it.`
  ],
  artifact: `Section 1 of the performance report: the SLO, the load model and the baseline percentile table.`,
  agent: `The agent states an SLO before optimizing, reports percentiles from a labelled load test, and flags when its own benchmark is closed-loop or uses a tiny dataset.`,
  src: `J. D. C. Little, A Proof for the Queuing Formula L = lambda W, Operations Research 9(3), 1961. J. Dean and L. Barroso, The Tail at Scale, CACM 56(2), 2013. Google, Site Reliability Engineering, 2016 (service level objectives chapter). Gil Tene's talks on coordinated omission. Backend from First Principles, chapter 18 (performance, percentiles, queuing). Numbers are invented examples.`
},
{
  title: `Finding bottlenecks with profiles and query plans`,
  short: `Measure where time goes before changing anything: resource checks, a profile, a query plan.`,
  why: `Agents like to optimize what looks slow in the code. The slow part is often somewhere else: a query, a lock, a remote call. A reviewer who insists on a profile or a plan before a fix prevents a lot of confident, useless changes.`,
  concept: [
    `A <b>bottleneck</b> is the resource or step that limits the whole system. Speeding up anything else changes little (Amdahl's law: if a step is 10 percent of the time, making it infinitely fast gains at most 10 percent). So the first job is to locate the bottleneck, and the second is to fix that one thing.`,
    `Start with resources. Brendan Gregg's <b>USE method</b> checks, for each resource (CPU, memory, disk, network, connection pools, locks), its <b>utilization</b>, <b>saturation</b> and <b>errors</b>. For services, the <b>RED</b> view (rate, errors, duration) per endpoint tells you which request is the problem.`,
    `Then look inside. A <b>profiler</b> samples where a process spends CPU time. A <b>flame graph</b> draws those samples as stacked boxes: width is share of time. A <b>trace</b> follows one request across calls and shows which span is long. If the CPU is idle but the request is slow, the time is waiting (database, network, lock), and a CPU profile will not show it: use traces and wait statistics.`,
    `For databases read the <b>query plan</b>. In PostgreSQL, <code>EXPLAIN</code> shows the planned steps, and <code>EXPLAIN (ANALYZE, BUFFERS)</code> runs the query and shows actual time, actual rows and buffer reads. Compare estimated rows with actual rows: a large gap means stale statistics or a bad estimate. Note that <code>ANALYZE</code> really executes the statement, so wrap data-changing statements in a transaction you roll back. The <code>pg_stat_statements</code> extension ranks statements by total time, which finds the query worth tuning.`
  ],
  terms: [
    [`Bottleneck`, `The step or resource that limits end-to-end throughput or latency.`],
    [`USE method`, `For each resource check utilization, saturation and errors.`],
    [`Flame graph`, `A picture of sampled stacks where width is the share of time spent.`],
    [`Query plan`, `The steps the database chooses to run a query: scans, joins, sorts, with cost and row estimates.`],
    [`Trace`, `The timeline of one request across services and calls, with a span per step.`]
  ],
  example: {
    setup: `The ad list endpoint has p99 1.8 s. The agent proposes rewriting the JSON serializer for speed (invented numbers throughout).`,
    body: [
      `Ask for evidence first. A trace of a slow request shows 1.6 s of the 1.8 s in one span: the query for ads by category ordered by posting time. CPU in the application is 15 percent. The serializer is about 20 ms, so even a perfect rewrite gains about 1 percent.`,
      `The plan for the query shows <code>Seq Scan on ad</code> with a filter on category_id, then a <code>Sort</code>, reading 4 million rows to return 20. The estimate was 20,000 rows, the actual was 4 million, so statistics are stale too. The reviewer's action is to ask for the plan after an index on (category_id, posted_at) and after <code>ANALYZE</code>, with the new p99 on the same load.`
    ],
    table: {
      head: [`Symptom`, `Likely place`, `Tool`],
      rows: [
        [`High CPU, slow requests`, `Code or serialization`, `CPU profile, flame graph`],
        [`Low CPU, slow requests`, `Waiting: database, network, locks, pool`, `Trace, pool wait metrics, pg_stat_activity`],
        [`One endpoint slow`, `Its query or remote call`, `Per-endpoint RED metrics, trace`],
        [`Query slow`, `Scan, sort, bad estimate`, `EXPLAIN (ANALYZE, BUFFERS), pg_stat_statements`]
      ]
    }
  },
  technique: [
    { t: `Reproduce with a measurement`, x: `Pick the slow endpoint and capture its latency under a known load. No change before this.` },
    { t: `Check the resources`, x: `Utilization, saturation and errors for CPU, memory, disk, network, pools and locks. Note which one is full.` },
    { t: `Locate the slow step`, x: `Use a trace for waiting, a profile for CPU. Write down the step and its share of the total.` },
    { t: `Read the plan`, x: `For a slow query run EXPLAIN (ANALYZE, BUFFERS) on realistic data. Compare estimated and actual rows.` },
    { t: `Change one thing and re-measure`, x: `Same load, same data. Keep the change only if the percentile improved.` }
  ],
  mistakes: [
    { t: `Guessing and rewriting`, ctx: `The agent rewrites a loop for speed. The profile was never taken, and the loop was 1 percent of the time.`, fix: `Require a profile or trace that names the slow step and its share before any optimization.` },
    { t: `Profiling CPU when the request is waiting`, ctx: `CPU is idle, the profile is flat and nothing stands out, while requests wait for a lock.`, fix: `Use traces and wait metrics. Idle CPU with slow requests means waiting, not computing.` },
    { t: `Tuning on a tiny dataset`, ctx: `On a laptop with 1,000 rows the planner chooses a sequential scan and the query looks fine. With 20 million rows it picks another plan or the same one at a cost.`, fix: `Read plans on data of production size, or on a copy with production statistics.` }
  ],
  review: [
    `What is the measured bottleneck? Show the trace, profile or plan, not a description.`,
    `What share of total time does the step you changed represent? What is the best possible gain?`,
    `For queries: the EXPLAIN (ANALYZE, BUFFERS) before and after, on realistic data. Are estimated and actual rows close?`,
    `Is CPU busy or idle during the slow requests, and does the tool you used fit that?`,
    `Red flag: an optimization of code or an added cache with no profile, trace or plan attached.`
  ],
  exercise: {
    prompt: `The agent says the message list is slow and adds a Redis cache. A trace shows 700 ms of 750 ms in a query on the message table filtered by conversation_id. What do you ask, and what is the likely fix?`,
    answer: `<p>Ask for the plan of that query. If there is a sequential scan on message, the fix is an index on (conversation_id, sent_at), which makes a read of the last 50 messages touch a few pages. A cache would hide the slow query for repeat readers and leave every miss and every new conversation slow, and it adds invalidation work.</p><p>Ask for p99 after the index, and keep the cache only if the measured gap to the target remains.</p>`
  },
  checklist: [
    `I have a baseline measurement of the slow request before any change.`,
    `The bottleneck is named with a trace, a profile or a plan.`,
    `I know the share of time the changed step accounts for.`,
    `Plans were read on data of realistic size, estimated against actual rows.`,
    `Each change was re-measured alone on the same load.`
  ],
  artifact: `Section 2 of the performance report: bottleneck evidence (trace or profile, plan before and after) and the change log.`,
  agent: `The agent profiles or traces first, attaches the plan or flame graph to its proposal, and refuses to add an optimization it cannot tie to a measured share of time.`,
  src: `B. Gregg, Systems Performance, 2nd ed., 2020 (the USE method, flame graphs). PostgreSQL manual: Using EXPLAIN, and the pg_stat_statements module. G. Amdahl, Validity of the single processor approach to achieving large scale computing capabilities, AFIPS 1967. Backend from First Principles, chapter 18 (EXPLAIN ANALYZE, profiling). The Postgres course page on this site.`
},
{
  title: `Indexes, N+1 queries and connection pools`,
  short: `The three database causes behind most slow endpoints: a missing index, a query per row, and a pool that is the wrong size.`,
  why: `Most backend latency is database time, and most of that comes from a small set of patterns. An agent writing ORM code produces N+1 queries easily and rarely checks plans. You can catch these three from the diff.`,
  concept: [
    `An <b>index</b> is a separate sorted structure that lets the database find rows without reading the whole table. The common kind is a B-tree. A <b>composite index</b> on (a, b) helps filters on a, or on a and b, but not on b alone: column order matters. Put equality columns first and the range or sort column last. An index speeds reads and costs on every write and in disk space, so each one must have a query that uses it.`,
    `An index is <b>not used</b> when the query wraps the column in a function (<code>lower(title)</code> needs an expression index), uses a leading wildcard in <code>LIKE '%word'</code>, compares mismatched types, or selects so much of the table that a scan is cheaper. Check with EXPLAIN, do not assume. Also paginate with <b>keyset pagination</b> (<code>WHERE posted_at &lt; last_seen ORDER BY posted_at DESC LIMIT 20</code>) instead of a large <code>OFFSET</code>, which still reads and discards all the skipped rows.`,
    `The <b>N+1 query problem</b> is one query to fetch a list, then one more query per row for a related record: 1 + N round trips. It appears when an ORM loads relations lazily inside a loop. Fix by one query with a join, or by two queries using <code>WHERE id IN (...)</code> (batching). Count the queries per request in a test to catch it.`,
    `A <b>connection pool</b> keeps a fixed set of open database connections that requests borrow and return, because opening a connection is slow and each PostgreSQL connection is a separate server process with memory cost. More connections than the database can usefully run at once does not add speed: it adds contention. Size the pool from the database, not from the number of application threads, and keep the time a connection is held short: never hold one during a remote call. If many application instances each have a pool, the total can exceed the server limit (<code>max_connections</code>), and an external pooler such as PgBouncer is the usual answer.`
  ],
  terms: [
    [`B-tree index`, `A sorted tree structure that finds rows by key in a few page reads.`],
    [`Composite index`, `An index on several columns, usable for a leftmost prefix of them.`],
    [`N+1`, `One query for a list and one more per row for related data.`],
    [`Keyset pagination`, `Paging with a WHERE on the last seen key instead of OFFSET.`],
    [`Connection pool`, `A bounded set of reusable database connections shared by requests.`]
  ],
  example: {
    setup: `The ad list shows each ad with its seller name and first image (invented numbers: 20 ads per page, 300 pages per second).`,
    body: [
      `The agent's code loads 20 ads, then loops: <code>member = get_member(ad.member_id)</code> and <code>image = get_first_image(ad.ad_id)</code>. That is 1 + 20 + 20 = 41 queries per page view, or about 12,300 queries per second at 300 views per second. Each query is fast on its own, so no single slow query shows up in the logs, but the database is busy and connections are held for 41 round trips.`,
      `The fix is two or three queries: the ads, then <code>SELECT * FROM member WHERE member_id IN (...)</code>, then the images for those ad ids ordered by position, with an index on ad_image(ad_id, position). Keep that in a test that fails if the query count for the endpoint goes above 3.`
    ],
    table: {
      head: [`Query shape`, `Index that serves it`, `Check`],
      rows: [
        [`Ads in a category, newest first`, `ad (category_id, posted_at DESC)`, `Plan shows an Index Scan, no Sort`],
        [`Messages in a conversation`, `message (conversation_id, sent_at)`, `Last 50 read without a scan`],
        [`Case-insensitive username lookup`, `member (lower(username)) expression index`, `Plan uses it, not Seq Scan`],
        [`Page 5000 of ads with OFFSET`, `Keyset on (posted_at, ad_id)`, `Latency flat across pages`]
      ]
    }
  },
  technique: [
    { t: `List the access paths`, x: `For each endpoint write the WHERE, JOIN and ORDER BY it needs, and the expected rows returned.` },
    { t: `Match indexes to paths`, x: `Equality columns first, then the range or sort column. Each index must name the query it serves.` },
    { t: `Prove the index is used`, x: `Run EXPLAIN on realistic data and confirm an index scan with no extra sort.` },
    { t: `Count queries per request`, x: `Log or assert the number of queries for each endpoint, and batch any per-row lookup.` },
    { t: `Size the pool from the database`, x: `Total connections across all instances must fit the database limit. Keep hold time short and set a pool wait timeout.` },
    { t: `Cost the write side`, x: `Each index slows inserts and updates. Remove indexes that no query uses.` }
  ],
  mistakes: [
    { t: `Indexing every column`, ctx: `The agent adds an index per column "to be safe". Writes slow down and the planner still cannot use half of them.`, fix: `Add indexes for named queries, in the right column order, and remove unused ones.` },
    { t: `A large pool as a fix`, ctx: `Requests wait for connections, so the agent raises the pool from 20 to 500. The database now thrashes on contention and latency gets worse.`, fix: `Find why connections are held so long. Shorten the work inside the transaction, fix the slow query, and cap the pool at what the database runs well.` },
    { t: `Holding a connection across a remote call`, ctx: `A handler opens a transaction, calls the moderation service for 400 ms, then writes. At 100 requests per second that is 40 connections held doing nothing.`, fix: `Do the remote call first or after, and keep the transaction to the database work only.` }
  ],
  review: [
    `Which query does each new index serve? Show the plan using it, and the write cost accepted.`,
    `Is the column order in each composite index justified by the WHERE and ORDER BY?`,
    `How many queries does this endpoint run for a page of 20? Is there a test asserting it?`,
    `How is the pool sized: per-instance size, instance count, database limit? What is the wait timeout?`,
    `Red flag: ORM calls inside a loop, an OFFSET over a large table, or a raised pool size offered as the fix.`
  ],
  exercise: {
    prompt: `The agent writes: SELECT * FROM ad WHERE category_id = 5 ORDER BY posted_at DESC LIMIT 20 OFFSET 20000, and adds separate indexes on category_id and on posted_at. Review it.`,
    answer: `<p>Two single-column indexes do not give a single ordered path: the planner will probably use one and sort or filter the rest. A composite index on (category_id, posted_at DESC) serves both the filter and the order.</p><p>The OFFSET of 20000 makes the database walk and discard 20,000 entries on each request. Use keyset pagination: pass the last posted_at and ad_id and filter on them. Also avoid SELECT * if the list needs few columns. Ask for the plan before and after and the latency of page 1 versus a deep page.</p>`
  },
  checklist: [
    `Every index names the query it serves and appears in a plan.`,
    `Composite index column order matches equality-then-range-or-sort.`,
    `The query count per request is known and asserted in a test.`,
    `Deep pages use keyset pagination.`,
    `Pool sizes across all instances fit the database limit, and no connection is held during a remote call.`
  ],
  artifact: `Section 3 of the performance report: an index table (query, index, plan evidence, write cost), the query count per endpoint and the pool sizing.`,
  agent: `The agent writes the access path for each endpoint, proposes indexes with their EXPLAIN output, batches related lookups, and computes the total pool size against the database limit.`,
  src: `PostgreSQL manual: Indexes (multicolumn indexes, indexes and ORDER BY, expression indexes), Using EXPLAIN. M. Winand, Use The Index, Luke (keyset pagination, why OFFSET is slow). PgBouncer documentation (pooling modes). Backend from First Principles, chapter 18 (indexes, N+1, connection pooling). The Postgres course page on this site. Numbers are invented examples.`
},
{
  title: `Caching strategies and invalidation`,
  short: `Where to cache, how to keep it right, and what happens when the cache is cold, stale or gone.`,
  why: `A cache is a second copy of data, which makes it a consistency problem first and a speed trick second. Agents add caches readily and invalidate them rarely. The review question is not "is it faster" but "how can it be wrong, and for how long".`,
  concept: [
    `<b>Cache-aside</b> (lazy loading): the application reads the cache, on a miss reads the database and fills the cache. It is simple and tolerates cache loss, but the first request after a miss pays full cost, and data can be stale. <b>Read-through</b> is the same with the cache library doing the loading. <b>Write-through</b> writes to cache and database together, so reads are warm but every write pays both. <b>Write-behind</b> (write-back) acknowledges after the cache and writes to the database later: fast, but data can be lost if the cache fails before the flush. Most backends should start with cache-aside.`,
    `<b>Invalidation</b> is the hard part. The three tools are a <b>TTL</b> (time to live: entries expire), <b>explicit delete or update on write</b>, and versioned keys. Prefer deleting the entry after the database commit over updating it, because two concurrent updaters can write the cache in the wrong order and leave an old value. Even delete-after-commit leaves a short race window, so a TTL is still the safety net. State how stale the data may be in plain words: "price may be up to 60 seconds old".`,
    `<b>Eviction</b> decides what to drop when memory is full. Redis offers policies such as <code>allkeys-lru</code>, <code>allkeys-lfu</code>, <code>volatile-lru</code>, <code>volatile-ttl</code> and <code>noeviction</code>, and with <code>noeviction</code> writes fail when memory is full. Choose by role: a pure cache wants an allkeys policy, while a store that mixes cache and real data should not share an instance with a cache workload.`,
    `<b>TTL pitfalls</b>: a <b>stampede</b> (thundering herd) happens when a popular key expires and many requests rebuild it at once, hitting the database. Prevent it with a single-flight lock or request coalescing so one caller rebuilds, with random jitter on TTLs so keys do not expire together, and by refreshing early. Cache <b>absence</b> too (negative caching, with a short TTL) so lookups for missing ids do not always reach the database. Never cache per-user data under a shared key, and never cache an error response as a success.`,
    `Measure the <b>hit rate</b>. A cache with a 20 percent hit rate adds a network hop and a staleness risk for little gain. Also keep the system working when the cache is down: a cache outage should mean slower, not broken.`
  ],
  terms: [
    [`Cache-aside`, `The application checks the cache, loads from the database on a miss and fills the cache.`],
    [`Write-through / write-behind`, `Writes go to the cache and the database together, or to the cache first and the database later.`],
    [`TTL`, `Time to live: how long an entry may be served before it expires.`],
    [`Stampede`, `Many requests rebuilding one expired hot key at the same moment.`],
    [`Eviction policy`, `The rule for which entries to drop when the cache is full, such as LRU.`]
  ],
  example: {
    setup: `The ad detail page is read 500 times per second, mostly for a small set of popular ads, and sellers edit prices a few times a day (invented numbers). The agent proposes caching the whole page for 24 hours.`,
    body: [
      `Review the staleness: a seller drops the price and buyers see the old price for up to a day, which the product does not accept. The fix is cache-aside with the ad row keyed by <code>ad:{id}</code>, a 5 minute TTL with random jitter of plus or minus 10 percent, and a delete of the key after the update commits. The worst stale window is now the time between commit and delete, plus the race window, bounded by the TTL.`,
      `Then test the edges: what happens when the top ad expires at peak (use single-flight so one request rebuilds), when the cache is down (read the database, with a timeout on the cache call), and when the id does not exist (cache the miss for 30 seconds). Measure hit rate and p99 before and after.`
    ],
    table: {
      head: [`Strategy`, `Read cost`, `Write cost`, `Risk`],
      rows: [
        [`Cache-aside`, `Hit: fast, miss: slow`, `Delete or let expire`, `Stale until delete or TTL`],
        [`Write-through`, `Warm`, `Cache plus database`, `Cache holds data nobody reads`],
        [`Write-behind`, `Warm`, `Fast`, `Loss of acknowledged writes if the cache dies`],
        [`TTL only`, `Cheap`, `None`, `Stale for the whole TTL`]
      ]
    }
  },
  technique: [
    { t: `Prove a cache is needed`, x: `Show the measured bottleneck and that the data is read much more than written. Check an index or a query fix first.` },
    { t: `State the allowed staleness`, x: `Write it as a time in plain words, agreed with the product owner.` },
    { t: `Choose the pattern and the key`, x: `Default to cache-aside. Design the key with the entity and version, and no per-user data under a shared key.` },
    { t: `Design invalidation`, x: `Delete after commit, plus a jittered TTL as a safety net. List every code path that writes the data.` },
    { t: `Defend the miss path`, x: `Single-flight for hot keys, negative caching for absent ids, a timeout and a fallback if the cache is down.` },
    { t: `Measure`, x: `Report hit rate, miss latency, p99 before and after, and memory used with the eviction policy.` }
  ],
  mistakes: [
    { t: `A long TTL as the only invalidation`, ctx: `Prices are cached for 24 hours with no delete on write. Sellers see their edit and buyers do not.`, fix: `Delete or update on write, and keep a short TTL as the safety net.` },
    { t: `Updating the cache on write`, ctx: `Two requests update the same ad. Their cache writes land in the opposite order and the older value stays.`, fix: `Delete the key after the database commit and let the next read repopulate it, or version the key.` },
    { t: `No plan for a cold or dead cache`, ctx: `A deploy flushes the cache and every request hits the database at once, or the cache host is down and requests hang.`, fix: `Warm hot keys, use single-flight, set a timeout on cache calls and fall back to the database with a limit.` }
  ],
  review: [
    `What evidence shows the cache is needed, and what is the expected hit rate? Was a cheaper fix (index, query) tried?`,
    `How stale may the data be, and which mechanism enforces it: TTL, delete on write, versioned key?`,
    `List every code path that changes the data. Does each one invalidate the entry?`,
    `What happens on a cold cache, a stampede on a hot key, and a cache outage?`,
    `Red flag: cached data that differs per user under one key, or "cache it for 24 hours" with no invalidation.`
  ],
  exercise: {
    prompt: `The agent caches the number of unread messages per member for 10 minutes with the key unread_count. List what is wrong and fix it.`,
    answer: `<p>The key has no member id, so all users share one value: a data leak and a wrong count. A 10 minute TTL with no invalidation means a new message does not show for up to 10 minutes, probably not acceptable for chat.</p><p>Fix: key by <code>unread:{member_id}</code>. Either increment the counter atomically when a message arrives and reset on read (the counter becomes the source of truth for display, repaired from the database by a job), or skip caching and read an indexed count on message(recipient_id, read_at) if that is fast enough. Add jitter, a fallback when the cache is down and a test that a new message changes the shown count.</p>`
  },
  checklist: [
    `The need for the cache is shown by a measured bottleneck.`,
    `Allowed staleness is written down.`,
    `Keys are scoped correctly and contain no mixed per-user data.`,
    `Every write path invalidates, and a jittered TTL is the safety net.`,
    `Stampede, cold start and cache outage each have a stated behavior.`,
    `Hit rate and latency are measured.`
  ],
  artifact: `Section 4 of the performance report: a cache table (what, key, pattern, TTL, invalidation, allowed staleness, hit rate, failure behavior).`,
  agent: `The agent adds a cache only after the bottleneck is measured, writes the staleness rule and invalidation paths into a cache table, and tests the cold, stampede and outage cases.`,
  src: `Redis documentation: key eviction (maxmemory-policy and its policies). AWS Prescriptive Guidance and Amazon ElastiCache caching strategies (lazy loading, write-through, TTL). M. Kleppmann, Designing Data-Intensive Applications, ch. 5 and 11 (derived data and stale reads). Backend from First Principles, chapter 9 (caching). The Redis course page on this site. Numbers are invented examples.`
},
{
  title: `IO-bound and CPU-bound work: threads, event loops, goroutines`,
  short: `Pick the concurrency model from what the work waits on, and spot the call that blocks everything.`,
  why: `Concurrency bugs are expensive and subtle, and the wrong model wastes a server. An agent may write async code that blocks the event loop, or fan out threads for work that is CPU-bound. You need a small mental model to review it.`,
  concept: [
    `Work is <b>IO-bound</b> when it mostly waits (database, network, disk) and <b>CPU-bound</b> when it mostly computes (image resizing, hashing, parsing a large file). IO-bound work gains from running many things at once, because the processor is idle while waiting. CPU-bound work is limited by cores: more concurrency than cores does not make it faster.`,
    `Models: <b>OS threads</b> are scheduled by the kernel and can run on several cores, but each costs memory and context switches, and shared data needs locks. An <b>event loop</b> (Node.js, Python asyncio) runs many tasks on one thread by switching only at <code>await</code> points: it handles thousands of waiting connections cheaply, but one long computation, or one synchronous call, blocks every other task. <b>Goroutines</b> (Go) are lightweight tasks multiplexed by the runtime onto OS threads and use cores, with channels for passing data. <b>Worker processes or pools</b> run CPU-bound jobs away from the request path.`,
    `Language limits matter: CPython has a global interpreter lock, so threads do not run Python code in parallel, though they overlap while waiting on IO, and CPU-bound Python is parallelized with processes. A Node.js process runs JavaScript on one thread, so CPU-heavy work goes to worker threads or another service. Check the runtime version for current behavior before accepting a claim.`,
    `Always bound concurrency: a pool of workers, a semaphore, a queue with a limit. Unbounded fan-out (a goroutine or task per item in a list of a million) exhausts memory, connections or the downstream service. This ties back to Little's law: concurrency should be sized from rate and time, and then capped.`
  ],
  terms: [
    [`IO-bound`, `Time is spent waiting on network, disk or database.`],
    [`CPU-bound`, `Time is spent computing, limited by cores.`],
    [`Event loop`, `One thread running many tasks, switching only when a task awaits.`],
    [`Goroutine`, `A lightweight Go task scheduled by the runtime across OS threads.`],
    [`Bounded concurrency`, `A fixed cap on parallel tasks via a pool or semaphore.`]
  ],
  example: {
    setup: `An endpoint accepts an ad with 8 photos. It must validate, resize each photo to 3 sizes, upload them and save the ad (invented numbers: resize takes 120 ms of CPU per photo-size, upload 80 ms of network).`,
    body: [
      `The agent writes the handler in an async framework and calls the resize function directly inside the request. The resize is a synchronous CPU call: 8 x 3 x 120 ms is about 2.9 s of CPU during which the event loop serves nothing. Other users' requests, even the cheap ones, see added latency. The upload part is IO and is fine to run concurrently.`,
      `The review fix: the request stores the originals and answers quickly. Resizing goes to a pool of worker processes sized near the core count (a background job, covered in the async module), and the uploads of results run concurrently with a cap, for example 8 at a time. Show the event-loop lag or p99 of an unrelated cheap endpoint during the upload test as evidence.`
    ],
    table: {
      head: [`Work`, `Kind`, `Fit`],
      rows: [
        [`Query the database for 20 ads`, `IO-bound`, `Event loop or threads, pooled connections`],
        [`Resize an image`, `CPU-bound`, `Worker processes or a job queue, about one per core`],
        [`Call 5 independent services`, `IO-bound`, `Run concurrently with timeouts and a cap`],
        [`Hash a password`, `CPU-bound by design`, `Off the event loop, with a limit on concurrent hashes`]
      ]
    }
  },
  technique: [
    { t: `Classify each step`, x: `For every step in the request, mark it IO-bound or CPU-bound, with its time from a trace.` },
    { t: `Choose the model from the runtime`, x: `Event loop for many waiting tasks, processes or workers for CPU, threads or goroutines where the runtime parallelizes.` },
    { t: `Keep the event loop free`, x: `No synchronous heavy call, no blocking library call inside async code. Measure event-loop lag.` },
    { t: `Bound every fan-out`, x: `Use a pool or semaphore. State the cap and derive it from rate, time and downstream limits.` },
    { t: `Add timeouts and cancellation`, x: `Every concurrent call has a deadline, and the request cancels its children when it ends.` }
  ],
  mistakes: [
    { t: `A blocking call in async code`, ctx: `A synchronous database driver or a CPU loop runs inside an async handler, and the whole server stalls while it runs.`, fix: `Use the async driver, or move the call to a thread or process pool. Check event-loop lag under load.` },
    { t: `Threads for CPU-bound work in a runtime with a global lock`, ctx: `The agent adds 16 threads to speed up Python number crunching. The time does not improve.`, fix: `Use processes, a native extension that releases the lock, or a different service. Measure the speedup.` },
    { t: `Unbounded parallelism`, ctx: `For each of 50,000 saved ads the code starts a task that calls the pricing service. The service falls over and so does the caller.`, fix: `Process in batches through a bounded pool with backpressure.` }
  ],
  review: [
    `For each step: is it IO-bound or CPU-bound, and does the chosen concurrency model fit that?`,
    `Does any call in async code block the event loop? What measures event-loop lag or the p99 of an unrelated endpoint?`,
    `What is the cap on parallel work, and where does the number come from?`,
    `Are there timeouts and cancellation on every concurrent call?`,
    `Red flag: a task or thread started per item with no limit, or a blocking call inside an async handler.`
  ],
  exercise: {
    prompt: `The agent speeds up the "fetch seller info for 50 ads" endpoint by starting 50 threads that each query the database. The pool has 20 connections. What happens and what do you suggest?`,
    answer: `<p>Thirty of the threads wait for connections, so there is no extra speed past 20 and the waiting adds latency and memory. Under several concurrent requests the pool is exhausted for everyone.</p><p>Do not parallelize here at all: one query with WHERE member_id IN (...) returns all 50 sellers in one round trip. If parallelism is needed for independent remote calls, use a bounded pool sized below the connection pool and with timeouts.</p>`
  },
  checklist: [
    `Each step is classified IO-bound or CPU-bound from measured time.`,
    `The model fits the runtime and the work.`,
    `Nothing blocks the event loop, and lag is measured.`,
    `Every fan-out has a cap with a reason.`,
    `Timeouts and cancellation exist on concurrent calls.`
  ],
  artifact: `Section 5 of the performance report: a concurrency table (step, kind, model, cap, timeout) and the event-loop or worker-pool measurements.`,
  agent: `The agent classifies each step, keeps CPU-heavy work off the request path, bounds every fan-out with a stated cap, and reports event-loop lag or an unrelated endpoint's p99 during its test.`,
  src: `Node.js documentation: the event loop and "Don't block the event loop". Python documentation: threading (the GIL note) and asyncio. The Go blog and Go specification on goroutines and channels. Backend from First Principles, chapter 20 (concurrency, IO-bound versus CPU-bound). Numbers are invented examples.`
},
{
  title: `Race conditions and locks`,
  short: `Find the check-then-act bugs that appear only under concurrency, and close them where the data lives.`,
  why: `A race passes every single-user test and loses money or data in production. Agents write read-then-write code naturally. A reviewer who knows the three standard fixes can find the bug in the diff and demand the right test.`,
  concept: [
    `A <b>race condition</b> happens when the result depends on the order of overlapping operations. The classic shape is <b>check-then-act</b>: read a value, decide, then write, while another request does the same between your read and write. Two buyers both see "1 left" and both buy. A <b>lost update</b> is the same: two requests read a counter of 5 and both write 6.`,
    `Fixes, from strongest and simplest: (1) an <b>atomic statement</b> that does the check and the write in one step, such as <code>UPDATE ad SET views = views + 1 WHERE ad_id = $1</code>, or <code>INSERT ... ON CONFLICT DO NOTHING</code> backed by a <b>unique constraint</b>. (2) <b>Optimistic locking</b>: add a version column, update with <code>WHERE ad_id = $1 AND version = $2</code>, and if zero rows changed, someone else won, so retry or report a conflict. Good when conflicts are rare. (3) <b>Pessimistic locking</b>: <code>SELECT ... FOR UPDATE</code> locks the rows until the transaction ends, so others wait. Good when conflicts are common, but it holds locks and can deadlock.`,
    `<b>Deadlock</b>: two transactions each hold a lock the other needs. PostgreSQL detects it and aborts one. Avoid it by always taking locks in the same order and keeping transactions short. Also know that the default isolation level in PostgreSQL is Read Committed, which does not prevent a check-then-act race by itself. Higher levels (Repeatable Read, Serializable) change this, and with Serializable the application must retry on serialization failures.`,
    `Locks held in application memory work only in one process. Across several instances use the database, or a <b>distributed lock</b> with great care: a lock with an expiry can be held by a process that paused past its expiry (a garbage collection pause, for example), so two holders act at once. Martin Kleppmann's analysis recommends <b>fencing tokens</b> that the resource checks, or better, relying on the database constraint. And the same problem appears with caches and jobs: two workers processing the same job need an idempotent operation, not only a lock.`
  ],
  terms: [
    [`Check-then-act`, `Read a condition, then act on it, with a gap where another request can change it.`],
    [`Lost update`, `Two read-modify-write cycles overlap and one write overwrites the other.`],
    [`Optimistic locking`, `Update only if a version is unchanged, otherwise retry or report a conflict.`],
    [`Pessimistic locking`, `Lock the rows first (SELECT FOR UPDATE) so others wait.`],
    [`Deadlock`, `Each transaction waits for a lock the other holds.`]
  ],
  example: {
    setup: `Members can save an ad (table saved_ad) but only 200 saved ads per member, and an ad can be reserved by one buyer at a time (invented limits).`,
    body: [
      `The agent's code for reserving an ad: <pre>row = SELECT reserved_by FROM ad WHERE ad_id = $1
if row.reserved_by IS NULL:
    UPDATE ad SET reserved_by = $2 WHERE ad_id = $1</pre> Two buyers run this at once: both read NULL, both update, and the later write silently wins. A test with one user never finds it.`,
      `Fix 1, atomic: <code>UPDATE ad SET reserved_by = $2 WHERE ad_id = $1 AND reserved_by IS NULL</code> and check that one row changed. Exactly one request sees "1 row affected". Similarly a unique constraint on saved_ad(member_id, ad_id) makes a double tap on the heart a no-op instead of a duplicate row. The 200 limit is harder: count then insert is a race, so lock the member row with FOR UPDATE, or enforce it in a single statement, and test with 50 concurrent requests.`
    ],
    table: {
      head: [`Situation`, `Fix`, `Cost`],
      rows: [
        [`Increment a counter`, `UPDATE x = x + 1 (atomic)`, `None worth noting`],
        [`Claim a unique slot`, `Conditional UPDATE or unique constraint`, `Handle zero rows or a constraint error`],
        [`Rare conflicting edits`, `Version column, retry on zero rows`, `A retry path`],
        [`Frequent conflicts on a row`, `SELECT FOR UPDATE, lock order, short transaction`, `Waiting and deadlock risk`]
      ]
    }
  },
  technique: [
    { t: `Find the read-then-write gaps`, x: `Search the diff for a read followed by a decision and a write on the same data, and ask what happens if another request interleaves.` },
    { t: `Prefer one atomic statement`, x: `Fold the condition into the UPDATE or INSERT, and check the affected row count.` },
    { t: `Back invariants with constraints`, x: `Unique, foreign key and check constraints cannot be raced around, whatever the application code does.` },
    { t: `Pick a lock style on purpose`, x: `Optimistic with a version when conflicts are rare, FOR UPDATE when they are common, and write down why.` },
    { t: `Prevent deadlocks`, x: `Lock in a fixed order, keep transactions short, and retry when the database aborts one.` },
    { t: `Write a concurrent test`, x: `Run many parallel requests at the same row and assert the invariant, such as exactly one reservation succeeds.` }
  ],
  mistakes: [
    { t: `A check in code, nothing in the database`, ctx: `The code checks that the username is free, then inserts. Two sign-ups pass the check at the same moment.`, fix: `Add the unique constraint, and treat the constraint error as the normal "already taken" answer.` },
    { t: `An in-process lock on several instances`, ctx: `A mutex in the application protects the reservation, but there are 6 instances, so it protects nothing across them.`, fix: `Use a database-level mechanism (conditional update, row lock) that all instances share.` },
    { t: `A distributed lock with a TTL as the only guard`, ctx: `A worker pauses past its lock expiry, another takes the lock, and both write.`, fix: `Make the write conditional on the data (version or fencing token) so a stale holder is rejected.` }
  ],
  review: [
    `Which reads in this change are followed by a write that depends on them? What happens if two requests interleave?`,
    `Is each invariant backed by a database constraint or an atomic statement, not only a code check?`,
    `Which isolation level and lock style are used, and why does that fit the conflict rate?`,
    `Where is the test with parallel requests that fails if the fix is removed?`,
    `Red flag: a lock held in memory in a multi-instance service, or a lock with a TTL as the only protection.`
  ],
  exercise: {
    prompt: `Two requests both create a conversation between the same buyer and seller for the same ad. The agent writes: if no conversation exists, insert one. How do you make it correct?`,
    answer: `<p>Add a unique constraint on conversation(ad_id, buyer_id) (the seller follows from the ad). Then insert with <code>INSERT ... ON CONFLICT (ad_id, buyer_id) DO NOTHING</code> and read the existing row if nothing was inserted, or use <code>ON CONFLICT DO UPDATE</code> that returns the row. Both requests then end with the same single conversation, with no lock held in application code.</p><p>The test fires 20 parallel requests for the same pair and asserts one row exists and all get the same id.</p>`
  },
  checklist: [
    `I listed every read-then-write on shared data and checked the interleaving.`,
    `Invariants are backed by constraints or atomic statements.`,
    `The lock style is chosen with a reason and deadlocks are handled by lock order and retry.`,
    `No in-memory locks protect data shared across instances.`,
    `A concurrent test exists and fails without the fix.`
  ],
  artifact: `Section 6 of the performance report: a concurrency-hazard list (shared data, hazard, fix, test) with the parallel test results.`,
  agent: `The agent marks every read-then-write in its own code, closes it with a constraint or an atomic statement where it can, and adds a parallel test that fails on the unfixed version.`,
  src: `PostgreSQL manual: Explicit Locking (row-level locks, deadlocks), Transaction Isolation, INSERT ... ON CONFLICT. M. Kleppmann, How to do distributed locking, 2016 (fencing tokens), and Designing Data-Intensive Applications, ch. 7 (transactions, lost updates, write skew). Backend from First Principles, chapter 20 (concurrency). The Postgres course page on this site.`
}
];
