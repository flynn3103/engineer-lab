/* Architecture and system design: five lessons. Running scenario: a classifieds marketplace. All numbers are invented examples. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['architecture'] = [
{
  title: `Back-of-the-envelope estimation`,
  short: `Turn the requirements into rough orders of magnitude for traffic, storage and bandwidth, and show the arithmetic.`,
  why: `A design is only right for a size. Without estimates, an agent will choose a database cluster for 20 requests per second or a single server for 20,000, and both look equally plausible in a diagram. Estimation takes ten minutes and tells you which problems are real.`,
  concept: [
    `An <b>estimate</b> is a calculation with stated inputs, good enough to be within a factor of two or three. The goal is the <b>order of magnitude</b>, not precision. Show every input, mark each as measured, assumed or invented, and keep the unit on each number.`,
    `Start from <b>users and behavior</b>: daily active members, actions per member per day, the size of one record. Convert to rates: requests per day divided by 86,400 seconds gives the <b>average per second</b>. Real traffic is not flat, so multiply by a <b>peak factor</b> (2 to 10, measured from your own data if you have it) to get the peak rate you design for.`,
    `<b>Storage</b> is records times size times retention, then multiplied for indexes and replicas (a common rough factor is 2 to 3 for the copies). <b>Bandwidth</b> is requests per second times response size. Images usually dominate storage and bandwidth in a marketplace, so estimate them separately from rows of text.`,
    `Useful <b>latency numbers</b> are in the same order of magnitude everywhere: memory access in nanoseconds, an SSD read in tens to hundreds of microseconds, a round trip inside a data center around half a millisecond, and a round trip across continents in the order of 100 milliseconds. They are the reason a cache in memory and a query across the world cost very different amounts. They are rules of thumb that change with hardware, so treat them as orders of magnitude.`,
    `Then <b>apply Little's law</b> from the mindset module: requests in flight equal arrival rate times time in system. It gives the number of workers or connections you need, and a check on whether a single database can take the load.`
  ],
  terms: [
    [`Order of magnitude`, `The power of ten of a quantity: is it hundreds, thousands or millions?`],
    [`Peak factor`, `The ratio of peak rate to average rate.`],
    [`Read to write ratio`, `How many reads happen for each write. It shapes caching and replicas.`],
    [`Little's law`, `In-flight requests = arrival rate x time in system.`]
  ],
  example: {
    setup: `Estimate the marketplace for the design review. All inputs are invented, and each is labelled so a reviewer can replace it with a measured value.`,
    body: [
      `Inputs (invented): 2 million members, 400,000 daily active. Each active member views 25 ads and runs 6 searches per day. 20,000 new ads per day with 5 images each, average 400 KB per image after resizing. Peak factor 5.`,
      `Reads: 400,000 x (25 + 6) = 12.4 million reads per day, which is 12.4e6 / 86,400, about 144 per second on average, and about 720 per second at peak. Writes: 20,000 ads per day is about 0.23 per second, so the system is read-heavy with a ratio in the thousands to one. Storage: 20,000 x 5 x 400 KB = 40 GB of images per day, about 14.6 TB per year, before copies. Ad rows are tiny by comparison (20,000 x 2 KB = 40 MB per day). Little's law: at 720 requests per second and 100 ms each, about 72 requests are in flight.`,
      `What the numbers say: one well-indexed relational database handles 720 reads per second of simple queries, so the database is not the problem. Images are. Bandwidth for images at peak is large, so a CDN and object storage belong in the design, while sharding does not.`
    ],
    table: {
      head: [`Quantity`, `Calculation (invented inputs)`, `Result`],
      rows: [
        [`Reads per day`, `400,000 x (25 + 6)`, `12.4 million`],
        [`Peak reads per second`, `12.4e6 / 86,400 x 5`, `about 720`],
        [`Ad writes per second`, `20,000 / 86,400`, `about 0.23`],
        [`Image storage per year`, `20,000 x 5 x 400 KB x 365`, `about 14.6 TB`],
        [`In flight at peak`, `720 x 0.1 s`, `about 72`]
      ]
    }
  },
  technique: [
    { t: `List the inputs and label each one`, x: `Users, actions per user, record size, retention, peak factor. Mark measured, assumed or invented.` },
    { t: `Convert to rates`, x: `Per day to per second, then multiply by the peak factor. Separate reads and writes.` },
    { t: `Estimate storage and bandwidth separately`, x: `Rows, indexes, images and replicas, each on its own line.` },
    { t: `Apply Little's law`, x: `In-flight requests from rate and latency. Check that the connection pool and worker count are of the same order.` },
    { t: `Say which design decision each number drives`, x: `Read-heavy means replicas or cache. Large images mean object storage and a CDN. If a number drives nothing, drop it.` }
  ],
  mistakes: [
    { t: `Using the average as the design load`, ctx: `The estimate says 144 requests per second. At the evening peak the system sees five times that and the connection pool runs out.`, fix: `Design for peak. Take the peak factor from real traffic and state it.` },
    { t: `False precision`, ctx: `The agent reports "11,834,291 requests per day" from invented inputs. The extra digits suggest a measurement that does not exist.`, fix: `Round to one or two significant digits and say the inputs are assumptions.` },
    { t: `Forgetting the biggest item`, ctx: `All the effort goes to row counts while images are 99.9 percent of the bytes.`, fix: `Rank items by size first and spend time on the top one.` }
  ],
  review: [
    `Are all the inputs listed, labelled as measured, assumed or invented, and with units?`,
    `Is the peak rate shown, and where does the peak factor come from?`,
    `Does each result point to a design decision, and does any decision rest on no number at all?`,
    `Is storage estimated with replicas, indexes and retention, and are images treated separately?`,
    `Red flag: a design that names sharding, a message broker or a cluster size and has no estimate on the page.`
  ],
  exercise: {
    prompt: `Using the same invented inputs, 30 percent of members open the chat every day and send 8 messages each, 200 bytes each. Estimate message writes per second at peak (factor 5) and the storage per year. Is one database enough?`,
    answer: `<p>Daily active members are 400,000, so chat users are 120,000. Messages per day: 120,000 x 8 = 960,000. Per second on average: about 11. At peak: about 55 writes per second. Storage: 960,000 x 200 bytes is about 192 MB per day, so about 70 GB per year of raw text, a few times that with indexes and replicas.</p><p>One relational database handles 55 small writes per second easily, and 70 GB per year is small. The conclusion is that message volume alone does not justify sharding or a separate store. What may justify a different design is delivery latency to a live connection, which is a separate requirement. All numbers are invented.</p>`
  },
  checklist: [
    `Every input has a unit and a label (measured, assumed, invented).`,
    `I computed average and peak rates, reads and writes separately.`,
    `Storage includes indexes, replicas, retention and images.`,
    `Each result is tied to a design decision.`
  ],
  artifact: `Section 2 of the design document: an estimation table with inputs, calculations, results and the decision each result drives.`,
  agent: `The agent builds the estimation table from the functional spec before it proposes any component, labels every input, flags the inputs it had to guess, and shows which decision each number supports.`,
  src: `M. Kleppmann, Designing Data-Intensive Applications, ch. 1 (describing load and performance). J. Dean, Latency Numbers Every Programmer Should Know (the widely circulated list, orders of magnitude only). J. D. C. Little, A Proof for the Queuing Formula L = lambda W, 1961. Course pages on this site: PostgreSQL internals (what one node can do). All estimates in the example use invented inputs.`
},
{
  title: `From problem to components: high-level design`,
  short: `Walk each requirement to the smallest set of components that satisfies it, and draw the data flow.`,
  why: `High-level design is where a team commits to boxes and arrows. Agents like to draw many boxes because every box looks like rigor. A reviewer looks for the opposite: the fewest components that meet the requirements and estimates, with every box traceable to a need.`,
  concept: [
    `Start with the <b>simplest design that could work</b>: a client, an application server and a database. Then change it only where a requirement or an estimate forces you. Each addition (cache, queue, search engine, object store) must name the requirement it serves and the number that justifies it.`,
    `A <b>component</b> is a part with one job and a boundary: it has inputs, outputs and data it owns. Typical building blocks: application servers, a relational database, object storage for files, a cache, a search index, a message queue and a CDN. Know what each one is good at and what it is not.`,
    `Design by <b>following the requests</b>. Take each important use case (post an ad, search, open an ad, send a message) and draw the path of one request through the components, with the data written and read at each step. The paths expose missing pieces and the places where state lives.`,
    `Decide the <b>source of truth</b> for every piece of data. Where the same fact appears in two places (an ad in the database and in the search index), say which one wins, and how the other is rebuilt. A derived copy that cannot be rebuilt is a second source of truth by accident.`,
    `Draw the <b>boundaries</b>: what is inside your system, what is a third party (payment, email, moderation), and what crosses the network. Each arrow that crosses a boundary needs a timeout and a failure behavior, as in the mindset module.`
  ],
  terms: [
    [`Component`, `A part with one job, a boundary and data it owns.`],
    [`Source of truth`, `The one place whose value wins when copies disagree.`],
    [`Derived data`, `A copy built from the source of truth, such as a search index, which can be rebuilt.`],
    [`Data flow`, `The path of data through components for one use case.`]
  ],
  example: {
    setup: `Requirements (summarized from the spec): members post ads with images, buyers search and filter, buyers save ads and chat with sellers. Estimates say about 720 reads per second at peak and 14.6 TB of images per year (invented numbers). Build the design from the simplest start.`,
    body: [
      `Start: client, app server, PostgreSQL. This handles ads, members, saved ads and messages at the estimated rate. Now ask what the numbers force. Images: 14.6 TB per year in a database is the wrong place, so add <b>object storage</b> for the files, with the database keeping only the key, and a <b>CDN</b> in front for delivery. Search: filtering and text search across millions of ads with many filter combinations is poorly served by the primary table, so add a <b>search index</b> as derived data, rebuilt from the ad table. Chat: delivery to a connected buyer wants a live connection, but the messages are still stored in the database.`,
      `Not added, on purpose: a cache (the database handles the read rate, add one when measurement says so), a message broker (30 events per second does not need one yet, though the search index update is a candidate for a simple queue), and any split into services. Each is a decision to revisit with a trigger, which the next lessons record.`
    ],
    table: {
      head: [`Component`, `Requirement it serves`, `Number that justifies it`, `Source of truth?`],
      rows: [
        [`App server`, `All use cases`, `720 reads per second at peak`, `No (stateless)`],
        [`PostgreSQL`, `Ads, members, saved ads, messages`, `Under 1 write per second for ads`, `Yes, for all rows`],
        [`Object storage and CDN`, `Ad images`, `14.6 TB per year`, `Yes, for image bytes`],
        [`Search index`, `Search and filter`, `Millions of ads, many filters`, `No, rebuilt from the ad table`]
      ]
    }
  },
  technique: [
    { t: `Draw the simplest design first`, x: `Client, server, one database. Check it against the estimates.` },
    { t: `Walk each use case through the diagram`, x: `Write the request path for post ad, search, open ad, send message. Note what is written and read at each step.` },
    { t: `Add a component only for a stated reason`, x: `Name the requirement and the number. If you cannot, remove the box.` },
    { t: `Name the source of truth for each data set`, x: `Mark derived data and say how it is rebuilt if lost.` },
    { t: `Mark boundaries and third parties`, x: `Every arrow that crosses the network or leaves the system gets a timeout and a failure behavior.` }
  ],
  mistakes: [
    { t: `Boxes without reasons`, ctx: `The diagram has an API gateway, a cache, a broker, a search cluster and five services for a system doing 720 reads per second.`, fix: `Ask which requirement and which number each box serves. Delete those that have neither.` },
    { t: `Two sources of truth`, ctx: `The ad is edited in the database and in the search index, so a price change is sometimes lost and nobody knows which value is right.`, fix: `Declare one source. The other is derived and rebuilt from it, never edited by hand.` },
    { t: `Only the happy path drawn`, ctx: `The diagram shows an image upload going to storage. It does not show what happens if the database write fails after the upload.`, fix: `Draw the failure branch for each write that touches two systems.` }
  ],
  review: [
    `Which requirement and which estimate justify each component?`,
    `What is the source of truth for each data set, and how is each derived copy rebuilt?`,
    `Can I follow post ad, search and send message through the diagram end to end?`,
    `What was deliberately left out, and what number would change that?`,
    `Red flag: a component whose only justification is that it is common in large systems.`
  ],
  exercise: {
    prompt: `The agent adds a Redis cache, a Kafka topic and a recommendation service to the marketplace design with the estimates above. Which would you ask for justification on first, and what evidence would you accept?`,
    answer: `<p>All three need justification, but the Kafka topic and the recommendation service add the most operating cost and failure modes. For each ask: which requirement, which number, and what breaks without it.</p><p>The cache: accept it if a measurement shows the database near its limit or a specific query is hot and read-mostly, with a stated invalidation rule. Kafka: accept it if there are several independent consumers of the same events or a need to replay, which 30 events per second alone does not show, and a simple queue may do. The recommendation service: accept it only if a requirement asks for recommendations. Otherwise it is scope creep (see the requirements module).</p>`
  },
  checklist: [
    `The design starts from client, server and database and grows only where forced.`,
    `Each component names its requirement and the number that justifies it.`,
    `Source of truth and derived data are marked.`,
    `Request paths for the main use cases are drawn, with failure branches.`
  ],
  artifact: `Section 3 of the design document: a component diagram, a table of components with requirement, number and source of truth, and the request path of each main use case.`,
  agent: `The agent starts from the minimum design, adds components only with a requirement and a number, produces the component table, and lists what it chose not to add and the trigger for adding it.`,
  src: `M. Kleppmann, Designing Data-Intensive Applications, ch. 1 and 11 (derived data, systems of record). Course pages on this site: PostgreSQL, Redis, Kafka (what each component is for). Backend from First Principles, chapter 19 (scaling mental models, prefer simple solutions). Numbers are invented.`
},
{
  title: `Monolith, services or serverless: the real costs`,
  short: `Compare deployment shapes by what they cost in operations, failure modes and team coordination, not by fashion.`,
  why: `"Move to microservices" is one of the most common agent suggestions and one of the most expensive to get wrong. Each shape buys something and charges something. A reviewer needs the real list on both sides, and a trigger for when the answer changes.`,
  concept: [
    `A <b>monolith</b> is one deployable unit that contains all features. Calls between features are function calls: fast, in one transaction, and easy to debug. It costs you independent scaling and independent deployment, and a large codebase can become tangled. A <b>modular monolith</b> keeps one deployable but enforces clear internal boundaries, which keeps most of the benefits of both.`,
    `<b>Services</b> (often called microservices) split features into separately deployed processes that talk over the network. They buy <b>independent deployment</b>, <b>independent scaling</b> of one workload, and <b>team autonomy</b> with clear ownership. They charge <b>network failure</b> (every call can be slow, down, duplicated), <b>distributed data</b> (no single transaction across services), more <b>operations</b> (many pipelines, logs, dashboards) and harder <b>debugging</b> (a request spans many processes).`,
    `<b>Serverless</b> (functions as a service) runs your code on demand and charges by use. It buys <b>no servers to manage</b>, <b>scaling to zero</b> and fast scaling for spiky work. It charges <b>cold starts</b> (a delay when a new instance starts), <b>execution limits</b> that depend on the provider, <b>connection management</b> against databases (many short-lived instances can exhaust connections), and <b>lock-in</b> to the platform's services. It suits event-driven glue and spiky workloads better than a steady high-rate API.`,
    `The deciding factors are mostly <b>organizational and operational</b>: how many teams, how often they need to deploy independently, whether one part has a very different scaling or reliability need, and the platform maturity you have for service discovery, tracing and deploys. A team of 6 with one product rarely benefits from 12 services.`,
    `A sound path is <b>monolith first, extract by evidence</b>: keep a modular monolith, and extract a piece when a stated trigger fires, such as "image processing needs its own scaling and its failures must not affect posting". Extraction is easier if the boundary was a module already.`
  ],
  terms: [
    [`Monolith`, `One deployable unit containing all features.`],
    [`Modular monolith`, `One deployable with enforced internal module boundaries.`],
    [`Cold start`, `The delay when a serverless platform starts a new instance to serve a request.`],
    [`Extraction trigger`, `The measurable condition that justifies splitting a part out.`]
  ],
  example: {
    setup: `The agent proposes splitting the marketplace into member, ad, search, chat and notification services "for scalability". The team is 7 engineers and traffic is 720 requests per second at peak (invented numbers). Compare the options.`,
    body: [
      `With the split, "post an ad" now touches the ad service, the member service (is the poster active?), the moderation service and the search service, over the network. Each call needs a timeout and a failure rule. The single transaction that saved the ad and updated the member's count is gone, so you need an outbox or a saga, and the new code is mostly coordination. Meanwhile the load does not need the split: one instance type with several copies behind a load balancer handles 720 requests per second.`,
      `A better plan: a modular monolith with modules named after the glossary (member, ad, search, chat), and one extraction with a trigger: the image processing worker, which is CPU-heavy and has a different scaling shape, runs separately and consumes a queue. Serverless is reasonable for that worker if its volume is spiky and its jobs are short. Revisit when a second team needs to deploy chat independently or when chat needs different availability than browsing.`
    ],
    table: {
      head: [`Shape`, `Buys`, `Pays`, `Fits when`],
      rows: [
        [`Modular monolith`, `One transaction, simple debugging, one deploy`, `Shared scaling, one release train`, `Small to mid teams, one product`],
        [`Services`, `Independent deploys and scaling, team autonomy`, `Network failure, distributed data, more operations`, `Several teams, parts with different scaling or reliability needs`],
        [`Serverless functions`, `No servers, scale to zero, pay per use`, `Cold starts, limits, connection and lock-in costs`, `Spiky or event-driven work, glue`]
      ]
    }
  },
  technique: [
    { t: `State the problem the split must solve`, x: `Independent deploys, different scaling, a different failure domain, team boundaries. If none applies, stay in the monolith.` },
    { t: `Count the new failure modes`, x: `List each network call introduced and ask slow, down, wrong, duplicated, partial for it.` },
    { t: `Check the data boundaries`, x: `Which transactions would cross services? Say how each is replaced (outbox, saga, or keeping the data together).` },
    { t: `Estimate the operating cost`, x: `Pipelines, dashboards, on-call, tracing. Compare it with the team size.` },
    { t: `Record the extraction trigger`, x: `Write the measurable condition that would change the decision, and the module that would be extracted first.` }
  ],
  mistakes: [
    { t: `Splitting for performance`, ctx: `"Microservices will make it faster." A network call is slower than a function call, so a request gets longer, not shorter.`, fix: `Only split to scale or deploy a part independently. Show the measurement that says that part is the bottleneck.` },
    { t: `A distributed monolith`, ctx: `Five services that must be deployed together and share one database. You pay for the network and get none of the independence.`, fix: `Ask whether any one service can deploy and run alone. If not, the boundary is wrong.` },
    { t: `Serverless against a shared database`, ctx: `A burst starts 500 function instances and each opens a database connection, exceeding the connection limit.`, fix: `Use a connection pool or proxy and cap concurrency, and test the burst.` }
  ],
  review: [
    `What specific problem does the proposed split solve, and what number shows that problem exists?`,
    `Which transactions now cross a boundary, and how is consistency kept?`,
    `Can each service be deployed, scaled and fail alone? If not, why separate them?`,
    `How many engineers will operate this, and what is the on-call load?`,
    `Red flag: "for scalability" or "microservices are best practice" as the only justification.`
  ],
  exercise: {
    prompt: `The agent wants a serverless function for the "send message" endpoint of the chat feature, which has a steady 55 writes per second at peak and a 2 second delivery target (invented). Evaluate it.`,
    answer: `<p>The traffic is steady and not spiky, so scaling to zero adds nothing. Cold starts can add latency to the 2 second target at low traffic moments. Each instance needs a database connection, so you need pooling. A persistent connection for live delivery (WebSocket or similar) is not what short-lived functions are built for.</p><p>Better: a regular service or a module in the monolith with an always-on instance behind the load balancer. Serverless could still suit a rarely used or bursty job such as sending a daily digest email. Evidence to ask for: a measured cold start, the connection limit of the database, and the cost at steady load.</p>`
  },
  checklist: [
    `I know what problem the split solves and its number.`,
    `New network calls and their failure behaviors are listed.`,
    `Cross-boundary transactions have a stated replacement.`,
    `Operating cost is compared with team size.`,
    `An extraction trigger is recorded.`
  ],
  artifact: `Section 4 of the design document: the deployment shape with a cost and benefit table, and the extraction triggers.`,
  agent: `The agent defaults to a modular monolith, lists every network call and every cross-boundary transaction a split would add, and proposes a split only with a trigger and a measurement behind it.`,
  src: `S. Newman, Building Microservices, 2nd ed., O'Reilly 2021 (costs and when to split, the distributed monolith). M. Fowler, MonolithFirst, martinfowler.com, 2015. Cloud provider documentation for the specific platform's limits and cold start behavior (check the current figures for your provider). Backend from First Principles, chapter 19 (what microservices cost). Team size and traffic are invented.`
},
{
  title: `Statelessness, queues and where state lives`,
  short: `Keep servers disposable by moving state to a few named places, and use queues to separate work that need not be done in the request.`,
  why: `Where state lives decides how you scale, deploy and recover. State kept in server memory breaks when you add a second server or restart. Work done inside the request makes the user wait for slow steps. Both mistakes come from not asking, for each piece of data, where it lives and who may lose it.`,
  concept: [
    `A <b>stateless</b> service keeps no information between requests that a different instance could not obtain. Any instance can serve any request, so you can add, remove and restart instances freely behind a load balancer. The state is not gone. It lives in a database, a cache, a session store or the request itself, such as a signed token.`,
    `Make a <b>state inventory</b>. For each kind of state, write: where it lives, how durable it must be, who writes it, and what happens if it is lost. Sessions, uploaded files, rate limit counters, search index, job progress and caches each have a different answer. Lost cache data is a slowdown. Lost orders or messages are a failure.`,
    `A <b>queue</b> decouples producing work from doing it. The request puts a job on the queue and returns, and a worker does it later. Use a queue when work is <b>slow</b> (image resizing), <b>unreliable</b> (a third-party call), <b>spiky</b> (absorbs a burst, the workers drain it at a steady rate) or needs to <b>fan out</b> to several consumers. It does not make work faster, it moves it out of the user's wait.`,
    `A queue changes the failure model. A job may be <b>delivered more than once</b>, so the worker must be idempotent. A job may <b>fail forever</b>, so there is a retry limit and a dead-letter queue for inspection. The queue itself needs a <b>capacity and age alarm</b>: depth and oldest message age tell you whether workers keep up. You must also decide what the user sees while the work is pending ("processing").`,
    `The trap is the <b>dual write</b>: saving to the database and publishing to a queue as two steps. If the process dies between them, the two disagree. The usual answer is the <b>transactional outbox</b>: write the job into a table in the same database transaction, and have a relay publish it. The async module covers it in detail. For this lesson, flag any design that writes to two systems without saying what happens in between.`
  ],
  terms: [
    [`Stateless service`, `Any instance can serve any request because state lives outside the process.`],
    [`State inventory`, `A table of each kind of state: where, how durable, who writes it, what if lost.`],
    [`Dead-letter queue`, `A place for jobs that failed too many times, kept for inspection.`],
    [`Outbox`, `A table written in the same transaction as the data, read by a relay that publishes the messages.`]
  ],
  example: {
    setup: `Posting an ad with 5 photos. The agent's first design stores uploaded files on the server's local disk, keeps the login session in server memory, and resizes images inside the request.`,
    body: [
      `What breaks: with two servers behind a load balancer, a photo uploaded to server A is not on server B, and a login on A is unknown to B. A deploy that restarts a server loses its sessions. Resizing five images takes about 3 seconds (invented), so the user waits and a spike of posts ties up all the workers.`,
      `The fixed design: photos go to object storage (the database keeps the key), sessions live in a signed token or a shared session store, and the request saves the ad as "pending" and puts a resize job on a queue. A worker resizes, writes the variants to object storage and marks the images ready, then the ad becomes active after moderation. The state inventory makes each decision visible. The worker is idempotent: resizing the same image twice writes the same result to the same key, so a duplicate delivery is harmless.`
    ],
    table: {
      head: [`State`, `Lives in`, `Durability`, `If lost`],
      rows: [
        [`Ad, member, saved ad rows`, `PostgreSQL`, `Replicated, backed up`, `Serious: restore from backup`],
        [`Image bytes`, `Object storage`, `Replicated by the store`, `Serious: ad loses photos`],
        [`Login session`, `Signed token or shared store`, `Short-lived`, `Member logs in again`],
        [`Resize job`, `Queue with retry and dead-letter`, `Survives restart`, `Image stays unprocessed, alarm fires`],
        [`Cached ad page`, `Cache`, `None`, `Slower, rebuilt from database`]
      ]
    }
  },
  technique: [
    { t: `Build the state inventory`, x: `List every kind of state, where it lives, its durability, its writer and the impact of losing it.` },
    { t: `Remove state from the servers`, x: `Move files to object storage, sessions to a token or shared store, counters to a shared store. Confirm any instance can serve any request.` },
    { t: `Choose what goes on a queue`, x: `Slow, unreliable, spiky or fan-out work. Keep fast, must-be-consistent steps in the request.` },
    { t: `Design the failure model of each queue`, x: `Idempotent worker, retry limit with backoff, dead-letter queue, alarm on depth and age.` },
    { t: `Close the dual write`, x: `For every place that writes to two systems, state what happens between the writes, or use an outbox.` }
  ],
  mistakes: [
    { t: `Hidden state in the server`, ctx: `An in-memory map of rate limit counters or sessions works with one instance and fails the day a second one is added.`, fix: `Search the code for module-level maps and local files. Each one goes in the state inventory with a new home.` },
    { t: `A queue with no failure plan`, ctx: `A job fails on bad input and is retried forever, blocking the queue and doubling the cost.`, fix: `Cap retries, back off, send to a dead-letter queue, and alarm on its size.` },
    { t: `Dual write with no recovery`, ctx: `The ad is saved, then the search index update is sent. The process dies in between, and the ad is never searchable.`, fix: `Use an outbox, or a periodic reconciliation job that compares the source of truth with the derived data.` }
  ],
  review: [
    `Is there a state inventory? Where do files, sessions and counters live?`,
    `Can I kill any instance at any moment without losing a user's data?`,
    `For each queue: is the worker idempotent, what is the retry limit, where do dead jobs go, and what alarm watches depth and age?`,
    `What does the user see while queued work is pending?`,
    `Red flag: a write to the database followed by a separate publish to a queue with nothing to cover a crash in between.`
  ],
  exercise: {
    prompt: `The agent stores "unread message count" in server memory, increments it on each message, and sends an email through the queue when the count reaches 10. Find the problems.`,
    answer: `<p>The count in memory is lost on restart and differs between instances, so it is wrong as soon as there is more than one server. Move it to the database (derived from messages, or a column updated in the same transaction) or a shared store, and decide whether it may be approximate.</p><p>The email through the queue: the worker may run twice, so send idempotently with a key (member id and the threshold event), or the member gets two emails. The "reaches 10" check is racy if two messages arrive at once, so use an atomic update. Add retries with backoff, a dead-letter queue and an alarm for the age of the oldest job.</p>`
  },
  checklist: [
    `A state inventory exists, and no state is hidden in a server.`,
    `Any instance can serve any request.`,
    `Every queue has an idempotent worker, a retry limit, a dead-letter queue and an alarm.`,
    `Dual writes are closed with an outbox or reconciliation.`
  ],
  artifact: `Section 5 of the design document: the state inventory table and, for each queue, its failure model.`,
  agent: `The agent produces the state inventory, scans code for in-memory state and local files, specifies retry, dead-letter and alarm settings for each queue, and flags every dual write it finds.`,
  src: `The Twelve-Factor App (A. Wiggins, 2011), factors VI (processes, stateless) and IX (disposability). M. Kleppmann, Designing Data-Intensive Applications, ch. 11 (messaging, reliable delivery, derived data). C. Richardson, Microservices Patterns, 2018 (transactional outbox). Course pages on this site: Kafka and Redis (queues and shared state). Durations are invented examples.`
},
{
  title: `Decision records and diagrams that survive review`,
  short: `Record each significant choice as a short decision record, and draw diagrams that a reviewer can check against the requirements.`,
  why: `A design that lives only in a chat transcript cannot be challenged six months later. Diagrams that mix levels of detail or show no data flow cannot be checked at all. Decision records and a few honest diagrams are the durable output of the whole design step.`,
  concept: [
    `An <b>architecture decision record</b> (ADR, from the mindset module) has a title, a context, the options considered, the decision, its status and its consequences, including the downsides. Write one for each significant, hard-to-reverse choice: the database engine, the deployment shape, the sync or async boundary, the identifier format. Number them and never rewrite history: a new record supersedes an old one.`,
    `Link each ADR to the <b>requirement and the estimate</b> it answers, and to the <b>trigger</b> that would reverse it. "Chose a modular monolith because the team is 7 and peak load is 720 requests per second. Revisit when a second team needs independent deploys." That one sentence of trigger makes the decision testable later.`,
    `Use the <b>C4 model</b> idea of levels as a way to keep diagrams honest: a <b>context</b> diagram (the system and the people and systems around it), a <b>container</b> diagram (the deployable pieces and datastores), and, where needed, a <b>component</b> diagram inside one container. One diagram, one level. Mixing a database table with a CDN on one picture confuses both.`,
    `Every diagram should answer a stated question and have a <b>legend</b>: what a box means, what an arrow means (a call, data flow, an event) and which direction. Label the arrows with the data and the protocol where it matters. Add a sequence diagram for the two or three requests that carry the risk, such as posting an ad. Keep the diagram next to the text, in a text format such as Mermaid, so it is reviewed in the same change as the code.`,
    `Finish with a <b>risks and open items</b> list: what the design does not handle yet, which assumptions are unconfirmed, and which numbers are invented. A design with no risks listed has not been reviewed.`
  ],
  terms: [
    [`ADR`, `A short record of a decision: context, options, decision, status, consequences.`],
    [`Superseded`, `The status of an old decision replaced by a newer record, kept for history.`],
    [`C4 model`, `Context, container, component and code: four zoom levels for architecture diagrams (S. Brown).`],
    [`Legend`, `A key stating what shapes and arrows mean.`]
  ],
  example: {
    setup: `The decision about the search index for the marketplace. Write the record the agent should produce, then judge a diagram.`,
    body: [
      `<pre>ADR-004  Search uses a separate index, rebuilt from the ad table
Status:    accepted (2026-10-14, example date)
Context:   FR-3 search and filter. About 5 million ads, 720 reads
           per second at peak (invented numbers). Filter combinations
           make a single B-tree index set impractical.
Options:   A) SQL with indexes and full text. B) separate search index
           as derived data. C) managed search service.
Decision:  B. Ad table stays the source of truth. A queue carries
           change events. A nightly job rebuilds and compares.
Consequences: results can lag by up to 60 s (NFR-3). We run one
           more system. Rebuild must be tested.
Revisit when: lag exceeds 60 s at p95, or the index exceeds one node.</pre>`,
      `Now a diagram check: one picture shows a client, three services, two queues, a table with its columns and a CDN, with unlabelled arrows. It mixes three levels and answers no question. Split it into a container diagram (what runs where) and one sequence diagram for "post an ad", each with labelled arrows and a legend.`
    ],
    table: {
      head: [`Diagram`, `Question it answers`, `Level`],
      rows: [
        [`Context`, `Who and what does the marketplace talk to?`, `System`],
        [`Container`, `What is deployed and where is data stored?`, `Containers and datastores`],
        [`Sequence: post ad`, `Which calls happen in what order, and where can it fail?`, `One use case`],
        [`ER diagram`, `What data do we keep and how does it relate?`, `Data model module`]
      ]
    }
  },
  technique: [
    { t: `Pick the decisions worth a record`, x: `Hard to reverse, expensive, or that cross teams: data store, deployment shape, identifiers, sync or async.` },
    { t: `Write the record with options and consequences`, x: `At least two options, the downsides of the chosen one, and the requirement and estimate it answers.` },
    { t: `Add a revisit trigger`, x: `A measurable condition. Supersede the record when it fires, do not edit it.` },
    { t: `Draw one level per diagram`, x: `Context, container, then a sequence for the risky use cases. Label arrows and add a legend.` },
    { t: `List risks, assumptions and invented numbers`, x: `End the design with what is unsettled, and who will confirm it.` }
  ],
  mistakes: [
    { t: `A record with no rejected option`, ctx: `"We chose PostgreSQL because it is reliable." No alternatives are named, so the record cannot be challenged.`, fix: `Name the other options and the reason each lost, in terms of the requirements and estimates.` },
    { t: `One diagram for everything`, ctx: `A single picture mixes deployables, tables and teams. Reviewers each read a different meaning.`, fix: `One level and one question per diagram. Add a legend.` },
    { t: `Editing old decisions`, ctx: `Someone rewrites ADR-004 after the system changed. The history of why it was chosen is gone.`, fix: `Mark the old record superseded, and write a new one that links back.` }
  ],
  review: [
    `For each ADR: which options were rejected, which requirement and number does it answer, and what is the revisit trigger?`,
    `Does each diagram have one level, a legend and labelled arrows?`,
    `Can I trace every requirement to a component and every component to a requirement?`,
    `Does the document list its risks, open assumptions and invented numbers?`,
    `Red flag: a hard-to-reverse decision (data store, public identifier, event schema) with no record and no human approval.`
  ],
  exercise: {
    prompt: `Write a four-line ADR for "image files are stored in object storage, and the database holds only the key". Include one rejected option, one cost and a revisit trigger.`,
    answer: `<p>Title: ADR-005 Images live in object storage. Context: about 14.6 TB of images per year (invented), delivered through a CDN. Decision: store files in object storage, keep the object key and size in the ad_image table. Rejected: storing the bytes in PostgreSQL (backup and replication size, cost per GB, load on the primary). Consequences: the write and the upload are two steps, so an orphaned file can exist if the row is not saved, which needs a cleanup job. Revisit when: a requirement needs transactional consistency between a file and its row, or when storage cost changes materially.</p>`
  },
  checklist: [
    `Each significant decision has a numbered record with options and consequences.`,
    `Each record links to its requirement and estimate and has a revisit trigger.`,
    `Diagrams have one level, one question, labelled arrows and a legend.`,
    `Risks, assumptions and invented numbers are listed.`
  ],
  artifact: `The finished design document: problem, estimates, component diagram, state inventory, decision records and the risk list.`,
  agent: `The agent writes one ADR per significant choice with rejected options and a revisit trigger, generates diagrams as text next to the document, and marks hard-to-reverse choices for your approval. It checks that each requirement lands on a component and each component on a requirement.`,
  src: `M. Nygard, Documenting Architecture Decisions, 2011. S. Brown, The C4 model for visualising software architecture (c4model.com). Mindset module, lesson two of this course (trade-offs and ADRs). Mermaid documentation for diagram syntax. The example record and its date are invented.`
}
];
