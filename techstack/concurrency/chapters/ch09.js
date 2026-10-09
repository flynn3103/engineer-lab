/* Account history lenses and concurrent doctor transactions. */
(function () {
  const {text,rect,line,path,group,move,show,stage,scenario,register}=window.CScene;
  const report=stage('Account history / report read positions','Illustrative history: atomic writer, then both report reads share one snapshot.',k=>{
    text(k,30,119,'account A'); text(k,30,179,'account B');
    line(k,118,120,590,120,'--acc'); line(k,118,180,590,180,'--acc2');
    const a=[],b=[];
    [160,350,540].forEach((x,i)=>{line(k,x,92,x,207); if(i===0)text(k,x,86,'initial','sm mut','middle');a.push(text(k,x,123,'100','b sm','middle'));b.push(text(k,x,183,'100','b sm','middle'));});
    const ra=group(k),rb=group(k); rect(k,-34,-24,68,43,'--acc',ra).style.fill='none'; rect(k,-34,-24,68,43,'--acc2',rb).style.fill='none';
    const snap=group(k); path(k,'M-47 102 L-47 94 L47 94 L47 207 L-47 207 L-47 199','--ok',snap); text(k,0,228,'one snapshot','sm','middle',snap);
    const labels=[text(k,350,86,'debit only','sm mut','middle'),text(k,540,86,'credit done','sm mut','middle')];
    rect(k,66,258,508,70,'--mut'); text(k,82,279,'REPORT READ RECEIPTS','b sm');
    return {a,b,ra,rb,snap,labels,ar:text(k,82,302,'A = ?'),br:text(k,228,302,'B = ?'),total:text(k,430,302,'sum = ?','b sm')};
  },({p},k,r)=>{
    const replay=p>=5;
    [100,replay?100:90,90].forEach((v,i)=>r.a[i].set(String(v))); [100,100,110].forEach((v,i)=>r.b[i].set(String(v)));
    r.labels[0].set(replay?'uncommitted':'debit only'); r.labels[1].set(replay?'atomic commit':'credit done');
    move(r.ra,p>=6?160:350,120,p>=2); move(r.rb,p>=6?160:350,180,p>=3);
    move(r.snap,160,0,p>=6);
    r.ar.set('A = '+(p>=6?'100':p>=2?'90':'?')); r.br.set('B = '+(p>=6?'100':p>=3?'100':'?'));
    r.total.set('sum = '+(p>=8?'200':p===4?'190':'?'));
  });
  const skew=stage('Two doctors / two overlapping transactions','Illustrative schedule. Serializable replay chooses T1 to commit and retries T2.',k=>{
    text(k,24,114,'T1: Alice','b sm'); text(k,24,204,'T2: Bob','b sm');
    [132,222].forEach(y=>{line(k,135,y,604,y); [178,356,552].forEach(x=>line(k,x,y-6,x,y+6));});
    text(k,178,89,'read roster','sm mut','middle'); text(k,356,89,'own row','sm mut','middle'); text(k,552,89,'commit','sm mut','middle');
    const dep=group(k); path(k,'M195 145 L515 208 M195 208 L515 145','--bad',dep); text(k,320,183,'read/write cycle','sm','middle',dep);
    const a=k.chip(k.layer,{x:126,y:115,w:104,h:34,label:'read 2',tone:'info'}),b=k.chip(k.layer,{x:126,y:205,w:104,h:34,label:'read 2',tone:'info'});
    text(k,24,282,'COMMITTED ROSTER','b sm'); rect(k,186,257,164,59,'--acc'); rect(k,372,257,164,59,'--acc2');
    const aa=text(k,268,280,'Alice','sm','middle'),bb=text(k,454,280,'Bob','sm','middle');
    return {a,b,dep,aa,bb,as:text(k,268,302,'ON','b sm','middle'),bs:text(k,454,302,'ON','b sm','middle'),count:text(k,556,297,'2 ON','b sm','middle')};
  },({p},k,r)=>{
    const ax=[126,126,126,304,500,500,126,500,500][p],bx=[126,126,126,126,304,500,126,500,304][p];
    r.a.set({x:ax,label:p>=4&&p<=5||p>=7?'commit':p===3?'off (local)':'read 2',tone:p>=4?'ok':'info'});
    r.b.set({x:bx,show:p>=2,label:p===7?'abort':p===8?'stay on':p===5?'commit':p===4?'off (local)':'read 2',tone:p===5?'bad':p===7?'warn':p===8?'ok':'info'});
    show(r.dep,p>=3&&p<=5||p===7);
    const aliceOff=p>=4&&p<=5||p>=7,bobOff=p===5;
    r.as.set(aliceOff?'OFF':'ON');r.bs.set(bobOff?'OFF':'ON');r.count.set(bobOff?'0 ON':aliceOff?'1 ON':'2 ON');
  });
  register(9,[
    scenario('report','Half-done transfer','Read receipts expose a half-transfer, then an atomic writer and a shared report snapshot (illustrative).',[
      'UPDATE A SET balance = 90; COMMIT;  -- separate debit',
      'a = read(A); b = read(B);           -- observes 90 + 100',
      'UPDATE B SET balance = 110; COMMIT; -- separate credit',
      '# replay: both UPDATEs belong to one writer transaction',
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
      'a = read(A); b = read(B);           -- same report snapshot',
      'COMMIT; publish(a + b);'
    ],report,[
      ['Initial history','A correct total starts at 100 plus 100.','The initial account history has A=100 and B=100. These balances and the schedule are illustrative.',0,[['initial total','200','ok']]],
      ['Debit committed','Separate commits expose the debit without the credit.','The writer commits A=90 independently. B remains at 100, so this is already a committed half-transfer.',0,[['committed total','190','warn']]],
      ['Read A','The report captures the new balance of A.','A report read reaches the debit-only point and records 90. One accurate read cannot guarantee a consistent business operation.',1,[['report A','90','warn']]],
      ['Read B','The report captures B before its credit.','The second read records B=100 before the independently committed credit. Its value is accurate at this point in the history.',1,[['report B','100','warn']]],
      ['Split operation','The report adds two correct reads into a wrong total.','The credit later reaches B=110, but the report already has 90+100. A single snapshot cannot repair a writer that commits only half its transfer.',2,[['report total','190','bad']],null,true],
      ['Atomic replay','Replay with both updates in one transaction.','Restart the illustrative history. A and B now become visible together at the atomic commit; the middle state is uncommitted.',3,[['writer commits','one','ok']]],
      ['Pin snapshot','Both report reads use the same committed history.','The read-only Repeatable Read transaction establishes its snapshot at its first query. Both read lenses point to the initial balances.',4,[['snapshot total','200','ok']]],
      ['Writer commits','A later commit does not move these read lenses.','The writer commits A=90 and B=110 together. The existing report still reads its original snapshot, rather than mixing old and new statements.',5,[['report A / B','100 / 100','ok']]],
      ['Report commits','Either complete transfer view gives a total of 200.','The report finishes with 200. A report snapshot taken after the atomic commit would instead read 90+110, also totaling 200.',6,[['report total','200','ok']],'Group the writer atomically, then give all report reads one consistent committed view.']
    ]),
    scenario('skew','Write skew','Two consistent snapshots permit disjoint updates that break one cross-row rule; replay serializably.',[
      'BEGIN ISOLATION LEVEL REPEATABLE READ;',
      'n = SELECT count(*) FROM doctors WHERE on_call;',
      'if n > 1: UPDATE my_doctor SET on_call = false;',
      'COMMIT;  -- two transactions write different rows',
      '# replay: BEGIN ISOLATION LEVEL SERIALIZABLE;',
      '# on SQLSTATE 40001: retry the entire transaction',
      '# new snapshot: n = 1, so keep the remaining doctor on call'
    ],skew,[
      ['Two on call','The rule requires at least one doctor on call.','Alice and Bob begin on call. Each transaction may go off call only if it observes someone else remaining.',0,[['on call','2','ok']]],
      ['T1 snapshot','Alice reads a stable snapshot with two doctors.','T1 reads Alice ON and Bob ON. Its own planned update to Alice appears safe in that snapshot.',1,[['T1 count','2','ok']]],
      ['T2 snapshot','Bob sees the same two-doctor roster.','T2 independently reads both doctors ON. Its snapshot is internally consistent, even though T1 plans to change a row it read.',1,[['T2 count','2','ok']]],
      ['T1 writes','Alice updates her row, based on Bob remaining on.','T1 changes only Alice in its private transaction. T2 already read the old Alice row, creating one read/write dependency.',2,[]],
      ['T1 commits','Alice is off; Bob still acts on his older snapshot.','T1 commits Alice OFF. T2 writes Bob OFF based on the snapshot that still showed Alice ON. The writes target different rows.',3,[['on call now','1','warn']]],
      ['T2 commits','Snapshot isolation lets both commit; nobody remains.','T2 also commits under snapshot isolation. Neither transaction overwrote the other row, yet their combined result violates the cross-row invariant.',3,[['on call','0','bad']],null,true],
      ['Serializable replay','Replay with serialization checking on both transactions.','Reset the roster to two doctors ON. The same overlapping reads now run inside Serializable transactions.',4,[['on call','2','ok']]],
      ['Reject cycle','One commit succeeds; the other must retry.','In this illustrative outcome T1 commits and T2 receives a serialization failure. The database can choose the victim; applications must handle either outcome.',5,[['T2','40001','warn'],['on call','1','ok']]],
      ['Retry whole unit','The retry observes one doctor and keeps Bob on call.','T2 restarts from BEGIN and repeats its reads. Its new snapshot counts one, so it does not perform the off-call update.',6,[['retry count','1','ok'],['on call','1','ok']],'A consistent snapshot is not a serial order: protect cross-row rules and retry the full transaction on failure.']
    ])
  ],`<h3>Atomic work and a consistent observer</h3>
<p>A transfer expresses one business operation with two row updates. The original incident describes a report observing the debit without its credit. Begin by establishing the writer's boundary: if the debit and credit commit independently, the database can contain a committed half-transfer. Even a perfectly consistent snapshot can read that state. Group both updates in one transaction so they become visible together or are rolled back together.</p>
<p>The reader has a boundary too. A report that reads several accounts in separate statements must say whether those statements belong to one view of the database. Correctness of each individual value is insufficient when the sum describes one instant. The drawing separates account history from report receipts so you can see which version each read actually selected.</p>
<h3>Snapshot means one view, not every guarantee</h3>
<p>In PostgreSQL, an ordinary Read Committed query reads a statement snapshot. Two statements in the same transaction may therefore see different commits. A single ordinary aggregate query over properly transactional updates can already provide the coherent view needed for this account sum. A multi-query report can use a read-only Repeatable Read transaction, whose snapshot is established at its first non-control statement. These PostgreSQL-specific meanings come from its <a href="https://www.postgresql.org/docs/current/transaction-iso.html">isolation documentation</a>.</p>
<p>In the replay, the writer commits 90 and 110 together while the existing report keeps reading 100 and 100. Both totals are 200. The snapshot need not show the freshest data to be internally consistent. However, this reasoning relies on the writer preserving the transfer invariant in every committed state; isolation cannot infer the business rule from two unrelated commits.</p>
<h3>Write skew passes the snapshot test</h3>
<p>The doctor example asks a stronger question: may independently sensible decisions combine into an impossible result? Alice and Bob each read a snapshot with two doctors on call. Alice updates her own row; Bob updates his. Under snapshot isolation their different writes may both commit. The final roster has nobody on call even though each decision used a stable snapshot.</p>
<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch09-skew.svg" alt="Alice reads Bob's old on-call row while Bob reads Alice's old row, creating a dependency cycle."/><figcaption>Disjoint writes can still depend on one another's old values.</figcaption></figure>
<p>Try both serial orders to diagnose the anomaly. If Alice finished first, Bob would see only himself remaining and stay on call. If Bob finished first, Alice would stay. Neither order yields both off. PostgreSQL Repeatable Read implements snapshot isolation, while Serializable adds dependency checking and may reject this outcome. Its <a href="https://wiki.postgresql.org/wiki/SSI">official SSI examples</a> demonstrate cross-row anomalies and the corresponding serialization failures.</p>
<h3>Locks and validation enforce different boundaries</h3>
<p>The original explanation uses a lock-based transfer: take the locks needed for both accounts and hold them until completion, while a conflicting observer waits. That is one way to enforce the boundary. It does not describe every database's default reader behavior. A row-locking solution must also identify every row on which its rule depends; protecting only the row being updated leaves the doctor example's other dependency uncovered.</p>
<p>A practical alternative is to make all competing decisions lock or update the same guard row before evaluating their rule. Every code path must follow that protocol, including administrative changes. Serializable checking offers another way to detect schedules that cannot fit a serial order. PostgreSQL's SSI read-dependency locks track conflicts rather than behaving like ordinary blocking row locks; inspect its <a href="https://www.postgresql.org/docs/current/explicit-locking.html">lock documentation</a> before assuming a reader must wait.</p>
<h3>Syntax must include the retry boundary</h3>
<p>The scene mixes PostgreSQL isolation declarations with explicitly illustrative pseudocode for the decision. For a serialization failure, retry from <code>BEGIN</code>, including the reads that chose the write. Retrying only the final update preserves the stale decision. Put external side effects behind an idempotent or post-commit delivery boundary so an aborted attempt does not send a duplicate email or payment.</p>
<p>Use a unique constraint for a unique seat or identifier and a conditional update for a rule about one row. Neither automatically covers a rule about several rows. Choose the transaction boundary by the invariant, then choose isolation or locking that actually protects that boundary.</p>
<h3>Observe histories, conflicts, and retries</h3>
<p>Record transaction identifiers, isolation levels, query start times, commit outcomes, and SQLSTATE codes. Reproduce the doctor case with a barrier after both reads so the race is deterministic. Verify the invariant after both transactions finish, including any whole-transaction retries. An abort is evidence that protection worked; repeated aborts, long transactions, and retry storms are operational symptoms to measure separately from incorrect committed data.</p>`);
})();
