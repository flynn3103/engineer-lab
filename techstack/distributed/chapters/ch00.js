/* Chapter 1: a static chart, because this lesson compares capacity, not event order. */
(function () {
  const capacity = {
    id:'capacity', label:'Find the limiting resource', presentation:'static',
    desc:'Read the bars against the database limit. All capacities are illustrative, with one write per checkout.',
    codeLabel:'Toy model', code:{bug:['app capacity = servers × 100 requests/s','database capacity = 150 writes/s','checkout ceiling = min(app capacity, database capacity)']},
    stage:{w:640,h:420,footer:'Illustrative upper bounds; one write per checkout, no additional costs.',
      header:() => ({left:'Capacity comparison',right:'no time axis'}),
      setup(kit) {
        const X=n=>150+n;
        [1,2,4].forEach((n,i)=> {
          const y=112+i*72;
          DK.cap(kit,18,y+14,n+' app server'+(n>1?'s':''),'sm b');
          DK.rule(kit,X(0),y+8,X(n*100),y+8,{tone:'acc',w:16});
          DK.rule(kit,X(0),y+34,X(Math.min(n*100,150)),y+34,{tone:'ok',w:16});
          DK.cap(kit,X(n*100)+8,y+12,n*100+' app / s','xs');
          DK.cap(kit,X(Math.min(n*100,150))+8,y+38,Math.min(n*100,150)+' checkout / s','xs');
        });
        DK.rule(kit,X(150),86,X(150),304,{tone:'warn',dash:'4 4'});
        DK.cap(kit,300,76,'DB limit: 150 writes / s','sm b','middle');
        DK.cap(kit,320,336,'More callers do not raise the shared database limit.','sm b','middle');
        return {};
      },frame() {}
    },
    bug:[{log:'Compare the purple application-capacity bars with the green completed-checkout ceilings. The dashed line is the shared database limit. Four app servers can offer 400 requests/s, but this model still completes at most 150 checkouts/s.',code:2,state:{},callout:'Locate the limit before choosing what to add.',takeaway:'More machines help only the work they divide.'}]
  };
  window.CHAPTER_OVERRIDES=window.CHAPTER_OVERRIDES||{};
  window.CHAPTER_OVERRIDES[0]={scenarios:[capacity]};
})();
