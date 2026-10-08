/* Chapter 4 · indexes: hash tables, B+ trees, Bloom filters and index latches. Owns access paths; pages and the buffer pool are chapter 2, encodings are chapter 3, joins are chapter 6. */
PG.indexes = function (root, A) {
  const { h, seg } = A;
  const sec = SX.sec, para = SX.para, stat = SX.stat, stepper = SX.stepper;

  SX.css('ch04-css', `
.c04-rows{display:grid;gap:8px;margin:10px 0}
.c04-row{display:grid;grid-template-columns:minmax(96px,140px) 1fr minmax(84px,auto);gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.c04-row.on{border:2px solid var(--acc)}
.c04-row small{display:block;color:var(--mut);font-size:12px;line-height:1.3}
.c04-track{height:12px;border-radius:6px;background:var(--soft);overflow:hidden}
.c04-track i{display:block;height:100%;background:var(--acc2);border-radius:6px}
.c04-val{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;text-align:right;white-space:nowrap;color:var(--ink)}
.c04-cells{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin:8px 0}
.c04-cells.four{grid-template-columns:repeat(5,1fr)}
.c04-cell{min-height:28px;border:1px solid var(--line);border-radius:4px;background:var(--soft);font-size:11px;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--mut);padding:2px}
.c04-cell.on{background:var(--acc);border-color:var(--acc);color:#fff}
.c04-cell.hit{background:var(--ok);border-color:var(--ok);color:#fff}
.c04-grid20{display:grid;grid-template-columns:repeat(20,1fr);gap:3px;margin:8px 0}
.c04-f{height:14px;border-radius:3px;background:var(--soft);border:1px solid var(--line)}
.c04-f.no{background:var(--ok);border-color:var(--ok);opacity:.5}
.c04-f.fp{background:var(--bad);border-color:var(--bad)}
.c04-leaves{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}
.c04-leaf{border:1px solid var(--line);border-radius:8px;padding:8px 4px;text-align:center;background:var(--soft);font-size:12px;color:var(--ink)}
.c04-leaf b{display:block;font-size:15px}
.c04-leaf.hot{background:var(--bad);border-color:var(--bad);color:#fff}
.c04-leaf.spread{background:var(--ok);border-color:var(--ok);color:#fff}
.c04-wrap{overflow-x:auto;max-width:100%}
.c04-note{color:var(--mut);font-size:13px}
@media (max-width:560px){.c04-row{grid-template-columns:1fr;gap:6px}.c04-val{text-align:left}}
`);

  /* ---- model constants: every number on this page is computed from these ---- */
  const N0 = 100000000;            // rows at build time (the plan's 100 million)
  const ROWS_PAGE = 100;           // rows per heap page, for a scan
  const FANOUT = 256;              // entries per B+ tree node (illustrative: a 4 KB page with about 16-byte entries)
  const FILL = 0.69;               // average leaf fill after random inserts (a known estimate, about ln 2)
  const SLOTS0 = 2 ** 27;          // hash table slots at build time (about 1.3 slots per key)
  const ENTRY = 40, ROW = 200;     // bytes per index entry and per table row (illustrative)
  const FILES = 100, FILE_ROWS = 1000000, BITS = 10;  // Bloom: 100 files of 1 million keys, 10 bits per key at build

  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pct = p => (p * 100).toFixed(2) + '%';
  const height = n => Math.ceil(Math.log(n) / Math.log(FANOUT) - 1e-9);      // levels in a B+ tree with n entries
  const leaves = n => Math.ceil(n / (FANOUT * FILL));                        // leaf pages after random inserts
  const TABLE_GB = N0 * ROW / 1e9;                                           // 20 GB
  const INDEX_GB = N0 * ENTRY / FILL / 1e9;                                  // about 5.8 GB per index

  function hashAt(n) {                           // linear probing; the table doubles when it is full
    let C = SLOTS0, rebuilds = 0;
    while (n > C) { C *= 2; rebuilds++; }
    const a = n / C;
    return { C, a, rebuilds,
      succ: 0.5 * (1 + 1 / (1 - a)),             // expected probes, key present (Knuth)
      miss: 0.5 * (1 + 1 / ((1 - a) * (1 - a))) }; // expected probes, key absent
  }
  const K = Math.round(BITS * Math.LN2);         // 7 hash functions for 10 bits per key
  const M = BITS * FILE_ROWS;                    // filter size in bits, fixed when the file was built
  const fpr = (nf, m, k) => Math.pow(1 - Math.exp(-k * nf / m), k);

  /* the cost of one lookup under each method, for the current key and insert count */
  function cost(method, present, ins) {
    const n = N0 + ins;
    if (method === 'scan') {
      return { v: n / ROWS_PAGE, unit: 'pages read', items: [['rows examined', fmt(n)]] };
    }
    if (method === 'hash') {
      const st = hashAt(n);
      return { v: present ? st.succ : st.miss, unit: 'slots probed',
        items: [['load factor', st.a.toFixed(3)], ['table slots', fmt(st.C)], ['rebuilds since build', st.rebuilds]] };
    }
    if (method === 'btree') {
      const hg = height(n);
      return { v: hg, unit: 'pages read', items: [['tree height', hg], ['leaf splits since build', fmt(leaves(n) - leaves(N0))], ['leaf pages', fmt(leaves(n))]] };
    }
    const nf = n / FILES, p = fpr(nf, M, K), hf = height(nf);
    const maybe = present ? 1 + (FILES - 1) * p : FILES * p;
    return { v: present ? hf + (FILES - 1) * p * hf : FILES * p * hf, unit: 'index pages read',
      items: [['false positive rate', pct(p)], ['files that say maybe', maybe.toFixed(2)], ['index height per file', hf]] };
  }

  /* PLAYGROUND: one lookup, four access paths, and inserts that change each structure */
  function playground() {
    let method = 'btree', present = true, ins = 0;
    const rowsBox = h('div', { class: 'c04-rows' }), statBox = h('div', { class: 'sx-stats' }), txt = h('p', { class: 'sx-txt' });
    const NAMES = [
      { k: 'scan', n: 'Full scan', d: 'reads every page' },
      { k: 'hash', n: 'Hash index', d: 'hashes the key, probes slots' },
      { k: 'btree', n: 'B+ tree', d: 'one node per level' },
      { k: 'bloom', n: 'Bloom + index', d: 'filters first, then reads files' }];
    const TEXT = {
      scan: 'A full scan reads every page of the table. It costs the same whether the customer exists or not.',
      hash: 'A hash lookup hashes the key and probes slots. A missing key must reach an empty slot to be sure, so it costs far more than a present key once the table is crowded (load factor above about 0.8).',
      btree: 'A B+ tree lookup reads one node per level. A missing key still walks down to a leaf, because a parent node cannot tell whether a key exists below it.',
      bloom: 'Each file has a Bloom filter in memory, which costs no page reads. A no skips the file. A maybe reads that file index: for a missing key that read is wasted, and the filter sized for 1 million keys per file gets worse as keys are added.'
    };
    const paint = () => {
      const cs = NAMES.map(x => ({ x, c: cost(x.k, present, ins) }));
      const LOG_MAX = Math.log10(1e6 + 1);
      rowsBox.replaceChildren(...cs.map(({ x, c }) => h('div', { class: 'c04-row' + (x.k === method ? ' on' : '') },
        h('div', {}, h('b', {}, x.n), h('small', {}, x.d)),
        h('div', { class: 'c04-track' }, h('i', { style: 'width:' + Math.max(2, Math.min(100, Math.log10(c.v + 1) / LOG_MAX * 100)).toFixed(1) + '%' })),
        h('div', { class: 'c04-val' }, (c.v < 10 ? c.v.toFixed(2) : fmt(c.v)) + ' ' + c.unit))));
      const cur = cs.find(s => s.x.k === method).c;
      statBox.replaceChildren(stat(cur.unit, cur.v < 10 ? cur.v.toFixed(2) : fmt(cur.v)), ...cur.items.map(([l, v]) => stat(l, v)));
      txt.textContent = TEXT[method] + ' Bars use a log scale. Rows: ' + fmt(N0 + ins) + ' keys in the table.';
    };
    const methodSeg = seg([{ v: 'scan', l: 'Full scan' }, { v: 'hash', l: 'Hash index' }, { v: 'btree', l: 'B+ tree' }, { v: 'bloom', l: 'Bloom + index' }], method, v => { method = v; paint(); });
    const keySeg = seg([{ v: true, l: 'Customer exists' }, { v: false, l: 'Customer missing' }], present, v => { present = v; paint(); });
    const insSeg = seg([{ v: 0, l: 'Built' }, { v: 10000000, l: '+10M inserted' }, { v: 20000000, l: '+20M inserted' }, { v: 40000000, l: '+40M inserted' }], ins, v => { ins = v; paint(); });
    paint();
    return h('div', { class: 'c04-wrap' },
      h('div', { class: 'sx-play' },
        h('div', { class: 'sx-controls' }, methodSeg, keySeg),
        h('div', { class: 'sx-controls' }, h('small', {}, 'Inserts since build (cumulative): '), insSeg),
        rowsBox, statBox, txt),
      h('p', { class: 'c04-note' }, 'Illustrative numbers: 100 million rows, 256-way nodes, 10 bits per key, 100 Bloom files of 1 million keys. Only the shape of each curve matters.'));
  }

  /* ---- COMMON PROBLEMS: each demo is a stepper whose last number differs between Failure and After fix ---- */
  function compositeDemo(mode) {
    const good = mode === 'good', hg = height(N0), lp = leaves(N0);
    const states = [{ t: 'Start: the query asks for customer_id = 4242. ' + (good ? 'The index is (customer_id, status), so customer_id is the leading column.' : 'The index is (status, customer_id), so the leading column is status, which the query does not filter on.'), n: 0, p: 0, cells: [], on: 0 }];
    if (good) {
      states.push({ t: 'Descend the tree from the root: ' + hg + ' pages, one per level, guided by the sorted customer_id values.', n: 0, p: hg, cells: ['root', 'inner', 'inner', 'leaf'], on: 4 });
      states.push({ t: 'Read the leaf run where customer_id = 4242: 100 entries that sit next to each other.', n: 100, p: hg + 1, cells: ['root', 'inner', 'inner', 'leaf', '100 hits'], on: 5, hit: 4 });
    } else {
      for (let k = 1; k <= 10; k++) {
        states.push({ t: 'Scan the whole index, chunk ' + k + ' of 10. Every status group holds customer ids in no useful order, so nothing can be skipped.', n: N0 * k / 10, p: Math.round(lp * k / 10), cells: Array.from({ length: 10 }, (_, i) => 'chunk ' + (i + 1)), on: k, hit: -1 });
      }
      states[states.length - 1].t = 'Finished: 100 rows match, but 100,000,000 entries were examined and ' + fmt(lp) + ' leaf pages were read.';
    }
    return stepper(states, s => [
      h('div', { class: 'c04-cells' + (good ? ' four' : '') }, s.cells.map((c, i) => h('div', { class: 'c04-cell' + (i < s.on ? (i === s.hit ? ' hit' : ' on') : '') }, c))),
      h('div', { class: 'sx-stats' }, stat('entries examined', fmt(s.n)), stat('pages read', fmt(s.p)))]);
  }

  function indexCountDemo(mode) {
    const good = mode === 'good';
    const states = [];
    const writes = i => 1 + i, size = i => TABLE_GB + i * INDEX_GB;
    if (!good) {
      states.push({ t: 'Start: the orders table alone. One insert writes 1 table page and no index page.', i: 0 });
      for (let i = 1; i <= 8; i++) states.push({ t: 'Add index ' + i + ' of 8. Each insert must now also write one leaf page in this index.', i });
      states.push({ t: 'Finished: 8 indexes, but only 2 of them serve the workload. Every insert writes ' + writes(8) + ' pages.', i: 8 });
    } else {
      states.push({ t: 'Start: the table has 8 indexes. Every insert writes ' + writes(8) + ' pages.', i: 8 });
      for (let i = 7; i >= 2; i--) states.push({ t: 'Drop an index that no query uses (' + (8 - i) + ' of 6 dropped). ' + i + ' indexes remain.', i });
      states.push({ t: 'Finished: 2 indexes that the workload uses. Every insert writes ' + writes(2) + ' pages.', i: 2 });
    }
    return stepper(states, s => [
      h('div', { class: 'c04-cells' }, Array.from({ length: 8 }, (_, k) => h('div', { class: 'c04-cell' + (k < s.i ? ' on' : '') }, 'idx ' + (k + 1)))),
      h('div', { class: 'sx-stats' }, stat('page writes per insert', writes(s.i)), stat('storage', size(s.i).toFixed(1) + ' GB'))]);
  }

  function sequentialDemo(mode) {
    const good = mode === 'good', L = 8, T = 16;
    const states = [{ t: 'Start: no inserts yet. 16 threads insert one key each per round. The index has 8 leaves.', counts: Array(L).fill(0), inserts: 0, waits: 0 }];
    for (let r = 1; r <= 4; r++) {
      const counts = Array(L).fill(0);
      if (good) for (let t = 0; t < T; t++) counts[t % L]++;   // key prefix = thread % 8, so the keys spread over 8 leaves
      else counts[L - 1] = T;                                    // keys always larger than the last: all land on the rightmost leaf
      const waits = good ? T - L : T - 1;                        // threads that wait for a leaf latch another thread holds
      states.push({ t: 'Round ' + r + ': ' + (good ? 'the prefix spreads the 16 keys over 8 leaves, 2 per leaf. ' : 'all 16 keys are larger than the last key, so all land on leaf 8. ') + waits + ' of 16 threads wait for a latch this round.', counts, inserts: r * T, waits, cum: r * T, rightCum: good ? r * 2 : r * T });
    }
    states[states.length - 1].t = good ? 'Finished: 64 inserts, and only 12.5 percent went to the rightmost leaf. Each round, 8 threads waited.' : 'Finished: 64 inserts, and 100 percent went to the rightmost leaf. Each round, 15 of 16 threads waited.';
    return stepper(states, s => [
      h('div', { class: 'c04-leaves' }, s.counts.map((c, i) => h('div', { class: 'c04-leaf ' + (c === 0 ? '' : (good ? 'spread' : (i === L - 1 ? 'hot' : ''))) }, h('b', {}, c), 'leaf ' + (i + 1) + (i === L - 1 ? ' (rightmost)' : '')))),
      h('div', { class: 'sx-stats' }, stat('inserts on rightmost leaf', s.inserts ? (good ? '12.5%' : '100%') : '0%'), stat('latch waits this round', s.waits))]);
  }

  /* one seeded run, shared by the stepper and the problem tab, so both show the same counts */
  function bloomRun(bits) {
    const k = Math.round(bits * Math.LN2), m = bits * FILE_ROWS, p = fpr(FILE_ROWS, m, k), rnd = rng(7);
    const flags = Array.from({ length: FILES }, () => rnd() < p);   // a file says maybe with probability p
    return { k, p, flags, fp: flags.filter(Boolean).length };
  }
  function bloomDemo(mode) {
    const good = mode === 'good', bits = good ? 10 : 3;
    const { k, p, flags } = bloomRun(bits);
    const states = [{ t: 'Start: a lookup for a customer that is in none of the 100 files. Each filter has ' + bits + ' bits per key, so k = ' + k + ' hash functions.', seen: 0, fp: 0 }];
    for (let f = 0; f < FILES; f += 5) {
      const seen = Math.min(FILES, f + 5), fp = flags.slice(0, seen).filter(Boolean).length;
      states.push({ t: 'Check files ' + (f + 1) + ' to ' + seen + '. ' + flags.slice(f, seen).filter(Boolean).length + ' of them say maybe, and each maybe reads an index with height ' + height(FILE_ROWS) + ' (a wasted read).', seen, fp });
    }
    const last = states[states.length - 1];
    last.t = 'Finished: ' + last.fp + ' of 100 files said maybe for a missing key (expected ' + (FILES * p).toFixed(1) + ', one seeded run). That is ' + last.fp * height(FILE_ROWS) + ' wasted index page reads.';
    return stepper(states, s => [
      h('div', { class: 'c04-grid20' }, Array.from({ length: FILES }, (_, i) => h('div', { class: 'c04-f' + (i < s.seen ? (flags[i] ? ' fp' : ' no') : '') }))),
      h('div', { class: 'sx-stats' }, stat('bits per key', bits), stat('false positive rate', pct(p)), stat('wasted index reads', s.fp * height(FILE_ROWS)))]);
  }

  const PROBLEMS = [
    { tab: 'Wrong leading column',
      sym: 'a lookup by customer_id examines all 100,000,000 index entries to return 100 rows.',
      why: 'A B+ tree is sorted by the first column, then by the second inside each group. With status first, customer 4242 is spread over all four status groups, so no prefix of the key narrows the search.',
      log: 'representative plan summary, counts illustrative\nIndex Scan using orders_status_customer_idx (status, customer_id)\nFilter: (customer_id = 4242)\nrows examined: 100000000, rows returned: 100',
      demo: v => compositeDemo(v),
      fix: ['Put the column that the query filters on with equality first: (customer_id, status).', 'A B+ tree can use any leading prefix of its key, but not a column that comes after a missing prefix. Check the query shapes before choosing the order.', 'For queries that filter on status alone, add a second index that starts with status, instead of making the first index serve both.', 'Verify: compare rows examined in the plan before and after the change.'] },
    { tab: 'Too many indexes',
      sym: 'each insert writes ' + (1 + 8) + ' pages, and the 8 indexes take ' + (TABLE_GB + 8 * INDEX_GB).toFixed(1) + ' GB for a ' + TABLE_GB.toFixed(0) + ' GB table.',
      why: 'Every index is a copy of some columns, kept in sorted order. An insert must update the leaf of each index, so writes grow with the number of indexes, and so does storage. Most indexes are rarely used.',
      log: 'representative usage report, counts illustrative\nindex orders_idx_3: scans 0 in 30 days, writes 100000000\nindex orders_idx_7: scans 0 in 30 days, writes 100000000\npage writes per insert: 9',
      demo: v => indexCountDemo(v === 'bad' ? 'bad' : 'good'),
      fix: ['List the indexes with their scan counts from the usage statistics. Drop the ones that no query uses.', 'Combine indexes that share a leading column when one of them can serve both queries.', 'Keep a primary key and the few indexes that the top queries need. Measure insert rate before and after each drop.', 'Verify: page writes per insert and storage size, before and after the change.'] },
    { tab: 'Sequential keys',
      sym: 'every insert lands on the rightmost leaf, and most threads wait for its latch.',
      why: 'Keys that always increase, such as serial ids and timestamps, are always placed at the right end of the tree. Every insert then takes the write latch on the same leaf, so the threads run one at a time.',
      log: 'representative latch summary, counts illustrative\nindex orders_pkey, leaf 8 (rightmost)\nthreads: 16, inserts per round: 16\nlatch waits per round: 15',
      demo: v => sequentialDemo(v),
      fix: ['Spread the keys: prefix the key with a shard number (for example id % 8), so that inserts go to different leaves.', 'Use a key that does not follow arrival order, such as a hashed or random id, when write load is high. This costs locality for range scans.', 'Keep the sequential key when range scans by time matter more, and shard the index instead of changing the key.', 'Verify: count inserts per leaf and latch waits per round, before and after the change.'] },
    { tab: 'Undersized Bloom filter',
      sym: 'a lookup for a missing customer reads ' + bloomRun(3).fp * height(FILE_ROWS) + ' index pages, because ' + bloomRun(3).fp + ' of 100 filters say maybe (one seeded run; expected ' + (FILES * fpr(FILE_ROWS, 3 * FILE_ROWS, 2)).toFixed(1) + ').',
      why: 'A Bloom filter never has false negatives, but its false positive rate depends on bits per key. At 3 bits per key, roughly one filter in four says maybe for any key, so most of the files the filter was meant to skip are read.',
      log: 'representative counter names, values illustrative (same seeded run as the playground stepper)\nbloom_filter_checked: 100 files\nbloom_filter_maybe: ' + bloomRun(3).fp + ' (key absent)\nindex pages read: ' + bloomRun(3).fp * height(FILE_ROWS),
      demo: v => bloomDemo(v),
      fix: ['Size each filter by bits per key. About 10 bits per key gives about 1 percent false positives with 7 hash functions.', 'Choose the number of hash functions as k = (m / n) ln 2, not a fixed small number.', 'When a file grows, rebuild its filter for the new key count. A filter sized for 1 million keys gets worse silently as keys are added (see the playground).', 'Verify: count maybe answers for keys that are not present, and compare with the expected false positive rate.'] }
  ];

  root.append(
    sec('1 · The problem',
      para('A customer table has 100 million rows. A lookup by customer id, with no index, reads all of them to find the one that matches.'),
      para('At an illustrative 1 million rows per second, that scan takes 100 seconds, and nearly all of the work finds nothing.'),
      para('An index keeps a second structure that tells the database where to look. Every insert then has to update that structure too.'),
      h('p', { class: 'sx-q', html: 'How can the database find one row among 100 million without reading them all, and what does each index cost on every write?' })),
    sec('2 · Core idea and mechanisms',
      para('<b>Core idea:</b> keep an auxiliary structure that rules out most rows quickly, and pay for it with space and extra work on every write.'),
      h('ul', { class: 'sx-list', html: [
        '<b>Hash tables:</b> a hash function maps a key to a slot. Lookups are O(1) on average, but the keys have no order, so there are no range scans or prefix searches. Hash functions only need to be fast and spread keys well, so they are not cryptographic. XXHash3 is cited as the current state of the art.',
        '<b>Open addressing and static hashing:</b> every key lives in the slots of the table itself, and the table size is fixed. <b>Linear probing</b> (open addressing with the next slot) scans forward from the hashed slot, wraps around, and deletes with tombstones. <b>Cuckoo hashing</b> uses several hash functions so a lookup checks only a few slots, and an insert may evict and move an entry.',
        '<b>Dynamic hashing:</b> <b>chained hashing</b> hangs an overflow chain on each bucket. <b>Extendible hashing</b> keeps a slot directory with a global depth and per-bucket local depths, so a full bucket splits and only its entries move. <b>Linear hashing</b> splits buckets in order, using a split pointer, so growth never needs a full rebuild.',
        '<b>Non-unique keys:</b> store the same key once per row (linear probing still works), or keep a separate list of values for each key.',
        '<b>B+ tree:</b> a balanced, sorted tree. Values sit only in the leaves, and sibling pointers link the leaves for range scans. Lookups, inserts and deletes take O(log n) node visits. With 256 entries per node, 100 million keys need 4 levels (illustrative).',
        '<b>Insert and delete:</b> insert into the leaf in sorted order. If the leaf is full, split it and copy the middle key up to the parent. Delete rebalances a node that falls below half full: first by borrowing from a sibling, then by merging, which removes the entry in the parent.',
        '<b>Composite keys:</b> an index on (a, b, c) serves a query on a prefix such as a, or a and b, but not on b alone. Conditions are combined with AND; OR is generally not supported.',
        '<b>Duplicate keys and clustering:</b> append the record id to make each key unique, or let leaves spill into overflow pages. A clustered index stores the table in key order. An unclustered index sorts the page ids of its matches, so each page is fetched once.',
        '<b>Node size:</b> disk nodes are large, to cut seeks. In memory, nodes can be as small as 512 bytes, to fit the CPU cache. <b>Merge threshold:</b> merging can wait, to avoid thrashing and to batch the work.',
        '<b>Variable-length keys:</b> store a pointer to the key (rare), use variable-length nodes (hard to manage), pad every key (wasteful), or use a key map that stores an index into a separate dictionary. The key map is what nearly every system uses.',
        '<b>Search inside a node:</b> linear (easy to vectorize with SIMD), binary (needs sorted nodes), or interpolation (fast, but only for keys with a suitable distribution).',
        '<b>B+ tree optimizations:</b> prefix compression (store a shared prefix once per node), deduplication (write a repeated key once), suffix truncation (inner keys only need enough bytes to route a probe), <b>pointer swizzling</b> (replace page ids with direct pointers while a page is pinned; buffer pool details are in chapter 2), <b>bulk insert</b> (build sorted leaves bottom-up instead of splitting), and write-optimized trees such as the B-epsilon tree, which log changes in inner nodes and push them down later (described in the course notes; not checked further here).',
        '<b>Bloom filter:</b> a bit array with k hash functions. An insert sets k bits. A lookup answers "no" for certain or "maybe". There are no false negatives. The false positive rate is (1 - e^(-kn/m))^k. This is derived from the standard Bloom filter analysis, not quoted from the notes, and k = (m/n) ln 2 minimizes it. The course notes say counting Bloom and cuckoo filters support deletes.',
        '<b>Other structures (one line each):</b> a <b>skip list</b> keeps ordered linked lists at several levels and needs no rebalancing, which suits memtables. A <b>trie</b> stores keys as digits, and radix compression removes single-child chains. An <b>inverted index</b> maps each term to a posting list, for keyword search (the course notes name Lucene and PostgreSQL GIN as examples). A <b>vector index</b>, such as IVF or HNSW, finds approximate nearest neighbors.',
        '<b>Index concurrency:</b> the goal here is physical correctness: no thread reads a broken pointer. <b>Latches</b> are short, low-level locks on in-memory structures. They are not the transaction locks of chapter 12, and the code, not a deadlock detector, must avoid deadlocks.',
        '<b>Latch implementations:</b> a test-and-set spin latch uses compare-and-swap (CAS) and is fast but wastes CPU under contention. An OS mutex is simple but costs about 25 ns per call and loses control to the scheduler. A reader-writer latch lets many readers share it.',
        '<b>Hash table latching:</b> page latches (one per page) or slot latches (one per slot) trade parallelism against overhead. A static table is easy to latch, because all threads move forward and take one latch at a time. A latch-free linear probing table can insert with CAS on each slot.',
        '<b>B+ tree latch crabbing:</b> take the child latch, then release the parent once the child is safe (not full for an insert, more than half full for a delete). The optimistic version takes read latches on the way down and a write latch only on the leaf; if that leaf is not safe, it restarts with the full protocol. Leaf sibling scans can deadlock with top-down latching, so they use a no-wait rule: abort, release, and retry.'
      ].map(x => '<li>' + x + '</li>').join('') }),
      para('<b>Owned elsewhere:</b> pages and the buffer pool are chapter 2; encodings such as dictionary coding are chapter 3; hash joins and sorting are chapter 6; the optimizer that chooses an index is chapter 9; locks and isolation are chapters 11 and 12.')),
    sec('3 · Playground: four ways to find one customer', playground()),
    sec('4 · Common problems · what breaks in production?', SX.problems(PROBLEMS))
  );
};
