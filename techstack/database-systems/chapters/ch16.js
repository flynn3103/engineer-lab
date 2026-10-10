/* Chapter 17 "Database Networking and Data Transfer" (index 16, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-721 L12 Database Networking (wire protocols, protocol design space, kernel bypass, user bypass).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes: packets in a pipe for fetch size, row against column results on the wire, N+1 statements, and the packet path with and without the kernel. Counts illustrative. */
(function () {
  const DB = window.DB;
  const SOURCE = { label: 'CMU 15-721 L12 Database Networking (notes in output/pdf/database-system)', href: '../../output/pdf/database-system/notes/12-networking.pdf' };

  /* ---- 1. Fetch size: how many rows ride in each packet before the server waits for the client ---- */
  const PX0 = 168, PX1 = 478, PYY = 150;
  const pipe = {
    id: 'fetch-size', label: 'Fetch size', desc: 'The query is done in 200 ms. The rows still have to cross a pipe, and each packet waits for the client to ask for the next one (round trip 0.011 ms, illustrative).',
    codeLabel: 'Driver',
    code: { bug: [
      'SELECT * FROM orders;   -- 1,000,000 rows, the query itself runs in 200 ms',
      'fetch size 1: the server sends 1 row, then waits for the client to ask again',
      'round trips = rows / fetch size = 1,000,000   ->   about 11 s of waiting',
      'fetch size 1,000: 1,000 round trips   ->   about 11 ms of waiting',
      'fetch size = all: one packet, but the client must hold 600 MB at once',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 1,000,000 rows, 600 bytes each, 0.011 ms per round trip. Illustrative.',
      header: s => ({ left: 'round trips ' + (s.trips || 0), right: 'fetch size ' + (s.fs || '-') }),
      draw(P, s) {
        P.box('srv', { x: 30, y: 100, w: 124, h: 120, tone: 'mut', label: '', sw: 2 });
        P.text('sl', { x: 92, y: 90, t: 'server', cls: 'mut sm', anchor: 'middle' });
        P.chip('sq', { x: 40, y: 120, w: 104, h: 40, label: 'query', sub: '200 ms, done', tone: 'ok' });
        P.chip('sr', { x: 40, y: 168, w: 104, h: 40, label: '1M rows', sub: 'ready', tone: s.idle ? 'warn' : 'info' });
        P.box('cli', { x: 492, y: 100, w: 124, h: 120, tone: 'mut', label: '', sw: 2 });
        P.text('cl', { x: 554, y: 90, t: 'client', cls: 'mut sm', anchor: 'middle' });
        P.chip('cs', { x: 502, y: 120, w: 104, h: 40, label: s.cli || 'waiting', sub: s.cliSub || '', tone: s.cliTone || 'info' });
        P.box('pipe', { x: PX0, y: PYY - 14, w: PX1 - PX0, h: 56, tone: 'mut', label: '', dash: true });
        if (s.pkt) P.chip('pkt', { x: s.pkt.x, y: PYY - 8, w: s.pkt.w, h: 44, label: s.pkt.label, tone: 'cursor', small: s.pkt.w < 60 });
        if (s.ask) P.chip('ask', { x: s.ask.x, y: PYY + 56, w: 110, h: 30, label: 'next, please', tone: 'warn', small: true });
        if (s.idleNote) P.chip('idl', { x: 30, y: 240, w: 260, h: 40, label: s.idleNote, tone: 'warn', small: true });
        if (s.mem != null) { P.box('mt', { x: 492, y: 236, w: 124, h: 40, tone: 'mut', label: '' }); P.box('mf', { x: 494, y: 238, w: Math.max(3, 120 * s.mem), h: 36, tone: s.mem > 0.7 ? 'bad' : 'ok', label: s.memLabel || '', cls: 'xs' }); P.text('mh', { x: 554, y: 230, t: 'client memory', cls: 'mut xs', anchor: 'middle' }); }
      }
    }),
    bug: [
      { log: 'A BI tool exports one million rows. The server finishes the query in 200 ms and holds the rows ready to send.', callout: 'The query is done in 200 ms', code: 0,
        state: {}, stats: [{ l: 'query', v: '200 ms', cls: 'ok' }, { l: 'export', v: '12 s', cls: 'bad' }] },
      { log: 'With fetch size 1, the server sends one row and stops. The packet carries a single row across the pipe.', callout: 'Fetch size 1: one row per packet', code: 1,
        state: { fs: '1', pkt: { x: 300, w: 40, label: '1 row' }, trips: 1, cli: 'row 1', cliSub: 'processing' }, stats: [{ l: 'rows per packet', v: '1', cls: 'bad' }] },
      { log: 'The client asks for the next row. While the request travels back, the server sits idle, and the pipe is mostly empty.', callout: 'The server waits for the client to ask', code: 1,
        state: { fs: '1', ask: { x: 300 }, trips: 2, idle: 1, cli: 'row 1', cliSub: 'asking', idleNote: 'server idle between rows' }, stats: [{ l: 'server', v: 'idle', cls: 'warn' }, { l: 'round trips', v: '2', cls: 'warn' }] },
      { log: 'Repeated a million times, that is 1,000,000 round trips. At 0.011 ms each the pipe spends about 11 seconds waiting, not moving data.', callout: '1,000,000 round trips: about 11 s of waiting', moment: true, code: 2,
        state: { fs: '1', pkt: { x: 360, w: 40, label: '1 row' }, trips: 1000000, cli: 'row n', cliSub: 'busy', idle: 1 }, stats: [{ l: 'round trips', v: '1,000,000', cls: 'bad' }, { l: 'waiting', v: '~11 s', cls: 'bad' }] },
      { log: 'With fetch size 1,000 a packet carries 1,000 rows. The same export needs only 1,000 round trips.', callout: 'Fetch size 1,000: one fat packet', code: 3,
        state: { fs: '1,000', pkt: { x: 230, w: 200, label: '1,000 rows' }, trips: 1000, cli: '1,000 rows', cliSub: 'batch', cliTone: 'ok', mem: 0.1, memLabel: '0.6 MB' }, stats: [{ l: 'round trips', v: '1,000', cls: 'ok' }, { l: 'waiting', v: '~11 ms', cls: 'ok' }, { l: 'client memory', v: '0.6 MB', cls: 'ok' }] },
      { log: 'Going to the other extreme, fetching everything in one packet, removes the waiting but makes the client hold all 1,000,000 rows, about 600 MB.', callout: 'Fetch everything: 600 MB in the client', code: 4,
        state: { fs: 'all', pkt: { x: 190, w: 280, label: '1,000,000 rows' }, trips: 1, cli: 'all rows', cliSub: '600 MB', cliTone: 'bad', mem: 1, memLabel: '600 MB' }, stats: [{ l: 'round trips', v: '1' }, { l: 'client memory', v: '600 MB', cls: 'bad' }],
        takeaway: 'Pick a fetch size that amortizes the round trip without making the client hold the whole result.' },
    ],
  };

  /* ---- 2. Row versus columnar transfer: where the cells are re-ordered ---- */
  const CT = ['t0', 't1', 't2'], CN = ['id', 'cu', 'am'];
  const posServer = (r, c) => ({ x: 44 + c * 44, y: 118 + r * 32 });
  const posWire = (i) => ({ x: 250 + (i % 6) * 28, y: 128 + Math.floor(i / 6) * 36 });
  const posClient = (r, c) => ({ x: 452 + c * 44, y: 118 + r * 32 });
  const cells = {
    id: 'row-vs-column', label: 'Rows or columns', desc: 'A result of 4 rows and 3 columns. A row protocol transposes the columns into rows for the wire and back into columns for the analytics tool. A columnar protocol sends the columns as they are (illustrative).',
    codeLabel: 'Driver',
    code: { bug: [
      'engine: result is held as column vectors (id, customer, amount)',
      'ODBC/JDBC: encode each row, each field with its own length prefix',
      'client: decode every field into a row object, one allocation per value',
      'analytics tool: transpose the rows back into columns',
      'Arrow / ADBC: send the column buffers as they are; the client reads them in place',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 12 cells stand for 1,000,000 rows x 20 columns. Illustrative.',
      header: s => ({ left: 'conversions ' + (s.conv || 0), right: s.right || 'column vectors in the engine' }),
      draw(P, s) {
        P.text('t1', { x: 44, y: 94, t: 'server: column vectors', cls: 'mut sm' });
        P.text('t2', { x: 250, y: 94, t: 'on the wire', cls: 'mut sm' });
        P.text('t3', { x: 452, y: 94, t: s.clientTitle || 'client', cls: 'mut sm' });
        P.box('pa', { x: 36, y: 100, w: 150, h: 138, tone: 'mut', label: '', dash: true });
        P.box('pb', { x: 238, y: 106, w: 178, h: 92, tone: 'mut', label: '', dash: true });
        P.box('pc', { x: 444, y: 100, w: 150, h: 138, tone: 'mut', label: '', dash: true });
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
          const idx = s.order === 'row' ? r * 3 + c : c * 4 + r;
          let p;
          if (s.at === 'wire') p = posWire(idx);
          else if (s.at === 'client') p = posClient(r, c);
          else p = posServer(r, c);
          P.box('c' + r + '_' + c, { x: p.x, y: p.y, w: s.at === 'wire' ? 24 : 40, h: s.at === 'wire' ? 28 : 26, tone: CT[c], label: s.at === 'wire' ? '' : CN[c] + (r + 1), cls: 'xs', sw: 1.2 });
        }
        if (s.frames === 'rows') for (let r = 0; r < 4; r++) P.box('fr' + r, { x: 448, y: 115 + r * 32, w: 138, h: 30, tone: 'bad', label: '', op: 0.25, stroke: 'bad', dash: true });
        if (s.frames === 'cols') for (let c = 0; c < 3; c++) P.box('fc' + c, { x: 450 + c * 44, y: 114, w: 44, h: 128, tone: 'ok', label: '', op: 0.2, stroke: 'ok', dash: true });
        if (s.note1) P.chip('n1', { x: 238, y: 214, w: 178, h: 36, label: s.note1, tone: s.n1Tone || 'warn', small: true });
        if (s.note2) P.chip('n2', { x: 444, y: 252, w: 166, h: 36, label: s.note2, tone: s.n2Tone || 'warn', small: true });
        if (s.note0) P.chip('n0', { x: 36, y: 252, w: 190, h: 36, label: s.note0, tone: 'ok', small: true });
        if (s.arr1) P.line('a1', 190, 170, 236, 170, { tone: 'cursor', arrow: true });
        if (s.arr2) P.line('a2', 418, 170, 442, 170, { tone: 'cursor', arrow: true });
      }
    }),
    bug: [
      { log: 'The engine holds the result as column vectors: all ids together, all customers together, all amounts together.', callout: 'The engine holds column vectors', code: 0,
        state: { at: 'server', order: 'col', note0: 'columns, as computed' }, stats: [{ l: 'layout', v: 'columnar', cls: 'ok' }] },
      { log: 'A row-oriented protocol must send tuples, so the server transposes the columns into rows and encodes every field with its own length prefix.', callout: 'The server transposes columns into rows', moment: true, code: 1,
        state: { at: 'wire', order: 'row', arr1: 1, conv: 1, note1: '20M prefixed fields', right: 'row protocol' }, stats: [{ l: 'conversions', v: '1', cls: 'warn' }, { l: 'fields encoded', v: '20,000,000', cls: 'bad' }] },
      { log: 'The client driver decodes each field and builds one object per row. A million rows means a million allocations.', callout: 'The client builds one object per row', code: 2,
        state: { at: 'client', order: 'row', frames: 'rows', arr2: 1, conv: 2, note2: '1,000,000 row objects', right: 'row protocol', clientTitle: 'client: row objects' }, stats: [{ l: 'conversions', v: '2', cls: 'warn' }, { l: 'allocations', v: '1,000,000', cls: 'bad' }] },
      { log: 'The analytics tool wants columns, so it transposes the rows back. The data went from columns to rows and back to columns for nothing.', callout: 'The tool transposes the rows back to columns', code: 3,
        state: { at: 'client', order: 'row', frames: 'cols', conv: 3, note2: 're-transposed: 12 s', n2Tone: 'bad', right: 'row protocol', clientTitle: 'client: dataframe columns' }, stats: [{ l: 'conversions', v: '3', cls: 'bad' }, { l: 'export time', v: '12 s', cls: 'bad' }] },
      { log: 'With a columnar protocol such as Arrow Flight SQL, the server sends its column buffers as they are. The order of the cells on the wire does not change.', callout: 'Columnar protocol: buffers go as they are', code: 4,
        state: { at: 'wire', order: 'col', arr1: 1, conv: 0, note1: 'column buffers, no framing', n1Tone: 'ok', right: 'Arrow / ADBC' }, stats: [{ l: 'conversions', v: '0', cls: 'ok' }, { l: 'fields encoded', v: '0', cls: 'ok' }] },
      { log: 'The client reads the buffers in place, with no decoding and no per-row objects. The dataframe is the received memory.', callout: 'The client reads the buffers in place', code: 4,
        state: { at: 'client', order: 'col', frames: 'cols', arr2: 1, conv: 0, note2: 'zero-copy dataframe', n2Tone: 'ok', right: 'Arrow / ADBC', clientTitle: 'client: dataframe columns' }, stats: [{ l: 'conversions', v: '0', cls: 'ok' }, { l: 'allocations', v: '~0', cls: 'ok' }],
        takeaway: 'When the engine and the client both want columns, a row protocol transposes twice. A columnar protocol skips both.' },
    ],
  };

  /* ---- 3. N+1: one statement for the list, then one per item ---- */
  const nPlus = {
    id: 'n-plus-one', label: 'N+1 statements', desc: 'An API lists 2,000 orders and loads the items of each order. Each item query is a round trip, so statements grow with the list (round trip time illustrative).',
    codeLabel: 'ORM',
    code: { bug: [
      'orders = Order.all                       -- 1 statement: 2,000 rows',
      'for o in orders: o.items                 -- lazy load: 1 statement per order',
      '-- 2,001 round trips at 0.5 ms each (illustrative): about 1 s',
      "SELECT o.*, i.* FROM orders o JOIN items i ON i.order_id = o.id;   -- 1 statement",
      "SELECT * FROM items WHERE order_id IN (1, 2, 3, ...);   -- 2 statements in total",
    ] },
    stage: DB.stage({
      footer: 'Simplified: 8 of the 2,000 item statements are drawn. Illustrative.',
      header: s => ({ left: 'round trips ' + (s.trips || 0), right: s.right || '' }),
      draw(P, s) {
        P.box('cl', { x: 30, y: 96, w: 110, h: 224, tone: 'mut', label: '', sw: 2 });
        P.text('c1', { x: 85, y: 88, t: 'API', cls: 'mut sm', anchor: 'middle' });
        P.box('sv', { x: 500, y: 96, w: 110, h: 224, tone: 'mut', label: '', sw: 2 });
        P.text('s1', { x: 555, y: 88, t: 'database', cls: 'mut sm', anchor: 'middle' });
        if (s.list) { P.chip('q0', { x: 190, y: 106, w: 260, h: 30, label: 'SELECT * FROM orders', sub: '', tone: 'ok', small: true }); P.line('l0', 140, 121, 188, 121, { tone: 'ok', arrow: true }); P.line('r0', 452, 121, 498, 121, { tone: 'ok', arrow: true }); P.text('rn', { x: 560, y: 121, t: '', cls: 'xs' }); }
        const n = s.items || 0;
        for (let i = 0; i < n; i++) {
          P.chip('q' + (i + 1), { x: 190, y: 146 + i * 21, w: 260, h: 18, label: 'SELECT * FROM items WHERE order_id = ' + (i + 1), tone: 'warn', small: true, r: 4 });
          P.line('a' + i, 140, 155 + i * 21, 188, 155 + i * 21, { tone: 'warn', arrow: true, sw: 1 });
        }
        if (s.dots) P.text('dots', { x: 320, y: 146 + n * 21 + 6, t: '... 2,000 times', cls: 'sm b', anchor: 'middle' });
        if (s.join) { P.chip('j', { x: 190, y: 160, w: 260, h: 50, label: 'SELECT ... orders JOIN items', sub: 'one statement, one reply', tone: 'ok' }); P.line('ja', 140, 185, 188, 185, { tone: 'ok', arrow: true }); P.line('jb', 452, 185, 498, 185, { tone: 'ok', arrow: true }); }
        if (s.inq) { P.chip('i1', { x: 190, y: 150, w: 260, h: 30, label: 'SELECT * FROM orders', tone: 'ok', small: true }); P.chip('i2', { x: 190, y: 190, w: 260, h: 44, label: 'items WHERE order_id IN (...)', sub: '2,000 ids in one statement', tone: 'ok' }); P.line('ia', 140, 165, 188, 165, { tone: 'ok', arrow: true }); P.line('ib', 140, 212, 188, 212, { tone: 'ok', arrow: true }); }
        if (s.note) P.chip('nt', { x: 190, y: 276, w: 260, h: 34, label: s.note, tone: s.noteTone || 'bad', small: true });
      }
    }),
    bug: [
      { log: 'The API loads a page of 2,000 orders with one statement. So far there is one round trip.', callout: 'One statement loads the orders', code: 0,
        state: { list: 1, trips: 1, right: 'list query' }, stats: [{ l: 'round trips', v: '1', cls: 'ok' }] },
      { log: 'Then the code walks the list and lazily loads the items of each order. The first order sends its own statement.', callout: 'Order 1 sends its own item query', code: 1,
        state: { list: 1, items: 1, trips: 2, right: 'lazy loading' }, stats: [{ l: 'round trips', v: '2' }] },
      { log: 'Each order adds another statement, and every statement waits for its own round trip before the next one starts.', callout: 'Each order adds a statement', code: 1,
        state: { list: 1, items: 8, trips: 9, dots: 1, right: 'lazy loading' }, stats: [{ l: 'round trips', v: '9+', cls: 'warn' }] },
      { log: 'For 2,000 orders that is 2,001 round trips. At 0.5 ms each, about a second goes to waiting, and the server is nearly idle.', callout: '2,001 round trips for one page', moment: true, code: 2,
        state: { list: 1, items: 8, trips: 2001, dots: 1, note: '2,001 statements, server idle', right: 'N + 1' }, stats: [{ l: 'round trips', v: '2,001', cls: 'bad' }, { l: 'waiting', v: '~1 s', cls: 'bad' }] },
      { log: 'A JOIN fetches the orders and their items in one statement. One round trip returns all rows.', callout: 'One JOIN: one round trip', code: 3,
        state: { join: 1, trips: 1, note: 'one statement, one reply', noteTone: 'ok', right: 'JOIN' }, stats: [{ l: 'round trips', v: '1', cls: 'ok' }] },
      { log: 'Or load the items for all orders with one IN list after the list query. Two statements replace 2,001, and no row is duplicated.', callout: 'Or two statements with an IN list', code: 4,
        state: { inq: 1, trips: 2, note: '2 statements for 2,000 orders', noteTone: 'ok', right: 'batched IN list' }, stats: [{ l: 'round trips', v: '2', cls: 'ok' }],
        takeaway: 'Count statements per request. If it grows with the page size, fetch the related rows in bulk.' },
    ],
  };

  /* ---- 4. Kernel bypass: the packet path through the operating system and around it ---- */
  const KP = { nic: { x: 30, y: 96, w: 110, h: 220 }, kern: { x: 180, y: 96, w: 220, h: 220 }, user: { x: 440, y: 96, w: 170, h: 220 } };
  const bypass = {
    id: 'kernel-bypass', label: 'Kernel bypass', desc: 'A query arrives as a network packet. Through the kernel it is copied into kernel buffers, handled by the kernel TCP stack and copied again into the DBMS. With kernel bypass the network card writes straight into DBMS memory and the DBMS polls for it (counts illustrative).',
    codeLabel: 'Path',
    code: { bug: [
      'packet arrives at the NIC',
      'interrupt: the kernel takes the packet into its ring buffer',
      'kernel TCP stack: copy into the socket buffer',
      'read() syscall: copy into the DBMS buffer, switch to user mode',
      'bypass (DPDK, RDMA): the NIC DMAs into user-space memory, the DBMS polls',
      'no copies, no syscalls, but the DBMS must run its own protocol stack',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one packet. Counts illustrative.',
      header: s => ({ left: s.hl || 'where the packet is', right: 'copies: ' + (s.copies || 0) + ' · system calls: ' + (s.sys || 0) }),
      draw(P, s) {
        [['nic', 'network card'], ['kern', 'operating system kernel'], ['user', 'DBMS (user space)']].forEach(([k, n]) => { P.box('z' + k, { ...KP[k], tone: k === 'kern' ? (s.byp ? 'mut' : 'warn') : 'info', label: '', dash: k === 'kern' && s.byp }); P.text('t' + k, { x: KP[k].x + 8, y: KP[k].y + 18, t: n, cls: 'mut xs' }); });
        P.chip('ring', { x: 192, y: 130, w: 196, h: 40, label: 'kernel ring buffer', sub: '', tone: s.where === 'ring' ? 'cursor' : 'info', small: true });
        P.chip('sock', { x: 192, y: 210, w: 196, h: 40, label: 'socket buffer + TCP', sub: '', tone: s.where === 'sock' ? 'cursor' : 'info', small: true });
        P.chip('ubuf', { x: 452, y: 170, w: 146, h: 40, label: 'DBMS buffer', sub: '', tone: s.where === 'user' ? 'ok' : 'info', small: true });
        const pos = { nic: { x: 40, y: 190 }, ring: { x: 252, y: 118 }, sock: { x: 252, y: 198 }, user: { x: 492, y: 224 } }[s.where || 'nic'];
        P.chip('pk', { x: pos.x, y: pos.y, w: 60, h: 28, label: 'query', sub: '', tone: 'cursor', small: true, hl: true });
        if (s.byp) P.line('bp', 140, 206, 452, 190, { tone: 'ok', arrow: true, sw: 3, label: 'DMA into user memory', dy: -8 });
        if (s.note) P.chip('nt', { x: 180, y: 330, w: 330, h: 28, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'A query arrives at the network card as a packet. Three zones matter: the card, the operating system kernel, and the DBMS in user space.', callout: 'A packet reaches the card', code: 0, state: { where: 'nic' }, stats: [{ l: 'copies', v: '0' }] },
      { log: 'The card raises an interrupt and the kernel takes the packet into a ring buffer. The CPU is pulled away from other work to handle it.', callout: 'Interrupt: into the kernel ring buffer', code: 1, state: { where: 'ring', copies: 0, hl: 'interrupt' }, stats: [{ l: 'interrupts', v: '1', cls: 'warn' }] },
      { log: 'The kernel TCP stack processes the packet and copies the payload into the socket buffer of the DBMS connection.', callout: 'Copy into the socket buffer', code: 2, state: { where: 'sock', copies: 1 }, stats: [{ l: 'copies', v: '1', cls: 'warn' }] },
      { log: 'The DBMS calls read(). A system call switches into the kernel and back, and the payload is copied a second time into the DBMS buffer.', callout: 'read(): a syscall and a second copy', moment: true, code: 3, state: { where: 'user', copies: 2, sys: 1 }, stats: [{ l: 'copies', v: '2', cls: 'bad' }, { l: 'system calls', v: '1', cls: 'bad' }] },
      { log: 'With kernel bypass (DPDK for packets, RDMA for remote memory) the card writes the packet directly into a ring buffer mapped in DBMS memory. The kernel is not on the path.', callout: 'Bypass: the card writes to user memory', code: 4, state: { where: 'user', byp: 1, copies: 0, sys: 0, hl: 'kernel bypass' }, stats: [{ l: 'copies', v: '0', cls: 'ok' }, { l: 'system calls', v: '0', cls: 'ok' }] },
      { log: 'The DBMS polls the ring instead of waiting for interrupts, and runs its own network stack. That removes the copies and the switches, and it dedicates cores and adds work and risk.', callout: 'Fast, but the DBMS owns the stack', code: 5, state: { where: 'user', byp: 1, note: 'polling cores, own TCP stack, special drivers', noteTone: 'warn' }, stats: [{ l: 'cost', v: 'dedicated cores', cls: 'warn' }],
        takeaway: 'Kernel bypass removes the operating system from the packet path. It pays when the network, not the query, is the bottleneck.' },
    ],
  };

  const EXPLAIN = `
<h3>1. The result is part of the query</h3>
<p>A query is not finished when the engine has the rows. Each row is serialized by the server, crosses the network, is copied, and is rebuilt as an object in the client. If each step happens one row at a time, the transfer can take far longer than the query. In this incident the query runs in 200 ms and the export takes 12 seconds, with an idle server and a busy client.</p>

<h3>2. Drivers and the wire protocol</h3>
<p>Applications reach the database through <b>ODBC</b>, <b>JDBC</b> or a vendor library such as <b>libpq</b> for PostgreSQL. The driver speaks the <b>wire protocol</b>, the byte format of requests, rows and errors over TCP. Every DBMS has its own, and most send each row as a separate message with every field length-prefixed, in text or binary form. The cost of this format is a per-row and per-field cost on both ends.</p>

<h3>3. Round trips and fetch size</h3>
<p>A <b>round trip</b> is one request and its answer. The <b>fetch size</b> is the number of rows the server sends before it waits for the client to ask for more. With a fetch size of 1, a million rows mean a million round trips, and the pipe spends its time waiting. A fetch size of 1,000 needs only 1,000 round trips. But a fetch size equal to the result puts the whole result in client memory at once. Choose a batch that amortizes the round trip and keeps memory bounded. A <b>server-side cursor</b> lets the client pull a large result in batches without the server rerunning the query.</p>

<figure class="mm" aria-label="Sequence diagram of a query and its result sent in batches" style="--diagram-width:719px">
  <img src="diagrams/ch16-request-path.svg" alt="Sequence diagram: the application calls execute on the driver, the driver sends a query message to the server, the server returns a row description and a batch of rows up to the fetch size, the driver hands rows to the application, and when the application asks for more the driver sends a continue message and the server returns the next batch.">
  <figcaption>Sequence: a result is a stream of batches, and each batch costs a round trip.</figcaption>
</figure>

<h3>4. Statements per request: N+1</h3>
<p>The same waiting appears at the statement level. Code that loads a list and then loads the details of each element, usually through lazy loading in an ORM, sends 1 + N statements. Round trips grow with the list size, and the server sits idle between them. Fetch the related rows in bulk with a <code>JOIN</code> or one <code>IN</code> list. A <b>connection pool</b> keeps connections open so that each request skips the handshake and authentication.</p>

<h3>5. Rows or columns on the wire</h3>
<p>ODBC and JDBC are row-oriented. The server packs one tuple at a time and the client decodes one tuple at a time, building an object per row. But analytics engines hold columns, and analytics tools such as dataframes want columns. A row protocol therefore transposes twice, from columns to rows and back. <b>Apache Arrow</b> is a columnar memory layout that both sides agree on. <b>Arrow Flight SQL</b> sends Arrow batches over gRPC, and <b>ADBC</b> is a client API that returns Arrow data from any supporting database. The client can read the received buffers in place. An embedded engine such as DuckDB goes further and hands results to client code in the same process without a copy.</p>

<h3>5b. Kernel bypass and user bypass (15-721)</h3>
<p>Past a point the cost is not the query or the format but the path of the bytes through the operating system. Each packet means an interrupt, a copy into a kernel buffer, the kernel TCP stack, a second copy to user space on <code>read()</code>, and context switches. <b>Kernel bypass</b> removes the kernel: DPDK maps the card&rsquo;s buffers into the application, and RDMA lets a machine read or write remote memory without the remote CPU. The DBMS polls for packets and implements its own protocol handling. <b>User bypass</b> goes the other way: the DBMS runs inside the kernel or the application inside the DBMS, so no boundary is crossed, which is how a stored procedure or an embedded engine avoids the network entirely.</p>
<figure class="mm" aria-label="Flowchart comparing the packet path through the kernel with the path around it" style="--diagram-width:216px">
  <img src="diagrams/ch16-bypass-paths.svg" alt="Flowchart with two paths. Through the kernel: the network card raises an interrupt and DMAs to the kernel ring buffer, the kernel copies to the socket buffer through the TCP stack, and read copies to the DBMS buffer. Kernel bypass: the network card DMAs straight into a user-space ring buffer and the DBMS polls and runs its own protocol stack.">
  <figcaption>Flowchart: two paths for the same packet.</figcaption>
</figure>

<h3>6. Compression and the trade-off</h3>
<p>General-purpose compression (lz4, zstd) shrinks bytes but costs CPU, and on a fast LAN bytes are rarely the main cost. Columnar encodings trade some ratio for decode speed. Every new format also needs support from every driver, which is why drivers change slowly. A larger fetch size amortizes round trips but raises client memory. Count round trips first, then conversions, then bytes.</p>

<h3>7. Syntax</h3>
<pre>-- PostgreSQL: a server-side cursor reads a big result in batches
BEGIN;
DECLARE c CURSOR FOR SELECT * FROM orders;
FETCH 1000 FROM c;      -- one round trip per 1,000 rows
CLOSE c; COMMIT;

-- JDBC: tell the driver how many rows to fetch per round trip
-- stmt.setFetchSize(1000);   (with autocommit off for PostgreSQL)

-- one statement instead of N+1
SELECT o.id, i.sku, i.qty FROM orders o JOIN items i ON i.order_id = o.id
WHERE o.created_at &gt;= now() - interval '1 day';

-- how many statements did the app send
SELECT calls, rows, query FROM pg_stat_statements ORDER BY calls DESC LIMIT 5;</pre>
<p>A statement with a very high <code>calls</code> value and about one row per call is the signature of an N+1 pattern.</p>`;

  /* problem, predict and diagnose (kept from the first version of this course) */
  const FIELDS = {
    "problem": "A nightly BI export pulls 1,000,000 order rows from the database into an analytics tool. <code>EXPLAIN ANALYZE</code> says the query itself runs in 200 ms, but the export takes 12 seconds (illustrative). The database CPU is nearly idle, the network graph shows a steady trickle of small packets, and the client process is busy the whole time.",
    "predict": {
      "q": "The query is fast and the server is idle. What should you change first to make the export faster?",
      "opts": [
        "Add an index, so the query finishes sooner",
        "Give the database server more CPU cores",
        "Fetch rows in large batches and avoid rebuilding every value on the client",
        "Turn on general-purpose compression, because the bytes on the wire are the main cost"
      ],
      "ans": 2,
      "why": "The 200 ms of query work is already done. The rest of the time goes to the path back to the client: round trips, copies and per-value conversion. Compression shrinks bytes, but bytes are rarely the main cost on a fast LAN."
    },
    "diagnose": [
      {
        "t": "N+1 queries",
        "sym": "Round trips grow with the number of parent rows. One query for the list, then one query per item: 2,001 round trips for 2,000 orders.",
        "ctx": "A page or job gets slower as the number of orders grows, while each single statement in the log is fast.",
        "why": "Each query in the loop pays a full network round trip before the next one starts. The list query is cheap, but the per-item queries add latency that multiplies with the row count.",
        "log": "representative application log, wording varies by stack\nquery #1  SELECT id FROM orders WHERE day = $1       rows=2000  4 ms\nquery #2  SELECT * FROM items WHERE order_id = $1  rows=3   0.9 ms\n... repeated 2000 times",
        "note": "The same short statement repeated once per parent row is the signature of N+1.",
        "fix": [
          "Measure: count statements per request in the database log. One request should send a constant number, not one per row.",
          "Fetch the parent rows and their children in one query, with a JOIN or an IN list.",
          "Where the ORM generates the per-row queries, enable eager loading for the relation that is read.",
          "Verify: round trips stay at 1 or 2 when the row count grows."
        ]
      },
      {
        "t": "Tiny fetch size",
        "sym": "A large result arrives one row at a time, so the transfer makes one round trip per row.",
        "ctx": "The query finishes quickly on the server, but the client takes many seconds to read the result.",
        "why": "Fetch size is the number of rows the server sends per round trip. With a fetch size of 1, a result of 100,000 rows needs 100,000 round trips, and each one waits for the network.",
        "log": "representative driver setting, names vary by driver\nfetchSize=1   rows=100000   round trips=100000   elapsed=24.6 s",
        "note": "Round trips equal to the row count means the fetch size is 1.",
        "fix": [
          "Measure: compare the round trip count with the row count, and check the driver default: some drivers fetch all rows at once, others fetch one row at a time.",
          "Raise the fetch size to a few thousand rows, so one round trip carries a whole batch.",
          "Keep the batch small enough that client memory stays bounded.",
          "Verify: the round trip count in the server log should fall by the fetch size factor."
        ]
      },
      {
        "t": "Client materializes everything",
        "sym": "The client holds the whole result in memory before it processes the first row, and runs out of memory on large results.",
        "ctx": "The job works on small days and crashes on large ones, with the heap growing until the end.",
        "why": "If the client collects all rows into a list first, memory grows with the result size. A result of a million rows needs about 120 MB of row objects here, and far more in languages with heavier objects.",
        "log": "representative client error, wording varies by runtime\njava.lang.OutOfMemoryError: Java heap space\n  at ResultSetCollector.collectAll(ResultSetCollector.java:42)",
        "note": "The stack frame shows a collect-all step, not the driver, holding the rows.",
        "fix": [
          "Measure: watch client memory while the result is read. If it grows with the row count, the client is holding every row.",
          "Iterate over the result as it arrives. Process each batch and drop it before fetching the next.",
          "Write results straight to the destination (a file or a table) rather than to a list. If the whole result is needed, aggregate in the database and return the aggregate.",
          "Verify: client memory should stay flat as the row count grows."
        ]
      },
      {
        "t": "Row conversion in analytics",
        "sym": "Most of the time goes to building row objects, one value at a time, before the analytics tool can start.",
        "ctx": "Loading a query result into a dataframe takes seconds even though the query and the network are fast.",
        "why": "Row-oriented APIs deliver one tuple at a time, so the client makes one object or call per value. A columnar result can be handed over as column buffers, so the client makes one call per column instead.",
        "log": "representative profile, names vary by tool\nfetch+convert  rows=1000000 cols=5  value conversions=5000000  time=8.1 s\nbuild DataFrame from row objects  time=6.4 s",
        "note": "Value conversions equal to rows times columns means every value was rebuilt.",
        "fix": [
          "Measure the fetch and the conversion separately, so the cost is visible in each.",
          "Fetch in columnar form (Arrow or another columnar interchange), so the analytics tool receives buffers.",
          "Use a driver or client library that supports a bulk or columnar fetch, and check its documentation for the format it returns.",
          "Verify: the value conversion count in the profile should drop to 0 for columnar fetches."
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[16] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [pipe, cells, nPlus, bypass] };
})();
