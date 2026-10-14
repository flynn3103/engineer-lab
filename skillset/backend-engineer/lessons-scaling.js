/* Scaling out: five lessons. Running scenario: a classifieds marketplace. All numbers are invented examples. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['scaling'] = [
{
  title: `Stateless services and load balancing`,
  short: `Scale the application tier by adding identical servers behind a load balancer, and know what each balancing algorithm assumes.`,
  why: `Adding application servers is the first and cheapest way to scale out, and it only works if the servers are interchangeable and the traffic is spread well. An agent will write "put it behind a load balancer" as if that settled the matter. A reviewer asks which algorithm, how health is checked, and what happens to the work in flight when a server goes away.`,
  concept: [
    `<b>Vertical scaling</b> makes one machine bigger. <b>Horizontal scaling</b> (scaling out) adds more machines. Horizontal scaling of the application tier requires the servers to be <b>stateless</b> (see the architecture module): any server can serve any request, because sessions, files and counters live elsewhere.`,
    `A <b>load balancer</b> receives client connections and forwards each request to one of several servers. A <b>layer 4</b> balancer works on connections (TCP) and is fast and simple. A <b>layer 7</b> balancer understands HTTP, so it can route by path or header, terminate TLS, and retry a request on another server. Layer 7 gives more control and costs more per request.`,
    `Common <b>algorithms</b>. <b>Round robin</b>: take servers in turn. It assumes requests cost about the same. <b>Weighted round robin</b>: bigger servers get a larger share. <b>Least connections</b>: send the next request to the server with the fewest open connections, which suits requests with very different durations. <b>IP hash or sticky sessions</b>: the same client goes to the same server, which hides a state problem rather than solving it. <b>Consistent hashing</b>: route by a key (such as an ad id) so that adding or removing a server moves only a small share of keys, useful in front of caches.`,
    `<b>Health checks</b> remove broken servers from rotation. A passive check watches real responses for errors. An active check calls a health endpoint. As in the mindset module, the endpoint should test the dependencies the server needs, and <b>readiness</b> (can take traffic) is different from <b>liveness</b> (the process is alive). Without health checks, a dead server keeps receiving a share of requests.`,
    `Removing a server safely needs <b>connection draining</b>: stop sending new requests, let in-flight ones finish for a bounded time, then stop. Deploys, scale-in and failures all rely on this. Also remember the balancer is itself a component that can fail, so it is run as a redundant pair or provided as a managed service.`,
    `Scaling the application tier moves the bottleneck. If every server shares one database, doubling servers doubles the connections to it. The <b>connection pool</b> arithmetic matters: 20 servers with 30 connections each is 600 connections, which can exceed what the database accepts.`
  ],
  terms: [
    [`Horizontal scaling`, `Adding more machines instead of a bigger one.`],
    [`Layer 4 and layer 7`, `Balancing by TCP connection versus by HTTP request content.`],
    [`Sticky session`, `Routing a client to the same server every time.`],
    [`Connection draining`, `Letting in-flight requests finish before a server leaves rotation.`]
  ],
  example: {
    setup: `The marketplace app tier serves about 720 requests per second at peak (invented). One server handles about 150 requests per second at its latency target (invented), so the agent proposes 6 servers behind a load balancer using round robin.`,
    body: [
      `Count: 720 / 150 is 4.8, so 5 servers carry the peak, and a sixth gives headroom for one failure. That is N+1. Now the review questions. Round robin assumes equal request cost, but "open ad" takes 30 ms and "search with filters" takes 400 ms, so some servers get more heavy requests by chance. Least connections would even this out. Are sessions in server memory? If yes, a server that leaves loses them. Is the health check testing the database? Is there a drain time of 30 seconds on deploy?`,
      `Connections: 6 servers x 25 pool connections = 150, which must be under the database's limit with room for migrations and tools. If the database allows 200, the plan has little room to add servers, which is the real constraint to record. A connection pooler in front of the database is the usual next step.`
    ],
    table: {
      head: [`Algorithm`, `Assumes`, `Good for`, `Watch out for`],
      rows: [
        [`Round robin`, `Equal request cost`, `Uniform, short requests`, `Heavy requests pile up on some servers`],
        [`Least connections`, `Open connections reflect load`, `Mixed request durations`, `A fresh server gets a burst on start`],
        [`IP hash, sticky`, `Client keeps one address`, `Legacy apps with local state`, `Uneven load, lost state on failure`],
        [`Consistent hash by key`, `A good key exists`, `Cache tiers, shard routing`, `Hot keys overload one node`]
      ]
    }
  },
  technique: [
    { t: `Size the tier from the estimate`, x: `Peak rate divided by per-server capacity, plus one or two for failure. Mark the per-server figure as measured or assumed.` },
    { t: `Confirm statelessness`, x: `No sessions, files or counters in server memory. Kill one instance and check that no user data is lost.` },
    { t: `Pick the algorithm for the request mix`, x: `Equal cost, round robin. Mixed cost, least connections. Keyed caches, consistent hashing.` },
    { t: `Define health checks and draining`, x: `Readiness that tests required dependencies, a drain time longer than the slowest normal request.` },
    { t: `Recompute the downstream load`, x: `Servers times pool size against the database connection limit, and the load on every dependency.` }
  ],
  mistakes: [
    { t: `Sticky sessions as a fix`, ctx: `Logins break on the second server, so the balancer is set to stick by IP. When the server restarts, everyone on it is logged out, and one office network overloads one server.`, fix: `Move the session to a signed token or shared store, and keep stickiness off unless there is a reason.` },
    { t: `Scaling servers against a fixed database`, ctx: `Traffic doubles, the agent doubles servers, and the database runs out of connections and slows everyone down.`, fix: `Do the connection arithmetic first. Use a pooler, and find out whether the database is the real limit.` },
    { t: `Health check that only says ok`, ctx: `The endpoint returns 200 even when the database connection is gone, so users get errors from a server that is still in rotation.`, fix: `Check required dependencies in readiness, keep liveness light, and test by breaking the dependency.` }
  ],
  review: [
    `How many servers, and from which per-server capacity and which peak rate? Is there N+1 headroom?`,
    `Which balancing algorithm was chosen, and does it match the mix of cheap and expensive requests?`,
    `Is any state still in server memory, and does a rolling deploy lose it?`,
    `What do the health check and the drain time look like, and how many connections will all servers open to the database?`,
    `Red flag: "just add more servers" with no per-server capacity figure and no look at the database.`
  ],
  exercise: {
    prompt: `Peak is 1,200 requests per second and one server handles 200 at target latency (invented). Pool size is 20 per server and the database accepts 100 client connections for the app. Is a plan of 8 servers fine?`,
    answer: `<p>Capacity: 1,200 / 200 is 6, so 6 servers at the limit with no failure margin, and 8 gives headroom for two failures. Connections: 8 x 20 = 160, above the 100 the database accepts, so the plan fails at startup or under load. Options: reduce the pool to 12 (8 x 12 = 96, tight), put a connection pooler in front, or find out whether requests really need a connection for their whole duration. The point is that the database limit, not the server count, constrains this plan, and the review should say so. All numbers are invented.</p>`
  },
  checklist: [
    `Server count comes from a stated peak rate and per-server capacity, with headroom.`,
    `The servers are stateless, tested by killing one.`,
    `The balancing algorithm matches the request mix.`,
    `Health checks and draining are defined, and connection totals are under the database limit.`
  ],
  artifact: `Section 1 of the scaling plan: the application tier sizing, the balancing choice, health and drain settings, and the connection arithmetic.`,
  agent: `The agent computes server count and the downstream connection total from your estimate, recommends an algorithm for the request mix, finds state in server memory, and specifies readiness and drain settings for the deploy.`,
  src: `M. Kleppmann, Designing Data-Intensive Applications, ch. 1 (scalability, load parameters) and ch. 6 (request routing). The Twelve-Factor App (A. Wiggins), factors VI and IX. Documentation of your load balancer for the exact algorithm names. Course pages on this site: Kubernetes (services, readiness and liveness probes) and PostgreSQL (connection limits). Backend from First Principles, chapter 19 (scaling mental models). Capacities are invented.`
},
{
  title: `Read replicas and replication lag`,
  short: `Spread read traffic over copies of the database, and design for the fact that a copy can be behind the primary.`,
  why: `For a read-heavy marketplace, replicas are the cheapest way to add database read capacity. They also introduce a class of bug that tests rarely show: a member posts an ad, reloads, and it is missing. A reviewer must ask where reads go and what the code does when a copy is behind.`,
  concept: [
    `In <b>primary-replica replication</b>, one node (the primary, also called leader) accepts all writes and ships its change log to one or more <b>replicas</b> (followers), which apply the changes and serve read-only queries. Reads scale by adding replicas. Writes do not scale this way, because every write still goes to the one primary and every replica must apply it.`,
    `Replication is <b>asynchronous</b> by default in most systems: the primary confirms a write to the client before the replicas have it. So a replica is always some time behind, the <b>replication lag</b>, usually small but unbounded under load or a long-running query on the replica. <b>Synchronous</b> replication waits for a replica to confirm, which removes lag for that replica and a durability risk on failover, but adds latency and makes the primary depend on it. Check your engine's documentation for the exact options.`,
    `Lag causes <b>anomalies</b> that Kleppmann names. <b>Read-your-writes</b>: you write, then read from a stale replica and your own change is missing. <b>Monotonic reads</b>: you read from a fresh replica, then a stale one, and see data go back in time. <b>Consistent prefix</b>: related writes appear in the wrong order on a replica. A replica read is only safe where such an anomaly is acceptable.`,
    `Remedies. Send reads that must see the user's own write to the <b>primary</b>, for a short time after that user writes, or always for that screen. Pin a user's reads to <b>one replica</b> to make reads monotonic. Track a <b>log position</b> and read from a replica only when it has reached the position of the user's last write. Or accept staleness where the requirement says so, such as view counts.`,
    `<b>Monitor lag</b> and act on it: alarm when lag exceeds the tolerance in the requirement, and stop routing to a replica that is too far behind. Plan for <b>failover</b>: a replica promoted to primary may be missing the last writes under asynchronous replication. Also, a replica gives read capacity and a recovery path, but it is not a backup, because a mistaken delete replicates to it too.`
  ],
  terms: [
    [`Primary and replica`, `The node that accepts writes and the copies that apply its changes and serve reads.`],
    [`Replication lag`, `How far behind the primary a replica is, in time or log position.`],
    [`Read-your-writes`, `After you write, your own reads see that write.`],
    [`Failover`, `Promoting a replica to primary when the primary fails.`]
  ],
  example: {
    setup: `Estimates say 720 reads per second at peak and under 1 write per second for ads (invented). The agent adds two read replicas and sends all SELECT queries to them.`,
    body: [
      `Scenario: a seller posts an ad, is redirected to "my ads", the query runs on a replica that is 400 ms behind, and the new ad is missing. The seller posts again, and now there are two. Requirement NFR-3 from the spec allows the public list to be 5 seconds behind, but nobody allowed the seller's own page to be stale.`,
      `The fix: classify reads. Public search and ad detail reads go to replicas (staleness within 5 seconds is accepted). For 10 seconds after a member writes, that member's "my ads" reads go to the primary. Lag is monitored with an alarm at 2 seconds and the router drops a replica whose lag exceeds 5. Saved ads needs a check: after saving, the list must show the new entry, so it reads from the primary on the writing member's session, or the write response carries the new row.`
    ],
    table: {
      head: [`Read`, `Staleness allowed`, `Route`],
      rows: [
        [`Public ad detail`, `Up to 5 s`, `Replica`],
        [`Search results (index)`, `Up to 60 s`, `Search index, not the database`],
        [`My ads right after posting`, `None`, `Primary for 10 s, then replica`],
        [`Saved list after saving`, `None for the writer`, `Primary, or return the new row in the write response`],
        [`Failover or restore`, `Not a replica job`, `Use backups and tested recovery`]
      ]
    }
  },
  technique: [
    { t: `Classify every read by tolerable staleness`, x: `Write the number next to each read path, taken from the requirements. If none is stated, ask.` },
    { t: `Route by class`, x: `Strict reads to the primary, tolerant reads to replicas. Do not route by "all SELECT goes to replicas".` },
    { t: `Handle read-your-writes`, x: `Use a short post-write window on the primary, a log position check, or return the written row.` },
    { t: `Monitor and cap lag`, x: `Alarm threshold, and remove from rotation a replica beyond the tolerance.` },
    { t: `Plan failover and say what can be lost`, x: `State the data at risk under asynchronous replication and the procedure to promote. Test it.` }
  ],
  mistakes: [
    { t: `All reads to replicas`, ctx: `A rule "SELECT goes to replicas" breaks read-your-writes in several screens, and the bugs show as intermittent.`, fix: `Classify reads, and add a test that writes then reads at once under artificial lag.` },
    { t: `Replica as a backup`, ctx: `A bad migration drops a table. The replicas drop it a moment later, and the team finds the replica is not a backup.`, fix: `Keep separate backups with point-in-time recovery, and test a restore.` },
    { t: `Ignoring lag until it hurts`, ctx: `A long analytical query on a replica delays applying changes, and lag grows to minutes with no alarm.`, fix: `Alarm on lag, separate analytic workloads, and check the engine's behavior for conflicts between queries and replication.` }
  ],
  review: [
    `Which reads go to replicas, and what staleness does each read tolerate according to the spec?`,
    `What happens when a member writes and reads back immediately? Is there a test that simulates lag?`,
    `What is the lag alarm threshold, and does the router stop using a lagging replica?`,
    `What is lost if the primary fails and a replica is promoted, and has failover been rehearsed?`,
    `Red flag: replicas described as redundancy or backup, or all reads redirected with no staleness analysis.`
  ],
  exercise: {
    prompt: `A buyer sends a message and the conversation page, served by a replica, does not show it for a second. List the anomaly name, two fixes, and the trade-off of each.`,
    answer: `<p>Anomaly: read-your-writes (also seen as a missing recent message). Fix one: read the sender's own conversation from the primary for a short window after they send (simple, but more load on the primary during chat bursts). Fix two: return the stored message in the send response and let the client add it to the page, then reconcile when the replica catches up (no extra primary load, more client logic and a possible brief duplicate to deduplicate by message id).</p><p>A third option is to track the log position of the write and read from a replica that has reached it, which is precise but needs support from the database and the data layer.</p>`
  },
  checklist: [
    `Every read path has a staleness tolerance linked to a requirement.`,
    `Read-your-writes is handled for screens that show a user's own data.`,
    `Lag is monitored with an alarm, and a lagging replica leaves rotation.`,
    `Replicas are not treated as backups, and failover loss is stated.`
  ],
  artifact: `Section 2 of the scaling plan: a read classification table (read, staleness, route), the lag alarm, and the failover note.`,
  agent: `The agent classifies reads by staleness from your requirements, routes accordingly, writes a test that reads right after a write under simulated lag, and documents what a failover can lose.`,
  src: `M. Kleppmann, Designing Data-Intensive Applications, ch. 5 (replication lag, read-your-writes, monotonic reads, consistent prefix reads). PostgreSQL manual, high availability, load balancing and replication chapter (streaming replication, synchronous and asynchronous) for the exact options of that engine. Course pages on this site: PostgreSQL internals (WAL and replication), ScyllaDB (replication factor and consistency levels). Numbers are invented examples.`
},
{
  title: `Sharding and partitioning`,
  short: `Split one data set across several nodes by a key when writes or size outgrow one machine, and accept the new costs.`,
  why: `Sharding is the heaviest tool in the scaling box. It is the only way to scale writes and storage beyond one machine, and it permanently complicates queries, transactions and operations. A reviewer must make sure the data really outgrew one node, and that the shard key was chosen with the access patterns in front of it.`,
  concept: [
    `<b>Partitioning</b> splits a table into pieces. Inside one database it can keep tables manageable (for example one partition per month). <b>Sharding</b> spreads the pieces over several nodes, so each node holds a subset of rows and handles only its share of reads and writes. Writes and storage scale with the number of shards.`,
    `The <b>shard key</b> decides which shard a row lives on. <b>Range</b> partitioning keeps neighbouring keys together (good for range scans, risk of a hot shard when new keys are always the largest, such as time). <b>Hash</b> partitioning spreads keys evenly (good balance, but range scans must visit every shard). <b>Directory</b> (lookup table) partitioning maps keys to shards freely, at the price of the lookup. Hashing with plain modulo by shard count reshuffles almost everything when the count changes, so <b>consistent hashing</b> or many small fixed partitions mapped to nodes is used instead.`,
    `A good shard key has <b>high cardinality</b>, spreads <b>load evenly</b> and matches the <b>main access pattern</b> so most queries touch one shard. For the marketplace, <code>member_id</code> keeps one member's saved ads and conversations together, while <code>category_id</code> would create hot shards (a few categories carry most ads). A <b>hot key</b> (a celebrity seller) can still overload one shard and needs special handling.`,
    `What you lose. A query that does not include the shard key goes to <b>all shards</b> (scatter and gather) and is as slow as the slowest. <b>Joins across shards</b> and <b>transactions across shards</b> are hard or unsupported, so you denormalize or accept eventual consistency. <b>Global unique constraints</b> (one email across all) need a separate mechanism. <b>Resharding</b>, moving data when you add nodes, is a major operation and is much easier when planned.`,
    `Try <b>everything cheaper first</b>: an index fix, a cache, read replicas, archiving old data, a bigger machine, and partitioning within one node. Shard when a measured limit (write throughput, storage, or working set that does not fit memory) cannot be fixed another way, and when the key is clear. Some systems, such as Cassandra and ScyllaDB, are built around partitioning from the start (see the ScyllaDB course on this site), which shifts the choice to the data model rather than a later retrofit.`
  ],
  terms: [
    [`Shard key`, `The column whose value decides which shard holds a row.`],
    [`Hot shard`, `A shard that gets much more load than the others.`],
    [`Scatter and gather`, `A query sent to all shards and merged, needed when the key is absent.`],
    [`Resharding`, `Moving data between nodes when the number of shards changes.`]
  ],
  example: {
    setup: `Suppose, with invented numbers, that chat grows to 20,000 message writes per second and 8 TB of messages, past what one primary handles. The agent proposes sharding message by <code>conversation_id</code>.`,
    body: [
      `Check against access patterns: "load the last 50 messages of a conversation" touches one shard (good), "send a message" writes one shard (good), "list my conversations ordered by latest activity" needs a row per conversation per member, which is a cross-shard query if conversations are sharded by id and a member is in many of them. The fix: keep a small <code>member_conversation</code> index sharded by <code>member_id</code> and update it when a message arrives, and accept it is derived data with its own lag. The shard key choice drove a schema change.`,
      `Other checks. Distribution: conversation ids are random UUIDs, so hashing spreads them evenly. Hot keys: a support account in thousands of conversations is not a hot shard here, because each conversation is on one shard. Resharding plan: use 256 fixed logical partitions mapped to physical nodes, so adding a node moves whole partitions rather than rehashing every row. Record all of this and the trigger in an ADR.`
    ],
    table: {
      head: [`Candidate key`, `Even spread?`, `Main query on one shard?`, `Verdict`],
      rows: [
        [`category_id`, `No, a few categories dominate`, `Search by category yes, others no`, `Poor: hot shards`],
        [`created_at (range)`, `No, all writes hit the newest range`, `Recent messages yes`, `Poor for writes, fine for archive`],
        [`conversation_id (hash)`, `Yes`, `Load and send yes, list my conversations no`, `Good, with a member index`],
        [`member_id (hash)`, `Mostly`, `A member's data yes, a two-member conversation spans two`, `Needs duplication of messages`]
      ]
    }
  },
  technique: [
    { t: `Prove one node is not enough`, x: `Show the measured limit: write rate, storage, or memory. Name what cheaper steps were tried.` },
    { t: `List the access patterns first`, x: `Every frequent query and write, with its rate. The key must serve the main ones in one shard.` },
    { t: `Choose the key and the method`, x: `Hash, range or directory, with reasons. Check cardinality, spread and hot keys.` },
    { t: `Fix the cross-shard queries`, x: `For each, choose: derived index, denormalized copy, scatter and gather, or a dropped feature.` },
    { t: `Plan resharding and operations`, x: `Fixed logical partitions or consistent hashing, a rebalance procedure, per-shard backups and monitoring of skew.` }
  ],
  mistakes: [
    { t: `Sharding because it is scalable`, ctx: `The agent shards a 40 GB table with 5 writes per second. Every query is now more complex and nothing was slow.`, fix: `Require the measurement that one node cannot cope, and try the cheaper options first.` },
    { t: `A key chosen without the queries`, ctx: `Sharding by category sends most traffic to two shards, and the busiest query still touches all of them.`, fix: `Start from the access patterns and test the key against each, using real data for skew.` },
    { t: `Modulo sharding`, ctx: `Rows are placed by id modulo 4. Adding a fifth node moves about 80 percent of the data.`, fix: `Use many fixed logical partitions or consistent hashing, so a new node takes a small share.` }
  ],
  review: [
    `What measured limit shows one node, with replicas and caching, is not enough?`,
    `What is the shard key, and which access patterns hit one shard versus all of them?`,
    `How is the key distributed in real data, and how are hot keys handled?`,
    `How are cross-shard queries, transactions and unique constraints handled?`,
    `Red flag: a sharding proposal with no access pattern list, no resharding plan and no evidence of a limit.`
  ],
  exercise: {
    prompt: `The agent proposes sharding the ad table by <code>created_at</code> month. Name two problems for the marketplace and one improvement.`,
    answer: `<p>Problems: all current writes go to the newest shard, so write load is not spread (a hot shard), and a "my ads" query for a member spans many months, so it hits many shards. Also search by category covers all months.</p><p>Improvement: shard by hash of <code>ad_id</code> or <code>member_id</code> for even spread, and keep time-based partitioning inside each shard to archive old data. But first ask whether the ad table needs sharding: at under 1 write per second and tens of GB (invented), one node with indexes and replicas is enough, so the right answer may be no sharding.</p>`
  },
  checklist: [
    `A measured limit justifies sharding, and cheaper options were tried.`,
    `The shard key is checked against every main access pattern and against real data skew.`,
    `Cross-shard queries and constraints each have a stated answer.`,
    `A resharding plan exists and avoids modulo placement.`
  ],
  artifact: `Section 3 of the scaling plan: the evidence for sharding, the shard key decision record with access patterns and distribution, and the resharding plan.`,
  agent: `The agent refuses to shard without a measured limit, tests candidate keys against your access pattern list and sample data, lists the cross-shard queries it would create, and drafts the decision record and resharding plan.`,
  src: `M. Kleppmann, Designing Data-Intensive Applications, ch. 6 (partitioning, skew and hot spots, rebalancing, request routing). D. Karger et al., Consistent Hashing and Random Trees, STOC 1997. PostgreSQL manual: table partitioning. Course pages on this site: ScyllaDB (token ring, partition keys) and Kafka (partitions). Volumes are invented examples.`
},
{
  title: `CDNs and the edge`,
  short: `Serve static and cacheable content from locations close to users, and control exactly what may be cached and for how long.`,
  why: `For a marketplace, images are most of the bytes, and most of the cost and latency. A content delivery network takes that load off your servers. It also introduces stale content and, if configured carelessly, the risk of caching private data and serving it to the wrong person.`,
  concept: [
    `A <b>content delivery network</b> (CDN) is a set of servers in many locations (<b>edge</b> or points of presence) that cache copies of your content near users. A request goes to the nearest edge. On a <b>cache hit</b> the edge answers directly. On a <b>miss</b> it fetches from your <b>origin</b>, stores the response and answers. A high hit ratio lowers latency, origin load and bandwidth cost.`,
    `The origin controls caching with HTTP headers. <code>Cache-Control: public, max-age=31536000, immutable</code> tells caches that a file may be stored for a year and will not change. <code>s-maxage</code> sets a lifetime for shared caches such as a CDN, separately from browsers. <code>private</code> means only the user's browser may store it, and <code>no-store</code> means nobody should. The <code>Vary</code> header says which request headers change the response. These are defined in RFC 9111 (HTTP caching) and RFC 9110.`,
    `<b>Invalidation</b> is the hard part. Options: wait for the <b>TTL</b> to expire, <b>purge</b> a URL through the CDN's API (works, but is eventual and rate limited), or <b>version the URL</b> so a change makes a new URL. For images, use <b>content-addressed or versioned names</b> (for example a hash in the file name), then cache for a year and never purge. HTML and API responses change, so they get short lifetimes or none.`,
    `<b>Security and correctness.</b> Never cache a response that depends on the user (a personal page, an authorization header) as shared content, or one member sees another's data. Mark them <code>private</code> or <code>no-store</code>, and check how the CDN builds its cache key (which headers and cookies it includes). Protect private images with <b>signed, expiring URLs</b>. A CDN also absorbs bursts and helps with some denial of service attacks, but it can hide the origin address from users only if the origin is locked down.`,
    `<b>Edge compute</b> runs small pieces of code at the edge: redirects, header rewriting, A/B routing, simple personalization, image resizing. It brings logic close to users, but the code is limited in runtime and state, data stays at the origin, and debugging is harder. Use it for stateless, latency-sensitive logic, not as a second backend.`
  ],
  terms: [
    [`Origin`, `Your own servers or storage that hold the real content.`],
    [`Hit ratio`, `The share of requests the edge answers without going to the origin.`],
    [`TTL`, `How long a cached copy may be used before it must be refreshed.`],
    [`Cache key`, `What the CDN uses to decide whether two requests are the same.`],
    [`Signed URL`, `A URL with a signature and expiry that grants temporary access.`]
  ],
  example: {
    setup: `Images are about 14.6 TB per year of storage and dominate bandwidth (invented numbers). The agent proposes serving images from object storage through a CDN, and caching ad pages as well.`,
    body: [
      `Images: upload creates a name that includes a content hash (<code>ad_image/9f2c...e1.jpg</code>), so each version has its own URL. The response carries <code>Cache-Control: public, max-age=31536000, immutable</code>. A seller who replaces a photo gets a new URL, so no purge is needed. Hit ratio target: above 95 percent (invented), watched as a metric. Origin load falls to the misses.`,
      `Ad pages: the HTML for the public ad detail is the same for every anonymous viewer, so it can be cached by the CDN for 60 seconds with <code>s-maxage=60</code>, accepting up to a minute of staleness as the spec allows. But the page also shows "saved" state for a signed-in member. Caching it as shared would show one member's state to another. The fix: cache the anonymous shell, and fetch the personal part with a separate request marked <code>private, no-store</code>. Check that the CDN cache key ignores marketing query parameters, or the hit ratio collapses.`
    ],
    table: {
      head: [`Content`, `Cache-Control (example)`, `Invalidation`],
      rows: [
        [`Ad image with hashed name`, `public, max-age=31536000, immutable`, `New URL on change`],
        [`Public ad HTML`, `public, s-maxage=60`, `TTL, optional purge on edit`],
        [`Personal data such as saved state`, `private, no-store`, `Never shared`],
        [`Private attachment in chat`, `Signed URL with short expiry`, `Expiry`]
      ]
    }
  },
  technique: [
    { t: `List content by cacheability`, x: `Static and immutable, public but changing, personal, private. Give each a header policy.` },
    { t: `Version static assets`, x: `Put a hash or version in the URL, set a long max-age with immutable, and avoid purges.` },
    { t: `Set short TTLs for changing public content`, x: `Choose the lifetime from the staleness the spec allows, and use s-maxage for the CDN.` },
    { t: `Keep personal data out of shared caches`, x: `private or no-store, a safe cache key, signed URLs for private files. Test it with two accounts.` },
    { t: `Measure hit ratio and origin load`, x: `Track hit ratio, origin requests and the cost of misses. Fix cache key noise first.` }
  ],
  mistakes: [
    { t: `Caching personalized responses`, ctx: `A "my account" response is cached at the edge because it was a GET with a long TTL. Another member's session sees the first member's data.`, fix: `Mark personal responses private or no-store, make the cache key include what the response depends on, and test with two accounts.` },
    { t: `Purge as the invalidation plan`, ctx: `Every edit triggers a purge call. Under bulk edits the purge rate limit is hit and old images are served for hours.`, fix: `Version the URLs. Reserve purge for emergencies and bounded cases.` },
    { t: `A cache key that includes noise`, ctx: `Tracking parameters in the URL make each visit a different key, and the hit ratio is 20 percent.`, fix: `Normalize the key: strip irrelevant parameters, and include only the headers in Vary that change the response.` }
  ],
  review: [
    `Which content is cached, with which Cache-Control header, and what is the staleness allowed by the spec?`,
    `How are changed images and pages replaced: versioned URLs, TTL or purge?`,
    `Could any personalized or authorized response end up in a shared cache? Show the headers and the two-account test.`,
    `What is the hit ratio target and the cache key, and how are private files protected?`,
    `Red flag: a CDN placed in front of the whole site with default settings and no list of what must never be cached.`
  ],
  exercise: {
    prompt: `The CDN returns an old profile photo for two hours after a member changes it. Find the cause and give two fixes with trade-offs.`,
    answer: `<p>Likely cause: the photo URL is stable (for example <code>/photo/123.jpg</code>) and was cached with a long max-age, so the edge and browsers keep the old file until the TTL ends.</p><p>Fix one: version the URL (a hash or a version number in the path). Trade-off: pages that reference the photo must be updated to the new URL, so caches of those pages need short lifetimes. Fix two: a shorter TTL, optionally with a purge on change. Trade-off: more misses and origin load, and purge is eventual and rate limited. Versioned URLs are preferred for files that rarely change.</p>`
  },
  checklist: [
    `Each kind of content has a stated Cache-Control policy.`,
    `Static files use versioned URLs and long lifetimes.`,
    `Personal and private content cannot enter a shared cache, verified with two accounts.`,
    `Hit ratio and origin load are measured, and the cache key is normalized.`
  ],
  artifact: `Section 4 of the scaling plan: a content cache policy table (content, headers, invalidation) and the hit ratio target.`,
  agent: `The agent classifies content by cacheability, emits the header policy for each class, switches static assets to versioned names, and writes a test with two accounts that proves personalized responses are never served from a shared cache.`,
  src: `RFC 9111 (HTTP Caching) and RFC 9110 (HTTP Semantics): Cache-Control, Vary, freshness. Documentation of your CDN for its cache key, purge and edge compute behavior and limits (check the current figures). OWASP guidance on caching sensitive data. Course pages on this site: Redis (caching and invalidation). Sizes and the hit ratio target are invented.`
},
{
  title: `Scaling mental models: measure first`,
  short: `Find the actual bottleneck with measurements before adding capacity, and know the laws that limit what scaling can do.`,
  why: `The most common scaling mistake is solving a bottleneck that does not exist. Adding servers to a database-bound system, or sharding a table that is slow because of one missing index, wastes money and adds complexity. An agent that scales on instinct has the same weakness a person has, so the habit to enforce is: measure, then change one thing, then measure again.`,
  concept: [
    `The <b>bottleneck</b> is the resource that limits throughput, and there is always one. Improving anything else gives no gain. Find it by looking at each resource. Brendan Gregg's <b>USE method</b> checks, for every resource (CPU, memory, disk, network, connection pools, locks): <b>utilization</b> (how busy), <b>saturation</b> (is work queuing) and <b>errors</b>. The RED method for services looks at <b>rate</b>, <b>errors</b> and <b>duration</b>.`,
    `Use the <b>ladder of cheaper steps</b> before heavy ones: fix the slow query and the missing index, remove N+1 queries, add a cache for read-mostly data, add application servers, add read replicas, serve static content from a CDN, move work to a queue, and only then partition and shard. Each rung should be justified by a measurement that the rung below it was not enough.`,
    `<b>Laws that bound the gains.</b> <b>Amdahl's law</b>: if a fraction <i>s</i> of the work is serial, the maximum speedup from any number of workers is 1 / s. If 10 percent of a request is a serial step such as a lock or a single primary write, 100 servers cannot give more than 10 times. The <b>Universal Scalability Law</b> (Neil Gunther) adds that contention and coordination between nodes can make adding capacity reduce throughput. <b>Little's law</b> links in-flight work to rate and latency.`,
    `<b>Capacity planning</b> needs a load test that resembles production: realistic data volume, request mix and concurrency, and a ramp up to saturation, watching p95 and p99, not the average. Find the knee where latency climbs, and set a target utilization well below it. Re-run after changes. Use autoscaling on a metric that reflects the bottleneck (queue age or in-flight requests, not only CPU), with limits so it cannot scale up a downstream failure.`,
    `Remember <b>cost and operability</b>. Every scaling step adds something to run: more nodes to patch, more lag to monitor, more failure modes. Record the trigger for each step (the number at which you would take it) and the owner of the cost. The goal is the simplest system that meets the stated targets with headroom, not the largest.`
  ],
  terms: [
    [`Bottleneck`, `The resource that currently limits throughput.`],
    [`USE method`, `For each resource check utilization, saturation and errors (B. Gregg).`],
    [`Amdahl's law`, `Speedup is limited by the serial fraction of the work.`],
    [`Knee`, `The load at which latency starts to rise sharply.`]
  ],
  example: {
    setup: `Complaint: ad search got slow at peak, and the agent proposes "double the servers and add two replicas". Apply the method. All numbers are invented.`,
    body: [
      `Measure: at peak, app server CPU is 35 percent, the database CPU is 90 percent, and p99 for search is 1.8 s against a 300 ms target. The database is saturated, not the servers. A plan from the profile: one query dominates, a filter by category and status that scans 3 million rows because the index does not cover the ordering. Adding an index brings that query from 380 ms to 12 ms, the database CPU falls to 40 percent, and p99 drops to 240 ms. Doubling the servers would have changed nothing.`,
      `The next limit comes later: when peak traffic grows 5 times, the plan says read replicas first (reads dominate), then a cache for hot ad pages, then a CDN for images, each with a trigger such as "database CPU above 70 percent at peak for a week". Sharding is not on the list because writes are under 1 per second. The scaling plan is this table, tied to measurements.`
    ],
    table: {
      head: [`Step`, `Trigger (a measurement)`, `What it fixes`],
      rows: [
        [`Fix query or index`, `One query dominates database time`, `CPU saturation from a bad plan`],
        [`Add app servers`, `App CPU above 70 percent at peak`, `Application tier capacity`],
        [`Add read replicas`, `Database read CPU above 70 percent, reads are over 95 percent of load`, `Read capacity`],
        [`Cache or CDN`, `Hot read-mostly data or image bandwidth`, `Latency and origin load`],
        [`Shard`, `Write rate or size beyond one node, cheaper steps exhausted`, `Write and storage scale`]
      ]
    }
  },
  technique: [
    { t: `Reproduce the problem with numbers`, x: `Peak load, p95 and p99 against the target, and which endpoint.` },
    { t: `Find the saturated resource`, x: `Check utilization, saturation and errors for CPU, memory, disk, network, pools and locks. Look at traces and query plans.` },
    { t: `Change one thing and re-measure`, x: `Take the cheapest step that addresses the bottleneck. Compare with the same load.` },
    { t: `Test with a realistic load to the knee`, x: `Realistic data, request mix and concurrency. Find where latency climbs and plan to stay below it.` },
    { t: `Write the plan as triggers`, x: `Each scaling step has a measured trigger, an owner and a cost. Revisit after growth or a release.` }
  ],
  mistakes: [
    { t: `Scaling the wrong tier`, ctx: `Slow responses lead to more servers. The database is the bottleneck, and the extra servers only add connections and make it worse.`, fix: `Measure each resource first. Scale the one that is saturated.` },
    { t: `Load tests on tiny data`, ctx: `The test database has 10,000 ads, so every query is fast. Production has 5 million, and the plan changes.`, fix: `Test with production-sized data and a realistic mix, and compare plans.` },
    { t: `Autoscaling on CPU alone`, ctx: `The service is slow because of a saturated dependency, so CPU stays low, nothing scales, and a retry storm makes it worse.`, fix: `Scale on a signal tied to the bottleneck (queue age, in-flight requests, latency) and cap the maximum.` }
  ],
  review: [
    `What measurement identified the bottleneck? Show utilization, saturation and errors for the resource.`,
    `Which cheaper step was tried before this one, and what did it change?`,
    `Does the load test use realistic data, request mix and concurrency, and report p95 and p99?`,
    `What is the trigger for each next step, and who owns the cost?`,
    `Red flag: capacity added with no before and after measurement, or a diagram of a scaled architecture with no bottleneck evidence.`
  ],
  exercise: {
    prompt: `A request takes 100 ms, of which 20 ms is a serial step (a lock on a single counter row). What is the best speedup from adding workers, and what do you do about it?`,
    answer: `<p>The serial fraction is 20 / 100 = 0.2. By Amdahl's law the maximum speedup is 1 / 0.2 = 5 times, however many workers you add. Throughput of requests that go through that lock is capped at about 50 per second (1 / 0.02 s) per counter, whatever the number of servers.</p><p>Action: remove or shrink the serial step. For example, count in batches, shard the counter into several rows and sum them, move the update to an asynchronous worker, or accept approximate counts if the requirement allows. Then re-measure. This is why measuring where time and contention are comes before adding hardware. The numbers are invented.</p>`
  },
  checklist: [
    `The bottleneck is named, with utilization, saturation and errors as evidence.`,
    `Cheaper steps were applied first, each with a before and after measurement.`,
    `The load test uses realistic data and reports p95 and p99.`,
    `Each next scaling step has a measured trigger.`
  ],
  artifact: `The finished scaling plan: the measured bottleneck, the ladder of steps with a trigger, an owner and a cost for each, and the load test results.`,
  agent: `The agent runs the measurement checklist before proposing capacity, shows before and after numbers for every change, writes the plan as a table of triggers, and refuses to recommend sharding or new infrastructure without evidence that cheaper steps were exhausted.`,
  src: `B. Gregg, Systems Performance, 2nd ed., Addison-Wesley 2020 (the USE method). T. Wilkie, the RED method (Weaveworks, 2015). G. Amdahl, 1967 (Amdahl's law). N. Gunther, Guerrilla Capacity Planning, Springer 2007 (Universal Scalability Law). J. Dean and L. Barroso, The Tail at Scale, CACM 2013. Backend from First Principles, chapter 19 (measure first, start simple). Numbers are invented examples.`
}
];
