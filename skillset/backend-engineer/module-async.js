Object.assign(SkillData.modules.find(m => m.id === 'async'), {
  status: 'ready',
  goal: `Review asynchronous work and messaging designs: what leaves the request path, how repeats and failures are made safe, how logs and partitions are shaped, what delivery and ordering are really guaranteed, how events are published atomically, and how real-time and service-to-service calls behave when the network does not.`,
  competencies: [
    `Decide what runs in a background job and expose its state to users and operators.`,
    `Make consumers safe under repeats: idempotency keys, bounded retries, dead letters and visibility timeouts.`,
    `Choose between a queue and an event log, and review keys, partitions, consumer groups and retention.`,
    `State and check delivery guarantees and ordering, and order offset commits correctly.`,
    `Spot dual writes and apply the outbox pattern with a polling relay or change data capture.`,
    `Review WebSocket designs for authentication, fan-out, resume and slow clients.`,
    `Review gRPC calls for deadlines, retries, status codes, schema evolution and balancing.`
  ],
  artifact: `A messaging design: a job table, a retry and idempotency table, a topic table, a delivery table, an event and outbox table, a real-time table and a service-call table, with the failure handling for each flow.`,
  agent: `The agent, using this skill (intended behavior: the plugin does not exist yet), designs each asynchronous flow with its failure table, writes idempotency and outbox mechanisms, and adds tests that deliver messages twice and out of order.`,
  skillName: 'messaging-design'
});
delete SkillData.modules.find(m => m.id === 'async').outline;
SkillData.modules.find(m => m.id === 'async').skillDescription = "Design and review asynchronous work: task queues, retries, idempotency, dead letters, Kafka-style logs and consumer groups, delivery semantics, outbox and CDC, WebSockets and gRPC. Use when adding a queue, background job, event stream, real-time feature or service-to-service call.";
