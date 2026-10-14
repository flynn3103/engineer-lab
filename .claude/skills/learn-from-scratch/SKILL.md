---
name: learn-from-scratch
description: Research a subject from zero and build it as an interactive course in one consistent style, in one of two modes. Tool-set mode (Spark, Kafka, Redis) builds a system-design course: overview, problem, requirements, estimates, high-level design, 8 to 15 features with 3 to 6 use cases each, Mermaid diagrams and step-by-step pictures, facts pinned to a version's source. Skill-set mode (backend engineer, product management) builds a competency course: role overview, competency map, modules of lessons with a running scenario, technique, mistakes, practice, checklist and an artifact, linked to the plugin agent that will check it. Ships the framework (style, page engines, picture kit, validator, scaffolder, browser checker). Use when asked to "learn X from scratch", "explain X as a system", "build a course for the Y skill set", "add a module or lesson", "add use cases to a feature", or to build or extend an interactive learning course.
metadata:
  tags: research, learning, course, system-design, skill-set, documentation, visualization, framework
---

# Learn from scratch (tool-set and skill-set courses)

Turn an unfamiliar subject into a course someone can learn it from, top-down: what problem it solves, what it must do, how it is built, then each feature and each use case of that feature. The pages come from one framework, so every course looks and behaves the same.

Worked examples: `references/redis-case-study.md` (the current method and the mistakes to avoid), `references/spark-case-study.md` (the first course: 14 features, 67 use cases) and `references/migrating-a-course.md` (how Spark was moved onto the framework). Both courses run on the same framework. For a single-system write-up with a rebuild plan, use `internals-deep-dive` instead.

## Pick the mode first
| The subject is... | Mode | Engine and layout | Read |
| --- | --- | --- | --- |
| A tool or system (Spark, Kafka, Redis, Postgres) | **Tool set** | `course.js`: features, use cases | the rest of this file |
| A skill or role (backend engineer, product management) | **Skill set** | `skillset.js`: modules, lessons, artifacts | `references/skillset-template.md`, then Quality rules below |

A skill-set course can link to tool-set courses where a choice depends on the engine (a data-modeling lesson links to the Postgres, Scylla and Redis courses). If you cannot tell, ask which one the learner needs: "how it works inside" is a tool set, "how to do it well" is a skill set. The numbered steps below describe the tool-set flow; for a skill set follow "Steps to build one" in the template.

## When to use
- "Build a course for the <role> skill set", "add a module or lesson", "what does the plugin expect from this module".
- "Learn / explain / design X from scratch", where X is a database, engine, scheduler, framework or protocol.
- "Apply the skill to X", "research more use cases for feature F", "do the next feature".
- Extending an interactive learning site with a page per feature and per use case.

## The shape of the output
```
Overview                     what it is, and who plans, who executes, who moves the data
Problem statement            one production scenario with numbers, the naive design, when it fails, the principle
Spec                         functional (verbs) and non-functional (bounds you can test), out of scope
Estimation                   back-of-envelope, assumptions stated, never presented as measurements
High-level design            ONE Mermaid flowchart, plus 2 to 4 decisions with trade-offs
Features (8 to 15)           one subsystem each: goal, scope, FR, NFR, a Mermaid flowchart, decisions
  Use cases (3 to 6 each)    trigger, run, expect, 1-2 Mermaid diagrams, 5-7 steps with a picture, 2 edge cases, invariant, sources
Capstone                     one end-to-end run that proves the parts fit (one use case is enough)
How the facts were checked   sources, corrections made, what is an example
```
Every page is produced by the framework in `framework/` (documented in `references/framework.md`). Do not hand-write page markup or CSS; write data files and painters. To bring an older course onto the framework, follow `references/migrating-a-course.md`.

## Steps
1. **Scope it and look around.** Confirm the technology, version, audience and depth. Default depth: internals, one scenario, no installation guide; say so. Look in the repo for an existing course on the topic (link to it, do not duplicate), for the framework (`assets/course/`), and for a reference course to match visually (Redis is the reference implementation).
2. **Get the sources before writing.** Fetch the config file and the source files for the pinned version (see `references/research-and-verify.md`, "Pin the facts"). Write down each default and mechanism with its file. A fact you cannot pin is an example or an assumption, and is labelled so.
3. **Install the framework if the repo lacks it.** `node <skill>/scripts/install.js <repo>` copies `assets/course/` and `tools/course/`; then `node tools/course/scaffold.js <id> "<Name>" <version>` creates a page that already validates. Un-ignore `tools/course/` if `.gitignore` ignores `tools/`.
4. **Write the spec** (`spec.js`): overview, problem with numbers, requirements, estimates, decisions (templates in `references/spec-template.md`). If you cannot state when the naive design fails, the topic is too vague: ask.
5. **Split into features** ordered along the data path, one per subsystem or requirement. Give each goal, scope, FR, NFR, decisions and a Mermaid flowchart (`hld`).
6. **Choose use cases per feature.** At least one happy path, one failure and one knob (config key and default) per feature; add a lifecycle, a scale effect or a comparison where it teaches something.
7. **Write each use case** in `uc-*.js`: trigger (a concrete situation), run (command or config, default marked), expect (one sentence), 5 to 7 steps (one move each), 2 edge cases (Context then Solution), the invariant, sources.
8. **Draw it twice.** (a) 1 or 2 Mermaid diagrams per use case in `diagrams.js`: sequence for a protocol, state for a lifecycle, flow for a decision. (b) One picture per use case in `paint.js`, chosen from `references/visual-catalog.md` and built from `Course.kit`. A form is never reused in one course. Every step carries the whole scene.
9. **Verify in two passes.** `node tools/course/check.js <page>` (contract, every step painted, Mermaid lint, unique forms) and `node tools/course/browse.js <page>` (every page, both themes, phone width, every step, every diagram drawn). Then look at screenshots of the trickiest pictures and of one page next to the reference course. Fix legibility problems, not only errors.
10. **Correct what exists.** Check older notes and courses on the topic against the pinned sources; fix the text, diagram and scope together, and record each correction in `spec.verify` and the report. If nothing is wrong, say "checked, no corrections".
11. **Wire it into the site.** Link from the existing course page, add a search-index entry, update the README. Do not list a new course in a registry that must contain only finished tours unless asked.
12. **Commit per round** (framework, then spec and feature groups). Push the branch the user named; open a pull request only when asked.
13. **Report** what was built, what was verified against which source, what was corrected, what is unverified, and any deviation from this method.

## Quality rules
- Every number comes from a source, an assumption you state, or an example you label as one. Never invent a count.
- Config keys and defaults are exact and tied to a version, read from the source file, not remembered.
- Pictures show the mechanism, not decoration. If a table says it more clearly than a chart, use a table.
- Plain language; define a term at first use. A step is one move: if it needs "and then", split it.
- Do not claim a thing is verified when it was only reasoned. Say which.
- Do not drop a required part of the method because it is hard or the environment blocks it (diagrams, pictures, checks). Find a way (for example install Mermaid from npm when the CDN is blocked) or say plainly that you did not.
- Match the reference style by looking at it, not by memory. If asked for consistency, compare screenshots side by side before reporting.

## Definition of done
`check.js` reports 0 errors; `browse.js` reports no errors; every feature has a flowchart and every use case has diagrams and a distinct picture; sources were read for the pinned version; corrections and unverified items are listed; the page matches the reference course visually in both themes and at phone width; work is committed on the named branch.

## Output
A course page (the `design.html` plus its data files), wired into the site, with a short report: features and use cases added, corrections made, sources used, unchecked items, deviations.
