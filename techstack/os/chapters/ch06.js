/* Chapter 6 "Crash Consistency: Journals and fsync": three scenes in three forms:
   three on-disk cards with a crash cut-line, a journal strip with a home area, and a stack of caches a write must cross. */
(function () {
  const D = window.OSD;

  /* ---------- 1. One append touches three blocks: where can a crash cut? ---------- */
  const CARDS = [
    { name: 'data bitmap', old: 'block B5: free', now: 'block B5: used' },
    { name: 'inode', old: 'size 4 KB · ptr B4', now: 'size 8 KB · ptr B4, B5' },
    { name: 'data block B5', old: 'old bytes (garbage)', now: '“hello”' }
  ];
  const OUT = [
    ['Nothing written', 'File unchanged. The append is lost, but the disk is consistent.', 'ok'],
    ['Only the bitmap', 'B5 is marked used but no inode points to it: a leaked block. fsck can reclaim it.', 'warn'],
    ['Bitmap and inode, no data', 'The inode points at B5 but B5 holds old bytes: the file shows garbage, maybe another file’s data.', 'bad'],
    ['All three', 'Consistent: the append is complete.', 'ok']
  ];
  const cards = {
    id: 'three-writes', label: 'One append, three blocks', desc: 'Appending to a file updates a bitmap, an inode and a data block. They are separate disk writes, so a power cut can land between them (illustrative).',
    codeLabel: 'C', code: { bug: ['write(fd, "hello", 5);     // append 5 bytes', '// the file system must update 3 places:', '//   1. data bitmap  2. inode  3. data block', '// order in this scene: bitmap, inode, data'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified file system without a journal. A crash can happen between any two writes.',
      header: s => ({ left: 'blocks on disk', right: s.r || '' }),
      setup(kit) { return { L: D.init(kit, 'cards') }; },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        CARDS.forEach((c, i) => {
          const done = s.k > i, x = 24 + i * 204;
          D.rect(L, x, 96, 188, 96, done ? 'ok' : 'mut', { hot: s.k === i + 1 && !s.crash });
          D.text(L, x + 94, 118, c.name, { a: 'middle', b: 1, s: 1 });
          D.text(L, x + 94, 144, done ? c.now : c.old, { a: 'middle', xs: 1, tone: done ? 'ok' : '' , m: !done });
          D.text(L, x + 94, 176, done ? 'written' : 'not yet written', { a: 'middle', xs: 1, m: !done, tone: done ? 'ok' : '' });
        });
        if (s.crash) { D.line(L, 24 + s.k * 204 - 8, 80, 24 + s.k * 204 - 8, 204, { tone: 'bad', dash: true }); D.text(L, 24 + s.k * 204 - 8, 74, 'POWER CUT', { a: 'middle', xs: 1, tone: 'bad', b: 1 }); }
        if (s.out != null) {
          const [t, m, tone] = OUT[s.out];
          D.rect(L, 24, 230, 592, 74, tone); D.text(L, 40, 254, 'after reboot: ' + t, { b: 1, s: 1 });
          const cut = m.length > 78 ? m.lastIndexOf(' ', 78) : m.length; D.text(L, 40, 278, m.slice(0, cut), { xs: 1 }); if (cut < m.length) D.text(L, 40, 294, m.slice(cut).trim(), { xs: 1 });
        }
      }
    },
    bug: [
      { log: 'Appending 5 bytes needs three writes: the data bitmap (mark B5 used), the inode (new size and pointer) and the data block itself. The disk can write only one block at a time.', callout: 'Three separate writes for one append', code: 2, state: { k: 0, r: 'plan' }, stats: [{ l: 'writes needed', v: '3' }] },
      { log: 'The bitmap write lands first. If the power fails right now, B5 is marked used but nothing points at it.', callout: 'Crash after 1 write', moment: true, code: 3, state: { k: 1, crash: true, out: 1, r: 'crash after bitmap' }, stats: [{ l: 'state', v: 'block leaked', cls: 'warn' }] },
      { log: 'Suppose the bitmap and the inode land, and the power fails before the data block. The inode now says the file is 8 KB and points at B5.', callout: 'Crash after 2 writes', moment: true, code: 3, state: { k: 2, crash: true, out: 2, r: 'crash after inode' }, stats: [{ l: 'state', v: 'garbage exposed', cls: 'bad' }] },
      { log: 'Only when all three writes finish is the append complete. The three-step window is the problem: the disk can be in a state no program ever intended.', callout: 'All three: consistent again', code: 3, state: { k: 3, out: 3, r: 'complete' }, stats: [{ l: 'state', v: 'consistent', cls: 'ok' }] },
      { log: 'Old file systems repaired this with fsck: scan every inode and bitmap after an unclean shutdown. That takes minutes to hours on a big disk, and it can only restore consistency, not recover the lost append.', callout: 'fsck scans the whole disk after a crash', state: { k: 3, out: 3, r: 'fsck' }, stats: [{ l: 'fsck time', v: '∝ disk size', cls: 'bad' }],
        takeaway: 'A multi-block update is not atomic, so a crash can leave blocks that disagree with each other.' }
    ]
  };

  /* ---------- 2. Journal: write the plan first, commit, then do it ---------- */
  const journal = {
    id: 'journal', label: 'Journal, commit, replay', desc: 'The file system writes the metadata change into a journal first and marks it committed. After a crash it replays committed transactions and ignores the rest (ext4 ordered mode, illustrative).',
    codeLabel: 'Shell', code: { bug: ['$ mount | grep " / "     # ext4 (rw, data=ordered)', '$ dumpe2fs -h /dev/sda1 | grep -i journal', '$ dmesg | grep -i "recovery complete"'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified ext4 data=ordered: data first, metadata through the journal.',
      header: s => ({ left: 'journal (a circular log) and home blocks', right: s.r || '' }),
      setup(kit) { return { L: D.init(kit, 'jr') }; },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        D.text(L, 24, 82, 'journal area', { b: 1, s: 1 });
        const JS = [['TxBegin', s.j >= 1], ['bitmap copy', s.j >= 2], ['inode copy', s.j >= 3], ['COMMIT', s.c]];
        JS.forEach(([nm, on], i) => D.cell(L, 24 + i * 150, 92, 140, 40, nm, !on ? 'none' : nm === 'COMMIT' ? 'acc' : 'warn', { b: nm === 'COMMIT', hot: s.hotj === i }));
        if (s.freed) D.text(L, 24, 150, 'journal space released', { xs: 1, m: 1 });
        D.text(L, 24, 198, 'home locations (final place on disk)', { b: 1, s: 1 });
        const HM = [['data block B5', s.d], ['bitmap', s.h >= 1], ['inode', s.h >= 2]];
        HM.forEach(([nm, on], i) => D.cell(L, 24 + i * 200, 208, 188, 44, nm, on ? 'ok' : 'mut', { sub: on ? 'new' : 'old', hot: s.hoth === i }));
        if (s.crash) D.text(L, 320, 290, '⚡ ' + s.crash, { a: 'middle', s: 1, tone: 'bad', b: 1 });
        if (s.rec) D.text(L, 320, 318, s.rec, { a: 'middle', s: 1, tone: 'ok', b: 1 });
      }
    },
    bug: [
      { log: 'Plan for the same append. In ordered mode the data block goes first, to its home location. It is not referenced by any inode yet, so a crash here is harmless: the append is simply absent.', callout: 'Step 1: data block goes home first', code: 0, state: { d: true, j: 0, c: false, h: 0, r: 'data first', crash: 'crash here: harmless, append lost', hoth: 0 }, stats: [{ l: 'consistent if crash', v: 'yes', cls: 'ok' }] },
      { log: 'Now the metadata change is written to the journal as a transaction: begin, a copy of the new bitmap block, a copy of the new inode block. Home locations are untouched.', callout: 'Step 2: write the plan to the journal', moment: true, code: 0, state: { d: true, j: 3, c: false, h: 0, r: 'journaling', crash: 'crash here: no commit, transaction ignored', hotj: 2 }, stats: [{ l: 'consistent if crash', v: 'yes', cls: 'ok' }] },
      { log: 'The commit record is written after the previous writes are flushed (a barrier). Its presence means the whole transaction is on disk. This single small write is the atomic switch.', callout: 'Step 3: the commit record is the atomic point', moment: true, code: 0, state: { d: true, j: 3, c: true, h: 0, r: 'committed', crash: 'crash here: committed, replay on mount', hotj: 3 }, stats: [{ l: 'append', v: 'durable', cls: 'ok' }] },
      { log: 'After the crash, mount reads the journal. It finds the committed transaction and replays it: it copies the bitmap and inode to their home locations. This takes milliseconds, not a full fsck.', callout: 'Recovery: replay committed transactions', code: 2, state: { d: true, j: 3, c: true, h: 2, r: 'replay', rec: 'recovery complete: replayed 1 transaction', hoth: 2 }, stats: [{ l: 'recovery time', v: 'ms', cls: 'ok' }] },
      { log: 'In a normal run the checkpoint writes the metadata to its home locations in the background, and then the journal space is released for the next transaction.', callout: 'Checkpoint, then free the journal', code: 0, state: { d: true, j: 3, c: true, h: 2, freed: true, r: 'checkpointed' }, stats: [{ l: 'extra writes', v: 'metadata ×2', cls: 'warn' }],
        takeaway: 'A journal turns a multi-block update into one atomic commit, at the price of writing metadata twice.' }
    ]
  };

  /* ---------- 3. The cache stack a write must cross to be durable ---------- */
  const LAY = [['app buffer', 'user memory (fwrite buffer)', false], ['page cache', 'kernel RAM, marked dirty', false], ['disk write cache', 'volatile on most drives', false], ['persistent media', 'survives power loss', true]];
  const durable = {
    id: 'durable', label: 'When is it really saved?', desc: 'write() returns when the data reaches the page cache, not the disk. A record is durable only after it crosses every volatile layer (illustrative).',
    codeLabel: 'C', code: { bug: ['fwrite(rec, 1, n, f);       // library buffer', 'write(fd, rec, n);          // returns: page cache only', 'ack_to_client();           // BUG: acknowledged before durable', '// power cut here loses the record'], fix: ['write(fd, rec, n);', 'fsync(fd);                 // flush the page cache and the drive cache', 'ack_to_client();           // now it survives a power cut', 'fsync(dirfd);              // after creating or renaming a file'] },
    stage: {
      w: 640, h: 420, footer: 'Simplified: one record travelling down. Battery-backed caches change the third row.',
      header: s => ({ left: 'caches between your program and the disk', right: s.r || '' }),
      setup(kit) {
        return { L: D.init(kit, 'dur'), rec: kit.chip(null, { x: 350, y: 92, w: 90, h: 30, label: 'record', tone: 'cursor' }) };
      },
      frame(s, kit, R) {
        const L = R.L; D.clear(L);
        LAY.forEach(([nm, sub, safe], i) => {
          const y = 84 + i * 68, here = s.at === i;
          D.cell(L, 24, y, 290, 50, nm, here ? 'acc' : safe ? 'ok' : 'info', { sub, hot: here, b: 1 });
          const surv = s.at >= 3 || (i > 0 && i < 2 && s.at === i) ? false : null;
          void surv;
          D.text(L, 340, y + 20, 'power cut now?', { xs: 1, m: 1 });
          const survives = safe && s.at >= 3;
          if (here) D.text(L, 340, y + 38, survives ? 'record survives' : 'record LOST', { s: 1, b: 1, tone: survives ? 'ok' : 'bad' });
          if (i < 3) D.line(L, 169, y + 50, 169, y + 68, { arrow: true, tone: s.at > i ? 'acc' : 'mut' });
        });
        R.rec.set({ x: 458, y: 90 + s.at * 68, label: 'record', tone: s.at >= 3 ? 'ok' : 'cursor' });
        if (s.cut) D.text(L, 24, 372, '⚡ power cut: ' + s.cut, { s: 1, b: 1, tone: s.at >= 3 ? 'ok' : 'bad' });
      }
    },
    bug: [
      { log: 'The service builds a record and calls fwrite. It sits in the C library’s buffer in user memory. A crash of the process alone would lose it.', callout: 'In the library buffer', code: 0, state: { at: 0, r: 'fwrite' }, stats: [{ l: 'survives process crash', v: 'no', cls: 'bad' }] },
      { log: 'write() copies it into the kernel page cache and returns at once. The page is dirty. A process crash is now harmless, because the kernel owns the data, but a power cut is not.', callout: 'write() returns: page cache only', code: 1, state: { at: 1, r: 'write()' }, stats: [{ l: 'survives process crash', v: 'yes', cls: 'ok' }, { l: 'survives power cut', v: 'no', cls: 'bad' }] },
      { log: 'The service acknowledges the client. The record has not reached any disk. A power cut now loses data the client was told was saved. The kernel would have written it back after roughly 30 seconds, but that window is the risk.', callout: 'Acknowledged before durable', moment: true, code: 2, state: { at: 1, r: 'ack sent', cut: 'record lost, client was told OK' }, stats: [{ l: 'client told', v: 'saved', cls: 'bad' }, { l: 'actually saved', v: 'no', cls: 'bad' }],
        takeaway: 'write() is not durability: it only reaches the kernel’s memory.' }
    ],
    fix: [
      { log: 'Same record, now followed by fsync before the acknowledgement. The data starts in the page cache after write().', callout: 'write() then fsync()', code: 0, state: { at: 1, r: 'write()' }, stats: [{ l: 'survives power cut', v: 'no', cls: 'bad' }] },
      { log: 'fsync makes the kernel write the dirty pages (and the file’s metadata through the journal) to the drive. The drive accepts them into its own write cache and may report success early.', callout: 'The data lands in the drive’s cache', code: 1, state: { at: 2, r: 'fsync: to drive' }, stats: [{ l: 'survives power cut', v: 'not yet', cls: 'warn' }] },
      { log: 'The kernel also sends a cache flush (or writes with FUA) so the drive commits its cache to the media. Only when that completes does fsync return.', callout: 'Flush: to the media', moment: true, code: 1, state: { at: 3, r: 'flushed' }, stats: [{ l: 'survives power cut', v: 'yes', cls: 'ok' }] },
      { log: 'Now the service acknowledges. A power cut loses nothing the client was told about. New or renamed files also need an fsync of the directory so the name itself is durable. The price is latency: an fsync waits for the device, often milliseconds.', callout: 'Acknowledge after fsync', code: 2, state: { at: 3, r: 'durable', cut: 'record survives, client told truth' }, stats: [{ l: 'client told', v: 'saved', cls: 'ok' }, { l: 'fsync cost', v: '~ms', cls: 'warn' }],
        takeaway: 'Durability costs a flush; batching many records per fsync (group commit) is how databases pay it once.' }
    ]
  };

  const EXPLAIN = `
<h3>1. A crash can interrupt any multi-step update</h3>
<p>Appending to a file changes a data block, an inode and an allocation bitmap, which live in different places on the disk. The disk does not write them together. A power cut between two of the writes leaves a disk that disagrees with itself: leaked space, or an inode pointing at garbage. Old file systems repaired this afterwards with <code>fsck</code>, which reads all metadata and takes time proportional to the disk size.</p>
<h3>2. Write-ahead journaling makes the update atomic</h3>
<p>A journaling file system first writes a description of the change into a log, then a commit record, and only then updates the real locations. On mount after a crash it replays every committed transaction and discards one with no commit record. Recovery is therefore bounded by the journal size, not the disk size. The commit record is written after a barrier so it can never reach the disk before the blocks it describes.</p>
<h3>3. What the journal protects</h3>
<p>ext4 by default (<code>data=ordered</code>) journals metadata only and writes file data before the metadata that points to it, so a crash never exposes stale bytes. <code>data=journal</code> also logs the data, writing everything twice. <code>data=writeback</code> gives no ordering between data and metadata. Copy-on-write file systems such as Btrfs and ZFS avoid a journal by never overwriting live blocks and switching a root pointer at the end.</p>
<h3>4. The journal protects the file system, not your data</h3>
<p>After a crash the disk is consistent, but the last few seconds of acknowledged <code>write()</code> calls may be missing, because they were still only in the page cache. Only <code>fsync</code> (or opening with <code>O_SYNC</code> / <code>O_DSYNC</code>) pushes data through the page cache and asks the drive to flush its own cache. After creating or renaming a file, the directory must be fsynced too. Databases depend on this ordering for their write-ahead logs.</p>
<h3>5. The trade-off</h3>
<p>Every guarantee costs a wait on the device. An fsync takes about a millisecond on a good SSD and many milliseconds on a disk, so calling it per record limits throughput. <b>Group commit</b> batches many records into one fsync. A drive with a power-loss-protected cache can acknowledge a flush quickly, a consumer drive with a volatile cache and a lying firmware cannot.</p>
<h3>6. The commands, in one place</h3>
<pre># journal mode and mount options
mount | grep ' / '; dumpe2fs -h /dev/sda1 | grep -i -E 'journal|features'
# time of fsync from the application's point of view
strace -T -e trace=fsync,fdatasync -p &lt;pid&gt;
# how much dirty data is waiting
grep -E 'Dirty|Writeback' /proc/meminfo
# is the drive cache volatile?
cat /sys/block/sda/queue/write_cache; hdparm -W /dev/sda</pre>`;

  window.COURSE.chapters[6] = {
    title: `Crash Consistency: Journals and fsync`,
    problem: `A power cut hits a rack at 03:12. After reboot one host takes 40 minutes in <code>fsck</code> before it serves again, and the order service finds that a few payments it had acknowledged a second earlier are missing from its log file. The file system came back consistent, and yet data the client was told was saved is gone.`,
    predict: {
      q: `A service calls <code>write()</code> on its log file, gets success, and tells the client “saved”. The power fails two seconds later with a journaling file system on a normal SSD. What can you rely on?`,
      opts: [
        `The record is on disk, because write() returned success`,
        `The file system is consistent, but the record may be missing unless fsync was called`,
        `The file system is corrupted, and the record is lost for sure`
      ],
      ans: 1,
      why: `The journal keeps the structure consistent. write() only reached the page cache, which is lost with the power, so the acknowledged record can disappear. fsync (and a drive that honours flush) is what makes it durable.`
    },
    explain: EXPLAIN,
    diagnose: [
      {
        t: `Long fsck or read-only remount after errors`,
        sym: `<b>A host spends a long time checking at boot, or the file system flips to read-only.</b>`,
        ctx: `An unclean shutdown on a large non-journaled or damaged volume, or a failing disk.`,
        why: `Without a clean journal replay, the file system needs a full scan, or the kernel remounts read-only (errors=remount-ro) to stop further damage.`,
        log: `EXT4-fs error (device sda1): ext4_find_entry:1455: inode #131074: comm app: reading directory lblock 0
EXT4-fs (sda1): Remounting filesystem read-only`,
        note: `Message formats as printed by the kernel; details vary.`,
        fix: [`Check <code>dmesg</code> and SMART (<code>smartctl -a</code>) for hardware errors first.`, `Run <code>fsck</code> on the unmounted device.`, `Restore from replicas or backup if data is lost.`, `Verify: the volume mounts read-write and the error does not return.`]
      },
      {
        t: `fsync latency spikes`,
        sym: `<b>A database’s commit latency jumps to hundreds of ms while the disk is saturated by other writes.</b>`,
        ctx: `A log-heavy service shares the device with a bulk writer.`,
        why: `An fsync must wait for the journal commit and for earlier queued writes on the same device.`,
        log: `$ strace -T -e trace=fsync -p 3120
fsync(7) = 0 <0.412803>`,
        note: `Value illustrative; <code>-T</code> prints the time spent in the call.`,
        fix: [`Put the write-ahead log on its own device or queue.`, `Use group commit so one fsync covers many records.`, `Trade-off: more records share the risk of one failed flush.`, `Verify: the p99 of fsync falls.`]
      },
      {
        t: `Acknowledged data lost after a power cut`,
        sym: `<b>The latest records are missing after reboot although the file system is clean.</b>`,
        ctx: `The service acknowledges after <code>write()</code>, not after <code>fsync()</code>, or the drive has a volatile write cache that ignores flushes.`,
        why: `The data lived in the page cache or the drive cache, both volatile.`,
        log: `$ cat /sys/block/sda/queue/write_cache
write back`,
        note: `“write back” means the drive has a volatile cache; flush matters.`,
        fix: [`Acknowledge only after fsync (or use O_DSYNC).`, `Fsync the directory after creating or renaming files.`, `Use drives with power-loss protection for logs.`, `Verify: a power-cut or <code>dm-flakey</code> test loses no acknowledged record.`]
      }
    ],
    scenarios: [cards, journal, durable]
  };
})();
