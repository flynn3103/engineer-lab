/* Chapter 10 "Transactions and Exactly-Once": scenes and Explain override (index 10, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Three scenes: an at-least-once job against a transactional one, a zombie producer fenced by the epoch, and a hanging transaction
   that pins the last stable offset. Offsets, ids and timings are illustrative.
   Defaults are for Kafka 3.9: transaction.timeout.ms 60000 (producer), transaction.max.timeout.ms 900000 (broker), isolation.level read_uncommitted. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const KDOC = 'https://kafka.apache.org/documentation/#';
  const KIP = 'https://cwiki.apache.org/confluence/display/KAFKA/';
  const KL = (u, t) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>';

  /* ---- 1. A crash between the output write and the offset commit ---- */
  const FOOT_TXN = 'Simplified: one order, one job, one crash. Offsets illustrative.';
  const txn = {
    id: 'txn', label: 'Commit or abort atomically', desc: 'Without a transaction the invoice and the offset commit are separate writes. With one, a crash before commitTransaction() leaves records that read_committed readers never see (illustrative).',
    codeLabel: 'Job code',
    code: {
      bug: [
        '// no transaction: at-least-once',
        'producer.send(invoice(order7731));          // visible at once',
        '// the node crashes here, before the offset is committed',
        'consumer.commitSync();                      // the offset commit comes last',
        '// restart: order 7731 is read again, a second invoice is written',
      ],
      fix: [
        'producer.initTransactions();   // transactional.id = invoice-job-0',
        'producer.beginTransaction();',
        'producer.send(invoice(order7731));',
        'producer.sendOffsetsToTransaction(offsets, consumer.groupMetadata());',
        '// crash before commitTransaction(): the attempt is aborted and hidden; the retry commits once',
      ],
    },
    scene: { w: 640, h: 420, footer: FOOT_TXN, panels: [
      { id: 'jb', x: 16, y: 58, w: 206, h: 290, title: 'Job', tone: 'info' },
      { id: 'iv', x: 232, y: 58, w: 398, h: 140, title: 'Topic invoices', tone: 'info' },
      { id: 'of', x: 232, y: 208, w: 398, h: 140, title: 'Input offset of the group', tone: 'info' },
    ], tokens: {
      rd: { label: 'read order 7731', sub: 'input offset 41', tone: 'cursor', w: 176 },
      cr: { label: 'crash', sub: 'before the commit', tone: 'bad', w: 176 },
      rs: { label: 'restart', sub: 'reads order 7731 again', tone: 'warn', w: 176 },
      tx: { label: 'transaction open', sub: 'PID 7, epoch 3', tone: 'live', w: 176 },
      ab: { label: 'transaction aborted', sub: 'by the coordinator', tone: 'warn', w: 176 },
      i1: { label: 'invoice 7731', sub: 'visible', tone: 'ok', w: 150 },
      i2: { label: 'invoice 7731', sub: 'duplicate, visible', tone: 'bad', w: 150 },
      p1: { label: 'invoice 7731', sub: 'pending, hidden', tone: 'warn', w: 150 },
      h1: { label: 'invoice 7731', sub: 'aborted, filtered', tone: 'delete', w: 150 },
      c1: { label: 'invoice 7731', sub: 'committed, once', tone: 'ok', w: 150 },
      o1: { label: 'committed 41', sub: 'not moved', tone: 'cursor', w: 190 },
      o2: { label: 'committed 42', sub: 'moved with the commit', tone: 'ok', w: 190 },
      o3: { label: 'offset write', sub: 'pending in the transaction', tone: 'warn', w: 190 },
    } },
    bug: [
      { log: 'The job reads order 7731 from offset 41 of the input. It will write an invoice to invoices and then commit offset 42 as a separate step.', callout: 'Read order 7731, then write, then commit', code: 0,
        at: { rd: { x: 28, y: 100 }, o1: { x: 250, y: 256 } }, stats: [{ l: 'guarantee', v: 'at least once', cls: 'warn' }] },
      { log: 'The invoice is written to the output topic. It is visible to every reader at once. The input offset has not moved yet.', callout: 'The invoice is visible at once', code: 1,
        at: { rd: { x: 28, y: 100 }, i1: { x: 250, y: 108 }, o1: { x: 250, y: 256 } }, stats: [{ l: 'invoices for 7731', v: '1' }] },
      { log: 'The node crashes between the invoice write and the offset commit. The invoice is in the log, and the committed offset is still 41.', callout: 'Crash between the write and the commit', moment: true, code: 2,
        at: { cr: { x: 28, y: 100 }, i1: { x: 250, y: 108 }, o1: { x: 250, y: 256 } }, stats: [{ l: 'invoice', v: 'written', cls: 'ok' }, { l: 'offset', v: 'not committed', cls: 'bad' }] },
      { log: 'The job restarts and asks for the committed offset. It is 41, so order 7731 is delivered again.', callout: 'Restart: order 7731 again', code: 4,
        at: { rs: { x: 28, y: 100 }, i1: { x: 250, y: 108 }, o1: { x: 250, y: 256 } }, stats: [{ l: 'resume at', v: 'offset 41', cls: 'warn' }] },
      { log: 'The job processes it again and writes a second invoice. Finance now has two invoices for one order.', callout: 'A second invoice is written', moment: true, code: 4,
        at: { rs: { x: 28, y: 100 }, i1: { x: 250, y: 108 }, i2: { x: 410, y: 108 }, o2: { x: 250, y: 256 } }, stats: [{ l: 'invoices for 7731', v: '2', cls: 'bad' }],
        takeaway: 'Writing the output and committing the input are two steps. A crash between them repeats the work.' },
    ],
    fix: [
      { log: 'The job registers its transactional.id with initTransactions(). The coordinator returns a producer ID and an epoch, and it fences older producers with the same id.', callout: 'initTransactions() gets a PID and an epoch', code: 0,
        at: { rd: { x: 28, y: 100 }, tx: { x: 28, y: 160 }, o1: { x: 250, y: 256 } }, stats: [{ l: 'producer ID', v: '7', cls: 'ok' }, { l: 'epoch', v: '3', cls: 'ok' }] },
      { log: 'Inside beginTransaction(), the job writes the invoice and the input offset as part of one transaction. The invoice is in the log but pending.', callout: 'Invoice and offset in one transaction', moment: true, code: 3,
        at: { rd: { x: 28, y: 100 }, tx: { x: 28, y: 160 }, p1: { x: 250, y: 108 }, o3: { x: 250, y: 256 } }, stats: [{ l: 'visible to read_committed', v: 'no', cls: 'ok' }] },
      { log: 'The node crashes before commitTransaction(). The transaction stays open until the coordinator aborts it after the transaction timeout.', callout: 'Crash before commitTransaction()', code: 4,
        at: { cr: { x: 28, y: 100 }, p1: { x: 250, y: 108 }, o3: { x: 250, y: 256 } }, stats: [{ l: 'transaction', v: 'open', cls: 'warn' }] },
      { log: 'The coordinator writes an abort marker. The pending invoice is skipped by read_committed readers, and the offset write is discarded: the committed offset stays 41.', callout: 'The coordinator aborts the attempt', code: 4,
        at: { ab: { x: 28, y: 100 }, h1: { x: 250, y: 108 }, o1: { x: 250, y: 256 } }, stats: [{ l: 'invoices visible', v: '0', cls: 'ok' }, { l: 'committed offset', v: '41', cls: 'ok' }] },
      { log: 'The restarted job reads order 7731 again, and this time it commits. The invoice and the offset 42 become visible together, once.', callout: 'The retry commits, once', moment: true, code: 4,
        at: { rs: { x: 28, y: 100, tone: 'ok', sub: 'commitTransaction()' }, h1: { x: 250, y: 108 }, c1: { x: 410, y: 108 }, o2: { x: 250, y: 256 } }, stats: [{ l: 'invoices for 7731', v: '1', cls: 'ok' }, { l: 'committed offset', v: '42', cls: 'ok' }],
        takeaway: 'A transaction makes the output and the input offset one unit: both appear, or neither does.' },
    ],
  };

  /* ---- 2. A zombie producer: the epoch fences the older instance ---- */
  const fence = {
    id: 'fencing', label: 'Zombie producer and fencing', desc: 'A paused pod wakes up after its replacement has started. Without a transactional.id it writes a duplicate; with one, the epoch rejects it (ids and epochs illustrative).',
    codeLabel: 'Producer config',
    code: {
      bug: [
        '# no transactional.id: the producer has no identity the broker can compare',
        '# pod A pauses (a long garbage collection or a freeze) while it holds order 7731',
        '# the orchestrator starts pod B, which handles order 7731 and writes the invoice',
        '# pod A wakes up and writes its invoice for the same order as well',
      ],
      fix: [
        'transactional.id=invoice-job-0      # the same id for A and B: one logical producer',
        '# B calls initTransactions(): the coordinator bumps the epoch from 3 to 4',
        '# A wakes up and writes with epoch 3: ProducerFencedException',
        '# only B commits',
      ],
    },
    scene: { w: 640, h: 420, footer: 'Simplified: two pods of one job, one order. Epochs illustrative.', panels: [
      { id: 'pa', x: 16, y: 58, w: 194, h: 290, title: 'Pod A (old)', tone: 'info' },
      { id: 'pb', x: 220, y: 58, w: 194, h: 290, title: 'Pod B (new)', tone: 'info' },
      { id: 'lg', x: 424, y: 58, w: 206, h: 290, title: 'Broker', tone: 'info' },
    ], tokens: {
      a1: { label: 'handles order', sub: '7731', tone: 'cursor', w: 160 },
      a2: { label: 'paused', sub: 'long GC pause', tone: 'warn', w: 160 },
      a3: { label: 'wakes up', sub: 'still thinks it owns it', tone: 'live', w: 160 },
      a4: { label: 'fenced', sub: 'ProducerFencedException', tone: 'bad', w: 160, h: 52 },
      b1: { label: 'starts', sub: 'takes over order 7731', tone: 'cursor', w: 160 },
      b2: { label: 'initTransactions()', sub: 'epoch 3 to 4', tone: 'live', w: 160 },
      b3: { label: 'commits', sub: 'epoch 4', tone: 'ok', w: 160 },
      v1: { label: 'invoice 7731', sub: 'from pod B', tone: 'ok', w: 176 },
      v2: { label: 'invoice 7731', sub: 'from pod A: duplicate', tone: 'bad', w: 176 },
      v3: { label: 'write from A', sub: 'epoch 3 rejected', tone: 'delete', w: 176 },
      ep: { label: 'epoch 4', sub: 'current for the id', tone: 'info', w: 176 },
    } },
    bug: [
      { log: 'Pod A is handling order 7731. It has read the order and is about to write the invoice.', callout: 'Pod A handles order 7731', code: 0,
        at: { a1: { x: 28, y: 100 } }, stats: [{ l: 'transactional.id', v: 'none', cls: 'warn' }] },
      { log: 'Pod A freezes for a long garbage collection. The orchestrator sees a failed health check and starts a replacement.', callout: 'Pod A freezes', code: 1,
        at: { a2: { x: 28, y: 100 } }, stats: [{ l: 'pod A', v: 'paused', cls: 'warn' }] },
      { log: 'Pod B starts, reads order 7731 and writes the invoice. The invoice is visible at once.', callout: 'Pod B writes the invoice', code: 2,
        at: { a2: { x: 28, y: 100 }, b1: { x: 232, y: 100 }, v1: { x: 436, y: 100 } }, stats: [{ l: 'invoices for 7731', v: '1' }] },
      { log: 'Pod A wakes up. Nothing tells the broker that A is old, so its write is accepted as a normal write.', callout: 'Pod A wakes up and writes', moment: true, code: 3,
        at: { a3: { x: 28, y: 100 }, b1: { x: 232, y: 100 }, v1: { x: 436, y: 100 }, v2: { x: 436, y: 160 } }, stats: [{ l: 'invoices for 7731', v: '2', cls: 'bad' }],
        takeaway: 'Without an identity, the broker cannot tell an old instance from a new one. A paused pod can still write.' },
    ],
    fix: [
      { log: 'Pods A and B use the same transactional.id. The coordinator maps that id to one producer ID and a current epoch, now 3. Pod A is working with it.', callout: 'One id, one logical producer', code: 0,
        at: { a1: { x: 28, y: 100 }, ep: { x: 436, y: 100, sub: 'epoch 3' } }, stats: [{ l: 'epoch', v: '3', cls: 'ok' }] },
      { log: 'Pod A freezes. The orchestrator starts pod B, which calls initTransactions(). The coordinator bumps the epoch to 4 and aborts any open transaction of the old epoch.', callout: 'initTransactions() bumps the epoch to 4', moment: true, code: 1,
        at: { a2: { x: 28, y: 100 }, b2: { x: 232, y: 100 }, ep: { x: 436, y: 100 } }, stats: [{ l: 'epoch', v: '4', cls: 'ok' }] },
      { log: 'Pod A wakes up and tries to write with epoch 3. The broker compares it with the current epoch 4 and rejects the write with ProducerFencedException.', callout: 'The old epoch is fenced', code: 2,
        at: { a4: { x: 28, y: 100 }, b2: { x: 232, y: 100 }, ep: { x: 436, y: 100 }, v3: { x: 436, y: 160 } }, stats: [{ l: 'write from A', v: 'rejected', cls: 'ok' }] },
      { log: 'Pod B writes the invoice inside its transaction and commits it with epoch 4. There is one invoice, and pod A cannot add another.', callout: 'Only pod B commits', code: 3,
        at: { a4: { x: 28, y: 100 }, b3: { x: 232, y: 100 }, ep: { x: 436, y: 100 }, v1: { x: 436, y: 160 } }, stats: [{ l: 'invoices for 7731', v: '1', cls: 'ok' }],
        takeaway: 'The epoch fences a zombie. Never run two live instances with the same transactional.id: they fence each other.' },
    ],
  };

  /* ---- 3. A hanging transaction pins the last stable offset ---- */
  const HO = 10;
  const OX = i => 26 + 52 * i;
  const LT = {};
  for (let i = 0; i < HO; i++) LT['q' + i] = { label: String(i), sub: '', tone: 'ok', w: 46, h: 40 };
  const log2 = (n, over) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['q' + i, { x: OX(i), y: 100, ...(over && over[i] ? over[i] : {}) }]));
  const OPEN = { 4: { tone: 'warn' }, 5: { tone: 'warn' } };
  const lso = {
    id: 'lso', label: 'Hanging txn pins LSO', desc: 'One open transaction stops read_committed readers at the last stable offset, while committed records behind it wait (offsets illustrative).',
    codeLabel: 'CLI',
    code: {
      bug: [
        '# a producer crashed inside an open transaction that began at offset 4',
        '# read_committed consumers stop at the last stable offset (LSO), which is 4',
        'kafka-transactions.sh --bootstrap-server b1:9092 find-hanging --broker-id 1',
        '# transaction.timeout.ms is long, so the transaction stays open',
      ],
      fix: [
        'kafka-transactions.sh abort --topic orders --partition 3 --start-offset 4',
        'transaction.timeout.ms=60000   # shorter, illustrative: the coordinator aborts by itself',
        '# an abort marker is written at offset 10: the LSO moves to the log end',
        '# read_committed lag drains; the records of offsets 4-5 are skipped',
      ],
    },
    scene: { w: 640, h: 420, footer: 'Simplified: one partition, ten offsets. Offsets illustrative.', panels: [
      { id: 'lg', x: 16, y: 58, w: 614, h: 142, title: 'orders-3, oldest on the left', tone: 'info' },
      { id: 'rd', x: 16, y: 212, w: 614, h: 136, title: 'Readers', tone: 'info' },
    ], tokens: {
      ...LT,
      q10: { label: 'abort', sub: 'marker', tone: 'delete', w: 46, h: 40 },
      lso: { label: 'LSO 4', sub: 'last stable offset', tone: 'warn', w: 130, h: 40 },
      lso2: { label: 'LSO 11', sub: 'log end', tone: 'ok', w: 130, h: 40 },
      rc: { label: 'read_committed', sub: 'stops at the LSO', tone: 'cursor', w: 180 },
      rc2: { label: 'read_committed', sub: 'reads up to 11', tone: 'ok', w: 180 },
      ru: { label: 'read_uncommitted', sub: 'sees every offset', tone: 'info', w: 190 },
      lag: { label: 'lag', sub: 'growing', tone: 'bad', w: 120 },
    } },
    bug: [
      { log: 'A producer starts a transaction and writes offsets 4 and 5. Other producers have written committed records at 0 to 3.', callout: 'Offsets 4-5 belong to an open transaction', code: 0,
        at: { ...log2(6, OPEN), lso: { x: OX(4) - 40, y: 148 } }, stats: [{ l: 'open transaction', v: 'offsets 4-5', cls: 'warn' }] },
      { log: 'More producers write committed records at offsets 6 to 9. They are complete, but they sit after the open transaction.', callout: 'Committed records 6-9 follow it', code: 0,
        at: { ...log2(10, OPEN), lso: { x: OX(4) - 40, y: 148 } }, stats: [{ l: 'log end offset', v: '10' }] },
      { log: 'The producer with the open transaction crashes. Nobody commits or aborts it, and transaction.timeout.ms is long.', callout: 'The producer crashes, the transaction hangs', moment: true, code: 3,
        at: { ...log2(10, { 4: { tone: 'bad' }, 5: { tone: 'bad' } }), lso: { x: OX(4) - 40, y: 148 } }, stats: [{ l: 'transaction', v: 'hanging', cls: 'bad' }] },
      { log: 'The last stable offset is the first offset of the earliest open transaction, so it is pinned at 4. A read_committed reader may not read past it.', callout: 'The LSO is pinned at offset 4', code: 1,
        at: { ...log2(10, { 4: { tone: 'bad' }, 5: { tone: 'bad' } }), lso: { x: OX(4) - 40, y: 148 }, rc: { x: 28, y: 262 } }, stats: [{ l: 'LSO', v: '4 (frozen)', cls: 'bad' }] },
      { log: 'Offsets 6 to 9 are committed, but the reader cannot go past 4. Its lag grows, and so does the end-to-end delay of everything behind the stuck transaction.', callout: 'Committed records wait behind it', moment: true, code: 2,
        at: { ...log2(10, { 4: { tone: 'bad' }, 5: { tone: 'bad' }, 6: { tone: 'warn' }, 7: { tone: 'warn' }, 8: { tone: 'warn' }, 9: { tone: 'warn' } }), lso: { x: OX(4) - 40, y: 148 }, rc: { x: 28, y: 262 }, lag: { x: 230, y: 262 } }, stats: [{ l: 'read_committed lag', v: 'growing', cls: 'bad' }],
        takeaway: 'One open transaction pins the LSO of its partition. Every read_committed reader waits behind it.' },
    ],
    fix: [
      { log: 'Measure first: find-hanging lists transactions that have stayed open longer than expected. This one began at offset 4 of orders-3.', callout: 'Find the hanging transaction', code: 0,
        at: { ...log2(10, { 4: { tone: 'bad' }, 5: { tone: 'bad' } }), lso: { x: OX(4) - 40, y: 148 }, rc: { x: 28, y: 262 } }, stats: [{ l: 'hanging since', v: 'offset 4', cls: 'warn' }] },
      { log: 'The transaction is ended: the stuck producer is restarted so it aborts, or an operator runs the abort command, or the coordinator aborts it when the timeout passes.', callout: 'End the transaction', moment: true, code: 1,
        at: { ...log2(10, { 4: { tone: 'bad' }, 5: { tone: 'bad' } }), lso: { x: OX(4) - 40, y: 148 }, rc: { x: 28, y: 262 } }, stats: [{ l: 'transaction.timeout.ms', v: '60000 (illustrative)', cls: 'ok' }] },
      { log: 'An abort marker is written to the partition at offset 10. The marker takes an offset itself, so the log end becomes 11.', callout: 'An abort marker is appended', code: 2,
        at: { ...log2(10, { 4: { tone: 'delete' }, 5: { tone: 'delete' } }), q10: { x: OX(10), y: 100 }, rc: { x: 28, y: 262 } }, stats: [{ l: 'log end offset', v: '11', cls: 'ok' }] },
      { log: 'No transaction is open any more, so the LSO moves to the log end. The read_committed reader goes on to offset 6 and reads the committed records, and it skips 4-5.', callout: 'The LSO jumps to the log end', code: 3,
        at: { ...log2(10, { 4: { tone: 'delete' }, 5: { tone: 'delete' } }), q10: { x: OX(10), y: 100 }, lso2: { x: OX(7), y: 148 }, rc2: { x: 28, y: 262 } }, stats: [{ l: 'LSO', v: 'equal to the log end', cls: 'ok' }, { l: 'read_committed lag', v: 'draining', cls: 'ok' }] },
      { log: 'A read_uncommitted consumer is different. It returns every record in offset order, including the aborted ones at 4 and 5. Isolation only applies to readers that ask for it.', callout: 'read_uncommitted still sees aborted records', moment: true, code: 3,
        at: { ...log2(10, { 4: { tone: 'delete' }, 5: { tone: 'delete' } }), q10: { x: OX(10), y: 100 }, lso2: { x: OX(7), y: 148 }, rc2: { x: 28, y: 262 }, ru: { x: 230, y: 262 } }, stats: [{ l: 'default isolation.level', v: 'read_uncommitted', cls: 'warn' }],
        takeaway: 'Bound open transactions with transaction.timeout.ms. Set read_committed where aborted data must stay hidden.' },
    ],
  };

  window.CHAPTER_OVERRIDES[10] = { explain: `
<h3>1. Three logs, and a crash in between</h3>
<p>A read-process-write job touches three places: it reads from an input topic, it writes to an output topic, and it records its progress as a committed offset in <code>__consumer_offsets</code>. A crash between the output write and the offset commit leaves the job half done. After a restart the job reads the same input again and writes the same output again. That is the duplicate in the problem. Idempotent producers (chapter 4) stop a duplicate caused by a retry. They do not stop a duplicate caused by a restart, because the new run is a different producer session.</p>

<h3>2. A transaction makes them one unit</h3>
<p>A transaction groups the output writes, to any number of partitions and topics, and the input offset commit into one atomic unit. Either all of it becomes visible, or none of it does. In code the job calls <code>initTransactions()</code> once, then for each batch <code>beginTransaction()</code>, <code>send()</code> for the outputs, <code>sendOffsetsToTransaction(offsets, consumer.groupMetadata())</code> for the inputs, and <code>commitTransaction()</code>. If anything fails it calls <code>abortTransaction()</code>. The producer needs a <code>transactional.id</code>, and it implies <code>acks=all</code> and idempotence.</p>

<h3>3. The transaction coordinator and the markers</h3>
<p>A <b>transaction coordinator</b>, one broker for each transactional id, keeps the state of each transaction in the internal topic <code>__transaction_state</code>. It records which partitions the transaction has written to. When the job commits or aborts, the coordinator writes a <b>control marker</b> to each of those partitions. A marker is a record in the log, with an offset of its own, so a log with transactions has offsets that no consumer ever returns. A transaction that is not finished within <code>transaction.timeout.ms</code> (default 60 s, capped by the broker’s <code>transaction.max.timeout.ms</code>) is aborted by the coordinator.</p>

<h3>4. Fencing zombies with the epoch</h3>
<p><code>initTransactions()</code> maps the transactional id to one producer ID and bumps its <b>epoch</b>. An older producer with the same id now has a lower epoch, and its writes fail with <code>ProducerFencedException</code>. A paused pod that wakes up after its replacement started is such a zombie. The same mechanism also means that two live instances with the same id fence each other for ever, so each logical producer needs its own id. In a consumer group, give each partition’s work a stable id, or use the group metadata form of <code>sendOffsetsToTransaction</code> (KIP-447) so fencing follows the group generation.</p>

<h3>5. What readers see: isolation.level and the LSO</h3>
<p>Transactions hide data only from consumers that ask. With <code>isolation.level=read_committed</code> a consumer returns only committed records and skips aborted ones. It cannot read past the <b>last stable offset (LSO)</b>, the first offset of the earliest transaction that is still open. With the default <code>read_uncommitted</code> a consumer returns every record in offset order, including records of open and aborted transactions. A transaction that hangs pins the LSO of every partition it touched, and every read_committed reader waits behind it. Use <code>kafka-transactions.sh find-hanging</code> to find it and <code>abort</code> to end it.</p>

<h3>6. What exactly-once covers, and its cost</h3>
<p>Exactly-once holds inside Kafka: the read from a topic, the write to topics and the offset commit are atomic. It does not extend to a database or an API that the job calls on the side. For those, you still need an idempotent write, such as an upsert keyed by the record. A read_committed reader lags the log end by the length of the longest open transaction, so short transactions mean lower latency. Each transaction adds requests to the coordinator and one marker for each partition, so very small batches are expensive. Kafka Streams turns all of this on with <code>processing.guarantee=exactly_once_v2</code>.</p>

<h3>7. Syntax</h3>
<pre># producer.properties
transactional.id=invoice-job-0
transaction.timeout.ms=60000

# consumer.properties (the readers of the output)
isolation.level=read_committed

// job code
producer.initTransactions();
producer.beginTransaction();
producer.send(invoice);
producer.sendOffsetsToTransaction(offsets, consumer.groupMetadata());
producer.commitTransaction();     // or abortTransaction() on failure

# find and end hanging transactions
kafka-transactions.sh --bootstrap-server b1:9092 find-hanging --broker-id 1
kafka-transactions.sh --bootstrap-server b1:9092 abort --topic orders --partition 3 --start-offset 4</pre>
<p>More: ${KL(KDOC + 'semantics', 'Message delivery semantics')}, ${KL(KDOC + 'producerconfigs_transactional.id', 'transactional.id')} and ${KL(KIP + 'KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging', 'KIP-98: exactly-once delivery and transactions')}.</p>`, scenarios: [txn, fence, lso] };
})();
