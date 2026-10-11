/* Course data contract and validator.
 *
 * A course page defines ONE global, CourseData, from several small files (see assets/course/README.md):
 *   CourseData.config      { id, name, version, root, brand?, related?, skillLink? }
 *   CourseData.spec        { title, lead, overview[2], problem[4], fr[], nfr[], out, est[][3], hldNote, decisions[][3], verify[] }
 *   CourseData.hldOverall  Mermaid source for the whole system
 *   CourseData.features    [{ id, tag, name, summary, goal, scope:[[in],[out]], fr[], nfr[], decisions[][3] }]
 *   CourseData.hld         { <featureId>: Mermaid source }
 *   CourseData.uc          { <featureId>: [ useCase ] }
 *   CourseData.diagrams    { '<featureId>:<n>': [ { kind, title, src } ] }   (n starts at 1)
 *   CourseData.PAINT       { <kind>: (state, step) => html }
 * useCase = { title, short, intro, trigger, run, expect, kind, steps:[{ t, x, s, stat }], edges:[{ t, ctx, fix }], invariant, src }
 *
 * Course.validate(data) returns { errors, warnings, stats }. Errors break the page or the method; warnings are advice.
 * It paints every step in Node (no DOM) and fails on exceptions, "undefined", "NaN" or "[object". */
(function (root) {
  'use strict';
  const Course = root.Course = root.Course || {};
  const HEADS = /^\s*(flowchart|graph|sequenceDiagram|stateDiagram(-v2)?|classDiagram|erDiagram|gantt|journey|pie)\b/;

  function lintMermaid(src, where, out) {
    if (!HEADS.test(src)) out.push(where + ': Mermaid source must start with a diagram type (flowchart, sequenceDiagram, stateDiagram-v2, ...)');
    src.split('\n').forEach((line, i) => {
      if (/^\s*%%/.test(line)) return;
      if (/;/.test(line) && !/^\s*(style|classDef|class)\b/.test(line)) out.push(where + ' line ' + (i + 1) + ': a semicolon ends a Mermaid statement, remove it from labels');
      if (/#/.test(line) && !/#\d+;|#[a-z]+;/i.test(line)) out.push(where + ' line ' + (i + 1) + ': a hash sign breaks a Mermaid label, reword it');
    });
  }

  function validate(data, opts) {
    opts = opts || {};
    const errors = [], warnings = [];
    const err = m => errors.push(m), warn = m => warnings.push(m);
    const need = (obj, keys, where) => keys.forEach(k => { if (obj == null || obj[k] == null || obj[k] === '' || (Array.isArray(obj[k]) && !obj[k].length)) err(where + ' is missing "' + k + '"'); });
    if (!data) { err('CourseData is not defined'); return { errors, warnings, stats: {} }; }
    need(data, ['config', 'spec', 'features', 'uc', 'hld', 'hldOverall', 'diagrams', 'PAINT'], 'CourseData');
    if (errors.length) return { errors, warnings, stats: {} };
    need(data.config, ['id', 'name', 'version', 'root'], 'config');
    need(data.spec, ['title', 'lead', 'fr', 'nfr', 'est', 'hldNote', 'decisions'], 'spec');
    if (!data.spec.problem && !data.spec.problemLead) err('spec needs problem (4 rows) or problemLead (a paragraph)');
    if (data.spec.overview && data.spec.overview.length !== 2) err('spec.overview needs 2 paragraphs (what it is, who does what)');
    if (data.spec.problem && data.spec.problem.length !== 4) err('spec.problem needs 4 rows: scenario, naive design, fails when, principle');
    if (!data.spec.verify) warn('spec.verify is missing: add how the facts were checked');
    if (!data.spec.out && !data.spec.scope) warn('spec has no out-of-scope statement');
    (data.spec.est || []).forEach((r, i) => { if (!Array.isArray(r) || r.length !== 3) err('spec.est[' + i + '] must be [question, calculation, implication]'); });
    (data.spec.decisions || []).forEach((r, i) => { if (!Array.isArray(r) || r.length !== 3) err('spec.decisions[' + i + '] must be [decision, choice, trade-off]'); });
    if ((data.spec.decisions || []).length < 2 || (data.spec.decisions || []).length > 4) warn('spec.decisions: record 2 to 4 decisions');
    if (/\bassum/i.test(JSON.stringify(data.spec.est || '')) === false) warn('spec.est: label the estimates as assumptions somewhere');
    lintMermaid(data.hldOverall || '', 'hldOverall', errors);

    const kinds = {}, ids = new Set();
    let ucTotal = 0, steps = 0, diagrams = 1, customUc = 0;
    if (data.features.length < 8 || data.features.length > 15) warn('features: the method asks for 8 to 15, found ' + data.features.length);
    data.features.forEach((f, fi) => {
      const w = 'feature ' + (f && f.id);
      need(f, ['id', 'tag', 'name', 'summary', 'goal', 'scope', 'fr', 'nfr', 'decisions'], w);
      if (ids.has(f.id)) err(w + ' is duplicated'); ids.add(f.id);
      if (!f.scope || (Array.isArray(f.scope[0]) && f.scope.length !== 2)) err(w + ': scope must be [[in scope], [out of scope]] or a list of strings');
      (f.decisions || []).forEach((r, i) => { if (!Array.isArray(r) || r.length !== 3) err(w + ' decisions[' + i + '] must have 3 columns'); });
      if (!data.hld[f.id]) err(w + ' has no high-level-design diagram in hld'); else { lintMermaid(data.hld[f.id], w + ' hld', errors); diagrams++; }
      const list = data.uc[f.id];
      if (!list || !list.length) { err(w + ' has no use cases'); return; }
      if (list.length < 3 || list.length > 6) warn(w + ' has ' + list.length + ' use cases, the method asks for 3 to 6 (a single capstone is fine)');
      list.forEach((u, i) => {
        const id = f.id + ':' + (i + 1);
        ucTotal++;
        need(u, u.animation ? ['title', 'intro', 'trigger', 'animation', 'edges'] : u.custom ? ['title', 'intro', 'trigger', 'custom', 'edges'] : ['title', 'intro', 'trigger', 'kind', 'steps', 'edges'], 'use case ' + id);
        ['run', 'expect', 'invariant'].forEach(k => { if (!u.custom && !u.animation && !u[k]) warn('use case ' + id + ' has no "' + k + '" (the method asks for one)'); });
        if (!u.src) warn('use case ' + id + ' has no sources line');
        if (u.edges && u.edges.length !== 2) warn('use case ' + id + ' has ' + u.edges.length + ' edge cases, the method asks for 2');
        (u.edges || []).forEach((x, k) => need(x, ['t', 'ctx', 'fix'], 'use case ' + id + ' edge ' + (k + 1)));
        if (u.custom || u.animation) {
          if (u.animation) {
            if (!Course.validateAnimation) err('use case ' + id + ': animation runtime is not loaded');
            else Course.validateAnimation(u.animation).forEach(message => err('use case ' + id + ': ' + message));
          }
          const dsc = data.diagrams[id];
          if (!dsc || !dsc.length) err('use case ' + id + ' has no diagram'); else dsc.forEach((d, k) => { diagrams++; need(d, ['kind', 'title', 'src'], 'diagram ' + id + '#' + (k + 1)); lintMermaid(d.src || '', 'diagram ' + id + '#' + (k + 1), errors); });
          customUc++;
          return;
        }
        if (u.steps && (u.steps.length < 5 || u.steps.length > 7)) warn('use case ' + id + ' has ' + u.steps.length + ' steps, the method asks for 5 to 7');
        if (kinds[u.kind]) err('use case ' + id + ' repeats picture form "' + u.kind + '" (already used by ' + kinds[u.kind] + ')'); else kinds[u.kind] = id;
        const paint = data.PAINT[u.kind];
        if (!paint) { err('use case ' + id + ' uses picture form "' + u.kind + '" but PAINT has no such painter'); return; }
        (u.steps || []).forEach((s, k) => {
          steps++;
          if (!s.t || !s.x) err('use case ' + id + ' step ' + (k + 1) + ' needs a title (t) and text (x)');
          if (/\band then\b/i.test(s.x || '')) warn('use case ' + id + ' step ' + (k + 1) + ' says "and then": a step is one move, split it');
          try {
            const r = paint(s.s, s), html = r && typeof r === 'object' ? r.html : r;
            if (typeof html !== 'string' || html.length < 20) err('use case ' + id + ' step ' + (k + 1) + ' painted nothing');
            else if (/undefined|NaN|\[object/.test(html)) err('use case ' + id + ' step ' + (k + 1) + ' painted "' + (html.match(/.{0,30}(undefined|NaN|\[object).{0,30}/) || [''])[0] + '"');
          } catch (x) { err('use case ' + id + ' step ' + (k + 1) + ' threw: ' + x.message); }
        });
        const ds = data.diagrams[id];
        if (!ds || !ds.length) err('use case ' + id + ' has no diagram'); else ds.forEach((d, k) => { diagrams++; need(d, ['kind', 'title', 'src'], 'diagram ' + id + '#' + (k + 1)); lintMermaid(d.src || '', 'diagram ' + id + '#' + (k + 1), errors); });
      });
    });
    const todo = JSON.stringify([data.config, data.spec, data.features, data.uc, data.hld, data.hldOverall, data.diagrams]).match(/TODO/g);
    if (todo) warn('placeholders: ' + todo.length + ' TODO marker(s) are still in the content');
    Object.keys(data.PAINT).forEach(k => { if (!kinds[k]) warn('painter "' + k + '" is not used by any use case'); });
    Object.keys(data.uc).forEach(k => { if (!ids.has(k)) err('uc has entries for unknown feature "' + k + '"'); });
    Object.keys(data.hld).forEach(k => { if (!ids.has(k)) err('hld has an entry for unknown feature "' + k + '"'); });
    Object.keys(data.diagrams).forEach(k => { const [f, n] = k.split(':'); if (!data.uc[f] || !data.uc[f][n - 1]) err('diagrams has an entry for unknown use case "' + k + '"'); });
    return { errors, warnings, stats: { features: data.features.length, useCases: ucTotal, steps, forms: Object.keys(kinds).length, diagrams, custom: customUc } };
  }

  Course.validate = validate;
  if (typeof module === 'object' && module.exports) module.exports = Course;
})(typeof globalThis !== 'undefined' ? globalThis : this);
