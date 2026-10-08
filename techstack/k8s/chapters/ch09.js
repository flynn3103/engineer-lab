/* HPA: a moving recommendation window and a CPU instrument.
   Overrides chapter 9; keeps the original problem, prediction and diagnosis.
   Samples are illustrative. Only recommendation stabilization is simulated;
   scaling rate limits, missing metrics and pod startup are discussed in Explain. */
(function () {
  const W = 640, H = 420;
  const footer = 'Illustrative samples. Ready lag and scaling policies omitted.';
  const samples = [[0,4],[30,8],[60,4],[90,8],[120,4],[180,4],[330,4],[360,4],[390,4],[420,4]];
  const X = t => 68 + t / 420 * 532;
  const Y = v => 170 - (v - 4) * 15;
  const held = (i, window) => Math.max(...samples.slice(0,i+1).filter(p => p[0] >= samples[i][0] - window).map(p => p[1]));
  const trace = (values, y) => values.map((v,i) => (i ? 'H' + X(samples[i][0]) + 'V' : 'M' + X(samples[i][0]) + ' ') + y(v)).join(' ');
  function tweenAttr(kit, e, attrs) {
    for (const [k,v] of Object.entries(attrs)) {
      const from = Number(e.getAttribute(k));
      window.Kit.tween(e, k, Number.isFinite(from) ? from : v, v, 650, n => e.setAttribute(k,n));
    }
  }
  const flap = {
    id: 'flap', label: 'The moving window',
    desc: 'Watch each recommendation enter and leave a five-minute window. Compare a 15-second downscale window with the 300-second default on exactly the same samples.',
    codeLabel: 'autoscaling/v2 · behavior',
    code: { bug: [
      'scaleDown:', '  stabilizationWindowSeconds: 15   # short memory',
      '# Compare the same recommendations with:',
      'scaleDown:', '  stabilizationWindowSeconds: 300  # keep recent peak',
      '# Downscale recommendation = highest one still in the window'
    ] },
    stage: {
      w:W, h:H, footer,
      header: s => ({left:'HPA · memory, not a moving average',right:'t = '+samples[s.i][0]+' s'}),
      setup(kit) {
        kit.text(null,{x:18,y:88,t:'Raw recommendation',cls:'kt b sm'});
        const peak = kit.text(null,{x:600,y:88,t:'',cls:'kt sm tone-ok',anchor:'end'});
        for(const v of [4,6,8]) {
          const y=Y(v); kit.el('line',{x1:68,y1:y,x2:600,y2:y,class:'hpa-grid'},kit.layer);
          kit.text(null,{x:50,y:y+4,t:String(v),cls:'kt xs mut',anchor:'end'});
        }
        const windowBand=kit.el('rect',{x:68,y:101,width:0,height:76,rx:5,class:'hpa-window'},kit.layer);
        const line=kit.el('path',{class:'hpa-raw',d:'M68 170'},kit.layer);
        const dots=samples.map(([t,v])=>kit.el('circle',{cx:X(t),cy:Y(v),r:4,class:'hpa-sample'},kit.layer));
        const selected=kit.el('circle',{cx:68,cy:170,r:7,class:'hpa-selected'},kit.layer);
        const cursor=kit.el('line',{x1:68,x2:68,y1:101,y2:275,class:'hpa-cursor'},kit.layer);
        for(const t of [0,60,120,240,360,420]) kit.text(null,{x:X(t),y:191,t:t+'s',cls:'kt xs mut',anchor:'middle'});
        kit.text(null,{x:18,y:214,t:'Chosen replica count',cls:'kt b sm'});
        for(const v of [4,8]) {
          const y=272-(v-4)*12; kit.el('line',{x1:68,y1:y,x2:600,y2:y,class:'hpa-grid'},kit.layer);
          kit.text(null,{x:50,y:y+4,t:String(v),cls:'kt xs mut',anchor:'end'});
        }
        const short=kit.el('path',{class:'hpa-short',d:'M68 272'},kit.layer);
        const long=kit.el('path',{class:'hpa-long',d:'M68 272'},kit.layer);
        const podRows=[301,326].map((y,j)=>{
          kit.text(null,{x:18,y:y+11,t:j?'300 s':'15 s',cls:'kt xs b'});
          return Array.from({length:8},(_,i)=>kit.el('rect',{x:85+i*24,y,width:18,height:14,rx:3,class:j?'hpa-pod long':'hpa-pod short'},kit.layer));
        });
        const result=[kit.text(null,{x:303,y:312,t:'',cls:'kt sm'}),kit.text(null,{x:303,y:337,t:'',cls:'kt sm'})];
        return {windowBand,line,dots,selected,cursor,short,long,podRows,result,peak};
      },
      frame(s,kit,R) {
        const i=s.i, time=samples[i][0], raw=samples[i][1], left=Math.max(0,time-300), max=held(i,300);
        tweenAttr(kit,R.windowBand,{x:X(left),width:X(time)-X(left)});
        tweenAttr(kit,R.cursor,{x1:X(time),x2:X(time)});
        tweenAttr(kit,R.selected,{cx:X(time),cy:Y(raw)});
        R.line.setAttribute('d',samples.slice(0,i+1).map(([t,v],n)=>(n?'L':'M')+X(t)+' '+Y(v)).join(' '));
        R.dots.forEach((d,n)=>{
          d.style.opacity=n<=i?1:0;
          d.classList.toggle('peak',n<=i&&samples[n][0]>=left&&samples[n][1]===max);
        });
        R.short.setAttribute('d',trace(samples.slice(0,i+1).map((_,n)=>held(n,15)),v=>272-(v-4)*12));
        R.long.setAttribute('d',trace(samples.slice(0,i+1).map((_,n)=>held(n,300)),v=>272-(v-4)*12));
        R.podRows.forEach((row,j)=>row.forEach((p,n)=>{p.classList.toggle('active',n<(j?max:held(i,15)));}));
        R.peak.set('window ['+left+'s, '+time+'s] · max '+max);
        R.result[0].set(held(i,15)+' pods · follows each dip');
        R.result[1].set(max+' pods · '+(max>raw?'recent peak retained':'matches recommendation'));
      }
    },
    bug: samples.map(([time,raw],i)=>({
      code:i===0?1:4,state:{i},
      callout:[
        'Two policies, one identical workload',
        'The peak enters memory: both scale to 8',
        'A dip removes pods only with short memory',
        'Another burst: the short window scales up again',
        'The new dip is still below a remembered peak',
        'The five-minute window retains the last peak',
        'The first peak has aged out; the second remains',
        'A recent peak can hold capacity after traffic falls',
        'The last peak sits exactly on the window boundary',
        'The last peak expires: downscale can proceed'
      ][i],
      log:[
        'Start with 4 replicas. The top line is the raw recommendation after the HPA formula; the shaded interval is the 300-second memory. The lower traces compare window sizes, not two different workloads.',
        'At 30 s the recommendation rises to 8. Both policies may scale up. Stabilization of scale-down does not make scale-up wait five minutes.',
        'At 60 s the recommendation falls to 4. The 15-second policy has forgotten the previous peak; the 300-second policy still remembers 8. In a real application, scaling back up also waits for new pods to become Ready.',
        'At 90 s demand again recommends 8. Short memory produces another down/up cycle. The long-memory fleet was already at 8; it does not need to rebuild capacity for this burst.',
        'At 120 s the raw recommendation is back to 4. The HPA does not average 4 and 8: the highest recommendation inside the downscale window is still 8.',
        'At 180 s the workload is quiet. Keeping 8 pods costs extra capacity but avoids reacting to every short lull. Sample times here are illustrative snapshots, not every controller reconciliation.',
        'At 330 s the first peak is at the left boundary of the inclusive modeled window. The later peak at 90 s is still well inside, so the selected count remains 8.',
        'At 360 s the first peak is outside the window. The remaining peak at 90 s still supplies the maximum of 8. This is a rolling window over recommendations, not a sleep timer restarted by each low sample.',
        'At 390 s the last peak is 300 seconds old, on the model boundary. At the next later reconciliation it ages out. Real timestamps and reconciliation cadence determine the exact instant.',
        'At 420 s the window contains only recommendations of 4. Its maximum is 4, so downscale is now allowed, subject to minReplicas and scaling-rate policies. The chart isolates stabilization; it does not promise instantaneous Ready capacity.'
      ][i],
      stats:[{l:'raw',v:raw+' replicas'},{l:'15 s window',v:held(i,15),cls:held(i,15)<held(i,300)?'warn':''},{l:'300 s window',v:held(i,300),cls:'ok'}],
      ...(i===9?{takeaway:'Remember the peak. Downscale follows the highest recent recommendation, not the latest dip.'}:{})
    }))
  };
  const nocpu = {
    id:'nocpu',label:'CPU needs a denominator',
    desc:'A usage reading alone cannot tell the HPA its utilisation. Add the request, watch the gauge become meaningful, then see the replica calculation and startup delay.',
    codeLabel:'CPU utilisation · illustrative values',
    code:{bug:[
      'resources: {}                  # no requests.cpu',
      '# usage is available, utilisation is <unknown>/70%',
      'resources:', '  requests:', '    cpu: 250m',
      '# 350m / 250m × 100 = 140% utilisation',
      '# desired = ceil(4 × 140 / 70) = 8',
      '# after load splits over 8 Ready pods: 175m / 250m = 70%'
    ]},
    stage:{w:W,h:H,footer:'Equal load per pod; one container per pod; CPU samples illustrative.',
      header:s=>({left:'CPU utilisation is relative to requests',right:s.phase}),
      setup(kit){
        const cx=174,cy=181,r=84;
        const track=kit.el('path',{d:'M101.3 223 A84 84 0 1 1 246.7 223',class:'hpa-dial'},kit.layer);
        for(const v of [0,70,100,140,200]){
          const a=(-210+v/200*240)*Math.PI/180;
          kit.el('line',{x1:cx+Math.cos(a)*75,y1:cy+Math.sin(a)*75,x2:cx+Math.cos(a)*84,y2:cy+Math.sin(a)*84,class:v===70?'hpa-target':'hpa-grid'},kit.layer);
          kit.text(null,{x:cx+Math.cos(a)*103,y:cy+Math.sin(a)*103+4,t:String(v),cls:'kt xs'+(v===70?' tone-ok':' mut'),anchor:'middle'});
        }
        kit.text(null,{x:18,y:88,t:'target 70%',cls:'kt sm b'});
        const g=kit.el('g',{transform:'translate(174 181)'},kit.layer);
        const needle=kit.el('line',{x1:0,y1:0,x2:66,y2:0,class:'hpa-needle',transform:'rotate(-210)'},g);
        kit.el('circle',{cx:0,cy:0,r:6,class:'hpa-hub'},g);
        const dialValue=kit.text(null,{x:174,y:232,t:'?',cls:'kt b',anchor:'middle'});
        const dialHint=kit.text(null,{x:174,y:254,t:'',cls:'kt xs mut',anchor:'middle'});
        kit.text(null,{x:365,y:90,t:'Measurement / configured reference',cls:'kt b sm'});
        const usage=kit.chip(null,{x:360,y:100,w:244,h:38,label:'350m measured',tone:'info'});
        kit.el('line',{x1:365,y1:148,x2:599,y2:148,class:'hpa-fraction'},kit.layer);
        const request=kit.chip(null,{x:360,y:157,w:244,h:38,label:'request missing',tone:'warn'});
        const ratio=kit.text(null,{x:482,y:222,t:'',cls:'kt b',anchor:'middle'});
        const formula=kit.text(null,{x:482,y:249,t:'',cls:'kt sm',anchor:'middle'});
        const outcome=kit.chip(null,{x:360,y:268,w:244,h:40,label:'ScalingActive=False',tone:'warn'});
        kit.text(null,{x:174,y:285,t:'Replicas (solid = Ready)',cls:'kt xs mut',anchor:'middle'});
        const pods=Array.from({length:8},(_,i)=>{
          const g=kit.el('g',{class:'hpa-replica'},kit.layer);
          const c=kit.el('circle',{cx:70+i*28,cy:307,r:9},g);
          const t=kit.text(g,{x:70+i*28,y:310,t:String(i+1),cls:'kt xs',anchor:'middle'});
          return {g,c,t};
        });
        const ready=kit.text(null,{x:174,y:337,t:'',cls:'kt sm',anchor:'middle'});
        return {needle,dialValue,dialHint,usage,request,ratio,formula,outcome,pods,ready,angle:-210};
      },
      frame(s,kit,R){
        const known=s.request>0, util=known?s.usage/s.request*100:null;
        const angle=known?-210+Math.min(200,util)/200*240:-210;
        window.Kit.tween(R,'angle',R.angle,angle,650,v=>{R.angle=v;R.needle.setAttribute('transform','rotate('+v+')');});
        R.needle.style.opacity=known?1:0;
        R.dialValue.set(known?Math.round(util)+'%':'?');
        R.dialHint.set(known?'Usage / request × 100':'No reference → no utilisation');
        R.usage.set({label:s.usage+'m measured'});
        R.request.set({label:known?s.request+'m CPU request':'CPU request missing',tone:known?'ok':'warn'});
        R.ratio.set(known?s.usage+' / '+s.request+' = '+Math.round(util)+'%':'usage / ? = unknown');
        R.formula.set(s.formula||'desired replicas = unknown');
        R.outcome.set({label:s.status,tone:known?'ok':'warn'});
        R.pods.forEach((p,i)=>{
          p.g.style.opacity=i<s.pods?1:.18;
          p.g.classList.toggle('ready',i<s.ready);
          p.g.classList.toggle('pending',i>=s.ready&&i<s.pods);
        });
        R.ready.set(s.ready+' Ready / '+s.pods+' desired');
      }
    },
    bug:[
      {code:0,callout:'Usage exists, but the CPU request is missing',log:'Four Ready pods each use 50m CPU in this simplified model. Metrics-server can report usage, but CPU utilisation is usage divided by a CPU request. An absent request is not a request of zero.',state:{usage:50,request:0,pods:4,ready:4,status:'ScalingActive=False',phase:'missing reference'}},
      {code:1,callout:'More load does not repair a missing denominator',log:'Usage per pod rises to 350m. The raw measurement changes, yet the HPA still cannot calculate CPU utilisation. An unknown target is different from a measured zero; inspect HPA conditions and the requests of the relevant containers.',state:{usage:350,request:0,pods:4,ready:4,status:'<unknown> / 70%',phase:'load rises'}},
      {code:4,callout:'250m gives the gauge its scale',log:'Configure requests.cpu as 250m, based on the workload. The request gives CPU utilisation its denominator; it is a scheduling reference, not a hard CPU ceiling. Recreating pods and collecting fresh metrics are compressed into this step.',state:{usage:350,request:250,pods:4,ready:4,status:'Valid CPU metric',phase:'reference added'}},
      {code:5,callout:'350m used / 250m requested = 140%',log:'140% utilisation is possible because requests are not limits. The same 350m physical usage appears as a different percentage if requests change. A CPU limit, when set, is the separate ceiling enforced by throttling.',state:{usage:350,request:250,pods:4,ready:4,status:'140% / target 70%',phase:'measurement normalised'}},
      {code:6,callout:'ceil(4 × 140 / 70) recommends 8 replicas',log:'Assuming complete metrics and equivalent pods, the ratio is 2. The base formula therefore recommends 8 replicas. Bounds, tolerance, stabilization and rate policies can change the final scale decision.',state:{usage:350,request:250,pods:4,ready:4,status:'Recommendation: 8',formula:'ceil(4 × 140 / 70) = 8',phase:'calculate'}},
      {code:6,callout:'Desired replicas change before Ready capacity does',log:'The Deployment creates four additional pods. They must be scheduled, started and made Ready before they serve traffic. Increasing spec.replicas does not immediately double serving capacity.',state:{usage:350,request:250,pods:8,ready:4,status:'4 new pods starting',formula:'desired = 8; Ready = 4',phase:'actuate'}},
      {code:7,callout:'Eight Ready pods split the same total CPU work',log:'After the new pods become Ready and receive an equal share of unchanged work, usage per pod falls to 175m. The observed utilisation becomes 70%. Startup and metric reporting introduce delay in the real feedback loop.',state:{usage:175,request:250,pods:8,ready:8,status:'At target: 70%',formula:'175 / 250 × 100 = 70%',phase:'observe again'}},
      {code:7,callout:'The next recommendation is 8: the loop settles',log:'At 8 current replicas and 70% observed utilisation, ceil(8 × 70 / 70) stays at 8. If latency is high while CPU remains low, CPU may be the wrong signal: use a metric tied to the actual bottleneck.',state:{usage:175,request:250,pods:8,ready:8,status:'Keep 8 replicas',formula:'ceil(8 × 70 / 70) = 8',phase:'steady'},takeaway:'CPU percentage needs a request. Desired replicas need time to become Ready capacity.'}
    ]
  };
  window.CHAPTER_OVERRIDES=window.CHAPTER_OVERRIDES||{};
  window.CHAPTER_OVERRIDES[9]={scenarios:[flap,nocpu],explain:`
<h3>1. A feedback loop with memory</h3>
<p>The sale in the original problem exposes two delays: new pods need time to start, and utilisation arrives as a sampled measurement. The HPA adjusts the workload's replica count; the Deployment and scheduler turn that desired count into running pods. Watch <b>The moving window</b> first. Orange follows a short downscale memory, while green retains a recent peak. Both receive identical raw recommendations.</p>
<h3>2. From usage to a replica recommendation</h3>
<p>For this chapter's CPU target, utilisation means <b>CPU usage as a percentage of CPU requests</b>. A request of <code>250m</code> and usage of <code>350m</code> produce 140%. A request reserves a scheduling reference; a limit is a separate maximum. The base calculation is <code>ceil(currentReplicas × currentMetric / desiredMetric)</code>, so four pods at 140% with a target of 70% recommend eight. A 70% target leaves headroom relative to requests; it is not 70% of a whole machine.</p>
<p>The second scene makes the denominator visible. Missing requests leave the utilisation metric undefined. Check <code>kubectl describe hpa web</code> for the actual condition and inspect all relevant containers, including sidecars. On multi-metric HPAs, other usable metrics may still allow scaling up; do not infer that every missing CPU metric freezes every HPA. The scene uses one CPU metric and equivalent single-container pods.</p>
<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch09-hpa-loop.svg" alt="Flowchart: usage and CPU requests produce utilisation; the HPA formula, bounds and behaviour produce desired replicas; pod readiness and fresh metrics close the feedback loop"><figcaption>Writing a replica count is one action in the loop. Capacity arrives later.</figcaption></figure>
<h3>3. Why the latest dip is not enough</h3>
<p>A scale-down stabilization window stores recent <em>recommendations</em>. It selects their highest value inside the rolling interval. The green shaded area in the chart is that interval. Peaks are circled while they remain eligible; a peak stops protecting capacity when it ages out. This is a rolling maximum, not an average, and not an unconditional five-minute sleep after each sample.</p>
<p>Compare the 60-second dip: the 15-second window has already forgotten the burst at 30 seconds, so it can drop to four; the 300-second window keeps eight. A new burst then needs four new pods only in the short-memory fleet. The illustrated samples are sparse snapshots. Real reconciliation and timestamps determine exactly when a recommendation expires.</p>
<h3>4. Recommendation, policy, readiness</h3>
<p>The default controller sync period is 15 seconds and its default tolerance is 10%. Small differences may therefore produce no action. Downscale stabilization defaults to 300 seconds; scale-up defaults to no stabilization delay. Rate policies govern how many replicas may change over a period, and <code>minReplicas</code>/<code>maxReplicas</code> bound the outcome. The chart isolates stabilization and omits these policy limits and Ready lag so its comparison stays legible. See the <a href="https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/" target="_blank" rel="noopener">official HPA algorithm and behaviour reference</a>.</p>
<p>Real calculations also treat missing metrics and not-yet-ready pods conservatively. Pending pods can reveal a capacity or scheduling problem that the HPA cannot solve alone. Scaling a CPU-bound service can lower per-pod utilisation; adding pods will not necessarily fix a shared database, an external dependency or storage bottleneck.</p>
<h3>5. Diagnose the loop in order</h3>
<ol><li><b>Signal:</b> compare <code>kubectl top pods</code>, CPU requests and <code>kubectl describe hpa</code>. Is the metric known and is it related to user-visible latency?</li><li><b>Decision:</b> inspect desired/current replicas, <code>ScalingActive</code>, <code>ScalingLimited</code>, events and behaviour. A recommendation above <code>maxReplicas</code> needs a capacity decision, not a shorter stabilization window.</li><li><b>Actuation:</b> compare desired replicas to Ready pods. Look for Pending pods, slow startup and failed readiness.</li><li><b>History:</b> align the replica graph with load and latency. Repeated down/up cycles suggest a window or rate policy that is too eager for the traffic pattern.</li></ol>
<h3>6. Configure the memory explicitly</h3>
<pre>apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: {name: web}
spec:
  scaleTargetRef: {apiVersion: apps/v1, kind: Deployment, name: web}
  minReplicas: 4
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: {type: Utilization, averageUtilization: 70}
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies: [{type: Percent, value: 25, periodSeconds: 60}]
    scaleUp:
      stabilizationWindowSeconds: 0</pre>
<p>The 25% per minute scale-down policy above is an illustrative choice, not a Kubernetes default. Every relevant container also needs an appropriate CPU request. Retaining capacity buys smoother latency at extra cost; choose that trade-off from traffic, startup time and the service's latency budget.</p>`};
})();
