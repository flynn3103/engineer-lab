/* Chapter 9 "Horizontal Pod Autoscaler": utilisation and replica charts, a flapping comparison and a missing request (index 9).
   Loads after course.js and scene-tools.js. One column is one 15 s HPA sync; loads and timings are illustrative. */
(function () {
  const KH = window.KH, W = 640, H = 420;
  const FOOT = 'Simplified. One column = 15 s. Loads and timings are illustrative.';
  const line = (kit, color, w, dash) => { const p = kit.el('path', { d: '' }, kit.layer); p.style.fill = 'none'; p.style.stroke = color; p.style.strokeWidth = w || 2.5; if (dash) p.style.strokeDasharray = dash; p.style.strokeLinejoin = 'round'; return p; };
  const dpath = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');

  /* ---------- 1. A 7x spike: utilisation, the formula and the scale-up limit ---------- */
  const X0 = 60, DX = 52, NT = 10;
  const UTIL = [70, 70, 490, 490, 245, 122.5, 70, 70, 70, 70];
  const SPEC = [4, 4, 8, 16, 28, 28, 28, 28, 28, 28];
  const READY = [4, 4, 4, 4, 8, 16, 28, 28, 28, 28];
  const uy = u => 150 - Math.min(u, 500) / 500 * 70, ry = r => 262 - r / 30 * 80;
  const spike = {
    id: 'spike', label: 'A 7x spike', desc: 'Traffic rises about 7 times at 20:00. The HPA computes the replica count from utilisation, but scale-up is limited per step and new pods take time to become Ready.',
    codeLabel: 'kubectl',
    code: { bug: ['spec: {minReplicas: 4, maxReplicas: 30, metrics: [{type: Resource, resource: {name: cpu, target: {type: Utilization, averageUtilization: 70}}}]}', 'desired = ceil(current x metric / target) = ceil(4 x 490 / 70) = 28', 'behavior.scaleUp: no window, add max(100% of pods, 4 pods) per 15 s', '$ kubectl get hpa web -w'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'HPA web · target 70% of CPU requests', right: s.r || '' }),
      setup(kit) {
        kit.text(null, { x: X0, y: 74, t: 'CPU utilisation of requests (%)', cls: 'kt xs mut' });
        kit.text(null, { x: X0, y: 168, t: 'replicas: Ready (solid) and requested but not Ready (light)', cls: 'kt xs mut' });
        const tg = kit.el('line', { x1: X0, x2: X0 + NT * DX, y1: uy(70), y2: uy(70) }, kit.layer); tg.style.stroke = 'var(--ok)'; tg.style.strokeDasharray = '5 4'; tg.style.strokeWidth = 2;
        kit.text(null, { x: X0 + NT * DX + 4, y: uy(70) + 4, t: '70%', cls: 'kt xs tone-ok' });
        const ax = kit.el('path', { d: `M${X0} 80 V150 H${X0 + NT * DX} M${X0} 182 V262 H${X0 + NT * DX}` }, kit.layer); ax.style.stroke = 'var(--mut)'; ax.style.fill = 'none';
        const ul = line(kit, 'var(--acc2)', 3);
        const bars = Array.from({ length: NT }, (_, i) => {
          const a = kit.el('rect', { x: X0 + i * DX + 8, y: 262, width: DX - 16, height: 0, rx: 3 }, kit.layer); a.style.fill = 'color-mix(in srgb, var(--acc) 22%, var(--card))'; a.style.stroke = 'var(--acc)'; a.style.strokeDasharray = '3 2'; a.style.transition = 'y .4s, height .4s';
          const b = kit.el('rect', { x: X0 + i * DX + 8, y: 262, width: DX - 16, height: 0, rx: 3 }, kit.layer); b.style.fill = 'color-mix(in srgb, var(--ok) 55%, var(--card))'; b.style.stroke = 'var(--ink)'; b.style.transition = 'y .4s, height .4s';
          return { a, b };
        });
        for (let i = 0; i < NT; i += 2) kit.text(null, { x: X0 + i * DX + DX / 2, y: 278, t: (i * 15) + 's', cls: 'kt xs mut', anchor: 'middle' });
        const f = kit.chip(null, { x: 60, y: 284, w: 520, h: 36, label: '', sub: '', tone: 'info' });
        return { ul, bars, f };
      },
      frame(s, kit, R) {
        const t = s.t || 1;
        R.ul.setAttribute('d', dpath(UTIL.slice(0, t).map((u, i) => [X0 + i * DX + DX / 2, uy(u)])));
        R.bars.forEach((b, i) => {
          const on = i < t, sp = on ? SPEC[i] : 0, rd = on ? READY[i] : 0;
          b.a.setAttribute('y', ry(sp)); b.a.setAttribute('height', sp ? 262 - ry(sp) : 0);
          b.b.setAttribute('y', ry(rd)); b.b.setAttribute('height', rd ? 262 - ry(rd) : 0);
        });
        R.f.set({ label: s.f || '', tone: s.fT || 'info', w: 520 });
      }
    },
    bug: [
      { log: 'Four pods run at 70% of their CPU requests, which is the target. The HPA reads utilisation every 15 s and finds nothing to change.', callout: 'On target: 4 pods at 70%', code: 0, state: { t: 2, f: 'utilisation 70% = target: no change', r: 'steady' }, stats: [{ l: 'replicas', v: '4', cls: 'ok' }, { l: 'utilisation', v: '70%', cls: 'ok' }] },
      { log: 'At 20:00 a sale starts and requests rise about 7 times. The same four pods now run at 490% of their requests.', callout: 'Traffic rises 7x: utilisation 490%', code: 1, state: { t: 3, f: 'desired = ceil(4 x 490 / 70) = 28', fT: 'warn', r: '7x spike' }, stats: [{ l: 'utilisation', v: '490%', cls: 'bad' }, { l: 'desired', v: '28', cls: 'warn' }] },
      { log: 'Scale-up has no stabilisation window, but each step is limited: at most the larger of 100% of the current pods or 4 pods per period. The first step goes from 4 to 8.', callout: 'The step limit allows 4 to 8, not 28', code: 2, state: { t: 4, f: 'step limit: max(100%, 4 pods): 4 to 8', fT: 'warn', r: 'step 1' }, stats: [{ l: 'requested', v: '8' }, { l: 'Ready', v: '4', cls: 'bad' }] },
      { log: 'The new pods still have to be scheduled, pull the image and pass readiness. The HPA keeps measuring the old, overloaded pods, so utilisation stays at 490% and it asks for 16.', callout: 'New pods are not Ready yet: the metric stays high', moment: true, code: 2, state: { t: 5, f: 'Ready lags the request: limit 8 to 16', fT: 'warn', r: 'waiting for Ready' }, stats: [{ l: 'requested', v: '16' }, { l: 'Ready', v: '4', cls: 'bad' }] },
      { log: 'The first 8 pods become Ready and utilisation falls to 245%. The formula still asks for 28, now within the step limit.', callout: '8 Ready: utilisation 245%, the request reaches 28', code: 2, state: { t: 6, f: 'desired = ceil(8 x 245 / 70) = 28', r: 'step 3' }, stats: [{ l: 'requested', v: '28' }, { l: 'Ready', v: '8', cls: 'warn' }] },
      { log: 'Sixteen pods are Ready and utilisation is 122%. Twenty-eight are requested and the last ones are starting.', callout: '16 Ready: utilisation 122%', code: 3, state: { t: 7, f: 'utilisation 122%: still above target', r: 'catching up' }, stats: [{ l: 'Ready', v: '16', cls: 'warn' }, { l: 'utilisation', v: '122%', cls: 'warn' }] },
      { log: 'All 28 pods are Ready and utilisation is back at 70%. Within 10% of the target the HPA does nothing, so it holds.', callout: '28 Ready: back at 70%, within tolerance', code: 3, state: { t: 10, f: 'within 10% of target: hold at 28', fT: 'ok', r: 'converged' }, stats: [{ l: 'Ready', v: '28', cls: 'ok' }, { l: 'utilisation', v: '70%', cls: 'ok' }],
        takeaway: 'desired = ceil(current x metric / target). Scale-up is capped per step and waits for Ready pods, so overload lasts a few periods.' }
    ],
  };

  /* ---------- 2. Flapping: a short scale-down window follows every dip ---------- */
  const FN = 24, FX0 = 60, FDX = 22;
  const NEED = Array.from({ length: FN }, (_, i) => (i % 6 < 3 ? 4 : 10));
  const READYOF = spec => spec.map((v, i) => Math.min(v, spec[Math.max(0, i - 1)], spec[Math.max(0, i - 2)]));
  const SHORT = NEED.slice();
  const LONG = NEED.map((_, i) => Math.max(...NEED.slice(Math.max(0, i - 19), i + 1)));
  const RS = READYOF(SHORT), RL = READYOF(LONG);
  const events = a => a.reduce((n, v, i) => n + (i && v !== a[i - 1] ? 1 : 0), 0);
  const over = (r) => r.reduce((n, v, i) => n + (v < NEED[i] ? 1 : 0), 0);
  const fy = r => 248 - r / 12 * 160;
  const flap = {
    id: 'flap', label: 'Flapping', desc: 'The load is a sawtooth. A short scale-down window follows every dip and is overloaded after each rise. A 300 s window keeps the highest recent recommendation.',
    codeLabel: 'Config',
    code: { bug: ['behavior:', '  scaleDown: {stabilizationWindowSeconds: 15}    # follows every dip', '  scaleDown: {stabilizationWindowSeconds: 300}   # default: highest of the last 5 minutes', 'kubectl describe hpa web      # Events: SuccessfulRescale'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'replicas over 6 minutes · sawtooth load', right: s.r || '' }),
      setup(kit) {
        const ax = kit.el('path', { d: `M${FX0} 84 V248 H${FX0 + FN * FDX}` }, kit.layer); ax.style.stroke = 'var(--mut)'; ax.style.fill = 'none';
        kit.text(null, { x: FX0 - 6, y: fy(10) + 4, t: '10', cls: 'kt xs mut', anchor: 'end' }); kit.text(null, { x: FX0 - 6, y: fy(4) + 4, t: '4', cls: 'kt xs mut', anchor: 'end' });
        const need = line(kit, 'var(--mut)', 2, '4 3'), sh = line(kit, 'var(--bad)', 3), lg = line(kit, 'var(--ok)', 3);
        const strips = [0, 1].map(k => Array.from({ length: FN }, (_, i) => { const r = kit.el('rect', { x: FX0 + i * FDX + 2, y: 254 + k * 12, width: FDX - 4, height: 8, rx: 2 }, kit.layer); r.style.fill = 'var(--bad)'; r.style.opacity = 0; r.style.transition = 'opacity .3s'; return r; }));
        kit.text(null, { x: FX0 - 6, y: 262, t: 'short', cls: 'kt xs mut', anchor: 'end' }); kit.text(null, { x: FX0 - 6, y: 274, t: '300 s', cls: 'kt xs mut', anchor: 'end' });
        kit.text(null, { x: FX0, y: 288, t: 'dashed grey = replicas needed · red = 15 s window · green = 300 s window · red blocks = overloaded', cls: 'kt xs mut' });
        const c1 = kit.chip(null, { x: 60, y: 296, w: 250, h: 28, label: '', sub: '', tone: 'info', small: true, show: false });
        const c2 = kit.chip(null, { x: 326, y: 296, w: 250, h: 28, label: '', sub: '', tone: 'info', small: true, show: false });
        return { need, sh, lg, strips, c1, c2 };
      },
      frame(s, kit, R) {
        const px = (a, i) => [FX0 + i * FDX + FDX / 2, fy(a[i])];
        R.need.setAttribute('d', dpath(NEED.map((_, i) => px(NEED, i))));
        R.sh.setAttribute('d', s.short ? dpath(SHORT.map((_, i) => px(SHORT, i))) : '');
        R.lg.setAttribute('d', s.long ? dpath(LONG.map((_, i) => px(LONG, i))) : '');
        R.strips[0].forEach((r, i) => { r.style.opacity = s.short && s.over && RS[i] < NEED[i] ? 1 : 0; });
        R.strips[1].forEach((r, i) => { r.style.opacity = s.long && s.over && RL[i] < NEED[i] ? 1 : 0; });
        R.c1.set({ show: !!s.short && !!s.count, label: 'short: ' + events(SHORT) + ' scale events, ' + over(RS) * 15 + ' s overloaded', tone: 'warn', w: 250 });
        R.c2.set({ show: !!s.long && !!s.count, label: '300 s: ' + events(LONG) + ' scale event, ' + over(RL) * 15 + ' s overloaded', tone: 'ok', w: 250 });
      }
    },
    bug: [
      { log: 'The load alternates between needing 4 pods and needing 10, in steps of about 45 s (illustrative). The grey line shows the replicas the load needs.', callout: 'The load needs 4 pods, then 10, then 4 again', code: 0, state: { r: 'sawtooth' }, stats: [{ l: 'needed', v: '4 / 10' }, { l: 'period', v: '90 s' }] },
      { log: 'With a 15 s scale-down window the HPA follows the recommendation at once, so the replica count goes up and down with every cycle (the red line).', callout: 'A 15 s window follows every dip', code: 1, state: { short: true, r: '15 s window' }, stats: [{ l: 'scale events', v: String(events(SHORT)), cls: 'warn' }, { l: 'window', v: '15 s' }] },
      { log: 'Each rise needs about 30 s for new pods to become Ready, while each drop removes pods at once. After every cycle the service is short of pods for two periods (red blocks).', callout: 'Pods are removed fast, added slowly: overload each cycle', moment: true, code: 1, state: { short: true, over: true, r: 'overload after each rise' }, stats: [{ l: 'overloaded', v: over(RS) * 15 + ' s', cls: 'bad' }, { l: 'cycles', v: '4' }] },
      { log: 'The default scale-down window is 300 s. Scale-down uses the highest recommendation of the last five minutes, so a short dip cannot remove pods the next burst needs (the green line).', callout: '300 s window: take the highest recent recommendation', code: 2, state: { short: true, long: true, over: true, r: '300 s window' }, stats: [{ l: 'replicas held', v: '10', cls: 'ok' }, { l: 'window', v: '300 s' }] },
      { log: 'Scale-down is delayed until the load has stayed low for the whole 300 s window, so the extra pods remain for a few minutes. That is the price of the protection.', callout: 'Idle pods linger for up to 5 minutes', code: 2, state: { short: true, long: true, over: true, r: 'extra pods linger' }, stats: [{ l: 'pods held', v: '10 of 4 needed', cls: 'warn' }, { l: 'window', v: '300 s' }] },
      { log: 'Only the first rise causes an overload. After that the pods are already there, so the next bursts find capacity ready, and scale-down waits until the load has stayed low for the whole window.', callout: 'Only the first burst overloads; the rest are absorbed', code: 2, state: { short: true, long: true, over: true, count: true, r: 'compare' }, stats: [{ l: 'overloaded (300 s)', v: over(RL) * 15 + ' s', cls: 'ok' }, { l: 'scale events', v: String(events(LONG)), cls: 'ok' }],
        takeaway: 'Scale up fast, scale down slowly: a few idle pods buy fewer overloads and fewer scale events.' }
    ],
  };

  /* ---------- 3. Unknown target: no CPU request means no denominator ---------- */
  const nocpu = {
    id: 'unknown', label: 'No CPU request', desc: 'Utilisation is usage divided by the CPU request. A container without a request has no denominator, so the HPA shows unknown and never scales; adding a request fixes it.',
    codeLabel: 'kubectl',
    code: { bug: ['$ kubectl get hpa web', 'NAME  REFERENCE   TARGETS         MINPODS  MAXPODS  REPLICAS', 'web   Deploy/web  <unknown>/70%   4        30       4', 'failed to get cpu utilization: missing request for cpu in container web', 'resources: {requests: {cpu: 250m}}'] },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: 'HPA web · target cpu 70%', right: s.r || '' }),
      setup(kit) {
        const bars = kit.bars(null, { x: 16, y: 96, w: 360, labelW: 90, rowH: 30, items: [{ id: 'use', label: 'usage' }, { id: 'req', label: 'request' }], max: 500, unit: 'm', title: 'per pod CPU (illustrative)' });
        const fr = kit.chip(null, { x: 16, y: 170, w: 360, h: 44, label: '', sub: '', tone: 'info' });
        const led = kit.ledger(null, { x: 396, y: 76, w: 228, title: 'kubectl get hpa web', cols: [{ label: 'field', w: 90 }, { label: 'value', w: 120 }], rows: 4, rowH: 18 });
        const ev = kit.chip(null, { x: 16, y: 232, w: 608, h: 40, label: '', sub: '', tone: 'info', show: false });
        return { bars, fr, led, ev };
      },
      frame(s, kit, R) {
        const use = s.use || 0, req = s.req || 0;
        R.bars.set('use', use, use > 300 ? 'warn' : 'ok', use ? use + 'm' : '');
        R.bars.set('req', req, 'info', req ? req + 'm' : (s.noreq ? 'none' : ''));
        R.fr.set({ label: s.fr || '', sub: s.frSub || '', tone: s.frT || 'info', w: 360 });
        R.led.clear();
        const rows = [['TARGETS', s.tg || '-'], ['MINPODS', '4'], ['MAXPODS', '30'], ['REPLICAS', String(s.rep || 4)]];
        rows.forEach((r, i) => R.led.setRow(i, r, { hl: i === 0 && !!s.hlT, tones: [null, i === 3 && s.rep > 4 ? 'ok' : i === 0 && s.tg && s.tg[0] === '<' ? 'bad' : null] }));
        R.ev.set({ show: !!s.ev, label: s.ev || '', tone: s.evT || 'warn', w: 608 });
      }
    },
    bug: [
      { log: 'The HPA targets 70% CPU utilisation for Deployment web. The container spec has no CPU request, only a memory request.', callout: 'The container declares no CPU request', code: 4, state: { noreq: true, r: 'no request' }, stats: [{ l: 'target', v: '70%' }, { l: 'cpu request', v: 'none', cls: 'warn' }] },
      { log: 'At 20:00 the load rises. metrics-server reports that each pod now uses about 450m of CPU, so the pods are clearly saturated.', callout: 'Pods really use about 450m CPU each', code: 0, state: { use: 450, noreq: true, tg: '<unknown>/70%', rep: 4, r: 'usage 450m' }, stats: [{ l: 'usage', v: '450m', cls: 'warn' }, { l: 'replicas', v: '4' }] },
      { log: 'Utilisation is defined as usage divided by the request. With no request there is no denominator, so the HPA cannot compute a percentage.', callout: 'utilisation = usage / request: request missing', moment: true, code: 3, state: { use: 450, noreq: true, tg: '<unknown>/70%', hlT: true, fr: 'utilisation = 450m / ?', frSub: 'no request: undefined', frT: 'warn', ev: 'failed to get cpu utilization: missing request for cpu (representative)', r: 'unknown' }, stats: [{ l: 'TARGETS', v: '<unknown>', cls: 'bad' }, { l: 'utilisation', v: 'undefined', cls: 'bad' }] },
      { log: 'Without a number, the HPA makes no scaling decision. The Deployment stays at 4 pods while the CPU is saturated and latency grows.', callout: 'No metric: no scaling, at 4 pods', code: 1, state: { use: 450, noreq: true, tg: '<unknown>/70%', rep: 4, fr: 'utilisation = 450m / ?', frSub: 'HPA waits', frT: 'warn', r: 'stuck at 4' }, stats: [{ l: 'replicas', v: '4', cls: 'bad' }, { l: 'CPU', v: 'saturated', cls: 'bad' }] },
      { log: 'The fix is to give the container a CPU request, here 250m. That value is the denominator for utilisation.', callout: 'Add requests.cpu: 250m', code: 4, state: { use: 450, req: 250, tg: '180%/70%', rep: 4, fr: 'utilisation = 450m / 250m = 180%', frSub: '', frT: 'cursor', r: 'request added' }, stats: [{ l: 'utilisation', v: '180%', cls: 'warn' }, { l: 'target', v: '70%' }] },
      { log: 'Now the formula works: desired = ceil(4 x 180 / 70) = 11, and the HPA starts scaling the Deployment.', callout: 'desired = ceil(4 x 180 / 70) = 11', code: 4, state: { use: 450, req: 250, tg: '180%/70%', rep: 11, fr: 'desired = ceil(4 x 180 / 70) = 11', frT: 'ok', r: 'scaling to 11' }, stats: [{ l: 'desired', v: '11', cls: 'ok' }, { l: 'replicas', v: '4 to 11' }] },
      { log: 'With 11 pods the load per pod falls to about 160m, which is about 64% of the request, close to the target. The loop is closed.', callout: 'About 64% of the request: close to the target', code: 4, state: { use: 160, req: 250, tg: '64%/70%', rep: 11, fr: 'utilisation = 160m / 250m = 64%', frT: 'ok', r: 'converged' }, stats: [{ l: 'TARGETS', v: '64%/70%', cls: 'ok' }, { l: 'replicas', v: '11', cls: 'ok' }],
        takeaway: 'CPU utilisation is relative to requests. No request means an unknown target and no autoscaling.' }
    ],
  };

  const flow = KH.flow(['Kubelet|container usage', 'metrics-server|metrics.k8s.io', '*HPA controller|every 15 s', 'ceil(cur x metric / target)|clamped by min and max', 'Deployment replicas|scale subresource'], 'Flow: the HPA measures, computes a replica count, and writes it to the scale subresource of the Deployment.');

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[9] = { explain: `
<h3>1. A loop that sizes the Deployment</h3>
<p>Load changes faster than people can react, and a fixed rule either lags behind a spike or oscillates around its threshold. The Horizontal Pod Autoscaler closes a loop: it measures utilisation, computes the replica count that would bring the metric back to its target, writes that count, waits for the new pods to be Ready, and measures again. It changes only <code>spec.replicas</code> of the target, through the scale subresource, and the Deployment does the rest as in the previous chapters.</p>
${flow}

<h3>2. The metrics pipeline and the formula</h3>
<p>The kubelet exposes container usage and metrics-server serves it through the <code>metrics.k8s.io</code> API. The HPA controller reads it every 15 s by default. For a Resource metric of type Utilization, the value is a percentage of each container's <b>request</b>, averaged over the pods. A container without a CPU request gives no denominator, so the target shows <code>&lt;unknown&gt;</code> and nothing scales, as in the third scene. The count is then:</p>
<pre>desiredReplicas = ceil( currentReplicas x currentMetric / targetMetric )</pre>
<p>For 4 pods at 140% against a 70% target that is ceil(4 x 140 / 70) = 8. If the ratio is within a tolerance of 10% of 1.0, the HPA does nothing. The result is clamped between <code>minReplicas</code> and <code>maxReplicas</code>. When the clamp binds, the HPA sets the <code>ScalingLimited</code> condition, which is the only hint that the cap is hiding demand.</p>

<h3>3. Fast up, slow down</h3>
<p>The <code>behavior</code> field controls how fast the count may move. By default scale-up has no stabilisation window and may add the larger of 100% of the current pods or 4 pods per period. Scale-down has a 300 s window: the HPA takes the highest recommendation seen in that window, so a short dip cannot remove pods that the next burst needs. The first scene shows why even a fast scale-up leaves a few overloaded periods: the HPA keeps measuring the old pods until the new ones are Ready. The second scene shows the opposite problem, flapping, when the scale-down window is too short.</p>

<h3>4. Choose a metric that tracks the bottleneck</h3>
<p>CPU is only a proxy. An I/O-bound service, or one that waits on a queue, can be overloaded with CPU at 20%, and a CPU-based HPA never reacts. Pods metrics, Object metrics and External metrics (queue length, requests per second) need an adapter, but they follow the real bottleneck. Whatever the metric, set a sensible <code>maxReplicas</code>, check that the cluster has room for it, and alert on <code>ScalingLimited</code> so that a silent ceiling does not become an outage.</p>

<h3>5. The trade-off</h3>
<p>Fast scale-up and slow scale-down protect users during bursts, and they keep extra pods for a few minutes after each peak. A lower target gives more headroom and costs more. A higher target saves money and leaves less time to react while new pods start. Pods that take a long time to become Ready, such as slow-starting JVMs, need a lower target or a pre-warmed pool, since the HPA cannot add capacity faster than pods can start.</p>

<h3>6. Syntax</h3>
<pre>kubectl autoscale deploy web --cpu-percent=70 --min=4 --max=30
kubectl get hpa web -w
kubectl describe hpa web          # Conditions: AbleToScale, ScalingActive, ScalingLimited

spec:
  minReplicas: 4
  maxReplicas: 30
  behavior:
    scaleDown: {stabilizationWindowSeconds: 300}
    scaleUp: {policies: [{type: Percent, value: 100, periodSeconds: 15}, {type: Pods, value: 4, periodSeconds: 15}], selectPolicy: Max}</pre>
<p>Do not set <code>spec.replicas</code> in the Deployment manifest that you apply from Git when an HPA owns the field, or each apply will fight the autoscaler.</p>`, scenarios: [spike, flap, nocpu] };
})();
