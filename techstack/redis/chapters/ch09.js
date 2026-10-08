/* Chapter 9 "Cluster Slots": three scenes and the Explain text (index 9, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Scene 1: two keys in two slots hit CROSSSLOT, a hash tag fixes it. Scene 2: a constant hash tag puts every key in one slot.
   Scene 3: MOVED and ASK redirects. The 16384 slots are drawn on a 0..359 ring; slot numbers, loads and addresses are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: slots 0..16383 drawn on 0..359. Slot numbers are illustrative.';
  const RING = { cx: 190, cy: 214, r: 104 };
  const ang = slot => Math.round(slot / 16384 * 3600) / 10;
  /* Three primaries; A owns slots 0..5460, B 5461..10922, C 10923..16383. The ring marks the end of each range. */
  const NODES = [['A', 120], ['B', 240], ['C', 359.5]];
  const ownerOf = slot => (slot <= 5460 ? 'A' : slot <= 10922 ? 'B' : 'C');

  /* ---- 1. A multi-key command needs every key in one slot ---- */
  const S_CART = 4721, S_ORD = 13005, S_TAG = 8211;
  const cross = {
    id: 'crossslot', label: 'Keys in two slots', desc: 'Two keys with different hashes sit in different slots, so one MULTI cannot touch both. A shared hash tag puts both keys in one slot.',
    codeLabel: 'Commands',
    code: { bug: [
      'CLUSTER KEYSLOT cart:42      -> 4721     # illustrative',
      'CLUSTER KEYSLOT orders:42    -> 13005    # illustrative',
      'MULTI / MGET cart:42 orders:42',
      "(error) CROSSSLOT Keys in request don't hash to the same slot",
      'CLUSTER KEYSLOT {user:42}:cart   -> 8211   # same slot as {user:42}:orders',
      'MULTI / MGET {user:42}:cart {user:42}:orders   -> works',
    ] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'slot = CRC16(key) mod 16384', right: s.r || '' }),
      setup(kit) {
        const ring = kit.ring(null, RING);
        const led = kit.ledger(null, { x: 360, y: 84, w: 264, title: 'Slot ledger', cols: [{ label: 'key', w: 120 }, { label: 'slot', w: 56 }, { label: 'owner', w: 60 }], rows: 4, rowH: 18 });
        const res = kit.chip(null, { x: 360, y: 214, w: 264, h: 50, label: '', sub: '', tone: 'info', show: false });
        return { ring, led, res };
      },
      frame(s, kit, R) {
        R.ring.setNodes(NODES.map(([id, pos]) => ({ id, pos, label: id })), 0);
        const keys = [];
        if (s.k1) keys.push({ id: 'K1', pos: ang(s.tag ? S_TAG : S_CART), label: 'cart', r: 12, rad: RING.r - 40 });
        if (s.k2) keys.push({ id: 'K2', pos: ang(s.tag ? S_TAG : S_ORD), label: 'ord', r: 12, rad: RING.r - (s.tag ? 66 : 40) });
        R.ring.setKeys(keys);
        R.led.clear();
        const rows = [];
        if (s.k1) rows.push([s.tag ? '{user:42}:cart' : 'cart:42', String(s.tag ? S_TAG : S_CART), ownerOf(s.tag ? S_TAG : S_CART)]);
        if (s.k2) rows.push([s.tag ? '{user:42}:orders' : 'orders:42', String(s.tag ? S_TAG : S_ORD), ownerOf(s.tag ? S_TAG : S_ORD)]);
        rows.forEach((r, i) => R.led.setRow(i, r, { hl: s.same && i < 2 }));
        if (s.verdict) R.led.setRow(rows.length, ['MULTI', '', s.verdict], { hl: true, tones: [null, null, s.verdict === 'OK' ? 'ok' : 'bad'] });
        R.res.set({ show: !!s.res, label: s.res || '', sub: s.resSub || '', tone: s.resTone || 'info' });
      },
    },
    bug: [
      { log: 'The dataset moved to a cluster of three primaries. Every key maps to a slot with CRC16(key) mod 16384, and each primary owns a range of slots. Here the ring stands for the 16384 slots.', callout: 'Three primaries own the slot ranges', code: 0,
        state: { r: '3 primaries' }, stats: [{ l: 'slots', v: '16384' }, { l: 'primaries', v: '3' }] },
      { log: 'cart:42 hashes to slot 4721 (illustrative), which node A owns.', callout: 'cart:42 lands in slot 4721', code: 0,
        state: { k1: true, r: 'cart:42' }, stats: [{ l: 'slot cart:42', v: '4721', cls: 'warn' }, { l: 'owner', v: 'A' }] },
      { log: 'orders:42 hashes to slot 13005 (illustrative), owned by node C. The two keys have no reason to share a slot.', callout: 'orders:42 lands in slot 13005', code: 1,
        state: { k1: true, k2: true, r: 'orders:42' }, stats: [{ l: 'slot orders:42', v: '13005', cls: 'warn' }, { l: 'owner', v: 'C' }] },
      { log: 'Checkout runs MULTI over both keys. A transaction runs on one node, so it needs all its keys in one slot. The node refuses with CROSSSLOT.', callout: 'CROSSSLOT: the keys are in different slots', moment: true, code: 3,
        state: { k1: true, k2: true, verdict: 'CROSSSLOT', res: 'CROSSSLOT', resSub: 'checkout fails', resTone: 'warn', r: 'refused' }, stats: [{ l: 'checkout', v: 'fails', cls: 'bad' }] },
      { log: 'The fix is a hash tag. If a key contains {...} with a non-empty tag, only the text inside the braces is hashed. Both keys carry {user:42}.', callout: 'Hash tag: only {user:42} is hashed', code: 4,
        state: { k1: true, k2: true, tag: true, same: true, r: 'hash tag' }, stats: [{ l: 'hashed part', v: 'user:42', cls: 'ok' }, { l: 'slot', v: '8211', cls: 'ok' }] },
      { log: 'Both keys now land in the same slot, owned by node B, so one node owns the whole transaction. MULTI runs and checkout succeeds.', callout: 'Same slot, one owner: MULTI works', code: 5,
        state: { k1: true, k2: true, tag: true, same: true, verdict: 'OK', res: 'MULTI runs', resSub: 'both keys on node B', resTone: 'ok', r: 'works' }, stats: [{ l: 'CROSSSLOT', v: 'none', cls: 'ok' }],
        takeaway: 'Use the narrowest tag that really needs atomicity, such as the user id. The slot never depends on the number of nodes.' },
    ],
  };

  /* ---- 2. A slot is the unit of placement, so a constant tag puts everything on one node ---- */
  const S_HOT = 5390;
  const SPREAD = [700, 2100, 3600, 4800, 6300, 7600, 9000, 10400, 11700, 13000, 14500, 15800];
  const hot = {
    id: 'hot-slot', label: 'One hot slot', desc: 'A constant tag on every key hashes them all to one slot, so one node stores and serves all of them. Tagging by user id spreads the keys over all slots.',
    codeLabel: 'Commands',
    code: { bug: [
      'CLUSTER KEYSLOT {cart}:1     -> 5390',
      'CLUSTER KEYSLOT {cart}:2     -> 5390     # same slot for every key',
      'redis-cli --cluster info     # node A holds nearly all the keys',
      '# a slot cannot be split: it moves with all its keys',
      'CLUSTER KEYSLOT {user:42}:cart   # tag the user id, not a constant',
      'redis-cli --cluster info     # keys and CPU balanced',
    ] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'tag decides the slot', right: s.r || '' }),
      setup(kit) {
        const ring = kit.ring(null, RING);
        const bars = kit.bars(null, { x: 366, y: 112, w: 252, labelW: 40, rowH: 28, max: 100, unit: '%', title: 'Load per node (illustrative)', items: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }, { id: 'C', label: 'C' }] });
        const note = kit.text(null, { x: 366, y: 232, t: '', cls: 'mut sm' });
        return { ring, bars, note };
      },
      frame(s, kit, R) {
        R.ring.setNodes(NODES.map(([id, pos]) => ({ id, pos, label: id, hot: s.hotNode === id })), 0);
        const keys = [];
        if (s.mode === 'one') keys.push({ id: 'KALL', pos: ang(S_HOT), label: 'all', r: 16, rad: RING.r - 44, tone: 'bad' });
        if (s.mode === 'spread') SPREAD.forEach((sl, i) => keys.push({ id: 'S' + i, pos: ang(sl), label: String(i + 1), r: 9, rad: RING.r - (i % 2 ? 62 : 38) }));
        R.ring.setKeys(keys);
        const l = s.load || [0, 0, 0];
        ['A', 'B', 'C'].forEach((n, i) => R.bars.set(n, l[i], l[i] > 60 ? 'bad' : (l[i] ? 'ok' : 'info'), l[i] + '%'));
        R.note.set(s.note || '');
      },
    },
    bug: [
      { log: 'Every cart key is written with the same constant tag, {cart}:1, {cart}:2 and so on. Only the tag is hashed.', callout: 'The tag is the same for every key', code: 0,
        state: { mode: 'one', load: [0, 0, 0], r: 'constant tag' }, stats: [{ l: 'hashed part', v: 'cart', cls: 'bad' }] },
      { log: 'CRC16 of the same text gives the same slot every time, so every key lands in slot 5390 (illustrative).', callout: 'One tag, one slot, for every key', code: 1,
        state: { mode: 'one', load: [0, 0, 0], r: 'slot 5390' }, stats: [{ l: 'slot', v: '5390 for all', cls: 'bad' }] },
      { log: 'A slot has one owner. Node A stores and serves all of these keys, and nodes B and C hold none of them.', callout: 'One node does all the work', moment: true, code: 2,
        state: { mode: 'one', hotNode: 'A', load: [98, 1, 1], note: 'B and C sit idle.', r: 'A is hot' }, stats: [{ l: 'node A load', v: '98%', cls: 'bad' }, { l: 'nodes B, C', v: '1%', cls: 'warn' }] },
      { log: 'Resharding cannot help. A slot is the unit of placement, so moving it moves all of its keys together, and it cannot be split across nodes.', callout: 'A slot cannot be split', code: 3,
        state: { mode: 'one', hotNode: 'A', load: [98, 1, 1], note: 'Moving slot 5390 only moves the hot spot.', r: 'cannot split' }, stats: [{ l: 'slot split', v: 'not possible', cls: 'bad' }] },
      { log: 'The fix is to tag the user id, as in {user:42}:cart. Different users hash to different slots.', callout: 'Tag by user id instead', code: 4,
        state: { mode: 'spread', load: [0, 0, 0], r: 'tag by user' }, stats: [{ l: 'hashed part', v: 'user id', cls: 'ok' }] },
      { log: 'The keys spread over many slots, and the slots over the three primaries. Each node takes about a third of the work.', callout: 'The load follows the slots', code: 5,
        state: { mode: 'spread', load: [34, 33, 33], note: 'Related keys of one user still share a slot.', r: 'balanced' }, stats: [{ l: 'node A', v: '34%', cls: 'ok' }, { l: 'node B', v: '33%', cls: 'ok' }, { l: 'node C', v: '33%', cls: 'ok' }],
        takeaway: 'A tag should group the keys that need atomicity, and nothing broader. A constant tag is a single hot slot.' },
    ],
  };

  /* ---- 3. A node that does not own the slot redirects the client ---- */
  const FOOT_MOVED = 'Simplified: one client, three primaries. Addresses and slots illustrative.';
  const moved = {
    id: 'moved-ask', label: 'MOVED and ASK', desc: 'A node that does not own a slot answers MOVED, a permanent redirect. During a migration it answers ASK, a one-time redirect that needs ASKING first.',
    codeLabel: 'Commands',
    code: { bug: [
      'GET {user:42}:cart                  # sent to node A',
      '(error) MOVED 8211 10.0.2.2:6379    # node B owns slot 8211',
      '# the client updates its slot map and retries on node B',
      'CLUSTER SETSLOT 8211 MIGRATING <C>  # on source B, argument = target',
      '(error) ASK 8211 10.0.2.3:6379      # key already moved to the target',
      'ASKING ; GET {user:42}:cart         # one time, on the target',
    ] },
    scene: { w: W, h: H, footer: FOOT_MOVED, panels: [
      { id: 'cl', x: 16, y: 58, w: 170, h: 290, title: 'Client', tone: 'info' },
      { id: 'nd', x: 200, y: 58, w: 424, h: 290, title: 'Primaries', tone: 'info' },
    ], tokens: {
      c1: { label: 'client', sub: 'slot map: stale', tone: 'cursor', w: 130 },
      c2: { label: 'client', sub: 'map updated', tone: 'ok', w: 130 },
      c3: { label: 'client', sub: 'ASKING first', tone: 'cursor', w: 130 },
      na: { label: 'node A', sub: '0..5460', tone: 'info', w: 120 },
      nb: { label: 'node B', sub: '5461..10922', tone: 'info', w: 120 },
      nc: { label: 'node C', sub: '10923..16383', tone: 'info', w: 120 },
      nbh: { label: 'node B', sub: 'owns 8211', tone: 'live', w: 120 },
      mv: { label: 'MOVED 8211', sub: 'B 10.0.2.2:6379', tone: 'warn', w: 150 },
      ask: { label: 'ASK 8211', sub: 'node C, this once', tone: 'warn', w: 150 },
      mig: { label: 'B: MIGRATING', sub: 'slot 8211', tone: 'warn', w: 130 },
      imp: { label: 'C: IMPORTING', sub: 'slot 8211', tone: 'warn', w: 130 },
      okr: { label: 'reply', sub: 'cart returned', tone: 'ok', w: 130 },
    } },
    bug: [
      { log: 'A client sends GET {user:42}:cart to node A. The key hashes to slot 8211, which A does not own.', callout: 'The client picked the wrong node', code: 0,
        at: { c1: { x: 36, y: 130 }, na: { x: 224, y: 110 }, nb: { x: 364, y: 110 }, nc: { x: 504, y: 110 } }, arrows: [['c1', 'na', 'GET']], stats: [{ l: 'slot', v: '8211' }] },
      { log: 'Node A knows the whole slot map. It answers MOVED with the slot and the address of the owner, node B. It does not forward the command.', callout: 'MOVED: the owner is node B', moment: true, code: 1,
        at: { c1: { x: 36, y: 130 }, na: { x: 224, y: 110 }, nb: { x: 364, y: 110 }, nc: { x: 504, y: 110 }, mv: { x: 224, y: 220 } }, arrows: [['na', 'mv', '']], stats: [{ l: 'reply', v: 'MOVED', cls: 'warn' }] },
      { log: 'MOVED is permanent. The client updates its slot map and retries on node B. Later requests for slot 8211 go straight to B.', callout: 'The client updates its slot map', code: 2,
        at: { c2: { x: 36, y: 130 }, na: { x: 224, y: 110 }, nbh: { x: 364, y: 110 }, nc: { x: 504, y: 110 }, okr: { x: 364, y: 220 } }, arrows: [['c2', 'nbh', 'GET']], stats: [{ l: 'client map', v: 'updated', cls: 'ok' }] },
      { log: 'During a reshard, slot 8211 is marked MIGRATING on the source node B and IMPORTING on the target node C. Keys move one by one with MIGRATE.', callout: 'Resharding: MIGRATING and IMPORTING', code: 3,
        at: { c2: { x: 36, y: 130 }, na: { x: 224, y: 110 }, mig: { x: 364, y: 110 }, imp: { x: 504, y: 110 } }, arrows: [['mig', 'imp', 'MIGRATE']], stats: [{ l: 'slot 8211', v: 'moving', cls: 'warn' }] },
      { log: 'A request for a key that has already moved gets ASK from node B. Unlike MOVED, it is a one-time redirect, because B still owns the slot until the move ends.', callout: 'ASK: a one-time redirect', moment: true, code: 4,
        at: { c2: { x: 36, y: 130 }, na: { x: 224, y: 110 }, mig: { x: 364, y: 110 }, imp: { x: 504, y: 110 }, ask: { x: 364, y: 220 } }, arrows: [['mig', 'ask', '']], stats: [{ l: 'reply', v: 'ASK', cls: 'warn' }] },
      { log: 'The client sends ASKING to node C, then repeats the command there. It does not update its slot map, because ownership has not flipped yet.', callout: 'ASKING, then the command, on node C', code: 5,
        at: { c3: { x: 36, y: 130 }, na: { x: 224, y: 110 }, mig: { x: 364, y: 110 }, imp: { x: 504, y: 110 }, okr: { x: 504, y: 220 } }, arrows: [['c3', 'imp', 'ASKING + GET']], stats: [{ l: 'client map', v: 'unchanged' }],
        takeaway: 'MOVED means update your map for good. ASK means ask there once. A cluster-aware client handles both.' },
    ],
  };

  window.CHAPTER_OVERRIDES[9] = {
    explain: `<h3>1. One node has a ceiling</h3>
<p>One node is limited by its memory and by the single executor (chapter 1). To go beyond that, the keys are spread over several primaries. Redis Cluster does it without a central lookup service: every key maps to a fixed slot by a formula, each primary owns ranges of slots, and every node knows the whole slot map, so any node can tell a client where a key lives.</p>

<h3>2. Keys map to 16384 slots</h3>
<p>A key's slot is <code>CRC16(key) mod 16384</code>. The slot depends only on the key, never on the number of nodes. Adding a node moves whole slots to it, and the keys inside travel with the slot. <code>CLUSTER KEYSLOT key</code> prints the slot of any key.</p>

<h3>3. Hash tags</h3>
<p>If a key contains <code>{...}</code> with a non-empty text inside, only that tag is hashed. <code>{user:42}:cart</code> and <code>{user:42}:orders</code> both hash <code>user:42</code>, so they share a slot and one owner. Multi-key commands, <code>MULTI</code> and Lua scripts need all their keys in one slot, or the node refuses with <code>CROSSSLOT</code>. Tags are how you tell the cluster which keys belong together.</p>

<h3>4. Redirects</h3>
<p>A node that does not own a slot does not forward the command. It answers <code>MOVED slot host:port</code>, a permanent redirect, and a cluster-aware client updates its slot map and retries there. While a slot is being migrated, the source answers <code>ASK slot host:port</code> for keys that already moved. It is a one-time redirect: the client sends <code>ASKING</code> to the target and repeats the command, and does not update its map.</p>

<h3>5. Resharding</h3>
<p>To move a slot, the source node marks it <code>MIGRATING</code> (naming the target) and the target marks it <code>IMPORTING</code> (naming the source). Keys move one by one with <code>MIGRATE</code>, and once the slot is empty the ownership flips. Clients keep working throughout, using the MOVED and ASK answers. A slot is the smallest unit that moves.</p>

<h3>6. The trade-off: grouping against balance</h3>
<p>Hash tags let related keys share a slot, so multi-key commands work. But a tag that is too broad puts a lot of keys in one slot, and a slot cannot be split across nodes. A constant tag on every key is the extreme case: one node does all the work and the others are idle, and adding nodes changes nothing. Use the narrowest unit that really needs atomicity, such as the user id.</p>
<p>The slot is also the unit of failure: if the owner of a slot is down and has no replica to promote, those slots are uncovered. With the default <code>cluster-require-full-coverage yes</code> the cluster then stops answering queries, and with <code>no</code> only the keys in those slots fail. Look at <code>redis-cli --cluster info</code> and <code>CLUSTER NODES</code> for key counts, slot ranges and flags before you blame the client.</p>

<h3>7. Syntax</h3>
<pre>CLUSTER KEYSLOT {user:42}:cart       # slot of a key
CLUSTER NODES                        # nodes, roles, slot ranges, flags
CLUSTER SLOTS                        # the slot map as clients read it
redis-cli --cluster info 10.0.2.1:6379
redis-cli --cluster rebalance 10.0.2.1:6379

# a key that groups by user
SET {user:42}:cart v
MULTI
GET {user:42}:cart
GET {user:42}:orders
EXEC</pre>
<p>Use <code>redis-cli -c</code> to let the CLI follow MOVED and ASK by itself, and a cluster-aware client library in applications.</p>`,
    scenarios: [cross, hot, moved],
  };
})();
