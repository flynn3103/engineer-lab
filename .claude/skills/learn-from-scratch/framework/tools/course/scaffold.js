#!/usr/bin/env node
/* Start a new system-design course page on the course framework.
 *   node tools/course/scaffold.js <id> "<Name>" <version> [outDir]
 *   node tools/course/scaffold.js kafka "Apache Kafka" 3.7           -> techstack/kafka/design/
 * Writes design.html (loads assets/course/*), spec.js, uc-1.js, diagrams.js and paint.js with one feature and one use case.
 * The stub already passes tools/course/check.js (with TODO warnings) and runs in the browser. Run it from the repo root. */
const fs = require('fs'), path = require('path');
const [id, name, version, outArg] = process.argv.slice(2);
if (!id || !name || !version) { console.error('usage: node scaffold.js <id> "<Name>" <version> [outDir]'); process.exit(2); }
const out = outArg || path.join('techstack', id, 'design');
if (fs.existsSync(path.join(out, 'design.html'))) { console.error(out + '/design.html already exists, refusing to overwrite'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const root = path.relative(out, '.').split(path.sep).join('/') + '/', up = root;
const w = (f, s) => fs.writeFileSync(path.join(out, f), s);
w('design.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design ${name} as a system · ${name}</title>
<meta name="description" content="TODO: one sentence on what the reader learns.">
<link rel="stylesheet" href="${up}assets/lab.css">
<link rel="stylesheet" href="${up}assets/curriculum.css">
<link rel="stylesheet" href="${up}assets/course/course.css">
</head>
<body>
<div id="app"></div>
<noscript><p>This course needs JavaScript for its diagrams and pictures.</p></noscript>
<script src="${up}assets/course/kit.js"></script>
<script src="${up}assets/course/contract.js"></script>
<script src="spec.js"></script>
<script src="uc-1.js"></script>
<script src="diagrams.js"></script>
<script src="paint.js"></script>
<script src="${up}assets/course/course.js"></script>
<script>Course.mount(CourseData);</script>
</body>
</html>
`);
w('spec.js', `/* Spec for the ${name} system-design course. Facts target ${name} ${version}: pin every default to a source (see the skill's research-and-verify.md). */
window.CourseData = window.CourseData || { uc: {} };
CourseData.config = { id: '${id}', name: '${name}', version: '${version}', root: '${root}', related: [] };
CourseData.spec = {
  version: '${version}',
  title: 'Design ${name} as a system',
  navTitle: 'TODO short title',
  lead: 'TODO: two sentences. The scenario, then what the reader will be able to explain.',
  overview: ['<b>What it is.</b> TODO: two sentences.', '<b>Who does what.</b> TODO: who plans, who executes, who moves the data.'],
  problem: [
    ['<b>Scenario</b>', 'TODO: one production situation with numbers (label them as examples).'],
    ['<b>Naive design</b>', 'TODO: the obvious design.'],
    ['<b>Fails when</b>', 'TODO: the exact condition and its size.'],
    ['<b>Principle</b>', 'TODO: the one idea the real design rests on, in two sentences.']
  ],
  fr: ['TODO: a verb the system must do.'],
  nfr: ['<b>TODO name:</b> a bound you could test.'],
  out: 'TODO: what this course does not cover.',
  est: [['TODO question', 'TODO calculation (assumptions stated)', 'TODO implication']],
  hldNote: 'Select a box to open that feature.',
  decisions: [['TODO decision?', 'TODO choice', 'TODO trade-off.'], ['TODO decision 2?', 'TODO choice', 'TODO trade-off.']],
  verify: ['TODO: which sources the defaults were read from, and which claims are examples or assumptions.']
};
CourseData.features = [
  { id: 'first', tag: 'first feature', name: 'TODO first feature', summary: 'TODO one line.', goal: 'TODO goal.', scope: [['TODO in scope'], ['TODO out of scope']],
    fr: ['TODO'], nfr: ['TODO'], decisions: [['TODO?', 'TODO', 'TODO.']] }
];
`);
w('uc-1.js', `/* Use cases, one array per feature id. Step state is the WHOLE scene (see paint.js), so Back and Restart need no replay. */
(function () {
  const S = (t, x, s, stat) => ({ t, x, s, stat });
  const E = (t, ctx, fix) => ({ t, ctx, fix });
  CourseData.uc.first = [
    {
      title: 'TODO use case title', short: 'todo', kind: 'demo',
      intro: 'TODO: one or two plain sentences.',
      trigger: 'TODO: the situation that starts it.',
      run: '# TODO: a command or config line, with the default marked',
      expect: 'TODO: the result, in one sentence.',
      steps: [
        S('Start', 'TODO: one move.', { n: 1 }, 'n = 1'),
        S('Second', 'TODO: one move.', { n: 2 }, 'n = 2'),
        S('Third', 'TODO: one move.', { n: 3 }, 'n = 3'),
        S('Fourth', 'TODO: one move.', { n: 4 }, 'n = 4'),
        S('Fifth', 'TODO: one move.', { n: 5 }, 'n = 5')
      ],
      edges: [E('TODO edge one', 'TODO context.', 'TODO solution.'), E('TODO edge two', 'TODO context.', 'TODO solution.')],
      invariant: 'TODO: what must always hold.',
      src: 'TODO: official doc or source file, version.'
    }
  ];
})();
`);
w('diagrams.js', `/* Mermaid diagrams. Keep labels free of semicolons and hash signs. Kinds: Sequence, State, Flow. */
(function () {
  const D = (kind, title, src) => ({ kind, title, src });
  CourseData.hldOverall = \`flowchart LR
  A["TODO input"] --> B["TODO component"] --> C["TODO output"]\`;
  CourseData.hld = { first: \`flowchart LR
  A["TODO"] --> B["TODO"]\` };
  CourseData.diagrams = {
    'first:1': [D('Sequence', 'TODO title', \`sequenceDiagram
  participant A as TODO A
  participant B as TODO B
  A->>B: TODO message
  B-->>A: TODO reply\`)]
  };
})();
`);
w('paint.js', `/* Pictures: one form per use case, built from Course.kit. A painter is (state, step) => html and paints the whole scene.
 * Pick the form from references/visual-catalog.md; never reuse a form inside one course. */
(function () {
  const { cells, cap, chip, note } = Course.kit;
  CourseData.PAINT = {
    demo: s => cap('TODO: what the boxes mean.') + cells(Array.from({ length: 5 }, (_, i) => ['' + (i + 1), i < s.n ? 'ok' : 'dim'])) + note(chip('n = ' + s.n))
  };
})();
`);
console.log('created ' + out + '\nnext:  node tools/course/check.js ' + path.join(out, 'design.html') + '\n       node tools/course/browse.js ' + path.join(out, 'design.html'));
