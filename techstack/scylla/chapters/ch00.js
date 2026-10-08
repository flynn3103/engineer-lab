/* Chapter 0 "Partition Key and Token Ring": three bespoke ring scenes plus the Explain text (index 0, zero-based).
   Loads after course.js and scene-kit.js. Token positions are drawn on a 0..359 ring (real tokens are 64-bit Murmur3), all illustrative. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: tokens drawn on 0..359 (real ones are 64-bit). Illustrative positions.';
  const RING = { cx: 190, cy: 206, r: 104 };

  /* ---------- 1. Where one INSERT lands: hash, token, owner, copies ---------- */
  const N6 = [['N1', 20], ['N2', 80], ['N3', 140], ['N4', 200], ['N5', 260], ['N6', 320]];
  const place = {
    id: 'place-row', label: 'Where one INSERT goes', desc: 'One INSERT. Only the partition key is hashed; it picks the token, the owner and the copies.',
    codeLabel: 'CQL', code: { bug: ['CREATE TABLE orders (seller_id bigint, order_id bigint,', '  total decimal, PRIMARY KEY (seller_id, order_id));', 'INSERT INTO orders (seller_id, order_id, total)', '  VALUES (77, 9001, 42.50);'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'ring = 0..359 · 6 nodes · RF = 3', right: s.r || '' }),
      setup(kit) {
        const ring = kit.ring(null, RING);
        const c1 = kit.chip(null, { x: 372, y: 70, w: 240, h: 34, label: 'seller_id = 77', tone: 'live', show: false });
        const c2 = kit.chip(null, { x: 372, y: 110, w: 240, h: 34, label: 'Murmur3(77)', tone: 'info', show: false });
        const c3 = kit.chip(null, { x: 372, y: 150, w: 240, h: 34, label: 'token 188', tone: 'ok', show: false });
        const led = kit.ledger(null, { x: 360, y: 196, w: 264, title: 'Placement ledger', cols: [{ label: 'role', w: 56 }, { label: 'node', w: 86 }, { label: 'why', w: 110 }], rows: 5, rowH: 16 });
        return { ring, c1, c2, c3, led, prev: {} };
      },
      frame(s, kit, R) {
        const own = s.owner, cp = s.copies || 0;
        R.ring.setNodes(N6.map(([id, pos]) => ({ id, pos, label: id, role: own && id === 'N4' ? 'primary' : (cp >= 1 && id === 'N5') || (cp >= 2 && id === 'N6') ? 'copy' : '' })), 700);
        const keys = [];
        if (s.key) keys.push({ id: 'K77', pos: 188, label: s.orders ? 'x3' : '77', tone: 'cursor', r: s.orders ? 15 : 12 });
        if (s.other) keys.push({ id: 'K12', pos: 31, label: '12', r: 11 });
        R.ring.setKeys(keys);
        R.c1.set({ show: s.hash >= 0 }); R.c2.set({ show: s.hash >= 1, tone: s.hash === 1 ? 'cursor' : 'info' }); R.c3.set({ show: s.hash >= 2 });
        const rows = [];
        if (s.hash >= 2) rows.push(['hash', 'Murmur3(77)', 'token 188']);
        if (s.owner) rows.push(['primary', 'N4', 'first clockwise']);
        if (cp >= 1) rows.push(['copy 2', 'N5', 'next distinct']);
        if (cp >= 2) rows.push(['copy 3', 'N6', 'RF = 3 ends']);
        if (s.orders) rows.push(['orders', '9001..9003', 'same token']);
        R.led.clear(); rows.forEach((r, i) => R.led.setRow(i, r, { hl: i === rows.length - 1 }));
        if (cp !== R.prev.cp) { R.ring.hideDots(); if (cp === 1) R.ring.dot('w1', 200, 260, 900); if (cp === 2) { R.ring.dot('w1', 200, 260, 1); R.ring.dot('w2', 260, 320, 900); } }
        R.prev.cp = cp;
      }
    },
    bug: [
      { log: 'A ring of six nodes. Each node owns the arc that ends at its own token, and the table has two key parts.', callout: 'Each node owns the arc that ends at its token', state: {}, stats: [{ l: 'nodes', v: '6' }, { l: 'replication factor', v: '3' }] },
      { log: 'The INSERT names seller_id 77. Only the partition key is hashed; order_id is not.', callout: 'Only seller_id is hashed', code: 2, state: { hash: 0, r: 'INSERT seller 77' }, stats: [{ l: 'nodes', v: '6' }, { l: 'hashed columns', v: '1' }] },
      { log: 'The partitioner turns seller_id 77 into a token. Scylla uses 64-bit Murmur3; this drawing shows a 0..359 ring (illustrative).', callout: 'Murmur3 turns the key into a token', code: 2, state: { hash: 1, r: 'INSERT seller 77' }, stats: [{ l: 'nodes', v: '6' }, { l: 'hashed columns', v: '1' }] },
      { log: 'The token is 188. The key now has an exact place on the ring, and the same key will always land there.', callout: 'seller 77 lands at token 188', code: 2, state: { hash: 2, key: true, r: 'token 188' }, stats: [{ l: 'token', v: '188' }, { l: 'owner', v: '?' }] },
      { log: 'The owner is the first node clockwise from the token. N4 sits at 200 and owns the arc (140, 200], so N4 is the primary replica.', callout: 'Owner = first node clockwise from the token', code: 2, state: { hash: 2, key: true, owner: true, r: 'owner N4' }, stats: [{ l: 'token', v: '188' }, { l: 'owner', v: 'N4', cls: 'ok' }] },
      { log: 'With RF = 3 and NetworkTopologyStrategy, the next two distinct nodes clockwise, N5 then N6, store copies too.', callout: 'RF = 3: the next two nodes hold copies', code: 2, state: { hash: 2, key: true, owner: true, copies: 2, r: 'copies N4 N5 N6' }, stats: [{ l: 'copies', v: '3', cls: 'ok' }, { l: 'owner', v: 'N4' }] },
      { log: 'The next orders of seller 77 hash the same key, so orders 9001, 9002 and 9003 all land on token 188 and the same three nodes.', callout: 'order_id is not hashed: same token, same nodes', moment: true, code: 3, state: { hash: 2, key: true, owner: true, copies: 2, orders: true, r: 'seller 77 x3 orders' }, stats: [{ l: 'orders on token 188', v: '3', cls: 'warn' }, { l: 'copies each', v: '3' }] },
      { log: 'A different seller hashes to a different token. Seller 12 lands at token 31 and is owned by N2.', callout: 'Another seller hashes somewhere else', code: 3, state: { hash: 2, key: true, owner: true, copies: 2, orders: true, other: true, r: 'seller 12 -> token 31' }, stats: [{ l: 'seller 12 owner', v: 'N2' }, { l: 'seller 77 owner', v: 'N4' }],
        takeaway: 'The partition key alone picks the token, the owner and the copies. order_id only sorts rows inside the partition.' },
    ],
  };

  /* ---------- 2. Adding a fourth node: only one arc changes owner ---------- */
  const K12 = [15, 50, 85, 120, 145, 175, 195, 225, 250, 290, 320, 350];
  const N3b = [['N1', 40], ['N2', 150], ['N3', 270]];
  const ownerIn = (pos, nodes) => { const s = nodes.slice().sort((a, b) => a[1] - b[1]); return (s.find(n => n[1] >= pos) || s[0])[0]; };
  const before = K12.map(p => ownerIn(p, N3b)), after = K12.map(p => ownerIn(p, [...N3b, ['N4', 230]]));
  const MOVED = K12.map((p, i) => before[i] !== after[i]);
  const join = {
    id: 'add-node', label: 'Adding a fourth node', desc: 'A fourth node joins at token 230. Watch which arc changes owner and which keys move.',
    codeLabel: 'nodetool', code: { bug: ['nodetool status ks_orders', '# N4 joins with token 230 (illustrative)', '# N4 streams its new range from N3', 'nodetool cleanup ks_orders   # N3 drops rows it gave away'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'ring = 0..359 · keys = 12', right: s.r || '' }),
      setup(kit) {
        const ring = kit.ring(null, RING);
        const led = kit.ledger(null, { x: 350, y: 66, w: 274, title: 'Ownership ledger · before → now', cols: [{ label: 'key @ token', w: 96 }, { label: 'before', w: 56 }, { label: '', w: 24 }, { label: 'now', w: 60 }], rows: 12, rowH: 15 });
        const strip = kit.strip(null, { x: 356, y: 322, items: K12.map((p, i) => ({ id: 'k' + i, label: String(i) })), w: 19, h: 22, gap: 3 });
        return { ring, led, strip, prev: {} };
      },
      frame(s, kit, R) {
        const n4 = s.n4;
        R.ring.setNodes([...N3b.map(([id, pos]) => ({ id, pos, label: id })), ...(n4 ? [{ id: 'N4', pos: 230, label: 'N4', role: 'primary' }] : [])], 800);
        R.ring.setKeys(K12.map((pos, i) => ({ id: 'K' + i, pos, label: 'K' + i, r: 10, rad: RING.r - (i % 2 ? 66 : 44), owner: s.recolor ? null : before[i], tone: s.dim && !MOVED[i] ? 'dim' : '' })));
        K12.forEach((p, i) => {
          R.led.setRow(i, ['K' + i + ' @' + p, before[i], s.recolor ? (MOVED[i] ? '→' : '=') : '', s.recolor ? after[i] : ''], { hl: s.recolor && MOVED[i], tones: [null, null, null, s.recolor && MOVED[i] ? 'bad' : null] });
          R.strip['k' + i].set({ tone: s.recolor ? (MOVED[i] ? (s.cleaned ? 'ok' : 'cursor') : 'info') : 'info' });
        });
        R.ring.hideDots();
        if (s.stream && !R.prev.stream) K12.forEach((p, i) => { if (MOVED[i]) R.ring.dot('s' + i, 270, 230, 900 + i * 120); });
        R.prev.stream = s.stream;
      }
    },
    bug: [
      { log: 'Three nodes own the ring. Every key belongs to the first node clockwise from its token, so each node owns the arc that ends at its token.', callout: 'Three arcs, twelve keys, one owner each', state: { r: 'cluster of 3' }, stats: [{ l: 'nodes', v: '3' }, { l: 'keys', v: '12' }] },
      { log: 'A fourth machine joins and takes the token 230. For a moment it owns nothing: the arcs have not changed yet.', callout: 'N4 joins the ring at token 230', code: 1, state: { n4: true, r: 'join N4 @ 230' }, stats: [{ l: 'nodes', v: '4' }, { l: 'keys moved', v: '0' }] },
      { log: 'N4 claims the arc (150, 230]. That interval used to belong to N3, so only N3 gives up part of its arc. N1 and N2 do not change.', callout: 'N4 claims (150, 230], taken from N3 only', code: 1, state: { n4: true, r: 'join N4 @ 230' }, stats: [{ l: 'arcs changed', v: '1', cls: 'ok' }, { l: 'keys moved', v: '0' }] },
      { log: 'Keys K5, K6 and K7 lie inside the new arc, so they change owner from N3 to N4. The other nine keys do not move.', callout: 'Only the keys inside the new arc change owner', moment: true, code: 1, state: { n4: true, recolor: true, r: 'moved 3 / 12' }, stats: [{ l: 'moved', v: '3 / 12', cls: 'warn' }, { l: 'unchanged', v: '9 / 12', cls: 'ok' }] },
      { log: 'The nine other keys keep the same owner. Nothing is re-hashed: a key stays where its token is and only the arc around it is re-cut.', callout: 'Nine keys never move', code: 1, state: { n4: true, recolor: true, dim: true, r: 'moved 3 / 12' }, stats: [{ l: 'moved', v: '3 / 12', cls: 'warn' }, { l: 'unchanged', v: '9 / 12', cls: 'ok' }] },
      { log: 'N4 streams the rows of its three keys from N3. N3 keeps its copies until cleanup runs, so the data exists in both places for a while.', callout: 'N4 streams its new range from N3', code: 2, state: { n4: true, recolor: true, stream: true, r: 'streaming from N3' }, stats: [{ l: 'streaming', v: '3 keys', cls: 'warn' }, { l: 'unchanged', v: '9 / 12', cls: 'ok' }] },
      { log: 'After nodetool cleanup, N3 drops the rows it gave away. The three moved keys now live on N4 only.', callout: 'cleanup: N3 drops the rows it gave away', code: 3, state: { n4: true, recolor: true, cleaned: true, r: 'cleanup done' }, stats: [{ l: 'moved', v: '3 / 12', cls: 'ok' }, { l: 'unchanged', v: '9 / 12', cls: 'ok' }],
        takeaway: 'Adding a node moves about 1/N of the keys, taken from one neighbour. Nothing is re-hashed.' },
    ],
  };

  /* ---------- 3. One seller, one token: adding nodes does not spread one key ---------- */
  const BG = [10, 55, 100, 135, 165, 215, 250, 295, 335].map((p, i) => ({ id: 'b' + i, pos: p, label: '', r: 6 }));
  const hot = {
    id: 'hot-key', label: 'One seller, one token', desc: 'One hot seller shares one partition key, so one owner takes every write. Adding a node does not help; bucketing the key does.',
    codeLabel: 'CQL', code: { bug: ['-- every order of seller 77 shares one partition key', 'PRIMARY KEY (seller_id, order_id)', '-- bucket by day: each seller spreads over several partitions', 'PRIMARY KEY ((seller_id, day_bucket), order_id)'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'ring = 0..359 · hot key = seller 77', right: s.r || '' }),
      setup(kit) {
        const ring = kit.ring(null, RING);
        const bars = kit.bars(null, { x: 366, y: 96, w: 252, labelW: 40, items: [{ id: 'N1', label: 'N1' }, { id: 'N2', label: 'N2' }, { id: 'N3', label: 'N3' }, { id: 'N4', label: 'N4' }], unit: '%', title: 'Write load per node (illustrative)' });
        const pk1 = kit.chip(null, { x: 366, y: 222, w: 252, h: 26, label: 'PK (seller_id, order_id)', tone: 'delete', small: true });
        const pk2 = kit.chip(null, { x: 366, y: 258, w: 252, h: 26, label: 'PK ((seller_id, day_bucket), order_id)', tone: 'live', small: true, show: false });
        const days = ['d1', 'd2', 'd3', 'd4'].map((d, i) => kit.chip(null, { x: 366 + i * 64, y: 294, w: 58, h: 26, label: 'read ' + d, tone: 'info', small: true, show: false }));
        return { ring, bars, pk1, pk2, days, prev: {} };
      },
      frame(s, kit, R) {
        const nodes = [['N1', 40], ['N2', 150], ['N3', 270]]; if (s.n4) nodes.push(['N4', 100]);
        R.ring.setNodes(nodes.map(([id, pos]) => ({ id, pos, label: id, hot: s.phase === 'hot' && id === 'N3' })), 800);
        const keys = BG.slice();
        if (s.phase === 'hot' || s.phase === 'add') keys.push({ id: 'K77', pos: 188, label: '77', r: 16, tone: 'bad' });
        if (s.phase === 'bucket' || s.phase === 'reads') [['d1', 20], ['d2', 90], ['d3', 130], ['d4', 230]].forEach(([id, pos]) => keys.push({ id, pos, label: id, r: 11, tone: 'cursor' }));
        R.ring.setKeys(keys);
        const L = s.load || { N1: 33, N2: 33, N3: 34, N4: 0 };
        ['N1', 'N2', 'N3', 'N4'].forEach(id => R.bars.set(id, id === 'N4' && !s.n4 ? 0 : L[id], L[id] >= 90 ? 'bad' : L[id] >= 50 ? 'warn' : 'ok'));
        R.pk1.set({ tone: s.phase === 'bucket' || s.phase === 'reads' ? 'info' : 'delete' }); R.pk2.set({ show: s.phase === 'bucket' || s.phase === 'reads' });
        R.days.forEach(c => c.set({ show: s.phase === 'reads' }));
        R.ring.hideDots();
        if (s.phase !== R.prev.phase) {
          if (s.phase === 'hot') [0, 1, 2].forEach(i => R.ring.dot('h' + i, 188 + i * 4, 188 + i * 4 + 0.01, 1, 'bad'));
          if (s.phase === 'reads') [20, 90, 130, 230].forEach((p, i) => R.ring.dot('r' + i, p, 188, 1000 + i * 150));
        }
        R.prev.phase = s.phase;
      }
    },
    bug: [
      { log: 'A normal evening: orders come from many sellers, their keys hash all over the ring, and the three nodes share the writes about evenly (illustrative).', callout: 'Writes spread over the ring', state: { phase: 'normal', r: 'normal evening' }, stats: [{ l: 'busiest node', v: '34%', cls: 'ok' }] },
      { log: 'Flash sale at 20:00: one famous seller takes about half of all order traffic. Every order of seller 77 hashes to the same token.', callout: 'Flash sale: half the writes carry one token', code: 1, state: { phase: 'hot', r: 'seller 77 flash sale', load: { N1: 18, N2: 20, N3: 100, N4: 0 } }, stats: [{ l: 'busiest node', v: '100%', cls: 'bad' }, { l: 'p99 write', v: 'seconds', cls: 'bad' }] },
      { log: 'The owner of token 188 is N3. One node, one shard, 100% CPU, while N1 and N2 stay mostly idle.', callout: 'One node at 100% CPU, the others idle', code: 1, state: { phase: 'hot', r: 'N3 owns token 188', load: { N1: 18, N2: 20, N3: 100, N4: 0 } }, stats: [{ l: 'N3 load', v: '100%', cls: 'bad' }, { l: 'N1, N2 load', v: '~19%', cls: 'ok' }] },
      { log: 'The team adds a fourth node, N4 at token 100. Arcs change, but token 188 still belongs to N3, so the hot key does not move.', callout: 'A fourth node does not unpin the hot node', moment: true, code: 1, state: { phase: 'add', n4: true, r: 'add N4 @ 100', load: { N1: 18, N2: 20, N3: 100, N4: 1 } }, stats: [{ l: 'nodes', v: '4' }, { l: 'N3 load', v: '100%', cls: 'bad' }] },
      { log: 'The fix is to change the key, not the cluster. Bucket by day: the partition key becomes (seller_id, day_bucket), so seller 77 has four partitions with four tokens.', callout: 'Change the key: bucket seller 77 by day', code: 3, state: { phase: 'bucket', n4: true, r: 'bucket by day', load: { N1: 24, N2: 25, N3: 25, N4: 24 } }, stats: [{ l: 'partitions for seller 77', v: '4', cls: 'ok' }] },
      { log: 'The four buckets land on four different nodes, so the writes spread out and no node is saturated.', callout: 'Four tokens, four owners, even load', code: 3, state: { phase: 'bucket', n4: true, r: 'bucket by day', load: { N1: 24, N2: 25, N3: 25, N4: 24 } }, stats: [{ l: 'busiest node', v: '25%', cls: 'ok' }, { l: 'p99 write', v: 'normal', cls: 'ok' }] },
      { log: 'The trade-off: reading all of seller 77 now takes one read per day bucket, so a full-seller query becomes four partition reads.', callout: 'Trade-off: a whole-seller read fans out to 4 reads', code: 3, state: { phase: 'reads', n4: true, r: 'read all buckets', load: { N1: 24, N2: 25, N3: 25, N4: 24 } }, stats: [{ l: 'reads per seller query', v: '4', cls: 'warn' }],
        takeaway: 'Adding nodes spreads many keys, not one key. To spread a hot key, change the key by adding a bucket.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[0] = { explain: `
<h3>1. Placement is a function of the partition key</h3>
<p>Scylla does not ask a directory where a partition lives. It hashes the partition key with the Murmur3 partitioner to a 64-bit token, and the token decides the owner. Any node runs the same calculation, so any node can route a request with no lookup. The partition key is the only input to placement. The clustering key does not change where data lives.</p>
<p>The placement path for one INSERT, as a flowchart:</p>
<figure class="mm" aria-label="Flowchart: partition key to token to owner to copies" style="--diagram-width:207.42px">
  <img src="diagrams/ch00-key-placement.svg" alt="Flowchart: partition key to token to owner to copies">
  <figcaption>Flowchart: the same calculation runs on every node, so no node has to ask where the partition lives.</figcaption>
</figure>

<h3>2. The ring, tokens and vnodes</h3>
<p>The ring is the token space closed into a circle. Each node owns several token positions, set by <code>num_tokens</code>, and the owner of a token is the first node position clockwise from it. A node with one random token owns one arc, and random positions give arcs of very different length. Many vnodes per node average the arcs out. For new keyspaces, tablets are the default in current releases, and the balancer spreads them by size, so the same skew is handled without choosing <code>num_tokens</code> by hand.</p>

<h3>3. Replicas and the clustering key</h3>
<p>With a replication factor RF and <code>NetworkTopologyStrategy</code>, the owner stores the first copy. The next RF − 1 distinct nodes clockwise also store a copy, counted over distinct nodes and racks. Inside each copy, the clustering key sorts rows. Every row of seller 77 lives in the same partition, so a key that grows without bound becomes a large partition. The system.large_partitions table lists the largest ones on each node. Because every copy holds the same partition, losing one node leaves the others able to serve it.</p>

<h3>4. Adding a node moves arcs, not keys</h3>
<p>A new node takes the arcs just before its new tokens, and it takes them from its neighbours. About 1/N of the data moves, and nothing is re-hashed. The join runs in two phases. First the new node streams the rows of its arcs from the old owners. Then the old owners keep their copy of those rows until <code>nodetool cleanup</code> runs on each of them, so their disks do not shrink at once. That is why a scale-out shows up as full disks on the old nodes for a while.</p>
<p>Check the result with <code>nodetool status</code>. It shows the effective ownership of each node, which should be close to equal on equal hardware. A large gap points at too few tokens or at uneven arcs, not at the data model.</p>

<h3>5. The trade-off: one key, one place</h3>
<p>Hashing spreads different keys evenly, but it cannot spread one key. All orders for seller 77 sit in one partition, on one replica set, so a flash sale for that seller loads the same nodes. Adding a node does not help, because the hot key’s token moves with its arc. The fix is in the data model. Bounding the partition with a bucket turns one seller into several partitions with several tokens. A query that covers every bucket then has to visit each one.</p>
<p>To confirm that one key is the problem, compare the load of each shard and the p99 latency of each node. A hot partition shows as one shard at high CPU while its peers have spare capacity. The large partition warnings in the logs, and the system.large_partitions table, name the key. Only then change the model, because more nodes will not divide a single key.</p>

<h3>6. Syntax</h3>
<pre>-- the partition key is seller_id, order_id is the clustering key
CREATE TABLE orders (seller_id bigint, order_id bigint, total decimal, PRIMARY KEY (seller_id, order_id));

-- a bucketed partition key: (seller_id, day_bucket) decides the owner
CREATE TABLE orders_by_day (seller_id bigint, day_bucket int, order_id bigint, total decimal, PRIMARY KEY ((seller_id, day_bucket), order_id));

SELECT * FROM system.large_partitions;
nodetool status ks_orders
nodetool cleanup ks_orders</pre>
<p>In scylla.yaml, <code>num_tokens</code> is chosen when a node first joins. Changing it later needs a new or replaced node, not an in-place edit.</p>`, scenarios: [place, join, hot] };
})();
