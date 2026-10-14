/* Capstone: design and review a URL shortener. Five lessons. The marketplace uses short links to share ads, so the running scenario continues.
 * All numbers are invented examples. Reuses the habits of the Mindset and review method module and the topics of the API, Data modeling,
 * Identity and security, Performance, Reliability, Scaling, Async and Testing modules, by title only. Topic list informed by the
 * URL shortener chapter of DsThakurRawat/Backend-from-first-Principle (heading only). */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['capstone'] = [
{
  title: `Problem statement and estimates for a URL shortener`,
  short: `State the problem with numbers and derive load, storage and key space before choosing any component.`,
  why: `This is the first habit of the Mindset and review method module applied to a whole service. A shortener looks trivial, which is exactly why agents answer it from memory. The estimates decide almost everything later: identifier length, whether a cache is needed, and which failures matter.`,
  concept: [
    `Start with the <b>four-part statement</b> from the Mindset module: scenario, naive design, fails when, principle. Then add <b>functional requirements</b> (what it must do), <b>non-functional requirements</b> (how well), and an explicit list of what is <b>out of scope</b>. The Collect the functional spec module covers how to turn a request into testable lines.`,
    `Functional requirements here: create a short link for a long URL (optionally for an ad of the marketplace), redirect a short code to its target, let the owner disable a link, and let the owner see click counts. Non-functional: redirects are fast and available (they sit in every shared message), links do not change meaning after being shared, and codes are hard to enumerate. Out of scope for now: custom domains, QR codes, per-click geography.`,
    `<b>Back-of-envelope estimates</b> turn the scenario into quantities, as in the Architecture and system design module. Use a read to write ratio, a peak factor, a retention period and a record size, and write down each assumption. The goal is the right order of magnitude, not precision.`,
    `<b>Key space</b> is a design quantity too. With 62 characters (a-z, A-Z, 0-9) a code of length 7 has 62^7, about 3.5 trillion, possible values. How many links you expect over the service lifetime against this number tells you how often a random code collides.`
  ],
  terms: [
    [`Read to write ratio`, `How many redirects happen for each created link.`],
    [`Peak factor`, `How much higher the busiest period is than the average.`],
    [`Key space`, `The number of distinct codes the chosen alphabet and length allow.`],
    [`Out of scope`, `Things deliberately not built now, listed so nobody assumes them.`]
  ],
  example: {
    setup: `The marketplace wants short links for sharing ads in chat and on social media: <code>market.example/s/aB3xK9q</code>. All numbers below are invented assumptions for the exercise, not measurements.`,
    body: [
      `Assumptions: 10 million new short links per month, 100 redirects per link over its life, mostly in the first days, links kept 5 years, a peak of 10 times the average, about 300 bytes per stored link.`,
      `Writes: 10,000,000 per month is about 4 per second on average (a month is about 2.6 million seconds), so a peak of about 40 per second. Redirects: 100 per link gives about 1 billion redirects per month, so roughly 400 per second on average and about 4,000 per second at peak. Storage: 10 million links per month for 60 months is 600 million links, times 300 bytes, about 180 GB. Key space: 600 million of 3.5 trillion is under 0.02 percent used, so a random 7-character code collides with an existing one about 1 time in 6,000.`,
      `Naive design: one web server and one table, looking up the code on every redirect. It fails when peak redirects reach thousands per second against a database that also takes writes, or when a single shared link goes viral and hits one row thousands of times a second. The principle: the redirect is a read-heavy, latency-sensitive path, so it must be cheap and cacheable, while the write path can afford more work.`
    ],
    table: {
      head: [`Quantity`, `Assumption or formula`, `Result`],
      rows: [
        [`New links`, `10 million per month`, `About 4 per second, peak about 40`],
        [`Redirects`, `100 per link`, `About 400 per second, peak about 4,000`],
        [`Rows after 5 years`, `10 million x 60`, `600 million`],
        [`Storage`, `600 million x 300 bytes`, `About 180 GB`],
        [`Key space at 7 characters`, `62^7`, `About 3.5 trillion`],
        [`Collision chance per random code`, `600 million / 3.5 trillion`, `About 1 in 6,000`]
      ]
    }
  },
  technique: [
    { t: `Write the four-part statement`, x: `Scenario with numbers, naive design, the condition where it fails, and the one principle the design rests on.` },
    { t: `List functional and non-functional requirements`, x: `Each as a testable line, with an explicit out-of-scope list.` },
    { t: `Estimate load, storage and key space`, x: `State each assumption, label invented ones, and show the arithmetic so a reviewer can redo it.` },
    { t: `Find the dominant path`, x: `Decide which operation (here the redirect) drives cost and latency, and which can be slow (here creation).` },
    { t: `Mark the decisions that are hard to reverse`, x: `The public code format and length leave the building and cannot change later. Flag them for human review.` }
  ],
  mistakes: [
    { t: `Designing before estimating`, ctx: `The agent proposes sharding and a message bus for 4 writes per second.`, fix: `Redo the arithmetic. A single database and a cache serve this load. Name what would force more.` },
    { t: `Hidden assumptions`, ctx: `The estimate says 1 billion redirects a month without saying where the ratio came from.`, fix: `Every figure is measured, labelled as assumed, or cited. The review asks for the source of each.` },
    { t: `Forgetting the shape of the traffic`, ctx: `Average load is fine, but a link shared in a popular group gets 10,000 requests per second for a minute.`, fix: `Estimate peak and the single-key hot spot as well as the mean.` }
  ],
  review: [
    `Is there a problem statement with numbers, and is every number labelled as measured, assumed or cited?`,
    `Can I redo the arithmetic from the stated assumptions and get the same order of magnitude?`,
    `Which requirement is the dominant path, and does the design focus on it?`,
    `Which choices here are hard to reverse, and did the agent flag them?`,
    `Red flag: a distributed architecture proposed before any estimate, or an estimate with no stated assumptions.`
  ],
  exercise: {
    prompt: `Recompute with 3 times the traffic: 30 million new links per month and 200 redirects per link. What changes about the design, and what does not?`,
    answer: `<p>Writes: about 12 per second average, peak about 120. Redirects: 30 million times 200 is 6 billion per month, about 2,300 per second average and 23,000 at peak. Storage: 1.8 billion links in 5 years, about 540 GB. Key space: 1.8 billion of 3.5 trillion is about 0.05 percent, still a small fraction.</p><p>Writes and storage are still modest for one primary database. Redirects at 23,000 per second make a cache essential, and they likely need several redirect servers behind a load balancer. The 7-character code still holds. The estimate has told us where the design must change: the read path, not the key space.</p>`
  },
  checklist: [
    `The four-part statement exists with numbers.`,
    `Requirements are testable lines and the out-of-scope list is explicit.`,
    `Load, storage and key space are computed with stated assumptions.`,
    `The dominant path and the hard-to-reverse decisions are named.`
  ],
  artifact: `Section 1 of the design: problem statement, requirements, out-of-scope list and the estimates table.`,
  agent: `The agent writes the four-part statement, shows the arithmetic with every assumption labelled, and states which path dominates. It will not propose components before this section exists.`,
  src: `M. Kleppmann, Designing Data-Intensive Applications, 2017, ch. 1 (load parameters, percentiles). Numbers are invented assumptions. This site's Redis and Scylla pages for cache and storage sizing background. Backend from First Principles, the URL shortener chapter, chapter topic only, text not read.`
},
{
  title: `Identifier generation and the data model`,
  short: `Choose how short codes are made, enforce uniqueness in the database, and keep the click data out of the hot row.`,
  why: `The code format is the one decision that cannot change later, because it is printed in messages and bookmarks. It also decides whether links can be guessed and whether generation scales. The data model should make the redirect a single key lookup.`,
  concept: [
    `<b>Three ways to make a code.</b> A <b>counter</b> turned into base62 is short and collision free, but sequential codes are guessable (an attacker walks the whole space and finds private links) and a single counter is a bottleneck unless servers take blocks of numbers at a time. A <b>hash of the URL</b> truncated to 7 characters is stateless and gives one code per URL, but different URLs can collide, so you still need a check and a retry, and the same URL cannot get separate links per owner. A <b>random code</b> with a unique constraint is simple and unguessable, and a collision is handled by retrying.`,
    `For this problem random generation is a good default: at the estimated key space collisions are rare, and the <b>database unique constraint is the arbiter</b>. Insert, and if the insert fails on the unique key, generate a new code and try again, up to a small limit. Never check "does it exist?" first and then insert, because two requests can pass the check at once (the race from the invariants lesson of the Mindset module).`,
    `Use a generator from the platform's cryptographically secure random source, not a pseudo-random generator seeded by time, since predictable codes defeat the point. Avoid look-alike characters if codes are read by humans. Reserve a list of words (<code>admin</code>, <code>api</code>, <code>login</code>) that custom aliases may not use.`,
    `<b>The data model</b> follows the access patterns, as in the Data modeling module. Main pattern: get a link by code, which is the primary key. Secondary: list links by member, and find a link by ad. Click counts are a high-rate write: do not update a counter on the link row for every redirect, because it makes the hot row a write hot spot. Append click events elsewhere (a log or a queue, see the Async work and messaging module) and aggregate them.`
  ],
  terms: [
    [`Base62`, `Writing a number with 62 symbols: a-z, A-Z and 0-9.`],
    [`Unique constraint`, `A database rule that rejects a second row with the same key, safe under concurrency.`],
    [`Enumeration`, `Guessing or walking through identifiers to find ones that exist.`],
    [`Reserved word`, `A code that users may not claim because it is used by the service.`]
  ],
  example: {
    setup: `The marketplace owns the <code>member</code> and <code>ad</code> tables. The agent must design the shortener's storage.`,
    body: [
      `<pre>CREATE TABLE short_link (
  code        text        PRIMARY KEY,
  target_url  text        NOT NULL,
  member_id   bigint      REFERENCES member (member_id),
  ad_id       bigint      REFERENCES ad (ad_id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  disabled_at timestamptz,
  CHECK (length(code) BETWEEN 4 AND 32)
);
CREATE INDEX short_link_member_idx ON short_link (member_id, created_at DESC);</pre>`,
      `The code is the primary key, so the redirect is one index lookup. <code>member_id</code> and <code>ad_id</code> are nullable because anonymous links may be allowed (a product decision to flag). <code>disabled_at</code> is a soft switch so a link can be turned off without losing it, and <code>expires_at</code> supports links that end. Insert flow: generate a random code, <code>INSERT</code>, on a unique violation generate again, give up after 5 tries and return a 5xx with an alert, since five collisions in a row means something is wrong.`,
      `Click data goes to an append-only <code>link_click</code> stream (code, time, coarse metadata) written asynchronously, and counts are computed from it. Accepting a little loss of click events is a stated trade-off: a redirect should never fail because analytics is down.`
    ],
    table: {
      head: [`Option`, `Buys`, `Pays`, `Verdict here`],
      rows: [
        [`Counter to base62`, `No collisions, shortest codes`, `Guessable, counter bottleneck, ranges needed`, `Only with an obfuscation step`],
        [`Hash of URL, truncated`, `Stateless, same URL same code`, `Collisions need handling, no per-owner links`, `Weaker fit`],
        [`Random plus unique key`, `Unguessable, simple, no coordination`, `A retry on collision, slightly longer codes`, `Default`]
      ]
    }
  },
  technique: [
    { t: `List the generation options with their costs`, x: `Counter, hash, random. For each, collision behavior, guessability and coordination needed.` },
    { t: `Let the database decide uniqueness`, x: `Use a unique or primary key and a bounded retry on violation. Never rely on a check followed by an insert.` },
    { t: `Choose code length from the key space`, x: `Compute the collision chance from the estimates, and pick a length with a margin for growth.` },
    { t: `Shape the table around the access patterns`, x: `Code lookup is the primary key. Add indexes only for listed secondary patterns, and write those patterns down.` },
    { t: `Keep high-rate writes off the hot row`, x: `Record clicks as events and aggregate them, so a viral link does not serialize on one row.` },
    { t: `Write the decision record`, x: `Name the options, the choice, the reversibility (low: the code format is public) and the trigger to revisit.` }
  ],
  mistakes: [
    { t: `Check then insert`, ctx: `The agent looks up the code, finds none, and inserts. Under load two requests take the same code and one silently overwrites the other.`, fix: `Insert and handle the unique violation. Add a concurrency test that creates the same code twice.` },
    { t: `Sequential codes with no protection`, ctx: `Codes are the base62 of an auto-increment id. Private links are found by incrementing.`, fix: `Use random codes, or if a counter is used, permute or encrypt the number so adjacent values are unrelated.` },
    { t: `A counter column on the link row`, ctx: `Every redirect runs <code>UPDATE short_link SET clicks = clicks + 1</code>. The row is locked on each hit.`, fix: `Write click events asynchronously and aggregate.` }
  ],
  review: [
    `Which generation method was chosen and what are the rejected options? What is the collision chance at our key space?`,
    `Where is uniqueness enforced? Show the constraint and the retry code.`,
    `Can an outsider guess the next code?`,
    `Which index serves each access pattern, and is there an index with no pattern?`,
    `Red flag: an existence check followed by an insert, or a counter updated in the redirect path.`
  ],
  exercise: {
    prompt: `Compute the collision chance for a random 6-character code when 600 million links exist, and say whether you would shorten the code to 6 characters.`,
    answer: `<p>62^6 is about 56.8 billion. 600 million divided by 56.8 billion is about 1 percent, so about 1 new code in 100 collides and needs a retry. The insert still works with a retry, but retries add latency and get worse as the table grows (at 3 billion links about 5 percent), and guessing is easier, since a scanner hits real links 1 percent of the time. Seven characters costs one more character and gives a margin of about 100 times. Because the format is public and hard to change later, take the margin.</p>`
  },
  checklist: [
    `Options for generating codes are compared with their costs.`,
    `Uniqueness is enforced by the database with a bounded retry.`,
    `Code length is derived from the key space with a margin.`,
    `The table matches the listed access patterns and clicks are off the hot row.`
  ],
  artifact: `Section 2 of the design: the identifier decision record, the table specification with indexes and access patterns, and the generation and retry flow.`,
  agent: `The agent compares the three generators, uses a secure random source with the database as arbiter, writes the table spec from the access patterns, and adds a concurrency test for duplicate codes.`,
  src: `PostgreSQL manual: INSERT ... ON CONFLICT and unique indexes, and the section on constraints. OWASP API Security Top 10 (2023), API1 (enumeration through guessable identifiers). Postgres course on this site for indexes and constraints. Numbers are invented examples. Backend from First Principles, the URL shortener chapter, chapter topic only, text not read.`
},
{
  title: `Redirect path: caching and hot keys`,
  short: `Make the redirect a cache hit by default, and protect the database from misses and from one very popular link.`,
  why: `The redirect carries 99 percent of the traffic and sits in front of every share. If it is slow or down, every shared link is broken. Caching is the main tool, and it brings its own failure modes: stale data, stampedes and hot keys. This lesson applies the Performance, caching and concurrency module.`,
  concept: [
    `<b>The path.</b> Request arrives with a code. Look in a local in-process cache, then a shared cache such as Redis, then the database. On a database hit, fill the caches and answer with a redirect. This is the <b>cache-aside</b> pattern: the application reads the cache first and populates it on a miss.`,
    `<b>Which redirect status?</b> <code>301 Moved Permanently</code> may be cached by browsers for a long time, which saves traffic but means a disabled or edited link keeps working for visitors who already followed it, and your server no longer sees those clicks. <code>302 Found</code> or <code>307 Temporary Redirect</code> are not cached by default, so you keep control and see each click. For a service that promises "owner can disable a link" and counts clicks, 302 (or 307) is the safer default, with a short <code>Cache-Control: max-age</code> if you want some offloading. This is the HTTP semantics of the first lesson of the API module.`,
    `<b>Misses and unknown codes.</b> A code that does not exist always misses, so a scanner can send millions of random codes straight to the database. Cache the <b>negative result</b> ("not found") for a short time, and rate limit by source (Identity and security module). A Bloom filter of existing codes is possible but adds complexity, so use it only if measurements demand it.`,
    `<b>Hot keys and stampedes.</b> A viral link makes one key very hot. A shared cache node holding it can saturate. Remedies: a small in-process cache for the hottest keys with a short TTL, and <b>request coalescing</b> (single-flight): when the entry expires and 1,000 requests arrive together, only one goes to the database and the rest wait for its answer. Add random <b>jitter</b> to TTLs so that many keys do not expire at the same moment.`,
    `<b>Invalidation.</b> When an owner disables a link the cache must stop serving it. Delete the cache key on disable, and keep TTLs short so that a missed deletion is bounded. State the staleness limit as a requirement, for example "a disabled link stops redirecting within 60 seconds", then test it.`
  ],
  terms: [
    [`Cache-aside`, `The application checks the cache, and on a miss reads the database and fills the cache.`],
    [`Negative caching`, `Caching a "not found" answer for a short time.`],
    [`Hot key`, `One key that receives a very large share of requests.`],
    [`Single-flight`, `Letting one request refill a missing entry while others wait for it.`]
  ],
  example: {
    setup: `A short link for a popular ad is posted in a large group. Traffic to that one code jumps from 5 to 8,000 requests per second for several minutes (invented numbers), while the rest of the site is normal.`,
    body: [
      `The agent's first version has a 5 minute TTL in Redis, no local cache and no coalescing, and answers 301. Trace the problems. When the entry expires, thousands of requests miss together and all hit the database (a stampede). The single Redis key takes all 8,000 per second on one node. Because of 301, browsers cache the redirect for visitors, so when the seller disables the ad, many people still reach it, and the owner's click counts stop growing.`,
      `The improved path: in-process cache for the top few thousand codes with a 5 second TTL, then Redis with a TTL of an hour plus jitter, single-flight on a miss, <code>302</code> with <code>Cache-Control: private, max-age=0</code> or a small value, a 60 second negative cache for unknown codes, deletion of the key on disable, and an asynchronous click event after the response is sent. The cache hit rate and the staleness limit are both measured.`
    ],
    table: {
      head: [`Failure of the path`, `Symptom`, `Control`],
      rows: [
        [`Expiry stampede`, `Database spike when a hot key expires`, `Single-flight and TTL jitter`],
        [`Hot key`, `One cache node saturated`, `In-process cache, short TTL`],
        [`Random code scan`, `Database load from misses`, `Negative cache and rate limit`],
        [`Stale after disable`, `Disabled link still redirects`, `Delete on disable, short TTL, 302`],
        [`Cache down`, `All requests reach the database`, `Fallback with a concurrency limit, shed load`]
      ]
    }
  },
  technique: [
    { t: `Draw the redirect path with each cache tier`, x: `Local, shared, database, with the TTL and the fill rule at each step.` },
    { t: `Choose the status code deliberately`, x: `301 for permanent and uncontrolled, 302 or 307 when links can be disabled or counted. State the reason.` },
    { t: `Handle misses`, x: `Negative cache with a short TTL, and a limit per source for scans.` },
    { t: `Protect against stampede and hot keys`, x: `Single-flight, TTL jitter, and a local cache for the hottest codes.` },
    { t: `State the staleness requirement and test it`, x: `For example "disabled within 60 seconds". Measure hit rate and test the disable path end to end.` },
    { t: `Plan the cache outage`, x: `Decide what happens when the shared cache is gone: a database fallback with a concurrency cap, or shedding load with a 503.` }
  ],
  mistakes: [
    { t: `301 by habit`, ctx: `The redirect is permanent because that sounds right for a short link. Disabling a link no longer works for returning visitors.`, fix: `Use 302 or 307 unless the product explicitly accepts uncontrollable caching, and write the decision down.` },
    { t: `Cache with no TTL`, ctx: `Entries are written once and live until eviction. A changed or disabled link is served forever.`, fix: `Every entry has a TTL, and invalidation is tested.` },
    { t: `Ignoring the miss path`, ctx: `The benchmark shows a 95 percent hit rate and the team stops there. A scan uses only misses.`, fix: `Load test misses and a hot key, not only the happy hits.` }
  ],
  review: [
    `Walk the redirect path. Which tier answers most requests, and what is the measured hit rate?`,
    `Why this redirect status? What happens to a disabled link?`,
    `What happens when a hot key expires under load? Where is the coalescing?`,
    `What happens when the shared cache is unavailable? Show the test.`,
    `Red flag: a cache with no TTL and no invalidation path, or a hit rate quoted with no miss or hot-key test.`
  ],
  exercise: {
    prompt: `At 4,000 redirects per second at peak, a 95 percent hit rate leaves how many database reads per second? What changes if the hit rate drops to 80 percent?`,
    answer: `<p>At 95 percent, 5 percent miss: 4,000 times 0.05 is 200 database reads per second. At 80 percent it is 800 per second, four times as many, from a change of 15 points. That is why the hit rate is a first-class metric, and why the miss path (key lookups on an indexed primary key, with a connection pool sized by Little's law) needs its own load test. If a scan or a cold start produces 100 percent misses, the database sees 4,000 per second, and the fallback must limit concurrency.</p>`
  },
  checklist: [
    `The redirect path is drawn with every cache tier, TTL and fill rule.`,
    `The status code was chosen with a reason and matches the disable requirement.`,
    `Negative caching, jitter and single-flight are in place.`,
    `A staleness limit is stated and tested, and cache outage behavior is decided.`
  ],
  artifact: `Section 3 of the design: the redirect path diagram, the caching table (tier, TTL, invalidation), and the load-test plan for hits, misses and a hot key.`,
  agent: `The agent specifies each cache tier with a TTL and invalidation rule, chooses the redirect status with a written reason, adds single-flight and jitter, and designs load tests for misses and hot keys. It reports measured hit rate and p99 for the redirect.`,
  src: `RFC 9110 sections on 301, 302, 307, 308. RFC 9111 HTTP Caching. Redis documentation: key expiry (EXPIRE). Redis and Scylla courses on this site for cache behavior and hot partitions. M. Nygard, Release It!, 2nd ed., 2018 (cascading failures). Numbers are invented examples.`
},
{
  title: `Failure, abuse and observability`,
  short: `Decide what happens when parts fail, how the service will be abused, and what you will see when it does.`,
  why: `A shortener is a target. It hides the destination from the person clicking, so it is a favourite tool for phishing and malware, and the service owner can be blamed. It must also survive its own dependencies failing. This lesson combines the Reliability and operations and Identity and security modules.`,
  concept: [
    `<b>Failure table.</b> For each dependency (shared cache, database, the click event stream, the malware check, the clock) answer the five questions from the Mindset module: slow, down, wrong, duplicated, partial. The redirect should depend on as few things as possible: if the click stream is down, the redirect still works and the event is dropped or buffered.`,
    `<b>Degraded modes.</b> Cache down: read from the database with a concurrency cap. Database down: serve recent hot codes from the local cache for a short time, otherwise 503 with <code>Retry-After</code>. Creation path slow: fail with a clear 503 rather than queueing without limit. Each mode is decided with the product owner, as in the Reliability and operations module.`,
    `<b>Abuse.</b> The big risks are phishing and malware links, redirect loops, links to internal or dangerous schemes, and mass creation. Controls: accept only <code>http</code> and <code>https</code> targets (never <code>javascript:</code> or <code>data:</code>), reject targets that point back to the shortener's own domain, check the target against a reputation or blocklist service (asynchronously, so creation does not depend on it, and mark a link pending until checked), rate limit creation per member and per IP, require login for bulk creation, and provide a report and takedown path. Disabled links answer <code>410 Gone</code> or a warning page. If the service fetches targets to show previews, apply the SSRF controls from the Identity and security module.`,
    `<b>Observability.</b> Emit structured logs with the request id, metrics and traces (see the Reliability and operations module). The key metrics for this service: redirect latency at p50, p95 and p99, error rate, cache hit ratio, share of 404 responses, creation rate, retries on code collision, queue lag of click events, and the database pool usage. Alert on symptoms users feel (redirect errors, slow p99) and not on every cause. Use a stated objective, for example 99.9 percent of redirects succeed over 30 days, which allows about 43 minutes of failure a month (0.1 percent of 43,200 minutes).`
  ],
  terms: [
    [`Degraded mode`, `A reduced but useful behavior when a dependency is unavailable.`],
    [`Blocklist`, `A list of targets or domains known to be harmful, which links may not point to.`],
    [`SLO`, `Service level objective: a target for a measured quality such as success rate.`],
    [`410 Gone`, `A status meaning the resource existed and was removed on purpose.`]
  ],
  example: {
    setup: `A week after launch, a campaign uses the marketplace shortener to hide links to a fake payment page. Reports come in, and at the same time the click event stream falls behind. All numbers are invented.`,
    body: [
      `With the design so far, what happens? The creation endpoint accepted any target, had no reputation check, and the redirect wrote a click event synchronously, so the lagging stream also slowed redirects. Add the controls: scheme and domain validation, an asynchronous reputation check that moves new links from pending to active, creation limits (for example 20 per hour per new member), a report endpoint that disables a link and records who did it, and an audit log row for each takedown.`,
      `Make failure visible: an alert fires when redirect p99 passes 100 ms for 5 minutes, one when the error rate burns through the monthly budget quickly, and a dashboard shows cache hit ratio, click stream lag and the share of 404s. The click write is moved off the response path so the stream's lag cannot affect redirects.`
    ],
    table: {
      head: [`Dependency or risk`, `How it fails`, `Behavior chosen`],
      rows: [
        [`Shared cache`, `Down or slow`, `Database fallback with a concurrency cap, 100 ms timeout`],
        [`Primary database`, `Down`, `Serve hot local entries briefly, else 503 with Retry-After`],
        [`Click event stream`, `Lagging or down`, `Drop or buffer, never block the redirect`],
        [`Reputation service`, `Slow or wrong`, `Link stays pending, fail closed for new links`],
        [`Abusive targets`, `Phishing, javascript: scheme`, `Scheme and domain checks, blocklist, report and takedown`]
      ]
    }
  },
  technique: [
    { t: `Write the failure table`, x: `Each dependency by slow, down, wrong, duplicated and partial, with the chosen behavior and timeout.` },
    { t: `Keep the redirect path minimal`, x: `Remove every dependency that is not required to answer the redirect, and move the rest off the response path.` },
    { t: `Write abuse cases`, x: `Phishing, loops, dangerous schemes, bulk creation, enumeration, and the control and takedown path for each.` },
    { t: `Choose the SLO and the metrics`, x: `State the objective, derive the error budget, and pick the few metrics that show users' pain.` },
    { t: `Alert on symptoms`, x: `Page on slow or failing redirects and on fast budget burn. Keep cause metrics on dashboards.` },
    { t: `Rehearse the failures`, x: `Kill the cache, slow the database and pause the click stream in a test environment and check that the planned behavior happens.` }
  ],
  mistakes: [
    { t: `A dependency in the redirect path that does not belong there`, ctx: `The redirect waits for the click write and for a reputation lookup.`, fix: `Answer first, then record. Check reputation at creation and in the background.` },
    { t: `No takedown path`, ctx: `A malicious link is found, and removing it needs a manual database update at night.`, fix: `A report endpoint, a disable action with an audit record, and a clear status for disabled links.` },
    { t: `Alerting on causes`, ctx: `Forty alerts on CPU, queue depth and pool size fire constantly, and the real outage is missed.`, fix: `Page on user-visible symptoms and an SLO burn rate, and keep cause metrics for diagnosis.` }
  ],
  review: [
    `Show the failure table. What does the redirect do when each dependency is slow, down or wrong?`,
    `Which dependencies are on the redirect path, and why is each required?`,
    `What stops a phishing link or a javascript: target? What is the takedown path?`,
    `What is the SLO, and which alert fires first when it is at risk?`,
    `Red flag: no timeouts on outbound calls, or abuse handling described as "we will monitor it".`
  ],
  exercise: {
    prompt: `Design the response and the metrics for the link <code>market.example/s/aB3xK9q</code> after a moderator reports it as phishing.`,
    answer: `<p>The moderator action sets <code>disabled_at</code>, writes an audit record (who, when, why), deletes the cache entry, and the next redirect answers 410 or shows a warning page, within the stated staleness limit (for example 60 seconds). Check whether the same target was used in other links and disable those too, and add the domain to the blocklist.</p><p>Metrics: count of takedowns, time from report to disable (an operational objective), number of redirects to disabled links (should fall to the warning page count), and creation attempts blocked by the blocklist. A test proves the disabled link no longer redirects.</p>`
  },
  checklist: [
    `The failure table exists with timeouts and chosen behavior for every dependency.`,
    `The redirect path contains only what it must.`,
    `Abuse cases have controls, and a takedown path with an audit record exists.`,
    `An SLO, a short list of symptom metrics and matching alerts are defined.`
  ],
  artifact: `Section 4 of the design: the failure table, the abuse case table with the takedown flow, and the observability plan (SLO, metrics, alerts).`,
  agent: `The agent produces the failure and abuse tables, moves non-essential work off the redirect path, defines the SLO and alerts on symptoms, and writes fault-injection tests. It lists any behavior it could not decide for the product owner.`,
  src: `M. Nygard, Release It!, 2nd ed., 2018 (timeouts, circuit breakers, fail fast). Google, Site Reliability Engineering, 2016, chapters on service level objectives and monitoring. OWASP API Security Top 10 (2023), API4, API6, API7. RFC 9110 (410 Gone, 503 and Retry-After). Numbers are invented examples.`
},
{
  title: `Review an agent-made version with the five lenses`,
  short: `Apply fit, correctness, failure, security and operability to a realistic agent submission, and send back evidence requests.`,
  why: `This is the skill the whole course builds toward. The agent will hand you a working service with tests that pass. Your job is to find what the tests do not cover, using the protocol from the Mindset and review method module, and to decide with evidence whether to accept.`,
  concept: [
    `Start the review with the <b>requirements and the estimates</b> from the first lesson, not with the code. Restate what the service must do and the numbers it must meet, then compare. Size the risk: this service takes public input, redirects browsers and stores data for members, so it deserves a careful review.`,
    `Apply the five lenses in order and write one finding or "checked, none" for each: <b>fit</b>, <b>correctness and data</b>, <b>failure behavior</b>, <b>security</b>, <b>operability</b>. Then scan for the agent red flags: invented names, tests that restate the code, broad permissions, swallowed errors, and claims with no evidence.`,
    `<b>Turn findings into requests.</b> A good review comment is a question with a test attached: "show the test where two requests create the same code" is better than "this is not safe". Order the findings by risk, say which block acceptance and which can follow, and require evidence for the fixes, as in the Testing and quality module.`,
    `Decide among <b>accept</b>, <b>accept with follow-ups</b> and <b>reject</b>. Record the decision and the evidence in the review record. Then record the decisions the human must own: the code format, the redirect status, the anonymous link policy and the accepted risks.`
  ],
  terms: [
    [`Finding`, `One observed problem with its evidence and the lens it came from.`],
    [`Blocking finding`, `A problem that must be fixed before the change is accepted.`],
    [`Evidence request`, `A question that asks the agent to show a test, plan or measurement.`],
    [`Review record`, `The one-page account of what was checked, found, requested and decided.`]
  ],
  example: {
    setup: `The agent returns a shortener. Below is a summary of what it built, in plain pseudo-code. The reviewer holds the design from the previous lessons.`,
    body: [
      `<pre>POST /shorten   body: { "url": "..." }
  n = db.exec("UPDATE counter SET n = n + 1 RETURNING n")
  code = base62(n)
  db.exec("INSERT INTO link(code, url, clicks) VALUES (code, url, 0)")
  return 200 { "short": "market.example/s/" + code }

GET /s/{code}
  url = cache.get(code)
  if not url: url = db.query("SELECT url FROM link WHERE code = " + code); cache.set(code, url)
  db.exec("UPDATE link SET clicks = clicks + 1 WHERE code = " + code)
  return 301 Location: url

DELETE /links/{code}   -> db.exec("DELETE FROM link WHERE code = " + code)</pre>`,
      `Apply the lenses. Every one finds something, and the findings link back to earlier lessons. Group them in the table below, ordered by lens.`
    ],
    table: {
      head: [`Lens`, `Finding`, `Evidence request`],
      rows: [
        [`Fit`, `No expiry or disable. No ad or member link. Anyone can create, with no scheme check. 301 contradicts the owner-can-disable requirement.`, `Which requirement does each endpoint satisfy? Show the requirement list.`],
        [`Correctness and data`, `A global counter row is locked by every create. Sequential codes. clicks updated on every redirect. No unique constraint written. No expiry column.`, `Show the table DDL, the concurrency test for two creates, and why a counter was chosen over random codes.`],
        [`Failure`, `The cache has no TTL, no negative caching and no single-flight. No timeouts on cache or database. The click update sits in the redirect path.`, `Show the failure table, the hot-key test and the behavior with the cache stopped.`],
        [`Security`, `SQL is built by concatenation in two places. DELETE has no authentication or owner check, so anyone deletes any link. No scheme validation, no rate limit, codes are enumerable.`, `Show the parameterized queries, the two-member delete test, the rejection of javascript: targets, and the limits.`],
        [`Operability`, `No logs with request id, no metrics, no health check, no audit of deletes, no migration or rollback.`, `Show the SLO, the metrics list, and the rollback plan.`]
      ]
    }
  },
  technique: [
    { t: `Restate the requirements and the numbers`, x: `Write them before reading the code, so omissions are visible.` },
    { t: `Size the risk`, x: `Public input, redirects and member data: review slowly, line by line where it touches authorization, SQL and the redirect.` },
    { t: `Run the five lenses`, x: `One finding or "checked, none" per lens. Tie each finding to the earlier design or to the requirement it breaks.` },
    { t: `Scan for agent red flags`, x: `Invented names, tautological tests, broad permissions, swallowed errors, confidence without evidence.` },
    { t: `Send evidence requests and rank them`, x: `Mark blocking findings, ask for a test or measurement for each, and require the agent to show the failing test before the fix.` },
    { t: `Record the decision`, x: `Accept, accept with follow-ups or reject, with the evidence list and the decisions reserved for a human.` }
  ],
  mistakes: [
    { t: `Reviewing only what is in the diff`, ctx: `The code is tidy, so it is approved. Expiry, disable and ownership are missing, and nothing in the diff shows that.`, fix: `Compare against the requirement list. Absence is a finding.` },
    { t: `Accepting the agent's tests as proof`, ctx: `Tests create a link and follow it. No test creates two links at once, deletes as another member, or stops the cache.`, fix: `Ask for tests from the requirements and abuse cases, and run them against the old code to see them fail.` },
    { t: `A flat list of findings`, ctx: `Thirty comments with no order. The author fixes style and skips the delete hole.`, fix: `Rank by risk, mark the blocking ones and say what evidence closes each.` }
  ],
  review: [
    `Did I write the requirements and numbers before reading the code, and compare each to the result?`,
    `Do I have one finding or "checked, none" for each of the five lenses?`,
    `Which findings block acceptance, and what evidence closes each?`,
    `Which decisions did the agent make that a human must own (code format, redirect status, anonymous links, accepted risks)?`,
    `Red flag: an approval request that lists what was done and nothing that was verified or left out.`
  ],
  exercise: {
    prompt: `The agent fixes the findings and returns: parameterized queries, an owner check on DELETE, and random codes with a unique constraint. It says "all issues resolved". What do you still ask?`,
    answer: `<p>Ask for evidence of each fix, not the claim. The two-member test for DELETE, a concurrency test for duplicate codes against a real database, the query logs or code showing parameters, and the failing-before, passing-after run. Then the items that were never addressed: the 301 versus 302 decision and the disable requirement, TTL and invalidation on the cache, the click write still in the redirect path, rate limits, scheme validation, metrics and the rollback plan. "All issues resolved" covers only the issues the agent noticed. Run the five lenses again on the new diff.</p>`
  },
  checklist: [
    `Requirements and estimates were restated before reading the code.`,
    `Each lens has a finding or "checked, none".`,
    `Blocking findings are ranked and each has an evidence request.`,
    `Human-owned decisions are listed.`,
    `The decision and evidence are recorded in the review record.`
  ],
  artifact: `The final <b>review record</b> for the shortener: requirement and risk size, findings by lens, red flags, evidence requested and received, the decision, and the list of decisions reserved for a human. It completes the capstone with sections 1 to 4 of the design.`,
  agent: `The agent produces the design sections and its own five-lens review record with evidence attached, so your review checks its reasoning instead of rediscovering it. You decide whether to accept, accept with follow-ups, or reject.`,
  src: `The Mindset and review method module of this course (five lenses, red flags, evidence). OWASP API Security Top 10 (2023): API1, API4, API5, API7, API8. OWASP SQL Injection Prevention Cheat Sheet. RFC 9110 (redirect status codes). PostgreSQL manual: unique indexes and INSERT ... ON CONFLICT. Numbers and the submission are invented for the exercise.`
}
];
