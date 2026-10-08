(function(){
 const {text,rect,line,path,dot,move,show,stage,scenario,register}=SparkScene;
 const recipe=scenario('lazy-two-reads','Lineage · pull the recipe','An action sends demand backwards through a recipe; records then flow forwards. Watch a second action and a persisted reuse.',[
  'orders = sc.textFile("orders/")','valid = orders.filter(valid_order)','pairs = valid.map(city_and_amount)','pairs.count()  # action: evaluate partitions','pairs.persist(StorageLevel.MEMORY_AND_DISK)','pairs.count()  # materialize the persisted partitions','pairs.count()  # reuse the materialized partitions'
 ],stage('lineage · demand and data','Illustrative: 3 partitions; each dot represents many records.',k=>{
  const nodes=[[34,149,'source'],[188,149,'filter'],[342,149,'map'],[492,149,'count()']].map(([x,y,label])=>k.chip(null,{x,y,w:112,h:36,label,small:true}));
  [146,300,454].forEach(x=>path(k,`M${x} 167 H${x+42} M${x+36} 163 L${x+42} 167 L${x+36} 171`));
  text(k,34,93,'THE RECIPE EXISTS ON THE DRIVER','xs b');text(k,34,123,'Each node describes a dependency, not a materialized table.','xs');
  const request=k.chip(null,{x:492,y:206,w:112,h:24,label:'demand',small:true,tone:'warn'});
  const dots=[0,1,2].map(()=>dot(k));
  const cache=k.chip(null,{x:342,y:269,w:112,h:30,label:'persisted P0–P2',small:true,tone:'ok',show:false});
  path(k,'M398 185 V269','--ok');const note=text(k,34,327,'','sm b');
  const action=text(k,492,258,'','xs b');return {nodes,request,dots,cache,note,action};
 },(s,k,r)=>{const p=s.p;
  r.nodes.forEach((n,i)=>n.set({tone:p===0?'info':p===1&&i===3?'cursor':p>=6&&i===2?'ok':'info'}));
  const reqX=[492,492,34,34,34,342,34,342][p];r.request.set({x:reqX,show:p===1||p===2||p===4||p===7,label:p===7?'cache hit':'demand'});
  const x=[42,42,42,490,490,350,350,490][p];r.dots.forEach((d,i)=>move(d,x+i*13,243,p>=2));
  r.cache.set({show:p>=5,tone:p>=6?'ok':'warn'});
  r.note.set(p===0?'Transformations: zero source scans':p===4?'No stored partitions → the same source is read again':p>=7?'Next action starts from the persisted partitions':'An action asks each partition to compute its iterator');
  r.action.set(p>=7?'action 4':p>=6?'action 3':p>=4?'action 2':p>=1?'action 1':'');
 }),[
  ['describe','Transformations draw a recipe without reading all the rows','filter and map add dependencies. The toy dots preview records; they are not a cache populated by this notebook cell.',2,[['source scans','0']]],
  ['request','An action sends demand backwards through the lineage','count requests the output partitions. Spark follows their dependencies back to the source and schedules the necessary stages.',3,[['action','count']]],
  ['read','Demand reaches the source; partition tasks begin reading','Each task reads its parent partition and pulls values through the narrow wrappers. The source is now being evaluated.',3,[['source scans','1']]],
  ['produce','Records flow forwards; count combines small partition results','The forward dots represent partition computation. count returns small counts to the driver rather than collecting the whole dataset.',3,[['result','scalar']]],
  ['another action','A second action follows the same uncached recipe again','Keeping a variable keeps its recipe, not its evaluated records. Another action reads the source again when its partitions were not retained.',3,[['source scans','2']]],
  ['mark persistence','persist marks an RDD; it does not fill storage immediately','MEMORY_AND_DISK requests reuse of computed partitions. This instruction is lazy, so a later action still has to populate the storage.',4,[['cached partitions','0 / 3']]],
  ['materialize','The next action computes and retains the marked partitions','This action makes a third source scan in our replay and stores its map outputs as persisted RDD partitions. This is not shuffle storage.',5,[['source scans','3'],['cached partitions','3 / 3','ok']]],
  ['reuse','A later action can start from stored partitions','The fourth action reads the retained partitions. Eviction, executor loss or an incomplete cache can still cause recomputation; persistence is an optimization, not a permanent backup.',6,[['source scans','still 3','ok']],'Lineage is a recipe. Actions pull it; persistence lets later actions reuse computed partitions.']
 ]);
 const storage=scenario('cache-overflow','Cache · memory and disk','Six equal partitions slide into a four-slot memory shelf. Follow the missing partitions, disk persistence, and later reuse.',[
  'big = source.map(parse_order)  # illustrative: 6 × 150 GB','big.persist(StorageLevel.MEMORY_ONLY)','big.count()  # evaluate and attempt to store all partitions','big.count()  # absent partitions require recomputation','# use a fresh RDD or unpersist before changing its storage level','big.unpersist()','big.persist(StorageLevel.MEMORY_AND_DISK)','big.count()  # overflow is retained on local disk'
 ],stage('persistence · partition storage','Illustrative: 900 GB in 6 equal partitions; 600 GB memory capacity.',k=>{
  text(k,26,88,'SOURCE-BACKED PARTITIONS','xs b');text(k,26,165,'MEMORY · FOUR SLOTS','xs b');text(k,414,165,'DISK · OVERFLOW','xs b');
  [0,1,2,3].forEach(i=>rect(k,26+i%2*164,184+Math.floor(i/2)*47,146,34,'--ok'));
  [0,1].forEach(i=>rect(k,414,184+i*47,198,34,'--warn'));
  const parts=Array.from({length:6},(_,i)=>k.chip(null,{x:26+i*99,y:105,w:88,h:28,label:'P'+i+' · 150',small:true}));
  const replay=path(k,'M560 294 C560 323 74 323 74 139','--bad');replay.style.strokeDasharray='5 4';
  const note=text(k,26,289,'','xs b');return {parts,replay,note};
 },(s,k,r)=>{const p=s.p;
  r.parts.forEach((c,i)=>{let x=26+i*99,y=105,showIt=true,tone='info';if(p>=2&&i<4){x=35+i%2*164;y=187+Math.floor(i/2)*47;tone='ok';}if(p>=3&&i>=4){showIt=p===4||p>=6;x=p>=6?466:26+i*99;y=p>=6?187+(i-4)*47:105;tone=p>=6?'warn':'bad';}c.set({x,y,show:showIt,tone});});
  show(r.replay,p===4);r.note.set(p<3?'cache() is only a request until an action evaluates it':p===3?'MEMORY_ONLY: P4 and P5 were not retained':p===4?'Later demand replays the missing partitions from lineage':p>=6?'MEMORY_AND_DISK retains overflow locally for reuse':'Unpersist, then choose the new storage level');
 }),[
  ['recipe','An RDD can be bigger than the available storage memory','The rack shows six equal partitions. Its four memory slots total 600 GB; the dataset totals 900 GB. The sizes are illustrative.',0,[['partitions','6']]],
  ['mark','MEMORY_ONLY asks Spark to retain computed partitions in memory','No partition has been computed yet. Marking the RDD changes what Spark will try to store after evaluation.',1,[['stored','0']]],
  ['fill','The first action computes partitions and fills the shelf','Four partitions fit in this simplified rack. Storage accounting depends on serialized representation and actual partition sizes; it is not just source file bytes.',2,[['memory occupied','600 GB']]],
  ['capacity','Two partitions do not fit and remain source-backed recipes','MEMORY_ONLY may fail to retain computed partitions. In this equal-size example, 4 of 6 are retained: about 67 percent, not the unrelated 39 percent incident sample.',2,[['retained','4 / 6'],['missing','2 / 6','warn']]],
  ['recompute','A second action has to recompute those missing partitions','The dashed return path means source work is repeated. A partial cache is not a task failure, and the application may appear correct while doing extra I/O.',3,[['recomputed','P4, P5','warn']]],
  ['change level','Release the old persistence before choosing another level','The replay uses unpersist before changing the same RDD to MEMORY_AND_DISK. Changing the level of an already persisted RDD directly is not a reliable way to replace it.',6,[['level','MEMORY_AND_DISK']]],
  ['disk fallback','Overflow partitions can now be retained on local disk','After evaluation, P4 and P5 are available from disk rather than being discarded. Disk reads are slower than RAM but can avoid a full source replay.',7,[['retained','6 / 6','ok']]],
  ['reuse','Stored partitions can satisfy the next action','Memory and disk are executor-local here. If an executor is lost, its partitions can be recomputed; a reliable checkpoint serves a different purpose.',7,[['memory / disk','4 / 2']],'Cache is a set of stored partitions. Check completeness and choose a storage level that fits.']
 ]);
 register(1,[recipe,storage],window.COURSE.chapters[1].explain);
})();
