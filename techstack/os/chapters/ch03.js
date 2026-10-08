/* Chapter 3 "Page Reclaim and the OOM Killer": three scenes, three forms:
   a clock dial, a vertical memory tank with watermarks, and a treemap of process sizes. Numbers illustrative. */
(function () {
  const D = window.OSD;

  /* ---------- 1. Clock (second chance): a hand sweeps frames, clearing reference bits ---------- */
  const DC = { x: 190, y: 236 }, DR = 104;
  const cellAt = i => ({ x: DC.x + DR * Math.sin(i * Math.PI / 3), y: DC.y - DR * Math.cos(i * Math.PI / 3) });
  const F = (pages, ref) => pages.map((p, i) => [p, ref[i]]);
  const base = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  const clock = {
    id: 'clock', label: 'Clock hand sweep', desc: 'RAM is full and a new page needs a frame. A hand sweeps the frames: a page the hardware marked as used gets a second chance, an unused page is evicted (illustrative).',
    codeLabel: 'Pseudo-C', code: { bug: ['while (1) {', '  f = frame[hand];', '  if (f.accessed) { f.accessed = 0; hand = next(hand); }   // second chance', '  else { evict(f); load(new_page, f); hand = next(hand); break; }', '}'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: 6 frames. Linux uses active/inactive lists on the same bit.',
      header: s => ({ left: 'frames on a dial · ● = accessed bit', right: s.r || '' }),
      setup(kit) {
        const led = kit.ledger(null, { x: 360, y: 96, w: 270, title: 'What the hand did', cols: [{ label: 'frame', w: 52 }, { label: 'bit', w: 40 }, { label: 'action', w: 150 }], rows: 7, rowH: 18 });
        return { L: D.init(kit, 'clk'), led };
      },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        D.circle(L, DC.x, DC.y, DR - 40, 'none');
        const hp = cellAt(s.hand);
        D.line(L, DC.x, DC.y, DC.x + (hp.x - DC.x) * 0.62, DC.y + (hp.y - DC.y) * 0.62, { tone: 'acc', arrow: true });
        D.circle(L, DC.x, DC.y, 5, 'acc');
        s.f.forEach(([name, ref], i) => {
          const p = cellAt(i), tone = s.evict === i ? 'bad' : s.load === i ? 'ok' : i === s.hand ? 'acc' : 'info';
          D.rect(L, p.x - 34, p.y - 18, 68, 36, tone, { hot: i === s.hand });
          D.text(L, p.x - 8, p.y + 5, name, { a: 'middle', b: 1, s: 1 });
          D.circle(L, p.x + 22, p.y, 6, ref ? 'warn' : 'mut');
        });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { hl: i === s.rows.length - 1 }));
      }
    },
    bug: [
      { log: 'RAM has 6 frames, all full. Each frame has an accessed bit that the CPU sets whenever the page is read or written. P1, P2, P4 and P6 were used recently; P3 and P5 were not.', callout: 'Accessed bits record recent use', state: { f: F(base, [1, 1, 0, 1, 0, 1]), hand: 0, r: 'full' }, stats: [{ l: 'free frames', v: '0', cls: 'bad' }, { l: 'recently used', v: '4' }] },
      { log: 'A program faults on page X and needs a frame. The clock hand starts at frame 1. P1’s bit is set, so P1 gets a second chance: the bit is cleared and the hand moves on.', callout: 'Bit set: clear it, move on', code: 2, state: { f: F(base, [0, 1, 0, 1, 0, 1]), hand: 1, r: 'sweeping', rows: [['P1', '1→0', 'second chance']] }, stats: [{ l: 'scanned', v: '1' }] },
      { log: 'P2 also has its bit set. Clear it and advance. A page that is really in use will set the bit again before the hand returns.', callout: 'Same for P2', code: 2, state: { f: F(base, [0, 0, 0, 1, 0, 1]), hand: 2, r: 'sweeping', rows: [['P1', '1→0', 'second chance'], ['P2', '1→0', 'second chance']] }, stats: [{ l: 'scanned', v: '2' }] },
      { log: 'P3’s bit is clear: nobody used it since the hand last passed. It is the victim.', callout: 'P3 not used: evict it', moment: true, code: 3, state: { f: F(base, [0, 0, 0, 1, 0, 1]), hand: 2, evict: 2, r: 'victim P3', rows: [['P1', '1→0', 'second chance'], ['P2', '1→0', 'second chance'], ['P3', '0', 'EVICT (clean: dropped)']] }, stats: [{ l: 'scanned', v: '3' }, { l: 'victim', v: 'P3', cls: 'bad' }] },
      { log: 'X is loaded into that frame with its accessed bit set, and the hand advances. If P3 had been modified, it would first be written to disk, which is far slower.', callout: 'X takes the frame', code: 3, state: { f: F(['P1', 'P2', 'X', 'P4', 'P5', 'P6'], [0, 0, 1, 1, 0, 1]), hand: 3, load: 2, r: 'X loaded', rows: [['P1', '1→0', 'second chance'], ['P2', '1→0', 'second chance'], ['P3', '0', 'EVICT'], ['X', '1', 'loaded']] }, stats: [{ l: 'faults', v: '1' }, { l: 'evicted', v: 'P3' }] },
      { log: 'Meanwhile the program keeps using P1. The hardware sets P1’s accessed bit again without any kernel work, so the next sweep will skip it.', callout: 'Hot pages re-set their own bit', code: 2, state: { f: F(['P1', 'P2', 'X', 'P4', 'P5', 'P6'], [1, 0, 1, 1, 0, 1]), hand: 3, r: 'P1 touched', rows: [['P1', '0→1', 'touched by CPU'], ['hand', '→ frame 4', 'next fault starts here']] }, stats: [{ l: 'P1', v: 'survives', cls: 'ok' }] },
      { log: 'Another fault, page Y: P4’s bit is set (cleared), then P5’s bit is clear, so P5 is evicted. Pages in use survive; the cost of the sweep is paid only on a fault.', callout: 'Next fault evicts P5', code: 3, state: { f: F(['P1', 'P2', 'X', 'P4', 'Y', 'P6'], [1, 0, 1, 0, 1, 1]), hand: 5, load: 4, r: 'Y loaded', rows: [['P4', '1→0', 'second chance'], ['P5', '0', 'EVICT'], ['Y', '1', 'loaded']] }, stats: [{ l: 'faults', v: '2' }, { l: 'evicted', v: 'P3, P5' }],
        takeaway: 'The kernel cannot know the future, so it approximates “recently used” with one hardware bit.' }
    ]
  };

  /* ---------- 2. Memory tank: watermarks decide who reclaims ---------- */
  const TX0 = 70, TW = 150, TTOP = 84, TH = 290, GB = TH / 8;
  const SEG = [['kern', 'kernel', 'mut'], ['anon', 'anonymous (heap, stacks)', 'info'], ['clean', 'page cache, clean', 'ok'], ['dirty', 'page cache, dirty', 'warn'], ['free', 'free', 'none']];
  const WM = [['high', 0.55, 'ok'], ['low', 0.35, 'warn'], ['min', 0.15, 'bad']];
  const tank = {
    id: 'tank', label: 'Watermark tank', desc: 'Free memory falls as programs allocate. Three watermarks decide whether a background thread or the allocating program itself must reclaim (watermark sizes exaggerated for the picture).',
    codeLabel: 'Shell', code: { bug: ['$ grep -E "low|high|min" /proc/zoneinfo | head', '$ vmstat 1          # si/so = swap in/out', '$ grep -E "allocstall|pgscan_kswapd|pgscan_direct" /proc/vmstat', '$ cat /proc/pressure/memory'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one 8 GB zone. Real watermarks are far smaller and set by min_free_kbytes.',
      header: s => ({ left: '8 GB RAM, bottom to top', right: s.r || '' }),
      setup(kit) {
        const who = kit.chip(null, { x: 330, y: 84, w: 290, h: 40, label: '', tone: 'info' });
        const led = kit.ledger(null, { x: 330, y: 150, w: 290, title: 'Reclaim', cols: [{ label: 'who', w: 90 }, { label: 'cost to the app', w: 180 }], rows: 4, rowH: 18 });
        return { L: D.init(kit, 'tank'), who, led };
      },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        let y = TTOP + TH;
        SEG.forEach(([k, name, tone]) => {
          const h = s.m[k] * GB; if (h <= 0) return;
          D.rect(L, TX0, y - h, TW, h, tone, { rx: 2 });
          if (h > 14) D.text(L, TX0 + TW / 2, y - h / 2 + 4, name.split(' (')[0] + ' ' + s.m[k].toFixed(1), { a: 'middle', xs: 1 });
          y -= h;
        });
        WM.forEach(([nm, gb, tone]) => {
          const wy = TTOP + TH - (8 - gb) * GB; /* watermark line measured from the top of memory */
          D.line(L, TX0 - 10, wy, TX0 + TW + 10, wy, { tone, dash: true });
          D.text(L, TX0 + TW + 14, wy + 4, nm, { xs: 1, tone });
        });
        D.text(L, TX0, TTOP - 8, 'free ' + s.m.free.toFixed(2) + ' GB' + (s.swap ? '   swap ' + s.swap + ' GB' : ''), { s: 1, b: 1 });
        R.who.set({ label: s.who || 'no reclaim needed', sub: s.sub || '', tone: s.tone || 'ok' });
        R.led.clear(); (s.rows || []).forEach((r, i) => R.led.setRow(i, r, { hl: i === s.rows.length - 1 }));
      }
    },
    bug: [
      { log: 'The box has 8 GB. The kernel holds 0.8, programs hold 3.2, the page cache holds 2.8 (0.3 of it dirty) and 1.2 GB is free, above the high watermark. Nothing needs reclaiming.', callout: 'Free is above the high watermark', state: { m: { kern: 0.8, anon: 3.2, clean: 2.5, dirty: 0.3, free: 1.2 }, r: 'relaxed' }, stats: [{ l: 'free', v: '1.2 GB', cls: 'ok' }] },
      { log: 'A job allocates 0.9 GB. Free falls to the low watermark. This wakes kswapd, a background kernel thread, so the allocating program is not yet slowed.', callout: 'Below low: kswapd wakes in the background', code: 2, state: { m: { kern: 0.8, anon: 4.1, clean: 2.5, dirty: 0.3, free: 0.3 }, who: 'kswapd (background)', sub: 'free < low', tone: 'warn', r: 'kswapd awake', rows: [['kswapd', 'none yet']] }, stats: [{ l: 'free', v: '0.3 GB', cls: 'warn' }] },
      { log: 'kswapd drops clean page-cache pages first. They are copies of files on disk, so dropping them needs no write. Free rises back to the high watermark and kswapd sleeps.', callout: 'Clean cache is the cheapest to give up', code: 2, state: { m: { kern: 0.8, anon: 4.1, clean: 2.1, dirty: 0.3, free: 0.7 }, who: 'kswapd (background)', sub: 'dropped 0.4 GB clean cache', tone: 'ok', r: 'recovering', rows: [['kswapd', 'none: no I/O']] }, stats: [{ l: 'free', v: '0.7 GB', cls: 'ok' }, { l: 'cost', v: '≈ 0' }] },
      { log: 'A burst allocates 2 GB faster than kswapd can free. Free drops below the min watermark. Now the allocating thread must reclaim memory itself before it may continue.', callout: 'Below min: direct reclaim stalls the app', moment: true, code: 2, state: { m: { kern: 0.8, anon: 6.1, clean: 0.8, dirty: 0.3, free: 0.0 }, who: 'the app itself (direct reclaim)', sub: 'allocation waits', tone: 'bad', r: 'DIRECT RECLAIM', rows: [['kswapd', 'none yet'], ['app thread', 'blocks in malloc/fault']] }, stats: [{ l: 'free', v: '< min', cls: 'bad' }, { l: 'app latency', v: 'spikes', cls: 'bad' }] },
      { log: 'Clean cache is nearly gone. Dirty pages must be written to disk before they can be reused, and anonymous pages can only be freed by writing them to swap. Both wait on the disk.', callout: 'Dirty cache and anon pages need I/O', code: 3, state: { m: { kern: 0.8, anon: 5.6, clean: 0.5, dirty: 0.1, free: 0.4 }, swap: 0.5, who: 'writeback and swap-out', sub: 'disk-speed reclaim', tone: 'bad', r: 'swapping', rows: [['kswapd', 'none yet'], ['app thread', 'blocks in malloc/fault'], ['swap out', '0.5 GB to disk']] }, stats: [{ l: 'swap used', v: '0.5 GB', cls: 'bad' }, { l: 'p99', v: 'seconds', cls: 'bad' }] },
      { log: 'If a reclaim pass frees almost nothing and allocations keep failing, the kernel runs out of options and calls the OOM killer, which kills a process to get memory back (next scene).', callout: 'Nothing left to reclaim: OOM killer', code: 3, state: { m: { kern: 0.8, anon: 6.9, clean: 0.1, dirty: 0.1, free: 0.1 }, swap: 2.0, who: 'OOM killer', sub: 'last resort', tone: 'bad', r: 'OUT OF MEMORY', rows: [['kswapd', 'none yet'], ['app thread', 'blocks in malloc/fault'], ['swap out', '2 GB, full'], ['OOM killer', 'kills a process']] }, stats: [{ l: 'reclaimable', v: '≈ 0', cls: 'bad' }],
        takeaway: 'Free memory is cheap to keep nearly empty because the cache gives way first; trouble starts when reclaim needs the disk.' }
    ]
  };

  /* ---------- 3. OOM killer: a treemap of who owns the memory ---------- */
  const PROCS = [
    { id: 'db', name: 'postgres', gb: 3.6, x: 24, y: 82, w: 212, h: 150, adj: 0 },
    { id: 'wk', name: 'worker (leak)', gb: 1.9, x: 236, y: 82, w: 140, h: 100, adj: 0 },
    { id: 'api', name: 'api', gb: 1.5, x: 236, y: 182, w: 140, h: 50, adj: 0 },
    { id: 'ch', name: 'cache', gb: 0.6, x: 24, y: 232, w: 120, h: 62, adj: 0 },
    { id: 'ot', name: 'other', gb: 0.3, x: 144, y: 232, w: 92, h: 62, adj: 0 },
    { id: 'ss', name: 'sshd', gb: 0.1, x: 236, y: 232, w: 140, h: 62, adj: -1000 }
  ];
  const score = (p, adj) => Math.max(0, Math.round(p.gb / 8 * 1000) + (adj == null ? p.adj : adj));
  const oomState = (fix, killed) => ({ fix, killed });
  const oom = {
    id: 'oom', label: 'Who gets killed', desc: 'Memory is exhausted. The kernel scores every process by its share of RAM, adds oom_score_adj, and kills the highest score (illustrative sizes).',
    codeLabel: 'Shell', code: { bug: ['$ cat /proc/<pid>/oom_score', '$ dmesg | grep -i "killed process"', '# nothing protects postgres or marks the leaker'], fix: ['$ echo -900 > /proc/$(pidof postgres)/oom_score_adj   # protect', '$ echo  500 > /proc/<worker pid>/oom_score_adj        # sacrifice first', '$ dmesg | grep -i "killed process"'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: score ≈ share of RAM per mille + oom_score_adj.',
      header: s => ({ left: 'area = memory used (8 GB total)', right: s.r || '' }),
      setup(kit) {
        const led = kit.ledger(null, { x: 396, y: 82, w: 234, title: 'oom_score', cols: [{ label: 'process', w: 100 }, { label: 'adj', w: 54 }, { label: 'score', w: 56 }], rows: 6, rowH: 18 });
        return { L: D.init(kit, 'oom'), led };
      },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        const adj = id => (s.fix && id === 'db' ? -900 : s.fix && id === 'wk' ? 500 : PROCS.find(p => p.id === id).adj);
        const alive = PROCS.filter(p => p.id !== s.killed);
        const top = alive.reduce((a, b) => (score(b, adj(b.id)) > score(a, adj(a.id)) ? b : a));
        PROCS.forEach(p => {
          const dead = p.id === s.killed, pick = s.pick && p.id === top.id;
          D.rect(L, p.x, p.y, p.w, p.h, dead ? 'none' : pick ? 'bad' : p.id === 'ss' ? 'ok' : 'info', { rx: 4, hot: pick });
          D.text(L, p.x + 8, p.y + 18, dead ? p.name + ' (killed)' : p.name, { s: 1, b: 1 });
          D.text(L, p.x + 8, p.y + 34, dead ? 'freed ' + p.gb + ' GB' : p.gb + ' GB', { xs: 1, m: !dead, tone: dead ? 'ok' : '' });
        });
        R.led.clear();
        if (s.scores) PROCS.forEach((p, i) => R.led.setRow(i, [p.name.split(' ')[0], String(adj(p.id)), s.killed === p.id ? '—' : String(score(p, adj(p.id)))], { hl: s.pick && p.id === top.id, tone: 'ok' }));
        const freeGB = s.killed ? PROCS.find(p => p.id === s.killed).gb : 0;
        D.text(L, 24, 330, 'free after the kill: ' + freeGB + ' GB', { s: 1, tone: freeGB ? 'ok' : 'bad' });
      }
    },
    bug: [
      { log: 'The machine is out of memory and reclaim has failed. Six processes hold nearly all of the 8 GB. The worker has a slow leak; the database is large because it is supposed to be.', callout: 'RAM exhausted, reclaim failed', state: { r: 'OOM' }, stats: [{ l: 'free', v: '≈ 0', cls: 'bad' }] },
      { log: 'The OOM killer gives every process a badness score: its share of RAM (resident pages, swap and page tables) in parts per thousand, plus oom_score_adj. It does not know which process is leaking.', callout: 'Score = share of RAM + oom_score_adj', code: 0, state: { r: 'scoring', scores: true }, stats: [{ l: 'postgres', v: '450' }, { l: 'worker', v: '237' }] },
      { log: 'The highest score wins. That is the database, because it is the biggest. sshd has oom_score_adj −1000, which exempts it entirely.', callout: 'The biggest process is chosen, not the leaker', moment: true, state: { r: 'victim: postgres', scores: true, pick: true }, stats: [{ l: 'victim', v: 'postgres', cls: 'bad' }] },
      { log: 'The kernel sends SIGKILL to postgres. 3.6 GB is freed at once and the leak keeps growing, so the same incident will return a few hours later.', callout: 'The service you needed is gone', code: 1, state: { r: 'killed', scores: true, pick: false, killed: 'db' }, stats: [{ l: 'killed', v: 'postgres', cls: 'bad' }, { l: 'freed', v: '3.6 GB' }],
        takeaway: 'The OOM killer picks the largest process, not the guilty one.' }
    ],
    fix: [
      { log: 'Same machine, same exhaustion. This time the operator protects the critical service and marks the leaker as the one to sacrifice first.', callout: 'Set oom_score_adj per service', code: 0, state: { fix: true, r: 'OOM' }, stats: [{ l: 'free', v: '≈ 0', cls: 'bad' }] },
      { log: 'With adj −900 the database scores near zero, and +500 makes the worker the highest score on the machine.', callout: 'Scores now reflect what you value', code: 1, state: { fix: true, r: 'scoring', scores: true }, stats: [{ l: 'postgres', v: '0', cls: 'ok' }, { l: 'worker', v: '737', cls: 'bad' }] },
      { log: 'The kernel picks the worker. The database and sshd are untouched.', callout: 'The leaker is the victim', moment: true, state: { fix: true, r: 'victim: worker', scores: true, pick: true }, stats: [{ l: 'victim', v: 'worker', cls: 'warn' }] },
      { log: 'The worker is killed and 1.9 GB is freed. The leak itself still needs a fix, and a cgroup memory limit on the worker would contain it before it starves the host (chapter 8).', callout: 'Contained, but fix the leak', code: 2, state: { fix: true, r: 'killed', scores: true, pick: false, killed: 'wk' }, stats: [{ l: 'killed', v: 'worker', cls: 'warn' }, { l: 'freed', v: '1.9 GB', cls: 'ok' }],
        takeaway: 'oom_score_adj tells the kernel what to sacrifice, and a cgroup limit is a better place to stop a leak.' }
    ]
  };
  void oomState;

  const EXPLAIN = `
<h3>1. RAM is a cache, and the kernel keeps it nearly full on purpose</h3>
<p>Free memory is wasted memory, so Linux fills spare RAM with the page cache (file contents) and gives it back when programs need it. That is why <code>free</code> shows little “free” and a large “available” figure. The real question is not whether RAM is full but whether the kernel can free a frame <b>cheaply</b> when asked.</p>
<h3>2. Watermarks decide who pays</h3>
<p>Each memory zone has three thresholds. When free memory falls below <b>low</b>, the background thread <code>kswapd</code> starts reclaiming until free reaches <b>high</b>, and no program notices. If free falls below <b>min</b> before kswapd keeps up, the allocating thread reclaims for itself in <b>direct reclaim</b> and stalls. The stall is the latency spike you see in the tail.</p>
<h3>3. What can be freed, from cheapest to dearest</h3>
<p>Clean page-cache pages are dropped with no I/O. Dirty cache pages must be written back first. Anonymous pages (heap and stack) have no file to return to, so they can only go to swap, and a program that needs them again takes a major fault. Pages are tracked on active and inactive lists, and the accessed bit decides which move between them; the clock idea in the first scene is the simple form of this.</p>
<h3>4. Why “least recently used” is only an approximation</h3>
<p>The best choice is the page needed furthest in the future, which nobody can know. Exact LRU would need work on every memory access. The hardware sets one accessed bit per page for free, and the kernel samples it. Pages that keep their bit set stay in memory, and a sweep over a huge file once can still push hot pages out, which is why <code>posix_fadvise</code> and <code>O_DIRECT</code> exist.</p>
<h3>5. Thrashing and the OOM killer</h3>
<p>When the working set of all programs is larger than RAM, pages are evicted just before they are needed again, and the machine spends its time on faults and swap I/O while the CPU idles. If reclaim cannot free enough, the OOM killer chooses a victim by <code>oom_score</code>, which is mostly the share of RAM. It is a last resort and does not know which process is at fault. Inside a container, the cgroup limit triggers the same logic for that group only.</p>
<h3>6. The trade-off</h3>
<p>Swap lets cold anonymous pages make room for useful cache, but a swapped hot page costs a disk read. Disabling swap makes failures abrupt (OOM) instead of slow. Setting <code>vm.swappiness</code> and cgroup limits trades throughput for predictable latency; neither is free.</p>
<h3>7. The commands, in one place</h3>
<pre># available, cache, swap
free -h; vmstat 1
# memory pressure stall information (share of time tasks waited)
cat /proc/pressure/memory
# direct reclaim and scan counters
grep -E 'allocstall|pgscan_direct|pgscan_kswapd|pgsteal' /proc/vmstat
# OOM history and per-process score
dmesg -T | grep -i -E 'out of memory|killed process'
cat /proc/&lt;pid&gt;/oom_score /proc/&lt;pid&gt;/oom_score_adj</pre>`;

  window.COURSE.chapters[3] = {
    title: `Page Reclaim and the OOM Killer`,
    problem: `A nightly job on the 8 GB build server allocates 6 GB while the page cache holds 4 GB of old logs. For about three seconds the web service’s p99 goes from 5 ms to 3 s, and then the database disappears. <code>dmesg</code> shows <code>Out of memory: Killed process</code>. The monitoring graph said “memory 98% used” for weeks without a problem, so what changed?`,
    predict: {
      q: `All frames are in use and a page fault needs one. Which choice can the kernel actually implement for deciding which page to evict?`,
      opts: [
        `Evict the page that will be needed furthest in the future`,
        `Approximate recency: sample the hardware accessed bit and give used pages a second chance`,
        `Evict the page that is at the lowest physical address`
      ],
      ans: 1,
      why: `The future is unknown, so the best policy cannot be implemented. The CPU sets an accessed bit for free on each use, and the kernel samples and clears it (clock or active/inactive lists) to approximate least recently used.`
    },
    explain: EXPLAIN,
    diagnose: [
      {
        t: `Direct reclaim stalls`,
        sym: `<b>Request latency spikes while free memory is near zero; <code>allocstall</code> and memory PSI rise.</b>`,
        ctx: `A batch job and a latency-critical service share a host, and the batch job allocates in bursts.`,
        why: `Free fell below the min watermark, so the service’s own thread had to reclaim pages before its allocation could finish.`,
        log: `$ cat /proc/pressure/memory
some avg10=14.20 avg60=6.31 avg300=2.08 total=48211033
full avg10=9.55 avg60=3.80 avg300=1.20 total=31200310`,
        note: `PSI format as documented in the kernel (Documentation/accounting/psi).`,
        fix: [`Confirm with <code>/proc/pressure/memory</code> and <code>allocstall</code> in <code>/proc/vmstat</code>.`, `Raise <code>vm.min_free_kbytes</code> a little so kswapd starts earlier, or limit the batch job with a cgroup.`, `Trade-off: more memory is kept free.`, `Verify: allocstall stops growing and p99 recovers.`]
      },
      {
        t: `Swap thrashing`,
        sym: `<b><code>si</code> and <code>so</code> are high, CPU is mostly idle or in I/O wait, everything is slow.</b>`,
        ctx: `The combined working set of the programs is bigger than RAM.`,
        why: `Pages are evicted just before they are needed again, so each access becomes a major fault and a swap read.`,
        log: `$ vmstat 1
 r  b   swpd   free  si    so   wa
 3  9 5242880  80211 8120 9440  71`,
        note: `Representative output; <code>si</code>/<code>so</code> are KB/s.`,
        fix: [`Reduce the working set (limits, fewer workers) or add RAM.`, `Find the biggest users with <code>smem -t -k</code> or <code>ps --sort=-rss</code>.`, `Verify: <code>si</code> and <code>so</code> fall to near zero.`]
      },
      {
        t: `The OOM killer killed the wrong process`,
        sym: `<b>A critical service dies; <code>dmesg</code> shows the kill and the memory table.</b>`,
        ctx: `A different process leaked, but the service was the largest one on the host.`,
        why: `The score is mostly the share of RAM, so the biggest process is chosen even when it is not the cause.`,
        log: `Out of memory: Killed process 2210 (postgres) total-vm:7340032kB, anon-rss:3774424kB, file-rss:812kB, shmem-rss:0kB, UID:26 pgtables:7612kB oom_score_adj:0`,
        note: `Format as printed by the kernel in dmesg.`,
        fix: [`Protect critical services with a negative <code>oom_score_adj</code> (systemd: <code>OOMScoreAdjust=</code>).`, `Limit the leaker with a cgroup <code>memory.max</code>.`, `Find and fix the leak.`, `Verify: the next OOM, if any, names the leaker.`]
      }
    ],
    scenarios: [clock, tank, oom]
  };
})();
