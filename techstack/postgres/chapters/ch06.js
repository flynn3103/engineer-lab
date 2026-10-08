/* Chapter 6 "VACUUM and the Horizon": three bespoke scenes plus the Explain text (index 6, zero-based).
   Loads after course.js and scene-kit.js. Transaction ids, row counts and sizes are illustrative; the mechanisms are PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: ids, counts and sizes are illustrative. The rules are real.';

  /* ---------- 1. An idle session pins the horizon ---------- */
  const DEAD = [['T1', '90'], ['T2', '120'], ['T3', '150'], ['T4', '180'], ['T5', '210']];
  const horizon = {
    id: 'horizon', label: 'Idle session pins the horizon', desc: 'A session idle in transaction holds an old snapshot. VACUUM runs, but it can remove only versions that no snapshot could still see.',
    codeLabel: 'SQL', code: { bug: ['-- reporting tool, 05:00, then the user left', 'BEGIN; SELECT count(*) FROM orders;   -- txid 100, never committed', '-- check', 'SELECT pid, state, xact_start, backend_xmin FROM pg_stat_activity;', '-- fix', 'SELECT pg_terminate_backend(4711);   -- or idle_in_transaction_session_timeout'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'dead versions of orders · oldest snapshot', right: s.r || '' }),
      setup(kit) {
        const led = kit.ledger(null, { x: 16, y: 76, w: 608, title: 'Dead versions (deleted and committed)', cols: [{ label: 'version', w: 80 }, { label: 'deleted by txid', w: 140 }, { label: 'older than the horizon?', w: 190 }, { label: 'VACUUM may remove', w: 170 }], rows: 5, rowH: 18 });
        const sess = kit.chip(null, { x: 380, y: 248, w: 244, h: 54, label: 'Reporting session', sub: '', tone: 'info' });
        const bars = kit.bars(null, { x: 16, y: 256, w: 340, labelW: 100, max: 100, items: [{ id: 'rm', label: 'removed' }, { id: 'sz', label: 'table size' }], title: 'After VACUUM (illustrative)' });
        return { led, sess, bars };
      },
      frame(s, kit, R) {
        const hz = s.hz == null ? null : s.hz;
        R.led.clear();
        if (s.dead) DEAD.forEach((d, i) => {
          if (i >= s.dead) return;
          if (hz == null) R.led.setRow(i, [d[0], d[1], '?', ''], {});
          else { const ok = +d[1] < hz; R.led.setRow(i, [d[0], d[1], ok ? 'yes: below ' + hz : 'no: snapshot may see it', s.ran ? (ok ? 'removed' : 'kept') : ok ? 'yes' : 'no'], { hl: !!s.ran && ok, tones: [null, null, ok ? 'ok' : 'warn', s.ran ? (ok ? 'ok' : 'bad') : null] }); }
        });
        R.sess.set({ sub: s.sess || '', tone: s.sT || 'info', show: !!s.sess });
        R.bars.set('rm', s.rm || 0, 'ok', s.rm ? s.rm + ' of ' + (s.dead || 0) : '0');
        R.bars.set('sz', s.sz || 30, s.sz > 60 ? 'bad' : 'ok', (s.sz || 30) + '%');
      }
    },
    bug: [
      { log: 'A reporting tool opened a transaction at 05:00 and the user left. The session is idle in transaction, but its snapshot, txid 100, is still open.', callout: 'An old snapshot is still open', code: 1, state: { sess: 'idle in txn · snapshot 100', sT: 'cursor', r: 'since 05:00' }, stats: [{ l: 'oldest snapshot', v: 'txid 100', cls: 'warn' }, { l: 'idle for', v: '6 hours', cls: 'warn' }] },
      { log: 'Checkout keeps updating and deleting orders. Five dead versions appear, deleted at txids 90, 120, 150, 180 and 210. Their deleters have committed.', callout: 'Dead versions pile up', code: 1, state: { sess: 'idle in txn · snapshot 100', sT: 'cursor', dead: 5, r: 'updates' }, stats: [{ l: 'dead versions', v: '5', cls: 'warn' }] },
      { log: 'The xmin horizon is the oldest snapshot anyone may still need. It is 100. A version is removable only if its deleter is older than the horizon.', callout: 'Removable = deleted before the horizon', moment: true, code: 3, state: { sess: 'idle in txn · snapshot 100', sT: 'cursor', dead: 5, hz: 100, r: 'horizon = 100' }, stats: [{ l: 'horizon', v: 'txid 100', cls: 'warn' }, { l: 'removable', v: '1 of 5', cls: 'warn' }] },
      { log: 'Autovacuum runs. It removes T1, the only version deleted before the horizon, and has to keep the other four, because that old snapshot might still see them.', callout: 'VACUUM keeps what the old snapshot may see', code: 3, state: { sess: 'idle in txn · snapshot 100', sT: 'cursor', dead: 5, hz: 100, ran: true, rm: 1, sz: 55, r: 'VACUUM ran' }, stats: [{ l: 'removed', v: '1', cls: 'ok' }, { l: 'kept', v: '4', cls: 'bad' }] },
      { log: 'Every later vacuum ends the same way. The log says it finished quickly, yet the table keeps growing, because new versions pile up behind the pinned horizon.', callout: 'Fast vacuums, a table that keeps growing', code: 3, state: { sess: 'idle in txn · snapshot 100', sT: 'cursor', dead: 5, hz: 100, ran: true, rm: 1, sz: 90, r: 'a week later' }, stats: [{ l: 'table size', v: 'doubles weekly', cls: 'bad' }, { l: 'count(*)', v: 'unchanged' }] },
      { log: 'The fix is to end the session: terminate it now, and set idle_in_transaction_session_timeout so it cannot happen again. The horizon jumps to the present, txid 300.', callout: 'Fix: end the session, set a timeout', code: 5, state: { sess: 'terminated', sT: 'ok', dead: 5, hz: 300, ran: true, rm: 5, sz: 90, r: 'horizon = 300' }, stats: [{ l: 'horizon', v: 'txid 300', cls: 'ok' }, { l: 'removed', v: '5 of 5', cls: 'ok' }],
        takeaway: 'Garbage is defined by the oldest reader, not by the clock.' },
    ],
  };

  /* ---------- 2. A lazy VACUUM pass ---------- */
  const P = 12;
  const PG0 = ['ok', 'ok', 'warn', 'ok', 'ok', 'warn', 'warn', 'ok', 'ok', 'ok', 'warn', 'ok'];
  const pass = {
    id: 'lazy', label: 'One lazy VACUUM pass', desc: 'VACUUM skips all-visible pages, collects dead row pointers, cleans the indexes, then frees the heap slots. The space stays in the table.',
    codeLabel: 'SQL', code: { bug: ['VACUUM (VERBOSE) orders;', '-- 1 scan the heap, skip all-visible pages (visibility map)', '-- 2 collect the dead tuple ids', '-- 3 remove their index entries', '-- 4 mark the heap slots free, record them in the free space map'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'orders · 12 heap pages', right: s.r || '' }),
      setup(kit) {
        const pages = kit.strip(null, { x: 16, y: 86, items: Array.from({ length: P }, (_, i) => ({ id: 'p' + i, label: String(i + 1) })), w: 44, h: 40, gap: 6, tone: 'info' });
        const idx = kit.chip(null, { x: 16, y: 156, w: 290, h: 40, label: 'Indexes', sub: '', tone: 'info' });
        const fsm = kit.chip(null, { x: 334, y: 156, w: 290, h: 40, label: 'Free space map', sub: '', tone: 'info' });
        const bars = kit.bars(null, { x: 16, y: 232, w: 400, labelW: 120, max: 12, items: [{ id: 'scan', label: 'pages scanned' }, { id: 'skip', label: 'pages skipped' }, { id: 'dead', label: 'pages with dead' }], title: 'Progress' });
        return { pages: Object.values(pages), idx, fsm, bars };
      },
      frame(s, kit, R) {
        R.pages.forEach((p, i) => {
          const base = PG0[i], has = base === 'warn';
          let tone = base === 'ok' ? 'live' : 'warn';
          if (s.scan != null) { if (!has) tone = i <= s.scan ? 'dim' : 'live'; else if (i === s.scan) tone = 'cursor'; }
          if (s.freed && has) tone = 'ok';
          p.set({ tone, sub: base === 'ok' ? (s.scan != null && i <= s.scan ? 'skipped' : '') : '' });
        });
        R.idx.set({ sub: s.ix || '', tone: s.ixT || 'info' }); R.fsm.set({ sub: s.fs || '', tone: s.fsT || 'info' });
        R.bars.set('scan', s.sc || 0, 'ok', String(s.sc || 0)); R.bars.set('skip', s.sk || 0, 'ok', String(s.sk || 0)); R.bars.set('dead', s.dd || 0, s.dd ? 'warn' : 'ok', String(s.dd || 0));
      }
    },
    bug: [
      { log: 'A table of 12 pages. Green pages are all-visible: every row on them is visible to everyone. Orange pages hold dead versions.', callout: 'Orange pages hold dead versions', state: { r: 'before' }, stats: [{ l: 'pages', v: '12' }, { l: 'with dead rows', v: '4', cls: 'warn' }] },
      { log: 'VACUUM walks the heap. The visibility map says pages 1 and 2 are all-visible, so it skips them without reading them.', callout: 'The visibility map lets VACUUM skip pages', code: 1, state: { scan: 1, sc: 0, sk: 2, r: 'scan' }, stats: [{ l: 'skipped', v: '2', cls: 'ok' }] },
      { log: 'On page 3 it finds dead tuples and writes their ids into its memory. It repeats this on pages 6, 7 and 11.', callout: 'Dead tuple ids are collected', moment: true, code: 2, state: { scan: 2, sc: 1, sk: 2, dd: 1, r: 'collect' }, stats: [{ l: 'dead pages found', v: '1', cls: 'warn' }] },
      { log: 'The scan reaches the end of the table. 4 pages had dead tuples, and the other 8 were skipped.', callout: 'The scan is done: 4 pages had dead tuples', code: 2, state: { scan: 11, sc: 4, sk: 8, dd: 4, r: 'scan done' }, stats: [{ l: 'scanned', v: '4', cls: 'ok' }, { l: 'skipped', v: '8', cls: 'ok' }] },
      { log: 'Before any heap slot can be reused, every index entry that points at a dead tuple must go. VACUUM scans each index and removes those entries.', callout: 'First the index entries, then the heap', code: 3, state: { scan: 11, sc: 4, sk: 8, dd: 4, ix: 'removing entries', ixT: 'cursor', r: 'index cleanup' }, stats: [{ l: 'order', v: 'indexes first', cls: 'warn' }] },
      { log: 'Now the heap slots are marked free, and the free space map records how much room each page has. New rows can reuse it.', callout: 'The slots are free for new rows', code: 4, state: { scan: 11, freed: true, sc: 4, sk: 8, dd: 4, ix: 'clean', ixT: 'ok', fs: 'updated', fsT: 'ok', r: 'done' }, stats: [{ l: 'space', v: 'reusable', cls: 'ok' }, { l: 'file size', v: 'usually unchanged', cls: 'warn' }],
        takeaway: 'VACUUM returns space to the table for reuse, not to the operating system.' },
    ],
  };

  /* ---------- 3. The autovacuum trigger ---------- */
  const trig = {
    id: 'trigger', label: 'Autovacuum trigger math', desc: 'The trigger is a fraction of the table. On a huge table it waits for about 100 million dead rows, then has a big backlog to clear.',
    codeLabel: 'SQL', code: { bug: ['-- trigger = threshold + scale_factor * rows', '-- 50 + 0.2 * 500M rows = about 100M dead rows', 'SELECT n_live_tup, n_dead_tup, last_autovacuum FROM pg_stat_user_tables;', '-- per-table fix', 'ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.01);'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'orders · 500 million rows (illustrative)', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 16, y: 100, w: 608, labelW: 120, max: 120, items: [{ id: 'dead', label: 'dead rows (M)' }, { id: 'trg', label: 'trigger (M)' }], title: 'Dead rows against the trigger' });
        const fire = kit.chip(null, { x: 16, y: 190, w: 300, h: 46, label: 'Autovacuum', sub: 'not started', tone: 'info' });
        const cfg = kit.chip(null, { x: 340, y: 190, w: 284, h: 46, label: 'scale_factor', sub: '0.2 (default)', tone: 'info' });
        const res = kit.chip(null, { x: 16, y: 262, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { bars, fire, cfg, res };
      },
      frame(s, kit, R) {
        R.bars.set('dead', s.dead || 0, s.dead >= (s.trg || 100) ? 'bad' : s.dead > 60 ? 'warn' : 'ok', (s.dead || 0) + ' M'); R.bars.set('trg', s.trg || 100, 'warn', (s.trg || 100) + ' M');
        R.fire.set({ sub: s.fire || 'not started', tone: s.fT || 'info' }); R.cfg.set({ sub: s.cfg || '0.2 (default)', tone: s.cT || 'info' });
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'With the default scale factor of 0.2, the trigger is 50 plus 20% of the table. For 500 million rows, that is about 100 million dead rows.', callout: 'Trigger = 50 + 20% of the rows', code: 0, state: { dead: 0, trg: 100, r: 'default' }, stats: [{ l: 'trigger', v: '~100 M dead rows', cls: 'warn' }] },
      { log: 'Updates keep adding dead versions. At 96 million the table is far past healthy, and autovacuum still has not started.', callout: 'Still below the trigger: nothing runs', code: 1, state: { dead: 96, trg: 100, r: '96 M dead' }, stats: [{ l: 'dead rows', v: '96 M', cls: 'bad' }, { l: 'autovacuum', v: 'idle', cls: 'warn' }] },
      { log: 'At 100 million it finally starts. The backlog is huge, and the cost-based delay paces the work slowly, so the table stays bloated for hours.', callout: 'It fires late, with a huge backlog', moment: true, code: 1, state: { dead: 100, trg: 100, fire: 'running, throttled', fT: 'cursor', r: 'fires' }, stats: [{ l: 'backlog', v: '100 M rows', cls: 'bad' }, { l: 'run time', v: 'hours', cls: 'bad' }] },
      { log: 'The fix is a per-table setting. A scale factor of 0.01 moves the trigger from 100 million to about 5 million dead rows.', callout: 'Fix: scale_factor = 0.01 on this table', code: 4, state: { dead: 20, trg: 5, cfg: '0.01 (per table)', cT: 'ok', r: 'new trigger' }, stats: [{ l: 'trigger', v: '~5 M dead rows', cls: 'ok' }] },
      { log: 'Autovacuum now starts every time 5 million rows have died. Each run is small and finishes in minutes, and the table stays close to its live size.', callout: 'Small, frequent runs', code: 4, state: { dead: 5, trg: 5, cfg: '0.01 (per table)', cT: 'ok', fire: 'runs often, small', fT: 'ok', res: 'dead rows stay near 5 M, each run takes minutes', resTone: 'ok', r: 'healthy' }, stats: [{ l: 'dead rows', v: '~5 M', cls: 'ok' }, { l: 'each run', v: 'minutes', cls: 'ok' }],
        takeaway: 'Percent-based triggers are coarse on huge tables. Set the scale factor per table.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[6] = { explain: `
<h3>1. Old versions are garbage only when nobody can see them</h3>
<p>MVCC leaves old row versions behind after every update and delete. A version can be removed only when no running transaction could still need it. So garbage is defined by the oldest reader, not by the clock. VACUUM is the process that finds and reclaims these versions. A <b>dead tuple</b> is a version whose deleter has committed. It stays on its page until VACUUM reclaims the space for reuse.</p>
<figure class="hd" aria-label="Flowchart: one lazy VACUUM pass">
  <div class="hd-flow"><div class="hd-node">Scan the heap, skip all-visible pages</div><div class="hd-down">↓</div><div class="hd-node warn">Collect dead tuple ids older than the xmin horizon</div><div class="hd-down">↓</div><div class="hd-node">Remove their index entries</div><div class="hd-down">↓</div><div class="hd-node">Mark the heap slots free</div><div class="hd-down">↓</div><div class="hd-node ok">Record the free space in the free space map</div></div>
  <figcaption>The horizon decides what counts as dead. The order protects the indexes.</figcaption>
</figure>

<h3>2. The xmin horizon</h3>
<p>The <b>xmin horizon</b> is the oldest transaction ID that any snapshot may still need. Long transactions hold it back. So do replication slots, prepared transactions and standbys that send <code>hot_standby_feedback</code>. One old holder pins the horizon for every table in the database, which is why an idle reporting session can make a table that it never touched grow.</p>

<h3>3. What a lazy VACUUM does</h3>
<p>A <b>lazy VACUUM</b> scans the heap, using the visibility map to skip pages that are all-visible. It collects the ids of dead tuples, removes the index entries that point at them, then marks the heap slots free and records the free space in the free space map. The order matters: no heap slot can be reused while an index entry still points at it. Space returns to the table for reuse, but usually not to the operating system. Plain VACUUM only trims empty pages at the very end of the file. <code>VACUUM FULL</code> rewrites the table and shrinks the file, but it takes an exclusive lock while it runs.</p>

<h3>4. Autovacuum and its trigger</h3>
<p><b>Autovacuum</b> starts when dead tuples exceed <code>autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor * rows</code>, with defaults of 50 and 0.2. That percentage is coarse on very large tables: it waits for millions of dead rows, then has a big backlog to clear. Autovacuum is also throttled by a cost budget, <code>autovacuum_vacuum_cost_delay</code> and <code>autovacuum_vacuum_cost_limit</code>, so a large run can take hours.</p>

<h3>5. Freezing, and the trade-off</h3>
<p><b>Freezing</b> marks very old tuples so that 32-bit transaction IDs can wrap around safely. If freezing falls too far behind, the database stops accepting commands that assign new transaction IDs, to protect data. Keeping old versions makes reads and writes independent, but it costs space and vacuum work. A single old transaction, slot or prepared transaction pins the horizon for everyone, so the first thing to check when a table keeps growing is who holds the oldest snapshot.</p>

<h3>6. Syntax</h3>
<pre>-- who holds the horizon back?
SELECT pid, state, xact_start, backend_xmin FROM pg_stat_activity
WHERE backend_xmin IS NOT NULL ORDER BY age(backend_xmin) DESC LIMIT 5;
SELECT slot_name, active, xmin, catalog_xmin FROM pg_replication_slots;
SELECT gid, prepared FROM pg_prepared_xacts;

-- how bad is the bloat?
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;

-- per-table autovacuum for a hot table
ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_cost_limit = 2000);

-- cut off the holder, and prevent a repeat
SELECT pg_terminate_backend(4711);
ALTER ROLE reporting SET idle_in_transaction_session_timeout = '5min';

-- wraparound watch
SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC;</pre>`, scenarios: [horizon, pass, trig] };
})();
