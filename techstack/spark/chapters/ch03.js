(function(){
 const {text,rect,line,path,dot,move,show,stage,scenario,register}=SparkScene;
 const recovery=scenario('executor-lost','Recovery · missing map output','Watch a reducer fetch, lose a map block, wait while its producer is recomputed, and resume on a surviving executor.',[
  '# Map outputs are stored on executor-local disks.','# The executor or node hosting M1 becomes unavailable.','# Reducer fetch: FetchFailedException','# DAGScheduler invalidates unavailable map-output locations.','# Missing map partitions are recomputed on surviving executors.','# Reducers retry after their required blocks become available.', '# A surviving node shuffle service may preserve files after process exit.'
 ],stage('scheduler · missing output','Illustrative: 3 map outputs; no surviving service for the missing block.',k=>{
  text(k,26,88,'MAP OUTPUT LOCATIONS','xs b');text(k,26,181,'EXECUTOR SLOTS','xs b');
  const maps=[0,1,2].map(i=>k.chip(null,{x:34+i*198,y:112,w:174,h:31,label:'M'+i+' · available',small:true,tone:'ok'}));
  const slots=[0,1,2].map(i=>{rect(k,34+i*198,195,174,61,'--acc');text(k,47+i*198,214,'E'+i,'xs b');return k.chip(null,{x:47+i*198,y:224,w:148,h:24,label:'free slot',small:true});});
  const missing=path(k,'M240 197 L398 249 M398 197 L240 249','--bad');missing.style.strokeWidth=3;
  path(k,'M319 145 V174 H116 V193','--warn');
  const task=k.chip(null,{x:252,y:285,w:138,h:30,label:'reduce task',small:true});
  const packet=k.chip(null,{x:270,y:155,w:99,h:24,label:'fetch M1',small:true,tone:'cursor'});
  const note=text(k,26,331,'','xs b');return {maps,slots,missing,task,packet,note};
 },(s,k,r)=>{const p=s.p;
  r.maps.forEach((m,i)=>m.set({tone:i===1&&p>=2&&p<6?'bad':'ok',label:'M'+i+(i===1&&p>=2&&p<6?' · unavailable':i===1&&p>=6?' · rebuilt on E0':' · available')}));
  r.slots[1].set({label:p>=2?'executor lost':'free slot',tone:p>=2?'bad':'info'});show(r.missing,p>=2);
  r.slots[0].set({label:p>=4&&p<6?'M1 · retry':p>=6?'M1 · complete':'free slot',tone:p>=4?'ok':'info'});
  r.task.set({label:p>=7?'reduce · resumed':p>=3?'reduce · waiting':'reduce task',tone:p>=7?'ok':p>=3?'warn':'info'});
  r.packet.set({x:p>=7?111:p>=4?147:270,y:p>=7?284:155,label:p>=6?'new M1':p>=4?'retry M1':'fetch M1',show:p>=1});
  r.note.set(p>=7?'Consumer retries after its producer output is available':p>=4?'Retry the missing producer; intact map outputs can be reused':p>=3?'FetchFailed is a dependency failure, not just a slow task':'The driver tracks which executor serves each map output');
 }),[
  ['available','A completed map task leaves shuffle output on an executor','Three maps have succeeded, and the driver knows their output locations. The next stage depends on these stored outputs.',0,[['map outputs','3 / 3']]],
  ['fetch','A reduce task requests the block produced by M1','A reducer fetches the subset of each map output belonging to its partition. The network request targets the registered location.',0,[['requested block','M1 → reducer']]],
  ['location lost','The executor or node holding M1 becomes unavailable','This replay assumes M1 cannot be served by an external service. An executor process exit on a surviving node is different from losing that node and its local disk.',1,[['reachable maps','2 / 3','warn']]],
  ['fetch failure','FetchFailed reports that the required shuffle input is gone','Retrying only the same fetch against a dead location cannot recover the bytes. The scheduler has to restore the missing dependency.',2,[['failure','FetchFailedException']]],
  ['resubmit','The scheduler schedules missing map work on a surviving slot','The producer is evaluated again from available upstream data. Successfully retained outputs can be reused; recovery is not necessarily a full application restart.',4,[['map task replay','M1']]],
  ['compute again','The replacement task regenerates M1 shuffle blocks','A new task attempt computes that map partition and writes replacement shuffle output on E0. Retries cost time and may execute application side effects again.',4,[['replacement location','E0']]],
  ['register','New output locations satisfy the downstream dependency','The driver records the new output location. Reducers can now fetch the needed block from the surviving executor.',5,[['reachable maps','3 / 3','ok']]],
  ['resume','Downstream reduce attempts resume after input recovery','If a node-level shuffle service and its disk survive an executor process exit, a map replay may be unnecessary. It does not preserve a destroyed node or disk.',6,[['dependency','restored','ok']],'Task retries repeat work. FetchFailed recovery first restores unavailable shuffle producers.']
 ]);
 const race=scenario('straggler','Speculation · two attempts','A task-duration race makes the difference between one slow partition, another attempt, and a stage that can finish.',[
  '# Cluster settings, configured before the run:','spark.speculation = true','spark.speculation.multiplier = 1.5  # Spark 3.5 default','spark.speculation.quantile = 0.75   # enough completed tasks','# Other eligibility and efficiency checks also apply.','# First successful attempt wins; the redundant one is cancelled.'
 ],stage('speculation · attempt race','Illustrative durations; a slow node, not a skewed partition.',k=>{
  text(k,26,88,'TASK DURATION','xs b');text(k,599,88,'time →','xs','end');
  const bars=[],ends=[];
  for(let i=0;i<6;i++){text(k,26,120+i*29,'T'+i,'xs b');line(k,77,116+i*29,605,116+i*29);const bar=rect(k,0,-7,350,14,i===5?'--warn':'--ok',SparkScene.group(k));const g=bar.parentNode;bars.push(g);ends.push(dot(k,i===5?'--warn':'--ok'));}
  text(k,26,310,'T5 copy','xs b');line(k,98,306,605,306);const copy=k.chip(null,{x:300,y:292,w:123,h:25,label:'attempt 1',small:true,tone:'cursor'});
  const median=line(k,260,100,260,282,'--mut');median.style.strokeDasharray='4 4';text(k,260,99,'median','xs','middle');
  const winner=text(k,598,331,'','xs b','end');return {bars,ends,copy,winner};
 },(s,k,r)=>{const p=s.p;
  r.bars.forEach((g,i)=>{const w=i===5?[.1,.25,.36,.48,.58,.62,.65,.65][p]:Math.min(1,(p+1)/3);g.style.transform=`translate(77px,${116+i*29}px) scaleX(${w})`;move(r.ends[i],77+350*w,116+i*29);});
  r.copy.set({show:p>=4,x:p>=6?471:p>=5?386:300,label:p>=6?'copy succeeds':'attempt 1',tone:p>=6?'ok':'cursor'});
  r.winner.set(p>=6?'T5 attempt 1 wins; attempt 0 stops':p>=3?'Five tasks complete; T5 holds the stage':'Concurrent tasks need not finish together');
 }),[
  ['launch','Task duration depends on its data and the executor','Six tasks begin in this illustrative stage. Here T5 is slow because of its executor; the task itself can run faster elsewhere.',0,[['tasks','6']]],
  ['progress','Most task attempts advance at a similar rate','Their durations establish a reference for the scheduler. Spark does not speculate every task as soon as it starts.',1],
  ['completed sample','Completed tasks provide a median-duration reference','Speculation uses completed-task information, a completion quantile, minimum runtime and other checks. The median line is a teaching marker, not a full scheduling formula.',2,[['complete','5 / 6']]],
  ['tail','One slow attempt keeps the stage open','A running task is not retried merely because another task finished. Without speculation, Spark can continue waiting for this attempt.',3,[['unfinished task','T5','warn']]],
  ['eligible','An eligible slow task can get a second attempt elsewhere','With speculation enabled and its checks satisfied, the scheduler launches another attempt for the same partition on another executor.',1,[['T5 attempts','2']]],
  ['race','Both attempts may run; they are not two output partitions','They compute the same logical task. This consumes extra cluster capacity and can duplicate arbitrary external side effects.',4,[['logical T5 tasks','1']]],
  ['winner','The first successful attempt supplies the task result','The faster copy wins in this replay. The redundant attempt is cancelled; output commit coordination still matters for file writes.',5,[['successful T5','attempt 1','ok']]],
  ['limits','Speculation does not divide a skewed partition into pieces','If both copies must process the same huge hot-key partition, both can remain slow. Compare maximum and median input sizes before treating all stragglers as bad nodes.',5,[['stage','complete']],'Speculation races copies of one task. It helps bad-node tails, not the size of a hot partition.']
 ]);
 const c=window.COURSE.chapters[3];
 register(3,[recovery,race],c.explain,{predict:{...c.predict,why:'If shuffle output cannot be served after executor or node loss, Spark restores missing map output and retries dependent reducers. A surviving shuffle service can help after process exit, but cannot recover a lost node disk.'}});
})();
