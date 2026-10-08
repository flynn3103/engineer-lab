(function(){
 const {text,rect,line,path,dot,move,show,stage,scenario,register}=SparkScene;
 const pull=scenario('tolist-heap','Iterators · pull one row','One row travels through iterator wrappers. Then a materialization scoop fills the heap and a bounded batch keeps it controlled.',[
  '# Scala: one task processes an iterator for its partition','rdd.mapPartitions(iter => iter.map(lookup))','# Pull next output → ask the parent iterator for the next row','rdd.mapPartitions(iter => iter.toList.map(lookup).iterator)','# toList consumes the entire partition before yielding output','rdd.mapPartitions(iter => iter.grouped(100).flatMap(lookupBatch))','# A bounded batch can still expand: measure object and output sizes.'
 ],stage('narrow task · iterator pull','Illustrative records. Lookup and lookupBatch are application functions.',k=>{
  text(k,26,88,'ONE PARTITION · ITERATOR CHAIN','xs b');
  const ops=['input.next','parse','filter','enrich','output.next'].map((l,i)=>k.chip(null,{x:26+i*118,y:119,w:112,h:29,label:l,small:true}));
  [0,1,2,3].forEach(i=>path(k,`M${138+i*118} 133 H${144+i*118}`));
  const row=k.chip(null,{x:33,y:168,w:96,h:27,label:'one row',small:true,tone:'cursor'});
  text(k,26,230,'HEAP · OBJECTS RETAINED','xs b');rect(k,26,243,349,65,'--warn');
  const held=Array.from({length:12},(_,i)=>k.chip(null,{x:36+i%6*55,y:249+Math.floor(i/6)*25,w:45,h:21,label:String(i+1),small:true,show:false,tone:'warn'}));
  const sink=k.chip(null,{x:440,y:253,w:171,h:33,label:'downstream output',small:true,tone:'ok'});
  const note=text(k,26,334,'','xs b');return {ops,row,held,sink,note};
 },(s,k,r)=>{const p=s.p;
  r.row.set({x:[33,505,151,388,505,33,33,505][p],y:p===5?252:168,show:p!==5,label:p===7?'bounded batch':'one row'});
  r.held.forEach((c,i)=>c.set({show:p===5||p===6&&i<3,tone:p===5?'bad':'warn',x:p===7?447+i%3*50:36+i%6*55,y:p===7?285:249+Math.floor(i/6)*25}));
  r.note.set(p===5?'toList consumes and retains the whole partition before output':p===6?'Bounded grouped(n) limits rows retained per batch':p===7?'Keep setup and buffers bounded; streaming is not zero memory':'next() pulls one record through all required wrappers');
 }),[
  ['iterator wrappers','Narrow transformations compose iterator wrappers','The chain describes one task, not one full collection per operator. Each wrapper computes only when the downstream consumer asks for a value.',0,[['materialized tables','0']]],
  ['pull demand','The final iterator asks its parent for the next output','The request propagates backwards. A filter may consume several input rows before it produces one accepted output row.',2,[['demand','next()']]],
  ['read one','An input row is parsed on demand','The row is advanced through the chain. Temporary objects, parser buffers and application state still consume memory.',1,[['row in flight','1']]],
  ['filter and enrich','Accepted rows continue through the remaining wrappers','Rejected rows do not need enrichment in this ordering. Changing the operator order can change how much application code executes.',1,[['full partition list','not required','ok']]],
  ['yield','The consumer receives the row, then asks again','A narrow chain can process a large partition without retaining all its rows. This does not guarantee low memory if each row expands or the function keeps state.',1,[['buffering','bounded by code']]],
  ['materialization','toList breaks the pull chain by retaining all input rows','The shelf fills before output begins. Deserialized object size can exceed input bytes, and concurrent tasks multiply the demand on executor memory.',3,[['retained rows','whole partition','warn']]],
  ['bounded batch','grouped(n) retains a bounded number of rows at a time','A batch can amortize external calls without building the entire partition list. Choose the bound from measured object sizes and downstream expansion.',5,[['batch bound','100 rows']]],
  ['fused execution','Keep iterator buffers bounded; SQL may fuse operators','RDD wrappers and SQL whole-stage code generation are related streaming ideas, not the same implementation. Python functions or unsupported operators can introduce execution boundaries.',6,[['goal','bounded live state']],'A task pulls rows through a chain. Memory grows where your code retains or expands them.']
 ]);
 const connection=scenario('connect-per-row','Resources · partition lifetime','Connections orbit individual rows, then one connection serves an entire partition. Follow acquisition, reuse and reliable cleanup.',[
  '# Scala sketch: resource acquisition belongs to the task lifetime','rdd.mapPartitions { iter =>','  val conn = openConnection()','  TaskContext.get().addTaskCompletionListener[Unit](_ => conn.close())','  iter.map(order => lookupWith(conn, order))','}','# Helpers are application-defined. Make cleanup idempotent.','# Retried tasks may repeat external reads or writes.'
 ],stage('resources · task lifetime','Illustrative: 3 rows; resource cleanup must also handle task failure.',k=>{
  text(k,26,88,'ROW-BY-ROW ACQUISITION','xs b');
  const requests=[0,1,2].map(i=>k.chip(null,{x:26+i*199,y:111,w:183,h:28,label:'row '+i+' · open → close',small:true,tone:'warn'}));
  text(k,26,188,'ONE TASK · ONE PARTITION RESOURCE','xs b');
  const resource=SparkScene.group(k);k.el('circle',{cx:0,cy:0,r:40,fill:'none',stroke:'currentColor','stroke-width':2},resource);text(k,0,3,'conn','sm b','middle',resource);
  move(resource,85,253);line(k,126,253,280,253);path(k,'M466 253 H607');
  const fn=k.chip(null,{x:282,y:234,w:184,h:38,label:'lookupWith(conn, row)',small:true});
  const row=k.chip(null,{x:147,y:214,w:108,h:25,label:'row 0',small:true,tone:'cursor'});
  const event=k.chip(null,{x:144,y:298,w:462,h:28,label:'Task completion listener owns cleanup',small:true,tone:'ok'});
  const opens=text(k,26,167,'','xs b');return {requests,resource,fn,row,event,opens};
 },(s,k,r)=>{const p=s.p;
  r.requests.forEach((c,i)=>c.set({tone:p>=3?'mut':i<=p?'warn':'info'}));
  move(r.resource,85,253,p>=3&&p<7);r.row.set({x:[147,147,147,147,295,489,295,489][p],label:p>=6?'row 2':p>=5?'row 1':'row 0',show:p>=3});r.fn.set({tone:p>=4?'ok':'info'});r.event.set({tone:p>=7?'ok':'info',label:p>=7?'Task finishes or fails → close the resource':'Register cleanup before returning the lazy iterator'});
  r.opens.set(p<3?'Per-row code repeats setup for every row':'Setup runs once for this partition attempt');
 }),[
  ['per-row setup','A connection inside map is opened once for every row','Acquisition and release are part of the row path. High connection churn can dominate otherwise cheap lookups.',0,[['shown rows','3']]],
  ['churn','The next row repeats the same setup work','One Spark task can process many rows, so connection counts can far exceed executor or task counts.',0,[['opens so far','2']]],
  ['service pressure','Concurrent tasks can amplify the connection storm','The external service sees the aggregate of every active task. Rate limits, latency and maximum connections can constrain throughput even when executor CPU is idle.',0,[['opens for 3 rows','3','warn']]],
  ['acquire once','mapPartitions acquires one resource for its iterator','The scope is a partition attempt, not one permanent connection for the whole cluster. Each concurrent attempt can hold its own resource.',2,[['opens for this attempt','1']]],
  ['register cleanup','Register cleanup before returning a lazy iterator','A plain finally around iter.map would run before the returned iterator is consumed. A task-completion listener can handle success, cancellation and failure.',3,[['cleanup','task completion']]],
  ['reuse','Rows can reuse the connection while the iterator is consumed','The function still performs a lookup per row. Batching or local reference data can reduce round trips, subject to semantics and capacity.',4,[['shown lookups','2']]],
  ['retry semantics','Another attempt can acquire another connection and repeat work','Spark does not make arbitrary database writes exactly once. Design idempotent side effects and bounded per-task resource use.',7,[['resource scope','task attempt']]],
  ['close','Completion cleanup closes the resource even on failure','Make cleanup idempotent and avoid throwing new errors while closing. Check both Spark task concurrency and the external system limit.',3,[['connection','closed','ok']],'Acquire per partition attempt, reuse while consuming, and tie cleanup to task completion.']
 ]);
 register(4,[pull,connection],window.COURSE.chapters[4].explain);
})();
