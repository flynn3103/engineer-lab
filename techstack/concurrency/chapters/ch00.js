/* Physical memory locality and serialized remote round trips.
   Cache line is 64 bytes in this illustrative model, with eight 8-byte values. */
(function(){
const S=window.CScene;
const label=(k,x,y,t,cls='sm',anchor='start')=>S.text(k,x,y,t,cls,anchor);
const scatter=[5,1,7,2,6,0,4,3];
const lineXY=i=>({x:24+Math.floor(i/4)*190,y:100+(i%4)*49});
const objects=S.scenario('objects','Cache-line journey','Follow eight values through eight scattered lines, then repack them into one line. Transfer counts and timings are illustrative.',[
'// Pseudocode: values stored through scattered object references',
'for (object in objects) sum += object.value;',
'// One 64-byte line moves for every distinct cold line touched',
'// Pack hot 8-byte values into contiguous storage',
'for (value in packed_values) sum += value;',
'// In this aligned model: one cold miss, then seven hits'
],S.stage('Locality · hardware moves whole lines','64-byte lines; eight 8-byte values. Cold aligned model, illustrative.',k=>{
 label(k,24,80,'RAM · eight lines', 'b sm');label(k,416,80,'Core cache and arithmetic','b sm');
 const lines=Array.from({length:8},(_,i)=>{const p=lineXY(i);label(k,p.x,p.y-5,'line '+i,'xs mut');const r=S.rect(k,p.x,p.y,174,36,'--line');for(let j=0;j<8;j++)S.rect(k,p.x+5+j*20,p.y+7,18,22,'--line');return r;});
 const values=Array.from({length:8},(_,i)=>{const p=lineXY(scatter[i]);return k.chip(null,{x:p.x+5,y:p.y+7,w:18,h:22,label:String(i+1),small:true,tone:'info'});});
 S.rect(k,416,99,200,70,'--acc');label(k,428,118,'L1 · current line','b sm');
 const cache=Array.from({length:8},(_,i)=>k.chip(null,{x:427+21*i,y:132,w:18,h:22,label:'',small:true,tone:'ok',show:false}));
 S.path(k,'M398 111 V275','--mut');S.line(k,398,135,416,135,'--acc');S.path(k,'M516 173 V212 M512 205 L516 212 L520 205','--acc');
 S.rect(k,416,218,200,70,'--acc2');label(k,428,237,'CPU accumulator','b sm');
 const total=label(k,516,267,'sum = 0','b','middle'),count=label(k,24,314,'','sm'),useful=label(k,24,337,'','sm');
 const packet=S.dot(k,'--acc2',6);
 return {lines,values,cache,total,count,useful,packet};
},(s,k,R)=>{
 const p=s.p,packed=p>=5,read=packed?(p>=6?8:0):(p===0?0:p<4?p:8),fetches=packed?(p>=6?1:0):read;
 R.values.forEach((v,i)=>{const at=packed?lineXY(0):lineXY(scatter[i]);v.set({x:at.x+5+(packed?i*20:0),y:at.y+7,tone:packed?'ok':'info'});});
 R.lines.forEach((r,i)=>{r.style.opacity=packed&&i>0?.2:1;});
 R.cache.forEach((v,i)=>v.set({show:packed?p>=6:i===0&&read>0,label:packed?String(i+1):String(read),tone:'ok'}));
 const sum=packed?(p===6?10:p===7?36:0):read*(read+1)/2;
 R.total.set('sum = '+sum);R.count.set('Lines fetched: '+fetches+' · bytes transferred: '+fetches*64);
 R.useful.set(packed?'One fill supplies all eight values; later accesses reuse it.':'Only 8 useful bytes in each 64-byte transfer.');
 if(read){const at=lineXY(packed?0:scatter[Math.min(read-1,7)]);S.move(R.packet,p===4||p>=6?516:at.x+87,p===4||p>=6?192:at.y+18);}else S.move(R.packet,398,135,false);
}),[
['cold RAM','Eight values occupy eight unrelated cache lines','Each numbered value is eight bytes. The surrounding slots show the rest of its 64-byte line. All eight lines begin cold; the spatial arrangement is deliberately scattered.',0,[['values',8],['cold lines',8],['sum',0]]],
['first miss','The first access brings an entire line','The core follows the first object reference. It needs eight bytes but the cache fetches the whole line. Arithmetic waits for the dependency to become available.',1,[['misses',1],['bytes',64],['useful bytes',8]]],
['next miss','Another pointer, another cold line','The second value lives elsewhere. Its reference does not reuse the first fetched line, so another line transfer is required. The diagram is a cold-cache model, not a measured processor trace.',1,[['misses',2],['bytes',128],['sum',3]]],
['scattered access','Scattered addresses reduce neighbour reuse','A third reference selects another cold line. These independent array references need not form a pointer chain: a linked next pointer would add an address dependency. This scene isolates low neighbour reuse; real allocation and prefetching can change the result.',2,[['misses',3],['bytes',192],['sum',6]],null,true],
['eight misses','Eight values have caused eight line transfers','Complete the remaining accesses. The sum is correct at 36, but eight line fills moved 512 bytes for 64 bytes of useful values. Timing and actual hit rates must be measured in a real program.',2,[['misses',8],['bytes',512],['sum',36]]],
['repack','The values move together into one aligned line','Pack only the hot values into contiguous eight-byte storage. All eight fit in one aligned 64-byte line in this model. A container holding object pointers is not automatically this packed representation.',3,[['packed lines',1],['sum reset',0],['bytes per value',8]]],
['one line fill','One cold miss loads neighbours for future accesses','The first access fetches all eight values. The next three accesses hit that resident line and bring the accumulator to 10. Registers and cache reuse, rather than a new RAM trip, serve those reads.',4,[['misses',1],['hits so far',3],['sum',10]]],
['reuse','The next four reads reuse the same resident line','All eight accesses finish at sum 36. In this simplified model there is one miss and seven hits. Real alignment, working-set size, prefetching and cache conflicts influence the observed improvement.',5,[['misses',1],['hits',7],['sum',36]],'Layout changes how much useful work one memory transfer can serve. Measure locality before adding workers.']
],'Pseudocode · memory layout');
const n1=S.scenario('n1','Round-trip tax','Five drawn calls stand for 1,000 repeated lookups. Then one batch request carries the same IDs. Timelines are compressed separately; latency is illustrative.',[
'orders = db.query("SELECT * FROM orders")',
'for order in orders:',
'    db.query("SELECT * FROM customers WHERE id = ?", order.customer_id)',
'# 1,000 sequential lookups × 0.5ms RTT ≈ 500ms of RTT alone',
'SELECT * FROM customers WHERE id IN (...)  -- batch required IDs',
'# One batch RTT; server work and payload size still matter'
],S.stage('Remote calls · waiting accumulates','Five calls stand for 1,000. Separate timeline scales; illustrative.',k=>{
 label(k,24,82,'Repeated queries · one completes before the next','b sm');
 label(k,24,113,'app','xs');label(k,24,181,'DB','xs');
 S.line(k,68,109,614,109);S.line(k,68,177,614,177);
 const paths=Array.from({length:5},(_,i)=>{let x=77+i*102;return S.path(k,`M${x} 109 L${x+28} 177 L${x+76} 109`,'--line');});
 const head=S.dot(k,'--acc2',6),receipt=label(k,600,201,'','sm','end');
 label(k,24,237,'Batched query · IDs travel together','b sm');
 S.line(k,68,259,614,259);S.line(k,68,321,614,321);label(k,24,263,'app','xs');label(k,24,325,'DB','xs');
 const batchPath=S.path(k,'M82 259 L290 321 L568 259','--line');
 const bundle=k.chip(null,{x:78,y:245,w:124,h:30,label:'IDs 1…1000',small:true,tone:'info',show:false});
 const batchLabel=label(k,614,343,'','xs','end');return {paths,head,receipt,batchPath,bundle,batchLabel};
},(s,k,R)=>{
 const p=s.p,completed=p===0?0:p<4?p:p===4?1000:1000;
 R.paths.forEach((r,i)=>{r.style.stroke=i<(p>=4?5:p)?'var(--warn)':'var(--line)';});
 const i=Math.min(Math.max(p-1,0),4);S.move(R.head,77+i*102+76,109,p>0&&p<=4);
 R.receipt.set(completed+' lookup RTTs · '+(completed*.5)+' ms RTT alone');
 R.batchPath.style.stroke=p>=6?'var(--ok)':'var(--line)';
 R.bundle.set({show:p>=5,x:p===5?78:p===6?228:506,y:p===6?307:245,label:p>=7?'1,000 results':'IDs 1…1000',tone:p>=7?'ok':'info'});
 R.batchLabel.set(p>=7?'1 batch RTT + query work + payload':p===6?'server processes the batch':p===5?'one packet carries many IDs':'');
}),[
['local-looking call','A database method hides a remote round trip','The initial orders query returns rows. Each later customer lookup looks like a small function call, but crosses a network boundary. Count those lookups separately from the initial query.',0,[['orders',1000],['customer lookups',0],['model RTT','0.5 ms']]],
['lookup one','The loop waits for the first customer','A synchronous lookup sends an ID and waits for the reply before the loop advances. During that latency the application thread is not doing arithmetic on the next record.',2,[['lookups',1],['RTT cost','0.5 ms'],['in flight',1]]],
['lookup two','The second lookup pays another round-trip tax','The previous reply does not remove the latency of a new query. Even a fast indexed lookup pays protocol and network costs when sent separately.',2,[['lookups',2],['RTT cost','1 ms'],['in flight',1]]],
['repeat','Serial waits accumulate even with low CPU usage','The third reply unlocks the next iteration. Five drawn paths represent the shape of a much longer loop; they do not imply five actual lookups for this 1,000-row request.',2,[['lookups',3],['RTT cost','1.5 ms'],['CPU while waiting','mostly idle']],null,true],
['thousand calls','1,000 lookups add about 500ms of RTT alone','Finish the repeated calls. At the illustrative 0.5ms RTT, the repeated-lookup latency alone is about 500ms. Server execution, serialization and the initial query add further work.',3,[['lookups',1000],['RTT cost','500 ms'],['pattern','N+1']]],
['batch IDs','One request carries the required customer IDs','Collect distinct required IDs and send one bounded batch, or express the relation as a suitable join. The moving packet now carries the lookup set rather than a single ID.',4,[['batch requests',1],['IDs','up to 1,000'],['round trips','one lookup batch']]],
['server work','The server still has to process the batch','Batching removes repeated network waits; it does not make query work free. Indexes, parameter limits and the result size still matter. For very large sets, use bounded chunks.',4,[['lookup RTTs',1],['execution','depends on plan'],['payload','larger']]],
['return together','Many results return on one protocol exchange','The batch reply carries the customer rows. Preserve the original mapping from IDs to orders, handle missing rows and duplicates, and measure the complete request before declaring a speedup.',5,[['lookup RTTs',1],['records','1,000 modeled'],['work','still required']],'Batch remote work to reduce serial round trips. One request still has execution and payload costs.']
],'SQL / application pseudocode');
S.register(0,[objects,n1],`
<h3>1. Start from where the time goes</h3>
<p>The original records-service refactor changed the data representation, not the arithmetic. Its large illustrative slowdown is a prompt to investigate memory access. A CPU can be busy while making little useful progress: a dependent memory load, cache misses, page faults or branch behaviour can dominate a loop. The first scene separates <em>values computed</em> from <em>bytes transferred</em>; the second moves the same question across a network boundary.</p>
<h3>2. Cache lines bring neighbours</h3>
<p>Processors keep recently used data in a hierarchy of registers and caches before accessing main memory. The cache moves fixed-size lines rather than one language object at a time. This chapter models 64-byte lines, common on the architectures in the original notes, and eight aligned eight-byte values. One fill can supply eight useful values when those values share a line; eight unrelated cold lines can require eight fills for the same sum. The diagram deliberately shrinks RAM and omits associativity, cache eviction and multiple outstanding misses.</p>
<p>Spatial locality means nearby addresses are useful together. Temporal locality means recently touched data is useful again. Sequential traversal gives prefetching a more predictable address pattern; a chain of pointers can make the next address depend on the current load. These are mechanisms to measure, not a guarantee that every object list is slow or every array is fast. The <a href="https://www.intel.com/content/www/us/en/docs/ipp/developer-guide-reference/2026-0/cache-optimizations.html" target="_blank" rel="noopener">Intel cache-locality guide</a> describes grouping work around nearby data.</p>
<figure class="mm" style="--diagram-width:540px"><img src="diagrams/ch00-locality.svg" alt="Flowchart: the next address can hit a resident cache line or require a whole-line fill, after which nearby values can reuse it"><figcaption>The unit of transfer determines whether one miss helps the next access.</figcaption></figure>
<h3>3. A source-level array is not enough evidence</h3>
<p>An array of object references can be contiguous while the referenced values are not. A Python list of integers is not the packed numeric buffer pictured here. A typed numeric array, a primitive representation or a structure of arrays can improve locality for selected hot fields. Alignment also matters: an otherwise contiguous range crossing a line boundary needs more than one fill. Keep the business model clear, change only the hot representation when justified, and include conversion costs in the benchmark.</p>
<h3>4. The next bottleneck can be another core</h3>
<p>The original chapter also introduces false sharing. Two threads may update different counters but still share the same cache line. Coherence then transfers or invalidates ownership at line granularity, so logically independent updates compete. Keeping hot per-worker data separate, then combining results, can reduce that traffic. Padding is architecture- and runtime-dependent; it is not a universal constant to sprinkle everywhere. These memory-layout costs remain relevant after adding the threads in the next chapter.</p>
<h3>5. Network locality: the N+1 shape</h3>
<p>The lookup scene starts with an orders query and performs N additional customer queries. For serial calls, each round trip contributes latency even if the database has an index and the application CPU is idle. With 1,000 modeled lookups at a 0.5ms round trip, the RTT component alone is about 500ms. The original batch example has a different total execution cost; do not compare a network-only lower bound to a measured end-to-end duration as if they were interchangeable.</p>
<p>A join or a bounded query over the required distinct IDs reduces protocol exchanges. It may increase response size, need a different plan or encounter parameter limits. Preserve cardinality, handle missing customers and avoid accidentally multiplying order rows with a one-to-many join. Chunk a large request when needed. Async calls can overlap waits, but unrestricted concurrency can overload the downstream; the asynchronous chapter explores that trade-off.</p>
<h3>6. Measure the actual dependency</h3>
<pre># Linux examples; available events and permissions vary.
perf stat -e cycles,instructions,cache-misses ./records-benchmark
perf c2c record -- ./counter-benchmark

# Application-level observation:
# count database queries per request and record complete latency</pre>
<p>Use a profiler, representative working-set sizes and warm/cold runs. A higher miss count can coexist with a faster program if it does more useful work, so compare time, instructions and throughput together. Distinguish waiting for memory, waiting for remote replies and doing computation. This chapter's diagnosis entries retain the source's cache, false-sharing, memory-pressure and remote-call cases; each asks which resource limits useful progress before adding more workers.</p>`);
})();
