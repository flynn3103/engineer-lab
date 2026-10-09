/* Real resource-allocation cycle and growing/unwinding call stack. */
(function(){
  const C=window.CScene;
  const graph=C.stage('Read each edge in its direction',
    'Illustrative single-instance locks: resource → holder; waiter → resource.',
    k=>{
      const arrow=(d,color)=>C.path(k,d,color);
      const edges=[
        arrow('M296 104 Q184 103 166 166 M159 156 L166 166 L174 156','--acc'),
        arrow('M164 218 Q184 286 296 295 M287 288 L296 295 L285 301','--bad'),
        arrow('M366 295 Q491 285 499 219 M492 229 L499 219 L506 229','--acc'),
        arrow('M496 166 Q479 101 366 104 M378 98 L366 104 L378 111','--bad')
      ];
      const sorted=C.group(k);
      C.path(k,'M167 165 Q169 115 295 108 M285 100 L295 108 L284 114','--warn',sorted);
      C.path(k,'M361 126 L361 279 M354 268 L361 279 L368 268','--acc2',sorted);
      C.text(k,397,202,'same order','xs','start',sorted);
      const a=k.chip(k.layer,{x:296,y:84,w:70,h:38,label:'lock a'});
      const b=k.chip(k.layer,{x:296,y:279,w:70,h:38,label:'lock b'});
      const t1=k.chip(k.layer,{x:128,y:173,w:76,h:42,label:'T1'});
      const t2=k.chip(k.layer,{x:462,y:173,w:76,h:42,label:'T2'});
      const cursor=C.dot(k,'--warn',6);
      const note=C.text(k,330,340,'','sm b','middle');
      const cycle=C.text(k,330,195,'','sm b','middle');
      C.text(k,49,80,'blue = allocation','xs');
      C.text(k,451,80,'red = request','xs');
      return {edges,sorted,a,b,t1,t2,cursor,note,cycle};
    },
    (s,k,r)=>{
      const visible=[[0],[0,2],[0,1,2],[0,1,2,3],[0,1,2,3],[],[],[]][s.p];
      r.edges.forEach((e,i)=>C.show(e,visible.includes(i)));
      C.move(r.sorted,0,0,s.p>=5&&s.p<7);
      r.a.set({tone:s.p>=5?'ok':'info'});
      r.b.set({tone:s.p>=5?'ok':'info'});
      r.t1.set({x:s.p===6?313:s.p===7?433:128,y:s.p===6?173:s.p===7?273:173,tone:s.p===3||s.p===4?'bad':s.p>=5?'ok':'info'});
      r.t2.set({x:s.p===5||s.p===6?130:s.p===7?238:462,y:s.p>=5?125:173,tone:s.p===5||s.p===6?'warn':s.p>=7?'ok':s.p===3||s.p===4?'bad':'info'});
      const at=[[284,107],[376,283],[231,272],[422,108],[422,108],[248,114],[361,248],[500,295]][s.p];
      C.move(r.cursor,at[0],at[1],true);
      r.cycle.set(s.p===3||s.p===4?'CIRCULAR WAIT':s.p===5?'a before b':s.p===6?'T1 has both':'');
      r.note.set(['T1 acquires a','T2 acquires b','T1 requests b','T2 requests a: cycle closes','alive process, zero transfer progress','fresh run: both request a first','T2 waits without holding b','T1 releases; T2 can finish'][s.p]);
    });
  const stack=C.stage('Nested calls share a lock contract',
    'Go Mutex blocks a second lock; Java reentrant ownership counts nested holds.',
    k=>{
      C.text(k,72,91,'one call stack','sm b');
      C.path(k,'M69 119 L69 305 L339 305 L339 119','--mut');
      C.text(k,202,328,'push calls ↑ / return ↓','xs','middle');
      C.rect(k,433,153,126,88,'--acc');
      C.text(k,496,140,'shared mutex','sm b','middle');
      const owner=C.text(k,496,192,'','sm b','middle');
      const holds=C.text(k,496,221,'','xs','middle');
      C.line(k,433,286,565,286,'--mut');
      C.text(k,496,312,'held acquisitions','xs','middle');
      const blocks=[C.rect(k,438,259,51,24,'--acc2'),C.rect(k,501,259,51,24,'--acc2')];
      const save=k.chip(k.layer,{x:91,y:252,w:225,h:43,label:'Save()'});
      const helper=k.chip(k.layer,{x:106,y:191,w:195,h:43,label:'Count()'});
      const request=C.path(k,'M302 210 C376 207 368 172 429 173 M417 166 L429 173 L417 180','--bad');
      const held=C.path(k,'M432 227 C381 229 375 274 321 274 M333 267 L321 274 L333 281','--acc2');
      const loop=C.path(k,'M559 193 C609 196 609 106 520 106 C421 106 398 129 433 164 M427 152 L433 164 L442 156','--bad');
      const note=C.text(k,324,108,'','xs','middle');
      return {save,helper,owner,holds,blocks,request,held,loop,note};
    },
    (s,k,r)=>{
      const nested=[1,2,3,7].includes(s.p), returned=[4,8].includes(s.p);
      r.save.set({x:91,y:[5,9].includes(s.p)?119:252,show:![5,9].includes(s.p),tone:s.p===2?'bad':s.p>=3?'ok':'info'});
      r.helper.set({x:106,y:returned?126:191,show:nested||returned,label:s.p===3||s.p===4?'countLocked()':'Count()',tone:s.p===2?'bad':s.p>=3?'ok':'info'});
      const n=[1,1,1,1,1,0,1,2,1,0][s.p];
      r.owner.set(n?s.p>=6?'thread T':'held by Save':'free');
      r.holds.set(s.p>=6?'hold count = '+n:'locked = '+(n?'true':'false'));
      r.blocks.forEach((b,i)=>C.show(b,i<n));
      C.show(r.request,[1,2].includes(s.p));
      C.show(r.held,n>0);
      C.show(r.loop,s.p===2);
      r.note.set(['non-reentrant model','helper attempts lock again','Save cannot reach unlock','helper assumes lock held','helper returns without locking','outer defer unlocks','Java comparison: first hold','same owner: second hold','inner unlock: still held','outer unlock: now free'][s.p]);
    });
  C.register(7,[
    C.scenario('order','Circular wait graph',
      'Opposite transfers form a real directed ownership cycle; one global lock order removes it (illustrative).',
      ['T1: lock(a); lock(b); transfer(a,b); unlock(b); unlock(a)',
       'T2: lock(b); lock(a); transfer(b,a); unlock(a); unlock(b)',
       '// a → T1 → b → T2 → a',
       'first, second = orderByStableUniqueId(a,b)',
       'lock(first); lock(second); transfer(); unlock(second); unlock(first)',
       '// Handle a == b as one lock, before sorting.'],
      graph,[
        ['First holder','T1 obtains lock a.','The allocation edge points from lock a to its holder T1; no wait exists yet.',0,[['locks held','1']]],
        ['Second holder','T2 obtains lock b.','T2 independently acquires b, so each transfer now holds one single-instance resource.',1,[['locks held','2']]],
        ['First wait','T1 requests b while continuing to hold a.','The request edge T1 to b ends at the lock already held by T2; T1 cannot continue.',0,[['T1 waits for','b','warn']]],
        ['Cycle closes','T2 requests a while continuing to hold b.','The directed path a to T1 to b to T2 to a is now closed: neither transfer can reach its unlock.',1,[['wait cycle','present','bad']],null,true],
        ['No progress','The process can be alive while transfers are stuck.','Both transfers are blocked; a process health check may pass even though completed transfers remain zero.',2,[['completed','0','bad'],['process','alive']]],
        ['Global order','In a fresh run, both callers request a before b.','Sorting the same two stable unique IDs means both transfers ask for the lower lock first.',3,[['order','a then b','ok']]],
        ['Acyclic wait','T1 gets both; T2 waits while holding neither.','T1 can acquire b because T2 never took b first; T2 waits for a without completing a cycle.',4,[['wait cycle','none','ok'],['T1 locks','2']]],
        ['Release','T1 releases both; T2 then takes the same path.','T1 finishes and releases in reverse order; T2 can obtain the locks and complete its transfer.',4,[['completed','2','ok']],
          'Use one global order for every path that acquires multiple locks; observe completion, not process survival.']
      ]),
    C.scenario('reentry','Recursive lock stack',
      'A nested Go-style lock self-blocks; an internal helper avoids re-locking, while Java counts reentrant holds.',
      ['Save: mutex.lock(); defer mutex.unlock(); Count()',
       'Count: mutex.lock(); defer mutex.unlock(); readCount()',
       '// Same call stack cannot reach the outer unlock.',
       'Save: mutex.lock(); defer mutex.unlock(); countLocked()',
       'countLocked: readCount()                  // caller must hold mutex',
       'Java model: lock.lock(); try: nested() finally: lock.unlock()',
       'nested: lock.lock(); try: readCount() finally: lock.unlock()'],
      stack,[
        ['Outer frame','Save locks the mutex and keeps a pending unlock.','In the Go-style non-reentrant model, Save acquires the mutex before entering the helper.',0,[['successful locks','1']]],
        ['Nested frame','Count pushes a frame and tries the same lock.','Count is a public helper that acquires the mutex itself, so calling it inside Save repeats acquisition.',1,[['lock attempts','2','warn']]],
        ['Self-blocked','The inner lock waits; the outer unlock is unreachable.','The call stack waits inside Count, and Save cannot return to execute its deferred unlock.',2,[['progress','stalled','bad']],null,true],
        ['Lock contract','In a fresh run, call countLocked under the outer lock.','Save uses an internal helper whose contract requires the caller to hold the mutex; the helper does not lock.',3,[['successful locks','1','ok']]],
        ['Helper returns','The internal frame unwinds without another unlock.','countLocked reads protected state and returns while Save still has the outer lock held.',4,[['extra lock','none','ok']]],
        ['Outer returns','The outer deferred unlock makes the mutex available.','Save returns and its scoped cleanup unlocks the mutex; other goroutines can proceed.',3,[['mutex','free','ok']]],
        ['Java comparison','A reentrant lock starts with one hold by T.','For comparison, Java ReentrantLock tracks the owning thread and a hold count after its first acquisition.',5,[['hold count','1']]],
        ['Nested hold','The same thread enters again: hold count becomes two.','A nested acquisition by the same Java lock owner succeeds and increments the hold count.',6,[['hold count','2','ok']]],
        ['Partial unwind','The inner unlock removes only one hold.','Returning from the nested call decrements the count to one; other threads still cannot enter.',6,[['hold count','1','warn']]],
        ['Fully released','The final unlock removes the remaining hold.','The outer Java cleanup drops the count to zero, releasing the lock for another thread.',5,[['hold count','0','ok']],
          'Know the lock contract: avoid nested acquisition for Go Mutex; balance every Java reentrant hold.']
      ],'Pseudocode / Go and Java models')
  ],[
    '<h3>A stall can preserve safety and destroy usefulness</h3>',
    '<p>The original bank transfer protects both account updates, yet two opposite transfers never finish. Each thread keeps a lock the other needs. The process can still answer an unrelated health endpoint, so being alive is weaker than making progress. The resource graph captures the reason for the stall without relying on a particular timeout, processor count, or elapsed duration. The scene timings are illustrative interleavings.</p>',
    '<p>Four ingredients characterize the classic deadlock: exclusive resources, holding one while waiting for another, no forced release, and a circular wait. The bank example has all four. Removing circular wait through a common acquisition order is usually the smallest change to a multi-lock design. Changing scheduling speed or adding more workers does not alter the cycle.</p>',
    '<h3>Give allocation and request edges different directions</h3>',
    '<p>A resource points to its holder. A waiting thread points to the resource it requests. Follow a to T1 to b to T2 to a in the animation. With the single-instance exclusive locks shown here, blocked participants in that cycle cannot release the resources needed to advance. More general resource systems with multiple interchangeable instances need a richer analysis: a cycle alone is not always sufficient to prove deadlock.</p>',
    '<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch07-resource-cycle.svg" alt="Lock a is held by T1 which waits for b; lock b is held by T2 which waits for a"><figcaption>Follow the arrows around the actual resource-allocation cycle.</figcaption></figure>',
    '<p>The <a href="https://docs.oracle.com/javase/tutorial/essential/concurrency/deadlock.html">Oracle deadlock example</a> illustrates threads each waiting for the other to release a synchronized resource. The important diagnostic evidence is the ownership-and-wait relationship, not whether CPU usage is high or low. A dump showing the same unresolved cycle repeatedly is stronger evidence than one slow request.</p>',
    '<h3>Make the order global and total</h3>',
    '<p>The transfer helper orders both accounts by a stable unique key before taking either lock. Both directions then request a first and b second. The loser waits without holding b, so the winner can complete. Release in reverse order using reliable cleanup. Handle a transfer to the same account as a single-resource case; taking the same non-reentrant lock twice would introduce another failure.</p>',
    '<p>The rule has to cover every entry point, helper, and callback that can acquire these resources. Ordering only the two top-level functions leaves a hidden reverse path capable of closing the cycle. Avoid invoking unknown user code while holding internal locks when possible: copy the required state under protection, release it, then call out. This also reduces the duration of contention.</p>',
    '<h3>A nested call has a separate lock contract</h3>',
    '<p>The original self-deadlock uses Go sync.Mutex. Save locks, then calls Count, which locks the same mutex again. That second call blocks; the current call stack cannot reach Save’s deferred unlock. A Go Mutex is not associated with a particular goroutine and does not treat a repeated Lock by that goroutine as recursive entry. The <a href="https://pkg.go.dev/sync#Mutex">Go sync documentation</a> describes Lock blocking when the mutex is in use and permits another goroutine to unlock it. The stack labels describe this program’s responsibility, not a runtime owner identity.</p>',
    '<p>The small repair is an internal countLocked helper with a documented precondition that its caller already holds the mutex. Public Count may take the lock and call that helper; locked Save calls the helper directly. This keeps one acquisition responsible for one release. A helper that silently alternates between locking and assuming protection is harder to review than two explicit entry points.</p>',
    '<h3>Reentrancy balances holds; it does not erase cycles</h3>',
    '<p>The final stack steps compare Java ReentrantLock. The same owning thread can acquire again, increasing its hold count. Each unlock removes one hold; the resource becomes available to other threads only when the final hold is released. This contract explains why nested acquisition can work there while the Go pattern stalls. See the <a href="https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html">ReentrantLock API</a>. The example code is pseudocode and uses try/finally to make each acquisition’s matching release visible.</p>',
    '<p>Reentrancy addresses repeated acquisition by one owner, not a cycle involving different locks and threads. It also lets callbacks re-enter code while an outer operation is only partly complete, so state invariants still need review. Timed try-lock can abandon an attempted acquisition, but recovery must release partial holdings and limit retries. If everyone repeatedly retries together, livelock can replace the original deadlock.</p>',
    '<h3>Measure progress across the dependency chain</h3>',
    '<p>Collect thread or goroutine dumps, requested locks, held locks, request ages, and completed-operation counts. Look for the resource cycle in the transfer case and the nested acquisition frame in the self-blocking case. A bounded worker pool can create a similar dependency without an ordinary mutex: parents occupy every worker while waiting for children queued to that same pool. Draw worker availability as a resource too.</p>',
    '<p>Separate deadlock from starvation, where other work progresses while one waiter is repeatedly delayed, and from priority inversion, where lower-priority work holds a resource needed by higher-priority work. Their remedies differ. Validate the ordering helper with simultaneous opposite transfers, validate internal helpers through locked callers, and check that failures still release partial holdings. A passing process probe alone cannot verify any of those properties.</p>'
  ].join(''));
})();
