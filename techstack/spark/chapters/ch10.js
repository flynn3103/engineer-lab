(function(){
 const {text,rect,line,path,dot,move,show,stage,scenario,register}=SparkScene;
 const tape=scenario('no-event-log','Events · replay the tape','Job and task events fill a tape, update the live UI, and survive the driver only when a durable log is written.',[
  '# Set before the application starts:','spark.eventLog.enabled = true','spark.eventLog.dir = s3a://ops-logs/spark-events','# History server points at the same durable location:','spark.history.fs.logDirectory = s3a://ops-logs/spark-events','# Listener events reconstruct recorded UI state after the run.','# Logging cannot retroactively recover an already-lost run.'
 ],stage('events · record and replay','Illustrative event tape; events shown are a small subset of a real run.',k=>{
  text(k,26,88,'DRIVER LISTENER EVENTS · ORDERED TAPE','xs b');line(k,26,159,614,159);
  const names=['JobStart','StageStart','TaskEnd','TaskEnd','StageEnd','JobEnd'];
  const events=names.map((n,i)=>k.chip(null,{x:26+i*98,y:109,w:91,h:29,label:n,small:true}));
  const cursor=dot(k,'--acc2');text(k,26,218,'LIVE UI','xs b');text(k,255,218,'DURABLE LOG','xs b');text(k,468,218,'HISTORY UI','xs b');
  const live=SparkScene.group(k);[0,1,2].forEach(i=>rect(k,26,236+i*24,75+i*31,16,'--acc',live));
  const log=SparkScene.group(k);rect(k,255,233,133,88,'--warn',log);[0,1,2,3].forEach(i=>line(k,271,250+i*17,372,250+i*17,'--mut',log));
  const history=SparkScene.group(k);[0,1,2].forEach(i=>rect(k,468,236+i*24,75+i*31,16,'--ok',history));
  path(k,'M113 164 V201 M302 164 V201 M388 277 H457','--acc');
  const packet=k.chip(null,{x:244,y:179,w:148,h:24,label:'JSON event records',small:true,tone:'cursor'});return {events,cursor,live,log,history,packet};
 },(s,k,r)=>{const p=s.p;
  r.events.forEach((c,i)=>c.set({tone:i<=p?'ok':'info',show:p<3||p>=4}));move(r.cursor,72+Math.min(5,p)*98,177,p<3||p>=4);
  show(r.live,p!==3&&p<6);show(r.log,p>=5);show(r.history,p>=7);
  r.packet.set({show:p>=4,x:p>=7?455:244,y:p>=7?291:179,label:p>=7?'replay events':'JSON event records'});
 }),[
  ['events posted','The driver posts events about the application as it runs','Job, stage and task listeners consume a stream of observed facts. This tape is a small teaching sample, not the complete event schema.',0,[['driver','running']]],
  ['ordered stream','Task completions and stage events extend the tape','Arrival order is not partition order or a global wall-clock order of every executor action. The driver records the events it receives.',0,[['sample events','6']]],
  ['live views','Listeners turn events into live job, stage and task views','The UI folds recorded updates into tables and metrics. It is a view of the running driver application, not a durable database of every executor detail.',0,[['UI','live']]],
  ['unlogged run ends','Without an event log, a lost driver can leave no history','This is the original incident. A vanished live UI cannot be reconstructed after the fact simply by turning logging on later.',6,[['history for lost run','unavailable','warn']]],
  ['next run configured','Enable event logging before the next application starts','The replay now begins a logged run. The durable directory and history server must have suitable access and compatible configuration.',1,[['event log','enabled']]],
  ['durable tape','The event logger writes records while the application runs','Rolling and compression can manage log sizes. Storage permissions, retention and cleanup determine whether history remains accessible.',2,[['log','durable records']]],
  ['driver gone','The log can outlive the driver and its live UI','The executor processes need not remain reachable for history replay. The persisted facts survive when the log location is durable and retained.',5,[['driver','ended'],['log','retained','ok']]],
  ['replay','The history server rebuilds views from the recorded event log','History reflects what was logged. It cannot invent unrecorded application data, and replay or update delays can mean the view is not immediately current.',4,[['history','reconstructed','ok']],'The live UI is a view. A retained event log is the tape the history server can replay.']
 ]);
 const plans=scenario('plan-before-after','Plans · before and after','An estimated join plan waits at the starting line. Shuffle measurements then guide AQE to a final executed strategy.',[
  'joined = orders.join(cities, "city_id")','joined.explain("formatted")  # inspect provisional planning','joined.count()  # execute this query','# Inspect the executed query in the SQL UI / history server.','# AdaptiveSparkPlan may change after query stages materialize.','# isFinalPlan=true identifies a finalized adaptive plan.'
 ],stage('plans · estimated and actual','Illustrative supported equi-join; AQE is enabled.',k=>{
  text(k,26,88,'BEFORE EXECUTION','xs b');text(k,365,88,'AFTER RUNTIME MEASUREMENT','xs b');
  const initial=k.chip(null,{x:26,y:111,w:242,h:36,label:'SortMergeJoin',small:true,tone:'warn'});
  const exA=k.chip(null,{x:26,y:165,w:109,h:25,label:'orders exchange',small:true});const exB=k.chip(null,{x:157,y:165,w:111,h:25,label:'cities exchange',small:true});
  const stats=k.chip(null,{x:181,y:234,w:267,h:34,label:'runtime output: cities = 4 MB',small:true,tone:'cursor'});
  const final=k.chip(null,{x:365,y:111,w:249,h:36,label:'BroadcastHashJoin',small:true,tone:'ok',show:false});
  const tiny=k.chip(null,{x:492,y:165,w:122,h:25,label:'broadcast cities',small:true,tone:'ok',show:false});
  path(k,'M268 129 H355 M319 233 V205 H490 V193','--acc2');
  const arrow=dot(k,'--acc2');const status=text(k,26,311,'','xs b');return {initial,exA,exB,stats,final,tiny,arrow,status};
 },(s,k,r)=>{const p=s.p;
  r.initial.set({tone:p>=5?'mut':'warn'});r.stats.set({show:p>=3,x:p>=4?181:26,y:p>=4?234:234});r.final.set({show:p>=5});r.tiny.set({show:p>=5});
  r.exA.set({tone:p>=5?'mut':'info'});r.exB.set({tone:p>=5?'mut':'info'});move(r.arrow,p>=5?488:p>=4?320:157,p>=4?205:208,p>=2);
  r.status.set(p<2?'explain describes a plan; it does not execute this count':p<5?'AQE learns from completed query-stage output':p>=7?'Inspect the final operator and metrics for the executed query':'Final strategy can differ; earlier exchange work may already be paid');
 }),[
  ['plan','explain prints the query plan available at that moment','Analysis and metadata reads can happen during planning, but explain is not the count action shown here. The plan begins with size estimates.',1,[['action','not executed']]],
  ['provisional','A non-final adaptive plan can still be rewritten','The initial SortMergeJoin is an illustrative choice. isFinalPlan=false warns that runtime statistics may alter the remaining execution.',1,[['isFinalPlan','false']]],
  ['action','count executes the query and creates observable task work','Use the same executed query identity when inspecting the SQL UI. Another action can have its own execution record or plan details.',2,[['query','executing']]],
  ['materialize stats','Query stages expose actual output sizes to AQE','Here the measured city output is four megabytes. AQE can use materialized shuffle or broadcast stage statistics, depending on the plan.',4,[['measured city size','4 MB']]],
  ['replan','Eligible remaining work can switch to a broadcast strategy','The conversion depends on the join type, adaptive settings and runtime size thresholds. A small measurement does not force every possible join to become broadcast.',4,[['adaptive choice','broadcast candidate']]],
  ['final operator','The finalized plan shows the strategy selected for execution','The broadcast packets appear on the final side. Changing strategy at runtime does not erase shuffle or stage work that has already happened.',5,[['shown operator','BroadcastHashJoin']]],
  ['metrics','Operator metrics explain what the execution actually spent','Read exchange sizes, task duration, spill and row counts alongside the final plan. A plan label alone does not identify the whole bottleneck.',3,[['inspect','SQL + stage metrics']]],
  ['compare','Compare the initial plan with the executed final plan','Tune the work that actually ran and account for earlier materialization costs. Keep the event log so this evidence remains available after the driver exits.',5,[['isFinalPlan','true','ok']],'An initial plan is a proposal. Runtime statistics can change the remaining plan; metrics show the cost.']
 ]);
 register(10,[tape,plans],window.COURSE.chapters[10].explain);
})();
