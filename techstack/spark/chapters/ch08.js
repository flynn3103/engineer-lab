(function(){
 const {text,rect,line,path,dot,move,show,stage,scenario,register}=SparkScene;
 const pool=scenario('cores-share-pool','Memory · shared reservoir','One executor reservoir feeds four, then eight task cups. Watch the fair-share ruler shrink and spill leave the cups.',[
  '# Cluster sizing before application startup:','spark.executor.memory = 16g','spark.executor.cores = 4','spark.memory.fraction = 0.6','# More concurrent tasks share the same executor memory pool.','# Measure operator state, partition bytes, spill and GC together.','# Smaller shuffle partitions can reduce task-state demand.'
 ],stage('executor · shared memory','Illustrative fair-share model; actual memory allocation is dynamic.',k=>{
  text(k,26,88,'UNIFIED POOL: EXECUTION + STORAGE','xs b');rect(k,26,106,588,69,'--acc');
  const water=rect(k,35,130,570,36,'--acc');text(k,320,126,'16 GB heap → approximately 9.4 GB managed pool','xs b','middle');
  line(k,320,133,320,174,'--ok');text(k,465,157,'cache can lend unused space','xs','middle');
  const cups=Array.from({length:8},(_,i)=>{const g=SparkScene.group(k);rect(k,0,0,63,58,'--acc',g);rect(k,6,22,51,29,'--ok',g);text(k,31,16,'T'+i,'xs b','middle',g);move(g,30+i*74,232);return g;});
  const shares=Array.from({length:8},(_,i)=>text(k,61+i*74,309,'','xs b','middle'));
  const drops=Array.from({length:8},(_,i)=>dot(k,'--warn'));const disk=k.chip(null,{x:240,y:190,w:159,h:26,label:'spill runs → disk',small:true,show:false,tone:'warn'});
  return {cups,shares,drops,disk,water};
 },(s,k,r)=>{const p=s.p,wide=p>=1&&p<=3;
  r.cups.forEach((g,i)=>move(g,wide?30+i*74:68+i*147,232,wide||i<4));
  r.shares.forEach((t,i)=>{t.set(wide?'≈1.2 GB':'≈2.4 GB');t.el.setAttribute('x',wide?61+i*74:99+i*147);t.show(wide||i<4);});
  r.drops.forEach((d,i)=>move(d,61+i*74,p===3?208:252,p===3));r.disk.set({show:p===3});r.water.style.fill=p===3?'color-mix(in srgb,var(--warn) 25%,var(--card))':'color-mix(in srgb,var(--acc) 25%,var(--card))';
 }),[
  ['four tasks','Four concurrent tasks draw from one executor memory pool','Sixteen gigabytes is the heap allocation in this illustration. Managed execution and storage use a fraction after Spark reserves memory; the rest supports other JVM objects.',2,[['concurrent tasks','4']]],
  ['more cores','Eight runnable task slots do not double the memory pool','Assuming one CPU per task and enough runnable work, more cores allow more concurrent tasks. The same executor allocation must support them.',2,[['concurrent tasks','8']]],
  ['share shrinks','The illustrative equal share drops from 2.4 to 1.2 GB','Spark grants execution memory dynamically; these cups are a teaching model, not fixed reservations. Active task counts, storage and operator requests affect the allocation.',4,[['managed pool','≈ 9.4 GB']]],
  ['spill','Spillable operators can write sorted or aggregated runs to disk','Spill is a correctness mechanism, not necessarily a failure. Disk speed, free space and unspillable objects determine whether the task can continue.',5,[['spill','disk I/O','warn']]],
  ['concurrency choice','Four active tasks have a larger potential memory share','Reducing cores per executor changes concurrency and can improve memory pressure, but also reduces runnable slots. Compare throughput rather than tuning a single metric.',2,[['concurrency','4']]],
  ['state size','Smaller partitions can reduce the state each task needs','Input bytes do not equal live memory. A sort, hash map or expanding row function can use much more than its compressed input size.',6,[['check','peak operator state']]],
  ['cache interaction','Execution and storage can borrow unused space within limits','The protected storage region affects eviction. A cache plus concurrent task state can compete for the managed pool even when each component fits alone.',3,[['pool users','execution + storage']]],
  ['measure','Use spill, GC and maximum task size to validate the sizing','A supported operator may spill safely; an application list or huge hash object may still fail. Do not infer an inevitable OOM from partition bytes alone.',5,[['validation','spill + GC + peak state']],'Cores control concurrent demand. Size the executor and the largest task state together.']
 ]);
 const envelope=scenario('container-killed','Container · beyond the heap','JVM heap stays steady while Python and native memory grow outside it. The outer container boundary tells a different story.',[
  '# Simplified container example; configure before startup:','spark.executor.memory = 12g','spark.executor.memoryOverhead = 1g','# PySpark workers may share the overhead budget if not separately limited.','spark.executor.memoryOverhead = 4g  # measured budget for this example','# Container request may also include off-heap and PySpark allocations.','# Exit code 137 alone does not prove an OOM kill: inspect cluster events.'
 ],stage('container · total memory','Illustrative: no separately configured off-heap or PySpark memory.',k=>{
  text(k,26,88,'OUTER CONTAINER LIMIT','xs b');const boundary=rect(k,26,106,588,214,'--acc');
  rect(k,45,132,279,161,'--ok');text(k,62,155,'JVM HEAP · 12 GB configured','xs b');text(k,62,179,'heap use can remain healthy','xs');
  text(k,347,155,'NON-HEAP / WORKERS','xs b');
  const workers=[0,1,2].map(i=>k.chip(null,{x:348,y:180+i*39,w:245,h:28,label:['Python worker','native / buffers','JVM overhead'][i],small:true,tone:'cursor'}));
  const limit=line(k,590,164,590,305,'--bad');limit.style.strokeWidth=3;
  const burst=path(k,'M598 184 L623 170 M598 218 L623 218 M598 252 L623 266','--bad');
  const gauge=k.chip(null,{x:58,y:233,w:251,h:32,label:'total envelope: 13 GB',small:true});return {boundary,workers,limit,burst,gauge};
 },(s,k,r)=>{const p=s.p;
  r.workers.forEach((c,i)=>c.set({x:p>=2&&p<=4?373+i*7:348,w:p>=2&&p<=4?238:245,tone:p>=3&&p<=4?'bad':p>=5?'ok':'cursor'}));
  show(r.burst,p===3||p===4);show(r.limit,p<5);r.boundary.style.stroke=p>=3&&p<=4?'var(--bad)':'var(--acc)';
  r.gauge.set({label:p>=5?'measured envelope: 16 GB':'total envelope: 13 GB',tone:p>=3&&p<=4?'bad':p>=5?'ok':'info'});
 }),[
  ['heap allocation','The heap setting is not the entire executor container limit','This simplified example has 12 GB heap and 1 GB overhead. Separately configured off-heap or PySpark memory can add other terms to the request.',1,[['simplified limit','13 GB']]],
  ['healthy heap','The JVM can stay below its heap limit while total RSS grows','Python workers, native libraries and JVM non-heap allocations are outside ordinary heap usage. A healthy JVM heap chart does not prove the container fits.',3,[['heap OOM','not observed']]],
  ['worker demand','Concurrent Python workers consume the non-heap budget','If PySpark memory is not separately configured, worker memory competes with other overhead. More concurrent tasks can mean more worker demand.',3,[['pressure','outside JVM heap','warn']]],
  ['outer limit','The total memory can cross the container boundary','The red marks represent an envelope breach. Whether the cluster kills or throttles the process depends on its manager and configured enforcement.',3,[['risk','container memory limit']]],
  ['inspect reason','An executor loss requires the cluster-side termination reason','Exit code 137 means SIGKILL and may have several causes. Look for OOMKilled or an explicit memory-limit message before diagnosing the overhead budget.',6,[['evidence','cluster events']]],
  ['budget measured','A measured overhead increase expands this example envelope','Four gigabytes is the selected example, not a universal default. Kubernetes non-JVM jobs have a different default overhead factor from ordinary JVM jobs.',4,[['simplified limit','16 GB']]],
  ['concurrency','Match worker concurrency and native state to the budget','Reducing concurrent Python work, shrinking batches or fixing retained native allocations may matter as much as increasing the reservation.',5,[['measure','peak total RSS']]],
  ['validate full load','Validate heap and total process memory under a full workload','Check the cluster termination history as well as Spark task metrics. Configure the allocation before startup; a runtime SQL setting will not resize a launched container.',6,[['check','heap + RSS + events']],'Heap and container memory are different limits. Diagnose the killed process from cluster evidence.']
 ]);
 register(8,[pool,envelope],window.COURSE.chapters[8].explain);
})();
