/* Chapter 6 "Probes and Readiness": probe swimlanes over time and a restart cascade (index 6).
   Loads after course.js and scene-tools.js. One column is one 10 s probe period; all times are illustrative. */
(function () {
  const KH = window.KH, W = 640, H = 420;
  const FOOT = 'Simplified. One column = one 10 s probe period. Times are illustrative.';
  const LX = 92, CW = 43, NT = 12;
  const cx = i => LX + i * CW;
  const COL = {
    ok: 'color-mix(in srgb, var(--ok) 45%, var(--card))', bad: 'color-mix(in srgb, var(--bad) 40%, var(--card))', warn: 'color-mix(in srgb, var(--warn) 45%, var(--card))',
    dim: 'color-mix(in srgb, var(--mut) 28%, var(--card))', none: 'var(--soft)', info: 'color-mix(in srgb, var(--acc) 30%, var(--card))'
  };

  /* A swimlane grid: lanes[] = { label, y }, cells drawn from rows of tone names, one per column. */
  function lanes(kit, defs, axisY) {
    const rows = defs.map(d => {
      kit.text(null, { x: 16, y: d.y + 17, t: d.label, cls: 'kt xs' });
      return Array.from({ length: NT }, (_, i) => {
        const r = kit.el('rect', { x: cx(i) + 1, y: d.y, width: CW - 2, height: 24, rx: 4 }, kit.layer);
        r.style.fill = COL.none; r.style.stroke = 'var(--line)'; r.style.transition = 'fill .4s';
        return r;
      });
    });
    for (let i = 0; i < NT; i += 2) kit.text(null, { x: cx(i) + CW / 2, y: axisY, t: (i * 10) + 's', cls: 'kt xs mut', anchor: 'middle' });
    return rows;
  }
  const paint = (rows, data, t) => rows.forEach((row, li) => row.forEach((r, i) => { r.style.fill = i < t ? COL[data[li][i]] || COL.none : COL.none; }));

  /* ---------- 1. Deep liveness vs shallow liveness plus readiness ---------- */
  const DEF1 = [{ label: 'database', y: 84 }, { label: 'liveness', y: 118 }, { label: 'readiness', y: 152 }, { label: 'traffic', y: 186 }];
  const MODES = {
    deep: [
      ['ok', 'ok', 'ok', 'bad', 'bad', 'bad', 'bad', 'ok', 'ok', 'ok', 'ok', 'ok'],
      ['ok', 'ok', 'ok', 'bad', 'bad', 'bad', 'bad', 'ok', 'ok', 'ok', 'ok', 'ok'],
      ['ok', 'ok', 'ok', 'ok', 'ok', 'dim', 'dim', 'dim', 'dim', 'ok', 'ok', 'ok'],
      ['ok', 'ok', 'ok', 'bad', 'bad', 'dim', 'dim', 'dim', 'dim', 'ok', 'ok', 'ok']
    ],
    fix: [
      ['ok', 'ok', 'ok', 'bad', 'bad', 'bad', 'bad', 'ok', 'ok', 'ok', 'ok', 'ok'],
      ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'],
      ['ok', 'ok', 'ok', 'warn', 'warn', 'warn', 'warn', 'ok', 'ok', 'ok', 'ok', 'ok'],
      ['ok', 'ok', 'ok', 'warn', 'warn', 'warn', 'warn', 'ok', 'ok', 'ok', 'ok', 'ok']
    ]
  };
  const deep = {
    id: 'deep', label: 'Deep liveness', desc: 'A 40 s database outage. A liveness probe that queries the database restarts every replica and stretches the outage; a shallow liveness plus a readiness probe only removes pods from traffic.',
    codeLabel: 'Config',
    code: { bug: ['livenessProbe:  {httpGet: {path: /health}}            # /health runs SELECT 1', 'kubectl get pods -l app=web                          # RESTARTS 1 on every pod', 'livenessProbe:  {httpGet: {path: /livez}}              # process only, no dependencies', 'readinessProbe: {httpGet: {path: /readyz}}             # includes the database'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'probes for web · period 10 s · failureThreshold 3', right: s.r || '' }),
      setup(kit) {
        const rows = lanes(kit, DEF1, 226);
        const restart = kit.chip(null, { x: cx(5) - 28, y: 244, w: 120, h: 34, label: 'restart', sub: '', tone: 'delete', show: false, small: true });
        const lg = kit.text(null, { x: 16, y: 304, t: 'green = ok · red = failing · grey = container restarting · amber = NotReady, not restarted', cls: 'kt xs mut' });
        return { rows, restart };
      },
      frame(s, kit, R) {
        paint(R.rows, MODES[s.mode || 'deep'], s.t == null ? 0 : s.t);
        R.restart.set({ show: !!s.restart });
      }
    },
    bug: [
      { log: 'Four replicas serve traffic. The liveness probe calls /health, and /health runs SELECT 1 against the database. Everything is green.', callout: 'Liveness probe queries the database', code: 0, state: { mode: 'deep', t: 3, r: 'healthy' }, stats: [{ l: 'replicas', v: '4 / 4', cls: 'ok' }, { l: 'restarts', v: '0' }] },
      { log: 'The database fails over and is unreachable for 40 s. Every /health call fails, on all four replicas at the same time.', callout: 'The database is down for 40 s', code: 0, state: { mode: 'deep', t: 5, r: 'DB down' }, stats: [{ l: 'failing probes', v: '4 / 4', cls: 'bad' }, { l: 'failures in a row', v: '2' }] },
      { log: 'After three failures in a row, failureThreshold is reached on every replica, and every kubelet restarts its container. The restart does not fix the database.', callout: 'Three failures: every replica is restarted', moment: true, code: 1, state: { mode: 'deep', t: 6, restart: true, r: 'restart storm' }, stats: [{ l: 'restarts', v: '4', cls: 'bad' }, { l: 'capacity', v: '0%', cls: 'bad' }] },
      { log: 'The database is back after 40 s, but the containers are still restarting and warming up. Users see errors for much longer than the real outage.', callout: 'The outage outlasts the database fault', code: 1, state: { mode: 'deep', t: 9, restart: true, r: 'restarts continue' }, stats: [{ l: 'outage', v: '~60 s', cls: 'bad' }, { l: 'database outage', v: '40 s' }] },
      { log: 'The fix separates the questions. Liveness checks only that the process answers, so it never touches the database. Readiness includes the database.', callout: 'Shallow liveness, readiness checks the dependency', code: 2, state: { mode: 'fix', t: 3, r: 'replay with new probes' }, stats: [{ l: 'liveness', v: '/livez', cls: 'ok' }, { l: 'readiness', v: '/readyz', cls: 'ok' }] },
      { log: 'The same database outage now makes only the readiness probe fail. The pods become NotReady and leave the Service endpoints, but no container is restarted.', callout: 'NotReady, not restarted', code: 3, state: { mode: 'fix', t: 7, r: 'DB down, pods NotReady' }, stats: [{ l: 'restarts', v: '0', cls: 'ok' }, { l: 'Ready', v: '0 / 4', cls: 'warn' }] },
      { log: 'When the database returns, readiness passes on the next check and traffic resumes at once, because the containers were never restarted.', callout: 'Back in service as soon as the database is', code: 3, state: { mode: 'fix', t: 12, r: 'recovered' }, stats: [{ l: 'outage', v: '~40 s', cls: 'ok' }, { l: 'restarts', v: '0', cls: 'ok' }],
        takeaway: 'Liveness answers "restart me?" and should be shallow. Readiness answers "send me traffic?" and may include dependencies.' }
    ],
  };

  /* ---------- 2. Slow start: liveness kills the pod before it is up; a startup probe protects it ---------- */
  const DEF2 = [{ label: 'app boot', y: 84 }, { label: 'startup', y: 118 }, { label: 'liveness', y: 152 }, { label: 'container', y: 186 }];
  const SLOW = {
    nostart: [
      ['info', 'info', 'info', 'bad', 'info', 'info', 'info', 'bad', 'info', 'info', 'info', 'bad'],
      ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
      ['none', 'bad', 'bad', 'bad', 'none', 'bad', 'bad', 'bad', 'none', 'bad', 'bad', 'bad'],
      ['ok', 'ok', 'ok', 'dim', 'ok', 'ok', 'ok', 'dim', 'ok', 'ok', 'ok', 'dim']
    ],
    start: [
      ['info', 'info', 'info', 'info', 'info', 'info', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'],
      ['warn', 'warn', 'warn', 'warn', 'warn', 'warn', 'ok', 'none', 'none', 'none', 'none', 'none'],
      ['dim', 'dim', 'dim', 'dim', 'dim', 'dim', 'none', 'ok', 'ok', 'ok', 'ok', 'ok'],
      ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']
    ]
  };
  const slow = {
    id: 'slow', label: 'Slow start', desc: 'The app needs 60 s to start. Liveness gives up after about 40 s and kills it in a loop. A startup probe with a longer budget holds liveness and readiness back until the app is up.',
    codeLabel: 'Config',
    code: { bug: ['livenessProbe: {httpGet: {path: /livez}, initialDelaySeconds: 10, periodSeconds: 10, failureThreshold: 3}', 'Liveness probe failed: Get "http://10.0.1.7:8080/livez": connect: connection refused', 'startupProbe:  {httpGet: {path: /livez}, periodSeconds: 10, failureThreshold: 15}   # 150 s budget', '# liveness and readiness start only after startupProbe succeeds'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'app needs 60 s to boot · liveness allows ~40 s', right: s.r || '' }),
      setup(kit) {
        const rows = lanes(kit, DEF2, 226);
        const lg = kit.text(null, { x: 16, y: 262, t: 'blue = booting · red = failing or killed · grey = not started yet · amber = startup waiting', cls: 'kt xs mut' });
        const restarts = kit.chip(null, { x: 16, y: 280, w: 200, h: 40, label: 'restarts', sub: '0', tone: 'info' });
        const ready = kit.chip(null, { x: 232, y: 280, w: 200, h: 40, label: 'Ready', sub: 'no', tone: 'info' });
        return { rows, restarts, ready };
      },
      frame(s, kit, R) {
        paint(R.rows, SLOW[s.mode || 'nostart'], s.t == null ? 0 : s.t);
        R.restarts.set({ sub: String(s.rc || 0), tone: (s.rc || 0) >= 2 ? 'warn' : 'info' });
        R.ready.set({ sub: s.up ? 'yes' : 'no', tone: s.up ? 'ok' : 'info' });
      }
    },
    bug: [
      { log: 'A JVM service needs about 60 s to boot (illustrative). Liveness has initialDelaySeconds 10, period 10 and failureThreshold 3, so it allows roughly 40 s.', callout: 'Boot needs 60 s; liveness allows about 40 s', code: 0, state: { mode: 'nostart', t: 1, r: 'booting' }, stats: [{ l: 'boot time', v: '60 s' }, { l: 'liveness budget', v: '~40 s', cls: 'warn' }] },
      { log: 'The first probes arrive while the app is still booting and nothing listens on the port yet, so they fail with connection refused.', callout: 'Liveness fails while the app is still booting', code: 1, state: { mode: 'nostart', t: 3, r: 'probes failing' }, stats: [{ l: 'failures in a row', v: '3', cls: 'bad' }, { l: 'app ready', v: 'no' }] },
      { log: 'The third failure reaches failureThreshold, and the kubelet kills the container 20 s before it would have been ready.', callout: 'Killed 20 s before it would be ready', moment: true, code: 1, state: { mode: 'nostart', t: 4, rc: 1, r: 'killed' }, stats: [{ l: 'restarts', v: '1', cls: 'bad' }, { l: 'lost boot work', v: '30 s', cls: 'bad' }] },
      { log: 'The new container starts the same slow boot, and the same probes kill it again. The pod restarts again and again and never becomes Ready.', callout: 'A loop: restart, boot, killed', code: 1, state: { mode: 'nostart', t: 12, rc: 3, r: 'restart loop' }, stats: [{ l: 'restarts', v: '3', cls: 'bad' }, { l: 'Ready', v: 'never', cls: 'bad' }] },
      { log: 'A startup probe gives a slow starter a budget of periodSeconds times failureThreshold, here 10 s times 15, which is 150 s. While it has not succeeded, liveness and readiness are not run.', callout: 'startupProbe: 150 s budget, others held back', code: 2, state: { mode: 'start', t: 4, r: 'startup waiting' }, stats: [{ l: 'startup budget', v: '150 s', cls: 'ok' }, { l: 'liveness', v: 'held back' }] },
      { log: 'At 60 s the app answers, the startup probe succeeds, and only then do liveness and readiness begin. The pod becomes Ready without a single restart.', callout: 'Startup passes at 60 s, then liveness takes over', code: 3, state: { mode: 'start', t: 12, up: true, r: 'Ready' }, stats: [{ l: 'restarts', v: '0', cls: 'ok' }, { l: 'Ready', v: 'yes', cls: 'ok' }],
        takeaway: 'A startupProbe protects a slow starter. Liveness and readiness begin only after it succeeds.' }
    ],
  };

  /* ---------- 3. Tight timeout under load: restarts remove capacity and make the load worse ---------- */
  const casc = {
    id: 'cascade', label: 'Restart cascade', desc: 'A traffic spike slows /health beyond timeoutSeconds. Each restart removes capacity, which slows the others, so the failures spread.',
    codeLabel: 'Config',
    code: { bug: ['livenessProbe: {httpGet: {path: /health}, timeoutSeconds: 1, periodSeconds: 10, failureThreshold: 3}', 'Liveness probe failed: context deadline exceeded (Client.Timeout exceeded while awaiting headers)', 'livenessProbe: {httpGet: {path: /livez}, timeoutSeconds: 5, periodSeconds: 10, failureThreshold: 3}', 'kubectl get pods -l app=web -w'] },
    stage: {
      w: W, h: H, footer: 'Simplified. Probe times and replica counts are illustrative.',
      header: s => ({ left: 'probe latency per pod · timeoutSeconds 1', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 16, y: 112, w: 420, labelW: 60, rowH: 30, items: [0, 1, 2, 3].map(i => ({ id: 'p' + i, label: 'pod-' + i })), max: 2000, unit: ' ms', title: 'time the probe takes (illustrative)' });
        const tw = 420 - 60 - 46 - 8, tx = 16 + 60 + tw * 1000 / 2000;
        const line = kit.el('line', { x1: tx, x2: tx, y1: 100, y2: 236 }, kit.layer); line.style.stroke = 'var(--bad)'; line.style.strokeDasharray = '5 4'; line.style.strokeWidth = 2;
        kit.text(null, { x: tx, y: 250, t: 'timeout 1 s', cls: 'kt xs tone-bad', anchor: 'middle' });
        const st = [0, 1, 2, 3].map(i => kit.chip(null, { x: 472, y: 100 + i * 34, w: 152, h: 28, label: '', sub: '', tone: 'info', small: true }));
        const cap = kit.chip(null, { x: 16, y: 272, w: 300, h: 40, label: 'capacity', sub: '4 of 4 pods', tone: 'ok' });
        return { bars, st, cap };
      },
      frame(s, kit, R) {
        const L = s.lat || [200, 200, 200, 200], S = s.st || ['ok', 'ok', 'ok', 'ok'];
        L.forEach((v, i) => {
          const dead = S[i] === 'restart';
          R.bars.set('p' + i, dead ? 0 : v, v > 1000 ? 'bad' : v > 700 ? 'warn' : 'ok', dead ? 'restart' : v + ' ms');
          R.st[i].set({ label: dead ? 'restarting' : S[i] === 'fail' ? 'probe failing' : 'ok', tone: dead ? 'delete' : S[i] === 'fail' ? 'warn' : 'ok' });
        });
        const live = S.filter(x => x !== 'restart').length;
        R.cap.set({ sub: live + ' of 4 pods', tone: live >= 4 ? 'ok' : live >= 3 ? 'warn' : 'info' });
      }
    },
    bug: [
      { log: 'Four replicas share the traffic. The /health endpoint runs on the same threads as normal requests and answers in about 200 ms. The probe timeout is the default, 1 s.', callout: 'Normal load: probes answer in 200 ms', code: 0, state: { lat: [200, 200, 200, 200], st: ['ok', 'ok', 'ok', 'ok'], r: 'steady' }, stats: [{ l: 'probe time', v: '200 ms', cls: 'ok' }, { l: 'capacity', v: '4 / 4' }] },
      { log: 'A traffic spike doubles the work per pod. Requests queue, and the probe now queues behind them, so probe time climbs toward the timeout.', callout: 'A spike slows the probe too', code: 0, state: { lat: [700, 800, 950, 750], st: ['ok', 'ok', 'ok', 'ok'], r: 'spike' }, stats: [{ l: 'probe time', v: '~800 ms', cls: 'warn' }, { l: 'timeout', v: '1 s' }] },
      { log: 'One pod\'s probe takes 1.2 s, longer than timeoutSeconds, so it counts as a failure. After three in a row the kubelet restarts that pod.', callout: 'One pod times out three times and is restarted', moment: true, code: 1, state: { lat: [750, 1200, 1100, 800], st: ['ok', 'restart', 'fail', 'ok'], r: 'pod-1 restarts' }, stats: [{ l: 'restarts', v: '1', cls: 'bad' }, { l: 'capacity', v: '3 / 4', cls: 'warn' }] },
      { log: 'The same traffic now lands on three pods, so each is slower. Probes on the others cross the timeout as well.', callout: 'Fewer pods, more load each: probes slow further', code: 1, state: { lat: [1150, 0, 1400, 1300], st: ['fail', 'restart', 'restart', 'fail'], r: 'cascade' }, stats: [{ l: 'restarts', v: '2', cls: 'bad' }, { l: 'capacity', v: '2 / 4', cls: 'bad' }] },
      { log: 'The cascade continues until almost nothing is left to serve. The restarts were meant to heal the pods, but they removed the capacity the spike needed.', callout: 'Capacity collapses exactly when it is needed', code: 1, state: { lat: [1800, 0, 0, 1900], st: ['restart', 'restart', 'restart', 'restart'], r: 'collapse' }, stats: [{ l: 'restarts', v: '4', cls: 'bad' }, { l: 'capacity', v: '0 / 4', cls: 'bad' }] },
      { log: 'The fix is a cheap liveness endpoint that does not wait behind requests, a longer timeout such as 5 s, and enough replicas or an autoscaler for the spike. The probes stay far below the limit.', callout: 'Cheap probe path, longer timeout, more headroom', code: 2, state: { lat: [60, 60, 60, 60], st: ['ok', 'ok', 'ok', 'ok'], r: 'stable' }, stats: [{ l: 'probe time', v: '60 ms', cls: 'ok' }, { l: 'restarts', v: '0', cls: 'ok' }],
        takeaway: 'A probe that waits behind real traffic turns a spike into a restart cascade. Keep liveness cheap and its timeout generous.' }
    ],
  };

  const flow = KH.flow(['Startup probe|started yet?', '*Liveness probe|alive? restart if not', 'Readiness probe|ready for traffic?', 'Ready condition|pod Ready or NotReady', 'EndpointSlice|ready IPs only'], 'Flow: each probe asks a different question and has a different consequence.');

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[6] = { explain: `
<h3>1. A running process is not a working service</h3>
<p>The kubelet knows whether a container process exists. It does not know whether that process can do useful work. A deadlocked server and a server that is still loading its cache both look "running". Kubernetes separates the two questions that matter and asks them with separate probes: <b>liveness</b> asks whether the process is stuck and should be restarted, <b>readiness</b> asks whether it can take traffic right now, and <b>startup</b> protects a slow starter from the other two until it is up.</p>
${flow}

<h3>2. What each probe does when it fails</h3>
<p>The kubelet runs every probe on its own schedule. A probe can be an HTTP GET, a TCP connection, a gRPC health check or a command run inside the container. The consequences differ. After <code>failureThreshold</code> consecutive liveness failures, the kubelet restarts the container. A failing readiness probe only sets the pod's <code>Ready</code> condition to false. The EndpointSlice controller then removes the pod from the ready addresses, so no new traffic arrives, and the container keeps running. The defaults for each probe are <code>initialDelaySeconds</code> 0, <code>periodSeconds</code> 10, <code>timeoutSeconds</code> 1, <code>successThreshold</code> 1 and <code>failureThreshold</code> 3.</p>

<h3>3. Why a deep liveness probe is dangerous</h3>
<p>If liveness checks a shared dependency such as the database, a dependency outage becomes a restart of every replica at once. Restarting does not fix the database, and now the pods have to boot as well, so the outage grows, as the first scene shows. Keep liveness shallow: it should prove only that this process can still answer. Put dependency checks in readiness, where the effect is only that the pod leaves the Service for a while and comes back by itself.</p>

<h3>4. Slow starters and tight timeouts</h3>
<p>An application that needs 60 s to start will be killed by a liveness probe that gives up after 40 s. Raising <code>initialDelaySeconds</code> works, but the right tool is a <code>startupProbe</code>: its budget is <code>failureThreshold</code> times <code>periodSeconds</code>, and while it has not succeeded the other two probes are not run. The opposite mistake is a timeout that is too tight. The default <code>timeoutSeconds</code> is 1 s, and a probe that waits behind real requests can exceed it during a spike. Each restart removes capacity and slows the survivors, which is how a spike becomes a cascade.</p>

<h3>5. The trade-off</h3>
<p>Shallow liveness is safe but blind to some failures: a pod whose database connection pool is broken may stay NotReady until someone looks. Read the restart count and the Ready status together, because they answer different questions. A rising restart count points to liveness or the app. A pod that is Running but not Ready points to readiness and its dependency. Alert on both, and treat a readiness failure on all replicas as a dependency incident, not a pod incident.</p>

<h3>6. Syntax</h3>
<pre>startupProbe:   {httpGet: {path: /livez,  port: 8080}, periodSeconds: 10, failureThreshold: 15}
livenessProbe:  {httpGet: {path: /livez,  port: 8080}, periodSeconds: 10, timeoutSeconds: 5, failureThreshold: 3}
readinessProbe: {httpGet: {path: /readyz, port: 8080}, periodSeconds: 5,  failureThreshold: 2}

kubectl get pods -l app=web -o wide              # READY column, RESTARTS column
kubectl describe pod web-0 | grep -i probe        # Liveness/Readiness probe failed: ...
kubectl get endpointslices -l kubernetes.io/service-name=web</pre>
<p>Startup, liveness and readiness may all use the same port, but they should not all call the same expensive handler.</p>`, scenarios: [deep, slow, casc] };
})();
