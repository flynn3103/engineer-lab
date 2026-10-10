/* Chapter 8 "Filters and Specialized Indexes" (index 7, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L09 Tree Indexes II (Bloom filter, skip list, trie, inverted index, vector index).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: Bloom filter bits, a skip list search and insert, two posting lists merged, and an inverted-file vector search that can miss. Numbers illustrative. */
(function () {
  const DB = window.DB;
  const SOURCE = { label: 'CMU 15-445 L09 Tree Indexes II (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/09-indexes2.pdf' };

  /* ---- 1. Bloom filter: bits set by inserts, a probe says "no" for sure or "maybe" ---- */
  const BW = 36, BX = i => 30 + (i % 16) * BW, BY = i => 150 + Math.floor(i / 16) * 50;
  const KEYSET = { ana: [3, 11, 20], ben: [7, 14, 27], cy: [1, 18, 25] };
  const OWN = { ana: 't0', ben: 't2', cy: 't4' };
  const bitOwner = (keys, b) => keys.find(k => KEYSET[k].includes(b));
  const FULL = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 30, 31];
  const bloom = {
    id: 'bloom-filter', label: 'Bloom filter', desc: 'A 32-bit array and three hash functions. A probe answers "no" for certain or "maybe". A saturated array says "maybe" to everything (illustrative).',
    codeLabel: 'Config',
    code: { bug: [
      '-- one Bloom filter per file: 32 bits, k = 3 hash functions (illustrative)',
      'insert ana, ben, cy: each key sets the 3 bits its hashes pick',
      'probe dee: bit 5 is 0, so dee is certainly not in the file: skip the read',
      'probe eve: all 3 bits happen to be set by other keys: "maybe", a wasted read',
      '-- sized for 1 million keys, then 5 million arrive: nearly every bit is 1',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 32 bits, 3 hashes. Real filters use about 10 bits per key for 1% errors.',
      header: s => ({ left: s.fill == null ? 'bits set ' + (s.keys || []).length * 3 : 'bits set ' + s.fill + ' of 32', right: s.keys && s.keys.length ? 'keys: ' + s.keys.join(', ') : 'empty filter' }),
      draw(P, s) {
        const keys = s.keys || [];
        P.text('hb', { x: 30, y: 84, t: 'bit array', cls: 'mut sm' });
        const set = new Set(s.full ? FULL : keys.flatMap(k => KEYSET[k]));
        for (let i = 0; i < 32; i++) {
          const on = set.has(i), own = s.full ? null : bitOwner(keys, i), probe = s.probe && s.probe.bits.includes(i);
          P.box('b' + i, { x: BX(i), y: BY(i), w: BW - 4, h: 32, tone: on ? (own ? OWN[own] : 'acc') : 'info', label: on ? '1' : '0', cls: 'sm', sw: probe ? 3 : 1.4, stroke: probe ? (set.has(i) ? 'var(--warn)' : 'var(--bad)') : null });
          P.text('bn' + i, { x: BX(i) + (BW - 4) / 2, y: BY(i) + 46, t: String(i), cls: 'mut xs', anchor: 'middle' });
        }
        if (s.add) { const k = s.add; P.chip('add', { x: 30, y: 96, w: 120, h: 34, label: 'insert ' + k, tone: OWN[k] }); KEYSET[k].forEach((b, j) => P.line('ah' + j, 90, 130, BX(b) + 16, BY(b), { tone: 'cursor', arrow: true })); }
        if (s.probe) {
          const pr = s.probe;
          P.chip('pr', { x: 230, y: 96, w: 120, h: 34, label: 'probe ' + pr.key, tone: 'cursor' });
          pr.bits.forEach((b, j) => P.line('ph' + j, 290, 130, BX(b) + 16, BY(b), { tone: set.has(b) ? 'warn' : 'bad', arrow: true, dash: true }));
          P.chip('ans', { x: 400, y: 96, w: 210, h: 34, label: pr.ans, sub: '', tone: pr.tone });
        }
        if (s.waste) P.chip('waste', { x: 30, y: 270, w: 350, h: 44, label: 'file opened, key not found', sub: 'a false positive: one wasted read', tone: 'bad' });
        if (s.skip) P.chip('skip', { x: 30, y: 270, w: 350, h: 44, label: 'file skipped, no read', sub: 'a "no" is always correct', tone: 'ok' });
      }
    }),
    bug: [
      { log: 'An empty Bloom filter: 32 bits, all zero. Three hash functions will turn each key into three bit positions.', callout: 'An empty filter: all bits 0', code: 0,
        state: {}, stats: [{ l: 'bits', v: '32' }, { l: 'hash functions', v: '3' }] },
      { log: 'Insert ana. Her three hashes pick bits 3, 11 and 20, and those bits become 1.', callout: 'Insert sets three bits', code: 1,
        state: { keys: ['ana'], add: 'ana' }, stats: [{ l: 'bits set', v: '3', cls: 'ok' }] },
      { log: 'Insert ben and cy as well. The array now has nine bits set. Keys leave no trace except the bits.', callout: 'Three keys, nine bits', code: 1,
        state: { keys: ['ana', 'ben', 'cy'] }, stats: [{ l: 'bits set', v: '9', cls: 'ok' }, { l: 'keys', v: '3' }] },
      { log: 'Probe dee. Her hashes pick bits 5, 11 and 29. Bit 5 is 0, so dee was never inserted. A no is certain.', callout: 'One zero bit: certainly not here', moment: true, code: 2,
        state: { keys: ['ana', 'ben', 'cy'], probe: { key: 'dee', bits: [5, 11, 29], ans: 'no: skip the file', tone: 'ok' }, skip: 1 }, stats: [{ l: 'answer', v: 'no', cls: 'ok' }, { l: 'disk reads', v: '0', cls: 'ok' }] },
      { log: 'Probe eve, who was never inserted. Her bits 7, 18 and 25 were all set by other keys, so the filter answers maybe.', callout: 'All bits set by others: a false positive', code: 3,
        state: { keys: ['ana', 'ben', 'cy'], probe: { key: 'eve', bits: [7, 18, 25], ans: 'maybe: open the file', tone: 'warn' }, waste: 1 }, stats: [{ l: 'answer', v: 'maybe', cls: 'warn' }, { l: 'disk reads', v: '1', cls: 'bad' }] },
      { log: 'A maybe costs a read of the file, which then finds nothing. A filter never says no for a key that is present.', callout: 'Maybe costs a read, a no never lies', code: 3,
        state: { keys: ['ana', 'ben', 'cy'], probe: { key: 'eve', bits: [7, 18, 25], ans: 'maybe: open the file', tone: 'warn' }, waste: 1 }, stats: [{ l: 'false negatives', v: '0', cls: 'ok' }, { l: 'false positives', v: 'possible', cls: 'warn' }] },
      { log: 'The filter was sized for 1 million keys, and 5 million have arrived. Almost every bit is 1 now.', callout: 'Too many keys: nearly every bit is 1', code: 4,
        state: { full: 1, fill: 28 }, stats: [{ l: 'bits set', v: '28 of 32', cls: 'bad' }] },
      { log: 'With 28 of 32 bits set, a random probe of three bits passes about 66% of the time. The filter answers maybe almost always.', callout: 'About 2 in 3 absent keys now say maybe', code: 4,
        state: { full: 1, fill: 28, probe: { key: 'zed', bits: [9, 21, 29], ans: 'maybe: open the file', tone: 'warn' }, waste: 1 }, stats: [{ l: 'false positive rate', v: '~66%', cls: 'bad' }, { l: 'target', v: '1%', cls: 'ok' }],
        takeaway: 'A Bloom filter must be sized for the keys it will hold. Past that, it stops skipping files and only adds cost.' },
    ],
  };


  /* ---- 2. Skip list: express lanes over a sorted list, built with coin flips, no rebalancing ---- */
  const SK_BASE = [[3, 0], [6, 1], [9, 0], [12, 0], [17, 2], [21, 0], [25, 1], [30, 0]];
  const SK_NEW = [[3, 0], [6, 1], [9, 0], [12, 0], [14, 1], [17, 2], [21, 0], [25, 1], [30, 0]];
  const skY = lvl => 270 - lvl * 62;
  const skip = {
    id: 'skip-list', label: 'Skip list', desc: 'A sorted list with express lanes. A search runs along the top lane and drops down when the next key is too big. An insert picks its height with coin flips (keys and heights illustrative).',
    codeLabel: 'Structure',
    code: { bug: [
      'level 2: 17                    -- sparse express lane',
      'level 1: 6 -> 17 -> 25',
      'level 0: 3 -> 6 -> 9 -> 12 -> 17 -> 21 -> 25 -> 30   -- every key',
      'find 21: top lane to 17, next is end, drop; 17 -> 25 too big, drop; 17 -> 21 found',
      'insert 14: flip coins, heads then tails -> the node gets height 1',
      'link bottom level first, then level 1: a reader never sees a missing lower link',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 8 keys, 3 levels. Illustrative.',
      header: s => ({ left: s.hl || 'keys on level 0: ' + (s.ins ? 9 : 8), right: s.rt || '' }),
      draw(P, s) {
        const keys = s.ins ? SK_NEW : SK_BASE, X = i => 70 + i * 60;
        for (let l = 0; l < 3; l++) P.text('lv' + l, { x: 14, y: skY(l) + 26, t: 'L' + l, cls: 'mut sm' });
        keys.forEach(([k, h], i) => {
          for (let l = 0; l <= h; l++) {
            const vis = (s.path || []).some(([pk, pl]) => pk === k && pl === l);
            P.chip('n' + k + '_' + l, { x: X(i), y: skY(l), w: 50, h: 32, label: String(k), sub: '', tone: s.found === k && l === 0 ? 'ok' : k === s.newKey && s.ins ? 'cursor' : vis ? 'warn' : 'info', small: true });
          }
          if (h > 0) for (let l = 0; l < h; l++) P.line('v' + k + '_' + l, X(i) + 25, skY(l + 1) + 32, X(i) + 25, skY(l), { tone: 'mut', sw: 1 });
        });
        for (let l = 0; l < 3; l++) {
          const row = keys.map(([k, h], i) => ({ k, i, h })).filter(o => o.h >= l);
          row.forEach((o, j) => { if (j) P.line('h' + l + '_' + j, X(row[j - 1].i) + 50, skY(l) + 16, X(o.i), skY(l) + 16, { tone: 'ink', arrow: true, sw: 1.4 }); });
        }
        if (s.coin) P.chip('coin', { x: 470, y: 90, w: 140, h: 40, label: s.coin, sub: 'coin flips', tone: 'acc' });
      }
    }),
    bug: [
      { log: 'Keys live in one sorted list on level 0. Higher levels hold a random subset: level 1 has 6, 17 and 25, and level 2 only 17. They are express lanes.', callout: 'Express lanes over a sorted list', code: 2,
        state: {}, stats: [{ l: 'levels', v: '3' }] },
      { log: 'Find 21. Start at the top lane. Its first key is 17, which is below 21, so move to 17.', callout: 'Start on the top lane at 17', code: 3,
        state: { path: [[17, 2]] }, stats: [{ l: 'nodes visited', v: '1' }] },
      { log: 'The top lane has nothing after 17, so drop down to level 1. The next key there is 25, which is above 21, so drop again.', callout: 'Next is too big: drop a level', code: 3,
        state: { path: [[17, 2], [17, 1]] }, stats: [{ l: 'nodes visited', v: '2' }] },
      { log: 'On level 0 the next key after 17 is 21. Found after visiting 4 nodes. A scan from the start of level 0 would have visited 6.', callout: 'Found 21 in 4 steps instead of 6', moment: true, code: 3,
        state: { path: [[17, 2], [17, 1], [17, 0], [21, 0]], found: 21 }, stats: [{ l: 'nodes visited', v: '4', cls: 'ok' }, { l: 'linear scan', v: '6' }] },
      { log: 'Insert 14. Flip a coin per level: heads promotes the node, tails stops. Heads then tails gives height 1, so 14 appears on levels 0 and 1.', callout: 'Coin flips choose the height', code: 4,
        state: { ins: 1, newKey: 14, coin: 'H, T: height 1' }, stats: [{ l: 'new height', v: '1' }, { l: 'rebalancing', v: 'none', cls: 'ok' }] },
      { log: 'The node is linked bottom-up: level 0 first, then level 1. A concurrent reader never finds a node whose lower link is missing. Each link is one atomic pointer swap, so no latch is needed.', callout: 'Link bottom-up with atomic swaps', code: 5,
        state: { ins: 1, newKey: 14, hl: 'insert linked on levels 0 and 1' }, stats: [{ l: 'latches', v: '0', cls: 'ok' }],
        takeaway: 'A skip list gives ordered search without rebalancing, which makes it a good in-memory structure such as a memtable. It is not cache friendly like a B+ tree.' },
    ],
  };

  /* ---- 3. Inverted index: a term points to its posting list, and AND is a merge of two sorted lists ---- */
  const DOCS = [1, 2, 3, 4, 5, 6];
  const POST = { cmu: [1, 3, 4, 6], pavlo: [3, 4, 5] };
  const invert = {
    id: 'inverted-index', label: 'Inverted index', desc: 'A B+ tree cannot search inside text. An inverted index maps each word to a sorted list of the documents that contain it, and an AND query merges two lists (documents illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      "SELECT id FROM articles WHERE body LIKE '%pavlo%' AND body LIKE '%cmu%';   -- reads all 6",
      'CREATE INDEX art_fts ON articles USING gin (to_tsvector(\'english\', body));',
      "-- term dictionary: cmu -> [1, 3, 4, 6]     pavlo -> [3, 4, 5]    (sorted posting lists)",
      "WHERE to_tsvector('english', body) @@ to_tsquery('pavlo & cmu');",
      '-- look up both terms, then walk both lists with two cursors',
      '-- new rows go to a pending list and are merged in batches',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 6 documents, 2 terms. Illustrative.',
      header: s => ({ left: s.hl || 'documents', right: s.rt || '' }),
      draw(P, s) {
        P.text('hd', { x: 30, y: 82, t: 'documents', cls: 'mut sm' });
        DOCS.forEach((d, i) => P.chip('d' + d, { x: 30, y: 92 + i * 46, w: 76, h: 38, label: 'doc ' + d, sub: '', tone: (s.scan || []).includes(d) ? 'warn' : s.res && s.res.includes(d) ? 'ok' : 'info', small: true }));
        if (s.index) {
          P.text('hp', { x: 190, y: 82, t: 'term dictionary and posting lists', cls: 'mut sm' });
          Object.entries(POST).forEach(([t, l], r) => {
            P.chip('t' + t, { x: 190, y: 104 + r * 74, w: 92, h: 40, label: t, sub: 'term', tone: s.look ? 'cursor' : 'acc' });
            l.forEach((d, j) => P.chip('p' + t + j, { x: 300 + j * 62, y: 106 + r * 74, w: 52, h: 36, label: String(d), sub: '', tone: s.merge && (POST.cmu.includes(d) && POST.pavlo.includes(d)) ? 'ok' : s.cur && s.cur[r] === j ? 'cursor' : 'info', small: true }));
          });
        }
        if (s.merge) P.chip('res', { x: 300, y: 276, w: 200, h: 40, label: 'result: docs 3, 4', sub: '', tone: 'ok' });
        if (s.note) P.chip('nt', { x: 300, y: 330, w: 310, h: 34, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'Six documents. The question is which contain both "pavlo" and "cmu". A B+ tree on the text column cannot help: it orders whole strings and cannot see words inside them.', callout: 'Find documents containing two words', code: 0,
        state: { scan: [] }, stats: [{ l: 'documents', v: '6' }] },
      { log: 'Without an index every document is read and searched for both words, and LIKE with a leading wildcard cannot use a B+ tree.', callout: 'Without an index: read every document', code: 0,
        state: { scan: DOCS, note: 'LIKE \'%word%\': 6 documents read' }, stats: [{ l: 'documents read', v: '6 of 6', cls: 'bad' }] },
      { log: 'Build the inverted index once. For each word it stores a sorted list of document ids, called a posting list. The words themselves are kept in a dictionary, a tree or a finite-state transducer.', callout: 'Word to sorted list of documents', code: 2,
        state: { index: 1 }, stats: [{ l: 'terms', v: '2 shown' }] },
      { log: 'The query looks up both words in the dictionary. Nothing in the documents is touched yet.', callout: 'Look up both terms', code: 4,
        state: { index: 1, look: 1 }, stats: [{ l: 'documents read', v: '0', cls: 'ok' }] },
      { log: 'Two cursors walk the lists. The smaller id advances, equal ids are matches. The cursors meet on 3 and on 4, and the answer is docs 3 and 4.', callout: 'AND is a merge of two sorted lists', moment: true, code: 4,
        state: { index: 1, merge: 1, res: [3, 4], cur: [1, 0] }, stats: [{ l: 'list entries read', v: '7' }, { l: 'documents read', v: '0', cls: 'ok' }] },
      { log: 'The index is built from immutable lists, so writes are batched: PostgreSQL keeps new rows in a pending list and merges them into the dictionary in bulk. A search checks both.', callout: 'Updates wait in a pending list', code: 5,
        state: { index: 1, merge: 1, res: [3, 4], note: 'pending list merged in batches', noteTone: 'acc' }, stats: [{ l: 'write path', v: 'batched', cls: 'warn' }],
        takeaway: 'An inverted index answers which rows contain a word by reading lists, not rows. It costs batched writes and an index per text column.' },
    ],
  };

  /* ---- 4. Vector index: an inverted-file index searches only the nearest clusters and may miss ---- */
  const PTS = { A: [[110, 150], [130, 200], [170, 160], [150, 230], [100, 210], [225, 215], [120, 170], [160, 180]], B: [[370, 120], [420, 170], [450, 130], [390, 190], [430, 110], [360, 160], [410, 140], [470, 180]], C: [[270, 280], [310, 320], [340, 290], [250, 310], [330, 330], [290, 260], [360, 310], [300, 300]] };
  const CEN = { A: [140, 170], B: [410, 150], C: [300, 300] };
  const CTONE = { A: 't0', B: 't1', C: 't2' };
  const Q = [250, 225];
  const NN = [225, 215];
  const vec = {
    id: 'vector-ivf', label: 'Vector index', desc: 'Each dot is an embedding in a 2-D picture. An inverted-file index groups the vectors into clusters and compares the query only with the nearest clusters. It is faster and can miss the true neighbour (positions illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'SELECT id FROM items ORDER BY embedding <-> :q LIMIT 1;    -- exact: 24 distances',
      'CREATE INDEX items_ivf ON items USING ivfflat (embedding vector_l2_ops) WITH (lists = 3);',
      '-- the query goes to its nearest centroid, probes = 1: 8 distances',
      '-- the true neighbour sits just across the cluster border: missed',
      'SET ivfflat.probes = 2;   -- probe the two nearest clusters: 16 distances',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 24 points in 2-D, 3 clusters. Illustrative.',
      header: s => ({ left: s.hl || 'embeddings', right: 'distances computed: ' + (s.dist == null ? 0 : s.dist) }),
      draw(P, s) {
        Object.entries(PTS).forEach(([c, pts]) => pts.forEach(([x, y], i) => {
          const searched = !s.probe || s.probe.includes(c);
          P.chip('p' + c + i, { x: x - 7, y: y - 7 - 30, w: 14, h: 14, label: '', sub: '', tone: s.grp ? (searched ? CTONE[c] : 'mut') : (s.all ? 'warn' : 'info'), small: true, r: 7 });
        }));
        if (s.grp) Object.entries(CEN).forEach(([c, [x, y]]) => P.chip('c' + c, { x: x - 14, y: y - 12 - 30, w: 28, h: 24, label: c, sub: '', tone: CTONE[c], small: true, hl: s.probe && s.probe.includes(c) }));
        P.chip('q', { x: Q[0] - 24, y: Q[1] - 14 - 30, w: 48, h: 28, label: 'q', sub: '', tone: 'cursor', small: true });
        if (s.nn) P.chip('nn', { x: NN[0] - 9, y: NN[1] - 9 - 30, w: 18, h: 18, label: '', sub: '', tone: s.nn === 'miss' ? 'bad' : 'ok', small: true, r: 9, hl: true });
        if (s.note) P.chip('nt', { x: 360, y: 282, w: 250, h: 34, label: s.note, sub: '', tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'A query vector q asks for its nearest neighbour among 24 stored vectors. Exact search computes the distance to every one of them.', callout: 'Exact search: 24 distances', code: 0,
        state: { all: 1, dist: 24 }, stats: [{ l: 'distances', v: '24', cls: 'warn' }, { l: 'recall', v: '100%', cls: 'ok' }] },
      { log: 'At millions of vectors that is too slow. Group the vectors with a clustering algorithm into lists, each with a centroid.', callout: 'Cluster the vectors into three lists', code: 1,
        state: { grp: 1, dist: 0 }, stats: [{ l: 'lists', v: '3' }] },
      { log: 'The query is compared with the three centroids and goes to the nearest one, cluster C. Only the eight vectors of C are searched.', callout: 'Search only the nearest cluster', code: 2,
        state: { grp: 1, probe: ['C'], dist: 11, hl: 'probes = 1' }, stats: [{ l: 'distances', v: '3 + 8 = 11', cls: 'ok' }] },
      { log: 'The true nearest neighbour is a vector in cluster A, just across the border. q is nearer to the centroid of C, so the search never looks there. It returns a worse neighbour.', callout: 'The true neighbour is in another cluster', moment: true, code: 3,
        state: { grp: 1, probe: ['C'], dist: 11, nn: 'miss', hl: 'probes = 1', note: 'true neighbour missed' }, stats: [{ l: 'recall', v: 'miss', cls: 'bad' }] },
      { log: 'Raise the probes to 2. The two nearest clusters, C and A, are searched, and the true neighbour is found. The price is twice the distance work.', callout: 'Probe two clusters: found', code: 4,
        state: { grp: 1, probe: ['C', 'A'], dist: 19, nn: 'ok', hl: 'probes = 2', note: 'found, 19 distances', noteTone: 'ok' }, stats: [{ l: 'distances', v: '3 + 16 = 19', cls: 'warn' }, { l: 'recall', v: 'hit', cls: 'ok' }],
        takeaway: 'A vector index trades recall for speed. Probing more clusters raises recall and cost together, so measure recall against exact search before you tune.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Beyond the B+ tree</h3>
<p>A B+ tree answers equality and range questions on ordered keys. Some questions it cannot answer cheaply: is this key in the set, which rows contain this word, which rows mean something similar. The structures in this chapter exist for those. Most of them are small enough to sit in memory, or to sit in front of a larger structure and save it work.</p>
<figure class="mm" aria-label="Decision flowchart from the kind of question to the index structure" style="--diagram-width:643px">
  <img src="diagrams/ch07-index-choice.svg" alt="Flowchart: a membership question uses a Bloom filter, which has no false negatives. Ordered keys in memory without rebalancing use a skip list. Prefix or string keys use a trie or radix tree. Which rows contain a word uses an inverted index from term to posting list. Which rows mean something similar uses a vector index, approximate, built as inverted file lists or a graph.">
  <figcaption>Flowchart: the question picks the structure.</figcaption>
</figure>

<h3>2. Filters: Bloom filter and relatives</h3>
<p>A <b>filter</b> answers "is x in this set?" cheaply. A <b>Bloom filter</b> is a bit array and k hash functions. Insert sets the k bits a key hashes to. A lookup checks the same k bits: if any is 0 the key is certainly absent, and if all are 1 it is <em>maybe</em> present. It never gives a false negative, and its false-positive rate depends on bits per key: about 10 bits per key with 7 hash functions gives about 1%. A DBMS puts a filter in front of anything costly to search: each file of a log-structured store (chapter 2), each bucket of a hash table, each partition of a hash join. Variations: a <b>counting</b> Bloom filter uses small counters instead of bits, so it supports deletes; a <b>cuckoo filter</b> stores fingerprints and supports deletes; a <b>succinct range filter</b> is immutable and can also answer a range question.</p>

<h3>3. Skip list</h3>
<p>A skip list is a sorted linked list with extra lanes. A node is promoted to the next lane with probability one half, found by coin flips. A search runs on the top lane and drops down when the next key is too big, taking about log n steps. There is no rebalancing, and a node is linked bottom-up with atomic pointer swaps, so readers need no latch. Deletes mark a node first and unlink it later. It uses little memory and suits an in-memory ordered structure such as an LSM memtable, but it is not cache friendly, and scanning backward is awkward.</p>

<h3>4. Trie and radix tree</h3>
<p>A B+ tree cannot tell whether a key exists below an inner node, so a miss still descends to a leaf, one page per level. A <b>trie</b> stores keys as digits: each level takes one digit, bytes for strings or a few bits for numbers, and the path to a node spells the prefix. Cost depends on the key length, not on the number of keys. The span of a level is how many bits one digit takes. <b>Horizontal compression</b> replaces a sparse node by a compact array, and <b>vertical compression</b> merges nodes that have a single child, which gives a <b>radix tree</b>.</p>
<figure class="mm" aria-label="A radix tree storing car, card, cat and dog" style="--diagram-width:552px">
  <img src="diagrams/ch07-radix.svg" alt="Radix tree: the root has two edges, ca and dog. The ca node has edges t, r and rd, leading to cat, car and card.">
  <figcaption>A radix tree with keys cat, car, card and dog: single-child chains are merged into one edge.</figcaption>
</figure>

<h3>5. Inverted index</h3>
<p>For keyword search, the index goes from word to rows. An <b>inverted index</b> keeps a dictionary of terms and, for each term, a <b>posting list</b> of the records that contain it. A query for two words merges two sorted lists. Lucene stores the dictionary as a finite-state transducer, a trie with weights on the edges so a rolling sum gives the position in the dictionary. PostgreSQL&rsquo;s GIN index uses a B+ tree for the dictionary, stores a short posting list inline and a long one as its own tree, and keeps a <b>pending list</b> so updates are merged in bulk.</p>

<h3>6. Vector index</h3>
<p>An inverted index needs the exact word. To find content with a similar meaning, a model turns text into an <b>embedding</b>, an array of numbers, and nearby embeddings mean similar content. A <b>vector index</b> finds the nearest neighbours of a query vector, approximately, because an exact answer needs a distance to every vector. <b>Inverted file</b> (IVFFlat) clusters the vectors and searches only the nearest clusters. <b>Navigable small worlds</b> (HNSW) build a graph where each vector links to near neighbours and greedily walk it toward the query. Both trade <b>recall</b> for speed. There is no single right answer, and filters on other columns must be applied before or after the neighbour search.</p>

<h3>7. The trade-off</h3>
<p>A Bloom filter spends memory to avoid reads, and never lies about absence. A skip list gives simple concurrent ordered access without cache locality. A trie is fast on prefixes and can be large without compression. An inverted index makes text queries cheap and writes batched. A vector index is approximate by design, so its quality is measured, not assumed.</p>

<h3>8. Syntax</h3>
<pre>-- full-text search (PostgreSQL GIN)
CREATE INDEX art_fts ON articles USING gin (to_tsvector('english', body));
SELECT id FROM articles WHERE to_tsvector('english', body) @@ to_tsquery('pavlo &amp; cmu');

-- vector similarity (pgvector): approximate nearest neighbour
CREATE EXTENSION vector;
CREATE INDEX items_ivf ON items USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);
SET ivfflat.probes = 10;
SELECT id FROM items ORDER BY embedding &lt;-&gt; '[0.1, 0.9, ...]' LIMIT 10;

-- Bloom filter per table in an LSM store (Cassandra / ScyllaDB style)
ALTER TABLE orders WITH bloom_filter_fp_chance = 0.01;</pre>
<p>Measure recall by comparing the index&rsquo;s top 10 with an exact scan on a sample of queries before you trust the setting.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: `A product catalog is stored in a log-structured store with 100 files per node. About 40% of point reads ask for ids that do not exist, and each miss still reads many files (illustrative). The search page runs <code>description LIKE '%wireless%'</code> over 80 million rows and takes 30 seconds, and a new "similar products" feature compares the query with all 80 million embeddings.`,
    predict: {
      q: `A Bloom filter answers <b>no</b> for key K. What can you conclude?`,
      opts: [
        `K is certainly not in the set`,
        `K is probably not in the set, but could be`,
        `Nothing: a no is as unreliable as a yes`,
        `K was deleted from the set`
      ],
      ans: 0,
      why: `A Bloom filter has no false negatives: every key that was inserted set its bits. If any checked bit is 0, the key was never inserted. A yes is the unreliable answer, because other keys may have set the same bits.`
    },
    diagnose: [
      {
        t: 'Undersized Bloom filter',
        sym: '<b>A lookup for a missing key</b> reads many files, because many filters say maybe (illustrative: 21 of 100 files).',
        ctx: 'A lookup for a customer that is in none of the 100 files. Each filter has 3 bits per key, so k = 2 hash functions.',
        why: 'A Bloom filter never has false negatives, but its false positive rate depends on bits per key. At 3 bits per key, roughly one filter in four says maybe for any key, so most of the files the filter was meant to skip are read.',
        log: `# illustrative counts, not a server log
21 of 100 filter checks answered maybe for a key that is absent`,
        note: 'Maybe answers for keys you know are absent measure the false positive rate directly.',
        fix: [
          'Measure first: count maybe answers for keys that are not present, and compare with the expected false positive rate.',
          'Size each filter by bits per key. About 10 bits per key gives about 1 percent false positives with 7 hash functions.',
          'Choose the number of hash functions as k = (m / n) ln 2, not a fixed small number.',
          'When a file grows, rebuild its filter for the new key count. A filter sized for 1 million keys gets worse silently as keys are added.',
          'Verify: count maybe answers for missing keys again after the rebuild, and check they match the expected rate.'
        ]
      },
      {
        t: 'Text search with LIKE',
        sym: '<b>A keyword query</b> scans the whole table although the column has an index.',
        ctx: 'The query is <code>LIKE \'%wireless%\'</code>. The existing B+ tree orders whole strings, and a leading wildcard gives no prefix to search for.',
        why: 'A B+ tree can only seek on a prefix of the key. A word in the middle of a string can be anywhere in the order, so the engine reads every row.',
        log: `-- representative plan, counts illustrative
Seq Scan on products  (rows=80000000)
  Filter: (description ~~ '%wireless%'::text)
Execution Time: 30112 ms`,
        note: 'A Seq Scan with a LIKE filter on an indexed column means the index cannot be used for that pattern.',
        fix: [
          'Measure first: read the plan, and check which operator the filter uses.',
          'Use a full-text index: a GIN index over <code>to_tsvector</code>, and query with <code>@@ to_tsquery</code>.',
          'For substring search, a trigram index (<code>pg_trgm</code>) supports <code>LIKE \'%word%\'</code>.',
          'Verify: the plan should show a bitmap or index scan on the GIN index, and the time should fall to milliseconds.'
        ]
      },
      {
        t: 'Low recall in an approximate index',
        sym: '<b>The top results</b> of a similarity search differ from an exact search, and some obvious matches are missing.',
        ctx: 'An IVF index with 100 lists searches 1 list per query. A true neighbour that sits in a neighbouring list is never compared.',
        why: 'An inverted-file index only searches the clusters closest to the query. A vector near a cluster border may belong to a cluster the query does not visit, so it is skipped.',
        log: `-- representative evaluation, illustrative
recall@10 vs exact scan, probes = 1: 0.62
recall@10 vs exact scan, probes = 10: 0.96   (latency 3.1x)`,
        note: 'Recall is the share of the exact top 10 that the index returned. It must be measured on real queries.',
        fix: [
          'Measure first: run the same sample of queries exactly and through the index, and compute recall@k.',
          'Raise the number of probes, or the search breadth of a graph index, until recall meets the target.',
          'Check the number of lists against the table size. Too few lists means large clusters, too many means many border cases.',
          'Verify: recall and p99 latency together. A higher recall that breaks the latency target needs a different index or more memory.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[7] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [bloom, skip, invert, vec] };
})();
