/* Mindset and review method: five lessons. Same running scenario (a classifieds marketplace). All numbers are invented examples.
 * Structure informed by the topic list of DsThakurRawat/Backend-from-first-Principle (chapters on fault tolerance, security,
 * scaling and caching), re-expressed as reviewer habits. Facts cited to the sources named in each lesson. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['mindset'] = [
{
  title: `Start from the problem, not the tool`,
  short: `Reason from the facts of the problem so you can tell a real design from a copied one.`,
  why: `An agent can produce a plausible design for almost any request, because it has seen thousands of them. A reviewer's first job is to find out whether this design answers <i>this</i> problem. If the problem cannot be stated with numbers, the design is a guess that happens to look professional.`,
  concept: [
    `<b>First-principles thinking</b> means breaking a problem down to facts you can check, then building the design up from them, instead of reasoning by analogy ("big companies use X"). The facts are quantities: how many, how often, how fast, how correct.`,
    `Use a four-part statement for any design: <b>scenario</b> (a situation with numbers), <b>naive design</b> (the obvious thing), <b>fails when</b> (the exact condition and its size), and <b>principle</b> (the one idea the real design rests on). If you cannot fill in "fails when", you do not yet know why the naive design is not enough.`,
    `A tool is an answer. Until you have the question, you cannot judge the answer. This is why a design review starts with the problem statement and not with the diagram.`
  ],
  terms: [
    [`Scenario`, `A concrete situation with numbers, labelled as examples if invented.`],
    [`Naive design`, `The simplest thing that could work.`],
    [`Fails when`, `The size or condition at which the naive design stops working.`],
    [`Principle`, `The one idea the chosen design rests on.`]
  ],
  example: {
    setup: `An agent is asked to speed up the ad detail page and answers: "Add a Redis cache in front of the database with a 24 hour TTL." It sounds right. Apply the four parts to it.`,
    body: [
      `Scenario: the detail page gets 500 requests per second at peak, and its 99th percentile response time is 900 ms against a target of 200 ms (invented numbers). Naive design: read the ad, its images and the seller from PostgreSQL on every request. Fails when: the query plan shows the images lookup is a full scan, so the time is in the database, but also when peak traffic exhausts the connection pool.`,
      `Now judge the agent's answer. A cache removes load but not the slow query, it adds a place for stale data, and a 24 hour TTL means a seller who edits a price sees the old one all day. The principle that fits is "find where the time goes first". The cache may still be right later, but only after the plan is fixed and the numbers say it is needed.`
    ],
    table: {
      head: [`Question to ask the agent`, `A good answer`, `A weak answer`],
      rows: [
        [`What is the problem, in numbers?`, `500 per second, p99 900 ms, target 200 ms`, `"The page is slow"`],
        [`Where does the time go?`, `A profile or plan showing the images query`, `"Databases are slow, cache it"`],
        [`When would your design fail?`, `When the hit rate is low or data changes often`, `"It will not fail"`]
      ]
    }
  },
  technique: [
    { t: `State the problem with numbers`, x: `Write the scenario: rate, size, latency or correctness target. Mark invented numbers as examples.` },
    { t: `Write the naive design`, x: `Say what the simplest approach would be and what it costs.` },
    { t: `Find where it fails`, x: `Name the exact condition and its size. If you cannot, measure before designing.` },
    { t: `State the principle`, x: `One idea, in a sentence, that the chosen design rests on.` },
    { t: `Check the design against the principle`, x: `Every component should trace to the principle. A component that does not is decoration or a hidden second goal.` }
  ],
  mistakes: [
    { t: `Accepting a solution with no problem statement`, ctx: `The agent opens with the architecture. The review debates cache sizes and never asks what the target was.`, fix: `Ask for the four-part statement first. Pause the review until it exists.` },
    { t: `Reasoning by analogy`, ctx: `"Large companies use Kafka, so we should." The marketplace has 30 events per second.`, fix: `Ask what fails at your scale without it. If nothing does yet, it is a later decision.` },
    { t: `Numbers with no source`, ctx: `The design cites 10 million users, but nobody can say where the figure came from.`, fix: `Every number is measured, assumed (and labelled) or taken from a named source.` }
  ],
  review: [
    `Is there a problem statement with numbers before the design? If not, ask for it.`,
    `Which sentence says when the naive design fails? Is the size stated?`,
    `Can each component be traced to the principle? Which one cannot?`,
    `Red flag: a well-known tool named in the first line of the answer, before any measurement.`
  ],
  exercise: {
    prompt: `The agent says: "Split the monolith into microservices to improve performance." Write the four questions you would ask, and what answer would make you accept the plan.`,
    answer: `<p>Ask: (1) What is the performance problem, with numbers, and in which request path? (2) Where does the time go: CPU, database, network, locks? (3) When does the current design fail: at what traffic or team size? (4) Which part of the problem does a network boundary fix?</p><p>Accept only if the answer shows that independent deployment or scaling of one part is the bottleneck. Splitting adds network calls and failure modes, so it rarely makes one request faster. It can make sense for team autonomy or for scaling one very different workload.</p>`
  },
  checklist: [
    `I can state the problem as scenario, naive design, fails when, principle.`,
    `Every number is measured, assumed (labelled) or cited.`,
    `I asked what fails without the proposed tool.`,
    `I traced each component to the principle.`
  ],
  artifact: `The first page of any design document: the four-part problem statement.`,
  agent: `The agent writes the four-part statement before proposing a design. If you ask for a design without numbers, it asks for them, and it marks any figure it had to assume.`,
  src: `Course pages on this site (Redis and Spark problem statements use this four-part form). M. Kleppmann, Designing Data-Intensive Applications, ch. 1 (reliable, scalable, maintainable). Scaling mental models as in the Backend from First Principles notes, chapter 19: start with the problem, prefer simple solutions, measure from day one.`
},
{
  title: `Every choice is a trade-off`,
  short: `Name what a decision buys and what it costs, and write it down so the next person can challenge it.`,
  why: `There are no best practices, only practices that fit a context. A reviewer who asks "what did you give up?" finds the cost a confident answer leaves out, and a recorded decision stops the same debate from restarting every quarter.`,
  concept: [
    `A <b>trade-off</b> is a pair: what you gain and what you pay. Caching buys speed and pays with staleness. Normalizing buys consistency and pays with joins. Microservices buy independent deploys and pay with network failure.`,
    `A <b>decision record</b> (an architecture decision record, or ADR, as Michael Nygard proposed in 2011) is a short note: a title, the context, the decision, its status and its consequences. It is cheap, lives in the repository, and shows the alternatives that were rejected.`,
    `Judge a decision by its <b>reversibility</b> and its <b>blast radius</b>. A decision that is cheap to undo (an index) can be made quickly. One that is hard to undo (a primary key type, a public API field) deserves a slower review.`
  ],
  terms: [
    [`Trade-off`, `A gain paired with its cost.`],
    [`ADR`, `Architecture decision record: context, decision, status, consequences.`],
    [`Reversibility`, `How costly it is to undo the decision later.`],
    [`Blast radius`, `How much breaks if the decision is wrong.`]
  ],
  example: {
    setup: `The marketplace must show a seller's reply count on each ad in the list page.`,
    body: [
      `Option A: count messages on every list view (always correct, but an aggregate over a large table at 200 requests per second). Option B: keep a <code>reply_count</code> column that a worker updates (fast reads, but it can drift and needs a repair job). Both are reasonable. The review question is which cost the team accepts, and who owns the copy.`
    ],
    table: {
      head: [`Decision`, `Buys`, `Pays`, `Reversible?`],
      rows: [
        [`Count on read`, `Always correct`, `Slow list page at scale`, `Yes, add a column later`],
        [`Store reply_count`, `Fast list page`, `Drift risk, a writer to maintain`, `Mostly: drop the column and compute again`],
        [`Public API field name`, `Clear contract`, `Cannot rename without breaking clients`, `No: needs a versioned deprecation`]
      ]
    }
  },
  technique: [
    { t: `List at least two real options`, x: `If there is only one option, you have a default, not a decision.` },
    { t: `Write what each buys and what each costs`, x: `One line each, in terms of the numbers from the problem statement.` },
    { t: `Rate reversibility and blast radius`, x: `Decide how much review and testing the choice deserves.` },
    { t: `Record the decision`, x: `Title, context, decision, status, consequences. Put it in the repository next to the code.` },
    { t: `Name the trigger to revisit`, x: `Write the condition under which you would choose differently (a traffic level, a latency target).` }
  ],
  mistakes: [
    { t: `A decision with no alternative`, ctx: `The record says "we use MongoDB" and gives only the benefits. Nobody can tell whether SQL was considered.`, fix: `List the rejected option and the reason. A record without a rejected option is advertising.` },
    { t: `Treating irreversible choices as small`, ctx: `A public ID format is chosen in a rush because "we can change it later". Clients now depend on it.`, fix: `Slow down for anything that leaves the building: public APIs, IDs, event schemas, primary key types.` },
    { t: `Best practice as the reason`, ctx: `The justification is "it is a best practice". The context where it applies is never checked.`, fix: `Replace the phrase with the problem it solves here and the cost it adds here.` }
  ],
  review: [
    `For each choice the agent made, ask: what did you give up?`,
    `Is the rejected alternative named, with a reason that uses our numbers?`,
    `Is the decision reversible? If not, did the agent flag it for human review?`,
    `Red flag: "best practice", "industry standard" or "scalable" given as the only reason.`
  ],
  exercise: {
    prompt: `The agent chose a random UUID as the primary key of the ad table. Write the trade-off in one line each way and the revisit trigger.`,
    answer: `<p>Buys: ids can be generated anywhere without coordination, are hard to guess, and are safe to expose in URLs. Pays: random values scatter inserts across the index, which can slow writes and bloat the index at high insert rates, and the keys are larger than a bigint.</p><p>Reversibility: low, because the key is referenced by other tables and by clients. Revisit trigger: sustained insert rate above what the index maintenance tolerates (measure it), at which point a time-ordered identifier is worth planning.</p>`
  },
  checklist: [
    `Each decision has at least two named options.`,
    `Each option has a gain and a cost in our numbers.`,
    `Reversibility and blast radius are rated.`,
    `The decision is recorded and has a revisit trigger.`
  ],
  artifact: `One decision record per significant choice, kept in the repository.`,
  agent: `The agent records every significant choice as an ADR with the rejected alternatives, and marks decisions it rates as hard to reverse for your approval.`,
  src: `M. Nygard, Documenting Architecture Decisions, 2011 (the ADR format). M. Kleppmann, Designing Data-Intensive Applications, ch. 1 and 2. Backend from First Principles, chapter 19 (what microservices cost).`
},
{
  title: `Think in failure`,
  short: `Ask how each dependency can be slow, down, wrong, duplicated or half done, before it happens in production.`,
  why: `Demos show the happy path. Production is a continuous stream of timeouts, retries, partial writes and bad input. A design that does not say what happens then has not been designed, only sketched.`,
  concept: [
    `For every call to something outside your process, ask five questions: is it <b>slow</b>, <b>down</b>, <b>wrong</b> (bad data), <b>duplicated</b> (delivered twice), or <b>partial</b> (done halfway)? A design answers all five or says it accepts the risk.`,
    `<b>Slow is worse than down.</b> A dead dependency fails fast. A slow one holds threads and connections until the caller runs out, and the failure spreads. The remedy is a <b>timeout</b> on every outbound call, set from the latency you can afford.`,
    `<b>Retries</b> help with brief faults and hurt with overload. Retry only operations that are safe to repeat (idempotent), with exponential backoff and random jitter, and with a cap, or you create a retry storm. Michael Nygard's <i>Release It!</i> catalogues these stability patterns: timeouts, circuit breakers, bulkheads.`,
    `<b>Fail fast at startup.</b> Validate configuration when the process boots and refuse to run with a bad one, instead of failing at 3 a.m. when a rare path first reads it. Report health honestly: a health check should test the dependencies the service needs, not just answer "ok".`
  ],
  terms: [
    [`Idempotent`, `Doing it twice has the same effect as doing it once.`],
    [`Backoff and jitter`, `Waiting longer after each retry, with a random offset so clients do not retry in step.`],
    [`Circuit breaker`, `Stops calling a failing dependency for a while so it can recover.`],
    [`Blast radius`, `How much of the system a single failure takes down.`]
  ],
  example: {
    setup: `Posting an ad calls a moderation service. The agent's code calls it without a timeout and retries 5 times immediately on any error.`,
    body: [
      `Moderation becomes slow at peak, answering in 20 s instead of 200 ms. Each post request waits, holds a database connection and a worker, and the pool empties. The immediate retries multiply the load by up to 6 times on a service that is already struggling.`,
      `The fixed design sets a 500 ms timeout, retries once with backoff and jitter only because the check is idempotent, and trips a circuit breaker after repeated failures. When moderation is unavailable the ad is saved as "pending review" instead of failing, a deliberate degraded mode that the product owner approved.`
    ]
  },
  technique: [
    { t: `List every outbound dependency`, x: `Database, cache, queue, other services, third-party APIs, the clock.` },
    { t: `Ask the five questions of each`, x: `Slow, down, wrong, duplicated, partial. Write the behavior for each.` },
    { t: `Put a timeout on every call`, x: `Derive it from the latency budget of the whole request.` },
    { t: `Make retried operations idempotent`, x: `Use an idempotency key or a natural unique key. Retry with backoff, jitter and a cap.` },
    { t: `Choose the degraded mode`, x: `Decide what the user sees when the dependency is gone, and get the product owner to agree.` }
  ],
  mistakes: [
    { t: `Retrying without idempotency`, ctx: `A payment call is retried after a timeout. The first attempt had actually succeeded, so the buyer is charged twice.`, fix: `Send an idempotency key, or check the outcome before retrying.` },
    { t: `No timeout`, ctx: `The HTTP client uses its default, which is effectively infinite. One slow dependency freezes every worker.`, fix: `Set an explicit connect and total timeout on every outbound call.` },
    { t: `A health check that only says ok`, ctx: `The endpoint returns 200 while the database connection is dead, so the load balancer keeps sending traffic.`, fix: `Check the dependencies the service cannot work without, and separate liveness from readiness.` }
  ],
  review: [
    `For each outbound call in the diff: where is the timeout, and where is the retry rule?`,
    `Which operations are retried, and are they idempotent? Ask to see the key.`,
    `What does the user see when this dependency is down? Is that written down?`,
    `Red flag: a bare catch that logs and continues, retry in a tight loop, or a missing config check at startup.`
  ],
  exercise: {
    prompt: `A job sends a notification email after an ad is approved. The agent retries on failure up to 10 times with no delay. List the failure modes and fix the design.`,
    answer: `<p>Failure modes: the mail service is down for an hour (10 immediate retries are wasted and add load), the mail service is slow (workers pile up), an email was sent but the response was lost (the retry sends a duplicate), the address is invalid (retrying never helps).</p><p>Fix: put the send on a queue so approval does not wait for it, retry with exponential backoff and jitter over minutes, stop after a cap and move the message to a dead-letter queue, record a send key so a duplicate is not sent, and treat an invalid address as a permanent failure that is not retried.</p>`
  },
  checklist: [
    `Every outbound call has a timeout derived from the latency budget.`,
    `I answered slow, down, wrong, duplicated and partial for each dependency.`,
    `Retries are bounded, backed off, jittered and only on idempotent work.`,
    `The degraded mode is explicit and agreed.`
  ],
  artifact: `A failure table: dependency, the five failure modes, the behavior chosen, and the timeout and retry settings.`,
  agent: `The agent adds a timeout and retry rule to every outbound call it writes, produces the failure table, and states its degraded mode instead of leaving it implicit.`,
  src: `M. Nygard, Release It!, 2nd ed., Pragmatic Bookshelf 2018 (stability patterns: timeouts, circuit breaker, bulkhead). Backend from First Principles, chapter 12 (the fault-tolerant mindset, fail fast at startup, exponential backoff, deep health checks). Google, Site Reliability Engineering, 2016.`
},
{
  title: `Invariants and evidence`,
  short: `Say what must always be true, say where it is enforced, and ask for evidence instead of confidence.`,
  why: `An agent writes fluent, confident text whether or not it is right. A reviewer cannot rely on tone. Invariants give you something checkable, and evidence turns a claim into a fact.`,
  concept: [
    `An <b>invariant</b> is a statement that must hold in every state of the system: "every ad has exactly one owner", "a message is never lost", "a balance is never negative". State invariants in plain words, then decide where each is enforced.`,
    `Prefer the strongest enforcement that fits: a <b>database constraint</b> (cannot be bypassed by any code path), then a <b>type or validation</b> at the boundary, then a <b>test</b>, and last a <b>convention</b> in a document. The weaker the enforcement, the more a reviewer should worry.`,
    `<b>Evidence</b> is something you can look at: a failing test that now passes, a query plan, a measured percentile. A single average hides trouble. Report p50, p95 and p99, because the slowest requests are the ones users remember, and under load the tail grows quickly (Dean and Barroso, The Tail at Scale).`,
    `<b>Little's law</b> links the numbers: the average number of requests in the system equals arrival rate times average time in the system. If 500 requests arrive per second and each takes 0.2 s, about 100 are in flight at once, which tells you how many workers or connections you need.`
  ],
  terms: [
    [`Invariant`, `A statement that must hold in every state.`],
    [`Percentile`, `p99 is the value that 99 percent of requests are faster than.`],
    [`Little's law`, `In-flight requests = arrival rate x time in system.`],
    [`Evidence`, `A test result, plan, trace or measurement you can inspect.`]
  ],
  example: {
    setup: `The agent says: "Search is now fast." Treat that as a claim, not a fact.`,
    body: [
      `Ask for the numbers: p50, p95 and p99 before and after, with the traffic and data volume used. Suppose p50 went from 80 ms to 40 ms but p99 stayed at 1.4 s. The average improved and the users who matter most saw nothing.`,
      `For correctness, ask which invariant the change touches: "an ad that is deleted never appears in search". Where is that enforced? If the answer is "the indexing job usually removes it", it is a convention, and you should ask for the test that deletes an ad and checks the result.`
    ],
    table: {
      head: [`Claim`, `Evidence to ask for`, `Weak substitute`],
      rows: [
        [`It is faster`, `p50, p95, p99 before and after, same load`, `One timing on a laptop`],
        [`The index is used`, `EXPLAIN output on realistic data`, `"An index exists"`],
        [`No duplicates`, `A unique constraint, plus a test of the race`, `A check in application code`],
        [`It handles failure`, `A test that kills the dependency`, `A comment saying so`]
      ]
    }
  },
  technique: [
    { t: `Write the invariants`, x: `In plain words, one per line, before reading the code.` },
    { t: `Find where each is enforced`, x: `Constraint, type, validation, test or convention. Note the weakest ones.` },
    { t: `Turn each claim into a question for evidence`, x: `"Faster" becomes "show p50, p95 and p99 on the same load".` },
    { t: `Check the tail, not the mean`, x: `Look at p95 and p99 and at behavior near saturation.` },
    { t: `Look for the test that would fail`, x: `Ask which test breaks if the invariant is violated. If none, the invariant is unprotected.` }
  ],
  mistakes: [
    { t: `Believing the average`, ctx: `The report says average latency is 60 ms. A few percent of requests take seconds and nobody sees them.`, fix: `Ask for percentiles and a histogram, and judge by p95 and p99.` },
    { t: `An invariant kept in a comment`, ctx: `A comment says "emails are unique". Two simultaneous sign-ups both pass the application check.`, fix: `Add a unique constraint. A race can only be closed where the data lives.` },
    { t: `Testing only the happy path`, ctx: `All tests pass, but none deletes, retries or runs two requests at once.`, fix: `Ask for a test that breaks each invariant: duplicate, delete, concurrent update.` }
  ],
  review: [
    `Which invariants does this change touch, and where is each enforced?`,
    `For every "faster", "safer" or "fixed": where is the evidence, and is it on realistic data?`,
    `Percentiles, or just an average? Is the load the same before and after?`,
    `Red flag: a claim of correctness with no test that could fail.`
  ],
  exercise: {
    prompt: `The agent reports "average API latency dropped from 120 ms to 95 ms after the change". 500 requests per second arrive. How many requests are in flight, and what else do you ask for?`,
    answer: `<p>By Little's law, in flight = 500 x 0.095 = about 48 requests (it was 60 before). That tells you the concurrency the service needs.</p><p>Ask for p95 and p99, because the mean can improve while the tail gets worse. Ask for the load and data volume of both runs, the error rate, and whether the test included cold caches and a slow dependency. An average alone is not evidence of a better user experience.</p>`
  },
  checklist: [
    `I wrote the invariants before reading the code.`,
    `Each invariant has its enforcement named, and I know the weakest.`,
    `Every performance claim has p95 or p99 on the same load.`,
    `Every correctness claim has a test that could fail.`
  ],
  artifact: `An invariant table (statement, where enforced, test) and an evidence log (claim, measurement, load, date).`,
  agent: `The agent lists the invariants a change touches, prefers a database constraint to a code check, and attaches the test or measurement for each claim it makes.`,
  src: `J. Dean and L. Barroso, The Tail at Scale, CACM 56(2), 2013. J. D. C. Little, A Proof for the Queuing Formula L = lambda W, Operations Research 9(3), 1961. Backend from First Principles, chapter 18 (percentiles, queuing, EXPLAIN ANALYZE). PostgreSQL manual: constraints. Numbers are invented examples.`
},
{
  title: `Reviewing an agent's output`,
  short: `A repeatable protocol of five lenses and a list of red flags, so a review catches what a skim misses.`,
  why: `Agent output looks finished: clean code, confident prose, passing tests that it wrote itself. The failure modes are different from a human's. It invents function names and config keys, follows the happy path, copies patterns that do not fit your context, and rarely says "I am unsure". A review protocol makes you look in the right places.`,
  concept: [
    `Review through <b>five lenses</b>, in order: <b>fit</b> (does it solve the stated problem and stay inside the scope?), <b>correctness and data</b> (invariants, keys, transactions, migrations), <b>failure behavior</b> (timeouts, retries, partial work), <b>security</b> (who may do this, what input is trusted), and <b>operability</b> (can we see it, deploy it, roll it back?).`,
    `Size the review to the risk. A diff that touches authentication, money, a migration or a public contract gets a slow, line-by-line review. A rename gets a skim and a test run.`,
    `Watch for agent-specific <b>red flags</b>: an API, flag or config key you cannot find in the documentation (it may be invented), tests that only assert what the code does, broad permissions "to make it work", an error caught and ignored, a "handle later" note standing in for a hard case, a very large diff, and confidence with no evidence.`,
    `Do not review alone against your memory. Ask the agent to <b>show its work</b>: the query plan, the failing test before the fix, the source line for a claim. A reviewer's tools are questions, and the best question is "how would you know if this were wrong?"`
  ],
  terms: [
    [`Lens`, `One angle of review: fit, correctness, failure, security, operability.`],
    [`Hallucinated API`, `A function, option or key the agent invented that does not exist.`],
    [`Tautological test`, `A test that restates the implementation and cannot fail for the right reasons.`],
    [`Risk sizing`, `Matching review depth to the damage a wrong change could do.`]
  ],
  example: {
    setup: `The agent returns a handler for "the seller deletes an ad". It is shown below in language-neutral pseudo-code.`,
    body: [
      `<pre>DELETE /ads/{id}
  ad = db.query("SELECT * FROM ad WHERE ad_id = " + id)
  db.exec("DELETE FROM ad WHERE ad_id = " + id)
  cache.delete("ad:" + id)
  return 200</pre>`,
      `Apply the lenses. Each one finds something. The point is the habit, not this particular handler.`
    ],
    table: {
      head: [`Lens`, `What the review finds`, `Question to the agent`],
      rows: [
        [`Fit`, `Spec says "soft delete so the seller can restore for 30 days". This hard deletes.`, `Which requirement does this implement?`],
        [`Correctness`, `Row and cache are changed separately: a failure between them leaves a deleted ad in cache. No check for related conversations.`, `What happens if the process dies after the delete?`],
        [`Failure`, `The cache call has no timeout or error handling, so a cache outage fails a successful delete.`, `What does the user see when the cache is down?`],
        [`Security`, `Any caller can delete any ad (no ownership check, the classic object-level authorization hole), and the id is concatenated into SQL (injection).`, `Where do you check that the caller owns the ad? Show the parameterized query.`],
        [`Operability`, `No log line, no metric, no audit record of who deleted what.`, `How would on-call know deletes spiked?`]
      ]
    }
  },
  technique: [
    { t: `Size the risk`, x: `Does it touch auth, money, data shape or a public contract? If yes, review slowly.` },
    { t: `Read the request, then the result`, x: `Restate the requirement first, so you notice scope creep and omissions.` },
    { t: `Run the five lenses in order`, x: `Fit, correctness, failure, security, operability. Write one finding or "checked, none" for each.` },
    { t: `Scan for red flags`, x: `Invented names, swallowed errors, tautological tests, broad permissions, huge diff, confidence without evidence.` },
    { t: `Ask for evidence and re-review`, x: `Send the findings back as questions, then check that the fix is tested. Accept only with the evidence in hand.` }
  ],
  mistakes: [
    { t: `Reviewing the diff and not the requirement`, ctx: `The code is neat, so it is approved. It deletes instead of soft deleting and nobody notices because the requirement was never reread.`, fix: `Restate the requirement and list what the change must do before you read the code.` },
    { t: `Trusting the agent's tests`, ctx: `The agent wrote the code and the tests. Both encode the same misunderstanding and both pass.`, fix: `Read the assertions. Ask for a test written from the requirement, and for one that fails on the old code.` },
    { t: `Accepting a large diff in one go`, ctx: `A 2,000 line change gets a quick scroll and an approval, because it is too big to read.`, fix: `Ask the agent to split it into reviewable steps, each with its own evidence.` }
  ],
  review: [
    `Have you written one line for each lens, even if it is "checked, none"?`,
    `Can you find every function, option and config key in the real documentation or source?`,
    `Would the agent's tests fail if the requirement were violated? Run them against a deliberately broken version.`,
    `Red flag: approval requested with no list of what was and was not verified.`
  ],
  exercise: {
    prompt: `The agent adds <code>ALTER TABLE ad RENAME COLUMN price TO price_vnd</code> and deploys code that reads the new name in the same release, with the claim "tested, safe". Review it with the lenses and say what you ask for.`,
    answer: `<p>Fit: does a rename serve the requirement, or only taste? Correctness: during a rolling deploy, old servers still read <code>price</code> and fail. Failure: no rollback is described, and reversing the rename after new writes is not trivial. Operability: no mention of how the change is observed. Security: no concern here, say "checked, none".</p><p>Ask for the expand-migrate-contract plan from the data modeling module: add the new column, dual write, move reads, drop the old column later, with an undo for each step. Ask what "tested" means: on what data and with which deployment order.</p>`
  },
  checklist: [
    `I sized the review to the risk before reading.`,
    `I restated the requirement and compared the result to it.`,
    `I wrote a finding or "checked, none" for each of the five lenses.`,
    `I scanned for the red flags and asked for evidence for every claim.`
  ],
  artifact: `A one-page review record: requirement, risk size, finding per lens, red flags found, evidence requested and received, decision.`,
  agent: `This is what you review. The backend-engineer plugin agents are designed to attach their own lens findings and evidence to every change, so that your review checks their reasoning instead of rediscovering it. You approve or reject with the record in front of you.`,
  src: `OWASP API Security Top 10 (2023), API1 Broken Object Level Authorization and API5 Broken Function Level Authorization. OWASP SQL Injection Prevention Cheat Sheet. Backend from First Principles, chapter 17 (security mindset, BOLA and BFLA, parameterized queries). M. Nygard, Release It!, 2018.`
}
];
