/* SX: shared primitives for the database course chapters. Chapters use these; they do not edit them.
   Every chapter file defines its own PG.<key>(root, A) and prefixes its own CSS classes. */
(function () {
  const SX = {};
  SX.sec = (title, ...kids) => h('section', { class: 'sx-sec' }, h('h2', {}, title), ...kids);
  SX.para = html => h('p', { class: 'sx-p', html });
  SX.chip = (t, cls) => h('span', { class: 'sx-chip ' + (cls || '') }, t);
  SX.stat = (l, v) => h('div', { class: 'sx-stat' }, h('small', {}, l), h('b', {}, String(v)));
  /* a timeline: Play, Step and Reset, one sentence per state, and the visual drawn for that state */
/* a timeline: Play, Step and Reset, one sentence per state, and the visual drawn for that state */
SX.stepper = function (states, draw) {
  let k = 0;
  const vis = h('div', { class: 'sx-vis' }), txt = h('p', { class: 'sx-txt' }), cnt = h('small', { class: 'sx-cnt' });
  const paint = () => { const s = states[k]; vis.replaceChildren(...draw(s)); txt.textContent = s.t; cnt.textContent = 'Step ' + k + ' of ' + (states.length - 1); };
  const play = player({ speed: 1400, step() { if (k >= states.length - 1) return false; k++; paint(); return k < states.length - 1; }, reset() { k = 0; paint(); } });
  paint();
  return h('div', { class: 'sx-step' }, play, h('div', { class: 'sx-line' }, cnt, txt), vis);
}
  /* tabs of problems; each problem has a demo(mode) that takes 'bad' or 'good' and returns an element */
SX.problems = function (PROBLEMS) {
  const box = h('div', { class: 'sx-prob' });
  const tabs = h('div', { class: 'sx-tabs' });
  let cur = 0;
  const show = i => {
    cur = i;
    [...tabs.children].forEach((b, j) => b.classList.toggle('on', j === i));
    const P = PROBLEMS[i];
    let mode = 'bad';
    const demoBox = h('div', { class: 'sx-demo' });
    const paintDemo = () => { stopTimers(); demoBox.replaceChildren(P.demo(mode)); };
    const sw = seg([{ v: 'bad', l: 'Failure' }, { v: 'good', l: 'After fix' }], 'bad', v => { mode = v; paintDemo(); });
    box.replaceChildren(
      h('h3', {}, P.tab),
      SX.para('<b>Failure:</b> ' + P.sym),
      SX.para('<b>Why:</b> ' + P.why),
      h('pre', { class: 'sx-log' }, h('code', {}, P.log)),
      sw, demoBox,
      h('p', { class: 'sx-p' }, h('b', {}, 'How to fix')),
      h('ol', { class: 'sx-fix', html: P.fix.map(f => '<li>' + f + '</li>').join('') }));
    paintDemo();
  };
  PROBLEMS.forEach((P, i) => tabs.append(h('button', { class: 'ctab', onclick: () => show(i) }, P.tab)));
  show(0);
  return h('div', {}, tabs, box);
}
  /* inject a chapter's own CSS once, keyed by id */
  SX.css = function (id, text) {
    if (document.getElementById(id)) return;
    const st = document.createElement('style'); st.id = id; st.textContent = text; document.head.appendChild(st);
  };
  window.SX = SX;
})();
