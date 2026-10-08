/* Chapter 4 "Memory and Eviction": three scenes and the Explain text (index 4, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Scene 1: the same full cache under noeviction and under allkeys-lru. Scene 2: sampled LRU picks the idlest key of a small sample.
   Scene 3: a volatile policy with no TTLs has no candidates. Sizes, idle times and counts are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;

  /* ---- 1. The policy decides: refuse the write, or evict to make room ---- */
  const FOOT_OOM = 'Simplified: one node at its maxmemory. Sizes illustrative.';
  const oom = {
    id: 'policy-choice', label: 'noeviction vs LRU', desc: 'The cache is full. With noeviction a SET is refused and a GET still works. With allkeys-lru Redis evicts a cold key and the SET is stored.',
    codeLabel: 'Config',
    code: { bug: [
      'maxmemory 2gb',
      'maxmemory-policy noeviction',
      'SET sess:new v      # needs new bytes',
      "(error) OOM command not allowed when used memory > 'maxmemory'.",
      'GET sess:old         # reads add no memory, still served',
      'CONFIG SET maxmemory-policy allkeys-lru',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_OOM,
      header: s => ({ left: 'maxmemory 2gb · ' + (s.pol || 'noeviction'), right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 40, y: 96, w: 560, labelW: 110, rowH: 28, max: 2.2, title: 'Memory', items: [{ id: 'mem', label: 'used_memory' }] });
        const cmd = kit.chip(null, { x: 40, y: 160, w: 170, h: 52, label: 'SET sess:new', sub: 'needs new bytes', tone: 'cursor', show: false });
        const chk = kit.chip(null, { x: 240, y: 160, w: 170, h: 52, label: 'memory check', sub: 'used vs maxmemory', tone: 'info', show: false });
        const res = kit.chip(null, { x: 440, y: 160, w: 160, h: 52, label: 'OOM error', sub: 'write refused', tone: 'warn', show: false });
        const get = kit.chip(null, { x: 440, y: 236, w: 160, h: 46, label: 'GET', sub: 'served', tone: 'ok', show: false });
        const ev = kit.chip(null, { x: 240, y: 236, w: 170, h: 46, label: 'evict cold key', sub: 'sampled LRU', tone: 'live', show: false });
        return { bars, cmd, chk, res, get, ev };
      },
      frame(s, kit, R) {
        R.bars.set('mem', s.mem == null ? 1.6 : s.mem, s.mem >= 2 ? 'bad' : 'info', (s.mem == null ? 1.6 : s.mem).toFixed(2) + ' GB');
        R.cmd.set({ show: !!s.cmd });
        R.chk.set({ show: !!s.chk, tone: s.chkTone || 'info', sub: s.chkSub || 'used vs maxmemory' });
        R.res.set({ show: !!s.res, label: s.resLabel || 'OOM error', sub: s.resSub || 'write refused', tone: s.resTone || 'warn' });
        R.get.set({ show: !!s.get });
        R.ev.set({ show: !!s.ev });
      },
    },
    bug: [
      { log: 'The budget is 2 GB and the policy is noeviction. At 21:00 the dataset grows to the budget.', callout: 'The dataset reaches maxmemory', code: 0,
        state: { mem: 2, r: 'full' }, stats: [{ l: 'used_memory', v: '2.00G of 2.00G', cls: 'bad' }, { l: 'policy', v: 'noeviction', cls: 'warn' }] },
      { log: 'A new SET needs bytes, so Redis compares used memory with maxmemory before it runs the write.', callout: 'Every write is checked against the budget', code: 2,
        state: { mem: 2, cmd: true, chk: true, chkTone: 'warn', chkSub: 'over the budget', r: 'SET' }, stats: [{ l: 'used vs max', v: '2.00 / 2.00', cls: 'bad' }] },
      { log: 'noeviction removes nothing. It refuses commands that could grow memory and replies with an OOM error.', callout: 'noeviction: the write is refused', moment: true, code: 3,
        state: { mem: 2, cmd: true, chk: true, chkTone: 'warn', chkSub: 'policy: refuse', res: true, r: 'OOM' }, stats: [{ l: 'SET', v: 'refused', cls: 'bad' }] },
      { log: 'Reads and deletes still work, because they do not add memory. That is why product pages kept working while checkout failed.', callout: 'GET still works', code: 4,
        state: { mem: 2, cmd: true, chk: true, chkTone: 'warn', chkSub: 'policy: refuse', res: true, get: true, r: 'reads ok' }, stats: [{ l: 'GET', v: 'served', cls: 'ok' }, { l: 'SET', v: 'refused', cls: 'bad' }] },
      { log: 'Switch to allkeys-lru. The same check finds the budget full, but this policy is allowed to evict a key.', callout: 'allkeys-lru may evict', code: 5,
        state: { pol: 'allkeys-lru', mem: 2, cmd: true, chk: true, chkTone: 'ok', chkSub: 'policy: evict', r: 'LRU' }, stats: [{ l: 'policy', v: 'allkeys-lru', cls: 'ok' }] },
      { log: 'Redis samples keys and evicts the one idle longest. Memory drops a little and the SET is stored. The cache keeps churning at the cap.', callout: 'A cold key is evicted, the SET is stored', moment: true,
        state: { pol: 'allkeys-lru', mem: 1.99, cmd: true, chk: true, chkTone: 'ok', chkSub: 'policy: evict', ev: true, res: true, resLabel: 'SET stored', resSub: 'after one eviction', resTone: 'ok', r: 'stored' }, stats: [{ l: 'evicted_keys', v: '+1', cls: 'warn' }, { l: 'SET', v: 'stored', cls: 'ok' }],
        takeaway: 'A cache can evict, so use an LRU or LFU policy. A store of record should not: use noeviction and size it.' },
    ],
  };

  /* ---- 2. Redis does not rank all keys; it samples a few and evicts the idlest of them ---- */
  const FOOT_LRU = 'Simplified: 12 keys, idle seconds illustrative. maxmemory-samples defaults to 5.';
  const IDLE = [40, 900, 15, 3, 230, 1200, 60, 5, 700, 2, 90, 400];
  const SAMPLE = [1, 3, 6, 8, 10];
  const VICTIM = 1;          // idle 900, the idlest key inside the sample
  const GLOBAL = 5;          // idle 1200, never sampled
  const keyItems = IDLE.map((v, i) => ({ id: 'k' + i, label: v + 's' }));
  const sampled = {
    id: 'sampled-lru', label: 'Sampled LRU', desc: 'Redis keeps no global list of keys by recent use. It samples a few keys and evicts the one idle longest, so the victim is not always the oldest key of all.',
    codeLabel: 'Config',
    code: { bug: [
      'maxmemory-policy allkeys-lru',
      'maxmemory-samples 5        # default',
      '# 1. pick 5 random keys: 2, 4, 7, 9, 11',
      '# 2. compare their idle time',
      '# 3. evict the idlest of the five',
      'maxmemory-samples 10       # closer to true LRU, more CPU',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_LRU,
      header: s => ({ left: '12 keys · label = idle seconds', right: s.r || '' }),
      setup(kit) {
        const strip = kit.strip(null, { x: 40, y: 100, items: keyItems, w: 44, h: 28, gap: 4 });
        const sel = kit.chip(null, { x: 40, y: 168, w: 250, h: 50, label: 'sample of 5', sub: 'picked at random', tone: 'info', show: false });
        const vic = kit.chip(null, { x: 330, y: 168, w: 270, h: 50, label: 'victim: key 2, 900s', sub: 'idlest of the sample', tone: 'warn', show: false });
        const glob = kit.chip(null, { x: 40, y: 236, w: 560, h: 50, label: 'key 6, 1200s, is idler but was not in the sample', sub: 'a cheap approximation, not an exact LRU', tone: 'info', show: false });
        const bars = kit.bars(null, { x: 40, y: 316, w: 560, labelW: 150, rowH: 28, max: 10, title: 'maxmemory-samples', items: [{ id: 'm', label: 'keys per sample' }] });
        return { strip, sel, vic, glob, bars };
      },
      frame(s, kit, R) {
        IDLE.forEach((v, i) => {
          let tone = 'info';
          if (s.pick && SAMPLE.includes(i)) tone = 'cursor';
          if (s.evict && i === VICTIM) tone = 'delete';
          if (s.glob && i === GLOBAL) tone = 'warn';
          R.strip['k' + i].set({ tone, hl: s.pick && SAMPLE.includes(i) });
        });
        R.sel.set({ show: !!s.pick });
        R.vic.set({ show: !!s.evict });
        R.glob.set({ show: !!s.glob });
        R.bars.set('m', s.m || 5, 'info', String(s.m || 5));
      },
    },
    bug: [
      { log: 'The policy is allkeys-lru. Redis could in theory keep every key in a list ordered by last use, but that list would cost memory and CPU on every access.', callout: 'No global list of keys by recency', code: 0,
        state: { r: '12 keys' }, stats: [{ l: 'keys', v: '12' }, { l: 'samples', v: '5' }] },
      { log: 'Instead Redis picks maxmemory-samples keys at random (5 by default). Here the sample is keys 2, 4, 7, 9 and 11.', callout: 'Pick 5 keys at random', code: 2,
        state: { pick: true, r: 'sample' }, stats: [{ l: 'sample size', v: '5' }] },
      { log: 'Each key stores a small last-access clock, so Redis compares the idle time of the five: 900, 3, 60, 700 and 90 seconds.', callout: 'Compare the idle time of the five', code: 3,
        state: { pick: true, r: 'compare' }, stats: [{ l: 'idle in sample', v: '900 · 3 · 60 · 700 · 90' }] },
      { log: 'The key idle longest in the sample, key 2 at 900 seconds, is evicted. Memory comes back and the write can go on.', callout: 'Evict the idlest of the sample', moment: true, code: 4,
        state: { pick: true, evict: true, r: 'evict key 2' }, stats: [{ l: 'evicted', v: 'key 2, 900 s', cls: 'warn' }] },
      { log: 'Key 6 had been idle 1200 seconds, longer than the victim, but it was not in the sample. Sampling is an approximation, so the victim is not always the globally idlest key.', callout: 'Idler keys can survive a round', code: 3,
        state: { pick: true, evict: true, glob: true, r: 'approximate' }, stats: [{ l: 'victim idle', v: '900 s', cls: 'warn' }, { l: 'idlest key', v: '1200 s', cls: 'bad' }] },
      { log: 'Raising maxmemory-samples makes the choice closer to true LRU, at the cost of more CPU per eviction. allkeys-lfu keeps a decaying counter per key, so a one-time scan does not push out hot keys.', callout: 'More samples: closer to LRU, more CPU',
        state: { pick: true, evict: true, glob: true, m: 10, r: 'samples 10' }, stats: [{ l: 'maxmemory-samples', v: '10', cls: 'ok' }],
        takeaway: 'Eviction is sampled, not exact. Tune maxmemory-samples if the victims look wrong, and prefer LFU when scans pollute an LRU.' },
    ],
  };

  /* ---- 3. A volatile policy can only evict keys that have a TTL ---- */
  const FOOT_VOL = 'Simplified: 3.2 million session keys. Counts illustrative.';
  const vol = {
    id: 'volatile-no-ttl', label: 'volatile-lru, no TTL', desc: 'A volatile-* policy only considers keys that have an expiry. If the session writer never sets a TTL, there is nothing to evict and writes fail like noeviction.',
    codeLabel: 'Commands',
    code: { bug: [
      'CONFIG GET maxmemory-policy        # volatile-lru',
      'INFO keyspace   db0:keys=3200000,expires=0',
      "SET sess:new v                    # no EX, no TTL",
      "(error) OOM command not allowed when used memory > 'maxmemory'.",
      'SET sess:new v EX 1800            # fix: every cache write gets a TTL',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_VOL,
      header: s => ({ left: 'maxmemory-policy volatile-lru', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 40, y: 96, w: 560, labelW: 150, rowH: 28, max: 3.2, title: 'Keys with a TTL (millions)', items: [{ id: 'ttl', label: 'keys with TTL' }, { id: 'all', label: 'all keys' }] });
        const pol = kit.chip(null, { x: 40, y: 190, w: 250, h: 52, label: 'volatile-lru', sub: 'only keys with a TTL', tone: 'info' });
        const cand = kit.chip(null, { x: 330, y: 190, w: 270, h: 52, label: 'eviction candidates', sub: '0', tone: 'warn' });
        const res = kit.chip(null, { x: 40, y: 268, w: 560, h: 52, label: 'SET sess:new', sub: 'waiting', tone: 'info', show: false });
        return { bars, pol, cand, res };
      },
      frame(s, kit, R) {
        const ttl = s.ttl || 0;
        R.bars.set('ttl', ttl, ttl ? 'ok' : 'bad', ttl.toFixed(1) + 'M');
        R.bars.set('all', 3.2, 'info', '3.2M');
        R.pol.set({ tone: s.polTone || 'info' });
        R.cand.set({ sub: s.cand || '0', tone: s.candTone || 'warn' });
        R.res.set({ show: !!s.res, label: s.resLabel || 'SET sess:new', sub: s.resSub || '', tone: s.resTone || 'warn' });
      },
    },
    bug: [
      { log: 'The policy is volatile-lru. It may evict only keys that have an expiry, and leaves the rest alone.', callout: 'volatile-* considers only keys with a TTL', code: 0,
        state: { ttl: 0, polTone: 'warn', r: 'policy' }, stats: [{ l: 'policy', v: 'volatile-lru', cls: 'warn' }] },
      { log: 'INFO keyspace shows 3.2 million keys and expires=0. The session writer never sets a TTL.', callout: 'expires=0: no key has a TTL', code: 1,
        state: { ttl: 0, polTone: 'warn', r: 'expires=0' }, stats: [{ l: 'keys with TTL', v: '0 of 3.2M', cls: 'bad' }] },
      { log: 'Memory is full and a new session is written without EX. The eviction candidate set is empty.', callout: 'The candidate set is empty', moment: true, code: 2,
        state: { ttl: 0, polTone: 'warn', cand: '0, nothing to evict', candTone: 'warn', res: true, resSub: 'no EX, no TTL', r: 'SET' }, stats: [{ l: 'candidates', v: '0', cls: 'bad' }] },
      { log: 'With nothing to evict, the write is refused with an OOM error, exactly as under noeviction.', callout: 'The write fails like noeviction', code: 3,
        state: { ttl: 0, polTone: 'warn', cand: '0, nothing to evict', candTone: 'warn', res: true, resLabel: 'OOM error', resSub: 'same as noeviction', r: 'refused' }, stats: [{ l: 'SET', v: 'refused', cls: 'bad' }] },
      { log: 'The fix is to set EX 1800 on every session key, so that every session is an eviction candidate.', callout: 'Give every cache key a TTL', code: 4,
        state: { ttl: 3.2, polTone: 'ok', cand: 'all 3.2M sessions', candTone: 'ok', res: true, resSub: 'EX 1800', resTone: 'info', r: 'with TTL' }, stats: [{ l: 'keys with TTL', v: '3.2M of 3.2M', cls: 'ok' }] },
      { log: 'Under memory pressure the policy now evicts one candidate and the write is stored.', callout: 'One candidate is evicted, the SET is stored',
        state: { ttl: 3.2, polTone: 'ok', cand: 'all 3.2M sessions', candTone: 'ok', res: true, resLabel: 'SET stored', resSub: 'after one eviction', resTone: 'ok', r: 'stored' }, stats: [{ l: 'SET', v: 'stored', cls: 'ok' }],
        takeaway: 'A volatile policy is only as good as your TTL discipline. Keys without a TTL are never evicted by it.' },
    ],
  };

  window.CHAPTER_OVERRIDES[4] = {
    explain: `<h3>1. A byte budget, and a choice</h3>
<p><code>maxmemory</code> is a byte budget. As long as used memory is under it, nothing happens. When a command that may add data runs and used memory is over the budget, Redis must choose between refusing the write and throwing away live data. The eviction policy, <code>maxmemory-policy</code>, is that choice. Without a <code>maxmemory</code>, Redis grows until the operating system or the container kills it.</p>

<h3>2. noeviction: protect the data</h3>
<p>With <code>noeviction</code>, the server refuses commands that could grow memory, which means most writes, and replies with an OOM error. Reads and deletes still work, because they add no memory. That is why, in this incident, product pages kept working while checkout failed on every <code>SET</code>.</p>

<h3>3. Eviction policies: which key goes</h3>
<p>The other policies evict keys until the write fits. <code>allkeys-lru</code>, <code>allkeys-lfu</code> and <code>allkeys-random</code> consider every key. The <code>volatile-lru</code>, <code>volatile-lfu</code>, <code>volatile-random</code> and <code>volatile-ttl</code> variants consider only keys that have an expiry, so a key without a TTL is never evicted by them. If no key has a TTL, a volatile policy behaves like <code>noeviction</code>.</p>

<h3>4. Sampling, not a global ordering</h3>
<p>Redis does not keep all keys ordered by use. It samples <code>maxmemory-samples</code> keys (5 by default), puts them in an eviction pool and removes the one idle longest. This is cheap and approximate: a key that is idler than the victim but was not sampled survives that round. A higher sample count gets closer to true LRU and costs more CPU.</p>
<p>LFU keeps a small counter per key that grows with use and decays over time, tuned by <code>lfu-log-factor</code> and <code>lfu-decay-time</code>. A key read once by a big scan has a low count, so it does not push out the hot keys the way a recency policy can.</p>

<h3>5. The trade-off: refuse or forget</h3>
<p><code>noeviction</code> protects data but turns the cache into a hard failure at the cap. An eviction policy keeps writes working but may drop a key you still needed. Choose by what the data is: a cache can evict, a store of record should not. A queue or a stream sitting in the same instance as the cache is a data store, and the cache's policy will evict it, so keep them apart or size for both.</p>
<p>Watch <code>used_memory</code>, <code>evicted_keys</code> and the keyspace hit rate in <code>INFO</code>. A rising <code>evicted_keys</code> with a falling hit rate means the working set no longer fits in the budget. The remedy is more memory, smaller values (chapter 3) or shorter TTLs, not a different policy.</p>

<h3>6. Syntax</h3>
<pre>maxmemory 2gb
maxmemory-policy allkeys-lru        # or noeviction, volatile-lru, allkeys-lfu ...
maxmemory-samples 5                 # default

INFO memory                         # used_memory, maxmemory, maxmemory_policy
INFO stats                          # evicted_keys, keyspace_hits, keyspace_misses
INFO keyspace                       # db0:keys=...,expires=...
MEMORY STATS</pre>
<p>Setting <code>EX</code> on every cache write makes the <code>volatile-*</code> policies work, and it also bounds how long unused keys stay.</p>`,
    scenarios: [oom, sampled, vol],
  };
})();
