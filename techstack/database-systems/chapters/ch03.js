/* Chapter 4 "Storage Models and File Formats" (index 3, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L05 Database Storage III (workloads, NSM, DSM, PAX); CMU 15-721 L02 Data Formats I (Parquet and ORC layout, type system, nested data).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: the same cells on row pages, column chunks and PAX; zone maps skipping row groups; and a nested list shredded into a column with repetition and definition levels. Numbers illustrative. */
(function () {
  const DB = window.DB;

  /* ---- 1. Layout: the same cells, three ways of placing them on pages ---- */
  const COLS = ['id', 'cu', 'st', 'am', 'sh', 'nt'], CT = ['t0', 't1', 't2', 't3', 't4', 't5'];
  const CNAME = ['order_id', 'customer', 'status', 'amount', 'ship_date', 'notes'];
  const place = (lay, r, c) => {
    if (lay === 'dsm') return { p: c, k: r };
    if (lay === 'pax') return { p: Math.floor(r / 3) * 3 + Math.floor(c / 2), k: (c % 2) * 3 + (r % 3) };
    return { p: r, k: c };
  };
  const PGX = 90, PGY = p => 92 + p * 40, CWID = 50;
  const layout = {
    id: 'row-column', label: 'Row, column, PAX', desc: 'Six rows by six columns drawn as cells, placed on six pages. One query needs only the amount column (sizes illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'SELECT SUM(amount) FROM orders;   -- 100 columns in the real table',
      'row store (NSM): each page holds whole rows',
      'column store (DSM): each page holds one column',
      'INSERT INTO orders VALUES (...);  -- one new row',
      'PAX / Parquet: row groups, and inside each group one chunk per column',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 6 rows, 6 columns, 6 cells per page. Illustrative.',
      header: s => ({ left: 'layout: ' + ({ nsm: 'row store (NSM)', dsm: 'column store (DSM)', pax: 'PAX row groups' })[s.lay], right: s.pages == null ? '' : 'pages touched ' + s.pages + ' of 6' }),
      draw(P, s) {
        const touched = new Set();
        for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
          const { p } = place(s.lay, r, c);
          if ((s.query && c === 3) || (s.newrow && r === 5)) touched.add(p);
        }
        for (let p = 0; p < 6; p++) {
          P.text('pl' + p, { x: 30, y: PGY(p) + 22, t: 'page ' + p, cls: 'mut xs' });
          P.box('pg' + p, { x: PGX - 6, y: PGY(p) - 4, w: 6 * CWID + 8, h: 36, tone: touched.has(p) ? 'warn' : 'mut', label: '', sw: touched.has(p) ? 2.4 : 1, stroke: touched.has(p) ? 'warn' : null });
        }
        for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
          const { p, k } = place(s.lay, r, c);
          const hot = (s.query && c === 3) || (s.newrow && r === 5);
          P.box('c' + r + '_' + c, { x: PGX + k * CWID, y: PGY(p), w: CWID - 4, h: 28, tone: CT[c], label: COLS[c] + (r + 1), cls: 'xs', op: (s.query || s.newrow) && !hot ? 0.38 : 1, sw: hot ? 3 : 1.4, stroke: hot ? 'var(--ink)' : null });
        }
        P.text('lg', { x: 430, y: 84, t: 'columns', cls: 'mut sm' });
        CNAME.forEach((n, c) => P.chip('lg' + c, { x: 430, y: 94 + c * 36, w: 130, h: 30, label: n, tone: CT[c], small: true }));
        if (s.read != null) P.chip('read', { x: 430, y: 316, w: 180, h: 26, label: s.read, tone: s.readTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'Six rows by six columns on six pages. In a row store each page holds one whole row, so the colours run across every page.', callout: 'Row store: a page holds whole rows', code: 1,
        state: { lay: 'nsm' }, stats: [{ l: 'layout', v: 'row (NSM)' }, { l: 'cells per page', v: '6' }] },
      { log: 'The report runs SUM(amount). Only the amount column is needed, which is one cell in every row.', callout: 'The query needs one column', code: 0,
        state: { lay: 'nsm', query: 1 }, stats: [{ l: 'columns needed', v: '1 of 6', cls: 'ok' }] },
      { log: 'A disk read moves a whole page, and every page holds one amount cell. All six pages must be read to use six cells.', callout: 'All 6 pages read for 1 column in 6', moment: true, code: 0,
        state: { lay: 'nsm', query: 1, pages: 6, read: 'read 6 of 6 pages', readTone: 'bad' }, stats: [{ l: 'bytes read', v: '100%', cls: 'bad' }, { l: 'bytes used', v: '17%', cls: 'ok' }] },
      { log: 'Now store the table by column. The cells move: each page holds one column for all rows, so amount sits on a single page.', callout: 'Column store: a page holds one column', code: 2,
        state: { lay: 'dsm' }, stats: [{ l: 'layout', v: 'column (DSM)' }] },
      { log: 'The same SUM(amount) reads only the page that holds the amount column. The other five pages are never touched.', callout: '1 of 6 pages read', code: 0,
        state: { lay: 'dsm', query: 1, pages: 1, read: 'read 1 of 6 pages', readTone: 'ok' }, stats: [{ l: 'bytes read', v: '17%', cls: 'ok' }, { l: 'bytes used', v: '100%', cls: 'ok' }] },
      { log: 'The cost moves to writes. One new order must put one value on each of six pages, one page per column.', callout: 'One new row touches 6 pages', code: 3,
        state: { lay: 'dsm', newrow: 1, pages: 6, read: 'write 6 pages', readTone: 'bad' }, stats: [{ l: 'pages written per row', v: '6', cls: 'bad' }, { l: 'in a row store', v: '1', cls: 'ok' }] },
      { log: 'PAX groups rows first: three rows per row group, then one chunk per column pair inside the group. Parquet works this way.', callout: 'PAX: row groups, then column chunks', code: 4,
        state: { lay: 'pax' }, stats: [{ l: 'row groups', v: '2' }, { l: 'column chunks', v: '3 per group' }] },
      { log: 'SUM(amount) reads one chunk in each row group, 2 pages. A new row touches only the 3 chunks of its own group.', callout: 'PAX reads 2 pages and writes 3', code: 4,
        state: { lay: 'pax', query: 1, pages: 2, read: 'read 2 of 6 pages', readTone: 'ok' }, stats: [{ l: 'scan reads', v: '33%', cls: 'ok' }, { l: 'row writes', v: '3 pages', cls: 'warn' }],
        takeaway: 'Rows suit transactions, columns suit scans. Row groups with column chunks keep most of both.' },
    ],
  };

  /* ---- 2. Zone maps: row groups carry a min and max, and a filter skips every group whose range misses it ---- */
  const AX0 = 100, DAY = 15, AY = 100;
  const dx = d => AX0 + (d - 1) * DAY;
  const UNS = [[1, 29], [2, 30], [1, 28], [3, 30]];
  const SRT = [[1, 8], [8, 15], [16, 23], [24, 30]];
  const zones = {
    id: 'zone-maps', label: 'Zone maps', desc: 'Four row groups store the min and max of ship_date in the footer. A narrow date filter reads only the groups whose range overlaps it (dates illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      "SELECT SUM(amount) FROM orders WHERE ship_date BETWEEN '2026-06-10' AND '2026-06-12';",
      'footer: row group 1..4, each with min(ship_date) and max(ship_date)',
      'a group whose range misses the filter is skipped without reading a byte',
      'rows arrived in order of creation, so every group spans the whole month',
      'rewrite sorted by ship_date: each group covers a narrow range',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 4 row groups, one month of dates. Illustrative.',
      header: s => ({ left: 'row groups read ' + (s.read == null ? '-' : s.read + ' of 4'), right: s.sorted ? 'sorted by ship_date' : 'arrival order' }),
      draw(P, s) {
        const rg = s.sorted ? SRT : UNS;
        P.text('ax', { x: AX0, y: 84, t: 'ship_date: Jun 1', cls: 'mut xs' });
        P.text('ax2', { x: dx(30), y: 84, t: 'Jun 30', cls: 'mut xs', anchor: 'end' });
        P.line('axis', AX0, AY, dx(31), AY, { tone: 'mut' });
        if (s.query) {
          P.box('qb', { x: dx(10), y: AY + 4, w: 3 * DAY, h: 214, tone: 'cursor', label: '', op: 0.35, stroke: 'cursor', dash: true });
          P.text('qt', { x: dx(10) + 1.5 * DAY, y: AY + 232, t: 'filter Jun 10-12', cls: 'xs', anchor: 'middle' });
        }
        rg.forEach(([a, b], i) => {
          const hit = s.query && a <= 12 && b >= 10;
          P.text('gl' + i, { x: 30, y: AY + 36 + i * 52, t: 'group ' + (i + 1), cls: 'mut sm' });
          P.box('g' + i, { x: dx(a), y: AY + 14 + i * 52, w: (b - a + 1) * DAY, h: 34, tone: !s.query ? 'acc' : hit ? 'warn' : 'ok', label: 'Jun ' + a + ' - ' + b, cls: 'xs', op: s.query && !hit ? 0.5 : 1, dash: s.query && !hit });
          if (s.query) P.text('gs' + i, { x: 622, y: AY + 36 + i * 52, t: hit ? 'read' : 'skip', cls: 'sm b tone-' + (hit ? 'warn' : 'ok'), anchor: 'end' });
        });
      }
    }),
    bug: [
      { log: 'Each row group stores the min and max of ship_date in the file footer. The bars show those ranges on a month-long axis.', callout: 'Each row group has a min and a max', code: 1,
        state: {}, stats: [{ l: 'row groups', v: '4' }] },
      { log: 'Rows were written in the order orders arrived, and shipping dates are spread across the month, so every group spans nearly the whole month.', callout: 'Arrival order: every range is wide', code: 3,
        state: {}, stats: [{ l: 'widest range', v: '29 days', cls: 'warn' }] },
      { log: 'The query asks for June 10 to 12. The reader compares the filter with each footer range before reading any data.', callout: 'The filter meets four footer ranges', code: 0,
        state: { query: 1 }, stats: [{ l: 'filter', v: 'Jun 10-12' }] },
      { log: 'All four ranges overlap the filter, so no group can be skipped. The scan reads 4 of 4 row groups for three days of data.', callout: 'Nothing pruned: 4 of 4 groups read', moment: true, code: 2,
        state: { query: 1, read: 4 }, stats: [{ l: 'row groups read', v: '4 of 4', cls: 'bad' }, { l: 'pruned', v: '0', cls: 'bad' }] },
      { log: 'Rewrite the file sorted by ship_date. The same rows are packed so that each group covers a narrow slice of the month.', callout: 'Sort by ship_date: narrow ranges', code: 4,
        state: { sorted: 1 }, stats: [{ l: 'widest range', v: '8 days', cls: 'ok' }] },
      { log: 'Only group 2, Jun 8 to 15, overlaps the filter. Groups 1, 3 and 4 are skipped from the footer alone.', callout: '1 of 4 read, 3 skipped from the footer', code: 2,
        state: { sorted: 1, query: 1, read: 1 }, stats: [{ l: 'row groups read', v: '1 of 4', cls: 'ok' }, { l: 'pruned', v: '3', cls: 'ok' }],
        takeaway: 'Zone maps only skip data when each group covers a narrow range, so write order and row-group size decide the benefit.' },
    ],
  };

  const SOURCE = { label: 'CMU 15-445 L05 Database Storage III (storage models) and CMU 15-721 L02 Data Formats I (notes in output/pdf)', href: '../../output/pdf/database-system/notes/02-data1.pdf' };

  /* ---- 3. Nested data: a column store shreds a list into one cell per value plus repetition and definition levels ---- */
  const NEST = [
    { id: 'o1', label: 'order 1', sub: 'items: A, B', tone: 't0' },
    { id: 'o2', label: 'order 2', sub: 'items: [ ]', tone: 't1' },
    { id: 'o3', label: 'order 3', sub: 'items: C, D, E', tone: 't2' },
  ];
  const CELLS = [['A', 0, 2, 'o1'], ['B', 1, 2, 'o1'], ['null', 0, 1, 'o2'], ['C', 0, 2, 'o3'], ['D', 1, 2, 'o3'], ['E', 1, 2, 'o3']];
  const cellY = i => 92 + i * 44;
  const nested = {
    id: 'nested-levels', label: 'Nested data', desc: 'Three orders, each with a list of items. A column store keeps one column, items.sku, with a repetition level and a definition level per cell, and can rebuild every record from them (values illustrative).',
    codeLabel: 'Schema',
    code: { bug: [
      '{ "id": 1, "items": [ {"sku": "A"}, {"sku": "B"} ] }',
      '{ "id": 2, "items": [ ] }',
      '{ "id": 3, "items": [ {"sku": "C"}, {"sku": "D"}, {"sku": "E"} ] }',
      '-- column items.sku: one cell per value, not one per record',
      '-- repetition level r: 0 starts a new record, 1 continues the list',
      '-- definition level d: 2 value present, 1 list present but empty',
      'SELECT items.sku FROM orders;   -- reads this one column only',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one repeated field, max repetition 1, max definition 2. Values illustrative.',
      header: s => ({ left: 'cells in column items.sku: ' + (s.n || 0), right: s.hr || '' }),
      draw(P, s) {
        P.text('hl', { x: 30, y: 82, t: 'records (row view)', cls: 'mut sm' });
        NEST.forEach((o, i) => P.chip(o.id, { x: 30, y: 98 + i * 76, w: 160, h: 56, label: o.label, sub: o.sub, tone: s.focus === o.id ? 'cursor' : o.tone }));
        if (s.n) P.text('hc', { x: 270, y: 82, t: 'column items.sku', cls: 'mut sm' });
        CELLS.slice(0, s.n || 0).forEach(([v, r, d, own], i) => {
          const tone = NEST.find(o => o.id === own).tone;
          P.chip('c' + i, { x: 270, y: cellY(i), w: 70, h: 38, label: v, sub: '', tone: s.rep && r === 0 ? 'cursor' : tone });
          if (s.rep) P.chip('r' + i, { x: 352, y: cellY(i), w: 70, h: 38, label: 'r = ' + r, sub: '', tone: r === 0 ? 'cursor' : 'info', small: true });
          if (s.def) P.chip('d' + i, { x: 434, y: cellY(i), w: 70, h: 38, label: 'd = ' + d, sub: '', tone: d === 1 ? 'warn' : 'info', small: true });
        });
        if (s.rep) P.text('hr', { x: 352, y: 358, t: 'r = 0: new record', cls: 'xs mut' });
        if (s.rebuild) CELLS.slice(0, 6).forEach(([v, r, d, own], i) => P.line('b' + i, 270, cellY(i) + 19, 190, 126 + NEST.findIndex(o => o.id === own) * 76, { tone: 'ok', arrow: true, dash: true }));
        if (s.read) P.chip('q', { x: 520, y: 98, w: 100, h: 56, label: 'one column', sub: 'read only this', tone: 'ok' });
      }
    }),
    bug: [
      { log: 'Three orders, each with a list of items. In a row store each record is kept whole, braces and lists included.', callout: 'Three records with nested lists', code: 0,
        state: {}, stats: [{ l: 'records', v: '3' }, { l: 'items', v: '5' }] },
      { log: 'A column store keeps items.sku as one column. The list is flattened: one cell per value, so order 1 gives two cells and order 3 gives three.', callout: 'The list is flattened into cells', code: 3,
        state: { n: 5 }, stats: [{ l: 'cells', v: '5' }] },
      { log: 'Now the column has no record boundaries. A repetition level r marks them: r = 0 starts a new record, r = 1 continues the list inside the same record.', callout: 'Repetition level: 0 starts a record', moment: true, code: 4,
        state: { n: 5, rep: 1 }, stats: [{ l: 'new records', v: '3' }] },
      { log: 'Order 2 has an empty list. It still needs a place in the column, so it gets one null cell with a definition level d = 1: the list exists but holds no value.', callout: 'Definition level: 1 means an empty list', code: 5,
        state: { n: 6, rep: 1, def: 1 }, stats: [{ l: 'cells', v: '6' }, { l: 'null cells', v: '1', cls: 'warn' }] },
      { log: 'Reading the column back, each r = 0 opens a record and each r = 1 appends to it. The three records are rebuilt exactly.', callout: 'The levels rebuild every record', code: 4,
        state: { n: 6, rep: 1, def: 1, rebuild: 1 }, stats: [{ l: 'records rebuilt', v: '3', cls: 'ok' }] },
      { log: 'A query that needs only the item SKUs reads this one column and none of the other fields of the orders.', callout: 'The query reads one column', code: 6,
        state: { n: 6, rep: 1, def: 1, read: 1, focus: 'o3' }, stats: [{ l: 'columns read', v: '1', cls: 'ok' }],
        takeaway: 'Nested data stays columnar. Two small integers per cell let the reader rebuild records without storing the structure.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Match the layout to the access pattern</h3>
<p>Transactions insert and read whole rows: one order, all its fields. Analytics scans a few columns over many rows: the sum of one amount column over a year. One layout cannot be best for both, so storage engines choose a layout for the workload. The lecture splits workloads into <b>OLTP</b> (many small reads and writes of whole rows), <b>OLAP</b> (long scans and aggregates over a few columns) and <b>HTAP</b>, which tries to serve both in one system.</p>

<h3>2. Row store, column store and the hybrid</h3>
<p>A <b>row store</b> (NSM, the N-ary storage model) keeps every column of a row together in a page (chapter 2). One insert writes one page, and a point lookup reads one page. But a report that needs one of 100 columns still reads every page, because a disk read moves a whole page and each page holds whole rows.</p>
<p>A <b>column store</b> (DSM, the decomposition storage model) keeps each column apart. A scan reads only the columns it names, and each column compresses well because its values look alike (chapter 5). The cost moves to writes: one new row touches one chunk per column, and rebuilding a row means a lookup in each column. <b>PAX</b> is the usual compromise: rows are grouped into row groups, and inside each group the values of one column are stored together. You keep a row-group locality for writes and the column-at-a-time scan inside a group.</p>
<figure class="mm" aria-label="Flowchart: workload decides between row store, column store and the PAX hybrid" style="--diagram-width:385px">
  <img src="diagrams/ch03-storage-models.svg" alt="Flowchart: for an OLTP workload that touches one whole row, use a row store, which is cheap for inserts and point reads and expensive for scanning one column. For an OLAP workload that touches few columns of many rows, use a column store or the PAX hybrid, which is cheap for column scans and compresses well, and costs more for an insert because it touches many chunks.">
  <figcaption>Flowchart: the layout follows the workload.</figcaption>
</figure>

<h3>3. Modern file formats: Parquet and ORC</h3>
<p>The open formats used by lakes and warehouses are PAX files. The writer buffers rows until a <b>row group</b> is full, encodes each <b>column chunk</b> separately, writes the chunks, and writes a <b>footer</b> last. The footer holds the schema, the offset of every chunk, and statistics such as the minimum and maximum of each chunk. A reader fetches the footer first, then reads only the chunks it needs. On an object store that is a few ranged reads instead of a download.</p>
<figure class="mm" aria-label="Flowchart of a Parquet file: row groups, column chunks, pages, and the footer read first" style="--diagram-width:648px">
  <img src="diagrams/ch03-parquet-layout.svg" alt="Flowchart: a Parquet file holds row groups of about 100 thousand rows and a footer. Each row group holds a column chunk per column, and each chunk holds encoded and compressed data pages. The footer holds the schema, the offsets and the min and max of each chunk, and the reader reads it first to plan which groups and chunks to read.">
  <figcaption>Flowchart: one file, many row groups, a footer that tells the reader where to read.</figcaption>
</figure>
<p>The 15-721 paper on file formats adds design decisions worth knowing: the <b>type system</b> (logical types on top of a few physical ones), a self-describing footer versus a table-level catalog, and how a format handles <b>nested data</b>. Real files are also rarely as wide or as deep as benchmarks suggest, so decoding speed and metadata size matter as much as compression ratio.</p>

<h3>4. Pruning with zone maps</h3>
<p>Before reading a chunk, the reader compares the filter with the min and max in the footer. If the filter cannot match, the group is skipped without any I/O. This only works when each group covers a narrow range. Data written in arrival order often has every group covering the whole range, and then nothing can be skipped. Sorting the data by the filter column before writing makes the ranges narrow and disjoint.</p>

<h3>5. Nested data</h3>
<p>JSON-like records contain lists and sub-records. Parquet follows the Dremel design: it keeps one column per leaf field, and adds two small integers to each cell. The <b>repetition level</b> says at which list the value repeats (0 starts a new record). The <b>definition level</b> says how many optional or repeated parents are present, which distinguishes a null from an empty list. From the two levels the reader rebuilds the records, and a query on one leaf reads one column.</p>

<h3>6. The trade-off</h3>
<p>Columns read less and compress better, but appends are buffered until a row group fills, and one row touches many chunks. Updates in place are awkward, so column stores prefer batch loads and rewrite files. Wide row groups compress better and have less metadata but allow less pruning, and the reader needs more memory to decode them. Row stores keep the advantage for point reads and single-row writes.</p>

<h3>7. Syntax</h3>
<pre>-- Parquet: write sorted, with a sensible row-group size (DuckDB)
COPY (SELECT * FROM orders ORDER BY ship_date)
  TO 'orders.parquet' (FORMAT parquet, ROW_GROUP_SIZE 122880);

-- inspect row groups, encodings and min/max in the footer
SELECT row_group_id, path_in_schema, encodings, stats_min, stats_max
FROM parquet_metadata('orders.parquet');

-- how many bytes did the scan read, and how many row groups did it skip
EXPLAIN ANALYZE SELECT SUM(amount) FROM 'orders.parquet'
WHERE ship_date BETWEEN '2026-06-10' AND '2026-06-12';</pre>
<p>If bytes read stay near the size of the file while the filter is narrow, the row groups overlap. Sort the data by the filter column and write again.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `An orders table has 100 columns. Checkout writes one order at a time, and a nightly revenue report needs only three of those columns. The report reads about 1 TB to use about 30 GB (illustrative), and the analytics team sees bytes read close to 100% of the table in the engine profile.`,
    predict: {
      q: `The table stores whole rows together in pages, as in chapter 2. The report runs <code>SUM(amount)</code>. Roughly how much of the table must it read?`,
      opts: [
        `Only the amount values, because the query names one column`,
        `Nearly all of it, because every page holds whole rows and must be read to reach amount`,
        `Only the pages an index points to, because SUM uses the primary key`
      ],
      ans: 1,
      why: `A disk read moves a whole page, and a row page keeps every column of each row together. To reach one column the reader still reads every page, so the scan costs the size of the table.`
    },
    diagnose: [
      {
        t: 'Row layout wastes I/O',
        sym: '<b>Bytes read</b> stay near 100% of the table, even though the query uses one column.',
        ctx: 'The same 8 rows are laid out in row pages. The query needs only amount, but every page is read in full: 256 bytes, which is 100% of the table.',
        why: 'A row page keeps whole rows together. The reader must read the page to reach any column, so a scan costs the size of the table, not the size of the columns it uses.',
        log: `-- representative, illustrative
query: SUM(amount) FROM orders WHERE day >= 2026-03-01
bytes read: 1.0 TB (columns used: 1 of 100)`,
        note: 'Compare bytes read with the size of the columns the query uses. A ratio near 100 means the layout is the problem.',
        fix: [
          'Measure first: read bytes read and columns used in the engine profile for the slow query.',
          'Store analytical tables in a columnar format such as Parquet or ORC.',
          'Select only the columns you need. SELECT * forces every chunk to be read.',
          'Keep transactional tables in row storage, and copy them to a columnar table for reporting.',
          'Verify: compare bytes read in the engine profile before and after the change.'
        ]
      },
      {
        t: 'Schema evolution',
        sym: '<b>The query fails</b> after amount changes from INT32 to DOUBLE, even though the table still looks fine.',
        ctx: 'The reader takes its schema from file 1. File 1 stores amount as INT32 and file 2 stores it as DOUBLE.',
        why: 'A Parquet file records its own column types. The reader must convert each file to one agreed type. Without a table-level schema, the first file decides, and the next file that differs breaks the read.',
        log: `-- representative, wording varies by engine and version
Parquet column cannot be converted: expected INT32, found DOUBLE (column: amount)`,
        note: 'The error names the column and two types. The files disagree, not the table.',
        fix: [
          'Measure first: read the column type of amount from each file footer, and find the first file that differs.',
          'Keep one table-level schema, and check every new file against it before it is committed.',
          'Widen types explicitly (INT32 to DOUBLE) in the table definition. Do not change a column type in place.',
          'Use a table format with schema evolution rules, such as Delta or Iceberg, where the schema is kept in the table log (chapter 28).',
          'Verify: read the table from an old file and from a new file, and check the row count and the sum.'
        ]
      },
      {
        t: 'Poor sort order or oversized row groups',
        sym: '<b>Row groups read</b> stay at 4 of 4, even with a narrow date filter.',
        ctx: '4 row groups of 2 rows each, with the min and max day of each. Query: WHERE day >= 03-04. Unsorted, every row group covers 03-01 to 03-04.',
        why: 'Row-group statistics only help when a row group covers a narrow range. Unsorted data gives every row group the same wide min and max. Oversized row groups have the same effect: one group covers the whole file, so nothing can be skipped.',
        log: `-- representative scan summary, counts illustrative
row groups: 4 total, 0 skipped by statistics
bytes read: 1.2 GB`,
        note: 'Zero groups skipped on a narrow filter means the min and max ranges overlap.',
        fix: [
          'Measure first: count the row groups skipped by statistics in the scan summary.',
          'Sort or cluster the data by the column that queries filter, such as day, before writing it.',
          'Keep row groups small enough that each covers a narrow range, but not so small that the metadata grows.',
          'Run a periodic rewrite (compaction) that re-sorts recent small files.',
          'Verify: count the row groups skipped by statistics before and after the change.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[3] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [layout, zones, nested] };
})();
