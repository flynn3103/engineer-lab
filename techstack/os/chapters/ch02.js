/* Chapter 2 "Virtual Memory and Address Translation": three scenes in three forms:
   a radix page-table walk, a TLB table with LRU eviction, and a sequence diagram of one page fault. Numbers illustrative. */
(function () {
  const D = window.OSD;

  /* ---------- 1. Four-level page-table walk ---------- */
  const NAMES = ['PGD', 'PUD', 'PMD', 'PTE'];
  const IDX = [254, 117, 9, 52], OFFS = '0x678';
  const TX = k => 24 + k * 150, TY = 168, RH = 22;
  const walk = {
    id: 'walk', label: 'Four-level page walk', desc: 'A virtual address is cut into index fields. Each field picks one entry in the next table, until the last entry names the physical frame (illustrative values).',
    codeLabel: 'x86-64', code: { bug: ['va   = 0x00007f3a12345678     // 48 usable bits', 'cr3  = physical address of the top table (per process)', 'idx  = [va>>39, va>>30, va>>21, va>>12] & 0x1ff', 'pa   = frame << 12 | (va & 0xfff)'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: 4 KB pages, 9 bits per level, tables drawn with 4 of 512 rows.',
      header: s => ({ left: 'virtual address → physical address', right: s.r || '' }),
      setup(kit) { return { L: D.init(kit, 'walk') }; },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        const FW = [100, 100, 100, 100, 116];
        let x = 24;
        ['PGD', 'PUD', 'PMD', 'PTE', 'offset'].forEach((nm, i) => {
          const used = i < 4 ? s.l > i : s.l >= 5;
          D.cell(L, x, 78, FW[i], 34, i < 4 ? String(IDX[i]) : OFFS, used ? (i === s.l - 1 ? 'acc' : 'ok') : 'mut', { b: 1, hot: i === s.l - 1 });
          D.text(L, x + FW[i] / 2, 72, nm + (i < 4 ? ' · 9 bits' : ' · 12 bits'), { a: 'middle', xs: 1, m: 1 });
          x += FW[i] + 6;
        });
        D.text(L, 24, TY - 12, 'CR3 →', { xs: 1, tone: 'acc' });
        for (let k = 0; k < 4; k++) {
          const on = s.l > k, cur = s.l === k + 1;
          D.rect(L, TX(k), TY, 130, 26 + 4 * RH, on ? 'info' : 'mut');
          D.text(L, TX(k) + 8, TY + 17, NAMES[k] + ' table', { b: 1, s: 1 });
          ['0', '…', String(IDX[k]), '…'].forEach((lab, r) => {
            const sel = r === 2 && on;
            D.rect(L, TX(k) + 6, TY + 26 + r * RH, 118, RH - 3, sel ? (cur ? 'acc' : 'ok') : 'none', { rx: 4 });
            D.text(L, TX(k) + 12, TY + 26 + r * RH + 14, lab, { xs: 1, m: !sel });
            if (sel) D.text(L, TX(k) + 118, TY + 26 + r * RH + 14, k < 3 ? '→ next' : 'frame', { a: 'end', xs: 1 });
          });
          if (on && k < 3) D.path(L, `M${TX(k) + 130} ${TY + 26 + 2 * RH + 8} L${TX(k + 1)} ${TY + 26 + 2 * RH + 8}`, { tone: 'acc', arrow: true });
        }
        if (s.l >= 5) D.cell(L, 24, 292, 592, 32, 'physical address = frame 0x1A2B3 << 12  |  0x678  =  0x1A2B3678', 'ok', { b: 1 });
        D.text(L, 24, 338, 'memory reads for this one access: ' + (s.l >= 5 ? '4 table reads + 1 data read = 5' : Math.min(s.l, 4) + ' so far'), { s: 1, tone: s.l >= 5 ? 'warn' : '' });
      }
    },
    bug: [
      { log: 'A program loads from virtual address 0x00007f3a12345678. The CPU does not use it directly. It splits the 48 bits into four 9-bit table indexes and a 12-bit offset inside the page.', callout: 'Cut the address into index fields', code: 2, state: { l: 0, r: 'start' }, stats: [{ l: 'page size', v: '4 KB' }, { l: 'entries per table', v: '512' }] },
      { log: 'CR3 holds the physical address of this process’s top table. Field 1 (254) picks one of its 512 entries. That entry names the next table.', callout: 'Level 1: CR3 + index 254', code: 1, state: { l: 1, r: 'PGD' }, stats: [{ l: 'table reads', v: '1' }] },
      { log: 'Field 2 (117) picks an entry in the second table. Tables are allocated only for ranges the process really uses, so a sparse address space costs few tables.', callout: 'Level 2: index 117', code: 2, state: { l: 2, r: 'PUD' }, stats: [{ l: 'table reads', v: '2' }] },
      { log: 'Field 3 (9) leads to the third table, and field 4 (52) selects the last entry, the page table entry (PTE).', callout: 'Levels 3 and 4: PMD then PTE', code: 2, state: { l: 3, r: 'PMD' }, stats: [{ l: 'table reads', v: '3' }] },
      { log: 'The PTE holds the frame number and the present, write and user permission bits. The CPU checks them against the access.', callout: 'The PTE names the frame and the permissions', code: 3, moment: true, state: { l: 4, r: 'PTE' }, stats: [{ l: 'table reads', v: '4', cls: 'warn' }, { l: 'frame', v: '0x1A2B3' }] },
      { log: 'The frame number joined with the 12-bit offset is the physical address. Four extra memory reads before the real read would make every load five times slower, so the CPU caches translations in the TLB (next scene).', callout: 'A walk costs 5 memory reads', code: 3, state: { l: 5, r: 'done' }, stats: [{ l: 'memory reads', v: '5', cls: 'bad' }],
        takeaway: 'Each process has its own tables, so the same virtual address maps to different frames.' }
    ]
  };

  /* ---------- 2. TLB: a tiny cache of translations ---------- */
  const tlbSteps = () => {
    const out = [], slots = [], seq = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P1'];
    let h = 0, m = 0; const last = {};
    seq.forEach((p, i) => {
      const hit = slots.findIndex(s2 => s2[0] === p); let ev = null, slot;
      if (hit >= 0) { h++; slot = hit; } else {
        m++;
        if (slots.length < 4) { slots.push([p, 'F' + (30 + i)]); slot = slots.length - 1; }
        else { let lru = 0; slots.forEach((s2, k) => { if (last[s2[0]] < last[slots[lru][0]]) lru = k; }); ev = slots[lru][0]; slots[lru] = [p, 'F' + (30 + i)]; slot = lru; }
      }
      last[p] = i + 1;
      out.push({ log: hit >= 0 ? `Load page ${p}: the TLB already holds it, so the translation costs about one cycle.` : (ev ? `Load page ${p}: not in the TLB, and all 4 slots are full. A table walk runs and the least recently used entry (${ev}) is evicted.` : `Load page ${p}: not in the TLB. The CPU walks the page tables (4 reads) and caches the result.`), callout: hit >= 0 ? p + ' hits' : p + ' misses' + (ev ? ', evicts ' + ev : ''), code: 2, moment: i === 5,
        state: { slots: slots.map(s2 => [...s2]), touch: slot, acc: p, res: hit >= 0 ? 'hit' : 'miss', h, m, hr: Math.round(100 * h / (h + m)), ev, r: p }, stats: [{ l: 'hits', v: String(h), cls: 'ok' }, { l: 'misses', v: String(m), cls: 'bad' }] });
    });
    out[out.length - 1].takeaway = 'Six pages cycle through four slots, so LRU always evicts the page needed next: every access misses.';
    return out;
  };
  const tlb = {
    id: 'tlb', label: 'TLB hit and miss', desc: 'The TLB keeps recent translations. A loop over more pages than it holds misses on every access, and a huge page makes the same loop hit (4-entry TLB for illustration; real ones hold 64 to thousands).',
    codeLabel: 'C', code: { bug: ['for (iter = 0; iter < 3; iter++)', '  for (p = 0; p < 6; p++)', '    sum += buf[p * 4096];   // one touch per 4 KB page'], fix: ['// buf allocated with MAP_HUGETLB or madvise(MADV_HUGEPAGE)', 'for (iter = 0; iter < 3; iter++)', '  for (p = 0; p < 6; p++)', '    sum += buf[p * 4096];   // all six touches fall in one 2 MB page'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: 4-entry TLB, LRU, hit ≈ 1 cycle, miss ≈ 100 cycles (illustrative).',
      header: s => ({ left: 'TLB: virtual page → frame', right: s.r || '' }),
      setup(kit) {
        const led = kit.ledger(null, { x: 24, y: 80, w: 330, title: 'TLB entries', cols: [{ label: 'slot', w: 52 }, { label: 'page', w: 110 }, { label: 'frame', w: 110 }], rows: 4, rowH: 20 });
        const acc = kit.chip(null, { x: 380, y: 80, w: 220, h: 40, label: '', tone: 'cursor', show: false });
        const bars = kit.bars(null, { x: 380, y: 170, w: 240, rowH: 28, labelW: 70, max: 100, unit: '%', items: [{ id: 'hit', label: 'hit rate' }] });
        return { L: D.init(kit, 'tlb'), led, acc, bars };
      },
      frame(s, kit, R) {
        D.clear(R.L);
        R.led.clear();
        (s.slots || []).forEach((p, i) => R.led.setRow(i, ['#' + i, p[0], p[1]], { hl: s.touch === i, tone: s.res === 'hit' ? 'ok' : undefined }));
        R.acc.set({ show: !!s.acc, label: s.acc ? 'load ' + s.acc : '', sub: s.res === 'hit' ? 'HIT: 1 cycle' : s.res === 'miss' ? 'MISS: walk 4 tables' : '', tone: s.res === 'hit' ? 'ok' : 'warn' });
        R.bars.set('hit', s.hr, s.hr > 60 ? 'ok' : 'bad');
        D.text(R.L, 380, 232, 'hits ' + s.h + '   misses ' + s.m, { s: 1 });
        D.text(R.L, 380, 252, 'estimated cost: ~' + (s.h + s.m * 100) + ' cycles', { s: 1, tone: s.m > s.h ? 'bad' : 'ok' });
        if (s.ev) D.text(R.L, 24, 250, 'evicted ' + s.ev + ' (least recently used)', { s: 1, tone: 'warn' });
      }
    },
    bug: tlbSteps(),
    fix: [
      { log: 'The buffer now lives in one 2 MB huge page. One TLB entry covers 512 times more memory than a 4 KB entry.', callout: 'One entry covers all six touches', code: 0, state: { slots: [], h: 0, m: 0, hr: 0, r: '2 MB page' }, stats: [{ l: 'entries needed', v: '1', cls: 'ok' }] },
      { log: 'The first touch misses once and caches the 2 MB translation (the walk is also one level shorter).', callout: 'First touch: one miss', code: 3, state: { slots: [['H1 (2 MB)', 'F512']], touch: 0, acc: 'P1', res: 'miss', h: 0, m: 1, hr: 0, r: 'P1' }, stats: [{ l: 'hits', v: '0' }, { l: 'misses', v: '1', cls: 'warn' }] },
      { log: 'P2 to P6 fall inside the same huge page, so all of them hit.', callout: 'P2 … P6 all hit', moment: true, code: 3, state: { slots: [['H1 (2 MB)', 'F512']], touch: 0, acc: 'P6', res: 'hit', h: 5, m: 1, hr: 83, r: 'P6' }, stats: [{ l: 'hits', v: '5', cls: 'ok' }, { l: 'misses', v: '1' }] },
      { log: 'Later laps hit as well. The trade-off is memory: a 2 MB page may hold mostly unused bytes, and finding a free contiguous 2 MB block can stall (compaction).', callout: 'Steady state: every access hits', code: 3, state: { slots: [['H1 (2 MB)', 'F512']], touch: 0, acc: 'P1', res: 'hit', h: 17, m: 1, hr: 94, r: 'lap 3' }, stats: [{ l: 'hit rate', v: '94%', cls: 'ok' }],
        takeaway: 'Bigger pages make the TLB cover more memory, but cost internal waste and compaction.' }
    ]
  };

  /* ---------- 3. Demand paging: the life of one page fault (sequence diagram) ---------- */
  const LX = { cpu: 110, ker: 320, dsk: 530 };
  const MSGS = [
    ['cpu', 'cpu', 'load [0x7f3a…]: PTE not present'],
    ['cpu', 'ker', '#PF  (address in CR2)'],
    ['ker', 'ker', 'find VMA: address is mapped'],
    ['ker', 'ker', 'get a free frame'],
    ['ker', 'dsk', 'read the page (major fault)'],
    ['dsk', 'ker', 'data arrives (~ms, task slept)'],
    ['ker', 'ker', 'set PTE: present, frame, perms'],
    ['ker', 'cpu', 'return: re-run the load'],
    ['cpu', 'cpu', 'load succeeds']
  ];
  const LOGS = [
    'The program touches a page it has never used. The MMU walks the tables and finds the present bit clear, so it cannot translate the address.',
    'The CPU raises a page fault (#PF): it saves the faulting address in CR2 and enters the kernel at the fault handler.',
    'The kernel looks up the address in the process’s memory regions (VMAs). It is inside a valid mapping, so the fault is legitimate. An address outside every VMA would end in SIGSEGV instead.',
    'It takes a free frame from the allocator. If none is free, reclaim runs first (chapter 3).',
    'The page belongs to a file, so the kernel asks the disk for it. This is a major fault. A zero-filled anonymous page needs no I/O (a minor fault).',
    'The task sleeps while the disk works, and another task runs. The read can take a millisecond or more, against 100 ns for RAM.',
    'The kernel writes the frame number and permission bits into the PTE and marks it present.',
    'The kernel returns to the program and the CPU re-executes the same instruction.',
    'The second attempt translates normally. The program never noticed, except that the load took a long time.'
  ];
  const CALL = ['First touch: PTE not present', 'CPU enters the kernel', 'Is the address mapped at all?', 'Get a frame', 'Major fault: disk read', 'The task sleeps meanwhile', 'Map the page', 'Retry the instruction', 'The load succeeds'];
  const fault = {
    id: 'fault', label: 'One page fault', desc: 'malloc and mmap only reserve addresses. The first touch of a page faults, and the kernel supplies the frame on demand (illustrative timings).',
    codeLabel: 'C', code: { bug: ['char *p = mmap(NULL, 1UL << 30, PROT_READ|PROT_WRITE,', '                MAP_PRIVATE|MAP_ANONYMOUS, -1, 0);   // returns at once, no RAM used', 'char c = p[5 * 4096];                                  // first touch: page fault', '// if p were outside every mapping: SIGSEGV'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: file-backed major fault. An anonymous page is zero-filled (a minor fault).',
      header: s => ({ left: 'CPU / MMU · kernel handler · disk', right: s.r || '' }),
      setup(kit) { return { L: D.init(kit, 'pf') }; },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        [['cpu', 'CPU / MMU'], ['ker', 'kernel'], ['dsk', 'disk']].forEach(([k, name]) => {
          D.cell(L, LX[k] - 56, 70, 112, 28, name, 'info', { b: 1 });
          D.line(L, LX[k], 98, LX[k], 396, { dash: true, thin: true, tone: 'mut' });
        });
        MSGS.slice(0, s.m).forEach(([a, b, lab], i) => {
          const y = 124 + i * 29, last = i === s.m - 1;
          if (a === b) {
            D.rect(L, LX[a] - 4, y - 12, 8, 20, last ? 'acc' : 'ok', { rx: 2 });
            D.text(L, LX[a] + 12, y + 3, lab, { s: 1, tone: last ? 'acc' : '', b: last });
          } else {
            D.line(L, LX[a], y, LX[b], y, { arrow: true, tone: last ? 'acc' : '' });
            D.text(L, (LX[a] + LX[b]) / 2, y - 6, lab, { a: 'middle', s: 1, tone: last ? 'acc' : '', b: last });
          }
        });
        if (s.branch) D.cell(L, 340, 356, 280, 30, 'no VMA covers it → SIGSEGV', 'bad', { b: 1 });
      }
    },
    bug: MSGS.map((m, i) => ({
      log: LOGS[i], callout: CALL[i], code: i === 0 ? 2 : i === 2 ? 3 : undefined, moment: i === 4,
      state: { m: i + 1, branch: i === 2, r: i < 2 ? 'trap' : i < 7 ? 'kernel' : 'user' },
      stats: [{ l: 'fault type', v: i >= 4 ? 'major' : '…', cls: i >= 4 ? 'bad' : '' }, { l: 'cost', v: i >= 5 ? '~ms' : i >= 1 ? '~µs' : '~ns', cls: i >= 5 ? 'bad' : '' }],
      takeaway: i === 8 ? 'A fault is a normal, invisible event: memory is handed out on first touch.' : undefined
    }))
  };

  const EXPLAIN = `
<h3>1. Every process sees its own address space</h3>
<p>Two programs can both use address <code>0x00400000</code> because it is a <b>virtual</b> address. The MMU translates it through a per-process set of page tables to a physical frame. A process cannot name another process’s frames because they are not in its tables. That is the isolation, and it comes from translation, not from checking each access in software.</p>
<h3>2. A multi-level radix tree keeps the tables small</h3>
<p>A flat table for 48 bits of address would need 2³⁶ entries per process. x86-64 splits the address into four 9-bit indexes and a 12-bit offset: each table has 512 entries and fits one 4 KB page, and sub-tables exist only for ranges that are mapped. A walk costs four dependent memory reads. A newer CPU can use a fifth level for 57-bit addresses.</p>
<h3>3. The TLB makes translation cheap</h3>
<p>The TLB caches recent virtual-to-physical translations, so a hit costs about a cycle. A miss costs the walk. A program that touches more pages than the TLB holds can run slowly even when its data fits in the data cache. <b>Huge pages</b> (2 MB or 1 GB) make one entry cover far more memory. Transparent huge pages do this automatically, with a risk of latency spikes during compaction, so some databases ask you to turn them off.</p>
<h3>4. Pages are handed out on first touch</h3>
<p>Calling <code>malloc</code> or <code>mmap</code> reserves a range of addresses and returns fast. The kernel installs no frame until the first access, when the page fault handler does it. A <b>minor</b> fault finds or zero-fills a frame in memory. A <b>major</b> fault needs the disk. An access outside every mapped region, or a write to a read-only page, becomes SIGSEGV. This is also why <code>VIRT</code> in top can be far larger than <code>RES</code>.</p>
<h3>5. The trade-off</h3>
<p>Translation adds work to every access and the tables themselves use memory (about 8 bytes per 4 KB page mapped, 0.2%). In exchange you get isolation, sparse address spaces, shared libraries mapped once, and memory that appears only when used. Switching between processes changes CR3, which is why tagged TLBs (PCID) matter.</p>
<h3>6. The commands, in one place</h3>
<pre># virtual vs resident memory, and page-table size, per process
grep -E 'VmSize|VmRSS|VmPTE' /proc/&lt;pid&gt;/status
# minor and major faults of a command
/usr/bin/time -v ./app 2&gt;&amp;1 | grep -i fault
# TLB misses (event names vary by CPU)
perf stat -e dTLB-load-misses,iTLB-load-misses ./app
# huge page state
cat /sys/kernel/mm/transparent_hugepage/enabled; grep -i huge /proc/meminfo</pre>`;

  window.COURSE.chapters[2] = {
    title: `Virtual Memory and Address Translation`,
    problem: `All 200 programs on the build server link their code at the same address <code>0x00400000</code>, and none of them can read another’s data. A Java service reports 40 GB of <code>VIRT</code> on an 8 GB machine and runs fine. After a deploy, a loop over a 6 GB array becomes several times slower with no extra data cache misses; only the translation changed.`,
    predict: {
      q: `A process calls <code>malloc(1 GB)</code> on an 8 GB machine that already runs other jobs, and the call returns a pointer. When does the kernel actually take 4 KB frames of physical RAM for it?`,
      opts: [
        `At the malloc call: all 1 GB is reserved immediately`,
        `When each page is first touched; untouched pages use no frame`,
        `When the process exits, in one batch`
      ],
      ans: 1,
      why: `malloc and mmap reserve addresses. The first read or write of each page raises a page fault, and only then does the kernel install a frame. Untouched pages cost no RAM (but count in VIRT).`
    },
    explain: EXPLAIN,
    diagnose: [
      {
        t: `Major page faults cause latency`,
        sym: `<b>A service stalls after start or after a memory spike; major faults per second are high.</b>`,
        ctx: `A freshly started service touches its memory-mapped index files for the first time, or its pages were evicted under pressure.`,
        why: `Each major fault waits for the disk, about a millisecond or more, while the task sleeps.`,
        log: `$ sar -B 1 3
pgpgin/s pgpgout/s fault/s majflt/s
 48210.0      12.0  9300.0    812.0`,
        note: `Representative sar output. Column set depends on the sysstat version.`,
        fix: [`Confirm with <code>sar -B</code> or <code>perf stat -e major-faults</code>.`, `Warm the cache before taking traffic (read the files, or <code>madvise(WILLNEED)</code>).`, `Add memory if the working set no longer fits.`, `Verify: <code>majflt/s</code> falls to near zero in steady state.`]
      },
      {
        t: `High TLB miss rate`,
        sym: `<b>CPU is busy, IPC is low, <code>dTLB-load-misses</code> is high, the data cache is fine.</b>`,
        ctx: `A service randomly accesses a multi-gigabyte heap with 4 KB pages.`,
        why: `The working set needs far more translations than the TLB holds, so many accesses pay a page walk.`,
        log: `$ perf stat -e dTLB-loads,dTLB-load-misses ./app
 4,812,330,112  dTLB-loads
   601,244,018  dTLB-load-misses   # 12.49% of all dTLB cache accesses`,
        note: `Representative output; event names depend on the CPU.`,
        fix: [`Try transparent huge pages (<code>madvise</code> mode) or explicit huge pages for the heap.`, `Improve locality of the data structure.`, `Trade-off: huge pages can add allocation stalls and wasted memory.`, `Verify: the miss ratio and runtime drop.`]
      },
      {
        t: `VIRT is huge but RES is small`,
        sym: `<b>top shows tens of GB in VIRT and the on-call asks if the host is out of memory.</b>`,
        ctx: `A JVM, Go or database process reserves large address ranges.`,
        why: `Address space is reserved without frames. Only touched pages count in RES, so VIRT is not memory use.`,
        log: `  PID USER   VIRT    RES    SHR S %CPU %MEM COMMAND
 2210 app    41.2g   3.1g   0.2g S  12 38.5 java`,
        note: `Read RES, PSS (<code>/proc/&lt;pid&gt;/smaps_rollup</code>) and cgroup usage instead.`,
        fix: [`Look at <code>RES</code> and the cgroup memory counters, not VIRT.`, `Use <code>/proc/&lt;pid&gt;/smaps_rollup</code> for PSS.`, `Verify: the figure you track matches what the OOM killer sees.`]
      }
    ],
    scenarios: [walk, tlb, fault]
  };
})();
