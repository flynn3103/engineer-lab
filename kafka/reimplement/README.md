# Kafka, rebuilt for learning

Build a small Go event-log broker that demonstrates:

- append-only, segmented partition logs;
- producer routing and acknowledgements;
- consumer offsets and consumer-group assignment;
- retention and log compaction;
- a simplified leader/replica model.

Keep the protocol intentionally local and simple; the learning target is the log and coordination model.
