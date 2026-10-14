// Verify a course that uses the engineer-lab Spark layout. Run from techstack/spark: node check.js
// Prints: use-case count, repeated picture kinds (should be none), and any step that fails to paint.
const V=require(process.cwd()+"/engine-visuals.js"); const SD=require(process.cwd()+"/engine-sysdesign.js");
const all=[]; for(const id of SD.order){const d=SD.data[id]; (d.uc||[]).forEach((u,i)=>all.push([id+":"+(i+1), u.sim? (u.sim.kind||"story"):"none"]));}
const ks=all.map(x=>x[1]); const rep=[...new Set(ks.filter((k,i)=>ks.indexOf(k)!==i))];
console.log("use cases", all.length, "repeated kinds:", rep.join(",")||"none", "non-bespoke:", all.filter(x=>x[1]==="story"||x[1]==="none").map(x=>x[0]).join(" ")||"none");
let n=0,bad=[]; for (const key of Object.keys(V.DATA)) { const [id,i]=key.split(":"); const sim=SD.data[id].uc[i-1].sim; for(let k=0;k<sim.steps.length;k++){ try{ const st={innerHTML:""}; const s=V.PAINT[sim.kind](st,sim,k); if(!s||!st.innerHTML) bad.push(key+" "+(k+1)); n++;}catch(e){bad.push(key+" "+(k+1)+" "+e.message);} } }
console.log("painted", n, "problems:", bad.join("; ")||"none");
