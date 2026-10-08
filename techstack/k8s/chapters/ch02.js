/* Chapter 2 "etcd, resourceVersion and Watch": a revision tape with two writers, a watch cursor and a quota gauge (index 2).
   Loads after course.js and scene-tools.js. Revision numbers and sizes are illustrative. */
(function () {
  const KH = window.KH, W = 640, H = 420;
  const FOOT = 'Simplified. Revision numbers and sizes are illustrative.';

  /* ---------- 1. Lost update vs compare-and-swap ---------- */
  const RV = [40, 41, 42, 43, 44];
  const cas = {
    id: 'cas', label: 'Lost update or 409', desc: 'A release tool and an autoscaler both read revision 41. Without a check the second write erases the first. With compare-and-swap it gets 409 and retries.',
    codeLabel: 'API',
    code: { bug: ['PUT /apis/apps/v1/namespaces/prod/deployments/web   # no resourceVersion: blind write', 'PUT ... metadata.resourceVersion: "41"                      # compare-and-swap', 'Operation cannot be fulfilled on deployments.apps "web": the object has been modified; please apply your changes to the latest version and try again', 'PATCH ... {"spec":{"replicas":5}}                            # re-read, then apply on top'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'Deployment web · two writers', right: s.r || '' }),
      setup(kit) {
        const A = kit.chip(null, { x: 16, y: 84, w: 160, h: 50, label: 'release tool', sub: 'wants image v2', tone: 'info' });
        const B = kit.chip(null, { x: 16, y: 164, w: 160, h: 50, label: 'autoscaler', sub: 'wants replicas 5', tone: 'info' });
        const obj = kit.chip(null, { x: 256, y: 104, w: 190, h: 90, label: 'web rv 41', sub: 'image v1 · replicas 3', tone: 'live', r: 14 });
        const res = kit.chip(null, { x: 476, y: 104, w: 148, h: 90, label: 'result', sub: '', tone: 'info', r: 14 });
        const tape = kit.strip(null, { x: 16, y: 244, items: RV.map(v => ({ id: 'r' + v, label: 'rv ' + v })), w: 60, h: 30, gap: 8, tone: 'info' });
        const tl = kit.text(null, { x: 16, y: 234, t: 'etcd history, newest on the right', cls: 'kt sm mut' });
        const ar = KH.links(kit, [
          { id: 'a', x1: 176, y1: 109, x2: 256, y2: 130, label: 'PUT' }, { id: 'b', x1: 176, y1: 189, x2: 256, y2: 168, label: 'PUT', dy: 14 },
          { id: 'ro', x1: 176, y1: 119, x2: 256, y2: 140, label: 'GET', dy: -14 }
        ]);
        return { A, B, obj, res, tape, tl, ar };
      },
      frame(s, kit, R) {
        const o = s.obj || { rv: 41, img: 'v1', rep: 3 };
        R.obj.set({ label: 'web rv ' + o.rv, sub: 'image ' + o.img + ' · replicas ' + o.rep, tone: s.lost ? 'warn' : 'live', hl: !!s.lost });
        R.A.set({ sub: s.a || 'wants image v2', tone: s.aT || 'info' });
        R.B.set({ sub: s.b || 'wants replicas 5', tone: s.bT || 'info' });
        R.res.set({ label: s.resL || 'result', sub: s.resS || '', tone: s.resT || 'info' });
        RV.forEach(v => R.tape['r' + v].set({ show: v <= (s.top || 41) && v >= 40, tone: v === (s.top || 41) ? 'live' : 'info' }));
        R.ar.only(s.ar || [], s.arBad || []);
      }
    },
    bug: [
      { log: 'Both tools read Deployment web at resourceVersion 41. Each one now holds a full copy with image v1 and replicas 3.', callout: 'Two clients hold a copy at rv 41', code: 0, state: { obj: { rv: 41, img: 'v1', rep: 3 }, a: 'holds rv 41', b: 'holds rv 41', top: 41, ar: ['ro'], r: 'both read rv 41' }, stats: [{ l: 'current rv', v: '41' }, { l: 'writers', v: '2' }] },
      { log: 'The release tool sends its full object with image v2. The store accepts it and the object moves to revision 42.', callout: 'The release tool writes image v2: rv 42', code: 0, state: { obj: { rv: 42, img: 'v2', rep: 3 }, a: 'wrote v2', aT: 'ok', b: 'holds rv 41', top: 42, ar: ['a'], r: 'rv 42' }, stats: [{ l: 'current rv', v: '42', cls: 'ok' }, { l: 'image', v: 'v2', cls: 'ok' }] },
      { log: 'The autoscaler sends its older copy with replicas 5 and no version check. The write wins and brings back image v1, so the release is lost without any error.', callout: 'Blind write: the old image comes back, no error', code: 0, state: { obj: { rv: 43, img: 'v1', rep: 5 }, a: 'wrote v2', aT: 'warn', b: 'wrote replicas 5', bT: 'ok', top: 43, lost: true, ar: ['b'], resL: 'LOST UPDATE', resS: 'image v1 again', resT: 'warn', r: 'rv 43, image v1' }, stats: [{ l: 'image', v: 'v1', cls: 'bad' }, { l: 'error logged', v: 'none', cls: 'bad' }] },
      { log: 'That is last writer wins. Replaying the same race with compare-and-swap: both clients read revision 41 again, and every update must carry the revision it read.', callout: 'Replay: every update carries its resourceVersion', code: 1, state: { obj: { rv: 41, img: 'v1', rep: 3 }, a: 'holds rv 41', b: 'holds rv 41', top: 41, ar: ['ro'], r: 'replay with CAS' }, stats: [{ l: 'current rv', v: '41' }, { l: 'check', v: 'on', cls: 'ok' }] },
      { log: 'The release tool updates with resourceVersion 41. The stored object is still at 41, so the write succeeds and the object moves to 42.', callout: 'Revision matches: the write is accepted', code: 1, state: { obj: { rv: 42, img: 'v2', rep: 3 }, a: 'wrote v2', aT: 'ok', b: 'holds rv 41', top: 42, ar: ['a'], r: 'rv 42' }, stats: [{ l: 'current rv', v: '42', cls: 'ok' }, { l: 'image', v: 'v2', cls: 'ok' }] },
      { log: 'The autoscaler sends resourceVersion 41, but the object is at 42. The API server answers 409 Conflict: the object has been modified.', callout: 'Stale revision: HTTP 409 Conflict', moment: true, code: 2, state: { obj: { rv: 42, img: 'v2', rep: 3 }, a: 'wrote v2', aT: 'ok', b: 'got 409', bT: 'warn', top: 42, ar: ['b'], arBad: ['b'], resL: '409 Conflict', resS: 'nothing overwritten', resT: 'warn', r: '409' }, stats: [{ l: 'status', v: '409', cls: 'warn' }, { l: 'image', v: 'v2', cls: 'ok' }] },
      { log: 'The client re-reads the object at revision 42 and applies only its own change, replicas 5, on top of the newer copy.', callout: 'Re-read at rv 42 and apply on top', code: 3, state: { obj: { rv: 42, img: 'v2', rep: 3 }, a: 'wrote v2', aT: 'ok', b: 'holds rv 42', top: 42, ar: ['ro'], r: 're-read' }, stats: [{ l: 'current rv', v: '42' }, { l: 'retry', v: '1', cls: 'warn' }] },
      { log: 'The second write now carries revision 42 and succeeds, so the object has both changes: image v2 and replicas 5.', callout: 'Both changes survive', code: 3, state: { obj: { rv: 43, img: 'v2', rep: 5 }, a: 'wrote v2', aT: 'ok', b: 'wrote replicas 5', bT: 'ok', top: 43, ar: ['b'], resL: 'both kept', resS: 'v2 · replicas 5', resT: 'ok', r: 'rv 43' }, stats: [{ l: 'image', v: 'v2', cls: 'ok' }, { l: 'replicas', v: '5', cls: 'ok' }],
        takeaway: 'An update succeeds only if the revision it read is still current. A stale writer gets 409 and must re-read, never overwrite.' }
    ],
  };

  /* ---------- 2. Watch from a revision, compaction and 410 Gone ---------- */
  const X0 = 24, X1 = 616, R0 = 38000, R1 = 40000;
  const xr = r => X0 + (r - R0) / (R1 - R0) * (X1 - X0);
  const watch = {
    id: 'watch', label: 'Watch and 410 Gone', desc: 'A controller resumes a watch from an old revision. Compaction has removed that history, so the API server answers 410 Gone and the controller must list again.',
    codeLabel: 'API',
    code: { bug: ['GET /api/v1/pods?watch=1&resourceVersion=38120', 'GET /api/v1/pods?watch=1&resourceVersion=38120    # after a restart', 'too old resource version: 38120 (39000)           # HTTP 410 Gone', 'GET /api/v1/pods            # list again, then watch from its resourceVersion'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'etcd revisions 38000 .. 40000', right: s.r || '' }),
      setup(kit) {
        const gone = kit.el('rect', { x: X0, y: 130, width: 1, height: 44, rx: 8 }, kit.layer);
        gone.style.fill = 'color-mix(in srgb, var(--bad) 12%, var(--card))'; gone.style.stroke = 'var(--bad)'; gone.style.strokeDasharray = '5 3'; gone.style.transition = 'width .6s';
        const kept = kit.el('rect', { x: X0, y: 130, width: 1, height: 44, rx: 8 }, kit.layer);
        kept.style.fill = 'color-mix(in srgb, var(--ok) 22%, var(--card))'; kept.style.stroke = 'var(--ink)'; kept.style.transition = 'x .6s, width .6s';
        const t1 = kit.text(null, { x: X0 + 6, y: 120, t: 'compacted away', cls: 'kt sm mut' });
        const t2 = kit.text(null, { x: X1, y: 120, t: 'history kept', cls: 'kt sm mut', anchor: 'end' });
        const cur = kit.chip(null, { x: xr(38120) - 52, y: 196, w: 104, h: 44, label: 'watcher', sub: 'rv 38120', tone: 'cursor' });
        const head = kit.chip(null, { x: xr(38150) - 52, y: 76, w: 104, h: 36, label: 'head', sub: 'rv 38150', tone: 'live', small: true });
        const comp = kit.chip(null, { x: xr(39000) - 52, y: 76, w: 104, h: 36, label: 'oldest', sub: 'rv 38000', tone: 'info', small: true });
        const ans = kit.chip(null, { x: 16, y: 262, w: 300, h: 40, label: '', sub: '', tone: 'info', show: false });
        const cost = kit.bars(null, { x: 340, y: 276, w: 284, labelW: 80, items: [{ id: 'l', label: 'objects read' }], max: 100, unit: '%', title: 'cost of a full list' });
        return { gone, kept, cur, head, comp, ans, cost };
      },
      frame(s, kit, R) {
        const lo = s.lo || 38000, head = s.head || 38150, cur = s.cur || 38120;
        R.gone.setAttribute('width', Math.max(1, xr(lo) - X0));
        R.kept.setAttribute('x', xr(lo)); R.kept.setAttribute('width', Math.max(1, xr(head) - xr(lo)));
        R.head.set({ x: Math.min(xr(head) - 52, 520), label: 'head', sub: 'rv ' + head });
        R.comp.set({ x: Math.max(xr(lo) - 52, 16), label: 'oldest', sub: 'rv ' + lo, tone: lo > 38000 ? 'warn' : 'info' });
        R.cur.set({ x: Math.min(Math.max(xr(cur) - 52, 16), 520), sub: 'rv ' + cur, tone: s.stale ? 'warn' : 'cursor' });
        R.ans.set({ show: !!s.ans, label: s.ans || '', tone: s.ansT || 'info', w: 300 });
        R.cost.set('l', s.cost || 0, s.cost > 60 ? 'warn' : 'ok', (s.cost || 0) ? s.cost + '%' : '0');
      }
    },
    bug: [
      { log: 'A controller lists pods once and gets their resourceVersion, 38120. It then opens a watch from that revision, and events stream to it as they happen.', callout: 'List once, then watch from its revision', code: 0, state: { lo: 38000, head: 38150, cur: 38120, r: 'watching' }, stats: [{ l: 'resume point', v: '38120' }, { l: 'history', v: 'from 38000' }] },
      { log: 'The controller loses its connection and stays down for a while. Writes continue, so the head of history moves forward, but its resume point stays at 38120.', callout: 'The cluster moves on without the controller', code: 1, state: { lo: 38000, head: 39800, cur: 38120, stale: true, r: 'controller away' }, stats: [{ l: 'head', v: '39800' }, { l: 'resume point', v: '38120', cls: 'warn' }] },
      { log: 'The API server asks etcd to compact about every 5 minutes. History older than revision 39000 is removed to keep the database small.', callout: 'Compaction removes history before 39000', code: 1, state: { lo: 39000, head: 39800, cur: 38120, stale: true, r: 'compacted to 39000' }, stats: [{ l: 'oldest kept', v: '39000', cls: 'warn' }, { l: 'resume point', v: '38120', cls: 'bad' }] },
      { log: 'The controller resumes the watch from 38120, which is older than the oldest revision kept. The server can no longer replay those events and answers HTTP 410 Gone.', callout: 'Resume point too old: HTTP 410 Gone', moment: true, code: 2, state: { lo: 39000, head: 39800, cur: 38120, stale: true, ans: '410 Gone: too old resource version', ansT: 'warn', r: '410 Gone' }, stats: [{ l: 'status', v: '410', cls: 'bad' }, { l: 'events replayed', v: '0', cls: 'bad' }] },
      { log: 'The controller has to list again. A full list reads every object at the current revision, which costs more than a watch resume.', callout: 'Relist: read everything at the current revision', code: 3, state: { lo: 39000, head: 39800, cur: 39800, ans: 'relist at rv 39800', ansT: 'cursor', cost: 100, r: 'relisting' }, stats: [{ l: 'objects read', v: '100%', cls: 'warn' }, { l: 'new resume point', v: '39800' }] },
      { log: 'It starts a new watch from 39800. Because the resume point is at the head, the watch is valid again and only new events flow.', callout: 'New watch from the head: events stream again', code: 0, state: { lo: 39000, head: 39860, cur: 39860, r: 'watching again' }, stats: [{ l: 'resume point', v: '39860', cls: 'ok' }, { l: 'status', v: 'streaming', cls: 'ok' }],
        takeaway: 'A watch can resume only while its revision is in history. After compaction an old resume point means 410 and a full relist.' }
    ],
  };

  /* ---------- 3. Quota: the database fills, writes stop, compaction and defrag recover it ---------- */
  const quota = {
    id: 'quota', label: 'Database full', desc: 'etcd reaches its space quota and rejects every write. Compaction frees space inside the file, but only defragmentation shrinks the file.',
    codeLabel: 'etcdctl',
    code: { bug: ['etcdctl endpoint status --write-out=table', 'mvcc: database space exceeded', 'etcdctl compact <revision>', 'etcdctl defrag && etcdctl alarm disarm'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'etcd db vs quota (2 GiB default)', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 16, y: 96, w: 400, labelW: 130, rowH: 30, items: [{ id: 'file', label: 'db file size' }, { id: 'live', label: 'live objects' }, { id: 'old', label: 'old revisions' }, { id: 'free', label: 'free inside file' }], unit: '%', title: 'share of the quota (illustrative)' });
        const wr = kit.chip(null, { x: 450, y: 90, w: 168, h: 46, label: 'writes', sub: 'accepted', tone: 'ok' });
        const rd = kit.chip(null, { x: 450, y: 150, w: 168, h: 46, label: 'reads', sub: 'served', tone: 'ok' });
        const al = kit.chip(null, { x: 450, y: 210, w: 168, h: 46, label: 'alarm', sub: 'none', tone: 'info' });
        const act = kit.chip(null, { x: 16, y: 240, w: 400, h: 40, label: '', sub: '', tone: 'info', show: false });
        return { bars, wr, rd, al, act };
      },
      frame(s, kit, R) {
        const f = s.file == null ? 40 : s.file, l = s.live == null ? 20 : s.live, o = s.old == null ? 20 : s.old, fr = s.free || 0;
        R.bars.set('file', f, f >= 100 ? 'bad' : f >= 70 ? 'warn' : 'ok'); R.bars.set('live', l, 'ok'); R.bars.set('old', o, o >= 50 ? 'warn' : 'info'); R.bars.set('free', fr, 'info');
        R.wr.set({ sub: s.full ? 'rejected' : 'accepted', tone: s.full ? 'warn' : 'ok' });
        R.rd.set({ sub: 'served', tone: 'ok' });
        R.al.set({ sub: s.full ? 'NOSPACE' : 'none', tone: s.full ? 'warn' : 'info' });
        R.act.set({ show: !!s.act, label: s.act || '', tone: s.actT || 'info', w: 400 });
      }
    },
    bug: [
      { log: 'Every write adds a revision. The live objects are a small part of the file, and the old revisions that nobody compacted are growing.', callout: 'Old revisions pile up in the file', code: 0, state: { file: 60, live: 20, old: 40, r: 'file at 60%' }, stats: [{ l: 'db file', v: '60%', cls: 'warn' }, { l: 'live objects', v: '20%' }] },
      { log: 'A chatty controller updates a status field many times a second, and compaction is not keeping up. The file reaches the quota.', callout: 'The file reaches the quota', code: 1, state: { file: 100, live: 22, old: 78, full: true, r: 'quota reached' }, stats: [{ l: 'db file', v: '100%', cls: 'bad' }, { l: 'alarm', v: 'NOSPACE', cls: 'bad' }] },
      { log: 'etcd raises the NOSPACE alarm and rejects every write with mvcc: database space exceeded. Reads still work, so dashboards look fine while nothing can change.', callout: 'All writes fail; reads still work', moment: true, code: 1, state: { file: 100, live: 22, old: 78, full: true, act: 'every create, update and delete fails', actT: 'warn', r: 'writes rejected' }, stats: [{ l: 'writes', v: 'rejected', cls: 'bad' }, { l: 'reads', v: 'served', cls: 'ok' }] },
      { log: 'Compaction removes the old revisions. The space becomes free pages inside the file, but the file itself keeps its size, so the quota is still reached.', callout: 'Compaction frees pages, not the file size', code: 2, state: { file: 100, live: 22, old: 0, free: 78, full: true, act: 'compacted: file size unchanged', actT: 'warn', r: 'compacted' }, stats: [{ l: 'old revisions', v: '0', cls: 'ok' }, { l: 'db file', v: '100%', cls: 'bad' }] },
      { log: 'Defragmentation rewrites the file without the free pages, so it shrinks to about the size of the live data.', callout: 'Defrag shrinks the file', code: 3, state: { file: 22, live: 22, old: 0, free: 0, full: true, act: 'etcdctl defrag, one member at a time', actT: 'cursor', r: 'defragmented' }, stats: [{ l: 'db file', v: '22%', cls: 'ok' }, { l: 'free inside file', v: '0' }] },
      { log: 'The alarm is disarmed and writes resume. Fix the cause too: frequent compaction, a smaller update rate for the noisy controller and a quota sized for the cluster.', callout: 'Disarm the alarm; writes resume', code: 3, state: { file: 24, live: 22, old: 2, r: 'healthy' }, stats: [{ l: 'writes', v: 'accepted', cls: 'ok' }, { l: 'db file', v: '24%', cls: 'ok' }],
        takeaway: 'A full etcd stops every write. Compaction frees pages, defragmentation shrinks the file, and the alarm must be disarmed.' }
    ],
  };

  const flow = KH.flow(['Client reads|object at rv 41', '*Update with rv 41|compare and swap', 'etcd checks|is rv 41 still current?', 'Write rv 42|or 409 Conflict', 'Watch from rv|events after that rv', 'Compaction|drops old revisions', 'Defragment|shrinks the file'], 'Flow: reads and writes are tied to a revision, and compaction decides how far back a watch can resume.');

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[2] = { explain: `
<h3>1. Every write gets the next revision</h3>
<p>etcd is a key-value store with a history. Each write, whatever the key, gets the next number from one global counter, called the revision. The API server shows it on every object as <code>metadata.resourceVersion</code>. Treat that value as an opaque string. You may compare an object with the one you read, but you should not do arithmetic on it. The revision is what makes safe sharing possible, because it names exactly which version of an object a client looked at.</p>
${flow}

<h3>2. Compare-and-swap instead of locks</h3>
<p>Clients do not lock objects. A client reads, changes its own copy and sends it back with the <code>resourceVersion</code> it read. The API server writes only if that revision is still the current one, and otherwise answers 409 Conflict with <i>the object has been modified; please apply your changes to the latest version and try again</i>. A write without a resourceVersion is a blind write that always wins, and that is how an updated image can quietly return to the old value, as in the first scene.</p>
<p>The cost of this model is a retry loop in every client. Client libraries give you helpers, and a patch or a server-side apply changes only the fields you own, so two writers on different fields rarely collide at all. When they do collide on the same field, 409 is the correct signal that two owners disagree.</p>

<h3>3. Watch: stream changes from a revision</h3>
<p>Controllers do not poll. A client lists once, keeps the list's <code>resourceVersion</code> and opens a watch from it, and the server then sends every later change as an event. If the client disconnects, it resumes from the last revision it saw. That works only while those events still exist in the history. The API server asks etcd to compact about every five minutes (<code>--etcd-compaction-interval</code>, default 5m), and when the resume point is older than the oldest kept revision, the answer is HTTP 410 Gone, <i>too old resource version</i>. The client must list again and start a new watch. Informers do this for you, but a fleet that relists at once is a real load spike.</p>

<h3>4. Space: compaction is not defragmentation</h3>
<p>etcd stores all revisions until they are compacted, and it has a space quota. The default is 2 GiB, set with <code>--quota-backend-bytes</code>. When the file reaches the quota, etcd raises the NOSPACE alarm and rejects every write with <code>mvcc: database space exceeded</code>, while reads continue. Compaction marks old revisions as free pages inside the file, but it does not shrink the file. Defragmentation rewrites the file and releases that space, and it should run on one member at a time because it blocks that member while it runs. After that you disarm the alarm. The usual causes are a controller that updates an object far too often, or compaction that stopped working. Also remember that one request is limited by etcd's maximum request size, 1.5 MiB by default, which is why an oversized ConfigMap or Secret is rejected.</p>

<h3>5. The trade-off</h3>
<p>One global revision gives a simple, strong rule for correctness: every update is ordered, and any reader can resume exactly where it stopped. The price is history. Keeping more history lets clients resume after longer outages and costs disk. Compacting more often keeps the database small and forces more relists. Neither is free, so watch the database size, the compaction age and the count of 410 responses.</p>

<h3>6. Syntax</h3>
<pre>kubectl get deploy web -o jsonpath='{.metadata.resourceVersion}'
kubectl get pods --watch --resource-version=38120
kubectl get --raw '/api/v1/pods?watch=1&amp;resourceVersion=38120'

etcdctl endpoint status --write-out=table
etcdctl alarm list
etcdctl compact 39000
etcdctl defrag
etcdctl alarm disarm</pre>
<p><code>kubectl</code> hides most 409 handling for you. If you write your own client, retry on 409 after you re-read, and never fall back to a blind PUT.</p>`, scenarios: [cas, watch, quota] };
})();
