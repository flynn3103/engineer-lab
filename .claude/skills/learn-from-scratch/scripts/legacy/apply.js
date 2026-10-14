// Splice new use cases into the engineer-lab Spark course. Run from techstack/spark. Specific to that layout: adapt the anchors for another course.
// usage: node apply.js <feature> <dir>   where dir has uc.js, st.js, data.js, painters.js, css.txt, paint.txt
const fs = require('fs'); const path = require('path');
const [feat, dir] = process.argv.slice(2);
const rd = f => fs.readFileSync(path.join(dir, f), 'utf8');
const TS = process.cwd();
// 1. sysdesign: append uc entries to D.<feat>.uc
let sd = fs.readFileSync(path.join(TS, 'engine-sysdesign.js'), 'utf8');
const start = sd.indexOf(`  D.${feat} = {`); if (start < 0) throw new Error('no D.' + feat);
const j = sd.indexOf('\n    ],\n    hard:', start); if (j < 0) throw new Error('no uc end for ' + feat);
sd = sd.slice(0, j).replace(/[\s,]+$/, '') + ',\n' + rd('uc.js').replace(/[\s,]+$/, '') + sd.slice(j);
fs.writeFileSync(path.join(TS, 'engine-sysdesign.js'), sd);
// 2. stories: insert ST entries before the export line
let st = fs.readFileSync(path.join(TS, 'engine-stories.js'), 'utf8');
const sa = '  root.SparkStories = ST;'; if (st.split(sa).length !== 2) throw new Error('stories anchor');
st = st.replace(sa, rd('st.js') + sa); fs.writeFileSync(path.join(TS, 'engine-stories.js'), st);
// 3. visuals: data entries, painters, PAINT keys, css
let vz = fs.readFileSync(path.join(TS, 'engine-visuals.js'), 'utf8');
const d0 = vz.indexOf('const DATA = {'); const d1 = vz.indexOf('\n  };', d0); if (d0 < 0 || d1 < 0) throw new Error('DATA end');
vz = vz.slice(0, d1).replace(/[\s,]+$/, '') + ',\n' + rd('data.js').replace(/[\s,]+$/, '') + vz.slice(d1);
const pa = '  const PAINT = {'; if (vz.split(pa).length !== 2) throw new Error('paint anchor');
vz = vz.replace(pa, rd('painters.js') + pa);
const pk = 'explode: paintExplode'; if (vz.split(pk).length !== 2) throw new Error('paint key anchor');
vz = vz.replace(pk, pk + ', ' + rd('paint.txt').trim());
fs.writeFileSync(path.join(TS, 'engine-visuals.js'), vz);
fs.appendFileSync(path.join(TS, 'engine-visuals.css'), '\n' + rd('css.txt'));
console.log('applied', feat);
