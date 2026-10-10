/* Chapter 2: a healthy request/reply ladder, then a static uncertainty comparison. */
(function () {
  const request = {
    id:'boundary',label:'Across the process boundary',
    desc:'Follow a healthy exchange. A can inspect its own memory; what it learns about B comes through messages.',
    codeLabel:'Protocol',code:{bug:['A: encode reserve(order=42, quantity=1)','A → B: request bytes','B: record reservation in its own state','B → A: reply bytes','A: decode success and continue']},
    stage:{w:640,h:420,footer:'Normal path first: a send, a remote effect and a separate reply.',
      header:() => ({left:'Two processes · independent local state',right:'time moves down'}),
      setup(kit) {
        const R={};
        DK.box(kit,{x:60,y:76,w:178,h:44,label:'Checkout A',sub:'local state',tone:'acc'});
        DK.box(kit,{x:402,y:76,w:178,h:44,label:'Inventory B',sub:'local state',tone:'ok'});
        DK.rule(kit,149,126,149,300,{dash:'4 4'});DK.rule(kit,491,126,491,300,{dash:'4 4'});
        R.req=DK.line(kit,{x1:149,y1:156,x2:491,y2:156,tone:'acc2',op:0});
        R.rep=DK.line(kit,{x1:491,y1:276,x2:149,y2:276,tone:'ok',op:0});
        R.send=DK.txt(kit,{x:320,y:146,t:'',cls:'sm',anchor:'middle'});
        R.reply=DK.txt(kit,{x:320,y:266,t:'',cls:'sm',anchor:'middle'});
        R.effect=DK.box(kit,{x:416,y:184,w:170,h:44,label:'reservation 42',sub:'not recorded yet',tone:'none'});
        R.client=DK.box(kit,{x:40,y:184,w:214,h:44,label:'A knows',sub:'no result yet',tone:'none'});
        R.tip=DK.txt(kit,{x:320,y:336,t:'',cls:'sm b',anchor:'middle'});
        return R;
      },
      frame(s,kit,R) {
        R.req.set({op:s.sent?1:0});R.rep.set({op:s.replied?1:0});
        R.send.set(s.sent?'→ request bytes':'');R.reply.set(s.replied?'← reply bytes':'');
        R.effect.set({sub:s.effect?'stored on B':'not recorded yet',tone:s.effect?'ok':'none'});
        R.client.set({sub:s.replied?'received success':'no result yet',tone:s.replied?'ok':'none'});
        R.tip.set(s.tip||'');
      }
    },bug:[
      {log:'A and B run separately. Neither can directly inspect the other’s memory. A first encodes the reservation request.',code:0,state:{},callout:'Remote work starts with a message.'},
      {log:'A sends bytes to B. Sending the request is not evidence that B has performed the reservation.',code:1,state:{sent:1},callout:'Send is not completion.'},
      {log:'B decodes the request and records reservation 42 in its own state. A still has no result until a reply returns.',code:2,state:{sent:1,effect:1},callout:'The effect is local to B.'},
      {log:'B returns reply bytes. A learns the result, decodes success and continues. A send, an effect and a reply are separate steps.',code:4,state:{sent:1,effect:1,replied:1,tip:'A learns remote state through a reply.'},callout:'Now A knows the reported outcome.',takeaway:'A network call is a protocol across independent state.'}
    ]
  };
  const uncertain={
    id:'silence',label:'One observation, three causes',presentation:'static',
    desc:'A sees no response by its deadline in every row. The effect on B differs; a timeout does not reveal which row happened.',
    codeLabel:'Observation',code:{bug:['A: no reply before the deadline','Known: A did not receive a timely result','Unknown: whether B performed the operation']},
    stage:{w:640,h:420,footer:'A timeout bounds waiting; it does not reverse remote work.',header:()=>({left:'Compare possible causes',right:'same caller observation'}),
      setup(kit) {
        DK.cap(kit,24, 96,'Possible cause','sm b');DK.cap(kit,350,96,'Effect on B','sm b');DK.cap(kit,510,96,'A sees','sm b');
        [['Request never arrives','No reservation'],['B pauses before work','No reservation yet'],['Reply lost after work','Reservation exists']].forEach((r,i)=>{
          const y=122+i*66;
          DK.box(kit,{x:16,y,w:300,h:48,label:r[0],tone:'soft'});
          DK.box(kit,{x:326,y,w:170,h:48,label:r[1],tone:i===2?'ok':'none'});
          DK.box(kit,{x:506,y,w:118,h:48,label:'timeout',tone:'warn'});
        });
        DK.cap(kit,320,338,'“No response” is an observation. “No effect” is an assumption.','sm b','middle');return {};
      },frame(){}
    },bug:[{log:'All three histories look like a timeout to A, while B’s state differs. Without a reply or a recovery query, A must preserve that uncertainty.',code:2,state:{},callout:'Do not infer the effect from silence.',takeaway:'Partial failure leaves the caller with incomplete knowledge.'}]
  };
  window.CHAPTER_OVERRIDES=window.CHAPTER_OVERRIDES||{};
  window.CHAPTER_OVERRIDES[1]={scenarios:[request,uncertain]};
})();
