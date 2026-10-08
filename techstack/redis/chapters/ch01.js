/* Chapter 1 "Command Cost and the Single Thread": two scenes and the Explain text (index 1, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Scene 1: one KEYS call holds the executor while a GET waits, then SCAN steps let the GET through.
   Scene 2: DEL frees a huge sorted set on the executor, UNLINK frees it on a lazyfree thread. Timings and counts are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;

  /* ---- 1. KEYS is one long turn on the executor; SCAN is many short ones ---- */
  const FOOT_KEYS = 'Simplified: not to scale. 5M keys and 1.2 s are illustrative.';
  const keys = {
    id: 'keys-block', label: 'KEYS holds the thread', desc: 'A cleanup cron runs KEYS over millions of keys. A GET sent a moment later cannot start until KEYS returns. SCAN gives the GET a turn between steps.',
    codeLabel: 'Commands',
    code: { bug: [
      'KEYS session:*                  # about 5M keys, O(N)',
      '# executor walks every key in one call',
      'GET cart:42                     # arrives 1 ms later, waits',
      '# KEYS returns after about 1.2 s (illustrative)',
      'SCAN 0 MATCH session:* COUNT 100   # many short steps',
      '# GET runs between two SCAN steps',
    ] },
    scene: { w: W, h: H, footer: FOOT_KEYS, panels: [
      { id: 'cl', x: 16, y: 58, w: 150, h: 290, title: 'Clients', tone: 'info' },
      { id: 'ex', x: 180, y: 58, w: 444, h: 290, title: 'Executor timeline (one thread)', tone: 'info' },
    ], tokens: {
      cron: { label: 'cron', sub: 'KEYS session:*', tone: 'cursor', w: 124 },
      cron2: { label: 'cron', sub: 'SCAN … COUNT 100', tone: 'cursor', w: 124 },
      get: { label: 'client 2', sub: 'GET cart:42', tone: 'warn', w: 124 },
      get2: { label: 'client 2', sub: 'GET cart:42', tone: 'ok', w: 124 },
      kb: { label: 'KEYS walks 5M keys', sub: 'nothing else runs', tone: 'warn', w: 330, h: 44 },
      gw: { label: 'GET waits', sub: '~1.2 s late', tone: 'warn', w: 96 },
      gr: { label: 'GET runs', sub: 'then', tone: 'live', w: 96 },
      s1: { label: 'SCAN', sub: '100 keys', tone: 'info', w: 70 },
      s2: { label: 'SCAN', sub: '100 keys', tone: 'info', w: 70 },
      g3: { label: 'GET', sub: '< 1 ms', tone: 'ok', w: 70 },
      s3: { label: 'SCAN', sub: '100 keys', tone: 'info', w: 70 },
      s4: { label: '… cursor 0', sub: 'done', tone: 'ok', w: 90 },
    } },
    bug: [
      { log: 'A cleanup cron sends KEYS session:*. The command is O(N) in the total number of keys, not in the number of matches.', callout: 'KEYS is O(N) over every key', code: 0,
        at: { cron: { x: 32, y: 110 } }, stats: [{ l: 'keys in keyspace', v: '5M' }, { l: 'KEYS cost', v: 'O(N)', cls: 'warn' }] },
      { log: 'The executor starts walking all 5 million keys in a single call. There is no point where it can stop and serve someone else.', callout: 'One call, one long turn', code: 1,
        at: { cron: { x: 32, y: 110 }, kb: { x: 200, y: 110 } }, arrows: [['cron', 'kb', 'KEYS']], badge: { ex: 'busy' }, stats: [{ l: 'executor', v: 'busy', cls: 'bad' }] },
      { log: 'A millisecond later client 2 sends GET cart:42. The command is accepted into the queue, but the executor is busy, so it waits.', callout: 'GET cart:42 waits behind KEYS', moment: true, code: 2,
        at: { cron: { x: 32, y: 110 }, kb: { x: 200, y: 110 }, get: { x: 32, y: 210 }, gw: { x: 200, y: 190 } }, arrows: [['get', 'gw', 'queued', 'bad']], badge: { ex: 'busy' }, stats: [{ l: 'GET wait', v: '~1.2 s', cls: 'bad' }, { l: 'executor', v: 'busy', cls: 'bad' }] },
      { log: 'KEYS returns after about 1.2 s (illustrative). Only now does the GET run. Every other queued client was delayed the same way.', callout: 'Every client times out together', code: 3,
        at: { get: { x: 32, y: 210 }, gr: { x: 200, y: 190 } }, badge: { ex: 'free again' }, stats: [{ l: 'p99 GET', v: '1200 ms', cls: 'bad' }, { l: 'SLOWLOG entries', v: '1', cls: 'warn' }] },
      { log: 'SLOWLOG recorded the KEYS call, but it did not interrupt it. SLOWLOG only reports after the fact.', callout: 'SLOWLOG names the culprit, it does not stop it', code: 3,
        at: { get: { x: 32, y: 210 }, gr: { x: 200, y: 190 } }, badge: { ex: 'free again' }, stats: [{ l: 'SLOWLOG entries', v: '1', cls: 'warn' }, { l: 'interrupted', v: 'no', cls: 'bad' }] },
      { log: 'The fix is a cursor. SCAN with COUNT 100 does a small step and returns the next cursor, so each turn on the executor is tiny.', callout: 'SCAN: a short turn, then a cursor', code: 4,
        at: { cron2: { x: 32, y: 110 }, s1: { x: 200, y: 110 }, s2: { x: 280, y: 110 } }, arrows: [['cron2', 's1', 'step']], badge: { ex: 'short turns' }, stats: [{ l: 'step time', v: '< 1 ms', cls: 'ok' }] },
      { log: 'The GET is queued between two SCAN steps and runs at once. Traffic is never blocked for long.', callout: 'The GET gets a turn between steps', moment: true, code: 5,
        at: { cron2: { x: 32, y: 110 }, get2: { x: 32, y: 210 }, s1: { x: 200, y: 110 }, g3: { x: 280, y: 110 }, s3: { x: 360, y: 110 }, s4: { x: 440, y: 110 } }, arrows: [['get2', 'g3', 'runs']], badge: { ex: 'interleaved' }, stats: [{ l: 'GET wait', v: '< 1 ms', cls: 'ok' }, { l: 'p99 GET', v: '3 ms', cls: 'ok' }],
        takeaway: 'Redis cannot pause a running command. Keep every command short: SCAN over KEYS, and read SLOWLOG before blaming the network.' },
    ],
  };

  /* ---- 2. Freeing memory is also work: DEL inline, UNLINK in the background ---- */
  const FOOT_DEL = 'Simplified: one sorted set of 4M members. Timings illustrative.';
  const del = {
    id: 'del-unlink', label: 'DEL vs UNLINK', desc: 'DEL frees a 4-million-member sorted set on the executor. UNLINK detaches the key at once and lets a lazyfree thread free the memory.',
    codeLabel: 'Commands',
    code: { bug: [
      'DEL lb:old        # sorted set, 4M members',
      '# executor frees every member before it returns',
      '# all clients wait; SLOWLOG: DEL lb:old, about 480 ms (illustrative)',
      'UNLINK lb:old     # detach now, free in the background',
      '# lazyfree thread frees the members',
    ] },
    scene: { w: W, h: H, footer: FOOT_DEL, panels: [
      { id: 'ks', x: 16, y: 58, w: 190, h: 290, title: 'Keyspace', tone: 'info' },
      { id: 'ex', x: 220, y: 58, w: 200, h: 290, title: 'Executor', tone: 'info' },
      { id: 'bg', x: 434, y: 58, w: 190, h: 290, title: 'Lazyfree thread', tone: 'info' },
    ], tokens: {
      key: { label: 'lb:old', sub: '4M members', tone: 'cursor', w: 140 },
      keyd: { label: 'lb:old', sub: 'detached', tone: 'delete', w: 140 },
      del: { label: 'DEL lb:old', sub: 'frees inline', tone: 'warn', w: 150 },
      free: { label: 'freeing 4M', sub: '~480 ms', tone: 'warn', w: 150 },
      c1: { label: 'GET', sub: 'waits', tone: 'warn', w: 100 },
      c2: { label: 'ZADD', sub: 'waits', tone: 'warn', w: 100 },
      un: { label: 'UNLINK lb:old', sub: 'detach only', tone: 'ok', w: 150 },
      free2: { label: 'freeing 4M', sub: 'off the executor', tone: 'live', w: 150 },
      c3: { label: 'GET', sub: 'runs now', tone: 'ok', w: 100 },
      gone: { label: 'memory back', sub: 'in the background', tone: 'ok', w: 150 },
    } },
    bug: [
      { log: 'A cleanup job holds an old leaderboard, a sorted set with 4 million members (illustrative). It decides to remove it.', callout: 'A 4-million-member sorted set must go', code: 0,
        at: { key: { x: 40, y: 110 } }, stats: [{ l: 'members', v: '4M' }] },
      { log: 'DEL removes the key and frees every member before it returns. The work runs on the executor.', callout: 'DEL frees every member on the executor', code: 1,
        at: { key: { x: 40, y: 110 }, del: { x: 245, y: 110 }, free: { x: 245, y: 170 } }, arrows: [['key', 'del', 'DEL']], badge: { ex: 'freeing' }, stats: [{ l: 'executor', v: 'busy', cls: 'bad' }] },
      { log: 'No other command runs during the free. A GET and a ZADD queue up behind it and every client on this Redis waits.', callout: 'Everyone waits for the free', moment: true, code: 2,
        at: { keyd: { x: 40, y: 110 }, free: { x: 245, y: 110 }, c1: { x: 270, y: 190 }, c2: { x: 270, y: 250 } }, badge: { ex: 'blocked' }, stats: [{ l: 'blocked', v: '~480 ms', cls: 'bad' }, { l: 'SLOWLOG', v: 'DEL lb:old', cls: 'warn' }] },
      { log: 'UNLINK does the cheap part on the executor: it removes the key from the keyspace. That takes microseconds.', callout: 'UNLINK detaches the key at once', code: 3,
        at: { key: { x: 40, y: 110 }, un: { x: 245, y: 110 } }, arrows: [['key', 'un', 'UNLINK']], badge: { ex: 'microseconds' }, stats: [{ l: 'blocked', v: 'microseconds', cls: 'ok' }] },
      { log: 'The members go to the lazyfree thread, which frees them in the background. The executor already moved on.', callout: 'The lazyfree thread does the slow part', code: 4,
        at: { keyd: { x: 40, y: 110 }, un: { x: 245, y: 110 }, free2: { x: 450, y: 110 }, c3: { x: 270, y: 190 } }, arrows: [['un', 'free2', 'free later']], badge: { bg: 'freeing', ex: 'serving' }, stats: [{ l: 'blocked', v: 'microseconds', cls: 'ok' }, { l: 'clients waiting', v: '0', cls: 'ok' }] },
      { log: 'Memory comes back after the background free finishes. lazyfree-lazy-user-del yes makes a plain DEL behave like UNLINK.', callout: 'The same memory returns, off the hot path',
        at: { keyd: { x: 40, y: 110 }, gone: { x: 450, y: 110 }, c3: { x: 270, y: 190 } }, badge: { bg: 'done', ex: 'serving' }, stats: [{ l: 'clients waiting', v: '0', cls: 'ok' }],
        takeaway: 'Freeing a big key is work too. Use UNLINK or lazyfree-lazy-user-del for large keys.' },
    ],
  };

  window.CHAPTER_OVERRIDES[1] = {
    explain: `<h3>1. The cost of one command is paid by everyone</h3>
<p>Redis executes commands on one thread, which makes each command atomic. The other side of that is that a command which takes a long time makes every other client wait. The useful question is not "is Redis fast?" but "how long does this command hold the thread?"</p>

<h3>2. Read the complexity, then the size</h3>
<p>The documentation lists a time complexity for every command. <code>GET</code> is O(1). <code>KEYS</code> is O(N) over all keys, and its cost follows the size of the keyspace, not the number of matches. <code>SMEMBERS</code> on a large set, <code>HGETALL</code> on a large hash, <code>LRANGE 0 -1</code> on a long list and <code>ZRANGE 0 -1</code> on a large sorted set all grow with the collection. A command that was cheap on the test data becomes the incident on the production data.</p>

<h3>3. Walk in steps with a cursor</h3>
<p><code>SCAN</code>, <code>HSCAN</code>, <code>SSCAN</code> and <code>ZSCAN</code> walk the data in small steps and return a cursor. <code>COUNT</code> is a hint for how much work one step does. Between steps other clients' commands run. A scan can show a key twice or miss one that changed during the scan, but it never freezes the server.</p>

<h3>4. Freeing memory is work</h3>
<p>Removing a key means freeing its memory, and for a huge collection that is a long job. <code>UNLINK</code> removes the key from the keyspace at once and lets a lazyfree background thread free the memory. A plain <code>DEL</code> frees inline, unless <code>lazyfree-lazy-user-del</code> is on. The same idea exists for expiry, eviction and server-side deletes in the other <code>lazyfree-*</code> settings.</p>

<h3>5. Long scripts and the slow log</h3>
<p>A Lua script or function runs without interruption, like one long command. <code>busy-reply-threshold</code> sets when Redis starts answering other clients with BUSY while a script runs. <code>SLOWLOG GET</code> lists commands whose execution time passed <code>slowlog-log-slower-than</code> (10000 microseconds by default). It records the time spent executing the command, not the time spent waiting in the queue, so the victims (GET, SET) rarely appear in it; the culprit does.</p>

<h3>6. The trade-off: no way to pause</h3>
<p>A single executor is simple and safe, but it cannot suspend a long command and come back to it. Redis does not interrupt a running KEYS or a running script. The fix is to keep each command's work bounded, to paginate with cursors, and to check <code>SLOWLOG</code> and <code>LATENCY</code> first when every client times out together, before blaming the network or the last deploy.</p>

<h3>7. Syntax</h3>
<pre># bounded work instead of KEYS
SCAN 0 MATCH session:* COUNT 100        # repeat with the returned cursor until it is 0
HSCAN user:42 0 COUNT 100
ZSCAN lb:2026 0 COUNT 100

# free large keys without stalling
UNLINK lb:old

# find the culprit
SLOWLOG GET 10
SLOWLOG RESET
LATENCY DOCTOR</pre>
<p>In redis.conf, <code>slowlog-log-slower-than</code> and <code>slowlog-max-len</code> control the slow log, and <code>lazyfree-lazy-user-del yes</code> makes DEL behave like UNLINK.</p>`,
    scenarios: [keys, del],
  };
})();
