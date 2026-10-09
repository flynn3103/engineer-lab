/* Async waits: one moving clock hand, then a growing arrival reservoir. */
(function () {
  const C = window.CScene;
  const clock = C.stage('One loop, many waits', 'Illustrative timings; clock angle represents progress, not wall-clock time.', k => {
    const rim = k.el('circle', {cx:175,cy:205,r:88}, k.layer);
    rim.style.fill = 'var(--card)'; rim.style.stroke = 'var(--mut)';
    [0,1,2,3,4,5,6,7,8,9,10,11].forEach(i => {
      const a=i*Math.PI/6;
      C.line(k,175+78*Math.sin(a),205-78*Math.cos(a),175+87*Math.sin(a),205-87*Math.cos(a));
    });
    C.text(k,175,102,'EVENT LOOP','sm b','middle');
    C.text(k,175,318,'one callback at a time','sm','middle');
    const hand=C.group(k); C.line(k,0,0,0,-65,'--acc',hand);
    const hub=k.el('circle',{cx:0,cy:0,r:6},hand); hub.style.fill='var(--acc)';
    C.text(k,362,86,'READY CALLBACKS','sm b');
    [112,166,220].forEach(y=>C.line(k,350,y+40,602,y+40));
    const a=k.chip(null,{x:360,y:112,w:116,label:'request A',sub:'handler'});
    const b=k.chip(null,{x:482,y:166,w:116,label:'reply B',sub:'ready'});
    const c=k.chip(null,{x:482,y:220,w:116,label:'reply C',sub:'ready'});
    C.path(k,'M360 292 Q475 265 595 292 Q475 321 360 292','--acc2');
    C.text(k,475,334,'disk / worker wait','sm','middle');
    const state=C.text(k,175,234,'dispatch','sm b','middle');
    return {hand,a,b,c,state};
  }, (s,k,r) => {
    const p=s.p, angles=[0,60,60,60,120,180,240,300];
    r.hand.style.transform=`translate(175px,205px) rotate(${angles[p]}deg)`;
    r.state.set(['dispatch','sync read','blocked','blocked','returned','await I/O','serve B','resume A'][p]);
    const aa=[[360,112],[117,245],[117,245],[117,245],[360,112],[417,272],[417,272],[117,245]][p];
    r.a.set({x:aa[0],y:aa[1],sub:p===5||p===6?'pending I/O':'handler',tone:p>0&&p<4?'bad':'info'});
    r.b.set({x:p===6?117:482,y:p===6?245:166,sub:p===6?'runs now':'ready',tone:p===6?'ok':'info'});
    r.c.set({x:482,y:220,sub:p<4?'waiting':'ready'});
  });
  const reservoir=C.stage('Arrival rate versus service rate','Illustrative rates; a concurrency cap is a slot limit, not requests per second.', k=>{
    C.text(k,52,103,'ARRIVAL','sm b'); C.text(k,52,121,'1,000 / s','sm');
    C.path(k,'M60 140 H185 V180 H245','--acc');
    C.path(k,'M245 130 V304 H405 V130','--mut');
    const water=C.rect(k,250,294,150,10,'--acc2'); water.style.stroke='none';
    C.text(k,325,105,'PENDING WORK','sm b','middle');
    C.text(k,325,325,'each waiting task holds memory','sm','middle');
    C.line(k,405,275,555,275,'--acc2');
    C.text(k,475,228,'SERVICE','sm b'); C.text(k,475,246,'200 / s','sm');
    const gate=C.group(k); C.rect(k,0,0,12,58,'--warn',gate);
    const incoming=[0,1,2].map(()=>C.dot(k,'--acc',6));
    const outgoing=C.dot(k,'--acc2',6);
    const level=C.text(k,325,158,'0 tasks','sm b','middle');
    const bound=C.line(k,242,220,411,220,'--warn');
    const policy=C.text(k,55,307,'accept every arrival','sm');
    return {water,gate,incoming,outgoing,level,bound,policy,h:10};
  },(s,k,r)=>{
    const p=s.p,h=[10,44,90,155,85,75,75,65][p];
    Kit.tween(r,'level',r.h,h,650,v=>{r.h=v;r.water.setAttribute('height',v);r.water.setAttribute('y',304-v);});
    const q=['0','800','2,400','240,000','200 slots','200 slots','200 slots','bounded'][p];r.level.set(q);
    C.move(r.gate,178,p>=4?148:74,p>=4); C.show(r.bound,p>=4);
    r.policy.set(p>=4?'pause / reject at admission':'accept every arrival');
    r.incoming.forEach((d,i)=>C.move(d,p>=4?110+i*22:80+p*22+i*22,p>=4?140:140+(i===2?40:0)));
    C.move(r.outgoing,[425,460,500,548,430,468,510,555][p],275);
  });
  C.register(2,[
    C.scenario('loop','The loop clock','One synchronous read freezes ready callbacks. Then an async wait frees the loop. Timings are illustrative.',[
      'on request A: run handler()',
      'cfg = readFileSync("big.json")  // holds loop thread',
      '// ready B and C cannot execute until A returns',
      'on next request A: cfg = await readFileAsync(file)',
      '// runtime waits for I/O; loop runs other callbacks',
      'on completion: resume A; observe result or error'
    ],clock,[
      ['Dispatch','A callback takes its turn','The loop dispatches request A while B and C are already ready.',0,[['loop threads','1','ok']]],
      ['Sync read','The only hand stops turning','A synchronous read holds the thread until it returns, even while the disk is waiting.',1,[['thread','blocked','bad']]],
      ['Ready waits','Ready does not mean running','B has a reply ready, but the busy loop cannot dispatch its callback.',2,[['ready replies','queued','warn']]],
      ['Shared freeze','One handler delays every ready callback','About two seconds pass in this illustrative trace; unrelated clients wait behind A.',2,[['loop lag','~2 s','bad']],null,true],
      ['Return','The synchronous call finally returns','The loop can dispatch another callback only after A gives the thread back.',2,[]],
      ['Async wait','A suspends; the loop gets the thread back','The next handler starts asynchronous I/O and awaits its result; its continuation remains pending.',3,[['A','suspended','ok']]],
      ['Other work','B runs while A waits for I/O','The loop dispatches B while the disk or worker pool completes A’s read.',4,[['loop','serving B','ok']]],
      ['Resume','Completion makes A runnable again','A resumes when its result is available and observes success or failure. The loop still runs one callback at a time.',5,[['CPU parallelism','not added','info']],'Async overlaps waits. Keep each callback short and observe every asynchronous result.']
    ]),
    C.scenario('backpressure','The backlog reservoir','Arrival exceeds service: pending work grows until admission slows or sheds load. Rates and levels are illustrative.',[
      'for req in incoming: start_task(call_payment(req))',
      '// arrival 1,000/s; completion 200/s => +800/s',
      '// five minutes of sustained excess => 240,000 tasks',
      'slots = Semaphore(200); queue = BoundedQueue(limit)',
      'await slots.acquire()   // before creating child task',
      'try: await payment(req); finally: slots.release()',
      'if queue full or deadline passed: reject early'
    ],reservoir,[
      ['Arrival','Starting a task does not create service capacity','The producer accepts every request. Non-blocking waits make this cheap enough to hide overload briefly.',0,[['arrival','1,000/s','warn']]],
      ['Excess','The reservoir fills by 800 tasks each second','Only 200 requests complete each second; the remaining 800 keep their state in memory.',1,[['growth','+800/s','bad']]],
      ['Accumulation','More queue means more waiting','Three illustrative seconds leave 2,400 additional tasks pending, even if CPU looks quiet.',1,[['pending','2,400','bad']]],
      ['Unbounded','Memory is finite; the queue has no policy','Five illustrative minutes yield 240,000 tasks. Queue age climbs before an eventual memory failure.',2,[['pending','240,000','bad']],null,true],
      ['Admission','Cap slots before starting new work','A semaphore limits active calls to 200. A bounded queue separately limits callers waiting for those slots.',3,[['in flight','≤200','ok']]],
      ['Producer waits','Pressure reaches the producer','Acquire happens before creating another child task. Waiting producers must also remain bounded.',4,[['admission','paused','warn']]],
      ['Completion','A finished call returns one slot','Release in a finally path returns capacity after success, failure, or cancellation.',5,[['slot leak','prevented','ok']]],
      ['Stable policy','Excess work waits within a bound or is rejected','Bounded admission and deadlines keep stored work finite; they cannot make a slow payment API faster.',6,[['queue','bounded','ok']],'Bound active calls and waiting work. Propagate pressure or reject; a slot cap is not a rate limit.']
    ])
  ],`<h3>Why a waiting service can freeze</h3>
<p>A chat server can maintain thousands of open sockets because most connections are waiting rather than executing instructions. The important resource is the thread that dispatches their callbacks. In the original example, a synchronous file read occupies that thread for roughly two seconds. Other replies can already be available while their application callbacks remain unable to run. Low CPU usage therefore does not disprove a severe latency problem: a thread blocked on storage can delay everyone who shares its event loop. All times and request counts in the scenes are illustrative.</p>
<h3>Separate readiness from execution</h3>
<p>Think of the loop as a clock with one hand: each short callback gets a turn, submits any required I/O, and returns control. An operating-system readiness facility, such as epoll or kqueue, tells the runtime when network activity can progress. File reads may instead use worker threads; Node’s asynchronous filesystem APIs normally use libuv’s pool. The completion eventually makes a continuation runnable. The loop still executes application callbacks serially on its thread. This is overlapping waits, and does not add CPU cores to a JavaScript calculation. <a href="https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop">Node’s event-loop and worker-pool guide</a> documents that distinction.</p>
<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch02-await.svg" alt="A handler submits I/O, yields the loop to other callbacks, then resumes after completion"><figcaption>The continuation waits; unrelated callbacks can use the loop thread.</figcaption></figure>
<h3>What async syntax actually promises</h3>
<p>Callbacks explicitly name the next operation; promises represent a future result; async and await express the same dependency in straight-line syntax. The pseudocode in the scene uses await to suspend a handler while an asynchronous read is pending. Await is not an instruction that makes the preceding synchronous calculation cheap. A large JSON parse or an expensive loop still occupies the thread that executes it. Go goroutines and Java virtual threads offer a different programming surface: their runtimes can park lightweight execution contexts around supported waits. Their scheduling rules and blocking APIs still need to be understood.</p>
<p>Observe every result. In Python, calling a coroutine function creates a coroutine object which must be awaited or scheduled. In JavaScript, an async function starts running and returns a promise; forgetting to observe that promise can lose its failure. Use an explicit task group or collection when operations belong together, and decide how errors and cancellation propagate. Those language differences matter when diagnosing the original unawaited-coroutine and unhandled-rejection examples.</p>
<h3>A fast producer can exhaust memory</h3>
<p>Asynchronous waiting makes it easy to start far more operations than the downstream can finish. The reservoir scene retains the original arrival rate of 1,000 requests per second and service rate of 200. Under sustained excess, backlog grows by 800 per second, or 240,000 over five minutes. Each pending request carries objects, buffers, and deadlines. More tasks can increase queue latency without increasing throughput. The bottleneck is service capacity; creating another task does not enlarge it.</p>
<p>A semaphore caps concurrent operations, not requests per second. Acquire its slot before launching more work, and release it on every exit path. A separate bounded queue, admission limit, or rejection policy is needed for callers waiting to acquire. Otherwise the semaphore merely moves the unbounded backlog into waiting tasks. Choose whether pressure reaches an upstream producer or overload returns a deliberate rejection. Deadline expiry should remove useless waiting work. <a href="https://docs.python.org/3/library/asyncio-sync.html">Python’s asyncio synchronization documentation</a> describes semaphore acquisition and release.</p>
<h3>Keep worker capacity available</h3>
<p>Move synchronous blocking calls into an appropriate executor and CPU-heavy work into a suitable worker or process pool. Pools also have finite capacity. If every parent task occupies a bounded pool thread while synchronously waiting for a child submitted to that same pool, the children cannot start. This is the original sync-over-async starvation example: idle CPU and queued tasks coexist with all pool threads waiting. Use asynchronous dependencies or a separate executor where the design requires it, and keep task sizes and admission bounded.</p>
<h3>Diagnose the resource that is waiting</h3>
<p>Measure event-loop delay for freezes shared by unrelated requests, queue depth and oldest-item age for overload, and thread dumps for pool starvation. Compare arrival and completion rates over the same interval before changing worker counts. A healthy loop with a growing queue points toward downstream capacity or admission; a delayed loop with ready responses points toward a long callback. Python’s debug mode can report slow callbacks, as described in <a href="https://docs.python.org/3/library/asyncio-dev.html">the asyncio development guide</a>. Repeat the original workload after the change and verify both latency and finite pending work, including failure and cancellation paths.</p>`);
})();
