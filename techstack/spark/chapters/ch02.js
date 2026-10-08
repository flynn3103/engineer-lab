(function(){
 const {text,rect,line,path,dot,move,show,stage,scenario,register}=SparkScene;
 const cuts=scenario('where-stages-cut','Stages · find the gate','The scheduler walks backwards along the dependency chain, cuts at the shuffle, then unlocks the downstream tasks.',[
  'lines = sc.textFile("orders/")','paid = lines.filter(is_paid)','pairs = paid.map(city_and_amount)','rev = pairs.reduceByKey(lambda a, b: a + b)','rev.count()  # two stages for this simple uncached RDD chain'
 ],stage('stages · dependency cuts','Simplified RDD job: 3 map partitions and 2 reduce partitions.',k=>{
  rect(k,26,109,324,94,'--acc');rect(k,430,109,184,94,'--ok');
  text(k,40,129,'SHUFFLE MAP STAGE','xs b');text(k,444,129,'RESULT STAGE','xs b');
  const ops=['read','filter','map','reduce','count'].map((l,i)=>k.chip(null,{x:[39,140,241,440,530][i],y:153,w:i<3?91:75,h:28,label:l,small:true}));
  const gate=rect(k,374,107,30,112,'--warn');text(k,389,96,'SHUFFLE','xs b','middle');
  const scan=k.chip(null,{x:530,y:229,w:75,h:24,label:'walk ←',small:true,tone:'cursor'});
  const waits=[0,1].map(i=>k.chip(null,{x:447+i*82,y:270,w:75,h:27,label:'R'+i,small:true,tone:'warn'}));
  const tasks=[0,1,2].map(i=>k.chip(null,{x:40+i*101,y:270,w:91,h:27,label:'M'+i,small:true}));
  const packet=dot(k);const note=text(k,26,328,'','xs b');return {ops,gate,scan,waits,tasks,packet,note};
 },(s,k,r)=>{const p=s.p;
  r.scan.set({x:[530,440,374,241,39,39,440,530][p],show:p<=4});
  r.tasks.forEach(c=>c.set({tone:p>=5?'ok':p>=4?'cursor':'info'}));r.waits.forEach(c=>c.set({tone:p>=6?'ok':'warn',label:p>=6?c.st.label.split(' ')[0]+' run':c.st.label.split(' ')[0]+' wait'}));
  r.gate.style.fill=p>=6?'var(--card)':'color-mix(in srgb,var(--warn) 35%,var(--card))';
  move(r.packet,p>=7?575:p>=6?450:p>=5?389:65,245,p>=4);
  r.note.set(p<4?'Walk backwards: a wide dependency cuts a parent stage':p<6?'Reducers wait for the required map outputs':p>=7?'A stage has one task for each of its partitions':'Available map outputs unlock the result stage');
 }),[
  ['action','count submits demand for the final RDD','The action starts scheduling. The stage graph is built from dependencies, not by counting the source code lines.',4,[['action','count']]],
  ['backwards','The scheduler traces dependencies from count towards read','The scan marker moves backwards. Narrow parents can be evaluated inside the same task chain.',4],
  ['wide edge','reduceByKey introduces a shuffle dependency','Rows of one city can come from several input partitions. Their values must be routed to the reducer assigned that key.',3,[['shuffle boundaries','1']]],
  ['cut','The dependency cut creates a ShuffleMapStage','read, filter and map stay on the same side of the gate. They are pipelined within map tasks rather than becoming three separate stages.',2,[['upstream stage','3 tasks']]],
  ['map tasks','Each map partition is processed by a map task','The upstream stage writes shuffle output for downstream reduce partitions. Multiple task waves may be needed if the cluster has fewer slots than tasks.',2,[['map partitions','3']]],
  ['publish map output','Map outputs become available for downstream fetches','This simplified run waits for all required map outputs. Spark can reuse available shuffle outputs on later scheduling or recover missing ones after failures.',3,[['available maps','3 / 3','ok']]],
  ['unlock','Result tasks fetch their blocks and run reduceByKey','The gate opens in the picture. Each reducer reads the pieces for its reduce partition and produces that partition of the result.',3,[['result partitions','2']]],
  ['result','count combines results from the final stage','This simple RDD action has two stages: a ShuffleMapStage and a ResultStage. SQL queries, reused exchanges and adaptive execution can produce more complex graphs.',4,[['stages','2','ok']],'Stage boundaries follow shuffle dependencies. Narrow functions stay together inside task pipelines.']
 ]);
 const collapse=scenario('coalesce-one-task','Partitions · collapse or exchange','Compare a narrow funnel with a shuffle barrier. See exactly which side loses its parallelism.',[
  'big = raw.filter(valid).map(enrich)','big.coalesce(1).saveAsTextFile("report/coalesced")','# coalesce is narrow: the final task can pull the parent chain','big.repartition(1).saveAsTextFile("report/repartitioned")','# repartition adds an exchange before the single output partition'
 ],stage('coalesce and repartition','Illustrative: 3 parent partitions; output directories contain part files.',k=>{
  text(k,26,90,'coalesce(1) · NARROW FUNNEL','xs b');text(k,26,221,'repartition(1) · SHUFFLE BARRIER','xs b');
  [0,1,2].forEach(i=>{path(k,`M136 ${116+i*30} L388 145`,'--warn');path(k,`M136 ${247+i*30} L374 ${247+i*30}`);});
  const heavy=[0,1,2].map(i=>k.chip(null,{x:26,y:101+i*30,w:110,h:24,label:'read + enrich',small:true}));
  const wide=[0,1,2].map(i=>k.chip(null,{x:26,y:232+i*30,w:110,h:24,label:'heavy task '+i,small:true}));
  const narrow=k.chip(null,{x:393,y:129,w:214,h:32,label:'ONE task pulls all parents',small:true,tone:'warn'});
  const gate=rect(k,374,230,23,84,'--acc2');const out=k.chip(null,{x:436,y:260,w:169,h:30,label:'ONE output task',small:true,tone:'ok'});
  const a=dot(k,'--warn'),b=[0,1,2].map(()=>dot(k));return {heavy,wide,narrow,gate,out,a,b};
 },(s,k,r)=>{const p=s.p;
  r.heavy.forEach((c,i)=>c.set({x:p>=2?244:26,y:101+i*30,tone:p>=2?'warn':'info'}));r.narrow.set({tone:p>=3?'warn':'info'});
  r.wide.forEach(c=>c.set({tone:p>=5?'ok':'info'}));r.out.set({tone:p>=7?'ok':'info'});
  move(r.a,p>=3?508:p>=2?326:154,145,p>=1&&p<=3);
  r.b.forEach((d,i)=>move(d,p>=7?515:p>=6?385:p>=5?260:154,p>=7?275:247+i*30,p>=4));
 }),[
  ['two graphs','Both paths start with the same partitioned heavy work','The picture uses three input partitions. A single-file request can change how those partitions are evaluated, depending on the dependency added before the write.',0,[['parent partitions','3']]],
  ['narrow link','coalesce merges parent partitions without redistributing rows','There is no exchange at the funnel. One coalesced output task can directly read several parent iterators.',1,[['shuffle','none']]],
  ['one pulling task','The one output task can also execute its narrow parents','For this uncached narrow chain, enrichment is pulled through that one task. Existing cache or shuffle boundaries can change which upstream work is already materialized.',1,[['final stage tasks','1','warn']]],
  ['one writer','Only one task performs this final narrow stage','Idle slots cannot divide that final partition. coalesce also returns a directory containing a part file; its path is not itself a CSV filename.',1,[['parallelism at funnel','1']]],
  ['exchange boundary','repartition inserts a shuffle before the one output task','The second graph puts a materialization barrier between heavy work and the writer. This costs network and local disk I/O.',3,[['new shuffle','1']]],
  ['parallel parents','The heavy stage evaluates all three parent partitions','The read and enrichment work can run in parallel before its outputs are routed to one reduce partition.',0,[['heavy stage tasks','3','ok']]],
  ['collect shuffle pieces','Completed map outputs target one output partition','The gate collects shuffle blocks, not all rows in the driver. One downstream task will fetch and write them.',3,[['output partitions','1']]],
  ['single write','The bottleneck is now confined to the final task','Repartition does not make the single writer parallel. It can preserve upstream parallelism, while adding a shuffle that may be expensive for large outputs.',3,[['heavy / writer tasks','3 / 1']],'Locate the boundary: coalesce narrows a chain; repartition separates parallel work from the final writer.']
 ]);
 register(2,[cuts,collapse],window.COURSE.chapters[2].explain);
})();
