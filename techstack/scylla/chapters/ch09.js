(function () {
  const X = [100, 280, 460], CW = 136, centers = X.map(x => x + CW / 2);
  const MOVE = 'transform .65s cubic-bezier(.3,.7,.2,1), opacity .4s';
  const tint = (c, n = 25) => `color-mix(in srgb, var(${c}) ${n}%, var(--card))`;
  /* A replayable Figure 2 teaching trace, not a live randomized simulator.
     Every snapshot carries each voter's term and persisted vote; frame is reversible. */
  const n = (role, term, vote, timer) => ({ role, term, vote, timer });
  const electionFrames = [
    [n('follower',7,null,.08),n('follower',7,null,.42),n('follower',7,null,.63),n('follower',7,null,.48),n('follower',7,null,.56)],
    [n('candidate',8,1,1),n('follower',7,null,.34),n('follower',7,null,.52),n('follower',7,null,.38),n('follower',7,null,.46)],
    [n('candidate',8,1,.8),n('follower',7,null,.26),n('follower',7,null,.42),n('follower',7,null,.28),n('follower',7,null,.34)],
    [n('leader',8,1,1),n('follower',7,null,.18),n('follower',8,1,1),n('follower',7,null,.2),n('follower',8,1,1)],
    [n('leader',8,1,1),n('follower',8,null,1),n('follower',8,1,1),n('follower',8,null,1),n('follower',8,1,1)],
    [n('down',8,1,0),n('follower',8,null,.02),n('follower',8,1,.35),n('follower',8,null,.02),n('follower',8,1,.3)],
    [n('down',8,1,0),n('candidate',9,2,.65),n('follower',9,2,.7),n('candidate',9,4,.05),n('follower',9,4,.55)],
    [n('down',8,1,0),n('candidate',9,2,.45),n('follower',9,2,.55),n('candidate',10,4,1),n('follower',9,4,.4)],
    [n('down',8,1,0),n('follower',10,4,1),n('follower',9,2,.3),n('leader',10,4,1),n('follower',10,4,1)],
    [n('follower',10,null,1),n('follower',10,4,1),n('follower',10,null,1),n('leader',10,4,1),n('follower',10,4,1)]
  ];
  const election = {
    id: 'election', label: 'Election · 5 nodes',
    desc: 'Follow timeout rings, RequestVote packets and a persistent vote ledger. Elect N1, lose it, watch a 2–2 split, then elect N4 in a newer term.',
    codeLabel: 'Raft election rules · pseudocode',
    code: { bug: [
      'on election timeout: currentTerm++; become candidate;',
      'persist(currentTerm, votedFor = self); request votes;',
      'RequestVote(term, candidateId, lastLogTerm, lastLogIndex);',
      'grant only if term is valid, vote is free and log is up-to-date;',
      'if votes received >= 3 of 5: become leader;',
      'leader sends AppendEntries heartbeats; followers reset timers;',
      'if no majority: retry after a randomized election timeout;',
      'on a higher term: update term, clear old vote, become follower;'
    ] },
    stage: {
      w: 640, h: 420,
      footer: 'Teaching trace: 5 voters, equal logs; PreVote omitted. Timings illustrative.',
      header: s => ({ left: 'Raft election · five fixed voters', right: s.phase }),
      setup(kit) {
        const P = [{x:220,y:108},{x:329,y:182},{x:287,y:298},{x:153,y:298},{x:111,y:182}];
        const text = (parent,x,y,t,cls='sm',anchor='start') => kit.text(parent,{x,y,t,cls,anchor});
        const color = role => `var(${role==='leader'?'--ok':role==='candidate'?'--warn':role==='down'?'--mut':'--acc2'})`;
        const edges=[];
        for(let a=0;a<5;a++)for(let b=a+1;b<5;b++) {
          const e=kit.el('line',{x1:P[a].x,y1:P[a].y,x2:P[b].x,y2:P[b].y},kit.layer);
          e.style.stroke='var(--line)';e.style.strokeWidth=1;e.style.opacity=.6;edges.push({a,b,e});
        }
        const wires = Array.from({length:4},()=>{
          const e=kit.el('line',{},kit.layer);e.style.strokeWidth=2;e.style.strokeDasharray='4 3';e.style.transition='opacity .3s';return e;
        });
        const nodes=P.map((p,i)=>{
          const g=kit.el('g',{transform:`translate(${p.x} ${p.y})`},kit.layer);
          const track=kit.el('circle',{r:33,fill:'none'},g);track.style.stroke='var(--line)';track.style.strokeWidth=3;
          const timer=kit.el('circle',{r:33,fill:'none',transform:'rotate(-90)', 'stroke-dasharray':2*Math.PI*33},g);
          timer.style.strokeWidth=3;timer.style.transition='stroke-dashoffset .65s, stroke .3s, opacity .3s';
          const body=kit.el('circle',{r:27},g);body.style.strokeWidth=2;body.style.transition='fill .3s, stroke .3s';
          const name=text(g,0,-5,'N'+(i+1),'b','middle');
          const role=text(g,0,10,'follower','xs','middle');
          const clock=text(g,0,43,'timer','xs mut','middle');
          const crown=kit.el('path',{d:'M-10 -33 L-10 -39 L-4 -35 L0 -41 L4 -35 L10 -39 L10 -33 Z'},g);
          crown.style.fill='var(--ok)';crown.style.transition='opacity .3s';
          return {g,body,timer,role,clock,crown,name};
        });
        const term=kit.chip(null,{x:170,y:183,w:100,h:34,label:'term 7',small:true,tone:'info'});
        const action=text(null,220,237,'','xs b','middle');
        const divider=kit.el('line',{x1:379,y1:75,x2:379,y2:342},kit.layer);divider.style.stroke='var(--line)';
        text(null,396,89,'PERSISTED ON EACH NODE','xs b');
        text(null,396,111,'Node','xs mut');text(null,451,111,'Term','xs mut');text(null,507,111,'votedFor','xs mut');
        const ledger=P.map((p,i)=>{
          const y=137+i*30;
          const bg=kit.el('rect',{x:390,y:y-18,width:230,height:26,rx:5},kit.layer);bg.style.transition='fill .3s';
          text(null,400,y,'N'+(i+1),'sm b');
          return {bg,term:text(null,459,y,'7','sm'),vote:text(null,520,y,'—','sm b')};
        });
        text(null,396,288,'VOTES RECEIVED','xs mut');
        const tally=text(null,396,307,'','sm b');
        const slots=P.map((p,i)=>{
          const box=kit.el('rect',{x:396+i*43,y:317,width:36,height:22,rx:5},kit.layer);box.style.stroke='var(--line)';box.style.transition='fill .3s';
          text(null,414+i*43,332,'N'+(i+1),'xs b','middle');return box;
        });
        const packets=Array.from({length:4},()=>kit.chip(null,{x:202,y:99,w:36,h:18,label:'RV',small:true,show:false}));
        return {P,nodes,edges,wires,packets,ledger,term,action,tally,slots,color};
      },
      frame(s,kit,R) {
        const p=s.p;
        s.nodes.forEach((v,i)=>{
          const r=R.nodes[i],c=R.color(v.role);
          r.body.style.fill=`color-mix(in srgb, ${c} ${v.role==='leader'?40:v.role==='down'?12:22}%, var(--card))`;
          r.body.style.stroke=c;r.timer.style.stroke=c;
          r.timer.style.strokeDashoffset=2*Math.PI*33*(1-v.timer);
          r.timer.style.opacity=v.role==='down'?.2:1;
          r.role.set(v.role==='down'?'offline':v.role);r.crown.style.opacity=v.role==='leader'?1:0;
          r.clock.set(v.role==='down'?'no heartbeat':v.role==='leader'?'heartbeats':p===4||p===8||p===9?'timer reset':Math.round(v.timer*300)+' ms left');
          R.ledger[i].term.set(String(v.term));R.ledger[i].vote.set(v.vote?'N'+v.vote:'—');
          R.ledger[i].bg.style.fill=`color-mix(in srgb, ${c} 10%, var(--card))`;
        });
        R.term.set({label:'term '+s.term,tone:p===6?'warn':p===3||p>=8?'ok':'info'});
        R.action.set(s.action);R.tally.set(s.tally);
        R.edges.forEach(({a,b,e})=>{e.style.opacity=s.nodes[a].role==='down'||s.nodes[b].role==='down'?.12:.65;});
        const received=p===3||p===4?[1,3,5]:p>=8?[2,4,5]:p===1||p===2?[1]:p===7?[4]:[];
        R.slots.forEach((box,i)=>{
          box.style.fill=p===6?`color-mix(in srgb, var(${i===1||i===2?'--acc2':i===3||i===4?'--warn':'--mut'}) 30%, var(--card))`:
            received.includes(i+1)?'color-mix(in srgb,var(--ok) 40%,var(--card))':'var(--card)';
        });
        /* Packets preserve identity across frames: a request leaves its candidate,
           a vote returns, then the next heartbeat fans out. RV=vote request. */
        let routes=[];
        if(p===1) routes=[2,3,4,5].map(b=>({a:1,b,type:'RV',f:.03}));
        if(p===2) routes=[2,3,4,5].map(b=>({a:1,b,type:'RV',f:b===3||b===5?.83:.45}));
        if(p===3) routes=[3,5].map(a=>({a,b:1,type:'YES',f:.83}));
        if(p===4) routes=[2,3,4,5].map(b=>({a:1,b,type:'HB',f:.83}));
        if(p===5) routes=[2,3,4,5].map(b=>({a:1,b,type:'×',f:.3}));
        if(p===6) routes=[{a:3,b:2,type:'YES',f:.5},{a:5,b:4,type:'YES',f:.5},{a:5,b:2,type:'NO',f:.53},{a:3,b:4,type:'NO',f:.53}];
        if(p===7) routes=[1,2,3,5].map(b=>({a:4,b,type:b===1?'×':'RV',f:b===1?.4:.25}));
        if(p===8) routes=[{a:2,b:4,type:'YES',f:.83},{a:5,b:4,type:'YES',f:.83}];
        if(p===9) routes=[1,2,3,5].map(b=>({a:4,b,type:'HB',f:.83}));
        R.packets.forEach((packet,i)=>{
          const m=routes[i];if(!m){packet.set({show:false});R.wires[i].style.opacity=0;return;}
          const a=R.P[m.a-1],b=R.P[m.b-1],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),unit={x:dx/d,y:dy/d};
          const wire=R.wires[i];wire.setAttribute('x1',a.x+unit.x*35);wire.setAttribute('y1',a.y+unit.y*35);wire.setAttribute('x2',b.x-unit.x*35);wire.setAttribute('y2',b.y-unit.y*35);
          wire.style.opacity=.8;wire.style.stroke=m.type==='YES'||m.type==='HB'?'var(--ok)':m.type==='×'||m.type==='NO'?'var(--bad)':'var(--warn)';
          const distance=48+(d-96)*m.f;
          const labelOffset=m.type==='NO'&&a.y===182&&b.y===182?-18:0;
          packet.set({x:a.x+unit.x*distance-18,y:a.y+unit.y*distance-9+labelOffset,show:true,label:m.type,tone:m.type==='YES'||m.type==='HB'?'ok':m.type==='×'||m.type==='NO'?'warn':'cursor'});
        });
      }
    },
    bug: [
      {code:0,log:'Five voters begin as followers with equal, up-to-date logs. Each has a different election timer. The ring shows time remaining, not a vote; 3 of 5 votes are required regardless of how many nodes are online.',callout:'Five followers: the first timer to expire can start an election',state:{p:0,term:7,phase:'no leader yet',action:'different timeouts',tally:'No candidate · need 3 / 5',nodes:electionFrames[0]},stats:[{l:'voters',v:'5'},{l:'majority',v:'3'},{l:'leader',v:'none'}]},
      {code:1,log:'N1 times out first, increments its term to 8, becomes a candidate and persists its vote for itself. Its own vote counts, so it starts with 1 of the required 3. RequestVote is sent to every other voter.',callout:'N1 times out → term 8 → self-vote → RequestVote',state:{p:1,term:8,phase:'N1 campaigning',action:'self-vote = 1',tally:'N1 received 1 / 5',nodes:electionFrames[1]},stats:[{l:'candidate',v:'N1'},{l:'term',v:'8'},{l:'votes received',v:'1 / 5'}]},
      {code:2,log:'Vote requests travel to peers. Receiving a higher term updates a voter to that term. It grants a vote only if it has not voted for someone else in this term and the candidate log is at least as up to date as its own. The two timely replies will come from N3 and N5.',callout:'RV = RequestVote; check the term, previous vote and log',state:{p:2,term:8,phase:'requests in flight',action:'RV → peers',tally:'N1 received 1 / 5',nodes:electionFrames[2]},stats:[{l:'requests sent',v:'4'},{l:'replies received',v:'0'},{l:'logs',v:'equal'}]},
      {code:4,moment:true,log:'N3 and N5 persist votes for N1 and return YES. Together with N1’s self-vote this is 3 of 5, so N1 becomes leader in term 8. The other two replies are not required; election votes have not committed a client command.',callout:'Self + N3 + N5 = 3 / 5: N1 becomes leader',state:{p:3,term:8,phase:'N1 elected',action:'majority elected',tally:'N1 received 3 / 5 ✓',nodes:electionFrames[3]},stats:[{l:'leader',v:'N1',cls:'ok'},{l:'votes received',v:'3 / 5',cls:'ok'},{l:'committed command',v:'none shown'}]},
      {code:5,log:'N1 sends AppendEntries heartbeats to the followers. They recognize the leader and reset their timers; N2 and N4 learn term 8 without needing to cast election votes. A heartbeat is not another vote.',callout:'HB = heartbeat: followers reset their election timers',state:{p:4,term:8,phase:'heartbeats flowing',action:'HB → reset timers',tally:'N1 elected with 3 / 5',nodes:electionFrames[4]},stats:[{l:'leader',v:'N1',cls:'ok'},{l:'followers',v:'4'},{l:'timers',v:'reset'}]},
      {code:0,log:'N1 crashes and its heartbeats stop. Its persisted term 8 and self-vote remain on disk, shown in the ledger. The four live voters can still form a majority of the original five. N2 and N4 happen to reach their timeouts together.',callout:'The leader crashes; missing heartbeats let timers run out',state:{p:5,term:8,phase:'leader offline',action:'no heartbeats',tally:'Need 3 / 5, not 3 / 4',nodes:electionFrames[5]},stats:[{l:'live voters',v:'4 / 5'},{l:'required majority',v:'3'},{l:'leader',v:'offline',cls:'warn'}]},
      {code:6,moment:true,log:'N2 and N4 each start term 9 and self-vote. N3 votes for N2; N5 votes for N4. Each candidate has 2 votes, while N1 is offline. Cross-requests are rejected because each receiver already voted in term 9. Neither candidate reaches 3, so this term elects no leader.',callout:'A 2–2 split: one vote per term, so neither candidate wins',state:{p:6,term:9,phase:'split vote',action:'no leader this term',tally:'N2: 2 / 5 · N4: 2 / 5',nodes:electionFrames[6]},stats:[{l:'N2 votes',v:'2 / 5',cls:'warn'},{l:'N4 votes',v:'2 / 5',cls:'warn'},{l:'leader',v:'none'}]},
      {code:6,log:'The candidates have randomized their next election timeouts. N4 expires first and starts term 10 with a fresh persisted self-vote. This is a new election, so votes from term 9 do not count and no peer has yet replied.',callout:'Randomized retry: N4 starts a fresh election in term 10',state:{p:7,term:10,phase:'retry in a newer term',action:'new term, fresh vote',tally:'N4 received 1 / 5',nodes:electionFrames[7]},stats:[{l:'candidate',v:'N4'},{l:'new term',v:'10'},{l:'votes received',v:'1 / 5'}]},
      {code:4,moment:true,log:'N2 and N5 receive term-10 requests, step into the higher term, clear their old-term votes and vote for N4. N4 now has 3 of 5 and becomes leader; N3’s reply and the offline node are not needed. Voting for N2 in term 9 and N4 in term 10 is allowed.',callout:'N4 + N2 + N5 = 3 / 5: the newer term has a leader',state:{p:8,term:10,phase:'N4 elected',action:'new leader N4',tally:'N4 received 3 / 5 ✓',nodes:electionFrames[8]},stats:[{l:'leader',v:'N4',cls:'ok'},{l:'votes received',v:'3 / 5',cls:'ok'},{l:'N1',v:'still offline'}]},
      {code:7,log:'N1 restarts with persisted term 8, then learns term 10 from N4’s heartbeat and follows it. N3 also learns the new term. The old term’s votes are cleared, not counted again. N4 keeps the cluster stable with heartbeats; committing commands is a separate replication step shown in Commit frontier.',callout:'A restarted old leader learns the newer term and follows',state:{p:9,term:10,phase:'all follow term 10',action:'one leader, five nodes',tally:'N4 elected with 3 / 5',nodes:electionFrames[9]},stats:[{l:'online',v:'5 / 5',cls:'ok'},{l:'leader',v:'N4',cls:'ok'},{l:'term',v:'10'}],takeaway:'Timeout → candidate → majority → leader. A split retries in a new term; election votes do not commit commands.'}
    ]
  };

  const majority = {
    id: 'majority', label: 'Raft · commit frontier',
    desc: 'Three logs, one commit frontier: isolate the leader, elect a newer leader, replace an uncommitted suffix, then commit a retry on a majority.',
    codeLabel: 'CQL / Raft mechanism',
    code: { bug: [
      'ALTER TABLE ks_orders.orders ADD coupon text;',
      '// an isolated old leader may append, but cannot commit',
      '// the connected majority elects a leader in a newer term',
      '// a conflicting uncommitted suffix can be replaced',
      'DESCRIBE TABLE ks_orders.orders;  -- inspect the actual column',
      '// retry only after checking: commit current-term entry on 2 of 3',
    ] },
    stage: {
      w: 640, h: 420,
      footer: 'Simplified: 3 metadata voters, fixed membership. Terms and indices illustrative.',
      header: s => ({ left: 'group 0 · aligned replicated logs', right: s.phase }),
      setup(kit) {
        const t = (x, y, text, cls = 'kt sm', anchor) => kit.text(null, { x, y, t: text, cls, anchor });
        const heads = X.map((x, i) => {
          t(x + CW / 2, 80, 'N' + (i + 1), 'kt b', 'middle');
          const role = t(x + CW / 2, 99, '', 'kt xs b', 'middle');
          const rail = kit.el('path', { d: `M${x - 4} 111 V269 H${x + CW + 4} V111`, fill: 'none' }, kit.layer);
          rail.style.stroke = 'var(--line)'; rail.style.strokeWidth = 2;
          const rows = [0, 1, 2, 3].map(j => kit.chip(null, { x, y: 112 + j * 40, w: CW, h: 24,
            label: '', small: true, tone: 'ok', show: false }));
          const marker = kit.el('g', null, kit.layer); marker.style.transition = MOVE;
          const line = kit.el('line', { x1: -5, y1: 0, x2: CW + 5, y2: 0 }, marker);
          line.style.stroke = 'var(--ok)'; line.style.strokeWidth = 3;
          const label = kit.text(marker, { x: CW / 2, y: 12, t: '', cls: 'kt xs b', anchor: 'middle' });
          return { role, rail, rows, marker, label };
        });
        [9, 10, 11, 12].forEach((index, i) => t(28, 129 + i * 40, '#' + index, 'kt xs mut'));
        const split = kit.el('path', { d: 'M258 70 V269', fill: 'none' }, kit.layer);
        split.style.stroke = 'var(--bad)'; split.style.strokeWidth = 2; split.style.strokeDasharray = '6 4'; split.style.transition = 'opacity .4s';
        const link = kit.el('path', { d: `M${centers[0]} 278 H${centers[2]}`, fill: 'none' }, kit.layer);
        link.style.stroke = 'var(--mut)'; link.style.strokeWidth = 1.5; link.style.transition = 'opacity .4s';
        const pulse = kit.el('g', null, kit.layer); pulse.style.transition = MOVE;
        const dot = kit.el('circle', { r: 6 }, pulse); dot.style.fill = 'var(--acc2)';
        const event = kit.chip(null, { x: 28, y: 288, w: 244, h: 32, label: 'ALTER TABLE', small: true, tone: 'cursor' });
        const proof = t(300, 305, '', 'kt sm b');
        const note = t(28, 337, '', 'kt sm b');
        return { heads, split, link, pulse, event, proof, note };
      },
      frame(s, kit, R) {
        const p = s.p;
        const idx = [p >= 6 ? 11 : 10, p >= 8 ? 12 : p >= 5 ? 11 : 10, p >= 8 ? 12 : p >= 5 ? 11 : 10];
        if(p >= 9) idx[0] = 12;
        R.heads.forEach((n, i) => {
          const term = p >= 6 || (p >= 5 && i > 0) ? 4 : 3;
          const leader = p < 5 ? i === 0 : i === 1;
          n.role.set((p === 5 && i === 0 ? 'old leader' : leader ? (p >= 1 && p < 5 ? 'isolated leader' : 'leader') : 'follower') + ' · t' + term);
          n.role.el.style.fill = leader ? 'var(--acc2)' : 'var(--mut)';
          n.rows[0].set({ show: true, label: '9 · t2 · schema', tone: 'ok' });
          n.rows[1].set({ show: true, label: '10 · t2 · map', tone: 'ok' });
          const oldSuffix = i === 0 && p >= 2 && p < 6;
          const newSuffix = (p >= 5 && i > 0) || p >= 6;
          n.rows[2].set({ show: oldSuffix || newSuffix, label: oldSuffix ? '11 · t3 · coupon' : '11 · t4 · noop', tone: oldSuffix ? 'warn' : 'ok' });
          const retry = (p >= 7 && i === 1) || (p >= 8 && i === 2) || p >= 9;
          n.rows[3].set({ show: retry, label: '12 · t4 · coupon', tone: p >= 8 ? 'ok' : 'warn' });
          n.marker.style.transform = `translate(${X[i]}px,${112 + (idx[i] - 9) * 40 + 25}px)`;
          n.label.set('commit ' + idx[i]);
          n.rail.style.stroke = oldSuffix ? 'var(--warn)' : 'var(--line)';
        });
        R.split.style.opacity = p >= 1 && p < 6 ? 1 : 0;
        R.link.style.opacity = p === 3 || p === 6 || p === 8 || p === 9 ? 1 : 0;
        R.pulse.style.opacity = p === 3 || p === 6 || p === 8 || p === 9 ? 1 : 0;
        R.pulse.style.transform = `translate(${p === 3 ? 245 : p === 6 ? centers[0] : p === 9 ? centers[0] : centers[2]}px,278px)`;
        R.event.set({ label: s.event, tone: p === 4 ? 'warn' : p >= 8 ? 'ok' : 'cursor' });
        R.proof.set(s.proof); R.note.set(s.note);
      }
    },
    bug: [
      { code: 0, log: 'All three voters share the committed prefix through index 10. N1 is leader in term 3. Log indices identify an agreed order, not just a count of stored copies.', callout: 'Every voter starts with the same committed prefix', state: { p: 0, phase: 'term 3', event: 'DDL arrives at N1', proof: 'commit index = 10', note: 'Appending an entry is separate from committing and applying it.' }, stats: [{ l: 'voters', v: '3' }, { l: 'majority required', v: '2' }] },
      { code: 1, log: 'A network split isolates N1 from N2 and N3. The dashed boundary separates connectivity, not whether the remote nodes are running.', callout: 'N1 is isolated; N2 and N3 can still communicate', state: { p: 1, phase: 'split 1 | 2', event: 'N1 isolated', proof: 'N1 reaches 1 / 3', note: 'Reachable from one node is not the same as globally down.' }, stats: [{ l: 'N1 reachable voters', v: '1', cls: 'warn' }, { l: 'connected other side', v: '2' }] },
      { code: 0, log: 'The isolated old leader appends coupon at index 11 in term 3. The amber tile sits below commit 10: it is stored locally, but has not changed the committed metadata state.', callout: 'An amber suffix is locally stored, not committed', state: { p: 2, phase: 'local append', event: 'coupon: local only', proof: '1 copy < 2 needed', note: 'The coupon column has not been applied from this proposal.' }, stats: [{ l: 'coupon log copies', v: '1', cls: 'warn' }, { l: 'N1 commit index', v: '10' }] },
      { code: 1, log: 'Replication cannot cross the split. A single copy cannot advance the commit frontier. A current-term entry needs storage on a majority, with Raft log matching and election rules intact.', callout: 'A reply count cannot bypass the log and term rules', state: { p: 3, phase: 'no majority on N1', event: 'replication blocked', proof: 'commit stays 10', note: 'Raft counts storage acknowledgements for an ordered log entry.' }, stats: [{ l: 'coupon copies', v: '1 / 3', cls: 'warn' }, { l: 'committed coupon', v: 'no' }] },
      { code: 1, log: 'The client times out. Ordinary row writes at LOCAL_ONE may still succeed on N1 if it holds a suitable replica; they are outside group 0. In general, a timeout alone cannot prove a DDL outcome.', callout: 'A row-write acknowledgement is not a metadata commit', state: { p: 4, phase: 'client timeout', event: 'DDL timed out', proof: 'row LOCAL_ONE may work', note: 'The consistency-level path and metadata consensus are separate.' }, stats: [{ l: 'DDL via N1', v: 'not committed', cls: 'warn' }, { l: 'row traffic', v: 'depends on CL' }] },
      { code: 2, moment: true, log: 'N2 and N3 elect N2 in term 4. A current-term no-op at index 11 is replicated and committed on their majority. They continue one metadata history; N1 cannot commit its conflicting suffix.', callout: 'The majority side progresses; the isolated side cannot', state: { p: 5, phase: 'new leader · term 4', event: 'N2 elected', proof: 'N2 + N3 = 2 / 3', note: 'A no-op advances the log without adding the coupon column.' }, stats: [{ l: 'majority-side commit', v: '11', cls: 'ok' }, { l: 'N1 commit', v: '10' }] },
      { code: 3, log: 'The split heals. N1 sees the higher term and follows N2. AppendEntries replaces the conflicting uncommitted coupon suffix with the leader’s no-op; committed prefix entries remain intact.', callout: 'Replace a conflicting suffix; preserve the committed prefix', state: { p: 6, phase: 'heal and reconcile', event: 'N1 follows term 4', proof: 'all commit index 11', note: 'This replacement is possible because the coupon entry never committed.' }, stats: [{ l: 'matching prefixes', v: '3', cls: 'ok' }, { l: 'coupon column', v: 'absent' }] },
      { code: 4, log: 'The engineer checks the actual table schema and finds no coupon column in this example. Only then is the statement resubmitted; N2 appends it at index 12 in term 4.', callout: 'Inspect the table schema before resubmitting timed-out DDL', state: { p: 7, phase: 'checked retry', event: 'coupon proposed again', proof: 'index 12: local only', note: 'describecluster checks schema versions; DESCRIBE TABLE checks columns.' }, stats: [{ l: 'column before retry', v: 'absent', cls: 'ok' }, { l: 'new proposal copies', v: '1' }] },
      { code: 5, moment: true, log: 'N3 stores the current-term entry and acknowledges it. N2 plus N3 form the majority, so commit advances to 12 and the entry can be applied. N1 can catch up after client success.', callout: 'A current-term entry commits on 2 of 3, before all catch up', state: { p: 8, phase: 'majority commit', event: 'coupon committed', proof: '2 / 3 store index 12', note: 'Commit protects an ordered decision; slow followers can apply later.' }, stats: [{ l: 'majority commit index', v: '12', cls: 'ok' }, { l: 'N1 known commit', v: '11' }] },
      { code: 5, log: 'N1 receives the committed suffix and learns the commit index. Each replica applies committed entries in log order. An acknowledged row mutation never creates this shared metadata log by itself.', callout: 'One committed order, eventually applied on every voter', state: { p: 9, phase: 'followers catch up', event: 'all apply coupon', proof: 'all commit index 12', note: 'Two acks can meet QUORUM; Raft also preserves one ordered history.' }, stats: [{ l: 'commit index', v: '12', cls: 'ok' }, { l: 'coupon column', v: 'present' }], takeaway: 'Raft commits an ordered log using terms and majorities. QUORUM row writes count replica acks without creating that log.' },
    ]
  };
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
window.CHAPTER_OVERRIDES[9] = {
  explain: `
<h3>1. One agreed order for metadata</h3>
<p>Schema and topology changes must have exactly one order. If two parts of a split each accepted a different <code>ALTER TABLE</code>, the cluster would hold two histories that cannot both be right. Raft prevents that. A majority of voters agrees on one order, and an entry takes effect only once it is committed.</p>

<h3>2. Group 0 holds the metadata</h3>
<p><b>Group 0</b> is one Raft group. Its state holds the schema, the cluster topology and the tablet map from the previous chapter. Each metadata change is one entry in its log. When group 0 looks unhealthy, start with the metric <code style="overflow-wrap:anywhere">scylla_raft_group0_status</code>, then check which voters are reachable.</p>

<h3>3. Terms, a leader and the commit rule</h3>
<p>The voters elect a <b>leader</b> for a <b>term</b>. Terms are numbered and only increase, so each new election starts a higher term. The leader appends each new entry to its own log and copies it to the followers. For a new entry in the leader’s <b>current term</b>, successful storage on a majority permits the leader to advance its <b>commit index</b>. Entries from older terms are not committed merely by counting copies; committing a current-term entry also commits its preceding prefix. Followers reject inconsistent prefixes, and elections restrict who may lead. These rules preserve committed history across leadership changes. With three voters the majority is two. A leader that cannot reach a majority can still append entries to its log, but it cannot commit them.</p>
<figure class="mm" aria-label="Sequence diagram: a change is appended on the leader, replicated, and committed once two of three voters store it" style="--diagram-width:620.00px">
  <img src="diagrams/raft-commit-sequence.svg" alt="Sequence diagram: the client sends ALTER TABLE to the leader. The leader appends the entry and replicates it to two followers. Follower 2 stores it, which gives a majority of two out of three, so the leader commits the entry and applies the schema change, then the client gets success. Follower 3 stores it later.">
  <figcaption>Sequence (Mermaid source: diagrams/raft-commit-sequence.mmd): the commit needs a majority, not every voter.</figcaption>
</figure>

<h3>Election: follow five voters</h3>
<p>Open <a href="#ch9&s=election">Election · 5 nodes</a> to follow a teaching trace inspired by the <a href="https://raminshiraz.github.io/raft-visualizer/" target="_blank" rel="noopener">Raft Visualizer</a>. Timeout rings shrink until a follower becomes a candidate, increments its term and persists its self-vote. Vote requests carry the last log term and index. Each voter grants at most one vote per term, and only to a candidate whose log is at least as up to date. Three of five elect a leader; the denominator stays five when one node crashes.</p>
<p>After N1 fails, N2 and N4 split the votes 2–2 in term 9. Neither wins. Randomized retry timeouts let N4 campaign first in term 10 and receive three votes. Heartbeats reset follower timers; a restarted N1 learns the higher term and follows. The ledger distinguishes persisted votes from replies counted by a candidate. This replay uses equal logs and illustrative timing, omits PreVote, and demonstrates election separately from command commit. Election rules follow the <a href="https://raft.github.io/raft.pdf" target="_blank" rel="noopener">Raft paper, sections 5.2 and 5.4.1</a>.</p>

<h3>4. When a metadata change can commit</h3>
<p>The decision for each DDL or topology change is short. The client cannot tell from the timeout alone whether the change committed, so the outcome has to be checked rather than assumed.</p>
<figure class="mm" aria-label="Flowchart: a metadata change commits only when a majority of voters is reachable" style="--diagram-width:301.52px">
  <img src="diagrams/ch09-metadata-commit.svg" alt="Flowchart: a metadata change commits only when a majority of voters is reachable">
  <figcaption>Flowchart: the same decision for every metadata change. Reachability allows progress; replication and the protocol establish commit. A timeout alone cannot prove the outcome.</figcaption>
</figure>

<h3>5. Raft majority versus the ack race</h3>
<p>Compare <a href="#ch1&s=ack-race">chapter 2’s acknowledgement race</a>. Both drawings can show “2 of 3”, but they answer different questions. A normal row-write coordinator asks: <em>have enough replicas acknowledged this mutation to meet the requested consistency level?</em> A Raft leader asks: <em>can this log prefix become an irrevocable, ordered decision?</em></p>
<figure class="hd" aria-label="Comparison of row-write consistency and group 0 Raft consensus">
  <table style="width:100%;min-width:520px;border-collapse:collapse;font-size:14px;line-height:1.5">
    <thead><tr><th style="text-align:left;padding:8px">Question</th><th style="text-align:left;padding:8px">Row write / ack-race</th><th style="text-align:left;padding:8px">Group 0 / Raft</th></tr></thead>
    <tbody>
      <tr><td style="padding:8px;border-top:1px solid var(--line)">Who counts?</td><td style="padding:8px;border-top:1px solid var(--line)">Any suitable coordinator</td><td style="padding:8px;border-top:1px solid var(--line)">Elected leader for this term</td></tr>
      <tr><td style="padding:8px;border-top:1px solid var(--line)">Which members?</td><td style="padding:8px;border-top:1px solid var(--line)">The partition’s replicas (RF)</td><td style="padding:8px;border-top:1px solid var(--line)">The Raft group’s voting membership</td></tr>
      <tr><td style="padding:8px;border-top:1px solid var(--line)">Threshold?</td><td style="padding:8px;border-top:1px solid var(--line)">Chosen CL: ONE, QUORUM, ALL</td><td style="padding:8px;border-top:1px solid var(--line)">Protocol majority; cannot lower it to ONE</td></tr>
      <tr><td style="padding:8px;border-top:1px solid var(--line)">What agrees?</td><td style="padding:8px;border-top:1px solid var(--line)">Acknowledgements for one mutation</td><td style="padding:8px;border-top:1px solid var(--line)">A prefix identified by log index and term</td></tr>
      <tr><td style="padding:8px;border-top:1px solid var(--line)">Conflicting work?</td><td style="padding:8px;border-top:1px solid var(--line)">Concurrent cell versions reconcile by timestamps</td><td style="padding:8px;border-top:1px solid var(--line)">Uncommitted suffixes may change; committed history survives</td></tr>
    </tbody>
  </table>
  <figcaption>The same numerical majority can have different members and guarantees.</figcaption>
</figure>
<p>In <code>ack-race</code>, ONE returns after the first replica responds; QUORUM waits for two of three; ALL waits for all three. The coordinator sends the write to all replicas rather than changing RF with the CL. There is no elected term or shared log position for ordinary mutations. A quorum read/write overlap helps retrieve acknowledged versions, but does not turn concurrent writes into a linearizable transaction. Lightweight transactions use a separate conditional-write consensus path; they are outside this comparison.</p>
<figure class="mm" aria-label="Two flows: acknowledgement threshold and ordered metadata commit" style="--diagram-width:562.62px">
  <img src="diagrams/ch09-acks-versus-raft.svg" alt="Two flows: acknowledgement threshold and ordered metadata commit">
  <figcaption>Storage acknowledgements during replication are not the election votes used to choose a leader.</figcaption>
</figure>
<p>The Raft animation makes that distinction concrete. N1’s amber coupon entry never crosses the green commit frontier. N2 and N3 elect a new leader and commit a term-4 no-op. When connectivity returns, N1’s conflicting uncommitted suffix is replaced; its committed prefix survives. The checked retry is then appended in the new term, committed on two voters and later learned by the third. Appending, committing and applying are separate events.</p>
<p>Ordinary row operations in this 2025.x course model stay outside group 0. The minority can sometimes meet LOCAL_ONE while it cannot change schema. QUORUM may still fail there because the required data replicas are unreachable. RF and voter count happen to both equal three in these examples; they are separate denominators, and metadata voters need not hold this partition.</p>

<h3>6. The trade-off and the retry</h3>
<p>Blocking metadata changes on the minority side prevents two authoritative histories. The cost is that schema and topology work stops until a majority is back. A rolling restart that takes two of three voters down at once stops all DDL, so restart one node at a time and wait until it shows <code>UN</code> and has caught up. When a DDL times out, do not repeat it at once. Inspect the table with <code>DESCRIBE TABLE</code>, check whether the column is already present, and retry only after establishing the result. <code>nodetool describecluster</code> compares schema versions; it does not list columns. A blind retry can hide the first result.</p>

<h3>7. The syntax, in one place</h3>
<pre>$ nodetool status                 # count the UN nodes against the majority of 3
cqlsh&gt; ALTER TABLE ks_orders.orders ADD coupon text;
cqlsh&gt; DESCRIBE TABLE ks_orders.orders;  # inspect the coupon column
$ nodetool describecluster       # compare schema versions on live nodes</pre>
<p>Check the state first, run the change once, then confirm the outcome.</p>
<p>Sources: <a href="https://docs.scylladb.com/manual/branch-2025.1/architecture/raft.html" target="_blank" rel="noopener">ScyllaDB 2025.1 metadata Raft</a>, <a href="https://docs.scylladb.com/manual/branch-2025.1/cql/consistency.html" target="_blank" rel="noopener">consistency levels</a> and the <a href="https://raft.github.io/raft.pdf" target="_blank" rel="noopener">Raft paper, sections 5.3–5.4</a>. The original minority, rolling-restart and timeout lessons are retained.</p>`,

  scenarios: [
    majority,
    election,
    {
      id: 'rolling-restart',
      label: 'Parallel restart',
      desc: 'Restarting two of three voters at once removes the majority, so DDL hangs; restarting one node at a time keeps it (timing illustrative).',
      codeLabel: 'nodetool',
      code: { bug: [
        '$ nodetool status                 # the starting point: all UN',
        '# restart nodes 2 and 3 in one parallel batch',
        'cqlsh> ALTER TABLE ks_orders.orders ADD coupon text;',
        'OperationTimedOut: errors={}, last_host=10.0.1.11',
        '$ nodetool status                 # restart one node, wait for UN',
        '$ nodetool describecluster        # one schema version on live nodes'
      ] },
      scene: {
        w: 640, h: 420,
        footer: 'Simplified: one three-voter group. Restart timing is illustrative.',
        panels: [
          { id: 'v1', x: 16, y: 58, w: 190, h: 190, title: 'Voter 1 · node 1', tone: 'info' },
          { id: 'v2', x: 225, y: 58, w: 190, h: 190, title: 'Voter 2 · node 2', tone: 'info' },
          { id: 'v3', x: 434, y: 58, w: 190, h: 190, title: 'Voter 3 · node 3', tone: 'info' },
          { id: 'q', x: 16, y: 268, w: 608, h: 130, title: 'DDL and quorum status', tone: 'info' }
        ],
        tokens: {
          n1: { label: 'node 1', sub: 'UN · up', tone: 'ok', w: 150 },
          n2: { label: 'node 2', sub: 'UN · up', tone: 'ok', w: 150 },
          n3: { label: 'node 3', sub: 'UN · up', tone: 'ok', w: 150 },
          auto: { label: 'automation', sub: 'restarts 2 and 3', tone: 'warn', w: 150 },
          ddl: { label: 'ALTER TABLE', sub: 'sent on node 1', tone: 'cursor', w: 150 },
          to: { label: 'OperationTimedOut', sub: 'client view', tone: 'bad', w: 170 }
        }
      },
      bug: [
        { log: 'Before the rolling upgrade all three voters are up. A majority of three is two, so one voter may be down.', callout: 'Three voters up. A majority is two.', code: 0,
          at: { n1: { x: 40, y: 110 }, n2: { x: 249, y: 110 }, n3: { x: 458, y: 110 } },
          stats: [{ l: 'nodes up', v: '3 of 3', cls: 'ok' }, { l: 'majority needed', v: '2', cls: 'warn' }] },
        { log: 'Automation restarts nodes 2 and 3 in one parallel batch. nodetool status shows UN on node 1 only (illustrative).', callout: 'Two voters restart in one batch', code: 1,
          at: { n1: { x: 40, y: 110 }, n2: { x: 249, y: 110, sub: 'DN · restarting', tone: 'bad' }, n3: { x: 458, y: 110, sub: 'DN · restarting', tone: 'bad' }, auto: { x: 440, y: 300 } },
          arrows: [['auto', 'n2', 'restart'], ['auto', 'n3', 'restart']],
          stats: [{ l: 'nodes up', v: '1 of 3', cls: 'bad' }, { l: 'majority needed', v: '2', cls: 'warn' }] },
        { log: 'The ALTER TABLE reaches group 0, which has one of three voters reachable. That is not a majority, so no entry commits.', callout: 'One voter reachable: no majority', code: 2,
          at: { n1: { x: 40, y: 110 }, n2: { x: 249, y: 110, sub: 'DN · restarting', tone: 'bad' }, n3: { x: 458, y: 110, sub: 'DN · restarting', tone: 'bad' }, auto: { x: 440, y: 300 }, ddl: { x: 40, y: 300 } },
          arrows: [['ddl', 'n1', 'one vote']],
          stats: [{ l: 'voters reachable', v: '1 of 3', cls: 'bad' }, { l: 'majority needed', v: '2', cls: 'warn' }] },
        { log: 'The ALTER TABLE times out. Row traffic at LOCAL_ONE can still partly work, but no metadata change commits.', callout: 'The DDL hangs until a majority returns', code: 3, moment: true,
          at: { n1: { x: 40, y: 110 }, n2: { x: 249, y: 110, sub: 'DN · restarting', tone: 'bad' }, n3: { x: 458, y: 110, sub: 'DN · restarting', tone: 'bad' }, auto: { x: 440, y: 300 }, ddl: { x: 40, y: 300 }, to: { x: 240, y: 300 } },
          arrows: [['ddl', 'to', 'timed out']],
          stats: [{ l: 'voters reachable', v: '1 of 3', cls: 'bad' }, { l: 'DDL result', v: 'OperationTimedOut', cls: 'bad' }] },
        { log: 'Fix: restart one node at a time. Node 3 is UN and caught up, so node 2 is the only node still down.', callout: 'One restart at a time keeps a majority', code: 4,
          at: { n1: { x: 40, y: 110 }, n2: { x: 249, y: 110, sub: 'DN · restart next', tone: 'warn' }, n3: { x: 458, y: 110, sub: 'UN · caught up', tone: 'ok' } },
          stats: [{ l: 'voters reachable', v: '2 of 3', cls: 'ok' }, { l: 'nodes restarting at once', v: '1', cls: 'ok' }] },
        { log: 'Node 2 is UN and caught up. All three voters are up, so the restart window is over.', callout: 'Restart window over: all voters up', code: 4,
          at: { n1: { x: 40, y: 110 }, n2: { x: 249, y: 110, sub: 'UN · caught up', tone: 'ok' }, n3: { x: 458, y: 110, sub: 'UN · caught up', tone: 'ok' } },
          stats: [{ l: 'voters reachable', v: '3 of 3', cls: 'ok' }, { l: 'nodes restarting at once', v: '0', cls: 'ok' }] },
        { log: 'Outside the restart window, check the table, run the change once, then confirm one schema version on every node.', callout: 'Outside the window: run the change once', code: 5,
          at: { n1: { x: 40, y: 110 }, n2: { x: 249, y: 110, sub: 'UN · caught up', tone: 'ok' }, n3: { x: 458, y: 110, sub: 'UN · caught up', tone: 'ok' }, ddl: { x: 40, y: 300, sub: 'committed once', tone: 'ok' } },
          stats: [{ l: 'entry committed', v: 'once', cls: 'ok' }, { l: 'schema versions', v: '1', cls: 'ok' }],
          takeaway: 'Restart one node at a time and wait for UN. With two of three voters down, no metadata change can commit.' }
      ]
    }
  ]
};

})();
