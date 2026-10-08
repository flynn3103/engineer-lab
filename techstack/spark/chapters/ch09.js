(function(){
 const {text,rect,line,path,dot,move,show,stage,scenario,register}=SparkScene;
 const attempts=scenario('commit-protocol','Commit · choose one attempt','Two attempts write privately. One gets commit authorization; job completion provides a readiness signal rather than a directory-wide transaction.',[
  '# Mechanism sketch: use a supported output committer, not direct writes.','# Attempt 7.0 writes private task output.','# Attempt 7.1 writes a separate copy of the same logical partition.','# Commit coordination authorizes one attempt for task 7.','# The committer publishes successful task output according to its protocol.','# Readers need an explicit readiness / snapshot contract.','# _SUCCESS is a completion marker, not an atomic table snapshot.'
 ],stage('commit · attempts and readiness','Simplified file-output contract; atomicity depends on the sink and committer.',k=>{
  text(k,26,88,'PRIVATE ATTEMPT OUTPUT','xs b');text(k,437,88,'PUBLISHED FILES','xs b');
  const a=k.chip(null,{x:26,y:111,w:181,h:34,label:'part-7 · attempt 0',small:true,tone:'cursor'});
  const b=k.chip(null,{x:26,y:177,w:181,h:34,label:'part-7 · attempt 1',small:true,tone:'warn'});
  const c=k.chip(null,{x:26,y:242,w:181,h:34,label:'part-8 · attempt 0',small:true,tone:'cursor'});
  const gate=k.chip(null,{x:230,y:153,w:176,h:38,label:'one winner / task',small:true});
  path(k,'M207 128 L229 169 M207 194 L229 175 M406 171 L436 171');
  rect(k,436,107,178,173,'--ok');
  const badge=k.chip(null,{x:442,y:239,w:166,h:29,label:'not ready',small:true,tone:'warn'});
  const abort=path(k,'M30 175 L201 213 M201 175 L30 213','--bad');const note=text(k,26,329,'','xs b');return {a,b,c,gate,badge,abort,note};
 },(s,k,r)=>{const p=s.p;
  r.a.set({x:p>=5?449:26,y:p>=5?119:111,w:p>=5?152:181,tone:p>=3?'ok':'cursor'});
  r.b.set({show:p<4,tone:p>=3?'bad':'warn'});show(r.abort,p===3||p===4);
  r.c.set({x:p>=6?449:26,y:p>=6?174:242,w:p>=6?152:181,tone:p>=6?'ok':'cursor'});
  r.gate.set({tone:p>=3?'ok':'info'});r.badge.set({label:p>=7?'_SUCCESS / ready':'not ready',tone:p>=7?'ok':'warn'});
  r.note.set(p>=7?'Readers follow a completion contract or transactional table snapshot':p>=5?'Files may become visible incrementally during commit':'Private attempt paths prevent speculative copies from clobbering output');
 }),[
  ['first attempt','A task writes output using its committer contract','The diagram shows private attempt output for one logical partition. Arbitrary writes made directly from task code are outside this protocol.',1,[['logical task','7']]],
  ['second attempt','A speculative or retried attempt can write the same partition','Task identity differs from attempt identity. Two attempts must not overwrite each other while both are still running.',2,[['task 7 attempts','2']]],
  ['isolate','Separate attempt output keeps intermediate writes apart','A file writer and supported committer handle temporary or pending output according to their filesystem protocol. Task code should not invent final paths per attempt.',0,[['attempt paths','separate']]],
  ['authorize','Commit coordination selects a winner for this task','Only one attempt is authorized to commit its successful output. A competing successful attempt can be denied and cleaned up.',3,[['committed task 7','one attempt','ok']]],
  ['discard loser','The redundant attempt is aborted or cleaned up','Aborted attempt data must not count as a second logical partition. Cleanup behavior and handling after failures depend on the committer.',3,[['duplicate logical files','0 in this contract']]],
  ['publish','Successful output is published according to the chosen protocol','The first file is visible in the illustrated commit phase. A directory of files is not automatically published by one atomic operation on every storage system.',4,[['readiness','not yet']]],
  ['job phase','Other successful task outputs finish their publication','A crash in a multi-file job commit can require cleanup or recovery. Per-task winner coordination does not provide a transaction over an arbitrary output directory.',4,[['readiness','not yet']]],
  ['ready signal','Readers wait for an explicit completion or snapshot contract','A successful file job may create _SUCCESS. A reader that ignores completion can see incomplete work; transactional table formats provide different, stronger snapshot semantics.',5,[['completion','signalled','ok']],'Attempt coordination prevents duplicate task commits. Readers still need a valid dataset-readiness contract.']
 ]);
 const objects=scenario('rename-commit','Object store · copy or complete','Compare copy-and-delete rename with pending multipart uploads. Both paths reveal when individual objects become visible.',[
  '# S3A rename is implemented using object copy and delete.','# Compatible S3A committers can keep multipart uploads pending.','# Commit completes selected uploads without renaming every object.','# Deployment needs matching Spark, Hadoop and cloud integration classes.','# Example setting (not sufficient alone):','spark.hadoop.fs.s3a.committer.name = directory','# Multiple objects still complete individually; use a reader contract.'
 ],stage('objects · copy or complete','Illustrative 3 files; exact S3A protocol depends on the chosen committer.',k=>{
  text(k,26,88,'RENAME PATH · COPY THEN DELETE','xs b');
  const temp=[0,1,2].map(i=>k.chip(null,{x:26+i*198,y:107,w:174,h:27,label:'temporary file '+i,small:true,tone:'warn'}));
  const final=[0,1,2].map(i=>k.chip(null,{x:26+i*198,y:160,w:174,h:27,label:'destination '+i,small:true,show:false,tone:'ok'}));
  [0,1,2].forEach(i=>path(k,`M${113+i*198} 137 V157`));
  text(k,26,225,'ZERO-RENAME PATH · PENDING UPLOAD → COMPLETE','xs b');
  const pending=[0,1,2].map(i=>k.chip(null,{x:26+i*198,y:242,w:174,h:27,label:'pending upload '+i,small:true,tone:'cursor'}));
  const cursor=dot(k,'--acc2');const note=text(k,26,328,'','xs b');return {temp,final,pending,cursor,note};
 },(s,k,r)=>{const p=s.p;
  r.final.forEach((c,i)=>c.set({show:p>=i+1}));r.temp.forEach((c,i)=>c.set({show:p<i+2}));
  r.pending.forEach((c,i)=>c.set({y:p>=5+i?288:242,label:p>=5+i?'complete object '+i:'pending upload '+i,tone:p>=5+i?'ok':'cursor'}));
  move(r.cursor,[113,113,311,509,113,113,311,509][p],p>=4?278:147,p>0);
  r.note.set(p<4?'Renaming an S3 object requires a copy and removal of its old key':p>=7?'Completed objects still need a dataset-level reader contract':'Commit can complete pending uploads without per-file rename');
 }),[
  ['temporary output','A rename-based committer begins with temporary output','On S3, renaming an object is not a filesystem metadata rename. The implementation copies data to a new key and deletes the old key.',0,[['files shown','3']]],
  ['first copy','A destination object can appear before other objects finish','The first copy is complete. A direct directory reader can see a subset while the remainder is still pending.',0,[['visible destination objects','1']]],
  ['copy and delete','Each copied object also needs old-key cleanup','Many large or tiny objects can make this phase expensive. Object storage consistency does not turn a series of object operations into one multi-object transaction.',0,[['visible objects','2']]],
  ['remaining files','The rename path repeats publication work for every object','The delay after the last compute task can be dominated by commit I/O. Measure task time and commit time separately.',0,[['visible objects','3']]],
  ['pending uploads','A compatible S3A committer can defer upload completion','Its selected multipart uploads remain pending before job commit. Configuration requires the relevant Spark commit protocol and Hadoop integration; one name setting alone is insufficient.',1,[['pending uploads','3']]],
  ['complete selected','Commit completes the winning upload for one object','The object can become visible without copying it to another key. Losing attempts and pending uploads require abort or cleanup behavior.',2,[['complete uploads','1']]],
  ['individual objects','The other winning uploads complete individually','Zero-rename improves the storage operation pattern. It does not guarantee that all objects become visible simultaneously.',2,[['complete uploads','2']]],
  ['reader contract','Use completion signalling or a transactional table snapshot','A completion marker and an agreed reader policy can prevent premature reads. For table-level atomic visibility and concurrent updates, use a sink designed to provide those semantics.',6,[['complete uploads','3','ok']],'A zero-rename committer avoids copy-and-delete. It does not make many object publications one transaction.']
 ]);
 const c=window.COURSE.chapters[9];
 register(9,[attempts,objects],c.explain,{predict:{...c.predict,why:'Attempt isolation and commit coordination select successful task output. Dataset visibility and failure recovery depend on the committer and filesystem; _SUCCESS is a completion marker, not a universal atomic snapshot.'}});
})();
