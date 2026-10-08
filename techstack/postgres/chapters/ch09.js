/* Chapter 9 "Checkpoints": three bespoke scenes plus the Explain text (index 9, zero-based).
   Loads after course.js and scene-kit.js. WAL rates, buffer counts and timings are illustrative; the mechanisms are PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: rates, counts and timings are illustrative. The mechanisms are real.';

  /* ---------- 1. A checkpoint moves the redo point ---------- */
  const NS = 12;
  const cp = {
    id: 'redo-point', label: 'A checkpoint moves the redo point', desc: 'A checkpoint flushes every dirty buffer and records a redo point. Older WAL is no longer needed, and a crash replays only what follows.',
    codeLabel: 'Server log', code: { bug: ['LOG:  checkpoint starting: time', 'LOG:  checkpoint complete: wrote 412300 buffers; write=270.1 s, sync=0.8 s', '-- redo point is now at segment 7', '-- WAL older than segment 7 can be recycled', '-- crash: recovery starts at segment 7'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'pg_wal segments and one checkpoint', right: s.r || '' }),
      setup(kit) {
        const seg = Object.values(kit.strip(null, { x: 16, y: 80, items: Array.from({ length: NS }, (_, i) => ({ id: 's' + i, label: String(i + 1) })), w: 44, h: 38, gap: 6, tone: 'info' }));
        const red = kit.chip(null, { x: 16, y: 134, w: 300, h: 44, label: 'redo point', sub: '', tone: 'info' });
        const dirty = kit.bars(null, { x: 344, y: 152, w: 280, labelW: 70, max: 100, items: [{ id: 'd', label: 'dirty' }], title: 'Dirty buffers (illustrative)' });
        const bars = kit.bars(null, { x: 16, y: 232, w: 400, labelW: 130, max: 12, items: [{ id: 'need', label: 'WAL for recovery' }], title: 'If the server crashed now' });
        const res = kit.chip(null, { x: 16, y: 286, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { seg, red, dirty, bars, res };
      },
      frame(s, kit, R) {
        const rp = s.rp == null ? 0 : s.rp, cur = s.cur == null ? 7 : s.cur;
        R.seg.forEach((c, i) => c.set({ tone: i === cur && !s.noCur ? 'cursor' : i < rp ? 'dim' : i <= cur ? 'warn' : 'info' }));
        R.red.set({ sub: s.rd || 'segment 1', tone: s.rT || 'info' });
        R.dirty.set('d', s.dirty == null ? 60 : s.dirty, s.dirty > 40 ? 'warn' : 'ok', (s.dirty == null ? 60 : s.dirty) + '%');
        const need = cur + 1 - rp;
        R.bars.set('need', need, need > 6 ? 'warn' : 'ok', need + ' seg');
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'WAL has grown to segment 8 since the last checkpoint at segment 1. Many buffers are dirty. A crash now would replay eight segments of log.', callout: 'The last redo point is far back', state: { rp: 0, cur: 7, r: 'before' }, stats: [{ l: 'WAL since the redo point', v: '8 segments', cls: 'warn' }, { l: 'dirty buffers', v: '60%' }] },
      { log: 'The timer or the WAL size starts a checkpoint. It notes the current WAL position, segment 8, as the new redo point. Everything before it must reach the data files.', callout: 'Start: note the new redo point', code: 0, state: { rp: 0, cur: 7, rd: 'segment 8 (pending)', rT: 'cursor', r: 'start' }, stats: [{ l: 'new redo point', v: 'segment 8', cls: 'warn' }] },
      { log: 'The checkpointer writes the dirty buffers to the data files, spread over the interval, and the dirty share falls while new writes keep arriving.', callout: 'Write the dirty buffers, spread out', code: 1, state: { rp: 0, cur: 8, dirty: 25, rd: 'segment 8 (pending)', rT: 'cursor', r: 'writing' }, stats: [{ l: 'dirty buffers', v: '25%', cls: 'ok' }] },
      { log: 'After a final fsync, every change before segment 8 is in the data files. The checkpoint record is written, and the redo point moves to segment 8.', callout: 'fsync done: the redo point moves', moment: true, code: 2, state: { rp: 7, cur: 8, dirty: 20, rd: 'segment 8 · done', rT: 'ok', r: 'complete' }, stats: [{ l: 'redo point', v: 'segment 8', cls: 'ok' }] },
      { log: 'Segments 1 to 7 are older than the redo point. If no replication slot or archive needs them, they are recycled or removed.', callout: 'Older WAL can be recycled', code: 3, state: { rp: 7, cur: 8, noCur: false, dirty: 20, rd: 'segment 8 · done', rT: 'ok', r: 'recycled' }, stats: [{ l: 'recyclable', v: '7 segments', cls: 'ok' }] },
      { log: 'If the server crashed now, recovery would start at segment 8 and replay about two segments. The shorter the interval, the less there is to replay.', callout: 'A crash now replays two segments', code: 4, state: { rp: 7, cur: 8, dirty: 20, rd: 'segment 8 · done', rT: 'ok', res: 'recovery = replay from segment 8, a few seconds (illustrative)', resTone: 'ok', r: 'crash test' }, stats: [{ l: 'WAL to replay', v: '2 segments', cls: 'ok' }],
        takeaway: 'The checkpoint interval sets how much WAL a crash must replay.' },
    ],
  };

  /* ---------- 2. The size trigger fires over and over ---------- */
  const size = {
    id: 'size-trigger', label: 'Size trigger every 24 s', desc: 'A small max_wal_size makes the size trigger fire again and again. Each checkpoint restarts full-page images, so WAL volume and I/O keep rising.',
    codeLabel: 'postgresql.conf', code: { bug: ['# 20 MB/s of WAL (illustrative)', 'max_wal_size = 1GB          # fires after about 24 s of WAL', 'checkpoint_timeout = 5min', 'LOG:  checkpoints are occurring too frequently (24 seconds apart)', '# fix', 'max_wal_size = 16GB         # now the 5 min timer fires first'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: s.hd || 'max_wal_size = 1 GB', right: s.r || '' }),
      setup(kit) {
        const t1 = kit.chip(null, { x: 16, y: 78, w: 190, h: 46, label: 'WAL rate', sub: '20 MB/s', tone: 'info' });
        const t2 = kit.chip(null, { x: 224, y: 78, w: 190, h: 46, label: 'max_wal_size', sub: '', tone: 'info' });
        const t3 = kit.chip(null, { x: 432, y: 78, w: 192, h: 46, label: 'checkpoint_timeout', sub: '5 min', tone: 'info' });
        const bars = kit.bars(null, { x: 16, y: 156, w: 420, labelW: 150, max: 100, items: [{ id: 'gap', label: 'seconds apart' }, { id: 'cph', label: 'checkpoints / hour' }, { id: 'fpi', label: 'full-page images' }, { id: 'lat', label: 'commit latency' }], title: 'Per hour (illustrative)' });
        const trg = kit.chip(null, { x: 456, y: 174, w: 168, h: 56, label: 'Trigger', sub: '', tone: 'info' });
        const res = kit.chip(null, { x: 16, y: 292, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { t2, bars, trg, res };
      },
      frame(s, kit, R) {
        R.t2.set({ sub: s.mws || '1 GB', tone: s.mT || 'info' });
        const b = s.b || {};
        R.bars.set('gap', b.gap || 0, b.gap < 40 ? 'bad' : 'ok', b.gapL || '0'); R.bars.set('cph', b.cph || 0, b.cph > 60 ? 'bad' : 'ok', b.cphL || '0');
        R.bars.set('fpi', b.fpi || 0, b.fpi > 60 ? 'warn' : 'ok', b.fpiL || '0'); R.bars.set('lat', b.lat || 0, b.lat > 60 ? 'bad' : 'ok', b.latL || '0');
        R.trg.set({ sub: s.trg || '', tone: s.tT || 'info', show: !!s.trg });
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'WAL arrives at about 20 MB/s. With max_wal_size = 1 GB, the log reaches the size limit after about 24 seconds, far sooner than the 5 minute timer.', callout: 'The size limit comes long before the timer', code: 1, state: { mws: '1 GB', mT: 'warn', b: { gap: 8, gapL: '24 s' }, trg: 'size, not time', tT: 'warn', r: 'size trigger' }, stats: [{ l: 'trigger', v: 'size', cls: 'warn' }, { l: 'every', v: '~24 s', cls: 'bad' }] },
      { log: 'So a checkpoint starts on size every 24 seconds or so, about 150 per hour, instead of 12 timed ones. The log warns: checkpoints are occurring too frequently.', callout: 'About 150 checkpoints an hour', moment: true, code: 3, state: { mws: '1 GB', mT: 'warn', b: { gap: 8, gapL: '24 s', cph: 100, cphL: '~150' }, trg: 'size, not time', tT: 'warn', r: 'too frequent' }, stats: [{ l: 'checkpoints / hour', v: '~150', cls: 'bad' }] },
      { log: 'After each checkpoint, the first change to every page logs a full-page image again. More checkpoints mean more full-page images, and the WAL grows faster than the data changes.', callout: 'Each checkpoint restarts full-page images', code: 3, state: { mws: '1 GB', mT: 'warn', b: { gap: 8, gapL: '24 s', cph: 100, cphL: '~150', fpi: 90, fpiL: 'high' }, trg: 'size, not time', tT: 'warn', r: 'more WAL' }, stats: [{ l: 'full-page images', v: 'many', cls: 'warn' }] },
      { log: 'The disk is busy flushing again and again, so commits that need the disk wait behind the flushes. Commit latency doubles for about a minute at each burst.', callout: 'The disk is always flushing: latency doubles', code: 3, state: { mws: '1 GB', mT: 'warn', b: { gap: 8, gapL: '24 s', cph: 100, cphL: '~150', fpi: 90, fpiL: 'high', lat: 90, latL: '2x' }, trg: 'size, not time', tT: 'warn', res: 'commit latency doubles at every burst (illustrative)', resTone: 'bad', r: 'latency' }, stats: [{ l: 'commit latency', v: '2x', cls: 'bad' }] },
      { log: 'The fix is to give the timer room to fire first. max_wal_size = 16 GB covers well over a 5 minute interval at 20 MB/s, which is about 6 GB.', callout: 'Fix: max_wal_size = 16 GB', code: 5, state: { mws: '16 GB', mT: 'ok', b: { gap: 100, gapL: '5 min', cph: 8, cphL: '12', fpi: 15, fpiL: 'low', lat: 15, latL: 'flat' }, trg: 'timer (timed)', tT: 'ok', res: 'timed checkpoints, flat latency · more pg_wal disk, longer recovery', resTone: 'ok', r: 'fixed' }, stats: [{ l: 'checkpoints / hour', v: '12', cls: 'ok' }, { l: 'trade-off', v: 'longer recovery', cls: 'warn' }],
        takeaway: 'A longer interval means fewer checkpoints and less WAL, at the price of a longer recovery.' },
    ],
  };

  /* ---------- 3. Burst versus spread ---------- */
  const SL = 10;
  const spread = {
    id: 'io-spike', label: 'Flush burst vs spread', desc: 'A low checkpoint_completion_target squeezes the dirty-page writes into the start of the interval. The disk saturates, and commits queue behind fsync.',
    codeLabel: 'postgresql.conf', code: { bug: ['checkpoint_completion_target = 0.1   # all writes in the first 10% of the interval', 'LOG:  checkpoint complete: wrote 412300 buffers; write=30.2 s', '# fix (the default since PostgreSQL 14)', 'checkpoint_completion_target = 0.9   # spread over 90% of the interval'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'one 5 minute interval, 10 slices', right: s.r || '' }),
      setup(kit) {
        const sl = Object.values(kit.strip(null, { x: 16, y: 84, items: Array.from({ length: SL }, (_, i) => ({ id: 'q' + i, label: 't' + (i + 1) })), w: 54, h: 54, gap: 6, tone: 'info' }));
        const bars = kit.bars(null, { x: 16, y: 176, w: 420, labelW: 140, max: 100, items: [{ id: 'disk', label: 'disk busy (peak)' }, { id: 'lat', label: 'commit latency' }], title: 'During the interval (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 252, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { sl, bars, res };
      },
      frame(s, kit, R) {
        const w = s.w || [];
        R.sl.forEach((c, i) => c.set({ sub: w[i] ? w[i] + '' : '', tone: !w[i] ? 'info' : w[i] > 50 ? 'warn' : 'live', label: 't' + (i + 1) }));
        R.bars.set('disk', s.disk || 0, s.disk > 80 ? 'bad' : 'ok', s.diskL || '0'); R.bars.set('lat', s.lat || 0, s.lat > 60 ? 'bad' : 'ok', s.latL || '0');
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'A checkpoint has about 412,300 dirty buffers to write, around 3 GB (illustrative). The interval is split into ten slices. The number in a slice is its share of the writes.', callout: '3 GB of dirty buffers to write', code: 0, state: { r: 'start' }, stats: [{ l: 'dirty buffers', v: '412,300' }] },
      { log: 'With a completion target of 0.1, the checkpointer finishes all its writes in the first 10% of the interval. The first slice gets everything.', callout: 'Target 0.1: everything in the first slice', moment: true, code: 0, state: { w: [100], disk: 100, diskL: '100%', r: 'target 0.1' }, stats: [{ l: 'write time', v: '~30 s', cls: 'bad' }] },
      { log: 'The disk saturates. The fsync calls stall, and foreground commits that need the disk wait behind the flush. Commit latency spikes for about a minute.', callout: 'The disk saturates, commits wait', code: 1, state: { w: [100], disk: 100, diskL: '100%', lat: 90, latL: 'spike', res: 'latency doubles for about a minute each interval (illustrative)', resTone: 'bad', r: 'spike' }, stats: [{ l: 'commit latency', v: 'doubles', cls: 'bad' }] },
      { log: 'With a completion target of 0.9, the same writes are spread over 90% of the interval, about a ninth of the load in each slice.', callout: 'Target 0.9: spread over the interval', code: 3, state: { w: [11, 11, 11, 11, 11, 11, 11, 11, 11], disk: 25, diskL: '25%', lat: 15, latL: 'flat', r: 'target 0.9' }, stats: [{ l: 'write load', v: '~11% per slice', cls: 'ok' }] },
      { log: 'The disk has room for foreground work all the time. Commit latency stays flat, and the total work is the same.', callout: 'Same work, no spike', code: 3, state: { w: [11, 11, 11, 11, 11, 11, 11, 11, 11], disk: 25, diskL: '25%', lat: 15, latL: 'flat', res: 'checkpoint_completion_target = 0.9 (default since 14)', resTone: 'ok', r: 'fixed' }, stats: [{ l: 'commit latency', v: 'flat', cls: 'ok' }],
        takeaway: 'Spreading the flush does not remove the work. It stops it from landing all at once.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[9] = { explain: `
<h3>1. A checkpoint is a known good point</h3>
<p>Crash recovery replays WAL from a known good point. Without checkpoints it would have to replay the log from the beginning. A <b>checkpoint</b> flushes every dirty buffer to disk and records a <b>redo point</b> in WAL. Recovery starts there, so the checkpoint interval sets how much work a crash can cost.</p>
<figure class="hd" aria-label="Flowchart: one checkpoint">
  <div class="hd-flow"><div class="hd-node">Trigger: checkpoint_timeout or max_wal_size</div><div class="hd-down">↓</div><div class="hd-node">Note the redo point in WAL</div><div class="hd-down">↓</div><div class="hd-node warn">Write dirty buffers, spread by completion_target</div><div class="hd-down">↓</div><div class="hd-node">fsync the data files</div><div class="hd-down">↓</div><div class="hd-node ok">The redo point moves, old WAL can be recycled</div></div>
  <figcaption>Recovery starts at the redo point, so the interval sets recovery time.</figcaption>
</figure>

<h3>2. What starts one</h3>
<p>A checkpoint starts when either <code>checkpoint_timeout</code> (default 5 min) passes or WAL growth approaches <code>max_wal_size</code>, whichever comes first. A checkpoint started by the timer is called <i>timed</i>, and one started by size is called <i>requested</i>. Many requested checkpoints in <code>pg_stat_checkpointer</code> (PostgreSQL 17) or <code>pg_stat_bgwriter</code> (PostgreSQL 16) mean that <code>max_wal_size</code> is too small for the write rate.</p>

<h3>3. How the flush is paced</h3>
<p>The checkpointer writes every dirty buffer and calls fsync. <code>checkpoint_completion_target</code> spreads those writes over that fraction of the interval (default 0.9), so the disk does not see one large burst. When the flush is done, the redo point moves forward. WAL segments older than the redo point, and not needed by replication slots or archiving, can be removed or reused.</p>

<h3>4. Full-page images come back</h3>
<p>After each checkpoint, the first change to every page writes a full-page image to WAL again (chapter 6). Shorter intervals therefore mean more WAL and more total writes. That is the answer to the question in the problem: halving <code>checkpoint_timeout</code> makes recovery faster and the WAL volume larger.</p>

<h3>5. The trade-off</h3>
<p>Short intervals keep recovery fast but write more WAL and flush more often. Long intervals save write work and smooth the load, but a crash must replay more WAL. A large <code>max_wal_size</code> lets PostgreSQL wait longer, so it also raises recovery time and the disk space needed by <code>pg_wal</code>. Set both from a recovery-time target, and then check that the disk can absorb the flushes. A replication slot or a failing archive command can also keep <code>pg_wal</code> growing past <code>max_wal_size</code>, because those segments are not yet safe to remove.</p>

<h3>6. Syntax</h3>
<pre>-- timed versus requested checkpoints (PostgreSQL 17)
SELECT num_timed, num_requested, write_time, sync_time FROM pg_stat_checkpointer;
-- PostgreSQL 16
SELECT checkpoints_timed, checkpoints_req, checkpoint_write_time, checkpoint_sync_time FROM pg_stat_bgwriter;

-- postgresql.conf
-- checkpoint_timeout = 15min
-- max_wal_size = 16GB
-- checkpoint_completion_target = 0.9
-- log_checkpoints = on        # on by default from PostgreSQL 15

-- how much WAL is there, and who is holding it?
SELECT pg_size_pretty(sum(size)) FROM pg_ls_waldir();
SELECT slot_name, active, restart_lsn FROM pg_replication_slots;

-- force one now, for a test
CHECKPOINT;</pre>
<p>Size both settings from a recovery-time objective: staged crash tests show the real recovery time for your WAL rate.</p>`, scenarios: [cp, size, spread] };
})();
