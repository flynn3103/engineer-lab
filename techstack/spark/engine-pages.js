/* HTML for the three page kinds: overview, feature, use case. Pure functions of data, so Node can render them too. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./engine-sysdesign.js') : root.SparkSystemDesign);
  if (node) module.exports = api; else root.SparkPages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (SD) {
  'use strict';
  const { esc, table, list, diagram, data: D, order } = SD;
  const TONES = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const tone = i => `var(--${TONES[i % TONES.length]})`;
  const features = () => order.filter(id => id !== 'architecture');
  const number = id => String(features().indexOf(id) + 1).padStart(2, '0');
  const section = (id, n, title, body, sub) => `<section class="sec" id="${id}"><h2><span>${n}</span>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${body}</section>`;
  const chips = items => `<div class="chips">${items.map(c => `<span>${esc(c)}</span>`).join('')}</div>`;
  const jump = items => `<nav class="jump" aria-label="On this page">${items.map(([id, label]) => `<a href="#${id}" data-jump>${label}</a>`).join('')}</nav>`;

  /* Sketchy, pastel card in the same style as the Tech Stack catalog. */
  function featureCard(id, href) {
    const d = D[id], i = features().indexOf(id);
    return `<a class="ccard" href="${href({ chapter: id })}"><div class="art" style="--p:${tone(i)}"><svg viewBox="0 0 200 90" aria-hidden="true"><rect x="22" y="22" width="156" height="46" rx="10" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/><text x="100" y="52" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="17" font-weight="700" fill="var(--ink)">${esc(d.tag)}</text></svg><span class="flag">${number(id)}</span></div><div class="body"><h3>${esc(d.name)}</h3><p>${esc(d.summary)}</p><div class="chips"><span>${d.uc.length} use case${d.uc.length > 1 ? 's' : ''}</span></div></div></a>`;
  }
  const firstSentence = t => t.length <= 100 ? t : (t.match(/^.*?[.!?](\s|$)/) || [t])[0].trim();
  function useCaseCards(id, href) {
    const d = D[id];
    return `<div class="ucgrid">${d.uc.map((u, i) => {
      const tags = [...new Set([...u.diagrams.map(g => g.kind.toLowerCase()), ...(u.sim ? ['animation'] : [])])];
      return `<a class="uccard" href="${href({ chapter: id, uc: i + 1 })}"><span class="ucn">UC-${String(i + 1).padStart(2, '0')}</span><h3>${esc(u.title.replace(/^UC-\d+ · /, ''))}</h3><p>${esc(u.blurb || firstSentence(u.intro))}</p><div class="chips">${tags.map(k => `<span>${esc(k)}</span>`).join('')}</div><b class="go">Go deeper →</b></a>`;
    }).join('')}</div>`;
  }

  /* Estimation lives on the overview only. Features carry problem, spec, design and use cases. */
  function designDoc(id, chapter, href, opts) {
    const d = D[id], ov = id === 'architecture';
    const parts = [['problem', 'Problem statement', () => `<p class="lead-problem">${esc(chapter.problem)}</p><p><b>Starting point.</b> ${esc(chapter.inherited)}</p><div class="two"><div><h3>Goal</h3><p>${esc(d.goal)}</p></div><div><h3>Scope</h3>${list(d.scope.map(esc))}</div></div>`],
      ['spec', 'Functional and non-functional spec', () => `<div class="two"><div><h3>Functional requirements</h3>${list(d.fr.map(esc))}</div><div><h3>Non-functional requirements</h3>${list(d.nfr)}</div></div><h3>Component contracts</h3>${table(['Component', 'Interface', 'Guarantee'], chapter.contracts.map(c => c.map(esc)))}`]];
    if (ov) parts.push(['estimate', 'Back-of-the-envelope estimation', () => `<p class="assume"><b>Assumptions.</b> ${esc(d.est.assume)}</p>${table(['Question', 'Calculation', 'Implication'], d.est.rows.map(r => r.map(esc)))}<p class="note"><b>Reading the numbers.</b> ${esc(d.est.note)}</p>`]);
    parts.push(['hld', 'High-level design', () => `${diagram({ kind: 'Flowchart', title: 'Components and flows', src: d.hld.src }, true)}<p class="caption">${esc(d.hld.caption)}</p>${table(['Decision', 'Choice', 'Trade-off'], d.hld.decisions.map(r => r.map(esc)))}`]);
    if (d.uc.length) parts.push(['usecases', 'Use cases', () => useCaseCards(id, href), 'Pick one to see how it works, step by step.']);
    const nav = parts.map(([k, t]) => [k, k === 'hld' ? 'High-level design' : t.split(' ')[0] === 'Back-of-the-envelope' ? 'Estimation' : t.split(' ')[0] === 'Problem' ? 'Problem' : t.split(' ')[0] === 'Functional' ? 'Spec' : t]);
    if (opts.features) nav.push(['features', 'Features']);
    return { count: parts.length, html: `${opts.features ? jump(nav) : ''}${parts.map(([k, t, body, sub], i) => section(k, String(i + 1).padStart(2, '0'), t, body(), sub)).join('')}` };
  }

  function overview(chapter, href) {
    const d = D.architecture, doc = designDoc('architecture', chapter, href, { features: true });
    return `<header class="page-head"><p class="kick">OVERVIEW · SYSTEM DESIGN</p><h1>Design a distributed batch engine</h1><p class="lead">${esc(d.goal)} This page is the whole system on one screen. Each feature below zooms into one subsystem.</p>${chips(['14 features', `${features().reduce((n, f) => n + D[f].uc.length, 0)} use cases`])}</header>
    ${doc.html}
    ${section('features', String(doc.count + 1).padStart(2, '0'), 'Features', `<div class="cgrid">${features().map(f => featureCard(f, href)).join('')}</div>`, 'Pick a feature to see its own spec, estimates, design and use cases.')}`;
  }

  function feature(chapter, href, labHTML) {
    const id = chapter.id, d = D[id], doc = designDoc(id, chapter, href, {}), i = features().indexOf(id), prev = features()[i - 1], next = features()[i + 1];
    return `<header class="page-head"><p class="kick">FEATURE ${number(id)} · ${esc(d.tag.toUpperCase())}</p><h1>${esc(d.name)}</h1></header>
    ${doc.html}
    <nav class="pager" aria-label="Previous and next feature"><a href="${href({ chapter: prev || 'architecture' })}"><small>${prev ? 'PREVIOUS FEATURE' : 'BACK TO'}</small><b>← ${esc(prev ? D[prev].name : 'Overview')}</b></a>${next ? `<a class="next" href="${href({ chapter: next })}"><small>NEXT FEATURE</small><b>${esc(D[next].name)} →</b></a>` : ''}</nav>`;
  }

  function useCase(chapter, n, href) {
    const id = chapter.id, d = D[id], u = d.uc[n - 1];
    const prev = d.uc[n - 2], next = d.uc[n];
    const parent = { chapter: id };
    return `<header class="page-head"><p class="kick">FEATURE ${number(id)} · USE CASE ${String(n).padStart(2, '0')}</p><h1>${esc(u.title.replace(/^UC-\d+ · /, ''))}</h1></header>
    ${section('trigger', '01', 'Trigger', `<p class="lead-problem">${esc(u.trigger)}</p>${u.command ? `<div class="cmd"><span>Run</span><code>${esc(u.command)}</code></div>` : ''}${u.expect ? `<p class="expect"><b>Expect.</b> ${esc(u.expect)}</p>` : ''}`)}
    ${section('flow', '02', 'Diagrams', u.diagrams.map(g => diagram(g, true)).join(''))}
    ${u.sim ? section('steps', '03', 'Step by step', `<div class="readsim" ${typeof u.sim === 'string' ? `data-sim="${esc(u.sim)}"` : `data-sim="${u.sim.kind}" data-f="${id}" data-n="${n}"`}></div>`, 'Press Next step to walk through it one move at a time.') : section('steps', '03', 'Step by step', `<ol class="steps">${u.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`)}
    ${section('edges', '04', 'Edge cases and failure modes', `<div class="edges">${u.edges.map((e, i) => typeof e === 'string' ? `<div class="edge">${esc(e)}</div>` : `<details class="edgecard"><summary><span class="en">${i + 1}</span><span class="et"><b>${esc(e.title)}</b><small>${esc(e.short)}</small></span><span class="ex" aria-hidden="true"></span></summary><div class="eb"><div><h4>Context</h4><p>${esc(e.context)}</p></div><div><h4>Solution</h4><p>${esc(e.solution)}</p></div></div></details>`).join('')}</div>`)}
    ${u.sim ? '' : section('rule', '05', 'Invariant', `<div class="invariant"><b>Must always hold</b><p>${esc(u.invariant)}</p></div>`)}
    <nav class="pager" aria-label="Use cases"><a href="${href(prev ? { chapter: id, uc: n - 1 } : parent)}"><small>${prev ? 'PREVIOUS USE CASE' : 'BACK TO'}</small><b>← ${esc(prev ? prev.title.replace(/^UC-\d+ · /, '') : d.name)}</b></a>${next ? `<a class="next" href="${href({ chapter: id, uc: n + 1 })}"><small>NEXT USE CASE</small><b>${esc(next.title.replace(/^UC-\d+ · /, ''))} →</b></a>` : `<a class="next" href="${href(parent)}"><small>BACK TO</small><b>${esc(d.name)} →</b></a>`}</nav>`;
  }

  return { overview, feature, useCase, features, number, tone };
});
