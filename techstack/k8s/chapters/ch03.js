/* Chapter 3 "Controllers and Reconcile Loops": a lost event, a retry timeline and an owner tree with a finalizer (index 3).
   Loads after course.js and scene-tools.js. Counts and delays are illustrative. */
(function () {
  const KH = window.KH, W = 640, H = 420;
  const FOOT = 'Simplified. Counts and delays are illustrative.';

  /* ---------- 1. A lost DELETE event: level-triggered loops recover ---------- */
  const levels = {
    id: 'levels', label: 'Lost event', desc: 'A pod is deleted while the controller is down, so its DELETE event is lost. An edge-triggered handler never notices; a level-triggered reconcile fixes it at the next relist.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl get pods -l app=web      # 3 Running, replicas 3', '# controller-manager restarts; a drain deletes web-2 meanwhile', '$ kubectl get rs web            # DESIRED 3  CURRENT 2', '# informer relists: key default/web is queued, reconcile creates 1 pod'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'ReplicaSet web · desired 3 · actual ' + (s.act == null ? 3 : s.act), right: s.r || '' }),
      setup(kit) {
        const pods = [0, 1, 2].map(i => kit.chip(null, { x: 16, y: 84 + i * 54, w: 104, h: 44, label: 'pod-' + i, sub: 'Running', tone: 'ok' }));
        const ev = kit.chip(null, { x: 150, y: 150, w: 150, h: 40, label: 'DELETE event', sub: 'nobody listening', tone: 'delete', show: false });
        const cache = kit.chip(null, { x: 332, y: 84, w: 128, h: 44, label: 'informer cache', sub: 'local copy', tone: 'info' });
        const queue = kit.chip(null, { x: 492, y: 84, w: 128, h: 44, label: 'work queue', sub: 'dedup, backoff', tone: 'info' });
        const rec = kit.chip(null, { x: 492, y: 196, w: 128, h: 44, label: 'reconcile', sub: 'read, diff, act', tone: 'info' });
        const api = kit.chip(null, { x: 332, y: 196, w: 128, h: 44, label: 'API write', sub: 'create / delete', tone: 'info' });
        const mode = kit.chip(null, { x: 16, y: 264, w: 330, h: 40, label: '', sub: '', tone: 'info', show: false });
        const ar = KH.links(kit, [
          { id: 'lw', x1: 120, y1: 106, x2: 332, y2: 106, label: 'LIST + WATCH' }, { id: 'cq', x1: 460, y1: 106, x2: 492, y2: 106 },
          { id: 'qr', x1: 556, y1: 128, x2: 556, y2: 196 }, { id: 'ra', x1: 492, y1: 218, x2: 460, y2: 218 }, { id: 'ac', x1: 396, y1: 196, x2: 396, y2: 128 }
        ]);
        return { pods, ev, cache, queue, rec, api, mode, ar };
      },
      frame(s, kit, R) {
        const n = s.n || 0;
        R.pods.forEach((p, i) => {
          if (i < 2) return p.set({ tone: 'ok', sub: 'Running' });
          p.set({ show: n < 2 || n >= 5, tone: n === 1 ? 'delete' : n === 5 ? 'warn' : 'ok', sub: n === 1 ? 'deleted' : n === 5 ? 'Pending' : 'Running', label: n >= 5 ? 'pod-2 (new)' : 'pod-2' });
        });
        R.ev.set({ show: n >= 1 && n <= 2 });
        R.cache.set({ tone: n === 3 ? 'cursor' : 'info', hl: n === 3, sub: n >= 3 && n < 6 ? 'sees 2 pods' : 'local copy' });
        R.queue.set({ tone: n === 3 ? 'cursor' : 'info', sub: n >= 3 && n < 5 ? 'key default/web' : 'dedup, backoff' });
        R.rec.set({ tone: n === 4 ? 'cursor' : 'info', hl: n === 4, sub: n === 4 ? 'want 3, have 2' : 'read, diff, act' });
        R.api.set({ tone: n === 5 ? 'cursor' : 'info', hl: n === 5, sub: n === 5 ? 'create pod' : 'create / delete' });
        R.mode.set({ show: n >= 2 && n <= 5, label: n === 2 ? 'edge-triggered: waits for an event' : 'level-triggered: compare, then fix', sub: '', tone: n === 2 ? 'warn' : 'cursor', w: 330 });
        const on = { 2: ['lw'], 3: ['lw', 'cq'], 4: ['qr'], 5: ['ra'], 6: ['ac'] }[n] || [];
        R.ar.only(on, []);
      }
    },
    bug: [
      { log: 'The ReplicaSet web wants 3 pods and has 3. The controller keeps a local copy of the pods in its informer cache and the loop is idle.', callout: 'Desired 3, actual 3: the loop is idle', code: 0, state: { n: 0, act: 3, r: 'steady' }, stats: [{ l: 'desired', v: '3' }, { l: 'actual', v: '3', cls: 'ok' }] },
      { log: 'The controller manager restarts. In that second a node drain deletes web-2, and the DELETE event goes out while no controller is listening.', callout: 'The DELETE event is dropped', code: 1, state: { n: 1, act: 2, r: 'event lost' }, stats: [{ l: 'actual', v: '2', cls: 'warn' }, { l: 'events seen', v: '0', cls: 'warn' }] },
      { log: 'The controller is back and its watch works, but it only receives new events. A handler that reacts only to events waits for one that will never come.', callout: 'An edge-triggered handler waits forever', code: 2, state: { n: 2, act: 2, r: 'stuck at 2' }, stats: [{ l: 'desired', v: '3' }, { l: 'actual', v: '2', cls: 'bad' }] },
      { log: 'A level-triggered controller does not trust events. On start, and on every relist or resync, it reads the current state again, and the cache now holds 2 pods. The key default/web is queued.', callout: 'Relist: the cache shows 2 pods, the key is queued', moment: true, code: 3, state: { n: 3, act: 2, r: 'relist' }, stats: [{ l: 'cache shows', v: '2 pods', cls: 'warn' }, { l: 'queued keys', v: '1' }] },
      { log: 'Reconcile reads the desired state, 3, and the observed state, 2. The difference is one pod, so the smallest step is to create one.', callout: 'Reconcile: want 3, have 2, so create 1', code: 3, state: { n: 4, act: 2, r: 'diff = 1' }, stats: [{ l: 'diff', v: '+1', cls: 'warn' }, { l: 'action', v: 'create pod' }] },
      { log: 'The controller writes a new Pod object through the API server. It has no node yet, so it starts Pending, and the scheduler and kubelet take over.', callout: 'A new pod is created', code: 3, state: { n: 5, act: 2, r: 'pod created' }, stats: [{ l: 'actual', v: '2 + 1 Pending', cls: 'warn' }, { l: 'API writes', v: '1' }] },
      { log: 'The new pod becomes Ready. Desired and actual match again, and running reconcile once more would change nothing, because every run is idempotent.', callout: 'Desired 3, actual 3: idempotent and idle', code: 0, state: { n: 6, act: 3, r: 'converged' }, stats: [{ l: 'actual', v: '3', cls: 'ok' }, { l: 'diff', v: '0', cls: 'ok' }],
        takeaway: 'Controllers compare levels, not events. Whatever woke the loop, it re-reads current state and takes the smallest step.' }
    ],
  };

  /* ---------- 2. A hot loop against a permanent error vs a rate-limited queue ---------- */
  const T0 = 40;
  const DELAYS = [0, 5, 15, 35, 75, 155, 315, 635, 1275];
  const X2 = DELAYS.map(t => T0 + t / 1275 * 560);
  const X1 = Array.from({ length: 36 }, (_, i) => T0 + i * 16);
  const hotloop = {
    id: 'hotloop', label: 'Hot loop and backoff', desc: 'A reconcile fails on a missing Secret. Requeued at once it loops hot; with the rate-limited work queue each retry waits twice as long as the last.',
    codeLabel: 'Controller',
    code: { bug: ['err := r.reconcile(ctx, key)   // secret "db-creds" not found', 'queue.Add(key)                  // immediate requeue: hot loop', 'queue.AddRateLimited(key)       // delay grows 5ms, 10ms, 20ms ...', 'queue.Forget(key)               // success: reset the backoff'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'same failing key · window 1.3 s', right: s.r || '' }),
      setup(kit) {
        const err = kit.chip(null, { x: 16, y: 70, w: 330, h: 36, label: 'secret db-creds not found', sub: '', tone: 'warn', small: true });
        kit.text(null, { x: T0, y: 138, t: 'requeue with no delay', cls: 'kt sm' });
        kit.text(null, { x: T0, y: 218, t: 'rate-limited work queue', cls: 'kt sm' });
        const mk = (xs, y) => xs.map(x => { const c = kit.el('circle', { cx: x, cy: y, r: 5 }, kit.layer); c.style.fill = 'var(--bad)'; c.style.stroke = 'var(--ink)'; c.style.transition = 'opacity .35s, fill .35s'; c.style.opacity = 0; return c; });
        const l1 = mk(X1, 158), l2 = mk(X2, 238);
        const dl = kit.text(null, { x: T0, y: 264, t: '', cls: 'kt xs mut' });
        const bars = kit.bars(null, { x: 16, y: 304, w: 400, labelW: 100, rowH: 22, items: [{ id: 'a', label: 'no limiter' }, { id: 'b', label: 'rate limited' }], max: 100, unit: '', title: 'failing API calls in 1.3 s' });
        return { err, l1, l2, dl, bars };
      },
      frame(s, kit, R) {
        const h = s.hot || 0, b = s.bk || 0, ok = !!s.ok;
        R.l1.forEach((c, i) => { c.style.opacity = i < h ? 1 : 0; });
        R.l2.forEach((c, i) => { c.style.opacity = i < b ? 1 : 0; c.style.fill = ok && i === b - 1 ? 'var(--ok)' : 'var(--bad)'; });
        R.dl.set(b >= 4 ? 'gaps: 5, 10, 20, 40, 80, 160, 320, 640 ms (illustrative)' : b >= 2 ? 'gaps: 5, 10, 20 ms ...' : '');
        R.err.set({ tone: ok ? 'ok' : 'warn', label: ok ? 'secret created: reconcile succeeds' : 'secret db-creds not found', w: 330 });
        R.bars.set('a', Math.min(100, h * 2.8), h >= 30 ? 'bad' : 'warn', h ? (h >= 30 ? '1000s' : String(h * 20)) : '0');
        R.bars.set('b', b * 3, 'ok', String(b));
      }
    },
    bug: [
      { log: 'The reconcile for a Deployment needs a Secret that does not exist yet, so it returns an error. This error is permanent until someone creates the Secret.', callout: 'A permanent error: the Secret is missing', code: 0, state: { r: 'failing' }, stats: [{ l: 'reconcile', v: 'fails', cls: 'warn' }, { l: 'error', v: 'not found' }] },
      { log: 'The handler requeues the key immediately after every failure. The next attempt runs the moment the last one ends.', callout: 'Immediate requeue: the next try starts at once', code: 1, state: { hot: 8, r: 'no delay' }, stats: [{ l: 'retries so far', v: '8', cls: 'warn' }, { l: 'delay', v: '0' }] },
      { log: 'The loop never rests. It repeats the same failing call thousands of times a second (illustrative), burning controller CPU and flooding the API server.', callout: 'A hot loop floods the API server', moment: true, code: 1, state: { hot: 36, r: 'hot loop' }, stats: [{ l: 'failing calls', v: 'thousands/s', cls: 'bad' }, { l: 'controller CPU', v: 'high', cls: 'bad' }] },
      { log: 'The fix is to requeue through the rate limiter. The first retry waits 5 ms. Each failure of the same key doubles the wait.', callout: 'AddRateLimited: the first retry waits 5 ms', code: 2, state: { hot: 36, bk: 3, r: 'backoff starts' }, stats: [{ l: 'retries', v: '3', cls: 'warn' }, { l: 'next delay', v: '35 ms' }] },
      { log: 'The gaps double: 5, 10, 20, 40, 80 ms and on up to a cap near 1000 s. The same key now makes 9 calls in the window instead of thousands.', callout: 'The delay doubles on every failure', code: 2, state: { hot: 36, bk: 8, r: 'backing off' }, stats: [{ l: 'retries', v: '8', cls: 'ok' }, { l: 'next delay', v: '640 ms' }] },
      { log: 'Someone creates the Secret. The next retry succeeds, the controller calls Forget on the key, and its backoff starts again from the beginning.', callout: 'Success: Forget resets the backoff', code: 3, state: { hot: 0, bk: 9, ok: true, r: 'recovered' }, stats: [{ l: 'reconcile', v: 'ok', cls: 'ok' }, { l: 'backoff', v: 'reset', cls: 'ok' }],
        takeaway: 'A permanent error needs backoff, not an immediate requeue. The rate limiter spaces retries and Forget resets them on success.' }
    ],
  };

  /* ---------- 3. Owners and finalizers: who deletes what, and what can block it ---------- */
  const tree = {
    id: 'owners', label: 'Owners and finalizers', desc: 'Deleting a Deployment cascades down its owner tree. A finalizer blocks deletion until its controller removes it, so an object whose controller is gone stays Terminating.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl delete deploy web          # background cascade', '$ kubectl get db db1 -o jsonpath="{.metadata.finalizers}"', '["example.com/cleanup"]', '$ kubectl delete db db1                # Terminating, deletionTimestamp set', '$ kubectl patch db db1 -p \'{"metadata":{"finalizers":null}}\' --type=merge'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'ownerReferences · finalizers', right: s.r || '' }),
      setup(kit) {
        const dep = kit.chip(null, { x: 200, y: 80, w: 150, h: 40, label: 'Deployment web', sub: 'owner', tone: 'info' });
        const rs = kit.chip(null, { x: 200, y: 146, w: 150, h: 40, label: 'ReplicaSet web-7d9', sub: 'owned by web', tone: 'info' });
        const pods = [0, 1, 2].map(i => kit.chip(null, { x: 130 + i * 100, y: 212, w: 88, h: 40, label: 'pod ' + i, sub: 'owned by RS', tone: 'info' }));
        const gc = kit.chip(null, { x: 16, y: 146, w: 150, h: 40, label: 'garbage collector', sub: 'idle', tone: 'info', small: false });
        const cr = kit.chip(null, { x: 470, y: 80, w: 150, h: 44, label: 'Database db1', sub: 'custom resource', tone: 'info' });
        const fin = kit.chip(null, { x: 470, y: 138, w: 150, h: 40, label: 'finalizer', sub: 'example.com/cleanup', tone: 'info', small: true });
        const ctl = kit.chip(null, { x: 470, y: 192, w: 150, h: 40, label: 'its controller', sub: 'running', tone: 'ok' });
        const ts = kit.chip(null, { x: 470, y: 246, w: 150, h: 40, label: 'deletionTimestamp', sub: 'not set', tone: 'info', small: true });
        const ar = KH.links(kit, [
          { id: 'o1', x1: 174, y1: 212, x2: 262, y2: 186 }, { id: 'o2', x1: 274, y1: 212, x2: 275, y2: 186 }, { id: 'o3', x1: 374, y1: 212, x2: 288, y2: 186 },
          { id: 'o4', x1: 275, y1: 146, x2: 275, y2: 120 }, { id: 'g1', x1: 100, y1: 146, x2: 200, y2: 166 }
        ]);
        return { dep, rs, pods, gc, cr, fin, ctl, ts, ar };
      },
      frame(s, kit, R) {
        const n = s.n || 0;
        const depOn = n < 1, rsOn = n < 3, podsOn = n < 4;
        R.dep.set({ show: depOn, tone: n === 1 ? 'delete' : 'info' });
        R.rs.set({ show: rsOn, tone: n === 2 ? 'delete' : 'info', sub: n >= 1 ? 'owner gone' : 'owned by web' });
        R.pods.forEach(p => p.set({ show: podsOn, tone: n === 3 ? 'delete' : 'info', sub: n >= 2 ? 'no owner' : 'owned by RS' }));
        R.gc.set({ tone: n === 2 || n === 3 ? 'cursor' : 'info', hl: n === 2 || n === 3, sub: n === 2 ? 'delete RS' : n === 3 ? 'delete pods' : 'idle' });
        const crGone = n >= 7;
        R.cr.set({ show: !crGone, tone: n >= 4 && n <= 5 ? 'warn' : 'info', sub: n >= 4 ? 'Terminating' : 'custom resource' });
        R.fin.set({ show: !crGone, tone: n >= 4 && n <= 5 ? 'warn' : n === 6 ? 'cursor' : 'info', sub: n === 6 ? 'being removed' : 'example.com/cleanup' });
        R.ctl.set({ show: !crGone, tone: n === 5 ? 'delete' : n === 6 ? 'cursor' : 'ok', sub: n === 5 ? 'uninstalled' : n === 6 ? 'cleaning up' : 'running' });
        R.ts.set({ show: !crGone, tone: n >= 4 && n <= 6 ? 'warn' : 'info', sub: n >= 4 ? '14:02:11 set' : 'not set' });
        R.ar.only(depOn ? ['o4'].concat(rsOn ? ['o1', 'o2', 'o3'] : []) : rsOn ? ['o1', 'o2', 'o3'] : [], []);
        if (n >= 2 && n <= 3) R.ar.only(['g1'], []);
      }
    },
    bug: [
      { log: 'Deployment web owns a ReplicaSet and the ReplicaSet owns three pods. Each child records its owner in metadata.ownerReferences.', callout: 'Each object points at its owner', code: 0, state: { n: 0, r: 'owner tree' }, stats: [{ l: 'objects in tree', v: '5' }, { l: 'owner links', v: '4' }] },
      { log: 'kubectl delete deployment web removes the Deployment from etcd at once (background cascade). The ReplicaSet and the pods now name an owner that does not exist.', callout: 'The owner is deleted; children now dangle', code: 0, state: { n: 1, r: 'owner gone' }, stats: [{ l: 'Deployment', v: 'deleted', cls: 'warn' }, { l: 'children left', v: '4', cls: 'warn' }] },
      { log: 'The garbage collector controller sees that the ReplicaSet\'s owner is gone and deletes the ReplicaSet.', callout: 'Garbage collector deletes the ReplicaSet', code: 0, state: { n: 2, r: 'GC: RS' }, stats: [{ l: 'ReplicaSet', v: 'deleted', cls: 'warn' }, { l: 'pods left', v: '3' }] },
      { log: 'The same rule applies to the pods. Their owner, the ReplicaSet, is gone, so they are deleted next and the tree is empty.', callout: 'Pods follow: the cascade is complete', code: 0, state: { n: 3, r: 'GC: pods' }, stats: [{ l: 'objects left', v: '0', cls: 'ok' }, { l: 'GC passes', v: '2' }] },
      { log: 'A custom resource Database db1 carries a finalizer. kubectl delete only sets deletionTimestamp. The object stays visible as Terminating until its controller finishes cleanup.', callout: 'Finalizer: delete sets a timestamp, not removal', moment: true, code: 3, state: { n: 4, r: 'Terminating' }, stats: [{ l: 'db1', v: 'Terminating', cls: 'warn' }, { l: 'finalizers', v: '1' }] },
      { log: 'The operator that owns this finalizer was uninstalled, so nobody removes it. The object stays Terminating for hours and a namespace that holds it cannot be deleted.', callout: 'No controller: stuck Terminating forever', code: 3, state: { n: 5, r: 'stuck' }, stats: [{ l: 'db1', v: 'stuck', cls: 'bad' }, { l: 'controller', v: 'gone', cls: 'bad' }] },
      { log: 'The right fix is to reinstall the controller, which cleans up and removes its finalizer. Patching finalizers to null is a last resort that skips the cleanup.', callout: 'Reinstall the controller; it removes the finalizer', code: 4, state: { n: 6, r: 'cleanup' }, stats: [{ l: 'controller', v: 'running', cls: 'ok' }, { l: 'finalizers', v: '1 → 0' }] },
      { log: 'With no finalizers left and a deletionTimestamp set, the API server removes db1 from etcd. The object is gone.', callout: 'No finalizers: the object is removed', code: 4, state: { n: 7, r: 'deleted' }, stats: [{ l: 'db1', v: 'deleted', cls: 'ok' }, { l: 'finalizers', v: '0', cls: 'ok' }],
        takeaway: 'Owners delete their dependents, and a finalizer blocks deletion until its controller says it is done.' }
    ],
  };

  const flow = KH.flow(['Reflector|LIST then WATCH', 'Informer cache|local copy', '*Work queue|keys, dedup, backoff', 'Reconcile(key)|read, diff, act', 'API write|create, update, delete', 'Status|observed state'], 'Flow: events only say which key to look at. Reconcile reads current state and closes the gap.');

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[3] = { explain: `
<h3>1. Levels, not edges</h3>
<p>A message that says "pod web-2 was deleted" can be lost, delayed or delivered twice. A controller that depended on every message would eventually be wrong. Kubernetes controllers are therefore <b>level-triggered</b>. An event only tells them which object to look at. Whatever woke the loop, the controller reads the current desired state, reads the observed state, and takes the smallest step that closes the gap. In the first scene the deletion event is gone, yet one relist later the controller counts two pods, wants three and creates one.</p>
${flow}

<h3>2. The machinery inside every controller</h3>
<p>A <b>reflector</b> does a LIST and then a WATCH and keeps an <b>informer cache</b> in memory, so reads do not hit the API server. Event handlers add only the object key, such as <code>default/web</code>, to a <b>work queue</b>. The queue deduplicates keys, so ten events for the same object cause one run, and it can delay retries. A worker takes a key, runs <code>Reconcile</code>, and writes the result back through the API server. The informer also resyncs periodically, which re-delivers every object as an update even if nothing changed. That is the safety net for a missed event.</p>

<h3>3. Idempotent steps and rate-limited retries</h3>
<p>Because a key can be reconciled at any time and any number of times, each run must be safe to repeat: create what is missing, delete what is extra, and do nothing when the state already matches. When a run fails, the controller puts the key back with a delay. The default controller rate limiter combines an exponential per-key delay, starting at 5 ms and capped at about 1000 s, with an overall token bucket. A permanent error then costs a few calls instead of a flood, as the second scene shows. On success the controller calls <code>Forget</code> so the next failure starts from the short delay again.</p>

<h3>4. Ownership and finalizers</h3>
<p>Objects form trees through <code>metadata.ownerReferences</code>: a Pod points at its ReplicaSet, and the ReplicaSet at its Deployment. When an owner is deleted, the garbage collector deletes dependents whose owners no longer exist. By default <code>kubectl delete</code> uses background cascading, so the owner disappears first and the children follow. A <b>finalizer</b> is a string in <code>metadata.finalizers</code> that blocks the final removal. Deleting the object only sets <code>deletionTimestamp</code>, and the controller that owns the finalizer must clean up and then remove its entry. If that controller is gone, the object stays <code>Terminating</code> until you restore it. Removing the finalizer by hand finishes the delete but skips the cleanup it stood for.</p>

<h3>5. The trade-off</h3>
<p>Level-triggered loops are robust to restarts, duplicates and lost events, and each step is easy to reason about. The cost is extra reads and a delay: a change that was missed is noticed only at the next relist or resync, which is why those intervals exist. Two controllers that claim the same objects, for example two ReplicaSets with overlapping selectors, will keep undoing each other, because each one is correct by its own rule. Debug that kind of fight by reading <code>ownerReferences</code> and selectors, not by restarting pods.</p>

<h3>6. Syntax</h3>
<pre>kubectl get pod web-7d9f6c5b8-abcde -o jsonpath='{.metadata.ownerReferences}'
kubectl get rs -l app=web -o wide
kubectl delete deploy web --cascade=background     # default
kubectl delete deploy web --cascade=orphan         # keep the children
kubectl get db db1 -o jsonpath='{.metadata.finalizers}'
kubectl patch db db1 --type=merge -p '{"metadata":{"finalizers":null}}'   # last resort</pre>
<p>When something is stuck in <code>Terminating</code>, read <code>deletionTimestamp</code> and <code>finalizers</code> first and find the controller that owns each entry.</p>`, scenarios: [levels, hotloop, tree] };
})();
