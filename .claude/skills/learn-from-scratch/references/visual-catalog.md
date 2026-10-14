# Choosing a picture for a use case

Build pictures from `Course.kit` (`cells`, `meter`, `limitMeter`, `timeline`, `lanes`, `columns`, `panels`, `table`, `stages`, `chip`, `cap`, `note`; see `../framework/assets/course/README.md`). A form is a painter `(state, step) => html` that draws the whole scene. The Redis course built 25 distinct forms this way; the second table lists them.


Pick the form from what the use case is about, not from what is easy to draw. A form is used once per course.

## Chooser
| The use case is about | Use a form like | Examples (Spark course) |
| --- | --- | --- |
| a quantity moving over time | step line, sawtooth area, strip plot, event tape | `ticks` free slots, `sawtooth` memory, `strip` attempt durations |
| a value against a limit | bullet gauge, segmented pool bar, threshold scale, bounded queue | `bullet`, `pool`, `switch`, `dropqueue` |
| a distribution or spread | histogram with target, box plot, donut of shares | `histogram`, `box`, `donut` |
| states an item moves through | kanban board, tank of block states, gate with a counter | `kanban`, `tank`, `gate` |
| a budget being spent | row of attempt cells | `budget`, `backoff` |
| where data goes or is placed | stacked bars, lanes, route columns, fan-out, key scatter | `stacked`, `lanes`, `routes`, `fanout`, `scatter` |
| the plan or structure being cut | operator chain with stages, diamond with memo, stage strip, cycle | `dag`, `diamond`, `flow`, `loop` |
| two strategies side by side | paired traces, small multiples, compare lanes | `diff`, `multiples`, `compare`, `paths` |
| cost that grows with a product | bars of counts, one square per task, comparison grid | `explode`, `swarm`, `pairs` |
| which rows a join or filter keeps | overlapping sets, sorted lists with pointers, expression tree | `venn`, `merge`, `rewrite` |
| files and folders | file tree with a reader view, folder with old/staged/removed items, file moves | `filetree`, `overwrite`, `renames`, `ledger` |
| how much work a unit gets | executor cores as cells, columns with cap and floor lines, waves | `cores`, `shares`, `waves` |

## Every form used in the Spark course (67)
- **read:** `csv-read` cut a file into pieces · `pack` pack small files · `map` row groups skipped · `tree` folders pruned · `compare` bad-row modes side by side
- **pipeline:** `slots` pull chain · `swim` attempts on a timeline · `piles` eager versus pull · `basket` early stop
- **lineage:** `shelf` cache in front · `tank` block states · `tiles` rebuild through parents · `replay` checkpoint shortens replay
- **stages:** `dag` cut at shuffles · `gate` readiness counter · `diamond` shared parent · `skip` finished shuffle skipped · `copart` join with no exchange · `waves` tasks follow partitions
- **schedule:** `ticks` · `kanban` · `ladder` locality levels · `budget` retry limit · `cores` slots from cores
- **shuffle:** `stacked` · `lanes` · `paths` bypass or sort · `routes` local or remote · `explode` maps times reducers
- **memory:** `sawtooth` · `bullet` · `pool` · `shares` · `heap` off-heap and pauses
- **recovery:** `heatmap` · `strip` · `backoff` · `exclude` · `service`
- **commit:** `ledger` · `filetree` · `renames` · `overwrite`
- **sql:** `flow` · `waterfall` · `rewrite` · `expand` · `swarm`
- **joins:** `fanout` · `scatter` · `merge` · `pairs` · `venn`
- **adaptive:** `histogram` · `donut` · `switch` · `localread` · `loop`
- **evidence:** `tape` · `segments` · `dropqueue` · `window` · `box`
- **build:** `mosaic` · `diff` · `abort` · `multiples`

## Rules
1. **Full scene per step.** Each step carries the whole state, so Back, Restart and jumping work without replay logic.
2. **No repeat.** Check uniqueness with a script (`scripts/check.js`). Two use cases may share a form only if the course is small and the content is identical in shape.
3. **Match the scale.** Set the axis from the data (a tight box on a 0 to 260 axis is invisible). Label limits and caps on the picture.
4. **Distinct labels.** If two rows read the same, add the distinguishing word.
5. **Keep labels off the data.** Put cap and floor labels in a gutter, not on top of the marks.
6. **Both themes.** Use theme tokens for colour, never fixed hex values. Add a reduced-motion rule.
7. **Narrow screens.** Collapse grids to one or two columns under 760 px.
8. **Say what changed.** Each step has a title and one or two plain sentences next to the picture; the stat line under it states the number that matters.

## Forms used in the Redis course (25), and the kit helper behind each
| Use case about | Form | Built from |
| --- | --- | --- |
| bytes arriving, a frame completing | `tape` | `cells`, `chip` |
| time cost of sequential versus batched | `lanes` | `meter` |
| a queue behind a busy executor | `swim` | `panels`, `chip`, `table` |
| a value against two limits | `gauge` | `limitMeter`, `chip` |
| ordered structure with a search path | `skiplist` | `cell` grid |
| two tables and a moving index | `rehash` | `cells` |
| items that are live, stale or gone, with a sample | `sweep` | `cells` |
| items on an age axis with a sample and a victim | `scatter` | `timeline` |
| usage against a hard cap, plus command outcomes | `bullet` | `limitMeter`, `table` |
| shared versus duplicated pages | `pages` | `cells`, `meter` |
| writes against fsync marks and a crash | `window` | `timeline` |
| a set of files and their status | `ledger` | `table` |
| a window of retained data against a consumer offset | `ring` | `timeline` (band) |
| messages between roles, some lost | `ack` | `lanes` |
| followers' progress against a leader | `offsets` | `meter` |
| opinions against a quorum | `votes` | `panels`, `meter` |
| nodes grouped by role | `roles` | `columns` |
| two sides of a partition | `split` | `panels` |
| computed placement of keys | `hash` | `table` |
| two nodes and a redirect conversation | `redirect` | `panels`, `table` |
| ranges owned by nodes, with a hole | `grid` | `cell` blocks |
| two traces side by side | `diff` | `panels`, `table` |
| per-item state with an owner | `pel` | `table` |
| broadcast to connected receivers versus a log | `fan` | `panels`, `cells` |
| one request through every layer | `flow` | `stages` |

Rules added while building it: compute any number a picture shows (the slot table runs real CRC16) so the narration cannot disagree with it; give tick labels `nowrap` and a card background; leave a margin on the axis so end labels fit; put labels in a gutter, not on the marks.
