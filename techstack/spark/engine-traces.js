/* Mechanism traces are immutable snapshots of calculated work, not scripted counters. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine-model.js'));
  else root.SparkTraces = factory(root.SparkEngine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const cities = [['HN', 'North'], ['HUE', 'Central'], ['SG', 'South']];
  const total = pairs => pairs.reduce((n, p) => n + p[1], 0);
  function buildTrace(chapter, input = {}) {
    const o = M.normalizeOptions(input), steps = [];
    const job = M.runJob(o), partitions = job.input;
    const sourceRows = partitions.flatMap(p => p.records);
    const paid = sourceRows.filter(r => r.status === 'paid' && r.amount >= o.minAmount);
    const metrics = obj => Object.entries(obj).map(([label, value]) => ({ label, value }));
    const add = (phase, title, why, code, counters, scene, columns = [], rows = []) => {
      steps.push(M.copy({ phase, title, why, code, metrics: metrics(counters), scene,
        table: { columns, rows } }));
    };
    const cluster = (active, extra = {}) => ({ type: 'cluster', active, executors: o.executors,
      cores: o.cores, partitions, maps: job.shuffle.maps, totals: job.totals, currentRecord: paid[0] || null, ...extra });
    const registryRows = maps => maps.map(m => [m.id, m.executor, m.available ? 'available' : 'missing', 'attempt ' + m.attempt]);
    if (chapter === 'architecture') {
      add('describe', 'An application has a driver and executor processes',
        'The driver owns the recipe and scheduling decisions. Executors run attempts and hold cached or shuffle blocks. This model represents processes; it does not open network connections.', 0,
        { 'source records': 12, 'executors requested': o.executors }, cluster(['driver']),
        ['Component', 'Owns'], [['Driver', 'graph, task states, output locations'], ['Executor', 'task attempts, local blocks'], ['Storage', 'shared input and published output']]);
      add('allocate', 'A cluster manager allocates executor processes',
        'Resource allocation answers where executor processes can run. Task scheduling answers which partition each free slot should process; they are separate decisions.', 1,
        { 'executors': o.executors, 'task slots': o.executors * o.cores }, cluster(['manager', 'executors'], { flow: 'allocate' }));
      add('register', 'Executors register; the driver can address their slots',
        'A real implementation needs registration, code distribution and heartbeats. Our reference uses an in-process slot registry so the scheduling contract is observable.', 2,
        { 'registered slots': o.executors * o.cores }, cluster(['driver', 'executors'], { flow: 'register' }));
      add('dispatch', 'A task carries partition and attempt identities',
        'T0.0 is an attempt of logical task T0 for P0. Retrying creates T0.1; it does not create another result partition. Blue dashed arrows carry control metadata.', 3,
        { 'partitions': partitions.length, 'first-wave tasks': Math.min(partitions.length, o.executors * o.cores) }, cluster(['driver', 'executors'], { flow: 'dispatch' }));
      add('data', 'Executors read shared input and exchange their own blocks',
        'Orange arrows carry records or shuffle ranges. Bulk input is not routed through the driver. Shuffle outputs are local and their locations are registered with the driver.', 4,
        { 'map outputs': job.shuffle.maps.length, 'shuffle records': job.shuffle.outputRecords }, cluster(['source', 'executors'], { flow: 'data' }),
        ['Map output', 'Location', 'Availability', 'Attempt'], registryRows(job.shuffle.maps));
      add('finish', 'Return compact results; publish larger outputs to storage',
        'The three city totals are tiny enough to return to the driver. Large results need a storage sink. Each later chapter implements a missing part of this same application.', 5,
        { 'result keys': job.totals.length, 'paid amount': total(job.totals) }, cluster(['driver', 'output'], { flow: 'finish' }), ['City', 'Paid total'], job.totals);
    } else if (chapter === 'read') {
      const all = M.readPartitions(M.csv(M.RECORDS), 1)[0].records;
      let emitted = [];
      const scene = (current, stage) => ({ type: 'read', all, partitions, current, stage, emitted, safe: o.safe, gzip: o.gzip, bytes: new TextEncoder().encode(M.csv(M.RECORDS)).length });
      add('plan', 'Plan work from valid decoding boundaries',
        o.gzip ? 'A normal gzip stream needs decoder state from its beginning. One file supplies one independent reader, however many slots exist.' : 'These are real UTF-8 byte offsets in the toy CSV. Read ranges divide scheduling work; records may cross their ends.', 0,
        { 'read partitions': partitions.length, 'input bytes': new TextEncoder().encode(M.csv(M.RECORDS)).length }, scene(-1, 'planned'),
        ['Partition', 'Start byte', 'End byte'], partitions.map(p => [p.id, p.start, p.end]));
      partitions.forEach((p, i) => {
        const crossing = all.filter(r => r.start >= p.start && r.start < p.end && r.end > p.end);
        add('locate ' + p.id, p.id + ' locates its first complete record',
          'Find a safe boundary at the start and complete records owned by this range. The format defines this contract; Parquet and multiline CSV require different readers.', 1,
          { 'range': p.start + '–' + p.end, 'crossing records': crossing.length }, scene(i, 'reading'));
        emitted = emitted.concat(p.records.map(r => r.id));
        add('emit ' + p.id, p.id + ' emits ' + p.records.length + ' owned records',
          o.safe ? 'A record whose start belongs here is emitted once, even if its tail requires reading beyond the nominal range. The next reader skips that tail.' : 'The unsafe hard-stop design drops records crossing the end of a range. Change the boundary rule to restore the source record count.', 2,
          { 'emitted so far': emitted.length, 'source records': 12 }, scene(i, 'emitted'),
          ['Record', 'City', 'Amount', 'Bytes'], p.records.map(r => [r.id, r.city, r.amount, r.start + '–' + r.end]));
      });
      add('verify', 'Check record identity, not just successful task completion',
        'No duplicated IDs and exactly twelve emitted IDs establish conservation for this immutable input. A successful job alone does not prove a correct decoder.', 3,
        { 'emitted': emitted.length, 'missing': 12 - emitted.length, 'duplicated': emitted.length - new Set(emitted).size }, scene(-1, 'verified'));
    } else if (chapter === 'pipeline') {
      let seen = [], passed = [], mapCalls = 0;
      const pipe = (current, at) => ({ type: 'pipeline', rows: sourceRows, current, at, seen, passed, minAmount: o.minAmount });
      add('demand', 'The downstream consumer requests one next() value',
        'Source, filter and map are connected iterators. Request flows upstream; a surviving record flows downstream. No whole-partition intermediate list is required.', 0,
        { 'records read': 0, 'map calls': 0 }, pipe(null, 'demand'));
      for (const row of sourceRows) {
        seen.push(row.id);
        const keep = row.status === 'paid' && row.amount >= o.minAmount;
        add('read ' + row.id, row.id + ' enters the predicate', 'Only this current record is needed by the map/filter pipeline. Stateful operators and user-retained collections have a different memory contract.', 1,
          { 'records examined': seen.length, 'live input record': 1 }, pipe(row.id, 'filter'),
          ['Record', 'Status', 'Amount', 'Passes'], [[row.id, row.status, row.amount, keep ? 'yes' : 'no']]);
        if (keep) { passed.push(row.id); mapCalls++; }
        add((keep ? 'yield ' : 'skip ') + row.id, keep ? row.id + ' yields (' + row.city + ', ' + row.amount + ')' : row.id + ' is skipped; pull again',
          keep ? 'Map runs only for rows passing the predicate. The same record identity is retained in the scene while its representation changes into a key/value pair.' : 'Filter must continue requesting upstream rows until it can supply a result or reaches exhaustion.', keep ? 3 : 2,
          { 'map calls': mapCalls, 'emitted pairs': passed.length, 'retained intermediate lists': 0 }, pipe(row.id, keep ? 'yield' : 'skip'));
      }
      add('exhausted', 'Exhaustion ends the task pipeline',
        'Acquire partition resources for the lifetime of consumption and close them on completion, cancellation or failure. Returning a lazy iterator does not mean its work has finished.', 4,
        { 'records examined': sourceRows.length, 'emitted pairs': passed.length, 'map calls': mapCalls }, pipe(null, 'complete'));
    } else if (chapter === 'lineage') {
      const e = new M.Engine(o), source = e.source(), filtered = source.filter(r => r.status === 'paid' && r.amount >= o.minAmount), pairs = filtered.map(r => [r.city, r.amount]);
      const graph = (active, cached = []) => ({ type: 'lineage', active, partitions: partitions.length, cached });
      add('describe', 'Transformations add immutable dependency nodes',
        'Each RDD retains partition count, parent dependency and compute(partition). No source partition has been requested yet. Closures are opaque to a SQL optimizer.', 0,
        { 'source reads': e.metrics.sourceReads, 'RDD nodes': 3 }, graph('graph'),
        ['RDD', 'Dependency', 'Partitions'], [[source.id, 'source', source.partitions], [filtered.id, 'narrow → ' + source.id, filtered.partitions], [pairs.id, 'narrow → ' + filtered.id, pairs.partitions]]);
      if (o.persist) pairs.persist(o.cacheLevel);
      add('intent', o.persist ? 'Persistence marks a storage policy, not resident data' : 'Without persistence, keep only the recipe',
        'Cache contents appear only when execution populates them. Capacity is modeled in partition slots here; real storage capacity is measured in bytes.', 1,
        { 'cached partitions': e.cache.size, 'memory cache slots': o.cacheCapacity }, graph('cache'));
      const first = pairs.count(), firstReads = e.metrics.sourceReads, cached = partitions.filter((p, i) => e.cache.has(pairs.id + '/' + i)).map(p => p.id);
      add('first action', 'The first action pulls partitions and populates eligible storage',
        'Memory-only retains only what fits; memory-and-disk models local fallback. Missing blocks keep their lineage recovery path.', 2,
        { 'result count': first, 'source reads': firstReads, 'cached partitions': e.cache.size }, graph('action', cached),
        ['Partition', 'Retained'], partitions.map(p => [p.id, cached.includes(p.id) ? 'yes' : 'no']));
      const second = pairs.count();
      add('second action', 'The second action uses available blocks and recomputes misses',
        'A shared variable is not a cached result. Compare the source-read counter with and without persistence, or with fewer cache slots.', 3,
        { 'result count': second, 'additional source reads': e.metrics.sourceReads - firstReads, 'total source reads': e.metrics.sourceReads }, graph('reuse', cached));
      add('checkpoint', 'A durable checkpoint replaces the dependency recipe after materialization',
        'The runnable reference implements persistence, not durable checkpoint storage. A reliable checkpoint must be durably written before parents can be severed; local checkpoint loss can make recovery impossible.', 4,
        { 'reusable partitions': e.cache.size, 'result count': second }, graph('checkpoint', cached));
    } else if (chapter === 'stages') {
      const scene = phase => ({ type: 'stages', phase, maps: partitions.length, reducers: o.reducers });
      add('walk', 'Walk backwards from the requested city totals', 'Partition dependencies decide what can be pipelined and what needs producer output. One source-code line is not one stage.', 0,
        { 'requested result partitions': o.reducers }, scene('walk'));
      add('narrow', 'Read → filter → map remains a local pull pipeline', 'A child partition knows which parent partition to compute. These narrow functions can run inside one map task.', 1,
        { 'producer tasks': partitions.length, 'narrow operators': 3 }, scene('narrow'));
      add('exchange', 'reduceByKey introduces a shuffle dependency', 'Equal keys begin in several source partitions. The downstream reducer needs its ranges from every contributing map output, so the planner creates a producer stage.', 2,
        { 'stages': 2, 'logical map/reduce ranges': partitions.length * o.reducers }, scene('exchange'));
      add('wait', 'The consumer stage waits for required map outputs', 'Task completion and output availability must both be represented. Cache or existing compatible partitioning can alter the physical work required.', 3,
        { 'runnable producer tasks': partitions.length, 'runnable reducers': 0 }, scene('wait'));
      add('ready', 'Registered map outputs unlock reducer tasks', 'Partitions determine logical task count. Slots determine how many of those tasks may run concurrently. A narrow coalesce can funnel upstream reads into fewer tasks.', 4,
        { 'producer tasks': partitions.length, 'consumer tasks': o.reducers, 'slots': o.executors * o.cores }, scene('ready'),
        ['Stage', 'Dependency', 'Tasks'], [['S0', 'source + narrow pipeline', partitions.length], ['S1', 'S0 shuffle outputs', o.reducers]]);
    } else if (chapter === 'schedule') {
      const run = M.scheduleTasks(partitions.length, o.executors * o.cores);
      for (const tick of run.ticks) {
        const running = tick.tasks.filter(t => t.status === 'running').length, complete = tick.tasks.filter(t => t.status === 'complete').length;
        add(tick.phase + ' ' + tick.wave, tick.phase === 'queued' ? 'Create one logical task per required partition' : tick.phase === 'dispatch' ? 'Wave ' + tick.wave + ': assign attempts to free slots' : 'Wave ' + tick.wave + ': accept task completion',
          tick.phase === 'dispatch' ? 'The task envelope contains stage, partition and attempt IDs plus its compute recipe. A real executor deserializes it and reports completion over transport.' : 'All tasks have unit duration in this scheduling experiment. Additional slots reduce the number of waves; they do not create additional partitions.',
          tick.phase === 'queued' ? 0 : tick.phase === 'dispatch' ? 2 : 4,
          { 'tasks': partitions.length, 'running': running, 'complete': complete, 'slots': run.slots, 'waves needed': run.waves },
          { type: 'schedule', tasks: tick.tasks, slots: run.slots, executors: o.executors, cores: o.cores, wave: tick.wave },
          ['Attempt', 'Partition', 'State', 'Slot'], tick.tasks.map(t => [t.id + '.' + t.attempt, t.partition, t.status, t.slot == null ? '—' : 'E' + Math.floor(t.slot / o.cores) + '/slot' + t.slot % o.cores]));
      }
    } else if (chapter === 'shuffle') {
      const s = job.shuffle, published = [], fetched = [];
      const scene = (phase, map = -1, reducer = -1) => ({ type: 'shuffle', phase, map, reducer, shuffle: s, published, fetched });
      add('route', 'Hash each key to a consistent reducer destination', 'Equal keys need the same destination. The hash in this teaching engine is deterministic; it is not Spark or Python’s production hash.', 0,
        { 'maps': s.maps.length, 'reducers': s.reducers, 'input pairs': s.inputRecords }, scene('route'), ['City', 'Destination'], cities.map(c => [c[0], 'R' + M.destination(c[0], o.reducers)]));
      for (const [i, map] of s.maps.entries()) {
        add('combine ' + map.id, map.id + (o.combine ? ' merges valid local partial sums' : ' preserves all original values'),
          o.combine ? 'sum is associative and commutative. An average would need both sum and count; averaging partial averages would change the answer.' : 'Without map-side combine, every original value is routed. groupByKey needs that contract, while a sum can usually reduce transfer.', 1,
          { 'map input': map.inputRecords, 'map output': map.records.length, 'spill runs': map.runs.filter(r => r.spilled).length }, scene('combine', i), ['Key', 'Partial value'], map.records);
        published.push(map.id);
        add('publish ' + map.id, map.id + ' publishes a data stream and reducer offset index', 'Each logical block is the half-open byte range index[r]..index[r+1] in this map’s encoded output. Empty ranges still have valid equal offsets.', 2,
          { 'output bytes': map.bytes, 'logical ranges': s.reducers }, scene('publish', i),
          ['Range', 'Start', 'End', 'Records'], map.blocks.map((b, r) => ['R' + r, map.index[r], map.index[r + 1], b.length]));
      }
      for (let r = 0; r < s.reducers; r++) {
        fetched.push(r);
        add('fetch R' + r, 'R' + r + ' retrieves only its indexed ranges',
        'The reducer consults output locations, fetches local or remote ranges, decodes partial states and merges by key. Bulk records move between executors, not through the driver.', 3,
        { 'contributing maps': s.maps.length, 'fetched records': s.loads[r] }, scene('fetch', -1, r),
        ['Map', 'Range bytes', 'Records'], s.maps.map(m => [m.id, m.index[r] + '–' + m.index[r + 1], m.blocks[r].length]));
      }
      add('reduce', 'Merge partial sums into the same city totals', 'Change combine, read partitions or reducer count. Transfer and task counts change, but the paid amount remains invariant when input reading is safe.', 4,
        { 'shuffled pairs': s.outputRecords, 'shuffle bytes': s.bytes, 'paid amount': total(job.totals) }, scene('reduce'), ['City', 'Paid total'], job.totals);
    } else if (chapter === 'memory') {
      const map = job.shuffle.maps.reduce((a, b) => b.runs.length > a.runs.length ? b : a), spilled = [];
      const scene = (buffer, phase) => ({ type: 'memory', capacity: o.memory, buffer, spilled, merged: map.records, phase, map: map.id });
      add('grant', 'A spillable operator requests a bounded working buffer', 'The slider is a logical entry budget for this operator, not JVM megabytes. Real execution grants vary with active demand; arbitrary user arrays do not acquire automatic spill support.', 0,
        { 'buffer capacity': o.memory, 'concurrent slots': o.executors * o.cores, 'map input': map.inputRecords }, scene([], 'grant'));
      for (const run of map.runs) {
        add('fill ' + run.id, 'Fill and sort the next bounded run', 'The buffer contains at most the granted number of key/value entries. Existing keys can combine in place; accepting another distinct entry may require a spill.', 1,
          { 'entries buffered': run.records.length, 'peak buffer': map.peak }, scene(run.records, 'fill'), ['Key', 'Partial value'], run.records);
        if (run.spilled) {
          spilled.push(run);
          add('spill ' + run.id, 'Write a sorted run and release its buffer', 'The model retains encoded runs as JavaScript arrays representing disk. A production implementation writes them to local files and uses bounded merge readers; those arrays are not a real process memory guarantee.', 2,
            { 'disk runs': spilled.length, 'buffer entries': 0 }, scene([], 'spill'));
        }
      }
      add('merge', 'Merge sorted runs into final indexed shuffle ranges', 'The final merge preserves every contribution. Supported aggregations can combine again during merge; a huge single object or user-retained state still has no generic spill escape.', 3,
        { 'disk runs': spilled.length, 'output entries': map.records.length, 'peak buffer': map.peak }, scene(map.records.slice(0, o.memory), 'merge'), ['Key', 'Merged value'], map.records);
    } else if (chapter === 'recovery') {
      const failed = 0, recovered = M.runJob({ ...o, failExecutor: o.loss ? failed : -1 });
      const original = job.shuffle.maps, missing = o.loss ? M.recoverOutputs(job.shuffle, failed, o) : { lost: [], preserved: false };
      const scene = (phase, maps) => cluster(['driver', 'executors'], { type: 'recovery', phase, maps, failed: o.loss ? failed : -1, preserved: missing.preserved, flow: phase });
      add('available', 'Map-task success is separate from output availability', 'The driver retains map-output locations. Every required output is available before this experiment injects an executor process or node loss.', 0,
        { 'available outputs': original.length }, scene('available', original), ['Map', 'Location', 'Availability', 'Attempt'], registryRows(original));
      const invalid = original.map(m => ({ ...m, available: !missing.lost.includes(m.id) }));
      add('lost', o.loss ? 'E' + failed + (o.nodeLost ? ' node and disk disappear' : ' executor process exits') : 'No loss is injected',
        missing.preserved ? 'The node and shuffle service survive, so the outputs can still be served after process exit. The reference assumes all required files remain intact.' : 'All outputs on the lost host become unavailable, not just the block the reducer happened to request. A surviving service cannot preserve a destroyed node or disk.', 1,
        { 'unavailable outputs': missing.lost.length, 'available outputs': original.length - missing.lost.length }, scene('lost', invalid), ['Map', 'Location', 'Availability', 'Attempt'], registryRows(invalid));
      const replaying = M.copy(invalid);
      if (missing.lost.length) {
        add('FetchFailed', 'A failed fetch invalidates the missing dependency', 'Retrying the consumer against the same unavailable location cannot recreate producer bytes. Recover missing maps while reusing intact outputs.', 2,
          { 'map tasks to replay': missing.lost.length }, scene('fetch-failed', invalid));
        for (const id of missing.lost) {
          const p = Number(id.slice(1)); replaying[p] = M.copy(recovered.shuffle.maps[p]);
          add('replay ' + id, id + '.1 recomputes the producer partition', 'A new attempt follows the upstream recipe. Immutable inputs and reproducible computation are required; external writes may execute again.', 3,
          { 'replayed maps': missing.lost.indexOf(id) + 1 }, scene('replay', replaying), ['Map', 'Location', 'Availability', 'Attempt'], registryRows(replaying));
        }
      }
      add('resume', 'Available outputs let downstream attempts finish', 'Speculation is another way to create several attempts for one logical task. It races equivalent work; it does not divide a hot-key partition. Output authorization is handled in the next chapter.', 4,
        { 'source partition reads': recovered.metrics.sourceReads, 'map replays': recovered.metrics.replayedMaps, 'paid amount': total(recovered.totals) }, scene('resume', recovered.shuffle.maps), ['City', 'Paid total'], recovered.totals);
    } else if (chapter === 'commit') {
      const out = job.output, visible = [];
      const scene = phase => ({ type: 'commit', phase, attempts: out.attempts, accepted: out.accepted, visible, ready: phase === 'ready', aborted: phase === 'aborted' });
      add('private', 'Write each attempt to an isolated output identity', 'The reference models output artifacts rather than writing files. A supported committer provides the real isolation protocol. Arbitrary database or API writes from task code are outside it.', 0,
        { 'logical output partitions': o.reducers, 'attempt outputs': out.attempts.length }, scene('private'),
        ['Attempt', 'Partition', 'Path'], out.attempts.map(a => [a.id, 'R' + a.partition, '_temporary/' + a.id]));
      add('authorize', 'Select one successful attempt per logical partition', 'In this experiment the speculative T0.1 wins when enabled; T0.0 is denied. Winner selection stops duplicate task output, not partial visibility across many files.', 1,
        { 'accepted task outputs': out.accepted.length, 'duplicate task commits': 0 }, scene('authorize'),
        ['Partition', 'Winning attempt'], out.accepted.map(a => ['R' + a.partition, 'T' + a.partition + '.' + a.attempt]));
      for (const file of out.visible) {
        visible.push(file);
        add('publish ' + file.id, file.id + ' becomes individually visible', 'Object publication is a per-object operation. A rename may be copy-and-delete on an object store; pending multipart uploads avoid rename but do not make a directory transaction.', 2,
          { 'visible files': visible.length, 'dataset ready': 'no' }, scene('publish'));
      }
      add(out.ready ? 'ready' : 'aborted', out.ready ? 'Signal dataset readiness after successful publication' : 'The job stops with partially published output',
        out.ready ? '_SUCCESS is a completion signal under an agreed reader policy. Atomic concurrent table updates need a transactional snapshot protocol, beyond this file-output reference.' : 'A direct path reader can see these files. A reader honoring readiness rejects this incomplete dataset. A killed multi-file commit does not guarantee that no partial files are visible.', 3,
        { 'visible files': visible.length, 'dataset ready': out.ready ? 'yes' : 'no', 'paid amount computed': total(job.totals) }, scene(out.ready ? 'ready' : 'aborted'));
    } else if (chapter === 'sql') {
      const plan = M.planQuery({ columns: ['city', 'amount'], groupBy: 'city', aggregate: 'sum' });
      const scene = phase => ({ type: 'sql', phase, plan });
      add('logical', 'Represent the query as inspectable expressions', 'An RDD carries opaque functions. A DataFrame exposes schema and column expressions. A JVM Dataset adds encoders for typed objects; a typed lambda can still be opaque to relational rewrites.', 0,
        { 'logical operators': plan.logical.length, 'schema columns': plan.schema.length }, scene('logical'), ['Logical operation'], plan.logical.map(x => [x]));
      add('analyze', 'Resolve column references and check types', 'The small reference planner validates known column names. Spark’s analyzer also resolves relations, types and functions. An unresolved column fails before distributed execution.', 1,
        { 'resolved schema columns': plan.schema.length, 'source records read': 0 }, scene('analyze'), ['Column', 'Toy type'], [['id', 'string'], ['city', 'string'], ['amount', 'number'], ['status', 'string']]);
      add('rewrite', 'Prune unused fields and retain predicate inputs', 'The query needs city and amount, plus status to evaluate its filter. Parquet may support column pruning and filter pushdown; this CSV reference still decodes complete lines.', 2,
        { 'fields required': plan.scanColumns.length, 'unused fields': plan.schema.length - plan.scanColumns.length }, scene('rewrite'), ['Required field'], plan.scanColumns.map(c => [c]));
      add('physical', 'Choose physical operators and insert required distribution', 'A grouped sum uses local partial aggregation, an exchange by city, then final aggregation. Physical properties such as distribution and ordering determine whether an exchange or sort is needed.', 3,
        { 'physical operators': plan.physical.length, 'exchange boundaries': 1 }, scene('physical'), ['Operator', 'Contract'], plan.physical.map(x => [x.operator, x.detail]));
      add('codegen', 'Generated-loop regions stop at exchanges and unsupported operators', 'The shaded regions identify supported SQL pipelines. The reference does not generate JVM code. Python UDF execution introduces its own boundary; it is not fused into the same Java loop.', 4,
        { 'illustrated codegen regions': plan.codegenRegions.length, 'stages': 2 }, scene('codegen'));
      add('execute', 'Lower the physical work into stage tasks', 'The first action runs the selected plan. The reference executes equivalent iterator and shuffle operators; actual Spark SQL has more operators and may create additional query stages.', 5,
        { 'producer tasks': partitions.length, 'consumer tasks': o.reducers, 'paid amount': total(job.totals) }, scene('execute'), ['City', 'Paid total'], job.totals);
    } else if (chapter === 'joins') {
      const strategy = o.hint === 'broadcast' || o.hint === 'auto' && o.dimensionMB <= o.thresholdMB ? 'broadcast' : 'sort-merge';
      const scene = phase => ({ type: 'join', phase, strategy, dimensions: cities, rows: paid, partitions, executors: o.executors, reducers: o.reducers });
      add('choose', 'Choose where matching state will live', 'The size sliders are illustrative planner estimates in MB, independent of the three displayed dimension rows. Hints express strategy preferences; they do not provide memory or override unsupported join semantics.', 0,
        { 'estimated dimension MB': o.dimensionMB, 'broadcast threshold MB': o.thresholdMB, 'chosen strategy': strategy }, scene('choose'));
      add('build', strategy === 'broadcast' ? 'Build the small hash relation before distribution' : 'Align both inputs by join key',
        strategy === 'broadcast' ? 'The driver prepares the build relation; executors need space for decoded hash state. File bytes may underestimate that state.' : 'Each task must receive matching key ranges from both inputs. Compatible existing partitioning can avoid an exchange; this toy assumes neither input is aligned.', 1,
        { 'dimension rows shown': 3, 'fact rows shown': paid.length }, scene('build'), ['City', 'Region'], cities);
      add('place', strategy === 'broadcast' ? 'Replicate build state to each executor' : 'Sort corresponding partitions on both sides',
        strategy === 'broadcast' ? 'Local probes let the larger streamed input stay in its existing partitions. Replication costs increase with executor count.' : 'Sort-merge pairs corresponding ordered runs. Shuffled hash is another choice: build one side’s hash relation per aligned partition.', 2,
        { 'modeled build copies': strategy === 'broadcast' ? o.executors : o.reducers, 'fact exchange needed': strategy === 'broadcast' ? 'no' : 'yes' }, scene('place'));
      add('probe', strategy === 'broadcast' ? 'Probe local hash state with each paid order' : 'Merge matching key groups', 'Join semantics must emit every matching pair. Duplicate keys on both sides multiply output; a faster physical strategy cannot remove required pairs.', 3,
        { 'matched order rows': paid.length }, scene('probe'), ['Record', 'City', 'Region'], paid.map(r => [r.id, r.city, cities.find(c => c[0] === r.city)[1]]));
      add('verify', 'Verify matches and capacity, then inspect the executed strategy', 'This inner equijoin has one dimension row per city and therefore preserves the number of paid orders. A broadcast timeout increase cannot repair an oversized decoded relation.', 4,
        { 'input paid rows': paid.length, 'joined rows': paid.length, 'paid amount': paid.reduce((n, r) => n + r.amount, 0) }, scene('verify'));
    } else if (chapter === 'adaptive') {
      const a = M.adaptPartitions(paid, o), scene = phase => ({ type: 'adaptive', phase, adaptation: a, operation: o.operation, salt: o.salt });
      add('measure', 'Materialized exchange statistics replace estimates', 'Bars count actual toy records per hash destination, not production bytes or Spark’s skew thresholds. Runtime statistics permit changes to eligible remaining SQL work; completed exchange cost remains paid.', 0,
        { 'largest partition rows': a.maximum, 'initial partitions': o.reducers }, scene('measure'), ['Partition', 'Rows'], a.loads.map((n, i) => ['R' + i, n]));
      add('coalesce', 'Small adjacent ranges can share a consumer task', 'The toy packs adjacent small ranges up to four rows. Spark uses byte statistics, advisory sizes and parallelism settings. Coalescing does not divide a single aggregation group.', 1,
        { 'consumer pieces': a.coalescedBeforeSplit.length, 'adaptive enabled': o.adaptive ? 'yes' : 'no' }, scene('coalesce'), ['Consumer', 'Rows'], a.coalescedBeforeSplit.map(p => [p.id, p.rows]));
      add('skew', o.operation === 'join' ? (a.skewSplit ? 'Split a hot join range and supply its counterpart' : 'No eligible oversized join range is split') : 'AQE skew-join splitting does not split an aggregation group',
        o.operation === 'join' ? 'Each split needs the corresponding other-side data. Re-reading that counterpart preserves matches at a cost; splitting only one side without it would lose results.' : 'Equal group keys must merge into one logical result. Increasing ordinary hash buckets leaves the hot key together; decomposition requires valid partial aggregate state.', 2,
        { 'skew join split': a.skewSplit ? 'yes' : 'no', 'largest initial rows': a.maximum }, scene('skew'));
      if (o.operation === 'group') add('partial', a.salted ? 'Distribute a hot sum using salted subkeys' : 'Retain the original group keys', 'Salted aggregation computes partial sums per (city, salt), then merges by city. An average needs (sum,count); arbitrary aggregates may not admit bounded partial state.', 3,
        { 'partial states': a.partials.length, 'salt buckets': o.operation === 'group' ? o.salt : 'not applied to join' }, scene('partial'), ['Extended key', 'Partial sum'], a.partials);
      else add('partial', 'Verify every join piece has its counterpart', 'A join piece consumes both inputs. Salted grouped states are not part of this join adaptation path.', 3,
        { 'consumer pieces': a.coalesced.length, 'input paid rows': paid.length }, scene('partial'), ['Consumer','Rows','Counterpart'], a.coalesced.map(p => [p.id,p.rows,p.counterpart || 'aligned dimension range']));
      add('merge', 'Check the final answer against the original contributions', 'The distribution and consumer count can change without changing the total. Ordinary equality joins do not match NULL; null-safe equality and grouping have different semantics.', 4,
        { 'paid amount': a.total, 'input paid amount': paid.reduce((n, r) => n + r.amount, 0) }, scene('merge'), ['City', 'Final total'], a.totals);
    } else if (chapter === 'evidence') {
      const events = job.events, scene = (phase, count) => ({ type: 'evidence', phase, events: events.slice(0, count), total: events.length });
      add('listen', 'Record decisions when they happen', 'The same reference engine emits these events while running the job. Sequence numbers reflect this driver’s reported order; they are not a globally synchronized cluster timeline.', 0,
        { 'events recorded': 0 }, scene('listen', 0));
      const stride = Math.max(1, Math.ceil(events.length / 4));
      for (let i = stride; i < events.length + stride; i += stride) {
        const count = Math.min(i, events.length);
        add('append ' + count, 'Append reported execution events to a durable log', 'A real event sink must be enabled before execution and handle durable writes, rotation and retention. Logging cannot reconstruct an event that was never retained.', 1,
          { 'events retained': count, 'observed source reads': events.slice(0,count).filter(e => e.type === 'ReadPartition').length }, scene('append', count),
          ['Sequence', 'Event', 'Detail'], events.slice(Math.max(0, count - 8), count).map(e => [e.sequence, e.type, e.detail]));
      }
      add('driver gone', 'Retained evidence outlives the driver and executors', 'The reference can serialize its event list. A Spark history server replays event logs; it does not reconnect to old executors or rerun the computation.', 2,
        { 'retained events': events.length, 'live executors required': 0 }, scene('archive', events.length));
      add('replay', 'Use plan and task metrics together to explain actual cost', 'An adaptive final plan does not erase a completed shuffle. Compare maximum and median task input to separate large partitions from slow machines; inspect attempt history for retries.', 3,
        { 'shuffle bytes': job.metrics.shuffleBytes, 'spill runs': job.metrics.spillRuns, 'paid amount': total(job.totals) }, scene('replay', events.length));
    } else if (chapter === 'build') {
      const recovered = M.runJob({ ...o, failExecutor: o.loss ? 0 : -1 });
      const phases = [
        ['define', 'Define the lazy paid-order aggregation', 'No source read is needed to create the recipe. The runnable reference has the same RDD, partition and shuffle contracts taught in earlier chapters.', 0, { 'logical records': 12 }, 'dispatch'],
        ['read', 'Read valid partitions and pull the local pipeline', 'Stable record identities pass through read, predicate and map. The filter removes cancelled orders before the exchange.', 1, { 'read partitions': partitions.length, 'paid pairs': paid.length }, 'data'],
        ['shuffle', 'Publish indexed partial sums from every map', 'The bounded shuffle writer combines where valid, spills full buffers and publishes data plus per-reducer offsets.', 2, { 'shuffle records': recovered.metrics.shuffleRecords, 'spill runs': recovered.metrics.spillRuns }, 'data'],
        ['recover', 'Restore any lost producer output before consuming it', 'The injected failure replays only unavailable map outputs. A surviving service can avoid process-loss replay; it cannot restore destroyed disks.', 3, { 'map replays': recovered.metrics.replayedMaps, 'source reads': recovered.metrics.sourceReads }, 'register'],
        ['reduce', 'Fetch and merge distributed contributions', 'Each reducer gets only its key ranges. The driver receives compact city totals rather than the whole source.', 4, { 'result keys': recovered.totals.length, 'paid amount': total(recovered.totals) }, 'finish'],
        ['publish', 'Select output attempts and apply the readiness contract', 'Visible files and ready datasets are different states. Run with failAfter=1 to observe partial publication without a readiness signal.', 5, { 'visible files': recovered.output.visible.length, 'ready': recovered.output.ready ? 'yes' : 'no' }, 'finish'],
        ['evidence', 'Keep evidence and verify the invariant', 'For the default query, HN=220, HUE=210, SG=210 and total=640. Changing distribution, combine or buffer size must preserve that answer; changing the predicate changes it intentionally.', 6, { 'events retained': recovered.events.length, 'paid amount': total(recovered.totals) }, 'finish']
      ];
      for (const [phase, title, why, code, counters, flow] of phases) add(phase, title, why, code, counters,
        cluster(['driver', 'executors', ...(phase === 'read' ? ['source'] : []), ...(phase === 'publish' ? ['output'] : [])], { flow, maps: ['define','read'].includes(phase) ? [] : phase === 'shuffle' ? job.shuffle.maps : recovered.shuffle.maps, phase, outputState: ['publish','evidence'].includes(phase) ? recovered.output.ready ? 'ready' : 'aborted' : 'pending' }),
        phase === 'reduce' || phase === 'evidence' ? ['City', 'Paid total'] : ['Component', 'State'],
        phase === 'reduce' || phase === 'evidence' ? recovered.totals : [['Driver', phase], ['Executors', o.executors + ' processes modeled'], ['Output', recovered.output.ready && ['publish','evidence'].includes(phase) ? 'ready' : 'not ready']]);
    } else throw new Error('Unknown chapter: ' + chapter);
    return { chapter, options: o, steps, result: job.totals, sourceRecords: M.RECORDS };
  }
  return { buildTrace };
});
