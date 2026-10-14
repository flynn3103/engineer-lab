/* Reliability and operations: five lessons. Running scenario: a classifieds marketplace. All numbers are invented examples.
 * Sources named per lesson: Google SRE Book (Beyer et al., 2016) and SRE Workbook (2018), The Twelve-Factor App (config), RFC 9457 (problem details),
 * Kubernetes documentation (probes, Pod termination), OpenTelemetry documentation. Topic list informed by Backend from First Principles
 * (chapters on error handling, configuration, observability and graceful shutdown), re-expressed as reviewer habits. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['reliability'] = [
{
  title: `Error classes and a global error handler`,
  short: `Sort failures into a few classes once, handle them in one place, and never leak internals to the client.`,
  why: `Agent-written handlers tend to catch everything locally, log a string and return 500, or worse return the raw exception text. A reviewer wants failures sorted by what the caller should do next, with one place that turns them into responses.`,
  concept: [
    `An <b>error class</b> is a named kind of failure that carries its meaning: <i>validation</i> (the caller sent bad input, fix and resend), <i>not found</i>, <i>conflict</i> (state clashes, such as a duplicate), <i>unauthorized or forbidden</i>, <i>dependency failure</i> (a database or another service failed), and <i>bug</i> (something we did not expect). Each class maps to one HTTP status family: 4xx means the caller can change something, 5xx means the server failed.`,
    `A <b>global error handler</b> is one function at the edge of the application that receives every error thrown below it and turns it into a response and a log line. Business code throws typed errors and does not build HTTP responses. The handler decides the status, the body and the log level.`,
    `A <b>safe error message</b> tells the caller what they need and nothing about our insides. No stack traces, no SQL text, no host names, no table names. Give the caller a stable error <b>code</b> and a <b>request id</b>, and keep the detail in the log under that id. RFC 9457 (problem details for HTTP APIs) defines a JSON shape with <code>type</code>, <code>title</code>, <code>status</code>, <code>detail</code> and <code>instance</code> that you can adopt for this.`
  ],
  terms: [
    [`Error class`, `A named kind of failure that decides the status, the log level and whether a retry makes sense.`],
    [`Global error handler`, `The single place that converts thrown errors into responses and log lines.`],
    [`Request id`, `A unique value attached to a request and echoed in the response and every log line for it.`],
    [`Retryable`, `A failure that may succeed if the same call is repeated, such as a timeout or a 503.`]
  ],
  example: {
    setup: `The "save ad" endpoint breaks in three different ways in one week (all numbers invented). The old handler returned 500 with the database message each time. See what one handler and four classes change.`,
    body: [
      `A seller posts an ad with a 0 price: this is a <i>validation</i> error, answered 422 with a code <code>price_out_of_range</code> and the field name. A seller saves an ad that another tab already deleted: <i>not found</i>, 404. Two requests insert the same saved_ad pair: the unique constraint fires and becomes a <i>conflict</i>, 409, and the handler can treat it as "already saved" if the endpoint is idempotent.`,
      `The database is restarting: the driver throws a connection error. That is a <i>dependency failure</i>: 503, a <code>Retry-After</code> header if known, the full error in the log at error level, and a short safe body. An unexpected <code>TypeError</code> is a <i>bug</i>: 500, generic body, error log with stack, and the request id so support can find it. The caller never sees the word "TypeError".`
    ],
    table: {
      head: [`Class`, `Status`, `Caller should`, `Log level`],
      rows: [
        [`Validation`, `400 or 422`, `Fix the input`, `info or none`],
        [`Not found`, `404`, `Stop or refresh`, `info`],
        [`Conflict`, `409`, `Re-read, then decide`, `info`],
        [`Dependency failure`, `502, 503 or 504`, `Retry later with backoff`, `error and alert on rate`],
        [`Bug`, `500`, `Report the request id`, `error with stack`]
      ]
    }
  },
  technique: [
    { t: `List the failure classes`, x: `Write the small set of classes the service uses and the status for each. Five to seven is plenty.` },
    { t: `Throw typed errors in business code`, x: `Code below the edge throws errors that carry a class and a stable code. It never writes an HTTP response itself.` },
    { t: `Handle in one place`, x: `One handler maps class to status, builds the body and writes the log. Check that every route goes through it, including async paths.` },
    { t: `Make the body safe`, x: `Return code, a human message, the field for validation errors and the request id. Check by reading the body for any internal detail.` },
    { t: `Wrap third-party errors at the boundary`, x: `Translate driver and client errors into your classes where the call is made, so the rest of the code never sees a library type.` },
    { t: `Test each class`, x: `One test per class that checks status, code and that the body has no stack or SQL.` }
  ],
  mistakes: [
    { t: `Returning the exception message`, ctx: `The handler sends <code>err.message</code>. A failed insert shows the table and constraint names to the caller.`, fix: `Return a code and a safe message. Log the real error with the request id.` },
    { t: `Swallowing errors`, ctx: `A catch block logs "failed" and returns success so the page keeps working. Notifications silently never send.`, fix: `Catch only to translate or to add context. If you cannot handle it, let it reach the handler.` },
    { t: `Everything is 500`, ctx: `A bad query string and a database outage both return 500, so the on-call alert fires for user typos.`, fix: `Map caller mistakes to 4xx so that the 5xx rate means the service failed.` }
  ],
  review: [
    `Which error classes does the service define, and which status does each map to?`,
    `Is there exactly one place that builds error responses? Show me a route that bypasses it, if any.`,
    `What does the response body contain for a database failure? Show the actual body.`,
    `Do async jobs and background tasks also have a handler, or do their errors vanish?`,
    `Red flag: a response that contains a stack trace, SQL text or a library exception message.`
  ],
  exercise: {
    prompt: `The agent's handler is: <code>catch (e) { res.status(500).json({ error: e.message }) }</code> for the whole API. List three problems and what you would require instead.`,
    answer: `<p>(1) It leaks internals: a unique violation message names the constraint and table. (2) Every failure is 500, so a caller typo and an outage look the same to clients and to alerts. (3) No request id, no log, so support cannot find the cause. Also it is one catch per route, not one handler, so new routes forget it.</p><p>Require: typed errors with a class and code, one global handler mapping class to status, a safe body with code and request id, an error-level log with the full cause, and one test per class.</p>`
  },
  checklist: [
    `The service has a short, named list of error classes with a status each.`,
    `One global handler builds every error response.`,
    `Bodies carry a stable code and a request id, and no internal detail.`,
    `4xx is used for caller mistakes, 5xx only for our failures.`,
    `Third-party errors are translated at the boundary.`
  ],
  artifact: `Section 1 of the failure table: the error classes, status, caller action and log level.`,
  agent: `The agent defines the error classes, writes the single handler and the typed errors, adds one test per class, and checks that no response body contains a stack or query text. It states which classes are retryable.`,
  src: `RFC 9457 (Problem Details for HTTP APIs, which replaces RFC 7807). RFC 9110 (HTTP semantics) for status codes. Backend from First Principles, chapter on error handling (topic list). M. Nygard, Release It! (stability patterns).`
},
{
  title: `Configuration validated at startup`,
  short: `Read all configuration once, check it, and refuse to start if it is wrong, so mistakes fail at deploy time and not at 3 a.m.`,
  why: `A missing or malformed setting that is only read when a code path runs becomes an outage hours after the deploy. Failing fast at startup turns a hidden fault into a visible failed rollout that the orchestrator can stop.`,
  concept: [
    `<b>Configuration</b> is everything that differs between environments or deploys: database address, credentials, feature flags, timeouts, external URLs. The Twelve-Factor App (factor III, Config) says to keep it in the environment and out of the code, so the same build runs everywhere.`,
    `<b>Validation at startup</b> means one module reads the environment, converts and checks each value against a schema (type, range, required or optional, default), and either returns a typed configuration object or stops the process with a clear message that lists every problem. The rest of the code receives the object and never reads <code>process.env</code> or its equivalent directly.`,
    `<b>Secrets</b> are configuration that must not leak: passwords, tokens, keys. Validate that they exist, but never print their values. A startup log may say "database password: set" and nothing more.`
  ],
  terms: [
    [`Fail fast`, `Stop at startup on bad configuration, instead of failing later on first use.`],
    [`Schema`, `A declared description of each setting: name, type, range, default, required.`],
    [`Typed config object`, `The validated result passed to the rest of the code, in place of raw strings.`],
    [`Secret`, `A setting that grants access and must not appear in logs, errors or the repository.`]
  ],
  example: {
    setup: `The marketplace image service reads <code>IMAGE_MAX_MB</code> only when a user uploads. A deploy sets it to the text <code>10MB</code>. Nothing fails until the first seller uploads a photo (invented incident).`,
    body: [
      `With lazy reading, the parse gives a not-a-number value, the size check always passes or always fails depending on the comparison, and the symptom is "uploads rejected" or "uploads unlimited" in production. With a startup schema, the process reads <code>IMAGE_MAX_MB</code>, requires an integer between 1 and 50, finds <code>10MB</code>, prints "IMAGE_MAX_MB must be an integer from 1 to 50, got a non-numeric value", and exits with a non-zero code.`,
      `The rollout controller sees the new instances never become ready, keeps the old ones serving, and the deploy stops with an obvious cause. The same schema lists three other missing settings in one message, so the engineer fixes all of them in one pass instead of one redeploy per mistake.`
    ],
    table: {
      head: [`Setting`, `Type and rule`, `Default`, `Secret`],
      rows: [
        [`DATABASE_URL`, `URL, required`, `none`, `yes`],
        [`HTTP_PORT`, `integer 1 to 65535`, `8080`, `no`],
        [`IMAGE_MAX_MB`, `integer 1 to 50`, `10`, `no`],
        [`REQUEST_TIMEOUT_MS`, `integer 100 to 30000`, `3000`, `no`]
      ]
    }
  },
  technique: [
    { t: `Inventory every setting`, x: `List each value the code reads, with type, range, default and whether it is secret. Search the code for direct environment reads to find the ones missing from the list.` },
    { t: `Validate in one module at boot`, x: `Parse, convert and check everything in one place before the server listens. Collect all errors and report them together.` },
    { t: `Exit on invalid`, x: `A non-zero exit with a clear message. Never fall back silently to a guess for a required value.` },
    { t: `Pass a typed object`, x: `Inject the validated object. Forbid raw environment reads elsewhere, with a lint rule or a review check.` },
    { t: `Protect secrets`, x: `Mark secrets in the schema, print only "set" or "missing", and keep them out of the repository and the image.` },
    { t: `Give safe defaults only for safe things`, x: `A default port is fine. A default database host that points at production is not.` }
  ],
  mistakes: [
    { t: `Defaults that hide a missing setting`, ctx: `<code>DATABASE_URL</code> falls back to localhost, so a forgotten variable in production connects to nothing and the error appears on the first query.`, fix: `Required settings have no default. Missing means exit.` },
    { t: `Reading the environment all over the code`, ctx: `Twenty files read variables directly. A rename breaks half of them and no test notices.`, fix: `One config module, one typed object, one place to change.` },
    { t: `Logging the whole config at startup`, ctx: `The agent prints the object to help debugging. The log now contains the database password.`, fix: `Print only non-secret values, and mask secrets as "set".` }
  ],
  review: [
    `Where is the schema? Does the process exit on an invalid or missing required value?`,
    `Show me a deploy with a bad value. What does the operator see and what happens to the old instances?`,
    `Does any code outside the config module read environment variables?`,
    `Which settings are secrets, and does any log, error or image layer contain them?`,
    `Red flag: a default value for a credential, or a startup log that prints the full configuration.`
  ],
  exercise: {
    prompt: `Write the startup schema rows (name, rule, default, secret) for these new settings: the push notification API key, the number of worker threads, and the base URL of the moderation service.`,
    answer: `<p><code>PUSH_API_KEY</code>: non-empty string, required, no default, secret. <code>WORKER_THREADS</code>: integer 1 to 64, default chosen from the instance size (state it), not secret. <code>MODERATION_URL</code>: absolute https URL, required in production, no default, not secret.</p><p>The key rule to state: required values have no default, secrets are checked for presence and masked everywhere, and every error is reported together at boot.</p>`
  },
  checklist: [
    `Every setting is listed with type, range, default and secret flag.`,
    `Validation runs before the server accepts traffic and exits on error.`,
    `All problems are reported in one message.`,
    `No code outside the config module reads the environment.`,
    `Secrets never appear in logs, errors, the repository or the image.`
  ],
  artifact: `Section 2 of the failure table: the configuration schema and what happens when each setting is wrong.`,
  agent: `The agent writes the schema and the config module, replaces direct environment reads with the typed object, adds a test that boots with a bad value and expects exit, and lists the secrets it found.`,
  src: `The Twelve-Factor App, factor III (Config), 12factor.net. Backend from First Principles, chapter on configuration management (topic list). See also this site's Kubernetes course for ConfigMap and Secret objects.`
},
{
  title: `Health checks and graceful shutdown`,
  short: `Tell the platform whether you are alive and whether you can take traffic, and finish in-flight work before you exit.`,
  why: `Two things cause avoidable outages around every deploy: an instance that receives traffic before it can serve it, and an instance that is killed in the middle of requests. Both are fixed by correct health endpoints and a shutdown sequence, and agents often write one endpoint that does everything.`,
  concept: [
    `A <b>liveness</b> check answers "is this process stuck beyond recovery?" If it fails, the platform restarts the process. It must be cheap and must not depend on other services: if liveness checks the database and the database is down, every instance restarts in a loop and the outage grows.`,
    `A <b>readiness</b> check answers "can this instance take traffic right now?" If it fails, the instance is removed from the load balancer but not restarted. It may check what the instance needs to serve: its pools are connected, caches are warm, a required dependency answers. Kubernetes also has a startup probe for slow starts. These probes are described in the Kubernetes documentation under "Configure Liveness, Readiness and Startup Probes".`,
    `<b>Graceful shutdown</b> is the sequence on a termination signal (SIGTERM): stop being ready so new requests stop arriving, finish the requests already running within a deadline, close pools and flush buffers, then exit. In Kubernetes the Pod is sent SIGTERM, given a grace period (30 seconds by default) and then killed with SIGKILL, so the application must finish inside that window.`
  ],
  terms: [
    [`Liveness`, `The process is not wedged. Failure means restart.`],
    [`Readiness`, `The instance can serve now. Failure means stop sending traffic.`],
    [`SIGTERM`, `The polite termination signal that starts shutdown.`],
    [`Draining`, `Letting in-flight requests finish while accepting no new ones.`]
  ],
  example: {
    setup: `The ad service has one <code>/health</code> endpoint that runs <code>SELECT 1</code> on the database. During a 20 second database failover (invented), all ad service pods fail it and restart together. After the restart they start cold, and the thundering restart prolongs the incident.`,
    body: [
      `Split it. <code>/livez</code> returns 200 if the event loop or main thread responds, with no outside calls. <code>/readyz</code> returns 200 only when the pool has a connection and migrations are complete, and 503 otherwise. During the failover the pods go not ready, traffic pauses or fails fast at the edge, and nothing restarts. When the database returns, readiness returns and traffic resumes.`,
      `For deploys: on SIGTERM the service flips <code>/readyz</code> to 503, waits a few seconds for the load balancer to notice, stops accepting connections, waits for in-flight requests up to 20 seconds, closes the pool, and exits 0. Without this, a rolling deploy cuts users off mid-request and a message that was being written is lost.`
    ],
    table: {
      head: [`Check`, `Depends on outside services`, `On failure`, `Typical content`],
      rows: [
        [`Liveness`, `no`, `restart the process`, `process responds`],
        [`Readiness`, `its own required dependencies`, `remove from traffic`, `pool ok, migrated, warm`],
        [`Startup`, `no`, `keep waiting, then restart`, `finished slow initialization`]
      ]
    }
  },
  technique: [
    { t: `Separate liveness from readiness`, x: `Two endpoints with different jobs. Liveness has no outside calls.` },
    { t: `Decide what ready means`, x: `List what the instance needs to serve a request, and check only those, with a short timeout.` },
    { t: `Handle the termination signal`, x: `Catch SIGTERM, set not-ready, stop accepting, drain with a deadline, close resources, exit.` },
    { t: `Match the deadline to the platform`, x: `The drain deadline must be shorter than the grace period, and longer than your slowest normal request.` },
    { t: `Make long work resumable`, x: `Jobs that outlast the grace period must be safe to interrupt, by idempotency or a lease, as the async module explains.` },
    { t: `Test it`, x: `A test or a drill that sends SIGTERM during load and counts failed requests. The target is zero.` }
  ],
  mistakes: [
    { t: `Liveness that checks the database`, ctx: `A database blip triggers restarts of every instance at once.`, fix: `Liveness checks the process only. Put dependencies in readiness.` },
    { t: `Ignoring SIGTERM`, ctx: `The process keeps running until killed after 30 seconds, dropping every request in flight, or exits at once and drops them sooner.`, fix: `Handle the signal and drain. Test with traffic running.` },
    { t: `Readiness that is always 200`, ctx: `The endpoint returns OK while the pool is empty, so users get errors from an instance the platform thinks is healthy.`, fix: `Readiness reflects real ability to serve, and flips to 503 during shutdown.` }
  ],
  review: [
    `What does liveness check, and does it call any outside service?`,
    `What does readiness check, and what does it do while the process is shutting down?`,
    `Show the shutdown sequence in order. What is the deadline and how does it compare to the grace period?`,
    `What happens to a background job that is running when SIGTERM arrives?`,
    `Red flag: a single health endpoint that queries the database and is used for both liveness and readiness.`
  ],
  exercise: {
    prompt: `The message service holds WebSocket connections and a worker that sends push notifications. Sketch its shutdown sequence.`,
    answer: `<p>On SIGTERM: set readiness to 503 so no new connections are routed. Stop accepting new connections. Send a close frame to clients with a reconnect hint, so they come back to another instance. Let the push worker finish its current item and stop taking new ones, or hand unfinished items back to the queue. Wait up to the deadline (shorter than the grace period). Close the database and queue connections, flush logs, exit 0.</p><p>Review point: the unfinished push must not be lost or sent twice, so the worker's work must be idempotent or leased.</p>`
  },
  checklist: [
    `Liveness and readiness are separate endpoints with different checks.`,
    `Liveness never calls outside services.`,
    `Readiness reflects real ability to serve and goes to 503 on shutdown.`,
    `SIGTERM triggers a drain with a deadline under the platform grace period.`,
    `A load test with a restart shows no dropped requests.`
  ],
  artifact: `Section 3 of the failure table: the health endpoints and the shutdown sequence with its deadline.`,
  agent: `The agent writes both endpoints and the signal handler, sets the deadline from the platform grace period, and adds a drill that restarts an instance under load and reports failed requests.`,
  src: `Kubernetes documentation: "Configure Liveness, Readiness and Startup Probes" and "Pod Lifecycle" (termination of Pods). Google SRE Book, ch. 22 (Addressing Cascading Failures). Backend from First Principles, chapter on graceful shutdown (topic list). This site's Kubernetes course.`
},
{
  title: `Structured logs, metrics and traces`,
  short: `Emit machine-readable evidence in three forms, and read the four golden signals first when something is wrong.`,
  why: `When an agent adds "logging", the result is often free-text lines that nobody can query, or none for the path that fails. A reviewer asks whether, at 3 a.m., a stranger could find what went wrong from the output alone.`,
  concept: [
    `A <b>structured log</b> is an event written as key and value pairs, usually JSON, with a fixed set of fields: time, level, message, service, request id and the facts of the event (member id, ad id, duration). It can be filtered and counted. Never log secrets or personal data you do not need.`,
    `A <b>metric</b> is a number measured over time and aggregated: a counter (requests, errors), a gauge (queue length) or a histogram (request duration). Metrics are cheap and good for "how many, how fast". Keep labels low in cardinality: a label for route is fine, a label for member id creates millions of series.`,
    `A <b>trace</b> follows one request across services as a tree of spans, each with a start, a duration and a parent. It answers "where did the time go in this request?" The OpenTelemetry project defines the common data model and propagation of trace context between services. Tie the three together with the same request or trace id in logs.`,
    `The <b>four golden signals</b> from the Google SRE Book (chapter 6, Monitoring Distributed Systems) are <i>latency</i>, <i>traffic</i>, <i>errors</i> and <i>saturation</i>. Measure latency of successful and failed requests separately, and use percentiles, not only averages.`
  ],
  terms: [
    [`Structured log`, `An event with named fields, queryable by machine.`],
    [`Histogram`, `A metric that counts values in buckets, so percentiles can be computed.`],
    [`Cardinality`, `The number of distinct label combinations of a metric. High cardinality is costly.`],
    [`Span`, `One timed step of a request inside a trace.`],
    [`Golden signals`, `Latency, traffic, errors and saturation.`]
  ],
  example: {
    setup: `Sellers report that "post ad" is sometimes slow. The agent adds <code>console.log("posting ad")</code> and <code>console.log("done")</code>. Compare with what a reviewer asks for (invented numbers).`,
    body: [
      `Metrics first: a histogram of <code>post_ad</code> duration by outcome shows p50 at 180 ms and p99 at 4.2 s, and the error counter is flat. The slowness is real and is in the tail, not the average. Saturation shows the image upload pool is at 100 percent during the slow periods.`,
      `A trace of one slow request shows spans: validate 3 ms, insert ad 25 ms, call moderation 3.9 s, write images 40 ms. The moderation call is the cause. The structured log line for the same request id says <code>{"level":"warn","msg":"moderation slow","request_id":"r-9","ad_id":123,"ms":3912}</code>. In one hop from an alert to a cause, with no guessing.`
    ],
    table: {
      head: [`Signal`, `Question it answers`, `Example for post ad`],
      rows: [
        [`Latency`, `How long do requests take`, `p99 of post_ad duration`],
        [`Traffic`, `How much demand`, `ads posted per second`],
        [`Errors`, `How many fail`, `share of 5xx responses`],
        [`Saturation`, `How full is the resource`, `image pool in use, CPU, queue length`]
      ]
    }
  },
  technique: [
    { t: `Start from the questions`, x: `For each critical path write what you will need to ask in an incident, then choose the signal that answers it.` },
    { t: `Log events as fields`, x: `One JSON object per event with fixed keys and a request id. No string concatenation of facts into a sentence.` },
    { t: `Instrument the golden signals per service`, x: `A request counter, an error counter and a duration histogram per route, plus a saturation gauge for each limited resource.` },
    { t: `Propagate the trace context`, x: `Pass the trace id on every outgoing call and queue message, and put it in the logs.` },
    { t: `Control cardinality and privacy`, x: `Labels come from small sets. Never put member ids, emails or tokens in labels or messages.` },
    { t: `Check by simulating an incident`, x: `Break a dependency in a test environment and see whether you can find the cause from the output alone.` }
  ],
  mistakes: [
    { t: `Unstructured text logs`, ctx: `"Error saving ad 123 for user bob" cannot be counted or joined to a trace.`, fix: `Log fields, with the request id, and keep the message constant.` },
    { t: `Averages only`, ctx: `The dashboard shows an average of 210 ms and hides a p99 of 4 s that sellers feel.`, fix: `Show p50, p95 and p99 from a histogram.` },
    { t: `High-cardinality labels`, ctx: `A metric labelled by member id creates one series per member and the metrics store falls over.`, fix: `Put ids in logs and traces, not in metric labels.` }
  ],
  review: [
    `For the main flow, which metric shows latency, traffic, errors and saturation?`,
    `Can I go from an alert to a request id to a trace to a log line? Show it.`,
    `Are latency percentiles used, and are failed requests measured separately from successful ones?`,
    `What fields appear in every log line, and what is never logged?`,
    `Red flag: log lines that contain tokens, passwords, full email addresses or whole request bodies.`
  ],
  exercise: {
    prompt: `Choose the metrics, labels and one log event for the "send message" endpoint of the conversation feature. State one label you must not use.`,
    answer: `<p>Metrics: counter <code>messages_sent_total</code> with label outcome (ok, rejected, error), histogram <code>send_message_duration_seconds</code> by outcome, gauge for the outgoing queue length. Log event on failure: <code>{"level":"error","msg":"send failed","request_id":"...","conversation_id":456,"error_code":"dependency_down"}</code>, with no message text. Do not use member id or conversation id as a metric label: unbounded cardinality. Also never log the message body, which is personal data.</p>`
  },
  checklist: [
    `Logs are structured with a fixed field set and a request id.`,
    `Each service reports latency, traffic, errors and saturation.`,
    `Latency uses percentiles from histograms.`,
    `Trace context propagates through calls and queues.`,
    `No secrets or personal data in logs or labels, and labels have bounded cardinality.`
  ],
  artifact: `The observability plan: per service, the logs, metrics, traces and the golden signal for each critical path.`,
  agent: `The agent adds the logger with the standard fields, instruments the golden signals, wires trace propagation, and lists the fields it refuses to log. It shows one worked incident walk-through.`,
  src: `Google SRE Book (Beyer, Jones, Petoff, Murphy, 2016), ch. 6 Monitoring Distributed Systems (four golden signals). OpenTelemetry documentation (signals, context propagation). Backend from First Principles, chapter on observability (topic list). This site's Redis and Kafka courses for queue length and lag metrics.`
},
{
  title: `Alerts that mean something: SLIs and SLOs`,
  short: `Define what good service means as a number, alert when the promise is at risk, and make every page worth waking for.`,
  why: `Agents will gladly create an alert for every metric: CPU above 80 percent, any error, any slow call. The result is noise that on-call learns to ignore. A reviewer wants alerts tied to user-visible promises, each with an action.`,
  concept: [
    `A <b>service level indicator</b> (SLI) is a measurement of how well the service is doing from the user's view, usually a ratio: good events divided by valid events. Example: the share of "search ads" requests that return a non-5xx response within 500 ms.`,
    `A <b>service level objective</b> (SLO) is the target for an SLI over a window: for example 99.5 percent over 30 days (invented). The <b>error budget</b> is what is left: 0.5 percent of requests may be bad, and the team spends it on risk such as releases. The Google SRE Book (chapter 4, Service Level Objectives) and the SRE Workbook (chapters on implementing SLOs and alerting on SLOs) describe the method.`,
    `An alert is worth paging only if it is <b>urgent, actionable and user-affecting</b>. Alerting on <i>symptoms</i> (the SLI is burning budget fast) beats alerting on <i>causes</i> (one CPU is hot), because a cause may be harmless and a symptom never is. A <b>burn rate</b> alert fires when the budget is being spent faster than the window allows. Each page links to a <b>runbook</b>: what it means, how to check, how to fix.`
  ],
  terms: [
    [`SLI`, `A measured ratio of good events to valid events that reflects user experience.`],
    [`SLO`, `A target for an SLI over a time window.`],
    [`Error budget`, `The allowed amount of failure: 100 percent minus the SLO.`],
    [`Burn rate`, `How fast the error budget is being consumed compared to an even spend.`],
    [`Runbook`, `A short guide linked from an alert: meaning, checks, fixes, escalation.`]
  ],
  example: {
    setup: `The marketplace sets an SLO for "view ad detail": 99.5 percent of requests succeed in under 400 ms over 30 days (all invented numbers). It has about 40 million requests a month.`,
    body: [
      `The budget is 0.5 percent, or 200 thousand bad requests per month. If a bad deploy makes 5 percent of requests fail, the budget burns 10 times faster than an even spend: that is a page, since the month's budget is gone in three days. A slow leak at 0.6 percent only needs a ticket for the working day, not a page at night.`,
      `Contrast with the agent's alerts: "CPU above 80 percent for 1 minute" fires nightly during a batch job that harms nobody, and "any 5xx" fires on each client typo mapped wrongly. The reviewer replaces both with one fast-burn page and one slow-burn ticket on the SLI, keeps CPU as a dashboard saturation graph, and adds a runbook link to each.`
    ],
    table: {
      head: [`Alert`, `Type`, `Fires when`, `Action`],
      rows: [
        [`Fast burn`, `Page`, `Budget spending 10 times too fast over a short window`, `Roll back or fix now`],
        [`Slow burn`, `Ticket`, `Budget spending a little too fast over days`, `Fix in working hours`],
        [`CPU high`, `Dashboard only`, `no alert`, `Look at it when investigating`]
      ]
    }
  },
  technique: [
    { t: `Pick a few user-visible SLIs`, x: `For each critical journey choose availability and latency ratios from real request data. Start with two or three.` },
    { t: `Set the SLO with the product owner`, x: `Choose a target and window that users and the team can live with. Label it as an assumption until it is reviewed.` },
    { t: `Compute the error budget`, x: `Convert the SLO into a number of allowed bad events per window and show it on a dashboard.` },
    { t: `Alert on burn rate`, x: `One fast-burn page and one slow-burn ticket per SLO. Avoid paging on single causes.` },
    { t: `Write the runbook before the alert`, x: `Each alert links to what it means, first checks and the rollback step. No runbook, no page.` },
    { t: `Review alerts after incidents`, x: `Delete alerts nobody acted on, and add one for any outage that customers reported first.` }
  ],
  mistakes: [
    { t: `Paging on causes`, ctx: `Alerts on CPU, memory and disk wake someone while users see nothing wrong.`, fix: `Page on SLI burn. Keep resource graphs for diagnosis.` },
    { t: `A 100 percent target`, ctx: `The SLO says no failures ever. Any release is then a violation and the target is ignored.`, fix: `Choose a target below 100 percent and use the budget to decide release pace.` },
    { t: `Alerts with no owner or runbook`, ctx: `A page says "queue high" and nobody knows what to do.`, fix: `Each alert names an owner, an action and a runbook.` }
  ],
  review: [
    `Which SLIs and SLOs does the service define, and where do the numbers come from?`,
    `Show me one page alert. What user harm does it signal, and what is the first action?`,
    `Are alerts based on burn rate, and how many pages did a typical week produce in the test run?`,
    `Does each alert link to a runbook?`,
    `Red flag: an alert for every metric, with no stated user impact or action.`
  ],
  exercise: {
    prompt: `Define one SLI, one SLO (invented numbers, labelled) and the two alerts for "send a message" in the conversation feature.`,
    answer: `<p>SLI: share of send requests accepted (status below 500) and stored within 300 ms. SLO: 99.9 percent over 30 days, an assumption to confirm with the product owner. Budget: 0.1 percent of sends.</p><p>Alerts: fast burn, page, when the failure share spends the budget at 14 times the even rate (an example factor from the SRE Workbook style of multi-window alerts, to tune) over a short window and a longer confirming window. Slow burn, ticket, when it is spending a bit over the even rate across several days. Both link to a runbook: check dependency health, recent deploys, roll back the latest release.</p>`
  },
  checklist: [
    `SLIs are ratios of good to valid events from the user's view.`,
    `Each SLO states a target and a window, and is labelled as agreed or assumed.`,
    `The error budget is computed and visible.`,
    `Pages are burn-rate alerts with a runbook link, and tickets cover slow burns.`,
    `Alerts that nobody acts on are removed.`
  ],
  artifact: `Section 4 of the failure table and the observability plan: the SLIs, SLOs, alerts and runbook links.`,
  agent: `The agent proposes SLIs from the request metrics, computes the error budget from the stated SLO, writes the alert rules and a runbook stub for each, and flags any alert that has no user impact.`,
  src: `Google SRE Book, ch. 4 Service Level Objectives and ch. 6 Monitoring Distributed Systems. Google SRE Workbook, chapters on implementing SLOs and alerting on SLOs (burn-rate alerts). Treat the numbers here as invented examples.`
}
];
