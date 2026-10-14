# Skill-set course template

Use this when the subject is a **skill** (backend engineer, product management, data analyst) and not a **tool** (Spark, Kafka). A tool course is organised around a system's features and use cases. A skill course is organised around competencies, lessons and artifacts, because a skill is learned by doing a technique on a case and checking the result, not by tracing a data path.

## Tool-set course versus skill-set course
| | Tool set (Spark, Kafka) | Skill set (backend engineer) |
| --- | --- | --- |
| Unit of the course | Feature, then use case | Module, then lesson |
| Question it answers | How is this system built and why? | How do I do this well, and know I did? |
| Facts pinned to | A version and its source files | Canonical references (papers, books, standards, manuals) |
| Worked example | A run of the system, drawn step by step | One running scenario shared by every lesson |
| Ends with | An invariant | A checklist and an artifact |
| Engine | `course.js` (`Course.mount`, `CourseData`) | `skillset.js` (`Course.mountSkill`, `SkillData`) |
| Routes | `#/f/N/u/M` | `#/m/N/l/M` |

## Shape of the output
```
Overview (role)               what the role does, who the course is for, outcomes, prerequisites
Mindset                       the habits of a reviewer: [habit, what it means, the question you ask]
Competency map                every module; unwritten ones are marked planned, never hidden
Running scenario              ONE invented scenario every lesson builds on (numbers are labelled examples)
Plugin gate                   per module: the artifact you bring, and what the agent does with it
Module  (5 to 9 lessons)      goal, competencies, lesson list, the artifact you leave with, what the agent does
  Lesson                      why, the idea (+ terms), worked example (+ diagram), technique (3-7 steps), common mistakes (2-3),
                              what a reviewer asks (3-5 questions and red flags), practice with a model answer, checklist (3-7 items), artifact, what the agent does, sources
How the content was checked   sources, what was run, what is an example, what is not yet verified
```

## Design rules
1. **Artifact first.** Decide the artifact each module produces (a data model document, an architecture decision record) before writing lessons. Every lesson contributes one section of it. The checklist items are the checks a reviewer, or the plugin agent, will apply.
2. **One running scenario.** Pick one domain the reader can hold in their head. Each lesson adds a piece, so lesson 5 builds on lesson 2's model.
3. **Technique is steps, not prose.** 3 to 7 single-move steps in order. If a step needs "and then", split it.
4. **Mistakes come from practice.** 2 or 3 per lesson: what goes wrong (a concrete situation) and what to do instead.
5. **Practice has a model answer.** The prompt is a small variation on the scenario. The answer explains the reasoning, not only the result.
6. **One persona agent, one skill per module.** The plugin has a single agent that carries the role's persona and mindset (module 01 is its voice), and each module maps to a skill the agent loads when a task matches. Set `config.plugin.persona` and give each module a `skillName` (kebab-case, for example `data-modeling`). Skills hold the procedures and checklists, the agent holds the judgment.
7. **Plugin hook.** Every lesson and module says what the plugin agent asks for and checks. This is how the course becomes the prerequisite for the plugin: the agent's steps are the lessons' checklists.
8. **Cite canonical sources by name.** Paper, standard or book chapter, or the manual page of a tool. Label anything else an example or an assumption. Never invent a reference.
9. **Write for the reviewer.** When the course prepares people to review an agent, each lesson carries 3 to 5 reviewer questions, the last one a red flag. The question is something to put to the agent, with the evidence a good answer would contain.
10. **Plan honestly.** List modules you have not written as `planned`. A page may not link to a lesson that does not exist.

## Data files
```
skillset/<role>/
  course.html                   loads contract.js, the data files, course.js, skillset.js; ends with Course.mountSkill(SkillData)
  spec.js                       SkillData.config, spec, modules
  lessons-<module>.js           SkillData.lessons['<moduleId>'] = [ lesson, ... ]
  diagrams-<module>.js          SkillData.diagrams['<moduleId>:<n>'] = [ { kind, title, src } ]
```
```js
SkillData.config  = { id, name, role, root, brand?, plugin: { name, agent, persona? }, related: [{ href, title, sub }] };
SkillData.spec    = { title, navTitle, lead, overview: [what, how], audience: [], outcomes: [], prerequisites: [],
                      mindset: [[habit, meaning, reviewer question]],
                      scenario: { title, body }, gate: [[module, evidence you bring, what the agent does]], verify: [] };
SkillData.modules = [{ id, tag, name, status: 'ready' | 'planned', summary,
                       goal, competencies: [], artifact, agent, skillName? }];            // goal..agent required when ready
SkillData.lessons['<moduleId>'] = [{ title, short, why, concept: [html], terms: [[term, meaning]],
                       example: { setup, body: [html], table?: { head, rows } },
                       technique: [{ t, x }], mistakes: [{ t, ctx, fix }], review: [question or red flag],
                       exercise: { prompt, answer },
                       checklist: [text], artifact, agent, src }];
SkillData.diagrams['<moduleId>:<lessonNo>'] = [{ kind: 'Flow' | 'ER' | 'Sequence' | 'State', title, src }];  // at least one per lesson
```
Mermaid diagrams: `erDiagram` for data, `flowchart` for decisions and levels, `sequenceDiagram` for protocols and migrations, `stateDiagram-v2` for lifecycles. No semicolons or hash signs in labels (the validator lints this).

## Commands
```
node tools/course/check.js skillset/<role>/course.html     # contract: modules, lessons, diagrams, checklists, Mermaid lint
node tools/course/browse.js skillset/<role>/course.html    # browser pass: every route, both themes, phone width, every diagram drawn
```

## Export the course as plugin skills
Once modules are `ready` and each has `skillName` and `skillDescription`, generate the plugin's skills from the course so the course stays the single source:
```
node .claude/skills/learn-from-scratch/scripts/export-plugin-skills.js skillset/<role>/course.html <plugin>/skills [--only id,id]
```
Each module becomes `<skillName>/SKILL.md` (when to use, output, procedure, checklist, review questions and red flags). Add `--with-references` to also write `references/lessons.md` (the full lessons with diagrams); it is off by default so the skill stays small. Do not hand-edit the output; change the course and re-export. The agent file (the persona) is written by hand. Validate with `claude plugin validate <plugin>`.

## Curriculum layout first
A course can ship as a **layout** before any lesson is written: every module has `status: 'planned'`, an `outline` (3 to 8 lesson titles) and an `artifact`. The overview then shows a curriculum table of the whole course. Write modules one at a time and flip each to `ready` when its lessons, diagrams and review questions pass `check.js`. Eight layouts exist (`skillset/ui-ux-design`, `frontend-engineer`, `devops`, `qa-qc`, `product-management`, `data-engineer`, `data-analytics`, `data-science`) as templates. Every role gets module 01, "Mindset and review method", first, because the reader is a reviewer of agent output.

## Steps to build one
1. Name the role and its modules. Mark which are `ready` and which `planned`. State the artifact of the first module.
2. Choose the running scenario and the plugin name and agent name.
3. Write the module: 5 to 9 lessons, each with the parts above. Order them so each builds on the last.
4. Draw 1 or 2 diagrams per lesson. Check them with `check.js`, then draw them in the browser with `browse.js`.
5. Verify the content against the cited sources. Run any code or SQL you show if you can, and say plainly when you only read it against documentation.
6. Fill `spec.gate`: for each module, the evidence a learner brings and what the plugin agent does with it.
7. Report: lessons written, sources used, what was run and what was only read, what is planned, what is unverified.

## Quality rules
- Every number is an invented example and says so, or comes from a cited source.
- A lesson is complete or it is not shipped. No lesson with a missing exercise, answer or checklist.
- Do not claim a rule is universal when it is a convention. Say "most teams" or name the engine.
- Review the artifact like a reviewer would: could someone else build from it?
