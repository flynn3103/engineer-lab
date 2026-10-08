/* Chapter 3 "Key Expiration": three scenes and the Explain text (index 3, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Scene 1: deadlines that fall in one second against deadlines with jitter. Scene 2: lazy expiry against the sampling cycle. Scene 3: a replica waits for the primary's DEL.
   Counts and percentages are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;

  /* ---- 1. Same-second deadlines make the expire cycle work in one burst ---- */
  const FOOT_SYNC = 'Simplified: bars show keys expiring per second. Counts are illustrative.';
  const SEC = ['t+0 s', 't+1 s', 't+2 s', 't+3 s', 't+4 s'];
  const sync = {
    id: 'same-second', label: 'Same-second deadlines', desc: 'Half a million keys written in one burst with the same TTL expire in the same second. The expire cycle then repeats until its time budget ends, and clients see a spike.',
    codeLabel: 'Commands',
    code: { bug: [
      'for i in 1..500000: SET cache:i v EX 1800       # one burst',
      '# 30 min later all deadlines fall in about one second',
      '# expire cycle: sample 20 keys, nearly all expired, repeat',
      'LATENCY LATEST            # expire-cycle spike (illustrative)',
      'for i in 1..500000: SET cache:i v EX (1800 + random(0, 300))   # jitter',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_SYNC,
      header: s => ({ left: 'TTL 1800 s · 500,000 keys', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 40, y: 98, w: 330, labelW: 56, rowH: 28, max: 500, unit: 'k', title: 'Keys expiring per second', items: SEC.map((l, i) => ({ id: 's' + i, label: l })) });
        const cyc = kit.chip(null, { x: 400, y: 84, w: 210, h: 52, label: 'Expire cycle', sub: 'samples 20 keys', tone: 'info' });
        const lat = kit.chip(null, { x: 400, y: 150, w: 210, h: 52, label: 'Client latency', sub: 'flat', tone: 'ok' });
        const note = kit.text(null, { x: 40, y: 262, t: '', cls: 'mut sm' });
        return { bars, cyc, lat, note };
      },
      frame(s, kit, R) {
        const v = s.v || [0, 0, 0, 0, 0];
        SEC.forEach((l, i) => R.bars.set('s' + i, v[i], s.hot && v[i] > 200 ? 'bad' : 'info', v[i] ? v[i] + 'k' : '0'));
        R.cyc.set({ sub: s.cyc || 'samples 20 keys', tone: s.cycTone || 'info', hl: s.cycTone === 'warn' });
        R.lat.set({ sub: s.lat || 'flat', tone: s.latTone || 'ok' });
        R.note.set(s.note || '');
      },
    },
    bug: [
      { log: 'A job writes 500,000 keys in one burst, each with EX 1800 (illustrative). Every key gets a deadline of now plus 1800 seconds.', callout: 'One burst, one TTL', code: 0,
        state: { v: [0, 0, 0, 0, 0], note: 'All 500k keys were written within about one second.', r: 'written' }, stats: [{ l: 'keys written', v: '500,000', cls: 'warn' }, { l: 'TTL', v: '1800 s' }] },
      { log: 'The deadlines are absolute times, so all of them fall within about the same second, 30 minutes from now.', callout: 'The deadlines pile into one second', code: 1,
        state: { v: [0, 500, 0, 0, 0], note: 'Deadline spread: about 1 s.', r: 't+1800 s' }, stats: [{ l: 'deadline spread', v: 'about 1 s', cls: 'bad' }] },
      { log: 'Thirty minutes later the active cycle samples 20 keys with a TTL and finds nearly all of them expired. When more than 10% of the sample is expired it repeats.', callout: 'The sample finds almost everything expired', moment: true, code: 2,
        state: { v: [0, 500, 0, 0, 0], hot: true, cyc: 'sample: almost all expired', cycTone: 'warn', r: 'cycle starts' }, stats: [{ l: 'expired in sample', v: 'nearly all', cls: 'warn' }] },
      { log: 'The cycle keeps repeating while expired keys stay common, spending its time budget on the executor thread. Other clients wait for the executor.', callout: 'The cycle runs until its time budget ends', code: 3,
        state: { v: [0, 500, 0, 0, 0], hot: true, cyc: 'repeats to its budget', cycTone: 'warn', lat: 'spikes', latTone: 'warn', r: 'executor busy' }, stats: [{ l: 'expire cycle time', v: 'high', cls: 'bad' }, { l: 'p99', v: 'spiky', cls: 'bad' }] },
      { log: 'The fix is jitter. Each TTL gets a random addition, here 0 to 300 seconds, so the deadlines spread over about five minutes.', callout: 'Jitter spreads the deadlines', code: 4,
        state: { v: [100, 100, 100, 100, 100], note: 'Spread over 5 min, the cycle meets about 1,700 expired keys per second.', r: 'with jitter' }, stats: [{ l: 'deadline spread', v: 'about 5 min', cls: 'ok' }, { l: 'expiring per second', v: 'about 1,700', cls: 'ok' }] },
      { log: 'Each cycle now finds few expired keys and stops early. Latency stays flat, and the spike no longer repeats at the TTL interval.', callout: 'Small cycles, flat latency',
        state: { v: [100, 100, 100, 100, 100], cyc: 'stops early', cycTone: 'ok', lat: 'flat', latTone: 'ok', r: 'with jitter' }, stats: [{ l: 'expire cycle time', v: 'small', cls: 'ok' }, { l: 'p99', v: 'flat', cls: 'ok' }],
        takeaway: 'Never give a large batch of keys one shared deadline. Add random jitter to the TTL and the expire cycle stays small.' },
    ],
  };

  /* ---- 2. Lazy expiry only runs on access; the active cycle only samples ---- */
  const FOOT_STALE = 'Simplified: 20 sampled keys per round, percentages illustrative.';
  const sample = Array.from({ length: 20 }, (_, i) => ({ id: 'k' + i, label: String(i + 1) }));
  const EXP_SET = [1, 4, 9, 13, 17];
  const stale = {
    id: 'lazy-active', label: 'Expired, not deleted', desc: 'An expired key is gone for any command that touches it, but a key nobody reads stays in memory until the sampler happens to find it.',
    codeLabel: 'Commands',
    code: { bug: [
      'SET sess:x v EX 1800        # written during the campaign',
      'GET sess:x                  # past deadline: deleted on access, reply nil',
      '# nobody reads sess:y, so the lazy path never runs for it',
      '# active cycle: sample 20 keys with a TTL, delete the expired ones',
      'INFO stats                  # expired_stale_perc: 8.4 (illustrative)',
      'CONFIG SET active-expire-effort 5   # raise in steps, watch CPU',
    ] },
    stage: {
      w: W, h: H, footer: FOOT_STALE,
      header: s => ({ left: 'expires dictionary · keys with a TTL', right: s.r || '' }),
      setup(kit) {
        const strip = kit.strip(null, { x: 40, y: 150, items: sample, w: 24, h: 26, gap: 4 });
        const lz = kit.chip(null, { x: 40, y: 84, w: 250, h: 46, label: 'Lazy path', sub: 'runs on access only', tone: 'info' });
        const ac = kit.chip(null, { x: 330, y: 84, w: 270, h: 46, label: 'Active cycle', sub: 'samples 20 keys', tone: 'info' });
        const mem = kit.chip(null, { x: 40, y: 218, w: 560, h: 46, label: 'used_memory', sub: 'expired keys still held', tone: 'info' });
        const bars = kit.bars(null, { x: 40, y: 300, w: 560, labelW: 150, rowH: 28, max: 25, unit: '%', title: 'Expired share of the sample (stop below 10%)', items: [{ id: 'p', label: 'expired in sample' }] });
        return { strip, lz, ac, mem, bars };
      },
      frame(s, kit, R) {
        const exp = s.exp || [];
        sample.forEach((it, i) => R.strip['k' + i].set({ tone: s.sampled ? (exp.includes(i) ? (s.deleted ? 'delete' : 'warn') : 'ok') : 'info' }));
        R.lz.set({ sub: s.lazy || 'runs on access only', tone: s.lazyTone || 'info' });
        R.ac.set({ sub: s.act || 'samples 20 keys', tone: s.actTone || 'info' });
        R.mem.set({ sub: s.mem || 'expired keys still held', tone: s.memTone || 'info' });
        R.bars.set('p', s.pct || 0, s.pct >= 10 ? 'bad' : (s.pct ? 'warn' : 'info'), s.pct ? s.pct + '%' : '');
      },
    },
    bug: [
      { log: 'The campaign ends. Its sessions were written with EX 1800, and every deadline has passed. Redis stores each deadline in the separate expires dictionary.', callout: 'Deadlines passed, keys still stored', code: 0,
        state: { r: 'campaign over' }, stats: [{ l: 'expired keys', v: '980,000', cls: 'warn' }] },
      { log: 'If a command touches an expired key, expireIfNeeded sees the passed deadline, deletes the key and replies as if it never existed. That is lazy expiry.', callout: 'Lazy path: a read deletes the key', code: 1,
        state: { lazy: 'GET found it expired, deleted', lazyTone: 'ok', r: 'on access' }, stats: [{ l: 'GET sess:x', v: 'nil', cls: 'ok' }] },
      { log: 'But nobody reads these sessions any more, so the lazy path never runs for them. They keep using memory.', callout: 'No access: the lazy path never runs', moment: true, code: 2,
        state: { lazy: 'no access, never runs', lazyTone: 'warn', mem: 'expired keys still held', memTone: 'warn', r: 'no reads' }, stats: [{ l: 'reads of expired keys', v: '0', cls: 'warn' }] },
      { log: 'The active cycle picks 20 keys that have a TTL at random. Five of them are expired, a quarter of the sample, so it deletes them and samples again.', callout: 'The cycle samples 20 random keys', code: 3,
        state: { lazy: 'no access, never runs', lazyTone: 'warn', act: 'samples 20, deletes expired', actTone: 'live', sampled: true, exp: EXP_SET, deleted: true, pct: 25, mem: 'expired keys still held', memTone: 'warn', r: 'sample' }, stats: [{ l: 'expired in sample', v: '5 of 20', cls: 'warn' }] },
      { log: 'The cycle stops repeating once the expired share of a sample falls below about 10%. Expired keys that were not sampled stay in memory.', callout: 'It stops below about 10% stale', code: 4,
        state: { lazy: 'no access, never runs', lazyTone: 'warn', act: 'stops below 10%', actTone: 'warn', sampled: true, exp: [4, 13], deleted: false, pct: 8.4, mem: 'about 8% of keys expired but held', memTone: 'warn', r: 'stop' }, stats: [{ l: 'expired_stale_perc', v: '8.4', cls: 'warn' }, { l: 'used_memory', v: 'high', cls: 'bad' }] },
      { log: 'Raise active-expire-effort in steps (it goes from 1, the default, to 10). Each cycle then does more work and stops at a lower stale share, at the cost of CPU. Measure before raising.', callout: 'More effort: less stale memory, more CPU', code: 5,
        state: { lazy: 'unchanged', lazyTone: 'info', act: 'effort 5: stops lower', actTone: 'ok', sampled: true, exp: [], pct: 2, mem: 'expired memory falls', memTone: 'ok', r: 'effort 5' }, stats: [{ l: 'active-expire-effort', v: '5', cls: 'ok' }, { l: 'CPU per cycle', v: 'higher', cls: 'warn' }],
        takeaway: 'Expiry is probabilistic: touched keys go at once, untouched keys are sampled. Do not expect memory to drop at the exact TTL.' },
    ],
  };

  /* ---- 3. A replica does not expire keys on its own ---- */
  const FOOT_REP = 'Simplified: one primary, one replica, one expired key.';
  const rep = {
    id: 'replica-del', label: 'Replica waits for DEL', desc: 'The primary decides when a key expires and tells its replicas with a DEL. A replica applies the DEL, so every copy removes the key at the same point in the stream.',
    codeLabel: 'Commands',
    code: { bug: [
      'SET sess:x v EX 1800            # on the primary, replicated with its deadline',
      '# the deadline passes',
      '# primary: lazy access or the active cycle finds sess:x expired',
      '# primary: deletes it and sends DEL sess:x to its replicas',
      '# replica: applies DEL sess:x',
    ] },
    scene: { w: W, h: H, footer: FOOT_REP, panels: [
      { id: 'pri', x: 16, y: 58, w: 290, h: 290, title: 'Primary', tone: 'info' },
      { id: 'rep', x: 334, y: 58, w: 290, h: 290, title: 'Replica', tone: 'info' },
    ], tokens: {
      kp: { label: 'sess:x', sub: 'EX 1800', tone: 'info', w: 130 },
      kpe: { label: 'sess:x', sub: 'deadline passed', tone: 'warn', w: 130 },
      kpd: { label: 'sess:x', sub: 'deleted', tone: 'delete', w: 130 },
      kr: { label: 'sess:x', sub: 'copy', tone: 'info', w: 130 },
      kre: { label: 'sess:x', sub: 'deadline passed', tone: 'warn', w: 130 },
      krd: { label: 'sess:x', sub: 'deleted by DEL', tone: 'delete', w: 130 },
      find: { label: 'expire found', sub: 'lazy or active', tone: 'cursor', w: 130 },
      del: { label: 'DEL sess:x', sub: 'in the stream', tone: 'ok', w: 130 },
    } },
    bug: [
      { log: 'The primary stores sess:x with a deadline, and the replica holds a copy of the same key.', callout: 'Both nodes hold the key', code: 0,
        at: { kp: { x: 40, y: 120 }, kr: { x: 360, y: 120 } }, stats: [{ l: 'nodes holding sess:x', v: '2' }] },
      { log: 'The deadline passes. The replica does not delete the key on its own, because only the primary decides when a key expires.', callout: 'The replica does not expire keys itself', moment: true, code: 1,
        at: { kpe: { x: 40, y: 120 }, kre: { x: 360, y: 120 } }, badge: { rep: 'waits' }, stats: [{ l: 'nodes holding sess:x', v: '2', cls: 'warn' }] },
      { log: 'The primary finds the key expired, either when a command touches it or when the active cycle samples it.', callout: 'The primary finds it expired', code: 2,
        at: { kpe: { x: 40, y: 120 }, find: { x: 40, y: 200 }, kre: { x: 360, y: 120 } }, arrows: [['find', 'kpe', 'check']], badge: { rep: 'waits' }, stats: [{ l: 'decider', v: 'primary', cls: 'ok' }] },
      { log: 'The primary deletes the key and writes DEL sess:x into the replication stream, so all copies see the removal at the same point in the stream.', callout: 'The primary sends DEL to the replicas', code: 3,
        at: { kpd: { x: 40, y: 120 }, del: { x: 195, y: 220 }, kre: { x: 360, y: 120 } }, arrows: [['del', 'kre', 'DEL']], badge: { rep: 'DEL arrives' }, stats: [{ l: 'primary copy', v: 'deleted', cls: 'ok' }] },
      { log: 'The replica applies the DEL and removes its copy. Because expiry flows through the stream, replicas never disagree with the primary about when a key went.', callout: 'The replica applies the DEL', code: 4,
        at: { kpd: { x: 40, y: 120 }, krd: { x: 360, y: 120 } }, badge: { rep: 'in sync' }, stats: [{ l: 'nodes holding sess:x', v: '0', cls: 'ok' }],
        takeaway: 'Expiry is decided on the primary and replicated as DEL. A replica never expires keys by itself.' },
    ],
  };

  window.CHAPTER_OVERRIDES[3] = {
    explain: `<h3>1. A deadline, not a timer</h3>
<p><code>EXPIRE</code>, <code>SET ... EX</code> and <code>PEXPIREAT</code> store an absolute unix time in a separate <code>expires</code> dictionary. Redis starts no timer per key and does not scan all keys to find the expired ones, because that would block the single executor. Checking a deadline is one cheap lookup. Removing the key is a separate decision, made in two ways.</p>

<h3>2. Lazy expiry: when a key is touched</h3>
<p>Every access to a key calls <code>expireIfNeeded</code>. If the deadline has passed, Redis deletes the key and treats it as missing. So a client never reads an expired value. The weakness is that it only runs for keys somebody asks about. A key that nobody touches again is never found this way.</p>

<h3>3. The active cycle: a small random sample</h3>
<p>The active cycle (<code>expire.c</code>) runs about 10 times per second. Each round it samples 20 keys that have a TTL and deletes the expired ones. If more than 10% of the sample was expired, it samples again, within a time budget so that it never holds the thread for long. <code>active-expire-effort</code> (1 to 10, default 1) makes each cycle do more work and tolerate a lower share of stale keys. The cycle runs on the executor thread, so its cost is paid by every client.</p>

<h3>4. Replicas follow the primary</h3>
<p>A replica does not expire keys on its own. The primary decides, through lazy access or its active cycle, deletes the key and sends a <code>DEL</code> in the replication stream. Replicas apply that DEL, so every copy removes the key at the same point in the stream.</p>

<h3>5. The trade-off: bounded work, probabilistic cleanup</h3>
<p>Sampling keeps the work small and bounded, but it is probabilistic. Keys that nobody reads can stay in memory for a while, so <code>used_memory</code> will not drop at the exact TTL. If many keys share one deadline, a sample finds mostly expired keys, the cycle repeats until its budget ends, and clients see a latency spike at the same interval as the TTL.</p>
<p>Two habits follow. Spread the TTLs with random jitter when you write a large batch. And when memory stays high after a burst, read <code>expired_stale_perc</code> in <code>INFO stats</code> and the <code>expire-cycle</code> entry in <code>LATENCY LATEST</code> before changing anything. Raise <code>active-expire-effort</code> only after you have measured the CPU headroom, in steps.</p>

<h3>6. Syntax</h3>
<pre>SET sess:x v EX 1800                 # TTL in seconds
SET sess:y v EX $((1800 + RANDOM % 300))   # with jitter, in a shell
TTL sess:x                           # seconds left, -1 no TTL, -2 no key
PERSIST sess:x                       # remove the TTL

INFO stats                           # expired_keys, expired_stale_perc
LATENCY LATEST                       # expire-cycle events
CONFIG SET active-expire-effort 5    # 1 to 10, default 1</pre>
<p>Writing a key again with <code>SET</code> clears its TTL unless you pass <code>EX</code> again or use <code>KEEPTTL</code>.</p>`,
    scenarios: [sync, stale, rep],
  };
})();
