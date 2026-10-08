/* Chapter 7 "Pipelining and Transactions": three scenes and the Explain text (index 7, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Scene 1: a pipeline lets another client run between two commands, MULTI/EXEC does not. Scene 2: WATCH retries under contention, a script does not.
   Scene 3: what MULTI does when a command fails. Balances, attempts and rates are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;

  /* ---- 1. A pipeline batches the network trips only; MULTI/EXEC runs the group back to back ---- */
  const FOOT_PIPE = 'Simplified: balances a = 100, b = 50, total 150. Illustrative.';
  const pipe = {
    id: 'pipeline-vs-multi', label: 'Pipeline vs MULTI', desc: 'Client A moves 10 credits with two pipelined commands. Client B reads between them and sees a total of 140. With MULTI/EXEC the two commands run back to back.',
    codeLabel: 'Commands',
    code: { bug: [
      '# client A, pipelined: one write, two commands',
      'DECRBY a 10 ; INCRBY b 10',
      '# client B, audit',
      'GET a -> 90 ; GET b -> 50      # sum 140',
      'MULTI ; DECRBY a 10 ; INCRBY b 10 ; EXEC   # nothing runs in between',
    ] },
    scene: { w: W, h: H, footer: FOOT_PIPE, panels: [
      { id: 'cl', x: 16, y: 58, w: 150, h: 290, title: 'Clients', tone: 'info' },
      { id: 'ex', x: 180, y: 58, w: 250, h: 290, title: 'Executor order', tone: 'info' },
      { id: 'bal', x: 444, y: 58, w: 180, h: 290, title: 'Balances', tone: 'info' },
    ], tokens: {
      ca: { label: 'client A', sub: 'pipeline of 2', tone: 'cursor', w: 120 },
      cb: { label: 'client B', sub: 'audit: GET a, b', tone: 'cursor', w: 120 },
      ca2: { label: 'client A', sub: 'MULTI … EXEC', tone: 'cursor', w: 120 },
      s1: { label: '1 DECRBY a 10', sub: 'from A', tone: 'info', w: 200 },
      s2: { label: '2 GET a, GET b', sub: 'from B, sees 140', tone: 'warn', w: 200 },
      s3: { label: '3 INCRBY b 10', sub: 'from A', tone: 'info', w: 200 },
      m1: { label: '1 EXEC block', sub: 'DECRBY a ; INCRBY b', tone: 'ok', w: 200 },
      m2: { label: '2 GET a, GET b', sub: 'from B, sees 150', tone: 'ok', w: 200 },
      b0: { label: 'a = 100, b = 50', sub: 'sum 150', tone: 'ok', w: 140 },
      b1: { label: 'a = 90, b = 50', sub: 'sum 140', tone: 'warn', w: 140 },
      b2: { label: 'a = 90, b = 60', sub: 'sum 150', tone: 'ok', w: 140 },
    } },
    bug: [
      { log: 'Client A pipelines DECRBY a 10 and INCRBY b 10 in one write. This saves a round trip, but to the server they are still two separate commands.', callout: 'A pipeline batches trips, not commands', code: 1,
        at: { ca: { x: 32, y: 110 }, b0: { x: 464, y: 110 } }, stats: [{ l: 'total a+b', v: '150', cls: 'ok' }] },
      { log: 'The executor runs DECRBY a 10 first. Balance a is now 90 while b is still 50.', callout: 'First command applied, second not yet', code: 1,
        at: { ca: { x: 32, y: 110 }, s1: { x: 204, y: 110 }, b1: { x: 464, y: 110 } }, arrows: [['s1', 'b1', 'apply']], stats: [{ l: 'total a+b', v: '140', cls: 'bad' }] },
      { log: 'Client B runs its audit at that moment. Its GET a and GET b are queued after the first command and before the second, so they run in between.', callout: 'B runs between the two commands', moment: true, code: 3,
        at: { ca: { x: 32, y: 110 }, cb: { x: 32, y: 210 }, s1: { x: 204, y: 110 }, s2: { x: 204, y: 180 }, b1: { x: 464, y: 110 } }, arrows: [['cb', 's2', 'GET']], stats: [{ l: 'audit sum', v: '140', cls: 'bad' }] },
      { log: 'Then A\'s INCRBY b 10 runs and the total is 150 again. The audit already saw 140, and a spend from a in the same gap could have made a negative.', callout: 'The total is back to 150, the audit saw 140', code: 1,
        at: { ca: { x: 32, y: 110 }, cb: { x: 32, y: 210 }, s1: { x: 204, y: 110 }, s2: { x: 204, y: 180 }, s3: { x: 204, y: 250 }, b2: { x: 464, y: 110 } }, arrows: [['s3', 'b2', 'apply']], stats: [{ l: 'total a+b', v: '150', cls: 'ok' }, { l: 'audit saw', v: '140', cls: 'bad' }] },
      { log: 'MULTI queues both commands and EXEC runs them back to back. The executor takes the whole block as one turn, with no other client\'s command in the middle.', callout: 'MULTI/EXEC: one block, back to back', code: 4,
        at: { ca2: { x: 32, y: 110 }, m1: { x: 204, y: 110 }, b2: { x: 464, y: 110 } }, arrows: [['ca2', 'm1', 'EXEC']], stats: [{ l: 'commands in block', v: '2', cls: 'ok' }] },
      { log: 'B\'s GET commands run before the block or after it, never in between, so the audit always sees 150.', callout: 'The audit always sees 150', code: 4,
        at: { ca2: { x: 32, y: 110 }, cb: { x: 32, y: 210 }, m1: { x: 204, y: 110 }, m2: { x: 204, y: 180 }, b2: { x: 464, y: 110 } }, arrows: [['cb', 'm2', 'GET']], stats: [{ l: 'audit sum', v: '150 always', cls: 'ok' }],
        takeaway: 'Pipelining is for speed, not for grouping. Dependent writes belong in MULTI/EXEC or a script.' },
    ],
  };

  /* ---- 2. WATCH is optimistic: under contention most attempts abort ---- */
  const FOOT_WATCH = 'Simplified: six checkouts on one hot key. Success rate illustrative.';
  const CL = Array.from({ length: 6 }, (_, i) => ({ id: 'c' + i, label: 'C' + (i + 1) }));
  const watch = {
    id: 'watch-retry', label: 'WATCH retry storm', desc: 'Many checkouts WATCH one hot key. Only one EXEC per round succeeds, the others get nil and retry. A Lua script does the check and decrement in one step.',
    codeLabel: 'Commands',
    code: { bug: [
      'WATCH stock:9',
      'GET stock:9              -> "4"',
      'MULTI ; DECR stock:9 ; EXEC',
      'EXEC -> (nil)            # stock:9 changed after WATCH, retry',
      '# script: read stock:9, check > 0, DECR, as one atomic step',
      'EVALSHA <sha> 1 stock:9  # no WATCH, no retry',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_WATCH,
      header: s => ({ left: 'six clients · one key stock:9', right: s.r || '' }),
      setup(kit) {
        const strip = kit.strip(null, { x: 40, y: 98, items: CL, w: 54, h: 32, gap: 8 });
        const note = kit.text(null, { x: 40, y: 158, t: '', cls: 'mut sm' });
        const bars = kit.bars(null, { x: 40, y: 200, w: 560, labelW: 150, rowH: 30, max: 21, title: 'Round trips to finish six checkouts', items: [{ id: 'all', label: 'attempts' }, { id: 'ok', label: 'that succeeded' }] });
        const res = kit.chip(null, { x: 40, y: 300, w: 560, h: 46, label: '', sub: '', tone: 'info', show: false });
        return { strip, note, bars, res };
      },
      frame(s, kit, R) {
        CL.forEach((c, i) => {
          const t = (s.tones || [])[i] || 'info';
          R.strip['c' + i].set({ tone: t, hl: t === 'live' });
        });
        R.note.set(s.note || '');
        R.bars.set('all', s.all || 0, s.all > 6 ? 'bad' : 'info', String(s.all || 0));
        R.bars.set('ok', s.okc || 0, 'ok', String(s.okc || 0));
        R.res.set({ show: !!s.res, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'info' });
      },
    },
    bug: [
      { log: 'Six checkouts each WATCH stock:9, read it and queue DECR in a MULTI. They all read the same value, 4, at the same moment.', callout: 'Six clients WATCH the same key', code: 0,
        state: { tones: ['info', 'info', 'info', 'info', 'info', 'info'], note: 'All six read stock:9 = 4.', all: 6, okc: 0, r: 'round 1' }, stats: [{ l: 'clients', v: '6' }, { l: 'key', v: 'stock:9' }] },
      { log: 'C1 sends EXEC first. The key is unchanged since its WATCH, so the transaction runs and stock:9 becomes 3.', callout: 'C1 wins: the key is unchanged', code: 2,
        state: { tones: ['live', 'info', 'info', 'info', 'info', 'info'], note: 'stock:9 is now 3.', all: 6, okc: 1, r: 'round 1' }, stats: [{ l: 'stock:9', v: '3' }, { l: 'succeeded', v: '1 of 6', cls: 'warn' }] },
      { log: 'C2 to C6 each send EXEC, but stock:9 changed after their WATCH. EXEC finds the change, aborts, returns nil and runs nothing.', callout: 'The other five get nil', moment: true, code: 3,
        state: { tones: ['live', 'warn', 'warn', 'warn', 'warn', 'warn'], note: 'Five EXEC calls returned nil.', all: 6, okc: 1, r: 'round 1' }, stats: [{ l: 'EXEC', v: 'nil x5', cls: 'bad' }] },
      { log: 'The five clients retry from WATCH and GET. Again only one of the five can win, and four abort. Under contention the work grows like a staircase.', callout: 'Retries: one winner per round', code: 3,
        state: { tones: ['ok', 'live', 'warn', 'warn', 'warn', 'warn'], note: 'Round 2: five retry, one wins.', all: 11, okc: 2, r: 'round 2' }, stats: [{ l: 'attempts so far', v: '11', cls: 'bad' }, { l: 'succeeded', v: '2', cls: 'warn' }] },
      { log: 'It takes 21 attempts for six checkouts, and the retries all hit the same hot key. With hundreds of clients most attempts abort (illustrative: 15% succeed).', callout: '21 attempts to finish six checkouts', code: 3,
        state: { tones: ['ok', 'ok', 'ok', 'ok', 'ok', 'ok'], note: 'Rounds of 6, 5, 4, 3, 2, 1 attempts.', all: 21, okc: 6, res: '6 + 5 + 4 + 3 + 2 + 1 = 21 attempts', resSub: 'the client does the retrying', resTone: 'warn', r: 'done' }, stats: [{ l: 'attempts', v: '21', cls: 'bad' }, { l: 'succeeded', v: '6', cls: 'ok' }] },
      { log: 'A Lua script does the read, the check that stock is above zero and the DECR as one atomic step on the server. No WATCH, no nil, no retry.', callout: 'A script: check and DECR in one step', code: 5,
        state: { tones: ['ok', 'ok', 'ok', 'ok', 'ok', 'ok'], note: 'Each client sends one EVALSHA.', all: 6, okc: 6, res: 'EVALSHA: 6 calls, 6 successes', resSub: 'stock never goes below zero', resTone: 'ok', r: 'script' }, stats: [{ l: 'attempts', v: '6', cls: 'ok' }, { l: 'retries', v: '0', cls: 'ok' }],
        takeaway: 'WATCH suits low contention. For a hot key, move the read-decide-write into a script.' },
    ],
  };

  /* ---- 3. MULTI: a queueing error aborts everything, an execution error rolls back nothing ---- */
  const FOOT_ERR = 'Simplified: one transaction of three commands.';
  const err = {
    id: 'multi-errors', label: 'MULTI and errors', desc: 'A command that fails while queueing makes EXEC abort with EXECABORT. A command that fails while running does not undo the others: Redis has no rollback.',
    codeLabel: 'Commands',
    code: { bug: [
      'MULTI',
      'SET a 1                 -> QUEUED',
      'INCR (no key)           -> (error) wrong number of arguments',
      'EXEC                    -> (error) EXECABORT, nothing ran',
      '# second case: SET s "text" ; INCR s ; SET b 2',
      'EXEC -> OK, error, OK   # INCR failed, the others were applied',
    ] },
    scene: { w: W, h: H, footer: FOOT_ERR, panels: [
      { id: 'q', x: 16, y: 58, w: 290, h: 290, title: 'Queued in MULTI', tone: 'info' },
      { id: 'r', x: 334, y: 58, w: 290, h: 290, title: 'EXEC result', tone: 'info' },
    ], tokens: {
      q1: { label: 'SET a 1', sub: 'QUEUED', tone: 'info', w: 160 },
      q2: { label: 'INCR', sub: 'error: no arguments', tone: 'warn', w: 160 },
      q3: { label: 'SET b 2', sub: 'QUEUED', tone: 'info', w: 160 },
      abort: { label: 'EXECABORT', sub: 'nothing ran', tone: 'warn', w: 200 },
      e1: { label: 'SET s "text"', sub: 'QUEUED', tone: 'info', w: 160 },
      e2: { label: 'INCR s', sub: 'QUEUED, valid syntax', tone: 'info', w: 160 },
      e3: { label: 'SET b 2', sub: 'QUEUED', tone: 'info', w: 160 },
      r1: { label: 'OK', sub: 'applied', tone: 'ok', w: 200 },
      r2: { label: 'ERR not an integer', sub: 'failed at run time', tone: 'warn', w: 200 },
      r3: { label: 'OK', sub: 'applied anyway', tone: 'ok', w: 200 },
    } },
    bug: [
      { log: 'After MULTI, each command is checked as it is queued. SET a 1 is valid and Redis replies QUEUED.', callout: 'Commands are validated as they are queued', code: 1,
        at: { q1: { x: 36, y: 110 } }, stats: [{ l: 'queued', v: '1' }] },
      { log: 'The next command is INCR with no key, so it is malformed. Redis replies with an error at queueing time and marks the transaction as failed.', callout: 'A malformed command is rejected on the spot', code: 2,
        at: { q1: { x: 36, y: 110 }, q2: { x: 36, y: 170 } }, stats: [{ l: 'queueing error', v: '1', cls: 'bad' }] },
      { log: 'A valid third command is queued, but the transaction is already marked as failed. EXEC returns EXECABORT and runs none of the three.', callout: 'EXEC aborts: nothing runs', moment: true, code: 3,
        at: { q1: { x: 36, y: 110 }, q2: { x: 36, y: 170 }, q3: { x: 36, y: 230 }, abort: { x: 380, y: 140 } }, arrows: [['q2', 'abort', 'EXEC', 'bad']], stats: [{ l: 'applied', v: '0', cls: 'ok' }] },
      { log: 'Second case: all three commands are valid. SET s "text", INCR s and SET b 2 are queued without any error, because Redis cannot know yet that s is not a number.', callout: 'All three queue fine', code: 4,
        at: { e1: { x: 36, y: 110 }, e2: { x: 36, y: 170 }, e3: { x: 36, y: 230 } }, stats: [{ l: 'queued', v: '3' }] },
      { log: 'EXEC runs them back to back. INCR s fails, because s holds text, but this is a run-time error. The commands before and after it are applied.', callout: 'A run-time error does not roll back', moment: true, code: 5,
        at: { e1: { x: 36, y: 110 }, e2: { x: 36, y: 170 }, e3: { x: 36, y: 230 }, r1: { x: 360, y: 110 }, r2: { x: 360, y: 170 }, r3: { x: 360, y: 230 } }, arrows: [['e1', 'r1', ''], ['e2', 'r2', ''], ['e3', 'r3', '']], stats: [{ l: 'applied', v: '2 of 3', cls: 'warn' }, { l: 'rolled back', v: 'none', cls: 'bad' }],
        takeaway: 'MULTI/EXEC is isolation, not rollback. Validate inputs first, or use a script that checks before it writes.' },
    ],
  };

  window.CHAPTER_OVERRIDES[7] = {
    explain: `<h3>1. Several commands are not one unit</h3>
<p>A client that sends several commands is not sending one operation. To Redis, each command is a separate turn on the single executor, and commands from other clients can be placed between them. This is what bit the loyalty feature: two writes that must move together were two separate turns.</p>

<h3>2. Pipelining: fewer round trips, nothing more</h3>
<p>A pipeline sends many commands without waiting for each reply, and reads the replies afterwards. That removes most of the network latency of a batch, often making it several times faster. It gives no atomicity and no isolation: the server still runs each command on its own, and other clients can interleave. Replies for a very large pipeline are buffered on the server, so send it in batches.</p>

<h3>3. MULTI/EXEC: one block, back to back</h3>
<p>After <code>MULTI</code>, commands are queued and answered with <code>QUEUED</code>. <code>EXEC</code> runs the whole queue back to back, with no other client's command in the middle. A command that is malformed when queued (wrong number of arguments, unknown command) marks the transaction as failed, and <code>EXEC</code> returns <code>EXECABORT</code> and runs nothing. A command that fails when it runs, such as <code>INCR</code> on a text value, does <b>not</b> roll back the others. Redis has no rollback, and the commands before and after it are applied.</p>
<p>Inside a transaction you cannot read a value and then decide: the commands are queued blind.</p>

<h3>4. WATCH: optimistic locking</h3>
<p><code>WATCH key</code> before <code>MULTI</code> remembers the key. If it changes before <code>EXEC</code>, <code>EXEC</code> returns nil and nothing runs, and the client has to start again. This is correct, and cheap while collisions are rare. Under contention on one hot key, most attempts abort, clients retry, and the retries land on the same key, so the round trips pile up.</p>

<h3>5. Scripts and functions: decide on the server</h3>
<p><code>EVAL</code>, <code>EVALSHA</code> and <code>FCALL</code> run Lua logic as one atomic step. The script can read a value, check a condition and write, with no other client in between and no retry loop. That makes it the usual answer for a compare-and-decrement on a hot key. The cost is the one from chapter 2: while a script runs, the executor serves nobody else, so keep scripts short and pass keys as arguments so a cluster can route them.</p>

<h3>6. The trade-off: choose by dependency and contention</h3>
<p>Pipelines suit independent commands. A group that must not be interleaved needs <code>MULTI</code>/<code>EXEC</code>. A group that depends on a value it reads needs <code>WATCH</code> at low contention, or a script at high contention. MULTI has no retries but cannot read mid-way, and WATCH can starve. A script is often the simplest safe choice, with the price of running on the executor.</p>

<h3>7. Syntax</h3>
<pre># pipeline: one write, many commands (client library feature, or redis-cli --pipe)

MULTI
DECRBY a 10
INCRBY b 10
EXEC

WATCH stock:9
GET stock:9
MULTI
DECR stock:9
EXEC                     # nil if stock:9 changed since WATCH

EVAL "local n = tonumber(redis.call('GET', KEYS[1])); if n and n > 0 then return redis.call('DECR', KEYS[1]) end; return -1" 1 stock:9</pre>
<p>Load a script once with <code>SCRIPT LOAD</code> and call it by hash with <code>EVALSHA</code> to avoid sending the source each time.</p>`,
    scenarios: [pipe, watch, err],
  };
})();
