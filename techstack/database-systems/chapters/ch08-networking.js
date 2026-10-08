/* Chapter 8 · Database networking and data transfer.
   Owns: communication between the database and its client (wire protocol, fetch size, serialization, kernel and user bypass, Arrow-style interchange).
   Points away: UDF logic (ch7), plan selection (ch9), column encodings such as dictionary and RLE (ch3). */
PG.networking = function (root, A) {
  const { h, seg } = A;
  const sec = SX.sec, para = SX.para, chip = SX.chip, stat = SX.stat, stepper = SX.stepper;

  SX.css('ch08-css', `
.ch08-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:10px 0}
.ch08-bars .ch08-row{display:grid;grid-template-columns:170px 1fr auto;gap:8px;align-items:center;margin:6px 0;font-size:13px}
.ch08-track{height:12px;border-radius:6px;background:var(--soft);overflow:hidden}
.ch08-track i{display:block;height:100%;background:var(--acc)}
.ch08-track i.bad{background:var(--bad)}
.ch08-ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}
.ch08-txt{font-size:14px;margin:8px 0}
.ch08-list li{margin:4px 0}
.ch08-arch{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}
.ch08-arch button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;cursor:pointer}
.ch08-arch button.on{border-color:var(--acc);box-shadow:0 0 0 2px var(--acc) inset}
.ch08-arch span.ch08-arr{color:var(--mut)}
.ch08-def{border-left:3px solid var(--acc);padding:6px 10px;margin:8px 0;background:var(--soft);border-radius:6px;font-size:14px}
.ch08-count{font-family:ui-monospace,monospace;font-size:14px;color:var(--ink)}
.ch08-count b{color:var(--acc)}
.ch08-count b.bad{color:var(--bad)}
`);

  /* ---------- the transfer model used by the playground ----------
     Illustrative constants. Counts (round trips, copies, bytes, client memory) follow directly from the mode and the fetch size. */
  const N = 1000000;          // rows in the result
  const ROW_BIN = 64;         // bytes per row, binary wire format (illustrative)
  const ROW_OBJ = 120;        // bytes per row once the client builds row objects (illustrative)
  const RTT_MS = 0.2;         // one round trip on a fast LAN (illustrative)
  const BW_BPS = 125e6;       // 1 Gbit/s = 125 MB/s
  const CONV_ROW_MS = 0.0015; // client builds one row object (illustrative)
  const CONV_COL_MS = 0.00002;// client wraps a column buffer, per row (illustrative)
  const GEN_RATIO = 0.35;     // general-purpose compression ratio (illustrative)
  const COL_RATIO = 0.4;      // columnar encodings ratio (illustrative)
  const DECOMP_MS_PER_B = 0.000001; // general decompression cost per raw byte (illustrative)

  const fmt = n => Math.round(n).toLocaleString('en-US');
  const ms = x => (x >= 1000 ? (x / 1000).toFixed(1) + ' s' : x.toFixed(1) + ' ms');
  const mb = b => (b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : (b / 1e3).toFixed(1) + ' KB');

  function model(mode, F) {
    const f = mode === 'row' ? 1 : F;
    const trips = Math.ceil(N / f);
    const raw = N * ROW_BIN;
    const wireBytes = mode === 'compressed' ? raw * GEN_RATIO : mode === 'columnar' ? raw * COL_RATIO : raw;
    const copies = { row: 3, batched: 3, compressed: 4, columnar: 1 }[mode];
    const memory = mode === 'columnar' ? f * ROW_BIN : f * ROW_OBJ;
    const conv = mode === 'columnar' ? N * CONV_COL_MS : N * CONV_ROW_MS;
    const decomp = mode === 'compressed' ? raw * DECOMP_MS_PER_B : 0;
    const time = trips * RTT_MS + (wireBytes / BW_BPS) * 1000 + conv + decomp;
    return { trips, wireBytes, copies, memory, time };
  }

  /* ---------- PLAYGROUND ----------
     One million rows, four transfer modes. Fetch size applies to the batched modes; row-at-a-time always uses 1. */
  function playground() {
    let mode = 'batched', F = 10000;
    const stats = h('div', { class: 'ch08-grid' });
    const bars = h('div', { class: 'ch08-bars' });
    const txt = h('p', { class: 'ch08-txt' });
    const label = { row: 'Row-at-a-time', batched: 'Batched', compressed: 'Batched + compressed', columnar: 'Columnar (Arrow-style)' };

    const paint = () => {
      const cur = model(mode, F);
      fetchRow.style.display = mode === 'row' ? 'none' : '';
      stats.replaceChildren(
        stat('Round trips', fmt(cur.trips)),
        stat('Bytes on the wire', mb(cur.wireBytes)),
        stat('Copies of the data', String(cur.copies)),
        stat('Client memory (per batch)', mb(cur.memory)),
        stat('Illustrative time', ms(cur.time)));
      const all = ['row', 'batched', 'compressed', 'columnar'].map(m => [m, model(m, F).time]);
      const maxT = Math.max(...all.map(x => x[1]));
      bars.replaceChildren(...all.map(([m, t]) => h('div', { class: 'ch08-row' },
        h('span', {}, label[m] + (m === 'row' ? '' : ' (' + fmt(F) + ' rows per fetch)')),
        h('div', { class: 'ch08-track' }, h('i', { class: m === mode ? '' : 'bad', style: 'width:' + Math.max(2, (t / maxT) * 100) + '%' })),
        h('b', {}, ms(t)))));
      const r = model('row', F).time, c = model('columnar', F).time;
      txt.textContent = 'Row-at-a-time makes ' + fmt(N) + ' round trips. Columnar makes ' + fmt(model('columnar', F).trips) + ' with 1 copy and no per-value objects, and it is about ' + Math.round(r / c) + ' times faster in this model.';
    };

    const modeSeg = seg([{ v: 'row', l: 'Row-at-a-time' }, { v: 'batched', l: 'Batched' }, { v: 'compressed', l: 'Batched + compressed' }, { v: 'columnar', l: 'Columnar' }], mode, v => { mode = v; paint(); });
    const fetchSeg = seg([{ v: 100, l: '100 rows' }, { v: 10000, l: '10,000 rows' }, { v: 100000, l: '100,000 rows' }], F, v => { F = v; paint(); });
    const fetchRow = h('div', { class: 'ch08-ctl' }, h('small', {}, 'Fetch size'), fetchSeg);
    paint();
    return h('div', {},
      h('div', { class: 'ch08-ctl' }, h('small', {}, 'Transfer mode'), modeSeg),
      fetchRow,
      stats, bars, txt,
      h('p', { class: 'sx-p' }, h('small', {}, 'Illustrative model of 1,000,000 rows of 64 bytes each over 1 Gbit/s. Round trips, bytes, copies and client memory follow from the mode and fetch size. Time uses illustrative costs: 0.2 ms per round trip, 0.0015 ms per row object built, and a 0.4 ratio for columnar encoding. The times are not measurements.')));
  }

  /* ---------- CASE STUDY: Arrow-style interchange, client-server versus embedded ----------
     Both paths return the same result. One crosses a wire protocol and rebuilds every value. The other hands over columnar buffers in the same process. */
  const PARTS = [
    { k: 'app', l: 'Analytics tool', d: 'The client code that wants the result, such as a dataframe library. It wants columns, not one object per row.' },
    { k: 'drv', l: 'ODBC / JDBC driver', d: 'The client library that speaks the wire protocol. It hides the protocol and delivers results in the right format for the client.' },
    { k: 'wire', l: 'Wire protocol over TCP', d: 'The byte format between server and client. In row-oriented APIs each message carries one tuple, so the client deserializes one tuple at a time.' },
    { k: 'exe', l: 'Query executor', d: 'Produces the result in its own internal layout. A columnar result is already the shape the client wants, so nothing needs to be rebuilt.' },
    { k: 'arrow', l: 'Arrow buffers', d: 'Columnar memory with an agreed layout. DuckDB provides zero-copy access to query results via Apache Arrow to client code running in the same process.' }
  ];
  function arrowCase() {
    const defBox = h('div', { class: 'ch08-def' }, PARTS[0].d);
    const buttons = PARTS.map((p, i) => {
      const b = h('button', { onclick: () => { buttons.forEach(x => x.classList.remove('on')); b.classList.add('on'); defBox.textContent = p.d; } }, p.l);
      if (i === 0) b.classList.add('on');
      return b;
    });
    const arch = h('div', { class: 'ch08-arch' });
    buttons.forEach((b, i) => { arch.append(b); if (i < buttons.length - 1) arch.append(h('span', { class: 'ch08-arr' }, '→')); });

    const ROWS = 4, COLS = 3;
    const wireStates = [{ t: 'Start: the query finishes in the server. The result is 4 rows by 3 columns (illustrative).', conv: 0, copies: 0, objs: 0 }];
    for (let r = 1; r <= ROWS; r++) {
      wireStates.push({ t: 'Row ' + r + ' is encoded into a message: the server copies it into the socket buffer.', conv: (r - 1) * COLS, copies: r, objs: 0 });
      wireStates.push({ t: 'The driver decodes row ' + r + ' and builds ' + COLS + ' values in a row object.', conv: r * COLS, copies: r, objs: r });
    }
    wireStates.push({ t: 'Done: ' + ROWS + ' rows took ' + ROWS * COLS + ' value conversions and ' + ROWS + ' row objects. At ' + fmt(1000000) + ' rows: ' + fmt(3000000) + ' conversions.', conv: ROWS * COLS, copies: ROWS, objs: ROWS, final: true });
    const wireDraw = s => [
      h('p', { class: 'ch08-count' }, 'Per-value conversions: ', h('b', { class: s.conv ? 'bad' : '' }, String(s.conv)), '   Row objects built: ', h('b', { class: s.objs ? 'bad' : '' }, String(s.objs)), '   Copies: ', h('b', {}, String(s.copies)))];

    const embState = [
      { t: 'Start: the analytics tool and the embedded DBMS share one process address space.', conv: 0, copies: 0 },
      { t: 'The executor writes the result as columnar Arrow buffers.', conv: 0, copies: 0 },
      { t: 'The analytics tool gets a view on the same buffers. No bytes move, and no value is rebuilt.', conv: 0, copies: 0 },
      { t: 'Done: 0 conversions and 0 copies. The same result, at 1,000,000 rows, still makes 0 conversions.', conv: 0, copies: 0, final: true }
    ];
    const embDraw = s => [
      h('p', { class: 'ch08-count' }, 'Per-value conversions: ', h('b', {}, String(s.conv)), '   Copies: ', h('b', {}, String(s.copies)))];

    return h('div', {},
      para('The architecture below shows the parts on the two paths. Click a part to read its role. The client-server path is the one most applications use. The embedded path is the one DuckDB supports.'),
      arch, defBox,
      h('p', { class: 'sx-p' }, h('b', {}, 'Client-server path (wire protocol). '), 'Play through the result as it crosses the network.'),
      stepper(wireStates, wireDraw),
      h('p', { class: 'sx-p' }, h('b', {}, 'Embedded path (Arrow buffers, same process). '), 'The same result, with no wire format in between.'),
      stepper(embState, embDraw),
      para('The two paths return the same rows. The difference is where the cost goes: the wire path pays for serialization, copies, and per-value conversion, and the embedded path pays for none of them.'));
  }

  /* ---------- COMMON PROBLEMS ---------- */
  const problems = [
    {
      tab: 'N+1 queries',
      sym: '<b>Round trips</b> grow with the number of parent rows. One query for the list, then one query per item: 2,001 round trips for 2,000 orders.',
      why: 'Each query in the loop pays a full network round trip before the next one starts. The list query is cheap, but the per-item queries add latency that multiplies with the row count.',
      log: 'representative application log, wording varies by stack\nquery #1  SELECT id FROM orders WHERE day = $1       rows=2000  4 ms\nquery #2  SELECT * FROM items WHERE order_id = $1  rows=3   0.9 ms\n... repeated 2000 times',
      demo(mode) {
        const bad = mode === 'bad';
        const ORDERS = 5;
        const states = [{ t: bad ? 'Start. The first query returns the list of orders: 1 round trip.' : 'Start. One query joins orders and items: 1 round trip.', trips: 1 }];
        if (bad) {
          for (let k = 1; k <= ORDERS; k++) states.push({ t: 'Query for order ' + k + ' of ' + ORDERS + ': one more round trip before the next starts.', trips: 1 + k });
          states.push({ t: 'Done: 1 + 5 = 6 round trips for 5 orders. At 2,000 orders it is 2,001.', trips: 1 + ORDERS, final: true });
        } else {
          states.push({ t: 'Done: 1 round trip for all orders and their items.', trips: 1, final: true });
        }
        return stepper(states, s => [h('p', { class: 'ch08-count' }, 'Round trips: ', h('b', { class: bad && s.trips > 1 ? 'bad' : '' }, String(s.trips)))]);
      },
      fix: [
        'Fetch the parent rows and their children in one query, with a JOIN or an IN list.',
        'Where the ORM generates the per-row queries, enable eager loading for the relation that is read.',
        'Measure: count statements per request in the database log. One request should send a constant number, not one per row.',
        'Verify: round trips stay at 1 or 2 when the row count grows.'
      ]
    },
    {
      tab: 'Tiny fetch size',
      sym: '<b>A large result arrives one row at a time</b>, so the transfer makes one round trip per row.',
      why: 'Fetch size is the number of rows the server sends per round trip. With a fetch size of 1, a result of 100,000 rows needs 100,000 round trips, and each one waits for the network.',
      log: 'representative driver setting, names vary by driver\nfetchSize=1   rows=100000   round trips=100000   elapsed=24.6 s',
      demo(mode) {
        const bad = mode === 'bad';
        const ROWS = 8, F = bad ? 1 : 4;
        const states = [{ t: 'Start. The result has ' + ROWS + ' rows. The fetch size is ' + F + '.', trips: 0, rows: 0 }];
        for (let got = 0; got < ROWS; got += F) {
          states.push({ t: 'One round trip brings ' + F + ' row' + (F > 1 ? 's' : '') + '.', trips: got / F + 1, rows: got + F });
        }
        states.push({ t: 'Done: ' + ROWS + ' rows took ' + (states.length - 1) + ' round trips. At 100,000 rows and fetch size ' + (bad ? '1' : '10,000') + ' it is ' + fmt(bad ? 100000 : 10) + ' round trips.', trips: states.length - 1, rows: ROWS, final: true });
        return stepper(states, s => [h('p', { class: 'ch08-count' }, 'Round trips: ', h('b', { class: bad && s.trips > 2 ? 'bad' : '' }, String(s.trips)), '   Rows received: ', h('b', {}, String(s.rows)))]);
      },
      fix: [
        'Raise the fetch size to a few thousand rows, so one round trip carries a whole batch.',
        'Keep the batch small enough that client memory stays bounded.',
        'Check the driver default: some drivers fetch all rows at once, others fetch one row at a time.',
        'Verify: the round trip count in the server log should fall by the fetch size factor.'
      ]
    },
    {
      tab: 'Client materializes everything',
      sym: '<b>The client holds the whole result in memory</b> before it processes the first row, and runs out of memory on large results.',
      why: 'If the client collects all rows into a list first, memory grows with the result size. A result of a million rows needs about 120 MB of row objects here, and far more in languages with heavier objects.',
      log: 'representative client error, wording varies by runtime\njava.lang.OutOfMemoryError: Java heap space\n  at ResultSetCollector.collectAll(ResultSetCollector.java:42)',
      demo(mode) {
        const bad = mode === 'bad';
        const BATCH = 4, BATCHES = 8;
        const states = [{ t: 'Start. The client has read nothing yet.', held: 0 }];
        for (let b = 1; b <= BATCHES; b++) {
          states.push({ t: bad ? 'Batch ' + b + ' arrives and is kept. Memory grows.' : 'Batch ' + b + ' arrives, is processed, and is released.', held: bad ? b * BATCH : BATCH });
        }
        states.push({ t: bad ? 'Done: all ' + BATCHES * BATCH + ' rows are held at once. At 1,000,000 rows that is about 120 MB of row objects.' : 'Done: at most one batch (' + BATCH + ' rows) was ever held. The same job at 1,000,000 rows still holds one batch.', held: bad ? BATCHES * BATCH : BATCH, final: true });
        return stepper(states, s => [h('p', { class: 'ch08-count' }, 'Rows held in client memory: ', h('b', { class: bad && s.held > BATCH ? 'bad' : '' }, String(s.held)))]);
      },
      fix: [
        'Iterate over the result as it arrives. Process each batch and drop it before fetching the next.',
        'Write results straight to the destination (a file or a table) rather than to a list.',
        'If the whole result is needed, aggregate in the database and return the aggregate.',
        'Verify: client memory should stay flat as the row count grows.'
      ]
    },
    {
      tab: 'Row conversion in analytics',
      sym: '<b>Most of the time goes to building row objects</b>, one value at a time, before the analytics tool can start.',
      why: 'Row-oriented APIs deliver one tuple at a time, so the client makes one object or call per value. A columnar result can be handed over as column buffers, so the client makes one call per column instead.',
      log: 'representative profile, names vary by tool\nfetch+convert  rows=1000000 cols=5  value conversions=5000000  time=8.1 s\nbuild DataFrame from row objects  time=6.4 s',
      demo(mode) {
        const bad = mode === 'bad';
        const ROWS = 8, COLS = 5;
        const states = [{ t: 'Start. The result has ' + ROWS + ' rows and ' + COLS + ' columns (illustrative).', conv: 0, bufs: 0 }];
        if (bad) {
          for (let r = 1; r <= ROWS; r++) states.push({ t: 'Row ' + r + ': the driver builds ' + COLS + ' values, one per column.', conv: r * COLS, bufs: 0 });
          states.push({ t: 'Done: ' + ROWS * COLS + ' value conversions. At 1,000,000 rows and 5 columns that is ' + fmt(5000000) + '.', conv: ROWS * COLS, bufs: 0, final: true });
        } else {
          states.push({ t: 'The result arrives as ' + COLS + ' column buffers, one per column.', conv: 0, bufs: COLS });
          states.push({ t: 'Done: ' + COLS + ' buffers and 0 value conversions. At 1,000,000 rows it is still ' + COLS + ' buffers.', conv: 0, bufs: COLS, final: true });
        }
        return stepper(states, s => [h('p', { class: 'ch08-count' }, 'Value conversions: ', h('b', { class: bad && s.conv ? 'bad' : '' }, String(s.conv)), '   Column buffers handed over: ', h('b', {}, String(s.bufs)))]);
      },
      fix: [
        'Fetch in columnar form (Arrow or another columnar interchange), so the analytics tool receives buffers.',
        'Use a driver or client library that supports a bulk or columnar fetch, and check its documentation for the format it returns.',
        'Measure the fetch and the conversion separately, so the cost is visible in each.',
        'Verify: the value conversion count in the profile should drop to 0 for columnar fetches.'
      ]
    }
  ];

  root.append(
    sec('1 · The problem',
      para('(Illustrative numbers.) The query finishes in 200 ms, but transferring and converting its result can take 12 seconds. The engine did its work, and the rest of the time goes to the path back to the client. Each row crosses the network, is serialized, copied, and rebuilt on the other side.'),
      para('<b>Why can returning query results take longer than computing them?</b>')),

    sec('2 · Core idea and mechanisms',
      para('Fetch data in large, efficient batches and minimize round trips, copies, and format conversions.'),
      h('ul', { class: 'ch08-list' },
        h('li', {}, h('b', {}, 'Database access APIs. '), 'Applications reach a DBMS through ODBC, JDBC, or a vendor library (direct access, such as libpq for Postgres). ODBC dates from the early 1990s and gives one interface across DBMSs. JDBC dates from 1997 and does the same for Java. Drivers hide the wire protocol, handle byte order, and emulate features the server lacks, such as cursors in Postgres.'),
        h('li', {}, h('b', {}, 'JDBC driver types. '), 'A JDBC-ODBC bridge (deprecated). A native-API driver that calls C through JNI. A network-protocol driver that talks to a middleware process. A database-protocol driver written in pure Java, the most common today.'),
        h('li', {}, h('b', {}, 'Wire protocol. '), 'The format for requests, results, and errors over TCP/IP. It is unique to each DBMS. Serializing the result is part of the protocol, and it is a known bottleneck. Open protocols such as Postgres, MySQL, and Redis are reused by many systems. Speaking the protocol does not make a system compatible: it also needs the same catalogs and SQL dialect.'),
        h('li', {}, h('b', {}, 'Row versus column layout. '), 'ODBC and JDBC are row-oriented: the server packs one tuple at a time, and the client deserializes one tuple at a time. Analytics tools work on columns and matrices. Arrow Database Connectivity (ADBC) sends vectors instead, in a PAX layout that is also used in modern file formats and the Arrow project.'),
        h('li', {}, h('b', {}, 'Compression. '), 'Naive compression applies general algorithms (lz4, gzip, zstd). It is format-agnostic and easy to decode with an existing library, but slower to decode than columnar encodings. Columnar encodings (delta, dictionary, RLE, frame of reference) trade some compression ratio for decode speed. Those encodings are covered in chapter 3. Every driver must implement each feature, which is one reason drivers are conservative.'),
        h('li', {}, h('b', {}, 'Serialization. '), 'Binary encoding writes values in their in-memory form, which is fast and close to the DBMS format, but the client must handle endianness. Text encoding writes every value as a string: endianness is no longer a concern, but the data is larger and offers less room to optimize.'),
        h('li', {}, h('b', {}, 'String handling. '), 'Null-terminated strings end with a zero byte, so the reader must scan to find the end. Length-prefixed strings store the length first, so the reader can skip values. Fixed-width strings pad to the largest value. No option wins everywhere.'),
        h('li', {}, h('b', {}, 'Fetch size and round trips. '), 'The fetch size is the number of rows per round trip. A larger batch amortizes the round trip; a batch that is too large raises client memory. This is the knob the playground turns.'),
        h('li', {}, h('b', {}, 'Connection pooling. '), 'Setting up a connection takes a handshake and authentication. A pool keeps connections open and hands them out, so each request skips the setup.'),
        h('li', {}, h('b', {}, 'Kernel bypass. '), 'The OS TCP/IP stack costs interrupts, context switches, and a copy from the DBMS buffer to the NIC. DPDK gives the DBMS direct access to the NIC as a bare-metal device, at the cost of managing buffers itself (ScyllaDB uses it). RDMA reads and writes memory on a remote host without going through the OS (Oracle RAC and Microsoft FaRM use it). io_uring gives zero-copy asynchronous I/O on Linux.'),
        h('li', {}, h('b', {}, 'User bypass. '), 'Move the DBMS logic into the kernel so data does not cross from kernel space to user space. A kernel module can crash the whole OS and is often not allowed. eBPF code is verified before it loads, and it runs under a restricted API (no malloc, a limited instruction count) (course notes, 15-721 #12 §5). The Tigger proxy in the notes is a database proxy built on user bypass.'),
        h('li', {}, h('b', {}, 'Value-based APIs. '), 'Fetching one value per call has function-call overhead for each value. For a large result, bulk access to a column or a block is better. The CIDR 2020 DuckDB paper names this and the serialization cost as the two causes of slow result transfer.'),
        h('li', {}, h('b', {}, 'Arrow-style interchange and zero-copy. '), 'Arrow is a columnar memory layout that producer and consumer agree on. If the server writes results in that layout and the client reads it in place, nothing is rebuilt. DuckDB provides zero-copy access to query results via Apache Arrow to client code in the same process. The case study below shows both paths.')
      ),
      para('The playground transfers one million rows four ways and counts round trips, bytes, copies, and client memory. The case study shows the Arrow-style path. The four problems show what breaks in practice.')),

    sec('3 · Playground',
      para('One million rows, four transfer modes. Change the fetch size to see round trips and client memory move. Row-at-a-time always fetches one row per trip.'),
      playground()),

    sec('4 · Case study: client-server versus embedded Arrow',
      para('The same result crosses two different paths. One is a wire protocol with a driver. The other is an embedded DBMS (DuckDB) that exposes Arrow buffers in the same process. Both paths are shown as steppers on a small illustrative result.'),
      arrowCase()),

    sec('5 · Common problems',
      para('Four ways the transfer takes longer than the query. Each card shows the failure first; switch to After fix to see the same result moved efficiently.'),
      SX.problems(problems))
  );
};
