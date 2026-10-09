/* A durable log tape and the moving nodes behind ABA. */
(function () {
  const {text,rect,line,path,group,move,show,stage,scenario,register}=window.CScene;
  function record(k,label,color) {
    const g=group(k);rect(k,0,0,140,46,color,g);path(k,'M8 8 L16 8 M8 16 L16 16 M8 24 L16 24 M8 32 L16 32',color,g);
    const t=text(k,82,28,label,'sm','middle',g);return {g,t};
  }
  const wal=stage('Durable tape / crash boundary','Illustrative undo/redo protocol. Engine recovery and visibility rules differ.',k=>{
    text(k,42,86,'PERSISTENT LOG','b sm');text(k,432,86,'VOLATILE WRITER','b sm');
    rect(k,32,103,568,92,'--mut'); for(let x=44;x<590;x+=24){rect(k,x,109,8,5,'--mut');rect(k,x,184,8,5,'--mut');}
    const cut=line(k,408,95,408,332,'--bad');cut.style.strokeDasharray='6 6';
    const crash=group(k);path(k,'M0 0 L-10 20 L2 20 L-6 40 L19 12 L7 12 L16 0 Z','--bad',crash);text(k,25,24,'POWER CUT','b sm','start',crash);move(crash,429,203,false);
    rect(k,52,243,140,77,'--acc');rect(k,244,243,140,77,'--acc2');text(k,122,265,'DATA PAGE A','b sm','middle');text(k,314,265,'DATA PAGE B','b sm','middle');
    const scan=group(k);path(k,'M0 0 L0 66 M-7 0 L7 0 M-7 66 L7 66','--ok',scan);text(k,0,82,'recover','sm','middle',scan);
    return {crash,scan,change:record(k,'T7: old/new','--acc'),commit:record(k,'COMMIT T8','--ok'),write:k.chip(k.layer,{x:452,y:271,w:100,h:32,label:'write A',show:false}),a:text(k,122,297,'100','b','middle'),b:text(k,314,297,'100','b','middle'),note:text(k,42,228,'No durable recovery record.','sm')};
  },({p},k,r)=>{
    const a=[100,90,90,100,90,90,100,100,90,90][p],b=p===9?110:100;
    r.a.set(String(a));r.b.set(String(b));r.change.t.set(p>=7?'T8: old/new':'T7: old/new');
    move(r.change.g,p<3?432:54,127,p>=3);move(r.commit.g,p<7?432:228,127,p>=7);
    show(r.crash,p===2||p===5||p===8);move(r.scan,p===6?84:292,119,p===6||p===9);
    r.write.set({x:p===9?264:p===1||p===4||p===8?72:452,y:p===3?132:306,show:[1,3,4,8,9].includes(p),label:p===9?'write B':p===3?'append':'write A',tone:p===1?'bad':p===3?'info':'ok'});
    r.note.set(['No durable recovery record.','Naive write: A reached disk first.','No log: the half-transfer survives reboot.','Replay: flush old/new values before data.','A may reach disk; B can still be missing.','T7 has no durable COMMIT.','UNDO T7: restore the original balance.','New T8: flush changes and COMMIT.','Committed T8 may still have stale data pages.','REDO T8: restore the committed result.'][p]);
  });
  const aba=stage('Stack head / saved observation / removed nodes','Illustrative CAS schedule. Nodes stay allocated; reclamation needs its own protocol.',k=>{
    text(k,24,87,'THREAD 1','b sm');text(k,287,87,'LIVE STACK','b sm','middle');text(k,516,87,'REMOVED / HELD','b sm','middle');
    const a=k.chip(k.layer,{x:256,y:104,w:64,h:38,label:'A'}),b=k.chip(k.layer,{x:256,y:181,w:64,h:38,label:'B',tone:'warn'}),c=k.chip(k.layer,{x:256,y:258,w:64,h:38,label:'C',tone:'ok'});
    const nextAB=path(k,'M288 142 L288 181','--acc'),nextBC=path(k,'M288 219 L288 258','--acc2'),nextAC=path(k,'M302 142 C362 174 362 225 302 258','--ok');
    const head=group(k);line(k,0,0,82,0,'--acc',head);path(k,'M72 -6 L82 0 L72 6','--acc',head);
    text(k,0,-10,'HEAD','b sm','start',head);
    rect(k,24,105,166,112,'--mut');text(k,38,125,'SAVED BY T1','b sm');
    const saved=text(k,38,150,'head = A'),next=text(k,38,173,'next = B'),cas=text(k,38,199,'not attempted','sm');
    const stamp=text(k,38,248,'no version tag','sm');text(k,516,310,'not freed in this model','sm mut','middle');
    return {a,b,c,nextAB,nextBC,nextAC,head,saved,next,cas,stamp};
  },({p},k,r)=>{
    const ax=[256,256,484,484,256,256,256,256,256,484][p],ay=[104,104,104,104,104,104,104,104,104,104][p];
    const bx=[256,256,256,484,484,484,256,484,484,484][p];
    r.a.set({x:ax,y:ay,show:true});r.b.set({x:bx,y:181,show:true});r.c.set({x:256,y:258,show:true});
    show(r.nextAB,p<=1||p===6);show(r.nextBC,p<=2||p===6);show(r.nextAC,p===4||p===5||p===7||p===8);
    const hp=p===2?[162,200]:p===3||p===9?[162,277]:p===5?[390,200]:[162,123];move(r.head,...hp);
    r.saved.set(p===0?'head = ?':p===9?'head = (A,4)':p>=6?'head = (A,1)':'head = A');r.next.set(p===9?'next = C':p===0?'next = ?':'next = B');
    r.cas.set(p===5?'CAS succeeds':p===8?'CAS fails':p===9?'fresh CAS succeeds':'not attempted');
    r.stamp.set(p>=6?'HEAD stamp = '+(p===6?1:p===9?5:4):'no version tag');
  });
  register(10,[
    scenario('wal','Power cut mid-transfer','Follow an unlogged write, then illustrative undo and redo using durable log records.',[
      'write_page(A, 90)          # naive: no recovery information',
      '# power loss before writing B leaves 90 + 100',
      'append(T7, before=(100,100), after=(90,110)); flush_log()',
      'write_page(A, 90)          # log is already durable',
      '# crash without COMMIT: illustrative recovery undoes T7',
      'append(T8, changes); append(COMMIT_T8); flush_log()',
      '# crash after durable COMMIT: redo missing T8 page changes'
    ],wal,[
      ['Initial disk','Both pages are stable; the log is empty.','The illustrative accounts begin at 100 and 100. Data pages and the volatile writer have different survival properties.',0,[['disk total','200','ok']]],
      ['Unlogged write','A reaches disk before any recovery record.','The naive writer changes A to 90 without a durable record describing the transaction. B is still 100 on disk.',0,[['disk A / B','90 / 100','warn']]],
      ['Power lost','An unlogged half-transfer has no recovery recipe.','Power disappears before B is written. Reboot cannot reconstruct an intention that was never durably recorded.',1,[['disk total','190','bad']],null,true],
      ['Log first replay','Move the change record into the durable tape.','Replay from 100 and 100. This illustrative undo/redo protocol flushes T7 before any affected data page can reach persistent storage.',2,[['T7 log','durable','ok']]],
      ['Partial data','A may reach disk while B remains stale.','The durable T7 record contains before and after information. A reaches disk as 90; a crash at this point no longer loses the recovery recipe.',3,[['disk A / B','90 / 100','warn']]],
      ['No commit','The crash leaves T7 with no durable COMMIT.','The change record survives the power boundary, but the transaction did not durably commit. The model must remove its incomplete effects.',4,[['durable COMMIT','absent','warn']]],
      ['Undo T7','Recovery restores the uncommitted change.','The illustrative recovery scanner finds T7 without COMMIT and restores A to 100. The result is an entirely undone transfer.',4,[['disk total','200','ok']]],
      ['Commit T8','A new transfer records a durable commit decision.','Start T8 from the restored balances. Its change record and COMMIT are flushed before success is acknowledged, even if data pages remain old.',5,[['durable COMMIT','T8','ok']]],
      ['Committed crash','A commit can survive while a data page is stale.','Power fails with A=90 and B=100 on disk. T8 has a durable COMMIT, so recovery must preserve its committed result instead of undoing it.',6,[['disk total','190','warn']]],
      ['Redo T8','Recovery completes the durable committed result.','The scanner reapplies the necessary logged page changes, including B=110. Real engines track which changes are already present.',6,[['disk A / B','90 / 110','ok']],'Persist recovery information before data; a durable commit decision determines the complete recovered outcome.']
    ]),
    scenario('aba','Stack ABA','Moving A out and back makes an old head look unchanged; compare a version too, with separate lifetime protection.',[
      'old = head.load(); next = old.next  # save A and B; pause',
      '# T2 pops A, pops B, then pushes A: now A.next = C',
      'CAS(head, expected=A, desired=B)    # pointer-only comparison succeeds',
      '# replay: compare pointer + tag atomically',
      'old = head.load_pair()             # save (A,1)',
      '# every head change increments tag: current head is (A,4)',
      'CAS(head, expected=(A,1), desired=(B,2))  # fails',
      '# reload (A,4), safely read next=C, then retry with (C,5)'
    ],aba,[
      ['Initial stack','The live stack is A followed by B followed by C.','The head points to A. Nodes remain allocated throughout this illustrative schedule so it isolates ABA from use-after-free.',0,[['head','A','ok']]],
      ['T1 paused','T1 saves A and its next pointer B, then pauses.','Thread 1 saves the head and successor separately for a later compare-and-swap. Its saved B may cease to be the correct successor.',0,[['saved head / next','A / B','warn']]],
      ['Pop A','Another thread moves A out of the live stack.','Thread 2 pops A and holds it. The current head becomes B while Thread 1 retains its earlier observation.',1,[['current head','B','warn']]],
      ['Pop B','B is removed too; C is now the head.','Thread 2 pops B and holds it outside the stack. Both nodes remain allocated, but B no longer belongs to this live stack.',1,[['current head','C','warn']]],
      ['Push A back','The head is A again, but A now points to C.','Thread 2 pushes A onto C. A is the same pointer value that Thread 1 saved, while the intervening history changed its successor.',1,[['current chain','A → C','warn']]],
      ['Stale CAS','A pointer-only CAS wrongly installs the removed B.','Thread 1 compares only head=A and succeeds with desired=B. It resurrects a removed node using a stale successor; the live stack is corrupted.',2,[['CAS','succeeds','bad']],null,true],
      ['Tagged replay','Replay with one atomic pointer-and-version pair.','Reset to A→B→C and let Thread 1 save (A,1) and B. The version must be part of the same atomic comparison as the pointer.',4,[['saved pair','(A,1)','ok']]],
      ['Changed history','The same pop, pop, push produces head (A,4).','All three successful head changes increment the tag. A has returned, but its tag exposes the intervening changes.',5,[['current pair','(A,4)','warn']]],
      ['Reject stale pair','The pointer matches; the saved version does not.','The CAS expects (A,1), so it fails against (A,4). The valid A→C chain is retained. Finite version counters still require a wraparound analysis.',6,[['CAS','fails','ok']]],
      ['Fresh retry','Reload the head and safely obtain the current next.','Thread 1 reloads (A,4), obtains C under the structure\'s lifetime protocol, and successfully changes the head to (C,5). A version tag alone does not protect freed memory.',7,[['current pair','(C,5)','ok']],'CAS checks the present value; tags expose intervening changes, while safe node lifetime needs its own protocol.']
    ])
  ],`<h3>A crash destroys the writer's memory</h3>
<p>The account transfer now crosses a persistence boundary. A data page can reach storage while another page remains only in memory. After power loss, the writer's program counter and intention disappear. Reading the surviving pages tells recovery what is there, but not which business operation was supposed to finish. The original incident loses ten units because it has neither a complete transfer nor durable information that can restore one.</p>
<p>Distinguish a modified buffer from a persistent data page. Write-ahead logging requires the relevant recovery record to be durable before the corresponding data page is allowed to become durable. It does not require flushing a log for every in-memory assignment. PostgreSQL's <a href="https://www.postgresql.org/docs/current/wal-intro.html">WAL introduction</a> explains this ordering and why durable log records let page writes happen later.</p>
<h3>The tape preserves a recovery decision</h3>
<p>Our scenario is an illustrative undo/redo protocol: its record contains enough before and after information to restore either complete outcome. With no durable commit decision, recovery removes T7's incomplete effects. With T8's durable commit, recovery reconstructs its complete result, including a missing B page. The power boundary destroys the volatile writer while leaving the flushed tape available to a new recovery process.</p>
<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch10-recovery.svg" alt="After a crash, durable records select undo for an incomplete transaction and redo for a committed one."/><figcaption>A simplified undo/redo decision; production engines also track page and recovery progress.</figcaption></figure>
<p>This is a teaching model, not a claim that every WAL engine physically undoes uncommitted pages in the same way. Oracle's <a href="https://docs.oracle.com/html/E25494_01/undo001.htm">undo documentation</a> describes undoing uncommitted changes during recovery. PostgreSQL combines WAL replay with transaction status and <a href="https://www.postgresql.org/docs/current/mvcc-intro.html">MVCC visibility</a>; its <a href="https://wiki.postgresql.org/wiki/Introduction_to_VACUUM%2C_ANALYZE%2C_EXPLAIN%2C_and_COUNT">vacuum explanation</a> describes version storage in place of an undo log. Recovery correctness need not mean physically erasing every aborted row version during restart. The invariant is a valid committed database state, not one universal recovery procedure.</p>
<h3>Commit acknowledgement and torn pages</h3>
<p>A durable commit acknowledgement must wait for the required log persistence. If power fails before an acknowledgement arrives, the client may not know whether the commit happened; recovery and client uncertainty are different problems. A transaction identifier or idempotent request still matters when the client retries. Asynchronous durability settings intentionally weaken what a returned success promises, so check the engine configuration rather than assuming every commit waits for storage.</p>
<p>A WAL record alone also does not make an arbitrary half-written page readable. PostgreSQL's <a href="https://www.postgresql.org/docs/current/runtime-config-wal.html#GUC-FULL-PAGE-WRITES">full-page-write documentation</a> explains protection against partial page writes by recording a page image on its first modification after a checkpoint. Storage flush errors and missing log segments require engine-specific failure handling; blindly retrying a syscall does not establish recovery correctness.</p>
<h3>CAS preserves a value, not its history</h3>
<p>The lock-free example crosses a different boundary: the time between observation and update. A compare-and-swap atomically checks whether the current head equals an expected value, then installs a desired value if it matches. Thread 1 saves A and successor B. Other threads pop A, pop B, and push A back onto C. The pointer is A again, but the correct successor has changed.</p>
<p>A pointer-only CAS from A to the saved B succeeds and reinstalls a node that was already removed. That is ABA. The animation keeps removed nodes allocated to show that the logical error does not require freed memory or address reuse. It is the unobserved history, not a non-atomic CAS instruction, that breaks the stack algorithm.</p>
<h3>Version syntax has a precise limit</h3>
<p>Compare the pointer and a version together, and change the version on every relevant head update. The replay compares saved <code>(A,1)</code> with current <code>(A,4)</code> and rejects the stale operation. Java's <a href="https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/AtomicStampedReference.html">AtomicStampedReference</a> provides an atomic reference-and-stamp comparison. The scene uses pseudocode rather than claiming that this pair fits every platform's native instruction.</p>
<p>A finite version can wrap; a proof must account for how long a saved observation can remain live. A tag also cannot make dereferencing a freed node safe. Hazard pointers, epochs, garbage collection, or another proven lifetime strategy address reclamation. Boost's <a href="https://www.boost.org/doc/libs/1_85_0/doc/html/lockfree/rationale.html">lock-free rationale</a> treats ABA prevention and memory management as related implementation concerns. Use a proven concurrent container when its contract fits.</p>
<h3>Observe the boundary that failed</h3>
<p>For recovery, test crashes before log flush, after log flush, before commit acknowledgement, and with incomplete page writes; inspect the recovered invariant. For a concurrent structure, force the delayed observation schedule and record successful updates, retries, and node retirement. Lock-free progress means system-wide progress under the algorithm's assumptions, not that every thread succeeds promptly. High CAS retry counts can explain poor performance even when the implementation is correct.</p>`);
})();
