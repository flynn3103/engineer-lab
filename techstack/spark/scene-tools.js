/* Spark-only drawing primitives. Chapters own their geometry and transitions. */
(function () {
  const T='transform .65s cubic-bezier(.3,.7,.2,1), opacity .35s';
  const text=(k,x,y,t,cls='sm',anchor='start',parent=k.layer)=>k.text(parent,{x,y,t,cls,anchor});
  const tint=(v,n=18)=>`color-mix(in srgb,var(${v}) ${n}%,var(--card))`;
  const rect=(k,x,y,w,h,color='--acc',parent=k.layer)=>{const r=k.el('rect',{x,y,width:w,height:h,rx:7},parent);r.style.fill=tint(color);r.style.stroke=`var(${color})`;r.style.strokeWidth=1.5;return r;};
  const line=(k,x1,y1,x2,y2,color='--mut',parent=k.layer)=>{const r=k.el('line',{x1,y1,x2,y2},parent);r.style.stroke=`var(${color})`;r.style.strokeWidth=1.5;r.style.transition='opacity .35s';return r;};
  const path=(k,d,color='--mut',parent=k.layer)=>{const r=k.el('path',{d,fill:'none'},parent);r.style.stroke=`var(${color})`;r.style.strokeWidth=1.5;r.style.transition='opacity .35s';return r;};
  const group=k=>{const g=k.el('g',null,k.layer);g.style.transition=T;return g;};
  const move=(g,x,y,show=true)=>{g.style.transform=`translate(${x}px,${y}px)`;g.style.opacity=show?1:0;};
  const dot=(k,color='--acc2',r=5)=>{const g=group(k),c=k.el('circle',{cx:0,cy:0,r},g);c.style.fill=`var(${color})`;return g;};
  const show=(el,on)=>{el.style.opacity=on?1:0;};
  const stage=(left,footer,setup,frame)=>({w:640,h:420,header:s=>({left,right:s.phase}),footer,setup,frame});
  const steps=items=>items.map((a,p)=>({state:{p,phase:a[0]},callout:a[1],log:a[2],code:a[3]||0,stats:(a[4]||[]).map(([l,v,cls])=>({l,v,cls:cls||''})),...(p===items.length-1?{takeaway:a[5]||a[1]}:{}),...(a[6]?{moment:true}:{})}));
  const scenario=(id,label,desc,code,drawing,items,codeLabel='PySpark / mechanism')=>({id,label,desc,codeLabel,code:{bug:code},stage:drawing,bug:steps(items)});
  const register=(i,scenarios,explain,extra={})=>{window.CHAPTER_OVERRIDES=window.CHAPTER_OVERRIDES||{};window.CHAPTER_OVERRIDES[i]={scenarios,explain,...extra};};
  window.SparkScene={T,text,tint,rect,line,path,group,move,dot,show,stage,scenario,register};
})();
