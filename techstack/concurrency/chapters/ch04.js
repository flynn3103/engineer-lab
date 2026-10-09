/* Atomics: an indivisible turnstile and a release/acquire publication bridge. */
(function () {
  const C=window.CScene;
  const turnstile=C.stage('One indivisible entrance decision','Illustrative trace; a lock alone does not make a payment durable or exactly once.',k=>{
    C.line(k,48,135,260,135);C.line(k,48,280,260,280);
    C.text(k,58,109,'CORE A','sm b');C.text(k,58,256,'CORE B','sm b');
    C.line(k,388,145,599,145);C.line(k,388,270,599,270);
    const circle=k.el('circle',{cx:320,cy:210,r:64},k.layer);circle.style.fill='var(--card)';circle.style.stroke='var(--mut)';
    const arms=C.group(k);[0,1,2].forEach(i=>{const a=i*Math.PI*2/3;C.line(k,0,0,55*Math.cos(a),55*Math.sin(a),'--acc2',arms);});
    const hub=k.el('circle',{cx:0,cy:0,r:7},arms);hub.style.fill='var(--acc2)';
    C.text(k,320,108,'TURNSTILE','sm b','middle');
    const lock=C.text(k,320,304,'locked = 0','sm b','middle');
    const a=k.chip(null,{x:70,y:117,w:88,label:'A',sub:'read 0'});
    const b=k.chip(null,{x:70,y:262,w:88,label:'B',sub:'read 0',tone:'warn'});
    C.text(k,478,195,'PROTECTED','sm b');C.text(k,478,214,'check + charge','sm');
    const effect=C.text(k,475,325,'critical entries: 0','sm');
    return{arms,lock,a,b,effect};
  },(s,k,r)=>{
    const p=s.p;r.arms.style.transform=`translate(320px,210px) rotate(${[0,0,60,60,0,120,120,240][p]}deg)`;
    const ax=[70,70,462,462,210,462,462,568][p],bx=[70,210,462,462,70,210,210,462][p];
    r.a.set({x:ax,y:117,sub:p<4?'read 0':p===4?'old 0':p===7?'done':'owns',tone:p===2||p===3?'bad':'info',show:p!==7});
    r.b.set({x:bx,y:262,sub:p<4?'read 0':p===4?'pending':p===7?'owns':'old 1',tone:p===2||p===3?'bad':p===7?'ok':'warn'});
    r.lock.set('locked = '+[0,0,1,1,1,1,1,1][p]);r.effect.set(['critical entries: 0','two free observations','critical entries: 2','duplicate charge risk','atomic old value: 0','critical entries: 1','B waits / parks','B checks: already done'][p]);
  });
  const bridge=C.stage('Publish data through a synchronization edge','Illustrative visibility; acquire must observe the matching release publication.',k=>{
    C.text(k,60,92,'WRITER','sm b');C.text(k,512,92,'READER','sm b');
    C.path(k,'M70 170 H568','--mut');C.path(k,'M70 282 H568','--mut');
    C.text(k,50,155,'payload lane','sm');C.text(k,50,267,'ready lane','sm');
    C.path(k,'M228 195 Q320 85 412 195','--acc2');
    C.path(k,'M228 218 Q320 108 412 218','--acc2');
    [245,282,320,358,395].forEach(x=>C.line(k,x,159,x,183,'--acc2'));
    const barrier=C.group(k);C.line(k,0,-23,0,23,'--warn',barrier);C.text(k,0,-32,'release','sm','middle',barrier);
    const acquire=C.group(k);C.line(k,0,-23,0,23,'--acc2',acquire);C.text(k,0,-32,'acquire','sm','middle',acquire);
    const data=k.chip(null,{x:70,y:173,w:106,label:'data = 42',sub:'written'});
    const flag=k.chip(null,{x:70,y:285,w:106,label:'ready = 1',sub:'plain flag'});
    const read=C.text(k,525,232,'data read: —','sm b','middle');
    const relation=C.text(k,320,342,'no synchronization edge','sm','middle');
    return{barrier,acquire,data,flag,read,relation};
  },(s,k,r)=>{
    const p=s.p;
    r.data.set({x:[70,225,225,225,70,225,388,474][p],y:173,sub:p<4?'unpublished':p<6?'before release':'published',tone:p===3?'warn':p>=6?'ok':'info'});
    r.flag.set({x:[70,70,474,474,70,225,388,474][p],y:285,sub:p<4?'plain flag':p<6?'release':'observed',tone:p<4?'warn':'ok'});
    C.move(r.barrier,226,282,p>=4);C.move(r.acquire,414,282,p>=4);
    r.read.set(['data read: —','data read: —','ready seen: 1','data read: 0','data read: —','not observed yet','acquire reads 1','data read: 42'][p]);
    r.relation.set(p<4?'no synchronization edge':p<6?'release alone is not enough':'release → matching acquire → payload read');
  });
  C.register(4,[
    C.scenario('flag','The atomic turnstile','Separate read and write admit both cores. Atomic test-and-set admits one, followed by a protected duplicate check.',[
      'if locked == 0:         // both can observe free',
      '    locked = 1          // separate plain write',
      '    charge(order)       // overlapping entries',
      'while flag.test_and_set(acquire): bounded_wait()',
      'try: if not done: charge(order); done = true',
      'finally: flag.clear(release)',
      '// later entrant checks done under the same lock'
    ],turnstile,[
      ['A observes','A sees free; that observation reserves nothing','Core A reads locked as zero. The separate future write has not excluded another core.',0,[['A observed','0','info']]],
      ['B observes','B can read the same free value','Core B reads zero before A’s write. Both callers believe the entrance is free.',0,[['B observed','0','warn']]],
      ['Two enter','Two plain writes do not form one decision','Both cores write one and enter. The check and claim were separate operations.',1,[['inside','2','bad']],null,true],
      ['Safety fails','The customer can see duplicate side effects','Two overlapping calls may charge the same order. A lock is a mutual-exclusion mechanism, not a payment transaction.',2,[['duplicate risk','yes','bad']]],
      ['Atomic claim','Test-and-set returns the old value and sets one','Replay: A’s atomic operation gets old value zero and claims the flag indivisibly.',3,[['A old value','0','ok']]],
      ['Contender','B gets one and cannot enter yet','B’s atomic test-and-set observes the claimed flag. Only A executes the protected check and action.',4,[['inside','1','ok']]],
      ['Release','A completes state and releases the flag','A records done before release. B uses bounded waiting or parking so it does not spin indefinitely on a paused holder.',5,[['B','waiting','warn']]],
      ['Later entrant','B acquires, then checks protected state','B can enter after release and sees done, so this illustrative in-memory example skips a second charge.',6,[['protected check','already done','ok']],'Atomic entry ensures exclusion. Duplicate suppression needs protected state; durable payments need more.']
    ]),
    C.scenario('order','The publication bridge','A plain flag conveys no synchronization. Release plus a matching acquire makes preceding payload writes happen before the read.',[
      'data = 42; ready = true;    // plain shared variables: unsafe',
      '// reader sees ready, then may see an old payload',
      'data = 42;                // initialize payload once',
      'ready.store(true, release); // publish on atomic ready',
      'if ready.load(acquire):     // must observe publication',
      '    use(data)               // now ordered after writer',
      '// no concurrent later payload writes in this example'
    ],bridge,[
      ['Write payload','Program order is not a publication protocol','The writer starts with data equal to zero and intends to publish 42. Plain shared variables provide no safe protocol.',0,[['payload intended','42','info']]],
      ['In flight','A different observer need not see both stores together','The diagram separates visibility from source order; it does not model a specific cache or instruction timing.',0,[['payload observed','not yet','warn']]],
      ['Flag first','A plain ready flag establishes no synchronization','The reader can observe the intended signal without a guarantee for the payload. A C++ data race makes this program undefined.',1,[['reader sees ready','true','warn']]],
      ['Stale payload','The source trace illustrates the missing guarantee','The hardware intuition is a reader seeing zero. The language-level fix is synchronization, even on x86.',1,[['illustrative read','0','bad']],null,true],
      ['Release','Publish through an atomic ready variable','Replay: initialize the payload, then perform a release store to the atomic flag.',3,[['writer','release','ok']]],
      ['Not enough alone','The reader must participate in the protocol','A release store by itself does not order an arbitrary reader. An acquire that reads false cannot use the payload yet.',3,[['reader','not synchronized','warn']]],
      ['Matching acquire','Acquire observes this release publication','The acquire reads true from the release store on the same flag, establishing the synchronization edge.',4,[['relation','synchronizes with','ok']]],
      ['Ordered read','The payload read follows initialization','The preceding data write now happens before use(data). This one-shot example has no concurrent later payload mutation.',5,[['payload read','42','ok']],'Release and acquire require a matching publication relation. Atomicity alone does not order other data.']
    ])
  ],`<h3>Safety and progress answer different questions</h3>
<p>Safety asks whether an invalid state can occur: two threads must not execute a mutually exclusive operation together. Liveness asks whether useful work can continue: a waiting thread must eventually get a chance under the guarantees actually offered by the design. The original flag race fails safety even though both cores make progress. A spin lock can preserve exclusion while wasting all available CPU on waiters whose holder is paused. Keep these questions separate when interpreting a stress test. Completion of many operations does not prove exclusion, and exclusion alone does not promise fairness.</p>
<h3>Make the entrance decision indivisible</h3>
<p>A plain read of locked followed by a plain write is two operations. Both cores can observe zero before either writes one. Test-and-set combines the old-value observation with setting the flag as one atomic read-modify-write. One contender receives the free old value; the next sees the claimed value. The turnstile visualizes this shared decision point, with one entrance rather than two independent observations. Real implementations must also use ordering that protects the data inside the section, rather than treating atomicity of the flag as the entire lock protocol.</p>
<p>The original payment story needs an additional qualification. A lock prevents overlapping critical sections, but a later caller can enter after release and charge again. The revised pseudocode therefore checks a protected done field before charging and records it before release. That suppresses duplicates only within this simplified in-memory lifetime. Crashes, retries, and remote payment outcomes require durable state and an appropriate idempotency protocol. The lesson’s claim is exclusion at the entrance, not durable exactly-once billing.</p>
<h3>Publishing a flag is not publishing its payload</h3>
<p>The second scene starts from the original data = 42 followed by ready = true example. Source order alone does not establish a cross-thread synchronization relationship. A hardware-oriented trace can illustrate a reader seeing the signal before the intended payload. For C++, unsynchronized conflicting accesses to ordinary shared variables are a data race and cause undefined behavior; stale zero is only an explanatory symptom, not the complete set of possible outcomes. Even a machine whose stores have stronger ordering cannot make an invalid language-level program safe. The <a href="https://eel.is/c++draft/intro.races">C++ draft’s data-race rules</a> define that boundary.</p>
<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch04-publication.svg" alt="Payload initialization precedes release publication; an acquire reading that publication precedes payload use"><figcaption>The bridge exists only when acquire observes the matching release publication.</figcaption></figure>
<h3>Release and acquire build a relationship</h3>
<p>In the one-shot pseudocode, the writer initializes ordinary data, then performs a release store of true on an atomic ready variable. The reader performs an acquire load on that same variable and uses data only if it observes the published value. That matching observation establishes synchronization, so the initialization happens before the payload read. Release is not a global cache-flush command, and acquire is not a promise that every arbitrary earlier write anywhere becomes visible. An acquire reading the initial false value has not observed the publication. The <a href="https://eel.is/c++draft/atomics.order">C++ draft’s atomic-ordering rules</a> specify this relationship.</p>
<p>The payload must also remain valid. This example assumes initialization once and no concurrent later writes. Reusing a ready flag or mutating the payload again requires a fuller protocol; the initial bridge does not protect every future operation. Relaxed operations preserve atomicity of their own object but do not establish this publication ordering. Prefer a standard mutex or a well-understood atomic abstraction unless the weaker ordering is justified and reviewed.</p>
<h3>Waiting policy determines liveness and cost</h3>
<p>Spinning is repeated execution while hoping the holder will release soon. It can help for a very short wait while the holder is running on another core; it wastes capacity when the holder is descheduled or blocked. With more runnable threads than available CPUs, waiters may compete with the very thread needed to unlock. Use a standard synchronization primitive that manages waiting, or explicitly bound spinning before parking. Short critical sections reduce both contention and the chance of a costly pause. An unfair admission policy can repeatedly favor newcomers; a fair policy can trade throughput for more predictable acquisition.</p>
<h3>Inspect the actual guarantee</h3>
<p>Measure maximum and percentile wait times, holder duration, and CPU spent waiting, rather than only average throughput. Check the current primitive’s contract before assuming FIFO or universal starvation freedom. Java’s <a href="https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html">ReentrantLock documentation</a> describes its optional fairness policy and cautions that lock fairness does not guarantee fair thread scheduling. Use race detection for plain shared-variable errors and stress tests on the hardware you ship for architecture-sensitive observations. Testing complements a synchronization argument; passing on x86 or ARM cannot prove that an unsupported publication pattern is correct.</p>`);
})();
