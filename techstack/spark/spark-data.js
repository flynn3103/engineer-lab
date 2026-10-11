/* Builds CourseData for the course framework (assets/course) from the Spark course data that already exists:
 *   engine-curriculum.js   per-feature problem, starting point and component contracts
 *   engine-sysdesign.js    goal, scope, spec, estimate, high-level design, use cases (merged with engine-stories.js)
 *   engine-visuals.js      painters and per-step scene state for 48 use cases
 * Nothing is rewritten here: this file only maps those shapes onto the framework contract and escapes plain text.
 * The 19 use cases with their own interactive simulation (read, pack, map, tree, compare, pipeline, lineage, stage) keep their
 * modules: the page gets a host element and config.afterRender mounts them. */
(function (root) {
  'use strict';
  const SD = root.SparkSystemDesign, C = root.SparkCurriculum, V = root.SparkVisuals, esc = SD.esc, D = SD.data;
  const chap = id => C.chapters.find(c => c.id === id);
  const ids = SD.order.filter(id => id !== 'architecture');
  const strip = t => t.replace(/^UC-\d+ · /, '');
  const cell = r => r.map(esc);
  const A = D.architecture, cA = chap('architecture');
  const CD = root.CourseData = root.CourseData || {};
  CD.uc = {}; CD.hld = {}; CD.diagrams = {}; CD.PAINT = {};

  CD.config = {
    id: 'spark', name: 'Apache Spark', version: '3.5', root: '../../', brand: 'var(--acc2)',
    footer: 'A finite batch engine model grounded in Spark 3.5. Capacity numbers are stated assumptions, not measurements. Real transport, disk I/O and transactional table storage are extension boundaries.',
    afterRender(page) { ['SparkReadSim', 'SparkPack', 'SparkMap', 'SparkTree', 'SparkCompare', 'SparkPipe', 'SparkLineage', 'SparkStageSim'].forEach(m => { if (root[m]) root[m].mount(page); }); }
  };
  CD.spec = {
    title: 'Design a distributed batch engine', navTitle: 'Distributed batch engine',
    lead: esc(A.goal) + ' This page is the whole system on one screen. Each feature below zooms into one subsystem.',
    problemLead: esc(cA.problem), inherited: esc(cA.inherited), goal: esc(A.goal), scope: A.scope.map(esc),
    fr: A.fr.map(esc), nfr: A.nfr, contracts: cA.contracts.map(cell),
    est: A.est.rows.map(cell), estAssume: esc(A.est.assume), estNote: esc(A.est.note),
    hldNote: esc(A.hld.caption), decisions: A.hld.decisions.map(cell),
    verify: [
      'Facts were written from knowledge of Spark 3.5. Web searches in the build environment returned mostly secondary sources, so this course has not been checked against Spark\'s source or its configuration page.',
      'Defaults to check against the Spark configuration page for your version: <code>spark.locality.wait</code> (3s), <code>spark.task.maxFailures</code> (4), <code>spark.shuffle.sort.bypassMergeThreshold</code> (200), <code>spark.shuffle.readHostLocalDisk</code> (true), <code>spark.shuffle.io.maxRetries</code> (3) and <code>retryWait</code> (5s), <code>spark.sql.shuffle.partitions</code> (200), <code>spark.sql.autoBroadcastJoinThreshold</code> (10 MB), <code>spark.scheduler.listenerbus.eventqueue.capacity</code> (10000), <code>spark.ui.retainedStages</code> (1000), <code>spark.excludeOnFailure.enabled</code> (off).',
      'Numbers in the estimates and pictures are stated assumptions or examples, not measurements.'
    ]
  };
  CD.hldOverall = A.hld.src;

  CD.features = ids.map(id => {
    const d = D[id], c = chap(id);
    CD.hld[id] = d.hld.src;
    return { id, tag: d.tag, name: d.name, summary: esc(d.summary), goal: esc(d.goal), scope: d.scope.map(esc), fr: d.fr.map(esc), nfr: d.nfr,
      decisions: d.hld.decisions.map(cell), hldCaption: esc(d.hld.caption), problem: esc(c.problem), inherited: esc(c.inherited), contracts: c.contracts.map(cell) };
  });

  /* One framework painter per visual kind. The Spark painters write HTML into a stage element and return the stat line. */
  const painter = kind => s => {
    const [id, n] = s.key.split(':'), sim = D[id].uc[n - 1].sim, st = { innerHTML: '' };
    const stat = V.PAINT[kind](st, sim, s.k);
    return { html: '<div class="rs vz"><div class="vz-stage">' + st.innerHTML + '</div></div>', stat: stat ? esc(stat) : '', bare: true };
  };

  ids.forEach(id => {
    CD.uc[id] = D[id].uc.map((u, i) => {
      const n = i + 1, key = id + ':' + n, sim = u.sim;
      CD.diagrams[key] = (u.diagrams || []).map(g => ({ kind: g.kind, title: g.title || g.kind, src: g.src }));
      const out = {
        title: strip(u.title), blurb: u.blurb ? esc(u.blurb) : '', intro: esc(u.intro), trigger: esc(u.trigger), run: u.command || '', expect: u.expect ? esc(u.expect) : '',
        edges: (u.edges || []).map((e, k) => typeof e === 'string' ? { t: 'Edge case ' + (k + 1), ctx: esc(e), fix: 'See the steps above.' } : { t: e.title, short: esc(e.short), ctx: esc(e.context), fix: esc(e.solution) }),
        invariant: u.invariant ? esc(u.invariant) : ''
      };
      if (V.DATA[key]) {
        out.kind = sim.kind;
        out.steps = sim.steps.map((s, k) => ({ t: s.title, x: esc(s.text), s: { key, k } }));
        if (!CD.PAINT[sim.kind]) CD.PAINT[sim.kind] = painter(sim.kind);
      } else {
        out.custom = '<div class="readsim" ' + (typeof sim === 'string' ? 'data-sim="' + esc(sim) + '"' : 'data-sim="' + esc(sim.kind) + '" data-f="' + id + '" data-n="' + n + '"') + '></div>';
      }
      return out;
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
