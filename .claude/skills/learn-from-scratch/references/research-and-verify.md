# Research and verify

## Sources, best first
1. The real configuration file and source code for the version you target (raw files from the project repository).
2. Official documentation and configuration reference, for that version.
3. Design papers and maintainers' write-ups.
4. Secondary blogs and Q&A, only to point you at the first three.

## Pin the facts (do this before writing)
Read the primary files, do not recall them. In a sandbox raw GitHub files are usually reachable even when search engines and docs sites are not.

```
curl -sS -o redis.conf  https://raw.githubusercontent.com/<org>/<repo>/<version-branch-or-tag>/<path>/redis.conf
curl -sS -o dict.c      https://raw.githubusercontent.com/<org>/<repo>/<version>/src/dict.c
grep -n -E "^(save|appendfsync|hz|maxmemory-samples) " redis.conf          # defaults (a leading # means commented default)
grep -n -E "define +ACTIVE_EXPIRE|EVPOOL_SIZE|dict_force_resize_ratio" expire.c evict.c dict.c   # constants
grep -n -E 'createIntConfig\("hz"|"repl-backlog-size"' config.c            # the real built-in default
```
Where a sample config comments a default out, confirm it in the source file that registers the option (here `config.c`). For each fact keep a
note: claim, file, line or symbol, version. Typical things to pin: every config key and default you mention; thresholds and constants; the order
of operations when a reply or a write depends on it; the direction of a conversion (does it convert back?); the version a command appeared in.

Then label every use case's `src` with the files you read. Anything you could not pin is an example, an assumption, or "from knowledge"; say which.
When a number in a picture can be computed (a hash slot, a checksum, a size), compute it in the picture's code and check it against a known value.

## When the environment blocks sources
- Docs sites or search may be unreachable and return only secondary pages. Still write the use case, but say so in the report, list each default so a reader can check it, and never present an unconfirmed number as verified.
- The skill itself may not be in the session's skill list: look in the skill repository (for example `flynn3103/agent-team`, attach it with `add_repo`) before deciding it is missing.
- The Mermaid CDN may be blocked: `npm install mermaid@10.9.1` into a temp folder and serve it for the CDN URL (`tools/course/browse.js` does this automatically).

## Facts to pin for each use case
- The mechanism, in one sentence you could defend.
- The config key and its default, with the version.
- The failure it handles, and what the reader sees when it fails (log line, error text, stat name).
- One example with numbers, labelled as an example.

## Correcting existing content
Check every old note, course page and use case on the topic before adding new ones. Look for:
- an unsupported number or count,
- a state diagram missing a real path (for example "executor lost" as a way to fail),
- a default that changed between versions (the Redis hash listpack limit was 128 in older text and is 512 in 7.2),
- a threshold confused with a cap (a 25% CPU cap described as the 25% repeat threshold; the source says 10%),
- a scope note that contradicts the new use cases,
- a claim stated as always true that is only the default.
Fix the text, the diagram and the scope together. Record each correction in `spec.verify` and in the commit message. If nothing is wrong, say "checked, no corrections".

## Build checks (run before every commit)
1. `node tools/course/check.js <page>`: required fields, 5 to 7 steps, 2 edge cases, one picture form per use case and never repeated, a painter per form, every step painted without `undefined`, `NaN` or `[object`, every feature and use case has a diagram, Mermaid sources linted.
2. `node tools/course/browse.js <page>`: overview, every feature and every use case in light and dark themes at 1100 px and 390 px, Next pressed to the end of every player, every Mermaid diagram drawn, no page errors, no horizontal overflow.
3. Look at screenshots. Typical faults found by eye: text nearly invisible on a pastel fill, a label on top of data, an axis label wrapped or clipped, a tight range that makes the picture empty, two rows with the same label, a bar that collapses to zero width.
4. Open the reference course beside yours (same viewport) and compare shell, headings, cards and diagrams.

## Pitfalls seen while building the courses
- A splice script that edits three files can fail on the third and leave two half-applied; restore with `git checkout -- <files>` and rerun (Spark era).
- An apostrophe inside a single-quoted JavaScript string ends the string; escape it or reword. `node --check` every data file.
- A trailing comma at the end of a spliced data block broke an end-of-data check.
- A map entry written as `pool, shares` instead of `pool: paintPool` raised "pool is not defined" at load.
- Short generic class names collide with the shared stylesheet; use the kit's names.
- A grid item with long unbreakable content widens the page on a phone; give grid children `min-width:0`.
- Mermaid: a semicolon ends a statement and a hash sign starts a comment, even inside a label.
- `pkill -f "http.server 8770"` matched the shell running the command and killed it; find the pid with `ps aux | grep "[h]ttp.server"` instead.
- A hosted site can serve an old copy for a few minutes. Hard-refresh before concluding a deploy did not work, and read the deploy status first.
- `.gitignore` can hide the scripts you wrote (`tools/` was ignored); check `git status` shows them before committing.
- A write to a file you edited with a script is refused until you re-read it; re-read, then write.

## Git
- Commit per round (framework, then spec and each feature group), with a body listing what was added, what was corrected and what was not checked.
- Push the branch the user named. Push the main branch only when asked.
- Do not open a pull request unless asked.
