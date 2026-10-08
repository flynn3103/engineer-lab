(function(){
 const {text,rect,line,path,dot,move,show,stage,scenario,register}=SparkScene;
 const routes=scenario('combine-blocks','Shuffle · combine and route','Partial sums shrink before crossing the exchange. Follow the map-by-reducer block matrix and same-key routing.',[
  'pairs = sc.parallelize([("Hue",10),("Hue",20),("SF",40)], 3)','totals = pairs.reduceByKey(lambda a,b: a+b, numPartitions=2)','# A partial sum is formed per key within each map partition.','# Logical block (map m, reducer r) lives inside map m output.','totals.collect()  # safe only because this toy result is small'
 ],stage('shuffle · combine and route','Illustrative: 3 maps × 2 reducers; key routing is fixed within the job.',k=>{
  text(k,26,88,'LOCAL MAP INPUT → PARTIAL SUMS','xs b');
  const inputs=[],outputs=[];
  for(let m=0;m<3;m++){text(k,26+m*198,110,'map '+m,'xs b');inputs.push(k.chip(null,{x:26+m*198,y:119,w:180,h:24,label:'Hue: 10 + 20 · SF: 40',small:true}));outputs.push(k.chip(null,{x:26+m*198,y:154,w:180,h:24,label:'Hue: 30 · SF: 40',small:true,tone:'ok'}));}
  text(k,26,214,'ONE DATA FILE + INDEX PER MAP','xs b');text(k,313,214,'LOGICAL BLOCKS','xs b');
  const matrix=[];for(let m=0;m<3;m++){text(k,28,236+m*28,'M'+m,'xs');for(let r=0;r<2;r++){const g=rect(k,69+r*104,219+m*28,96,22,r?'--acc2':'--ok');matrix.push(g);text(k,117+r*104,235+m*28,'R'+r,'xs','middle');}}
  const reducers=[k.chip(null,{x:340,y:259,w:123,h:35,label:'Hue → R0',small:true,tone:'ok'}),k.chip(null,{x:485,y:259,w:123,h:35,label:'SF → R1',small:true,tone:'cursor'})];
  const dots=Array.from({length:6},(_,i)=>dot(k,i%2?'--acc2':'--ok'));
  const total=text(k,340,328,'','xs b');return {inputs,outputs,matrix,reducers,dots,total};
 },(s,k,r)=>{const p=s.p;
  r.inputs.forEach(c=>c.set({tone:p>=2?'mut':'info'}));r.outputs.forEach(c=>c.set({show:p>=2}));
  r.matrix.forEach(g=>show(g,p>=3));r.dots.forEach((d,i)=>{let m=Math.floor(i/2),q=i%2;move(d,p>=6?400+q*145:p>=4?117+q*104:116+m*198,p>=6?306:p>=4?230+m*28:190,p>=2);});
  r.reducers.forEach(c=>c.set({tone:p>=6?'ok':'info'}));r.total.set(p>=7?'Hue total = 90 · SF total = 120':p>=5?'Each reducer fetches its block from every map':'Map-side partials are smaller than all raw values');
 }),[
  ['raw pairs','Rows of the same city begin in several map partitions','Each map in the drawing has two Hue values and one SF value. A city total needs contributions from all these source partitions.',0,[['raw values shown','9']]],
  ['key destination','A partitioner assigns each key a reducer destination','Every Hue partial targets R0 and every SF partial targets R1 in this teaching example. The destinations are illustrative, not literal Python hash outputs.',1,[['reducers','2']]],
  ['map-side combine','reduceByKey first combines values within each map','Associative and commutative reduction lets each map replace two Hue values with one partial sum. groupByKey must preserve individual values instead.',2,[['partials shown','6'],['raw values','9']]],
  ['write layout','A map writes indexed ranges for reducer destinations','The normal sort-based shuffle uses a data file and index per map output. The logical M × R blocks are not M × R independent physical files.',3,[['logical blocks','3 × 2 = 6']]],
  ['available blocks','Each matrix cell is one map-to-reducer range','The index locates the bytes belonging to each reducer. Empty ranges and shuffle writer variants can change physical details.',3,[['normal data files','3']]],
  ['fetch','Each reducer fetches its range from all map outputs','The fetcher may read locally or remotely. Network bytes, fetch waits and memory in flight all affect this phase.',4,[['blocks per reducer','3']]],
  ['reduce partials','Reducers add the partial sums for their assigned keys','Hue receives three 30s, and SF receives three 40s. No reducer needs to gather all cities, and the driver does not hold the original input.',1,[['Hue / SF','90 / 120']]],
  ['complete','The tiny result is returned after distributed aggregation','Only this toy result is safe to collect. Real city totals may instead be written to storage, and an extremely hot group can still dominate one reducer.',4,[['result keys','2','ok']],'Combine locally, route by key, and fetch indexed map ranges: logical blocks are not physical files.']
 ]);
 const sizes=scenario('partition-sizing','Partitions · bytes per task','A fixed partition count produces huge night tasks and tiny test tasks. A measured partition ruler reveals both costs.',[
  'spark.conf.set("spark.sql.shuffle.partitions", 200)','# Size estimate: shuffled bytes / reduce partitions.','spark.conf.set("spark.sql.shuffle.partitions", 16000)','spark.conf.set("spark.sql.adaptive.enabled", "true")','spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")','# AQE may merge small adjacent shuffle partitions after measurement.'
 ],stage('shuffle · bytes per task','Illustrative decimal sizes; drawn samples represent many partitions.',k=>{
  text(k,26,89,'NIGHT: 2 TB / 200 ≈ 10 GB PER TASK','xs b');
  const big=[0,1,2,3].map(i=>{const g=SparkScene.group(k);rect(k,0,0,129,78,'--warn',g);text(k,64,29,'10 GB','sm b','middle',g);text(k,64,53,'spill pressure','xs','middle',g);move(g,26+i*147,106);return g;});
  text(k,26,220,'TEST: 50 MB / 200 ≈ 250 KB PER TASK','xs b');
  const tiny=Array.from({length:20},(_,i)=>rect(k,26+i*29,236,23,16,'--acc'));
  const chunks=Array.from({length:8},(_,i)=>k.chip(null,{x:26+i*74,y:112,w:68,h:30,label:'125 MB',small:true,tone:'ok',show:false}));
  const merged=[0,1,2].map(i=>k.chip(null,{x:26+i*198,y:278,w:180,h:29,label:'coalesced task '+i,small:true,tone:'ok',show:false}));
  const needle=dot(k);const note=text(k,26,331,'','xs b');return {big,tiny,chunks,merged,needle,note};
 },(s,k,r)=>{const p=s.p;
  r.big.forEach((g,i)=>move(g,26+i*147,p>=4?156:106,p<4));r.tiny.forEach((g,i)=>show(g,p>=2&&p<6));
  r.chunks.forEach(c=>c.set({show:p>=4}));r.merged.forEach(c=>c.set({show:p>=6}));move(r.needle,[40,172,315,575,40,246,425,575][p],p>=2&&p<4?265:194,p>=1);
  r.note.set(p<2?'Big partitions increase per-task state and spill risk':p<4?'Tiny tasks spend a larger share on setup and scheduling':p<6?'Start with enough partitions for the large job':'AQE can merge small adjacent partitions after the exchange');
 }),[
  ['fixed count','A partition count is a count, not a byte-size guarantee','Two terabytes divided among 200 reducers gives roughly ten gigabytes each only if the data is evenly distributed. A skewed maximum can be much larger.',0,[['average night input','≈ 10 GB']]],
  ['large state','Large reducers can spill their sort or aggregation state','Input bytes and in-memory state differ. Spill can keep a supported operator running, but disk capacity and unspillable objects still matter.',1,[['risk','spill / memory pressure','warn']]],
  ['small test','The same count creates tiny tasks for the test dataset','Fifty megabytes divided into 200 gives about 250 KB per task. A tiny task can cost more in scheduling and setup than useful processing.',0,[['average test input','≈ 250 KB']]],
  ['overhead','Do not tune partition count from one dataset size alone','Measure shuffle bytes, task duration and maximum partition size in the real workload. Counting executors does not determine reducer input sizes.',1,[['task count','200']]],
  ['higher initial count','A larger initial count reduces average reducer input','The illustrative night setting is 16,000 partitions: about 125 MB each in decimal units. This is a starting estimate, not an automatic best setting.',2,[['night average','≈ 125 MB']]],
  ['runtime measure','AQE reads actual map-output statistics after the shuffle','SQL adaptive execution can inspect materialized shuffle sizes. This behavior is not the same as changing an RDD hash partitioner at runtime.',3,[['measurement','actual output bytes']]],
  ['merge tiny neighbours','Coalescing combines small adjacent shuffle partitions','The three drawn tasks are an illustration, not a predicted count. AQE settings such as advisory size and parallelism preferences influence the final grouping.',4,[['final test tasks','measured grouping']]],
  ['inspect final','Choose sizes from task work, then inspect the final plan','More partitions increase block and scheduling overhead; fewer can enlarge state and spill. Keep enough useful parallelism while controlling the largest task.',5,[['check','max / median input']],'Size the largest useful task, not just the average. AQE can merge small SQL shuffle partitions.']
 ]);
 register(5,[routes,sizes],window.COURSE.chapters[5].explain);
})();
