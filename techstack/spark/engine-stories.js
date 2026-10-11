/* Narration for every use case: trigger, steps (title and text), edge cases and invariants.
   Key "feature:n" patches the n-th use case of that feature in engine-sysdesign.js.
   The picture for each step is attached by the module named in that feature (engine-visuals.js, engine-stagesim.js, engine-pipesim.js, engine-lineagesim.js). */
(function (root) {
  'use strict';
  const E = (title, short, context, solution) => ({ title, short, context, solution });
  const S = (title, text, m, set, badge) => ({ title, text, m: m || null, set: set || {}, badge: badge || {} });
  const F = (name, size, tone, done) => ({ name, size, tone: tone || 'file', done: !!done });
  const MG = (state, cols, test) => ({ state, cols, test: !!test });
  const MI = ['idle', 'idle', 'idle', 'idle'];
  const MS = ['skip', 'skip', 'skip', 'skip'];
  const MR = ['unread', 'read', 'read', 'unread'];
  const SEQ = 'Sequence diagram', STATE = 'State diagram';

  const ST = {};

  /* ---------- 01 Input and partitions ---------- */
  ST['read:2'] = {
    trigger: 'The driver plans an input of many differently sized files.',
    command: "spark.read.csv(\"landing/\").count()",
    expect: 'Four tasks from five files: big.csv in three pieces, logs.gz whole, and the small files packed together.',
    sim: {
      kind: 'pack', target: 128, open: 4, max: 300,
      steps: [
        { title: 'Look at the folder', text: 'The folder has five files. The bars are drawn to one scale, so big.csv is much longer than the others.', lane: [F('big.csv', 300, 'big'), F('a.csv', 5), F('b.csv', 8), F('c.csv', 4), F('logs.gz', 90)], tasks: [], check: 'total: 300 + 5 + 8 + 4 + 90 = 407 MB' },
        { title: 'Set the two rules', text: 'Each task should read about 128 MB of data. Opening every file also costs 4 MB of work, so a file counts a little more than its size when tasks are filled.', lane: [F('big.csv', 300, 'big'), F('a.csv', 5), F('b.csv', 8), F('c.csv', 4), F('logs.gz', 90)], tasks: [], check: 'target 128 MB · open cost 4 MB per file' },
        { title: 'Cut the big file', text: 'A plain CSV can be read from any byte, so big.csv can be cut every 128 MB. The last piece is what is left over: 44 MB.', lane: [F('big.csv part 1', 128, 'piece'), F('big.csv part 2', 128, 'piece'), F('big.csv part 3', 44, 'piece'), F('a.csv', 5), F('b.csv', 8), F('c.csv', 4), F('logs.gz', 90)], tasks: [], check: '300 = 128 + 128 + 44' },
        { title: 'Keep the zipped file whole', text: 'logs.gz is compressed. A reader cannot start in the middle of it, so it stays one 90 MB piece, even though it is under the target.', lane: [F('big.csv part 1', 128, 'piece'), F('big.csv part 2', 128, 'piece'), F('big.csv part 3', 44, 'piece'), F('a.csv', 5), F('b.csv', 8), F('c.csv', 4), F('logs.gz', 90, 'lock')], tasks: [], check: 'logs.gz: cannot be cut, so 1 piece' },
        { title: 'Sort biggest first', text: 'Spark orders the pieces from biggest to smallest, then fills tasks in that order. Each piece is checked as shown in the line under the picture.', lane: [F('big.csv part 1', 128, 'piece'), F('big.csv part 2', 128, 'piece'), F('logs.gz', 90, 'lock'), F('big.csv part 3', 44, 'piece'), F('b.csv', 8), F('a.csv', 5), F('c.csv', 4)], tasks: [], check: 'order: 128, 128, 90, 44, 8, 5, 4' },
        { title: 'Task 1 takes part 1', text: 'Task 1 is empty, so part 1 goes in. Its open cost is added to the total, which makes Task 1 count as 132 MB.', lane: [F('big.csv part 1', 128, 'piece', true), F('big.csv part 2', 128, 'piece'), F('logs.gz', 90, 'lock'), F('big.csv part 3', 44, 'piece'), F('b.csv', 8), F('a.csv', 5), F('c.csv', 4)], tasks: [[F('big.csv part 1', 128, 'piece')]], check: 'check: 0 + 128 is not over 128, so it fits.  total: 128 + 4 = 132' },
        { title: 'Part 2 starts Task 2', text: 'Task 1 is at 132. Adding part 2 would reach 260, which is over 128, so part 2 starts Task 2.', lane: [F('big.csv part 1', 128, 'piece', true), F('big.csv part 2', 128, 'piece', true), F('logs.gz', 90, 'lock'), F('big.csv part 3', 44, 'piece'), F('b.csv', 8), F('a.csv', 5), F('c.csv', 4)], tasks: [[F('big.csv part 1', 128, 'piece')], [F('big.csv part 2', 128, 'piece')]], check: 'check: 132 + 128 = 260, over 128, so a new task' },
        { title: 'logs.gz starts Task 3', text: 'Task 2 is at 132. Adding logs.gz (90) would reach 222, so logs.gz starts Task 3. It counts as 94 with its open cost.', lane: [F('big.csv part 1', 128, 'piece', true), F('big.csv part 2', 128, 'piece', true), F('logs.gz', 90, 'lock', true), F('big.csv part 3', 44, 'piece'), F('b.csv', 8), F('a.csv', 5), F('c.csv', 4)], tasks: [[F('big.csv part 1', 128, 'piece')], [F('big.csv part 2', 128, 'piece')], [F('logs.gz', 90, 'lock')]], check: 'check: 132 + 90 = 222, over 128, so a new task' },
        { title: 'Part 3 starts Task 4', text: 'Task 3 is at 94. Adding part 3 (44) would reach 138, so part 3 starts Task 4.', lane: [F('big.csv part 1', 128, 'piece', true), F('big.csv part 2', 128, 'piece', true), F('logs.gz', 90, 'lock', true), F('big.csv part 3', 44, 'piece', true), F('b.csv', 8), F('a.csv', 5), F('c.csv', 4)], tasks: [[F('big.csv part 1', 128, 'piece')], [F('big.csv part 2', 128, 'piece')], [F('logs.gz', 90, 'lock')], [F('big.csv part 3', 44, 'piece')]], check: 'check: 94 + 44 = 138, over 128, so a new task' },
        { title: 'Small files join Task 4', text: 'Task 4 is at 48. b.csv fits, then a.csv and c.csv. Every check passes, so all three join Task 4.', lane: [F('big.csv part 1', 128, 'piece', true), F('big.csv part 2', 128, 'piece', true), F('logs.gz', 90, 'lock', true), F('big.csv part 3', 44, 'piece', true), F('b.csv', 8, 'file', true), F('a.csv', 5, 'file', true), F('c.csv', 4, 'file', true)], tasks: [[F('big.csv part 1', 128, 'piece')], [F('big.csv part 2', 128, 'piece')], [F('logs.gz', 90, 'lock')], [F('big.csv part 3', 44, 'piece'), F('b.csv', 8), F('a.csv', 5), F('c.csv', 4)]], check: 'check: 48 + 8 = 56, 60 + 5 = 65, 69 + 4 = 73, all under 128' },
        { title: 'Four tasks from five files', text: 'Five files became four tasks. The plan depends only on the file sizes, so the same folder always gives the same plan, and a failed task can safely run again.', lane: [F('big.csv part 1', 128, 'piece', true), F('big.csv part 2', 128, 'piece', true), F('logs.gz', 90, 'lock', true), F('big.csv part 3', 44, 'piece', true), F('b.csv', 8, 'file', true), F('a.csv', 5, 'file', true), F('c.csv', 4, 'file', true)], tasks: [[F('big.csv part 1', 128, 'piece')], [F('big.csv part 2', 128, 'piece')], [F('logs.gz', 90, 'lock')], [F('big.csv part 3', 44, 'piece'), F('b.csv', 8), F('a.csv', 5), F('c.csv', 4)]], check: 'Task 4: 61 MB of data + 16 MB open cost = 77 MB counted' }
      ]
    },
    edges: [
      E('A compressed file cannot be cut', 'It becomes one big job.', 'A gzip file has to be read from its first byte. If one worker started in the middle, it could not make sense of the bytes. So a 5 GB gzip file becomes one job on one worker, and the other workers sit idle.', 'Use a compression format that has safe restart points, or write many smaller gzip files. The planner keeps one piece per file when the format cannot be cut.'),
      E('Listing millions of files is slow', 'Planning itself can take minutes.', 'To plan, the driver must ask the folder for every file name and size. With millions of small files this is slow, and only the driver does it, so nothing else can start.', 'Write fewer, larger files, or use a table format that already keeps the file list, so the driver does not have to ask the folder each time.')
    ]
  };

  /* ---------- 01 Input and partitions: extra use cases ---------- */
  ST['read:3'] = {
    trigger: 'A query wants orders above 500 and only the city column, from a Parquet file that holds many rows in row groups.',
    command: "spark.read.parquet(\"orders.parquet\").filter(\"amount > 500\").select(\"city\").show()",
    expect: 'The query reads 2 of 3 row groups and 4 of 12 column chunks, and returns the same rows as a full read.',
    sim: {
      kind: 'map', cols: ['id', 'city', 'amount', 'note'], line: 500, scale: 10000,
      groups: [
        { name: 'group 1', min: 10, max: 300, dots: [{ v: 10 }, { v: 45 }, { v: 80 }, { v: 130 }, { v: 210 }, { v: 255 }, { v: 290 }, { v: 300 }] },
        { name: 'group 2', min: 120, max: 9000, dots: [{ v: 120 }, { v: 260 }, { v: 340 }, { v: 480 }, { v: 530, c: 'Hue' }, { v: 610, c: 'Hanoi' }, { v: 880, c: 'Da Nang' }, { v: 9000, c: 'Saigon' }] },
        { name: 'group 3', min: 600, max: 800, dots: [{ v: 600, c: 'Hue' }, { v: 640, c: 'Hanoi' }, { v: 680, c: 'Da Nang' }, { v: 700, c: 'Saigon' }, { v: 720, c: 'Hue' }, { v: 750, c: 'Hanoi' }, { v: 780, c: 'Da Nang' }, { v: 800, c: 'Saigon' }] }
      ],
      steps: [
        { title: 'Three row groups, nothing read yet', text: 'The file has three row groups of about 100,000 rows each, and four columns. The query wants amount above 500 and only the city column. The reader knows nothing about the rows yet.', footer: 'idle', groups: [MG('hidden', MI), MG('hidden', MI), MG('hidden', MI)] },
        { title: 'Read the footer first', text: 'The footer sits at the end of the file and is small. It records the smallest and biggest amount in each row group. Those become the bars on the right. The dashed line is 500.', footer: 'read', groups: [MG('known', MI), MG('known', MI), MG('known', MI)] },
        { title: 'Group 1 is ruled out', text: 'Group 1 only reaches 300, which is left of the line. None of its rows can match, so the whole group is skipped and none of its cells is read.', footer: 'read', groups: [MG('skipped', MS), MG('known', MI), MG('known', MI)] },
        { title: 'Group 2: read two columns only', text: 'Group 2 runs from 120 to 9000, so some rows could pass. The reader reads its amount and city cells. The id and note cells stay on disk. The dots are sample rows.', footer: 'read', groups: [MG('skipped', MS), MG('read', MR), MG('known', MI)] },
        { title: 'Check each row against the line', text: 'Each dot is a row. Dots not above 500 turn grey and are dropped. The rest give their city to the result.', footer: 'read', groups: [MG('skipped', MS), MG('read', MR, true), MG('known', MI)] },
        { title: 'Group 3 is fully above the line', text: 'Group 3 starts at 600, so every row in it passes. Its amount and city cells are read the same way, and its cities join the result.', footer: 'read', groups: [MG('skipped', MS), MG('read', MR, true), MG('read', MR, true)] },
        { title: 'The answer, and what was saved', text: 'The query read 2 of 3 row groups and 4 of the 12 column chunks. The note column was never read in any group. The result is the same as reading the whole file.', footer: 'read', never: true, groups: [MG('skipped', MS), MG('read', MR, true), MG('read', MR, true)] }
      ]
    },
    edges: [
      E('The file has no statistics', 'Nothing can be skipped.', 'Some older writers do not store the smallest and biggest value. The reader has nothing to check against, so it must read every group.', 'The answer is still right, just slower. Write files with a current writer, which stores the statistics.'),
      E('Values are mixed up in every group', 'Every group overlaps the range.', 'If rows were written in random order, each group covers almost the whole range of amount. The min and max then rule out nothing.', 'Sort rows by the filter column before writing. Each group then covers a narrow range, and most can be skipped.'),
      E('Millions of tiny row groups', 'The footer gets big and planning slows.', 'A file with millions of tiny groups has a huge footer. The planner must read all of it before the first task can start.', 'Write larger row groups, tens to hundreds of megabytes each.')
    ]
  };

  ST['read:4'] = {
    trigger: 'The orders table is stored as one folder per day, and the query needs only one day.',
    command: "spark.read.parquet(\"orders/\").where(\"date = '2026-10-03'\").count()",
    expect: 'Only the 4 files in date=2026-10-03 become tasks. The other 6 files are never opened.',
    sim: {
      kind: 'tree', query: 'WHERE date = 2026-10-03', match: 'date=2026-10-03',
      folders: [
        { name: 'date=2026-10-01', files: ['part-0', 'part-1', 'part-2'] },
        { name: 'date=2026-10-02', files: ['part-0', 'part-1'] },
        { name: 'date=2026-10-03', files: ['part-0', 'part-1', 'part-2', 'part-3'] },
        { name: 'date=2026-10-04', files: ['part-0'] }
      ],
      steps: [
        { title: 'Ten files in four folders', text: 'Orders are stored in one folder per day, and the folder name holds the date. Ten files are spread over four folders. The query needs only one day.' },
        { title: 'The query arrives', text: 'The query asks for WHERE date = 2026-10-03. The folder names carry this column, so the planner can use them.', query: true },
        { title: 'Read the folder names only', text: 'The planner reads the four folder names. It does not open any file, so nothing inside the folders is touched.', query: true, checked: true },
        { title: 'Rule out the other folders', text: 'The folders for 10-01, 10-02 and 10-04 cannot hold 10-03 rows, so they are ruled out. Their 6 files never enter the plan.', query: true, checked: true, ruled: [0, 1, 3] },
        { title: 'Open the matching folder', text: 'The one folder that matches is opened, and its 4 files go into the plan.', query: true, checked: true, ruled: [0, 1, 3], open: [2] },
        { title: 'One task per file', text: 'Each of the 4 files becomes one task. The 6 files in the other folders cost nothing.', query: true, checked: true, ruled: [0, 1, 3], open: [2], tasks: true },
        { title: 'The result', text: 'The plan came from folder names alone, so it stays quick even when the other folders hold far more data. Ruling out a folder is one check, not one read per file.', query: true, checked: true, ruled: [0, 1, 3], open: [2], tasks: true }
      ]
    },
    edges: [
      E('The filter is on a column that is not in the name', 'No folder can be skipped.', 'If the query filters on amount, the folder names say nothing about amount. Every folder must be opened.', 'Choose folders that match the common filters, or use a table format that keeps per-file statistics.'),
      E('Millions of folders', 'Listing becomes the slow part.', 'Each folder is one listing call. With millions of partitions, the planner spends minutes listing before any work starts.', 'Use coarser folders, such as one per month, or keep a catalog of partitions.'),
      E('One value written two ways', 'The planner may keep one folder and drop the other.', 'If one folder is named date=2026-10-3 and another date=2026-10-03, a comparison on the name can treat them differently.', 'Write one fixed format for partition values, and check folder names when the table is written.')
    ]
  };

  ST['read:5'] = {
    trigger: 'A CSV file has rows that do not match the schema. The reader must decide what to do with each bad row.',
    command: "spark.read.schema(\"name STRING, age INT, city STRING\").option(\"mode\", \"PERMISSIVE\").csv(\"people.csv\").show()",
    expect: 'It depends on the mode. PERMISSIVE keeps all 5 rows and marks 2. DROPMALFORMED keeps 3 with no warning. FAILFAST fails at row 3.',
    sim: {
      kind: 'compare', header: ['name', 'age', 'city'],
      rows: [
        { name: 'Ann', age: '31', city: 'Hanoi' },
        { name: 'Binh', age: '27', city: 'Hue' },
        { name: 'Chi', age: 'abc', city: 'Da Nang', bad: 'age', issue: 'age is not a number' },
        { name: 'Dung', age: '40', city: null, bad: 'city', issue: 'only 2 fields' },
        { name: 'Lan', age: '35', city: 'Saigon' }
      ],
      steps: [
        { upto: 0, title: 'The same file, three modes', text: 'The file has five rows, and the schema says age is a number. Each lane below shows what one mode would write. Press Next to read the next row.' },
        { upto: 1, title: 'Row 1 fits', text: 'Ann is 31 and the row has three fields. Every mode keeps it.' },
        { upto: 2, title: 'Row 2 fits', text: 'Binh is 27 and the row is complete. Every mode keeps it.' },
        { upto: 3, title: 'Row 3 has a bad age', text: 'The age is "abc", which is not a number. Each mode now behaves differently. FAILFAST stops here, and nothing it read so far is written.' },
        { upto: 4, title: 'Row 4 has only two fields', text: 'Dung has no city. PERMISSIVE keeps the row with a null city and saves the raw line. DROPMALFORMED drops it with no warning. FAILFAST has already stopped.' },
        { upto: 5, title: 'Row 5 fits', text: 'Lan is fine. PERMISSIVE and DROPMALFORMED both keep it. FAILFAST never reads it.' },
        { upto: 5, summary: true, title: 'Same input, three answers', text: 'The output has 5 rows, 3 rows, or nothing. Only PERMISSIVE shows the problem rows. Choose the mode before the job runs, and check the marked rows.' }
      ]
    },
    edges: [
      E('Rows vanish without a trace', 'Totals look fine but are too small.', 'DROPMALFORMED removes rows silently. A report built on the output is quietly wrong, and nothing fails.', 'Count rows read and rows kept, and fail a check when they differ. Prefer PERMISSIVE and review the marked rows.'),
      E('Null values change the answer', 'An average can look plausible and still be wrong.', 'PERMISSIVE keeps rows with a null where a value was bad. An average of age then skips those rows, which can hide the problem.', 'Look at the _corrupt_record column after loading, and decide for each report whether null rows should count.'),
      E('A quoted line break', 'The line number in the error is wrong.', 'A quoted cell can contain a line break, so one row spans two lines. The reported line number then no longer matches the file.', 'Report the record number instead of the line number, or use a format with fixed-size records.')
    ]
  };

  /* ---------- 02 Pipeline ---------- */
  ST['pipeline:1'] = {
    trigger: 'The consumer asks for the next result from a chain of reader, filter and map.',
    command: "rows.filter(lambda x: x > 10).map(lambda x: (x, 2 * x)).take(1)",
    expect: 'The consumer gets one result, the pair (12, 24). Only rows 5 and 12 were read.',
    sim: {
      kind: 'slots', rows: 4, nodes: ['reader', 'filter', 'map', 'consumer'],
      steps: [
        { title: 'Nothing has run yet', text: 'The file has four rows: 5, 12, 3 and 20. The chain is reader, filter, map, then the consumer. Each box can hold one row at a time.', src: ['5', '12', '3', '20'], slots: [null, null, null, null] },
        { title: 'The consumer asks for a result', text: 'The consumer calls next on map. Nothing moves until someone asks.', src: ['5', '12', '3', '20'], slots: [null, null, null, null], arrow: { gap: 2, dir: 'left', label: 'next()' } },
        { title: 'Map asks filter', text: 'Map has nothing to give yet, so it asks filter for a row.', src: ['5', '12', '3', '20'], slots: [null, null, null, null], arrow: { gap: 1, dir: 'left', label: 'next()' } },
        { title: 'Filter asks the reader', text: 'Filter has nothing either, so it asks the reader for a row.', src: ['5', '12', '3', '20'], slots: [null, null, null, null], arrow: { gap: 0, dir: 'left', label: 'next()' } },
        { title: 'Row 5 arrives and fails', text: 'The reader hands over row 5. Filter keeps only rows above 10, so it rejects 5. Map and the consumer never see it.', src: ['12', '3', '20'], slots: [null, '5', null, null], flag: { 1: 'fail' }, arrow: { gap: 0, dir: 'right', label: 'row 5' }, note: '5 is not above 10' },
        { title: 'Filter asks again', text: 'Row 5 is dropped, so filter asks the reader for another row.', src: ['12', '3', '20'], slots: [null, null, null, null], arrow: { gap: 0, dir: 'left', label: 'next()' }, note: 'nothing has passed yet, so the chain keeps pulling' },
        { title: 'Row 12 arrives and passes', text: 'The reader hands over row 12. It is above 10, so filter keeps it.', src: ['3', '20'], slots: [null, '12', null, null], flag: { 1: 'pass' }, arrow: { gap: 0, dir: 'right', label: 'row 12' }, note: '12 is above 10' },
        { title: 'Row 12 moves up', text: 'Filter passes row 12 to map.', src: ['3', '20'], slots: [null, null, '12', null], arrow: { gap: 1, dir: 'right', label: 'row 12' } },
        { title: 'Map builds the pair', text: 'Map turns 12 into the pair (12, 24) and gives it to the consumer. The consumer now holds one result.', src: ['3', '20'], slots: [null, null, null, '(12, 24)'], arrow: { gap: 2, dir: 'right', label: 'pair' } },
        { title: 'Rows 3 and 20 were never touched', text: 'No box ever held more than one row. Rows 3 and 20 stay in the file until the consumer asks again.', src: ['3', '20'], slots: [null, null, null, '(12, 24)'], note: 'the consumer holds the result, and the chain is empty' }
      ]
    },
    edges: [
      E('No row passes the test', 'The chain just runs out.', 'The filter keeps asking the reader, and every row fails. At the end of the file the reader says it has nothing more.', 'The "nothing more" answer travels back up the chain and the consumer finishes normally with zero rows. That is a valid result.'),
      E('The test itself crashes', 'One bad row must not kill the whole program.', 'A rule such as "age is more than 10" crashes on a row where age is blank.', 'The error stops only this task attempt, not the whole process. The scheduler can retry the attempt, which is safe because every step only reads and transforms.')
    ]
  };

  ST['pipeline:2'] = {
    trigger: 'A task attempt starts, reads its file, and then ends, crashes or is retried.',
    command: "spark.read.csv(\"events.csv\").write.mode(\"overwrite\").parquet(\"out/\")",
    expect: 'Every attempt closes the reader it opened, and at most one reader is open at any time.',
    sim: {
      kind: 'swim', tMax: 10,
      lanes: [
        { name: 'attempt 1', task: [0, 3.4], reader: [1, 3.2], result: 'ok', marks: [{ at: 2, label: 'rows pulled' }, { at: 3, label: 'rows run out' }, { at: 3.2, label: 'close ✓', kind: 'ok' }] },
        { name: 'attempt 2', task: [4, 5.5], reader: [4.2, 5.5], result: 'bad', marks: [{ at: 4.8, label: '2 rows read' }, { at: 5.5, label: 'crash', kind: 'bad' }] },
        { name: 'attempt 3', task: [6, 8.2], reader: [6.2, 8], result: 'ok', marks: [{ at: 8, label: 'close ✓', kind: 'ok' }] }
      ],
      steps: [
        { t: 0, title: 'Three attempts, one reader each', text: 'A task can run several attempts. Each attempt opens its own reader. Nothing is open yet.' },
        { t: 1.5, title: 'Attempt 1 opens a reader', text: 'Attempt 1 opens the file. From now on, one reader is open.' },
        { t: 2.5, title: 'Rows are pulled', text: 'The consumer pulls rows one at a time. The reader stays open for the whole pass.' },
        { t: 3.1, title: 'The rows run out', text: 'The reader reports that no rows are left. It is still open, though no more rows are needed.' },
        { t: 3.4, title: 'Attempt 1 closes its reader', text: 'Whatever the outcome, the attempt closes the reader it opened. No file handle is held now.' },
        { t: 5, title: 'Attempt 2 opens its own reader', text: 'The scheduler starts attempt 2. It opens a reader of its own, so it does not reuse the one from attempt 1.' },
        { t: 5.5, title: 'The executor crashes', text: 'Attempt 2 crashes after two rows. The close sits in a cleanup step, so it runs on this path too.' },
        { t: 6.8, title: 'Attempt 3 starts from the top', text: 'The scheduler retries. Attempt 3 opens a fresh reader and reads from the first row.' },
        { t: 8.2, title: 'Summary', text: 'At most one reader was open at a time. None is left open once the job ends.' }
      ]
    },
    edges: [
      E('Closing too early', 'The first read fails.', 'If the code closes the file right after creating the chain, but the rows are pulled later, the reader is already closed on the first pull.', 'Close the reader when the attempt ends, not when the chain is built.'),
      E('A leaked reader', 'Retries slowly use up all file handles.', 'If an attempt forgets to close its reader after a failure, every retry leaves one more file open. Thousands of retries can run the machine out of open files.', 'Always close in a "finally" step that runs on success, failure and cancel.'),
      E('A retry repeats a write', 'Rows can be written twice.', 'Attempt 2 writes two rows to a database before it crashes. Attempt 3 starts from the top and writes the same rows again.', 'Keep map steps free of side effects, or make the write safe to repeat, such as an upsert keyed by row id. Commit output only from the attempt that finishes.')
    ]
  };

  ST['pipeline:3'] = {
    trigger: 'A map and a filter run one after the other on the same rows, with no shuffle between them.',
    command: "rows.filter(lambda x: x > 10).map(lambda x: (x, 2 * x)).count()",
    expect: 'The chain runs in one pass. Its peak memory is one row, against 18 rows for the eager version in this example.',
    sim: {
      kind: 'piles',
      steps: [
        { title: 'Twelve rows, two ways to pass them on', text: 'The file has 12 rows. The filter keeps the ones above 10, which is 6 of them. Top lane: each step builds a full list. Bottom lane: one row moves through at a time.', eager: { say: 'Nothing is copied yet. All 12 rows sit in the file.', file: ['5', '12', '3', '20', '8', '15', '30', '2', '11', '7', '25', '9'] }, pull: { say: 'Nothing is copied yet. Each row waits in the file.', file: ['5', '12', '3', '20', '8', '15', '30', '2', '11', '7', '25', '9'] } },
        { title: 'The reader takes its rows', text: 'Eager copies all 12 rows at once. Pull takes only what is needed right now, which is row 5.', eager: { say: 'The reader copies all 12 rows into its own list.', reader: ['5', '12', '3', '20', '8', '15', '30', '2', '11', '7', '25', '9'] }, pull: { say: 'The reader takes row 5 only. The other rows stay in the file.', reader: ['5'], file: ['12', '3', '20', '8', '15', '30', '2', '11', '7', '25', '9'] } },
        { title: 'The filter checks the rows', text: 'This is the biggest difference. Eager now holds 18 rows at once: the reader list and the filter list. Pull holds one.', eager: { say: 'Filter copies the 6 passing rows into its own list. The reader list is still full, so 18 rows are in memory.', reader: ['5', '12', '3', '20', '8', '15', '30', '2', '11', '7', '25', '9'], filter: ['12', '20', '15', '30', '11', '25'], wait: ['reader'] }, pull: { say: 'Row 5 fails the filter, so it is dropped. Row 12 is in the reader now.', reader: ['12'], filter: ['✗5'], file: ['3', '20', '8', '15', '30', '2', '11', '7', '25', '9'] } },
        { title: 'The reader list is released', text: 'Eager frees its reader list, which it no longer needs. Pull moves row 12 on, and the filter holds only that row.', eager: { say: 'The reader list is no longer needed, so it is cleared. The filter list holds 6 rows.', filter: ['12', '20', '15', '30', '11', '25'] }, pull: { say: 'Row 12 is above 10, so filter keeps it. Still one row in memory.', filter: ['✗5', '12'], file: ['3', '20', '8', '15', '30', '2', '11', '7', '25', '9'] } },
        { title: 'Map makes the pairs', text: 'Eager now holds two lists at once: the filter list and the map list. Pull turns row 12 into a pair, and that is the only row in memory.', eager: { say: 'Map builds 6 pairs while the filter list still exists, so 12 rows are in memory.', filter: ['12', '20', '15', '30', '11', '25'], map: ['12→24', '20→40', '15→30', '30→60', '11→22', '25→50'], wait: ['filter'] }, pull: { say: 'Map turns 12 into 12→24 and hands it on. The rest of the rows wait in the file.', filter: ['✗5'], map: ['12→24'], file: ['3', '20', '8', '15', '30', '2', '11', '7', '25', '9'] } },
        { title: 'The filter list is released', text: 'Eager is left with the 6 pairs. Pull hands its first pair to the consumer.', eager: { say: 'The filter list is cleared. Only the 6 pairs are left.', map: ['12→24', '20→40', '15→30', '30→60', '11→22', '25→50'] }, pull: { say: 'The consumer takes 12→24. The next row is read only when it is asked for.', out: ['12→24'], file: ['3', '20', '8', '15', '30', '2', '11', '7', '25', '9'] } },
        { title: 'Peak memory', text: 'Eager peaked at 18 rows. Pull never held more than one. With a bigger file, the eager peak grows with it, and the pull peak stays at one row.', eager: { say: 'The consumer gets all 6 pairs at the end.', out: ['12→24', '20→40', '15→30', '30→60', '11→22', '25→50'] }, pull: { say: 'Each pair goes to the consumer as it is made. Rows 3 and onward stay in the file.', out: ['12→24'], file: ['3', '20', '8', '15', '30', '2', '11', '7', '25', '9'] } }
      ]
    },
    edges: [
      E('A sort in the middle of the chain', 'The whole partition is held again.', 'A sort cannot output its first row until it has seen every row, so the chain stops there and the partition is held in memory.', 'Spark sorts with spilling to disk when memory runs out. Keep sorts out of a narrow chain when you can, and plan memory for the ones you need.'),
      E('A side effect before a filter', 'The write happens even for rows that are dropped.', 'Map writes each row to a database, and a filter after it drops the row. The write has already happened.', 'Put filters before side effects, so only rows that will be kept are written.'),
      E('One row expands into a huge list', 'The next step may need all of it at once.', 'A step that turns one row into a list of thousands is fine while it streams. A later step that must collect everything, such as a sort or a join, holds all of it.', 'Keep the next step streaming, or split the big list into smaller rows before it.')
    ]
  };

  ST['pipeline:4'] = {
    trigger: 'A query asks for the first three rows that pass a filter.',
    command: "spark.read.parquet(\"events/\").filter(\"value > 10\").limit(3).show()",
    expect: 'The result is the first three passing rows, and the reader stops after row 15.',
    sim: {
      kind: 'basket', rowsN: 24, limit: 3, threshold: 10,
      values: [5, 8, 3, 12, 7, 2, 9, 4, 14, 6, 1, 8, 5, 3, 11, 6, 2, 9, 13, 7, 4, 15, 1, 8],
      steps: [
        { upto: 0, title: "The consumer wants 3 rows", text: "The basket asks for rows one at a time. The filter keeps rows whose value is above 10. The reader stops as soon as the basket holds 3." },
        { upto: 1, title: "Row 1 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 1, with value 5. 5 is not above 10, so the filter drops it and asks again." },
        { upto: 2, title: "Row 2 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 2, with value 8. 8 is not above 10, so the filter drops it and asks again." },
        { upto: 3, title: "Row 3 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 3, with value 3. 3 is not above 10, so the filter drops it and asks again." },
        { upto: 4, title: "Row 4 goes into the basket (1 of 3)", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 4, with value 12. 12 is above 10, so the filter passes it to the basket." },
        { upto: 5, title: "Row 5 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 5, with value 7. 7 is not above 10, so the filter drops it and asks again." },
        { upto: 6, title: "Row 6 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 6, with value 2. 2 is not above 10, so the filter drops it and asks again." },
        { upto: 7, title: "Row 7 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 7, with value 9. 9 is not above 10, so the filter drops it and asks again." },
        { upto: 8, title: "Row 8 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 8, with value 4. 4 is not above 10, so the filter drops it and asks again." },
        { upto: 9, title: "Row 9 goes into the basket (2 of 3)", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 9, with value 14. 14 is above 10, so the filter passes it to the basket." },
        { upto: 10, title: "Row 10 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 10, with value 6. 6 is not above 10, so the filter drops it and asks again." },
        { upto: 11, title: "Row 11 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 11, with value 1. 1 is not above 10, so the filter drops it and asks again." },
        { upto: 12, title: "Row 12 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 12, with value 8. 8 is not above 10, so the filter drops it and asks again." },
        { upto: 13, title: "Row 13 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 13, with value 5. 5 is not above 10, so the filter drops it and asks again." },
        { upto: 14, title: "Row 14 is rejected", text: "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 14, with value 3. 3 is not above 10, so the filter drops it and asks again." },
        { upto: 15, title: "Row 15 fills the basket (3 of 3)", text: "The basket asks the filter for the next row. The reader gives row 15, with value 11. 11 is above 10, so the filter passes it, and the basket is full. The basket stops asking, and the reader closes." },
        { upto: 15, summary: true, title: "Rows 16 to 24 are never read", text: "The basket is full, so it never asks again. Rows 16 to 24 are never read, even though rows 19 and 22 would have passed." }
      ]
    },
    edges: [
      E('The filter almost never passes', 'LIMIT still reads nearly the whole file.', 'If only three rows in a billion pass, LIMIT 3 reads almost everything before it can stop.', 'Use a filter the storage can skip, such as partition folders or row group statistics, so the rows are never read.'),
      E('ORDER BY before LIMIT', 'The reader cannot stop early.', 'To know the top three rows, every row has to be compared, so the scan cannot stop after three.', 'Spark keeps only the best three rows seen so far in each partition. Memory stays small, but every row is still read.'),
      E('Many partitions', 'Some extra rows are read.', 'Spark does not stop row by row across partitions. It reads a few partitions first and more only if it still needs rows, so it can read a little more than needed.', 'Accept the small extra cost. Only tune the scale-up setting if LIMIT itself is the bottleneck.')
    ]
  };

  /* ---------- 03 Lineage ---------- */
  ST['lineage:1'] = {
    trigger: 'A task needs partition 3 of a dataset that the program asked Spark to keep in memory.',
    expect: 'The second request for partition 3 is served from the cache, and both requests return the same rows.',
    command: "rdd = sc.textFile(\"sales.txt\").filter(lambda l: l != \"\").map(str.upper).cache(); rdd.count(); rdd.count()",
    sim: {
      kind: 'shelf', chain: ['read', 'filter', 'map'], want: 3,
      steps: [
        { title: "Task needs partition 3", text: "A task needs partition 3 of a dataset the program asked Spark to keep. Before doing any work, it checks the cache.", look: null, active: null, msg: null, shelf: ["p1", "p2"], task: "needs partition 3", rows: null },
        { title: "Ask the cache", text: "The task asks the block manager: do you have partition 3?", look: "ask", active: null, msg: "task \u2192 block manager: do you have p3?", shelf: ["p1", "p2"], task: "asks the cache", rows: null },
        { title: "No: that is a miss", text: "The block manager says no. This is a miss, so the task has to make the rows itself.", look: "miss", active: null, msg: "block manager \u2192 task: no", shelf: ["p1", "p2"], task: "waiting", rows: null },
        { title: "Ask map to compute it", text: "The task asks the last step, map, to compute partition 3.", look: null, active: "map", msg: "task \u2192 map: compute p3", shelf: ["p1", "p2"], task: "waiting", rows: null },
        { title: "Map asks filter", text: "Map asks filter for partition 3, since it needs the rows that filter makes.", look: null, active: "filter", msg: "map \u2192 filter: give me p3", shelf: ["p1", "p2"], task: "waiting", rows: null },
        { title: "Filter asks the read", text: "Filter asks the read step for partition 3.", look: null, active: "read", msg: "filter \u2192 read: give me p3", shelf: ["p1", "p2"], task: "waiting", rows: null },
        { title: "Read sends the rows back", text: "The read step reads partition 3 from the file and sends the rows back up to filter.", look: null, active: "read", msg: "read \u2192 filter: rows", shelf: ["p1", "p2"], task: "waiting", rows: "up" },
        { title: "Filter sends them up", text: "Filter applies its test and sends the rows up to map.", look: null, active: "filter", msg: "filter \u2192 map: rows", shelf: ["p1", "p2"], task: "waiting", rows: "up" },
        { title: "Map sends them to the task", text: "Map transforms the rows and sends them to the task. The task now has partition 3.", look: null, active: "map", msg: "map \u2192 task: rows", shelf: ["p1", "p2"], task: "has partition 3 rows", rows: "up" },
        { title: "Keep a copy", text: "The task asks the cache to store partition 3, so the next request can skip the work.", look: "store", active: null, msg: "task \u2192 block manager: store p3", shelf: ["p1", "p2", "p3"], task: "has partition 3 rows", rows: null },
        { title: "Another task asks", text: "Later, another task asks for partition 3. The cache is asked first.", look: "ask", active: null, msg: "task \u2192 block manager: do you have p3?", shelf: ["p1", "p2", "p3"], task: "asks the cache", rows: null },
        { title: "Hit: nothing is recomputed", text: "The cache has partition 3, so it answers at once. Read, filter and map do nothing.", look: "hit", active: null, msg: "block manager \u2192 task: yes, here are the rows", shelf: ["p1", "p2", "p3"], task: "has partition 3 rows from the cache", rows: null },
        { title: "The same rows either way", text: "A hit and a rebuild return the same rows. The cache only changes how long the answer takes.", look: null, active: null, msg: null, shelf: ["p1", "p2", "p3"], task: "has partition 3 rows", rows: null }
      ]
    },
    edges: [
      E('Memory is full', 'The copy is simply not kept.', 'The task rebuilt the rows but the cache has no room to store them.', 'The job still finishes. The rows are used and then dropped. It will just be slower next time, because the work has to be repeated.'),
      E('The parents give different answers each time', 'The cache and a rebuild could disagree.', 'If the parent step uses random numbers or the current time, rebuilding gives different rows than the cached copy had.', 'Keep parent steps deterministic, or save a checkpoint so that every later read sees the same rows.')
    ]
  };

  ST['lineage:2'] = {
    trigger: 'Memory is running out, or the program says it is done with a dataset and asks Spark to forget it.',
    expect: 'An evicted block is rebuilt from its lineage when it is needed again, and a block that never fits is computed only for the task that asked for it.',
    command: "rdd.persist(StorageLevel.MEMORY_ONLY).count()",
    sim: {
      kind: 'tank', capacity: 3,
      steps: [
        { title: "Nothing is stored yet", text: "Memory holds three blocks at most. A, B, C and D are datasets that the program asks Spark to keep.", mem: [], states: {}, pick: null, inuse: [], request: null, msg: null },
        { title: "persist is called on A", text: "The program asks Spark to keep block A. A is requested, and nothing is stored yet.", mem: [], states: {"A": "Requested"}, pick: null, inuse: [], request: "A", msg: "program \u2192 Spark: persist A" },
        { title: "A is computed and stored", text: "A is computed and stored in memory. It is now resident.", mem: ["A"], states: {"A": "Resident"}, pick: null, inuse: [], request: null, msg: "A computed and stored" },
        { title: "B is stored", text: "B is computed and stored. There is still room in memory.", mem: ["A", "B"], states: {"A": "Resident", "B": "Resident"}, pick: null, inuse: [], request: null, msg: "B computed and stored" },
        { title: "C is stored: memory is full", text: "C is stored, and memory now holds three blocks. It is full.", mem: ["A", "B", "C"], states: {"A": "Resident", "B": "Resident", "C": "Resident"}, pick: null, inuse: [], request: null, msg: "C computed and stored" },
        { title: "D is requested, but memory is full", text: "The program asks for D. There is no room, so the block manager has to free some space first.", mem: ["A", "B", "C"], states: {"A": "Resident", "B": "Resident", "C": "Resident", "D": "Requested"}, pick: null, inuse: [], request: "D", msg: "D requested: no room" },
        { title: "Pick the least recently used block", text: "The manager picks the block that was used longest ago, which is A. Nothing is reading A right now, so it can go.", mem: ["A", "B", "C"], states: {"A": "Resident", "B": "Resident", "C": "Resident", "D": "Requested"}, pick: "A", inuse: [], request: "D", msg: "choose least recently used: A" },
        { title: "A is evicted, and D takes its place", text: "A is evicted. In memory-only mode its copy is simply gone. D is computed and stored in the free space.", mem: ["B", "C", "D"], states: {"A": "Evicted", "B": "Resident", "C": "Resident", "D": "Resident"}, pick: null, inuse: [], request: null, msg: "A evicted, D stored" },
        { title: "A is needed again", text: "A is requested again. It is evicted, and memory is full, so the next least recently used block, B, must go first.", mem: ["B", "C", "D"], states: {"A": "Evicted", "B": "Resident", "C": "Resident", "D": "Resident"}, pick: "B", inuse: [], request: "A", msg: "request A: choose B to make room" },
        { title: "B is evicted, and A is rebuilt", text: "B is evicted to make room. A is recomputed from its parents and stored again.", mem: ["C", "D", "A"], states: {"A": "Resident", "B": "Evicted", "C": "Resident", "D": "Resident"}, pick: null, inuse: [], request: null, msg: "B evicted, A recomputed and stored" },
        { title: "E is requested while every block is in use", text: "The program asks for E. Every block in memory is being read at this moment, so none can be evicted.", mem: ["C", "D", "A"], states: {"A": "Resident", "B": "Evicted", "C": "Resident", "D": "Resident", "E": "Requested"}, pick: null, inuse: ["C", "D", "A"], request: "E", msg: "E requested: nothing can be evicted" },
        { title: "E is not stored", text: "E is computed only for the task that asked for it. It is not stored, so its state is NotStored.", mem: ["C", "D", "A"], states: {"A": "Resident", "B": "Evicted", "C": "Resident", "D": "Resident", "E": "NotStored"}, pick: null, inuse: ["C", "D", "A"], request: null, msg: "E computed for one task, not stored" },
        { title: "D is unpersisted", text: "The program no longer needs D, so it asks Spark to drop it. D leaves memory for good.", mem: ["C", "A"], states: {"A": "Resident", "B": "Evicted", "C": "Resident", "D": "Dropped", "E": "NotStored"}, pick: null, inuse: [], request: null, msg: "unpersist D: dropped" },
        { title: "Summary", text: "Each block has one state at a time. An evicted or dropped block comes back only by being rebuilt from its lineage.", mem: ["C", "A"], states: {"A": "Resident", "B": "Evicted", "C": "Resident", "D": "Dropped", "E": "NotStored"}, pick: null, inuse: [], request: null, msg: null }
      ]
    },
    edges: [
      E('A block that is being read', 'It cannot be removed.', 'A task is reading block B right now when memory runs short.', 'The manager skips blocks that are in use and removes a different one.'),
      E('A very long chain and no checkpoint', 'One loss can mean redoing everything.', 'When the chain of steps behind a dataset is very long, rebuilding one lost block means replaying all of them.', 'Save a checkpoint after the long chain so the replay stops there.'),
      E("Memory and disk: an evicted block is spilled, not dropped", "The block is read back from disk.", "With MEMORY_AND_DISK, an evicted block is written to disk instead of being thrown away. A later read loads it back.", "Reading from disk is usually cheaper than a rebuild. If the disk is slow, a rebuild can be faster, so choose the storage level by cost.")
    ]
  };

  ST['lineage:3'] = {
    trigger: 'An executor dies after it has computed some partitions of a dataset, and the next action needs them.',
    expect: 'Only the two lost partitions are rebuilt, from their parents. The other ten are untouched.',
    command: "C.count()",
    sim: {
      kind: 'tiles', stages: ['A read', 'B filter', 'C map'], parts: 4,
      steps: [
        { title: "Every tile is in place", text: "count() on C needs all 12 tiles: four partitions in each of the three stages. Executor 2 holds B2 and C2. The file still holds A2.", states: {"A0": "ok", "A1": "ok", "A2": "ok", "A3": "ok", "B0": "ok", "B1": "ok", "B2": "ok", "B3": "ok", "C0": "ok", "C1": "ok", "C2": "ok", "C3": "ok"}, msg: null },
        { title: "The driver sends C2 to executor 2", text: "The driver asks executor 2 to compute C partition 2.", states: {"A0": "ok", "A1": "ok", "A2": "ok", "A3": "ok", "B0": "ok", "B1": "ok", "B2": "ok", "B3": "ok", "C0": "ok", "C1": "ok", "C2": "wanted", "C3": "ok"}, msg: "driver → executor 2: compute C2" },
        { title: "Executor 2 does not answer", text: "Executor 2 is lost, so B2 and C2 are gone with it.", states: {"A0": "ok", "A1": "ok", "A2": "ok", "A3": "ok", "B0": "ok", "B1": "ok", "B2": "lost", "B3": "ok", "C0": "ok", "C1": "ok", "C2": "lost", "C3": "ok"}, msg: "executor 2: no answer" },
        { title: "C2 needs B2, which is also lost", text: "To rebuild C2, the driver needs B2 first. B2 is lost too, so the driver walks back one step to its parent.", states: {"A0": "ok", "A1": "ok", "A2": "ok", "A3": "ok", "B0": "ok", "B1": "ok", "B2": "lost", "B3": "ok", "C0": "ok", "C1": "ok", "C2": "lost", "C3": "ok"}, msg: "driver: C2 needs B2" },
        { title: "Recompute B2 on executor 1", text: "The driver asks executor 1 to recompute B partition 2.", states: {"A0": "ok", "A1": "ok", "A2": "ok", "A3": "ok", "B0": "ok", "B1": "ok", "B2": "rebuilding", "B3": "ok", "C0": "ok", "C1": "ok", "C2": "lost", "C3": "ok"}, msg: "driver → executor 1: recompute B2" },
        { title: "Read A2 from the file", text: "To recompute B2, executor 1 reads A partition 2 from the file. A is the source, so it is still there.", states: {"A0": "ok", "A1": "ok", "A2": "source", "A3": "ok", "B0": "ok", "B1": "ok", "B2": "rebuilding", "B3": "ok", "C0": "ok", "C1": "ok", "C2": "lost", "C3": "ok"}, msg: "executor 1 → file: read A2" },
        { title: "The file returns the rows", text: "The file sends the rows of A partition 2 back to executor 1.", states: {"A0": "ok", "A1": "ok", "A2": "source", "A3": "ok", "B0": "ok", "B1": "ok", "B2": "rebuilding", "B3": "ok", "C0": "ok", "C1": "ok", "C2": "lost", "C3": "ok"}, msg: "file → executor 1: rows" },
        { title: "B2 is back", text: "B2 is rebuilt on executor 1. Its parent was enough to rebuild it.", states: {"A0": "ok", "A1": "ok", "A2": "ok", "A3": "ok", "B0": "ok", "B1": "ok", "B2": "rebuilt", "B3": "ok", "C0": "ok", "C1": "ok", "C2": "lost", "C3": "ok"}, msg: "executor 1 → driver: B2 is back" },
        { title: "Recompute C2 from B2", text: "Now the driver asks executor 1 to recompute C2 from the rebuilt B2.", states: {"A0": "ok", "A1": "ok", "A2": "ok", "A3": "ok", "B0": "ok", "B1": "ok", "B2": "rebuilt", "B3": "ok", "C0": "ok", "C1": "ok", "C2": "rebuilding", "C3": "ok"}, msg: "driver → executor 1: recompute C2 from B2" },
        { title: "C2 is back", text: "C2 is rebuilt. The count can finish.", states: {"A0": "ok", "A1": "ok", "A2": "ok", "A3": "ok", "B0": "ok", "B1": "ok", "B2": "rebuilt", "B3": "ok", "C0": "ok", "C1": "ok", "C2": "rebuilt", "C3": "ok"}, msg: "executor 1 → driver: C2 is back" },
        { title: "Summary", text: "Only two tiles were rebuilt, B2 and C2, and each came from its parent. The other ten tiles were never touched.", states: {"A0": "ok", "A1": "ok", "A2": "ok", "A3": "ok", "B0": "ok", "B1": "ok", "B2": "rebuilt", "B3": "ok", "C0": "ok", "C1": "ok", "C2": "rebuilt", "C3": "ok"}, msg: null }
      ]
    },
    edges: [
      E("The source file was deleted", "Nothing is left to rebuild from.", "If the source had been deleted, the walk back would stop at it, and the lost partition could not be rebuilt.", "Keep the source data until the job is done, or checkpoint before the source can disappear."),
      E("A shuffle output was lost with the executor", "The parent stage has to run again.", "In a wide step, the output of the parent stage lives on the executors. If that executor is gone, the stage that made it must run again.", "Use the external shuffle service, so shuffle files survive an executor loss."),
      E("A parent step is not repeatable", "The rebuilt partition may differ from the lost one.", "If B uses random numbers or the current time, the rebuilt B2 can differ from the one that was lost.", "Keep steps deterministic, or checkpoint so the result is saved and not recomputed.")
    ]
  };

  ST['lineage:4'] = {
    trigger: 'A chain of eight transformations is so long that rebuilding a lost partition would replay all of them.',
    expect: 'After the checkpoint, a rebuild replays four operators instead of eight.',
    command: "sc.setCheckpointDir(\"ckpt\"); op4.checkpoint(); op8.count()",
    sim: {
      kind: 'replay', ops: 8, checkpointAfter: 4,
      steps: [
        { title: "A chain of eight operators", text: "The program defines op1 to op8, one after another. Nothing has run yet. Each operator only records what it will do.", states: ["idle", "idle", "idle", "idle", "idle", "idle", "idle", "idle"], msg: null, cost: null },
        { title: "The first action runs the chain", text: "The first action runs all eight operators once. Nothing in the middle is kept, so only the final result of op8 is kept.", states: ["ran", "ran", "ran", "ran", "ran", "ran", "ran", "result"], msg: "driver → executor: run op1 to op8 once", cost: null },
        { title: "One partition of op8 is lost", text: "The executor holding op8 is lost, so its result is gone. Nothing in the chain is stored, so every operator has to run again.", states: ["gone", "gone", "gone", "gone", "gone", "gone", "gone", "lost"], msg: "executor: result of op8 lost", cost: null },
        { title: "Replay op1", text: "Replay op1 for partition 3, from the source. Replay starts at the source file.", states: ["replay", "wait", "wait", "wait", "wait", "wait", "wait", "wait"], msg: "driver → executor: replay op1", cost: { replayed: 1, of: 8 } },
        { title: "Replay op2", text: "Replay op2 for partition 3, from the source. It runs after op1 is done.", states: ["done", "replay", "wait", "wait", "wait", "wait", "wait", "wait"], msg: "driver → executor: replay op2", cost: { replayed: 2, of: 8 } },
        { title: "Replay op3", text: "Replay op3 for partition 3, from the source. It runs after op2 is done.", states: ["done", "done", "replay", "wait", "wait", "wait", "wait", "wait"], msg: "driver → executor: replay op3", cost: { replayed: 3, of: 8 } },
        { title: "Replay op4", text: "Replay op4 for partition 3, from the source. It runs after op3 is done.", states: ["done", "done", "done", "replay", "wait", "wait", "wait", "wait"], msg: "driver → executor: replay op4", cost: { replayed: 4, of: 8 } },
        { title: "Replay op5", text: "Replay op5 for partition 3, from the source. It runs after op4 is done.", states: ["done", "done", "done", "done", "replay", "wait", "wait", "wait"], msg: "driver → executor: replay op5", cost: { replayed: 5, of: 8 } },
        { title: "Replay op6", text: "Replay op6 for partition 3, from the source. It runs after op5 is done.", states: ["done", "done", "done", "done", "done", "replay", "wait", "wait"], msg: "driver → executor: replay op6", cost: { replayed: 6, of: 8 } },
        { title: "Replay op7", text: "Replay op7 for partition 3, from the source. It runs after op6 is done.", states: ["done", "done", "done", "done", "done", "done", "replay", "wait"], msg: "driver → executor: replay op7", cost: { replayed: 7, of: 8 } },
        { title: "Replay op8", text: "Replay op8 for partition 3, from the source. It runs after op7 is done.", states: ["done", "done", "done", "done", "done", "done", "done", "replay"], msg: "driver → executor: replay op8", cost: { replayed: 8, of: 8 } },
        { title: "op8 is back", text: "The replay has reached op8, and the lost partition is back.", states: ["done", "done", "done", "done", "done", "done", "done", "result"], msg: "executor → driver: op8 is back", cost: { replayed: 8, of: 8 } },
        { title: "Ask for a checkpoint after op4", text: "The program asks for a checkpoint on op4. Spark only marks op4 at this point. Nothing is written yet.", states: ["idle", "idle", "idle", "marked", "idle", "idle", "idle", "result"], msg: "driver: mark op4 for a checkpoint", cost: null },
        { title: "The next action runs op1 to op4", text: "The next action runs op1 to op4 for the checkpoint. Their results are about to be written.", states: ["ran", "ran", "ran", "writing", "idle", "idle", "idle", "result"], msg: "driver → executor: run op1 to op4", cost: null },
        { title: "op4 is saved in reliable storage", text: "op4 is written to reliable storage. Spark no longer needs op1 to op3 to rebuild op8.", states: ["skip", "skip", "skip", "checkpoint", "idle", "idle", "idle", "result"], msg: "executor → storage: write op4", cost: null },
        { title: "The partition of op8 is lost again", text: "The same executor is lost again, so the op8 result is gone.", states: ["skip", "skip", "skip", "checkpoint", "idle", "idle", "idle", "lost"], msg: "executor: result of op8 lost", cost: null },
        { title: "Read op4 from the checkpoint", text: "The rebuild starts at op4. It reads op4 from reliable storage instead of running op1 to op4 again.", states: ["skip", "skip", "skip", "read", "idle", "idle", "idle", "lost"], msg: "driver → storage: read op4", cost: null },
        { title: "Replay op5", text: "Replay op5 from the checkpoint. It runs after op4 is done.", states: ["skip", "skip", "skip", "checkpoint", "replay", "wait", "wait", "wait"], msg: "driver → executor: replay op5", cost: { replayed: 1, of: 4 } },
        { title: "Replay op6", text: "Replay op6 from the checkpoint. It runs after op5 is done.", states: ["skip", "skip", "skip", "checkpoint", "done", "replay", "wait", "wait"], msg: "driver → executor: replay op6", cost: { replayed: 2, of: 4 } },
        { title: "Replay op7", text: "Replay op7 from the checkpoint. It runs after op6 is done.", states: ["skip", "skip", "skip", "checkpoint", "done", "done", "replay", "wait"], msg: "driver → executor: replay op7", cost: { replayed: 3, of: 4 } },
        { title: "Replay op8", text: "Replay op8 from the checkpoint. It runs after op7 is done.", states: ["skip", "skip", "skip", "checkpoint", "done", "done", "done", "replay"], msg: "driver → executor: replay op8", cost: { replayed: 4, of: 4 } },
        { title: "op8 is back, after four replays", text: "The rebuild needed four replays, op5 to op8. Before the checkpoint it would have needed eight.", states: ["skip", "skip", "skip", "checkpoint", "done", "done", "done", "result"], msg: "executor → driver: op8 is back", cost: { replayed: 4, of: 4 } },
        { title: "Summary", text: "Replay cost: eight operators before the checkpoint, four after it. The checkpoint cuts the lineage at op4.", states: ["skip", "skip", "skip", "checkpoint", "done", "done", "done", "result"], msg: null, cost: { replayed: 4, of: 4 } }
      ]
    },
    edges: [
      E("The checkpoint is only marked at first", "Nothing is saved until a job runs.", "checkpoint() must be called before any job runs on the RDD. It marks the RDD, and the write happens during a job, not when the call is made.", "Run an action right after asking for the checkpoint, and check the checkpoint folder before relying on it."),
      E("Checkpoints cost time", "Every checkpoint writes the whole partition to storage.", "Writing to reliable storage takes time and network, and it happens for every partition of the checkpointed RDD.", "Checkpoint only after long chains or expensive steps, not after every operator."),
      E("A local checkpoint is lost with its executor", "Faster, but not safe for data you cannot lose.", "A local checkpoint keeps the data on the executors. If that executor is lost, the checkpoint is lost with it.", "Use a reliable checkpoint for data you cannot afford to lose. Use a local one when a rebuild is cheap.")
    ]
  };

  /* ---------- 04 Stages ---------- */
  ST['stages:1'] = {
    diagrams: [{ kind: SEQ, title: 'Stage planning', src: `sequenceDiagram
  participant U as Your code
  participant D as Driver planner
  U->>D: action on the final dataset
  D->>D: create the result stage
  loop each wide step found going backwards
    D->>D: cut here, create a parent stage
  end
  D->>D: keep narrow steps together inside one stage
  D->>U: run stages, parents first` }],
    trigger: 'Your program calls an action such as collect(). Spark must now decide which steps can run together and which must wait for a shuffle.',
    command: 'lines.map(parse).reduceByKey(add).sortByKey().collect()',
    expect: 'Three stages. The two shuffles, at reduceByKey and sortByKey, each cut the plan once. read and map stay together.',
    sim: {
      kind: 'dag',
      nodes: ['read', 'map', 'reduceByKey', 'sortByKey', 'collect'],
      wide: [false, false, true, true, false],
      maxStages: 3,
      steps: [
        { title: 'Nothing has run yet', text: 'The program only describes the work: read, map, reduceByKey, sortByKey. collect() is the action that asks for an answer. The planner has not cut anything yet.', cur: -1, stages: [] },
        { title: 'Start at the action', text: 'The planner makes the result stage first. It holds collect() and the sortByKey work that feeds it.', cur: 4, stages: [{ id: 3, name: 'Stage 3 · sortByKey + collect', nodes: [3, 4], state: 'walking' }] },
        { title: 'sortByKey is wide: cut here', text: 'sortByKey needs rows from every parent partition, so it cannot be pipelined. The planner cuts before it and makes a parent stage for everything earlier.', cur: 3, stages: [{ id: 3, name: 'Stage 3 · sortByKey + collect', nodes: [3, 4], state: 'built' }, { id: 2, name: 'Stage 2 · parent', nodes: [0, 1, 2], state: 'walking' }] },
        { title: 'reduceByKey is wide too: cut again', text: 'Walking back, reduceByKey is another wide step. Another cut, and another parent stage. Stage 2 keeps only reduceByKey.', cur: 2, stages: [{ id: 3, name: 'Stage 3 · sortByKey + collect', nodes: [3, 4], state: 'built' }, { id: 2, name: 'Stage 2 · reduceByKey', nodes: [2], state: 'built' }, { id: 1, name: 'Stage 1 · read + map', nodes: [0, 1], state: 'walking' }] },
        { title: 'Narrow steps stay together', text: 'read and map each need only their own partition, so they are pipelined into stage 1. No shuffle is needed inside it.', cur: 0, stages: [{ id: 3, name: 'Stage 3 · sortByKey + collect', nodes: [3, 4], state: 'built' }, { id: 2, name: 'Stage 2 · reduceByKey', nodes: [2], state: 'built' }, { id: 1, name: 'Stage 1 · read + map', nodes: [0, 1], state: 'built' }] },
        { title: 'Parents run first', text: 'Only stage 1 has no parent, so it runs first. Stages 2 and 3 wait for its output, one shuffle at a time.', cur: -1, stages: [{ id: 3, name: 'Stage 3 · sortByKey + collect', nodes: [3, 4], state: 'waiting' }, { id: 2, name: 'Stage 2 · reduceByKey', nodes: [2], state: 'waiting' }, { id: 1, name: 'Stage 1 · read + map', nodes: [0, 1], state: 'running' }] }
      ]
    },
    edges: [
      E('Two paths share one parent', 'The shared stage is made once.', 'A dataset is used by two different branches, forming a diamond. A careless planner would create its stage twice and run it twice.', 'The planner remembers stages it already made and links both branches to the same one.'),
      E('The output is already there', 'A stage can be skipped.', 'A stage already ran for an earlier action and its output still exists.', 'The planner marks it as available and goes straight on to the next stage.')
    ]
  };

  ST['stages:2'] = {
    trigger: 'A task in a parent stage finishes, or a worker dies and takes some finished output with it.',
    command: 'counts.collect()  # stage 1 has 4 tasks, stage 2 waits for all 4 outputs',
    expect: 'Stage 2 starts only when the tracker holds 4 of 4 outputs, and it closes again if an output is lost.',
    sim: {
      kind: 'gate',
      tasks: 4,
      steps: [
        { title: 'Stage 2 waits for all four outputs', text: 'Stage 1 has four tasks. Stage 2 needs every one of their outputs before it may start, so it waits.', tiles: [{ s: 'run' }, { s: 'run' }, { s: 'run' }, { s: 'run' }], outputs: 0, parent: 'running', child: 'waiting', msg: null },
        { title: 'Task 1 reports its output', text: 'Task 1 finishes on host A and tells the driver where its output is. The tracker records one of four.', tiles: [{ s: 'done', h: 'A' }, { s: 'run' }, { s: 'run' }, { s: 'run' }], outputs: 1, parent: 'running', child: 'waiting', msg: null },
        { title: 'Tasks 2 and 3 finish', text: 'Two more outputs arrive. Stage 2 still waits, because task 4 is missing.', tiles: [{ s: 'done', h: 'A' }, { s: 'done', h: 'B' }, { s: 'done', h: 'C' }, { s: 'run' }], outputs: 3, parent: 'running', child: 'waiting', msg: null },
        { title: 'The last output arrives', text: 'Task 4 finishes on host D. Four of four outputs are registered, so the gate opens and stage 2 can run.', tiles: [{ s: 'done', h: 'A' }, { s: 'done', h: 'B' }, { s: 'done', h: 'C' }, { s: 'done', h: 'D' }], outputs: 4, parent: 'done', child: 'runnable', msg: null },
        { title: 'Host C dies', text: 'Host C dies with task 3 output on it. The tracker drops that output, so the gate shuts at three of four. Stage 1 goes back to resubmitting, and stage 2 waits again.', tiles: [{ s: 'done', h: 'A' }, { s: 'done', h: 'B' }, { s: 'lost', h: 'C' }, { s: 'done', h: 'D' }], outputs: 3, parent: 'resubmitting', child: 'waiting', msg: null },
        { title: 'A late report is ignored', text: 'A message about the first attempt of task 3 arrives late. It carries the old attempt number, so the tracker ignores it and the gate stays shut.', tiles: [{ s: 'done', h: 'A' }, { s: 'done', h: 'B' }, { s: 'lost', h: 'C' }, { s: 'done', h: 'D' }], outputs: 3, parent: 'resubmitting', child: 'waiting', msg: 'late report: task 3, attempt 0 · ignored' },
        { title: 'Only task 3 reruns', text: 'Task 3 reruns on host D and reports success. Four of four outputs again, so the gate opens and stage 2 runs. Tasks 1, 2 and 4 were never rerun.', tiles: [{ s: 'done', h: 'A' }, { s: 'done', h: 'B' }, { s: 'rerun', h: 'D' }, { s: 'done', h: 'D' }], outputs: 4, parent: 'done', child: 'runnable', msg: null }
      ]
    },
    edges: [
      E('Late messages from an old attempt', 'They must not change anything.', 'A task from an earlier try of the stage reports success after the stage was already restarted.', 'Every message carries its attempt number. The tracker ignores any that are not from the current attempt.'),
      E('A stage that keeps losing outputs', 'It cannot retry forever.', 'The same stage loses its outputs again and again, for example on a very unreliable machine.', 'After a set number of tries the job fails with a clear error instead of looping for ever.')
    ]
  };

  ST['stages:3'] = {
    trigger: 'Two branches of one graph both depend on the same shuffled dataset, so the planner reaches the same parent twice while building one job.',
    command: 'a = raw.reduceByKey(add); a.mapValues(f).join(a.filter(g)).collect()',
    expect: 'The shared shuffle is planned once and runs once. Both branches read its outputs.',
    sim: {
      kind: 'diamond',
      steps: [
        { title: 'The plan is a diamond', text: 'The result joins two branches, A and B. Both come from one shuffled dataset, D. Drawn out, D sits at the top and the result sits at the bottom.', n: { D: 'idle', A: 'idle', B: 'idle', R: 'idle' }, stages: [], memo: [], dup: false },
        { title: 'Walk branch A first', text: 'The planner makes the result stage, then the parent for branch A. Walking back from A reaches D, a wide step, so it creates D\'s stage. The memo now remembers D.', n: { D: 'planned', A: 'planned', B: 'idle', R: 'planned' }, stages: [{ id: 'R', name: 'Result · join + collect', state: 'built' }, { id: 'A', name: 'Map side · branch A', state: 'built' }, { id: 'D', name: 'Shuffle 1 · map side of D', state: 'built' }], memo: ['D → stage D'], dup: false },
        { title: 'Walk branch B', text: 'Now branch B. Its parent is a new stage of its own. Walking back from B, the next step is D again.', n: { D: 'planned', A: 'planned', B: 'planned', R: 'planned' }, stages: [{ id: 'R', name: 'Result · join + collect', state: 'built' }, { id: 'A', name: 'Map side · branch A', state: 'built' }, { id: 'D', name: 'Shuffle 1 · map side of D', state: 'built' }, { id: 'B', name: 'Map side · branch B', state: 'built' }], memo: ['D → stage D'], dup: false },
        { title: 'Reach D again: reuse it', text: 'The second path reaches D. The memo says its stage exists, so the planner links branch B to that stage. No new stage is created.', n: { D: 'reused', A: 'planned', B: 'planned', R: 'planned' }, stages: [{ id: 'R', name: 'Result · join + collect', state: 'built' }, { id: 'A', name: 'Map side · branch A', state: 'built' }, { id: 'D', name: 'Shuffle 1 · map side of D', state: 'built' }, { id: 'B', name: 'Map side · branch B', state: 'built' }], memo: ['D → stage D'], dup: false },
        { title: 'Without the memo, D runs twice', text: 'A planner without a memo would add a second copy of D. The same reads and reduceByKey would run twice, and the join would see two sets of outputs. This planner never makes that copy.', n: { D: 'reused', A: 'planned', B: 'planned', R: 'planned' }, stages: [{ id: 'R', name: 'Result · join + collect', state: 'built' }, { id: 'A', name: 'Map side · branch A', state: 'built' }, { id: 'D', name: 'Shuffle 1 · map side of D', state: 'built' }, { id: 'B', name: 'Map side · branch B', state: 'built' }], memo: ['D → stage D'], dup: true },
        { title: 'D runs once', text: 'Stage D runs once, with 4 tasks. Branches A and B wait for its outputs, and the result waits for them.', n: { D: 'running', A: 'planned', B: 'planned', R: 'planned' }, stages: [{ id: 'D', name: 'Shuffle 1 · map side of D', state: 'running' }, { id: 'A', name: 'Map side · branch A', state: 'waiting' }, { id: 'B', name: 'Map side · branch B', state: 'waiting' }, { id: 'R', name: 'Result · join + collect', state: 'waiting' }], memo: ['D → stage D'], dup: false },
        { title: 'Branches, then the result', text: 'D finished, so A and B run from its outputs, and then the result runs. Shuffle 1 was paid for once, not twice.', n: { D: 'done', A: 'done', B: 'done', R: 'running' }, stages: [{ id: 'D', name: 'Shuffle 1 · map side of D', state: 'done' }, { id: 'A', name: 'Map side · branch A', state: 'done' }, { id: 'B', name: 'Map side · branch B', state: 'done' }, { id: 'R', name: 'Result · join + collect', state: 'running' }], memo: ['D → stage D'], dup: false }
      ]
    },
    edges: [
      E('The memo lives for one plan', 'Reuse holds inside one planning pass.', 'The memo is built while one job is planned. A later job is planned again from the start.', 'Later jobs can still skip a finished shuffle through its registered outputs. See UC-04.'),
      E('Two reduceByKey calls look alike', 'Same code, two shuffles.', 'Two separate reduceByKey calls over the same input look alike, but they are two shuffles with two ids. Spark cannot merge them.', 'Assign the dataset to one variable and reuse it, so the planner sees a single shuffle.')
    ]
  };

  ST['stages:4'] = {
    trigger: 'A second action runs on a dataset whose shuffle already ran in an earlier job of the same application.',
    command: 'counts = df.groupBy("k").count(); counts.collect(); counts.count()',
    expect: 'The second job runs only its result stage. Its map side is marked skipped, because the outputs from job 1 are still registered.',
    sim: {
      kind: 'skip',
      steps: [
        { title: 'Job 1 is about to run', text: 'collect() needs one shuffle. The map side has four tasks, and its outputs stay on the executors that wrote them. The result has two tasks.', j1: [['Map side · shuffle 1', 'idle'], ['Result · 2 tasks', 'idle']], j2: null, outputs: 0, tasks: 0 },
        { title: 'The map side writes its outputs', text: 'Four map tasks run. Each one writes its output for the reducers and reports it to the driver.', j1: [['Map side · shuffle 1', 'run'], ['Result · 2 tasks', 'idle']], j2: null, outputs: 0, tasks: 0 },
        { title: 'All four outputs are registered', text: 'The driver records four of four outputs. The map side is done, and its outputs remain on the executors.', j1: [['Map side · shuffle 1', 'done'], ['Result · 2 tasks', 'idle']], j2: null, outputs: 4, tasks: 4 },
        { title: 'Job 1 finishes', text: 'The result stage fetches the outputs and runs its two tasks.', j1: [['Map side · shuffle 1', 'done'], ['Result · 2 tasks', 'run']], j2: null, outputs: 4, tasks: 4 },
        { title: 'Job 2 reuses the outputs', text: 'count() needs the same shuffle. The planner finds four of four outputs still registered, so the map side is skipped and only the new result waits to run.', j1: [['Map side · shuffle 1', 'done'], ['Result · 2 tasks', 'done']], j2: [['Map side · shuffle 1', 'skip'], ['Result · 2 tasks', 'waiting']], outputs: 4, tasks: 6 },
        { title: 'Only the new result runs', text: 'Only the two result tasks of job 2 run. The shuffle work is not repeated.', j1: [['Map side · shuffle 1', 'done'], ['Result · 2 tasks', 'done']], j2: [['Map side · shuffle 1', 'skip'], ['Result · 2 tasks', 'run']], outputs: 4, tasks: 8 },
        { title: 'A lost output brings back one task', text: 'An executor holding one map output dies, so outputs fall to three of four. The skip no longer holds. The planner resubmits only the missing map task before the result can run.', j1: [['Map side · shuffle 1', 'done'], ['Result · 2 tasks', 'done']], j2: [['Map side · shuffle 1', 'rerun'], ['Result · 2 tasks', 'waiting']], outputs: 3, tasks: 8 }
      ]
    },
    edges: [
      E('An executor with map outputs is lost', 'The skip stops at the missing output.', 'Outputs live on the executor that wrote them. When that executor dies, some outputs disappear, and the stage is no longer complete.', 'The planner resubmits only the missing map tasks. Surviving outputs are reused.'),
      E('Shuffle files are cleaned up', 'The skip needs the outputs to still exist.', 'Shuffle files are removed when the application no longer needs them, for example after a long idle time or through external cleanup.', 'Spark recomputes the map side. Cache the result if reuse must survive a long gap.')
    ]
  };

  ST['stages:5'] = {
    trigger: 'A join runs on two inputs that may already be laid out by the same key, such as two bucketed tables.',
    command: 'spark.table("orders").join(spark.table("customers"), "id").explain()',
    expect: 'The plan shows the join with no exchange under either input when the layouts match.',
    sim: {
      kind: 'copart',
      steps: [
        { title: 'Two tables, one join', text: 'orders and customers join on id. Spark cannot see how either side is laid out, so it must assume the rows are scattered.', a: { name: 'orders', tag: 'layout unknown', parts: 8, set: false }, b: { name: 'customers', tag: 'layout unknown', parts: 8, set: false }, plan: [], moved: 'not planned yet' },
        { title: 'Without a match: exchange both sides', text: 'Each side is hashed by id and written out, then read back by the join. That makes three stages. Every row of both tables moves across the network.', a: { name: 'orders', tag: 'layout unknown', parts: 8, set: false }, b: { name: 'customers', tag: 'layout unknown', parts: 8, set: false }, plan: [{ name: 'orders → hash(id)', kind: 'out' }, { name: 'customers → hash(id)', kind: 'out' }, { name: 'join + collect', kind: 'in' }], moved: 'every row, both sides' },
        { title: 'Matching layout: partition i meets partition i', text: 'Both tables are laid out by hash(id) into 8 partitions, with the same partitioner. Each join task reads partition i of orders and partition i of customers directly.', a: { name: 'orders', tag: 'hash(id) % 8', parts: 8, set: true }, b: { name: 'customers', tag: 'hash(id) % 8', parts: 8, set: true }, plan: [{ name: 'join + collect', kind: 'local' }], moved: 'nothing' },
        { title: 'One side changes its partition count', text: 'customers is now laid out with 16 partitions, so the partitioners no longer match. Spark exchanges customers again. orders can stay where it is, but the join is two stages once more.', a: { name: 'orders', tag: 'hash(id) % 8', parts: 8, set: true }, b: { name: 'customers', tag: 'hash(id) % 16', parts: 16, set: false }, plan: [{ name: 'customers → hash(id) % 8', kind: 'out' }, { name: 'join + collect', kind: 'in' }], moved: 'customers only' }
      ]
    },
    edges: [
      E('Bucket counts differ', 'The exchange comes back.', 'One table uses 8 buckets and the other uses 16. The layouts do not match, so Spark exchanges the side that does not fit.', 'Rebuild one table with the same bucket count and key. Then check explain() again.'),
      E('The layout is trusted, not checked', 'A wrong layout gives wrong joins.', 'Spark trusts the bucket metadata. If files were written with another key or partitioner, the join can return wrong rows without an error.', 'Write both tables with the same job and check their layout in the catalog before joining.')
    ]
  };

  ST['stages:6'] = {
    trigger: 'A stage is planned with a partition count that differs from the number of executor slots.',
    command: 'df.repartition(12).count()  # 4 cores: 12 tasks run in 3 waves',
    expect: 'The stage has one task per partition. The slots set how many run together, so the number of waves is partitions divided by slots, rounded up.',
    sim: {
      kind: 'waves',
      steps: [
        { title: 'Count the partitions', text: 'Stage 1 reads 12 partitions. Spark makes one task per partition, so the stage has 12 tasks. The executors offer four slots.', parts: 12, slots: 4, started: false, done: 0 },
        { title: 'Wave 1 fills all four slots', text: 'Four tasks start at once, one in each slot. The other eight wait in line for a free slot.', parts: 12, slots: 4, started: true, done: 0 },
        { title: 'Wave 2 starts as slots free up', text: 'Each slot takes its next task as soon as its last one finishes. The second wave is four more tasks.', parts: 12, slots: 4, started: true, done: 1 },
        { title: 'Wave 3 is the last', text: 'The third wave runs the final four tasks. Twelve tasks on four slots take three rounds.', parts: 12, slots: 4, started: true, done: 2 },
        { title: 'Everything is done', text: 'All 12 tasks finished in three waves. More slots would shorten the stage. More partitions help only while they outnumber the slots.', parts: 12, slots: 4, started: true, done: 3 },
        { title: 'repartition(6): 6 tasks, two waves', text: 'Six tasks now run. Four run in wave 1, and only two run in wave 2. Two slots sit idle in that second wave.', parts: 6, slots: 4, started: true, done: 0 },
        { title: 'Two partitions leave slots idle', text: 'With 2 partitions there is one wave, and two of the four slots never get work. More partitions, not more executors, would put them to use.', parts: 2, slots: 4, started: true, done: 0 }
      ]
    },
    edges: [
      E('Too few partitions for the slots', 'Slots sit idle for the whole stage.', 'A stage with 2 tasks on 8 slots leaves 6 slots idle until it ends.', 'Raise the partition count to at least the slot count, ideally a multiple of it.'),
      E('Too many tiny partitions', 'Scheduling overhead dominates.', 'A stage with 20,000 tiny partitions spends more time starting tasks than doing real work.', 'Coalesce, or set a target size, so each task reads a useful amount of data.')
    ]
  };

  /* ---------- 05 Scheduling ---------- */
  ST['schedule:1'] = {
    trigger: 'Workers have just registered and a batch of tasks is waiting to be run.',
    sim: {
      actors: ['Worker', 'Scheduler', 'Task queue'],
      steps: [
        S('Tasks are waiting', 'Six tasks sit in the queue. Nothing runs until a worker has free room.', null, { 'Task queue': ['task 1', 'task 2', 'task 3', 'task 4', 'task 5', 'task 6'] }),
        S('The worker offers room', 'The worker says it has four free slots. A slot is room to run one task at a time.', ['Worker', 'Scheduler', 'I have 4 free slots'], { Worker: ['slot 1: free', 'slot 2: free', 'slot 3: free', 'slot 4: free'] }),
        S('Match tasks to the offer', 'The scheduler picks tasks, preferring ones whose data already sits on this worker. Moving the job to the data is cheaper than moving the data.', ['Scheduler', 'Task queue', 'take tasks 1 to 4'], { 'Task queue': ['!task 1 chosen', '!task 2 chosen', '!task 3 chosen', '!task 4 chosen', 'task 5', 'task 6'] }),
        S('Send the launch messages', 'The scheduler sends the four tasks to the worker.', ['Scheduler', 'Worker', 'launch tasks 1 to 4'], { Worker: ['+slot 1: task 1', '+slot 2: task 2', '+slot 3: task 3', '+slot 4: task 4'] }),
        S('The worker runs them', 'All four slots are busy, so the scheduler cannot send more. Running tasks never go above the slots the worker offered.', null, { 'Task queue': ['task 5', 'task 6'] }),
        S('One task finishes', 'Task 2 finishes and reports back. Its slot is free again.', ['Worker', 'Scheduler', 'task 2 done, 1 slot free'], { Worker: ['slot 1: task 1', 'slot 2: free', 'slot 3: task 3', 'slot 4: task 4'] }),
        S('The next task goes in', 'The scheduler sends task 5 into the free slot. This repeats until the queue is empty.', ['Scheduler', 'Worker', 'launch task 5'], { Worker: ['slot 1: task 1', '+slot 2: task 5', 'slot 3: task 3', 'slot 4: task 4'], 'Task queue': ['task 6'] })
      ]
    },
    edges: [
      E('No worker holds the data', 'Wait a little, then go anywhere.', 'All workers that have the data are busy, but others are idle.', 'The scheduler waits a short, limited time for a local slot. If none opens, it runs the task on another worker and moves the data over.'),
      E('Tasks that are too short', 'The boss becomes the bottleneck.', 'If each task takes a few milliseconds, sending messages takes longer than the work itself.', 'Make tasks bigger by using fewer, larger partitions, so each message pays for real work.')
    ]
  };

  ST['schedule:2'] = {
    trigger: 'A task attempt is created, runs, and ends in one of a few ways: finished, failed or killed.',
    sim: {
      actors: ['Task attempt', 'Scheduler', 'Worker slot'],
      steps: [
        S('Created and waiting', 'The attempt exists but no slot is free yet.', null, {}, { 'Task attempt': 'PENDING', 'Worker slot': 'BUSY' }),
        S('A slot opens', 'The scheduler matches the attempt to a free slot and sends the launch message.', ['Scheduler', 'Worker slot', 'launch attempt'], {}, { 'Task attempt': 'LAUNCHED', 'Worker slot': 'RESERVED' }),
        S('It runs', 'The worker starts the task code.', ['Worker slot', 'Task attempt', 'start'], {}, { 'Task attempt': 'RUNNING', 'Worker slot': 'IN USE' }),
        S('It finishes', 'The attempt reports success. Its state is FINISHED, and the slot is free for the next task.', ['Task attempt', 'Scheduler', 'done'], {}, { 'Task attempt': 'FINISHED', 'Worker slot': 'FREE' }),
        S('Another attempt fails', 'A second attempt hits an error and reports FAILED. The slot is freed, and the scheduler may try the task again as a new attempt.', ['Task attempt', 'Scheduler', 'failed'], {}, { 'Task attempt': 'FAILED', 'Worker slot': 'FREE' }),
        S('A silent worker', 'A third attempt runs on a worker that stops sending heartbeats. After a while the scheduler decides it is gone and marks the attempt failed.', ['Scheduler', 'Task attempt', 'no heartbeat, failed'], {}, { 'Task attempt': 'FAILED', 'Worker slot': 'LOST' }),
        S('A late success is ignored', 'If a killed or failed attempt reports success afterwards, the report is ignored. An attempt only ever ends once.', ['Task attempt', 'Scheduler', 'late: success'], { 'Scheduler': ['~late report ignored'] })
      ]
    },
    edges: [
      E('A worker goes quiet', 'Is it slow or dead?', 'A running task is on a worker that stops answering. The scheduler cannot tell right away if it is slow or gone.', 'Workers send heartbeats every few seconds. After several missed heartbeats the attempt is marked failed and the task is run again elsewhere.'),
      E('A success arrives too late', 'It must not count twice.', 'An attempt that was already killed or replaced reports success afterwards.', 'Each attempt can end only once. Later reports for an attempt that already ended are ignored.')
    ]
  };

  /* ---------- 06 Shuffle ---------- */
  ST['schedule:3'] = {
    trigger: 'A task prefers the executor that holds its data, but every slot on that executor is busy right now.',
    command: 'spark-submit --conf spark.locality.wait=3s app.py  # 3s is the default',
    expect: 'The task waits at most one locality wait per level it passes, then runs somewhere else. The delay is bounded.',
    sim: {
      kind: 'ladder',
      steps: [
        { title: 'The task wants its data', text: 'The block the task reads is cached on executor 1. The scheduler first looks for a free slot on executor 1, the best level, which is PROCESS_LOCAL.' },
        { title: 'No slot there: start a wait', text: 'Executor 1 is full. The scheduler starts a timer and waits up to spark.locality.wait, 3 seconds by default, for a slot at this level.' },
        { title: 'Timer ends: step down one level', text: 'No PROCESS_LOCAL slot appeared. The scheduler moves to NODE_LOCAL, meaning any executor on the same host, and starts a new wait.' },
        { title: 'A slot opens on the same host', text: 'Executor 2 on the same host frees a slot before the timer ends. The task starts there and does not cross hosts to read its data.' },
        { title: 'Every level gave up: run anywhere', text: 'If no slot had appeared on the same host either, the scheduler would also wait at RACK_LOCAL, then run the task on any free slot. Each wait is bounded, so the task always runs.' },
        { title: 'Set the wait to zero', text: 'With spark.locality.wait=0 the scheduler does not wait at all and takes the first free slot. Longer waits keep more reads local, at the cost of idle time.' }
      ]
    },
    edges: [
      E('No slot at the data\'s executor', 'Wait a bounded time, then step down.', 'The data is on one executor, which is busy. Waiting without limit would leave the other slots idle.', 'Each locality level gets a bounded wait (spark.locality.wait, default 3 s). After it, the task moves to the next level.'),
      E('The wait costs more than a remote read', 'Lower the wait, not the rule.', 'For short tasks or a fast network, a 3 s wait can take longer than the read it saves.', 'Lower spark.locality.wait, or set a per-level value such as spark.locality.wait.node, after measuring.')
    ]
  };

  ST['schedule:4'] = {
    trigger: 'A task attempt fails because of an error in the application, such as an exception in user code or bad input.',
    command: 'spark-submit --conf spark.task.maxFailures=4 app.py  # 4 is the default',
    expect: 'The same task may fail up to 4 times. The fourth failure aborts the job with the last error.',
    sim: {
      kind: 'budget',
      steps: [
        { title: 'Attempt 0 starts', text: 'Task 7 starts its first attempt. Nothing has failed yet, so all 4 attempts are still available.' },
        { title: 'Attempt 0 fails', text: 'An exception in the user code fails the attempt. The scheduler records the reason and queues the task again as a new attempt.' },
        { title: 'Attempt 1 fails too', text: 'The retry runs on another executor and fails with the same error. Two failures are now on record, and two attempts remain.' },
        { title: 'Attempt 2 fails', text: 'The third attempt fails in the same way. One attempt is left.' },
        { title: 'Attempt 3 fails: the limit is reached', text: 'The fourth failure uses up spark.task.maxFailures. The scheduler stops retrying this task.' },
        { title: 'The job is aborted', text: 'The job stops, and its error message shows the last failure. Retrying more would only repeat the same error.' }
      ]
    },
    edges: [
      E('A flaky failure, then success', 'The retry hides it.', 'A network blip fails one attempt. The next attempt on another executor succeeds, and the job completes.', 'The failed attempt stays in the logs, and only the successful attempt produces the result.'),
      E('A deterministic error', 'Retries only repeat it.', 'Bad input or a bug in the code fails the same way on every attempt, so each retry wastes time.', 'After the fourth failure the job aborts with the task error. Fix the cause, then rerun.')
    ]
  };

  ST['schedule:5'] = {
    trigger: 'Each task needs 2 cores (spark.task.cpus=2), and the executor offers 4 cores.',
    command: 'spark-submit --executor-cores 4 --conf spark.task.cpus=2 app.py',
    expect: 'Two tasks run at once on this executor. The number of slots is executor cores divided by spark.task.cpus, rounded down.',
    sim: {
      kind: 'cores',
      steps: [
        { title: 'The executor offers 4 cores', text: 'The executor registers with 4 free cores. Nothing is running yet.' },
        { title: 'The first task takes 2 cores', text: 'The scheduler matches task 1 to the offer. It needs 2 cores, so it takes 2 of the 4.' },
        { title: 'A second task fits in the rest', text: 'Task 2 also needs 2 cores. The 2 cores left are exactly enough, so it starts. All 4 cores are now busy.' },
        { title: 'A third task waits', text: 'Task 3 is ready, but no 2 free cores remain. It waits in the queue. The executor is not idle: it is full.' },
        { title: 'Task 1 finishes', text: 'Task 1 reports success and frees its 2 cores. The scheduler offers them again, and task 3 starts.' },
        { title: 'Compare with spark.task.cpus=1', text: 'With one core per task, the same 4 cores would run 4 tasks at once. The same hardware gives twice the slots.' }
      ]
    },
    edges: [
      E('Cores are not a multiple of cpus', 'Some cores sit idle.', 'With 5 cores and spark.task.cpus=2, only 2 tasks run at once and one core stays idle.', 'Choose executor cores as a multiple of spark.task.cpus, or accept the idle core.'),
      E('A task needs more cores than an executor has', 'It never fits.', 'spark.task.cpus=4 on an executor with 2 cores: no offer can cover the task, so it waits with nothing else running there.', 'Set executor cores to at least spark.task.cpus, or lower spark.task.cpus.')
    ]
  };

  ST['shuffle:1'] = {
    diagrams: [{ kind: SEQ, title: 'Map-side write', src: `sequenceDiagram
  participant T as Map task
  participant M as In-memory map
  participant D as Disk
  participant R as Driver
  T->>M: add each record and combine by key
  loop memory budget exceeded
    M->>D: sort and spill a run
  end
  T->>D: merge runs into one data file
  T->>D: write an index with one offset per reducer
  T->>R: register where the output lives` }],
    trigger: 'A map task has finished reading its partition and must leave its results where the reduce tasks can pick them up.',
    sim: {
      actors: ['Map task', 'Memory', 'Disk', 'Driver'],
      steps: [
        S('Records come in', 'The task reads six records. Each is a word and a count of 1.', null, { 'Map task': ['cat 1', 'dog 1', 'cat 1', 'bird 1', 'dog 1', 'cat 1'] }),
        S('Combine as you go', 'Instead of keeping six records, the task adds them up in memory by word: cat 3, dog 2, bird 1. Less data to move later.', ['Map task', 'Memory', 'add up by key'], { Memory: ['cat 3', 'dog 2', 'bird 1'] }),
        S('Memory is full, so write a run', 'If memory runs out, the task sorts what it has and writes it to disk as a "run", then makes room. This can happen several times.', ['Memory', 'Disk', 'spill sorted run'], { Disk: ['+run 1: bird 1, cat 2'] }),
        S('Decide who gets which key', 'Each word goes to one reduce task, chosen by a fixed formula on the word. Here reducer 0 gets bird and cat, and reducer 1 gets dog.', ['Map task', 'Memory', 'pick a reducer per key'], { Memory: ['reducer 0: bird 1, cat 3', 'reducer 1: dog 2'] }),
        S('One data file', 'The task merges its runs and the memory leftovers into a single file, ordered by reducer.', ['Memory', 'Disk', 'write data file'], { Disk: ['run 1', '+data file: [bird, cat] [dog]'] }),
        S('An index file', 'Next to it goes a tiny index that says where each reducer\'s part starts: reducer 0 at byte 0, reducer 1 at byte 40. A reducer can read just its slice.', ['Map task', 'Disk', 'write index'], { Disk: ['data file: [bird, cat] [dog]', '+index: r0 at 0, r1 at 40'] }),
        S('Tell the driver', 'The task reports where its files are. The data never passed through the driver. Only the address did.', ['Map task', 'Driver', 'my output is on host A'], { Driver: ['+map task 1: host A'] })
      ]
    },
    edges: [
      E('Almost every key is different', 'Combining saves nothing.', 'If each word appears once, adding up in memory removes no records, and the work is wasted.', 'Spark skips the combine for jobs where it cannot help, such as grouping everything per key.'),
      E('Too many tiny slices', 'Reducers read many small pieces.', 'With thousands of reducers, each slice of a file is very small, so reducers waste time jumping around the disk.', 'Use fewer reduce partitions, or let Spark merge small ones at run time.')
    ]
  };

  ST['shuffle:2'] = {
    trigger: 'A reduce task starts. It needs its own slice of the output of every map task, and those slices live on different machines.',
    sim: {
      actors: ['Reducer', 'Driver', 'Map outputs'],
      steps: [
        S('The reducer starts', 'Reducer 1 needs the "dog" data from all three map tasks, but it does not know where they are.', null, { Reducer: ['needs slice 1 of map 0, 1, 2'] }),
        S('Ask the driver', 'The driver keeps a map of where every map output lives.', ['Reducer', 'Driver', 'where are the map outputs?']),
        S('Get the addresses', 'Map 0 is on host A, map 1 on host B, map 2 on host C.', ['Driver', 'Reducer', 'A, B, C'], { Driver: ['map 0 → A', 'map 1 → B', 'map 2 → C'] }),
        S('Fetch in parallel, with a limit', 'The reducer asks hosts A and B at once. Host C waits, because only a few requests may be in the air at the same time. This protects memory and connections.', ['Reducer', 'Map outputs', 'fetch from A and B'], { 'Map outputs': ['+A: slice 1 (dog 2)', '+B: slice 1 (dog 1)', '~C: waiting'] }),
        S('The last one is fetched', 'As soon as a request finishes, the next starts. The data of host C arrives.', ['Map outputs', 'Reducer', 'slices from C'], { 'Map outputs': ['A: done', 'B: done', '+C: slice 1 (dog 4)'], Reducer: ['dog 2', 'dog 1', 'dog 4'] }),
        S('Merge the parts', 'Now the reducer adds the partial counts for each key: dog is 2 + 1 + 4 = 7.', ['Reducer', 'Reducer', 'add up'], { Reducer: ['+dog 7'] }),
        S('Let go of the buffers', 'Each fetched part is thrown away as soon as it has been used, so memory stays small.', null, { 'Map outputs': [] })
      ]
    },
    edges: [
      E('A host is dead', 'The fetch fails.', 'The reducer cannot reach host B, so the data it needs is gone.', 'It reports a fetch failure to the driver. The driver reruns just the lost map tasks, then the reducer tries again.'),
      E('Too many requests at once', 'Memory or connections run out.', 'A reducer with thousands of map outputs asks them all at the same moment.', 'There is a cap on bytes and requests in flight. Spark only asks for more as earlier ones finish.')
    ]
  };

  /* ---------- 07 Memory ---------- */
  ST['memory:1'] = {
    trigger: 'A task is building a big table in memory, for example counting words, and it keeps growing.',
    sim: {
      actors: ['Task', 'Memory manager', 'Disk'],
      steps: [
        S('Ask before growing', 'The task is counting words. Before the table gets bigger, it asks the memory manager for another 64 MB.', ['Task', 'Memory manager', 'may I have 64 MB more?'], { Task: ['table: 64 MB'], 'Memory manager': ['pool: 128 MB, used 64 MB'] }),
        S('Granted', 'There is room, so the answer is yes and the table grows.', ['Memory manager', 'Task', 'yes'], { Task: ['table: 128 MB'], 'Memory manager': ['pool: 128 MB, used 128 MB'] }),
        S('Asked again, refused', 'The pool is now full, so the next request is refused. The task cannot grow any more.', ['Task', 'Memory manager', 'may I have 64 MB more?'], { 'Memory manager': ['!pool full: refused'] }),
        S('Write a run to disk', 'Instead of crashing, the task sorts its table and writes it to disk as a run. Then it hands back that memory.', ['Task', 'Disk', 'spill run 1'], { Disk: ['+run 1 (sorted)'], Task: ['table: empty'], 'Memory manager': ['pool: 128 MB, used 0 MB'] }),
        S('Keep going', 'The task starts a new, small table and goes on reading. When memory fills again, it writes run 2.', ['Task', 'Disk', 'spill run 2'], { Disk: ['run 1', '+run 2'] }),
        S('Merge at the end', 'At the end the task merges run 1, run 2 and what is left in memory, adding up counts for the same word.', ['Disk', 'Task', 'merge runs'], { Task: ['+final counts'] }),
        S('Same answer', 'The result is exactly what it would have been with unlimited memory. Spilling only costs time.', null, {})
      ]
    },
    edges: [
      E('A structure that cannot spill', 'The task fails.', 'Some data, such as a big list that must stay whole, cannot be written out in pieces. If memory is refused, there is no way out.', 'Task fails with an out-of-memory error. Give each task more memory, or make partitions smaller so the structure fits.'),
      E('Too many runs', 'The final merge is slow.', 'With a tiny memory pool, the task writes hundreds of small runs, and merging them takes long.', 'Give tasks more memory or use fewer, bigger tasks so fewer runs are written.')
    ]
  };

  ST['memory:2'] = {
    diagrams: [{ kind: STATE, title: 'Pressure outcomes', src: `stateDiagram-v2
  [*] --> Growing: task needs memory
  Growing --> Growing: grant given
  Growing --> Spilling: grant refused, can spill
  Spilling --> Growing: memory released
  Growing --> TaskFailed: grant refused, cannot spill
  Growing --> Killed: process passes the container limit
  TaskFailed --> [*]
  Killed --> [*]` }],
    trigger: 'A worker gets close to the memory limit of the container it runs in.',
    sim: {
      actors: ['Spark accounting', 'Memory Spark cannot see', 'Container (OS)'],
      steps: [
        S('Two kinds of memory', 'The container has a hard limit of 10 GB. Spark keeps careful books for 8 GB of it. The rest is for things Spark does not count.', null, { 'Spark accounting': ['limit: 8 GB'], 'Memory Spark cannot see': ['network buffers', 'native code', 'thread stacks'], 'Container (OS)': ['hard limit: 10 GB'] }),
        S('Tasks grow', 'Tasks ask for more memory. Spark accounting gives it out until its 8 GB are used.', ['Spark accounting', 'Spark accounting', 'grants up to 8 GB'], { 'Spark accounting': ['used: 8 of 8 GB'] }),
        S('Spark says no first', 'The next request is refused. Spillable data is written to disk, and the work goes on safely.', ['Spark accounting', 'Spark accounting', 'refuse, spill to disk'], { 'Spark accounting': ['!refused, spilled', 'used: 8 of 8 GB'] }),
        S('Hidden memory keeps growing', 'Meanwhile network buffers and native code grow outside the books. Spark cannot refuse them because it does not know about them.', null, { 'Memory Spark cannot see': ['network buffers: 1 GB', 'native code: 1.5 GB', 'thread stacks: 0.5 GB'] }),
        S('The container crosses its limit', '8 GB plus 3 GB is 11 GB. This is more than the 10 GB limit.', null, { 'Container (OS)': ['!used: 11 GB of 10 GB'] }),
        S('The OS kills the container', 'The operating system stops the container at once. There is no tidy error message from Spark. The driver just sees that a worker has vanished.', ['Container (OS)', 'Spark accounting', 'killed'], { 'Container (OS)': ['!killed'] }),
        S('The fix', 'Leave overhead room: ask the cluster for more memory than Spark itself uses. It is room for the memory Spark cannot count.', null, { 'Spark accounting': ['limit: 8 GB'], 'Container (OS)': ['+limit: 12 GB'] })
      ]
    },
    edges: [
      E('It looks like a lost worker', 'Not like an out-of-memory error.', 'The operating system kills the process, so Spark writes no helpful message. The logs show "executor lost".', 'Look for exit code 137 or "killed by YARN/Kubernetes for exceeding memory", and raise memory overhead.'),
      E('More memory, same problem', 'Raising memory is not enough.', 'You raise the Spark memory setting but not the container size, so the hidden part is still squeezed.', 'Raise Spark memory and the overhead together.')
    ]
  };

  /* ---------- 08 Recovery ---------- */
  ST['recovery:1'] = {
    trigger: 'During the reduce stage, a worker that holds map output dies.',
    sim: {
      actors: ['Reducer', 'Driver', 'Dead worker', 'Other workers'],
      steps: [
        S('Everything is running', 'Reducers are fetching map output. Worker X holds the output of maps 1 and 2. Worker Y holds map 3.', null, { Driver: ['map 1, 2 on X', 'map 3 on Y'], 'Dead worker': ['output of map 1, 2'], 'Other workers': ['output of map 3'] }),
        S('A worker dies', 'Worker X crashes and its files are gone.', null, { 'Dead worker': ['!crashed'] }),
        S('A fetch fails', 'A reducer asks X for map 1 and gets no answer. It cannot go on without that data, so it tells the driver which output it could not get.', ['Reducer', 'Driver', 'cannot fetch map 1 from X'], { Reducer: ['!stuck: needs map 1'] }),
        S('Forget everything on X', 'The driver does not trust anything on X any more. It strikes both outputs off its list, not only the one that failed.', ['Driver', 'Driver', 'forget X'], { Driver: ['!map 1 lost', '!map 2 lost', 'map 3 on Y'] }),
        S('Redo only what is missing', 'Maps 1 and 2 run again on the surviving workers. Map 3 is not touched, because its output is still safe on Y.', ['Driver', 'Other workers', 'rerun map 1 and 2'], { 'Other workers': ['output of map 3', '+rerun map 1', '+rerun map 2'] }),
        S('Update the addresses', 'The new outputs are registered with the driver.', ['Other workers', 'Driver', 'new outputs ready'], { Driver: ['+map 1 on Y', '+map 2 on Z', 'map 3 on Y'] }),
        S('The reducers try again', 'The reducers ask the driver for the new addresses, fetch the data and carry on.', ['Reducer', 'Driver', 'where are they now?'], { Reducer: ['+fetching from Y and Z'] })
      ]
    },
    edges: [
      E('A shuffle service keeps the files', 'Sometimes nothing needs redoing.', 'A separate shuffle service stores the files outside the worker. If only the worker died, the files are still there.', 'The driver still knows where the files are, and reducers fetch them as normal.'),
      E('The rerun gives a different answer', 'Randomness breaks recovery.', 'If a map step uses random numbers or the clock, the rerun output is not the same as the lost one, and reducers may mix old and new data.', 'Keep steps deterministic, or fix the random seed.')
    ]
  };

  ST['recovery:2'] = {
    trigger: 'Most tasks have finished, but one is far slower than the rest and everyone is waiting for it.',
    sim: {
      actors: ['Driver', 'Slow task (copy 1)', 'Backup task (copy 2)'],
      steps: [
        S('One task lags', 'Nine of ten tasks finished in about 10 seconds. Task 7 has been running for 40 seconds.', null, { Driver: ['9 of 10 tasks done'] }, { 'Slow task (copy 1)': 'RUNNING 40 s' }),
        S('Compare with the middle', 'After most tasks finish, the driver compares the slow one with the median time. Task 7 is far above it.', ['Driver', 'Driver', 'compare with median 10 s'], { Driver: ['9 of 10 done', '!task 7 is a straggler'] }),
        S('Start a second copy', 'The driver starts a second copy of task 7 on a different, free worker. Perhaps the first one sits on a sick machine.', ['Driver', 'Backup task (copy 2)', 'run task 7 again'], {}, { 'Backup task (copy 2)': 'RUNNING' }),
        S('Both run', 'Now two copies of the same work are racing.', null, {}, { 'Slow task (copy 1)': 'RUNNING', 'Backup task (copy 2)': 'RUNNING' }),
        S('One wins', 'The backup finishes first, in 12 seconds, and reports its result.', ['Backup task (copy 2)', 'Driver', 'done'], { Driver: ['10 of 10 done', '+task 7 from copy 2'] }, { 'Backup task (copy 2)': 'WON' }),
        S('Stop the other', 'The driver kills the slow copy and throws away anything it wrote. Only one result per task counts.', ['Driver', 'Slow task (copy 1)', 'kill'], {}, { 'Slow task (copy 1)': 'KILLED' })
      ]
    },
    edges: [
      E('The loser may already have written something', 'Extra copies can leave side effects.', 'If a task also calls an outside service or writes to a database, the killed copy may have already done it.', 'Keep task code free of side effects, or write through the commit step so only one copy\'s output becomes visible.'),
      E('The slowness is the data, not the machine', 'A second copy is just as slow.', 'If one partition is simply huge, a copy on a fast worker still needs just as long.', 'Fix the skew by splitting the big partition. Speculation helps only when the machine is the problem.')
    ]
  };

  /* ---------- 09 Commit ---------- */
  ST['commit:1'] = {
    trigger: 'A task attempt has finished writing its output and wants to make it final.',
    sim: {
      actors: ['Attempt 1', 'Attempt 2 (copy)', 'Coordinator', 'Final folder'],
      steps: [
        S('Write privately first', 'Two copies of the same task are running. Each writes into its own temporary folder, so they never overwrite each other.', null, { 'Attempt 1': ['temp folder 1: part-0'], 'Attempt 2 (copy)': ['temp folder 2: part-0'], 'Final folder': ['(empty)'] }),
        S('Attempt 1 asks permission', 'Attempt 1 finishes first and asks the commit coordinator: may I publish part 0?', ['Attempt 1', 'Coordinator', 'may I commit part 0?']),
        S('First one is allowed', 'The coordinator has not heard about part 0 yet, so it says yes and remembers that attempt 1 won.', ['Coordinator', 'Attempt 1', 'yes'], { Coordinator: ['part 0: attempt 1 wins'] }),
        S('Attempt 2 asks too', 'Attempt 2 finishes a moment later and asks the same question.', ['Attempt 2 (copy)', 'Coordinator', 'may I commit part 0?']),
        S('Second one is refused', 'The answer is no, part 0 already has a winner. The refusal has no effect on anything already published.', ['Coordinator', 'Attempt 2 (copy)', 'no'], { 'Attempt 2 (copy)': ['!denied'] }),
        S('The winner publishes', 'Attempt 1 moves its file into the final folder.', ['Attempt 1', 'Final folder', 'move part-0'], { 'Final folder': ['+part-0'], 'Attempt 1': [] }),
        S('The loser cleans up', 'Attempt 2 deletes its temporary folder. Nothing is left behind.', ['Attempt 2 (copy)', 'Attempt 2 (copy)', 'delete temp folder'], { 'Attempt 2 (copy)': [] })
      ]
    },
    edges: [
      E('The winner dies before publishing', 'Part 0 would be missing.', 'Attempt 1 got permission and crashed before moving the file.', 'The coordinator notices the attempt failed and allows a new attempt to try again.'),
      E('A denied attempt must clean up', 'Otherwise leftovers pile up.', 'A refused attempt leaves its temporary files in the output area.', 'Every denied or failed attempt deletes its own temporary files.')
    ]
  };

  ST['commit:2'] = {
    trigger: 'Every partition says it is committed, and the job must now declare the whole output ready.',
    sim: {
      actors: ['Driver', 'Output folder', 'Reader'],
      steps: [
        S('Parts appear one by one', 'Each partition publishes its file. On a cloud object store, files appear one at a time, not all at once.', ['Driver', 'Output folder', 'parts being published'], { 'Output folder': ['part-0', 'part-1'] }, { 'Output folder': 'FILLING' }),
        S('A reader looks too early', 'A reader lists the folder now. It sees two files and might think this is the full result. It is not.', ['Reader', 'Output folder', 'list files'], { Reader: ['!sees part-0, part-1 only'] }),
        S('Check every partition', 'The driver waits until all four partitions report committed.', ['Driver', 'Output folder', 'all 4 parts are committed'], { 'Output folder': ['part-0', 'part-1', 'part-2', 'part-3'] }),
        S('The marker is written last', 'The driver then writes one extra tiny file, _SUCCESS. It means: this output is complete.', ['Driver', 'Output folder', 'write _SUCCESS'], { 'Output folder': ['part-0', 'part-1', 'part-2', 'part-3', '+_SUCCESS'] }, { 'Output folder': 'COMPLETE' }),
        S('Readers trust the marker', 'A correct reader looks for _SUCCESS first, not at the file list.', ['Reader', 'Output folder', 'is _SUCCESS there?'], { Reader: ['+yes, read all 4 parts'] }),
        S('If the job fails', 'If the job failed midway, there is no marker. Readers see that and treat the output as incomplete, even if some files exist.', null, { 'Output folder': ['part-0', 'part-1', '!no _SUCCESS'], Reader: ['!output incomplete, skip'] }, { 'Output folder': 'INCOMPLETE' })
      ]
    },
    edges: [
      E('No atomic rename on object stores', 'Files show up one at a time.', 'A cloud object store cannot rename a whole folder in one step, so results appear gradually.', 'Use a committer built for the store, and rely on the marker file, not on the folder listing.'),
      E('A reader that only lists files', 'It can read a partial result.', 'A downstream job lists the folder while the writer is still working.', 'Downstream jobs wait for the marker, or read through a table format that publishes atomically.')
    ]
  };

  /* ---------- 10 SQL ---------- */
  ST['sql:1'] = {
    trigger: 'A user types a query or calls a DataFrame action.',
    sim: {
      actors: ['You', 'Parser', 'Optimizer', 'Physical planner'],
      steps: [
        S('You write a query', 'The text says what you want, not how to get it.', ['You', 'Parser', 'SELECT city, count(*) FROM users WHERE age > 30 GROUP BY city'], { You: ['SELECT city, count(*)', 'FROM users WHERE age > 30', 'GROUP BY city'] }),
        S('Turn text into a plan', 'The parser makes a tree of steps: scan users, filter, group, count. Names are not checked yet.', ['Parser', 'Optimizer', 'unresolved plan'], { Parser: ['scan users → filter → group → count'] }),
        S('Check the names', 'Spark looks up "users", "city" and "age" in the catalog and checks their types. A typo fails here, with a clear message.', ['Optimizer', 'Optimizer', 'resolve names and types'], { Optimizer: ['users.city: string', 'users.age: int'] }),
        S('Make it cheaper', 'The optimizer rewrites the plan without changing the answer: read only the two columns needed, and apply "age > 30" while reading the file.', ['Optimizer', 'Optimizer', 'prune columns, push filter down'], { Optimizer: ['read only city, age', '+filter age > 30 inside the scan'] }),
        S('Choose real steps', 'The physical planner picks actual operators. Counting by city needs all rows of a city together, so it adds an exchange (a shuffle) by city.', ['Optimizer', 'Physical planner', 'optimized plan'], { 'Physical planner': ['scan + filter', 'partial count', '+exchange by city', 'final count'] }),
        S('Tasks are created', 'The plan is cut into stages and tasks and sent to the workers.', ['Physical planner', 'You', 'tasks ready'], { 'Physical planner': ['stage 1: scan + filter + partial count', 'stage 2: final count'] })
      ]
    },
    edges: [
      E('A custom function in the way', 'The optimizer cannot see inside it.', 'A user-written function is a black box. Spark cannot push a filter past it or skip columns it might use.', 'Use built-in functions where possible, so the optimizer can reason about them.'),
      E('Out-of-date statistics', 'A slower plan, never a wrong answer.', 'Spark picks a strategy from old information about table sizes and picks a poor one.', 'Refresh the statistics. Adaptive execution also corrects some of these choices at run time.')
    ]
  };

  ST['sql:2'] = {
    diagrams: [{ kind: SEQ, title: 'Aggregate planning', src: `sequenceDiagram
  participant P as Planner
  participant C as Child plan
  P->>C: how is your output split?
  alt already split by city
    C-->>P: by city
    P->>P: aggregate in place, no exchange
  else not split by city
    C-->>P: no particular split
    P->>P: partial aggregate per task
    P->>P: exchange by city hash
    P->>P: final aggregate
  end` }],
    trigger: 'The planner meets a "count by city" and must choose how to run it.',
    sim: {
      actors: ['Planner', 'Child plan', 'Tasks'],
      steps: [
        S('The question', 'The plan says: count rows per city. All rows of one city must end up in one place before the count is final.', null, { Planner: ['count(*) group by city'] }),
        S('Look at the child', 'The planner asks the step below it how its output is split across tasks.', ['Planner', 'Child plan', 'how are you split?']),
        S('Case 1: already by city', 'If the data is already split by city, every city is whole inside one task. The planner counts in place, with no exchange.', ['Child plan', 'Planner', 'split by city'], { Tasks: ['+task A: all of Hanoi', '+task B: all of Hue'] }),
        S('Case 2: not split by city', 'More often rows of one city are spread over all tasks. Each task first counts what it has: Hanoi 40, Hue 10 here, Hanoi 25, Hue 5 there.', ['Child plan', 'Planner', 'no particular split'], { Tasks: ['task A: Hanoi 40, Hue 10', 'task B: Hanoi 25, Hue 5'] }),
        S('Send small totals, not rows', 'Only the small partial totals cross the network, grouped by city.', ['Planner', 'Tasks', 'exchange by city'], { Tasks: ['reducer 1: Hanoi 40 + 25', 'reducer 2: Hue 10 + 5'] }),
        S('Finish with a final count', 'Each reducer adds its parts: Hanoi 65, Hue 15. The answer matches counting everything in one place.', ['Planner', 'Tasks', 'final count'], { Tasks: ['+Hanoi 65', '+Hue 15'] })
      ]
    },
    edges: [
      E('An aggregate that cannot be split into parts', 'Partial counting is impossible.', 'A function like "median" cannot be computed from partial medians.', 'Spark shuffles all raw rows by key first, which is slower. Use approximate versions where a small error is fine.'),
      E('The wrong number of shuffle partitions', 'Too few is slow, too many is wasteful.', 'Few partitions make huge tasks. Thousands make tiny ones where setup costs more than the work.', 'Let adaptive execution merge small partitions, or tune the partition count by data size.')
    ]
  };

  /* ---------- 11 Joins ---------- */
  ST['joins:1'] = {
    trigger: 'You join a very big table (orders) with a small one (cities) on city id.',
    sim: {
      actors: ['Driver', 'Small table', 'Workers (big table)'],
      steps: [
        S('One side is tiny', 'Orders has a billion rows. Cities has only 200. Moving the big table would be a waste. Moving the small one is cheap.', null, { 'Small table': ['city 1 Hanoi', 'city 2 Hue', '... 200 rows'], 'Workers (big table)': ['orders part 1', 'orders part 2', 'orders part 3'] }),
        S('Collect the small table', 'The driver gathers all 200 cities into one place.', ['Small table', 'Driver', 'all 200 rows'], { Driver: ['cities: 200 rows'] }),
        S('Build a lookup table', 'The driver turns them into a hash table, a lookup keyed by city id.', ['Driver', 'Driver', 'build hash table'], { Driver: ['cities: 200 rows', '+lookup: id → name'] }),
        S('Send a copy to everyone', 'Every worker gets its own copy. This is called a broadcast.', ['Driver', 'Workers (big table)', 'broadcast lookup'], { 'Workers (big table)': ['orders part 1 + lookup', 'orders part 2 + lookup', 'orders part 3 + lookup'] }),
        S('Stream the big table past it', 'Each worker reads its orders one by one and looks up the city. No order moves to another machine.', ['Workers (big table)', 'Workers (big table)', 'look up each order'], { 'Workers (big table)': ['+order 1 → Hanoi', '+order 2 → Hue', '+order 3 → Hanoi'] }),
        S('Matches are counted fully', 'If a city appears twice in the small table, each order matches twice. Every match is kept, the right number of times.', null, {})
      ]
    },
    edges: [
      E('The "small" table is not small', 'The copy does not fit in memory.', 'A table that looked small is large after filtering, and copying it to every worker overflows memory.', 'Spark only broadcasts below a size limit. If it still happens, raise the limit carefully or switch to a shuffled join.'),
      E('Some outer joins cannot broadcast', 'The kept side must not be copied.', 'In a left outer join, the left rows with no match must still appear, and copying the left side to every worker would produce duplicates.', 'Broadcast the other side instead, or use a shuffled join.')
    ]
  };

  ST['joins:2'] = {
    diagrams: [{ kind: SEQ, title: 'Shuffled join', src: `sequenceDiagram
  participant F as Fact partitions
  participant D as Dimension partitions
  participant X as Exchange
  participant R as Reducers
  F->>X: rows, sent by hash of key
  D->>X: rows, sent by hash of key
  X->>R: same keys go to the same reducer
  R->>R: build a hash table from one side
  R->>R: probe it with the other side
  R-->>R: emit the matches` }],
    trigger: 'Both tables are big, so neither can be copied to every worker.',
    sim: {
      actors: ['Table A', 'Table B', 'Reducer 0', 'Reducer 1'],
      steps: [
        S('Both tables are spread out', 'Rows with the same key are scattered over many workers, so they cannot meet where they are.', null, { 'Table A': ['key 1', 'key 2', 'key 3', 'key 4'], 'Table B': ['key 1', 'key 2', 'key 3', 'key 4'] }),
        S('Pick a home for each key', 'A fixed formula on the key decides the reducer. Keys 1 and 3 go to reducer 0. Keys 2 and 4 go to reducer 1. The same formula is used for both tables.', null, {}),
        S('Send table A', 'Each worker sends its rows of table A to the reducer that owns the key.', ['Table A', 'Reducer 0', 'keys 1, 3'], { 'Reducer 0': ['A: key 1', 'A: key 3'], 'Reducer 1': ['A: key 2', 'A: key 4'] }),
        S('Send table B the same way', 'Because the formula is the same, table B rows land in the same reducers.', ['Table B', 'Reducer 1', 'keys 2, 4'], { 'Reducer 0': ['A: key 1', 'A: key 3', 'B: key 1', 'B: key 3'], 'Reducer 1': ['A: key 2', 'A: key 4', 'B: key 2', 'B: key 4'] }),
        S('Build and probe', 'Each reducer puts one side into a lookup and then looks up the other side in it. Matching rows are right next to each other.', ['Reducer 0', 'Reducer 1', 'both do the same'], { 'Reducer 0': ['+match key 1', '+match key 3'], 'Reducer 1': ['+match key 2', '+match key 4'] })
      ]
    },
    edges: [
      E('One hot key', 'One reducer gets far more rows.', 'A key such as "unknown city" appears in millions of rows, and all of them go to one reducer, which becomes the slowest.', 'Let adaptive execution split the hot key into several smaller pieces. See the skewed join page.'),
      E('Null keys never match', 'They disappear from an inner join.', 'In standard SQL a missing key is not equal to anything, not even another missing key.', 'Filter out or fill missing keys first if they should match, or use a null-safe comparison.')
    ]
  };

  /* ---------- 12 Adaptive ---------- */
  ST['adaptive:1'] = {
    trigger: 'A map stage has just finished, so Spark finally knows how big each piece of data really is.',
    sim: {
      actors: ['Driver', 'Map output sizes', 'Next stage'],
      steps: [
        S('The stage is done', 'The first stage wrote its shuffle files. Before the next stage starts, the driver collects the size of each reducer\'s share.', ['Driver', 'Map output sizes', 'how big is each share?'], { 'Map output sizes': ['part 0: 2 MB', 'part 1: 3 MB', 'part 2: 1 MB', 'part 3: 300 MB', 'part 4: 2 MB'] }),
        S('Planned guess vs real size', 'The plan had assumed five equal parts. The truth: four are tiny and one is huge.', null, {}),
        S('Merge the tiny ones', 'Tiny parts next to each other are merged up to a target size. Parts 0, 1 and 2 (6 MB in total) become one task instead of three.', ['Driver', 'Next stage', 'merge 0, 1, 2'], { 'Next stage': ['+task A: parts 0, 1, 2  (6 MB)'] }),
        S('Spot the huge one', 'Part 3 is far above the typical size. It is flagged so that it can be split.', ['Driver', 'Next stage', 'part 3 is too big'], { 'Next stage': ['task A: parts 0, 1, 2', '!part 3: 300 MB (too big)'] }),
        S('Start with the better layout', 'The next stage runs with the new layout: fewer tiny tasks and a plan for the big one.', ['Driver', 'Next stage', 'start'], { 'Next stage': ['task A: parts 0, 1, 2', 'part 3: split (see skewed join)', 'task C: part 4'] })
      ]
    },
    edges: [
      E('A required number of partitions', 'Merging might break the result.', 'Some operators need exactly a certain number of partitions, and merging changes the meaning.', 'Spark only merges where it is safe. A user-requested fixed count is respected.'),
      E('A stage that is cached', 'Statistics may be old.', 'If the result was cached earlier, the sizes Spark sees may no longer match reality.', 'Spark uses the sizes it has. Re-run with fresh data, or clear the cache.')
    ]
  };

  ST['adaptive:2'] = {
    diagrams: [{ kind: SEQ, title: 'Skew decision', src: `sequenceDiagram
  participant D as Driver
  participant L as Skewed side
  participant R as Other side
  D->>L: which partition is over the threshold?
  L-->>D: partition 3, 300 MB
  D->>L: split it into ranges by map output
  D->>R: copy the matching partition to each range
  D->>D: join each pair locally
  D->>D: union the results` }],
    trigger: 'One join key is so common that one reducer gets almost all the work.',
    sim: {
      actors: ['Skewed side', 'Other side', 'Reducers'],
      steps: [
        S('One reducer is overloaded', 'Most sales happen in one city. Its partition on the left side is 300 MB while the others are 3 MB. One reducer has to do almost everything.', null, { 'Skewed side': ['part 0: 3 MB', 'part 1: 3 MB', '!part 2: 300 MB (Hanoi)'], 'Other side': ['part 0', 'part 1', 'part 2 (Hanoi)'], Reducers: ['reducer 2 will be slow'] }),
        S('Find the big partition', 'The driver compares each partition with the median and flags part 2.', ['Skewed side', 'Skewed side', 'part 2 is far above the median'], {}),
        S('Cut it into ranges', 'It splits the big partition into three smaller ranges, using the natural boundaries of the map outputs.', ['Skewed side', 'Skewed side', 'split part 2'], { 'Skewed side': ['part 0: 3 MB', 'part 1: 3 MB', '+part 2a: 100 MB', '+part 2b: 100 MB', '+part 2c: 100 MB'] }),
        S('Copy the matching rows', 'Each range needs the matching Hanoi rows from the other side. Those rows are copied, once for each range.', ['Other side', 'Reducers', 'copy part 2 three times'], { 'Other side': ['part 0', 'part 1', 'part 2 ×3'] }),
        S('Join each pair on its own', 'Now three reducers share the work, each joining one range with its copy.', ['Reducers', 'Reducers', 'join pairs locally'], { Reducers: ['+reducer 2a: 100 MB', '+reducer 2b: 100 MB', '+reducer 2c: 100 MB'] }),
        S('Put the results together', 'The three outputs are joined end to end. Every match was produced exactly once.', null, { Reducers: ['reducer 2a', 'reducer 2b', '+combined result'] })
      ]
    },
    edges: [
      E('The kept side of an outer join', 'It cannot be split.', 'In a left outer join, splitting the left side is fine. Splitting the preserved side would duplicate rows that have no match.', 'Spark splits only the side it is allowed to split and leaves the other alone.'),
      E('The copy costs more than the skew', 'Replicating a big side is not free.', 'The other side is large too, and copying it to every range uses more network than it saves.', 'Spark checks sizes first and only splits when it pays off.')
    ]
  };

  /* ---------- 13 Evidence ---------- */
  ST['evidence:1'] = {
    trigger: 'A task has just finished, and its numbers must be kept so that someone can understand the job later.',
    sim: {
      actors: ['Scheduler', 'Listener bus', 'Log writer', 'Live status'],
      steps: [
        S('A task ends', 'The scheduler sees a task finish. It has numbers: run time, bytes read, bytes spilled, and so on.', null, { Scheduler: ['task 12 done: 4 s, 128 MB read, 0 spilled'] }),
        S('Post an event', 'It puts one short event on the listener bus, a message board, and goes straight back to scheduling.', ['Scheduler', 'Listener bus', 'task-end event'], { 'Listener bus': ['+task 12 end'] }),
        S('Everyone gets a copy', 'The bus hands the event to each listener on its own thread. A slow listener cannot hold up the others.', ['Listener bus', 'Log writer', 'task 12 end'], {}),
        S('Append to the log', 'The log writer adds the event to the event log file, in the background.', ['Log writer', 'Log writer', 'append to the file'], { 'Log writer': ['+line: task 12 end'] }),
        S('Update the live view', 'The live status store updates its counters, so the web page shows the new totals.', ['Listener bus', 'Live status', 'task 12 end'], { 'Live status': ['tasks done: 12', 'bytes read: 1.5 GB'] }),
        S('Scheduling was never slowed', 'If the disk is slow, the log queue grows a little. The scheduler never waits for it. It decides the same way with or without logging.', null, {})
      ]
    },
    edges: [
      E('A slow disk', 'It must not slow down the job.', 'The log writer cannot keep up with the events that arrive.', 'Events wait in a queue. If the queue overflows, some are dropped with a warning, but scheduling goes on.'),
      E('Very large jobs', 'Millions of events.', 'Logging every task of a huge job makes a big file and uses driver memory.', 'Sample or compress, or log summaries instead of every detail.')
    ]
  };

  ST['evidence:2'] = {
    trigger: 'Someone opens a job that has already finished, perhaps days ago.',
    sim: {
      actors: ['History server', 'Event log', 'Rebuilt view'],
      steps: [
        S('Open an old job', 'A person asks to see application 42. The job is long gone, but its log was kept.', null, { 'Event log': ['app-42.log', 'app-41.log', 'app-40.log'] }),
        S('Find the log', 'The history server looks in the log folder and finds app-42.', ['History server', 'Event log', 'open app-42'], { 'Event log': ['+app-42.log', 'app-41.log', 'app-40.log'] }),
        S('Read the events in order', 'It reads the file from the first line, replaying events in exactly the order they happened.', ['Event log', 'History server', 'events 1, 2, 3 ...'], { 'History server': ['job start', 'stage 1 submitted', 'task 1 end ...'] }),
        S('Rebuild what happened', 'Replaying the events rebuilds jobs, stages, tasks, and the final query plan.', ['History server', 'Rebuilt view', 'build'], { 'Rebuilt view': ['+job 0: 2 stages', '+stage 1: 40 tasks', '+plan'] }),
        S('Looks just like it did live', 'The same pages as a live job are shown. You can find the slow stage after the fact.', null, { 'Rebuilt view': ['job 0: 2 stages', 'stage 1: 40 tasks', 'plan', '+same pages as live'] })
      ]
    },
    edges: [
      E('The driver died, the log is cut short', 'Do not trust it.', 'The log ends in the middle, with no "application end" event.', 'The history server marks the application as incomplete and shows what it has, with a warning.'),
      E('The log was already deleted', 'Nothing to replay.', 'A retention rule removed old logs.', 'Keep logs for as long as you may need to investigate, or copy important ones elsewhere.')
    ]
  };

  /* ---------- 14 Build ---------- */
  ST['build:1'] = {
    trigger: 'You run the small reference engine on 12 rows of input, to see all the earlier ideas working together.',
    sim: {
      actors: ['You', 'Engine', 'Scheduler', 'Sink'],
      steps: [
        S('Choose options', 'You choose how much memory, whether a worker is lost and whether to speculate. The engine takes them as its input.', ['You', 'Engine', 'run(options)'], { You: ['memory: small', 'lose a worker: yes'] }),
        S('Read the input', 'The 12 input rows are cut into partitions, using the rule from the read page.', ['Engine', 'Engine', 'split the 12 rows'], { Engine: ['partition 0: 4 rows', 'partition 1: 4 rows', 'partition 2: 4 rows'] }),
        S('Run the pipeline and combine', 'Each task pulls its rows through the filter and map, and adds up counts per key before writing.', ['Engine', 'Scheduler', 'tasks for stage 1'], { Scheduler: ['3 tasks running'] }),
        S('Shuffle, spill, merge', 'Reducers fetch their parts. With small memory, some parts spill to disk and are merged at the end.', ['Scheduler', 'Engine', 'wave complete'], { Engine: ['shuffle done', '+spilled 2 runs, merged'] }),
        S('A worker is lost, then replayed', 'The worker you chose to lose takes some output with it. Only the lost tasks run again, and the result does not change.', ['Scheduler', 'Engine', 'rerun lost tasks'], { Engine: ['shuffle done', 'spilled 2 runs, merged', '!lost output', '+replayed 1 task'] }),
        S('Publish and show the answer', 'Only one attempt per partition publishes, and the output is marked complete. The engine prints the answer and a trace of every step.', ['Engine', 'Sink', 'publish winners'], { Sink: ['+total = 640'] }),
        S('The same answer every time', 'Change any option: more memory, no loss, speculation on or off. The total is still 640. This is the promise of the whole design.', ['Sink', 'You', 'answer + trace'], { You: ['+total = 640', '+trace'] })
      ]
    },
    edges: [
      E('Zero rows of input', 'Still a valid result.', 'The input is empty, so there is nothing to add up.', 'The engine returns an empty result and marks the output complete. It does not fail.'),
      E('Invalid options', 'Rejected, not guessed.', 'An option such as negative memory makes no sense.', 'The engine rejects it with a clear message instead of quietly changing it to something else.')
    ]
  };

  root.SparkStories = ST;
  if (typeof module === 'object' && module.exports) module.exports = ST;
})(typeof globalThis !== 'undefined' ? globalThis : this);
