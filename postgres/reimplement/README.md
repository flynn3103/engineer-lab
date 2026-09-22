# Postgres, rebuilt for learning

Build a small Go relational engine that demonstrates:

- SQL tokenizing, parsing, and a simple planner;
- iterator-based scans, filters, projections, and joins;
- pages, a B-tree-like index, and a buffer cache;
- MVCC transactions and snapshot visibility;
- a write-ahead log and recovery exercise.

The target is internal understanding, not PostgreSQL syntax compatibility.
