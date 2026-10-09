/* Worker scheduling, a GIL ownership baton and Amdahl's shrinking ribbon.
   Counts are illustrative; the GIL scene models GIL-enabled CPython bytecode. */
(function(){
const S=window.CScene,T=(k,x,y,t,c='sm',a='start',parent=k.layer)=>S.text(k,x,y,t,c,a,parent);
const pool=S.scenario('pool','Workers versus cores','Watch runnable workers take turns on eight CPU lanes. Then bound CPU workers and queue the excess work.',[
'// Model: 8 effective CPU cores, 2,000 CPU-bound workers',
'while (runnable_workers > available_cores) schedule_next();',
'// Every switch can cost scheduling and cache reuse',
'// Bound CPU workers; queue work instead of more runnable threads',
'workers = measured_cpu_worker_budget;',
'// Measure throughput and tail latency under realistic load'
],S.stage('Scheduling · workers take turns','Eight effective cores; CPU-bound work. Counts and slices illustrative.',k=>{
 T(k,24,82,'Runnable queue','b sm');T(k,182,82,'Eight CPU execution lanes','b sm');
 const queue=S.rect(k,24,101,114,202,'--line');
 const lanes=Array.from({length:8},(_,i)=>{const y=104+i*24;T(k,174,y+13,String(i+1),'xs','end');S.line(k,182,y+9,612,y+9,'--line');return S.rect(k,182,y,430,18,'--line');});
 const tokens=Array.from({length:8},(_,i)=>k.chip(null,{x:38+(i%2)*47,y:116+Math.floor(i/2)*43,w:40,h:18,label:'W'+(i+1),small:true,tone:'info'}));
 const switches=Array.from({length:8},(_,i)=>S.rect(k,320,104+i*24,13,18,'--warn'));
 const count=T(k,24,325,'','sm'),state=T(k,182,301,'','sm');return {queue,lanes,tokens,switches,count,state};
},(s,k,R)=>{
 const p=s.p,active=p>0,limited=p>=5;
 R.tokens.forEach((t,i)=>{const lane=p===2?(i+4)%8:p===3?(i+1)%8:i;const x=p===1?204:p===2?346:p===3?510:p===4?204:p>=5?220+(p-5)*122:38+(i%2)*47;const y=active?104+lane*24:116+Math.floor(i/2)*43;t.set({x,y,tone:limited?'ok':'info'});});
 R.switches.forEach(r=>S.show(r,p>=2&&p<=4));R.queue.style.opacity=limited?.25:1;
 R.count.set(limited?'8 CPU workers; pending work waits in a bounded queue.':'2,000 runnable workers; at most 8 execute at this instant.');
 R.state.set(p===0?'ready, waiting for CPU':limited?'Longer useful slices; measure the result.':p>=2?'Orange slivers: switching overhead':'Only eight workers can execute at once');
}),[
['ready queue','2,000 runnable workers cannot become 2,000 cores','Eight visible tokens stand for a much larger runnable queue. This model has eight effective CPU cores and CPU-bound work; sleeping threads are not being counted as runnable.',0,[['workers',2000],['effective cores',8],['executing',0]]],
['first slice','Eight workers enter eight CPU lanes','The scheduler gives eight workers execution time. The other 1,992 workers remain runnable but waiting. More worker objects have not created more physical execution capacity.',1,[['executing',8],['waiting',1992],['cores',8]]],
['rotate','The next workers replace the current occupants','The drawn workers change lanes to represent scheduling turns, not fixed affinity. Each switch may incur scheduler overhead and reduce cache reuse. The orange marks separate useful work slices.',1,[['executing',8],['switches','more'],['cache reuse','at risk']],null,true],
['rotate again','Useful work competes with more scheduling turns','Another set of turns advances the work. Oversubscription can make tail latency worse while context switches rise. Verify with runnable-queue and CPU observations rather than inferring this from thread count alone.',2,[['workers',2000],['execution capacity',8],['overhead','illustrative']]],
['measure first','Confirm CPU saturation before choosing a limit','Measure task duration, throughput, effective CPU quota and queue time. Blocking I/O work needs a different budget; the number eight is this scene\'s model, not a universal thread-pool recommendation.',2,[['budget','measured'],['workload','CPU-bound'],['quota','check it']]],
['bound workers','Keep eight CPU workers; queue excess work','The model switches to a bounded worker set. Pending jobs remain data in a work queue rather than each needing another runnable thread. Queue capacity and admission policy must also be bounded.',3,[['CPU workers',8],['job queue','bounded'],['switch pressure','lower']]],
['useful slices','Workers advance while retaining useful context','A longer useful slice can preserve hot data and reduce scheduling cost. Fairness, load imbalance and operating-system scheduling still matter. Verify the chosen limit under representative arrivals.',4,[['workers',8],['progress','useful work'],['latency','measure p99']]],
['steady progress','A worker budget matches the resource it consumes','All eight tokens progress through their lanes. The next chapter separates waiting on I/O from CPU execution, where a large number of suspended tasks may be appropriate if admission remains controlled.',5,[['executing','up to 8'],['queue','bounded'],['result','measure throughput']],'Match CPU workers to measured execution capacity; bound waiting work as well as active workers.']
],'Scheduling pseudocode');
const gil=S.scenario('gil','One GIL baton','One key permits Python bytecode in a shared process. Separate processes have separate interpreters and heaps.',[
'# GIL-enabled CPython; pure Python CPU work in this model',
'def cpu_job(n): return sum(i * i for i in range(n))',
'# Threads share one interpreter and its GIL',
'with ThreadPoolExecutor(4) as pool: pool.map(cpu_job, jobs)',
'# Processes have separate interpreters and heaps',
'with ProcessPoolExecutor(4) as pool: pool.map(cpu_job, jobs)',
'# Include startup, IPC, serialization and result merging costs'
],S.stage('CPython · ownership is not core capacity','GIL-enabled CPython, pure Python bytecode. Not native or free-threaded code.',k=>{
 const shared=S.rect(k,24,105,592,198,'--acc');
 const silos=Array.from({length:4},(_,i)=>S.rect(k,24+i*150,105,142,198,'--ok'));
 const title=T(k,24,82,'One process · shared heap and interpreter','b sm');
 const workers=Array.from({length:4},(_,i)=>k.chip(null,{x:38+i*150,y:174,w:114,h:27,label:'thread '+(i+1),small:true,tone:'info'}));
 const labels=Array.from({length:4},(_,i)=>T(k,95+i*150,126,'','xs','middle'));
 const keys=Array.from({length:4},(_,i)=>{const g=S.group(k);S.rect(k,-16,-9,32,18,'--warn',g);T(k,0,4,'GIL','xs','middle',g);return g;});
 const cores=Array.from({length:4},(_,i)=>{const c=k.el('circle',{cx:95+i*150,cy:269,r:18},k.layer);c.style.fill=S.tint('--line');c.style.stroke='var(--mut)';T(k,95+i*150,273,'CPU','xs','middle');return c;});
 const packets=Array.from({length:4},(_,i)=>k.chip(null,{x:38+i*150,y:315,w:114,h:24,label:'result '+(i+1),small:true,tone:'ok',show:false}));
 return {shared,silos,title,workers,labels,keys,cores,packets};
},(s,k,R)=>{
 const p=s.p,multi=p>=4,current=p%4;
 S.show(R.shared,!multi);R.silos.forEach(r=>S.show(r,multi));R.title.set(multi?'Four processes · four interpreters and heaps':'One process · shared heap and interpreter');
 R.workers.forEach((w,i)=>{const running=multi?p===5: p>0&&i===current;w.set({label:(multi?'process ':'thread ')+(i+1),x:38+i*150,y:running?225:174,tone:running?'ok':'info'});R.labels[i].set(multi?'heap '+(i+1):'shared heap');R.cores[i].style.fill=S.tint(running?'--ok':'--line',running?50:18);S.move(R.keys[i],multi?95+i*150:95+current*150,149,multi||i===0);R.packets[i].set({show:p===6||(p===7&&i===0),x:p===6?38+i*150:263,y:p===6?315:315,label:p===7?'merge results':'result '+(i+1)});});
}),[
['shared interpreter','Four threads share one interpreter and one GIL','All four threads are inside one process. The scene models pure Python bytecode in a GIL-enabled CPython build. Four available cores do not remove the interpreter\'s ownership rule.',0,[['threads',4],['interpreters',1],['GILs',1]]],
['one owner','One thread takes the GIL baton and executes','The key moves to thread 2 in this selected schedule. Only its modeled bytecode runs at this instant. The other threads wait for interpreter access; core placement here is schematic.',2,[['Python executors',1],['cores drawn',4],['GIL owners',1]]],
['handoff','The baton changes hands; execution remains serial','Thread 3 acquires the baton after the prior owner releases it. Handoff gives concurrency and opportunities for progress, but does not make this pure Python computation execute on four cores at once.',3,[['Python executors',1],['waiting threads',3],['handoff','scheduled']],null,true],
['another handoff','Many workers still share the same Python gate','Thread 4 now owns the key. Native extensions can release the GIL, and optional free-threaded CPython builds have different rules. Those cases are deliberately outside this scene.',3,[['Python executors',1],['build','GIL-enabled'],['work','Python bytecode']]],
['separate heaps','Create separate interpreters in four processes','Each process gets a distinct heap and interpreter ownership key. Their inputs must be communicated; shared Python object references do not automatically become shared writable state across these processes.',4,[['processes',4],['interpreters',4],['heaps',4]]],
['parallel work','Four independent interpreters can compute at once','All four modeled CPU jobs advance in parallel if enough CPU capacity is available. Actual speed depends on job size, balance, startup, CPU quota and serialization; it is not guaranteed to be four times faster.',5,[['CPU jobs','up to 4'],['heaps',4],['speedup','measure it']]],
['send results','Results cross the process boundary','Result packets leave their separate workers. IPC and serialization take time and can copy data. A process pool is most useful when the computation saved exceeds these communication costs.',6,[['result packets',4],['IPC cost','nonzero'],['shared pointers','no automatic sharing']]],
['merge','A parent combines independently computed results','The packets join at one merge location. Use importable worker functions and the platform-appropriate main guard when implementing the pool. Keep correctness and result ordering independent of completion order.',6,[['merged output',1],['CPU parallelism','possible'],['end-to-end gain','benchmark']],'Know the runtime gate: GIL-enabled Python threads can overlap I/O; separate interpreters can parallelize CPU work.']
],'Python · illustrative fragments');
const amdahl=S.scenario('amdahl','Amdahl ribbon','The orange serial segment stays fixed while green parallel work shrinks. Then change the algorithm to shrink the serial part.',[
'// Ideal model, normalized T(1) = 100 units',
'serial_fraction = 0.30;',
'T(N) = serial_fraction + (1 - serial_fraction) / N;',
'speedup(N) = 1 / T(N);',
'// Reduce serial work to 3% of the original baseline',
'// This separate model keeps total baseline work normalized to 100',
'// Real coordination, contention and imbalance add time'
],S.stage('Amdahl · the orange floor stays','Ideal normalized work; parallel fraction perfectly divided, overhead omitted.',k=>{
 T(k,24,82,'Orange: serial   Green: divisible parallel work','b sm');
 const rows=[1,2,8,32].map((n,i)=>{const y=108+i*43;T(k,24,y+16,n+' workers','sm');S.rect(k,166,y,432,23,'--line');const serial=S.rect(k,166,y,129.6,23,'--warn'),parallel=S.rect(k,295.6,y,302.4/n,23,'--ok');const value=T(k,608,y+37,'','xs','end');return{n,serial,parallel,value};});
 const marker=S.dot(k,'--acc2',5),formula=T(k,24,310,'','sm'),floor=T(k,24,336,'','sm');return {rows,marker,formula,floor};
},(s,k,R)=>{
 const p=s.p,f=p>=5?.03:.30,chosen=p<=3?p:p===4?3:p===5?0:3;
 R.rows.forEach((r,i)=>{const sw=432*f,pw=432*(1-f)/r.n;const old=Number(r.serial.getAttribute('width'));Kit.tween(r.serial,'w',old,sw,650,v=>r.serial.setAttribute('width',v));const oldx=Number(r.parallel.getAttribute('x'));Kit.tween(r.parallel,'x',oldx,166+sw,650,v=>r.parallel.setAttribute('x',v));Kit.tween(r.parallel,'w',Number(r.parallel.getAttribute('width')),pw,650,v=>r.parallel.setAttribute('width',v));const visible=p>=i||p>=4;r.serial.style.opacity=visible?1:.15;r.parallel.style.opacity=visible?1:.15;r.value.set(visible?(100*(f+(1-f)/r.n)).toFixed(2)+' units · '+(1/(f+(1-f)/r.n)).toFixed(2)+'×':'');});
 S.move(R.marker,152,119+chosen*43);R.formula.set('T(N) = '+f.toFixed(2)+' + '+(1-f).toFixed(2)+' / N');R.floor.set(p>=5?'New ideal ceiling: 33.33×; at 32 workers: 16.58×.':'Serial floor: 30 units; even infinitely many workers give only 3.33×.');
}),[
['baseline','One worker executes all 100 normalized units','Orange represents serial work and green represents work that can be split perfectly. This is an ideal model with a fixed normalized baseline, not a measurement of the production example.',0,[['serial share','30%'],['workers',1],['runtime','100 units']]],
['two workers','Only the green segment divides across workers','Two workers reduce the parallel component from 70 to 35 units. The serial 30 units remain, giving 65 units total and a 1.54-times ideal speedup.',2,[['serial',30],['parallel',35],['speedup','1.54×']]],
['eight workers','Eight workers approach the serial floor','The parallel component shrinks to 8.75 units. Total time is 38.75 units and ideal speedup is about 2.58, far from eight times. Perfect scheduling cannot divide the orange dependency.',3,[['workers',8],['runtime','38.75 units'],['speedup','2.58×']],null,true],
['thirty-two','More workers mostly shrink an already small part','At 32 workers the green part is 2.1875 units. The serial floor dominates, so speedup is about 3.11. Watch how much less the last hardware increase changes the ribbon.',3,[['workers',32],['runtime','32.19 units'],['speedup','3.11×']]],
['ceiling','Infinite workers still leave the orange segment','As the parallel term tends to zero, ideal runtime tends to 30 units and speedup to 1 / 0.30, or about 3.33. Contention and coordination can make the practical limit lower.',3,[['workers','∞ (limit)'],['serial floor',30],['ceiling','3.33×']]],
['change algorithm','Shrink the serial fraction before buying more cores','A second normalized model changes the serial fraction from 30% to 3%. The orange segments visibly contract. This compares workload fractions at the same 100-unit baseline; a real refactor also changes baseline cost.',4,[['serial share','3%'],['baseline',100],['ideal ceiling','33.33×']]],
['new balance','32 workers now help a much larger parallel fraction','For the new 3% serial model, runtime at 32 workers is 6.03125 units and ideal speedup about 16.58. The change in the dependency structure matters more than the worker count alone.',5,[['workers',32],['runtime','6.03 units'],['speedup','16.58×']]],
['real costs','Add coordination and imbalance to any real prediction','The drawn formula omits process startup, communication, lock contention and unequal tasks. Measure the serial path and useful work, then validate the model with throughput and latency under load.',6,[['model','ideal'],['extra costs','not drawn'],['decision','measure first']],'Parallelize divisible work and reduce serial dependencies. More workers cannot erase a fixed serial floor.']
],'Ideal performance model');
S.register(1,[pool,gil,amdahl],`
<h3>1. Distinguish a worker from execution capacity</h3>
<p>A process owns an address space and operating-system resources. Threads within a process share memory but have their own execution state and stacks. Concurrency means several activities can make progress over time; parallelism means several actually execute at the same instant. A program with thousands of threads can be concurrent while only a handful run on the available cores. CPU quota, affinity and competing work can make effective capacity smaller than the machine's advertised core count.</p>
<p>The first scene models 2,000 runnable CPU workers and eight effective cores. Eight execute while the rest wait. The moving tokens represent scheduling turns, not fixed worker-to-core affinity. Context switching, scheduler bookkeeping and disrupted cache locality can consume useful capacity. However, thousands of sleeping I/O threads do not by themselves prove a CPU scheduling storm. Check runnable queues, CPU saturation and switching alongside throughput before choosing a limit.</p>
<h3>2. Bound the resource and its waiting work</h3>
<p>For CPU-bound work, begin with a measured worker budget near the available execution capacity, then account for task granularity, fairness and load balance. For blocking I/O, additional workers may overlap waiting; the downstream connection pool, service capacity and memory budget become relevant. Neither a fixed thread count nor “one worker per core” is a universal answer. A bounded pool also needs a bounded work queue and a clear admission policy; otherwise pending work can grow without bound while active workers look healthy.</p>
<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch01-worker-budget.svg" alt="Flowchart: classify CPU computation or blocking waits, measure effective capacity, bound workers and queued work, then validate throughput and latency"><figcaption>A worker budget follows the resource the work consumes.</figcaption></figure>
<h3>3. Know which interpreter you are running</h3>
<p>The GIL scene specifically models pure Python bytecode in a GIL-enabled CPython build. One thread at a time holds that interpreter's global interpreter lock, so adding Python threads does not make this computation run across four cores simultaneously. Threads can still overlap blocking I/O, and native extensions may release the GIL for their own work. These distinctions matter: a hashing or numeric-library benchmark may measure native code rather than the bytecode gate drawn here.</p>
<p>Optional free-threaded builds introduced in CPython 3.13 have different rules and are outside this scene. Inspect the actual build and dependencies before using the GIL as an explanation. The <a href="https://docs.python.org/3.13/library/threading.html" target="_blank" rel="noopener">Python threading documentation</a> distinguishes CPU-bound bytecode, I/O and free-threaded builds. Removing a global gate does not remove races or make compound operations automatically correct.</p>
<h3>4. Processes trade sharing for communication</h3>
<p>A process pool can run independent interpreters concurrently. Each worker owns a heap; inputs and results cross a process boundary through IPC, serialization or deliberately managed shared memory. The four separate keys in the scene show independent interpreter ownership, not four copies of one shared GIL. Startup, copied data, task distribution and combining results all cost time. Small tasks can become slower when communication dominates. Choose coarse enough independent work and benchmark the complete request.</p>
<p>The code box contains illustrative fragments, not a complete portable script. Worker functions must be importable where required, and process creation belongs behind an appropriate <code>if __name__ == '__main__':</code> guard. See the <a href="https://docs.python.org/3/library/multiprocessing.html" target="_blank" rel="noopener">multiprocessing programming guidelines</a>. Shared files, databases or external side effects still need coordination even when heaps are separate.</p>
<h3>5. Amdahl puts a floor under runtime</h3>
<p>Let <code>s</code> be the fraction that remains serial and <code>N</code> the workers dividing the remaining work perfectly. Relative runtime is <code>s + (1 − s) / N</code> and ideal speedup is its reciprocal. In the first normalized model, 30% serial work gives a maximum speedup of about 3.33, even with infinitely many workers. At eight workers the ideal result is only about 2.58. The shrinking green ribbon makes diminishing returns visible while the orange dependency stays fixed.</p>
<p>The second model changes the serial fraction to 3% while retaining a 100-unit normalized baseline. It raises the ideal ceiling to 33.33 and gives about 16.58 at 32 workers. A real refactor can also change total work; compare actual baseline runtimes rather than treating normalized fractions as measured durations. Coordination, skew, synchronization and contention add cost omitted by this formula.</p>
<h3>6. Choose a change from evidence</h3>
<p>Profile the serial dependency first: a single writer, lock, merge stage or remote call can dominate an otherwise parallel pipeline. Split independent work, shorten the dependency, or batch communication before adding hardware. Measure wall time, CPU use, runnable workers, queue delay and tail latency together. The original Diagnose cases remain mapped here: excess workers, runtime gates, serial bottlenecks and choosing the wrong pool each restrict progress for a different reason.</p>`);
})();
