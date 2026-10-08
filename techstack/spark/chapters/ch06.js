(function(){
 const {text,rect,line,path,dot,move,show,stage,scenario,register}=SparkScene;
 const skew=scenario('hot-key-join','Skew join · split the mountain','A hot partition dominates the histogram. AQE cuts its shuffle ranges into join tasks and supplies matching opposite-side input.',[
  'spark.conf.set("spark.sql.adaptive.enabled", "true")','spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")','joined = orders.join(cities, "city_id")','# After a shuffle, AQE inspects per-partition runtime sizes.','# Eligible skewed join partitions can be split by map-output ranges.','# Matching input from the other join side may be read by multiple tasks.'
 ],stage('AQE · skewed join input','Illustrative: 4-way split; eligibility and actual splits depend on runtime data.',k=>{
  text(k,26,88,'SHUFFLE PARTITION BYTES','xs b');line(k,30,257,611,257);
  const cold=[0,1,2].map(i=>{const g=SparkScene.group(k);rect(k,0,-38,65,38,'--acc',g);move(g,43+i*99,257);text(k,75+i*99,278,'cold '+i,'xs','middle');return g;});
  const hot=SparkScene.group(k);rect(k,0,-144,106,144,'--bad',hot);text(k,53,-100,'unknown','xs b','middle',hot);text(k,53,-78,'780 GB','xs','middle',hot);move(hot,430,257);
  const threshold=line(k,30,209,611,209,'--warn');threshold.style.strokeDasharray='4 4';text(k,30,202,'median-based + absolute thresholds','xs');
  const pieces=[0,1,2,3].map(i=>k.chip(null,{x:305+i*76,y:143,w:70,h:60,label:'piece '+i,sub:'≈195 GB',small:true,tone:'ok',show:false}));
  const copies=[0,1,2,3].map(i=>k.chip(null,{x:305+i*76,y:226,w:70,h:25,label:'side B',small:true,tone:'cursor',show:false}));
  const marker=dot(k,'--warn');const note=text(k,26,328,'','xs b');return {hot,pieces,copies,marker,note};
 },(s,k,r)=>{const p=s.p;move(r.hot,430,257,p<5);r.pieces.forEach((c,i)=>c.set({show:p>=5,x:p===5?430:305+i*76,tone:p>=7?'ok':'cursor'}));r.copies.forEach(c=>c.set({show:p>=6}));move(r.marker,p<4?483:320,95,p>=3);r.note.set(p<3?'One key destination can carry far more data than its neighbours':p<5?'AQE tests the actual partition against both skew thresholds':p>=6?'Each split gets the matching opposite-side join input':'Split by available shuffle ranges, not by changing the key');
 }),[
  ['hash destination','All rows of a hot key target one shuffle partition','The histogram is illustrative. Increasing the reducer count can distribute other keys but does not ordinarily divide one key across reducers.',2,[['hot input','780 GB']]],
  ['long tail','Small partitions finish while the hot partition keeps running','Compare maximum with median task input and duration. A long tail caused by data size differs from a slow machine processing normal-sized input.',2,[['bottleneck','largest partition','warn']]],
  ['more reducers','Adding partitions alone does not split this hot key','The same equality key still maps to one destination in a normal hash shuffle. The hot bar remains tall even if more cold destinations are available.',2,[['hot destinations','1']]],
  ['runtime stats','AQE receives measured bytes after map outputs materialize','The adaptive plan can use actual shuffle sizes rather than only estimates. A planned query before execution has not yet observed these bytes.',0,[['statistics','runtime']]],
  ['qualify skew','Both relative and absolute thresholds determine eligibility','A partition must exceed a median-based factor and the byte threshold. Enablement alone does not guarantee a rewrite for every join or partition.',1,[['checks','factor + bytes']]],
  ['split ranges','The hot join partition is divided into input pieces','The drawing divides available map-output ranges into four tasks. Real granularity depends on shuffle blocks; AQE cannot arbitrarily slice every record in a single giant block.',4,[['join pieces shown','4']]],
  ['match both sides','Each join piece gets the corresponding opposite-side input','Some input from the other join side can be repeated across split tasks. This is the extra I/O cost that buys parallelism for the hot partition.',5,[['other side','reused / replicated']]],
  ['finish pieces','The tail becomes the slowest piece instead of the whole mountain','The scene is about eligible skew joins. An aggregation has different semantics and cannot use this same rewrite merely because AQE is on.',5,[['remaining work','parallel join pieces','ok']],'AQE can split eligible skewed join input ranges. It preserves matches by supplying the other side to each piece.']
 ]);
 const salt=scenario('skewed-groupby','Aggregation · salt and reunite','Hot-key beads spread into salted groups, become partial sums, and reunite under the original city key.',[
  'from pyspark.sql import functions as F','salted = orders.withColumn("salt", (F.rand()*4).cast("int"))','partial = salted.groupBy("city_id", "salt").agg(F.sum("amount").alias("part"))','totals = partial.groupBy("city_id").agg(F.sum("part"))','# Four salt buckets are illustrative, not a universal tuning value.','# Two-phase aggregation is valid for this decomposable sum.'
 ],stage('salting · partials and totals','Illustrative: 24 equal contributions; exact bucket balance is not guaranteed.',k=>{
  text(k,26,88,'ONE HOT KEY: unknown','xs b');
  const beads=Array.from({length:24},(_,i)=>dot(k,['--acc','--ok','--acc2','--warn'][i%4],4));
  const buckets=[0,1,2,3].map(i=>{rect(k,26+i*149,204,137,54,['--acc','--ok','--acc2','--warn'][i]);return k.chip(null,{x:32+i*149,y:271,w:125,h:25,label:'salt '+i+' → 6',small:true,show:false,tone:'ok'});});
  [0,1,2,3].forEach(i=>{text(k,94+i*149,199,'unknown:'+i,'xs b','middle');path(k,`M${94+i*149} 298 L320 321`);});
  const final=k.chip(null,{x:241,y:307,w:158,h:30,label:'unknown → 24',small:true,tone:'ok',show:false});
  const plain=k.chip(null,{x:247,y:121,w:146,h:27,label:'key = unknown',small:true,tone:'warn'});return {beads,buckets,final,plain};
 },(s,k,r)=>{const p=s.p;
  r.beads.forEach((d,i)=>{let b=i%4,j=Math.floor(i/4);move(d,p>=3?52+b*149+j%3*28:230+i%8*23,p>=3?222+Math.floor(j/3)*20:164+Math.floor(i/8)*15,p<5);});
  r.plain.set({label:p>=2?'key = (city, salt)':'key = city',tone:p>=2?'cursor':'warn'});
  r.buckets.forEach((c,i)=>c.set({show:p>=5,x:p>=6?257:32+i*149,y:p>=6?275:271,label:p>=6?'partial '+i+' = 6':'salt '+i+' → 6'}));
  r.buckets.forEach(c=>c.set({show:p===5}));r.final.set({show:p>=6,label:p>=7?'city = unknown · 24':'sum partials = 24'});
 }),[
  ['hot group','A large aggregation group still has one logical key','AQE skew-join splitting does not automatically split this groupBy. SQL partial aggregation may already reduce traffic; inspect the actual operator and state before adding salt.',0,[['original key','unknown']]],
  ['limits','More normal hash partitions still preserve that key destination','The hot key is indivisible under the original grouping expression. Salting is a semantic rewrite of the grouping key, not just a configuration knob.',0,[['hot key groups','1']]],
  ['extend key','Add a salt component to distribute partial aggregation work','The example uses four salts. Random assignment can be uneven; a stable bucket function is another option when its distribution suits the data.',1,[['temporary key','(city, salt)']]],
  ['route buckets','Rows of one city can now reach several salted groups','The beads spread among four temporary keys. This additional grouping can distribute the aggregation workload across tasks.',2,[['groups shown','4']]],
  ['local work','Each salted group aggregates its assigned contributions','Each shown contribution is one, so this balanced toy grouping has six per bucket. That exact balance is not guaranteed for real random salts.',2,[['toy sum per salt','6']]],
  ['partial sums','Large groups become a small set of partial results','For sums, adding partial sums preserves the answer. Averages need both sum and count; non-decomposable functions require a different design.',2,[['partials','4']]],
  ['remove salt','A second aggregation combines partials by the original key','The second exchange groups the four partials under unknown again. It processes compact partial state instead of the original large row group.',3,[['combined sum','24','ok']]],
  ['same answer','The final key and result match the unsalted aggregate','Salting adds work and another grouping stage. Use it when the measured bottleneck justifies the rewrite, and test totals including null and edge cases.',5,[['final city keys','1']],'Salt divides temporary work. A valid second aggregation removes the salt and restores the original answer.']
 ]);
 register(6,[skew,salt],window.COURSE.chapters[6].explain);
})();
