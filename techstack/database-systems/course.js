/* Problem-based course data for Database Systems.
   Chapter titles and order live here. Each chapters/chNN.js (zero-based index NN) supplies that chapter's problem, predict, explain, diagnose, source and scenes;
   course.html merges those overrides into this list.
   The chapters follow two lecture series, kept as local PDFs under output/pdf: CMU 15-445 (Fall 2024, the OLTP and storage-engine course)
   and CMU 15-721 (the modern analytical-database course). Every chapter's Source line names the lectures it draws on. */
window.COURSE = {
  name: 'Database Systems',
  kick: '28 chapters · problem-based · CMU 15-445 and 15-721 · PostgreSQL 17 examples',
  lead: `A payments service keeps orders, ledger lines and inventory in one database, and feeds an analytics warehouse beside it. Its incidents come from reports that double-count or drop rows, a query that reads far more data than it returns, an index that stops helping, locks and isolation levels that let two correct requests break a rule, a crash between two writes, and a cluster that splits data across machines. Each chapter starts from one of these incidents, asks what the database must do to prevent it, and walks the mechanism that does it, in the order a query meets it: storage, indexes, execution, optimizer, transactions, recovery, then many machines.`,
  chapters: [
    { title: 'Relational Model and SQL' },
    { title: 'Pages, Records, and Log-Structured Storage' },
    { title: 'The Buffer Pool' },
    { title: 'Storage Models and File Formats' },
    { title: 'Compression and Encodings' },
    { title: 'Hash Tables' },
    { title: 'B+ Tree Indexes' },
    { title: 'Filters and Specialized Indexes' },
    { title: 'Index Concurrency Control' },
    { title: 'Query Execution Models' },
    { title: 'Sorting and Aggregation' },
    { title: 'Join Algorithms' },
    { title: 'Parallel Execution and Scheduling' },
    { title: 'Vectorized Execution and SIMD' },
    { title: 'Query Compilation' },
    { title: 'User-Defined Functions' },
    { title: 'Database Networking and Data Transfer' },
    { title: 'Query Optimization and Plan Search' },
    { title: 'Cost Models and Cardinality Estimation' },
    { title: 'Transactions and Isolation' },
    { title: 'Two-Phase Locking' },
    { title: 'Timestamp Ordering and Optimistic Control' },
    { title: 'Multi-Version Concurrency Control' },
    { title: 'Write-Ahead Logging' },
    { title: 'Crash Recovery with ARIES' },
    { title: 'Distributed OLTP Databases' },
    { title: 'Cloud Data Warehouses' },
    { title: 'Lakehouse and Embedded Analytics' }
  ]
};
