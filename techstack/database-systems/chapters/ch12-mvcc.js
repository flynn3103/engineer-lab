/* Chapter 12 · Concurrency control and MVCC: one seeded workload under 2PL, timestamp ordering, OCC and MVCC */
(function () {
  const SX_ = window.SX;
  const css = 'ch12-css';

  /*SIM-BEGIN*/
  /* Deterministic model of four protocols on one workload. Numbers are illustrative, not a benchmark. */
  const CLIENTS = 8, TICKS = 300, PER = 200;
  const LEVELS = { low: { keys: 64, l: 'Low: 64 rows' }, med: { keys: 16, l: 'Medium: 16 rows' }, high: { keys: 4, l: 'High: 4 rows' } };
  const PROTOS = [['2pl', '2PL, strict, deadlock detection'], ['to', 'Timestamp ordering'], ['occ', 'OCC, validate at commit'], ['mvcc', 'MVCC snapshots']];

  /* each client runs 4-operation transactions back to back; with longOn, client 1 runs 24-read reports */
  function makeScripts(keys, longOn, seed, rng) {
    const r = rng(seed);
    return Array.from({ length: CLIENTS }, (_, c) => Array.from({ length: PER }, () => {
      if (longOn && c === 0) return { ops: Array.from({ length: 24 }, () => ({ k: Math.floor(r() * keys), w: false })) };
      return { ops: Array.from({ length: 4 }, () => ({ k: Math.floor(r() * keys), w: r() < 0.5 })) };
    }));
  }

  /* returns one cycle of attempt ids in the waits-for graph, or null */
  function findCycle(g) {
    for (const start of g.keys()) {
      const path = [], onPath = new Set();
      const dfs = n => {
        path.push(n); onPath.add(n);
        for (const m of (g.get(n) || [])) {
          if (onPath.has(m)) return path.slice(path.indexOf(m));
          if (g.has(m)) { const r = dfs(m); if (r) return r; }
        }
        path.pop(); onPath.delete(n); return null;
      };
      const r = dfs(start);
      if (r) return r;
    }
    return null;
  }

  function run(proto, scripts, keys) {
    const st = { seq: 0, locks: new Map(), committed: [], rts: [], wts: [], vers: [] };
    for (let k = 0; k < keys; k++) { st.rts[k] = 0; st.wts[k] = 0; st.vers[k] = [{ cts: 0, owner: 0 }]; }
    const stats = { commits: 0, aborts: 0, waits: 0 };
    const cl = scripts.map((q, idx) => ({ q, j: 0, a: null, retry: 0, idx }));
    let nextId = 1;

    const lk = k => { if (!st.locks.has(k)) st.locks.set(k, { s: new Set(), x: 0 }); return st.locks.get(k); };
    const holders = (k, self) => { const L = st.locks.get(k); if (!L) return []; const out = [...L.s]; if (L.x) out.push(L.x); return out.filter(x => x !== self); };
    /* who a waiting attempt waits for: lock holders under 2PL, uncommitted writers under MVCC */
    const blockers = (k, self) => (proto === 'mvcc' ? st.vers[k].filter(v => v.owner && v.owner !== self).map(v => v.owner) : holders(k, self));
    const release = a => { for (const L of st.locks.values()) { L.s.delete(a.id); if (L.x === a.id) L.x = 0; } };

    function begin(a) { st.seq++; a.snap = st.seq; a.ts = st.seq; a.start = st.seq; }

    function op(a, o) {
      const k = o.k;
      if (proto === '2pl') {
        const L = lk(k);
        if (o.w ? holders(k, a.id).length > 0 : (L.x && L.x !== a.id)) return 'wait';
        if (o.w) { L.s.delete(a.id); L.x = a.id; } else L.s.add(a.id);
        return 'ok';
      }
      if (proto === 'to') {
        if (!o.w) { if (a.ts < st.wts[k]) return 'abort'; st.rts[k] = Math.max(st.rts[k], a.ts); return 'ok'; }
        if (a.ts < st.rts[k] || a.ts < st.wts[k]) return 'abort';
        a.undo.push([k, st.wts[k]]); st.wts[k] = a.ts; return 'ok';
      }
      if (proto === 'occ') { (o.w ? a.writes : a.reads).add(k); return 'ok'; }
      /* mvcc: reads pick a version and never wait or abort */
      const vs = st.vers[k];
      if (!o.w) return 'ok';
      if (vs.some(v => v.owner && v.owner !== a.id)) return 'wait';
      const last = vs.filter(v => v.owner === 0).pop();
      if (last.cts > a.snap) return 'abort';
      if (!vs.some(v => v.owner === a.id)) vs.push({ cts: -1, owner: a.id });
      a.writes.add(k);
      return 'ok';
    }

    function commit(a) {
      if (proto === '2pl') { release(a); return 'ok'; }
      if (proto === 'occ') {
        for (const C of st.committed) if (C.cseq > a.start && [...C.writes].some(k => a.reads.has(k) || a.writes.has(k))) return 'abort';
        a.cseq = ++st.seq; st.committed.push({ cseq: a.cseq, writes: a.writes }); return 'ok';
      }
      if (proto === 'mvcc') {
        for (const k of a.writes) { const v = st.vers[k].find(x => x.owner === a.id); if (v) { v.cts = ++st.seq; v.owner = 0; } }
      }
      return 'ok';
    }

    function undo(a) {
      if (proto === '2pl') release(a);
      else if (proto === 'to') { for (let i = a.undo.length - 1; i >= 0; i--) { const [k, prev] = a.undo[i]; if (st.wts[k] === a.ts) st.wts[k] = prev; } }
      else if (proto === 'mvcc') { for (const k of a.writes) st.vers[k] = st.vers[k].filter(v => v.owner !== a.id); }
    }

    function abort(c, t) { undo(c.a); c.a = null; stats.aborts++; c.retry = t + 1 + ((t + c.idx) % 3); }

    /* after each tick, find waits-for cycles and abort the youngest attempt in each */
    function detect(t) {
      for (;;) {
        const byId = new Map(), g = new Map();
        cl.forEach(c => { if (c.a) byId.set(c.a.id, c); });
        cl.forEach(c => { if (c.a && c.a.waitKey !== null) g.set(c.a.id, blockers(c.a.waitKey, c.a.id)); });
        const cyc = findCycle(g);
        if (!cyc) return;
        const victim = cyc.map(id => byId.get(id)).sort((x, y) => y.a.start - x.a.start)[0];
        abort(victim, t);
      }
    }

    /* MVCC: drop versions that no open snapshot can see */
    function gc() {
      let horizon = Infinity;
      cl.forEach(c => { if (c.a) horizon = Math.min(horizon, c.a.snap); });
      st.vers.forEach(vs => {
        let base = 0;
        vs.forEach((v, i) => { if (v.owner === 0 && v.cts <= horizon) base = i; });
        if (base > 0) vs.splice(0, base);
      });
    }

    for (let t = 0; t < TICKS; t++) {
      for (const c of cl) {
        if (!c.a) {
          if (c.j >= c.q.length || t < c.retry) continue;
          c.a = { id: nextId++, ops: c.q[c.j].ops, i: 0, snap: 0, ts: 0, start: 0, reads: new Set(), writes: new Set(), undo: [], waitKey: null };
          begin(c.a);
        }
        const a = c.a;
        if (a.i < a.ops.length) {
          const o = a.ops[a.i], r = op(a, o);
          if (r === 'ok') { a.i++; a.waitKey = null; }
          else if (r === 'wait') { stats.waits++; a.waitKey = o.k; }
          else abort(c, t);
        } else if (commit(a) === 'ok') {
          stats.commits++; c.j++; c.a = null;
        } else abort(c, t);
      }
      if (proto === '2pl' || proto === 'mvcc') detect(t);
      if (proto === 'mvcc') gc();
    }
    const kept = proto === 'mvcc' ? st.vers.reduce((n, vs) => n + vs.length, 0) : keys;
    return { commits: stats.commits, aborts: stats.aborts, waits: stats.waits, kept };
  }
  /*SIM-END*/

  const sec = SX_.sec, para = SX_.para, chip = SX_.chip, stat = SX_.stat, stepper = SX_.stepper;

  SX_.css(css, `
.c12-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.c12-box{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--card);font-size:13px;display:grid;gap:2px;color:var(--mut);align-content:start}
.c12-box b{color:var(--ink);font-size:13px}
.c12-box small{font-size:12px;line-height:1.35}
.c12-box.on{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 16%,var(--card))}
.c12-box.bad{border-color:var(--acc2);background:color-mix(in srgb,var(--acc2) 14%,var(--card))}
.c12-box.dead{opacity:.55}
.c12-facts{display:flex;flex-wrap:wrap;gap:6px}
.c12-arch{display:flex;flex-wrap:wrap;gap:6px}
.c12-comp{font-size:13px;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.c12-comp.c12-pick{border-color:var(--acc);color:var(--acc)}
.c12-def{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--soft);font-size:14px;color:var(--ink)}
.c12-def p{margin:4px 0 0;color:var(--mut)}
.c12-cs{display:grid;gap:10px}
.c12-scroll{overflow-x:auto}
.c12-scroll table{min-width:520px}
.c12-best td{font-weight:700;color:var(--ink);background:color-mix(in srgb,var(--acc) 14%,var(--card))}
.c12-play{display:grid;gap:10px}
`);

  /* ---- PLAYGROUND: four protocols, one seeded workload, two controls ---- */
  function playground(A) {
    let level = 'med', longOn = false;
    const out = h('div', { class: 'c12-scroll' }), note = h('p', { class: 'sx-txt' });
    const paint = () => {
      const keys = LEVELS[level].keys;
      const scripts = makeScripts(keys, longOn, 7, A.rng);
      const rows = PROTOS.map(([id, name]) => ({ name, r: run(id, scripts, keys) }));
      const best = rows.reduce((b, x) => (x.r.commits > b.r.commits ? x : b));
      out.replaceChildren(h('table', { class: 'sx-table' },
        h('thead', {}, h('tr', {}, ['Protocol', 'Commits', 'Aborts', 'Waits (client-ticks)', 'Commits per 100 ticks', 'Versions kept'].map(x => h('th', {}, x)))),
        h('tbody', {}, rows.map(x => h('tr', { class: x === best ? 'c12-best' : '' }, [
          h('td', {}, x.name), h('td', {}, String(x.r.commits)), h('td', {}, String(x.r.aborts)), h('td', {}, String(x.r.waits)),
          h('td', {}, String(Math.round(x.r.commits * 1000 / TICKS) / 10)), h('td', {}, String(x.r.kept))])))));
      note.textContent = 'Highest commit count at this setting: ' + best.name + ' (' + best.r.commits + ' commits in ' + TICKS + ' ticks). Read the row as a cost profile: waits, aborts and retained versions show where each protocol pays.';
    };
    const levelSeg = seg([{ v: 'low', l: LEVELS.low.l }, { v: 'med', l: LEVELS.med.l }, { v: 'high', l: LEVELS.high.l }], level, v => { level = v; paint(); });
    const longSeg = seg([{ v: false, l: 'Short transactions only' }, { v: true, l: 'Client 1 runs long reports' }], longOn, v => { longOn = v; paint(); });
    const legend = para('<b>2PL</b> waits for locks and aborts a deadlock victim. <b>Timestamp ordering</b> aborts any access that arrives out of timestamp order. <b>OCC</b> never waits, and aborts at commit when something it read was overwritten, or when a write it made conflicts with a committed write. <b>MVCC</b> never blocks or aborts a reader, but keeps old versions while any snapshot is open. Numbers come from one fixed seed: illustrative, not a benchmark.');
    paint();
    return h('div', { class: 'c12-play' }, h('div', { class: 'sx-controls' }, levelSeg, longSeg), out, note, legend);
  }

  /* ---- CASE STUDY: PostgreSQL row versions and VACUUM ---- */
  const PG_DEF = {
    heap: ['Heap page', 'A table is stored in pages. PostgreSQL defaults to 8 KB pages (representative). Each row version is a tuple inside a page, and the line pointer array points to each tuple.'],
    hdr: ['Tuple header: xmin, xmax, ctid', 'xmin is the transaction that created this version. xmax is the transaction that deleted or updated it, or empty if none. ctid is the tuple location (page, slot). An updated version points to its successor with ctid. (Representative of the PostgreSQL heap layout, not from the course text.)'],
    xid: ['Transaction id (xid)', 'Assigned when a transaction first writes. Every version records its creator and deleter with these ids.'],
    clog: ['pg_xact: the commit log', 'Records whether each xid is in progress, committed or aborted. Visibility checks read it. Hint bits cache the answer in the tuple header, so later readers skip the lookup.'],
    snap: ['Snapshot', 'The transactions that were still in progress when the statement or transaction started. A version is visible only if its creator is visible to the snapshot and its deleter is not.'],
    idx: ['Index', 'Points to the root of a version chain. A HOT update (representative PostgreSQL behavior) keeps the index unchanged, because the new version fits on the same page and no indexed column changed. The chain is then followed inside the page.'],
    vac: ['VACUUM', 'Removes dead tuples that no snapshot can still see, and frees their space for reuse. It runs by hand or in the background as autovacuum (representative PostgreSQL behavior; the course text gives the general garbage-collection design).']
  };

  const WRITE = [
    { t: 'Start: account 1 has one version, v1, with balance 100. Its xmin is 101, a transaction that committed long ago.', tuples: [{ n: 'v1 · balance 100', lines: ['xmin 101 · xmax empty', 'ctid (7,1)'], cls: 'on' }], facts: ['index: key 1 → (7,1)', 'xid 205: not started'] },
    { t: 'UPDATE starts as xid 205 and finds v1 as the version its snapshot can see. It sets v1 xmax to 205, which marks the row as being updated. The row is still visible until 205 commits.', tuples: [{ n: 'v1 · balance 100', lines: ['xmin 101 · xmax 205', 'ctid (7,1)'], cls: 'bad' }], facts: ['index: key 1 → (7,1)', 'xid 205: in progress'] },
    { t: 'The new version v2 (balance 90) is written in free space on the same page, with xmin 205.', tuples: [{ n: 'v1 · balance 100', lines: ['xmin 101 · xmax 205', 'ctid (7,1)'], cls: '' }, { n: 'v2 · balance 90', lines: ['xmin 205 · xmax empty', 'ctid (7,2)'], cls: 'on' }], facts: ['index: key 1 → (7,1)', 'xid 205: in progress'] },
    { t: 'v1 gets ctid (7,2), so a reader that lands on v1 can follow the chain to v2.', tuples: [{ n: 'v1 · balance 100', lines: ['xmin 101 · xmax 205', 'ctid (7,2)'], cls: '' }, { n: 'v2 · balance 90', lines: ['xmin 205 · xmax empty', 'ctid (7,2)'], cls: 'on' }], facts: ['index: key 1 → (7,1)', 'xid 205: in progress'] },
    { t: 'The key did not change and v2 fits on the same page, so this is a HOT update. The index is not touched. Its entry still leads to v1, and the chain leads on to v2.', tuples: [{ n: 'v1 · balance 100', lines: ['xmin 101 · xmax 205', 'ctid (7,2)'], cls: '' }, { n: 'v2 · balance 90', lines: ['xmin 205 · xmax empty', 'ctid (7,2)'], cls: 'on' }], facts: ['index: key 1 → (7,1), unchanged', 'xid 205: in progress'] },
    { t: 'COMMIT: the status of xid 205 goes to pg_xact as committed. The commit record goes to the WAL (chapter 13). No data page is rewritten for the commit itself.', tuples: [{ n: 'v1 · balance 100', lines: ['xmin 101 · xmax 205', 'ctid (7,2)'], cls: '' }, { n: 'v2 · balance 90', lines: ['xmin 205 · xmax empty', 'ctid (7,2)'], cls: 'on' }], facts: ['index: key 1 → (7,1), unchanged', 'xid 205: committed'] }
  ];

  const VAC = [
    { t: 'Start: v1 was updated by xid 205, and 205 committed. A report that started earlier still has an oldest snapshot xmin of 150, so it may need v1.', tuples: [{ n: 'v1 · balance 100', lines: ['xmax 205 (committed)', 'ctid (7,2)'], cls: '' }, { n: 'v2 · balance 90', lines: ['xmin 205 · live'], cls: 'on' }], facts: ['oldest snapshot xmin: 150'] },
    { t: 'VACUUM checks v1. It was replaced by 205, but 205 is newer than the oldest snapshot. v1 stays, because the report may still see it.', tuples: [{ n: 'v1 · balance 100', lines: ['xmax 205 (committed)', 'removable: no'], cls: 'bad' }, { n: 'v2 · balance 90', lines: ['xmin 205 · live'], cls: 'on' }], facts: ['oldest snapshot xmin: 150'] },
    { t: 'The report ends. The oldest snapshot now started after 205, so the horizon moves forward to 300.', tuples: [{ n: 'v1 · balance 100', lines: ['xmax 205 (committed)', 'dead to every snapshot'], cls: 'dead' }, { n: 'v2 · balance 90', lines: ['xmin 205 · live'], cls: 'on' }], facts: ['oldest snapshot xmin: 300'] },
    { t: 'VACUUM removes v1. Its line pointer is marked unused and its space can be reused. The page keeps only v2.', tuples: [{ n: 'v2 · balance 90', lines: ['xmin 205 · live', 'ctid (7,2)'], cls: 'on' }], facts: ['oldest snapshot xmin: 300', 'page: one live tuple'] }
  ];

  function pgView(s) {
    return [
      h('div', { class: 'c12-grid' }, s.tuples.map(t => h('div', { class: 'c12-box ' + (t.cls || '') }, h('b', {}, t.n), t.lines.map(l => h('small', {}, l))))),
      h('div', { class: 'c12-facts' }, s.facts.map(f => chip(f, '')))
    ];
  }

  function caseStudy() {
    const comp = h('div', { class: 'c12-arch' }), def = h('div', { class: 'c12-def', 'aria-live': 'polite' });
    const show = k => {
      [...comp.children].forEach(b => b.classList.toggle('c12-pick', b.getAttribute('data-k') === k));
      def.replaceChildren(h('b', {}, PG_DEF[k][0]), h('p', { html: PG_DEF[k][1] }));
    };
    Object.keys(PG_DEF).forEach(k => comp.append(h('button', { class: 'c12-comp', 'data-k': k, onclick: () => show(k) }, PG_DEF[k][0])));
    show('hdr');
    return h('div', { class: 'c12-cs' },
      para('Components: click one to see what it stores. Xids and page numbers are illustrative.'),
      comp, def,
      para('<b>Write path: UPDATE accounts SET balance = 90 WHERE id = 1</b>, as xid 205.'),
      stepper(WRITE, pgView),
      para('<b>Cleanup: VACUUM with an old snapshot still open.</b> The same row, with a report that began before the update.'),
      stepper(VAC, pgView));
  }

  /* ---- COMMON PROBLEMS ---- */
  function lockDemo(mode) {
    const bad = mode === 'bad';
    const locksStart = { A: '', B: '' };
    const S = bad ? [
      { t: 'Start: T1 and T2 both need rows A and B. T1 locks A then B. T2 locks B then A.', locks: locksStart, waits: [], commits: 0, aborts: 0, tick: 0 },
      { t: 'T1 takes an exclusive lock on A. T2 takes an exclusive lock on B.', locks: { A: 'T1 (X)', B: 'T2 (X)' }, waits: [], commits: 0, aborts: 0, tick: 1 },
      { t: 'T1 asks for B. T2 holds it, so T1 waits for T2.', locks: { A: 'T1 (X)', B: 'T2 (X)' }, waits: ['T1 waits for T2'], commits: 0, aborts: 0, tick: 2 },
      { t: 'T2 asks for A. T1 holds it, so T2 waits for T1. The waits form a cycle, and neither lock will be released.', locks: { A: 'T1 (X)', B: 'T2 (X)' }, waits: ['T1 waits for T2', 'T2 waits for T1'], commits: 0, aborts: 0, tick: 3 },
      { t: 'The deadlock detector finds the cycle and picks T2, the younger transaction, as the victim.', locks: { A: 'T1 (X)', B: 'T2 (X)' }, waits: ['T1 waits for T2', 'T2 waits for T1'], commits: 0, aborts: 0, tick: 4 },
      { t: 'T2 is rolled back with ERROR: deadlock detected. Its work is lost, and the application must retry it. T1 gets B and commits.', locks: locksStart, waits: [], commits: 1, aborts: 1, tick: 5 }
    ] : [
      { t: 'Start: the same two transactions. This time both lock in one global order, A before B.', locks: locksStart, waits: [], commits: 0, aborts: 0, tick: 0 },
      { t: 'T1 takes A and B, in that order. T2 wants A, so T2 waits for T1. T1 waits for nobody, so no cycle can form.', locks: { A: 'T1 (X)', B: 'T1 (X)' }, waits: ['T2 waits for T1'], commits: 0, aborts: 0, tick: 1 },
      { t: 'T1 commits and releases A and B. T2 gets A at once.', locks: { A: 'T2 (X)', B: '' }, waits: [], commits: 1, aborts: 0, tick: 2 },
      { t: 'T2 takes B and commits. Both transactions finished on the first try.', locks: locksStart, waits: [], commits: 2, aborts: 0, tick: 3 }
    ];
    const draw = s => [
      h('div', { class: 'c12-grid' }, Object.keys(s.locks).map(k => h('div', { class: 'c12-box ' + (s.locks[k] ? 'on' : '') }, h('b', {}, 'row ' + k), h('small', {}, s.locks[k] || 'free')))),
      h('div', { class: 'c12-facts' }, s.waits.length ? s.waits.map(w => chip(w, '')) : [chip('no waits', '')]),
      h('div', { class: 'c12-grid' }, [stat('commits', s.commits), stat('aborts', s.aborts), stat('tick', s.tick)])
    ];
    return stepper(S, draw);
  }

  function retryDemo(mode) {
    const bad = mode === 'bad';
    const seq = bad
      ? [['T1', 'ok'], ['T2', '40001'], ['T3', 'ok'], ['T4', '40001'], ['T5', 'ok']]
      : [['T1', 'ok'], ['T2', '40001'], ['T2 retry', 'ok'], ['T3', 'ok'], ['T4', '40001'], ['T4 retry', 'ok'], ['T5', 'ok']];
    const S = [{ t: 'Start: five transfers arrive. Some of them conflict with another transfer on the same account.', rows: [] }];
    seq.forEach(([who, res], i) => {
      const row = { who, res, lost: bad && res === '40001' };
      const rows = S[S.length - 1].rows.concat([row]);
      let t;
      if (res === 'ok') t = who + ' commits.';
      else if (bad) t = who + ' gets SQLSTATE 40001 (could not serialize access). The app returns HTTP 500 and never retries, so the transfer is lost.';
      else t = who + ' gets SQLSTATE 40001. The app sees it and runs the whole transaction again.';
      S.push({ t: t, rows });
    });
    const draw = s => {
      const committed = s.rows.filter(r => r.res === 'ok').length, lost = s.rows.filter(r => r.lost).length;
      return [
        h('div', { class: 'c12-grid' }, s.rows.map(r => h('div', { class: 'c12-box ' + (r.res === 'ok' ? 'on' : 'bad') }, h('b', {}, r.who), h('small', {}, r.res === 'ok' ? 'committed' : 'SQLSTATE 40001')))),
        h('div', { class: 'c12-grid' }, [stat('attempts', s.rows.length), stat('committed', committed), stat('lost', lost)])
      ];
    };
    return stepper(S, draw);
  }

  function bloatDemo(mode) {
    const bad = mode === 'bad';
    let kept = 1;
    const S = [{ t: bad ? 'Start: one row with one live version. A reporting session opened a transaction and has not ended it.' : 'Start: one row with one live version. The same reporting session has its transaction open.', kept: 1, open: true, upd: 0 }];
    for (let s = 1; s <= 8; s++) {
      const open = bad || s <= 2;
      kept += 1;
      if (!open) kept = 1;
      let t;
      if (bad) t = 'Update ' + s + ': a new version is written. The open session keeps its snapshot, so VACUUM cannot remove the ' + (kept - 1) + ' dead version(s).';
      else if (open) t = 'Update ' + s + ': a new version is written. The session is still open, so ' + (kept - 1) + ' dead version' + (kept - 1 === 1 ? ' stays' : 's stay') + '.';
      else if (s === 3) t = 'The idle session is ended before update 3. Update 3 writes a version, and VACUUM now removes every dead version.';
      else t = 'Update ' + s + ': a new version is written, and VACUUM removes the one dead version at once.';
      S.push({ t, kept, open: open, upd: s });
    }
    const draw = s => {
      const boxes = Array.from({ length: s.kept }, (_, i) => {
        const live = i === s.kept - 1;
        return h('div', { class: 'c12-box ' + (live ? 'on' : (s.open && !live ? 'bad' : 'dead')) }, h('b', {}, live ? 'live version' : 'dead version'), h('small', {}, live ? 'newest' : (s.open ? 'kept for the open snapshot' : 'waiting for VACUUM')));
      });
      return [
        h('div', { class: 'c12-grid' }, boxes),
        h('div', { class: 'c12-facts' }, [chip(s.open ? 'reader: transaction open' : 'reader: ended', '')]),
        h('div', { class: 'c12-grid' }, [stat('updates', s.upd), stat('versions kept', s.kept)])
      ];
    };
    return stepper(S, draw);
  }

  function hotDemo(mode) {
    const bad = mode === 'bad';
    const S = [];
    let att = bad ? 0 : 10, ab = 0, queued = 0, done = 0;
    const left0 = 10;
    S.push({ t: bad ? 'Start: ten clients read the counter at version 0 and each try to write version 1.' : 'Start: ten clients each run one atomic UPDATE that adds 1 to the same row.', att, ab, queued, done, left: left0 });
    let left = left0;
    for (let r = 1; r <= 10; r++) {
      const before = left;
      if (bad) { att += before; ab += before - 1; left -= 1; done += 1; }
      else { queued += before - 1; left -= 1; done += 1; }
      const t = bad
        ? 'Round ' + r + ': ' + before + ' clients try to write. One succeeds; the other ' + (before - 1) + ' see a changed version and must retry.'
        : 'Round ' + r + ': the first client holds the row lock and commits. The other ' + (before - 1) + ' wait in the lock queue, with no retry.';
      S.push({ t, att, ab, queued, done, left });
    }
    const draw = s => {
      const boxes = Array.from({ length: 10 }, (_, i) => i < s.done
        ? h('div', { class: 'c12-box on' }, h('b', {}, 'client ' + (i + 1)), h('small', {}, 'committed'))
        : h('div', { class: 'c12-box ' + (bad ? 'bad' : '') }, h('b', {}, 'client ' + (i + 1)), h('small', {}, bad ? 'retrying' : 'waiting for lock')));
      return [
        h('div', { class: 'c12-grid' }, boxes),
        h('div', { class: 'c12-grid' }, [stat('attempts', s.att), stat('aborted', s.ab), stat('queued', s.queued), stat('commits', s.done)])
      ];
    };
    return stepper(S, draw);
  }

  const PROBLEMS = [
    { tab: 'Opposite lock order', sym: '<b>Deadlock</b> errors appear under load, and the same two transfers fail again on each retry.',
      why: 'Each transaction holds one lock and waits for the lock the other holds. Neither can move first, so the database must abort one victim.',
      log: '-- representative PostgreSQL log, wording varies by version\nERROR:  deadlock detected\nDETAIL:  Process 4412 waits for ShareLock on transaction 918; blocked by process 4417.\n         Process 4417 waits for ShareLock on transaction 917; blocked by process 4412.\nHINT:  See server log for query details.',
      demo: lockDemo,
      fix: ['Take locks in one global order, such as ascending account id, in every code path that touches both rows.', 'Lock all the rows in one statement with ORDER BY id and FOR UPDATE, so the order is fixed in one place.', 'Keep transactions short. Do not call a remote service while row locks are held.', 'Retry on SQLSTATE 40P01 (deadlock detected) with a small random backoff, and log the victim statement.', 'Verify: run the two transfers in both orders with 20 concurrent sessions. The deadlock count should be 0.'] },
    { tab: 'Serialization errors not retried', sym: '<b>Some transfers vanish.</b> The logs show SQLSTATE 40001 on a few requests, and nothing is retried.',
      why: 'Under snapshot isolation or serializable, the database aborts one of two conflicting transactions so the result stays correct. That abort is a normal outcome, and the application must run the transaction again. Treated as a failure, it loses the work.',
      log: '-- representative PostgreSQL error at REPEATABLE READ or SERIALIZABLE\nERROR:  could not serialize access due to concurrent update\nSQLSTATE: 40001\n-- representative application log\nPOST /transfer  status=500  account=1842  amount=50  sqlstate=40001',
      demo: retryDemo,
      fix: ['Wrap the whole transaction, not one statement, in a retry loop for SQLSTATE 40001 and 40P01 (PostgreSQL codes, representative).', 'Use a bounded number of retries with jittered backoff, then return a clear error to the caller.', 'Make the transfer idempotent: store a request id in the same transaction, so a retry cannot apply the transfer twice.', 'Verify: force a conflict in a test. Every request must end in a commit or a bounded error, and the balances must sum to the expected total.'] },
    { tab: 'Long-lived snapshots', sym: '<b>Table bloat</b> grows during the day, even though VACUUM runs every night.',
      why: 'VACUUM may remove a dead version only when no open snapshot can still see it. One idle transaction keeps an old snapshot alive, so every version created after it is retained.',
      log: '-- representative PostgreSQL output, counts illustrative\nVACUUM VERBOSE orders;\nINFO:  "orders": found 0 removable, 1843920 nonremovable row versions\nDETAIL:  1843912 dead row versions cannot be removed yet, oldest xmin: 2947103\n-- representative pg_stat_activity columns for the session that holds the old snapshot\nstate: idle in transaction   backend_xmin: 2947103   xact_start: 06:12',
      demo: bloatDemo,
      fix: ['End idle transactions. Set idle_in_transaction_session_timeout (a PostgreSQL setting, representative) so a session that sits in a transaction cannot pin the horizon.', 'Split long reads into short batches, each in its own transaction, so no single snapshot lasts for hours.', 'Find the blocker first: sort pg_stat_activity by the oldest xact_start and the oldest backend_xmin, then end or fix that session.', 'Verify: after the session ends, VACUUM VERBOSE reports 0 dead row versions that cannot be removed.'] },
    { tab: 'Hot row', sym: '<b>Throughput stalls</b> at a few commits per second on one counter, while attempts keep climbing.',
      why: 'Every client writes the same row. With optimistic checks, all but one attempt fail and retry. With locking, the rest queue behind one lock. Either way the hot row serializes the work.',
      log: '-- representative application metrics, 10 clients on one counter row\nattempts/s    412\ncommits/s      10\nretries/s     402   (UPDATE ... WHERE version = $1 affected 0 rows)',
      demo: hotDemo,
      fix: ['Replace read-modify-write with one atomic statement: UPDATE counters SET n = n + 1 WHERE id = $1. The row lock serializes it without retries.', 'Shard a hot counter into N rows and sum them on read, so writers rarely share a row.', 'Batch increments in the application and write them every few hundred milliseconds.', 'Verify: attempts per commit should approach 1, and the retry or abort count should be near 0.'] }
  ];

  PG.mvcc = function (root, A) {
    root.append(
      sec('1 · The problem',
        para('Thousands of transactions compete for the same rows. A transfer reads one balance, writes another, and a report reads both while it runs.'),
        para('Each transaction must look as if it ran alone, but waiting for every other transaction would make the system crawl. Some work has to wait, abort, or read an older version.'),
        h('p', { class: 'sx-q', html: 'When two transactions want the same row, which one should wait, which should abort, and which should read an older version?' })),
      sec('2 · Core idea and mechanisms',
        para('<b>Core idea:</b> concurrency-control protocols choose whether conflicting work waits, aborts, or reads another version. Anomaly names and their definitions are in chapter 11.'),
        h('ul', { class: 'sx-list', html: [
          '<b>Locks and the lock manager.</b> Shared (S) locks let many readers share an object. Exclusive (X) locks give one writer the object. The lock manager grants or blocks each request. Locks protect data for transactions; latches protect the engine\'s own structures and are not covered here.',
          '<b>Two-phase locking (2PL).</b> A transaction grows its lock set, then shrinks it, and the schedule stays conflict serializable. Strict 2PL holds locks until commit, so no transaction reads another\'s uncommitted write and cascading aborts cannot happen. Two-phase locking is not two-phase commit, which is chapter 14.',
          '<b>Deadlock handling.</b> Detection builds a waits-for graph, finds a cycle, and aborts a victim, usually the youngest or the one with the least work done. Prevention uses timestamps. Wait-die: an older requester waits, a younger one dies. Wound-wait: an older requester wounds the holder, a younger one waits.',
          '<b>Lock granularity.</b> Locks form a hierarchy of database, table, page and tuple. Intention locks (IS, IX, SIX) tell coarser levels that finer locks exist below, so a table lock conflicts with tuple locks without visiting each tuple.',
          '<b>Timestamp ordering (T/O).</b> Each transaction gets a fixed timestamp. Each object records its last read and write timestamps. An access that arrives out of timestamp order aborts instead of waiting. Restarts get a new timestamp.',
          '<b>Optimistic concurrency control (OCC).</b> A transaction reads and writes its private workspace without waiting. At commit it validates that no transaction which committed during its lifetime wrote something it read or wrote. A failed validation aborts and restarts it. OCC suits low conflict.',
          '<b>Phantoms and isolation levels.</b> Chapter 11 owns these anomalies and the isolation levels that allow them.'
        ].map(x => '<li>' + x + '</li>').join('') }),
        h('div', { class: 'c12-scroll' }, h('table', { class: 'sx-table' },
          h('thead', {}, h('tr', {}, ['Requested / held', 'none', 'S (other transaction)', 'X (other transaction)'].map(x => h('th', {}, x)))),
          h('tbody', {}, [
            ['S (read)', 'granted', 'granted', 'wait'],
            ['X (write)', 'granted', 'wait', 'wait']
          ].map(r => h('tr', {}, r.map(c => h('td', {}, c))))))),
        para('An S request is compatible only with S. An X request is compatible with nothing, so it waits for every other holder. The lock manager grants a request only when the matrix allows it.'),
        h('ul', { class: 'sx-list', html: [
          '<b>MVCC.</b> The database keeps several physical versions of each row. A reader uses a snapshot and never waits for a writer, and a writer blocks only another writer of the same row. A write conflict follows first-writer-wins. Snapshot isolation still allows write skew, which is chapter 11.',
          '<b>Version storage.</b> Append-only: versions sit in the table, chained newest to oldest, so index lookups reach the newest version. Time-travel: the old version is copied to a side table on update. Delta: only the changes are stored, and a reader applies them in reverse.',
          '<b>Garbage collection.</b> A version is reclaimable when no active transaction can see it, or when the transaction that created it aborted. Tuple-level: background vacuuming scans pages, and a dirty-page bitmap lets it skip pages that did not change; cooperative cleaning runs while a worker walks a chain. Transaction-level: each transaction tracks its own old versions and frees them when it finishes.',
          '<b>Index management.</b> Primary key indexes point to the head of the version chain. Secondary indexes point to a logical tuple id, so an update changes one mapping, or to a physical address, so every index changes on each new version. Indexes can hold duplicate keys for different snapshots.',
          '<b>Deletes.</b> A deleted flag or a tombstone version records a logical delete. The physical tuple is removed only when no version is visible.'
        ].map(x => '<li>' + x + '</li>').join('') })),
      sec('3 · Playground: four protocols, one workload', playground(A)),
      sec('4 · Case study · PostgreSQL row versions and VACUUM',
        para('The PostgreSQL facts in this case study and in the problems are representative of its documented design. They are not from the course text, so check them against your PostgreSQL version.'),
      para('PostgreSQL is an MVCC system. An UPDATE writes a new row version and keeps the old one, so readers with older snapshots still find it. VACUUM later removes the versions that no snapshot can see.'),
        caseStudy()),
      sec('5 · Common problems · what breaks in production?', SX_.problems(PROBLEMS))
    );
  };
})();
