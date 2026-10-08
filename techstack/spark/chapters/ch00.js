(function () {
  const TRANS='transform .65s cubic-bezier(.3,.7,.2,1), opacity .35s';
  const txt=(kit,x,y,t,cls='sm',anchor='start',parent=kit.layer)=>kit.text(parent,{x,y,t,cls,anchor});
  const tint=(tone,n=20)=>`color-mix(in srgb,var(${tone}) ${n}%,var(--card))`;
  const line=(kit,x1,y1,x2,y2,color='--mut')=>{
    const el=kit.el('line',{x1,y1,x2,y2},kit.layer);el.style.stroke=`var(${color})`;el.style.strokeWidth=1.5;return el;
  };
  const step=(p,phase,callout,log,code,stats=[],extra={})=>({state:{p,phase},callout,log,code,stats,...extra});
  const byteCut={
    id:'byte-cut',label:'Bytes → whole records',
    desc:'A byte ruler cuts through an order record. The read cursors finish and skip the shared fragment, so each whole record is emitted once.',
    codeLabel:'PySpark / reader mechanism',
    code:{bug:[
      'spark.conf.set("spark.sql.files.maxPartitionBytes", 134217728)',
      '# A byte split can land inside a newline-delimited record.',
      '# Reader 0 finishes the record that starts in its range.',
      '# Reader 1 skips the leading fragment and starts the next record.',
      'orders = spark.read.schema(schema).json("orders/*.json")',
      'orders.count()  # an action launches the read job'
    ]},
    stage:{w:640,h:420,footer:'Simplified: uncompressed, newline-delimited text. Byte distances illustrative.',
      header:s=>({left:'one file · two read ranges',right:s.phase}),
      setup(kit){
        txt(kit,26,82,'FILE BYTES','xs b');
        const left=kit.el('rect',{x:26,y:94,width:294,height:118,rx:8},kit.layer);left.style.fill=tint('--acc2',9);
        const right=kit.el('rect',{x:320,y:94,width:294,height:118,rx:8},kit.layer);right.style.fill=tint('--ok',9);
        line(kit,26,92,614,92);[26,320,614].forEach(x=>line(kit,x,88,x,95));
        txt(kit,32,108,'0','xs');txt(kit,320,108,'128 MB','xs b','middle');txt(kit,605,108,'256 MB','xs','end');
        txt(kit,90,204,'split 0','xs b','middle');txt(kit,546,204,'split 1','xs b','middle');
        const cut=line(kit,320,116,320,196,'--warn');cut.style.strokeDasharray='5 4';cut.style.strokeWidth=2;
        const a=kit.chip(null,{x:46,y:122,w:132,h:24,label:'L89 · Hue · 10 ↵',small:true});
        const b=kit.chip(null,{x:206,y:157,w:240,h:24,label:'L90 · San Francisco · 40 ↵',small:true,tone:'warn'});
        const c=kit.chip(null,{x:469,y:122,w:132,h:24,label:'L91 · Hue · 60 ↵',small:true});
        const window=kit.el('rect',{x:206,y:154,width:114,height:30,rx:6,fill:'none'},kit.layer);window.style.stroke='var(--acc2)';window.style.strokeWidth=3;window.style.transition='width .65s, opacity .3s';
        const fragment=kit.el('rect',{x:320,y:157,width:126,height:24,rx:5},kit.layer);fragment.style.fill=tint('--warn',65);fragment.style.transition='opacity .4s';
        const slash=line(kit,326,179,440,159,'--bad');slash.style.strokeWidth=2;slash.style.transition='opacity .4s';
        const cursor=(color)=>{const g=kit.el('g',null,kit.layer);g.style.transition=TRANS;const path=kit.el('path',{d:'M0 -12 V27 M-5 -10 L0 -16 L5 -10',fill:'none'},g);path.style.stroke=`var(${color})`;path.style.strokeWidth=2.5;return g;};
        const c0=cursor('--acc2'),c1=cursor('--ok');
        txt(kit,26,240,'TASK 0 · RECORDS OWNED HERE','xs b');txt(kit,346,240,'TASK 1 · NEXT WHOLE RECORD','xs b');
        const out0=kit.chip(null,{x:42,y:260,w:264,h:28,label:'89 · Hue · 10',small:true,show:false,tone:'cursor'});
        const out1=kit.chip(null,{x:42,y:296,w:264,h:28,label:'90 · San Francisco · 40',small:true,show:false,tone:'cursor'});
        const out2=kit.chip(null,{x:364,y:260,w:240,h:28,label:'91 · Hue · 60',small:true,show:false,tone:'ok'});
        const note=txt(kit,346,315,'','xs');
        return {a,b,c,window,fragment,slash,c0,c1,out0,out1,out2,note};
      },
      frame(s,kit,R){
        const p=s.p;R.window.style.opacity=p>=2&&p<5?1:0;R.window.setAttribute('width',p>=3?240:114);
        R.fragment.style.opacity=p===2||p===5?.65:0;R.slash.style.opacity=p===5?1:0;
        R.c0.style.opacity=p>=1?1:0;R.c1.style.opacity=p>=5?1:0;
        R.c0.style.transform=`translate(${p>=3?446:p>=2?320:46}px,154px)`;
        R.c1.style.transform=`translate(${p>=6?469:p===5?446:320}px,154px)`;
        R.a.set({tone:p>=1?'cursor':'info'});R.b.set({tone:p>=3?'cursor':'warn'});R.c.set({tone:p>=6?'ok':'info'});
        R.out0.set({show:p>=1});R.out1.set({show:p>=4});R.out2.set({show:p>=7});
        R.note.set(p>=7?'3 records · 0 duplicated':p>=5?'Discard fragment; keep record boundary.':'Ownership follows the record start.');
      }
    },
    bug:[
      step(0,'split planning','Bytes define ranges; records can cross those ranges','The file is assigned two illustrative byte ranges. Line 90 starts before the 128 MB boundary but its newline lies after it. The ruler is scaled for teaching, not drawn to byte accuracy.',0,[{l:'read ranges',v:'2'},{l:'records shown',v:'3'}]),
      step(1,'reader 0 starts','Task 0 owns line 89 and starts line 90','Reader 0 emits line 89 and begins line 90 inside its assigned range. A read partition becomes a task when an action executes the job.',5,[{l:'whole records emitted',v:'1'},{l:'active reader',v:'0'}]),
      step(2,'boundary inside record','A hard stop at 128 MB would leave an incomplete record','The byte boundary lands inside the city name. A reader that decodes only this clipped fragment would corrupt the order. Spark uses a record-aware reader rather than treating a byte boundary as a newline.',1,[{l:'line 90',v:'crosses boundary',cls:'warn'}]),
      step(3,'finish the record','Reader 0 extends past its range to the newline','The blue read window grows across the boundary until line 90 is complete. Owning a record can require reading bytes outside the nominal split; this is not a second copy of the record.',2,[{l:'reader 0',v:'finishes line 90',cls:'ok'}],{moment:true}),
      step(4,'emit once','The full San Francisco order is emitted by task 0','Reader 0 decodes the complete line and emits the order once. Its output contains lines 89 and 90. It does not take over the remaining records in the next range.',2,[{l:'task 0 records',v:'2'},{l:'line 90 emissions',v:'1',cls:'ok'}]),
      step(5,'skip the prefix','Reader 1 discards the leading tail of line 90','Reader 1 starts at the byte boundary. It advances to the newline and discards its partial first record, because reader 0 already emitted the whole record.',3,[{l:'prefix fragments emitted',v:'0',cls:'ok'}]),
      step(6,'find next record','Reader 1 resumes at the next whole record','After skipping the prefix, the green cursor advances to line 91. Newline coordination prevents a split-crossing line from being decoded twice.',3,[{l:'next record',v:'91'},{l:'reader',v:'1'}]),
      step(7,'complete input','Three original records become three complete output rows','Task 0 owns lines 89 and 90; task 1 owns line 91. File formats define safe read units: this text-reader rule is not the layout of a Parquet row group or a restart point inside a gzip stream.',4,[{l:'records emitted',v:'3',cls:'ok'},{l:'duplicates',v:'0',cls:'ok'}],{takeaway:'Byte ranges schedule work. Record boundaries keep data intact: finish your record, skip the other reader’s prefix.'})
    ]
  };

  /* RDD: two conveyor belts, narrow transformations and a recomputation trace. */
  const rdd={id:'rdd',label:'RDD · object conveyor',desc:'Two partitions carry ordinary objects through your functions. An action pulls the recipe, and lineage can rebuild a lost partition.',
    codeLabel:'Scala · RDD',code:{bug:[
      'case class Order(id: Long, city: String, amount: Double)',
      'val orders = sc.textFile("orders/*.csv").map(parseOrder)',
      'val amounts = orders.filter(_.amount >= 40).map(_.amount)',
      '// parseOrder is the application’s CSV-to-Order function',
      'val total = amounts.sum()   // action; toy result = 100.0',
      '// missing partitions can be recomputed from parent lineage'
    ]},
    stage:{w:640,h:420,footer:'Simplified: 3 orders, 2 partitions, narrow operators. Numbers illustrative.',header:s=>({left:'RDD · records are objects; functions are your code',right:s.phase}),
      setup(kit){
        const xs=[76,296,538];
        ['source','filter + map','result'].forEach((v,i)=>txt(kit,xs[i],83,v,'xs b','middle'));
        const recipe=kit.chip(null,{x:174,y:94,w:294,h:27,label:'read → parse → filter → map',small:true});
        [157,238].forEach(y=>{line(kit,44,y,604,y);for(let x=70;x<605;x+=32)line(kit,x,y-4,x,y+4);});
        txt(kit,26,142,'P0','xs b');txt(kit,26,223,'P1','xs b');
        const fn=kit.el('rect',{x:248,y:128,width:96,height:126,rx:8},kit.layer);fn.style.fill=tint('--warn',15);fn.style.stroke='var(--warn)';fn.style.strokeDasharray='5 4';
        txt(kit,296,181,'your code','xs b','middle');txt(kit,296,204,'not SQL','xs','middle');
        const records=[kit.chip(null,{x:48,y:143,w:66,h:28,label:'89 / 10',small:true}),kit.chip(null,{x:126,y:143,w:66,h:28,label:'90 / 40',small:true}),kit.chip(null,{x:48,y:224,w:66,h:28,label:'91 / 60',small:true})];
        const result=kit.chip(null,{x:452,y:290,w:152,h:30,label:'sum = 100',small:true,tone:'ok',show:false});
        const status=txt(kit,28,314,'','sm b');
        const returnPath=kit.el('path',{d:'M590 260 C590 288 76 288 76 262',fill:'none'},kit.layer);returnPath.style.stroke='var(--warn)';returnPath.style.strokeDasharray='5 4';returnPath.style.transition='opacity .35s';
        return {records,recipe,fn,result,status,returnPath};
      },
      frame(s,kit,R){const p=s.p;
        const positions=p<2?[[48,143],[126,143],[48,224]]:p===2?[[192,143],[268,143],[268,224]]:p===5?[[48,143],[482,143],[48,224]]:p===6?[[48,143],[482,143],[268,224]]:[[192,143],[482,143],[482,224]];
        R.records.forEach((r,i)=>r.set({x:positions[i][0],y:positions[i][1],show:i!==0||p<3,label:p>=3&&i>0?i===1?'40':'60':i===0?'89 / 10':i===1?'90 / 40':'91 / 60',tone:i===0&&p===2?'warn':p>=3&&i>0?'ok':'info'}));
        R.recipe.set({tone:p>=2?'cursor':'info'});R.fn.style.strokeWidth=p===2||p===6?3:1.5;R.result.set({show:p===4||p===7});
        R.returnPath.style.opacity=p===5||p===6?1:0;
        R.status.set(p<2?'No action yet · no input records pulled':p===5?'Lost P1: replay its recipe from the source':p===6?'Only the missing partition is being recomputed':p>=4?'Two retained values: 40 + 60 = 100':'An action pulls each partition through your functions');
      }},
    bug:[
      step(0,'partitioned objects','RDD = partitioned records + lineage + your functions','An RDD is a resilient distributed dataset. The picture previews three objects across two partitions; before an action, the source-backed recipe has not pulled these records from storage.',1,[{l:'partitions',v:'2'},{l:'input records pulled',v:'0'}]),
      step(1,'lazy recipe','filter and map describe work; they do not run it yet','The filter and map calls add narrow dependencies to the lineage recipe. The row objects have application-defined fields, but Catalyst does not inspect these arbitrary RDD functions as SQL expressions.',2,[{l:'source reads',v:'0'},{l:'action',v:'not called'}]),
      step(2,'action starts tasks','sum() starts tasks that pull the iterator pipeline','The sum action launches work over the partitions. Each task reads, parses, filters and maps its own iterator; these narrow operations need not materialize a new collection between every function.',4,[{l:'read tasks',v:'2'},{l:'filter',v:'amount >= 40'}]),
      step(3,'functions run','Your filter rejects 10; map exposes amounts 40 and 60','The object with amount 10 fails the predicate. The other two continue as numbers. The application defines what the functions mean; Spark schedules them but cannot rewrite them as named-column SQL.',2,[{l:'retained values',v:'2'},{l:'discarded records',v:'1'}],{moment:true}),
      step(4,'result reduced','The action combines partition results: 40 + 60 = 100','Partition results are combined for the sum, and the driver receives the small scalar result. This does not collect every order object to the driver.',4,[{l:'total',v:'100',cls:'ok'},{l:'driver result',v:'one scalar'}]),
      step(5,'missing partition','A later computation can replay a missing partition','If partition P1 is unavailable when another action needs it, Spark can use lineage to recompute it. The curved path is the recipe replay, not a copy kept magically in memory.',5,[{l:'missing partition',v:'P1',cls:'warn'},{l:'recompute scope',v:'that partition'}]),
      step(6,'lineage replay','P1 rereads its parent and runs the same functions','The missing partition is read again and passed through the filter/map pipeline. Recovery depends on its inputs still being available; lineage is not a backup for a deleted or changed source.',5,[{l:'replayed input',v:'P1'},{l:'output value',v:'60'}]),
      step(7,'resilient recipe','Use an RDD when arbitrary record logic is the main abstraction','The toy computation has the same sum again. Persistence can avoid repeated work, but RDD cache defaults and SQL cache defaults differ; caching is covered in the next chapter.',4,[{l:'total',v:'100',cls:'ok'},{l:'abstraction',v:'objects + functions'}],{takeaway:'RDD: objects on partitioned iterator belts. Transformations record a recipe; an action executes it, lineage enables replay.'})
    ]};

  /* DataFrame: a schema lightbox dims unused columns; a plan folds before execution. */
  const dataframe={id:'dataframe',label:'DataFrame · schema lens',desc:'Named columns expose a query to Catalyst. Watch unused columns dim and filter/projection fold into the planned Parquet scan.',
    codeLabel:'PySpark · DataFrame',code:{bug:[
      'from pyspark.sql import functions as F',
      'df = spark.read.parquet("orders/")',
      'q = df.where(F.col("amount") >= 40).select("city", "amount")',
      'q.explain("formatted")   # inspect planning; not a count action',
      'total = q.agg(F.sum("amount")).first()[0]',
      '# Column pruning / filter pushdown depend on the source and plan'
    ]},
    stage:{w:640,h:420,footer:'Simplified: Parquet query, 3 rows, 2 partitions. Pushdown is source-dependent.',header:s=>({left:'DataFrame · schema gives the optimizer visibility',right:s.phase}),
      setup(kit){
        const widths=[52,119,68,73],x=26,cols=['id:long','city:string','amount','device'];let cursor=x;
        const columns=cols.map((c,i)=>{const g=kit.el('g',null,kit.layer);g.style.transition='opacity .4s';const b=kit.el('rect',{x:cursor,y:112,width:widths[i],height:157,rx:3},g);b.style.fill=tint('--acc2',10);b.style.stroke='var(--line)';txt(kit,cursor+widths[i]/2,132,c,'xs b','middle',g);const out={g,x:cursor,w:widths[i]};cursor+=widths[i];return out;});
        txt(kit,26,83,'SCHEMA + PARTITIONED ROWS','xs b');
        const rows=[['89','Hue','10','web'],['90','San Francisco','40','ios'],['91','Hue','60','web']];
        const rowGroups=rows.map((row,i)=>{const g=kit.el('g',null,kit.layer);g.style.transition='opacity .4s, transform .65s';row.forEach((v,j)=>txt(kit,columns[j].x+columns[j].w/2,168+i*41,v,'xs','middle',g));return g;});
        line(kit,26,232,338,232);txt(kit,27,288,'P0: first two rows · P1: final row','xs mut');
        txt(kit,376,83,'QUERY PLAN','xs b');
        const scan=kit.chip(null,{x:377,y:237,w:235,h:30,label:'Scan Parquet',small:true});
        const filter=kit.chip(null,{x:377,y:174,w:235,h:30,label:'Filter amount >= 40',small:true});
        const project=kit.chip(null,{x:377,y:111,w:235,h:30,label:'Project city, amount',small:true});
        const push=kit.chip(null,{x:377,y:204,w:235,h:28,label:'ReadSchema: city, amount',small:true,show:false,tone:'cursor'});
        const links=[line(kit,494,141,494,174),line(kit,494,204,494,237)];
        const lens=kit.el('rect',{x:76,y:107,width:191,height:166,rx:6,fill:'none'},kit.layer);lens.style.stroke='var(--acc2)';lens.style.strokeWidth=3;lens.style.transition='opacity .4s';
        const total=kit.chip(null,{x:377,y:301,w:235,h:28,label:'sum(amount) = 100',small:true,show:false,tone:'ok'});
        const status=txt(kit,26,327,'','xs b');return {columns,rowGroups,scan,filter,project,push,links,lens,total,status};
      },
      frame(s,kit,R){const p=s.p;
        R.columns.forEach((c,i)=>c.g.style.opacity=p>=3&&(i===0||i===3)?.23:1);
        R.rowGroups.forEach((g,i)=>{g.style.opacity=p>=5&&i===0?.2:1;g.style.transform=p>=5&&i>0?'translate(0px,-8px)':'translate(0px,0px)';[...g.children].forEach((cell,j)=>{cell.style.transition='opacity .4s';cell.style.opacity=p>=3&&(j===0||j===3)?.23:1;});});
        R.lens.style.opacity=p>=3?1:0;R.project.set({tone:p>=2?'cursor':'info'});R.filter.set({tone:p>=2?'cursor':'info',y:p>=4?158:174});
        R.scan.set({y:p>=4?245:237,tone:p>=5?'ok':'info',label:p>=4?'Scan · selected columns':'Scan Parquet'});
        R.push.set({show:p>=4});R.links.forEach(e=>e.style.opacity=p>=4?0:1);R.total.set({show:p>=6});
        R.status.set(p<5?'Defining a query does not materialize all rows':p>=6?'A SQL aggregate returns a small result':'The action reads needed columns and applies the filter');
      }},
    bug:[
      step(0,'schema known','A DataFrame has named columns and a distributed row plan','The schema labels id, city, amount and device. The rows are a preview of the toy Parquet data, not proof that constructing this DataFrame loaded the entire dataset. Source metadata may be read during planning.',1,[{l:'columns',v:'4'},{l:'partitions shown',v:'2'}]),
      step(1,'query described','where and select build a logical query plan','The query asks for city and amount, restricted to amount >= 40. Named column expressions give Spark information about both data structure and requested operations.',2,[{l:'requested columns',v:'2'},{l:'action',v:'not called'}]),
      step(2,'optimizer sees it','Catalyst can reason about these column expressions','The plan exposes Scan, Filter and Project operations rather than an opaque application function. Analysis resolves column names and types; optimization can transform this relational plan.',3,[{l:'plan operators',v:'visible'},{l:'full-data action',v:'none'}]),
      step(3,'column pruning','The schema lens dims id and device: this query does not need them','Projection pruning keeps only the columns needed by this query. With a columnar source such as Parquet, pruning can reduce the columns read. The unused column preview fades to show the requested read schema.',2,[{l:'needed columns',v:'city, amount'},{l:'unused columns',v:'2'}],{moment:true}),
      step(4,'physical scan planned','The scan can receive the required schema and eligible filters','The planned Parquet scan receives selected columns and eligible pushed filters. Pushdown is source- and predicate-dependent, and a residual filter can remain for correctness; it is not a promise to avoid every row containing amount 10.',3,[{l:'source',v:'Parquet'},{l:'read schema',v:'2 columns'}]),
      step(5,'action executes','first() on the aggregate launches execution of the query','The action triggers the physical plan. The displayed low-amount row fails the filter, leaving values 40 and 60. Partition tasks run the plan; a DataFrame is not a pandas table loaded on the driver.',4,[{l:'matching rows',v:'2'},{l:'discarded rows',v:'1'}]),
      step(6,'aggregate returns','The SQL aggregate returns the scalar 100','The distributed aggregate combines values and first() retrieves its one-row result. It does not collect all the original order rows. DataFrame and SQL expressions use the same structured execution engine.',4,[{l:'sum(amount)',v:'100',cls:'ok'},{l:'driver result',v:'one row'}]),
      step(7,'choose structured work','Use a DataFrame when the work is naturally columns and queries','The same orders can be expressed with named columns and optimizable relational operations. Python, Scala, Java and R have DataFrame APIs; missing column names and incompatible schemas are generally checked during analysis, not by Scala case-class field checking.',5,[{l:'abstraction',v:'schema + query'},{l:'typed JVM objects',v:'not required'}],{takeaway:'DataFrame: a schema lens over distributed rows. Column expressions expose a plan; an action executes it.'})
    ]};

  /* Dataset: an encoder gate connects typed JVM objects with Spark SQL rows. */
  const dataset={id:'dataset',label:'Dataset · encoder bridge',desc:'Typed Order objects pass through an encoder bridge. Column expressions stay visible to SQL; a typed lambda runs on decoded objects.',
    codeLabel:'Scala · Dataset[Order]',code:{bug:[
      'case class Order(id: Long, city: String, amount: Double)',
      'import spark.implicits._',
      'val ds = spark.read.parquet("orders/").as[Order]',
      'val kept = ds.filter($"amount" >= 40)',
      'val amounts = kept.map(o => o.amount)  // typed lambda',
      'val total = amounts.reduce(_ + _)     // action; toy sum = 100'
    ]},
    stage:{w:640,h:420,footer:'Simplified: Scala Dataset[Order], product encoder. Python has no typed Dataset.',header:s=>({left:'Dataset[T] · JVM types plus Spark SQL execution',right:s.phase}),
      setup(kit){
        txt(kit,26,84,'JVM OBJECTS: Order','xs b');txt(kit,416,84,'SPARK SQL ROWS','xs b');
        const objects=[kit.chip(null,{x:32,y:115,w:164,h:28,label:'Order(89,Hue,10)',small:true}),kit.chip(null,{x:32,y:166,w:164,h:28,label:'Order(90,SF,40)',small:true}),kit.chip(null,{x:32,y:217,w:164,h:28,label:'Order(91,Hue,60)',small:true})];
        [123,174,225].forEach(y=>line(kit,202,y,606,y));
        const gate=kit.el('path',{d:'M274 105 V260 M274 105 H344 V260 H274',fill:'none'},kit.layer);gate.style.stroke='var(--acc2)';gate.style.strokeWidth=3;
        txt(kit,309,144,'Encoder','sm b','middle');txt(kit,309,179,'Order ↔','xs','middle');txt(kit,309,201,'SQL row','xs','middle');
        const rows=[kit.chip(null,{x:434,y:115,w:164,h:28,label:'89 | Hue | 10',small:true,show:false}),kit.chip(null,{x:434,y:166,w:164,h:28,label:'90 | SF | 40',small:true,show:false}),kit.chip(null,{x:434,y:217,w:164,h:28,label:'91 | Hue | 60',small:true,show:false})];
        const token=kit.chip(null,{x:32,y:280,w:164,h:28,label:'Order(90,SF,40)',small:true,tone:'cursor',show:false});
        const lambda=kit.chip(null,{x:244,y:280,w:158,h:28,label:'o => o.amount',small:true,show:false,tone:'warn'});
        const output=kit.chip(null,{x:434,y:280,w:164,h:28,label:'Dataset[Double]',small:true,show:false,tone:'ok'});
        const note=txt(kit,26,333,'','xs b');return {objects,rows,gate,token,lambda,output,note};
      },
      frame(s,kit,R){const p=s.p;
        R.objects.forEach((o,i)=>o.set({show:p<3||p>=5,tone:p>=5&&i===0?'delete':'info'}));
        R.rows.forEach((r,i)=>r.set({show:p>=2,tone:p>=4&&i===0?'delete':p>=3?'ok':'info',label:i===0?'89 | Hue | 10':i===1?'90 | SF | 40':'91 | Hue | 60'}));
        R.gate.style.strokeWidth=p===1||p===2||p===5?5:3;
        R.token.set({show:(p>=1&&p<=2)||p===5,x:p===1?216:p===2?372:p===5?46:p>=6?434:32,y:p===1||p===2?247:280,label:p>=6?'40 + 60':p===2?'90 | SF | 40':'Order(90,SF,40)',tone:p>=6?'ok':'cursor'});
        R.lambda.set({show:p>=5});R.output.set({show:p>=6,label:p>=7?'sum = 100':'Dataset[Double]'});
        R.note.set(p<3?'Type shape is supplied by Order + its encoder':p<5?'Column predicates are visible to Catalyst':p===5?'Typed lambda: decode objects, run your code, encode result':'Typed code is not automatically an optimizable SQL expression');
      }},
    bug:[
      step(0,'declare a type','Order gives Dataset a JVM type, not a new storage engine','A Scala case class defines the fields of Order. Dataset[Order] provides typed access to those objects while using Spark SQL’s structured execution machinery. The diagram separates the object view from the SQL-row view.',0,[{l:'JVM element type',v:'Order'},{l:'execution engine',v:'Spark SQL'}]),
      step(1,'encoder available','The encoder knows how Order maps to SQL-compatible fields','spark.implicits supplies the product encoder for this case class. The encoder bridge maps its fields between JVM objects and Spark SQL’s internal representation; it is not simply an arbitrary Python serializer.',1,[{l:'encoder',v:'product'},{l:'language',v:'Scala'}]),
      step(2,'typed view of rows','as[Order] checks the schema-to-type mapping; it does not collect','The Parquet DataFrame is viewed as Dataset[Order] using its encoder. This conversion describes a typed distributed computation, not a transfer of all rows to the driver or a new copy written to storage.',2,[{l:'API',v:'Dataset[Order]'},{l:'driver collection',v:'none'}]),
      step(3,'relational predicate','A column filter can stay inside the relational query plan','The filter uses a Spark Column expression, so it remains visible to Catalyst. This differs from ds.filter(o => o.amount >= 40), whose arbitrary JVM lambda is not exposed as the same relational predicate.',3,[{l:'filter form',v:'Column expression'},{l:'optimizer visibility',v:'yes'}]),
      step(4,'row selection','The column predicate retains orders with amounts 40 and 60','The toy rows with amounts 40 and 60 are retained. The distributed data is still lazy before an action; this frame previews the eventual result of the typed query.',3,[{l:'matching orders',v:'2'},{l:'amount 10',v:'filtered out'}]),
      step(5,'typed lambda boundary','map(o => o.amount) operates on decoded Order objects','The typed map needs JVM Order objects. Spark decodes rows through the encoder, invokes the lambda and encodes its results. Compile-time field access helps application code, but Catalyst cannot see arbitrary function internals.',4,[{l:'function input',v:'Order'},{l:'function output',v:'Double'}],{moment:true}),
      step(6,'encode typed output','The map result is another typed Dataset: Dataset[Double]','The object mapping yields a distributed Dataset[Double]. It is not a guarantee of less serialization or faster execution than equivalent built-in DataFrame expressions; object boundaries can add work.',4,[{l:'output type',v:'Double'},{l:'total before action',v:'not materialized'}]),
      step(7,'action and language','reduce executes the typed recipe and returns the scalar 100','The reduce action combines the two amounts and returns 100. Scala and Java expose typed Dataset APIs; PySpark offers DataFrames and RDDs, not Dataset[T]. In Scala, DataFrame is an alias for Dataset[Row].',5,[{l:'sum',v:'100',cls:'ok'},{l:'typed Dataset',v:'Scala / Java'}],{takeaway:'Dataset[T]: JVM types cross an encoder bridge to SQL rows. Typed lambdas add object work; column expressions expose the plan.'})
    ]};
  const original=window.COURSE.chapters[0];
  window.CHAPTER_OVERRIDES=window.CHAPTER_OVERRIDES||{};
  window.CHAPTER_OVERRIDES[0]={
    title:'Read Source & APIs',
    problem:original.problem+'<p>First follow one order across a split boundary. Then compare how RDD, DataFrame and Dataset describe work over the same distributed records.</p>',
    explain:`
<h3>1. A byte boundary is not a record boundary</h3>
<p>The original production problem is a report with missing or damaged orders after a reader cuts files at arbitrary byte offsets. The redesigned scene draws a scaled strip of <b>uncompressed, newline-delimited text</b>. Line 90 crosses the 128 MB boundary. A record-aware reader finishes that record on the first side, while the next reader discards its leading fragment before decoding the next record. Line 90 is emitted once, complete.</p>
<p>The safe unit depends on the format. Text readers coordinate around delimiters; Parquet uses its columnar file structure. A single gzip stream cannot normally be restarted at an arbitrary compressed byte offset, so more executors cannot create more independent reads of that one file. The existing gzip example remains available in this chapter.</p>
<figure class="mm" style="--diagram-width:520.14px" aria-label="Flowchart: a text reader coordinates record boundaries around a byte split">
 <img src="diagrams/ch00-record-boundaries.svg" alt="Two readers at one byte boundary: reader zero finishes and emits the crossing record; reader one skips its leading fragment, then emits the next whole record.">
 <figcaption>Read ranges divide work; record boundaries preserve complete records.</figcaption>
</figure>

<h3>2. A file split, a partition and a task are related</h3>
<p>For Spark SQL file reads, <code>spark.sql.files.maxPartitionBytes</code> defaults to 134217728 bytes in Spark 3.5. File pieces are packed into read partitions, and a task processes a partition in a read stage. A partition may contain pieces from multiple small files; it is not always one physical file or one split. The estimated <code>spark.sql.files.openCostInBytes</code>, 4194304 bytes by default, influences that packing.</p>
<p>Listing and opening files still cost time, even after packing reduces the task count. A directory with millions of small files can keep the driver busy before tasks run. Compare listing time, input size and read-stage task count. These file-source settings do not directly configure the partitions of an RDD created with <code>sc.textFile</code>.</p>

<h3>3. RDD: partitioned objects and a recipe</h3>
<p><b>RDD</b> means resilient distributed dataset. Its partitioned records can be strings, tuples or application objects. Transformations such as <code>filter</code> and <code>map</code> describe dependencies and functions; an action such as <code>sum</code> executes the recipe. Narrow operations can form an iterator pipeline within one task instead of copying the entire dataset at each call.</p>
<p>The conveyor scene keeps orders with amounts 40 and 60, then sums them to 100. The code owns the meaning of parsing and filtering. Catalyst does not turn arbitrary RDD functions into a relational query. If a partition is unavailable when it is needed, parent lineage can recompute it, provided the inputs remain available. Persistence can reuse computed data, but lineage is not a backup for a deleted source.</p>

<h3>4. DataFrame: a schema and a visible query</h3>
<p>A <b>DataFrame</b> is distributed data with named, typed columns and a structured query plan. It is not a pandas table sitting in driver memory. Expressions such as <code>where(col("amount") &gt;= 40)</code> expose the requested operation to Spark SQL. Catalyst analyzes names and types, optimizes the logical query and selects a physical plan.</p>
<p>The schema-lens scene uses Parquet to make projection pruning concrete: a query needing city and amount can avoid reading unused columns. Eligible filters may also be pushed to the source, while a residual filter can remain. This depends on the source and predicate; it does not mean every file format can avoid reading every rejected row. <code>explain("formatted")</code> inspects the plan; the later aggregate action computes the data. Planning may still read metadata, and schema inference may read source data.</p>

<h3>5. Dataset: typed JVM code crosses an encoder</h3>
<p>A <b>Dataset[T]</b> combines Spark SQL execution with a JVM element type. A Scala <code>Order</code> case class gives application code checked field access. An <b>encoder</b> maps between those objects and Spark SQL’s internal row representation. <code>as[Order]</code> establishes that mapping; it does not collect all rows or write a new copy.</p>
<p>Column expressions on a Dataset remain visible to the relational optimizer. A typed lambda such as <code>map(o =&gt; o.amount)</code> instead operates on decoded objects and encodes its output; arbitrary function internals are opaque to Catalyst. Typed code can be useful without being faster than equivalent built-in column expressions. Scala and Java have typed Dataset APIs; Python and R do not. In Scala, DataFrame is an alias for <code>Dataset[Row]</code>; Java represents it as <code>Dataset&lt;Row&gt;</code>.</p>
<figure class="mm" style="--diagram-width:620.00px" aria-label="Flowchart: RDD functions and structured DataFrame or Dataset plans reach partition tasks">
 <img src="diagrams/ch00-api-paths.svg" alt="RDD objects use application functions and lineage. DataFrames expose schema and column expressions to Spark SQL. Typed Datasets bridge JVM objects and SQL rows with encoders. Actions execute their distributed plans.">
 <figcaption>Choose the representation of the work; all three still execute distributed tasks.</figcaption>
</figure>

<h3>6. Diagnose the boundary that actually failed</h3>
<p>A damaged record boundary is a reader problem, not a reason to switch from DataFrame to Dataset. A bad column name is a schema/query problem; a wrong typed field is a JVM-code problem. A slow opaque function can need different treatment from a source scan that reads unnecessary columns. Inspect the relevant boundary before changing APIs.</p>
<p>For malformed CSV or JSON, <code>PERMISSIVE</code> behavior depends on the reader, schema and malformed content; it can retain null fields or a corrupt-record column. Do not assume every malformed row becomes entirely null. Use an explicit schema, a quarantine column or <code>FAILFAST</code> as appropriate, and reconcile source counts and valid outputs. The original small-file, gzip and malformed-record diagnoses below remain the production checks for this chapter.</p>
<p>Source mapping: the original Read Source chapter supplies splits, record ownership, small-file costs and decode failures. API details extend it using the <a href="https://spark.apache.org/docs/3.5.6/rdd-programming-guide.html" target="_blank" rel="noopener">Spark 3.5 RDD guide</a>, <a href="https://spark.apache.org/docs/3.5.6/sql-programming-guide.html" target="_blank" rel="noopener">DataFrame and Dataset guide</a> and <a href="https://spark.apache.org/docs/3.5.6/sql-performance-tuning.html" target="_blank" rel="noopener">file-source tuning reference</a>. The pictures use illustrative records and timings.</p>`,
    scenarios:[byteCut,rdd,dataframe,dataset,original.scenarios.find(s=>s.id==='gzip-one-task')]
  };
})();

/* The remaining source case gets a compression-specific picture too. */
(function(){
 const {text,rect,line,path,dot,move,show,stage,scenario}=SparkScene;
 const gzip=scenario('gzip-one-task','gzip · one stream or several','One continuous compressed reel needs sequential decode. Several independent gzip files can use separate readers.',[
  'orders = spark.read.json("one-large-file.json.gz")','# Ordinary gzip is not splittable at arbitrary compressed offsets.','# More executors cannot create independent reads inside that stream.','orders = spark.read.json("shards/*.json.gz")','# Independent reasonably sized files allow multiple readers.','# Columnar formats such as Parquet offer different safe read units.'
 ],stage('gzip · stream state, not just available cores','Simplified: ordinary gzip; file sizes and reader count illustrative.',k=>{
  text(k,26,87,'ONE COMPRESSED STREAM','xs b');
  const reel=SparkScene.group(k);for(let i=0;i<4;i++){const c=k.el('circle',{cx:0,cy:0,r:15+i*10,fill:'none'},reel);c.style.stroke='var(--warn)';c.style.strokeWidth=2;}text(k,0,4,'.gz','sm b','middle',reel);move(reel,79,153);
  path(k,'M124 154 H246','--warn');const reader=k.chip(null,{x:246,y:133,w:128,h:35,label:'sequential decode',small:true,tone:'warn'});
  path(k,'M374 151 H599','--ok');text(k,596,121,'whole records','xs','end');
  const idle=[0,1,2].map(i=>k.chip(null,{x:418+i*67,y:181,w:62,h:22,label:'idle slot',small:true,tone:'mut'}));
  text(k,26,232,'INDEPENDENT COMPRESSED FILES','xs b');
  const shards=[0,1,2].map(i=>{const g=SparkScene.group(k);const c=k.el('circle',{cx:0,cy:0,r:19,fill:'none'},g);c.style.stroke='var(--acc2)';c.style.strokeWidth=2;text(k,0,3,'.gz','xs b','middle',g);move(g,62+i*198,275);line(k,83+i*198,275,192+i*198,275);return g;});
  const workers=[0,1,2].map(i=>k.chip(null,{x:95+i*198,y:260,w:93,h:29,label:'reader '+i,small:true,tone:'ok'}));
  const scan=dot(k,'--warn');const packets=[0,1,2].map(()=>dot(k,'--ok'));return {reel,reader,idle,shards,workers,scan,packets};
 },(s,k,r)=>{const p=s.p;move(r.scan,[130,154,192,348,579,579,579,579][p],153,p<5);
  r.reader.set({tone:p>=4?'ok':'warn'});r.idle.forEach(c=>c.set({show:p>=2&&p<5}));r.shards.forEach(g=>show(g,p>=5));r.workers.forEach(c=>c.set({show:p>=5}));r.packets.forEach((g,i)=>move(g,(p>=7?186:86)+i*198,302,p>=6));
 }),[
  ['stream state','A gzip reader needs the compressed stream decoding state','The concentric reel represents one ordinary gzip stream. Arbitrary compressed byte offsets are not independent record-reader starting positions.',1,[['streams','1']]],
  ['sequential decode','The reader advances through that stream sequentially','Decompression produces bytes that can then be decoded into complete records. A byte split in the compressed input cannot simply create another independent task.',1,[['source readers','1']]],
  ['more slots','Extra executor slots do not make this stream splittable','The grey slots show capacity the source read cannot use. Other stages may use more partitions later, but they do not accelerate the initial single-stream read.',2,[['read parallelism','still 1','warn']]],
  ['records emerge','The reader emits records after decompressing their bytes','The moving cursor follows the stream to the decoded output. Record boundaries and compression restart points are different concerns.',0,[['decode','sequential']]],
  ['format boundary','A later repartition cannot undo the sequential source read','Repartitioning after reading can parallelize downstream work and costs an exchange. It does not create independent starting offsets inside the original stream.',2,[['source limitation','unchanged']]],
  ['independent files','Several gzip files have independent decoding state','Reasonably sized source shards allow separate readers. The picture uses three streams; actual file packing and source partitions depend on planning.',3,[['independent streams','3']]],
  ['parallel readers','Different tasks can decompress those streams concurrently','The green dots now have three independent paths. Avoid replacing one giant file with millions of tiny files whose listing and opening costs dominate.',4,[['readers shown','3','ok']]],
  ['choose safe units','Choose a format and file layout with useful read units','Parquet has format-defined columnar read structure rather than this text-gzip rule. Inspect source task count, input sizes and compression before adding executors.',5,[['check','format + source tasks']],'Source read parallelism comes from independent safe read units, not the number of idle cores.']
 ]);
 window.CHAPTER_OVERRIDES[0].scenarios=window.CHAPTER_OVERRIDES[0].scenarios.map(s=>s.id==='gzip-one-task'?gzip:s);
})();
