/* A runnable, deterministic teaching engine. No real RPC, disk files or Spark dependency.
   The browser animates the same computed records, grants and outputs that Node executes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SparkEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RECORDS = Object.freeze(Array.from({ length: 12 }, (_, i) => Object.freeze({
    id: 'O' + String(i + 1).padStart(2, '0'), city: ['HN', 'HUE', 'SG'][i % 3],
    amount: (i + 1) * 10, status: [4, 8].includes(i) ? 'cancelled' : 'paid'
  })));
  const DEFAULTS = Object.freeze({ partitions: 3, reducers: 3, executors: 2, cores: 1,
    memory: 3, combine: true, gzip: false, safe: true, minAmount: 0,
    cacheCapacity: 2, cacheLevel: 'memory', persist: true, loss: true, service: false,
    nodeLost: false, duplicate: true, failAfter: 0, dimensionMB: 5, thresholdMB: 10,
    hint: 'auto', hot: false, adaptive: true, operation: 'group', salt: 1 });
  const RANGES = { partitions: [1, 6], reducers: [1, 5], executors: [1, 3], cores: [1, 2],
    memory: [1, 8], minAmount: [0, 100], cacheCapacity: [1, 6], failAfter: [0, 5],
    dimensionMB: [1, 50], thresholdMB: [0, 30], salt: [1, 4] };
  const CHOICES = { cacheLevel: ['memory', 'memory-and-disk'], hint: ['auto', 'broadcast', 'merge'], operation: ['group', 'join'] };
  const copy = x => JSON.parse(JSON.stringify(x));
  const sum = (a, b) => a + b;
  const size = s => new TextEncoder().encode(s).length;
  const csv = records => records.map(r => [r.id, r.city, r.amount, r.status].join(',')).join('\n') + (records.length ? '\n' : '');
  function normalizeOptions(input = {}) {
    const out = { ...DEFAULTS };
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
      if (!(key in input)) continue;
      if (RANGES[key]) {
        const n = Number(input[key]);
        out[key] = Number.isFinite(n) ? Math.max(RANGES[key][0], Math.min(RANGES[key][1], Math.round(n))) : fallback;
      } else if (CHOICES[key]) out[key] = CHOICES[key].includes(input[key]) ? input[key] : fallback;
      else out[key] = input[key] === true || input[key] === 'true' || input[key] === 1;
    }
    return out;
  }
  function hash(key) {
    let h = 2166136261;
    for (const c of String(key)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const destination = (key, reducers) => hash(key) % reducers;
  function readPartitions(text, count = 3, options = {}) {
    const n = options.gzip ? 1 : normalizeOptions({ partitions: count }).partitions;
    const bytes = size(text), records = [];
    let cursor = 0;
    for (const line of text.split(/(?<=\n)/u)) {
      if (!line) continue;
      const start = cursor, end = cursor += size(line);
      const [id, city, amount, status] = line.trimEnd().split(',');
      if (id && city && Number.isFinite(Number(amount)) && ['paid', 'cancelled'].includes(status)) {
        records.push({ id, city, amount: Number(amount), status, start, end });
      }
    }
    const partitions = Array.from({ length: n }, (_, i) => ({ id: 'P' + i,
      start: Math.floor(bytes * i / n), end: Math.floor(bytes * (i + 1) / n), records: [] }));
    for (const r of records) {
      const owner = partitions.find(p => r.start >= p.start && r.start < p.end);
      if (owner && (options.safe !== false || r.end <= owner.end)) owner.records.push(r);
    }
    return partitions;
  }
  function writeShuffle(inputs, reducers = 3, options = {}) {
    const o = normalizeOptions({ ...options, reducers });
    const reduce = options.reduceFn || sum;
    const maps = inputs.map((input, m) => {
      const runs = []; let buffer = [], peak = 0;
      const flush = spilled => {
        if (!buffer.length) return;
        runs.push({ id: 'M' + m + '-run' + runs.length, spilled,
          records: buffer.slice().sort((a, b) => destination(a[0], o.reducers) - destination(b[0], o.reducers) || a[0].localeCompare(b[0])) });
        buffer = [];
      };
      for (const [key, value] of input) {
        const found = o.combine ? buffer.find(x => x[0] === key) : null;
        if (found) found[1] = reduce(found[1], value);
        else { if (buffer.length === o.memory) flush(true); buffer.push([key, value]); }
        peak = Math.max(peak, buffer.length);
      }
      flush(false);
      let merged = runs.flatMap(r => r.records);
      if (o.combine) {
        const states = new Map();
        for (const [k, v] of merged) states.set(k, states.has(k) ? reduce(states.get(k), v) : v);
        merged = Array.from(states);
      }
      const blocks = Array.from({ length: o.reducers }, () => []);
      for (const pair of merged) blocks[destination(pair[0], o.reducers)].push(pair);
      blocks.forEach(b => b.sort((a, b) => a[0].localeCompare(b[0])));
      const index = [0];
      blocks.forEach(b => index.push(index.at(-1) + b.reduce((n, r) => n + size(JSON.stringify(r) + '\n'), 0)));
      return { id: 'M' + m, executor: 'E' + Math.floor((m % (o.executors * o.cores)) / o.cores), attempt: 0,
        inputRecords: input.length, records: blocks.flat(), blocks, index,
        bytes: index.at(-1), file: 'S0-M' + m + '.data', runs, peak, available: true };
    });
    return summarizeShuffle(maps, o.reducers);
  }
  function summarizeShuffle(maps, reducers) {
    return { maps, reducers, inputRecords: maps.reduce((n, m) => n + m.inputRecords, 0),
      outputRecords: maps.reduce((n, m) => n + m.records.length, 0),
      bytes: maps.reduce((n, m) => n + m.bytes, 0),
      spillRuns: maps.reduce((n, m) => n + m.runs.filter(r => r.spilled).length, 0),
      peakBuffer: Math.max(0, ...maps.map(m => m.peak)),
      loads: Array.from({ length: reducers }, (_, r) => maps.reduce((n, m) => n + m.blocks[r].length, 0)) };
  }
  function scheduleTasks(count, slots = 2) {
    count = Math.max(0, Math.floor(Number(count) || 0)); slots = Math.max(1, Math.floor(Number(slots) || 1));
    const tasks = Array.from({ length: count }, (_, p) => ({ id: 'T' + p, partition: 'P' + p,
      attempt: 0, status: 'pending', slot: null }));
    const ticks = [{ phase: 'queued', tasks: copy(tasks), wave: 0 }];
    let waves = 0;
    while (tasks.some(t => t.status === 'pending')) {
      const wave = tasks.filter(t => t.status === 'pending').slice(0, slots); waves++;
      wave.forEach((t, i) => { t.status = 'running'; t.slot = i; });
      ticks.push({ phase: 'dispatch', tasks: copy(tasks), wave: waves });
      wave.forEach(t => { t.status = 'complete'; });
      ticks.push({ phase: 'complete', tasks: copy(tasks), wave: waves });
    }
    return { tasks: copy(tasks), ticks, waves, slots };
  }
  function recoverOutputs(shuffle, executor, options = {}) {
    const preserved = !!options.service && !options.nodeLost;
    const lost = preserved ? [] : shuffle.maps.filter(m => m.executor === 'E' + executor).map(m => m.id);
    return { lost, preserved, registry: shuffle.maps.map(m => ({ map: m.id, location: m.executor,
      available: !lost.includes(m.id), attempt: m.attempt })) };
  }
  function publishOutput(partitions, options = {}) {
    const attempts = partitions.flatMap((rows, p) => [0, ...(options.duplicate && p === 0 ? [1] : [])]
      .map(a => ({ partition: p, attempt: a, id: 'T' + p + '.' + a, rows: copy(rows), private: true })));
    const accepted = partitions.map((rows, p) => ({ partition: p, attempt: p === 0 && options.duplicate ? 1 : 0,
      id: 'part-' + p, rows: copy(rows) }));
    const failAfter = options.failAfter == null ? partitions.length : Math.max(0, Math.min(partitions.length, options.failAfter));
    return { attempts, accepted, visible: accepted.slice(0, failAfter),
      ready: options.failAfter == null, aborted: options.failAfter != null };
  }
  class RDD {
    constructor(engine, partitions, parent, compute, kind = 'narrow') {
      this.engine = engine; this.id = 'RDD' + engine.nextId++; this.partitions = partitions;
      this.parent = parent; this.compute = compute; this.dependency = kind; this.storage = null;
    }
    *iterator(p) {
      const key = this.id + '/' + p, e = this.engine;
      if (e.cache.has(key)) { e.event('CacheHit', key); yield* e.cache.get(key); return; }
      if (!this.storage) { yield* this.compute(p); return; }
      const rows = Array.from(this.compute(p));
      if (e.memoryCache < e.options.cacheCapacity || this.storage === 'memory-and-disk') {
        const disk = e.memoryCache >= e.options.cacheCapacity;
        if (!disk) e.memoryCache++;
        e.cache.set(key, rows); e.metrics.cachedPartitions = e.cache.size;
        e.event(disk ? 'CacheDisk' : 'CacheMemory', key);
      }
      yield* rows;
    }
    map(fn) { const self = this; return new RDD(this.engine, this.partitions, this,
      function* (p) { for (const row of self.iterator(p)) yield fn(row); }); }
    filter(fn) { const self = this; return new RDD(this.engine, this.partitions, this,
      function* (p) { for (const row of self.iterator(p)) if (fn(row)) yield row; }); }
    persist(level = 'memory') {
      if (!['memory', 'memory-and-disk'].includes(level)) throw new Error('Unknown storage level');
      this.storage = level; return this;
    }
    count() {
      this.engine.event('JobStart', this.id + ':count'); let n = 0;
      for (let p = 0; p < this.partitions; p++) for (const row of this.iterator(p)) { void row; n++; }
      this.engine.event('JobEnd', 'count=' + n); return n;
    }
    collect() {
      this.engine.event('JobStart', this.id + ':collect'); const out = [];
      for (let p = 0; p < this.partitions; p++) out.push(...this.iterator(p));
      this.engine.event('JobEnd', 'rows=' + out.length); return out;
    }
    reduceByKey(fn = sum, reducers = this.engine.options.reducers) {
      const parent = this, e = this.engine; let shuffle = null;
      reducers = normalizeOptions({ reducers }).reducers;
      return new RDD(e, reducers, parent, function* (r) {
        if (!shuffle) {
          const maps = [], completed = new Set();
          const schedule = scheduleTasks(parent.partitions, e.options.executors * e.options.cores);
          for (const tick of schedule.ticks) {
            e.event('TaskWave', tick.phase + ':' + tick.wave);
            for (const t of tick.tasks) {
              const p = Number(t.partition.slice(1));
              if (tick.phase === 'dispatch' && t.status === 'running') {
                const executor = 'E' + Math.floor(t.slot / e.options.cores);
                e.event('TaskStart', t.id + '.0@' + executor);
                const m = writeShuffle([Array.from(parent.iterator(p))], reducers, { ...e.options, reduceFn: fn }).maps[0];
                Object.assign(m, { id: 'M' + p, executor, file: 'S0-M' + p + '.data' });
                m.runs.forEach((run, i) => { run.id = m.id + '-run' + i; });
                maps[p] = m;
              }
              if (tick.phase === 'complete' && t.status === 'complete' && !completed.has(p)) {
                completed.add(p);
                e.event('MapOutput', maps[p].id + '@' + maps[p].executor);
                e.event('TaskComplete', t.id + '.0');
              }
            }
          }
          shuffle = summarizeShuffle(maps, reducers);
          let replaySpills = 0;
          if (e.failExecutor >= 0) {
            const recovery = recoverOutputs(shuffle, e.failExecutor, e.options);
            e.event('ExecutorLost', 'E' + e.failExecutor);
            if (recovery.lost.length) e.event('FetchFailed', recovery.lost.join(','));
            for (const id of recovery.lost) {
              const p = Number(id.slice(1));
              const replay = writeShuffle([Array.from(parent.iterator(p))], reducers, { ...e.options, reduceFn: fn }).maps[0];
              Object.assign(replay, { id, executor: e.options.executors === 1 ? 'E0r' : 'E' + ((e.failExecutor + 1) % e.options.executors), attempt: 1, file: 'S0-' + id + '.data' });
              replay.runs.forEach((run, i) => { run.id = id + '.1-run' + i; });
              replaySpills += replay.runs.filter(run => run.spilled).length;
              shuffle.maps[p] = replay; e.metrics.replayedMaps++; e.event('MapReplay', id + '.1@' + replay.executor);
            }
            e.recovery = recovery;
          }
          e.shuffle = shuffle; e.metrics.shuffleRecords = shuffle.outputRecords;
          e.metrics.shuffleBytes = shuffle.bytes; e.metrics.spillRuns = shuffle.spillRuns + replaySpills;
          e.metrics.peakBuffer = shuffle.peakBuffer;
        }
        const states = new Map();
        for (const m of shuffle.maps) {
          e.event('FetchRange', m.id + '→R' + r + '[' + m.index[r] + ',' + m.index[r + 1] + ')');
          for (const [k, v] of m.blocks[r]) states.set(k, states.has(k) ? fn(states.get(k), v) : v);
        }
        yield* Array.from(states).sort((a, b) => a[0].localeCompare(b[0]));
      }, 'shuffle');
    }
  }
  class Engine {
    constructor(options = {}) {
      this.options = normalizeOptions(options); this.records = options.records || RECORDS;
      this.input = readPartitions(csv(this.records), this.options.partitions, this.options);
      this.failExecutor = Number.isInteger(options.failExecutor) ? options.failExecutor : -1;
      this.nextId = 0; this.cache = new Map(); this.memoryCache = 0; this.events = [];
      this.metrics = { sourceReads: 0, recordsRead: 0, cachedPartitions: 0, shuffleRecords: 0,
        shuffleBytes: 0, spillRuns: 0, peakBuffer: 0, replayedMaps: 0 };
    }
    event(type, detail) { this.events.push({ sequence: this.events.length, type, detail }); }
    source() {
      const e = this;
      return new RDD(this, this.input.length, null, function* (p) {
        e.metrics.sourceReads++; e.event('ReadPartition', 'P' + p);
        for (const r of e.input[p].records) {
          e.metrics.recordsRead++;
          const { start, end, ...row } = r; void start; void end; yield row;
        }
      }, 'source');
    }
  }
  function planQuery(query = {}) {
    const columns = query.columns || ['city', 'amount'], schema = ['id', 'city', 'amount', 'status'];
    for (const c of [...columns, ...(query.groupBy ? [query.groupBy] : [])]) if (!schema.includes(c)) throw new Error('Unknown column: ' + c);
    if (query.groupBy && query.aggregate !== undefined && query.aggregate !== 'sum') throw new Error('Unsupported aggregate: ' + query.aggregate);
    const aggregate = query.aggregate || 'sum';
    const projected = Array.from(new Set([...columns, ...(query.groupBy ? [query.groupBy,'amount'] : [])]));
    const scanColumns = schema.filter(c => projected.includes(c) || c === 'status');
    const logical = ['Read orders', "Filter status = 'paid'", 'Project ' + projected.join(', '), ...(query.groupBy ? ['Aggregate ' + aggregate + '(amount) BY ' + query.groupBy] : [])];
    const physical = [{ operator: 'Scan', detail: scanColumns.join(', ') },
      { operator: 'Filter', detail: "status = 'paid'" }, { operator: 'Project', detail: projected.join(', ') }];
    if (query.groupBy) physical.push({ operator: 'PartialAggregate', detail: 'sum(amount)' },
      { operator: 'Exchange', detail: 'hash(' + query.groupBy + ')' }, { operator: 'FinalAggregate', detail: 'merge partial sums' });
    return { schema, scanColumns, logical, physical, codegenRegions: query.groupBy ? [[0, 1, 2, 3], [5]] : [[0, 1, 2]] };
  }
  function adaptPartitions(records, options = {}) {
    const o = normalizeOptions(options);
    const rows = records.map((r, i) => ({ ...r, city: o.hot && i < 10 ? 'HN' : r.city }));
    const loads = Array.from({ length: o.reducers }, () => 0);
    rows.forEach(r => loads[destination(r.city, o.reducers)]++);
    const maximum = Math.max(0, ...loads), skewSplit = o.operation === 'join' && o.adaptive && maximum > 6;
    const salted = o.operation === 'group' && o.salt > 1;
    const partials = new Map();
    rows.forEach((r, i) => { const k = r.city + ':' + (salted ? i % o.salt : 0); partials.set(k, (partials.get(k) || 0) + r.amount); });
    const totals = new Map();
    for (const [k, v] of partials) { const city = k.split(':')[0]; totals.set(city, (totals.get(city) || 0) + v); }
    const pieces = skewSplit ? loads.flatMap((n, r) => n > 6 ? Array.from({ length: Math.ceil(n / 4) }, (_, i) => ({ id: 'R' + r + '.' + i, rows: Math.min(4, n - i * 4), counterpart: 'dimension R' + r })) : [{ id: 'R' + r, rows: n }]) : loads.map((n, r) => ({ id: 'R' + r, rows: n }));
    function coalesce(input) {
      const out = []; let pending = null;
      for (const piece of input) {
        if (o.adaptive && piece.rows <= 4 && pending && pending.rows + piece.rows <= 4) { pending.rows += piece.rows; pending.id += '+' + piece.id; }
        else { pending = { ...piece }; out.push(pending); }
      }
      return out;
    }
    const coalescedBeforeSplit = coalesce(loads.map((n,r) => ({id:'R'+r,rows:n})));
    const coalesced = coalesce(pieces);
    return { rows, loads, maximum, skewSplit, salted, pieces, coalesced, coalescedBeforeSplit,
      partials: Array.from(partials), totals: Array.from(totals), total: Array.from(totals.values()).reduce(sum, 0) };
  }
  function runJob(options = {}) {
    const o = normalizeOptions(options), e = new Engine({ ...o,
      failExecutor: options.failExecutor == null ? -1 : options.failExecutor });
    const pairs = e.source().filter(r => r.status === 'paid' && r.amount >= o.minAmount).map(r => [r.city, r.amount]);
    const totals = pairs.reduceByKey(sum, o.reducers).collect();
    const parts = Array.from({ length: o.reducers }, (_, r) => totals.filter(x => destination(x[0], o.reducers) === r));
    const output = publishOutput(parts, { duplicate: o.duplicate, failAfter: o.failAfter ? o.failAfter : undefined });
    return { input: e.input, totals, metrics: e.metrics, shuffle: e.shuffle, recovery: e.recovery || null,
      events: e.events, output };
  }
  function buildTrace(chapter, options = {}) {
    if (typeof module === 'object' && module.exports) return require('./engine-traces.js').buildTrace(chapter, options);
    return globalThis.SparkTraces.buildTrace(chapter, options);
  }
  return { RECORDS, DEFAULTS, RANGES, CHOICES, normalizeOptions, hash, destination, readPartitions,
    writeShuffle, scheduleTasks, recoverOutputs, publishOutput, RDD, Engine, planQuery,
    adaptPartitions, runJob, csv, copy, buildTrace };
});
