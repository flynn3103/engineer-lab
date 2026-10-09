/* Monitor room, re-entry gate, and the lost check-to-wait gap. */
(function () {
  const C=window.CScene;
  const room=C.stage('Wake → reacquire → recheck',
    'Illustrative schedule; a wake-up grants eligibility, not monitor ownership.',
    k=>{
      C.path(k,'M211 228 L211 166 L37 166 L37 320 L211 320 L211 270','--acc');
      C.text(k,52,189,'condition wait room','sm b');
      C.line(k,57,307,183,307,'--mut');
      C.line(k,69,307,69,320,'--mut'); C.line(k,171,307,171,320,'--mut');
      C.text(k,52,339,'wait releases the monitor','xs');
      C.path(k,'M121 265 C125 133 195 124 288 132 L306 145','--acc2');
      C.text(k,167,108,'wake / runnable','xs');
      C.line(k,328,150,328,277,'--warn');
      C.rect(k,313,196,30,42,'--warn');
      C.text(k,326,294,'reacquire','xs','middle');
      C.path(k,'M358 214 L377 214','--acc2');
      C.path(k,'M416 172 L460 214 L416 256 L372 214 Z','--acc');
      C.text(k,416,277,'recheck empty?','xs','middle');
      C.path(k,'M413 263 C337 329 247 321 205 286 L181 275','--warn');
      C.text(k,286,335,'still empty → wait again','xs','middle');
      C.rect(k,499,163,99,90,'--acc2');
      C.text(k,548,151,'shared queue','sm b','middle');
      const a=k.chip(k.layer,{x:380,y:195,w:68,h:36,label:'C1'});
      const b=k.chip(k.layer,{x:529,y:277,w:68,h:36,label:'C4'});
      const job=k.chip(k.layer,{x:516,y:190,w:60,h:30,label:'job',small:true});
      const count=C.text(k,548,239,'','xs','middle');
      const owner=C.text(k,320,88,'','sm b','middle');
      return {a,b,job,count,owner};
    },
    (s,k,r)=>{
      const loc=[[381,195],[80,264],[241,119],[241,119],[381,195],[381,195],[80,264],[478,191]][s.p];
      r.a.set({x:loc[0],y:loc[1],tone:s.p===4?'bad':s.p>=5?'ok':'info'});
      r.b.set({x:s.p===3?509:529,y:s.p===3?189:277,show:s.p<5,tone:s.p===3?'warn':'info'});
      r.job.set({x:s.p===3?535:s.p===7?553:517,y:s.p===3?281:191,w:s.p===7?44:60,label:s.p===7?'J':'job',show:[2,3,7].includes(s.p)});
      r.count.set(s.p===2?'items = 1':'items = 0');
      r.owner.set(['C1 owns monitor','monitor released','producer owns monitor','C4 wins monitor','C1 reacquires: empty','loop tests current state','monitor released again','later job: check succeeds'][s.p]);
    });
  const gap=C.stage('A notification is not stored',
    'Illustrative timeline; use the same monitor for predicate changes and wait.',
    k=>{
      C.line(k,53,106,597,106,'--mut');
      for(let i=0;i<6;i++){C.line(k,70+i*102,101,70+i*102,111,'--mut');C.text(k,70+i*102,91,'t'+i,'xs','middle');}
      C.text(k,42,163,'monitor held','sm b');
      C.text(k,42,233,'outside / gap','sm b');
      C.text(k,42,326,'condition wait set','sm b');
      C.line(k,42,182,596,182,'--acc');
      C.line(k,42,250,596,250,'--bad');
      C.line(k,42,312,596,312,'--acc2');
      const atomic=C.group(k);
      C.rect(k,0,0,130,88,'--ok',atomic);
      C.text(k,65,76,'enqueue + release','xs','middle',atomic);
      const consumer=k.chip(k.layer,{x:66,y:125,w:74,h:34,label:'check'});
      const producer=k.chip(k.layer,{x:325,y:125,w:82,h:34,label:'producer'});
      const job=k.chip(k.layer,{x:458,y:191,w:54,h:30,label:'job',small:true});
      const pulse=C.dot(k,'--warn',9);
      const status=C.text(k,317,340,'','sm b','middle');
      return {atomic,consumer,producer,job,pulse,status};
    },
    (s,k,r)=>{
      const at=[[68,125],[177,202],[177,202],[482,270],[482,270],[189,125],[240,270],[492,125]][s.p];
      r.consumer.set({x:at[0],y:at[1],label:['check','gap','gap','wait','wait','check','wait','take'][s.p],tone:s.p===4?'bad':s.p>=5?'ok':'info'});
      r.producer.set({show:[2,3,6,7].includes(s.p),x:s.p>=6?388:325,y:125});
      r.job.set({show:[2,3,4,6,7].includes(s.p),x:s.p===7?574:458,y:s.p===7?127:191});
      C.move(r.pulse,[70,215,435,552,552,205,434,527][s.p],[167,226,219,247,247,168,286,167][s.p],[2,3,6,7].includes(s.p));
      C.move(r.atomic,177,173,s.p>=5);
      r.status.set(['predicate is empty','lock released before wait','signal: no waiter to wake','consumer registers too late','job exists; consumer sleeps','keep check and wait together','registered waiter can be notified','reacquire, recheck, take'][s.p]);
    });
  C.register(6,[
    C.scenario('ifwait','Wake is not ownership',
      'A monitor waiter wakes, loses the race to another consumer, then must test the predicate again (illustrative).',
      ['lock()',
       'if empty(): condition.wait()              // one old observation',
       'take()                                   // may now be empty',
       'while empty(): condition.wait()           // releases then reacquires lock',
       'take()                                   // predicate true under lock',
       'unlock()'],
      room,[
        ['Predicate false','C1 sees an empty queue under the monitor.','C1 owns the monitor and observes an empty queue before deciding to wait.',0,[['queue items','0']]],
        ['Wait','Register as waiting and release the monitor.','Wait places C1 in the condition wait set and releases the monitor so a producer can enter.',1,[['C1','waiting'],['monitor','free']]],
        ['Notify','A producer publishes one job and wakes C1.','C1 leaves the wait set but cannot return from wait until it reacquires the monitor.',1,[['queue items','1','ok'],['C1','runnable']]],
        ['Barging','C4 acquires the monitor first and takes the job.','Illustrative: a different consumer reaches the monitor first and consumes the only queued job.',2,[['queue items','0','warn'],['owner','C4']],null,true],
        ['Old check','The if path uses an observation from before sleep.','C1 eventually reacquires the monitor, but its one-time empty check no longer describes the queue.',2,[['empty take','failure','bad']]],
        ['Recheck','A while loop tests after reacquiring.','With the loop, the reacquired monitor protects a fresh empty predicate test before any take.',3,[['predicate','false','warn']]],
        ['Wait again','An empty queue sends C1 back to the wait room.','Because no job is available, C1 waits again and releases the monitor rather than taking from empty.',3,[['empty takes','0','ok']]],
        ['Later job','After a later wake, the protected check allows take.','A later producer adds a job; C1 reacquires, checks the nonempty queue, and takes while still owning the monitor.',4,[['successful take','1','ok']],
          'Wake, reacquire, recheck: only the protected predicate authorizes progress.']
      ]),
    C.scenario('lost','The check-to-wait gap',
      'Releasing the monitor between checking and waiting lets a signal pass before registration (illustrative).',
      ['lock(); wasEmpty = empty(); unlock()',
       'producer: lock(); push(job); notify(); unlock()',
       'lock(); if wasEmpty: condition.wait()      // too late',
       'lock(); while empty(): condition.wait()    // one monitor protocol',
       'take(); unlock()'],
      gap,[
        ['Check','The consumer sees empty while holding the monitor.','The consumer checks the queue under its monitor, but caches that observation for later use.',0,[['queue items','0']]],
        ['Gap opens','Unlock happens before wait registration.','The consumer releases the monitor without entering the wait set; there is now a dangerous gap.',0,[['registered waiters','0','warn']]],
        ['Signal passes','The producer adds a job and signals nobody.','The producer obtains the monitor, adds a job, and notifies while no consumer is registered as waiting.',1,[['queue items','1'],['woken waiters','0','warn']]],
        ['Too late','The consumer enters wait using the stale result.','The consumer locks again and waits from its earlier empty observation after the notification has passed.',2,[['registered waiters','1']]],
        ['Lost wake-up','A queued job coexists with a sleeping consumer.','No further notification is assumed in this illustrative schedule, so the job remains while the consumer sleeps.',2,[['queue items','1','bad'],['consumer','sleeping','bad']],null,true],
        ['Single protocol','Check inside the same locked region as wait.','A fresh correct run keeps the empty test and wait together; wait coordinates registration with monitor release.',3,[['unlocked gap','none','ok']]],
        ['Registered first','The producer can change state after the waiter releases.','The consumer is in the wait set when the producer obtains the monitor, adds a job, and notifies.',1,[['woken waiters','1','ok']]],
        ['State persists','Reacquire and check the stored queue state.','The consumer returns from wait only after monitor reacquisition, rechecks nonempty, and takes the queued job.',4,[['successful take','1','ok']],
          'Condition signals are transient; preserve readiness in shared state and check it under the same monitor.']
      ])
  ],[
    '<h3>A monitor combines exclusion with waiting</h3>',
    '<p>The original failing consumer waits for work from a shared queue. The lock alone can protect a queue operation, but it cannot express “let me sleep until an operation is possible.” A monitor combines shared state, a lock that protects it, and a condition wait set. The predicate is a statement about that state: for example, the queue is nonempty or shutdown has begun. The condition variable is the way to wait for a possible change in that statement.</p>',
    '<p>Do not confuse a semaphore permit with a condition signal. A permit can represent accumulated permission. A condition notification addresses callers already waiting; it does not store a future job. The queue itself remembers that job. This distinction explains both scenario failures: a notification cannot reserve a job for one waiter, and a notification before registration cannot replace checking current state.</p>',
    '<h3>Follow all three transitions after a wake</h3>',
    '<p>In the monitor room, C1 starts with the lock and an empty queue. Wait coordinates registration with releasing the monitor, allowing the producer to modify the queue. A notification makes C1 eligible to continue. C1 still needs to reacquire the monitor. While it competes, C4 can enter first and take the job, so a successful notification does not imply a successful take.</p>',
    '<p>Java Object.wait returns after the thread has reacquired that object’s monitor. Notifications do not immediately transfer monitor ownership, and spurious wake-ups are possible. The API therefore recommends checking a logical condition in a loop. See <a href="https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Object.html">Object.wait and notify</a>. The animated race does not require a spurious wake-up: ordinary competing consumers already make the loop necessary.</p>',
    '<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch06-wait-loop.svg" alt="A consumer checks a predicate under the lock, waits if false, reacquires after waking, and checks again"><figcaption>The loop follows the predicate, not the number of notifications.</figcaption></figure>',
    '<h3>Close the check-to-wait gap</h3>',
    '<p>In the second scenario, the consumer checks empty, unlocks, and plans to call wait later using the old result. The producer enters that gap, stores a job, and notifies. Because the consumer is not yet in the wait set, the notification has no recipient. The consumer subsequently registers and sleeps even though the queue holds a job. A second producer might accidentally hide the error by issuing another notification; that does not make the protocol sound.</p>',
    '<p>The correct protocol uses the same monitor to guard the predicate, modify the queue, and perform condition waiting. Keep the lock from the predicate check until the wait operation coordinates release with registration. If the producer runs first, the consumer sees the persistent job and skips waiting. If the consumer waits first, the producer can notify a registered waiter. There is no unlocked interval between a false test and enrollment.</p>',
    '<h3>Write the predicate loop explicitly</h3>',
    '<p>The code in these scenes is pseudocode. Its shape is lock; while the queue is empty and not closed, wait; then decide whether to take or exit; finally unlock. Every return from wait leads through the predicate again. A timed wait adds a deadline check to that same loop, because a timeout still requires deciding whether work became available. Interruption or cancellation needs a defined exit policy and correct lock cleanup.</p>',
    '<p>In Java synchronized code the wait and notify receiver must be the object whose monitor is held. With a separate Lock and Condition, await belongs to the condition associated with that lock. Naming the queue predicate next to the condition helps reviewers check that every state change capable of making it true also sends the required notification. Prefer an established blocking queue when its behavior meets the application’s needs.</p>',
    '<h3>Choose notification scope deliberately</h3>',
    '<p>One condition may have several kinds of waiters, such as producers waiting for space and consumers waiting for items. Waking one arbitrary waiter can select a caller whose predicate remains false while an eligible caller keeps sleeping. Separate conditions for distinct predicates can reduce unnecessary wakes; waking all relevant waiters is another straightforward protocol. Every awakened caller still performs the protected test, and only callers whose predicates hold may proceed.</p>',
    '<p>Neither approach grants fairness by itself. Reacquisition order, scheduler delays, and repeated arrivals affect who progresses. Avoid a correctness argument that depends on a named waiter always winning the monitor next. Keep queue work inside the lock small so a notified caller can reach its recheck promptly.</p>',
    '<h3>Diagnose the state beside the sleeping thread</h3>',
    '<p>Capture thread state, monitor owner, condition waiters, queue length, shutdown state, and recent state changes together. A sleeping consumer with queued work suggests a missing notification, a check-to-wait gap, or the wrong condition object. A notified consumer waiting to reacquire may simply be contending for the monitor. Empty-take exceptions after a wake suggest a one-time test or a predicate changed outside its lock.</p>',
    '<p>Reproduce the two meaningful schedules intentionally: pause after notification before reacquisition, and pause between an incorrect unlock and wait registration. A valid loop must survive another consumer taking the item. A valid registration protocol must survive the producer changing state at the boundary. Those observations test the mechanism more directly than a long random stress run alone.</p>'
  ].join(''));
})();
