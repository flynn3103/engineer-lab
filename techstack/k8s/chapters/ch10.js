/* Node failure: a silent heartbeat, two recovery clocks, an identity lock,
   and a disruption-budget turnstile. Original problem/diagnosis kept.
   Detection models 50s grace + 300s toleration (1.32+); recovery is illustrative. */
(function () {
  const W=640,H=420,KH=window.KH;
  function attr(e,k,v){window.Kit.tween(e,k,Number(e.getAttribute(k))||0,v,650,n=>e.setAttribute(k,n));}
  function rack(kit,x,name){
    const g=kit.el('g',{class:'nf-rack'},kit.layer);
    kit.el('rect',{x,y:151,width:164,height:182,rx:10,class:'nf-chassis'},g);
    kit.text(g,{x:x+14,y:175,t:name,cls:'kt b'});
    for(let i=0;i<3;i++)kit.el('line',{x1:x+145,y1:170+i*5,x2:x+152,y2:170+i*5,class:'nf-grid'},g);
    kit.el('line',{x1:x+8,y1:235,x2:x+156,y2:235,class:'nf-grid'},g);
    const led=kit.el('circle',{cx:x+140,cy:164,r:4,class:'nf-led'},g);
    return {g,led};
  }
  const kill={
    id:'kill',label:'Silence, then recovery',
    desc:'Power loss stops the Lease heartbeat. The detection and toleration clocks run before recovery. A Deployment can replace a pod while a StatefulSet identity waits for the old owner to be cleared safely.',
    codeLabel:'Observe → verify power state → recover',
    code:{bug:[
      'kubectl get lease node-7 -n kube-node-lease -o yaml',
      'kubectl get nodes                         # node-7: NotReady',
      '# Ready=Unknown; unreachable:NoExecute; 300s default toleration',
      'kubectl get pods -o wide                  # db-1: Terminating',
      '# Verify node-7 is powered off / fenced outside Kubernetes first',
      'kubectl taint nodes node-7 \\',
      '  node.kubernetes.io/out-of-service=nodeshutdown:NoExecute',
      'kubectl get pods -o wide                  # replacement db-1 on node-9'
    ]},
    stage:{w:W,h:H,footer:'50s detection + 300s toleration modeled. Recovery time varies.',
      header:s=>({left:'A missed heartbeat is suspicion, not proof',right:s.time}),
      setup(kit){
        kit.text(null,{x:24,y:84,t:'Lease heartbeat',cls:'kt xs b'});
        const pulse=kit.el('path',{d:'M24 106 H46 L51 98 L56 113 L61 88 L66 109 L71 106 H94 L99 98 L104 113 L109 88 L114 109 L119 106 H173',class:'nf-pulse'},kit.layer);
        const flat=kit.el('line',{x1:119,y1:106,x2:238,y2:106,class:'nf-silent'},kit.layer);
        const dot=kit.el('circle',{cx:40,cy:106,r:5,class:'nf-heart'},kit.layer);
        const lease=kit.text(null,{x:266,y:84,t:'',cls:'kt xs'});
        const status=kit.text(null,{x:266,y:106,t:'',cls:'kt b sm'});
        const detection=kit.el('rect',{x:24,y:123,width:0,height:10,rx:4,class:'nf-detection'},kit.layer);
        kit.el('rect',{x:24,y:123,width:116,height:10,rx:4,class:'nf-track'},kit.layer);
        const wait=kit.el('rect',{x:220,y:123,width:0,height:10,rx:4,class:'nf-wait'},kit.layer);
        kit.el('rect',{x:220,y:123,width:394,height:10,rx:4,class:'nf-track'},kit.layer);
        const firstClock=kit.text(null,{x:24,y:145,t:'',cls:'kt xs mut'});
        const secondClock=kit.text(null,{x:220,y:145,t:'',cls:'kt xs mut'});
        const old=rack(kit,24,'node-7'),next=rack(kit,452,'node-9');
        const oldWeb=kit.chip(null,{x:38,y:186,w:136,h:40,label:'web-old',sub:'Ready',tone:'ok'});
        const oldDb=kit.chip(null,{x:38,y:248,w:136,h:40,label:'db-1',sub:'Ready',tone:'ok'});
        const newWeb=kit.chip(null,{x:235,y:187,w:136,h:40,label:'web-new',sub:'not created',tone:'info',show:false});
        const newDb=kit.chip(null,{x:235,y:249,w:136,h:40,label:'db-1',sub:'identity reserved',tone:'info',show:false});
        const reserve=kit.el('rect',{x:466,y:248,width:136,height:40,rx:9,class:'nf-reserved'},kit.layer);
        const reservedLabel=kit.text(null,{x:534,y:271,t:'no second db-1',cls:'kt xs mut',anchor:'middle'});
        kit.el('line',{x1:325,y1:235,x2:325,y2:307,class:'nf-barrier'},kit.layer);
        const lock=kit.el('g',{class:'nf-lock'},kit.layer);
        kit.el('rect',{x:312,y:265,width:26,height:20,rx:4},lock);
        const shackle=kit.el('path',{d:'M317 265 V257 A8 8 0 0 1 333 257 V265',class:'nf-shackle'},lock);
        const proof=kit.text(null,{x:325,y:322,t:'proof missing',cls:'kt xs',anchor:'middle'});
        const volume=kit.el('g',{class:'nf-volume'},kit.layer);
        kit.el('path',{d:'M77 303 V316 C77 323 135 323 135 316 V303',class:'nf-disk'},volume);
        kit.el('ellipse',{cx:106,cy:303,rx:29,ry:6,class:'nf-disk'},volume);
        const diskText=kit.text(null,{x:106,y:317,t:'PVC db-1',cls:'kt xs',anchor:'middle'});
        const move=KH.links(kit,[{id:'web',x1:185,y1:204,x2:451,y2:204,label:'ReplicaSet replaces',dy:-11}]);
        return {pulse,flat,dot,lease,status,detection,wait,firstClock,secondClock,old,next,oldWeb,oldDb,newWeb,newDb,reserve,reservedLabel,lock,shackle,proof,volume,diskText,move};
      },
      frame(s,kit,R){
        R.pulse.style.opacity=s.dead?.25:1;R.flat.style.opacity=s.dead?1:0;
        attr(R.dot,'cx',s.dead?238:115);R.dot.classList.toggle('silent',!!s.dead);
        R.lease.set(s.dead?'Lease renewal stopped':'Lease renewed ~every 10s');
        R.status.set(s.unknown?'Ready=Unknown · NoExecute':s.dead?'No heartbeat yet; still suspected':'Ready=True');
        attr(R.detection,'width',116*Math.min(1,(s.elapsed||0)/50));
        attr(R.wait,'width',394*Math.max(0,Math.min(1,((s.elapsed||0)-50)/300)));
        R.firstClock.set('detect '+Math.min(s.elapsed||0,50)+' / 50 s');
        R.secondClock.set(s.unknown?'tolerate '+Math.min(Math.max(0,(s.elapsed||0)-50),300)+' / 300 s':'toleration clock starts after the taint');
        R.old.g.classList.toggle('dead',!!s.dead);
        R.oldWeb.set({show:!s.cleared,label:'web-old',sub:s.evicted?'deleting':s.dead?'unreachable':'Ready',tone:s.dead?'dim':'ok'});
        R.oldDb.set({show:!s.cleared,label:'db-1',sub:s.evicted?'Terminating':s.dead?'unreachable':'Ready',tone:s.evicted?'warn':s.dead?'dim':'ok'});
        R.newWeb.set({show:!!s.web,x:s.web===1?250:466,y:186,label:'web-new',sub:s.web===1?'Pending':'Ready',tone:s.web===1?'info':'ok'});
        R.newDb.set({show:!!s.db,x:s.db===1?250:466,y:248,label:'db-1',sub:s.db===1?'Pending':'Ready',tone:s.db===1?'info':'ok'});
        R.reserve.style.opacity=s.db?0:1;R.reservedLabel.show(!s.db);
        R.lock.classList.toggle('open',!!s.fenced);
        R.lock.style.opacity=s.cleared?.35:1;
        R.shackle.style.transform=s.fenced?'translate(0px,-7px)':'translate(0px,0px)';
        R.proof.set(s.fenced?'power off verified':'identity: wait for proof');
        R.volume.style.transform='translate('+(s.db===2?428:0)+'px,0px)';
        R.diskText.set(s.cleared&&!s.db?'detached':'PVC db-1');
        R.move.only(s.web?['web']:[]);
      }
    },
    bug:[
      {code:0,callout:'Two workloads share a healthy node',log:'node-7 hosts a Deployment pod web-old and the StatefulSet pod db-1 with its persistent volume. Lease renewals are the control plane’s recent evidence that the kubelet is reachable.',state:{elapsed:0,time:'before power loss'}},
      {code:0,callout:'The rack loses power; the heartbeat goes flat',log:'At time zero power is lost in the modeled rack. Kubernetes only sees Lease renewals stop: a network partition can look identical. The diagram knows the power state, but the control plane does not have that external proof.',state:{elapsed:10,dead:true,time:'t = 10 s'}},
      {code:2,callout:'After the grace period: Unknown and unreachable',log:'With the modeled 50-second node-monitor grace period, the node is marked Ready=Unknown and receives the unreachable NoExecute taint. The common default pod toleration gives another 300 seconds before taint-based deletion starts. Earlier versions used a 40-second grace default.',state:{elapsed:50,dead:true,unknown:true,time:'t ≈ 50 s'}},
      {code:2,callout:'A toleration deliberately delays eviction',log:'At 200 seconds, only 150 seconds of the 300-second toleration have elapsed. The old pod objects are still bound to node-7. Shortening this wait changes availability and false-alarm behaviour; it does not prove that an unreachable node is powered off.',state:{elapsed:200,dead:true,unknown:true,time:'t = 200 s'}},
      {code:3,callout:'The toleration expires; deletion is requested',log:'Around 350 seconds in this isolated-node model, the taint-eviction controller requests deletion of pods whose toleration expired. The kubelet cannot acknowledge shutdown. The Deployment’s ReplicaSet can create a replacement, while a StatefulSet cannot reuse db-1 while its old pod object remains.',state:{elapsed:350,dead:true,unknown:true,evicted:true,web:1,time:'t ≈ 350 s'}},
      {code:3,callout:'Deployment capacity returns; db-1 still waits',log:'web-new is scheduled on node-9 and becomes Ready, at an illustrative 370 seconds. db-1 is still Terminating. A stable identity and volume require more care than an interchangeable stateless replica; there must not be a second writer on an uncertain old node.',state:{elapsed:370,dead:true,unknown:true,evicted:true,web:2,time:'t ≈ 370 s'}},
      {code:4,callout:'No timer supplies proof that the old writer is off',log:'Minutes later the StatefulSet can still be waiting. A node marked NotReady alone is not evidence that its processes have stopped. In this scene an operator now verifies shutdown or fences the node through the infrastructure before changing Kubernetes state.',state:{elapsed:600,dead:true,unknown:true,evicted:true,web:2,time:'later · identity held'}},
      {code:6,callout:'Verified power-off unlocks the recovery path',log:'Only after that external verification, the operator adds node.kubernetes.io/out-of-service:NoExecute. For pods without a matching toleration, Kubernetes can force-delete the old pod objects and start volume detach. The taint is a declaration of verified state, not a mechanism that powers the node off.',state:{elapsed:600,dead:true,unknown:true,evicted:true,web:2,fenced:true,time:'operator verifies power-off'}},
      {code:7,callout:'Clear the old identity, then recreate db-1',log:'After the old db-1 object is cleared, the StatefulSet can create a new db-1 on node-9. Detach, attach, scheduling, startup and readiness still need to succeed; their timing depends on the storage driver and cluster. The volume marker travels only after the old owner has been cleared.',state:{elapsed:600,dead:true,unknown:true,evicted:true,web:2,fenced:true,cleared:true,db:1,time:'old object gone'}},
      {code:7,callout:'Same name, new pod: one active identity',log:'The replacement db-1 becomes Ready with the volume attached on node-9. Its name and storage identity are stable, but its Pod UID is new. When node-7 is recovered and safe, the operator must remove the manually applied out-of-service taint.',state:{elapsed:600,dead:true,unknown:true,evicted:true,web:2,fenced:true,cleared:true,db:2,time:'recovery complete'},takeaway:'Detection is a clock. Safe StatefulSet recovery also needs proof that the old writer cannot run.'}
    ]
  };
  const pdb={
    id:'pdb',label:'The disruption turnstile',
    desc:'Try to pass a pod through the eviction gate. A budget with minAvailable equal to all three replicas blocks it; allowing one disruption opens the gate until replacement capacity is Ready.',
    codeLabel:'Voluntary eviction · healthy replicas',
    code:{bug:[
      'spec: {minAvailable: 3}       # fleet has only 3 replicas',
      'kubectl drain node-7 --ignore-daemonsets',
      '# Eviction API: 429 Too Many Requests (budget violated)',
      '# Change the budget to ONE of these, not both:',
      'spec: {maxUnavailable: 1}    # 3 desired -> at least 2 healthy',
      'kubectl get pdb             # inspect ALLOWED DISRUPTIONS',
      '# Replacement must become healthy before the next eviction'
    ]},
    stage:{w:W,h:H,footer:'Three desired replicas. Voluntary eviction; not a power failure.',
      header:s=>({left:'PodDisruptionBudget · an admission gate',right:'healthy '+s.healthy+' / 3'}),
      setup(kit){
        kit.text(null,{x:24,y:88,t:'Original replicas',cls:'kt sm b'});
        const pods=[55,190,325].map((x,i)=>{
          kit.el('rect',{x,y:107,width:102,height:44,rx:9,class:'nf-slot'},kit.layer);
          return kit.chip(null,{x,y:107,w:102,h:44,label:'web-'+(i+1),sub:'Ready',tone:'ok'});
        });
        kit.el('path',{d:'M106 165 V213 H560',class:'nf-conveyor'},kit.layer);
        kit.el('path',{d:'M548 206 L560 213 L548 220',class:'nf-conveyor'},kit.layer);
        kit.text(null,{x:565,y:242,t:'evict',cls:'kt xs mut',anchor:'middle'});
        const gate=kit.el('g',{class:'nf-gate'},kit.layer);
        kit.el('rect',{x:470,y:240,width:16,height:28,rx:3},gate);
        const arm=kit.el('line',{x1:478,y1:240,x2:478,y2:169,class:'nf-gate-arm'},gate);
        kit.el('circle',{cx:478,cy:240,r:7},gate);
        const quota=kit.text(null,{x:478,y:288,t:'',cls:'kt b sm',anchor:'middle'});
        const decision=kit.text(null,{x:232,y:192,t:'',cls:'kt sm',anchor:'middle'});
        const floor=kit.text(null,{x:232,y:249,t:'',cls:'kt xs mut',anchor:'middle'});
        const bars=kit.bars(null,{x:24,y:298,w:354,labelW:84,rowH:25,max:3,items:[{id:'healthy',label:'healthy'},{id:'minimum',label:'minimum'}]});
        const replacement=kit.chip(null,{x:500,y:302,w:102,h:42,label:'web-4',sub:'starting',tone:'info',show:false});
        return {pods,arm,quota,decision,floor,bars,replacement};
      },
      frame(s,kit,R){
        R.pods.forEach((p,i)=>p.set({x:i===0&&s.moving?520:[55,190,325][i],y:i===0&&s.moving?193:107,show:i!==0||!s.gone,label:'web-'+(i+1),sub:i===0&&s.moving?'evicted':'Ready',tone:i===0&&s.moving?'delete':'ok'}));
        attr(R.arm,'x2',s.open?548:478);attr(R.arm,'y2',s.open?240:169);
        R.quota.set('budget = '+Math.max(0,s.healthy-s.minimum));
        R.decision.set(s.decision);
        R.floor.set('would leave '+(s.healthy-1)+' healthy · minimum '+s.minimum);
        R.bars.set('healthy',s.healthy,'ok',String(s.healthy));R.bars.set('minimum',s.minimum,'warn',String(s.minimum));
        R.replacement.set({show:!!s.replacement,label:'web-4',sub:s.replacement===2?'Ready':'starting',tone:s.replacement===2?'ok':'info'});
      }
    },
    bug:[
      {code:0,callout:'Three replicas; all three required to be healthy',log:'With three desired replicas and minAvailable: 3, healthy equals the required minimum. No voluntary disruption is allowed. The turnstile represents the Eviction API checking the budget, not the kubelet or the scheduler.',state:{healthy:3,minimum:3,open:false,decision:'3 − 1 < 3: cannot evict'}},
      {code:1,callout:'Drain asks to evict one pod',log:'kubectl drain first makes node-7 unschedulable, then asks the Eviction API to remove eligible pods. The PDB evaluates whether that voluntary eviction would leave enough healthy replicas.',state:{healthy:3,minimum:3,open:false,decision:'Eviction request → budget check'}},
      {code:2,callout:'The gate refuses the request; drain retries',log:'Evicting web-1 would leave two healthy replicas, below the minimum of three. The API refuses the eviction and drain retries. The PDB keeps the workload available, but maintenance cannot finish with this budget.',state:{healthy:3,minimum:3,open:false,decision:'429: disruption budget violated'}},
      {code:4,callout:'Allow one disruption: the first pod may pass',log:'Replace minAvailable with maxUnavailable: 1. For three desired replicas this requires at least two healthy replicas. One disruption is now available. These alternative fields must not be set together.',state:{healthy:3,minimum:2,open:true,decision:'3 − 1 ≥ 2: first eviction allowed'}},
      {code:5,callout:'One pod leaves; the disruption is now spent',log:'The eviction is accepted and web-1 terminates. Two replicas remain healthy. The budget is consumed, so another voluntary eviction must wait. In-flight disruptions are accounted for by the real PDB controller.',state:{healthy:2,minimum:2,open:false,moving:true,decision:'2 − 1 < 2: next eviction waits'}},
      {code:6,callout:'A starting replacement does not restore the budget',log:'The ReplicaSet creates web-4 and the scheduler places it away from the cordoned node. Until it becomes healthy, it does not restore this budget. Ready capacity matters, not just the existence of a replacement pod.',state:{healthy:2,minimum:2,open:false,moving:true,gone:true,replacement:1,decision:'web-4 exists but is not healthy'}},
      {code:6,callout:'Replacement Ready: one disruption available again',log:'web-4 is now healthy. The PDB again permits one disruption, so the next eligible eviction can proceed. Drain can work through pods sequentially while keeping the required healthy count.',state:{healthy:3,minimum:2,open:true,gone:true,replacement:2,decision:'Ready replacement replenishes budget'},takeaway:'The PDB protects voluntary moves. Ready replacements replenish the disruption budget.'}
    ]
  };
  window.CHAPTER_OVERRIDES=window.CHAPTER_OVERRIDES||{};
  window.CHAPTER_OVERRIDES[10]={scenarios:[kill,pdb],predict:{...window.COURSE.chapters[10].predict,why:'This model uses a 50-second grace period (default in 1.32+) followed by the usual 300-second unreachable toleration, about 350 seconds before deletion is requested. Earlier releases used 40 seconds. Detection, controller processing, scheduling and startup make the observed time approximate, not a guaranteed recovery deadline.'},explain:`
<h3>1. Power loss and network loss look alike</h3>
<p>The original incident loses a rack at 03:07. A Deployment replica comes back, while <code>db-1</code> remains Terminating. Kubernetes receives heartbeats, not an authoritative power signal. A silent kubelet might be powered off, disconnected, or running workloads behind a broken network. The recovery path therefore combines suspicion, deletion requests and workload-specific guarantees. Watch <b>Silence, then recovery</b>: the flat heartbeat and the identity lock describe different kinds of evidence.</p>
<h3>2. Two clocks before replacement</h3>
<p>The kubelet renews its Lease in <code>kube-node-lease</code>, ordinarily on an approximately ten-second cadence. When the node lifecycle controller sees no fresh evidence past its grace interval, it marks node readiness <code>Unknown</code>. For an unreachable node, a <code>NoExecute</code> taint triggers taint-based eviction. Most ordinary pods receive a default 300-second toleration for the unreachable and not-ready taints, unless overridden.</p>
<p>The visualization uses a <b>50-second detection grace period</b> plus <b>300 seconds after the taint</b>, so its deletion request starts around 350 seconds. The source also discusses the older 40-second default; the <a href="https://v1-32.docs.kubernetes.io/docs/reference/command-line-tools-reference/kube-controller-manager/#options" target="_blank" rel="noopener">1.32 controller reference</a> records the 50-second default. The clocks are configuration-dependent, and replacement adds controller, scheduling, startup and readiness time. Large correlated failures can slow or stop eviction; this is an isolated-node model, not an availability guarantee. Since 1.29, taint-based eviction is handled by a separate taint-eviction controller. See <a href="https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/" target="_blank" rel="noopener">taints, tolerations and default eviction behaviour</a>.</p>
<figure class="mm" style="--diagram-width:560px"><img src="diagrams/ch10-node-states.svg" alt="State diagram: fresh Lease means Ready; silence past the grace interval means Unknown; the unreachable taint starts a toleration; expiry requests deletion, while new Lease renewals before expiry can avert eviction"><figcaption>Time detects unreachability. It does not prove that the old workload stopped.</figcaption></figure>
<h3>3. Why web recovers before db-1</h3>
<p>A ReplicaSet replaces a terminating or missing stateless replica to restore its count. A new Deployment pod has a new name and UID; a short overlap in processes on a disconnected node is possible. That is different from reusing a stable StatefulSet ordinal. The StatefulSet waits while its old <code>db-1</code> pod object still exists, because a duplicate identity could mean two writers using the same data.</p>
<p>An unreachable kubelet cannot finish normal termination and report completion. The old pod can remain Terminating and retain its identity even after the controller has requested deletion. A storage driver, volume-attachment checks and controller configuration also influence recovery. Deleting an API object cannot, by itself, kill an isolated process. Do not equate an empty pod list with fencing the old machine.</p>
<figure class="mm" style="--diagram-width:600px"><img src="diagrams/ch10-recovery-sequence.svg" alt="Sequence diagram: stale Lease leads to a taint and delayed deletion; the ReplicaSet creates a new web pod, while db-1 waits until verified shutdown and an out-of-service taint clear its old identity and volume attachment"><figcaption>The StatefulSet replacement needs the old identity cleared, and storage recovery needs the old writer stopped.</figcaption></figure>
<h3>4. Verify shutdown, then declare out-of-service</h3>
<p>Once infrastructure checks establish that the node is actually shut down or fenced, an operator can mark it <code>node.kubernetes.io/out-of-service:NoExecute</code>. Pods without a matching toleration can then be force-deleted and their volumes detached. This lets the StatefulSet recreate its identity elsewhere. The taint records a verified operational decision; it does not fence or power off the machine.</p>
<pre># First verify shutdown/fencing through the infrastructure.
kubectl taint nodes node-7 \\
  node.kubernetes.io/out-of-service=nodeshutdown:NoExecute
kubectl get pods -o wide
kubectl get volumeattachments

# After recovery and verification, remove the manually added taint.
kubectl taint nodes node-7 node.kubernetes.io/out-of-service-</pre>
<p>Follow the <a href="https://kubernetes.io/docs/concepts/cluster-administration/node-shutdown/#non-graceful-node-shutdown" target="_blank" rel="noopener">non-graceful shutdown procedure</a>. Forced-detach timeouts and matching tolerations can alter the path. The scene compresses detach, attach and startup into a few steps; each is a real dependency that can fail.</p>
<h3>5. Maintenance uses a different gate</h3>
<p><code>kubectl drain</code> is a voluntary move. It cordons the node and normally uses the Eviction API, which honours PodDisruptionBudgets. The <b>disruption turnstile</b> scene makes the check tangible: three healthy replicas with <code>minAvailable: 3</code> permit zero disruptions; <code>maxUnavailable: 1</code> permits one. After a pod is evicted, a replacement must become healthy before another eviction can use that allowance. Choose only one of the two budget fields.</p>
<figure class="mm" style="--diagram-width:480px"><img src="diagrams/ch10-eviction-gate.svg" alt="Flowchart: an eviction request checks healthy replicas against the budget; rejection makes drain retry, acceptance consumes a disruption until a replacement becomes healthy"><figcaption>A PDB is a voluntary-eviction gate, not protection against a node losing power.</figcaption></figure>
<p>A PDB does not prevent an involuntary hardware failure or direct deletion that bypasses the Eviction API. It also cannot create replacement capacity. Use replica placement across nodes and zones, enough spare capacity and a budget compatible with maintenance. Check <code>ALLOWED DISRUPTIONS</code>, readiness and Pending pods before changing the budget. See <a href="https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/" target="_blank" rel="noopener">the drain procedure</a>.</p>
<h3>6. Trace the recovery evidence</h3>
<ol><li><b>Heartbeat:</b> inspect the node Lease, readiness condition and taints.</li><li><b>Deletion:</b> inspect pod deletion timestamps, tolerations, owner references and events.</li><li><b>Replacement:</b> follow the ReplicaSet or StatefulSet, then scheduling and readiness.</li><li><b>Storage:</b> inspect volume attachment and CSI events; verify the old writer is stopped.</li><li><b>Placement:</b> check node and zone distribution so the next failure does not remove every replica.</li></ol>`};
})();
