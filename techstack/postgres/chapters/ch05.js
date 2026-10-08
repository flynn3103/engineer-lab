/* Chapter 5 "WAL and Crash Recovery": four bespoke scenes plus the Explain text (index 5, zero-based).
   Loads after course.js and scene-kit.js. LSNs, sizes and delays are illustrative; the mechanisms are PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: LSNs, sizes and delays are illustrative. The order of events is real.';
  const REC1 = ['LSN 100', 'UPDATE order 7 → paid', 'RAM'];

  /* ---------- 1 and 2. COMMIT with the flush (on) and without (off) ---------- */
  function commitStage() {
    return {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: s.hd || 'one UPDATE and one COMMIT', right: s.r || '' }),
      setup(kit) {
        const client = kit.chip(null, { x: 16, y: 78, w: 120, h: 50, label: 'Client', sub: '', tone: 'info' });
        const buf = kit.chip(null, { x: 160, y: 78, w: 140, h: 50, label: 'WAL buffers', sub: 'RAM', tone: 'info' });
        const wal = kit.chip(null, { x: 324, y: 78, w: 140, h: 50, label: 'pg_wal', sub: 'disk', tone: 'info' });
        const page = kit.chip(null, { x: 488, y: 78, w: 136, h: 50, label: 'Data page', sub: 'in shared_buffers', tone: 'info' });
        const led = kit.ledger(null, { x: 16, y: 150, w: 608, title: 'WAL records', cols: [{ label: 'LSN', w: 80 }, { label: 'record', w: 280 }, { label: 'where it is', w: 190 }], rows: 2, rowH: 18 });
        const res = kit.chip(null, { x: 16, y: 280, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { client, buf, wal, page, led, res };
      },
      frame(s, kit, R) {
        R.client.set({ sub: s.client || '', tone: s.cT || 'info' });
        R.buf.set({ sub: s.crash ? 'lost' : 'RAM', tone: s.crash ? 'delete' : s.bT || 'info' });
        R.wal.set({ tone: s.wT || 'info' });
        R.page.set({ sub: s.pg || 'in shared_buffers', tone: s.crash ? 'delete' : s.pT || 'info' });
        R.led.clear(); (s.recs || []).forEach((r, i) => R.led.setRow(i, r, { hl: s.hl === i, tones: [null, null, r[2].startsWith('lost') ? 'bad' : r[2].startsWith('disk') ? 'ok' : 'warn'] }));
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    };
  }
  const CODE = ['BEGIN;', 'UPDATE orders SET status = \'paid\' WHERE id = 7;', 'COMMIT;', '-- SHOW synchronous_commit;'];
  const syncOn = {
    id: 'sync-on', label: 'COMMIT with flush (on)', desc: 'With synchronous_commit on, COMMIT waits for the WAL flush. After the OK, a crash cannot lose the order.',
    codeLabel: 'SQL', code: { bug: ['-- synchronous_commit = on (default)', ...CODE] },
    stage: commitStage(),
    bug: [
      { log: 'The payment service sends an UPDATE inside a transaction. PostgreSQL changes the page in shared_buffers and appends a WAL record to the WAL buffers, both in RAM.', callout: 'The change goes to the log first', code: 2, state: { hd: 'synchronous_commit = on', pT: 'warn', pg: 'dirty, in RAM', recs: [REC1], bT: 'cursor', client: 'sent UPDATE', r: 'UPDATE' }, stats: [{ l: 'records in RAM', v: '1', cls: 'warn' }, { l: 'data page', v: 'dirty' }] },
      { log: 'The service sends COMMIT. A commit record is appended to the WAL buffers, and the backend must now wait.', callout: 'COMMIT appends a commit record, then waits', code: 3, state: { hd: 'synchronous_commit = on', pT: 'warn', pg: 'dirty, in RAM', recs: [REC1, ['LSN 140', 'COMMIT txid 205', 'RAM']], bT: 'cursor', client: 'waiting', cT: 'cursor', r: 'COMMIT' }, stats: [{ l: 'client', v: 'waiting', cls: 'warn' }] },
      { log: 'The WAL writer flushes the buffers to pg_wal with fsync, up to the commit record at LSN 140. Only then is the commit durable.', callout: 'fsync: WAL up to LSN 140 reaches the disk', moment: true, code: 3, state: { hd: 'synchronous_commit = on', pT: 'warn', pg: 'dirty, in RAM', recs: [['LSN 100', 'UPDATE order 7 → paid', 'disk'], ['LSN 140', 'COMMIT txid 205', 'disk']], wT: 'ok', client: 'waiting', cT: 'cursor', r: 'fsync' }, stats: [{ l: 'records on disk', v: '2', cls: 'ok' }, { l: 'flushed up to', v: 'LSN 140', cls: 'ok' }] },
      { log: 'Now the backend returns OK. The data page is still dirty in RAM and has not been written, and it does not need to be.', callout: 'The OK comes after the flush', code: 3, state: { hd: 'synchronous_commit = on', pT: 'warn', pg: 'dirty, in RAM', recs: [['LSN 100', 'UPDATE order 7 → paid', 'disk'], ['LSN 140', 'COMMIT txid 205', 'disk']], wT: 'ok', client: 'got OK', cT: 'ok', r: 'OK' }, stats: [{ l: 'client', v: 'OK', cls: 'ok' }, { l: 'data page on disk', v: 'no' }] },
      { log: 'The power fails. The dirty page and the WAL buffers are lost. The WAL on disk still holds both records.', callout: 'Power loss: RAM is gone, pg_wal is not', moment: true, code: 3, state: { hd: 'synchronous_commit = on', crash: true, recs: [['LSN 100', 'UPDATE order 7 → paid', 'disk'], ['LSN 140', 'COMMIT txid 205', 'disk']], wT: 'ok', client: 'got OK', cT: 'ok', pg: 'lost', r: 'crash' }, stats: [{ l: 'RAM', v: 'lost', cls: 'bad' }, { l: 'pg_wal', v: 'intact', cls: 'ok' }] },
      { log: 'On restart, redo replays the WAL and rebuilds the page. The order is paid, exactly as the customer was told.', callout: 'Redo replays the log: the order is paid', code: 3, state: { hd: 'synchronous_commit = on', recs: [['LSN 100', 'UPDATE order 7 → paid', 'disk · replayed'], ['LSN 140', 'COMMIT txid 205', 'disk · replayed']], wT: 'ok', pT: 'ok', pg: 'rebuilt by redo', client: 'got OK', cT: 'ok', res: 'order 7 = paid after restart', resTone: 'ok', r: 'recovered' }, stats: [{ l: 'order 7', v: 'paid', cls: 'ok' }, { l: 'lost commits', v: '0', cls: 'ok' }],
        takeaway: 'A commit is durable once its WAL is on disk, even if the data page never was.' },
    ],
  };
  const syncOff = {
    id: 'sync-off', label: 'COMMIT without flush (off)', desc: 'With synchronous_commit off, COMMIT returns before the flush. A crash in the window loses a commit the customer was told succeeded.',
    codeLabel: 'SQL', code: { bug: ['-- synchronous_commit = off', ...CODE] },
    stage: commitStage(),
    bug: [
      { log: 'The same UPDATE runs. Its WAL record is in the WAL buffers in RAM, and the page is dirty in RAM.', callout: 'Same UPDATE: the record is in RAM', code: 2, state: { hd: 'synchronous_commit = off', pT: 'warn', pg: 'dirty, in RAM', recs: [REC1], bT: 'cursor', client: 'sent UPDATE', r: 'UPDATE' }, stats: [{ l: 'records in RAM', v: '1', cls: 'warn' }] },
      { log: 'COMMIT appends its record and returns at once. It does not wait for the flush. This is the speed the team wanted.', callout: 'COMMIT returns before the flush', moment: true, code: 3, state: { hd: 'synchronous_commit = off', pT: 'warn', pg: 'dirty, in RAM', recs: [REC1, ['LSN 140', 'COMMIT txid 205', 'RAM']], bT: 'warn', client: 'got OK', cT: 'ok', r: 'OK, no flush' }, stats: [{ l: 'client', v: 'OK', cls: 'ok' }, { l: 'flushed', v: 'no', cls: 'bad' }] },
      { log: 'The customer is told the payment succeeded. The commit record is still only in the WAL buffers. The WAL writer will flush it soon, within about three times wal_writer_delay (200 ms by default).', callout: 'The OK was sent; the log is not on disk', code: 3, state: { hd: 'synchronous_commit = off', pT: 'warn', pg: 'dirty, in RAM', recs: [REC1, ['LSN 140', 'COMMIT txid 205', 'RAM']], bT: 'warn', client: 'got OK', cT: 'ok', r: 'in the window' }, stats: [{ l: 'window', v: 'up to ~600 ms', cls: 'warn' }] },
      { log: 'The power fails inside that window. The WAL buffers are gone, and the commit record never reached pg_wal.', callout: 'Power loss before the flush', moment: true, code: 3, state: { hd: 'synchronous_commit = off', crash: true, recs: [['LSN 100', 'UPDATE order 7 → paid', 'lost (RAM)'], ['LSN 140', 'COMMIT txid 205', 'lost (RAM)']], client: 'got OK', cT: 'ok', pg: 'lost', r: 'crash' }, stats: [{ l: 'records on disk', v: '0', cls: 'bad' }] },
      { log: 'Redo replays only what reached disk, which has no record of this transaction. The database is consistent, but order 7 is still pending.', callout: 'The database is consistent, the order is gone', code: 3, state: { hd: 'synchronous_commit = off', recs: [['LSN 100', 'UPDATE order 7 → paid', 'lost (RAM)'], ['LSN 140', 'COMMIT txid 205', 'lost (RAM)']], pT: 'info', pg: 'order 7 = pending', client: 'got OK', cT: 'warn', res: 'customer was told paid · database says pending', resTone: 'bad', r: 'recovered' }, stats: [{ l: 'order 7', v: 'pending', cls: 'bad' }, { l: 'corruption', v: 'none', cls: 'ok' }] },
      { log: 'Keep the default on, and use SET LOCAL synchronous_commit = off only inside transactions that can lose their last moments, such as logging.', callout: 'Use off only where losing a commit is fine', code: 3, state: { hd: 'synchronous_commit = on', recs: [], client: '', res: 'SET LOCAL synchronous_commit = off  -- only for logging-style writes', resTone: 'ok', r: 'mitigation' }, stats: [{ l: 'default', v: 'on', cls: 'ok' }],
        takeaway: 'Asynchronous commit loses recent commits but never corrupts the database.' },
    ],
  };

  /* ---------- 3. Redo after a crash ---------- */
  const RR = [
    ['200', 'UPDATE page 12', '180', 'apply'],
    ['240', 'INSERT page 31', '260', 'skip: page is newer'],
    ['280', 'UPDATE page 12', '200', 'apply'],
    ['320', 'COMMIT txid 205', '-', 'mark committed'],
  ];
  const redo = {
    id: 'redo', label: 'Redo after a crash', desc: 'After a crash, redo starts at the last checkpoint and replays each record unless the data page already has it.',
    codeLabel: 'Server log', code: { bug: ['LOG:  database system was interrupted; last known up at 14:02:11', 'LOG:  database system was not properly shut down; automatic recovery in progress', 'LOG:  redo starts at 0/200', 'LOG:  redo done at 0/340', 'LOG:  database system is ready to accept connections'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'redo from the checkpoint', right: s.r || '' }),
      setup(kit) {
        const led = kit.ledger(null, { x: 16, y: 76, w: 608, title: 'WAL since the checkpoint redo point', cols: [{ label: 'LSN', w: 56 }, { label: 'record', w: 170 }, { label: 'page LSN on disk', w: 140 }, { label: 'action', w: 220 }], rows: 4, rowH: 18 });
        const bars = kit.bars(null, { x: 16, y: 216, w: 400, labelW: 110, max: 4, items: [{ id: 'rp', label: 'records seen' }, { id: 'ap', label: 'applied' }], title: 'Replay progress' });
        const res = kit.chip(null, { x: 16, y: 292, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { led, bars, res };
      },
      frame(s, kit, R) {
        const n = s.n || 0;
        R.led.clear();
        RR.forEach((r, i) => { if (i < n) R.led.setRow(i, [r[0], r[1], r[2], r[3]], { hl: s.cur === i, tones: [null, null, null, r[3].startsWith('skip') ? 'warn' : 'ok'] }); else R.led.setRow(i, [r[0], r[1], '', ''], {}); });
        R.bars.set('rp', n, 'ok', String(n)); R.bars.set('ap', s.ap || 0, 'ok', String(s.ap || 0));
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'The server restarts after a crash. It reads pg_control, finds the last checkpoint, and sees that the redo point is LSN 200.', callout: 'Start at the redo point of the last checkpoint', code: 2, state: { r: 'startup' }, stats: [{ l: 'redo point', v: 'LSN 200' }] },
      { log: 'Record 200 changes page 12. The page on disk has LSN 180, older than the record, so the change is missing. Redo applies it.', callout: 'Page LSN 180 < record 200: apply', code: 2, state: { n: 1, cur: 0, ap: 1, r: 'record 200' }, stats: [{ l: 'applied', v: '1', cls: 'ok' }] },
      { log: 'Record 240 changes page 31, but that page on disk already has LSN 260. The page was written after this change, so redo skips the record.', callout: 'Page LSN 260 ≥ record 240: skip', moment: true, code: 2, state: { n: 2, cur: 1, ap: 1, r: 'record 240' }, stats: [{ l: 'skipped', v: '1', cls: 'warn' }] },
      { log: 'Record 280 changes page 12 again. Page 12 now has LSN 200 from the earlier replay, so it is applied. Redo is idempotent: the LSN decides.', callout: 'Replay is guided by the page LSN', code: 2, state: { n: 3, cur: 2, ap: 2, r: 'record 280' }, stats: [{ l: 'applied', v: '2', cls: 'ok' }] },
      { log: 'Record 320 is the commit of txid 205, so that transaction is marked committed. The end of the WAL is reached.', callout: 'The commit record marks the transaction committed', code: 3, state: { n: 4, cur: 3, ap: 3, r: 'end of WAL' }, stats: [{ l: 'applied', v: '3', cls: 'ok' }] },
      { log: 'The database opens. Recovery time depends on how much WAL lies after the last checkpoint, not on the size of the database.', callout: 'Recovery time = WAL since the checkpoint', code: 4, state: { n: 4, ap: 3, res: 'ready to accept connections', resTone: 'ok', r: 'open' }, stats: [{ l: 'recovery time', v: 'seconds', cls: 'ok' }],
        takeaway: 'Redo replays from the checkpoint, so a shorter checkpoint interval means a shorter recovery.' },
    ],
  };

  /* ---------- 4. Full-page images and torn pages ---------- */
  const fpi = {
    id: 'fpi', label: 'Torn page and full-page image', desc: 'An 8 kB page is written as two 4 kB blocks. A crash between them tears the page. The first change after a checkpoint logs the whole page so redo can repair it.',
    codeLabel: 'postgresql.conf', code: { bug: ['full_page_writes = on   # default', '# the first change to a page after a checkpoint', '# writes the whole 8 kB page to WAL', '# crash during the page write: redo restores the image', 'full_page_writes = off # unsafe unless the storage writes 8 kB atomically'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'page 12 · two 4 kB halves', right: s.r || '' }),
      setup(kit) {
        const h1 = kit.chip(null, { x: 16, y: 80, w: 150, h: 50, label: 'first 4 kB', sub: '', tone: 'info' });
        const h2 = kit.chip(null, { x: 176, y: 80, w: 150, h: 50, label: 'last 4 kB', sub: '', tone: 'info' });
        const img = kit.chip(null, { x: 352, y: 80, w: 272, h: 50, label: 'WAL: full-page image', sub: '8 kB copy of page 12', tone: 'info', show: false });
        const bars = kit.bars(null, { x: 16, y: 176, w: 400, labelW: 110, max: 100, items: [{ id: 'wal', label: 'WAL written' }], title: 'WAL for this change (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 244, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { h1, h2, img, bars, res };
      },
      frame(s, kit, R) {
        R.h1.set({ sub: s.a || 'old', tone: s.aT || 'info' }); R.h2.set({ sub: s.b || 'old', tone: s.bT || 'info' });
        R.img.set({ show: !!s.img, tone: s.imgT || 'ok' });
        R.bars.set('wal', s.wal || 0, s.wal > 50 ? 'warn' : 'ok', s.walL || '0');
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'A checkpoint has just finished. Page 12 is on disk, consistent, in its old state.', callout: 'After a checkpoint: page 12 is consistent', code: 0, state: { r: 'checkpoint' }, stats: [{ l: 'page 12', v: 'consistent' }] },
      { log: 'The first change to page 12 after the checkpoint writes the whole page to WAL, as a full-page image, along with the small change record.', callout: 'First change after a checkpoint: log the whole page', moment: true, code: 1, state: { img: true, wal: 90, walL: '8 kB', r: 'first change' }, stats: [{ l: 'WAL for this change', v: '~8 kB', cls: 'warn' }] },
      { log: 'Later changes to the same page, before the next checkpoint, log only the small change record. That is why WAL volume spikes after each checkpoint.', callout: 'Later changes are small', code: 1, state: { img: true, wal: 8, walL: 'small', r: 'next change' }, stats: [{ l: 'WAL for this change', v: 'small', cls: 'ok' }] },
      { log: 'The page is written to disk as two 4 kB blocks. The first block is written. The power fails before the second.', callout: 'Crash in the middle of the page write', moment: true, code: 3, state: { img: true, a: 'new', aT: 'warn', b: 'old', bT: 'delete', wal: 8, walL: 'small', r: 'torn write' }, stats: [{ l: 'page 12', v: 'torn', cls: 'bad' }] },
      { log: 'On restart, redo finds the full-page image in the WAL and overwrites the whole page with it. Then it replays the small records on top. The page is whole again.', callout: 'Redo restores the image, then replays', code: 3, state: { img: true, a: 'restored', aT: 'ok', b: 'restored', bT: 'ok', wal: 8, walL: 'small', res: 'page 12 repaired from the WAL image', resTone: 'ok', r: 'recovered' }, stats: [{ l: 'page 12', v: 'repaired', cls: 'ok' }] },
      { log: 'With full_page_writes off, the WAL holds only the small change. A torn page cannot be rebuilt from it, and the next read fails with invalid page.', callout: 'full_page_writes = off: the page stays torn', moment: true, code: 4, state: { a: 'new', aT: 'warn', b: 'old', bT: 'delete', wal: 8, walL: 'small', res: 'ERROR: invalid page in block 12 of relation base/16384/16421', resTone: 'bad', r: 'no image' }, stats: [{ l: 'page 12', v: 'corrupt', cls: 'bad' }],
        takeaway: 'Full-page images cost WAL after each checkpoint, and they are what make a torn page recoverable.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[5] = { explain: `
<h3>1. Log first, pages later</h3>
<p>Data pages are written lazily, in the background. What must survive a crash is a small, sequential log. PostgreSQL writes the intent of each change to the write-ahead log (WAL) first. A commit is safe once its log record is on disk, even if the data page itself was never written.</p>
<figure class="hd" aria-label="Flowchart: the order of events for a durable commit">
  <div class="hd-flow"><div class="hd-node">Change a page in shared_buffers (dirty)</div><div class="hd-down">↓</div><div class="hd-node">Append a WAL record to the WAL buffers</div><div class="hd-down">↓</div><div class="hd-node warn">COMMIT: append a commit record, then fsync WAL</div><div class="hd-down">↓</div><div class="hd-node ok">Return OK to the client</div><div class="hd-down">↓</div><div class="hd-node">Later: the checkpointer writes the data page</div></div>
  <figcaption>The log is on disk before the OK. The data page can wait.</figcaption>
</figure>

<h3>2. WAL records and LSNs</h3>
<p>Each change produces a <b>WAL record</b>, identified by an increasing <b>LSN</b> (log sequence number). Records are appended to <b>WAL buffers</b> in memory and written to files in <code>pg_wal</code>. Every data page remembers the LSN of the last record that changed it.</p>

<h3>3. COMMIT and the flush</h3>
<p>With <code>synchronous_commit = on</code>, a <code>COMMIT</code> waits until WAL up to its commit record has been flushed to disk with <code>fsync</code>. After that the commit is durable. The <b>page LSN rule</b> keeps the log ahead of the data: a dirty data page may be written only after WAL up to that page's LSN has been flushed.</p>

<h3>4. Redo after a crash</h3>
<p>After a crash, <b>redo</b> replays WAL from the last checkpoint's redo point. A page whose LSN is already at or above the record is skipped, so replaying a record twice does no harm. Recovery time therefore depends on the WAL written since the last checkpoint, not on the size of the database. Chapter 10 covers how checkpoints set that distance.</p>

<h3>5. Full-page images, and what you can turn off</h3>
<p>An 8 kB page is written as smaller blocks, so a crash can tear it. With <code>full_page_writes = on</code>, the first change to a page after a checkpoint writes the whole page to WAL, and redo can rebuild a torn page from that image. The cost is a burst of WAL after every checkpoint.</p>
<p>Waiting for the flush makes each commit slower, so <code>synchronous_commit = off</code> returns early. The cost is that the last commits, up to about three times <code>wal_writer_delay</code>, can be lost after a crash. The database stays consistent, but acknowledged work can vanish. Turning <code>fsync</code> or <code>full_page_writes</code> off is different: it breaks the ordering the recovery depends on, and it can corrupt data. Use those settings only for data you can recreate.</p>

<h3>6. Syntax</h3>
<pre>-- what is this node set to?
SHOW synchronous_commit;
SHOW fsync;
SHOW full_page_writes;
SHOW wal_writer_delay;

-- async commit for one transaction that can lose its last moments
BEGIN;
SET LOCAL synchronous_commit = off;
INSERT INTO audit_log (msg) VALUES ('page viewed');
COMMIT;

-- where is the WAL now, and how much has been written?
SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn());
SELECT wal_records, wal_fpi, wal_bytes FROM pg_stat_wal;

-- postgresql.conf
-- wal_compression = on   # shrinks full-page images</pre>
<p><code>wal_fpi</code> in <code>pg_stat_wal</code> counts full-page images, so a spike right after a checkpoint is easy to see.</p>`, scenarios: [syncOn, syncOff, redo, fpi] };
})();
