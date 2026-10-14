# Templates for each level

## Overview
- What the system is, in two sentences.
- Who plans, who executes, who moves the bytes. One diagram.

## Problem statement
```
Scenario:   one production situation with numbers (e.g. "a 2 TB table, 400 executors, one dies mid-job")
Naive:      the obvious design
Fails when: the exact condition (data loss, hot spot, unbounded memory) and its size
Principle:  the one idea the real design rests on, in two sentences
```

## Requirements
```
Functional (verbs):   Track executors and their free slots. Offer slots and launch tasks. ...
Non-functional:       Bounded: in-flight fetch bytes are capped. Correct: result equals the no-shuffle answer.
In scope / out of scope
```

## Estimation (assumptions, not measurements)
| Question | Calculation | Implication |
| --- | --- | --- |

## High-level design
- A flow diagram of components and the data path.
- Decisions: `question | choice | trade-off`, 2 to 4 rows.

## Feature
```
Name, tag, one-line summary
Goal, scope (in / out)
Functional requirements, non-functional requirements
High-level design (diagram + decisions)
Use cases (3 to 6)
```

## Use-case card
```
Title:        UC-0N · short verb phrase
Intro:        one or two sentences, plain words
Trigger:      the situation that starts it (one paragraph)
Run:          a command or config line, with the default marked ("# 3s is the default")
Expect:       the result, in one sentence
Diagram:      one sequence, state or flow diagram (Mermaid)
Steps:        5 to 7 steps, each { title, text }; one move per step
Picture:      one form from the visual catalog; per step, the full state of the scene
Edge cases:   2 cards, each { title, short, Context, Solution }
Invariant:    what must always hold
```

## Data shape (course framework)
Full contract: `../framework/assets/course/README.md`. Short form, one global assembled from small files:
```js
// spec.js
CourseData.config   = { id, name, version, root: '../../../', related: [{ href, title, sub }] };
CourseData.spec     = { title, navTitle, lead, overview: [what, who], problem: [scenario, naive, fails, principle],
                        fr: [], nfr: [], out, est: [[question, calculation, implication]], hldNote, decisions: [[q, choice, trade-off]], verify: [] };
CourseData.features = [{ id, tag, name, summary, goal, scope: [[in], [out]], fr: [], nfr: [], decisions: [[q, choice, trade-off]] }];
// uc-*.js
CourseData.uc.<featureId> = [{ title, short, intro, trigger, run, expect, kind, steps: [{ t, x, s, stat }], edges: [{ t, ctx, fix }], invariant, src }];
// diagrams.js
CourseData.hldOverall = 'flowchart ...';  CourseData.hld = { <featureId>: 'flowchart ...' };
CourseData.diagrams = { '<featureId>:<n>': [{ kind: 'Sequence'|'State'|'Flow', title, src }] };
// paint.js
CourseData.PAINT = { <kind>: (state, step) => html };   // one painter per use case, built from Course.kit
```
`steps[].s` is the whole scene for that step, and the painter for `kind` draws it. `uc.src` names the file and version a fact came from.

## Mermaid conventions
- Feature and overall high-level design: `flowchart LR` or `TD`, 5 to 9 nodes, labels in quotes, `<br/>` for line breaks.
- Protocol or message flow: `sequenceDiagram` with named participants; lost messages as `--x`.
- Lifecycle: `stateDiagram-v2`, transitions labelled with the trigger.
- Decision: `flowchart TD` with `{"question"}` diamonds (long labels are wrapped by the engine).
- No semicolons or hash signs inside labels.
