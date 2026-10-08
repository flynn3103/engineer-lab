/* Problem-based course data for Concurrency. Written from the original CHAPTERS in techstack/concurrency/01-concurrency-end-to-end.html. */
window.COURSE = {
  name: 'Concurrency',
  kick: '11 chapters · problem-based · Concurrency (Go, Python, Java, Node)',
  lead: `A service runs many threads, goroutines and async tasks on shared data, and its failures look like random wrong numbers, hangs and slow pages. Each chapter starts from one production incident, asks you to predict the outcome, animates the mechanism underneath, and ends with the bugs people really hit. The course climbs from the CPU and the memory hierarchy, to threads and locks, to deadlock, message passing, transactions and crash recovery.`,
  chapters: [
{
  title: 'How a computer runs your program',
  problem: `A records service parses 1 million records. After a harmless-looking refactor, from a plain array of numbers to a list of small objects, the same loop goes from about 1 ms per thousand records to about 100 ms (illustrative). The CPU shows 100% busy, and no lock or I/O is involved.`,
  predict: {
    q: `The loop sums one number per record. Version A walks a plain array of numbers. Version B walks a list of objects, and each object holds one number. Same CPU, same data. Why can B be about 100 times slower?`,
    opts: [
      `Version B does about 100 times more arithmetic per record`,
      `The compiler refuses to optimise loops over objects, so it runs them unoptimised`,
      `Reading an object needs a lock, and the lock is slow`,
      `Each object sits in a different place in RAM, so most reads miss the cache and wait about 100 ns`
    ],
    ans: 3,
    why: `A cache loads a whole 64-byte line. Numbers packed in an array share a line, so one trip to RAM serves several reads. Objects scattered through memory each need their own trip, and the core waits for every one.`
  },
  explain: `<h3>The idea</h3>
<p>A CPU is far faster than the memory it reads. A core can do a few arithmetic steps in the time it takes RAM to answer one request, and a disk or a network reply takes thousands to millions of times longer. Caches hide most of that gap, but only when the program reads memory in a predictable way.</p>
<h3>How it works, step by step</h3>
<p>Data lives in a hierarchy: registers, then L1, L2 and L3 <b>cache</b>, then <b>RAM</b>, then SSD, then the network. Each step is roughly 10 to 1000 times slower than the one before. The cache does not load single values. It loads a whole <b>cache line</b> of 64 bytes.</p>
<p>An array of numbers packs 8 values into one line. The first read is a miss, and the next seven are hits. A list of objects puts each object in its own place in RAM, so each read is a new miss, and the core stalls for about 100 ns each time.</p>
<p>The same rule creates a second bug. Two threads that write to different variables in the same 64-byte line force the line to move between their cores. That is called <b>false sharing</b>, and it is a problem for the concurrency chapters ahead.</p>
<h3>The trade-off</h3>
<p>Objects are easier to model and change, and the cost is hidden. Packed arrays are harder to read but fast, because the hardware can predict the access. Measure first with a profiler or <code>perf stat</code>. A high cache-miss rate with a low instructions-per-cycle figure is the signature of this problem.</p>`,
  diagnose: [
    {
      t: 'Cache misses from scattered data',
      sym: 'The same loop gets 10 to 50 times slower after a harmless refactor. The CPU shows 100% busy, and no lock or I/O is involved.',
      ctx: 'A service sums one field over 1 million records. It used to read an array of numbers; someone changed it to a list of objects. The loop code is identical.',
      why: 'Each object lives somewhere else in RAM. The CPU loads 64-byte lines: from an array one load serves 8 numbers, from scattered objects every number needs its own ~100 ns trip to RAM while the core waits.',
      log: `perf stat -e cache-references,cache-misses ./sum
  2,310,442,118   cache-references
  1,987,019,874   cache-misses     # 86.0 % of all cache refs
  insn per cycle: 0.31`,
      note: 'Representative perf output; numbers vary by CPU and data size. A high miss rate with a low instructions-per-cycle figure is the signature.',
      fix: [
        'Measure first: <code>perf stat</code> or a profiler shows the cache-miss rate.',
        'Store hot data contiguously: arrays, NumPy, primitive arrays, struct-of-arrays.',
        'Walk memory in order (row by row) and keep the working set small.',
        'Measure again: a layout fix should give several times, not a few percent.'
      ]
    },
    {
      t: 'False sharing between cores',
      sym: 'Adding threads makes a counter benchmark slower, although each thread only touches its own variable.',
      ctx: 'Two threads each increment their own counter. The counters are separate variables, but they are declared next to each other, so both live in one 64-byte cache line.',
      why: 'Cores own cache lines, not variables. When core 0 writes its counter, core 1\u0027s copy of the whole line is invalidated, and the other way round. The line bounces between the cores on every write.',
      log: `perf c2c report
  Shared Cache Line Distribution Pareto
  HITM (hit in another core's modified line): 41.7 %
  line 0x7f3a...c0  <- two threads write different offsets`,
      note: 'Representative perf c2c output (Linux). The other signal is throughput that falls when you add threads.',
      fix: [
        'Confirm with <code>perf c2c</code>: look for lines that other cores hit while modified.',
        'Pad or align each hot per-thread variable to its own 64-byte line (<code>@Contended</code>, padding fields, <code>alignas(64)</code>).',
        'Or keep one counter per thread and add them up when reading (<code>LongAdder</code>).',
        'Benchmark with 1, 2, 4 and 8 threads and check that throughput now scales.'
      ]
    },
    {
      t: 'Running out of RAM and swapping',
      sym: 'The service becomes 100 to 1000 times slower, and then the container is killed and restarted.',
      ctx: 'A JVM runs with <code>-Xmx12g</code> in a container limited to 12 GB, but metaspace, thread stacks, native buffers and the page cache need memory too. Or a Python job reads a whole 20 GB CSV into a list.',
      why: 'When RAM is full the OS either swaps pages to disk (a disk access is about a million times slower than RAM) or the kernel OOM killer ends the process.',
      log: `kubectl describe pod api-7d9f
  Last State:  Terminated
    Reason:    OOMKilled     Exit Code: 137

vmstat 1
   si     so
 8200   9100      # pages swapped in / out per second`,
      note: 'Representative output. Swap is often disabled in containers; then you see the kill instead of the slowdown.',
      fix: [
        'Measure first: alert on RSS, working set, swap use and the OOMKilled restart count.',
        'Set the heap to about 70% of the container limit (<code>-XX:MaxRAMPercentage=70</code>).',
        'Stream or chunk big inputs instead of loading them whole.',
        'Load-test with production-sized data before release, and confirm the restart count stays at zero.'
      ]
    },
    {
      t: 'Treating a network call like a function call',
      sym: 'A page that is instant in development takes seconds in production, while the CPU is almost idle.',
      ctx: 'A loop fetches one row per iteration: for each of 1,000 orders, load its customer. In development the database is on localhost (0.05 ms away); in production it is 0.5 ms away.',
      why: 'Each call waits a full round trip while the CPU does nothing, and the latency multiplies by the number of items. A step a million times slower than a function call hides inside what looks like one.',
      log: `pg_stat_statements (one request)
  SELECT * FROM orders                      calls: 1
  SELECT * FROM customers WHERE id = $1     calls: 1000   mean: 0.5 ms`,
      note: 'Representative output. Tracing shows the same thing as a comb of many short spans.',
      fix: [
        'Count queries per request in tests and traces.',
        'Batch: one query with a <code>JOIN</code> or <code>WHERE id IN (...)</code>; eager loading (<code>select_related</code>, <code>include</code>, <code>JOIN FETCH</code>).',
        'Cache lookups that repeat.',
        'Fail CI when a request runs more than N queries.'
      ]
    }
  ],
  source: { label: 'Original: How a computer runs your program', href: '01-concurrency-end-to-end.html#ch0' },
  scenarios: [
    {
      id: 'objects',
      label: 'Scattered objects',
      desc: 'The same sum runs slower when each number lives in its own place in RAM (illustrative numbers).',
      codeLabel: 'Code',
      code: {
        bug: [
          'for (Obj o : objects) sum += o.value;   // objects scattered in RAM',
          '// each o.value sits in a different cache line',
          '// 8 reads = 8 misses x ~100 ns = 800 ns'
        ],
        fix: [
          'for (int v : values) sum += v;          // one packed int array',
          '// 8 ints share one 64-byte cache line',
          '// 1 miss + 7 hits = about 107 ns'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'cpu', x: 10, y: 110, w: 170, h: 70, t: 'CPU core', s: 'waits for each read' },
          { id: 'cl', x: 240, y: 20, w: 180, h: 70, t: 'Cache line', s: '64 bytes, 8 numbers' },
          { id: 'obj', x: 240, y: 200, w: 180, h: 70, t: 'Objects in RAM', s: 'scattered addresses' },
          { id: 'ram', x: 470, y: 110, w: 160, h: 70, t: 'RAM', s: '~100 ns per trip' }
        ],
        edges: [
          { id: 'e1', a: 'cpu', b: 'cl', label: 'packed array' },
          { id: 'e2', a: 'cpu', b: 'obj', label: 'objects' },
          { id: 'e3', a: 'obj', b: 'ram', label: 'one trip each' },
          { id: 'e4', a: 'cl', b: 'ram', label: 'one trip' }
        ]
      },
      bug: [
        { log: 'The loop reads the first object. Its data is not in the cache, so the core waits about 100 ns for RAM.', code: 0, hl: { nodes: { cpu: 'warn', obj: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'misses for 8 reads', v: '8 of 8', cls: 'bad' }] },
        { log: 'Each object sits in its own cache line, so the next read is another miss, and so is the one after.', code: 1, hl: { nodes: { obj: 'bad', ram: 'warn' }, edges: { e3: 'bad' } }, stats: [{ l: 'cache hits', v: '0', cls: 'bad' }] },
        { log: 'Eight reads cost eight trips to RAM, about 800 ns (illustrative).', code: 2, hl: { nodes: { ram: 'bad' } }, stats: [{ l: 'time for 8 reads', v: '800 ns', cls: 'bad' }] },
        { log: 'Over a million records the loop now takes about 100 ms instead of 1 ms per thousand (illustrative).', code: 2, stats: [{ l: 'loop time', v: '~100 ms', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The values sit next to each other in one array. The first read loads a 64-byte line.', code: 0, hl: { nodes: { cpu: 'ok', cl: 'ok' }, edges: { e1: 'ok', e2: 'dim' } }, stats: [{ l: 'misses for 8 reads', v: '1 of 8', cls: 'ok' }] },
        { log: 'The other seven reads are served from the same line, a few nanoseconds each.', code: 1, hl: { nodes: { cl: 'ok' }, edges: { e4: 'dim' } }, stats: [{ l: 'cache hits', v: '7 of 8', cls: 'ok' }] },
        { log: 'Eight reads now cost about 107 ns instead of 800 ns (illustrative). Same data, same result.', code: 2, stats: [{ l: 'time for 8 reads', v: 'about 107 ns', cls: 'ok' }] }
      ]
    },
    {
      id: 'n1',
      label: 'N+1 queries',
      desc: 'A loop makes 1,000 round trips to the database; one batched query makes one.',
      codeLabel: 'Query',
      code: {
        bug: [
          'orders = db.query("SELECT * FROM orders")            # 1 query',
          'for o in orders: db.query("SELECT * FROM customers WHERE id = $1", o.customer_id)',
          '# 1,000 round trips x 0.5 ms = about 500 ms'
        ],
        fix: [
          'SELECT * FROM customers WHERE id IN (...)            -- one batched query',
          '# one round trip returns every customer that is needed',
          '# 1 round trip = about 5 ms (illustrative)'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'app', x: 10, y: 110, w: 170, h: 70, t: 'Web app', s: 'loops over 1,000 orders' },
          { id: 'db', x: 330, y: 20, w: 170, h: 70, t: 'Database', s: 'one row per query' },
          { id: 'bat', x: 330, y: 200, w: 170, h: 70, t: 'Batched query', s: 'WHERE id IN (...)' },
          { id: 'net', x: 500, y: 110, w: 130, h: 70, t: 'Network', s: '0.5 ms each way' }
        ],
        edges: [
          { id: 'e1', a: 'app', b: 'db', label: '1,001 round trips' },
          { id: 'e2', a: 'app', b: 'bat', label: 'one round trip' }
        ]
      },
      bug: [
        { log: 'The loop asks for the customer of order 1. The app waits about 0.5 ms for the reply.', code: 1, hl: { nodes: { app: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'round trips', v: '1', cls: 'warn' }] },
        { log: 'It repeats the same wait for orders 2 to 1,000. The CPU does nothing while it waits.', code: 1, hl: { nodes: { db: 'warn', net: 'warn' }, edges: { e1: 'bad' } }, stats: [{ l: 'round trips', v: '1,001', cls: 'bad' }] },
        { log: 'The page takes about 500 ms (illustrative). The code looked like one function call, but it was a thousand network calls.', code: 2, hl: { nodes: { net: 'bad' } }, stats: [{ l: 'page time', v: 'about 500 ms', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The app sends one query that asks for all the customers at once.', code: 0, hl: { nodes: { bat: 'ok', app: 'ok' }, edges: { e2: 'ok', e1: 'dim' } }, stats: [{ l: 'round trips', v: '1', cls: 'ok' }] },
        { log: 'The database returns every row in one reply. The network wait is paid once.', code: 1, hl: { nodes: { bat: 'ok' } }, stats: [{ l: 'round trips', v: '1', cls: 'ok' }] },
        { log: 'The page takes about 5 ms instead of 500 ms (illustrative).', code: 2, stats: [{ l: 'page time', v: 'about 5 ms', cls: 'ok' }] }
      ]
    }
  ],
},
{
  title: 'Processes, threads & parallelism',
  problem: `A nightly job resizes 10,000 images. On one core it takes 40 minutes on a server with 8 cores (illustrative). The team adds 8 threads in Python and nothing gets faster. Meanwhile the web server that starts one thread per request slows down at about 2,000 users.`,
  predict: {
    q: `A CPU-heavy job runs 2,000 busy threads on an 8-core machine. Halving the thread pool makes the service faster. Why?`,
    opts: [
      `More threads always means more parallel work, so the pool was too small`,
      `Only 8 threads run at a time; the rest wait, and every switch costs time and throws away warm caches`,
      `Each thread gets its own core, so the 2,000 threads share the RAM bandwidth`,
      `The threads are waiting on a lock that only the largest pool can release`
    ],
    ans: 1,
    why: `The scheduler runs one thread per core. The other threads wait in line, and each context switch saves and loads registers and loses cache warmth. Fewer, busy threads spend more of the CPU on real work.`
  },
  explain: `<h3>The idea</h3>
<p>A <b>process</b> is a running program with its own address space. A <b>thread</b> runs inside a process and shares its heap and code with the other threads, but has its own stack and registers. Sharing is cheap, and that is why data races are easy to write.</p>
<h3>How it works, step by step</h3>
<p>The <b>scheduler</b> puts at most one thread on each core. It gives each thread a short time slice, then runs a <b>context switch</b>: save the current registers, load another thread, and lose some cache warmth. With 2,000 runnable threads on 8 cores, most of the time goes to waiting in line and switching.</p>
<p><b>CPU-bound</b> work keeps a core busy, such as resizing, compressing or hashing. Only more cores help, so one worker per core is the sweet spot. <b>Concurrent</b> means several tasks in progress, interleaved. <b>Parallel</b> means several tasks running at the same instant on different cores.</p>
<p><b>Amdahl's law</b> limits the gain. If a fraction <i>s</i> of the job is serial, the best speedup on N cores is 1 ÷ (s + (1 − s) ÷ N). With 30% serial work the limit is about 3.3 times, however many cores you add.</p>
<h3>The trade-off</h3>
<p>Processes are safer, because one crash does not take the others down, and they do not share memory by default. They cost more memory and more time to start. Threads are cheap to share data with, but they force you to guard that data. Size CPU-bound pools near the core count, and measure the speedup instead of assuming it.</p>`,
  diagnose: [
    {
      t: 'Too many threads: the context-switch storm',
      sym: 'The CPU is 100% busy and system time is high, yet throughput is low. Halving the thread pool makes the service faster.',
      ctx: 'A service runs a pool of 2,000 busy threads on an 8-core machine, or starts one thread per request.',
      why: 'Only 8 threads run at a time; the other 1,992 wait in line. The scheduler spends its time switching, each switch costs microseconds and throws away warm caches, and every thread reserves stack memory.',
      log: `vmstat 1
procs  -----system----  ---cpu---
  r    b     in      cs   us sy id
1840    0   9210  412300   38 55  7
# r = runnable threads, cs = context switches/s, sy = system CPU %`,
      note: 'Representative vmstat output: run queue far above the core count, very high cs and sy.',
      fix: [
        'Measure first: check <code>vmstat</code> (r, cs, sy) against the core count.',
        'Size CPU-bound pools to about the core count.',
        'Use async I/O or lightweight threads for work that mostly waits, instead of more OS threads.',
        'Bound the pool and its queue, then measure throughput at several pool sizes and pick the knee of the curve.'
      ]
    },
    {
      t: 'CPU-bound threads in CPython (the GIL)',
      sym: 'A CPU-heavy Python script uses 4 threads and is no faster than one thread, sometimes slower.',
      ctx: 'A script hashes 10,000 files with <code>ThreadPoolExecutor(max_workers=4)</code> on a 4-core machine.',
      why: 'CPython has a Global Interpreter Lock: only one thread runs Python bytecode at a time. CPU-bound threads take turns on one core while the others wait, so there is no parallelism.',
      log: `top -H -p 4101
  PID    %CPU  COMMAND
  4101   25.0  python     # 4 threads x 25%
  4102   25.0  python
  4103   24.8  python
  4104   25.1  python
# total about 100%: one core busy, three idle`,
      note: 'Representative output. Sum the per-thread CPU: if it never exceeds one core, the GIL is the limit.',
      fix: [
        'Measure first: sum the per-thread CPU with <code>top -H</code>; if it stays near one core, the GIL is the limit.',
        'Use <code>ProcessPoolExecutor</code> or <code>multiprocessing</code> for CPU-bound work.',
        'Use libraries that release the GIL while computing (NumPy, hashlib on large buffers, native extensions).',
        'Confirm the speed-up with wall-clock time on the same input, and chunk the tasks so the data sent between processes stays small.'
      ]
    },
    {
      t: 'Wrong core count inside containers',
      sym: 'A service on a big node is slow and shows CPU throttling, although the node is mostly idle.',
      ctx: 'A Go service runs in Kubernetes with a CPU limit of 2 on a 64-core node. The Go runtime sees 64 cores.',
      why: 'The runtime sizes its threads by the host cores (64), but the cgroup only allows 2 cores of CPU time per period. The 64 threads use up the quota in a few ms and are then frozen until the next period.',
      log: `cat /sys/fs/cgroup/cpu.stat
nr_periods      12000
nr_throttled     9100        # throttled in 76% of periods
throttled_usec  840000000

GOMAXPROCS=64 (default on a 64-core host)`,
      note: 'Representative cgroup v2 cpu.stat. In Prometheus: container_cpu_cfs_throttled_periods_total.',
      fix: [
        'Measure first: watch CPU throttling metrics, not only CPU usage.',
        'Set GOMAXPROCS and thread pools from the cgroup limit (<code>automaxprocs</code>, container-aware runtime settings).',
        'For latency-sensitive services consider requests = limits, or a limit that is not too tight.',
        'Load-test inside the same container limits you run in production, and check that throttling falls.'
      ]
    },
    {
      t: 'The serial part caps the speedup',
      sym: 'Going from 8 to 32 cores barely helps: the job runs about 3 times faster on 32 cores, not 30.',
      ctx: 'A report job parses files in parallel, then every worker writes into one output file under a lock, then merges. The output step is 30% of the time.',
      why: 'Amdahl\'s law: with 30% serial work the limit is 1 ÷ 0.30 = 3.3 times, however many cores you add. The serial part takes the same time whatever the number of workers.',
      log: `time ./report --workers 8     real 1m40s
time ./report --workers 32    real 1m10s   # 4x workers, 1.4x faster

perf lock:  31% of wall time waiting on output_mu`,
      note: 'Representative output. Adding workers stops helping when most of the time is in one lock or one writer.',
      fix: [
        'Measure first: find the serial section (a lock, a single writer, a final merge) with a profiler.',
        'Shrink it: shard the output, use per-worker buffers, parallel reduce, lock-free structures.',
        'Re-measure the serial fraction and attack the biggest serial piece first.',
        'Do not buy more cores until the serial fraction is small, and check that the speedup now grows with workers.'
      ]
    }
  ],
  source: { label: 'Original: Processes, threads & parallelism', href: '01-concurrency-end-to-end.html#ch1' },
  scenarios: [
    {
      id: 'pool',
      label: 'Too many threads',
      desc: 'Two thousand threads queue for eight cores; a pool of eight gives the cores back to real work (illustrative numbers).',
      codeLabel: 'Config',
      code: {
        bug: [
          'pool = ThreadPool(size=2000)     # one thread per waiting request',
          '# 8 cores: only 8 run at a time',
          '# the other 1,992 wait for a slice',
          '# every switch saves registers and loses cache warmth'
        ],
        fix: [
          'pool = ThreadPool(size=8)        # about the core count',
          '# 8 threads run full slices',
          '# few switches, warm caches'
        ]
      },
      diagram: {
        w: 640, h: 300,
        nodes: [
          { id: 'q', x: 10, y: 20, w: 190, h: 70, t: 'Run queue', s: '1,992 threads waiting' },
          { id: 'sch', x: 240, y: 110, w: 170, h: 70, t: 'Scheduler', s: 'one thread per core' },
          { id: 'c0', x: 460, y: 20, w: 170, h: 70, t: 'Core 0', s: 'time slice a few ms' },
          { id: 'c1', x: 460, y: 200, w: 170, h: 70, t: 'Core 1..7', s: 'same, 8 cores in all' }
        ],
        edges: [
          { id: 'e1', a: 'q', b: 'sch', label: 'next thread' },
          { id: 'e2', a: 'sch', b: 'c0', label: 'run + switch' },
          { id: 'e3', a: 'sch', b: 'c1', label: 'run + switch' }
        ]
      },
      bug: [
        { log: 'Two thousand request threads are ready to run. Only eight cores exist, so almost all of them wait in the run queue.', code: 0, hl: { nodes: { q: 'bad' }, edges: { e1: 'warn' } }, stats: [{ l: 'runnable threads', v: '2,000', cls: 'bad' }] },
        { log: 'The scheduler gives each core a slice of a few milliseconds, then switches to the next thread.', code: 1, hl: { nodes: { sch: 'warn' }, edges: { e2: 'warn', e3: 'warn' } }, stats: [{ l: 'context switches/s', v: '412,300', cls: 'bad' }] },
        { log: 'Each switch saves and loads registers and throws away warm cache lines. Much of each slice is lost to switching.', code: 2, hl: { nodes: { c0: 'bad', c1: 'bad' } }, stats: [{ l: 'useful CPU time', v: 'about 45%', cls: 'bad' }] },
        { log: 'The CPU is 100% busy and throughput drops, which is why halving the pool helped.', code: 3, stats: [{ l: 'throughput', v: 'falling (illustrative)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The pool is sized at eight, about the number of cores.', code: 0, hl: { nodes: { q: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'runnable threads', v: '8', cls: 'ok' }] },
        { log: 'Each core runs one thread for a full slice, with few switches.', code: 1, hl: { nodes: { sch: 'ok', c0: 'ok', c1: 'ok' }, edges: { e2: 'ok', e3: 'ok' } }, stats: [{ l: 'context switches/s', v: 'far fewer', cls: 'ok' }] },
        { log: 'Useful CPU time rises to about 96% (illustrative), and the extra requests wait in a bounded queue instead.', code: 2, stats: [{ l: 'useful CPU time', v: 'about 96%', cls: 'ok' }] }
      ]
    },
    {
      id: 'gil',
      label: 'GIL threads',
      desc: 'Four CPU-bound Python threads take turns on one core because of the GIL.',
      codeLabel: 'Code',
      code: {
        bug: [
          'with ThreadPoolExecutor(max_workers=4) as ex:',
          '    list(ex.map(hash_file, files))   # 10,000 CPU-bound files',
          '# GIL: only one thread runs bytecode at a time',
          '# wall time = same as one thread'
        ],
        fix: [
          'with ProcessPoolExecutor(max_workers=4) as ex:',
          '    list(ex.map(hash_file, files))   # 4 processes, 4 GILs',
          '# each process runs on its own core',
          '# wall time about 1.1 s (illustrative)'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 't1', x: 10, y: 30, w: 150, h: 60, t: 'Thread 1', s: 'hashes files' },
          { id: 't2', x: 10, y: 115, w: 150, h: 60, t: 'Thread 2', s: 'waits for GIL' },
          { id: 'gil', x: 230, y: 70, w: 170, h: 70, t: 'GIL', s: 'one holder at a time' },
          { id: 'c0', x: 460, y: 30, w: 170, h: 60, t: 'Core 0', s: 'busy' },
          { id: 'c1', x: 460, y: 150, w: 170, h: 60, t: 'Cores 1 to 3', s: 'idle' }
        ],
        edges: [
          { id: 'e1', a: 't1', b: 'gil', label: 'holds' },
          { id: 'e2', a: 't2', b: 'gil', label: 'blocked' },
          { id: 'e3', a: 'gil', b: 'c0', label: 'runs bytecode' }
        ]
      },
      bug: [
        { log: 'Four threads are started, one per file batch. Each one wants to run Python bytecode.', code: 1, hl: { nodes: { t1: 'on', t2: 'on' }, edges: { e2: 'warn' } }, stats: [{ l: 'threads', v: '4', cls: 'ok' }] },
        { log: 'The GIL lets only one thread run Python bytecode at a time. The other three wait for it.', code: 2, hl: { nodes: { gil: 'bad', t2: 'warn' }, edges: { e1: 'bad', e2: 'bad' } }, stats: [{ l: 'threads running', v: '1', cls: 'bad' }] },
        { log: 'One core is busy at about 100%, and the other three cores stay idle.', code: 2, hl: { nodes: { c0: 'warn', c1: 'dim' }, edges: { e3: 'warn' } }, stats: [{ l: 'cores busy', v: '1 of 4', cls: 'bad' }] },
        { log: 'Wall time is about 4.0 s (illustrative), the same as one thread, and more threads only add switching.', code: 3, stats: [{ l: 'wall time', v: '4.0 s', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Each process starts its own interpreter, with its own GIL.', code: 0, hl: { nodes: { t1: 'ok', t2: 'ok' } }, stats: [{ l: 'GILs', v: '4', cls: 'ok' }] },
        { log: 'The four processes run on four cores at the same time.', code: 2, hl: { nodes: { c0: 'ok', c1: 'ok', gil: 'dim' }, edges: { e1: 'dim', e2: 'dim', e3: 'ok' } }, stats: [{ l: 'cores busy', v: '4 of 4', cls: 'ok' }] },
        { log: 'Wall time falls to about 1.1 s (illustrative). The data sent between processes is the cost to watch.', code: 3, stats: [{ l: 'wall time', v: '~1.1 s', cls: 'ok' }] }
      ]
    },
    {
      id: 'amdahl',
      label: 'Serial bottleneck',
      desc: 'A single locked writer makes 32 workers only a little faster than 8 (illustrative numbers).',
      codeLabel: 'Command',
      code: {
        bug: [
          './report --workers 8     # real 1m40s',
          './report --workers 32    # real 1m10s',
          '# 30% of the job is one locked writer',
          '# perf lock: 31% of wall time waiting on output_mu'
        ],
        fix: [
          '# per-worker buffers, merge in parallel',
          '# serial part cut to about 3%',
          '# real time drops as workers are added'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'par', x: 10, y: 40, w: 200, h: 70, t: 'Parse files', s: '70% of the work' },
          { id: 'w', x: 10, y: 170, w: 200, h: 70, t: 'Workers 1..32', s: 'run in parallel' },
          { id: 'lock', x: 260, y: 110, w: 180, h: 70, t: 'Output lock', s: 'one writer at a time' },
          { id: 'out', x: 480, y: 110, w: 150, h: 70, t: 'Output file', s: 'the serial 30%' }
        ],
        edges: [
          { id: 'e1', a: 'w', b: 'lock', label: 'wait' },
          { id: 'e2', a: 'lock', b: 'out', label: 'write' },
          { id: 'e3', a: 'par', b: 'w', label: 'split' }
        ]
      },
      bug: [
        { log: 'The parse step runs on all workers, so its time shrinks as workers are added.', code: 0, hl: { nodes: { par: 'ok', w: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'parallel share', v: '70%', cls: 'ok' }] },
        { log: 'Every worker then queues for the same output lock. Only one can write at a time.', code: 2, hl: { nodes: { lock: 'bad', w: 'warn' }, edges: { e1: 'bad', e2: 'warn' } }, stats: [{ l: 'time waiting on lock', v: '31%', cls: 'bad' }] },
        { log: 'The serial part takes the same time whether there are 8 workers or 32.', code: 2, hl: { nodes: { out: 'bad' } }, stats: [{ l: 'speed-up vs one core', v: '~3.1x (ideal 32)', cls: 'bad' }] },
        { log: 'Adding cores barely helps: 1m40s with 8 workers, 1m10s with 32 (illustrative).', code: 1, stats: [{ l: 'real time', v: '1m10s', cls: 'warn' }] }
      ],
      fix: [
        { log: 'Each worker writes into its own buffer, so there is no shared lock in the hot path.', code: 0, hl: { nodes: { lock: 'dim', out: 'dim' }, edges: { e1: 'dim', e2: 'dim' } }, stats: [{ l: 'serial share', v: '3%', cls: 'ok' }] },
        { log: 'The buffers are merged in a short final step, so the serial part is small.', code: 1, hl: { nodes: { out: 'ok' } }, stats: [{ l: 'serial share', v: '3%', cls: 'ok' }] },
        { log: 'Now the extra workers pay off: the speed-up over one core is about 16 times with 32 workers (illustrative).', code: 2, stats: [{ l: 'speed-up vs one core', v: 'about 16x', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Asynchronous programming',
  problem: `A chat server holds 10,000 open connections on one thread, and a batch job calls a payment API 10,000 times. Both spend 99% of their time waiting (illustrative). One day a developer adds a synchronous call inside a handler, and every user freezes for about two seconds.`,
  predict: {
    q: `One Node.js handler calls <code>fs.readFileSync</code> on a 2 MB file. Ten thousand other connections are open on the same event loop. What do they see while the read runs?`,
    opts: [
      `Nothing: the read runs on a separate thread, so the loop keeps serving`,
      `They all wait, because the one thread that runs the loop is busy inside the read`,
      `Only the connection that made the read waits; the rest are served in parallel`,
      `The read fails with a timeout after the loop's default limit`
    ],
    ans: 1,
    why: `An event loop has one thread. A synchronous call holds that thread until it returns, so no callback, reply or new connection can run. Asynchronous calls return at once and hand the wait back to the loop.`
  },
  explain: `<h3>The idea</h3>
<p>Most server work is <b>I/O-bound</b>: it waits for a disk, a database or a network reply. The CPU is idle during the wait, so the speed-up comes from overlapping waits, not from more cores. A rule of thumb is workers ≈ cores × (1 + wait ÷ compute).</p>
<h3>How it works, step by step</h3>
<p><b>Blocking</b> means the call does not return until the work is done, and the thread waits. <b>Non-blocking</b> means the call returns at once with "not ready yet", and you are told later. An <b>event loop</b> asks the operating system which sockets are ready (<code>epoll</code> or <code>kqueue</code>), runs the matching callback, and repeats. One thread then serves many connections.</p>
<p>Callbacks nest and lose errors. Promises chain them. <b>Coroutines</b> (<code>async</code> and <code>await</code>) let you write straight-line code, where each <code>await</code> is a point where the function pauses and the loop runs something else. Go goroutines and Java virtual threads reach the same result differently: the runtime parks a lightweight thread on a blocking call and runs another one.</p>
<p>The loop waits for one thing only: "something is ready". Any callback or coroutine that keeps running without reaching an <code>await</code> holds every other connection until it finishes.</p>
<h3>The trade-off</h3>
<p>An event loop uses little memory and handles many connections, but it has no way to pause a long piece of code. CPU-heavy or blocking work must move to a worker thread or process pool, such as <code>run_in_executor</code> or <code>worker_threads</code>. Measure event-loop lag, and treat it as the signal to alert on.</p>`,
  diagnose: [
    {
      t: 'Blocking the event loop',
      sym: 'Every request stalls at the same moment for a second or two, although CPU and network look fine.',
      ctx: 'One handler makes a synchronous call (a sleep, a blocking HTTP client, a large JSON parse, a sync file read). While it runs, nothing else on the loop runs.',
      why: 'There is one thread. A callback or coroutine that does not return control to the loop freezes all other connections until it finishes.',
      log: `asyncio (debug mode)
WARNING Executing <Task pending name='Task-3' coro=<handler() running at app.py:12>> took 2.001 seconds

Node: monitorEventLoopDelay  max = 1.95 s   p99 = 1.9 s`,
      note: 'Representative output. Event-loop lag (Node monitorEventLoopDelay, asyncio slow-callback warning) is the signal to alert on.',
      fix: [
        'Measure first: turn on asyncio debug mode or <code>monitorEventLoopDelay</code> and look for slow callbacks.',
        'Use the async version of the call (<code>await asyncio.sleep</code>, aiohttp, <code>fs.promises</code>).',
        'Move blocking or CPU-heavy work to a thread or process pool (<code>run_in_executor</code>, <code>worker_threads</code>).',
        'Verify that event-loop lag stays low under the same load.'
      ]
    },
    {
      t: 'Forgotten await and lost errors',
      sym: 'The user sees "OK" but the work never happened, or a process crashes later with an unhandled rejection.',
      ctx: 'A handler starts an async operation and returns without awaiting it or checking its result.',
      why: 'Calling an async function only creates the task or coroutine. If nobody awaits or observes it, its failure is lost and the caller cannot know whether it finished.',
      log: `RuntimeWarning: coroutine 'save_order' was never awaited
  save_order(order)

node:internal/process/promises:394
  triggerUncaughtException(err, true)
[UnhandledPromiseRejection: ... code: 'ERR_UNHANDLED_REJECTION']`,
      note: 'Representative Python and Node messages.',
      fix: [
        'Measure first: search the code for calls to async functions that have no <code>await</code>, and read the warnings in the log.',
        'Await every coroutine, or collect them (<code>asyncio.gather</code>, <code>Promise.all</code>, <code>errgroup</code>).',
        'Add a top-level handler that logs unhandled rejections and task exceptions.',
        'Verify with a linter (no-floating-promises, or ruff/pyright for unawaited coroutines) in CI.'
      ]
    },
    {
      t: 'No backpressure: unbounded concurrency',
      sym: 'Memory grows steadily under load until the process is killed; latency climbs before that.',
      ctx: 'Requests arrive at 1,000 per second, the downstream handles 200 per second, and every request is accepted and queued or given its own task.',
      why: 'Non-blocking makes it easy to start work faster than it finishes. Nothing slows the producer down, so the backlog (and its memory) grows without limit.',
      log: `kubectl get pod api  ->  OOMKilled (restarts: 14)

metrics
  goroutines      1,482,330   (was 800)
  queue_depth     3,900,000
  rss_bytes       7.8e9`,
      note: 'Representative metrics: queue depth and task count climbing without bound.',
      fix: [
        'Measure first: alert on queue depth and task count, not only CPU.',
        'Bound everything: worker pools, semaphores, bounded queues, stream backpressure.',
        'Shed load early: return 429 or drop the oldest work instead of queueing for ever, and set timeouts on queued work.',
        'Verify that queue depth stays under its bound when the arrival rate is above the downstream rate.'
      ]
    },
    {
      t: 'Sync-over-async: thread-pool starvation',
      sym: 'The service hangs although CPU is idle; thread dumps show every pool thread waiting.',
      ctx: 'A task running in a bounded pool waits for a sub-task that is submitted to the same pool (<code>future.get()</code>, <code>task.Result</code>).',
      why: 'Waiting consumes a pool thread, and the awaited work needs a free pool thread to start. When every thread is waiting, none can run the work they wait for.',
      log: `"pool-1-thread-1" WAITING  at java.util.concurrent.FutureTask.get()
"pool-1-thread-2" WAITING  at java.util.concurrent.FutureTask.get()
"pool-1-thread-3" WAITING  at java.util.concurrent.FutureTask.get()
"pool-1-thread-4" WAITING  at java.util.concurrent.FutureTask.get()
# queue: 12 tasks, none can run`,
      note: 'Representative jstack output; .NET reports it as ThreadPool starvation in diagnostics.',
      fix: [
        'Measure first: take a thread dump and look for every pool thread waiting on a <code>get()</code>.',
        'Go async all the way: do not block a pool thread to wait for async work.',
        'Use separate pools (or executors) for parent and child tasks.',
        'Verify with a timeout on every <code>get()</code>/<code>Wait()</code>, so a stall becomes an error.'
      ]
    }
  ],
  source: { label: 'Original: Asynchronous programming', href: '01-concurrency-end-to-end.html#ch2' },
  scenarios: [
    {
      id: 'loop',
      label: 'One blocking call',
      desc: 'A synchronous read inside a handler holds the only thread, so every connection waits (illustrative numbers).',
      codeLabel: 'Code',
      code: {
        bug: [
          'async function handler(req) {',
          '  const cfg = fs.readFileSync("big.json");   // blocks the loop',
          '  return send(req, cfg);',
          '}'
        ],
        fix: [
          'async function handler(req) {',
          '  const cfg = await fs.promises.readFile("big.json");  // yields',
          '  return send(req, cfg);',
          '}'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'cl', x: 10, y: 100, w: 150, h: 70, t: '10,000 clients', s: 'wait for replies' },
          { id: 'loop', x: 220, y: 100, w: 190, h: 70, t: 'Event loop', s: 'one thread' },
          { id: 'call', x: 470, y: 30, w: 160, h: 70, t: 'Sync read', s: 'holds the thread' },
          { id: 'os', x: 470, y: 180, w: 160, h: 70, t: 'OS / disk', s: 'ready later' }
        ],
        edges: [
          { id: 'e1', a: 'cl', b: 'loop', label: 'requests' },
          { id: 'e2', a: 'loop', b: 'call', label: 'runs handler' },
          { id: 'e3', a: 'call', b: 'os', label: 'blocks' }
        ]
      },
      bug: [
        { log: 'Requests arrive from 10,000 clients. The loop runs the handler for the first request.', code: 0, hl: { nodes: { cl: 'on', loop: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'loop threads', v: '1', cls: 'ok' }] },
        { log: 'The handler calls a synchronous read. The only thread now waits for the disk and cannot do anything else.', code: 1, hl: { nodes: { call: 'bad', loop: 'bad' }, edges: { e2: 'bad', e3: 'warn' } }, stats: [{ l: 'thread status', v: 'blocked', cls: 'bad' }] },
        { log: 'The other 9,999 connections have replies ready, but no callback can run, so their requests stall.', code: 2, hl: { nodes: { cl: 'bad' }, edges: { e1: 'dim' } }, stats: [{ l: 'connections frozen', v: '9,999', cls: 'bad' }] },
        { log: 'The read finishes after about 2 s (illustrative). Every user saw a two-second freeze, and the CPU was almost idle.', code: 3, hl: { nodes: { os: 'warn' } }, stats: [{ l: 'p99 latency', v: 'about 2 s', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The handler awaits the async read. The thread is free while the disk works.', code: 1, hl: { nodes: { call: 'ok', loop: 'ok' }, edges: { e2: 'ok', e3: 'dim' } }, stats: [{ l: 'thread status', v: 'free', cls: 'ok' }] },
        { log: 'The loop serves other connections while the read is pending.', code: 2, hl: { nodes: { cl: 'ok', os: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'connections frozen', v: '0', cls: 'ok' }] },
        { log: 'Event-loop lag stays small, and p99 is about 20 ms (illustrative). Blocking work lives in a worker pool instead.', code: 3, stats: [{ l: 'p99 latency', v: 'about 20 ms', cls: 'ok' }] }
      ]
    },
    {
      id: 'backpressure',
      label: 'Unbounded queue',
      desc: 'Requests arrive at 1,000 a second but the downstream handles 200, so the queue grows by 800 a second (illustrative).',
      codeLabel: 'Code',
      code: {
        bug: [
          'for req in incoming:                 # 1,000 req/s',
          '    asyncio.create_task(call_payment(req))   # no limit',
          '# payment API handles 200 req/s',
          '# pending tasks grow by 800 every second'
        ],
        fix: [
          'sem = asyncio.Semaphore(200)          # at most 200 calls in flight',
          'for req in incoming:',
          '    await sem.acquire()               # producer waits while 200 are busy',
          '    asyncio.create_task(call_payment(req, sem))  # call releases sem when done'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'in', x: 10, y: 100, w: 150, h: 70, t: 'Incoming', s: '1,000 requests/s' },
          { id: 'q', x: 230, y: 100, w: 180, h: 70, t: 'Pending tasks', s: 'no limit on the queue' },
          { id: 'api', x: 470, y: 100, w: 160, h: 70, t: 'Payment API', s: '200 requests/s' }
        ],
        edges: [
          { id: 'e1', a: 'in', b: 'q', label: 'accepts all' },
          { id: 'e2', a: 'q', b: 'api', label: 'drains 200/s' }
        ]
      },
      bug: [
        { log: 'Requests arrive at 1,000 per second. Each one is accepted at once as a new task.', code: 0, hl: { nodes: { in: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'arrival rate', v: '1,000/s', cls: 'warn' }] },
        { log: 'The payment API finishes only 200 per second, so 800 tasks are added to the queue every second.', code: 2, hl: { nodes: { api: 'warn', q: 'bad' }, edges: { e2: 'warn' } }, stats: [{ l: 'queue growth', v: '+800/s', cls: 'bad' }] },
        { log: 'After five minutes the queue holds about 240,000 tasks (illustrative), and each one holds its memory.', code: 3, hl: { nodes: { q: 'bad' } }, stats: [{ l: 'queue depth', v: '~240,000', cls: 'bad' }] },
        { log: 'Latency climbs with the queue, and the process is eventually OOMKilled. The producer never felt the overload.', code: 3, stats: [{ l: 'restarts', v: 'OOMKilled', cls: 'bad' }] }
      ],
      fix: [
        { log: 'A semaphore caps calls in flight at 200. It is not a rate limit: the producer waits for a free slot before it starts another call.', code: 0, hl: { nodes: { q: 'ok', api: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'calls in flight', v: '200 max', cls: 'ok' }] },
        { log: 'When all 200 slots are busy the producer waits, so incoming requests back up instead of piling into memory.', code: 2, hl: { nodes: { in: 'warn', q: 'warn' }, edges: { e1: 'warn' } }, stats: [{ l: 'pending work', v: 'bounded by slots', cls: 'ok' }] },
        { log: 'Pending work stays bounded and memory stays flat (illustrative).', code: 3, stats: [{ l: 'memory', v: 'flat (illustrative)', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Threads & mutual exclusion',
  problem: `A web service keeps a request counter in memory, and two worker threads both run <code>count++</code> for every request. After 2,000,000 requests the dashboard shows 1,873,402, and a different wrong number after every run (illustrative). Nothing crashes and no error is logged.`,
  predict: {
    q: `Two threads each run <code>count++</code> one million times on a shared counter with no lock. Why is the final total almost never 2,000,000?`,
    opts: [
      `The CPU executes <code>++</code> in one step on x86, so only ARM machines lose updates`,
      `The threads share a cache, so the second thread reads the first thread's result one loop late`,
      `<code>count++</code> is three steps (load, add, store), and the scheduler can switch threads between them`,
      `The thread scheduler stops each thread after one million operations, so the loop never finishes`
    ],
    ans: 2,
    why: `Two threads can both load the same old value, add one, and store. One store then overwrites the other, and the update is lost. The result changes from run to run because the timing of the switches changes.`
  },
  explain: `<h3>The idea</h3>
<p>A <b>thread</b> has its own stack and registers but shares the heap with every other thread in its process. The scheduler can pause a thread between any two instructions, so the order of the steps, the <b>interleaving</b>, is not under your control. Code that looks like one step is often several.</p>
<h3>How it works, step by step</h3>
<p><code>count++</code> is really three machine steps: load the value into a register, add one, and store the result back. Thread A loads 5. Thread B loads 5 before A stores. Both add one and store 6. The counter moved by one, not two, and nothing reported the loss.</p>
<p>A <b>mutex</b> makes the whole read-modify-write <b>atomic</b> for the threads that use it. One thread enters, the others wait until it unlocks. An atomic instruction, such as <code>AtomicLong</code> or <code>sync/atomic</code>, does the same for a single counter with less overhead. The rule that matters is that the load must be inside the lock as well: locking only the store still races.</p>
<p>Kernel threads are scheduled by the operating system. User threads are scheduled by a library. Many runtimes map many user threads onto fewer kernel threads, which is why the scheduler's choices can differ from one run to the next.</p>
<h3>The trade-off</h3>
<p>A mutex is simple and correct, but every thread that needs the lock waits behind the others, so the critical section should be short. For a hot counter, per-thread counters that are summed on read avoid most of the waiting. Race detectors such as <code>go test -race</code> find many of these bugs, but only when the timing shows them.</p>`,
  diagnose: [
    {
      t: 'Lost update on a shared counter',
      sym: 'The counter ends below the expected total, and the number is different on every run. No error is logged.',
      ctx: 'A web service counts requests with <code>count++</code> from 8 worker threads. After 2,000,000 requests the dashboard shows 1,873,402.',
      why: '<code>count++</code> is load, add, store. Two threads can both load the same old value, add one, and store: one increment overwrites the other.',
      log: `==================
WARNING: DATA RACE
Read at 0x00c0000b4010 by goroutine 8:
  main.handle()  counter.go:14
Previous write at 0x00c0000b4010 by goroutine 7:
  main.handle()  counter.go:14

requests counted: 1873402   expected: 2000000`,
      note: 'Representative Go race-detector output (go test -race); the counter value is illustrative.',
      fix: [
        'Measure first: run <code>go test -race</code> or ThreadSanitizer and read the first race report.',
        'Guard the whole read-modify-write with a mutex, or use an atomic increment (<code>sync/atomic</code>, <code>AtomicLong</code>).',
        'For hot counters keep one counter per thread and add them up when reading (<code>LongAdder</code>).',
        'Verify: 2,000,000 requests give exactly 2,000,000 in the race-detector run and in production metrics.'
      ]
    },
    {
      t: 'Check-then-act (TOCTOU) race',
      sym: 'An expensive initialisation runs twice, a singleton is created twice, or a file is overwritten, only under load.',
      ctx: 'A cache does <code>if (!map.containsKey(k)) map.put(k, load(k))</code>. The map is thread-safe, but two requests for the same key arrive together.',
      why: 'Each call on its own is safe, but the gap between the check and the action lets another thread in. The check result is already stale when you act on it.',
      log: `INFO  loading user 42 from database   (thread http-1)
INFO  loading user 42 from database   (thread http-2)
WARN  duplicate key value violates unique constraint "users_pkey"
# the expensive load ran twice, the second write failed`,
      note: 'Representative application log; the symptom is duplicated work or a unique-constraint error.',
      fix: [
        'Measure first: look in the log for the same key loaded twice by two threads at the same time.',
        'Make check and action one atomic operation: <code>computeIfAbsent</code>, <code>sync.Once</code>, <code>O_CREAT|O_EXCL</code>.',
        'Back it with a database unique constraint so a race becomes an error, not corruption.',
        'Verify: the same concurrent test now loads each key once.'
      ]
    },
    {
      t: 'Forgotten unlock, or a copied mutex',
      sym: 'After one failed request every later request hangs on the same lock, with no CPU use and no error.',
      ctx: 'A handler locks a mutex, then an exception or early <code>return</code> skips the <code>unlock</code>. The next caller waits for ever.',
      why: 'A lock must be released on every path out of the critical section. A copied mutex is a separate lock in the locked state, so it protects nothing, or never unlocks.',
      log: `goroutine 22 [sync.Mutex.Lock, 14 minutes]:
sync.(*Mutex).Lock(...)
main.(*Store).Get(0xc000010000)  store.go:31

$ go vet ./...
store.go:48: assignment copies lock value to s2: main.Store contains sync.Mutex`,
      note: 'Representative Go goroutine dump and go vet output.',
      fix: [
        'Measure first: take a goroutine dump and look for goroutines stuck in <code>sync.Mutex.Lock</code>.',
        'Release in <code>defer mu.Unlock()</code>, <code>with lock:</code> or <code>try/finally</code> right after acquiring.',
        'Never copy a mutex: pass structs by pointer and run <code>go vet</code>.',
        'Verify: after a forced error in the handler, the next request still gets the lock.'
      ]
    },
    {
      t: 'Holding a lock across slow I/O',
      sym: 'Throughput is a few requests per second, CPU is idle, and a thread dump shows most threads waiting for one lock.',
      ctx: 'A cache refresh holds the cache lock while it calls the database (200 ms), so every reader waits behind it.',
      why: 'The lock is held for the whole 200 ms, so only one request can progress at a time and the rest queue: a 200 ms critical section limits you to 5 operations per second.',
      log: `(pprof) top -cum  mutex profile
  14.2s  sync.(*Mutex).Lock
  14.1s  main.(*Cache).Get
   9.8s  main.(*Cache).Refresh   # holds the lock across http.Get`,
      note: 'Representative Go mutex profile; any lock-contention profiler (async-profiler, perf lock) shows the same shape.',
      fix: [
        'Measure first: take a mutex profile and read the frames that hold the lock.',
        'Copy the data you need, release the lock, then call the slow service.',
        'Keep critical sections to a few memory operations; do I/O outside the lock.',
        'Verify: throughput rises under the same load test, and lock wait time falls.'
      ]
    }
  ],
  source: { label: 'Original: Threads & mutual exclusion', href: '01-concurrency-end-to-end.html#ch3' },
  scenarios: [
    {
      id: 'race',
      label: 'Lost update',
      desc: 'Two threads load the same value before either stores, so one increment disappears (illustrative numbers).',
      codeLabel: 'Code',
      code: {
        bug: [
          'count++;                        // load, add, store',
          '// thread A: load 5 ... add ... store 6',
          '// thread B: load 5 ... add ... store 6   (before A stored)',
          '// final count after 2 increments: 6, not 7'
        ],
        fix: [
          'mu.Lock()',
          'count++                         // load, add, store, all inside the lock',
          'mu.Unlock()',
          '// final count after 2 increments: 7'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'ta', x: 10, y: 30, w: 170, h: 70, t: 'Thread A', s: 'load 5, add 1' },
          { id: 'tb', x: 10, y: 170, w: 170, h: 70, t: 'Thread B', s: 'load 5, add 1' },
          { id: 'mem', x: 260, y: 100, w: 170, h: 90, t: 'count (shared)', s: 'the one variable' },
          { id: 'mu', x: 470, y: 100, w: 160, h: 90, t: 'Mutex', s: 'one thread inside' }
        ],
        edges: [
          { id: 'e1', a: 'ta', b: 'mem', label: 'store 6' },
          { id: 'e2', a: 'tb', b: 'mem', label: 'store 6' },
          { id: 'e3', a: 'mu', b: 'mem', label: 'guards' }
        ]
      },
      bug: [
        { log: 'Thread A reads count, which is 5, and gets ready to add one.', code: 0, hl: { nodes: { ta: 'on', mem: 'on' } }, stats: [{ l: 'count read by A', v: '5', cls: 'ok' }] },
        { log: 'The scheduler pauses thread A and runs thread B. B also reads 5.', code: 1, hl: { nodes: { tb: 'warn', mem: 'warn' } }, stats: [{ l: 'count read by B', v: '5', cls: 'warn' }] },
        { log: 'Both threads add one and store 6. The second store overwrites the first, so one increment is lost.', code: 2, hl: { nodes: { ta: 'bad', tb: 'bad' }, edges: { e1: 'bad', e2: 'bad' } }, stats: [{ l: 'final count', v: '6', cls: 'bad' }] },
        { log: 'Over two million requests the same race loses updates in a different place each run (illustrative).', code: 3, stats: [{ l: 'counted', v: '1,873,402 of 2,000,000', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Thread A takes the mutex. Thread B reaches the same line and must wait.', code: 0, hl: { nodes: { mu: 'ok', tb: 'warn' }, edges: { e3: 'ok' } }, stats: [{ l: 'inside the lock', v: 'A only', cls: 'ok' }] },
        { log: 'Thread A loads, adds, and stores 6 while holding the lock. Nothing else can read in between.', code: 1, hl: { nodes: { ta: 'ok', mem: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'count', v: '6', cls: 'ok' }] },
        { log: 'A unlocks. B takes the lock, reads 6, and stores 7. Both increments are kept.', code: 2, hl: { nodes: { tb: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'final count', v: '7', cls: 'ok' }] }
      ]
    },
    {
      id: 'unlock',
      label: 'Error skips unlock',
      desc: 'An early return leaves the mutex locked, so every later caller waits for ever.',
      codeLabel: 'Code',
      code: {
        bug: [
          'mu.Lock()',
          'if err != nil { return err }   // early return: no Unlock',
          'mu.Unlock()',
          '// next caller: Lock() waits for ever'
        ],
        fix: [
          'mu.Lock()',
          'defer mu.Unlock()              // runs on every path',
          'if err != nil { return err }',
          '// next caller gets the lock'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'req1', x: 10, y: 40, w: 170, h: 70, t: 'Request 1', s: 'takes the lock' },
          { id: 'mu', x: 240, y: 100, w: 170, h: 80, t: 'Mutex', s: 'still locked' },
          { id: 'req2', x: 10, y: 180, w: 170, h: 70, t: 'Request 2', s: 'waits for the lock' },
          { id: 'req3', x: 460, y: 180, w: 170, h: 70, t: 'Request 3', s: 'waits for the lock' }
        ],
        edges: [
          { id: 'e1', a: 'req1', b: 'mu', label: 'lock' },
          { id: 'e2', a: 'req2', b: 'mu', label: 'blocked' },
          { id: 'e3', a: 'req3', b: 'mu', label: 'blocked' }
        ]
      },
      bug: [
        { log: 'Request 1 locks the mutex and then hits an error before the unlock line.', code: 0, hl: { nodes: { req1: 'on', mu: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'lock held by', v: 'request 1', cls: 'warn' }] },
        { log: 'The early return skips Unlock. The mutex stays locked, and the error is reported as normal.', code: 1, hl: { nodes: { mu: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'mutex', v: 'locked', cls: 'bad' }] },
        { log: 'Request 2 calls Lock and waits. So does every later request.', code: 3, hl: { nodes: { req2: 'bad', req3: 'bad' }, edges: { e2: 'bad', e3: 'bad' } }, stats: [{ l: 'requests served after the error', v: '0', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Defer registers the unlock right after the lock is taken.', code: 1, hl: { nodes: { mu: 'ok' } }, stats: [{ l: 'unlock', v: 'on every path', cls: 'ok' }] },
        { log: 'The error returns, and the deferred unlock runs before the function exits.', code: 2, hl: { nodes: { req1: 'ok', mu: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'mutex', v: 'released', cls: 'ok' }] },
        { log: 'Request 2 gets the lock at once, and every later caller continues.', code: 3, hl: { nodes: { req2: 'ok', req3: 'ok' }, edges: { e2: 'ok', e3: 'ok' } }, stats: [{ l: 'requests served after the error', v: 'all', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Safety, liveness & hardware atomics',
  problem: `A payment worker guards its charge routine with a hand-written spin lock. On 8 cores, two requests for the same order both pass the check. The customer is charged twice, and the log shows two successful charges and no error (illustrative).`,
  predict: {
    q: `A spin lock written as <code>while (locked) {}; locked = true;</code> passes every unit test. In production on 8 cores, two threads enter the same section. What is the real gap?`,
    opts: [
      `The compiler optimises the loop away, so the lock is never checked`,
      `Reading <code>locked</code> and writing it are two separate instructions, and another core can run between them`,
      `The kernel takes the lock from the thread after a few microseconds`,
      `x86 has no way to store a flag, so the lock never worked there`
    ],
    ans: 1,
    why: `The check and the set are two steps. Two cores can both read 0 before either writes 1. A single atomic instruction, such as test-and-set or compare-and-swap, makes the check and the take one step that nothing can split.`
  },
  explain: `<h3>The idea</h3>
<p><b>Safety</b> means a bad thing never happens: two threads are never inside the critical section together. <b>Liveness</b> means a good thing eventually happens: every waiting thread gets in. A lock can be safe and still starve a thread, which is a liveness failure.</p>
<h3>How it works, step by step</h3>
<p>A read-modify-write must be a single instruction, or it is not atomic. The usual set is <b>test-and-set</b>, <b>fetch-and-add</b>, and <b>compare-and-swap (CAS)</b>. CAS writes <code>new</code> only if the value still equals <code>expected</code>, and reports whether it did. Under contention each core must first take the cache line in exclusive state, so the line moves between cores. That cost is what makes contended atomics slow.</p>
<p>The CPU and the compiler may reorder independent loads and stores. x86 keeps most stores in order. ARM and POWER allow much more reordering, so code that publishes data with <code>data = 42; ready = true;</code> can break on ARM. The fix is a <b>release</b> store on the writer side and an <b>acquire</b> load on the reader side.</p>
<p>Spinning helps only when the lock holder is running on another core. If the holder has been preempted, every spin is wasted. Mutexes and futex-based locks spin briefly, then block.</p>
<h3>The trade-off</h3>
<p>Atomics are fast when uncontended and correct everywhere, but they are easy to misuse. You almost never write these by hand. Mutexes, semaphores and channels are built from the same few instructions. For application code, use the platform's locks and atomics, and treat any hand-rolled flag as a bug until proven otherwise.</p>`,
  diagnose: [
    {
      t: 'A hand-written lock on a plain flag',
      sym: 'It passes every test with one thread, and fails only when two requests arrive close together.',
      ctx: 'A boolean flag guarding a charge routine, written in C, Java or Go without atomics.',
      why: 'Reading the flag and writing it are two instructions. Two threads can both read 0 inside the gap, and both then write 1 and enter. The probability grows with the number of requests that land in that gap, so load makes it worse.',
      fix: [
        'Measure first: run a stress test that starts the critical section from many threads at once and counts the charges.',
        'Replace the flag with an atomic test-and-set (<code>atomic_flag.test_and_set</code>, <code>AtomicBoolean.compareAndSet</code>), or use the platform mutex.',
        'Use a race detector in CI (<code>go test -race</code>, ThreadSanitizer) so the plain read and write is reported even when the timing is lucky.',
        'Verify: the stress test shows one charge per order.'
      ]
    },
    {
      t: 'Spinning while the lock holder is paused',
      sym: 'The waiters spin on every CPU while the lock holder cannot run to release the lock.',
      ctx: 'A user-space spin lock in a container limited to 2 CPUs, with 3 worker threads. The lock holder is preempted by the scheduler.',
      why: 'Spinning helps only when the holder is running on another CPU at this moment. If the holder is not running, every spin is wasted, and the spinners push the holder further back in the queue.',
      fix: [
        'Measure first: check whether the lock holder is preempted while the waiters burn CPU.',
        'Spin for a short, bounded time, then block with a futex or a park call. <code>sync.Mutex</code> and <code>pthread_mutex</code> already do this.',
        'Keep critical sections short, so the chance that the holder is preempted inside one stays small.',
        'Verify: the same container limits show no spinning waiters in a thread dump.'
      ]
    },
    {
      t: 'Starvation: an unfair lock keeps losing',
      sym: 'One thread waits much longer than the others, and keeps losing the lock to threads that arrive later.',
      ctx: 'Go\'s <code>sync.Mutex</code> had a starvation problem before Go 1.9. Java\'s default <code>ReentrantLock</code> is unfair too.',
      why: 'A thread that has just arrived can grab the lock the moment it is released, before the waiter that has been queued for a long time wakes up. Under a steady stream of arrivals, the waiter may never be the one that gets the lock.',
      fix: [
        'Measure first: record how long each waiter waits, not only the average.',
        'Use a fair lock when waiting time matters: <code>new ReentrantLock(true)</code>. Fair locks cost some throughput, so measure first.',
        'Shorten the critical section, so each waiter\'s wait is short in the first place.',
        'Verify: the longest wait falls under the same load test.'
      ]
    },
    {
      t: 'Works on x86, breaks on ARM',
      sym: 'Code passes on x86 for years, then on ARM another core reads ready == true and then reads data == 0.',
      ctx: 'Code that publishes data with <code>data = 42; ready = true;</code> and no barrier.',
      why: 'A weakly ordered CPU may make the store to <code>ready</code> visible before the store to <code>data</code>. x86 keeps stores in order, so the bug is hidden there, and the code looks correct.',
      fix: [
        'Measure first: reproduce on an ARM machine, since an x86 laptop hides this class of bug.',
        'Use the language\'s atomics with release and acquire ordering: a release store on <code>ready</code>, an acquire load on the reader side (C++ <code>std::atomic</code>, Java <code>volatile</code>, Go <code>sync/atomic</code>).',
        'Never signal through a plain variable, even on x86.',
        'Verify: the same test passes on the hardware you ship on, including an ARM CI runner.'
      ]
    }
  ],
  source: { label: 'Original: Safety, liveness & hardware atomics', href: '01-concurrency-end-to-end.html#ch4' },
  scenarios: [
    {
      id: 'flag',
      label: 'Flag race',
      desc: 'Two cores read a free flag before either sets it, so both charge the same order (illustrative timing).',
      codeLabel: 'Code',
      code: {
        bug: [
          'while (locked) {}        // read: 0 on both cores',
          'locked = true;           // write: both cores write 1',
          'charge(order);           // both cores charge the same order',
          '// the log shows two successful charges'
        ],
        fix: [
          'while (test_and_set(&locked)) {}   // one atomic read and write',
          'charge(order);                      // only the winner gets here',
          'locked = false;                     // release'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'c1', x: 10, y: 30, w: 170, h: 70, t: 'Core 1', s: 'reads locked = 0' },
          { id: 'c2', x: 10, y: 180, w: 170, h: 70, t: 'Core 2', s: 'reads locked = 0' },
          { id: 'flag', x: 250, y: 100, w: 170, h: 90, t: 'locked (shared)', s: 'one memory word' },
          { id: 'chg', x: 470, y: 100, w: 160, h: 90, t: 'Charge order', s: 'runs on each core' }
        ],
        edges: [
          { id: 'e1', a: 'c1', b: 'flag', label: 'read, then write 1' },
          { id: 'e2', a: 'c2', b: 'flag', label: 'read, then write 1' },
          { id: 'e3', a: 'flag', b: 'chg', label: 'both enter' }
        ]
      },
      bug: [
        { log: 'Core 1 reads locked as 0. The lock looks free.', code: 0, hl: { nodes: { c1: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'locked read by core 1', v: '0', cls: 'ok' }] },
        { log: 'Before core 1 writes, core 2 also reads locked as 0 (illustrative timing: a few nanoseconds apart).', code: 0, hl: { nodes: { c2: 'warn' }, edges: { e2: 'warn' } }, stats: [{ l: 'locked read by core 2', v: '0', cls: 'warn' }] },
        { log: 'Both cores write 1. Each one believes it took the lock, and both enter the charge routine.', code: 2, hl: { nodes: { c1: 'bad', c2: 'bad', chg: 'bad' }, edges: { e1: 'bad', e2: 'bad', e3: 'bad' } }, stats: [{ l: 'cores inside the lock', v: '2', cls: 'bad' }] },
        { log: 'The customer is charged twice. The log shows two successful charges and no error.', code: 3, stats: [{ l: 'charges per order', v: '2', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The test-and-set reads the old value and writes 1 as one indivisible step.', code: 0, hl: { nodes: { flag: 'ok', c1: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'atomic step', v: 'one', cls: 'ok' }] },
        { log: 'Core 1 gets back 0 and owns the lock. Core 2 gets back 1 and keeps spinning.', code: 0, hl: { nodes: { c2: 'warn' }, edges: { e2: 'dim' } }, stats: [{ l: 'core 2', v: 'waiting', cls: 'warn' }] },
        { log: 'Only the winner charges the order. One charge per order.', code: 1, hl: { nodes: { chg: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'charges per order', v: '1', cls: 'ok' }] }
      ]
    },
    {
      id: 'order',
      label: 'Data before flag',
      desc: 'Without release and acquire, a reader on ARM can see the flag before the data (illustrative timing).',
      codeLabel: 'Code',
      code: {
        bug: [
          'data = 42;                  // store 1: a cache miss, slow',
          'ready = true;               // store 2: no barrier, can land first',
          '// reader: sees ready == true, then reads data == 0'
        ],
        fix: [
          'data = 42;',
          'ready.store(true, release); // data is visible before the flag',
          '// reader: ready.load(acquire) == true, then data == 42'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'w', x: 10, y: 100, w: 170, h: 80, t: 'Writer core', s: 'data = 42; ready = 1' },
          { id: 'mem', x: 250, y: 100, w: 170, h: 80, t: 'Memory', s: 'stores may reorder' },
          { id: 'r', x: 470, y: 100, w: 170, h: 80, t: 'Reader core', s: 'sees ready, reads data' }
        ],
        edges: [
          { id: 'e1', a: 'w', b: 'mem', label: 'store 1, store 2' },
          { id: 'e2', a: 'mem', b: 'r', label: 'load' }
        ]
      },
      bug: [
        { log: 'The writer stores 42 into data. That store misses the cache and is slow.', code: 0, hl: { nodes: { w: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'data', v: '42 (in flight)', cls: 'warn' }] },
        { log: 'The writer stores true into ready. The CPU may make this store visible first.', code: 1, hl: { nodes: { mem: 'warn' }, edges: { e1: 'warn' } }, stats: [{ l: 'ready', v: 'true (visible)', cls: 'warn' }] },
        { log: 'The reader sees ready == true, and reads data while the first store is still pending. It gets 0.', code: 2, hl: { nodes: { r: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'data read', v: '0', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The release store on ready means every earlier store, including data, is visible first.', code: 1, hl: { nodes: { w: 'ok', mem: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'ordering', v: 'release', cls: 'ok' }] },
        { log: 'The reader uses an acquire load, so it sees the data that came before the flag.', code: 2, hl: { nodes: { r: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'data read', v: '42', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Semaphores & producer-consumer',
  problem: `A crawler downloads pages at 200 per second, and a parser turns each page into a record at 50 per second. The queue between them has no limit. After five minutes it holds about 45,000 pages, and the newest page waits about 15 minutes (illustrative). Then the process is killed for running out of memory.`,
  predict: {
    q: `A producer adds 200 items per second to a queue with no capacity limit. A consumer removes 50 per second. What happens after five minutes?`,
    opts: [
      `The queue stays at a fixed size, because the producer blocks by itself`,
      `The queue is capped at a default size of 16 and extra items are dropped`,
      `The operating system pauses the producer, so the queue never grows`,
      `The queue grows by about 150 items every second, and waiting time and memory grow with it`
    ],
    ans: 3,
    why: `Nothing limits the producer, so the queue gains 150 items a second. Overload shows up first as latency, then as memory, and nothing reports an error until the process is killed.`
  },
  explain: `<h3>The idea</h3>
<p>A <b>semaphore</b> is a counter that never goes below zero. <code>wait</code> takes one unit, and sleeps if none is left. <code>signal</code> adds one unit, and wakes a sleeper if there is one. A counting semaphore fits "N items are available" well, because a signal that arrives before anyone waits is kept in the counter.</p>
<h3>How it works, step by step</h3>
<p>A bounded buffer uses two semaphores. <code>empty</code> starts at the capacity and counts free slots. <code>full</code> starts at 0 and counts items. The producer runs <code>wait(empty)</code>, pushes, then <code>signal(full)</code>. The consumer runs <code>wait(full)</code>, pops, then <code>signal(empty)</code>. Each side sleeps exactly when it cannot proceed, and wakes only the other side.</p>
<p>The invariant is <code>empty + full == CAP</code> at all times. A mutex protects the data structure while it changes. The semaphores decide whether an operation may start, and the mutex protects the data, because two threads can both pass <code>wait</code> at the same moment.</p>
<p>Capacity should come from latency, not from memory. <b>Little's law</b> says the average number of items in a system equals the arrival rate times the average time in it, L = λW. At 200 items per second with a 0.5 s budget, a capacity near 100 is the most you should allow.</p>
<h3>The trade-off</h3>
<p>A bounded buffer makes the producer feel the overload, which is the point. The price is that a full buffer blocks the producer, so timeouts and shutdown must be designed in. Decide how a consumer stops, for example with a closed queue or a poison pill, before the first version ships.</p>`,
  diagnose: [
    {
      t: 'An unbounded queue hides overload',
      sym: 'Everything looks fine in staging, and the queue grows only when production traffic exceeds the consumer rate.',
      ctx: 'Java <code>LinkedBlockingQueue()</code> created with no capacity, Python <code>queue.Queue()</code> with no <code>maxsize</code>, and thread pools built on an unbounded queue (<code>Executors.newFixedThreadPool</code> uses one).',
      why: 'An unbounded queue accepts every item. Overload turns into a growing queue, which turns into latency and then into memory, and the producer never feels any of it.',
      fix: [
        'Measure first: alert on queue length and on the age of the oldest item, not only on error rates.',
        'Give every queue a capacity, and choose what happens when it is full: block the producer, drop the newest item, or reject with an error the caller sees.',
        'Check the capacity against Little\'s law: capacity is about throughput times the latency you can afford.',
        'Verify: under the production arrival rate, queue length stays below the capacity.'
      ]
    },
    {
      t: 'A permit that is never released',
      sym: 'Each failure removes one permit for good, and the pool gets smaller until every new request waits for ever.',
      ctx: 'A connection pool built on a semaphore with 3 permits. A request takes a permit, then fails inside the handler, and the code path that releases it is skipped by the exception. Python <code>asyncio.Semaphore</code> used without <code>async with</code> behaves the same way.',
      why: 'Acquire and release are two separate calls, and nothing ties them together when the code leaves early. Each leaked permit makes the pool smaller, until the pool is empty and every new request waits for ever.',
      fix: [
        'Measure first: expose the number of free permits as a metric; a count that only goes down is the signature.',
        'Use the scoped form of the call: <code>try/finally</code> in Java, <code>defer</code> in Go, <code>with</code> or <code>async with</code> in Python.',
        'Give waiting requests a timeout, so the pool reports "no connection" as an error instead of hanging.',
        'Verify: after forced errors in the handler, the free-permit count returns to its starting value.'
      ]
    },
    {
      t: 'Wait order causes a deadlock',
      sym: 'The producer and consumer both sleep, and neither can make progress, because the producer holds the mutex while it waits.',
      ctx: 'The producer takes the mutex, then waits for an empty slot. The consumer needs the mutex to free a slot. Real code hits the same shape when a worker holds a pool lock while it waits for a free connection.',
      why: 'The producer holds the mutex while it sleeps on <code>empty</code>. Nobody can take the mutex to make a slot free, so both sides wait for each other forever.',
      fix: [
        'Measure first: take a thread dump and check which thread holds the mutex while it waits.',
        'Always wait on the counting semaphore first, and take the mutex second, and release the mutex before you signal.',
        'Keep the locked section to the data change only. Never block on another resource while holding a mutex.',
        'Verify: the wait order is written down as a team rule and checked in review.'
      ]
    },
    {
      t: 'Readers keep starving the writer',
      sym: 'A writer waits for ever even though it arrived first, because reads always overlap.',
      ctx: 'A cache protected by a read-write lock. Reads arrive all the time and overlap, so there is never a moment with zero readers. Java\'s default <code>ReentrantReadWriteLock</code> can starve writers this way.',
      why: 'A writer can get in only when no reader is inside. With overlapping readers, that moment never comes, so the writer waits for ever, even though it arrived first.',
      fix: [
        'Measure first: record how long writers wait, not only readers.',
        'Use writer preference: once a writer is waiting, new readers queue behind it. The Go <code>RWMutex</code> does this.',
        'Use a fair lock when writes must not wait long (<code>new ReentrantReadWriteLock(true)</code>), and keep read sections short.',
        'Verify: the longest writer wait stays under the target under the same read load.'
      ]
    }
  ],
  source: { label: 'Original: Semaphores & producer-consumer', href: '01-concurrency-end-to-end.html#ch5' },
  scenarios: [
    {
      id: 'queue',
      label: 'Unbounded vs bounded',
      desc: 'An unbounded queue grows by 150 items a second; a bounded buffer makes the crawler wait (illustrative numbers).',
      codeLabel: 'Code',
      code: {
        bug: [
          'queue = Queue()                 # no maxsize',
          'crawler: queue.put(page)        # 200 per second, never waits',
          'parser:  record = queue.get()   # 50 per second',
          '# backlog grows by 150 every second'
        ],
        fix: [
          'empty = Semaphore(100)          # free slots, = capacity',
          'full = Semaphore(0)             # items waiting',
          'crawler: empty.acquire(); put(page); full.release()',
          '# the crawler waits when 100 pages are queued'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'cr', x: 10, y: 100, w: 150, h: 80, t: 'Crawler', s: '200 pages/s in' },
          { id: 'q', x: 230, y: 100, w: 180, h: 80, t: 'Queue', s: 'no limit' },
          { id: 'pa', x: 470, y: 100, w: 160, h: 80, t: 'Parser', s: '50 records/s out' },
          { id: 'mem', x: 230, y: 220, w: 180, h: 60, t: 'Memory', s: 'grows with backlog' }
        ],
        edges: [
          { id: 'e1', a: 'cr', b: 'q', label: 'put, never waits' },
          { id: 'e2', a: 'q', b: 'pa', label: 'get 50/s' },
          { id: 'e3', a: 'q', b: 'mem', label: 'holds pages' }
        ]
      },
      bug: [
        { log: 'The crawler puts pages at 200 per second. Nothing ever makes it wait.', code: 1, hl: { nodes: { cr: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'put rate', v: '200/s', cls: 'warn' }] },
        { log: 'The parser takes 50 per second, so the queue gains 150 pages every second.', code: 2, hl: { nodes: { pa: 'warn' }, edges: { e2: 'warn' } }, stats: [{ l: 'net growth', v: '+150/s', cls: 'bad' }] },
        { log: 'After five minutes the queue holds about 45,000 pages. The newest page waits about 15 minutes (illustrative).', code: 3, hl: { nodes: { q: 'bad', mem: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'queue length', v: '~45,000', cls: 'bad' }, { l: 'newest page wait', v: '~15 min', cls: 'bad' }] },
        { log: 'Nothing failed on the way. An hour later the process is killed for running out of memory.', code: 3, stats: [{ l: 'process', v: 'killed (memory)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The crawler must take a free slot from empty before it puts a page. It waits when there are none.', code: 2, hl: { nodes: { cr: 'ok', q: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'capacity', v: '100', cls: 'ok' }] },
        { log: 'When 100 pages are queued the crawler sleeps. Its rate drops to what the parser can handle.', code: 2, hl: { nodes: { cr: 'warn', pa: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'crawler', v: 'waits at 100', cls: 'warn' }] },
        { log: 'The queue never passes 100 items. At the parser rate of 50 per second, the newest page waits about 2 s (Little\'s law: 100 items ÷ 50 per second, illustrative).', code: 1, hl: { nodes: { mem: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'queue length', v: '<= 100', cls: 'ok' }, { l: 'wait', v: '~2 s', cls: 'ok' }] }
      ]
    },
    {
      id: 'leak',
      label: 'Permit never returned',
      desc: 'A pool of three permits shrinks to zero when the error path skips the release (illustrative).',
      codeLabel: 'Code',
      code: {
        bug: [
          'sem.acquire()                 # take a permit',
          'handle(req)                   # raises an error here',
          'sem.release()                 # skipped by the exception',
          '# each failure removes one permit for good'
        ],
        fix: [
          'sem.acquire()',
          'try:',
          '    handle(req)',
          'finally:',
          '    sem.release()             # runs on every path'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'req', x: 10, y: 100, w: 160, h: 80, t: 'Request', s: 'takes a permit' },
          { id: 'sem', x: 240, y: 100, w: 180, h: 80, t: 'Semaphore', s: '3 permits at start' },
          { id: 'err', x: 470, y: 100, w: 160, h: 80, t: 'Error path', s: 'skips the release' }
        ],
        edges: [
          { id: 'e1', a: 'req', b: 'sem', label: 'acquire' },
          { id: 'e2', a: 'err', b: 'sem', label: 'no release' }
        ]
      },
      bug: [
        { log: 'Three permits are free. A request takes one, leaving two.', code: 0, hl: { nodes: { req: 'on', sem: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'free permits', v: '2 of 3', cls: 'ok' }] },
        { log: 'The handler raises an error. The release line is never reached, so the permit is not returned.', code: 1, hl: { nodes: { err: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'free permits', v: '2 of 3', cls: 'warn' }] },
        { log: 'Three failures later the pool is empty. The next request waits for ever.', code: 3, hl: { nodes: { sem: 'bad', req: 'bad' } }, stats: [{ l: 'free permits', v: '0 of 3', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The try block holds the permit, and finally releases it on every exit path.', code: 4, hl: { nodes: { err: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'release', v: 'every path', cls: 'ok' }] },
        { log: 'After a forced error the permit goes back. The pool keeps its three permits.', code: 4, hl: { nodes: { sem: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'free permits', v: '3 of 3', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Monitors & condition variables',
  problem: `Three consumer threads wait for jobs from one queue. A producer adds a job and signals. Once about a week (illustrative), a woken consumer finds the queue empty and crashes with <code>NoSuchElementException</code>.`,
  predict: {
    q: `The consumer code is <code>if (queue.isEmpty()) cv.wait(); take();</code>. A consumer wakes after a signal. What can it find when it runs <code>take()</code>?`,
    opts: [
      `Two items, because the signal is delivered twice`,
      `Always one item, because a signal is only sent when an item is added`,
      `Possibly an empty queue, because a wake-up only means something may have changed, and another thread may have taken the item`,
      `An error from the lock, because a wait cannot be woken by a signal`
    ],
    ans: 2,
    why: `A wake-up is a hint, not proof. The check ran before the wait and was never repeated. Between the signal and the moment the woken thread holds the lock again, another thread may take the item.`
  },
  explain: `<h3>The idea</h3>
<p>A <b>monitor</b> is a lock, the data it protects, and one or more <b>condition variables</b> for waiting until that data reaches a state. Java's <code>synchronized</code> with <code>wait</code> and <code>notify</code>, C's <code>pthread_cond</code>, Go's <code>sync.Cond</code> and Python's <code>threading.Condition</code> all follow this model.</p>
<h3>How it works, step by step</h3>
<p><code>wait</code> does three things as one atomic step: it releases the lock, it puts the thread to sleep, and when it wakes it takes the lock again before it returns. Being atomic is what prevents a lost wake-up. A <code>signal</code> does not hand over the lock. Most libraries use Mesa semantics: the woken thread becomes runnable and must compete for the lock again.</p>
<p>That is why every wait must sit in a loop: <code>while (!predicate) wait();</code>. The loop tests the condition again after each wake-up. A condition variable has no memory. A <code>notify</code> with nobody waiting is dropped, so the predicate itself must live in shared state that only the lock protects.</p>
<p>Use <code>signal</code> when exactly one waiter can make progress. Use <code>notifyAll</code> when the change may let any of several kinds of waiter go on. Separate conditions, such as <code>notEmpty</code> and <code>notFull</code>, let you signal the right waiter.</p>
<h3>The trade-off</h3>
<p>The loop costs one extra check on each wake-up, which is cheap. The real cost is design: never call <code>wait</code> while holding a second lock, because <code>wait</code> releases only the monitor's own lock, and the thread that would wake you may be blocked by the lock you still hold.</p>`,
  diagnose: [
    {
      t: 'An if where the loop should be',
      sym: 'A consumer wakes and finds the queue empty, or two consumers take the same item, only under some timings.',
      ctx: 'Java <code>if (queue.isEmpty()) lock.wait()</code>, C <code>pthread_cond_wait</code> inside an if, Go <code>sync.Cond.Wait()</code> outside a loop.',
      why: 'A wake-up only means "something may have changed". The if treats it as proof that the condition holds. A spurious wake-up, a stolen item, or a second signal all break that assumption.',
      fix: [
        'Measure first: find every wait call and check whether it sits inside a while loop.',
        'Put every wait in a <code>while</code> loop that tests the predicate again each time the thread wakes.',
        'Keep the predicate in shared state that only the lock protects (for example, the queue length), so the test is meaningful.',
        'Verify: a test with several consumers and one producer never sees an empty take.'
      ]
    },
    {
      t: 'A signal sent before the waiter waits',
      sym: 'A consumer sleeps on a queue that is already holding an item, and the queue length metric is not zero.',
      ctx: 'A consumer checks the queue under the lock, releases the lock, and then re-acquires it to call <code>wait()</code>. The producer adds an item and signals in the gap.',
      why: 'Between the check and the wait the lock was released, so the producer ran. Condition variables do not remember a signal, so the wake-up was lost.',
      fix: [
        'Measure first: take a thread dump, and check whether the consumer is in <code>wait</code> while the queue is not empty.',
        'Check the predicate and call <code>wait</code> inside the same locked region. <code>wait</code> releases the lock atomically.',
        'In the loop form (<code>while (empty) wait()</code>), the check happens just before the sleep, so a signal that already happened is seen by the check.',
        'Verify: the hang no longer appears under the same producer and consumer rates.'
      ]
    },
    {
      t: 'notifyAll wakes everyone',
      sym: 'CPU use climbs while throughput does not, because almost every woken thread finds the condition false and sleeps again.',
      ctx: 'A bounded buffer shared by 200 producers and 200 consumers, all waiting on one monitor. Each <code>notifyAll()</code> wakes all 400 threads.',
      why: 'A single item changed the state, but <code>notifyAll</code> wakes every waiter, including the ones that cannot act. This is the thundering herd: most wake-ups are wasted, and each one takes the lock once more.',
      fix: [
        'Measure first: count wake-ups per item. More than one wasted wake-up per item means the conditions are mixed up.',
        'Use separate conditions (<code>notEmpty</code>, <code>notFull</code>) and <code>signal</code> the one that can now make progress.',
        'Use <code>notifyAll</code> only when the state change may satisfy any waiter, for example when a shutdown flag is set.',
        'Verify: wake-ups per item fall to about one under the same load.'
      ]
    },
    {
      t: 'Waiting while holding another lock',
      sym: 'Two threads hang for ever: one waits on a condition while holding a lock that the other one needs.',
      ctx: 'A method holds lock A and then waits on condition B, which belongs to another object. Java <code>synchronized</code> blocks nested this way, and Go code that waits on a <code>sync.Cond</code> while holding another mutex, both hang.',
      why: '<code>wait</code> releases the monitor\'s own lock and nothing else. Any outer lock stays held during the sleep, and whoever would wake the waiter is blocked by it.',
      fix: [
        'Measure first: take a thread dump and see which threads hold an outer lock while they are in <code>wait</code>.',
        'Release the outer lock before waiting. Re-acquire it after the wake-up if you still need it.',
        'Keep waits and locks in one place: wait only in the monitor that owns the condition, with no other locks held.',
        'Verify: no thread is in <code>wait</code> while holding a second lock.'
      ]
    }
  ],
  source: { label: 'Original: Monitors & condition variables', href: '01-concurrency-end-to-end.html#ch6' },
  scenarios: [
    {
      id: 'ifwait',
      label: 'If, not while',
      desc: 'A woken consumer takes an item that another thread already took, and finds the queue empty (illustrative timing).',
      codeLabel: 'Code',
      code: {
        bug: [
          'lock.lock()',
          'if (queue.isEmpty()) cv.wait();   // one check, before the wait',
          'take();                           // runs even after a stolen item',
          'lock.unlock()'
        ],
        fix: [
          'lock.lock()',
          'while (queue.isEmpty()) cv.wait(); // re-test after every wake-up',
          'take();',
          'lock.unlock()'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'prod', x: 10, y: 100, w: 150, h: 80, t: 'Producer', s: 'adds 1 item, signals' },
          { id: 'q', x: 230, y: 100, w: 170, h: 80, t: 'Queue', s: 'one item' },
          { id: 'cw', x: 460, y: 30, w: 170, h: 70, t: 'Consumer 1', s: 'woken by signal' },
          { id: 'ct', x: 460, y: 190, w: 170, h: 70, t: 'Consumer 4', s: 'never waited, takes it' }
        ],
        edges: [
          { id: 'e1', a: 'prod', b: 'q', label: 'add + signal' },
          { id: 'e2', a: 'q', b: 'cw', label: 'signal' },
          { id: 'e3', a: 'q', b: 'ct', label: 'takes first' }
        ]
      },
      bug: [
        { log: 'The producer adds one job and signals. Consumer 1 is woken, but has not got the lock yet.', code: 0, hl: { nodes: { prod: 'on', q: 'on' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'items in queue', v: '1', cls: 'ok' }] },
        { log: 'Consumer 4 was never waiting. It arrives, takes the lock first, and takes the job.', code: 2, hl: { nodes: { ct: 'warn' }, edges: { e3: 'warn' } }, stats: [{ l: 'items in queue', v: '0', cls: 'warn' }] },
        { log: 'Consumer 1 gets the lock and goes straight to take(). The if check ran before the wait and is never repeated.', code: 2, hl: { nodes: { cw: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'check repeated', v: 'no', cls: 'bad' }] },
        { log: 'take() runs on an empty queue and fails with NoSuchElementException.', code: 1, stats: [{ l: 'error', v: 'NoSuchElementException', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Consumer 1 wakes and must get the lock. It then re-tests the queue inside the loop.', code: 1, hl: { nodes: { cw: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'check repeated', v: 'yes', cls: 'ok' }] },
        { log: 'The queue is empty, so the loop waits again. No empty take happens.', code: 1, hl: { nodes: { q: 'ok', ct: 'dim' }, edges: { e3: 'dim' } }, stats: [{ l: 'empty takes', v: '0', cls: 'ok' }] },
        { log: 'When an item is really there, the loop exits and take() runs safely.', code: 2, stats: [{ l: 'error', v: 'none', cls: 'ok' }] }
      ]
    },
    {
      id: 'lost',
      label: 'Lost signal',
      desc: 'Checking outside the lock loses the wake-up when the producer signals in the gap (illustrative timing).',
      codeLabel: 'Code',
      code: {
        bug: [
          'lock(); empty = queue.isEmpty(); unlock();',
          '// producer runs here: add item, signal (no waiter yet)',
          'lock(); cv.wait(); unlock();      // sleeps on an item that exists',
          '// the signal was lost'
        ],
        fix: [
          'lock();',
          'while (queue.isEmpty()) cv.wait(); // check and wait in one locked region',
          'unlock();',
          '// the check sees the item, no sleep'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'con', x: 10, y: 100, w: 170, h: 80, t: 'Consumer', s: 'checks, then unlocks' },
          { id: 'prod', x: 240, y: 20, w: 170, h: 70, t: 'Producer', s: 'adds item + signal' },
          { id: 'cv', x: 470, y: 100, w: 160, h: 80, t: 'Condition var', s: 'no memory of signal' },
          { id: 'q', x: 240, y: 190, w: 170, h: 70, t: 'Queue', s: 'has one item' }
        ],
        edges: [
          { id: 'e1', a: 'prod', b: 'cv', label: 'signal' },
          { id: 'e2', a: 'con', b: 'cv', label: 'wait (too late)' },
          { id: 'e3', a: 'prod', b: 'q', label: 'add' }
        ]
      },
      bug: [
        { log: 'The consumer checks the queue under the lock. It is empty, so it unlocks to call wait.', code: 0, hl: { nodes: { con: 'on' }, edges: { e2: 'dim' } }, stats: [{ l: 'consumer check', v: 'empty', cls: 'ok' }] },
        { log: 'In the gap, the producer adds an item and signals. No thread is waiting yet, so the signal is dropped.', code: 1, hl: { nodes: { prod: 'warn', q: 'warn', cv: 'warn' }, edges: { e1: 'warn', e3: 'warn' } }, stats: [{ l: 'signal', v: 'dropped', cls: 'bad' }] },
        { log: 'The consumer locks again and calls wait. It sleeps on a queue that already has an item.', code: 2, hl: { nodes: { con: 'bad', cv: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'items waiting', v: '1', cls: 'bad' }] },
        { log: 'Nothing wakes the consumer, so the job waits for ever. A thread dump shows the consumer in wait.', code: 3, stats: [{ l: 'consumer', v: 'asleep', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Check and wait happen inside one locked region. wait releases the lock and sleeps in one atomic step.', code: 1, hl: { nodes: { con: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'check and wait', v: 'one locked step', cls: 'ok' }] },
        { log: 'If the producer already added the item, the loop test sees it and the consumer never sleeps.', code: 3, hl: { nodes: { q: 'ok', cv: 'dim' }, edges: { e3: 'ok', e1: 'dim' } }, stats: [{ l: 'consumer', v: 'takes the item', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Deadlock & liveness guarantees',
  problem: `A bank service has <code>transfer(from, to)</code>, which locks both accounts. At 9:00 two customers send money to each other at the same moment (illustrative). Both requests hang. The health check still passes, and the customers see a spinner for ever.`,
  predict: {
    q: `Thread A holds the lock on account 1 and waits for account 2. Thread B holds account 2 and waits for account 1. What does the system look like from outside?`,
    opts: [
      `It crashes with an out-of-memory error within a few seconds`,
      `It keeps running at full speed, because the scheduler breaks ties`,
      `Both threads wait for ever, but the process is alive and the health check passes`,
      `One thread is killed by the operating system and the other finishes`
    ],
    ans: 2,
    why: `Each thread holds the lock the other needs, and neither releases its lock. Nothing crashes, so a simple process check passes. Only a request timeout or a thread dump shows the stall.`
  },
  explain: `<h3>The idea</h3>
<p>A <b>deadlock</b> needs four conditions at the same time: mutual exclusion, hold-and-wait, no forced release, and a circular wait. Removing any one of them makes deadlock impossible. The most practical one to remove is the circular wait.</p>
<h3>How it works, step by step</h3>
<p>Draw it as a graph. A lock points at the thread that holds it. A thread points at the lock it waits for. A loop in this graph is a deadlock. In the transfer example, A points to account 2 and B points to account 1, so the loop is closed.</p>
<p><b>Lock ordering</b> is the simplest prevention. Every thread takes locks in one global order, for example lowest account ID first. If everyone climbs the same ladder, no loop can form. Put the sorting in one helper that every transfer uses, so no caller can forget it.</p>
<p>Timeouts and try-lock with back-off help you get out of a deadlock that has already happened. They do not stop it from happening. A related problem is <b>priority inversion</b>: a low-priority thread holds a lock that a high-priority thread needs, while medium-priority work keeps the low-priority thread from running.</p>
<h3>The trade-off</h3>
<p>Lock ordering works only if everyone follows it, and the compiler will not check it for you. Code that calls out while holding a lock can break the order, because the code you call may take locks you do not know about. Copy what you need, release the lock, then call out. Write the lock order down next to the code, so new code follows the same ladder.</p>`,
  diagnose: [
    {
      t: 'Two transfers that lock in opposite order',
      sym: 'Two transfers of the same two accounts in opposite directions hang at the same moment.',
      ctx: '<code>transfer(a, b)</code> and <code>transfer(b, a)</code> run at the same time. Two database transactions that update the same two rows in opposite order are the same bug; PostgreSQL reports <code>deadlock detected</code> and aborts one of them.',
      why: 'Each side holds the lock the other needs, and nothing forces a common order.',
      fix: [
        'Measure first: take a thread dump, or read the database deadlock log, and find the two locks in the cycle.',
        'Sort the lock keys (lowest account ID first) in one helper that every transfer uses.',
        'Retry the aborted transaction in the database case, with a limit on attempts.',
        'Verify: a test that runs a->b and b->a together finishes every time.'
      ]
    },
    {
      t: 'Calling out while holding a lock',
      sym: 'A listener that calls back into the bus hangs, because the bus still holds the lock it needs.',
      ctx: 'An event bus calls its listeners inside a <code>synchronized</code> block. A listener calls back into the bus and needs the same lock, or waits for a thread that does.',
      why: 'The code you call may take locks you do not know about, so the order is out of your control.',
      fix: [
        'Measure first: find every callback or listener call that happens inside a locked block.',
        'Copy what you need while holding the lock, release it, and only then call the listeners.',
        'Keep the locked section to the data change only.',
        'Verify: a listener that calls back into the bus no longer hangs.'
      ]
    },
    {
      t: 'Self-deadlock with a non-reentrant lock',
      sym: 'One goroutine waits for itself. Java\'s <code>synchronized</code> does allow this kind of nesting, so the same code works there.',
      ctx: 'Go\'s <code>sync.Mutex</code> is not reentrant. A method locks it and then calls another method that locks the same mutex.',
      why: 'The second lock call has no way to know that the same owner already holds the lock.',
      fix: [
        'Measure first: take a goroutine dump and find the goroutine that waits on a mutex it already holds.',
        'Split the method into a public version that takes the lock and an internal version that expects it to be held.',
        'Use the internal version inside other locked methods.',
        'Verify: the goroutine dump shows no goroutine waiting on its own mutex.'
      ]
    },
    {
      t: 'A thread pool waiting on itself',
      sym: 'Every worker is waiting, and the sub-tasks sit in the queue and never run.',
      ctx: 'Tasks running in a bounded pool wait for sub-tasks queued in the same pool. Every worker is waiting, and none is free to run the sub-tasks.',
      why: 'Waiting occupies a worker, so the pool runs out of workers that could make progress.',
      fix: [
        'Measure first: count the workers that are waiting on a sub-task in a thread dump.',
        'Give parent and child tasks separate pools, or make the parent asynchronous so it does not hold a worker while it waits.',
        'Add a timeout to the wait, so a stall becomes an error.',
        'Verify: the same nested workload finishes under the same pool size.'
      ]
    }
  ],
  source: { label: 'Original: Deadlock & liveness guarantees', href: '01-concurrency-end-to-end.html#ch7' },
  scenarios: [
    {
      id: 'order',
      label: 'Opposite lock order',
      desc: 'Two transfers in opposite directions each hold one account and wait for the other (illustrative timing).',
      codeLabel: 'Code',
      code: {
        bug: [
          'transfer(a, b):  lock(a); lock(b); move(a, b); unlock both',
          'transfer(b, a):  lock(b); lock(a); move(b, a); unlock both',
          '# A holds a, waits for b; B holds b, waits for a'
        ],
        fix: [
          'transfer(a, b):  first, second = sorted(a, b); lock(first); lock(second)',
          '# both calls take the lower account ID first',
          '# no loop in the wait graph'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'ta', x: 10, y: 30, w: 160, h: 70, t: 'Thread A', s: 'transfer(a, b)' },
          { id: 'tb', x: 10, y: 180, w: 160, h: 70, t: 'Thread B', s: 'transfer(b, a)' },
          { id: 'la', x: 260, y: 30, w: 150, h: 70, t: 'Lock a', s: 'held by A' },
          { id: 'lb', x: 260, y: 180, w: 150, h: 70, t: 'Lock b', s: 'held by B' }
        ],
        edges: [
          { id: 'e1', a: 'la', b: 'tb', label: 'A waits for b' },
          { id: 'e2', a: 'lb', b: 'ta', label: 'B waits for a' },
          { id: 'e3', a: 'ta', b: 'la', label: 'holds' },
          { id: 'e4', a: 'tb', b: 'lb', label: 'holds' }
        ]
      },
      bug: [
        { log: 'Thread A locks account a. Thread B locks account b. Each has one lock.', code: 0, hl: { nodes: { ta: 'on', tb: 'on', la: 'on', lb: 'on' }, edges: { e3: 'on', e4: 'on' } }, stats: [{ l: 'locks held', v: '2', cls: 'ok' }] },
        { log: 'A asks for account b. B holds it, so A waits.', code: 0, hl: { nodes: { ta: 'warn' }, edges: { e1: 'warn' } }, stats: [{ l: 'A waits for', v: 'lock b', cls: 'warn' }] },
        { log: 'B asks for account a. A holds it, so B waits. The graph now has a loop.', code: 1, hl: { nodes: { tb: 'bad' }, edges: { e2: 'bad', e1: 'bad' } }, stats: [{ l: 'wait cycle', v: 'yes', cls: 'bad' }] },
        { log: 'Neither thread can move, and neither releases its lock. Requests hang, but the process stays alive.', code: 2, stats: [{ l: 'transfers done', v: '0', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Both transfers sort the two account IDs first, so they take the lower ID first.', code: 0, hl: { nodes: { la: 'ok', lb: 'ok' } }, stats: [{ l: 'lock order', v: 'lowest ID first', cls: 'ok' }] },
        { log: 'A and B now both want the lower lock first. One waits briefly, then gets both locks.', code: 1, hl: { nodes: { ta: 'ok', tb: 'warn' }, edges: { e3: 'ok', e4: 'dim', e1: 'dim', e2: 'dim' } }, stats: [{ l: 'wait cycle', v: 'none', cls: 'ok' }] },
        { log: 'Both transfers finish. The loop cannot form when everyone climbs the same ladder.', code: 2, stats: [{ l: 'transfers done', v: 'all', cls: 'ok' }] }
      ]
    },
    {
      id: 'reentry',
      label: 'Self-deadlock',
      desc: 'A method holds a non-reentrant mutex and calls a helper that locks it again (illustrative).',
      codeLabel: 'Code',
      code: {
        bug: [
          'func (s *Store) Save(v V) {',
          '    s.mu.Lock()',
          '    s.Count()        // calls Lock again',
          '}',
          'func (s *Store) Count() int { s.mu.Lock(); defer s.mu.Unlock(); ... }'
        ],
        fix: [
          'func (s *Store) Save(v V) {',
          '    s.mu.Lock(); defer s.mu.Unlock()',
          '    s.count()        // internal, expects the lock held',
          '}'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'g', x: 10, y: 100, w: 170, h: 80, t: 'Goroutine', s: 'calls Save' },
          { id: 'mu', x: 240, y: 100, w: 170, h: 80, t: 'Mutex', s: 'held by this goroutine' },
          { id: 'cnt', x: 470, y: 100, w: 170, h: 80, t: 'Count()', s: 'calls Lock again' }
        ],
        edges: [
          { id: 'e1', a: 'g', b: 'mu', label: 'Lock' },
          { id: 'e2', a: 'cnt', b: 'mu', label: 'Lock: waits' }
        ]
      },
      bug: [
        { log: 'Save takes the mutex. The goroutine now owns it.', code: 1, hl: { nodes: { g: 'on', mu: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'mutex owner', v: 'this goroutine', cls: 'ok' }] },
        { log: 'Save calls Count, which tries to lock the same mutex. Go\'s sync.Mutex does not know the owner.', code: 2, hl: { nodes: { cnt: 'warn' }, edges: { e2: 'bad' } }, stats: [{ l: 'Lock calls on the same mutex', v: '2', cls: 'warn' }] },
        { log: 'The goroutine waits for a lock that only it can release. It waits for ever.', code: 4, hl: { nodes: { g: 'bad' } }, stats: [{ l: 'state', v: 'blocked for ever', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Save takes the lock and defers the unlock. It calls the internal count, which does not lock.', code: 1, hl: { nodes: { g: 'ok', mu: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'Lock calls', v: '1', cls: 'ok' }] },
        { log: 'The helper runs inside the lock the caller already holds. Save returns and the lock is released.', code: 2, hl: { nodes: { cnt: 'ok' }, edges: { e2: 'dim' } }, stats: [{ l: 'state', v: 'finishes', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Concurrency without shared data',
  problem: `A bank runs each account as an actor with a private balance and a mailbox. A transfer is two messages: debit A, then credit B. Under load the network drops the second message, so A is debited, B is never credited, and $10 disappears (illustrative). No thread crashed and no error was logged.`,
  predict: {
    q: `A transfer sends "debit 10" to account A and then "credit 10" to account B as two messages. The second message is lost. What keeps the money from vanishing?`,
    opts: [
      `Nothing in the messages themselves; the actor model guarantees delivery`,
      `A lock across both accounts, which the network cannot break`,
      `A pending record that A keeps until B confirms, plus a transfer ID that B uses to ignore duplicates`,
      `Sending the credit first, so a lost message can only add money`
    ],
    ans: 2,
    why: `Actors remove races inside one account, but a transfer spans two accounts, and no single lock covers both. A pending record lets the transfer be retried after a lost message, and the transfer ID stops a retry from crediting twice.`
  },
  explain: `<h3>The idea</h3>
<p>An <b>actor</b> keeps private state and a <b>mailbox</b>, and handles one message at a time. Because nothing else touches its state, an actor needs no locks. Go's channels, Erlang processes and Akka actors all work this way, with "share memory by communicating".</p>
<h3>How it works, step by step</h3>
<p>Work that spans two actors is different. No single lock covers both accounts, so the transfer must survive a message that is lost between its two steps. The first step is a <b>pending</b> record: A does not forget the debit until B has confirmed the credit.</p>
<p>The second step is an ID. Every transfer gets one. B remembers which IDs it has already applied, so a retried message does not add the money twice. Retrying with the same ID is safe. This is the same idea as an idempotent request.</p>
<p>Two more rules keep actors healthy. A mailbox should be bounded, so the sender feels overload instead of the queue growing. And a message that carries a reference still shares the memory behind it, so send copies or hand over ownership and never touch the object after the send.</p>
<h3>The trade-off</h3>
<p>Actors avoid shared-memory races and make failure explicit, but every cross-actor operation becomes a protocol with retries, timeouts and states. Never block inside a handler to wait for a reply. Send the request, and handle the reply as another message, otherwise two actors waiting on each other freeze. Start with the simplest protocol that survives one lost message, and add states only when a test shows you need them.</p>`,
  diagnose: [
    {
      t: 'A goroutine blocked on a channel nobody reads',
      sym: 'Thousands of goroutines pile up, and <code>runtime.NumGoroutine()</code> keeps growing.',
      ctx: 'A goroutine sends its reply on a channel after the caller has timed out and gone away. The send blocks for ever.',
      why: 'A send waits for a receiver, and the receiver has left.',
      fix: [
        'Measure first: watch <code>runtime.NumGoroutine()</code> over time, and take a goroutine dump to see where the sends block.',
        'Use a buffered reply channel of size 1, or <code>select</code> on <code>ctx.Done()</code> so the sender can give up.',
        'Make the sender give up after the caller\'s timeout, and count the abandoned replies.',
        'Verify: the goroutine count stays flat when callers time out.'
      ]
    },
    {
      t: 'An unbounded mailbox hides overload',
      sym: 'An actor that receives faster than it handles grows its memory until the JVM runs out of heap.',
      ctx: 'Akka\'s default mailbox is unbounded.',
      why: 'An asynchronous send never waits, so the sender never feels the overload.',
      fix: [
        'Measure first: alert on mailbox length per actor, not only on errors.',
        'Use a bounded mailbox with a rejection policy, or add back-pressure, where the sender waits for a credit or an ack.',
        'Set a timeout on messages that wait in the mailbox too long.',
        'Verify: under peak load the mailbox length stays under its bound.'
      ]
    },
    {
      t: 'Sharing again through a pointer',
      sym: 'Two goroutines touch the same object after a send, and the race detector reports a data race on it.',
      ctx: 'In Go, sending a pointer or a slice through a channel and then using it on both sides is the same data race you were trying to avoid.',
      why: 'A message that carries a reference still shares the memory behind it.',
      fix: [
        'Measure first: run <code>go test -race</code> on the code that sends and receives the messages.',
        'Send copies or immutable values, or hand over ownership and never touch the object after the send.',
        'Review every channel that carries a pointer, slice or map.',
        'Verify: the race detector is clean on the same test.'
      ]
    },
    {
      t: 'Two actors waiting for each other',
      sym: 'Both mailboxes stop moving. Each actor is waiting for a reply that sits behind the other actor\'s frozen handler.',
      ctx: 'Actor A calls <code>ask</code> on B and waits for the reply, while B does the same to A.',
      why: 'Waiting for a reply inside a handler freezes the actor, so the reply sits behind the other actor\'s frozen handler.',
      fix: [
        'Measure first: find every <code>ask</code> call made inside a message handler.',
        'Do not block inside a handler. Send the request, and handle the reply as another message.',
        'Put a timeout on any remaining ask, so a stall becomes an error.',
        'Verify: the same request pattern completes with both actors running.'
      ]
    }
  ],
  source: { label: 'Original: Concurrency without shared data', href: '01-concurrency-end-to-end.html#ch8' },
  scenarios: [
    {
      id: 'transfer',
      label: 'Lost credit message',
      desc: 'A debit is kept as pending until the credit is confirmed, so a lost message can be retried safely (illustrative numbers).',
      codeLabel: 'Code',
      code: {
        bug: [
          'A.balance -= 10                  # debit applied at once',
          'send(B, "credit 10")             # message lost on the network',
          '# no pending record, nothing to retry',
          '# $10 is gone'
        ],
        fix: [
          'pending[txid] = ("debit", 10)    # A keeps the debit as pending',
          'send(B, ("credit", 10, txid))    # B applies it at most once',
          'on ack(txid): del pending[txid]  # retry until ack arrives'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'a', x: 10, y: 100, w: 160, h: 80, t: 'Actor A', s: 'balance 100 to 90' },
          { id: 'net', x: 240, y: 100, w: 160, h: 80, t: 'Network', s: 'drops 2nd message' },
          { id: 'b', x: 470, y: 100, w: 160, h: 80, t: 'Actor B', s: 'never credited' }
        ],
        edges: [
          { id: 'e1', a: 'a', b: 'net', label: 'credit 10' },
          { id: 'e2', a: 'net', b: 'b', label: 'lost' }
        ]
      },
      bug: [
        { log: 'Actor A applies the debit at once. Its balance drops from 100 to 90 (illustrative).', code: 0, hl: { nodes: { a: 'on' } }, stats: [{ l: 'A balance', v: '90', cls: 'warn' }] },
        { log: 'A sends the credit message to B. The network drops it.', code: 1, hl: { nodes: { net: 'bad' }, edges: { e1: 'on', e2: 'bad' } }, stats: [{ l: 'credit delivered', v: 'no', cls: 'bad' }] },
        { log: 'Nothing remembers that the credit is missing, so A never retries.', code: 2, hl: { nodes: { a: 'warn' } }, stats: [{ l: 'pending records', v: '0', cls: 'bad' }] },
        { log: 'B is never credited. The $10 is gone, and no thread crashed.', code: 3, hl: { nodes: { b: 'bad' } }, stats: [{ l: 'total money', v: '-10', cls: 'bad' }] }
      ],
      fix: [
        { log: 'A keeps the debit in a pending record until B confirms, so the transfer can be finished later.', code: 0, hl: { nodes: { a: 'ok' } }, stats: [{ l: 'pending records', v: '1', cls: 'ok' }] },
        { log: 'The credit carries a transaction ID. B applies it at most once, and ignores retries of the same ID.', code: 1, hl: { nodes: { b: 'ok' }, edges: { e2: 'warn' } }, stats: [{ l: 'applied at most once', v: 'yes', cls: 'ok' }] },
        { log: 'A retries until the ack arrives, then deletes the pending record. The total stays at 100.', code: 2, hl: { nodes: { net: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'total money', v: '100', cls: 'ok' }] }
      ]
    },
    {
      id: 'ask',
      label: 'Two asks, frozen',
      desc: 'Each actor blocks on an ask inside its handler, so neither mailbox moves (illustrative).',
      codeLabel: 'Code',
      code: {
        bug: [
          'on Ping(from):',
          '    reply = ask(B, Pong)     # blocks this handler',
          '# B does the same: ask(A, Pong)',
          '# each reply waits behind the other frozen handler'
        ],
        fix: [
          'on Ping(from):',
          '    send(B, Pong)            # do not wait',
          'on Pong(reply):',
          '    handle(reply)            # the reply is just another message'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'a', x: 10, y: 100, w: 170, h: 80, t: 'Actor A', s: 'blocked in ask' },
          { id: 'b', x: 460, y: 100, w: 170, h: 80, t: 'Actor B', s: 'blocked in ask' },
          { id: 'ma', x: 230, y: 20, w: 170, h: 60, t: 'Mailbox A', s: 'reply waits here' },
          { id: 'mb', x: 230, y: 200, w: 170, h: 60, t: 'Mailbox B', s: 'reply waits here' }
        ],
        edges: [
          { id: 'e1', a: 'a', b: 'mb', label: 'ask' },
          { id: 'e2', a: 'b', b: 'ma', label: 'ask' }
        ]
      },
      bug: [
        { log: 'Actor A sends a question to B, and its handler blocks while it waits for the reply.', code: 1, hl: { nodes: { a: 'warn' }, edges: { e1: 'warn' } }, stats: [{ l: 'A handler', v: 'blocked', cls: 'warn' }] },
        { log: 'Actor B does the same to A. Both handlers are now frozen.', code: 2, hl: { nodes: { b: 'bad', a: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'handlers running', v: '0', cls: 'bad' }] },
        { log: 'Each reply sits in a mailbox behind the frozen handler, so it can never be read. Both mailboxes stop moving.', code: 3, hl: { nodes: { ma: 'bad', mb: 'bad' } }, stats: [{ l: 'replies read', v: '0', cls: 'bad' }] }
      ],
      fix: [
        { log: 'A sends the question and returns at once. Its handler is free for other messages.', code: 1, hl: { nodes: { a: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'A handler', v: 'free', cls: 'ok' }] },
        { log: 'The answer arrives as a new message, and A handles it in its own handler.', code: 3, hl: { nodes: { ma: 'ok', mb: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'replies read', v: 'as messages', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Transactions & isolation',
  problem: `At month end a report sums all balances while transfers keep running. A transfer debits account A, and credits account B a moment later. The report reads A after the debit and B before the credit, so the total is $10 short (illustrative). Every single read and write was correct.`,
  predict: {
    q: `A report reads account A after a transfer debited it, and reads account B before the transfer credited it. Each read was correct. What is missing?`,
    opts: [
      `A faster disk, so the transfer finishes before the report reads`,
      `A larger connection pool, so the report and the transfer run on separate connections`,
      `Retrying the report after each single read`,
      `Isolation, so the report sees the transfer either fully done or not started at all`
    ],
    ans: 3,
    why: `A transaction groups reads and writes so they look like one step. Isolation decides what other transactions may see while it runs. Without it, the report can see the two halves of one transfer.`
  },
  explain: `<h3>The idea</h3>
<p>A <b>transaction</b> is a group of reads and writes that should look like one step. <b>Isolation</b> decides what other transactions may see of it while it is running. Two operations <b>conflict</b> if they touch the same item and at least one of them writes.</p>
<h3>How it works, step by step</h3>
<p>A schedule is <b>serialisable</b> if its result equals some one-after-another order of the transactions. <b>Two-phase locking (2PL)</b> reaches that by working in two phases. First a transaction takes the locks it needs. Then it releases none of them until it commits. In the report example, the transfer holds its locks on A and B, so the report has to wait and sees both halves or neither.</p>
<p>Weaker levels run faster. Snapshot isolation (<code>REPEATABLE READ</code> in PostgreSQL) gives each transaction a consistent snapshot, but it allows some anomalies, such as write skew. <code>SERIALIZABLE</code> prevents them, and it aborts one transaction when the order cannot be kept. Optimistic and timestamp methods reach the same goal without waiting: they run the transactions, then abort and retry any one that would break the order.</p>
<h3>The trade-off</h3>
<p>Locks make readers wait for writers, and writers wait for readers. Stronger isolation costs throughput and can cause aborts that the application must retry. Keep transactions short, and pick the weakest isolation that is safe for each rule, instead of turning the strongest level on everywhere. A useful first step is to find the rules that read several rows before they write, because that is where skew hides.</p>`,
  diagnose: [
    {
      t: 'Write skew under snapshot isolation',
      sym: 'Two rules that each look fine alone break together: both doctors are off call at the same time.',
      ctx: 'Two doctors each check "at least one doctor is on call", see two, and both go off call. PostgreSQL\'s <code>REPEATABLE READ</code> (snapshot isolation) allows this; <code>SERIALIZABLE</code> aborts one of them.',
      why: 'Both transactions read the same snapshot and write different rows, so neither sees a conflict.',
      fix: [
        'Measure first: list every rule that reads several rows and then writes one of them.',
        'Use <code>SERIALIZABLE</code> for rules like this, or make both transactions write one shared row so they collide.',
        'Retry the transaction when the database aborts it.',
        'Verify: a test where two doctors go off call together leaves one on call.'
      ]
    },
    {
      t: 'Check then insert without a unique constraint',
      sym: 'Two requests both pass the check and both write, so the same seat is booked twice.',
      ctx: '"If no booking exists for this seat, insert one" in application code. The same happens with "if balance &gt;= amount, subtract".',
      why: 'The check and the write are two steps, and nothing ties them together in the database.',
      fix: [
        'Measure first: look for a select followed by an insert or update on the same key in the application code.',
        'Let the database enforce it with a unique constraint, or with a conditional update such as <code>UPDATE ... WHERE balance &gt;= ?</code>.',
        'Handle the constraint error as a normal "already taken" answer.',
        'Verify: two concurrent bookings for one seat produce one success and one error.'
      ]
    },
    {
      t: 'Serialization failures need a retry',
      sym: 'Random 500 errors appear under load, and retrying immediately makes the load worse.',
      ctx: 'PostgreSQL error 40001 (<code>could not serialize access</code>) is normal at high isolation. Applications that do not retry show random 500 errors.',
      why: 'The database aborts a transaction to keep the order safe, so the application must run it again.',
      fix: [
        'Measure first: count error 40001 in the logs, by endpoint.',
        'Retry the whole transaction, not one statement, with a short random back-off and a limited number of attempts.',
        'Keep the transaction short, so there is less to conflict with.',
        'Verify: the 500 rate falls, and retries stay under the limit.'
      ]
    },
    {
      t: 'Long transactions hold locks',
      sym: 'Writers queue up behind one open transaction, and old row versions pile up.',
      ctx: 'A transaction left open while it calls an external API, or an ORM session that spans a whole web request, blocks writers. In PostgreSQL it also stops vacuum from cleaning old row versions.',
      why: 'Locks and old snapshots stay alive until commit.',
      fix: [
        'Measure first: find the transactions that have been open the longest.',
        'Keep transactions short: make the network call first, then open the transaction, write, and commit.',
        'Stop holding a transaction across a web request or an external call.',
        'Verify: the longest open transaction stays under a few seconds.'
      ]
    }
  ],
  source: { label: 'Original: Transactions & isolation', href: '01-concurrency-end-to-end.html#ch9' },
  scenarios: [
    {
      id: 'report',
      label: 'Half-done transfer',
      desc: 'Without isolation, the report reads A after the debit and B before the credit; with 2PL it waits (illustrative numbers).',
      codeLabel: 'Query',
      code: {
        bug: [
          'UPDATE accounts SET balance = balance - 10 WHERE id = A;',
          'SELECT SUM(balance) FROM accounts;      -- report reads A after debit',
          'UPDATE accounts SET balance = balance + 10 WHERE id = B;',
          '-- report total is $10 short'
        ],
        fix: [
          'BEGIN;   -- transfer takes locks on A and B',
          'UPDATE accounts SET balance = balance - 10 WHERE id = A;',
          'UPDATE accounts SET balance = balance + 10 WHERE id = B;',
          'COMMIT;  -- locks released; the report now reads both halves'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'tr', x: 10, y: 30, w: 170, h: 70, t: 'Transfer', s: 'debit A, credit B' },
          { id: 'rp', x: 10, y: 180, w: 170, h: 70, t: 'Report', s: 'sums all balances' },
          { id: 'a', x: 260, y: 30, w: 160, h: 70, t: 'Account A', s: 'balance 90 (debited)' },
          { id: 'b', x: 260, y: 180, w: 160, h: 70, t: 'Account B', s: 'balance 100 (not yet)' },
          { id: 'tot', x: 470, y: 105, w: 160, h: 80, t: 'Total', s: 'sum seen by report' }
        ],
        edges: [
          { id: 'e1', a: 'tr', b: 'a', label: 'debit' },
          { id: 'e2', a: 'rp', b: 'a', label: 'reads 90' },
          { id: 'e3', a: 'rp', b: 'b', label: 'reads 100' },
          { id: 'e4', a: 'b', b: 'tot', label: 'sum' }
        ]
      },
      bug: [
        { log: 'The transfer debits account A from 100 to 90 (illustrative). Account B is not yet credited.', code: 0, hl: { nodes: { tr: 'on', a: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'A', v: '90', cls: 'warn' }] },
        { log: 'The report reads A now, and gets 90. It then goes on to read B.', code: 1, hl: { nodes: { rp: 'on' }, edges: { e2: 'on' } }, stats: [{ l: 'report read of A', v: '90', cls: 'warn' }] },
        { log: 'The transfer credits B only after the report has read it. The report reads B as 100, before the credit.', code: 2, hl: { nodes: { b: 'warn' }, edges: { e3: 'warn' } }, stats: [{ l: 'report read of B', v: '100', cls: 'warn' }] },
        { log: 'The report sums 90 and 100, so the total is $10 short (illustrative). Each read was correct, but the report saw half of a transfer.', code: 3, hl: { nodes: { tot: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'total', v: '$10 short', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The transfer takes locks on A and B, and holds them until it commits.', code: 1, hl: { nodes: { tr: 'ok', a: 'ok', b: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'locks held until commit', v: 'A and B', cls: 'ok' }] },
        { log: 'The report needs to read A and B, so it waits for the transfer locks. It cannot see half the transfer.', code: 1, hl: { nodes: { rp: 'warn' }, edges: { e2: 'dim', e3: 'dim' } }, stats: [{ l: 'report', v: 'waits', cls: 'warn' }] },
        { log: 'The transfer commits and releases the locks. The report reads both accounts after the full transfer.', code: 3, hl: { nodes: { tot: 'ok', rp: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'total', v: 'correct', cls: 'ok' }] }
      ]
    },
    {
      id: 'skew',
      label: 'Write skew',
      desc: 'Each doctor checks that another is on call, then leaves; under snapshot isolation both succeed (illustrative).',
      codeLabel: 'Query',
      code: {
        bug: [
          'BEGIN ISOLATION LEVEL REPEATABLE READ;',
          'SELECT COUNT(*) FROM doctors WHERE on_call;   -- sees 2',
          'UPDATE doctors SET on_call = false WHERE name = $me;',
          'COMMIT;   -- both commit: nobody is on call'
        ],
        fix: [
          'BEGIN ISOLATION LEVEL SERIALIZABLE;',
          'SELECT COUNT(*) FROM doctors WHERE on_call;   -- sees 2',
          'UPDATE doctors SET on_call = false WHERE name = $me;',
          'COMMIT;   -- one commit fails with 40001 and must retry'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 't1', x: 10, y: 30, w: 170, h: 70, t: 'Doctor 1 txn', s: 'sees 2 on call' },
          { id: 't2', x: 10, y: 180, w: 170, h: 70, t: 'Doctor 2 txn', s: 'sees 2 on call' },
          { id: 'r1', x: 260, y: 30, w: 170, h: 70, t: 'Row: doctor 1', s: 'writes on_call = false' },
          { id: 'r2', x: 260, y: 180, w: 170, h: 70, t: 'Row: doctor 2', s: 'writes on_call = false' },
          { id: 'chk', x: 470, y: 105, w: 160, h: 80, t: 'Rule', s: 'at least one on call' }
        ],
        edges: [
          { id: 'e1', a: 't1', b: 'r1', label: 'writes' },
          { id: 'e2', a: 't2', b: 'r2', label: 'writes' },
          { id: 'e3', a: 'r2', b: 'chk', label: 'rule broken' }
        ]
      },
      bug: [
        { log: 'Both doctors start a transaction on the same snapshot. Each sees two doctors on call.', code: 1, hl: { nodes: { t1: 'on', t2: 'on' } }, stats: [{ l: 'on call seen', v: '2', cls: 'ok' }] },
        { log: 'Each transaction writes a different row. Neither one touches the row the other read.', code: 2, hl: { nodes: { r1: 'warn', r2: 'warn' } }, stats: [{ l: 'write conflict seen', v: 'no', cls: 'warn' }] },
        { log: 'Both commit. The rule "at least one doctor on call" is now broken, with nobody on call.', code: 3, hl: { nodes: { chk: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'on call', v: '0', cls: 'bad' }] }
      ],
      fix: [
        { log: 'SERIALIZABLE tracks what each transaction read. It sees that the two transactions depend on each other.', code: 0, hl: { nodes: { t1: 'ok', t2: 'ok' } }, stats: [{ l: 'isolation', v: 'SERIALIZABLE', cls: 'ok' }] },
        { log: 'One transaction is aborted with error 40001. The application retries it, and it now sees one doctor on call.', code: 3, hl: { nodes: { t2: 'bad', r2: 'warn' }, edges: { e2: 'warn' } }, stats: [{ l: 'aborted', v: '1 (retry)', cls: 'warn' }] },
        { log: 'The rule holds: one doctor stays on call.', code: 3, hl: { nodes: { chk: 'ok' } }, stats: [{ l: 'on call', v: '1', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Crash recovery & lock-free code',
  problem: `A transfer changes account A on disk, and then the machine loses power before account B is changed. After reboot, A has lost $10 and B never received it (illustrative). The disk holds a state that nobody ever chose, and no error was reported.`,
  predict: {
    q: `The power fails after A is written on disk but before B is. The service restarts. What should the database do with the transfer?`,
    opts: [
      `Keep the half-written state, because A is already on disk`,
      `Read the write-ahead log: if the COMMIT record exists, redo the transfer; if not, undo whatever reached the data`,
      `Ask the user to re-enter the transfer, because the log cannot help`,
      `Copy the last full backup over both accounts`
    ],
    ans: 1,
    why: `The log is written before the data, and holds enough to finish or undo the transfer. Recovery reads the log, so the transfer ends up done fully or not at all.`
  },
  explain: `<h3>The idea</h3>
<p><b>Write-ahead logging (WAL)</b> is the rule that before a data page changes, a record of the change is appended to a log and flushed to disk. When the transaction is complete, a <code>COMMIT</code> record is appended and flushed again. The data pages can be written later, in any order, because the log holds everything needed to finish or undo the work.</p>
<h3>How it works, step by step</h3>
<p><b>Recovery</b> reads the log after a crash. If the <code>COMMIT</code> is there, it redoes the changes. If it is not, it undoes whatever reached the data pages. Either way the transfer ends up done fully or not at all. This only works if the disk really persists the flush (<code>fsync</code>). If the disk lies about it, no algorithm can save the data.</p>
<p>Two more hazards follow. A failed <code>fsync</code> must be treated as fatal, because a retry can report success while data is already lost. And a page of 8 KB can reach the disk in pieces, so PostgreSQL writes full page images to the WAL after a checkpoint (<code>full_page_writes</code>).</p>
<p><b>Lock-free code</b> uses <b>compare-and-swap</b>: change a value only if it still holds the value you read, and retry otherwise. No thread blocks, but under heavy contention many CAS calls fail. A value that goes from A to B and back to A also looks unchanged to CAS, which is the ABA problem.</p>
<h3>The trade-off</h3>
<p>WAL costs a flush per commit. Lock-free structures avoid blocking, but they are hard to write correctly. Use the platform's locks and proven concurrent containers unless you have measured a real need, and prefer striped counters such as <code>LongAdder</code> for hot counters.</p>`,
  diagnose: [
    {
      t: 'A flush that failed and was retried',
      sym: 'After a failed flush, a later retry reports success, but some data never reached the disk.',
      ctx: 'In 2018 PostgreSQL\'s "fsyncgate" showed that after a failed <code>fsync</code>, a retry could report success while the data was already lost. Some file systems also lose a file that was written and renamed without an <code>fsync</code>.',
      why: 'A successful <code>fsync</code> is the only proof that data is on disk, and some failures do not show up as errors on a retry.',
      fix: [
        'Measure first: find every place where the code ignores or retries an <code>fsync</code> error.',
        'Treat a failed <code>fsync</code> as fatal and restart from the log.',
        'Call <code>fsync</code> on the file and on its directory when you rename.',
        'Verify: a crash test after a forced flush failure recovers the committed data.'
      ]
    },
    {
      t: 'Torn writes: half a page reached the disk',
      sym: 'After a power cut, a page is half new and half old, and its checksum no longer matches.',
      ctx: 'A database page of 8 KB is written as two 4 KB sectors, and the power fails between them. PostgreSQL writes full page images to the WAL after a checkpoint (<code>full_page_writes</code>), and MySQL uses a doublewrite buffer for the same reason.',
      why: 'The disk writes in smaller units than the database page, so a page can be half new and half old.',
      fix: [
        'Measure first: check that <code>full_page_writes</code> is on, and look for pages that fail their checksum after a crash.',
        'Log a full copy of the page once after each checkpoint, or write pages through a doublewrite area, so recovery has a clean copy.',
        'Verify: a power-cut test recovers every page to a consistent state.'
      ]
    },
    {
      t: 'ABA in lock-free structures',
      sym: 'A lock-free stack pop succeeds, but it links to a node that has already been reused, so the stack is corrupted.',
      ctx: 'A lock-free stack pop reads head = A and is delayed. Other threads pop A and B, then push A back. The CAS now succeeds, but A.next is stale. Java answers this with <code>AtomicStampedReference</code>.',
      why: 'CAS compares only the value. A value that went A to B and back to A looks unchanged.',
      fix: [
        'Measure first: stress-test the structure with many threads that pop and push the same nodes.',
        'Add a version stamp to the value and compare both, for example with <code>AtomicStampedReference</code>.',
        'Or use safe memory reclamation, so a freed node cannot be reused while a thread still holds it.',
        'Verify: the stress test keeps every node reachable exactly once.'
      ]
    },
    {
      t: 'CAS retry storms under contention',
      sym: 'A hot counter uses most of the CPU, and most of its atomic operations fail and retry.',
      ctx: 'Java <code>AtomicLong.incrementAndGet()</code> from 64 threads spends most of its time on failed CASes. <code>LongAdder</code>, which spreads the count over several cells, is much faster for counters.',
      why: 'Lock-free does not mean wait-free. Under heavy contention many CASes fail, and every failure costs a retry.',
      fix: [
        'Measure first: count CAS retries or compare throughput at 1 and 64 threads.',
        'For hot counters, use striped counters (<code>LongAdder</code>) and read the total only when you need it.',
        'Keep lock-free loops short, and back off when a CAS fails repeatedly.',
        'Verify: throughput at 64 threads rises with the striped counter.'
      ]
    }
  ],
  source: { label: 'Original: Crash recovery & lock-free code', href: '01-concurrency-end-to-end.html#ch10' },
  scenarios: [
    {
      id: 'wal',
      label: 'Power cut mid-transfer',
      desc: 'Writing the data before the log loses money on a crash; logging first lets recovery finish or undo the transfer (illustrative).',
      codeLabel: 'Code',
      code: {
        bug: [
          'write_page(A, balance - 10)     # data written first',
          '# power fails here: B not written, no log',
          'write_page(B, balance + 10)     # never runs',
          '# after reboot: A is -10, B unchanged'
        ],
        fix: [
          'append_log(BEGIN, A -10, B +10) # log first, flushed to disk',
          'write_page(A, balance - 10)     # data may be written later',
          'append_log(COMMIT); fsync(log)  # commit is durable',
          '# recovery: COMMIT found -> redo; else undo'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'tx', x: 10, y: 100, w: 150, h: 80, t: 'Transfer', s: 'A -10, B +10' },
          { id: 'pg', x: 230, y: 30, w: 170, h: 70, t: 'Data pages', s: 'A and B on disk' },
          { id: 'wal', x: 230, y: 180, w: 170, h: 70, t: 'Write-ahead log', s: 'records before data' },
          { id: 'rec', x: 470, y: 100, w: 160, h: 80, t: 'Recovery', s: 'reads the log' }
        ],
        edges: [
          { id: 'e1', a: 'tx', b: 'pg', label: 'write A' },
          { id: 'e2', a: 'tx', b: 'wal', label: 'log first' },
          { id: 'e3', a: 'wal', b: 'rec', label: 'after reboot' }
        ]
      },
      bug: [
        { log: 'The transfer writes account A on disk first. A now holds the debited balance.', code: 0, hl: { nodes: { tx: 'on', pg: 'warn' }, edges: { e1: 'on' } }, stats: [{ l: 'A on disk', v: 'debited', cls: 'warn' }] },
        { log: 'Power fails before account B is written. There is no log record of the transfer.', code: 1, hl: { nodes: { pg: 'bad' }, edges: { e1: 'bad' } }, stats: [{ l: 'B on disk', v: 'not written', cls: 'bad' }] },
        { log: 'After reboot nothing knows the transfer was half done. The disk keeps the half that was written.', code: 3, hl: { nodes: { rec: 'bad' } }, stats: [{ l: 'money', v: '-10 (lost)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The transfer appends its intent to the write-ahead log and flushes it to disk before touching any page.', code: 0, hl: { nodes: { tx: 'ok', wal: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'log flushed first', v: 'yes', cls: 'ok' }] },
        { log: 'Power fails in the middle. The log holds the transfer, and no COMMIT record was written.', code: 2, hl: { nodes: { pg: 'warn' }, edges: { e1: 'dim' } }, stats: [{ l: 'COMMIT record', v: 'absent', cls: 'warn' }] },
        { log: 'Recovery reads the log and undoes the half-written change. The transfer ends fully undone, with no money lost.', code: 3, hl: { nodes: { rec: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'money', v: 'no loss', cls: 'ok' }] }
      ]
    },
    {
      id: 'aba',
      label: 'Stack ABA',
      desc: 'A delayed CAS succeeds because the head is A again, but A.next is stale (illustrative).',
      codeLabel: 'Code',
      code: {
        bug: [
          'old = head.load()        # reads A; delayed',
          '# others: pop A, pop B, push A back',
          'CAS(head, old=A, new=old.next)   # succeeds: head is A again',
          '# old.next was B, now stale: B is lost'
        ],
        fix: [
          'old = head.load()                  # value + stamp',
          '# others change the stamp each time: A -> B -> A has stamp 2',
          'CAS(head, (A,1), (old.next, 2))    # fails: stamp differs',
          '# the thread reads again and retries'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'hd', x: 10, y: 100, w: 150, h: 80, t: 'head', s: 'points to A' },
          { id: 'a', x: 230, y: 30, w: 160, h: 70, t: 'Node A', s: 'next = B (old)' },
          { id: 'b', x: 230, y: 180, w: 160, h: 70, t: 'Node B', s: 'popped by others' },
          { id: 'cas', x: 470, y: 100, w: 160, h: 80, t: 'CAS', s: 'compares value only' }
        ],
        edges: [
          { id: 'e1', a: 'hd', b: 'a', label: 'reads A' },
          { id: 'e2', a: 'a', b: 'b', label: 'next' },
          { id: 'e3', a: 'cas', b: 'hd', label: 'expects A' }
        ]
      },
      bug: [
        { log: 'Thread 1 reads head = A and A.next = B, then is delayed by the scheduler.', code: 0, hl: { nodes: { hd: 'on', a: 'on' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'head read', v: 'A', cls: 'ok' }] },
        { log: 'Other threads pop A, pop B, and then push A back. The head is A again.', code: 1, hl: { nodes: { b: 'warn' }, edges: { e2: 'warn' } }, stats: [{ l: 'head', v: 'A (again)', cls: 'warn' }] },
        { log: 'Thread 1 resumes. Its CAS compares only the value, sees A, and succeeds.', code: 2, hl: { nodes: { cas: 'bad' }, edges: { e3: 'bad' } }, stats: [{ l: 'CAS', v: 'succeeds', cls: 'bad' }] },
        { log: 'The head now points to B, which is already gone. The stack is corrupted.', code: 3, hl: { nodes: { b: 'bad' } }, stats: [{ l: 'stack', v: 'corrupted', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Each change to the head also changes a version stamp, so A-B-A has a different stamp.', code: 1, hl: { nodes: { hd: 'ok' } }, stats: [{ l: 'stamp', v: 'changed to 2', cls: 'ok' }] },
        { log: 'The CAS compares the value and the stamp. The stamp differs, so the CAS fails.', code: 2, hl: { nodes: { cas: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'CAS', v: 'fails', cls: 'ok' }] },
        { log: 'The thread reads the head again and retries. No node is lost.', code: 3, hl: { nodes: { hd: 'ok' } }, stats: [{ l: 'stack', v: 'intact', cls: 'ok' }] }
      ]
    }
  ]
},
  ]
};
