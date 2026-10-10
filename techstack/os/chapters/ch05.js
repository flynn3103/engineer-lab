/* Chapter 5 "Files: VFS and the Page Cache": two scenes in two forms:
   a directory tree walked by a path lookup, and a grid of file pages filling through readahead. Numbers illustrative. */
(function () {
  const D = window.OSD;

  /* ---------- 1. Path lookup: dentries are cached, a miss reads the directory from disk ---------- */
  const NW = 96, NH = 32;
  const T = {
    '/': [24, 190, null], etc: [176, 110, '/'], var: [176, 190, '/'], usr: [176, 270, '/'],
    lib: [328, 130, 'var'], log: [328, 200, 'var'], tmp: [328, 270, 'var'],
    'app.log': [480, 168, 'log'], 'sys.log': [480, 232, 'log']
  };
  const PATH = ['/', 'var', 'log', 'app.log'];
  const lookup = {
    id: 'lookup', label: 'Path lookup', desc: 'open() turns a path into an inode one component at a time. The dentry cache answers from memory; a miss reads the directory block from disk (illustrative).',
    codeLabel: 'C', code: { bug: ['int fd = open("/var/log/app.log", O_RDONLY);', '// walk: "/" → "var" → "log" → "app.log"', '// each step: dentry cache hit, or read the directory from disk', 'int fd2 = open("/var/log/app.log", O_RDONLY);   // again'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one mount; real paths also cross mounts and symlinks.',
      header: s => ({ left: 'open("/var/log/app.log")', right: s.r || '' }),
      setup(kit) { return { L: D.init(kit, 'vfs') }; },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        Object.entries(T).forEach(([k, [x, y, par]]) => {
          if (par) { const [px, py] = T[par]; D.line(L, px + NW, py + NH / 2, x, y + NH / 2, { tone: PATH.includes(k) && PATH.includes(par) && PATH.indexOf(k) <= s.at ? 'acc' : 'mut', thin: !(PATH.includes(k) && PATH.indexOf(k) <= s.at) }); }
        });
        Object.entries(T).forEach(([k, [x, y]]) => {
          const pi = PATH.indexOf(k), on = pi >= 0 && pi <= s.at, cur = pi === s.at, tag = on ? (s.tags || {})[k] : null;
          D.cell(L, x, y, NW, NH, k, cur ? (tag === 'miss' ? 'bad' : 'acc') : on ? 'ok' : 'mut', { hot: cur, b: on });
          if (tag) D.text(L, x + NW / 2, y + NH + 13, tag === 'hit' ? 'dentry hit · ~100 ns' : tag === 'miss' ? 'MISS: read directory · ~ms' : 'root', { a: 'middle', xs: 1, tone: tag === 'miss' ? 'bad' : 'ok' });
        });
        if (s.fd) D.cell(L, 328, 336, 288, 34, s.fd, 'info', { b: 1 });
        D.text(L, 24, 354, s.cost || '', { s: 1, tone: s.bad ? 'bad' : 'ok' });
      }
    },
    bug: [
      { log: 'A process calls open("/var/log/app.log"). The kernel starts at the root directory entry, which is always cached, and resolves one name at a time.', callout: 'Start at the root dentry', code: 1, state: { at: 0, tags: { '/': 'root' }, r: 'resolving', cost: 'cost so far: 0 disk reads' }, stats: [{ l: 'disk reads', v: '0', cls: 'ok' }] },
      { log: 'Look up “var” in “/”. The dentry cache is a hash table of names to entries, so a hit costs about one memory access and no file system code runs.', callout: '“var”: dentry cache hit', code: 2, state: { at: 1, tags: { '/': 'root', var: 'hit' }, r: 'hit', cost: 'cost so far: 0 disk reads' }, stats: [{ l: 'disk reads', v: '0', cls: 'ok' }] },
      { log: '“log” in “var” is also cached because other processes used it recently.', callout: '“log”: dentry cache hit', code: 2, state: { at: 2, tags: { '/': 'root', var: 'hit', log: 'hit' }, r: 'hit', cost: 'cost so far: 0 disk reads' }, stats: [{ l: 'disk reads', v: '0', cls: 'ok' }] },
      { log: '“app.log” is not in the cache: the file was created after boot and nobody has opened it. The file system reads the /var/log directory block from disk to find the inode number. This is the slow path.', callout: '“app.log”: MISS, read the directory from disk', moment: true, code: 2, state: { at: 3, tags: { '/': 'root', var: 'hit', log: 'hit', 'app.log': 'miss' }, r: 'miss', bad: true, cost: 'cost so far: 1 disk read (~ms)' }, stats: [{ l: 'disk reads', v: '1', cls: 'bad' }] },
      { log: 'The kernel loads the inode, caches both the dentry and the inode, checks permissions, and returns file descriptor 3, an index into this process’s open-file table.', callout: 'Inode loaded, fd = 3', code: 0, state: { at: 3, tags: { '/': 'root', var: 'hit', log: 'hit', 'app.log': 'hit' }, r: 'opened', fd: 'fd 3 → struct file → inode', cost: 'cost: 1 disk read, now cached' }, stats: [{ l: 'fd', v: '3' }] },
      { log: 'A second open of the same path finds every component in the cache: no disk read, no directory parsing.', callout: 'Second open: all hits', code: 3, state: { at: 3, tags: { '/': 'root', var: 'hit', log: 'hit', 'app.log': 'hit' }, r: 'second open', fd: 'fd 4 → same inode', cost: 'cost: 0 disk reads' }, stats: [{ l: 'disk reads', v: '0', cls: 'ok' }],
        takeaway: 'Names are resolved by the dentry cache; the file system is asked only on a miss.' }
    ]
  };

  /* ---------- 2. Reading a file: a grid of pages fills through readahead ---------- */
  const GX = i => 24 + (i % 8) * 74, GY = i => 112 + Math.floor(i / 8) * 64;
  const GRID = (st, cur) => st.map((v, i) => ({ v, cur: i === cur }));
  const A = 'none', C = 'ok', I = 'warn';
  const READ = {
    id: 'readahead', label: 'Cache fill and readahead', desc: 'A file is cached in 4 KB pages. A sequential read triggers readahead, so most reads find their page already in memory (window sizes scaled down for the picture).',
    codeLabel: 'Shell', code: { bug: ['$ time cat /var/log/app.log > /dev/null     # cold: pages come from disk', '$ time cat /var/log/app.log > /dev/null     # warm: pages come from the page cache', '$ cat /sys/block/sda/queue/read_ahead_kb   # default 128', '$ vmtouch /var/log/app.log                 # shows how much is cached'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: 16 pages, window 4 then 8 (real default 128 KB).',
      header: s => ({ left: 'file pages (4 KB each)', right: s.r || '' }),
      setup(kit) { return { L: D.init(kit, 'pc') }; },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        GRID(s.g, s.cur).forEach((c, i) => {
          D.cell(L, GX(i), GY(i), 66, 42, 'p' + i, c.cur ? 'acc' : c.v, { sub: c.v === C ? 'cached' : c.v === I ? 'in flight' : 'disk only', hot: c.cur });
        });
        D.text(L, 24, 270, 'legend:', { xs: 1, m: 1 }); D.text(L, 78, 270, 'grey = on disk only', { xs: 1 }); D.text(L, 218, 270, 'yellow = I/O in flight', { xs: 1, tone: 'warn' }); D.text(L, 370, 270, 'green = in the page cache', { xs: 1, tone: 'ok' });
        D.text(L, 24, 300, s.lat || '', { s: 1, b: 1, tone: s.slow ? 'bad' : 'ok' });
      }
    },
    bug: [
      { log: 'A 16-page log file has just been created on disk, or the machine rebooted. Nothing from it is in the page cache.', callout: 'Cold cache: every page is on disk only', state: { g: Array(16).fill(A), r: 'cold' }, stats: [{ l: 'cached pages', v: '0' }] },
      { log: 'cat reads page 0. It misses, so the kernel starts I/O. It does not fetch one page: it sees a first sequential read and requests a window of 4 pages (readahead).', callout: 'Miss on p0: read p0–p3 together', moment: true, code: 0, state: { g: [I, I, I, I, ...Array(12).fill(A)], cur: 0, r: 'miss', lat: 'read p0: waits for the disk (~1 ms)', slow: true }, stats: [{ l: 'read latency', v: '~1 ms', cls: 'bad' }] },
      { log: 'The window arrives. The first read returns, and p1 to p3 are served from memory without waiting.', callout: 'p1–p3 hit the cache', code: 0, state: { g: [C, C, C, C, ...Array(12).fill(A)], cur: 3, r: 'hits', lat: 'read p1–p3: from RAM (~1 µs each)' }, stats: [{ l: 'read latency', v: '~1 µs', cls: 'ok' }] },
      { log: 'The kernel marked a page in the window. When the reader reaches it, the kernel starts the next, larger window (p4–p11) in the background, before the reader needs it.', callout: 'Async readahead of the next 8 pages', moment: true, code: 0, state: { g: [C, C, C, C, I, I, I, I, I, I, I, I, A, A, A, A], cur: 2, r: 'readahead', lat: 'the reader keeps going while p4–p11 load' }, stats: [{ l: 'window', v: '4 → 8', cls: 'warn' }] },
      { log: 'By the time the reader reaches p4, it has arrived. A sequential reader never waits for the disk after the first miss.', callout: 'The reader stays ahead of the disk', code: 0, state: { g: [C, C, C, C, C, C, C, C, C, C, C, C, I, I, I, I], cur: 8, r: 'streaming', lat: 'reads p4–p11: from RAM' }, stats: [{ l: 'misses so far', v: '1' }] },
      { log: 'The whole file is cached. The first pass cost one blocking miss; the rest was overlapped with reading.', callout: 'File fully cached', code: 0, state: { g: Array(16).fill(C), r: 'cached', lat: 'first pass done' }, stats: [{ l: 'cached pages', v: '16', cls: 'ok' }] },
      { log: 'Reading the file again hits the page cache for every page: no disk I/O at all. The cache stays until memory pressure evicts it (chapter 3), the file is deleted, or the machine reboots.', callout: 'Second pass: all hits', code: 1, state: { g: Array(16).fill(C), cur: 15, r: 'warm', lat: 'second pass: 16 hits, no disk' }, stats: [{ l: 'disk reads', v: '0', cls: 'ok' }, { l: 'speed-up', v: '~100×', cls: 'ok' }],
        takeaway: 'The page cache turns repeated reads into memory reads, and readahead hides the first read.' }
    ]
  };

  const EXPLAIN = `
<h3>1. One interface over many file systems</h3>
<p>Programs call <code>open</code>, <code>read</code>, <code>write</code> and <code>stat</code>. The <b>virtual file system (VFS)</b> turns those calls into operations on generic objects: a <b>dentry</b> (a name in a directory), an <b>inode</b> (the file’s metadata and where its data is), and a <b>file</b> (one open instance with its offset). ext4, XFS, tmpfs and NFS each implement the same operations underneath, which is why the same <code>cat</code> works on all of them.</p>
<h3>2. Names are resolved one component at a time</h3>
<p>To open <code>/var/log/app.log</code> the kernel looks up <code>var</code> in <code>/</code>, then <code>log</code> in <code>var</code>, then <code>app.log</code> in <code>log</code>. The <b>dentry cache</b> remembers the answers, including negative ones (“this name does not exist”). Only a miss reaches the file system, which reads the directory block from disk. The result is an inode, and <code>open</code> returns a small integer, the file descriptor, which indexes the process’s own table of open files.</p>
<h3>3. Reads and writes go through the page cache</h3>
<p>File data is cached in memory in 4 KB pages. A <code>read</code> copies from the cache; on a miss it first asks the block layer for the page. Because a reader that asked for page 0 will probably want page 1, the kernel detects sequential access and <b>reads ahead</b> with a window that grows (the default maximum is 128 KB per device and can be tuned). Random access turns readahead off, since guessing would waste bandwidth.</p>
<h3>4. Why a second run is so much faster</h3>
<p>After the first read the pages stay in the cache until memory is needed elsewhere. A second read of the same file never touches the disk. This is why benchmarks must say whether the cache was cold, and why a reboot or a failover to a new host is followed by a slow period while the working set is read back in.</p>
<h3>5. The trade-off</h3>
<p>The cache makes reads fast and shares RAM across all programs, but it can be flushed by one careless job: copying a huge file can evict the pages another service needed. Databases that manage their own cache read with <code>O_DIRECT</code> to avoid caching the same data twice. <code>posix_fadvise(DONTNEED)</code> and <code>madvise</code> let a program say what not to keep.</p>
<h3>6. The commands, in one place</h3>
<pre># how much of a file is cached (vmtouch is a small extra tool)
vmtouch -v /var/log/app.log
# cache size and dirty pages
grep -E 'Cached|Dirty|Writeback' /proc/meminfo
# directory and inode cache growth
slabtop -o | head -12
# readahead of a block device
cat /sys/block/sda/queue/read_ahead_kb; blockdev --getra /dev/sda
# drop caches ONLY for a test, never in production
sync; echo 3 &gt; /proc/sys/vm/drop_caches</pre>`;

  window.COURSE.chapters[5] = {
    title: `Files: VFS and the Page Cache`,
    problem: `A log shipper on the build server reads <code>/var/log/app.log</code>. On a freshly booted host the first run takes 8 seconds. Run again, it takes 80 ms, with the same code and the same file. After a deploy replaces every host, the fleet is slow for ten minutes, and <code>ls</code> in a directory with two million files stalls for seconds. Nothing is wrong with the disks; the caches are empty.`,
    predict: {
      q: `A program reads the same 1 GB log file twice in a row, with plenty of free RAM. Why is the second read so much faster?`,
      opts: [
        `The disk firmware remembers the last request and answers it faster`,
        `The kernel kept the file’s pages in the page cache in RAM, so the second read never touches the disk`,
        `The program caches the file in its own heap by default`
      ],
      ans: 1,
      why: `Every read goes through the kernel page cache. After the first read the pages stay in RAM until memory is needed for something else, so a repeat read is a memory copy instead of disk I/O.`
    },
    explain: EXPLAIN,
    diagnose: [
      {
        t: `Cold cache after reboot or failover`,
        sym: `<b>Latency is high on a new or restarted host and falls over several minutes; disk reads are high at first.</b>`,
        ctx: `A service reads its data files at random; its working set was in the page cache of the old host.`,
        why: `The new host starts with an empty cache, so first access of each page is a major fault or a miss that waits for the disk.`,
        log: `$ vmtouch /data/index.db
           Files: 1
     Resident Pages: 1203/52428800  4M/200G  0.0023%`,
        note: `Representative vmtouch output (an external tool).`,
        fix: [`Pre-warm the files before the host takes traffic (<code>cat file &gt; /dev/null</code>, <code>vmtouch -t</code>).`, `Shift traffic gradually.`, `Verify: resident pages reach the working-set size before the host is in rotation.`]
      },
      {
        t: `A big copy evicts the hot cache`,
        sym: `<b>After a backup or a large <code>cp</code>, the service’s read latency rises; <code>Cached</code> in meminfo barely changed in size.</b>`,
        ctx: `A nightly backup streams terabytes through the page cache.`,
        why: `The backup’s pages replace the pages the service uses, because one pass looks like recent use to the kernel.`,
        log: `$ grep -E '^(Cached|Active\\(file\\)|Inactive\\(file\\))' /proc/meminfo`,
        note: `Compare these counters before and after the job.`,
        fix: [`Run the backup with <code>nocache</code> or call <code>posix_fadvise(DONTNEED)</code> on what it has read.`, `Limit it with a cgroup, or use <code>O_DIRECT</code>.`, `Verify: service latency stays flat during the backup.`]
      },
      {
        t: `Dentry and inode cache growth with millions of files`,
        sym: `<b>Memory used by the kernel slab grows; <code>ls</code> or <code>find</code> in a big directory is slow.</b>`,
        ctx: `A program creates and probes huge numbers of file names, including names that do not exist.`,
        why: `Each name creates a dentry (negative ones too) and each file an inode, kept until memory pressure frees them.`,
        log: `$ slabtop -o | head -6
  OBJS   ACTIVE USE OBJ SIZE  SLABS CACHE SIZE NAME
 9801024 9774800 99%  0.19K 233120  1.8G  dentry`,
        note: `Representative output.`,
        fix: [`Find the producer (<code>strace -c</code>, <code>perf trace</code>) and avoid probing names that do not exist.`, `Shard files across directories.`, `Verify: dentry slab size stabilises.`]
      }
    ],
    scenarios: [lookup, READ]
  };
})();
