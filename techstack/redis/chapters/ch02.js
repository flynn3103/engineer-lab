/* Chapter 2 "Typed Keyspace and Encodings": three scenes and the Explain text (index 2, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Scene 1: two pods write two types to one key. Scene 2: a hash crosses the listpack limit. Scene 3: which encoding each type uses.
   Byte counts are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;

  /* ---- 1. The type is checked before any command touches the value ---- */
  const FOOT_TYPE = 'Simplified: one key, two writers. The failure rate is illustrative.';
  const type = {
    id: 'type-clash', label: 'Two layouts, one key', desc: 'During a rolling deploy an old pod writes a hash and a new pod writes a string to the same key. Redis checks the type first and rejects the mismatch.',
    codeLabel: 'Commands',
    code: { bug: [
      'HSET cart:42 items 3              # old pod: hash layout',
      'SET cart:42 "json blob"           # new pod: string layout',
      'HGETALL cart:42                   # old pod reads',
      '(error) WRONGTYPE Operation against a key holding the wrong kind of value',
      'HSET cart:v2:42 items 3           # fix: a new key name for the new layout',
    ] },
    scene: { w: W, h: H, footer: FOOT_TYPE, panels: [
      { id: 'pods', x: 16, y: 58, w: 190, h: 290, title: 'Application pods', tone: 'info' },
      { id: 'key', x: 220, y: 58, w: 200, h: 290, title: 'Keyspace', tone: 'info' },
      { id: 'rep', x: 434, y: 58, w: 190, h: 290, title: 'Reply', tone: 'info' },
    ], tokens: {
      old: { label: 'old pod', sub: 'writes a hash', tone: 'cursor', w: 140 },
      neu: { label: 'new pod', sub: 'writes a string', tone: 'cursor', w: 140 },
      kh: { label: 'cart:42', sub: 'type: hash', tone: 'info', w: 150 },
      ks: { label: 'cart:42', sub: 'type: string', tone: 'warn', w: 150 },
      kv2: { label: 'cart:v2:42', sub: 'type: hash', tone: 'ok', w: 150 },
      err: { label: 'WRONGTYPE', sub: 'nothing changes', tone: 'warn', w: 150 },
      ok: { label: 'cart returned', sub: 'HGETALL ok', tone: 'ok', w: 150 },
    } },
    bug: [
      { log: 'The old pod stores the cart as a hash: HSET cart:42 items 3. The key now has the type hash.', callout: 'cart:42 is a hash', code: 0,
        at: { old: { x: 40, y: 110 }, kh: { x: 245, y: 110 } }, arrows: [['old', 'kh', 'HSET']], stats: [{ l: 'type of cart:42', v: 'hash' }] },
      { log: 'During the rolling deploy a new pod writes the cart as one JSON string to the same key name. SET replaces the value, and the key becomes a string.', callout: 'The new pod writes a string to the same name', code: 1,
        at: { old: { x: 40, y: 110 }, neu: { x: 40, y: 230 }, ks: { x: 245, y: 170 } }, arrows: [['neu', 'ks', 'SET']], stats: [{ l: 'type of cart:42', v: 'string', cls: 'warn' }] },
      { log: 'An old pod runs HGETALL cart:42. Redis checks the type of the value before it runs anything.', callout: 'Redis checks the type first', moment: true, code: 2,
        at: { old: { x: 40, y: 110 }, ks: { x: 245, y: 170 } }, arrows: [['old', 'ks', 'HGETALL', 'bad']], stats: [{ l: 'command', v: 'HGETALL', cls: 'warn' }, { l: 'value type', v: 'string', cls: 'warn' }] },
      { log: 'A hash command on a string key is rejected with WRONGTYPE. Redis never converts a value between types, so requests for these carts fail (illustrative: 40%).', callout: 'WRONGTYPE: rejected, nothing converted', code: 3,
        at: { old: { x: 40, y: 110 }, ks: { x: 245, y: 170 }, err: { x: 450, y: 170 } }, arrows: [['ks', 'err', 'type check', 'bad']], stats: [{ l: 'requests failing', v: '40%', cls: 'bad' }] },
      { log: 'The fix is to give the new layout its own key name. Old pods keep cart:42 as a hash, and new pods write cart:v2:42.', callout: 'A new key name for the new layout', code: 4,
        at: { old: { x: 40, y: 110 }, neu: { x: 40, y: 230 }, kh: { x: 245, y: 110 }, kv2: { x: 245, y: 230 } }, arrows: [['old', 'kh', 'HSET'], ['neu', 'kv2', 'HSET']], stats: [{ l: 'type clash', v: 'none', cls: 'ok' }] },
      { log: 'Each key keeps one type, so every read succeeds.', callout: 'One key, one type, no clash',
        at: { old: { x: 40, y: 110 }, neu: { x: 40, y: 230 }, kh: { x: 245, y: 110 }, kv2: { x: 245, y: 230 }, ok: { x: 450, y: 230 } }, arrows: [['kv2', 'ok', 'HGETALL']], stats: [{ l: 'requests failing', v: '0', cls: 'ok' }],
        takeaway: 'Never share a key name between two layouts. Version the key name when a rolling deploy changes the type.' },
    ],
  };

  /* ---- 2. A hash converts from listpack to hashtable at the limit and does not shrink back ---- */
  const FOOT_LP = 'Simplified: one hash. Byte counts are illustrative; use MEMORY USAGE on real keys.';
  const BARMAX = 10000;
  const listpack = {
    id: 'listpack-limit', label: 'Hash over the limit', desc: 'A hash of 128 fields is a compact listpack. Field 129 crosses hash-max-listpack-entries and converts it to a hashtable that costs more bytes per field.',
    codeLabel: 'Commands',
    code: { bug: [
      '# defaults: hash-max-listpack-entries 128, hash-max-listpack-value 64',
      'OBJECT ENCODING cart:42     -> "listpack"      # 128 fields',
      'HSET cart:42 f129 v         # the 129th field',
      'OBJECT ENCODING cart:42     -> "hashtable"',
      'MEMORY USAGE cart:42        -> 9420            # illustrative, about 3x',
      'HSET cart:42:2 f129 v       # fix: bucket the fields, 128 at most per key',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_LP,
      header: s => ({ left: 'hash-max-listpack-entries = 128', right: s.r || '' }),
      setup(kit) {
        const enc = kit.chip(null, { x: 40, y: 84, w: 250, h: 52, label: 'listpack', sub: '128 fields', tone: 'ok' });
        const b2 = kit.chip(null, { x: 40, y: 150, w: 250, h: 52, label: 'cart:42:2 listpack', sub: '1 field', tone: 'ok', show: false });
        const chk = kit.chip(null, { x: 340, y: 84, w: 260, h: 52, label: 'entries <= 128 ?', sub: 'checked on every HSET', tone: 'info', show: false });
        const lbl = kit.text(null, { x: 40, y: 232, t: '', cls: 'mut sm' });
        const bars = kit.bars(null, { x: 40, y: 270, w: 560, labelW: 150, rowH: 28, max: BARMAX, title: 'Bytes for the same 129 fields (illustrative)', items: [{ id: 'one', label: 'one hash' }, { id: 'two', label: 'two buckets' }] });
        return { enc, b2, chk, lbl, bars };
      },
      frame(s, kit, R) {
        R.enc.set({ label: s.enc || 'listpack', sub: (s.n || 128) + ' fields', tone: s.enc === 'hashtable' ? 'warn' : 'ok', hl: s.cross });
        R.chk.set({ show: !!s.chk, tone: s.cross ? 'warn' : 'info', sub: s.cross ? '129 > 128, convert' : 'checked on every HSET' });
        R.b2.set({ show: !!s.bucket });
        R.lbl.set(s.note || '');
        R.bars.set('one', s.one || 3100, s.enc === 'hashtable' ? 'bad' : 'ok', (s.one || 3100) + ' B');
        R.bars.set('two', s.bucket ? 3200 : 0, 'ok', s.bucket ? '3200 B' : '');
      },
    },
    bug: [
      { log: 'cart:42 holds 128 fields. With the default limits Redis stores a hash this small as a listpack, one flat contiguous array.', callout: '128 fields: a compact listpack', code: 1,
        state: { enc: 'listpack', n: 128, one: 3100, r: 'listpack' }, stats: [{ l: 'fields', v: '128' }, { l: 'encoding', v: 'listpack', cls: 'ok' }] },
      { log: 'HSET adds field 129. On every write Redis checks the entry count against hash-max-listpack-entries, and the value size against hash-max-listpack-value.', callout: 'Every HSET checks the limits', code: 2,
        state: { enc: 'listpack', n: 129, chk: true, one: 3100, r: 'field 129' }, stats: [{ l: 'fields', v: '129', cls: 'warn' }, { l: 'limit', v: '128' }] },
      { log: 'The limit is crossed, so the hash converts to a hashtable at once. All the data is kept; nothing is dropped.', callout: 'Converted: listpack to hashtable', moment: true, code: 3,
        state: { enc: 'hashtable', n: 129, chk: true, cross: true, one: 9420, r: 'converted' }, stats: [{ l: 'encoding', v: 'hashtable', cls: 'bad' }, { l: 'data lost', v: 'none', cls: 'ok' }] },
      { log: 'Each field now costs more bytes. The same fields take about 3x the memory (illustrative), and removing fields later does not convert the hash back automatically.', callout: 'About 3x the bytes for the same fields', code: 4,
        state: { enc: 'hashtable', n: 129, one: 9420, note: 'It stays a hashtable even if fields are removed later.', r: 'about 3x' }, stats: [{ l: 'bytes', v: '9420', cls: 'bad' }, { l: 'vs listpack', v: 'about 3x', cls: 'bad' }] },
      { log: 'The fix is to bound the hash. Spread the fields over buckets of at most 128 entries, for example cart:42 and cart:42:2.', callout: 'Buckets of 128 stay listpacks', code: 5,
        state: { enc: 'listpack', n: 128, bucket: true, one: 9420, r: 'bucketed' }, stats: [{ l: 'encoding per bucket', v: 'listpack', cls: 'ok' }] },
      { log: 'Memory stays low and flat as carts grow. Verify with OBJECT ENCODING and MEMORY USAGE on a sample of keys, not by guessing.', callout: 'Compact per bucket, flat as it grows',
        state: { enc: 'listpack', n: 128, bucket: true, one: 9420, note: 'Raising the limit instead moves the cost from memory to CPU.', r: 'bucketed' }, stats: [{ l: 'bytes for two buckets', v: '3200', cls: 'ok' }],
        takeaway: 'Compact encodings save memory and cost CPU on large values. Bound the size of one key instead of raising the threshold.' },
    ],
  };

  /* ---- 3. Each type has a compact form and a large form ---- */
  const FOOT_ENC = 'Simplified: the common encodings. OBJECT ENCODING shows the real one.';
  const ROWS = [
    ['string', 'int, embstr', 'raw', 'value size'],
    ['list', 'quicklist of listpacks', 'same', 'node size'],
    ['hash', 'listpack', 'hashtable', '128 / 64 B'],
    ['set', 'intset', 'hashtable', 'small ints'],
    ['zset', 'listpack', 'skiplist', '128 / 64 B'],
    ['stream', 'radix tree', 'of listpacks', 'by entry'],
  ];
  const enc = {
    id: 'encodings', label: 'Encoding by type', desc: 'Every value has a type, which decides the commands, and an encoding, which decides the bytes. Small values use compact encodings and convert at a threshold.',
    codeLabel: 'Commands',
    code: { bug: [
      'TYPE cart:42                  # hash',
      'OBJECT ENCODING cart:42       # listpack, or hashtable once over the limit',
      'MEMORY USAGE cart:42          # bytes this key costs',
      '# hash: hash-max-listpack-entries / hash-max-listpack-value',
      '# zset: zset-max-listpack-entries',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_ENC,
      header: s => ({ left: 'type -> encoding', right: s.r || '' }),
      setup(kit) {
        const led = kit.ledger(null, { x: 40, y: 80, w: 560, title: 'Compact form, then large form', cols: [{ label: 'type', w: 80 }, { label: 'small', w: 190 }, { label: 'large', w: 150 }, { label: 'limit', w: 120 }], rows: 6, rowH: 28 });
        return { led };
      },
      frame(s, kit, R) {
        const n = s.rows || 0;
        R.led.clear();
        ROWS.slice(0, n).forEach((r, i) => R.led.setRow(i, r, { hl: i === s.hl, tones: [null, s.hl === i ? 'ok' : null, s.hl === i ? 'warn' : null, null] }));
      },
    },
    bug: [
      { log: 'Every key holds a redisObject with a type and an encoding. The type decides which commands are allowed. The encoding decides how the bytes are laid out.', callout: 'type = commands, encoding = bytes', code: 0,
        state: { rows: 0, r: 'type, encoding' }, stats: [{ l: 'types', v: '6' }] },
      { log: 'A string is stored as an integer or embstr when small and as raw when large. A list is a quicklist: a linked list of listpacks.', callout: 'Strings and lists', code: 0,
        state: { rows: 2, hl: 0, r: 'string, list' }, stats: [{ l: 'compact', v: 'int / embstr' }] },
      { log: 'A hash is a listpack while it stays within hash-max-listpack-entries and hash-max-listpack-value (128 and 64 by default). Beyond that it is a hashtable.', callout: 'Hash: listpack until 128 fields or 64 bytes', moment: true, code: 3,
        state: { rows: 3, hl: 2, r: 'hash' }, stats: [{ l: 'listpack limit', v: '128 / 64', cls: 'warn' }] },
      { log: 'A set of small integers is an intset. A sorted set is a listpack until zset-max-listpack-entries is crossed, and then a skiplist with a hash.', callout: 'Set and zset convert the same way', code: 4,
        state: { rows: 5, hl: 4, r: 'set, zset' }, stats: [{ l: 'zset listpack limit', v: '128', cls: 'warn' }] },
      { log: 'A stream is a radix tree whose nodes are listpacks. Inspect any key with TYPE, OBJECT ENCODING and MEMORY USAGE before guessing.', callout: 'Inspect before guessing', code: 1,
        state: { rows: 6, hl: 5, r: 'stream' }, stats: [{ l: 'tools', v: 'TYPE, OBJECT ENCODING, MEMORY USAGE' }],
        takeaway: 'Conversion happens at once when a threshold is crossed, and it does not shrink back automatically.' },
    ],
  };

  window.CHAPTER_OVERRIDES[2] = {
    explain: `<h3>1. A key holds a typed value</h3>
<p>Every key maps to a value with a type: string, list, hash, set, sorted set or stream. The type decides which commands may touch the value. <code>HGETALL</code> works on a hash and nothing else. Redis checks the type before it runs the command, and a mismatch returns <code>WRONGTYPE</code> and changes nothing. Redis never converts a value from one type to another for you.</p>

<h3>2. The encoding decides the bytes</h3>
<p>Next to the type, every value has an encoding: how the bytes are laid out in memory. The same hash can be a compact <b>listpack</b> or a <b>hashtable</b>. A listpack is one flat array, so a small hash costs few bytes and sits in one contiguous block, but finding a field means scanning it. A hashtable costs more bytes per field and finds a field in constant time.</p>

<h3>3. Small values use compact encodings</h3>
<p>A string is an integer, <code>embstr</code> when short, or <code>raw</code>. A list is a <code>quicklist</code>, a list of listpacks. A set of small integers is an <code>intset</code>. Hashes and sorted sets start as a listpack. A stream is a radix tree of listpacks. Redis picks the encoding from the size of the value, and the choice is invisible to the commands.</p>

<h3>4. Thresholds convert the encoding</h3>
<p>A hash stays a listpack while it has at most <code>hash-max-listpack-entries</code> fields (128 by default) and every value is at most <code>hash-max-listpack-value</code> bytes (64 by default). A sorted set uses <code>zset-max-listpack-entries</code> in the same way. When either limit is crossed, Redis converts the value to the large encoding at once. The conversion does not shrink back by itself when the value gets smaller again, so one bulk import that crosses the limit keeps the memory cost.</p>

<h3>5. The trade-off: bytes against CPU</h3>
<p>Compact encodings save memory and cost CPU, because listpack operations scan linearly. Raising a threshold can look like a free fix for memory, but it moves the cost to CPU and, on very large listpacks, to latency. Splitting a large value into bounded keys keeps both in check: for example hash buckets of at most 128 fields, chosen from a hash of the field name.</p>
<p>The other half of this chapter is naming. A rolling deploy that changes the type of a key, or the layout of its value, must use a new key name, because old and new code run side by side and Redis will not convert between types for either of them.</p>
<p>To check what a key costs, run <code>TYPE</code>, <code>OBJECT ENCODING</code> and <code>MEMORY USAGE</code> on a sample. <code>MEMORY USAGE</code> measures one key, and <code>redis-cli --bigkeys</code> or <code>--memkeys</code> samples the keyspace to find the largest ones.</p>

<h3>6. Syntax</h3>
<pre>TYPE cart:42                       # hash
OBJECT ENCODING cart:42            # listpack or hashtable
MEMORY USAGE cart:42               # bytes for this key and its value

# the thresholds, in redis.conf or with CONFIG SET
hash-max-listpack-entries 128
hash-max-listpack-value 64
zset-max-listpack-entries 128

redis-cli --bigkeys                # largest key of each type, by sampling</pre>
<p>A bucketed key name such as <code>cart:42:2</code> keeps each hash under the limit. Rename on write with the new name, not by changing the type of an existing key.</p>`,
    scenarios: [type, listpack, enc],
  };
})();
