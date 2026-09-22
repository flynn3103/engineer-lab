# Spark, rebuilt for learning

Build a small Go dataflow engine that makes Spark's execution model visible:

- lazy transformations and a logical DAG;
- actions that trigger planning and execution;
- partition-aware scheduling across local worker processes;
- shuffle files and reduce-side aggregation;
- broadcast values and a broadcast-hash join.

The goal is clarity and observability, not API or wire compatibility with Apache Spark.
