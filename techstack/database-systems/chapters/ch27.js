/* Chapter 28 "Lakehouse and Embedded Analytics" (index 27, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-721 L18 System Analysis of Databricks (Spark, Spark SQL, Photon), L20 System Analysis of DuckDB (embedded, push-based vectorized, morsel-driven), and L01 Modern Analytical Database Systems (lakehouse systems, table formats).
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: a transaction log replayed into a file list, a commit race, small files slowing planning, time travel against VACUUM, native and JVM operator boundaries, and an embedded engine shared between writers. Numbers illustrative. */
(function () {
  const DB = window.DB;
  /* ---- 1. The log is the table: replaying commits yields the set of live data files ---- */
  const CL = ['1', '2', '3', '...', '1000', '1001', '1002', '1003', '1004', '1005'];
  const CX = i => 30 + i * 58;
  const logScene = {
    id: 'log-replay', label: 'Log replay', desc: 'A lakehouse table is a set of Parquet files plus a numbered log of commits. The current table is what you get by replaying the commits, or by starting from a checkpoint (commits illustrative).',
    codeLabel: 'Log',
    code: { bug: [
      '_delta_log/00000000000000000001.json   add f1, add f2',
      '_delta_log/00000000000000000002.json   add f3',
      '_delta_log/00000000000000000003.json   remove f1, remove f2, add f4   -- a compaction',
      'time travel: replay the log only up to version 2 -> {f1, f2, f3}',
      '1,005 commits, no checkpoint: replay every file. With a checkpoint at 1000: read it, then 5 commits',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 10 of 1,005 commits drawn. A real log has one JSON file per commit.',
      header: s => ({ left: 'replayed ' + (s.replayed || 0) + ' commit files', right: s.right || '' }),
      draw(P, s) {
        P.text('hc', { x: 30, y: 84, t: '_delta_log: one file per commit', cls: 'mut sm' });
        CL.forEach((l, i) => {
          const upto = s.upto == null ? -1 : s.upto;
          const read = s.readAll ? (l !== '...' && i >= (s.from == null ? 0 : s.from)) : (i <= upto && l !== '...');
          const tone = l === '...' ? 'mut' : (s.ckpt != null && i === s.ckpt ? 'acc' : (read ? 'ok' : 'info'));
          P.box('c' + i, { x: CX(i), y: 94, w: 52, h: 36, tone, label: l === '...' ? '...' : 'v' + l, cls: 'xs', sw: s.cursor === i ? 3 : 1.4, stroke: s.cursor === i ? 'cursor' : null });
        });
        if (s.ckpt != null) P.text('ck', { x: CX(s.ckpt) + 26, y: 150, t: 'checkpoint', cls: 'xs b', anchor: 'middle' });
        P.text('hs', { x: 30, y: 176, t: s.stateTitle || 'table state: files that make up the table', cls: 'mut sm' });
        P.box('st', { x: 30, y: 184, w: 580, h: 74, tone: 'mut', label: '', dash: true });
        (s.files || []).forEach(([f, tone], i) => P.chip('f' + f, { x: 44 + i * 90, y: 198, w: 80, h: 46, label: f, sub: tone === 'delete' ? 'removed' : 'live', tone }));
        if (s.note) P.chip('nt', { x: 30, y: 274, w: 580, h: 40, label: s.note, sub: s.noteSub || '', tone: s.noteTone || 'info' });
      }
    }),
    bug: [
      { log: 'Data files are written to object storage, but a file is part of the table only if a commit in the log lists it. The table is empty so far.', callout: 'Files are in the table only through the log', code: 0,
        state: { files: [], note: 'the log is empty: the table is empty', noteTone: 'info' }, stats: [{ l: 'commits', v: '0' }] },
      { log: 'Commit 1 adds files f1 and f2. Replaying the log, a reader now sees both.', callout: 'v1: add f1, add f2', code: 0,
        state: { upto: 0, cursor: 0, replayed: 1, files: [['f1', 'live'], ['f2', 'live']] }, stats: [{ l: 'live files', v: '2' }] },
      { log: 'Commit 2 adds f3. Each commit lists only what it added and removed, so the table is the sum of the commits.', callout: 'v2: add f3', code: 1,
        state: { upto: 1, cursor: 1, replayed: 2, files: [['f1', 'live'], ['f2', 'live'], ['f3', 'live']] }, stats: [{ l: 'live files', v: '3' }] },
      { log: 'Commit 3 is a compaction. It removes f1 and f2 and adds f4 with the same rows. The old files stay on storage for now but are no longer in the table.', callout: 'v3: remove f1, f2, add f4', moment: true, code: 2,
        state: { upto: 2, cursor: 2, replayed: 3, files: [['f3', 'live'], ['f4', 'live'], ['f1', 'delete'], ['f2', 'delete']] }, stats: [{ l: 'live files', v: '2' }, { l: 'removed', v: '2' }] },
      { log: 'Time travel replays the log only up to version 2. The reader sees f1, f2 and f3, which works as long as the old files have not been vacuumed.', callout: 'Time travel: replay up to v2', code: 3,
        state: { upto: 1, cursor: 1, replayed: 2, files: [['f1', 'live'], ['f2', 'live'], ['f3', 'live']], stateTitle: 'the table as of version 2', note: 'works until VACUUM removes f1 and f2', noteTone: 'warn' }, stats: [{ l: 'version', v: '2' }] },
      { log: 'After 1,005 commits and no checkpoint, a reader must replay every commit file to find the current files. Planning takes about 10 seconds, even though the data barely grew.', callout: '1,005 commit files to replay', code: 4,
        state: { readAll: 1, cursor: 9, replayed: 1005, files: [['f3', 'live'], ['f4', 'live']], note: 'plan 10 s: 1,005 small log reads', noteTone: 'bad', right: 'no checkpoint' }, stats: [{ l: 'planning', v: '10 s', cls: 'bad' }, { l: 'commit files read', v: '1,005', cls: 'bad' }] },
      { log: 'A checkpoint is a Parquet summary of the table state at one version. A reader finds the newest one, here at version 1000, and replays only the 5 commits after it.', callout: 'Checkpoint at 1000: read it, then 5 commits', code: 4,
        state: { readAll: 1, from: 4, ckpt: 4, cursor: 9, replayed: 6, files: [['f3', 'live'], ['f4', 'live']], note: 'plan 0.1 s: 1 checkpoint + 5 commits', noteTone: 'ok', right: 'checkpoint every 10 commits' }, stats: [{ l: 'planning', v: '0.1 s', cls: 'ok' }, { l: 'files read', v: '6', cls: 'ok' }],
        takeaway: 'The log is the table. Checkpoints keep replay short, and replay length is a cost you pay on every read.' },
    ],
  };

  /* ---- 2. Commit race: two writers, one next version, put-if-absent decides ---- */
  const VX = i => 330 + i * 70;
  const race = {
    id: 'commit-race', label: 'Commit race', desc: 'Two writers each finish a job and try to commit version 7. Creating the log file only if it does not exist lets exactly one win, and the loser checks for a conflict and retries (files illustrative).',
    codeLabel: 'Commit',
    code: { bug: [
      'writers write new Parquet files first: invisible to readers, not in the log',
      'commit = create _delta_log/...007.json only if it does not exist (put-if-absent)',
      'exactly one writer creates version 7; the other gets "already exists"',
      'loser: read 7.json, check whether it touches the same files; if not, commit as 8',
      'if both changed the same file, the loser aborts and the job must be re-run',
    ] },
    stage: DB.stage({
      footer: 'Simplified: two writers, one table, versions 5 to 8. Illustrative.',
      header: s => ({ left: 'log head: version ' + (s.head || 6), right: s.right || '' }),
      draw(P, s) {
        P.text('ht', { x: 330, y: 84, t: 'log in object storage', cls: 'mut sm' });
        for (let i = 0; i < 4; i++) {
          const v = 5 + i, made = s.made && s.made.includes(v) || v <= 6;
          P.box('v' + v, { x: VX(i), y: 94, w: 62, h: 44, tone: made ? 'ok' : 'info', label: 'v' + v, cls: 'sm', dash: !made, op: made ? 1 : 0.7 });
        }
        P.chip('wa', { x: 30, y: 100, w: 150, h: 54, label: 'writer A', sub: s.aSub || 'job running', tone: s.aTone || 'cursor' });
        P.chip('wb', { x: 30, y: 200, w: 150, h: 54, label: 'writer B', sub: s.bSub || 'job running', tone: s.bTone || 'acc' });
        if (s.filesA) P.chip('fa', { x: 196, y: 108, w: 110, h: 38, label: 'f10', sub: 'written, hidden', tone: 'info', small: false });
        if (s.filesB) P.chip('fb', { x: 196, y: 208, w: 110, h: 38, label: 'f11', sub: 'written, hidden', tone: 'info', small: false });
        if (s.tryA) P.line('ta', 306, 126, VX(2) + 20, 140, { tone: s.winA ? 'ok' : 'cursor', arrow: true });
        if (s.tryB) P.line('tb', 306, 226, VX(2) + 40, 140, { tone: s.loseB ? 'bad' : 'cursor', arrow: true, dash: !!s.loseB });
        if (s.msg) P.chip('ms', { x: 196, y: 276, w: 414, h: 40, label: s.msg, sub: s.msgSub || '', tone: s.msgTone || 'info' });
      }
    }),
    bug: [
      { log: 'The table is at version 6. Writer A and writer B are running jobs that each add new data to it.', callout: 'The table is at version 6', code: 0,
        state: { head: 6 }, stats: [{ l: 'version', v: '6' }, { l: 'writers', v: '2' }] },
      { log: 'Both jobs write their Parquet files to storage first. The files exist, but no log entry lists them, so no reader can see them yet.', callout: 'New files are written first, hidden', code: 0,
        state: { head: 6, filesA: 1, filesB: 1, aSub: 'wrote f10', bSub: 'wrote f11' }, stats: [{ l: 'visible to readers', v: 'no', cls: 'ok' }] },
      { log: 'Both writers try to create the log file for version 7 at the same moment. Storage allows only one creator.', callout: 'Both try to create v7', code: 1,
        state: { head: 6, filesA: 1, filesB: 1, tryA: 1, tryB: 1, aSub: 'commit v7', bSub: 'commit v7' }, stats: [{ l: 'candidates for v7', v: '2', cls: 'warn' }] },
      { log: 'Writer A creates v7 first and wins. Writer B is told that the file already exists. Readers now see A\'s files, and never a half-written state.', callout: 'A creates v7, B gets "already exists"', moment: true, code: 2,
        state: { head: 7, made: [7], filesA: 1, filesB: 1, tryA: 1, tryB: 1, winA: 1, loseB: 1, aTone: 'ok', bTone: 'bad', aSub: 'committed v7', bSub: 'lost the race', msg: 'v7 holds A\'s change', msgTone: 'ok' }, stats: [{ l: 'version', v: '7', cls: 'ok' }, { l: 'B', v: 'rejected', cls: 'warn' }] },
      { log: 'Writer B reads v7 and asks whether it touches the same files as B\'s change. A added f10 and B added f11, so there is no conflict.', callout: 'B checks v7 for a conflict', code: 3,
        state: { head: 7, made: [7], filesA: 1, filesB: 1, aTone: 'ok', bTone: 'cursor', aSub: 'committed v7', bSub: 'reads v7', msg: 'conflict check: different files, safe to retry', msgTone: 'warn' }, stats: [{ l: 'conflict', v: 'none', cls: 'ok' }] },
      { log: 'B retries as version 8 and succeeds. Both changes are in the table, and neither writer had to rerun its job.', callout: 'B retries as v8 and wins', code: 3,
        state: { head: 8, made: [7, 8], filesA: 1, filesB: 1, aTone: 'ok', bTone: 'ok', aSub: 'committed v7', bSub: 'committed v8', msg: 'v7 = A, v8 = B: both visible', msgTone: 'ok' }, stats: [{ l: 'version', v: '8', cls: 'ok' }, { l: 'reruns', v: '0', cls: 'ok' }] },
      { log: 'If both writers had rewritten the same file, B\'s check would find a conflict. B aborts with a concurrent modification error, and its job must be rerun on the new version.', callout: 'Same file changed: B aborts and reruns', code: 4,
        state: { head: 7, made: [7], filesA: 1, filesB: 1, aTone: 'ok', bTone: 'bad', aSub: 'rewrote f3 -> v7', bSub: 'rewrote f3 too', msg: 'ConcurrentModificationException', msgSub: 'rerun the job on version 7', msgTone: 'bad' }, stats: [{ l: 'B', v: 'aborted', cls: 'bad' }, { l: 'data lost', v: 'none', cls: 'ok' }],
        takeaway: 'One atomic create decides each version. Non-conflicting writers retry, conflicting ones rerun, and readers never see half a commit.' },
    ],
  };

  /* ---- 3. Small files: each frequent commit adds a tiny file, and planning has to open them all ---- */
  const FXC = i => 40 + (i % 10) * 34, FYC = i => 114 + Math.floor(i / 10) * 34;
  const small = {
    id: 'small-files', label: 'Small files', desc: 'A stream commits every minute and each commit adds a small file. Planning must list and open each file, so it slows down while the data barely grows. Compaction merges them (sizes illustrative).',
    codeLabel: 'Table',
    code: { bug: [
      '-- streaming job: one commit per minute, each commit adds a 5 MB file',
      'after a day: 1,440 files; the table holds 7 GB. Average file size 5 MB',
      'planning opens every file footer: 1,440 x 7 ms = 10 s before the first row',
      'OPTIMIZE events;   -- rewrite small files into files of about 1 GB',
      'VACUUM events RETAIN 168 HOURS;   -- later, delete files no retained version needs',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 40 small files stand for 1,440. Illustrative.',
      header: s => ({ left: 'files in the table ' + (s.n == null ? 0 : DB.fmt(s.n)), right: s.right || '' }),
      draw(P, s) {
        const n = s.small == null ? 0 : s.small;
        for (let i = 0; i < n; i++) P.box('s' + i, { x: FXC(i), y: FYC(i), w: 30, h: 30, tone: s.compacted ? 'delete' : (s.scan != null && i < s.scan ? 'warn' : 'info'), label: '', dash: !!s.compacted, rx: 4 });
        if (s.big) for (let j = 0; j < s.big; j++) P.box('b' + j, { x: 400 + (j % 2) * 108, y: 114 + Math.floor(j / 2) * 64, w: 100, h: 56, tone: 'ok', label: '1 GB', cls: 'sm' });
        if (s.bigLabel) P.text('bl', { x: 400, y: 100, t: s.bigLabel, cls: 'mut sm' });
        if (s.label) P.text('sl', { x: 40, y: 100, t: s.label, cls: 'mut sm' });
        if (s.note) P.chip('nt', { x: 40, y: 262, w: 570, h: 40, label: s.note, sub: s.noteSub || '', tone: s.noteTone || 'warn' });
      }
    }),
    bug: [
      { log: 'A streaming job commits to the table every minute. After 10 minutes the table has 10 small files of about 5 MB each.', callout: 'One commit a minute, one small file each', code: 0,
        state: { small: 10, n: 10, label: 'data files, one per commit' }, stats: [{ l: 'files', v: '10' }, { l: 'avg size', v: '5 MB' }] },
      { log: 'The count keeps rising while the data barely grows. After a day it is 1,440 files of 5 MB. Here 40 files stand for them.', callout: 'The file count grows every minute', code: 1,
        state: { small: 40, n: 1440, label: 'data files (40 shown for 1,440)' }, stats: [{ l: 'files', v: '1,440', cls: 'warn' }, { l: 'table size', v: '7 GB' }] },
      { log: 'Planning must read the footer of each file to prune and schedule. At about 7 ms per file, 1,440 files cost 10 seconds before the first row is read.', callout: 'Planning opens every file', moment: true, code: 2,
        state: { small: 40, n: 1440, scan: 40, label: 'planning reads every footer', note: '1,440 files x 7 ms = 10 s of planning', noteTone: 'bad' }, stats: [{ l: 'planning', v: '10 s', cls: 'bad' }, { l: 'execution', v: 'flat', cls: 'ok' }] },
      { log: 'OPTIMIZE rewrites the small files into a few files of about 1 GB, and a commit swaps them in. The table now has 7 large files.', callout: 'OPTIMIZE merges them into large files', code: 3,
        state: { small: 40, n: 7, compacted: 1, big: 4, bigLabel: 'compacted files (4 shown for 7)', label: 'old small files', note: 'one commit: remove 1,440, add 7', noteTone: 'ok' }, stats: [{ l: 'files', v: '7', cls: 'ok' }, { l: 'avg size', v: '1 GB', cls: 'ok' }] },
      { log: 'The old files stay on storage for time travel and for readers on older versions. VACUUM deletes them once no retained version needs them.', callout: 'Old files wait for VACUUM', code: 4,
        state: { small: 40, n: 7, compacted: 1, big: 4, bigLabel: 'compacted files (4 shown for 7)', label: 'removed from the table, still on disk', note: 'time travel still works until VACUUM', noteTone: 'warn' }, stats: [{ l: 'retention', v: '168 hours' }] },
      { log: 'After the retention period VACUUM removes them. Planning now opens 7 files and takes well under a second, even as new commits keep adding small ones.', callout: 'Planning drops to 7 files', code: 4,
        state: { small: 0, n: 7, big: 4, bigLabel: 'compacted files (4 shown for 7)', note: 'planning 0.05 s: 7 files', noteTone: 'ok', right: 'after compaction' }, stats: [{ l: 'planning', v: '0.05 s', cls: 'ok' }, { l: 'files', v: '7', cls: 'ok' }],
        takeaway: 'Frequent commits make small files, and every read pays for them. Schedule compaction, then vacuum after retention.' },
    ],
  };

  /* ---- 4. Embedded engine: a library in your process, until you share its file between writers ---- */
  const embedded = {
    id: 'embedded', label: 'Embedded engine', desc: 'DuckDB runs inside the application process, so a query is a function call. That is fast for one user, and it breaks when many writers share one database file (counts illustrative).',
    codeLabel: 'DuckDB',
    code: { bug: [
      "con = duckdb.connect('app.duckdb')   -- the engine is a library inside this process",
      "con.sql(\"SELECT sum(amount) FROM 'orders.parquet'\")   -- no server, no network hop",
      "SET memory_limit = '8GB'; SET temp_directory = '/tmp/duck';   -- spill past RAM",
      'shared service: 5 requests write to app.duckdb at the same time',
      "IO Error: Could not set lock on file 'app.duckdb': Conflicting lock is held",
    ] },
    stage: DB.stage({
      footer: 'Simplified: one database file, one process holds the write lock. Illustrative.',
      header: s => ({ left: s.hdr || 'one process', right: s.right || '' }),
      draw(P, s) {
        if (!s.shared) {
          P.box('pr', { x: 30, y: 100, w: 360, h: 170, tone: 'mut', label: '', sw: 2 }); P.text('pt', { x: 40, y: 92, t: 'application process', cls: 'mut sm' });
          P.chip('app', { x: 46, y: 118, w: 150, h: 44, label: 'app code', sub: 'your logic', tone: 'info' });
          P.chip('eng', { x: 226, y: 118, w: 150, h: 44, label: 'DuckDB engine', sub: 'in-process', tone: 'ok' });
          P.line('fc', 196, 140, 224, 140, { tone: 'ok', arrow: true, label: 'call', dy: -6 });
          P.chip('fl', { x: 46, y: 200, w: 330, h: 50, label: s.fileLabel || 'orders.parquet', sub: s.fileSub || '2 GB', tone: s.fileTone || 'info' });
          P.chip('ram', { x: 410, y: 118, w: 200, h: 44, label: 'RAM: ' + (s.ram || '16 GB'), sub: s.ramSub || '', tone: s.ramTone || 'info' });
          if (s.spill) P.chip('sp', { x: 410, y: 176, w: 200, h: 44, label: 'spill to temp_directory', sub: 'slower, but finishes', tone: 'ok' });
          if (s.oom) P.chip('oom', { x: 410, y: 176, w: 200, h: 44, label: 'killed: out of memory', sub: 'no spill configured', tone: 'bad' });
        } else {
          for (let i = 0; i < 5; i++) {
            const ok = i === 0;
            P.chip('u' + i, { x: 30, y: 98 + i * 42, w: 110, h: 34, label: 'user ' + (i + 1), sub: '', tone: s.results ? (ok ? 'ok' : 'bad') : 'info', small: true });
            P.line('ul' + i, 142, 115 + i * 42, 330, 190, { tone: s.results ? (ok ? 'ok' : 'bad') : 'mut', arrow: true, dash: s.results && !ok, sw: ok ? 2.2 : 1.2 });
            if (s.results && !ok) P.text('ue' + i, { x: 170, y: 112 + i * 42, t: 'database is locked', cls: 'xs tone-bad' });
          }
          P.box('svc', { x: 332, y: 120, w: 278, h: 130, tone: 'mut', label: '', sw: 2 }); P.text('st', { x: 342, y: 112, t: 'shared web service (one process)', cls: 'mut sm' });
          P.chip('sf', { x: 346, y: 134, w: 250, h: 50, label: 'app.duckdb', sub: s.lock || 'one writer holds the lock', tone: s.lockTone || 'warn' });
          P.chip('se', { x: 346, y: 192, w: 250, h: 44, label: s.eng || 'DuckDB engine', sub: '', tone: 'ok', small: false });
        }
        if (s.note) P.chip('nt', { x: 30, y: 292, w: 580, h: 34, label: s.note, tone: s.noteTone || 'warn', small: true });
      }
    }),
    bug: [
      { log: 'On a laptop the analytics app opens a DuckDB file or a Parquet file directly. The engine is a library in the same process, so a query is a function call.', callout: 'The engine is a library in your process', code: 0,
        state: { hdr: 'one process, one user', note: 'no server, no network hop, no connection to manage', noteTone: 'ok' }, stats: [{ l: 'network hops', v: '0', cls: 'ok' }, { l: 'setup', v: 'none', cls: 'ok' }] },
      { log: 'The query reads the Parquet file in place, using many threads and vectorized operators. For one user and a file that fits in memory it is very fast.', callout: 'Fast for one user, data in memory', code: 1,
        state: { hdr: 'one process, one user', fileSub: '2 GB, fits in RAM', ram: '16 GB', ramSub: 'working set 4 GB', ramTone: 'ok' }, stats: [{ l: 'working set', v: '4 GB', cls: 'ok' }, { l: 'RAM', v: '16 GB' }] },
      { log: 'The input grows to 60 GB and one query needs a working set of 25 GB. With no memory limit and no spill directory the process is killed with an out-of-memory error.', callout: 'The data outgrows RAM: out of memory', moment: true, code: 2,
        state: { hdr: 'one process, one user', fileSub: '60 GB', ram: '16 GB', ramSub: 'working set 25 GB', ramTone: 'bad', oom: 1 }, stats: [{ l: 'working set', v: '25 GB', cls: 'bad' }, { l: 'RAM', v: '16 GB', cls: 'bad' }] },
      { log: 'Setting memory_limit and temp_directory lets operators spill to disk. The query is slower but finishes, the same idea as spilling in chapter 11.', callout: 'Set a memory limit and a spill directory', code: 2,
        state: { hdr: 'one process, one user', fileSub: '60 GB', ram: '16 GB', ramSub: 'memory_limit 12 GB', ramTone: 'ok', spill: 1 }, stats: [{ l: 'result', v: 'finishes', cls: 'ok' }, { l: 'speed', v: 'slower', cls: 'warn' }] },
      { log: 'The feature moves into a shared web service. Five users now write to the same database file at the same time.', callout: 'The app becomes a shared service', code: 3,
        state: { shared: 1, hdr: 'shared service', lock: 'five writers want in', lockTone: 'info' }, stats: [{ l: 'writers', v: '5' }] },
      { log: 'One process holds the write lock on the file. The first request succeeds and the other four fail with a lock error. Most requests fail under load, though it worked for one developer.', callout: 'One writer wins, four fail', code: 4,
        state: { shared: 1, hdr: 'shared service', results: 1, lock: 'locked by user 1', lockTone: 'warn', note: '4 of 5 writes fail: Could not set lock on file', noteTone: 'bad' }, stats: [{ l: 'succeeded', v: '1', cls: 'ok' }, { l: 'failed', v: '4', cls: 'bad' }] },
      { log: 'For many writers, put a server database or a lakehouse table in front. Keep the embedded engine for one process, local analysis and reading shared Parquet files.', callout: 'Many writers need a server or a lakehouse', code: 4,
        state: { shared: 1, hdr: 'shared service', results: 0, lock: 'use a server or lakehouse for writes', lockTone: 'ok', eng: 'embedded: single-process reads', note: 'embedded engine for one user, lakehouse for many', noteTone: 'ok' }, stats: [{ l: 'fit', v: 'embedded: 1 user', cls: 'ok' }, { l: 'many users', v: 'lakehouse / server', cls: 'ok' }],
        takeaway: 'An embedded engine has no coordination cost and no coordination. Use it for one process, not as a shared database.' },
    ],
  };

  /* problem, predict and diagnose entries carried over from the first version of this course */
  const OLD = {
    "problem": "A streaming job commits to a lakehouse table on object storage every minute. After a few months, every read of the table is slower, and query planning takes 10 s although the data has barely grown (illustrative). The same week, another team moves the DuckDB analytics from its laptop app into a shared web service, and 4 of 5 concurrent writes fail with a lock error.",
    "predict": {
      "q": "The lakehouse table has 1,005 commits in its transaction log and no checkpoint. How does a reader find the data files that make up the current table?",
      "opts": [
        "It lists the object store directory and reads every Parquet file it finds",
        "It replays all 1,005 commit files, because the table state is the replay of the log",
        "It reads only the newest commit file, which holds the whole table state",
        "It asks the Spark driver, which keeps the table state in memory"
      ],
      "ans": 1,
      "why": "Each commit lists only the files it added and removed, so the current state is the replay of every commit. Listing the directory would also return files that later commits removed."
    },
    "diagnose": [
      {
        "t": "Thousands of small files",
        "sym": "The query plan takes longer each week, even though the data has not grown. Most of the time goes to opening files.",
        "ctx": "Planning time climbs steadily while execution time is flat. The table's average file size keeps shrinking.",
        "why": "Every commit writes a few small files. Planning and each scan open every file, and small files make the per-file cost dominate. The data is the same size, but there are many more files to open.",
        "log": "representative table health metrics\nfiles=1000 avg_file_size=0.5 MB\nplanning_time=10 s (planning, not execution)",
        "fix": [
          "Measure first: track the file count, avg_file_size and planning_time for the table over time.",
          "Compact small files on a schedule (OPTIMIZE-style rewrites into larger files).",
          "Write fewer, larger files per commit: batch small writes instead of committing each row.",
          "Keep per-file statistics, so pruning can skip files without opening them.",
          "Verify: count the files that a query has to open before and after compaction. Here it moves from 1000 to 10 files (illustrative)."
        ]
      },
      {
        "t": "Log and catalog metadata grow",
        "sym": "Every read of the table is slower than last month, and the log and the file catalog keep growing.",
        "ctx": "Even small queries on the table pay a fixed delay before the first file is read. The log directory holds thousands of commit files.",
        "why": "The table state is the replay of the log. Without checkpoints, every reader replays every commit, so the cost of a read grows with the number of commits. The catalog of file entries grows with each commit too, and old files pile up unless old commits and files are cleaned up.",
        "log": "representative log directory listing\n_delta_log/00000000000000001000.json\n_delta_log/_last_checkpoint  (missing or stale)\nfile catalog: 1000 file entries listed for one table (representative)",
        "fix": [
          "Measure first: list _delta_log and check whether _last_checkpoint exists and how many commits follow it.",
          "Write a checkpoint every 10 commits (the default for Delta Lake), so a reader replays only the commits after it.",
          "Expire old log entries after the retention window (30 days by default for Delta Lake, per the Delta Lake documentation checked on the web, not the course notes), once a checkpoint covers them.",
          "Vacuum old data files that no retained version still needs. Time travel only works within the retention window.",
          "Verify: count the commit files a read replays before and after checkpointing. Here it moves from 1005 to 5 files (illustrative)."
        ]
      },
      {
        "t": "Embedded workload exceeds RAM",
        "sym": "The process is killed with an out-of-memory error, halfway through a query over a file that was fine last week.",
        "ctx": "The app crashes on one large query, not on small ones. The input file has grown past the machine's RAM.",
        "why": "An embedded engine runs inside the application process, on one machine. If it keeps the whole input in memory, a dataset larger than RAM fails. A streaming scan with spilling operators can run on the same machine.",
        "log": "representative process log\nprocess exited: out of memory (embedded engine, 16 GB limit)\nlast operator: hash aggregate, spill=disabled",
        "fix": [
          "Measure first: watch the peak memory of the process during the failing query and note the last operator before the exit.",
          "Scan row group by row group, so only one group is in memory at a time.",
          "Turn on spilling for the blocking operators (aggregates, joins, sorts) and give the engine a disk temp directory.",
          "Move the largest tables to a lakehouse or a server when the data no longer fits on one machine.",
          "Verify: watch the peak memory of the process during the same query. Here it moves from 40 GB (out of memory at chunk 1) to 0.012 GB (the row group size is an assumption), plus spill."
        ]
      },
      {
        "t": "Embedded engine as a shared service",
        "sym": "Many users write to one embedded database and most of their requests fail with a lock error.",
        "ctx": "The feature worked for one developer, then failed under load in a shared deployment. Only the first writer succeeds.",
        "why": "An embedded engine is one library in one process. A database file can be open for writing by only one process at a time (representative; not stated in the course notes), so putting it behind a multi-user service without a single owner process means most requests fail.",
        "log": "representative error\nIO Error: Could not set lock on file \"analytics.db\": another process holds it (representative wording)",
        "fix": [
          "Measure first: count the writes that fail with the lock error, and list which processes open the database file.",
          "Put one service process in front of the file, and let it own the connection. Requests from many users queue inside the service.",
          "Use a lakehouse or a managed server for many concurrent writers, so the storage is not tied to one process.",
          "Keep the embedded engine for one user, such as a laptop app or a notebook.",
          "Verify: count the writes that fail with 5 concurrent clients. Here it moves from 4 failed to 0 failed (illustrative)."
        ]
      }
    ]
  };

  const SOURCE = { label: 'CMU 15-721 L18 Databricks (Spark SQL and Photon) and L20 DuckDB; table-format material from L01 (notes in output/pdf/database-system)', href: '../../output/pdf/database-system/notes/18-databricks.pdf' };

  /* ---- 3. Time travel and VACUUM: old versions stay readable only while their files exist ---- */
  const TV = [['v1', 0, 2], ['v2', 1, 4], ['v3', 3, 6], ['v4', 5, 8], ['v5', 7, 10]];
  const tx = t => 90 + t * 52;
  const travel = {
    id: 'time-travel', label: 'Time travel and VACUUM', desc: 'Each commit removes some data files from the current table but leaves them in storage. That is what makes older versions readable. VACUUM deletes files that no version inside the retention window needs, and a read of an older version then fails (versions and retention illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'SELECT * FROM events VERSION AS OF 2;      -- reads the files that version 2 listed',
      'commits keep adding files; removed files stay in storage as history',
      'VACUUM events RETAIN 168 HOURS;            -- delete files older than 7 days that no kept version needs',
      'SELECT * FROM events VERSION AS OF 2;      -- FileNotFoundException: the file is gone',
      'retention must cover the longest query and the longest stream that reads old versions',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 5 versions, each a range of live files. Illustrative.',
      header: s => ({ left: s.hl || 'versions and the files they need', right: s.rt || '' }),
      draw(P, s) {
        for (let t = 0; t <= 10; t += 2) P.text('tt' + t, { x: tx(t), y: 316, t: 'f' + (t + 1), cls: 'mut xs', anchor: 'middle' });
        P.text('hd', { x: 30, y: 84, t: 'data files in storage: f1 ... f11 (one bar = the files a version lists)', cls: 'mut sm' });
        TV.forEach(([v, a, b], i) => { const dead = s.cut != null && b <= s.cut, gone = dead && s.vac;
          P.box('b' + v, { x: tx(a), y: 98 + i * 40, w: (b - a) * 52, h: 30, tone: gone ? 'bad' : (v === (s.cur || 'v5') ? 'live' : (s.read === v ? 'cursor' : 'info')), label: v + (gone ? ' files deleted' : ''), cls: 'xs', dash: gone }); });
        if (s.cut != null && !s.vac) P.line('cut', tx(s.cut), 94, tx(s.cut), 306, { tone: 'warn', dash: true, sw: 2 });
        if (s.vac) P.line('cut2', tx(s.cut), 94, tx(s.cut), 306, { tone: 'bad', sw: 3 });
        if (s.note) P.chip('nt', { x: 30, y: 340, w: 560, h: 30, label: s.note, sub: '', tone: s.noteTone || 'info', small: true });
      }
    }),
    bug: [
      { log: 'The table has five versions. Each version lists the data files that make it up. The current table is v5, and the older versions overlap with it in the files they share.', callout: 'Five versions over the same files', code: 0, state: { cur: 'v5' }, stats: [{ l: 'versions', v: '5' }] },
      { log: 'A query reads VERSION AS OF 2. It replays the log up to version 2 and reads exactly the files that version listed, even though later commits removed some of them from the current table. This is time travel.', callout: 'Read an old version: its own files', code: 0, state: { read: 'v2' }, stats: [{ l: 'v2 reads', v: 'f2 to f5' }] },
      { log: 'Removed files are not deleted at commit. That would break time travel and any reader still using an older version. The price is that storage keeps growing with every update and delete.', callout: 'Removed files stay as history', moment: true, code: 1, state: { note: 'history costs storage', noteTone: 'warn' }, stats: [{ l: 'storage', v: 'grows', cls: 'warn' }] },
      { log: 'VACUUM with a retention window deletes the files that are older than the window and not part of any version still inside it. The line shows what falls outside the window.', callout: 'VACUUM: delete what no kept version needs', code: 2, state: { cut: 4, note: 'versions that end before f5 are outside retention' }, stats: [{ l: 'reclaimable', v: 'f1 to f4', cls: 'ok' }] },
      { log: 'After VACUUM the files of v1 and v2 are physically gone. Reading VERSION AS OF 2 now fails with a file-not-found error, and so does a long query or a stream that started on that version.', callout: 'Old versions are no longer readable', moment: true, code: 3, state: { cut: 4, vac: 1, read: 'v2', note: 'VERSION AS OF 2 -> file not found', noteTone: 'bad' }, stats: [{ l: 'v1, v2', v: 'unreadable', cls: 'bad' }] },
      { log: 'So the retention window must cover the longest job that reads an old version and the longest time you want to travel back. Seven days is a common default.', callout: 'Retention must outlast every reader', code: 4, state: { cut: 4, vac: 1, note: 'retention >= longest query, longest stream lag, longest audit need', noteTone: 'ok' }, stats: [{ l: 'trade', v: 'storage vs history', cls: 'warn' }],
        takeaway: 'Time travel is a side effect of keeping removed files. VACUUM trades that history for space, so size the retention to your readers.' },
    ],
  };

  /* ---- 4. Photon: native operators inside a JVM plan, and the cost of each boundary ---- */
  const PL = [['Scan', 'p'], ['Filter', 'p'], ['UDF', 'j'], ['HashJoin', 'p'], ['Aggregate', 'p']];
  const px = i => 30 + i * 118;
  const photon = {
    id: 'photon-boundary', label: 'Native and JVM operators', desc: 'A plan runs mostly in a native vectorized engine and falls back to the JVM for an operator it does not support. Every switch converts between a column batch and JVM rows, and the cost grows with the number of boundaries (conversion costs illustrative).',
    codeLabel: 'Plan',
    code: { bug: [
      'Scan -> Filter -> UDF -> HashJoin -> Aggregate',
      'native (Photon) runs Scan, Filter, HashJoin and Aggregate as vectorized C++',
      'the Python UDF only exists in the JVM engine: the plan falls back at that operator',
      'each switch converts a batch of columns to rows or back: a copy per boundary',
      'rewrite the UDF as a built-in expression: one native pipeline, no boundary',
    ] },
    stage: DB.stage({
      footer: 'Simplified: five operators, two boundaries around the UDF. Illustrative.',
      header: s => ({ left: s.hl || 'operators and the engine that runs them', right: 'boundaries: ' + (s.b == null ? 0 : s.b) }),
      draw(P, s) {
        const ops = s.fix ? PL.filter(([n]) => n !== 'UDF').concat([]) : PL;
        const arr = s.fix ? [['Scan', 'p'], ['Filter', 'p'], ['Expr', 'p'], ['HashJoin', 'p'], ['Aggregate', 'p']] : PL;
        arr.forEach(([n, e], i) => P.chip('o' + i, { x: px(i), y: 110, w: 106, h: 54, label: n, sub: !s.eng ? '' : (e === 'p' ? 'native' : 'JVM'), tone: !s.eng ? 'info' : (e === 'p' ? 'ok' : 'warn') }));
        if (s.bnd) [1, 2].forEach(k => P.chip('bd' + k, { x: px(k + 1) - 24 - (k === 1 ? 6 : -6) + 4, y: 186, w: 100, h: 34, label: k === 1 ? 'columns → rows' : 'rows → columns', sub: '', tone: 'bad', small: true }));
        if (s.cost) P.chip('cost', { x: 30, y: 250, w: 560, h: 36, label: s.cost, sub: '', tone: s.costTone || 'warn' });
        if (s.eng) { P.text('l1', { x: 30, y: 100, t: 'engine per operator', cls: 'xs mut' }); }
      }
    }),
    bug: [
      { log: 'A query plan with five operators, one of them a Python UDF. The question is which engine executes each.', callout: 'Five operators, one UDF', code: 0, state: {}, stats: [{ l: 'operators', v: '5' }] },
      { log: 'Photon, a vectorized C++ engine embedded in the JVM runtime, takes every operator it has an implementation for: scan, filter, join and aggregate. The UDF has no native version.', callout: 'Native where possible, JVM where not', code: 1, state: { eng: 1 }, stats: [{ l: 'native', v: '4 of 5', cls: 'ok' }, { l: 'JVM', v: '1', cls: 'warn' }] },
      { log: 'The batch of columns must become JVM rows before the UDF and columns again after it. Two boundaries, each copying every row of the batch.', callout: 'Two conversions around the UDF', moment: true, code: 3, state: { eng: 1, bnd: 1, b: 2 }, stats: [{ l: 'boundaries', v: '2', cls: 'bad' }] },
      { log: 'The conversions can cost more than the UDF itself, and the rows leave the vectorized pipeline. Row at a time work in the middle erases much of the gain of the native engine around it.', callout: 'The fallback erases part of the gain', code: 3, state: { eng: 1, bnd: 1, b: 2, cost: 'conversion time is paid on every row, twice', costTone: 'bad' }, stats: [{ l: 'speed-up kept', v: 'partial', cls: 'warn' }] },
      { log: 'Rewriting the UDF as a built-in expression keeps the whole plan native. No boundary, one vectorized pipeline from scan to aggregate.', callout: 'Rewrite as a built-in expression', moment: true, code: 4, state: { eng: 1, fix: 1, b: 0, cost: 'one native pipeline, no conversions', costTone: 'ok', hl: 'after the rewrite' }, stats: [{ l: 'boundaries', v: '0', cls: 'ok' }],
        takeaway: 'A mixed engine pays for every switch. Keep hot pipelines inside one engine and avoid row-at-a-time functions in the middle.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Put the engine and the transaction boundary where they are needed</h3>
<p>Analytics needs two things that are easy to confuse: a place to keep data that many jobs can read and write, and an engine to run queries over it. A <b>lakehouse</b> keeps immutable data files, usually Parquet, in an object store (chapter 27), plus a <b>transaction log</b> that says which files make up each version of a table. That log gives a pile of files the behaviour of a table: schema, ACID commits, time travel. The engine is a separate layer that reads the table, and can be a cluster, a service or a library in your own process.</p>
<figure class="mm" aria-label="Layers of a lakehouse: engines, table format, data files, object store" style="--diagram-width:228px">
  <img src="diagrams/ch27-lakehouse-layers.svg" alt="Layered diagram: engines such as Spark, Photon, Trino, DuckDB and Flink sit on a table format such as Delta, Iceberg or Hudi that provides schema, snapshots and transactions. The table format points to data files in Parquet or ORC, which are immutable, columnar and have footers. The files live in an object store such as S3, GCS or ADLS. A dotted edge shows that the transaction log lists which files make up version N.">
  <figcaption>Flowchart: four layers. Engines are replaceable because the table format and the files are open.</figcaption>
</figure>

<h3>2. The log is the table</h3>
<p>A lakehouse write is a <b>snapshot commit</b>. Writers first write new Parquet files to storage. No reader can see them yet. The commit then creates the next numbered file in the log, for example <code>_delta_log/00000000000000000007.json</code>, listing the files added and removed. A reader finds the current table by replaying the log from the start, or from a <b>checkpoint</b> that summarises it, and the files it lists are the table. Because older commit files remain, any earlier version can be rebuilt: <b>time travel</b>. Delta Lake, Apache Iceberg and Apache Hudi differ in format details and share this design. The 721 lecture&rsquo;s summary is that lakehouses add <b>schema control and transactional create, read, update and delete</b> to a data lake, keeping changes in row-oriented, log-structured files that are periodically compacted into read-only columnar files.</p>

<h3>3. Concurrent writers</h3>
<p>The commit succeeds only if its version number is free. The storage layer creates the file only if it does not exist (put-if-absent), so two writers cannot both claim version 7. The loser reads the winner&rsquo;s commit and checks for a conflict. If the two changes touch different files, the loser simply commits as version 8. If they touch the same files, it must fail or redo its work. This is optimistic concurrency control (chapter 22), with the object store&rsquo;s atomic create as the arbiter. It works for modest write rates and many readers, not for thousands of tiny commits a second.</p>

<h3>4. Maintenance: checkpoints, compaction and vacuum</h3>
<p>Every commit adds a log entry and often a small file, so a table needs upkeep. A <b>checkpoint</b> is a Parquet summary of the table state at one version, and a pointer file names the newest. Delta Lake writes one every 10 commits by default, so a reader replays only the commits after it. Without checkpoints the log replay grows with the history. <b>Compaction</b> (<code>OPTIMIZE</code>) rewrites many small files as a few large ones, since each file costs a listing entry, an open and a footer read during planning. <b>VACUUM</b> deletes files that are no longer in any version inside the retention window. Deleting too early breaks time travel and readers still on an old version.</p>

<h3>5. From Spark to Photon (15-721)</h3>
<p>The Databricks lecture shows how the engine above the table evolved, and why. <b>Spark</b> replaced Hadoop with in-memory iterative processing and an RDD API. <b>Shark</b> (2013) ran SQL by translating Hive plans, and was limited by the Hive optimizer and by the impossibility of mixing SQL and API calls. <b>Spark SQL</b> (2015) put a row-based SQL engine in the Spark runtime with Scala code generation and an in-memory columnar representation for intermediate data, using dictionary, run-length and bit-packed encodings (chapter 5). By the late 2010s workloads were <b>CPU-bound</b>: NVMe caching and adaptive shuffles had removed disk stalls. The JVM then got in the way: garbage collection slows with heaps over 64 GB, and the JIT limits the size of generated methods.</p>
<figure class="mm" aria-label="Timeline from Hadoop to Photon" style="--diagram-width:168px">
  <img src="diagrams/ch27-spark-to-photon.svg" alt="Flow: 2009 Hadoop with MapReduce and disk, then Spark with in-memory processing and the RDD API, then 2013 Shark running SQL on Hive plans, then 2015 Spark SQL with Catalyst and JVM code generation, then the observation of being CPU-bound on the JVM with garbage collection over 64 GB and JIT limits on large methods, then 2022 Photon, a C++ vectorized engine called through JNI.">
  <figcaption>Flow: each step removed one bottleneck and exposed the next.</figcaption>
</figure>
<p><b>Photon</b> (2022) is a single-threaded C++ vectorized execution engine embedded in the Databricks runtime through JNI. It replaces the old engine <em>operator by operator</em> where it has a native implementation, with no change for users, and handles the mismatch between the row-oriented runtime and its own columnar batches. It is pull-based and vectorized, built from precompiled operator kernels and expression fusion rather than JIT code generation (chapter 15), with shuffle-based distributed execution, sort-merge and hash joins and adaptive optimization. Memory comes from the runtime&rsquo;s pool, and since statistics are often missing, operators adapt their memory use at run time.</p>

<h3>6. The embedded engine (15-721: DuckDB)</h3>
<p>DuckDB is a multi-threaded, vectorized embedded DBMS, often called SQLite for analytics. It runs inside your process, which makes a query a function call, and gives zero-copy access to results through Apache Arrow. Design decisions from the lecture: shared-everything (no separate storage), push-based vectorized processing (adopted in 2021 because pull made new operators hard to add and parallelism awkward; operators decide for themselves how to parallelize, a vector cache buffers between operators, and the model allows scan sharing and back-pressure), MVCC inspired by HyPer, precompiled primitives, morsel-driven parallelism (chapter 13), a PAX columnar format, sort-merge and hash joins, and a stratified optimizer that unnests arbitrary subqueries (chapter 18). It reads Parquet, Arrow, JSON and files over HTTP and S3 through extensions, and it keeps a database in a single file in row groups of about 120,000 rows. For one user it is very fast and nothing needs to run. Since the file has one writer process, it is not a shared service.</p>

<h3>7. The trade-off</h3>
<p>A lakehouse serves many writers and readers on cheap storage, and costs maintenance: log growth, small files, compaction, vacuum and the retention window. A native engine buys speed and loses the convenience of the JVM, with fallbacks where a feature is missing. An embedded engine has no coordination cost and has no coordination, so it is for one process and one working set. Choose by who writes, how many, and how big the data is compared with the machine.</p>

<h3>8. Syntax</h3>
<pre>-- Delta Lake: history, time travel, maintenance
DESCRIBE HISTORY events;
SELECT * FROM events VERSION AS OF 2;
OPTIMIZE events;
VACUUM events RETAIN 168 HOURS;
ALTER TABLE events SET TBLPROPERTIES ('delta.checkpointInterval' = '10');

-- Databricks: is a plan running in Photon
EXPLAIN FORMATTED SELECT ... ;    -- look for Photon operators (PhotonGroupingAgg ...) and for rows-to-columns conversions

-- DuckDB: bound memory, allow spilling, read shared files
SET memory_limit = '12GB';
SET temp_directory = '/tmp/duck';
SELECT sum(amount) FROM read_parquet('s3://bucket/orders/*.parquet');
-- one writer per database file; open shared data read-only
ATTACH 'app.duckdb' AS app (READ_ONLY);</pre>
<p>If planning time climbs while execution time stays flat, count the files and the commit files first. Compact and checkpoint before you add compute.</p>`;

  /* problem, predict and diagnose */
  const FIELDS = {
    problem: OLD.problem, predict: OLD.predict,
    diagnose: [
      OLD.diagnose[0], OLD.diagnose[1], OLD.diagnose[2], OLD.diagnose[3],
      {
        t: 'Time travel fails after VACUUM',
        sym: '<b>A query or stream</b> that reads an older version fails with a file-not-found error.',
        ctx: 'A maintenance job ran VACUUM with a short retention. A long batch job, started on version 2 before the vacuum, is still reading.',
        why: 'Time travel works only while the files of the old version exist. VACUUM deletes files that are outside the retention window and not part of a newer version, so a reader still on that version loses them mid-query.',
        log: `-- representative error, wording varies by engine
java.io.FileNotFoundException: s3://lake/events/part-00031-....parquet
  The file may have been removed by VACUUM. VACUUM events RETAIN 1 HOURS was run at 02:14`,
        note: 'A missing file that a version still lists, right after a VACUUM, is a retention that was shorter than the reader.',
        fix: [
          'Measure first: read the table history for the VACUUM and its retention, and compare it with the start time of the failing job.',
          'Set the retention to cover the longest batch job, the slowest stream lag and the audit horizon. Seven days is the usual default, do not lower it casually.',
          'Make long jobs read a fixed version and finish within the retention, or copy their input first.',
          'Verify: rerun the job and confirm the files of its version are still present.'
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[27] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [logScene, race, small, travel, photon, embedded] };
})();
