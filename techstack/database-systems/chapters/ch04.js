/* Chapter 5 "Compression and Encodings" (index 4, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L05 Database Storage III (compression); CMU 15-721 L02 Data Formats I (encodings, block compression), L03 Data Formats II (BtrBlocks, FastLanes, BitWeaving).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: encodings shrinking one column, a filter run on dictionary codes, and a ratio-against-speed chart with the disk line. Numbers illustrative. */
(function () {
  const DB = window.DB;

  /* ---- 1. Encodings: one column shrinks through dictionary, bit packing and runs, and a unique column does not ---- */
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

  const SOURCE = { label: 'CMU 15-445 L05 Database Storage III (compression) and CMU 15-721 L02-L03 Data Formats I and II (notes in output/pdf)', href: '../../output/pdf/database-system/notes/03-data2.pdf' };

  /* ---- 2. Compressed execution: the engine compares codes and decodes only the rows that match ---- */
  const CODES = [0, 1, 0, 2, 0, 0, 1, 0, 2, 0], DICT = ['VN', 'SG', 'TH'];
  const MATCH = CODES.map(c => c === 0);
  const cx = i => 40 + i * 58;
  const cexec = {
    id: 'compressed-exec', label: 'Compare on codes', desc: 'The filter city = \'VN\' over a dictionary-encoded column. Decoding every value first compares strings row by row. Translating the constant once compares small integers and decodes only the matches (10 sample cells, illustrative).',
    codeLabel: 'Query',
    code: { bug: [
      "SELECT SUM(amount) FROM orders WHERE city = 'VN';",
      '-- column city: dictionary VN=0, SG=1, TH=2, one code per row',
      '-- naive: decode all codes to strings, then compare each string with \'VN\'',
      '-- aware: look \'VN\' up once in the dictionary -> code 0',
      '-- aware: compare integers, keep a bitmap of matches',
      '-- late materialization: fetch amount only where the bit is set',
      "-- WHERE city LIKE 'V%' tests the 3 dictionary entries, not every row",
    ] },
    stage: DB.stage({
      footer: 'Simplified: 10 sample cells stand for millions of rows. Illustrative.',
      header: s => ({ left: s.hl || 'column city: 10 codes', right: s.rt || '' }),
      draw(P, s) {
        P.text('hd', { x: 40, y: 80, t: 'dictionary', cls: 'mut sm' });
        DICT.forEach((d, i) => P.chip('d' + i, { x: 40 + i * 112, y: 88, w: 104, h: 38, label: d + ' = ' + i, sub: '', tone: s.key === i ? 'cursor' : 'info', small: true }));
        P.text('hc', { x: 40, y: 150, t: 'stored codes', cls: 'mut sm' });
        CODES.forEach((c, i) => P.chip('c' + i, { x: cx(i), y: 158, w: 52, h: 36, label: String(c), sub: '', tone: s.cmp ? (MATCH[i] ? 'ok' : 'mut') : 'info', small: true }));
        if (s.str) { P.text('hs', { x: 40, y: 218, t: 'decoded strings, one per row', cls: 'mut sm' });
          CODES.forEach((c, i) => P.chip('s' + i, { x: cx(i), y: 226, w: 52, h: 36, label: DICT[c], sub: '', tone: s.cmp ? (MATCH[i] ? 'ok' : 'warn') : 'bad', small: true })); }
        if (s.bits) { P.text('hb', { x: 40, y: 218, t: 'match bitmap', cls: 'mut sm' });
          MATCH.forEach((m, i) => P.chip('b' + i, { x: cx(i), y: 226, w: 52, h: 36, label: m ? '1' : '0', sub: '', tone: m ? 'ok' : 'mut', small: true })); }
        if (s.mat) { P.text('hm', { x: 40, y: 286, t: 'amount values fetched', cls: 'mut sm' });
          MATCH.forEach((m, i) => { if (m) P.chip('m' + i, { x: cx(i), y: 294, w: 52, h: 36, label: 'amt', sub: '', tone: 'live', small: true }); }); }
        if (s.lk) P.line('lk', 152, 126, 152 + 0, 158, { tone: 'cursor', arrow: true });
      }
    }),
    bug: [
      { log: 'The city column is dictionary encoded: three distinct strings are stored once, and every row holds a small code. Ten sample cells stand for millions of rows.', callout: 'Codes on disk, strings in the dictionary', code: 1,
        state: {}, stats: [{ l: 'rows', v: '10 (sample)' }, { l: 'dictionary entries', v: '3' }] },
      { log: 'The naive path decodes every code back into a string before it can test the filter. Ten rows mean ten dictionary lookups and ten string values built.', callout: 'Naive: decode every row first', code: 2,
        state: { str: 1, hl: 'naive: decode, then compare' }, stats: [{ l: 'values decoded', v: '10', cls: 'bad' }] },
      { log: 'Then each string is compared with \'VN\'. String comparison is slower than integer comparison and touches more memory.', callout: 'Then ten string comparisons', code: 2,
        state: { str: 1, cmp: 1, hl: 'naive: decode, then compare' }, stats: [{ l: 'string compares', v: '10', cls: 'bad' }] },
      { log: 'The aware path looks \'VN\' up in the dictionary once. The constant becomes the code 0, and the rest of the filter never needs the strings.', callout: 'Translate the constant once: VN is code 0', moment: true, code: 3,
        state: { key: 0, lk: 1, hl: 'aware: compare on codes' }, stats: [{ l: 'dictionary lookups', v: '1', cls: 'ok' }] },
      { log: 'Compare the stored codes with 0. This is an integer comparison that a SIMD instruction can run on many cells at once, and it produces a bitmap of matches.', callout: 'Compare integers, keep a bitmap', code: 4,
        state: { key: 0, cmp: 1, bits: 1, hl: 'aware: compare on codes' }, stats: [{ l: 'integer compares', v: '10', cls: 'ok' }, { l: 'matches', v: '6', cls: 'ok' }] },
      { log: 'Only the six matching rows need other columns. The engine fetches amount for the set bits and skips the other four: late materialization.', callout: 'Fetch amount only where the bit is set', code: 5,
        state: { key: 0, cmp: 1, bits: 1, mat: 1, hl: 'aware: compare on codes' }, stats: [{ l: 'amount values read', v: '6 of 10', cls: 'ok' }] },
      { log: 'A LIKE \'V%\' filter can go one step further. It tests the three dictionary entries and keeps the set of matching codes, so the string test runs 3 times, not once per row.', callout: 'LIKE runs over the dictionary, not the rows', code: 6,
        state: { key: 0, cmp: 1, bits: 1, hl: 'aware: compare on codes', rt: '3 string tests instead of 10' }, stats: [{ l: 'string tests', v: '3', cls: 'ok' }],
        takeaway: 'Operate on the encoded form. Translate the constant once, compare small integers, and decode only what survives.' },
    ],
  };

  /* ---- 3. Codec trade-off as a chart: compression ratio against decode speed, with the disk line ---- */
  const CODECS = [
    ['plain', 'plain', 1.0, 20, 'mut'],
    ['bitpack', 'bit-pack', 2.5, 12, 'ok'],
    ['dict', 'dictionary', 4.0, 8, 'ok'],
    ['rle', 'RLE', 12, 15, 'ok'],
    ['delta', 'delta', 3.0, 6, 'ok'],
    ['snappy', 'Snappy', 1.5, 2.2, 'warn'],
    ['lz4', 'LZ4', 2.0, 4.0, 'warn'],
    ['zstd', 'zstd -19', 3.4, 0.5, 'bad'],
  ];
  const GX0 = 70, GX1 = 590, GY0 = 284, GY1 = 112;      // plot box
  const gx = v => GX0 + (Math.log(v) - Math.log(0.4)) / (Math.log(24) - Math.log(0.4)) * (GX1 - GX0);
  const gy = r => GY0 - Math.log(r) / Math.log(14) * (GY0 - GY1);
  const DISK = 5;    // GB/s of the scan disk
  const tradeoff = {
    id: 'codec-chart', label: 'Ratio vs speed', desc: 'Each point is a way of storing the same column: compression ratio against decode speed. A scan that decodes slower than the disk delivers is limited by the CPU, not the disk (points and speeds illustrative).',
    codeLabel: 'Reading',
    code: { bug: [
      '-- x: decode speed in GB/s (log scale), y: compression ratio',
      '-- the vertical line is the disk: 5 GB/s of compressed bytes',
      '-- left of the line: the CPU cannot decode as fast as the disk reads',
      '-- lightweight encodings (bit-pack, dictionary, RLE, delta) sit right of it',
      '-- block codecs trade speed for ratio: zstd -19 is the slowest here',
      'storage bill down 40%, scans 3x slower: the codec moved the bottleneck to CPU',
    ] },
    stage: DB.stage({
      footer: 'Illustrative numbers, not a benchmark. Real values depend on data, CPU and library.',
      header: s => ({ left: s.hl || 'compression ratio vs decode speed', right: s.rt || '' }),
      draw(P, s) {
        P.line('ax', GX0, GY0 + 6, GX1, GY0 + 6, { tone: 'mut', sw: 1.4 });
        P.line('ay', GX0, GY0, GX0, GY1 - 10, { tone: 'mut', sw: 1.4 });
        P.text('xl', { x: GX1, y: GY0 + 40, t: 'decode speed, GB/s (log)', cls: 'mut xs', anchor: 'end' });
        P.text('yl', { x: GX0 + 6, y: GY1 - 14, t: 'compression ratio', cls: 'mut xs' });
        [0.5, 1, 2, 5, 10, 20].forEach((v, i) => P.text('tx' + i, { x: gx(v), y: GY0 + 22, t: String(v), cls: 'mut xs', anchor: 'middle' }));
        [1, 2, 4, 8, 12].forEach((r, i) => P.text('ty' + i, { x: GX0 - 8, y: gy(r) + 4, t: r + '×', cls: 'mut xs', anchor: 'end' }));
        if (s.disk) { P.line('disk', gx(DISK), GY0, gx(DISK), GY1 - 4, { tone: 'cursor', sw: 2, dash: true });
          P.text('dl', { x: gx(DISK) + 6, y: GY1 - 2, t: 'disk 5 GB/s', cls: 'xs' }); }
        CODECS.forEach(([id, name, ratio, speed, tone]) => {
          if (s.show && !s.show.includes(id)) return;
          const slow = speed < DISK;
          P.chip('p' + id, { x: gx(speed) - 33, y: gy(ratio) - 12, w: 66, h: 24, label: name, sub: '', tone: s.flag && slow ? 'bad' : tone, small: true, hl: s.pick === id });
        });
      }
    }),
    bug: [
      { log: 'The plain column is the baseline: no compression, and decoding it is a memory copy.', callout: 'Baseline: ratio 1, no decode work', code: 0,
        state: { show: ['plain'] }, stats: [{ l: 'ratio', v: '1×' }] },
      { log: 'Lightweight encodings keep values in a form the engine can read directly. Bit-packing, dictionary, RLE on sorted data and delta all raise the ratio and decode at several GB/s per core.', callout: 'Lightweight encodings: good ratio, fast decode', code: 3,
        state: { show: ['plain', 'bitpack', 'dict', 'rle', 'delta'] }, stats: [{ l: 'best ratio', v: 'RLE 12× (sorted data)', cls: 'ok' }] },
      { log: 'Block codecs treat the bytes as opaque. LZ4 and Snappy are quick but give a modest ratio, and a block must be decompressed before any value can be read.', callout: 'Block codecs: opaque, must decompress', code: 4,
        state: { show: ['plain', 'bitpack', 'dict', 'rle', 'delta', 'snappy', 'lz4'] }, stats: [{ l: 'LZ4 ratio', v: '2×', cls: 'warn' }] },
      { log: 'zstd at a high level gives a better ratio than LZ4 and a far lower decode speed. It is the point that pays the most in storage and the most in CPU.', callout: 'zstd -19: best block ratio, slowest decode', moment: true, code: 4,
        state: { show: ['plain', 'bitpack', 'dict', 'rle', 'delta', 'snappy', 'lz4', 'zstd'], pick: 'zstd' }, stats: [{ l: 'zstd -19', v: '3.4×, 0.5 GB/s', cls: 'bad' }] },
      { log: 'Draw the disk. A scan can only go as fast as the slower of the disk and the decoder. Points left of the line are limited by the CPU.', callout: 'The disk line splits the chart', code: 2,
        state: { show: ['plain', 'bitpack', 'dict', 'rle', 'delta', 'snappy', 'lz4', 'zstd'], disk: 1 }, stats: [{ l: 'disk', v: '5 GB/s' }] },
      { log: 'Snappy, LZ4 and zstd -19 all sit left of the line here. Choosing zstd -19 shrank the storage bill and made scans three times slower because the CPU is the bottleneck.', callout: 'Left of the line: the CPU is the limit', moment: true, code: 5,
        state: { show: ['plain', 'bitpack', 'dict', 'rle', 'delta', 'snappy', 'lz4', 'zstd'], disk: 1, flag: 1, pick: 'zstd', rt: 'scan limited by decode' }, stats: [{ l: 'scan speed', v: '0.5 GB/s of values', cls: 'bad' }, { l: 'storage', v: '-40%', cls: 'ok' }],
        takeaway: 'More compression is not free. Pick the codec so that decoding is at least as fast as the storage you read from, and prefer encodings you can query.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Why compress</h3>
<p>Reading data is usually the slowest step of a scan. If a column takes a quarter of the bytes, the I/O is a quarter, and more of the table fits in the buffer pool or in a worker&rsquo;s cache. The question is what compression costs in CPU, and whether the engine can still work on the data without undoing it. The lecture sets the goals: values must be <b>fixed-length</b> after encoding where possible, postpone decompression as long as possible during a query, and be <b>lossless</b>.</p>

<h3>2. Naive compression: opaque blocks</h3>
<p>General-purpose codecs such as Snappy, LZ4 and zstd compress a block of bytes with no knowledge of the schema. They are easy to apply to any file, and Parquet and ORC use them on top of their own encodings. But the DBMS must decompress the whole block before it can read one value, and the compressed form is useless for filters. Two blocks of the same table can compress very differently, and the ratio against speed depends on the level you choose.</p>

<h3>3. Columnar encodings: compress and keep the structure</h3>
<p>A column holds values of one type, often repeated or close together, so lighter encodings work well. <b>Run-length encoding</b> stores a value and a count, and shines on sorted or low-cardinality data. <b>Bit-packing</b> stores each value with only the bits it needs. <b>Delta</b> and <b>frame-of-reference</b> store differences from the previous value or from a base, which suits timestamps and ids. <b>Bitmap</b> encoding keeps a bit vector per distinct value. <b>Front coding</b> stores a shared prefix once for sorted strings. <b>Dictionary</b> encoding replaces each value by a small integer code, and keeps the distinct values once.</p>
<figure class="mm" aria-label="Decision flowchart for choosing an encoding for a column chunk" style="--diagram-width:790px">
  <img src="diagrams/ch04-encoding-choice.svg" alt="Flowchart: for a column chunk, if there are few distinct values use a dictionary, then RLE on the ids if the data is sorted with long runs, otherwise bit-pack the ids. If there are many distinct values, use delta or frame of reference with bit-packing for close or increasing numbers, front coding for strings with shared prefixes, and otherwise plain with block compression.">
  <figcaption>Flowchart: how a writer picks an encoding. Each branch is a property of the column, not of the table.</figcaption>
</figure>
<p>Encoding must fit the data. A dictionary on a column where every value is distinct costs as much as the plain column plus the ids, and writers fall back to plain. Sorting the table can turn a poor RLE candidate into an excellent one, which is why sort order appears in the next chapters again.</p>

<h3>4. Operate on compressed data</h3>
<p>The biggest win is not to decode at all. With a dictionary, the engine translates a constant such as <code>'VN'</code> into its code once and compares codes. A <code>LIKE</code> test can run over the dictionary entries instead of every row. With RLE, an aggregate can add <code>value × count</code> without expanding the run. After the filter, <b>late materialization</b> reads the other columns only for the rows that matched.</p>
<figure class="mm" aria-label="Flowchart: opaque block path decompresses everything, encoding-aware path compares codes and decodes only matches" style="--diagram-width:362px">
  <img src="diagrams/ch04-compressed-exec.svg" alt="Flowchart: for a compressed chunk, if the engine does not understand the encoding it decompresses the whole block, decodes every value and compares strings row by row. If it understands dictionary, RLE or bit-packing, it translates the constant once into a code, compares small integers and decodes only the rows that match.">
  <figcaption>Flowchart: two ways to run the same filter on the same chunk.</figcaption>
</figure>

<h3>5. Newer designs from the 15-721 papers</h3>
<p><b>BtrBlocks</b> chooses encodings by <em>sampling</em> a few runs of values, and applies them in cascade: dictionary, then RLE on the ids, then bit-packing, picking the best combination per chunk. <b>FastLanes</b> stores values in a transposed order so decoding uses SIMD lanes with no dependency between neighbours: delta decoding normally needs the previous value, and the transposed layout breaks that chain. <b>BitWeaving</b> stores bit-sliced columns so that a scan filter on a code can process the top bits first and stop early. These show a pattern: the best encoding is the one that decodes into the shape the CPU wants.</p>

<h3>6. The trade-off</h3>
<p>Heavier compression gives a smaller bill and costs CPU, and the bottleneck moves from the disk to the decoder as the ratio rises. Lightweight encodings cost little and can be queried, but need data that suits them. Object stores charge for bytes read, so higher ratios pay more there than on a local SSD. Measure decode speed against storage speed before you change a codec.</p>

<h3>7. Syntax</h3>
<pre>-- Parquet: encoding per column and codec per file (DuckDB)
COPY orders TO 'orders.parquet' (FORMAT parquet, COMPRESSION zstd, COMPRESSION_LEVEL 3);

-- which encoding each column chunk used
SELECT path_in_schema, encodings, compression, total_compressed_size, total_uncompressed_size
FROM parquet_metadata('orders.parquet');

-- sort so low-cardinality columns form long runs
COPY (SELECT * FROM orders ORDER BY city, ship_date) TO 'orders_sorted.parquet' (FORMAT parquet);</pre>
<p>Compare <code>total_compressed_size</code> with <code>total_uncompressed_size</code> per column. A ratio near 1 means the encoding found nothing to exploit.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `The platform team recompresses a 2 TB events table from Snappy to zstd level 19 and the storage bill falls by 40% (illustrative). The next morning the dashboards scan three times slower, the CPUs sit at 95% and the disks are mostly idle. A second table, whose <code>user_id</code> column is unique in every row, did not shrink at all after dictionary encoding.`,
    predict: {
      q: `A sorted column of 1,000,000 rows holds only 3 distinct values. Which storage form is smallest?`,
      opts: [
        `Run-length encoding: three runs, each a value and a count`,
        `Dictionary encoding: three entries and 1,000,000 ids of 2 bits`,
        `Bit-packing the raw values, 8 bits each`,
        `LZ4 on the plain column`
      ],
      ans: 0,
      why: `Sorting makes the 3 values form 3 runs, so RLE stores about 3 pairs. A dictionary still needs an id for every row, about 250 KB at 2 bits each. Bit-packing and LZ4 also remain proportional to the number of rows.`
    },
    diagnose: [
      {
        t: 'CPU-bound scan after heavy compression',
        sym: '<b>CPU</b> is near 100% and disk throughput is low while a scan runs.',
        ctx: 'A table was rewritten with zstd level 19 to save storage. Each block is smaller on disk, but each block takes much longer to decompress.',
        why: 'A scan is limited by the slower of reading and decoding. At a high level, zstd decodes much slower than the disk delivers bytes, so the CPU is the bottleneck and the disk idles.',
        log: `-- representative, illustrative
scan: bytes read 0.6 TB  (was 1.0 TB)   time 310 s (was 100 s)
cpu: 95% user, io wait 3%   decode: 0.5 GB/s per core`,
        note: 'High user CPU with idle I/O during a scan points at decoding. A ratio gain that makes the scan slower is a bad trade for a hot table.',
        fix: [
          'Measure first: compare scan time, CPU and I/O wait before and after the codec change, and read decode time in the engine profile.',
          'Use a fast codec on hot data (Snappy, LZ4 or zstd at a low level), and a heavy one only on cold data that is rarely scanned.',
          'Prefer encodings the engine can query, such as dictionary and RLE, so less decompression is needed.',
          'Verify: rerun the same dashboard scan and compare the elapsed time with the old codec.'
        ]
      },
      {
        t: 'High-cardinality dictionary',
        sym: '<b>Encoded size</b> grows above the plain size, and the writer has to fall back.',
        ctx: 'user_id is unique in every row; city has only 2 values. Plain: 64 bytes per column. A dictionary of 8 entries for user_id costs 67 bytes, more than plain.',
        why: 'A dictionary stores each distinct value once, plus an id per row. When almost every value is distinct, the dictionary is as large as the data, so it saves nothing and costs work.',
        log: `-- representative writer warning; wording varies by version
WARN: dictionary for column user_id exceeded its size limit; falling back to plain encoding`,
        note: 'A fallback message names the column. The size in the footer will be near the plain size.',
        fix: [
          'Measure first: check the encoded size of each column in the file metadata, and compare it with the plain size.',
          'Dictionary-encode only columns with few distinct values, such as city or status.',
          'Let the writer fall back to plain or delta encoding for unique columns, such as ids and timestamps.',
          'Verify: user_id should stay close to its plain size, and city should shrink.'
        ]
      },
      {
        t: 'Unsorted data defeats RLE',
        sym: '<b>Compression ratio</b> of a low-cardinality column is far below what the data allows.',
        ctx: 'A status column has 3 values but they arrive in random order, so no value repeats twice in a row.',
        why: 'Run-length encoding gains from runs. In random order every run has length 1, so RLE stores a pair per row, which is bigger than the plain column. Sorting by the column, or by a prefix of columns, creates the runs.',
        log: `-- representative footer, illustrative
column status: encodings RLE_DICTIONARY, compressed 61 MB, uncompressed 64 MB`,
        note: 'A ratio near 1 on a column with few distinct values means the order is the problem, not the encoding.',
        fix: [
          'Measure first: count the runs, or compare compressed and uncompressed size per column in the footer.',
          'Sort the table by the low-cardinality columns that queries filter on, before writing the file.',
          'Put the most selective filter column first in the sort key, and keep the sort in the periodic rewrite job.',
          'Verify: compare the compressed size of the column before and after the sorted rewrite.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[4] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [enc, cexec, tradeoff] };
})();
