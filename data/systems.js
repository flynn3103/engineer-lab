/* The deep-dive tours. Order = display order. Add a system here (and its tour under techstack/<id>/), then run `python3 tools/build_site_index.py`. */
window.SITE_SYSTEMS = [
  { id:'spark', name:'Apache Spark', color:'#e25a1c', kind:'Distributed data processing', chapters:15,
    url:'techstack/spark/course.html',
    topics:'Build an engine: tasks, shuffle, spill, recovery, SQL.' },
  { id:'scylla', name:'ScyllaDB', color:'#2f6fed', kind:'Leaderless wide-column store', chapters:10,
    url:'techstack/scylla/course.html',
    topics:'Token ring, quorum, compaction, tablets.' },
  { id:'redis', name:'Redis', color:'#d82c20', kind:'In-memory data server', chapters:9,
    url:'techstack/redis/course.html',
    topics:'System design, 9 features, 25 use cases.' },
  { id:'kafka', name:'Apache Kafka', color:'#4a5568', kind:'Distributed event log', chapters:12,
    url:'techstack/kafka/01-kafka-internals-end-to-end.html',
    topics:'Partitions, ISR, consumer groups, transactions.' },
  { id:'postgres', name:'PostgreSQL', color:'#336791', kind:'Relational database', chapters:12,
    url:'techstack/postgres/01-postgres-internals-end-to-end.html',
    topics:'Buffer pool, B-tree, MVCC, WAL, VACUUM.' },
  { id:'k8s', name:'Kubernetes', color:'#326ce5', kind:'Container orchestration', chapters:11,
    url:'techstack/k8s/01-k8s-internals-end-to-end.html',
    topics:'API server, etcd, scheduler, kubelet, rollouts.' }
];
