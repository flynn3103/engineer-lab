# Scylla, rebuilt for learning

Build a small Go wide-column store that exposes:

- consistent-hash token routing;
- partition and clustering-key storage;
- replication and tunable read/write acknowledgements;
- a memtable, SSTable-like files, and compaction;
- asynchronous request handling.

This is a learning model, not a CQL-compatible ScyllaDB clone.
