/* Chapter 5 "Kubelet and Pod Lifecycle": a restart timeline, a memory curve against a limit and CPU quota periods (index 5).
   Loads after course.js and scene-tools.js. Times, sizes and quotas are illustrative. */
(function () {
  const KH = window.KH, W = 640, H = 420;
  const FOOT = 'Simplified. Times, sizes and quotas are illustrative.';

  /* ---------- 1. CrashLoopBackOff: the restart gaps grow ---------- */
  /* run block widths and wait gap widths are NOT to scale; the labels carry the real seconds */
  const GAPS = [10, 20, 40, 80, 160, 300];
  const GW = [24, 40, 62, 90, 118, 150];
  const RUN = 10, X0 = 24, Y0 = 150;
  const GX = (() => { const xs = []; let x = X0; GAPS.forEach((g, i) => { xs.push(x); x += RUN + GW[i]; }); return xs; })();
  const crash = {
    id: 'crash', label: 'CrashLoopBackOff', desc: 'The app exits with code 1 because DATABASE_URL is missing. The kubelet waits longer before each restart, up to five minutes.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl logs web-7d9f6c5b8-abcde --previous', 'FATAL: DATABASE_URL is not set          # exit code 1', '$ kubectl get pod web-7d9f6c5b8-abcde', 'web-7d9f6c5b8-abcde   0/1   CrashLoopBackOff   5 (3m ago)', '$ kubectl set env deploy/web DATABASE_URL=postgres://db:5432/web'] },
    stage: {
      w: W, h: H, footer: 'Simplified. Run and wait blocks are not to scale; the labels show the seconds.',
      header: s => ({ left: 'container web · restartPolicy Always', right: s.r || '' }),
      setup(kit) {
        const track = kit.el('line', { x1: X0, y1: Y0 + 30, x2: 616, y2: Y0 + 30 }, kit.layer); track.style.stroke = 'var(--line)'; track.style.strokeWidth = 2;
        const runs = GAPS.map((g, i) => { const r = kit.el('rect', { x: GX[i], y: Y0, width: RUN, height: 30, rx: 3 }, kit.layer); r.style.fill = 'var(--bad)'; r.style.transition = 'opacity .35s'; r.style.opacity = 0; return r; });
        const waits = GAPS.map((g, i) => { const r = kit.el('rect', { x: GX[i] + RUN, y: Y0 + 8, width: GW[i], height: 14, rx: 3 }, kit.layer); r.style.fill = 'color-mix(in srgb, var(--warn) 35%, var(--card))'; r.style.stroke = 'var(--warn)'; r.style.transition = 'opacity .35s'; r.style.opacity = 0; return r; });
        const labs = GAPS.map((g, i) => kit.text(null, { x: GX[i] + RUN + GW[i] / 2, y: Y0 + 54, t: g + ' s', cls: 'kt xs', anchor: 'middle' }));
        labs.forEach(l => l.show(false));
        const key = kit.text(null, { x: X0, y: 96, t: 'red = container ran and exited · amber = kubelet waits (back-off)', cls: 'kt xs mut' });
        const st = kit.chip(null, { x: 16, y: 236, w: 196, h: 44, label: 'State', sub: 'Waiting', tone: 'info' });
        const rs = kit.chip(null, { x: 224, y: 236, w: 196, h: 44, label: 'Restart count', sub: '0', tone: 'info' });
        const ex = kit.chip(null, { x: 432, y: 236, w: 192, h: 44, label: 'Last exit', sub: '-', tone: 'info' });
        return { runs, waits, labs, st, rs, ex, key };
      },
      frame(s, kit, R) {
        const k = s.k || 0, up = !!s.up;
        R.runs.forEach((r, i) => { r.style.opacity = i < k || (up && i === k) ? 1 : 0; r.style.fill = up && i === k ? 'var(--ok)' : 'var(--bad)'; if (up && i === k) r.setAttribute('width', 120); else r.setAttribute('width', RUN); });
        R.waits.forEach((r, i) => { r.style.opacity = i < k ? 1 : 0; });
        R.labs.forEach((l, i) => l.show(i < k));
        R.st.set({ sub: up ? 'Running' : s.state || 'Waiting', tone: up ? 'ok' : s.stT || 'info' });
        R.rs.set({ sub: String(s.rc || 0), tone: (s.rc || 0) >= 5 ? 'warn' : 'info' });
        R.ex.set({ sub: s.exit || '-', tone: s.exit ? 'warn' : 'info' });
      }
    },
    bug: [
      { log: 'The kubelet starts the container. The app needs DATABASE_URL, which is not set, so it prints a fatal error and exits with code 1 after a moment.', callout: 'The container starts and exits with code 1', code: 0, state: { k: 0, rc: 0, state: 'Terminated', stT: 'warn', exit: 'Error, code 1', r: 'first crash' }, stats: [{ l: 'exit code', v: '1', cls: 'warn' }, { l: 'restarts', v: '0' }] },
      { log: 'restartPolicy is Always, so the kubelet restarts it, but not at once. The first back-off is 10 seconds.', callout: 'The first restart waits 10 seconds', code: 1, state: { k: 1, rc: 1, state: 'Waiting: CrashLoopBackOff', stT: 'warn', exit: 'Error, code 1', r: 'wait 10 s' }, stats: [{ l: 'restarts', v: '1', cls: 'warn' }, { l: 'next wait', v: '20 s' }] },
      { log: 'The app fails the same way again. Each failure doubles the wait: 10, then 20, then 40 seconds.', callout: 'Each failure doubles the wait', code: 1, state: { k: 3, rc: 3, state: 'Waiting: CrashLoopBackOff', stT: 'warn', exit: 'Error, code 1', r: 'wait doubles' }, stats: [{ l: 'restarts', v: '3', cls: 'warn' }, { l: 'next wait', v: '80 s' }] },
      { log: 'After more failures the wait reaches the cap of five minutes. The pod now spends most of its time waiting, and kubectl get pod shows CrashLoopBackOff.', callout: 'Back-off is capped at 5 minutes', moment: true, code: 3, state: { k: 6, rc: 6, state: 'Waiting: CrashLoopBackOff', stT: 'warn', exit: 'Error, code 1', r: 'capped at 300 s' }, stats: [{ l: 'restarts', v: '6', cls: 'bad' }, { l: 'wait now', v: '300 s', cls: 'bad' }] },
      { log: 'Logs from the previous container instance show the real cause: the variable is missing. Nothing is wrong with the node, the image or the limits.', callout: 'kubectl logs --previous names the cause', code: 0, state: { k: 6, rc: 6, state: 'Waiting: CrashLoopBackOff', stT: 'warn', exit: 'Error, code 1', r: 'read the logs' }, stats: [{ l: 'cause', v: 'DATABASE_URL unset', cls: 'warn' }, { l: 'restarts', v: '6' }] },
      { log: 'The variable is provided through the Deployment. The next restart attempt starts the app, which stays up. After the container runs for ten minutes without trouble, the back-off timer resets.', callout: 'The app stays up; the back-off resets later', code: 4, state: { k: 6, rc: 6, up: true, exit: 'Error, code 1', r: 'Running' }, stats: [{ l: 'state', v: 'Running', cls: 'ok' }, { l: 'restarts', v: '6 (stable)' }],
        takeaway: 'CrashLoopBackOff means the app keeps exiting. Read the previous logs and exit code, not the node. The wait grows to five minutes.' }
    ],
  };

  /* ---------- 2. OOMKilled: the memory curve meets the container limit ---------- */
  const PX0 = 40, PY1 = 230, PW = 400, PH = 140, MMAX = 600;
  const MEM = [30, 90, 170, 260, 350, 450, 380, 320, 300, 300, 300];
  const px = t => PX0 + t * (PW / 10), py = m => PY1 - m / MMAX * PH;
  const curve = lim => {
    const pts = []; let killedAt = null;
    for (let t = 0; t <= 10; t++) {
      const m = MEM[t];
      if (m >= lim) { const prev = MEM[t - 1], f = (lim - prev) / (m - prev); pts.push([t - 1 + f, lim]); killedAt = [t - 1 + f, lim]; break; }
      pts.push([t, m]);
    }
    return { d: pts.map((p, i) => (i ? 'L' : 'M') + px(p[0]).toFixed(1) + ' ' + py(p[1]).toFixed(1)).join(' '), killedAt };
  };
  const oom = {
    id: 'oom', label: 'OOMKilled', desc: 'A startup cache grows to a peak of 450 MiB (illustrative) but the memory limit is 256Mi. The kernel kills the process; a higher limit stops the kills.',
    codeLabel: 'kubectl',
    code: { bug: ['resources: {requests: {memory: 256Mi}, limits: {memory: 256Mi}}', '$ kubectl describe pod web-0 | grep -A4 "Last State"', '    Last State:  Terminated  Reason: OOMKilled  Exit Code: 137', 'resources: {requests: {memory: 320Mi}, limits: {memory: 512Mi}}'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'container memory over time · limit ' + (s.lim || 256) + 'Mi', right: s.r || '' }),
      setup(kit) {
        const ax = kit.el('path', { d: `M${PX0} ${py(MMAX)} V${PY1} H${PX0 + PW}` }, kit.layer); ax.style.stroke = 'var(--mut)'; ax.style.fill = 'none';
        kit.text(null, { x: PX0 - 6, y: py(MMAX) + 4, t: '600', cls: 'kt xs mut', anchor: 'end' });
        kit.text(null, { x: PX0 + PW, y: PY1 + 14, t: 'time since start', cls: 'kt xs mut', anchor: 'end' });
        const line = kit.el('line', { x1: PX0, x2: PX0 + PW, y1: py(256), y2: py(256) }, kit.layer); line.style.stroke = 'var(--bad)'; line.style.strokeDasharray = '6 4'; line.style.strokeWidth = 2; line.style.transition = 'y1 .5s, y2 .5s';
        const lt = kit.text(null, { x: PX0 + PW + 4, y: py(256) + 4, t: 'limit', cls: 'kt xs tone-bad' });
        const path = kit.el('path', { d: '' }, kit.layer); path.style.stroke = 'var(--acc2)'; path.style.strokeWidth = 3; path.style.fill = 'none';
        const kill = kit.el('circle', { cx: 0, cy: 0, r: 8 }, kit.layer); kill.style.fill = 'var(--bad)'; kill.style.stroke = 'var(--ink)'; kill.style.opacity = 0;
        const st = kit.chip(null, { x: 480, y: 80, w: 144, h: 50, label: 'Last State', sub: 'none', tone: 'info' });
        const ex = kit.chip(null, { x: 480, y: 142, w: 144, h: 50, label: 'Exit code', sub: '-', tone: 'info' });
        const rs = kit.chip(null, { x: 480, y: 204, w: 144, h: 50, label: 'Restarts', sub: '0', tone: 'info' });
        const node = kit.chip(null, { x: 16, y: 268, w: 608, h: 40, label: 'node memory: 70% free', sub: '', tone: 'ok' });
        return { line, lt, path, kill, st, ex, rs, node };
      },
      frame(s, kit, R) {
        const lim = s.lim || 256, c = curve(lim);
        R.line.setAttribute('y1', py(lim)); R.line.setAttribute('y2', py(lim)); R.lt.el.setAttribute('y', py(lim) + 4); R.lt.set(lim + 'Mi limit');
        const show = s.draw == null ? 1 : s.draw;
        R.path.setAttribute('d', show ? c.d : '');
        R.kill.style.opacity = show && c.killedAt && s.mark ? 1 : 0;
        if (c.killedAt) { R.kill.setAttribute('cx', px(c.killedAt[0])); R.kill.setAttribute('cy', py(c.killedAt[1])); }
        R.st.set({ sub: s.dead ? 'OOMKilled' : s.alive ? 'Running' : 'none', tone: s.dead ? 'warn' : s.alive ? 'ok' : 'info' });
        R.ex.set({ sub: s.dead ? '137 = SIGKILL' : '-', tone: s.dead ? 'warn' : 'info' });
        R.rs.set({ sub: String(s.rc || 0), tone: (s.rc || 0) >= 2 ? 'warn' : 'info' });
      }
    },
    bug: [
      { log: 'The container has a memory limit of 256Mi. On start, the app fills a cache, so its memory grows toward a peak well above the limit.', callout: 'Startup cache: memory climbs toward 450Mi', code: 0, state: { lim: 256, draw: 1, alive: true, r: 'growing' }, stats: [{ l: 'limit', v: '256Mi' }, { l: 'real peak', v: '450Mi', cls: 'warn' }] },
      { log: 'When the container reaches 256Mi, the kernel kills it, because the limit is enforced by the container\'s cgroup. The process gets SIGKILL and never reaches its peak.', callout: 'Over the limit: the kernel kills the process', moment: true, code: 0, state: { lim: 256, mark: true, dead: true, rc: 1, r: 'OOM kill' }, stats: [{ l: 'exit code', v: '137', cls: 'bad' }, { l: 'restarts', v: '1', cls: 'warn' }] },
      { log: 'kubectl describe shows Last State Terminated with Reason OOMKilled and exit code 137. The node still has plenty of free memory: the limit is per container, not per node.', callout: 'The node is fine; the container hit its own limit', code: 2, state: { lim: 256, mark: true, dead: true, rc: 1, r: 'node not full' }, stats: [{ l: 'node memory free', v: '70%', cls: 'ok' }, { l: 'Reason', v: 'OOMKilled', cls: 'bad' }] },
      { log: 'The kubelet restarts the container, and it does the same thing again, so the restart count rises with the same signature each time.', callout: 'Restart, grow, get killed again', code: 0, state: { lim: 256, mark: true, dead: true, rc: 3, r: 'repeating' }, stats: [{ l: 'restarts', v: '3', cls: 'bad' }, { l: 'same peak', v: 'every time' }] },
      { log: 'The fix starts with measuring the real peak, here 450Mi, from metrics or from a run with a high limit. The limit must sit above the peak, with some margin.', callout: 'Measure the peak, then set the limit above it', code: 3, state: { lim: 512, draw: 1, alive: true, rc: 3, r: 'limit 512Mi' }, stats: [{ l: 'limit', v: '512Mi', cls: 'ok' }, { l: 'real peak', v: '450Mi' }] },
      { log: 'The curve stays under the line. The cache is built, memory settles near 300Mi and the container keeps running. The restart count stops growing.', callout: 'Under the limit: no more kills', code: 3, state: { lim: 512, draw: 1, alive: true, rc: 3, r: 'stable' }, stats: [{ l: 'state', v: 'Running', cls: 'ok' }, { l: 'restarts', v: '3 (stable)' }],
        takeaway: 'A memory limit is a hard wall per container. A peak above it ends in OOMKilled and exit 137, whatever the node has free.' }
    ],
  };

  /* ---------- 3. CPU limit: throttling inside each 100 ms period ---------- */
  const CX = i => 16 + i * 204;
  const cpu = {
    id: 'cpu', label: 'CPU throttling', desc: 'A CPU limit is a quota per 100 ms period. A request that needs 70 ms of CPU under a 500m limit is paused for the rest of the period, even when the node is idle.',
    codeLabel: 'Config',
    code: { bug: ['resources: {requests: {cpu: 250m}, limits: {cpu: 500m}}   # 50 ms of CPU per 100 ms period', '# the request needs 70 ms of CPU: it runs 50 ms, then waits for the next period', 'resources: {requests: {cpu: 250m}}                           # no CPU limit', 'resources: {requests: {cpu: 500m}, limits: {cpu: 1}}'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'cgroup quota in 100 ms periods', right: s.r || '' }),
      setup(kit) {
        const periods = [0, 1, 2].map(i => {
          const box = kit.el('rect', { x: CX(i), y: 100, width: 192, height: 40, rx: 8 }, kit.layer); box.style.fill = 'var(--soft)'; box.style.stroke = 'var(--ink)';
          const used = kit.el('rect', { x: CX(i), y: 100, width: 0, height: 40, rx: 8 }, kit.layer); used.style.fill = 'color-mix(in srgb, var(--ok) 55%, var(--card))'; used.style.transition = 'width .6s, x .6s';
          const thr = kit.el('rect', { x: CX(i), y: 100, width: 0, height: 40, rx: 8 }, kit.layer); thr.style.fill = 'color-mix(in srgb, var(--bad) 30%, var(--card))'; thr.style.stroke = 'var(--bad)'; thr.style.strokeDasharray = '4 3'; thr.style.transition = 'width .6s, x .6s';
          const tl = kit.text(null, { x: CX(i) + 96, y: 92, t: 'period ' + (i + 1) + ' (100 ms)', cls: 'kt xs mut', anchor: 'middle' });
          return { used, thr };
        });
        const quota = kit.chip(null, { x: 16, y: 164, w: 300, h: 44, label: 'quota', sub: '50 ms of CPU per period', tone: 'info' });
        const node = kit.chip(null, { x: 332, y: 164, w: 292, h: 44, label: 'node CPU', sub: '35% busy, rest idle', tone: 'ok' });
        const lat = kit.bars(null, { x: 16, y: 252, w: 400, labelW: 130, rowH: 30, items: [{ id: 'lat', label: 'request latency' }, { id: 'need', label: 'CPU time needed' }], max: 150, unit: ' ms', title: 'one request (illustrative)' });
        return { periods, quota, node, lat };
      },
      frame(s, kit, R) {
        const P = s.p || [[0, 0], [0, 0], [0, 0]];
        R.periods.forEach((p, i) => {
          const u = P[i][0] * 1.92, t = P[i][1] * 1.92;
          p.used.setAttribute('width', u); p.used.setAttribute('x', CX(i));
          p.thr.setAttribute('x', CX(i) + u); p.thr.setAttribute('width', t);
        });
        R.quota.set({ sub: s.q || '50 ms of CPU per period', tone: s.qT || 'info' });
        const lat = s.lat || 0;
        R.lat.set('lat', lat, lat > 100 ? 'bad' : lat > 0 ? 'ok' : 'info', lat ? lat + ' ms' : '');
        R.lat.set('need', s.need || 0, 'info', s.need ? s.need + ' ms' : '');
      }
    },
    bug: [
      { log: 'A container has a CPU limit of 500m. The kernel turns that into a quota: 50 ms of CPU time in every 100 ms period.', callout: 'Limit 500m = 50 ms of CPU per 100 ms', code: 0, state: { p: [[0, 0], [0, 0], [0, 0]], r: 'limit 500m' }, stats: [{ l: 'quota', v: '50 ms / 100 ms' }, { l: 'node CPU busy', v: '35%', cls: 'ok' }] },
      { log: 'A request arrives that needs 70 ms of CPU. It runs for 50 ms and has used the whole quota of this period.', callout: 'The request uses the whole quota in 50 ms', code: 1, state: { p: [[50, 0], [0, 0], [0, 0]], need: 70, q: 'used 50 of 50 ms', qT: 'warn', r: 'period 1' }, stats: [{ l: 'CPU used', v: '50 ms' }, { l: 'still needed', v: '20 ms', cls: 'warn' }] },
      { log: 'The kernel throttles the container for the remaining 50 ms of the period, so the request waits even though the node has idle CPUs.', callout: 'Throttled for the rest of the period', moment: true, code: 1, state: { p: [[50, 50], [0, 0], [0, 0]], need: 70, q: 'exhausted: throttled', qT: 'warn', r: 'throttled 50 ms' }, stats: [{ l: 'throttled', v: '50 ms', cls: 'bad' }, { l: 'node CPU busy', v: '35%', cls: 'ok' }] },
      { log: 'In the next period the quota is refilled and the last 20 ms run. The request finishes after 120 ms instead of 70 ms.', callout: 'Finished in the next period: 120 ms', code: 1, state: { p: [[50, 50], [20, 0], [0, 0]], need: 70, lat: 120, q: 'refilled each period', r: 'latency 120 ms' }, stats: [{ l: 'latency', v: '120 ms', cls: 'bad' }, { l: 'CPU needed', v: '70 ms' }] },
      { log: 'The pattern repeats for every burst that is larger than the quota. p99 latency shows spikes at multiples of 100 ms while average CPU looks low.', callout: 'p99 spikes appear in steps of 100 ms', code: 1, state: { p: [[50, 50], [50, 50], [20, 0]], need: 70, lat: 120, q: 'repeats every burst', r: 'p99 spikes' }, stats: [{ l: 'p99', v: '120+ ms', cls: 'bad' }, { l: 'avg CPU', v: 'low', cls: 'ok' }] },
      { log: 'The fix is to remove the CPU limit and keep the request, or to raise the limit above the burst. The request then runs for its 70 ms without being paused.', callout: 'Remove or raise the limit: no pause', code: 2, state: { p: [[70, 0], [0, 0], [0, 0]], need: 70, lat: 70, q: 'no limit: 70 ms runs straight', qT: 'cursor', r: 'no throttling' }, stats: [{ l: 'latency', v: '70 ms', cls: 'ok' }, { l: 'throttled', v: '0', cls: 'ok' }],
        takeaway: 'A CPU limit pauses the container when its quota is spent, even on an idle node. Memory kills; CPU only slows.' }
    ],
  };

  const flow = KH.flow(['Pod bound|spec.nodeName set', '*Kubelet watches|its node\'s pods', 'CRI runtime|pull, sandbox, start', 'cgroups|limits enforced', 'Status written|back to the API server'], 'Flow: the kubelet reconciles its own pods and reports the result as status, which controllers then read.');

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[5] = { explain: `
<h3>1. The node agent</h3>
<p>A Pod is only a record until an agent on its node turns it into running processes. The <b>kubelet</b> runs on every node. It watches for Pods whose <code>spec.nodeName</code> is its own node, asks the container runtime to run them, enforces their resource limits and writes the observed state back as <code>status</code>. It is one more reconcile loop, and its object is the set of Pods bound to its node.</p>
${flow}

<h3>2. From Pod to process</h3>
<p>The kubelet talks to the runtime, such as containerd or CRI-O, through the Container Runtime Interface. For each Pod it creates a sandbox with the shared network namespace, pulls the images, then creates and starts the containers. The Events in <code>kubectl describe pod</code> follow that order: <i>Scheduled</i>, <i>Pulling</i>, <i>Pulled</i>, <i>Created</i>, <i>Started</i>. A Pod has a phase (<code>Pending</code>, <code>Running</code>, <code>Succeeded</code>, <code>Failed</code>) and every container has a state: <code>Waiting</code> with a reason, <code>Running</code>, or <code>Terminated</code> with an exit code. Most "why is my Pod not running" questions are answered by the reason in the Waiting state or by the exit code in the last Terminated state.</p>

<h3>3. Restarts and back-off</h3>
<p>When a container exits, the kubelet restarts it according to <code>restartPolicy</code>. With <code>Always</code>, the default for Deployments, it waits before each restart. The wait starts at 10 seconds, doubles after each failure, and is capped at five minutes. The timer resets after the container has run for ten minutes without trouble. The same kind of back-off applies to failed image pulls, where the status cycles between <code>ErrImagePull</code> and <code>ImagePullBackOff</code>. The first scene shows why a pod in <code>CrashLoopBackOff</code> spends most of its time waiting: the real cause is in <code>kubectl logs --previous</code> and in the exit code, not on the node.</p>

<h3>4. Limits are enforced by the kernel</h3>
<p>The kubelet sets cgroup limits for each container. A <b>memory limit</b> is a hard wall. A container that goes over it is killed by the kernel's OOM killer with exit code 137 (128 plus SIGKILL), and the status shows <code>OOMKilled</code>, even when the node has plenty of free memory. A <b>CPU limit</b> works differently. It becomes a quota of CPU time per period, by default 100 ms. A container that spends its quota is throttled until the next period. It is slowed, not killed, which is why latency-sensitive services can suffer from a CPU limit on an idle node. <b>Requests</b>, on the other hand, are what the scheduler counts and what the kernel uses as relative CPU weight when the node is busy.</p>

<h3>5. The trade-off</h3>
<p>Restarts hide transient faults, but they also hide how quickly an app fails, so watch the restart count. Memory limits protect neighbours and turn every peak above the limit into a kill, so they must sit above the real peak, including startup. CPU limits protect against noisy neighbours but can add latency even on idle nodes, so many teams set CPU requests and leave CPU limits off for latency-critical services. Read the signature first: a pull error means the image or registry, a CrashLoop with an exit code means the app, and OOMKilled with 137 means the limit.</p>

<h3>6. Syntax</h3>
<pre>kubectl describe pod web-0 | grep -A6 "State:"
kubectl logs web-0 --previous
kubectl get pod web-0 -o jsonpath='{.status.containerStatuses[0].lastState}'
kubectl top pod web-0 --containers

resources:
  requests: {cpu: 250m, memory: 320Mi}
  limits:   {memory: 512Mi}        # CPU limit left off on purpose
restartPolicy: Always</pre>
<p>Exit code 1 is the app failing, 137 is a SIGKILL (often an OOM kill), and 143 is a clean SIGTERM shutdown.</p>`, scenarios: [crash, oom, cpu] };
})();
