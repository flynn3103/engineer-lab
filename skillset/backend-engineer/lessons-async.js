/* Async work and messaging: seven lessons. Running scenario: a classifieds marketplace. All numbers are invented examples. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['async'] = [
{
  title: `Task queues and background jobs`,
  short: `Move slow or unreliable work off the request path, and give every job a status, a limit and an owner.`,
  why: `Agents reach for a background job whenever something is slow, and then forget that a job is a new distributed system: it can run twice, run late, or never run. A reviewer must ask what moved, what the user sees meanwhile, and how anyone knows the job finished.`,
  concept: [
    `A <b>task queue</b> holds units of work (jobs) that producers add and <b>workers</b> take and run later, outside the request. Use one for work that is slow (resizing images), unreliable (calling an email provider), or not needed for the response (sending a notification). Keep in the request only what the caller must know to continue.`,
    `The user-facing pattern for long work is <b>accept, then poll or notify</b>: answer <code>202 Accepted</code> with a job id and a status URL, and let the client poll or receive a push when the state moves from <code>queued</code> to <code>running</code> to <code>done</code> or <code>failed</code>. Store the state in the database so it survives a restart.`,
    `A queue changes the failure model. Most queues give <b>at-least-once</b> delivery, so a job can be handed to a worker twice (the next lessons treat this in depth). Jobs must therefore be small, carry ids rather than copies of data (the worker reads current state), and be safe to repeat.`,
    `Watch the queue itself: <b>depth</b> (jobs waiting), <b>age of the oldest job</b> (the real latency of the system) and <b>worker utilization</b>. If jobs arrive faster than workers finish, the queue grows without limit: add a bound, <b>backpressure</b> (reject or slow producers), priorities, and separate queues for slow and fast work so a flood of one type does not starve the other.`,
    `Do not enqueue inside an open database transaction and then commit later: the worker may run before the data is visible, or the enqueue may happen and the transaction roll back. The outbox lesson gives the safe pattern.`
  ],
  terms: [
    [`Job`, `A unit of background work with an id, a type and a small payload.`],
    [`Worker`, `A process that takes jobs from the queue and runs them.`],
    [`202 Accepted`, `An HTTP status meaning the request was accepted for processing that is not finished.`],
    [`Queue age`, `How long the oldest waiting job has been waiting. The user-visible delay.`],
    [`Backpressure`, `Slowing or rejecting producers when consumers cannot keep up.`]
  ],
  example: {
    setup: `After a seller uploads photos, the ad must be resized into three sizes and moderated (invented numbers: 8 photos, 3 sizes, 2.9 s of CPU, and a moderation call averaging 400 ms).`,
    body: [
      `The agent's first version does everything inside <code>POST /ads</code>: the request takes 4 s, and at peak it ties up workers that should serve readers. The reviewed design: the request writes the ad as <code>status = 'processing'</code>, stores the original photos, enqueues one job with <code>ad_id</code> only, and answers <code>202</code> with the ad id. The worker loads the ad, resizes, calls moderation with a timeout, and sets the status to <code>active</code> or <code>rejected</code>.`,
      `Now the reviewer's questions about the new system: what does the seller see while processing (a pending badge)? What if the job fails (a failed state and a retry rule)? How old can the oldest job get at peak, and who is alerted? The agent should have answers written down.`
    ],
    table: {
      head: [`Work`, `In the request?`, `Reason`],
      rows: [
        [`Validate input, insert the ad`, `Yes`, `The caller needs the id and errors now`],
        [`Resize images`, `No, job`, `Slow and CPU heavy`],
        [`Send email or push`, `No, job`, `Unreliable third party, not needed for the response`],
        [`Check the seller owns the ad`, `Yes`, `Authorization must happen before work is queued`]
      ]
    }
  },
  technique: [
    { t: `Split the request`, x: `List each step and mark what the caller needs now. Everything else is a candidate job.` },
    { t: `Define the job contract`, x: `Job type, payload with ids not copies, expected duration, timeout, and the final states.` },
    { t: `Expose the status`, x: `Persist queued, running, done and failed, and return 202 with a status location.` },
    { t: `Bound the queue`, x: `Set a maximum depth or rejection rule, separate slow and fast queues, and set worker concurrency from the load.` },
    { t: `Watch it`, x: `Alert on queue age and failure rate, not only on worker CPU.` }
  ],
  mistakes: [
    { t: `A job with no visible state`, ctx: `The seller posts, sees "ok", and the ad never appears because the job failed silently.`, fix: `Persist job state, show it to the user, and alert on failed jobs.` },
    { t: `Putting the whole object in the payload`, ctx: `The job carries a copy of the ad. By the time it runs the seller edited the price, and the worker overwrites it.`, fix: `Pass ids, let the worker read current state, and make the job idempotent.` },
    { t: `An unbounded single queue`, ctx: `A bulk import of 1 million notifications queues in front of password reset emails, which wait for hours.`, fix: `Use separate queues or priorities and limit each producer.` }
  ],
  review: [
    `Which steps stayed in the request and which moved to jobs, and why each?`,
    `What does the user see while the job is queued, running or failed? Where is the state stored?`,
    `What is the payload? Does it contain ids or copies of data that can go stale?`,
    `What are the queue age and failure alerts, and what bounds the queue depth?`,
    `Red flag: "fire and forget" with no status, no failure handling and no way to see the queue.`
  ],
  exercise: {
    prompt: `The agent moves "send new-message email to the recipient" into a job but enqueues it inside the same transaction that inserts the message, before the commit. Find the problems.`,
    answer: `<p>If the worker is fast it may run before the commit, find no message and fail or skip. If the transaction rolls back, the job still exists and emails about a message that was never saved. Failures of the queue itself can also fail the message insert.</p><p>Enqueue after the commit, or better, write the job request into an outbox table in the same transaction and let a relay publish it (see the outbox lesson). Carry the message id, not its text, and make the worker idempotent so a repeat does not send two emails.</p>`
  },
  checklist: [
    `Each step is classified as in-request or job with a reason.`,
    `The job contract (type, id payload, timeout, states) is written.`,
    `The user can see the state, and failures are surfaced.`,
    `Queue depth and age are bounded and alerted.`,
    `Nothing is enqueued before its transaction commits.`
  ],
  artifact: `Section 1 of the messaging design: a job table (job type, trigger, payload, timeout, queue, concurrency, final states, user-visible status).`,
  agent: `The agent lists which steps leave the request path, defines each job with an id-only payload and visible state, and proposes queue age and failure alerts with its design.`,
  src: `RFC 9110 (HTTP Semantics), section 15.3.3 (202 Accepted). Backend from First Principles, chapter 10 (task queues and background jobs). Documentation of the queue you use (Amazon SQS, RabbitMQ or Celery) for exact delivery behavior. The Kafka course page on this site for the log-based alternative. Numbers are invented examples.`
},
{
  title: `Retries, idempotency, dead letters and visibility timeouts`,
  short: `Make repeated and failed jobs safe: idempotency keys, bounded backoff, a dead-letter queue and a timeout longer than the job.`,
  why: `Because delivery is at-least-once, every consumer runs some jobs twice. An agent that retries without idempotency sends two emails or charges twice. This is the lesson where reviews catch real money and trust bugs.`,
  concept: [
    `An operation is <b>idempotent</b> when doing it twice has the same effect as doing it once. Setting a status to <code>active</code> is idempotent, adding 1 to a counter is not. To make a non-idempotent step safe, give each logical action an <b>idempotency key</b> (a message id or a business key such as <code>notify:message:981</code>) and record it in a table with a unique constraint in the same transaction as the effect. A repeat then fails the insert and is skipped.`,
    `<b>Retries</b> should be bounded and spaced: exponential backoff with random jitter, a maximum attempt count, and a distinction between <b>transient</b> errors (timeout, 503, deadlock) that are worth retrying and <b>permanent</b> errors (invalid data, 404, a bug) that are not. Retrying a permanent error just burns capacity. The AWS Architecture Blog post on exponential backoff and jitter explains why the jitter matters: without it, clients retry in synchronized waves.`,
    `A <b>dead-letter queue</b> (DLQ) receives messages that failed too many times, so one poison message does not block or loop forever. A DLQ is only useful if someone is alerted when it is non-empty and there is a documented way to inspect and <b>redrive</b> its messages after the bug is fixed.`,
    `A <b>visibility timeout</b> (Amazon SQS terminology) hides a received message from other consumers for a period. If the worker does not delete the message before the period ends, the message becomes visible again and another worker takes it. So the timeout must be longer than the job's worst-case duration (or the worker must extend it), otherwise a slow job is processed twice at the same time. SQS has a default visibility timeout of 30 seconds, and a redrive policy with a <code>maxReceiveCount</code> moves a message to a DLQ after that many receives. RabbitMQ has a related mechanism: unacknowledged messages are redelivered when the consumer's connection closes.`
  ],
  terms: [
    [`Idempotency key`, `A stable id for one logical action, stored to detect repeats.`],
    [`Transient / permanent error`, `One worth retrying later, or one that will never succeed.`],
    [`Dead-letter queue`, `Where messages go after exhausting retries, for inspection and redrive.`],
    [`Visibility timeout`, `How long a received message is hidden before it can be delivered again.`],
    [`Poison message`, `A message that always fails and would be retried forever.`]
  ],
  example: {
    setup: `A job sends the "you have a new message" email. The agent's code: take the job, call the mail API, delete the job. It retries all errors 10 times at once (invented numbers: the job normally takes 2 s, the mail API sometimes takes 40 s).`,
    body: [
      `Failures in the design: the visibility timeout is the 30 s default, and a slow mail call outlasts it, so a second worker sends the same email while the first is still waiting. A crash after the API accepted the email but before the job is deleted also sends it again. An invalid address fails 10 times for nothing, and the 10 immediate retries add load while the provider is struggling.`,
      `Reviewed design: a <code>sent_notification</code> table with a unique key <code>(message_id, channel)</code>; the worker inserts the key first (skip if it exists), then sends, and marks it sent. The mail call has a 10 s timeout, the visibility timeout is 60 s, retries use backoff with jitter for 429 and 5xx only, an invalid address is permanent and goes straight to the DLQ, and after 5 receives the message moves to the DLQ with an alert. One caveat to state: a crash between sending and marking can still produce a rare duplicate, because the mail provider is outside our transaction. Passing the provider an idempotency key, where it supports one, narrows this further.`
    ],
    table: {
      head: [`Error`, `Class`, `Action`],
      rows: [
        [`Timeout, HTTP 503, deadlock`, `Transient`, `Retry with backoff and jitter, capped`],
        [`HTTP 429 rate limited`, `Transient`, `Retry after the server's delay if given`],
        [`Invalid address, HTTP 400`, `Permanent`, `No retry, dead-letter with reason`],
        [`A bug (null reference)`, `Permanent until fixed`, `Dead-letter, alert, fix, redrive`]
      ]
    }
  },
  technique: [
    { t: `Find the effect that must not repeat`, x: `Emails, payments, counters, external calls. Mark each non-idempotent step.` },
    { t: `Add an idempotency key`, x: `Choose a stable business key and insert it under a unique constraint in the same transaction as the effect.` },
    { t: `Classify errors`, x: `Write which errors are transient and retried, and which are permanent and dead-lettered.` },
    { t: `Set retry limits`, x: `Exponential backoff with jitter, a maximum attempts count, and a total time cap.` },
    { t: `Set the visibility timeout above the worst case`, x: `Measure p99 job time and set the timeout above it, or extend it while the job runs.` },
    { t: `Operate the DLQ`, x: `Alert when it is non-empty, store the failure reason, and document how to redrive.` }
  ],
  mistakes: [
    { t: `Retry without idempotency`, ctx: `A timeout on the payment capture call triggers a retry, but the first call had succeeded.`, fix: `Send an idempotency key or check the outcome by id before retrying. Record effects under a unique key.` },
    { t: `A visibility timeout shorter than the job`, ctx: `Jobs take up to 90 s but the timeout is 30 s, so every slow job runs on two workers at once.`, fix: `Measure the job duration, set the timeout above it, or extend it with a heartbeat.` },
    { t: `A DLQ nobody watches`, ctx: `Failed messages pile up in the dead-letter queue for weeks because there is no alert and no redrive procedure.`, fix: `Alert on any message in the DLQ, include the error with each message and write the redrive steps.` }
  ],
  review: [
    `Which effect in this job cannot be repeated safely, and where is the idempotency key stored and enforced?`,
    `Which errors are retried and which are not? Show the backoff, jitter and cap.`,
    `What is the visibility timeout (or ack timeout) and how does it compare with the p99 job duration?`,
    `Where do failed messages go, who is alerted, and how are they redriven?`,
    `Red flag: an at-least-once consumer with a non-idempotent effect, or retries in a tight loop with no cap.`
  ],
  exercise: {
    prompt: `A job awards a seller 10 bonus points when their ad is first approved. It runs UPDATE member SET points = points + 10 and retries on any exception. Explain the double-award risk and fix it.`,
    answer: `<p>If the update commits but the acknowledgement is lost (a crash or a timeout), the job is delivered again and adds another 10. Adding is not idempotent.</p><p>Fix: insert a row into an <code>award</code> table with a unique key <code>(ad_id, reason)</code> and add the points in the same transaction. A repeat violates the constraint, the transaction is rolled back and the job is acknowledged as already done. Add a test that runs the job twice and asserts the points rose by 10 once.</p>`
  },
  checklist: [
    `Every non-idempotent effect has a stored idempotency key under a unique constraint.`,
    `Errors are classified transient or permanent, with backoff, jitter and a cap.`,
    `The visibility or ack timeout exceeds the measured worst-case job time.`,
    `A dead-letter queue exists with an alert and a redrive procedure.`,
    `A test runs each job twice and checks the effect happened once.`
  ],
  artifact: `Section 2 of the messaging design: a retry and idempotency table (job, effect, key, error classes, backoff, cap, timeout, DLQ and alert).`,
  agent: `The agent writes an idempotency key for each effect it adds, classifies errors, sets the visibility timeout from a measured duration and adds a run-twice test.`,
  src: `Amazon SQS Developer Guide: visibility timeout, dead-letter queues and redrive. RabbitMQ documentation: consumer acknowledgements and redelivery. M. Brooker, Exponential Backoff And Jitter, AWS Architecture Blog, 2015. Stripe API documentation on idempotent requests (the Idempotency-Key header idea). Backend from First Principles, chapter 10 and chapter 12 (retries, backoff). Numbers are invented examples.`
},
{
  title: `Message brokers and event streaming: the Kafka model`,
  short: `Understand the log, partitions, consumer groups and offsets so you can review topic design and consumer behavior.`,
  why: `A queue deletes a message once handled. An event log keeps it, and many readers can replay it. Choosing between them, and sizing partitions and keys, are decisions that are hard to change later, so they deserve a careful review.`,
  concept: [
    `A <b>queue</b> (RabbitMQ, SQS) delivers each message to one consumer and removes it when acknowledged: it models work to be done. An <b>event log</b> (Apache Kafka) appends records to the end of a durable, ordered log and keeps them for a retention period. Readers track their own position, so new consumers can replay history and several independent consumers can read the same events. Use a queue for tasks and a log for facts that many systems care about.`,
    `Kafka terms: a <b>topic</b> is a named log, split into <b>partitions</b>. Each partition is an ordered, append-only sequence, and each record has an <b>offset</b> (its position). A <b>producer</b> picks the partition, usually by hashing the record <b>key</b>, so records with the same key land in the same partition. Partitions are <b>replicated</b> across brokers for durability.`,
    `A <b>consumer group</b> shares the work of a topic: each partition is assigned to exactly one consumer in the group at a time, so a group with more consumers than partitions leaves some idle, and the partition count caps parallelism. Different groups each get all records. The group's progress is a committed <b>offset</b> per partition. When consumers join or leave, a <b>rebalance</b> reassigns partitions, which pauses consumption briefly and can cause some records to be processed again.`,
    `<b>Retention</b> deletes old records by time or size. <b>Log compaction</b> instead keeps the latest record per key, which suits "current state" topics. Records should carry a <b>schema</b> that evolves compatibly (for example Avro or Protobuf with a registry), because many consumers depend on it. Choose the key and partition count with care: the number of partitions can be increased later, but doing so changes which partition a key maps to, which breaks per-key ordering for existing data. Details such as defaults vary by version, so check the documentation of the version in use.`
  ],
  terms: [
    [`Topic / partition`, `A named log, split into ordered append-only partitions.`],
    [`Offset`, `The position of a record within a partition.`],
    [`Key`, `A record field hashed to choose the partition, giving per-key ordering.`],
    [`Consumer group`, `Consumers that share a topic's partitions, one consumer per partition at a time.`],
    [`Rebalance`, `Reassigning partitions when group membership changes.`]
  ],
  example: {
    setup: `The marketplace emits an event whenever an ad changes. Search indexing, the notification service and analytics each need these events (invented numbers: 300 events per second at peak, 12 partitions).`,
    body: [
      `Topic <code>ad-events</code>, keyed by <code>ad_id</code>: all events of one ad go to one partition and stay in order, so the search index never applies "price changed" before "ad created". Three consumer groups (search, notify, analytics) each read the full stream independently, and analytics can be rebuilt by replaying from the start. A queue could not do this without copying every message into three queues.`,
      `Review the choices. Why 12 partitions: the busiest group should have at most 12 consumers, and 300 events per second is small, so 12 leaves room. Why key by <code>ad_id</code>: ordering per ad is the only ordering the consumers need. A key like <code>category_id</code> would create hot partitions (a few categories dominate traffic). How long is retention: long enough to recover from a consumer outage and to replay (say 7 days), stated as an assumption to confirm. And what is the schema and its compatibility rule?`
    ],
    table: {
      head: [`Need`, `Queue`, `Log (Kafka)`],
      rows: [
        [`One worker handles each task, then it is gone`, `Fits`, `Works, but you manage offsets`],
        [`Several systems read the same events`, `Needs a queue per reader`, `Fits: one group per reader`],
        [`Replay history or rebuild a view`, `Not possible after ack`, `Fits, within retention`],
        [`Per-task retry, delay, priority`, `Built in, often`, `You build it (retry topics)`]
      ]
    }
  },
  technique: [
    { t: `Decide queue or log from the need`, x: `Tasks for one worker: queue. Facts for many readers or replay: log. Say why.` },
    { t: `Choose the key from the ordering need`, x: `Pick the entity whose events must stay in order. Check the key's distribution for hot partitions.` },
    { t: `Size the partitions`, x: `From the target throughput and the maximum consumer count, with headroom, knowing that raising it later changes key placement.` },
    { t: `Set retention and compaction`, x: `Time or size for events, compaction for latest-state topics. Write the recovery window it must cover.` },
    { t: `Define the schema and its evolution rule`, x: `A versioned schema with a compatibility rule agreed with consumers.` },
    { t: `Define each consumer group`, x: `Its name, purpose, concurrency and what it does on a rebalance.` }
  ],
  mistakes: [
    { t: `Kafka for a simple task queue`, ctx: `The marketplace sends 30 emails per minute and the agent proposes a Kafka cluster. Per-message retry, delay and visibility have to be built by hand.`, fix: `Use a task queue. Choose a log when several readers or replay are real requirements.` },
    { t: `A skewed partition key`, ctx: `Events are keyed by category and one category carries 60 percent of traffic, so one partition and one consumer are saturated while others idle.`, fix: `Key by a high-cardinality entity such as ad_id, and check the key distribution on real data.` },
    { t: `Too few partitions`, ctx: `The topic has 2 partitions, so the group can never use more than 2 consumers, and raising the number later reshuffles keys.`, fix: `Plan partitions from the maximum consumers needed, with room to grow.` }
  ],
  review: [
    `Why a log and not a queue (or the reverse)? Name the requirement: replay, several readers, or task semantics.`,
    `What is the key, what ordering does it give, and is its distribution even on real data?`,
    `How many partitions, and what maximum consumer count and throughput does that support?`,
    `What are retention and compaction, and what recovery window must they cover?`,
    `Red flag: a log platform chosen for volume the team does not have, or a key picked without looking at its distribution.`
  ],
  exercise: {
    prompt: `The agent creates topic message-events with 3 partitions keyed by conversation_id, and plans 8 consumers in one group to process chat notifications. What happens, and what do you ask?`,
    answer: `<p>Only 3 consumers get a partition. The other 5 are idle, so parallelism is capped at 3. The key is reasonable if ordering within a conversation matters, because all messages of a conversation stay in order on one partition.</p><p>Ask for the throughput target, the work per message and the maximum consumers needed, then set the partition count accordingly (and say that raising it later changes the key placement). Ask for the retention window and for the behavior on rebalance, since a rebalance can reprocess records.</p>`
  },
  checklist: [
    `The log versus queue choice is justified by a requirement.`,
    `The key follows the ordering need and its distribution was checked.`,
    `Partition count supports the planned consumers and throughput.`,
    `Retention or compaction covers the recovery window.`,
    `The schema and compatibility rule are defined for all consumer groups.`
  ],
  artifact: `Section 3 of the messaging design: a topic table (topic, purpose, key, partitions, retention, compaction, schema, consumer groups).`,
  agent: `The agent justifies log versus queue, proposes the key and partition count with the numbers behind them, and lists each consumer group and its schema compatibility rule.`,
  src: `Apache Kafka documentation: Introduction, Design (persistence, consumer groups, log compaction). Confluent documentation on schema compatibility. M. Kleppmann, Designing Data-Intensive Applications, ch. 11 (stream processing, logs versus message brokers). Backend from First Principles, chapter 23 (message brokers and event streaming with Kafka). The Kafka course page on this site. Numbers are invented examples.`
},
{
  title: `Delivery semantics and ordering`,
  short: `Know what at-most-once, at-least-once and exactly-once really promise, and where ordering is and is not guaranteed.`,
  why: `Vendors use "exactly-once" in marketing and agents repeat it. Reviewers need to know which promise the design relies on, and where the duplicates and reordering will appear, because those determine whether the consumer logic is correct.`,
  concept: [
    `<b>At-most-once</b>: a message is delivered zero or one time, with no retry, so messages can be lost. It suits data where loss is fine (some metrics). <b>At-least-once</b>: the message is retried until acknowledged, so it is never lost but can arrive more than once. This is the usual default. <b>Exactly-once</b> across a network is not something a transport can promise on its own: the practical meaning is <b>at-least-once delivery plus idempotent processing</b>, giving an effect that happens once.`,
    `In a consumer the order of two steps decides the guarantee. <b>Process, then commit the offset</b> (or ack): a crash in between causes a repeat, so you get at-least-once. <b>Commit, then process</b>: a crash in between loses the message, so you get at-most-once. For most business work, process first and make processing idempotent.`,
    `Kafka offers <b>idempotent producers</b> (the broker discards duplicates caused by producer retries within a partition) and <b>transactions</b>, which let a consumer that reads from Kafka and writes to Kafka do so atomically with its offset commit. This is the basis of its exactly-once processing, and it holds for the read-process-write cycle inside Kafka. It does not cover an external side effect such as sending an email or writing to another database, which still needs idempotency.`,
    `<b>Ordering</b> is guaranteed in Kafka only within a partition, and a queue usually orders only loosely (SQS standard queues make no ordering promise, and FIFO queues order within a message group). Total order across everything is rarely needed and costs parallelism. Design for <b>per-entity order</b> with the entity id as the key, and make consumers tolerate out-of-order or late events by using a version number or timestamp and ignoring older updates. Retries can also reorder: a failed message retried later arrives after its successors.`
  ],
  terms: [
    [`At-least-once`, `Retried until acknowledged: no loss, possible duplicates.`],
    [`At-most-once`, `No retry: no duplicates, possible loss.`],
    [`Exactly-once effect`, `At-least-once delivery combined with idempotent processing.`],
    [`Offset commit`, `Recording how far a consumer has read, so it resumes from there.`],
    [`Per-key ordering`, `Order guaranteed among records with the same key, not across keys.`]
  ],
  example: {
    setup: `The search indexer consumes ad events and updates the search index. The agent's loop: poll, commit offsets, then index (invented example).`,
    body: [
      `Committing before indexing means a crash after the commit loses those events: the index silently misses ads. That is at-most-once for a requirement that says "every ad must be searchable". Reverse the order: index, then commit. A crash now causes a repeat, which is harmless if indexing is idempotent, such as writing the document by <code>ad_id</code> (an upsert).`,
      `Ordering: events for ad 42 are "created", "price 100", "price 90". If the consumer applies them in the wrong order after a retry, the index shows 100. Fix by carrying the ad's <code>version</code> in each event and having the upsert ignore any event whose version is lower than the stored one. Test it by delivering the events out of order and twice.`
    ],
    table: {
      head: [`Consumer order`, `Crash in between`, `Result`],
      rows: [
        [`Process, then commit offset`, `Processed, not committed`, `Repeat: at-least-once`],
        [`Commit offset, then process`, `Committed, not processed`, `Loss: at-most-once`],
        [`Process and offset in one transaction`, `Neither or both`, `Exactly-once effect, when both live in the same store`],
        [`Idempotent upsert by key and version`, `Repeat or reorder`, `Safe`]
      ]
    }
  },
  technique: [
    { t: `State the guarantee per flow`, x: `For each message flow, write at-most-once, at-least-once or exactly-once effect, and what loss or duplicate costs.` },
    { t: `Order the consumer steps`, x: `Process then commit, unless loss is acceptable. Never commit first by default.` },
    { t: `Make processing idempotent`, x: `Use upserts by key, unique constraints or a processed-id table.` },
    { t: `Define the ordering unit`, x: `Name the entity that must stay in order and use it as the key or message group.` },
    { t: `Tolerate disorder`, x: `Carry a version or timestamp and ignore stale events. Test with duplicated and reordered input.` }
  ],
  mistakes: [
    { t: `Believing in exactly-once`, ctx: `The design says "the platform gives exactly-once" and the consumer sends an email on every message. A rebalance causes duplicate emails.`, fix: `Treat delivery as at-least-once and add idempotency for external effects. Exactly-once inside one system does not extend to others.` },
    { t: `Committing offsets before the work`, ctx: `Auto-commit marks records as read as soon as they are polled. A crash during processing drops them.`, fix: `Commit after processing succeeds, or disable auto-commit and commit explicitly.` },
    { t: `Assuming global order`, ctx: `Two partitions carry one entity's events because the key was not set, so updates apply in the wrong order.`, fix: `Key by the entity, and use versions so stale events are ignored.` }
  ],
  review: [
    `For each flow, which delivery guarantee is relied on, and what does a loss or a duplicate cost?`,
    `In the consumer, is the offset committed before or after the work? What does a crash between them do?`,
    `Which effect is not idempotent and what protects it?`,
    `What ordering is required, how is it kept (key, message group), and how do consumers handle a stale or repeated event?`,
    `Red flag: the phrase "exactly-once" with no idempotent consumer, or offsets auto-committed before processing.`
  ],
  exercise: {
    prompt: `A consumer reads "ad sold" events and sends a congratulation email, then commits the offset. A rebalance happens mid-batch. Describe what the seller receives and how to make it correct.`,
    answer: `<p>Records processed but not yet committed are given to the new owner, so the seller can receive the email twice. With at-least-once, duplicates are expected, not a bug in the broker.</p><p>Record the effect in a <code>sent_notification</code> table with a unique key such as <code>(ad_id, 'sold')</code> and insert before sending. A repeat finds the key and skips. Test by delivering the event twice.</p>`
  },
  checklist: [
    `Each flow states its guarantee and the cost of loss or duplicates.`,
    `Offsets or acks are committed after processing.`,
    `Every external effect is idempotent.`,
    `The ordering unit is named and used as the key.`,
    `Tests deliver duplicated and reordered messages.`
  ],
  artifact: `Section 4 of the messaging design: a delivery table (flow, guarantee, commit order, idempotency mechanism, ordering key, out-of-order rule).`,
  agent: `The agent states the guarantee for each flow, commits after processing, adds an idempotency mechanism per external effect and writes tests with duplicated and reordered events.`,
  src: `Apache Kafka documentation: Design, message delivery semantics (idempotent producer, transactions). Amazon SQS Developer Guide: standard versus FIFO queues and message groups. M. Kleppmann, Designing Data-Intensive Applications, ch. 11 (exactly-once and fault tolerance). Backend from First Principles, chapter 23. Numbers are invented examples.`
},
{
  title: `The outbox pattern and change data capture`,
  short: `Stop writing to the database and the broker separately: put the event in the same transaction, then publish it reliably.`,
  why: `Agents often write "save to the database, then publish an event". If the process dies between the two, the data and the event disagree forever. This is the most common data-integrity flaw in event-driven code, and it is easy to find once you know the shape.`,
  concept: [
    `The <b>dual write problem</b>: a service must change its database and also publish a message, but these are two systems with no shared transaction. If it writes then publishes and crashes between, the event is lost. If it publishes then writes and the write fails, the event announces something that did not happen. Retrying does not fix either order, because the crash can happen anywhere.`,
    `The <b>transactional outbox</b>: in the same database transaction as the business change, insert a row into an <code>outbox</code> table describing the event. The commit makes both visible or neither. A separate <b>relay</b> reads unsent outbox rows and publishes them to the broker, then marks them sent. The relay may publish a row twice (it crashes after publishing, before marking), so the delivery is at-least-once and consumers must be idempotent. The event id in the outbox row serves as the idempotency key.`,
    `<b>Change data capture</b> (CDC) is a way to run the relay without polling: a tool such as <b>Debezium</b> reads the database's transaction log (the write-ahead log in PostgreSQL, through logical decoding) and emits a record for each committed change. It can publish the outbox table's inserts to Kafka, or even stream the tables themselves. CDC avoids polling load and preserves commit order, but adds an operational component, a replication slot that must be monitored (an idle slot makes PostgreSQL retain log files and can fill the disk), and the need to handle schema changes.`,
    `The mirror pattern for consumers is the <b>inbox</b>: store the ids of processed messages in a table, in the same transaction as the effect, to drop duplicates. Also clean up: outbox and inbox tables grow, so add a retention job. Do not use an outbox when losing the event is acceptable, because it adds a table, a relay and operating cost.`
  ],
  terms: [
    [`Dual write`, `Changing two systems (database and broker) with no shared transaction.`],
    [`Outbox`, `A table written in the same transaction as the change, holding events to publish.`],
    [`Relay`, `The process that publishes outbox rows to the broker and marks them sent.`],
    [`CDC`, `Change data capture: reading a database's transaction log to emit its changes.`],
    [`Inbox`, `A table of processed message ids that lets a consumer drop duplicates.`]
  ],
  example: {
    setup: `When a seller marks an ad as sold, the ad table is updated and an <code>ad.sold</code> event must reach the search index and the notification service.`,
    body: [
      `The agent's code: <pre>BEGIN
UPDATE ad SET status = 'sold' WHERE ad_id = 42
COMMIT
broker.publish('ad.sold', 42)</pre> A crash after COMMIT loses the event: the ad is sold, but the index still shows it for sale. A load test never shows this, a production restart does.`,
      `Fixed: in the same transaction insert <code>INSERT INTO outbox(event_id, topic, key, payload) VALUES (...)</code>. A relay polls <code>WHERE sent_at IS NULL ORDER BY id</code> with <code>FOR UPDATE SKIP LOCKED</code> so several relays do not take the same rows, publishes, then sets <code>sent_at</code>. Consumers use <code>event_id</code> to drop duplicates. If polling delay or load becomes a problem, replace the poller with Debezium reading the outbox table from the log. State the measured need before taking on that extra component.`
    ],
    table: {
      head: [`Approach`, `Event lost?`, `Phantom event?`, `Cost`],
      rows: [
        [`Write, then publish`, `Yes, on a crash between`, `No`, `Low`],
        [`Publish, then write`, `No`, `Yes, if the write fails`, `Low`],
        [`Outbox with a polling relay`, `No`, `No (duplicates possible)`, `A table and a relay`],
        [`Outbox with CDC`, `No`, `No (duplicates possible)`, `Debezium, replication slot to monitor`]
      ]
    }
  },
  technique: [
    { t: `Find every dual write`, x: `Look for a database change followed by a publish, an HTTP call or a cache update with no shared transaction.` },
    { t: `Decide whether loss matters`, x: `If the event must never be lost, use an outbox. If not, say so and accept the risk.` },
    { t: `Write the outbox row in the transaction`, x: `Include an event id, topic, key, payload and a created time.` },
    { t: `Choose the relay`, x: `A polling relay with SKIP LOCKED first, CDC when polling load or latency is measured to be a problem.` },
    { t: `Make consumers idempotent`, x: `Use the event id in an inbox table or a natural key. Add retention cleanup for outbox and inbox.` },
    { t: `Monitor the pipeline`, x: `Alert on unsent outbox age and, for CDC, on replication slot lag.` }
  ],
  mistakes: [
    { t: `Publish after commit as if it were atomic`, ctx: `The code publishes right after the commit. Process restarts and network blips lose events, rarely enough to survive testing.`, fix: `Write the event to an outbox in the same transaction and publish from the relay.` },
    { t: `A relay that is not safe to run twice`, ctx: `Two relay instances both read the same unsent rows and publish them all, or one marks rows sent before the publish succeeded.`, fix: `Mark sent after a successful publish, lock rows with SKIP LOCKED, and rely on consumer idempotency.` },
    { t: `An unmonitored replication slot`, ctx: `The CDC consumer stops. PostgreSQL keeps all the log for the slot until the disk is full.`, fix: `Alert on slot lag and retained log size, and have a runbook to drop or advance the slot.` }
  ],
  review: [
    `Where does this code change the database and publish a message? Are they in one transaction or a dual write?`,
    `What is the cost of a lost event here? Is an outbox justified or is the risk accepted explicitly?`,
    `How does the relay avoid double publishing rows, and what happens if it crashes mid-batch?`,
    `Are the consumers idempotent on the event id? Where is the table and its cleanup?`,
    `Red flag: "write then publish" described as reliable, or a CDC setup with no slot monitoring.`
  ],
  exercise: {
    prompt: `The agent proposes: update the ad in PostgreSQL, then update the Elasticsearch index in the same request, and "retry if it fails". Describe the failure and give the fix.`,
    answer: `<p>If the process dies after the commit, or the search update fails and the retries stop, the ad and the index disagree permanently. If the request is retried after the commit succeeded, the user may see an error for an operation that happened.</p><p>Fix: insert an outbox row (ad id, version) in the transaction; the relay or CDC publishes it; an indexing consumer reads the current ad by id and upserts by id and version. Also add a periodic reconciliation job that compares ad versions with the index, since any pipeline can fall behind.</p>`
  },
  checklist: [
    `Every database change plus publish has been checked for a dual write.`,
    `Events that must not be lost use an outbox in the same transaction.`,
    `The relay is safe to run twice and marks rows after publish.`,
    `Consumers dedupe by event id, and cleanup jobs exist.`,
    `Unsent age and, if used, replication slot lag are alerted.`
  ],
  artifact: `Section 5 of the messaging design: an event table (event, source transaction, outbox columns, relay type, consumers, dedupe key, reconciliation job).`,
  agent: `The agent flags each dual write in its own design, writes the outbox row in the same transaction, proposes the relay with its failure behavior and adds a reconciliation job.`,
  src: `C. Richardson, Microservices Patterns, Manning 2018 (transactional outbox, transaction log tailing). Debezium documentation: the outbox event router. PostgreSQL manual: Logical Decoding and replication slots. M. Kleppmann, Designing Data-Intensive Applications, ch. 11 (change data capture). Backend from First Principles, chapter 23. The Kafka and Postgres course pages on this site.`
},
{
  title: `WebSockets and real-time updates`,
  short: `Choose between polling, server-sent events and WebSockets, and review connection state, fan-out and slow clients.`,
  why: `Real-time features such as chat look simple in a demo and fail in production in specific ways: connections that silently die, messages lost on reconnect, a second server instance that cannot reach a user, and slow clients that exhaust memory. These are reviewable.`,
  concept: [
    `HTTP is request and response: the client asks first. For updates the server initiates there are three options. <b>Polling</b> (ask every few seconds) is simple and works everywhere, but it wastes requests and adds delay. <b>Server-sent events</b> (SSE) keep one HTTP response open and stream text events from server to client, with automatic reconnect in browsers, one direction only. <b>WebSockets</b> (RFC 6455) upgrade an HTTP connection (the server answers <code>101 Switching Protocols</code>) to a persistent, two-way channel. Use the simplest that fits: SSE for one-way updates, WebSockets for two-way messages like chat.`,
    `A WebSocket is <b>stateful</b>: the server holds the open connection in memory. Consequences: <b>authenticate at connect</b> (a token in the first message or a short-lived ticket, because browsers cannot set arbitrary headers in the WebSocket constructor) and re-check authorization for each action, since the connection lives long. Detect dead connections with <b>ping and pong heartbeats</b> and timeouts, because a network can drop without a close frame. Clients <b>reconnect with backoff and jitter</b> and must not all return at once after a deploy.`,
    `With several server instances, a user's connection lives on one of them. To send to a user, the sender's instance must reach that connection: use a <b>publish and subscribe</b> channel (Redis pub/sub, or a broker) so each instance delivers to its own connected clients, or route by a connection registry. Pub/sub in Redis is fire-and-forget: a message sent while an instance is disconnected is lost, so <b>persistence comes first</b>.`,
    `Persist the message in the database, then push it. Give every message an <b>id and a sequence number</b> per conversation, so on reconnect the client asks "everything after id N" and misses nothing, and the server can drop duplicates. Protect the server from <b>slow clients</b> with bounded outbound buffers: if a client cannot keep up, drop or disconnect it rather than buffering without limit. Set limits on message size, rate per connection and connections per member.`
  ],
  terms: [
    [`WebSocket`, `A persistent two-way connection started by an HTTP upgrade (RFC 6455).`],
    [`SSE`, `Server-sent events: a long-lived HTTP response streaming events one way.`],
    [`Heartbeat`, `Periodic ping and pong used to detect a dead connection.`],
    [`Fan-out`, `Delivering one event to many connections, possibly on many instances.`],
    [`Resume`, `On reconnect, fetching what was missed by asking for messages after a known id.`]
  ],
  example: {
    setup: `Chat between buyer and seller for an ad, with 5 server instances behind a load balancer (invented numbers: 20,000 open connections at peak).`,
    body: [
      `The agent's first version keeps a map of connections in each instance and sends a message only to connections it holds. A buyer on instance 1 and a seller on instance 4 never see each other's messages. Add a pub/sub layer: instance 1 saves the message, publishes it on a channel for the conversation, and every instance delivers it to the local sockets subscribed to that conversation.`,
      `Then the failure cases. The seller's phone goes through a tunnel and reconnects: the client sends <code>last_seen_seq = 118</code> and the server returns messages 119 onward from the database. A deploy restarts all instances and 20,000 clients reconnect together: they use backoff with jitter, and the server limits the connection rate. A client on a bad network is slow: its outbound buffer is capped at, say, 1 MB and then the connection is closed.`
    ],
    table: {
      head: [`Option`, `Direction`, `Fits`, `Watch`],
      rows: [
        [`Polling`, `Client asks`, `Rare updates, simple clients`, `Wasted requests, delay`],
        [`SSE`, `Server to client`, `Feeds, notifications`, `One way, connection limits per browser`],
        [`WebSocket`, `Both`, `Chat, live collaboration`, `State, auth, scaling, heartbeats`]
      ]
    }
  },
  technique: [
    { t: `Choose the simplest transport`, x: `Polling or SSE if updates go one way or are infrequent. WebSockets only for two-way low-latency traffic.` },
    { t: `Authenticate and authorize`, x: `Verify identity at connect, re-check permission on each subscribe or send, and expire long sessions.` },
    { t: `Persist before pushing`, x: `Save the message with a per-conversation sequence number, then publish. The database is the source of truth.` },
    { t: `Plan fan-out across instances`, x: `Use pub/sub or routing, and state that pub/sub loses messages for offline instances, so clients resume from the database.` },
    { t: `Handle connection failure`, x: `Heartbeats, client reconnect with backoff and jitter, resume from the last seen id.` },
    { t: `Set limits`, x: `Message size, rate per connection, connections per member, and a bounded outbound buffer for slow clients.` }
  ],
  mistakes: [
    { t: `In-memory connection map across instances`, ctx: `Each instance only knows its own sockets, so half of the messages never arrive once there are 2 or more servers.`, fix: `Add pub/sub fan-out and test with two instances.` },
    { t: `Push only, no persistence`, ctx: `Messages are sent through Redis pub/sub only. A user who is offline for a minute loses them.`, fix: `Save to the database first, push second, and let clients resume by sequence number.` },
    { t: `Authorization only at connect`, ctx: `A user who was removed from a conversation keeps receiving messages on the open socket for hours.`, fix: `Check membership when subscribing and on each push, and close sockets when access is revoked.` }
  ],
  review: [
    `Why a WebSocket and not polling or SSE? What requires two-way, low latency traffic?`,
    `How are connections authenticated, and how is access re-checked and revoked while the socket stays open?`,
    `How does a message reach a user on a different instance, and what happens to messages sent while they are offline?`,
    `What do clients do on a drop, and what stops a reconnect storm after a deploy?`,
    `Red flag: a connection map in process memory with several instances, or real-time delivery as the only copy of the message.`
  ],
  exercise: {
    prompt: `The agent's chat server broadcasts each message to every connected socket and filters on the client side by conversation id. List the problems.`,
    answer: `<p>Security: every client receives every conversation's messages, so anyone can read other people's chats by inspecting traffic. The server must deliver only to authorized subscribers. Scale: traffic grows with the total number of messages times the number of connections, not with a user's own conversations.</p><p>Fix: subscribe each socket to its conversations after a membership check, publish per-conversation channels, and send only to subscribers. Persist first, number messages per conversation, and support resume by sequence.</p>`
  },
  checklist: [
    `The transport choice is justified by direction and frequency of updates.`,
    `Authentication happens at connect and authorization is re-checked later.`,
    `Messages are persisted with a sequence number before being pushed.`,
    `Fan-out across instances and offline resume are designed and tested.`,
    `Heartbeats, backoff, rate limits and bounded buffers are set.`
  ],
  artifact: `Section 6 of the messaging design: a real-time table (channel, transport, auth rule, fan-out method, persistence and resume, limits, heartbeat and reconnect policy).`,
  agent: `The agent starts from the simplest transport, persists before pushing, adds resume by sequence number and tests delivery across two instances and a client reconnect.`,
  src: `RFC 6455 (The WebSocket Protocol). WHATWG HTML Standard: Server-sent events. Redis documentation: Pub/Sub (at-most-once delivery). Backend from First Principles, chapter 24 (WebSockets and real-time communication). Numbers are invented examples.`
},
{
  title: `gRPC and service-to-service calls`,
  short: `Review contracts, deadlines, retries and load balancing for calls between services.`,
  why: `A call to another service is a network call that can be slow, down, or half done, and it multiplies: one slow service stalls all its callers. Agents write the call and the contract but often omit the deadline, the retry rules and the rule for changing the schema safely.`,
  concept: [
    `<b>gRPC</b> is a remote procedure call framework: a contract is written in <b>Protocol Buffers</b> (a <code>.proto</code> file describing services, methods and messages), code is generated for client and server, and calls travel over <b>HTTP/2</b> with a compact binary encoding. It gives typed contracts, streaming (server, client or both ways) and multiplexing many calls on one connection. It suits internal service-to-service calls, less so public browser APIs, where REST and JSON are simpler. gRPC and REST are not rivals in every case: choose by who the caller is.`,
    `<b>Deadlines</b>: every call should carry a deadline, an absolute time by which the answer is no longer useful. gRPC propagates the deadline to downstream calls, so a chain of services stops work when the original caller has given up. Use a deadline, not just a timeout per hop, derived from the budget of the whole request: if the page must answer in 400 ms, the sum of the calls must fit. Servers should check cancellation and stop expensive work.`,
    `<b>Status codes</b> are gRPC's own: for example <code>OK</code>, <code>INVALID_ARGUMENT</code>, <code>NOT_FOUND</code>, <code>DEADLINE_EXCEEDED</code>, <code>UNAVAILABLE</code>, <code>ALREADY_EXISTS</code>, <code>PERMISSION_DENIED</code>. A client should retry <code>UNAVAILABLE</code> (usually transient) on idempotent methods, with backoff and a cap, and should not retry <code>INVALID_ARGUMENT</code>. Retrying a non-idempotent call requires an idempotency key. Retries multiply load across a call chain (3 layers with 3 attempts each can mean 27 calls to the bottom), so retry at one layer and use a retry budget.`,
    `<b>Schema evolution</b>: in Protobuf each field has a number, and the number is the identity on the wire. Never change a field's number or type, never reuse a deleted number (mark it <code>reserved</code>), and add new fields as optional so old clients still work. Treat the proto as a public contract and run a breaking-change check in CI. <b>Load balancing</b>: gRPC keeps long-lived HTTP/2 connections, so a plain connection-level load balancer sends all calls of one client to one backend. Use a client-side balancer or an L7 proxy that balances per call.`
  ],
  terms: [
    [`Protocol Buffers`, `A schema language and binary format where fields are identified by number.`],
    [`Deadline`, `The absolute time by which a call must finish, propagated to downstream calls.`],
    [`Status code`, `gRPC's result category, such as UNAVAILABLE or DEADLINE_EXCEEDED.`],
    [`Retry budget`, `A cap on the share of calls that may be retries, to stop retry storms.`],
    [`Reserved field`, `A field number or name that may never be used again in a message.`]
  ],
  example: {
    setup: `The ad detail page calls three services: ads, member profile and reviews, within a 400 ms budget (invented numbers).`,
    body: [
      `The agent's client code calls them one after another with no deadline and retries every error 3 times. If reviews slows to 5 s, the page waits 5 s, holds a worker, and each retry adds load to an already slow service. Fixes: set a 400 ms deadline on the request, call the three services concurrently (they are independent), give reviews a tighter deadline (150 ms) because it is optional, and render the page without reviews if it fails, a degraded mode the product owner agreed to. Retry only <code>UNAVAILABLE</code> on read methods, once, with jitter.`,
      `The contract: the agent adds a field <code>seller_rating = 7</code> to <code>AdResponse</code>. Reviewing the proto diff: a new number, not reused, not renamed, optional for old clients, and the removed field <code>old_price = 5</code> is marked <code>reserved 5;</code>. A breaking-change check runs in CI.`
    ],
    table: {
      head: [`Concern`, `What to check`, `Bad sign`],
      rows: [
        [`Deadline`, `Set on every call, propagated, derived from the budget`, `No deadline or a default of minutes`],
        [`Retry`, `Idempotent methods, UNAVAILABLE only, backoff, one layer`, `Retries at every layer, all codes retried`],
        [`Contract`, `Field numbers stable, deleted numbers reserved`, `Reused or renumbered fields`],
        [`Balancing`, `Per-call balancing across backends`, `One backend gets all of a client's calls`]
      ]
    }
  },
  technique: [
    { t: `Pick the protocol by caller`, x: `gRPC between internal services, REST and JSON for public or browser clients. Say why.` },
    { t: `Write the contract first`, x: `Define services and messages in the proto. Review field numbers, types and names as a public contract.` },
    { t: `Set deadlines from the request budget`, x: `Split the total latency budget across calls, propagate the deadline, and stop work on cancellation.` },
    { t: `Define retry rules`, x: `Which methods are idempotent, which status codes are retried, the backoff, the cap and the single layer that retries.` },
    { t: `Choose the degraded mode`, x: `For each dependency decide what the caller does when it fails: omit, use a default, or fail.` },
    { t: `Guard evolution and balancing`, x: `A breaking-change check in CI, reserved numbers for removed fields, and per-call load balancing.` }
  ],
  mistakes: [
    { t: `No deadline`, ctx: `A call to a slow service waits indefinitely, holding a worker and a connection, and the caller's callers pile up behind it.`, fix: `Set a deadline on every call, from the budget of the whole request, and propagate it.` },
    { t: `Retries at every layer`, ctx: `The gateway, the service and the client library each retry 3 times, so one failure becomes 27 calls into a struggling service.`, fix: `Retry at one layer, with a budget, on idempotent methods and transient codes only.` },
    { t: `Reusing a field number`, ctx: `A removed field 5 is later reused for a different type, and old clients decode garbage without any error.`, fix: `Mark removed numbers and names reserved and run an automated breaking-change check.` }
  ],
  review: [
    `Why gRPC here, and who are the callers? Would REST and JSON serve a browser or partner better?`,
    `What is the deadline on each call, how is it derived from the budget, and is it propagated?`,
    `Which methods are retried, on which status codes, at which layer, with what cap? Is the method idempotent?`,
    `In the proto diff: are field numbers stable, are removed fields reserved, is the change backward compatible?`,
    `Red flag: a remote call with no deadline, or retries of non-idempotent calls without an idempotency key.`
  ],
  exercise: {
    prompt: `The agent's gateway calls the ads service with 3 retries on any error, and the ads service calls the member service with 3 retries on any error. The member service is down. How many calls does it receive per user request, and what do you change?`,
    answer: `<p>The gateway makes up to 4 attempts, and each attempt makes the ads service make up to 4 calls to member: up to 16 calls per request, aimed at a service that is already failing, so it cannot recover. Also, non-transient errors are retried for nothing.</p><p>Retry at one layer only (usually the closest to the failing call), retry only UNAVAILABLE on idempotent reads, once, with jitter, and put a retry budget and a circuit breaker in front of the member service. Propagate one deadline so the chain stops when the user has given up.</p>`
  },
  checklist: [
    `The protocol choice matches the callers.`,
    `Every call has a deadline derived from the request budget and propagated.`,
    `Retry rules name methods, codes, layer, backoff and cap.`,
    `Proto changes keep numbers stable and reserve removed fields, checked in CI.`,
    `The degraded mode for each dependency is agreed and tested.`
  ],
  artifact: `Section 7 of the messaging design: a service-call table (caller, callee, method, deadline, retry rule, idempotency, degraded mode) and the proto change rules.`,
  agent: `The agent writes the proto first, sets deadlines from the latency budget, defines retries at one layer for idempotent methods, tests the degraded mode and runs a breaking-change check on the proto.`,
  src: `gRPC documentation: Core concepts, Deadlines, Status codes and their use, Retries and Load balancing. Protocol Buffers documentation: Language guide (field numbers, reserved fields, updating a message type). M. Nygard, Release It!, 2018 (timeouts, circuit breaker). Backend from First Principles, chapter 13 (gRPC and inter-service communication). Numbers are invented examples.`
}
];
