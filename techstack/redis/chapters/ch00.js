/* Chapter 0 "RESP and the Event Loop": two scenes and the Explain text (index 0, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Scene 1: bytes arrive in pieces and the query buffer waits for a full frame. Scene 2: many clients, one executor, one command at a time.
   Byte counts and timings are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;

  /* ---- 1. A frame is executed only when every byte is in the query buffer ---- */
  const FOOT_FRAME = 'Simplified: one client, one command of 33 bytes. Sizes illustrative.';
  const frame = {
    id: 'frame-wait', label: 'Frame waits for bytes', desc: 'One INCR arrives in three TCP reads. The parser keeps the partial bytes and runs the command only when the frame is complete.',
    codeLabel: 'RESP',
    code: { bug: [
      '*2\\r\\n$4\\r\\nINCR\\r\\n$4\\r\\nhits\\r\\n   # 33 bytes',
      '# read 1: 12 bytes  *2 CRLF $4 CRLF INCR',
      '# read 2: 12 bytes  CRLF $4 CRLF hits',
      '# read 3:  9 bytes  CRLF',
      '# frame complete -> executor runs INCR hits once',
    ] },
    scene: { w: W, h: H, footer: FOOT_FRAME, panels: [
      { id: 'net', x: 16, y: 58, w: 168, h: 290, title: 'TCP reads', tone: 'info' },
      { id: 'qb', x: 198, y: 58, w: 230, h: 290, title: 'Client query buffer', tone: 'info' },
      { id: 'ex', x: 442, y: 58, w: 182, h: 290, title: 'Executor', tone: 'info' },
    ], tokens: {
      r1: { label: 'read 1', sub: '12 bytes', tone: 'cursor', w: 120 },
      r2: { label: 'read 2', sub: '12 bytes', tone: 'cursor', w: 120 },
      r3: { label: 'read 3', sub: '9 bytes', tone: 'cursor', w: 120 },
      b1: { label: '12 / 33', sub: '*2 $4 INCR', tone: 'warn', w: 190 },
      b2: { label: '24 / 33', sub: '+ $4 hits', tone: 'warn', w: 190 },
      b3: { label: '33 / 33', sub: 'frame complete', tone: 'ok', w: 190 },
      cmd: { label: 'INCR hits', sub: 'runs once', tone: 'ok', w: 130 },
      val: { label: 'hits = 17,413', sub: 'atomic', tone: 'live', w: 130 },
    } },
    bug: [
      { log: 'One service sends INCR hits as a RESP array. The command is 33 bytes with the line endings, but TCP may deliver them in any number of reads.', callout: 'TCP delivers bytes, not commands', code: 0,
        at: {}, badge: { net: '33 bytes to send' }, stats: [{ l: 'command bytes', v: '33' }, { l: 'reads so far', v: '0' }] },
      { log: 'The first read brings 12 bytes. The query buffer appends them. *2 says two elements follow, but only INCR has arrived.', callout: 'The first 12 bytes: the frame is incomplete', code: 1,
        at: { r1: { x: 40, y: 110 }, b1: { x: 218, y: 110 } }, arrows: [['r1', 'b1', 'append']], badge: { net: 'read 1', qb: 'waiting' }, stats: [{ l: 'buffered', v: '12 / 33', cls: 'warn' }, { l: 'executed', v: '0' }] },
      { log: 'The second read adds 12 more bytes. The parser sees $4 hits has started but is not finished, so it still waits.', callout: 'Still partial: the parser does not guess', code: 2,
        at: { r2: { x: 40, y: 170 }, b2: { x: 218, y: 170 } }, arrows: [['r2', 'b2', 'append']], badge: { net: 'read 2', qb: 'waiting' }, stats: [{ l: 'buffered', v: '24 / 33', cls: 'warn' }, { l: 'executed', v: '0' }] },
      { log: 'The third read brings the last 9 bytes. The length prefixes now add up to exactly the bytes in the buffer.', callout: 'All 33 bytes are in: the frame is complete', moment: true, code: 3,
        at: { r3: { x: 40, y: 230 }, b3: { x: 218, y: 230 } }, arrows: [['r3', 'b3', 'append']], badge: { net: 'read 3', qb: 'complete' }, stats: [{ l: 'buffered', v: '33 / 33', cls: 'ok' }, { l: 'executed', v: '0' }] },
      { log: 'processInputBuffer hands the complete frame to the executor, which runs INCR hits once and leaves the query buffer empty.', callout: 'Only now does Redis execute the command', code: 4,
        at: { cmd: { x: 468, y: 130 }, val: { x: 468, y: 200 } }, arrows: [['cmd', 'val', 'INCR']], badge: { qb: 'empty', ex: 'one command' }, stats: [{ l: 'executed', v: '1', cls: 'ok' }, { l: 'half commands run', v: '0', cls: 'ok' }],
        takeaway: 'Redis never runs half a command. A short counter means a sender or proxy lost bytes.' },
    ],
  };

  /* ---- 2. One event loop, one executor: clients queue, commands run one at a time ---- */
  const FOOT_LOOP = 'Simplified: three clients, one executor. Timings illustrative.';
  const loop = {
    id: 'one-executor', label: 'One executor', desc: 'Three clients send at once. The event loop reads their frames, but commands run one at a time, so each is atomic.',
    codeLabel: 'Config',
    code: { bug: [
      '# redis.conf (defaults)',
      'client-query-buffer-limit 1gb',
      'io-threads 1          # with more, threads do socket I/O only',
      '# A, B and C each send INCR hits at the same moment',
      '# executor order: A, then B, then C',
    ] },
    scene: { w: W, h: H, footer: FOOT_LOOP, panels: [
      { id: 'cl', x: 16, y: 58, w: 150, h: 290, title: 'Clients', tone: 'info' },
      { id: 'q', x: 180, y: 58, w: 190, h: 290, title: 'Ready frames', tone: 'info' },
      { id: 'ex', x: 384, y: 58, w: 240, h: 290, title: 'Executor (one thread)', tone: 'info' },
    ], tokens: {
      a: { label: 'client A', sub: 'INCR hits', tone: 'cursor', w: 118 },
      b: { label: 'client B', sub: 'INCR hits', tone: 'cursor', w: 118 },
      c: { label: 'client C', sub: 'INCR hits', tone: 'cursor', w: 118 },
      qa: { label: 'A', sub: 'ready', tone: 'warn', w: 80 },
      qb: { label: 'B', sub: 'ready', tone: 'warn', w: 80 },
      qc: { label: 'C', sub: 'ready', tone: 'warn', w: 80 },
      run: { label: 'running A', sub: 'hits 0 -> 1', tone: 'live', w: 150 },
      run2: { label: 'running B', sub: 'hits 1 -> 2', tone: 'live', w: 150 },
      run3: { label: 'running C', sub: 'hits 2 -> 3', tone: 'live', w: 150 },
      done: { label: 'hits = 3', sub: 'no lost update', tone: 'ok', w: 150 },
    } },
    bug: [
      { log: 'Three clients send INCR hits at the same moment. Their bytes land in three separate query buffers.', callout: 'Three clients, three query buffers', code: 3,
        at: { a: { x: 32, y: 110 }, b: { x: 32, y: 180 }, c: { x: 32, y: 250 } }, stats: [{ l: 'clients', v: '3' }, { l: 'executors', v: '1' }] },
      { log: 'The event loop (epoll or kqueue) reads each socket and parses complete frames. All three are ready, so they queue for the executor.', callout: 'The event loop turns bytes into ready frames', code: 3,
        at: { a: { x: 32, y: 110 }, b: { x: 32, y: 180 }, c: { x: 32, y: 250 }, qa: { x: 232, y: 110 }, qb: { x: 232, y: 180 }, qc: { x: 232, y: 250 } },
        arrows: [['a', 'qa', 'parse'], ['b', 'qb', 'parse'], ['c', 'qc', 'parse']], stats: [{ l: 'ready frames', v: '3', cls: 'warn' }, { l: 'running', v: '0' }] },
      { log: 'The executor takes A first. Read, add one and write back happen with no other command in between, so no lock is needed.', callout: 'A runs alone: read, add, write', moment: true, code: 4,
        at: { qb: { x: 232, y: 180 }, qc: { x: 232, y: 250 }, run: { x: 424, y: 110 } }, badge: { ex: 'A now' }, stats: [{ l: 'hits', v: '1' }, { l: 'waiting', v: '2', cls: 'warn' }] },
      { log: 'B runs next on the same value. It sees 1 and writes 2. Redis never interleaves two commands.', callout: 'B runs next, on the value A left', code: 4,
        at: { qc: { x: 232, y: 250 }, run2: { x: 424, y: 170 } }, badge: { ex: 'B now' }, stats: [{ l: 'hits', v: '2' }, { l: 'waiting', v: '1', cls: 'warn' }] },
      { log: 'C runs last and the counter reads 3. Every increment was applied exactly once.', callout: 'C runs last: three increments, hits = 3', code: 4,
        at: { run3: { x: 424, y: 230 }, done: { x: 424, y: 290 } }, badge: { ex: 'C now' }, stats: [{ l: 'hits', v: '3', cls: 'ok' }, { l: 'lost updates', v: '0', cls: 'ok' }] },
      { log: 'The price is shared: while one command runs, B and C wait. A slow command delays every client, which is the subject of the next chapter.', callout: 'One executor: atomic, but shared by everyone',
        at: { run3: { x: 424, y: 230 }, done: { x: 424, y: 290 } }, badge: { ex: 'everyone waits' }, stats: [{ l: 'hits', v: '3', cls: 'ok' }],
        takeaway: 'One executor makes each command atomic. Everyone waits on the slowest one.' },
    ],
  };

  window.CHAPTER_OVERRIDES[0] = {
    explain: `<h3>1. Bytes, not messages</h3>
<p>A client sends a command and the network carries bytes. The server never gets a promise that one read equals one command. A command may arrive in one read or in ten, and one read may carry the end of one command and the start of the next. Everything Redis does with a socket starts from this fact.</p>

<h3>2. RESP says how long each part is</h3>
<p>RESP, the Redis serialization protocol, puts the length before the data. A command is an array of bulk strings. <code>INCR hits</code> is sent as <code>*2</code> (two elements follow), then <code>$4 INCR</code> and <code>$4 hits</code>, with a CRLF after each part, so 33 bytes in total. Because the length comes first, Redis can tell whether the bytes it holds make a whole command, and the data itself may be any binary value.</p>
<p>The length is counted in <b>bytes</b>, not characters. A client that declares 5 for a 6-byte value such as <code>héllo</code> makes Redis stop inside a character, find no CRLF where it expects one, and close the connection with a protocol error.</p>

<h3>3. The query buffer keeps the unfinished frame</h3>
<p>Each client connection has its own query buffer. Bytes read from the socket are appended there. <code>processInputBuffer</code> consumes only complete frames and leaves a partial frame in place for the next read. Redis does not guess, and it does not run a command it has only half of. If the buffer grows past <code>client-query-buffer-limit</code> (1 GB by default), the connection is closed.</p>

<h3>4. One event loop, one executor</h3>
<p>The event loop (<code>ae.c</code>, on top of epoll or kqueue) is one thread. It reads ready sockets, parses frames and dispatches complete commands. Commands from all clients run on one executor, one at a time. Replies go into a per-client output buffer and are written when the socket can take them. Because no two commands overlap, <code>INCR</code> needs no lock, and a read-modify-write command is atomic by construction.</p>
<p><code>io-threads</code> only help with reading and writing sockets. They never execute commands, so adding them does not make a slow command faster.</p>

<h3>5. The trade-off: simple, and shared</h3>
<p>One executor makes the model easy to reason about, with no locks and no torn updates. The price is that every command is paid for by all clients, so a slow command delays everyone queued behind it (chapter 2). Input buffers also hold partial data for as long as a client is slow or stuck.</p>
<p>To find out where bytes went missing, compare what the client says it sent with <code>INFO commandstats</code> on the server. If the server counted fewer calls than the client sent and no error was reported, the loss happened before Redis: in a proxy, a client library or the network. Redis cannot produce a half command or run one twice on its own.</p>

<h3>6. Syntax</h3>
<pre># the wire format of INCR hits
*2\\r\\n$4\\r\\nINCR\\r\\n$4\\r\\nhits\\r\\n

# see per-client buffers and the executor's counters
CLIENT LIST                      # qbuf = query buffer bytes, omem = output buffer bytes
INFO commandstats                # calls per command
INFO clients</pre>
<p>In redis.conf, <code>client-query-buffer-limit</code> caps one client's query buffer, and <code>io-threads</code> sets how many threads serve socket I/O.</p>`,
    scenarios: [frame, loop],
  };
})();
