/* The deep-dive tours. Order = display order. Add a system here (and its tour under techstack/<id>/), then run `python3 tools/build_site_index.py`. */
window.SITE_SYSTEMS = [
  { id:'spark', name:'Apache Spark', color:'#e25a1c', kind:'Distributed data processing', chapters:15,
    url:'techstack/spark/course.html',
    topics:'Build an engine: tasks, shuffle, spill, recovery, SQL.' },
  { id:'scylla', name:'ScyllaDB', color:'#2f6fed', kind:'Leaderless wide-column store', chapters:9,
    url:'techstack/scylla/course.html',
    topics:'System design, 9 features, 27 use cases, token ring, quorum, LSM and Raft animations.' },
  { id:'redis', name:'Redis', color:'#d82c20', kind:'In-memory data server', chapters:9,
    url:'techstack/redis/course.html',
    topics:'System design, 9 features, 25 use cases.' },
  { id:'kafka', name:'Apache Kafka', color:'#4a5568', kind:'Distributed event log', chapters:9,
    url:'techstack/kafka/course.html',
    topics:'System design, 9 features, 27 use cases, partition, ISR, rebalance and KRaft animations.' },
  { id:'postgres', name:'PostgreSQL', color:'#336791', kind:'Relational database', chapters:8,
    url:'techstack/postgres/course.html',
    topics:'System design, 8 features, 24 use cases, B+tree animation.' },
  { id:'k8s', name:'Kubernetes', color:'#326ce5', kind:'Container orchestration', chapters:9,
    url:'techstack/k8s/course.html',
    topics:'System design, 9 features, 27 use cases, etcd, reconcile, scheduler, rollout and HPA animations.' }
];
