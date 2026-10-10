/* Chapter 4: build the same record on two disks before introducing lag and crashes. */
(function () {
  const copy={
    id:'copy',label:'Build the second copy',
    desc:'Each row is a separate machine. Numbered cells are log entries, and the title is the applied record. No crash occurs in this example.',
    codeLabel:'Replication trace',code:{bug:['start: both copies applied entries 1 and 2','client: set title = Lead','A: append entry 3','A → B: send entry 3','B: receive and store entry 3','B: apply entry 3; title = Lead']},
    stage:{w:640,h:420,footer:'Positions count entries in one log; receipt, storage and application differ.',
      header:()=>({left:'Single leader · healthy copying path',right:'one record, two disks'}),
      setup(kit) {
        const R={cells:[],value:[],move:DK.dot(kit,{r:11,label:'3',tone:'acc2'})};
        ['Leader A','Follower B'].forEach((name,row)=>{
          const y=118+row*122;
          DK.box(kit,{x:16,y,w:116,h:50,label:name,sub:'separate disk',tone:row?'ok':'acc'});
          const cells=[];
          [1,2,3].forEach((n,i)=>cells.push(DK.box(kit,{x:162+i*58,y,w:48,h:50,label:String(n),tone:'none'})));
          R.cells.push(cells);
          R.value.push(DK.box(kit,{x:382,y,w:236,h:50,label:'applied title',sub:'Engineer',tone:'none'}));
        });
        DK.cap(kit,232,94,'Replication log','sm b','middle');DK.cap(kit,500,94,'Query state','sm b','middle');
        R.note=DK.txt(kit,{x:320,y:336,t:'',cls:'sm b',anchor:'middle'});return R;
      },
      frame(s,kit,R) {
        R.cells.forEach((cells,row)=>cells.forEach((cell,i)=>{
          const has=i<2||!!(row?s.stored:s.appended);
          cell.set({tone:has?'ok':'soft',op:has?1:0.3,dash:has?'':'3 3'});
        }));
        R.value[0].set({sub:s.appended?'Lead':'Engineer',tone:s.appended?'ok':'none'});
        R.value[1].set({sub:s.applied?'Lead':'Engineer',tone:s.applied?'ok':'none'});
        R.move.set({x:298,y:s.stored?236:197,op:s.sending?1:0});R.note.set(s.note||'');
      }
    },bug:[
      {log:'A and B each have the same profile. Both logs contain entries 1 and 2, and both query states show Engineer.',code:0,state:{note:'A replica holds the same logical data.'},callout:'First, two matching copies.'},
      {log:'The client asks the leader A to set the title to Lead. B is a follower: it receives changes from A rather than accepting this client write.',code:1,state:{note:'Leader = write entry point; follower = follows changes.'},callout:'Give the roles meaning before using them.'},
      {log:'A records entry 3 and applies the new title locally. B has not received this entry yet; it is still a valid older copy.',code:2,state:{appended:1,note:'Updating A does not directly change B.'},callout:'The change begins on one disk.'},
      {log:'A sends entry 3 across the network. The moving numbered marker represents the log entry, not shared memory.',code:3,state:{appended:1,sending:1,note:'Copying requires a message.'},callout:'Move the change across the boundary.'},
      {log:'B receives and stores entry 3. Its log now contains the entry, but the query state in this trace has not applied it yet.',code:4,state:{appended:1,stored:1,note:'Stored log entry ≠ applied query state.'},callout:'Receipt and application are distinct.'},
      {log:'B applies entry 3 to its record. Both query states now show Lead. Two separate disks hold the same logical profile.',code:5,state:{appended:1,stored:1,applied:1,note:'Caught up: both copies include entry 3.'},callout:'Now the follower has caught up.',takeaway:'Replication copies ordered changes; the next lesson reads during the gap.'}
    ]
  };
  window.CHAPTER_OVERRIDES=window.CHAPTER_OVERRIDES||{};
  window.CHAPTER_OVERRIDES[3]={scenarios:[copy]};
})();
