/* Threads: instruction rails and a transferable ownership baton. */
(function () {
  const C=window.CScene;
  const rails=C.stage('Two registers, one shared word','Illustrative instruction trace; language-level data races may have broader effects.',k=>{
    const guard=C.rect(k,82,91,385,177,'--acc2');guard.style.fill='none';
    C.text(k,47,135,'A','sm b'); C.text(k,47,213,'B','sm b');
    [130,208].forEach(y=>{
      C.line(k,92,y,448,y,'--mut');
      [130,275,420].forEach((x,i)=>{C.line(k,x,y-8,x,y+8);C.text(k,x,y+31,['LOAD','ADD','STORE'][i],'sm','middle');});
    });
    const a=k.chip(null,{x:98,y:105,w:64,label:'A',sub:'r = —'});
    const b=k.chip(null,{x:98,y:183,w:64,label:'B',sub:'r = —',tone:'warn'});
    C.rect(k,486,123,118,112,'--acc'); C.text(k,545,148,'SHARED','sm b','middle');
    const count=C.text(k,545,184,'count = 5','sm b','middle');
    const owner=C.text(k,280,84,'unguarded','sm b','middle');
    const reg=C.text(k,95,300,'registers are private; count is shared','sm');
    return{a,b,count,owner,guard,reg};
  },(s,k,r)=>{
    const p=s.p,ax=[98,98,243,388,388,98,388,388,388][p],bx=[98,98,98,243,388,98,98,243,388][p];
    r.a.set({x:ax,y:105,sub:['r = 5','r = 5','r = 6','r = 6','r = 6','r = 5','r = 6','r = 6','r = 6'][p],tone:p===4?'bad':'info'});
    r.b.set({x:bx,y:183,sub:['r = —','r = 5','r = 5','r = 6','r = 6','wait','wait','r = 7','r = 7'][p],tone:p===4?'bad':p>=7?'ok':'warn'});
    r.count.set('count = '+[5,5,5,6,6,5,6,6,7][p]);
    C.show(r.guard,p>=5);r.owner.set(p<5?'unguarded':p<7?'mutex owner: A':'mutex owner: B');
    r.reg.set(p===4?'two increments requested; only one survives':'registers are private; count is shared');
  });
  const baton=C.stage('Ownership must end on every path','A mutex baton represents permission; no FIFO or thread-ownership rule is implied.',k=>{
    C.path(k,'M75 158 Q320 65 565 158','--mut');
    C.text(k,88,116,'CALLER A','sm b');C.text(k,485,116,'CALLER B','sm b');
    const a=k.chip(null,{x:65,y:142,w:110,label:'A',sub:'lock()'});
    const b=k.chip(null,{x:465,y:142,w:110,label:'B',sub:'lock()',tone:'warn'});
    C.path(k,'M224 139 V225 H416 V139','--acc2');
    C.text(k,320,127,'CRITICAL SECTION','sm b','middle');
    const key=C.group(k);C.rect(k,-13,-23,26,46,'--acc2',key);C.text(k,0,4,'●','sm b','middle',key);
    C.path(k,'M278 215 V288 H122','--warn');C.text(k,53,310,'exception / return','sm');
    C.path(k,'M361 215 V288 H534','--acc2');C.text(k,459,310,'cleanup / unlock','sm');
    const cleanup=C.group(k);C.rect(k,-44,-14,88,28,'--acc2',cleanup);C.text(k,0,4,'finally','sm b','middle',cleanup);
    const status=C.text(k,320,91,'mutex free','sm b','middle');
    return{a,b,key,cleanup,status};
  },(s,k,r)=>{
    const p=s.p;
    r.a.set({x:[65,264,264,65,264,264,65,65][p],y:142,sub:['lock()','owns','throws','exited','owns','throws','exited','done'][p]});
    r.b.set({x:[465,465,465,465,465,465,465,264][p],y:142,sub:p===7?'owns':p>0?'waiting':'lock()',tone:p===3?'bad':p===7?'ok':'warn'});
    const xy=[[320,113],[320,199],[275,244],[195,288],[320,199],[320,244],[491,288],[320,199]][p];C.move(r.key,xy[0],xy[1]);
    C.move(r.cleanup,p===5?320:491,p===5?244:288,p>=4);
    r.status.set(['mutex free','A has the baton','exception path','baton stranded','cleanup registered','cleanup runs','mutex released','B can enter'][p]);
  });
  C.register(3,[
    C.scenario('race','Instruction rails','A chosen load/add/store interleaving loses an increment; then one mutex covers the whole update. Values are illustrative.',[
      'rA = count             // A loads 5',
      'rB = count             // B also loads 5',
      'rA += 1; rB += 1       // private registers become 6',
      'count = rA; count = rB // both store 6',
      'lock(m)               // acquire before reading',
      'count = count + 1     // entire update is guarded',
      'unlock(m)             // next caller can update'
    ],rails,[
      ['A loads','A copies shared state into a private register','A loads 5. Its register now holds a snapshot rather than a live reference to count.',0,[['shared count','5','info']]],
      ['B loads','B takes the same old snapshot','Before A stores a result, B also loads 5. Both increments are based on the same value.',1,[['register A/B','5 / 5','warn']]],
      ['A adds','A changes its register; shared count is still 5','Adding one to A’s private register makes 6, without publishing it to B.',2,[]],
      ['First store','A stores 6; B still computes from 5','A writes 6 to shared memory. B’s private register still produces its own 6.',3,[['shared count','6','info']]],
      ['Lost update','B overwrites A with the same value','B stores 6. Two requested increments have advanced the shared count by only one.',3,[['expected / actual','7 / 6','bad']],null,true],
      ['Acquire first','The mutex boundary must include the load','Replay with count 5: A locks before loading; B cannot take its snapshot inside this section yet.',4,[['owner','A','ok']]],
      ['A completes','A finishes the whole update before release','A loads, adds, and stores 6 under the same mutex, then unlocks.',5,[['shared count','6','ok']]],
      ['B acquires','B now reads A’s completed result','B acquires the same mutex and loads 6; its addition produces 7.',4,[['owner','B','ok']]],
      ['B completes','The protected total is now 7','B stores 7 and releases. Every shared access must obey the same synchronization discipline.',6,[['expected / actual','7 / 7','ok']],'Guard the whole invariant, including the read. Atomic increments suit a single independent counter.']
    ]),
    C.scenario('unlock','The ownership baton','An exception strands the lock; a cleanup guard makes both normal and exceptional exits return it.',[
      'lock(m)',
      'update_shared_state()   // may throw or return early',
      'unlock(m)               // skipped by an exception',
      'lock(m); register_cleanup(unlock(m))',
      'update_shared_state()   // cleanup on every exit',
      '// C++ RAII, Go defer, Python with, Java finally'
    ],baton,[
      ['Free','Both callers need the same mutex','A and B approach a shared critical section; only a successful lock permits entry.',0,[['mutex','free','info']]],
      ['Acquired','A takes permission; B waits','A acquires the mutex and enters. B’s lock call waits until the mutex becomes available.',0,[['owner','A','ok']]],
      ['Exceptional exit','A leaves through an exception path','The update throws before reaching the manual unlock statement.',1,[['A','exception','warn']]],
      ['Stranded','Leaving the function did not release the mutex','The baton is stranded. B remains blocked although A has stopped doing useful work.',2,[['B','blocked','bad']],null,true],
      ['Guarded retry','Register cleanup immediately after acquisition','Replay with a cleanup guard. Its lifetime covers every path leaving the critical section.',3,[['cleanup','registered','ok']]],
      ['Unwind','The exception now runs cleanup','The update throws again, but unwinding runs the registered release action.',4,[['unlock','runs','ok']]],
      ['Release','The baton returns to the mutex','Cleanup releases the mutex. It does not undo a partially completed update by itself.',5,[['mutex','available','ok']]],
      ['Next caller','B can acquire and continue','B’s successful acquisition permits entry. The mutex object must remain the same shared object.',0,[['owner','B','ok']],'Tie release to scope or cleanup. Also preserve invariants if an exception interrupts an update.']
    ])
  ],`<h3>The missing requests are an interleaving</h3>
<p>The original dashboard receives two million requests but displays a smaller total, with no crash or error. A shared counter is a useful place to see the problem because its intended invariant is precise: each request contributes one increment. Threads have their own stacks and registers while sharing the process heap. A value copied into one register does not automatically change when another thread writes the shared variable. The instruction rails expose that gap. The selected trace starts at 5 and ends at 6 after two increments; its values and scheduling are illustrative.</p>
<h3>Expand a compound operation</h3>
<p>The visual model expands count++ into load, add, and store. A loads 5; B loads 5; each computes 6; each stores 6. The later store has no record of the other increment, so it overwrites the same result. This can happen on one core through scheduling or on multiple cores through overlapping execution. Source syntax does not establish an indivisible operation. The rail model explains the lost-update symptom, but is not the full language semantics: in languages such as C++, an unsynchronized data race is undefined behavior. A program cannot rely on simply obtaining one of these neat interleavings.</p>
<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch03-critical.svg" alt="A mutex encloses read, modify and write, then releases before the next thread enters"><figcaption>The protected interval begins before the read and ends after the write.</figcaption></figure>
<h3>Protect an invariant with one shared mutex</h3>
<p>A mutex permits only one successful holder into the associated critical section at a time. The load belongs inside that section because it establishes the value on which the later write depends. Locking only the store leaves two threads free to compute from an old snapshot. Readers also need the synchronization required by the chosen design. Put the lock beside the data it protects and document which fields form one invariant. A balance and its transaction count, for example, may need to change together. Two unrelated locks do not create a common exclusion boundary.</p>
<p>Locking also establishes a memory-order relationship between participating accesses. Go documents that an Unlock synchronizes before a later successful Lock on the same mutex, and that a mutex must not be copied after first use. Its mutex is not associated with a particular goroutine, so the baton is a diagram of permission rather than a universal thread-ownership restriction. <a href="https://pkg.go.dev/sync#Mutex">Go’s sync.Mutex documentation</a> is the reference for those API rules. Other languages can require release by the acquiring thread; follow the actual primitive’s contract.</p>
<h3>Choose a boundary large enough for the decision</h3>
<p>A thread-safe map makes individual operations safe; it does not necessarily make a sequence of operations one transaction. The original containsKey followed by put is a check-then-act race: two callers can both find a key absent and start a load. Prefer an API that represents the whole decision, such as computeIfAbsent or a once primitive, while understanding its callback and failure rules. For filesystem creation, an exclusive-create operation can combine the existence decision with creation. A database uniqueness constraint remains useful when the invariant crosses process boundaries.</p>
<p>For one independent counter, an atomic increment can avoid an explicit mutex. For high contention, partitioning counts across threads reduces shared writes, with a deliberate policy for how reads aggregate them. A single atomic variable does not automatically protect a relationship across several fields. Start from the invariant rather than choosing a primitive because its name sounds faster.</p>
<h3>Return the baton on every exit</h3>
<p>The second scene follows a manual unlock that an exception skips. B waits even after A leaves the function, because the mutex’s state did not change. Scope-based cleanup expresses release as part of the resource lifetime: C++ uses RAII guards, Go commonly uses defer, Python uses a with statement, and Java commonly uses finally. Register cleanup immediately after successful acquisition. Keep the mutex object stable rather than copying a structure that embeds it. Releasing the lock is also separate from preserving data validity: cleanup does not roll back a half-finished update, so arrange mutation and failure handling to maintain the invariant.</p>
<h3>Measure races and contention separately</h3>
<p>A race detector observes conflicting unsynchronized accesses in an executed workload; it cannot prove that untested paths are safe. Run the original concurrent counter test and inspect the first report rather than treating a plausible total as evidence of correctness. Go explains this testing limitation in <a href="https://go.dev/doc/articles/race_detector">its race-detector guide</a>. For hangs, examine stacks blocked in Lock and audit early returns and exceptions. For slow but correct code, measure wait time and critical-section duration. Long I/O or unrelated computation under the mutex serializes callers unnecessarily. Kernel scheduling, runtime scheduling, and core availability affect which interleavings occur; correctness must survive all permitted ones.</p>`);
})();
