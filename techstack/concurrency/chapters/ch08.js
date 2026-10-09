/* Actor mailboxes and an explicit transfer protocol. */
(function () {
  const {text,rect,line,path,group,move,show,stage,scenario,register}=window.CScene;
  function mailbox(k,x,y,label,color) {
    rect(k,x,y,160,102,color); path(k,`M${x} ${y+26} Q${x+80} ${y-14} ${x+160} ${y+26}`,color);
    line(k,x+16,y+38,x+144,y+38,color); text(k,x+80,y+22,label,'b sm','middle');
    line(k,x+24,y+102,x+24,y+122,color); line(k,x+136,y+102,x+136,y+122,color);
  }
  function envelope(k,label,color) {
    const g=group(k); rect(k,0,0,110,36,color,g); path(k,'M0 0 L55 18 L110 0',color,g);
    const t=text(k,55,27,label,'sm','middle',g); return {g,t};
  }
  const transfer=stage('Two private balances; one unfinished transfer','Illustrative balances. Persistent protocol state is required across actor restarts.',k=>{
    mailbox(k,38,100,'Account A','--acc'); mailbox(k,442,100,'Account B','--acc2');
    const a=text(k,118,223,'balance 100','b sm','middle'),b=text(k,522,223,'balance 100','b sm','middle');
    text(k,320,91,'messages can disappear','sm mut','middle');
    const lost=group(k); path(k,'M0 0 L22 22 M22 0 L0 22','--bad',lost); move(lost,310,151,false);
    rect(k,38,249,564,84,'--mut'); text(k,52,268,'TRANSFER RECEIPTS  /  persistent protocol state','b sm');
    line(k,52,278,588,278); line(k,318,278,318,322);
    const pending=text(k,52,298,'A pending: none'),receipt=text(k,336,298,'B applied IDs: none');
    const status=text(k,52,319,'No recovery record yet.','sm mut');
    return {a,b,pending,receipt,status,lost,msg:envelope(k,'credit 10','--acc'),ack:envelope(k,'ACK T7','--acc2')};
  },({p},k,r)=>{
    r.a.set('balance '+([100,90,90,90,100,90,90,90,90][p])); r.b.set('balance '+(p>=6?110:100));
    const pos=[[72,149],[210,149],[282,149],[282,149],[72,149],[248,149],[466,149],[466,149],[466,149]][p];
    move(r.msg.g,...pos,p!==0&&p!==3&&p!==4&&p!==8); r.msg.t.set(p>=5?'credit T7':'credit 10');
    move(r.ack.g,p===8?76:286,p===8?149:190,p>=6); move(r.lost,p===6?326:310,p===6?197:151,p===2||p===6);
    r.pending.set('A pending: '+(p>=5&&p<8?'T7 / 10':'none'));
    r.receipt.set('B applied IDs: '+(p>=6?'T7':'none'));
    r.status.set(['Initial total = 200.','Naive debit: no pending record.','Credit lost; there is nothing to replay.','The missing 10 has no owner or receipt.','Replay from the initial balances.','Persist debit + pending together; retry T7.','Persist credit + receipt together; ACK lost.','Same T7: acknowledge without another credit.','ACK received: clear pending; total = 200.'][p]);
  });
  const asks=stage('Mailbox queues behind a running handler','Illustrative schedule. A blocked handler stalls; ask itself can be asynchronous.',k=>{
    text(k,170,88,'ACTOR A','b sm','middle'); text(k,470,88,'ACTOR B','b sm','middle');
    [70,370].forEach(x=>{rect(k,x,102,200,104,'--acc'); for(let i=0;i<3;i++)line(k,x+8,128+i*25,x+192,128+i*25); text(k,x+100,120,'mailbox / waiting','sm','middle'); rect(k,x,247,200,64,'--acc2'); text(k,x+100,267,'one current handler','sm','middle');});
    const ga=group(k),gb=group(k); [ga,gb].forEach(g=>{rect(k,0,0,204,12,'--bad',g); path(k,'M10 0 L22 12 M38 0 L50 12 M66 0 L78 12 M94 0 L106 12 M122 0 L134 12 M150 0 L162 12 M178 0 L190 12','--bad',g);});
    move(ga,68,218,false); move(gb,368,218,false);
    return {ga,gb,a:text(k,170,332,'ready','sm','middle'),b:text(k,470,332,'ready','sm','middle'),ma:envelope(k,'Q from B','--acc2'),mb:envelope(k,'Q from A','--acc')};
  },({p},k,r)=>{
    const blocked=p>=1&&p<=3; show(r.ga,blocked); show(r.gb,p>=2&&p<=3);
    r.a.set(blocked?'waiting for B':p>=4?'returns to mailbox':'ready'); r.b.set(p>=2&&p<=3?'waiting for A':p>=4?'returns to mailbox':'ready');
    const ay=[149,149,149,174,149,273,149,273][p],by=[149,149,149,174,149,273,149,273][p];
    move(r.ma.g,115,ay,p>=2); move(r.mb.g,415,by,p>=1);
    r.ma.t.set(p>=6?'reply to A':'Q from B'); r.mb.t.set(p>=6?'reply to B':'Q from A');
  });
  register(8,[
    scenario('transfer','Lost credit message','Follow a lost credit, then replay with durable pending state and duplicate receipts (illustrative).',[
      'debit(A, 10); send(B, Credit(10))  # naive: no record',
      '# lost credit cannot be reconstructed',
      'persist_atomic(A.debit(10), pending[T7])',
      'retry send(B, Credit(T7, 10)) until business_ack(T7)',
      'on Credit(id,n): persist_atomic(credit_if_new(id,n), receipt[id])',
      'on duplicate(id): send ACK(id)  # no second credit',
      'on ACK(id): persist clear_pending(id)'
    ],transfer,[
      ['Initial state','Each actor owns only its own balance.','Both accounts begin at 100. The illustrative total is 200; neither actor owns a transaction over both accounts.',0,[['total','200','ok']]],
      ['Naive debit','A debits first and sends a credit message.','A reaches 90 before the credit is delivered. Serial handling inside A does not protect the unfinished transfer.',0,[['A','90','warn']]],
      ['Message lost','A sent a message; B did not apply it.','The credit disappears between mailboxes. A successful send is not a business acknowledgement from B.',1,[['delivered','no','bad']]],
      ['No receipt','Ten units are missing, with nothing to retry.','B remains at 100. With neither a pending record nor a receipt, the naive protocol has forgotten the missing credit.',1,[['total','190','bad']],null,true],
      ['Replay protocol','Replay the same transfer with recorded progress.','Reset the illustration to 100 and 100. This second run adds protocol state that is persisted across actor restarts.',2,[]],
      ['Pending debit','Keep T7 pending while the credit is unconfirmed.','A atomically persists the debit and pending transfer T7. It may retry the same identifier without creating a new transfer.',2,[['pending','T7','warn']]],
      ['Credit recorded','B credits once; its acknowledgement is lost.','B atomically persists its balance of 110 and receipt T7. The ACK is lost, so A must still consider the outcome uncertain.',4,[['B','110','ok'],['pending','T7','warn']]],
      ['Duplicate arrives','The same ID finds the already recorded receipt.','A resends T7. B finds its durable receipt, leaves the balance at 110, and sends another business acknowledgement.',5,[['credits applied','1','ok']]],
      ['Receipt returned','Only a recorded outcome clears the pending debit.','A receives ACK T7 and persists removal of the pending record. Progress also requires eventual delivery and a live receiver.',6,[['total','200','ok']],'Local ownership prevents races; durable IDs, receipts, and retries handle an uncertain transfer.']
    ]),
    scenario('ask','Two asks, frozen','Two blocking handlers strand queued requests; replay by returning and handling responses as messages.',[
      'on Start: send(peer, Question); blocking_wait(reply)  # stalls handler',
      '# both peers can wait while their questions remain queued',
      'on Start: send(peer, Question); return  # release handler',
      'on Question(from): send(from, Answer); return',
      'on Answer(value): update_private_state(value); return',
      '# async ask / response adapter can route an answer to this actor'
    ],asks,[
      ['Ready','One handler runs; the remaining messages wait.','Each actor processes its own mailbox serially. An idle handler can take the next queued request.',0,[['handlers blocked','0','ok']]],
      ['A waits','A sends a question and blocks its handler.','A waits synchronously for B. Its handler cannot return to the mailbox while this wait continues.',0,[['A handler','blocked','warn']]],
      ['B waits','B also blocks before processing the question.','B sends its own question and waits for A. Both questions have reached mailboxes whose current handlers are blocked.',1,[['handlers blocked','2','bad']]],
      ['Queues frozen','The answers cannot be produced by frozen handlers.','Queued requests cannot be handled, so neither actor can produce the needed answer. Even an incoming answer could not run a new actor handler.',1,[['requests handled','0','bad']],null,true],
      ['Replay async','Send the request, then return to the mailbox.','Replay using nonblocking handlers. An outstanding request is recorded as state rather than a synchronous wait on this handler.',2,[['handlers blocked','0','ok']]],
      ['Handle questions','Queued questions move into the free handlers.','Both actors can now consume the questions. Each sends an answer and returns without waiting for the other actor.',3,[]],
      ['Answers queued','Responses arrive as another pair of messages.','The responses enter the ordinary mailboxes. Correlation IDs and timeouts belong to the protocol when multiple asks are outstanding.',5,[['answers queued','2','ok']]],
      ['Handle answers','A free handler can consume the response.','Each actor handles its answer in a later turn. Timeout means the caller stopped waiting; it does not prove remote work stopped.',4,[['answers handled','2','ok']],'Keep the handler free: record outstanding work in state and consume its response in a later mailbox turn.']
    ])
  ],`<h3>One owner gives local ordering</h3>
<p>An actor combines private state, a mailbox, and a handler that processes messages one at a time. If only that handler changes a balance, two messages cannot run overlapping balance updates inside the same actor. This moves coordination into an explicit sequence of messages. The benefit depends on the ownership rule: exposing the actor's mutable data to another thread breaks the boundary even when the mailbox itself is correct.</p>
<p>Go channels can support a similar ownership discipline, but a channel does not automatically create an actor. Sending a pointer, slice, or map may leave both sides able to mutate the same storage. Send immutable values, make a copy, or transfer ownership with a clear rule that the sender stops using the object.</p>
<h3>A transfer crosses the ownership boundary</h3>
<p>The original account incident spans two private balances. A handles its debit correctly, while B never receives the credit. No local race detector can establish that both business effects happened. The useful question is which component remembers the unfinished work. A sender needs a pending transfer identifier; a receiver needs an outcome that can be recognized on a retry. The identifier denotes one business operation, not one network attempt.</p>
<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch08-transfer.svg" alt="Pending transfer retries reach a receiver that records one credit and returns an acknowledgement."/><figcaption>A pending sender record and a receiver receipt survive uncertainty between mailboxes.</figcaption></figure>
<h3>Receipts make retry a protocol</h3>
<p>First record A's debit and its pending item together. Then send <code>Credit(T7,10)</code>. B records the credit and the fact that T7 was applied together, then acknowledges the recorded outcome. If the acknowledgement disappears, A retries T7. B returns the receipt rather than applying another credit. Only after receiving the acknowledgement does A clear its pending item. Our drawing replays from the initial balances to show this complete progression.</p>
<p>These records must be durable if the promise includes recovery after a process restart. Updating a balance and its deduplication receipt separately leaves a crash window. Actor-local serialization alone does not provide durable exactly-once business effects. Retry also needs eventual communication, available actors, and a policy for permanently failed transfers. Receipt retention must cover the retry window. Akka's <a href="https://doc.akka.io/libraries/akka-core/current/general/message-delivery-reliability.html">delivery documentation</a> specifies ordinary sends as at most once and describes acknowledgement, retry, and duplicate detection as additional protocol work.</p>
<h3>Waiting can freeze the owner</h3>
<p>Suppose A's current handler sends a question to B and waits synchronously. B does the same before consuming A's question. The incoming questions sit behind handlers that cannot finish. The missing answers may never be produced; an already produced answer also cannot run an actor handler while that actor is blocked. This is a wait cycle expressed through mailboxes rather than mutexes.</p>
<p>An ask is not inherently a blocking operation. The failure is blocking inside the handler. Return after initiating the request, keep the correlation and pending state, and consume the response in a later turn. Akka's <a href="https://doc.akka.io/libraries/akka-core/current/typed/interaction-patterns.html">interaction patterns</a> show asynchronous request-response and response adaptation back into actor messages. A timeout resolves the local wait; it does not by itself cancel work at the peer.</p>
<h3>Syntax should expose the state machine</h3>
<p>The animation uses pseudocode, not an Akka or Go API. Names such as <code>persist_atomic</code> deliberately describe a required storage boundary. In real code, use the persistence library's transaction or event-processing guarantees and check exactly when it acknowledges durability. Model states such as pending, acknowledged, timed out, and compensating explicitly. Keep network callbacks from directly mutating actor state; route their result through a message.</p>
<h3>Observe progress and overload</h3>
<p>Inspect mailbox depth, oldest pending age, duplicate receipt hits, timeouts, and the number of unfinished transfers. A growing queue means arrivals outrun handling; a quiet queue with an old pending transfer may mean delivery or persistence stopped. Bound admission or provide back-pressure so overload is visible before memory is exhausted. Exercise lost requests, lost acknowledgements, duplicate delivery, and a restart between persistence and send. The expected observation is one recorded business effect and a recoverable outstanding item until its outcome is known.</p>`);
})();
