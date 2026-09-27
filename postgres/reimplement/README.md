# Postgres, rebuilt for learning

Build a small Go relational DB to answer three questions: where rows live,
how queries run, and why results remain correct across concurrency and
crashes. PostgreSQL is the comparison target; CMU 15-445/645 supplies the
learning sequence. This is not a PostgreSQL-compatible server.

## Core roadmap

1. [Schema, catalog and relational algebra](feature/01-schema-catalog-and-relational-algebra.md)
2. [Heap pages and buffer pool](feature/02-heap-pages-and-buffer-pool.md)
3. [Iterator query execution](feature/03-iterator-query-execution.md)
4. [B-tree index and index scan](feature/04-btree-index-and-index-scan.md)
5. [Transactions and MVCC](feature/05-transactions-and-mvcc.md)
6. [WAL and crash recovery](feature/06-wal-and-crash-recovery.md)

## Advanced roadmap

7. [VACUUM and version garbage collection](feature/07-vacuum-and-version-garbage-collection.md)
8. [Statistics and cost-based planner](feature/08-statistics-and-cost-based-planner.md)
9. [External sort, hash join and spill](feature/09-external-sort-hash-join-and-spill.md)
10. [Checkpoint and WAL lifecycle](feature/10-checkpoint-and-wal-lifecycle.md)
11. [Isolation levels and deadlock handling](feature/11-isolation-levels-and-deadlock-handling.md)

Each feature exposes an invariant and the cost that motivates the next one.
Measure page I/O, buffer hit rate, row counts, version bloat and recovery
time throughout. All use cases are `TBU`; no engine or detailed use-case
document is added.

Background: [CMU Database Systems](https://15445.courses.cs.cmu.edu/fall2025/schedule.html),
[PostgreSQL internals](https://www.postgresql.org/docs/current/internals.html).
