/* Chapter 3 "Storage Models, File Formats, and Compression": three bespoke scenes plus the Explain text (index 2, zero-based).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes: the same 36 cells re-laid on disk pages (row, column, PAX), one column squeezed by encodings, and zone-map ranges on a date axis.
   Sizes and dates are illustrative. */
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

  /* ---- 2. Encodings: one column shrinks through dictionary, bit packing and runs, and a unique column does not ---- */
  const STAT = 'SSSSSSOOOORRSSSS'.split('');
  const SORTED = 'OOOORRSSSSSSSSSS'.split('');
  const SW = 36;
  const enc = {
    id: 'encodings', label: 'Encodings', desc: 'One status column of 1,000,000 values, drawn as 16 sample cells. Dictionary, bit packing and runs each shrink it. A unique column does not shrink (sizes illustrative).',
    codeLabel: 'Parquet',
    code: { bug: [
      'column status: 1,000,000 values, 3 distinct, 8 bytes each = 8 MB',
      'dictionary: store each distinct value once, then a small id per row',
      'bit packing: 3 ids need only 2 bits each',
      'sort by status, then run-length encode: (O,4) (R,2) (S,10)',
      'column order_id: 1,000,000 distinct values: the dictionary is as big as the data',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 16 sample values stand for 1,000,000. Sizes illustrative.',
      header: s => ({ left: 'size on disk ' + s.size, right: s.name }),
      draw(P, s) {
        const vals = s.vals || STAT;
        P.text('h1', { x: 30, y: 84, t: s.uniq ? 'order_id (all distinct)' : 'status values', cls: 'mut sm' });
        vals.forEach((v, i) => P.box('v' + i, { x: 30 + i * SW, y: 92, w: SW - 3, h: 30, tone: s.uniq ? 't' + (i % 6) : (v === 'S' ? 't0' : v === 'O' ? 't2' : 't4'), label: s.uniq ? '#' + (i + 1) : v, cls: 'xs', op: s.mode === 'runs' || s.mode === 'dict' || s.mode === 'pack' ? 0.4 : 1 }));
        if (s.mode === 'dict' || s.mode === 'pack' || s.mode === 'runs') {
          P.text('h2', { x: 30, y: 150, t: 'dictionary', cls: 'mut sm' });
          [['S', 0, 't0'], ['O', 1, 't2'], ['R', 2, 't4']].forEach(([v, id, tone], i) => P.chip('d' + i, { x: 30 + i * 100, y: 158, w: 92, h: 40, label: v + ' = ' + id, sub: '8 bytes once', tone }));
        }
        if (s.mode === 'dict' || s.mode === 'pack') {
          P.text('h3', { x: 30, y: 226, t: s.mode === 'pack' ? 'ids packed in 2 bits each' : 'one id per row', cls: 'mut sm' });
          vals.forEach((v, i) => P.box('i' + i, { x: 30 + i * SW, y: 234, w: s.mode === 'pack' ? SW - 3 : SW - 3, h: s.mode === 'pack' ? 16 : 30, tone: v === 'S' ? 't0' : v === 'O' ? 't2' : 't4', label: s.mode === 'pack' ? '' : String(v === 'S' ? 0 : v === 'O' ? 1 : 2), cls: 'xs' }));
        }
        if (s.mode === 'runs') {
          P.text('h3', { x: 30, y: 226, t: 'sorted by status, then runs', cls: 'mut sm' });
          [['O', 4, 't2', 0], ['R', 2, 't4', 4], ['S', 10, 't0', 6]].forEach(([v, n, tone, at], i) => P.box('r' + i, { x: 30 + at * SW, y: 234, w: n * SW - 3, h: 30, tone, label: '(' + v + ', ' + n + ')', cls: 'sm' }));
        }
        if (s.uniq && s.mode === 'dict') {
          P.text('h2', { x: 30, y: 150, t: 'dictionary would hold every value', cls: 'mut sm' });
        }
        if (s.fall) P.chip('fall', { x: 30, y: 262, w: 330, h: 44, label: 'writer falls back to plain encoding', sub: 'dictionary page too large', tone: 'warn' });
        P.text('sz', { x: 30, y: 330, t: s.sizeText || '', cls: 'sm' });
      }
    }),
    bug: [
      { log: 'The status column has 1,000,000 values and only 3 distinct ones. Stored plain at 8 bytes each it takes 8 MB (illustrative).', callout: 'Plain: 1,000,000 values × 8 bytes = 8 MB', code: 0,
        state: { vals: STAT, size: '8 MB', name: 'plain', sizeText: 'plain: 8 MB for 3 distinct values' }, stats: [{ l: 'size', v: '8 MB', cls: 'bad' }, { l: 'distinct values', v: '3' }] },
      { log: 'Dictionary encoding stores each distinct value once and replaces every row by an id. The values fade, the ids replace them.', callout: 'Dictionary: values once, ids per row', code: 1,
        state: { vals: STAT, mode: 'dict', size: '1 MB', name: 'dictionary', sizeText: 'dictionary 24 B + one byte id per row = 1 MB' }, stats: [{ l: 'size', v: '1 MB', cls: 'warn' }] },
      { log: 'Only three ids exist, so each needs 2 bits, not a byte. Bit packing shrinks the ids to a quarter of a byte per row.', callout: 'Bit packing: 2 bits per id', moment: true, code: 2,
        state: { vals: STAT, mode: 'pack', size: '0.25 MB', name: 'dictionary + bit packing', sizeText: '1,000,000 ids × 2 bits = 0.25 MB (32× smaller)' }, stats: [{ l: 'size', v: '0.25 MB', cls: 'ok' }, { l: 'smaller by', v: '32×', cls: 'ok' }] },
      { log: 'Sort by status and the equal values meet. Run-length encoding then stores three runs instead of a million ids.', callout: 'Sorted data collapses into runs', code: 3,
        state: { vals: SORTED, mode: 'runs', size: '~50 B', name: 'sorted + run-length', sizeText: 'three runs, a few dozen bytes' }, stats: [{ l: 'runs', v: '3', cls: 'ok' }, { l: 'size', v: '~50 B', cls: 'ok' }] },
      { log: 'The order_id column is different: every value is distinct. A dictionary would list all 1,000,000 values, so it is as big as the data.', callout: 'A unique column has nothing to share', code: 4,
        state: { vals: STAT, uniq: 1, mode: 'dict', size: '8 MB + ids', name: 'dictionary on a unique column', sizeText: 'dictionary 8 MB + 1,000,000 ids = larger than plain' }, stats: [{ l: 'plain', v: '8 MB' }, { l: 'dictionary', v: '10.5 MB', cls: 'bad' }] },
      { log: 'The writer sees the dictionary growing past its limit and falls back to plain encoding for that column chunk.', callout: 'The writer falls back to plain', code: 4,
        state: { vals: STAT, uniq: 1, mode: 'dict', fall: 1, size: '8 MB', name: 'fallback to plain', sizeText: 'plain 8 MB: the encoding was not worth it' }, stats: [{ l: 'size', v: '8 MB', cls: 'warn' }],
        takeaway: 'An encoding pays only when values repeat or are narrow. Sort order and cardinality decide the size, not the format.' },
    ],
  };

  /* ---- 3. Zone maps: row groups carry a min and max, and a filter skips every group whose range misses it ---- */
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

  const EXPLAIN = `
<h3>1. Match the layout to the access pattern</h3>
<p>Transactions insert and read whole rows: one order, all its fields. Analytics scans a few columns over many rows: the sum of one amount column over a year. One layout cannot be best for both, so storage engines choose a layout and an encoding for the workload they serve.</p>

<h3>2. Row store, column store and the hybrid</h3>
<p>A <b>row store</b> (NSM, the N-ary storage model) keeps every column of a row together in a page, as in chapter 2. One insert writes one page, and a point lookup reads one page. But a report that needs one of 100 columns still reads every page, because a disk read moves a whole page.</p>
<p>A <b>column store</b> (DSM) keeps each column apart. A scan reads only the columns it names, and each column compresses well because its values look alike. The cost moves to writes: one new row touches one page per column. <b>PAX</b> is the usual compromise. Rows are grouped into <b>row groups</b>, and inside each group every column is stored as its own <b>column chunk</b>. Parquet and ORC are files of this kind.</p>

<h3>3. What is inside a Parquet file</h3>
<p>The writer buffers rows until a row group is full, encodes each column chunk by itself, writes the chunks, and writes a <b>footer</b> last. The footer holds the schema, the offset of every chunk and the minimum and maximum of each chunk, called a <b>zone map</b>. A reader reads the last bytes of the file, then the footer, and then only the chunks it needs. Avro is the contrast: row-based, a header with the schema and then blocks of whole rows.</p>

<h3>4. Encodings</h3>
<p>Each chunk picks its own encoding. <b>Dictionary</b> encoding stores each distinct value once and a small id per row. <b>Bit packing</b> uses only the bits a value needs: three distinct values need 2 bits. <b>Run-length encoding</b> (RLE) stores a value and how many times it repeats, which works best on sorted data. <b>Delta</b> encoding stores the difference between neighbours, which suits timestamps and counters. A query can often work on the encoded form and decode only the rows it returns, which is called <b>late materialization</b>.</p>
<p>The encoding must fit the data. A dictionary on a column where every value is distinct is as large as the plain column, plus the ids. Writers detect this and fall back to plain encoding, but the chunk then gains nothing.</p>

<h3>5. Pruning with zone maps</h3>
<p>Before reading a chunk, the reader compares the filter with the min and max in the footer. If the filter cannot match, the group is skipped without any I/O. This only works when each group covers a narrow range. Data written in arrival order often has every group spanning the whole range, so nothing is skipped. Sorting or clustering by the filter column, and choosing a row-group size that is not too large, make the ranges narrow.</p>

<h3>6. The trade-off</h3>
<p>Columns read less and compress better, but appends are buffered until a row group fills, and one row touches many chunks. Updates in place are awkward, so column stores prefer batch loads and rewrite files. Encodings pay only when values repeat. Zone maps pay only when data is clustered. Check bytes read against bytes returned before and after a change of layout.</p>

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

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[2] = { explain: EXPLAIN, scenarios: [layout, enc, zones] };
})();
