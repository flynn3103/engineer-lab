/* Chapter 11 "Streaming Replication and synchronous_commit": four bespoke scenes plus the Explain text (index 11, zero-based).
   Loads after course.js and scene-kit.js. LSNs, lags and sizes are illustrative; the mechanisms are PostgreSQL 16 and 17. */
(function () {
  const W = 640, H = 420;
  const FOOT = 'Simplified: lags, sizes and counts are illustrative. The rules are real.';

  /* ---------- 1. How far COMMIT waits ---------- */
  const STEPS = [['Primary flush', 'on primary disk'], ['Standby write', 'in standby OS'], ['Standby flush', 'on standby disk'], ['Standby replay', 'readable there']];
  const LEVELS = [['local', 0, 1, '1 ms'], ['remote_write', 1, 2, '2 ms'], ['on', 2, 3, '4 ms'], ['remote_apply', 3, 4, '7 ms']];
  const levels = {
    id: 'levels', label: 'How far COMMIT waits', desc: 'The synchronous_commit level decides which step of the standby a COMMIT waits for before it returns. A further step means a stronger guarantee and a slower commit.',
    codeLabel: 'SQL', code: { bug: ['-- synchronous_standby_names = \'s1\'', 'SET synchronous_commit = local;          -- primary flush only', 'SET synchronous_commit = remote_write;   -- + standby OS write', 'SET synchronous_commit = on;             -- + standby flush (default)', 'SET synchronous_commit = remote_apply;   -- + standby replay'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: s.hd || 'one COMMIT, four possible waits', right: s.r || '' }),
      setup(kit) {
        const ch = STEPS.map(([t, sub], i) => kit.chip(null, { x: 16 + i * 154, y: 80, w: 144, h: 56, label: t, sub, tone: 'info' }));
        const bars = kit.bars(null, { x: 16, y: 176, w: 420, labelW: 130, max: 8, items: [{ id: 'lat', label: 'commit latency' }], title: 'Latency (illustrative)' });
        const prot = kit.chip(null, { x: 16, y: 226, w: 608, h: 36, label: '', tone: 'info', show: false });
        const res = kit.chip(null, { x: 16, y: 274, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { ch, bars, prot, res };
      },
      frame(s, kit, R) {
        const upto = s.upto == null ? -1 : s.upto;
        R.ch.forEach((c, i) => c.set({ tone: i <= upto ? 'ok' : s.shown ? 'dim' : 'info' }));
        R.bars.set('lat', s.lat || 0, s.lat > 5 ? 'warn' : 'ok', s.latL || '0');
        R.prot.set({ show: !!s.prot, label: s.prot || '', tone: s.pT || 'info' });
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'A commit record has been written on the primary. How long the client waits depends on which of these four steps synchronous_commit says it must wait for.', callout: 'Four steps, four possible waits', state: { r: 'overview' }, stats: [{ l: 'setting', v: 'synchronous_commit' }] },
      { log: 'local: wait for the primary\'s own flush only. The standby may not have the commit yet, and a failover can lose it.', callout: 'local: only the primary is waited for', code: 1, state: { hd: 'synchronous_commit = local', upto: 0, shown: true, lat: 1, latL: '1 ms', prot: 'protects against a process crash, not a lost primary host', pT: 'warn', r: 'local' }, stats: [{ l: 'latency', v: '1 ms', cls: 'ok' }, { l: 'failover loss', v: 'possible', cls: 'bad' }] },
      { log: 'remote_write: also wait until the standby has received the WAL and handed it to its OS. It survives a primary failure, but not a simultaneous standby host crash.', callout: 'remote_write: the standby has it in its OS', code: 2, state: { hd: 'synchronous_commit = remote_write', upto: 1, shown: true, lat: 2.5, latL: '2.5 ms', prot: 'survives the primary failing', pT: 'cursor', r: 'remote_write' }, stats: [{ l: 'latency', v: '2.5 ms', cls: 'ok' }] },
      { log: 'on, the default: wait for the standby to flush the WAL to its disk. The commit now exists on two disks, which is durability against one node failure.', callout: 'on: the commit is on two disks', moment: true, code: 3, state: { hd: 'synchronous_commit = on', upto: 2, shown: true, lat: 4, latL: '4 ms', prot: 'on two disks: survives either node failing', pT: 'ok', r: 'on' }, stats: [{ l: 'latency', v: '4 ms', cls: 'warn' }, { l: 'failover loss', v: 'none', cls: 'ok' }] },
      { log: 'remote_apply: also wait until the standby has replayed the commit. A read on that standby right after the commit sees it. This is the slowest and strongest.', callout: 'remote_apply: replayed, so reads there see it', code: 4, state: { hd: 'synchronous_commit = remote_apply', upto: 3, shown: true, lat: 7, latL: '7 ms', prot: 'readable on the standby at once', pT: 'ok', r: 'remote_apply' }, stats: [{ l: 'latency', v: '7 ms', cls: 'warn' }] },
      { log: 'These levels only matter if synchronous_standby_names lists a standby. If it is empty, replication is asynchronous, and on waits only for the primary flush, the same as local.', callout: 'An empty synchronous_standby_names means async', code: 0, state: { hd: 'synchronous_standby_names = \'\'', upto: 0, shown: true, lat: 1, latL: '1 ms', prot: 'on behaves like local: replication is asynchronous', pT: 'warn', res: 'the setting that surprised the team: on, but no standby named', resTone: 'bad', r: 'async' }, stats: [{ l: 'on, with no standby', v: '= local', cls: 'bad' }],
        takeaway: 'The commit level decides what a failover can lose. An empty standby list makes it all asynchronous.' },
    ],
  };

  /* ---------- 2. Asynchronous failover loses commits ---------- */
  const fail = {
    id: 'commit-wait', label: 'Async failover loses commits', desc: 'With no synchronous standby, COMMIT waits only for the primary flush. Commits the standby has not yet received are lost when the primary fails.',
    codeLabel: 'SQL', code: { bug: ['SHOW synchronous_standby_names;   -- (empty)', 'SELECT application_name, sent_lsn, flush_lsn, flush_lag FROM pg_stat_replication;', '-- the primary host dies', 'SELECT pg_promote();   -- on the standby', '-- the last two minutes of paid orders are not there'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'primary and standby · WAL position', right: s.r || '' }),
      setup(kit) {
        const pr = kit.chip(null, { x: 16, y: 80, w: 290, h: 50, label: 'Primary', sub: '', tone: 'info' });
        const sb = kit.chip(null, { x: 334, y: 80, w: 290, h: 50, label: 'Standby', sub: '', tone: 'info' });
        const bars = kit.bars(null, { x: 16, y: 164, w: 420, labelW: 150, max: 100, items: [{ id: 'p', label: 'primary WAL' }, { id: 's', label: 'standby has' }, { id: 'lost', label: 'only on the primary' }], title: 'WAL position (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 262, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { pr, sb, bars, res };
      },
      frame(s, kit, R) {
        R.pr.set({ sub: s.pr || '', tone: s.pT || 'info' }); R.sb.set({ sub: s.sb || '', tone: s.sT || 'info' });
        R.bars.set('p', s.p || 0, s.dead ? 'warn' : 'ok', s.pL || '0'); R.bars.set('s', s.sv || 0, 'ok', s.sL || '0');
        R.bars.set('lost', s.lost || 0, s.lost ? 'bad' : 'ok', s.lostL || '0');
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'The primary streams WAL to a standby in another zone. synchronous_commit is on, but synchronous_standby_names is empty, so COMMIT waits only for the primary\'s own flush.', callout: 'COMMIT waits for the primary flush only', code: 0, state: { pr: 'COMMIT = local flush', pT: 'ok', sb: 'async standby', p: 90, pL: '900', sv: 90, sL: '900', r: 'async' }, stats: [{ l: 'standby lag', v: '~0 s' }] },
      { log: 'At peak the standby falls behind by a couple of seconds. The newest commits have been acknowledged to customers but exist only on the primary.', callout: 'The standby is two seconds behind', moment: true, code: 1, state: { pr: 'acknowledges commits', pT: 'ok', sb: 'receives WAL, behind', sT: 'warn', p: 100, pL: '1000', sv: 80, sL: '800', lost: 20, lostL: '~2 s', r: 'lag' }, stats: [{ l: 'flush_lag', v: '~2 s', cls: 'warn' }] },
      { log: 'The primary host dies. The commits from the last couple of seconds, which only it held, die with it.', callout: 'The primary host dies', code: 2, state: { pr: 'down', pT: 'delete', dead: true, sb: 'has WAL up to LSN 800', sT: 'warn', p: 100, pL: '1000', sv: 80, sL: '800', lost: 20, lostL: '~2 s', r: 'failure' }, stats: [{ l: 'commits only on primary', v: 'gone', cls: 'bad' }] },
      { log: 'The standby is promoted. It starts at the last WAL position it received. Customers saw confirmation pages for orders that this node has never heard of.', callout: 'The promoted standby is missing the commits', code: 3, state: { pr: 'down', pT: 'delete', dead: true, sb: 'promoted at LSN 800', sT: 'ok', p: 100, pL: '1000', sv: 80, sL: '800', lost: 20, lostL: '~2 s', res: 'acknowledged commits are missing after failover', resTone: 'bad', r: 'promoted' }, stats: [{ l: 'lost', v: 'last ~2 s', cls: 'bad' }] },
      { log: 'The fix is a synchronous standby (or a quorum) with synchronous_commit = on. A commit then returns only after a second node has the WAL, so a failover loses nothing that was acknowledged.', callout: 'Fix: a synchronous standby', code: 4, state: { pr: 'COMMIT waits for the standby', pT: 'ok', sb: 'synchronous · flushed', sT: 'ok', p: 100, pL: '1000', sv: 100, sL: '1000', res: 'synchronous_standby_names = \'ANY 1 (s1, s2)\'', resTone: 'ok', r: 'fixed' }, stats: [{ l: 'lost on failover', v: '0', cls: 'ok' }, { l: 'cost', v: 'slower commits', cls: 'warn' }],
        takeaway: 'Asynchronous replication keeps writes fast and can lose the newest commits. Write the window down.' },
    ],
  };

  /* ---------- 3. The synchronous standby is down ---------- */
  const stall = {
    id: 'sync-down', label: 'Sync standby stalls commits', desc: 'With one synchronous standby and no spare, the primary holds every COMMIT until that standby returns. A quorum keeps writes flowing when one standby fails.',
    codeLabel: 'postgresql.conf', code: { bug: ['synchronous_standby_names = \'s1\'', '# s1 fails: every COMMIT waits, wait event SyncRep', 'SELECT count(*) FROM pg_stat_activity WHERE wait_event = \'SyncRep\';', '# fix: a quorum with a spare', 'synchronous_standby_names = \'ANY 1 (s1, s2)\''] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: s.hd || 'synchronous_standby_names = \'s1\'', right: s.r || '' }),
      setup(kit) {
        const pr = kit.chip(null, { x: 16, y: 82, w: 190, h: 54, label: 'Primary', sub: '', tone: 'info' });
        const s1 = kit.chip(null, { x: 232, y: 74, w: 190, h: 40, label: 's1', sub: '', tone: 'info' });
        const s2 = kit.chip(null, { x: 232, y: 120, w: 190, h: 40, label: 's2', sub: '', tone: 'info', show: false });
        const bars = kit.bars(null, { x: 16, y: 186, w: 420, labelW: 130, max: 40, items: [{ id: 'wait', label: 'waiting (SyncRep)' }, { id: 'tps', label: 'commits / s' }], title: 'The service (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 262, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { pr, s1, s2, bars, res };
      },
      frame(s, kit, R) {
        R.pr.set({ sub: s.pr || '', tone: s.pT || 'info' }); R.s1.set({ sub: s.s1 || '', tone: s.s1T || 'info' }); R.s2.set({ show: !!s.s2, sub: s.s2 || '', tone: s.s2T || 'info' });
        R.bars.set('wait', s.wait || 0, s.wait > 5 ? 'bad' : 'ok', String(s.wait || 0)); R.bars.set('tps', s.tps == null ? 30 : s.tps, s.tps === 0 ? 'bad' : 'ok', String(s.tps == null ? 30 : s.tps));
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'The primary has one synchronous standby, s1. A COMMIT must wait for its acknowledgement before it returns.', callout: 'Every COMMIT waits for s1', code: 0, state: { pr: 'waits for s1 per commit', pT: 'ok', s1: 'synchronous · up', s1T: 'ok', r: 'healthy' }, stats: [{ l: 'commits / s', v: '30', cls: 'ok' }] },
      { log: 'The standby s1 fails. There is no other synchronous candidate, so no commit can be acknowledged.', callout: 's1 fails, and there is no spare', moment: true, code: 1, state: { pr: 'no acknowledgement', pT: 'warn', s1: 'down', s1T: 'delete', wait: 3, tps: 0, r: 's1 down' }, stats: [{ l: 'commits / s', v: '0', cls: 'bad' }] },
      { log: 'The COMMIT waits, and the wait is not cancelled. The transaction is already committed locally, so it is visible, but the client is held. Sessions show wait event SyncRep.', callout: 'COMMIT hangs in SyncRep', code: 2, state: { pr: 'sessions hold in SyncRep', pT: 'warn', s1: 'down', s1T: 'delete', wait: 20, tps: 0, r: 'hang' }, stats: [{ l: 'waiting', v: '20', cls: 'bad' }] },
      { log: 'Every new write queues behind a waiting commit, so the whole service stalls until s1 returns or someone clears synchronous_standby_names.', callout: 'The whole service stalls', code: 2, state: { pr: 'all writes stall', pT: 'warn', s1: 'down', s1T: 'delete', wait: 40, tps: 0, res: 'a single standby outage stops all writes', resTone: 'bad', r: 'outage' }, stats: [{ l: 'waiting', v: '40', cls: 'bad' }] },
      { log: 'The fix is a quorum with a spare: ANY 1 of s1 and s2. Either standby can acknowledge, so one failure does not stop commits.', callout: 'Fix: ANY 1 (s1, s2)', code: 4, state: { hd: 'synchronous_standby_names = \'ANY 1 (s1, s2)\'', pr: 'waits for either standby', pT: 'ok', s1: 'down', s1T: 'delete', s2: 'synchronous · up', s2T: 'ok', wait: 0, tps: 30, res: 'one standby down: commits keep flowing', resTone: 'ok', r: 'quorum' }, stats: [{ l: 'commits / s', v: '30', cls: 'ok' }],
        takeaway: 'A quorum survives one failure. A single synchronous standby makes it a single point of failure for writes.' },
    ],
  };

  /* ---------- 4. An inactive slot fills pg_wal ---------- */
  const slot = {
    id: 'slot', label: 'Inactive slot fills the disk', desc: 'A replication slot makes the primary keep WAL its consumer has not received. If the consumer disappears, the retained WAL grows until the disk is full.',
    codeLabel: 'SQL', code: { bug: ['SELECT slot_name, active, wal_status, restart_lsn', 'FROM pg_replication_slots;', '-- fix: drop the unused slot, and cap the retention', 'SELECT pg_drop_replication_slot(\'old_standby\');', 'ALTER SYSTEM SET max_slot_wal_keep_size = \'50GB\';'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'primary disk · pg_wal', right: s.r || '' }),
      setup(kit) {
        const sl = kit.chip(null, { x: 16, y: 80, w: 300, h: 50, label: 'Replication slot', sub: '', tone: 'info' });
        const cons = kit.chip(null, { x: 334, y: 80, w: 290, h: 50, label: 'Consumer (standby)', sub: '', tone: 'info' });
        const bars = kit.bars(null, { x: 16, y: 164, w: 420, labelW: 120, max: 100, items: [{ id: 'wal', label: 'pg_wal size' }, { id: 'disk', label: 'disk used' }], title: 'Primary disk (illustrative)' });
        const res = kit.chip(null, { x: 16, y: 244, w: 608, h: 34, label: '', tone: 'info', show: false });
        return { sl, cons, bars, res };
      },
      frame(s, kit, R) {
        R.sl.set({ sub: s.sl || '', tone: s.slT || 'info' }); R.cons.set({ sub: s.cn || '', tone: s.cT || 'info' });
        R.bars.set('wal', s.wal || 0, s.wal > 60 ? 'bad' : 'ok', s.walL || '0'); R.bars.set('disk', s.disk || 0, s.disk > 80 ? 'bad' : 'ok', s.diskL || '0');
        R.res.set({ show: !!s.res, label: s.res || '', tone: s.resTone || 'info' });
      }
    },
    bug: [
      { log: 'A slot makes the primary keep every WAL segment the consumer has not yet received. While the consumer is connected, this is a few segments.', callout: 'A slot holds WAL for its consumer', code: 0, state: { sl: 'active · retains 1 GB', slT: 'ok', cn: 'connected', cT: 'ok', wal: 8, walL: '1 GB', disk: 30, diskL: '30%', r: 'healthy' }, stats: [{ l: 'retained', v: '1 GB', cls: 'ok' }] },
      { log: 'The standby is decommissioned, but its slot is left behind. The slot is inactive, and it still pins WAL from the point where the standby stopped.', callout: 'The consumer is gone; the slot stays', moment: true, code: 0, state: { sl: 'inactive · pinned', slT: 'warn', cn: 'gone', cT: 'delete', wal: 20, walL: '25 GB', disk: 45, diskL: '45%', r: 'orphan' }, stats: [{ l: 'active', v: 'false', cls: 'bad' }] },
      { log: 'Checkpoints cannot remove segments newer than the slot\'s restart point. pg_wal keeps growing, even though max_wal_size is small, because retained WAL is not limited by it.', callout: 'pg_wal grows past max_wal_size', code: 0, state: { sl: 'inactive · pinned', slT: 'warn', cn: 'gone', cT: 'delete', wal: 70, walL: '250 GB', disk: 80, diskL: '80%', r: 'growing' }, stats: [{ l: 'pg_wal', v: '250 GB', cls: 'bad' }] },
      { log: 'The disk fills up. The primary can no longer write WAL, so it shuts down, and the service stops.', callout: 'The disk is full: the primary stops', code: 0, state: { sl: 'inactive · pinned', slT: 'warn', cn: 'gone', cT: 'delete', wal: 96, walL: '320 GB', disk: 100, diskL: '100%', res: 'PANIC: could not write to file "pg_wal/…": No space left on device', resTone: 'bad', r: 'outage' }, stats: [{ l: 'disk', v: '100%', cls: 'bad' }] },
      { log: 'The fix is to drop slots that nobody uses. To protect the future, set max_slot_wal_keep_size: a consumer that falls beyond it loses its slot and must be rebuilt, but the primary stays up.', callout: 'Fix: drop the slot, cap the retention', code: 3, state: { sl: 'dropped', slT: 'ok', cn: 'gone', cT: 'delete', wal: 6, walL: '1 GB', disk: 30, diskL: '30%', res: 'max_slot_wal_keep_size = 50GB · alert on slot lag and pg_wal size', resTone: 'ok', r: 'fixed' }, stats: [{ l: 'pg_wal', v: '1 GB', cls: 'ok' }],
        takeaway: 'A slot protects its consumer and can kill the primary. Cap it, and alert on it.' },
    ],
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[11] = { explain: `
<h3>1. The commit rule decides what a failover loses</h3>
<p>A replica can protect a commit only if the commit's WAL reached it before the primary failed. So the commit rule decides what a failover can lose. Durability against a node failure means the log must exist on a second node before the client is told the commit succeeded.</p>
<figure class="hd" aria-label="Flowchart: where each synchronous_commit level stops waiting">
  <div class="hd-flow"><div class="hd-node">Primary flushes WAL: local stops here</div><div class="hd-down">↓</div><div class="hd-node">WAL sender streams it to the standby</div><div class="hd-down">↓</div><div class="hd-node">Standby writes it: remote_write stops here</div><div class="hd-down">↓</div><div class="hd-node warn">Standby flushes it: on stops here</div><div class="hd-down">↓</div><div class="hd-node ok">Standby replays it: remote_apply stops here</div></div>
  <figcaption>Each step further down is a stronger guarantee and a slower commit.</figcaption>
</figure>

<h3>2. WAL sender and WAL receiver</h3>
<p>A <b>WAL sender</b> on the primary streams WAL records to each standby. The standby's <b>WAL receiver</b> writes, flushes and replays them in order. Each step has its own position, which you can read in <code>pg_stat_replication</code> as <code>sent_lsn</code>, <code>write_lsn</code>, <code>flush_lsn</code> and <code>replay_lsn</code>, with a lag for each.</p>

<h3>3. How far a COMMIT waits</h3>
<p>The <code>synchronous_commit</code> level sets how far a commit waits. <code>local</code> waits for the primary's flush only. <code>remote_write</code> waits for the standby's OS write. <code>on</code> waits for the standby's flush. <code>remote_apply</code> waits until the standby has replayed the commit, so reads on the standby see it. <code>off</code> does not wait for any flush. <code>synchronous_standby_names</code> chooses which standbys count. It can be a priority list (<code>FIRST n</code>) or a quorum (<code>ANY n</code>). If it is empty, replication is asynchronous, and <code>synchronous_commit = on</code> waits only for the primary's own flush, which is exactly the problem in the incident.</p>

<h3>4. Slots and hot standby conflicts</h3>
<p><b>Replication slots</b> make the primary keep WAL that a consumer has not received yet. That protects the consumer, but an inactive slot can fill <code>pg_wal</code>. <code>max_slot_wal_keep_size</code> caps the retained WAL. <b>Hot standby conflicts</b> are the other side effect: replay may need to remove rows that a standby query still reads. The query is cancelled after <code>max_standby_streaming_delay</code> unless <code>hot_standby_feedback</code> holds cleanup back on the primary, which can then bloat (chapter 7).</p>

<h3>5. The trade-off</h3>
<p>Waiting for a standby gives stronger protection, but every commit gets slower, and a standby outage can stall writes. A quorum survives one failure. Asynchronous replication keeps writes fast, but a failover can lose the newest commits. Write down the data-loss window you accept, and test failover under load. With <code>remote_apply</code> and no synchronous standby available, commits hang until one returns or the wait is cancelled, so the answer to the question in the problem is that they hang.</p>

<h3>6. Syntax</h3>
<pre>-- how far behind is each standby?
SELECT application_name, state, sync_state, sent_lsn, flush_lsn, replay_lsn, flush_lag, replay_lag
FROM pg_stat_replication;

-- who is stuck waiting for a synchronous standby?
SELECT count(*) FROM pg_stat_activity WHERE wait_event = 'SyncRep';

-- postgresql.conf on the primary
-- synchronous_commit = on
-- synchronous_standby_names = 'ANY 1 (s1, s2)'
-- max_slot_wal_keep_size = 50GB

-- slots: who is holding WAL?
SELECT slot_name, active, wal_status, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained
FROM pg_replication_slots;
SELECT pg_drop_replication_slot('old_standby');

-- on a standby with a long reporting query
-- hot_standby_feedback = on
-- max_standby_streaming_delay = 30s
SELECT datname, confl_snapshot, confl_lock FROM pg_stat_database_conflicts;

-- promote a standby
SELECT pg_promote();</pre>`, scenarios: [levels, fail, stall, slot] };
})();
