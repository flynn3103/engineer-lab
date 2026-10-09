/* Bounded hopper and circulating permit coins. */
(function () {
  const C = window.CScene;
  const hopper = C.stage('Admission follows available space',
    'Illustrative rates; four drawn cells stand for a 100-page queue.',
    k => {
      C.text(k, 34, 91, 'crawler · 200/s', 'sm b');
      C.text(k, 486, 91, 'parser · 50/s', 'sm b');
      C.line(k, 34, 145, 198, 145, '--acc');
      C.line(k, 34, 155, 198, 155, '--acc');
      C.path(k, 'M204 138 L232 267 L428 267 L456 138', '--acc');
      C.line(k, 456, 229, 604, 229, '--acc2');
      C.line(k, 456, 239, 604, 239, '--acc2');
      C.text(k, 330, 294, 'buffer / shared queue', 'sm', 'middle');
      for (let i = 0; i < 4; i++) C.rect(k, 231 + i * 47, 218, 44, 35, '--mut');
      const gate = C.group(k);
      C.rect(k, -4, 0, 8, 58, '--warn', gate);
      const pages = Array.from({length: 7}, (_,i) =>
        k.chip(k.layer, {x:40,y:113,w:42,h:30,label:'P'+(i+1),show:false,small:true}));
      const count = C.text(k, 330, 316, '', 'sm b', 'middle');
      const rule = C.text(k, 330, 333, '', 'xs', 'middle');
      return {gate,pages,count,rule};
    },
    (s,k,r) => {
      const sets = [
        [[65,113],[115,113]],
        [[231,218],[278,218],[325,218],[372,218]],
        [[231,218],[278,218],[325,218],[372,218],[252,181],[302,181],[352,181]],
        [[231,218],[278,218],[325,218],[372,218],[252,181],[302,181],[352,181]],
        [[231,218],[278,218],[325,218],[372,218],[128,113]],
        [[231,218],[278,218],[325,218],[372,218],[128,113]],
        [[525,202],[278,218],[325,218],[372,218],[128,113]],
        [[525,202],[278,218],[325,218],[372,218],[231,218]]
      ];
      r.pages.forEach((pg,i) => {
        const a = sets[s.p][i]; pg.set({x:a?a[0]:40,y:a?a[1]:113,show:!!a,tone:s.p<4&&i>3?'bad':'info'});
      });
      C.move(r.gate, 195, 115, s.p>=4);
      r.gate.style.transform='translate(195px,115px) rotate('+(s.p===5?0:-90)+'deg)';
      r.count.set(['incoming work','net +150 pages/s','after 300s: 45,000 pages','newest page: ~900s wait','bounded admission: capacity 100','full: producer waits','parser returns one free slot','next page admitted'][s.p]);
      r.rule.set(s.p<4?'No capacity means no backpressure.':'Acquire free slot → push under mutex → publish item');
    });
  const permits = C.stage('A permit must make the return trip',
    'Three illustrative permits; coins represent counts, not runtime objects.',
    k => {
      C.path(k, 'M150 120 C275 79 424 79 474 156 C532 247 344 309 184 261 C80 230 80 160 150 120', '--acc');
      C.text(k, 94, 92, 'permit bank', 'sm b');
      C.text(k, 416, 92, 'handler', 'sm b');
      C.text(k, 254, 322, 'cleanup / return', 'sm b');
      C.rect(k, 86, 113, 137, 74, '--acc');
      C.rect(k, 413, 141, 115, 68, '--acc2');
      C.path(k, 'M504 218 L548 266 L585 266', '--bad');
      C.path(k, 'M547 286 L587 286 L579 312 L555 312 Z', '--bad');
      C.text(k, 567, 334, 'leaked', 'xs', 'middle');
      const coins = Array.from({length:3}, (_,i) => {
        const g=C.group(k);
        const c=k.el('circle',{cx:0,cy:0,r:15},g); c.style.fill=C.tint('--warn',35); c.style.stroke='var(--warn)';
        C.text(k,0,4,String(i+1),'sm b','middle',g); return g;
      });
      const request=k.chip(k.layer,{x:286,y:119,w:83,h:33,label:'request'});
      const free=C.text(k,155,205,'','sm b','middle');
      const scope=C.text(k,304,298,'','xs','middle');
      return {coins,request,free,scope};
    },
    (s,k,r) => {
      const pos=[
        [[119,150],[155,150],[191,150]],
        [[463,175],[155,150],[191,150]],
        [[565,280],[463,175],[191,150]],
        [[552,280],[574,280],[463,175]],
        [[550,280],[568,280],[586,280]],
        [[463,175],[155,150],[191,150]],
        [[306,275],[155,150],[191,150]],
        [[119,150],[155,150],[191,150]]
      ];
      pos[s.p].forEach((a,i)=>C.move(r.coins[i],a[0],a[1]));
      r.request.set({x:s.p===4?263:s.p===7?413:286,y:s.p===4?212:119,tone:s.p===4?'warn':'info'});
      r.free.set(['free = 3','free = 2','free = 1','free = 0','free = 0; all waiting','scoped acquire: free = 2','finally returns the coin','free = 3 again'][s.p]);
      r.scope.set(s.p<5?'Exception bypasses release: capacity disappears.':'Acquire first; release exactly once after successful acquire.');
    });
  C.register(5,[
    C.scenario('queue','Bounded hopper',
      'A faster crawler fills a hopper; bounding admission propagates backpressure (illustrative rates).',
      ['unbounded.put(page)                      // accepts every page',
       'growth = 200 - 50                        // pages per second',
       'empty = Semaphore(CAP); full = Semaphore(0)',
       'produce: empty.acquire(); lock(); push(page); unlock(); full.release()',
       'consume: full.acquire(); lock(); pop(); unlock(); empty.release()',
       '// Do not hold the queue mutex while awaiting a permit.'],
      hopper,[
        ['Arrivals','The crawler outruns the parser.','Illustrative: arrivals are 200 pages/s; parsing is 50 pages/s.',0,[['arrival','200/s'],['service','50/s']]],
        ['Accumulation','The difference stays in the hopper.','With no capacity limit, every second adds another 150 pages.',1,[['growth','+150/s','bad']]],
        ['Overflow','The queue stores overload as memory.','After 300 illustrative seconds, 45,000 pages are waiting in memory.',1,[['queued','45,000','bad']],null,true],
        ['Latency','The newest page sits behind all that work.','At 50 pages/s, draining 45,000 pages takes about 900s under steady service.',1,[['tail wait','~15 min','bad']]],
        ['Admission','A free-slot permit is required before push.','The mechanism now uses a 100-page bound; four drawn cells stand for that capacity.',2,[['capacity','100','ok']]],
        ['Full hopper','No free slot: the producer waits at the gate.','The producer waits before taking the queue mutex, allowing consumers to make space.',3,[['queued','100','warn'],['producer','waiting','warn']]],
        ['Drain one','Pop an item, then return one free-slot permit.','A parser removes one page under the mutex and releases empty to admit another page.',4,[['free slots','1','ok']]],
        ['Resume','One admission consumes the returned slot.','The waiting producer proceeds; at steady 50/s, 100 queued pages imply about 2s of queueing.',3,[['queued','≤100','ok'],['drain estimate','~2s']],
          'Bound admission to expose overload; protect queue mutations separately and design timeout/shutdown.']
      ]),
    C.scenario('leak','Permit return path',
      'Three failed handlers consume all permits; scoped cleanup restores circulation (illustrative).',
      ['permits.acquire()',
       'handle()                                // may throw',
       'permits.release()                       // skipped on exception',
       'permits.acquire()                       // outside try: may be interrupted',
       'try: handle()',
       'finally: permits.release()              // only after acquire succeeded'],
      permits,[
        ['Three permits','Each coin permits one handler in flight.','The illustrative pool starts with three available permits and no active handlers.',0,[['available','3','ok']]],
        ['Acquire','The first handler borrows a permit.','Acquire reduces availability to two; this permit must return when the handler ends.',0,[['available','2']]],
        ['First leak','An exception exits before release.','The first failed handler skips release; another handler acquires the next permit.',1,[['available','1','warn'],['leaked','1','bad']]],
        ['More failures','Failures keep shrinking usable capacity.','A second handler leaks its permit, and the third handler acquires the last one.',1,[['available','0','bad'],['leaked','2','bad']]],
        ['Pool stalled','All coins are stranded on the exception path.','The third handler also fails without cleanup; no active handler remains to return a permit.',2,[['available','0','bad'],['active','0'],['leaked','3','bad']],null,true],
        ['Scoped lifetime','Start a fresh scoped pool: acquire succeeds first.','In the corrected lifetime model, three permits exist again; acquire completes before entering try.',3,[['available','2'],['leaked','0','ok']]],
        ['Cleanup','Finally runs when the handler exits.','Normal completion or an exception reaches cleanup; the borrowed permit takes the return path.',5,[['release','exactly once','ok']]],
        ['Circulation','Capacity returns even when work fails.','Availability returns to three after cleanup, so later requests can enter the pool.',5,[['available','3','ok']],
          'Release exactly once after successful acquire; exceptions and cancellation must preserve the permit lifetime.']
      ])
  ],[
    '<h3>Overload has to go somewhere</h3>',
    '<p>The crawler and parser in the original example have different sustainable rates. If 200 pages arrive each second and only 50 leave, the difference accumulates at 150 pages per second. After five minutes the arithmetic gives 45,000 queued pages. These are illustrative constant rates, not a performance promise. A queue accepts work; it does not create parsing capacity. Increasing its capacity buys time before exhaustion while allowing older work to wait longer.</p>',
    '<p>The hopper makes this relationship visible. Pages move in faster than they move out until admission closes. Blocking the producer propagates pressure upstream. In another application the full policy might reject, drop, or defer work. The useful question is which caller sees overload, and whether that caller can respond to it.</p>',
    '<h3>Permits govern admission; a mutex governs mutation</h3>',
    '<p>A counting semaphore represents available permission to proceed. Successful acquire consumes a permit; release adds one and may let a waiting caller proceed. The coins are a teaching device: the runtime maintains a count rather than physical objects. A semaphore also does not enforce an owner that alone can return a permit. Those semantics make accounting part of the application contract. See the <a href="https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Semaphore.html">Java Semaphore API</a>.</p>',
    '<p>For a bounded queue, initialize empty to capacity and full to zero. A producer first reserves an empty slot, changes the queue under its mutex, then publishes a full permit. A consumer first reserves a full item, removes it under the mutex, then returns an empty permit. Multiple producers may be admitted simultaneously, so the counter does not replace protection of the queue structure.</p>',
    '<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch05-permits.svg" alt="A producer reserves empty space and publishes an item; a consumer reserves an item and returns space"><figcaption>Admission and queue mutation are separate responsibilities.</figcaption></figure>',
    '<h3>Count reservations as well as visible work</h3>',
    '<p>At stable boundaries, free queue slots plus queued items equals capacity. During an operation, a producer may have acquired an empty permit but not yet pushed, or a consumer may have acquired a full permit but not yet popped. Therefore the two semaphore counters alone need not sum to capacity at every intermediate instruction. Reservations explain the missing units. Review each transition: what was reserved, what data changed, and which corresponding permit is published afterward?</p>',
    '<p>Never acquire a possibly unavailable permit while holding the queue mutex if the opposite side needs that mutex to return the permit. That would stop the very operation required to wake the waiter. The animation puts the full gate before entry into the hopper for this reason.</p>',
    '<h3>Express lifetime in the syntax</h3>',
    '<p>The shown code is pseudocode that isolates the mechanism. A production queue implementation should handle interruption, cancellation, allocation failure, and shutdown without leaving a reservation stranded. Prefer a library bounded queue when its admission and closure policies fit. Its API already coordinates storage and waiting rather than asking every call site to rebuild that protocol.</p>',
    '<p>For a pool permit, the reliable shape is acquire, then try, then finally release. If acquisition fails or is interrupted before a permit is granted, cleanup must not invent one. If work throws after acquisition, cleanup must still return exactly one. A lexical resource scope can encode the same rule. The failure story shows capacity disappearing even though no handler remains active: low availability alone cannot distinguish legitimate busy work from leaks.</p>',
    '<h3>Choose a capacity from service and delay</h3>',
    '<p>At a steady 50 pages per second, 100 pages ahead of a new page take roughly two seconds to drain. Variable service times, bursts, and work already executing change that estimate. Little’s law relates average occupancy, effective throughput, and average time in a stable system; it does not guarantee a tail latency from a maximum capacity. Measure queue age as well as queue length, and include downstream service time in the end-to-end budget.</p>',
    '<p>A bound on active handlers does not automatically bound pending tasks. If every arrival creates a task that later waits on a semaphore, those waiting tasks can still consume unbounded memory. Put the admission policy at the point where work enters the system, and decide what happens when its wait budget expires.</p>',
    '<h3>Observe both accounting and progress</h3>',
    '<p>Track queue depth, oldest-item age, available permits, active holders, waiting callers, and completion rate together. A full queue with completions indicates backpressure; zero permits with zero active holders suggests broken lifetime accounting. Exercise handler failures and cancellation while checking that capacity returns. Also test closure when producers or consumers are asleep. A poison item or queue close must have an explicit protocol, so bounded waiting does not become a permanent shutdown stall.</p>'
  ].join(''));
})();
