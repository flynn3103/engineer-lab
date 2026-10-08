(function(){
 const {text,rect,line,path,dot,move,show,stage,scenario,register}=SparkScene;
 const fan=scenario('broadcast-or-shuffle','Broadcast · fan out the small side','An estimate selects a plan. A small lookup table fans out to executors while the large orders remain beside their tasks.',[
  'from pyspark.sql import functions as F','cities = spark.table("dim.cities").filter(F.col("active"))','orders.join(cities, "city_id").explain("formatted")','spark.sql("ANALYZE TABLE dim.cities COMPUTE STATISTICS")','joined = orders.join(F.broadcast(cities), "city_id")','# Check actual build-side size, join type and the executed plan.'
 ],stage('join · small-side broadcast','Illustrative: build side 4 MB; stale estimate 4 GB; 3 executor copies.',k=>{
  text(k,26,88,'ESTIMATES CHOOSE A PLAN; ACTUAL SIZE CHOOSES THE RISK','xs b');
  const table=k.chip(null,{x:26,y:112,w:182,h:36,label:'cities · actual 4 MB',small:true,tone:'ok'});
  const driver=SparkScene.group(k);k.el('circle',{cx:0,cy:0,r:31,fill:'none',stroke:'currentColor','stroke-width':2},driver);text(k,0,4,'driver','xs b','middle',driver);move(driver,320,133);
  const locations=[[26,241],[232,241],[438,241]];
  const orders=locations.map(([x,y],i)=>{path(k,`M320 166 L${x+90} 220`);text(k,x,y-17,'executor '+i,'xs b');return k.chip(null,{x,y,w:176,h:29,label:'orders partition '+i,small:true});});
  const copies=locations.map(([x,y])=>k.chip(null,{x:268,y:117,w:104,h:25,label:'cities copy',small:true,tone:'ok'}));
  const estimate=text(k,26,181,'','xs b');const plan=text(k,26,201,'','xs b');
  const result=locations.map(([x,y],i)=>k.chip(null,{x,y:y+51,w:176,h:28,label:'probe local lookup',small:true,show:false,tone:'ok'}));return {table,copies,estimate,plan,result,orders};
 },(s,k,r)=>{const p=s.p;
  r.estimate.set(p<3?'size estimate: 4 GB > 10 MB default threshold':'size estimate refreshed; validate filtered relation');r.plan.set(p<4?'Initial plan: SortMergeJoin with exchanges':'Chosen illustrated plan: BroadcastHashJoin');
  r.copies.forEach((c,i)=>c.set({show:p>=4,x:p>=5?61+i*206:268,y:p>=5?191:117,tone:p>=6?'ok':'cursor'}));
  r.result.forEach(c=>c.set({show:p>=6}));r.orders.forEach(c=>c.set({tone:p>=6?'ok':'info'}));
 }),[
  ['inputs','One join side is tiny, but the planner sees an estimate','The original incident has a stale large estimate for a small city relation. Stored file size, estimated relation size and in-memory build size need not be identical.',1,[['actual build side','4 MB']]],
  ['estimate','The stale estimate exceeds the automatic broadcast threshold','For supported join types, size estimates help select a build side and strategy. A wrong estimate can lead to exchanges of a very large fact table.',2,[['estimated size','4 GB','warn']]],
  ['initial plan','SortMergeJoin normally redistributes and sorts the inputs','This plan can be appropriate for large sides, but it moves unnecessary bytes when a small side could be broadcast. Existing partitioning can avoid some exchanges.',2,[['illustrated choice','SortMergeJoin']]],
  ['measure and refresh','Refresh statistics, then inspect the filtered relation plan','ANALYZE updates table statistics; it does not guarantee an exact post-filter estimate. Confirm row counts, estimates and the actual size that will be built.',3,[['next check','estimated + actual bytes']]],
  ['build broadcast','A broadcast hint can request a supported small-side strategy','The illustrated plan builds the small relation and broadcasts it. A hint is not permission to ignore memory or unsupported join semantics.',4,[['build side','cities']]],
  ['copies','Executors receive a reusable copy of the small build relation','The small-side packets fan out. Actual distribution can use a broadcast tree; this picture shows the logical outcome, not network topology.',4,[['copies shown','3']]],
  ['local probes','Fact partitions probe the local build relation','The orders remain with their tasks. A broadcast hash join can avoid shuffling the streamed fact side for this equi-join.',4,[['orders exchange','not required here','ok']]],
  ['inspect final','Validate the strategy and the build-side memory in the run','AQE may change a provisional plan after measurement. Inspect the executed operator and its metrics rather than assuming a hint always produced the intended join.',5,[['shown strategy','BroadcastHashJoin']],'Broadcast a genuinely small build side. Validate the size, join semantics and executed strategy.']
 ]);
 const capacity=scenario('broadcast-too-big','Broadcast · the memory cliff','A growing build-side payload fills the driver envelope, fans out into executor envelopes, and exposes the cost of an unsafe hint.',[
  'joined = orders.join(F.broadcast(side), "city_id")','# The actual build relation is 30 GB in this illustrative case.','# Broadcast collection and hash structures require memory.','# Raising spark.sql.broadcastTimeout does not create memory.','joined = orders.join(side, "city_id")  # remove the forced hint','# Inspect exchanges and the final strategy after refreshing stats.'
 ],stage('broadcast · memory capacity','Illustrative memory budget; serialized and built sizes can differ.',k=>{
  text(k,26,88,'DRIVER BUILD ENVELOPE','xs b');rect(k,26,109,242,81,'--warn');
  const payload=k.chip(null,{x:40,y:122,w:108,h:28,label:'300 MB estimate',small:true,tone:'cursor'});
  text(k,302,89,'EXECUTOR COPIES','xs b');const copies=[0,1,2].map(i=>{rect(k,303+i*105,109,97,81,'--warn');return k.chip(null,{x:310+i*105,y:126,w:83,h:28,label:'copy',small:true});});
  const cliff=path(k,'M276 104 V197','--bad');cliff.style.strokeWidth=3;text(k,26,211,'Memory limits remain even if the timeout increases.','xs');
  const a=Array.from({length:6},(_,i)=>k.chip(null,{x:26+i*97,y:248,w:87,h:25,label:i%2?'side part':'fact part',small:true,show:false}));
  const gate=rect(k,292,285,55,31,'--acc2');text(k,319,306,'sort','xs b','middle');
  const status=text(k,26,335,'','xs b');return {payload,copies,a,gate,status};
 },(s,k,r)=>{const p=s.p;
  r.payload.set({w:p>=2?226:108,label:p>=2?'actual relation · 30 GB':'estimate · 300 MB',tone:p>=2?'bad':'cursor'});
  r.copies.forEach(c=>c.set({show:p>=3&&p<5,label:p>=3?'30 GB':'copy',tone:'bad'}));
  r.a.forEach((c,i)=>c.set({show:p>=5,x:p>=6?111+i%3*184:26+i*97,y:p>=6?247+Math.floor(i/3)*32:248,tone:p>=6?'ok':'info'}));show(r.gate,p>=5);
  r.status.set(p<2?'A forced hint bypasses the automatic size threshold':p<5?'A large broadcast risks timeout or memory failure':p>=7?'Partitioned joins distribute state, but skew can still dominate':'Remove the hint and inspect the partitioned join plan');
 }),[
  ['hint','The hint requests broadcast despite an unreliable estimate','A hint can influence strategy priority. The automatic threshold is not a hard safety guard when the user explicitly requests a broadcast.',0,[['hint','BROADCAST']]],
  ['collect build','Broadcast preparation evaluates the actual build relation','The driver participates in collecting and preparing the broadcast relation. An estimated size is not the amount of memory that this operation will require.',1],
  ['actual size','The real relation is much larger than the estimate','Thirty gigabytes is illustrative. Serialized payload, deserialized objects and hash-table overhead can each make the operation exceed a memory budget.',1,[['actual build','30 GB','warn']]],
  ['replicate','Executor copies multiply the resident memory and network cost','Every executor using the broadcast can need its copy. Multiplication by executor count estimates a logical replication cost, not the exact transport bytes.',2,[['copies shown','3']]],
  ['limits','Timeout and memory pressure are different failure mechanisms','More time can help a slow but viable broadcast. It cannot make an oversized build structure fit in the driver or executor.',3,[['diagnose','size / memory / timeout']]],
  ['partitioned plan','Removing the hint allows a distributed join strategy','Inspect the plan after refreshing statistics. A sort-merge or shuffled-hash strategy can partition state instead of replicating the entire build relation.',4,[['broadcast hint','removed']]],
  ['distributed state','Partitioned tasks handle corresponding key ranges','The drawn side pieces distribute memory demand. A single skewed partition can still be huge, so the distributed plan is not automatically safe.',5,[['check','largest partition']]],
  ['choose from evidence','The measured build size determines whether broadcast is viable','A correct estimate and suitable strategy avoid forcing a full relation into every executor. Verify with representative data and the final plan.',5,[['decision','measured capacity']],'A broadcast hint changes planning, not available memory. Large build relations need partitioned work.']
 ]);
 register(7,[fan,capacity],window.COURSE.chapters[7].explain);
})();
