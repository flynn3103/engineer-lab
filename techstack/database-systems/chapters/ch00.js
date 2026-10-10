/* Chapter 1 "Relational Model and SQL" (index 0, zero-based): scenes, Explain text and course fields.
   Lectures: CMU 15-445 L01 Relational Model and Algebra, L02 Modern SQL.
   Loads after course.js and scene-tools.js; course.html merges CHAPTER_OVERRIDES into the course.
   Scenes, each a different mechanism: join pairs as lines between tables, a NOT IN truth-value gate, a UNIQUE gate on inserts,
   and GROUP BY collapsing rows next to a window function keeping them. All numbers illustrative. */
(function () {
  const DB = window.DB;
  const CUST = [['Ana', 1], ['Ben', 2], ['Cy', 3]];
  const ORD = [['o1', 'Ana', 65], ['o2', 'Ben', 20], ['o3', 'Ben', 40]];
  const cy = i => 96 + i * 62;

  /* ---- 1. A join is a set of lines: with no ON condition every customer pairs with every order ---- */
  const joinPairs = {
    id: 'join-pairs', label: 'Join pairs', desc: 'A join keeps a pair of rows only when the ON condition holds. With no condition, 3 customers and 3 orders make 9 pairs (amounts illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'SELECT c.name, SUM(o.amount) AS revenue',
      'FROM customers c, orders o   -- no join condition',
      'GROUP BY c.name;',
      '-- with ON o.customer_id = c.id:',
      'SELECT c.name, SUM(o.amount) FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.name;',
    ] },
    stage: DB.stage({
      footer: 'Simplified: 3 customers, 3 orders, amounts illustrative.',
      header: s => ({ left: 'pairs kept: ' + (s.pairs == null ? 3 : s.pairs), right: s.on ? 'ON o.customer_id = c.id' : 'no ON condition' }),
      draw(P, s) {
        P.text('hc', { x: 30, y: 82, t: 'customers', cls: 'mut sm' });
        P.text('ho', { x: 300, y: 82, t: 'orders', cls: 'mut sm' });
        CUST.forEach(([n, id], i) => P.chip('c' + i, { x: 30, y: cy(i), w: 112, h: 44, label: n, sub: 'id ' + id, tone: s.focus === i ? 'cursor' : (s.on && i === 2 ? 'mut' : 'info') }));
        ORD.forEach(([n, who, amt], i) => P.chip('o' + i, { x: 300, y: cy(i), w: 130, h: 44, label: n + ' · ' + amt, sub: 'customer ' + who, tone: 'info' }));
        const lines = s.lines || [];
        lines.forEach(([a, b], k) => {
          const real = ORD[b][1] === CUST[a][0];
          P.line('p' + k, 142, cy(a) + 22, 300, cy(b) + 22, { tone: s.on ? 'ok' : (real ? 'ok' : 'bad'), arrow: false, sw: s.on ? 2.4 : 1.4 });
        });
        if (s.res) {
          P.text('hr', { x: 470, y: 82, t: 'SUM(amount)', cls: 'mut sm' });
          s.res.forEach(([n, v, bad], i) => P.chip('r' + i, { x: 470, y: cy(i), w: 140, h: 44, label: n + ' ' + v, sub: bad ? 'wrong' : 'correct', tone: bad ? 'bad' : 'ok' }));
        }
      }
    }),
    bug: [
      { log: 'Three customers and three orders. Ben has two orders worth 20 and 40, so his real total is 60 (illustrative).', callout: 'Ben really owes 60', code: 0,
        state: { pairs: 3 }, stats: [{ l: 'customers', v: '3' }, { l: 'orders', v: '3' }] },
      { log: 'The FROM clause lists both tables with a comma and no condition. Ben is paired with the first order.', callout: 'No condition: Ben pairs with o1', code: 1,
        state: { focus: 1, lines: [[1, 0]], pairs: 1 }, stats: [{ l: 'pairs', v: '1', cls: 'warn' }] },
      { log: 'Ben is paired with every order, even the ones that belong to Ana. The database does not know what you meant.', callout: 'Ben pairs with all three orders', code: 1,
        state: { focus: 1, lines: [[1, 0], [1, 1], [1, 2]], pairs: 3 }, stats: [{ l: 'pairs for Ben', v: '3', cls: 'bad' }] },
      { log: 'Every customer is paired with every order: 3 × 3 = 9 pairs. The query still runs and returns no error.', callout: '3 × 3 = 9 pairs', code: 1,
        state: { lines: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], pairs: 9 }, stats: [{ l: 'pairs', v: '9', cls: 'bad' }, { l: 'real pairs', v: '3', cls: 'ok' }] },
      { log: 'SUM runs over the nine pairs. Every customer now shows 65 + 20 + 40 = 125, including Cy, who has no order at all.', callout: 'Ben shows 125, his real total is 60', moment: true, code: 2,
        state: { lines: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], pairs: 9, res: [['Ana', 125, 1], ['Ben', 125, 1], ['Cy', 125, 1]] },
        stats: [{ l: 'Ben reported', v: '125', cls: 'bad' }, { l: 'Ben real', v: '60', cls: 'ok' }] },
      { log: 'Add ON o.customer_id = c.id. A pair survives only when the condition is true, so the other six pairs disappear.', callout: 'ON keeps only the matching pairs', code: 3,
        state: { on: 1, lines: [[0, 0], [1, 1], [1, 2]], pairs: 3 }, stats: [{ l: 'pairs', v: '3', cls: 'ok' }] },
      { log: 'Now SUM covers three pairs. Ana is 65 and Ben is 60. An inner join drops Cy, who has no order (use LEFT JOIN to keep him).', callout: 'Ana 65, Ben 60', code: 4,
        state: { on: 1, lines: [[0, 0], [1, 1], [1, 2]], pairs: 3, res: [['Ana', 65, 0], ['Ben', 60, 0]] }, stats: [{ l: 'Ben reported', v: '60', cls: 'ok' }, { l: 'pairs', v: '3', cls: 'ok' }],
        takeaway: 'A join with no condition multiplies rows and the query still runs. Count the rows after every join and compare with what you expect.' },
    ],
  };

  /* ---- 2. NOT IN: one UNKNOWN in the list makes the whole test UNKNOWN, and WHERE keeps only TRUE ---- */
  const LIST2 = [1, 2], LIST3 = [1, 2, null];
  const nullIn = {
    id: 'null-in', label: 'NOT IN meets NULL', desc: 'Customers whose id is NOT IN the order list. A comparison with NULL is UNKNOWN, and WHERE keeps only TRUE (ids illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      "-- orders.customer_id holds 1, 2 and NULL (a guest order)",
      'SELECT name FROM customers',
      'WHERE id NOT IN (SELECT customer_id FROM orders);',
      '-- the safe form',
      'SELECT name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);',
    ] },
    stage: DB.stage({
      footer: 'Simplified: testing customer 3 against the order list. Ids illustrative.',
      header: s => ({ left: 'list: ' + (s.list === LIST3 ? '1, 2, NULL' : '1, 2'), right: s.exists ? 'NOT EXISTS' : 'NOT IN' }),
      draw(P, s) {
        const list = s.list || LIST2, cmp = s.cmp || 0, x0 = 40, gx = 128;
        P.text('hl', { x: 40, y: 82, t: 'values in orders.customer_id', cls: 'mut sm' });
        list.forEach((v, i) => P.chip('l' + i, { x: x0 + i * gx, y: 92, w: 100, h: 40, label: v == null ? 'NULL' : String(v), sub: v == null ? 'unknown' : 'known', tone: v == null ? 'warn' : 'info' }));
        if (s.test) P.chip('t', { x: 470, y: 92, w: 140, h: 40, label: 'id = 3', sub: 'Cy, no orders', tone: 'cursor' });
        P.text('hc', { x: 40, y: 168, t: s.exists ? 'EXISTS finds no row, so NOT EXISTS is TRUE' : 'test  3 <> value  for each value', cls: 'mut sm' });
        if (!s.exists) list.forEach((v, i) => {
          if (i < cmp) P.chip('c' + i, { x: x0 + i * gx, y: 178, w: 100, h: 44, label: '3 <> ' + (v == null ? 'NULL' : v), sub: v == null ? 'UNKNOWN' : 'TRUE', tone: v == null ? 'warn' : 'ok' });
        });
        if (s.res) {
          const u = s.res === 'unknown';
          P.line('a', 300, 224, 300, 252, { tone: u ? 'warn' : 'ok', arrow: true });
          P.chip('r', { x: 190, y: 256, w: 220, h: 44, label: s.exists ? 'NOT EXISTS: TRUE' : 'AND of all: ' + (u ? 'UNKNOWN' : 'TRUE'), sub: u ? 'one UNKNOWN poisons the AND' : 'every comparison is TRUE', tone: u ? 'warn' : 'ok' });
        }
        P.text('hw', { x: 470, y: 168, t: 'WHERE keeps only TRUE', cls: 'mut sm' });
        P.box('gate', { x: 470, y: 178, w: 140, h: 122, tone: 'mut', label: '', dash: true });
        if (s.kept) P.chip('k', { x: 482, y: 214, w: 116, h: 44, label: 'Cy kept', sub: 'row returned', tone: 'ok' });
        if (s.dropped) P.chip('d', { x: 482, y: 214, w: 116, h: 44, label: 'Cy dropped', sub: 'no error', tone: 'bad' });
      }
    }),
    bug: [
      { log: 'The report wants customers who have no orders. The subquery lists the customer ids found in orders: 1 and 2.', callout: 'The list holds 1 and 2', code: 2,
        state: { list: LIST2, test: 1 }, stats: [{ l: 'list size', v: '2' }] },
      { log: 'Test customer 3 against the first value. 3 <> 1 is TRUE.', callout: '3 <> 1 is TRUE', code: 2,
        state: { list: LIST2, test: 1, cmp: 1 }, stats: [{ l: 'comparisons TRUE', v: '1', cls: 'ok' }] },
      { log: 'The second value gives TRUE as well. Every comparison is TRUE, so NOT IN is TRUE.', callout: 'Every comparison is TRUE', code: 2,
        state: { list: LIST2, test: 1, cmp: 2, res: 'true' }, stats: [{ l: 'comparisons TRUE', v: '2', cls: 'ok' }] },
      { log: 'WHERE keeps rows whose condition is TRUE. Cy is kept, which is the answer the report wanted.', callout: 'WHERE keeps Cy', code: 2,
        state: { list: LIST2, test: 1, cmp: 2, res: 'true', kept: 1 }, stats: [{ l: 'rows returned', v: '1', cls: 'ok' }] },
      { log: 'Now a guest order arrives with customer_id NULL. The list becomes 1, 2 and NULL. Run the same test again.', callout: 'A guest order adds a NULL', code: 0,
        state: { list: LIST3, test: 1 }, stats: [{ l: 'list size', v: '3', cls: 'warn' }] },
      { log: 'Two comparisons are TRUE. The third, 3 <> NULL, is UNKNOWN, because nobody knows what NULL equals.', callout: '3 <> NULL is UNKNOWN, not TRUE', code: 2,
        state: { list: LIST3, test: 1, cmp: 3, res: 'unknown' }, stats: [{ l: 'comparisons TRUE', v: '2', cls: 'ok' }, { l: 'UNKNOWN', v: '1', cls: 'warn' }] },
      { log: 'A chain of ANDs with one UNKNOWN is UNKNOWN, and WHERE drops UNKNOWN. Cy vanishes with no error and no warning.', callout: 'UNKNOWN is dropped: zero rows', moment: true, code: 2,
        state: { list: LIST3, test: 1, cmp: 3, res: 'unknown', dropped: 1 }, stats: [{ l: 'rows returned', v: '0', cls: 'bad' }, { l: 'errors', v: '0', cls: 'warn' }] },
      { log: 'NOT EXISTS asks whether any matching order row exists for Cy. The NULL row never matches, so the answer is a clean TRUE.', callout: 'NOT EXISTS ignores the NULL row', code: 4,
        state: { list: LIST3, test: 1, exists: 1, res: 'true', kept: 1 }, stats: [{ l: 'rows returned', v: '1', cls: 'ok' }],
        takeaway: 'Never use NOT IN over a column that can be NULL. Use NOT EXISTS, or filter the NULLs out of the list.' },
    ],
  };

  /* ---- 3. UNIQUE: the same person loaded twice is two rows until the database refuses the second ---- */
  const dupUnique = {
    id: 'dup-unique', label: 'UNIQUE gate', desc: 'Without a UNIQUE constraint a retried load inserts Ana twice, and the mailing job emails two copies (counts illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'INSERT INTO customers (email, name) VALUES (\'ana@shop.io\', \'Ana\');',
      '-- the loader retries after a timeout and inserts it again',
      'SELECT COUNT(*) FROM customers;            -- 2 rows, 1 person',
      'ALTER TABLE customers ADD CONSTRAINT customers_email_key UNIQUE (email);',
      'INSERT ... ON CONFLICT (email) DO NOTHING;  -- the retry is now harmless',
    ] },
    stage: DB.stage({
      footer: 'Simplified: one table, one loader, one mailing job. Counts illustrative.',
      header: s => ({ left: 'rows in table: ' + (s.rows || 0), right: s.guard ? 'UNIQUE (email) on' : 'no constraint' }),
      draw(P, s) {
        P.text('ht', { x: 30, y: 82, t: 'customers', cls: 'mut sm' });
        P.box('tbl', { x: 30, y: 92, w: 250, h: 150, tone: 'mut', label: '', dash: !s.guard, stroke: s.guard ? 'ok' : null });
        for (let i = 0; i < (s.rows || 0); i++) P.chip('row' + i, { x: 44, y: 104 + i * 54, w: 222, h: 44, label: 'ana@shop.io', sub: 'row ' + (i + 1) + ' · Ana', tone: i === 1 && !s.guard ? 'bad' : 'ok' });
        if (s.guard) P.chip('key', { x: 90, y: 252, w: 130, h: 36, label: 'UNIQUE', sub: '', tone: 'acc' });
        if (s.ins === 1) P.chip('ins', { x: 310, y: 116, w: 130, h: 44, label: 'INSERT Ana', sub: 'first load', tone: 'cursor' });
        if (s.ins === 2) P.chip('ins', { x: 310, y: 116, w: 130, h: 44, label: 'INSERT Ana', sub: 'retry', tone: 'cursor' });
        if (s.ins === 3) P.chip('ins', { x: 152, y: 190, w: 130, h: 44, label: 'INSERT Ana', sub: 'retry', tone: 'cursor' });
        if (s.bounce) P.chip('err', { x: 310, y: 186, w: 150, h: 44, label: 'ERROR 23505', sub: 'duplicate key', tone: 'bad' });
        if (s.skip) P.chip('skip', { x: 310, y: 186, w: 150, h: 44, label: 'DO NOTHING', sub: 'no second row', tone: 'ok' });
        P.text('hm', { x: 480, y: 82, t: 'mailing job', cls: 'mut sm' });
        for (let i = 0; i < (s.mail || 0); i++) P.chip('m' + i, { x: 480, y: 92 + i * 54, w: 130, h: 44, label: 'email ' + (i + 1), sub: 'to ana@shop.io', tone: i ? 'bad' : 'live' });
      }
    }),
    bug: [
      { log: 'The loader inserts Ana once. The table has one row for one person.', callout: 'One person, one row', code: 0,
        state: { rows: 1, ins: 1 }, stats: [{ l: 'rows', v: '1', cls: 'ok' }, { l: 'people', v: '1', cls: 'ok' }] },
      { log: 'The insert times out on the client side, so the loader retries the same row. The table has no constraint on email.', callout: 'A retry sends the same row again', code: 1,
        state: { rows: 1, ins: 2 }, stats: [{ l: 'rows', v: '1' }] },
      { log: 'Nothing stops it. Ana is stored twice: two rows, one person.', callout: 'The table accepts the duplicate', moment: true, code: 2,
        state: { rows: 2 }, stats: [{ l: 'rows', v: '2', cls: 'bad' }, { l: 'people', v: '1', cls: 'ok' }] },
      { log: 'The mailing job reads one row per customer, so it sends Ana two emails.', callout: 'The mailing job emails Ana twice', code: 2,
        state: { rows: 2, mail: 2 }, stats: [{ l: 'emails sent', v: '2', cls: 'bad' }, { l: 'COUNT(*)', v: '2', cls: 'bad' }] },
      { log: 'Clean up the duplicate, then add UNIQUE (email). The database now checks every insert against an index on email.', callout: 'Add a UNIQUE constraint on email', code: 3,
        state: { rows: 1, guard: 1 }, stats: [{ l: 'rows', v: '1', cls: 'ok' }] },
      { log: 'The loader retries again. The insert is checked against the unique index before it is written.', callout: 'The retry hits the unique index', code: 4,
        state: { rows: 1, guard: 1, ins: 3 }, stats: [{ l: 'index probes', v: '1' }] },
      { log: 'The key already exists, so the insert is refused with a unique violation. The table is unchanged.', callout: 'The second insert is refused', code: 4,
        state: { rows: 1, guard: 1, bounce: 1 }, stats: [{ l: 'rows', v: '1', cls: 'ok' }, { l: 'errors', v: '1', cls: 'warn' }] },
      { log: 'With ON CONFLICT (email) DO NOTHING the retry is silently skipped. The mailing job sends one email.', callout: 'The retry is harmless now', code: 4,
        state: { rows: 1, guard: 1, skip: 1, mail: 1 }, stats: [{ l: 'emails sent', v: '1', cls: 'ok' }, { l: 'rows', v: '1', cls: 'ok' }],
        takeaway: 'A rule kept in the database binds every writer. A rule kept in the loader binds only the loader.' },
    ],
  };

  const SOURCE = { label: 'CMU 15-445 L01 Relational Model and Algebra, L02 Modern SQL (notes in output/pdf/cmu-15445-fall2024)', href: '../../output/pdf/cmu-15445-fall2024/notes/01-relationalmodel.pdf' };

  /* ---- 4. GROUP BY collapses rows, a window function keeps them (Modern SQL, window functions) ---- */
  const ORDS = [['o1', 'Ana', 65], ['o2', 'Ben', 20], ['o3', 'Ben', 40], ['o4', 'Ana', 25]];
  const TOT = { Ana: 90, Ben: 60 };
  const wy = i => 96 + i * 54;
  const windowScene = {
    id: 'group-vs-window', label: 'GROUP BY or window', desc: 'The report needs each order next to its customer total. GROUP BY collapses four rows into two and the order ids are gone. A window function adds the total and keeps all four rows (amounts illustrative).',
    codeLabel: 'SQL',
    code: { bug: [
      'SELECT customer, SUM(amount) FROM orders GROUP BY customer;',
      '-- 4 rows in, 2 rows out: o1..o4 can no longer be shown',
      'SELECT id, customer, amount,',
      '       SUM(amount) OVER (PARTITION BY customer) AS cust_total,',
      '       amount * 100 / SUM(amount) OVER (PARTITION BY customer) AS pct',
      'FROM orders;                      -- 4 rows in, 4 rows out',
    ] },
    stage: DB.stage({
      footer: 'Simplified: four orders, two customers. Amounts illustrative.',
      header: s => ({ left: 'rows in the result: ' + (s.n == null ? 4 : s.n), right: s.mode === 'group' ? 'GROUP BY customer' : s.mode === 'win' ? 'SUM(...) OVER (PARTITION BY customer)' : 'orders table' }),
      draw(P, s) {
        P.text('hin', { x: 30, y: 82, t: 'orders', cls: 'mut sm' });
        ORDS.forEach(([id, who, amt], i) => {
          const tone = s.mode === 'group' && s.merge ? 'mut' : (s.part || s.mode === 'win' ? (who === 'Ana' ? 't0' : 't1') : 'info');
          P.chip('r' + i, { x: 30, y: wy(i), w: 150, h: 44, label: id + ' · ' + amt, sub: who, tone });
        });
        if (s.mode === 'group') {
          if (s.merge) ['Ana', 'Ben'].forEach((w, k) => P.chip('g' + k, { x: 330, y: wy(k * 1.5) + 12, w: 170, h: 52, label: w + ' · ' + TOT[w], sub: 'one row per group', tone: k ? 't1' : 't0' }));
          if (s.merge) ORDS.forEach(([id, who, amt], i) => P.line('m' + i, 180, wy(i) + 22, 330, wy(who === 'Ana' ? 0 : 1.5) + 38, { tone: who === 'Ana' ? 't0' : 't1', arrow: true }));
          if (s.lost) P.chip('lost', { x: 330, y: 306, w: 270, h: 38, label: 'o1..o4 are gone', sub: '', tone: 'bad' });
        }
        if (s.mode === 'win') {
          P.text('hw', { x: 320, y: 82, t: 'extra columns, same rows', cls: 'mut sm' });
          ORDS.forEach(([id, who, amt], i) => {
            if (s.cols) P.chip('t' + i, { x: 200, y: wy(i), w: 130, h: 44, label: 'total ' + TOT[who], sub: 'cust_total', tone: 'ok' });
            if (s.pct) P.chip('p' + i, { x: 350, y: wy(i), w: 130, h: 44, label: Math.round(amt * 100 / TOT[who]) + '%', sub: 'of customer', tone: 'ok' });
          });
        }
      }
    }),
    bug: [
      { log: 'The orders table has four rows. The report wants each order and what share of its customer total it is (amounts illustrative).', callout: 'Four orders, two customers', code: 0,
        state: {}, stats: [{ l: 'rows', v: '4' }] },
      { log: 'GROUP BY customer puts the rows of each customer in one group. Ana holds o1 and o4, Ben holds o2 and o3.', callout: 'GROUP BY forms groups', code: 0,
        state: { part: 1 }, stats: [{ l: 'groups', v: '2' }] },
      { log: 'Each group collapses to one output row. Four rows go in and two come out.', callout: 'Four rows collapse to two', moment: true, code: 1,
        state: { mode: 'group', merge: 1, n: 2 }, stats: [{ l: 'rows out', v: '2', cls: 'warn' }] },
      { log: 'The order ids and the individual amounts are gone from the result. The percentage of each order cannot be computed from it.', callout: 'The detail rows are gone', code: 1,
        state: { mode: 'group', merge: 1, lost: 1, n: 2 }, stats: [{ l: 'order rows left', v: '0', cls: 'bad' }] },
      { log: 'A window function partitions the same way, but it does not collapse anything. All four rows stay.', callout: 'A window keeps every row', code: 2,
        state: { mode: 'win', part: 1, n: 4 }, stats: [{ l: 'rows out', v: '4', cls: 'ok' }] },
      { log: 'Each row gets a new column with the total of its partition. Both Ana rows show 90 and both Ben rows show 60.', callout: 'Each row gets its partition total', code: 3,
        state: { mode: 'win', part: 1, cols: 1, n: 4 }, stats: [{ l: 'Ana total', v: '90' }, { l: 'Ben total', v: '60' }] },
      { log: 'Now the share is one more column: 65 of 90 is 72%, 25 of 90 is 28%, 20 of 60 is 33%, 40 of 60 is 67%.', callout: 'Order amount over its customer total', code: 4,
        state: { mode: 'win', part: 1, cols: 1, pct: 1, n: 4 }, stats: [{ l: 'rows out', v: '4', cls: 'ok' }, { l: 'o3 share', v: '67%', cls: 'ok' }],
        takeaway: 'GROUP BY turns many rows into one per group. A window function adds a per-group value and keeps every row.' },
    ],
  };

  const EXPLAIN = `
<h3>1. Rows are facts, SQL is a description</h3>
<p>A relational database stores facts as rows in tables. You do not tell it how to fetch them. You describe the result you want in SQL, and the database picks the steps. Ted Codd proposed this in 1969 because early systems tied the application to the physical layout, so changing how data was stored meant rewriting the application. The relational model rests on three ideas: simple relations, physical storage left to the DBMS, and a high-level language where the DBMS finds the execution strategy. This is <b>data independence</b>.</p>
<figure class="mm" aria-label="Flowchart: SQL text is parsed into a relational algebra tree, the optimizer picks a physical plan, and the plan runs against pages and indexes" style="--diagram-width:744px">
  <img src="diagrams/ch00-sql-to-plan.svg" alt="Flowchart: SQL text says what is wanted. It is parsed and bound to tables, becomes a relational algebra tree of select, project and join, and the optimizer turns it into a physical plan such as an index scan and a hash join, which runs against pages and indexes on disk. A dotted arrow shows that the layout can change without changing the SQL.">
  <figcaption>Flowchart: SQL names the result, the optimizer chooses the steps. Layout changes do not change the SQL.</figcaption>
</figure>
<p>The price of that freedom is that the description must be exact. The database runs exactly what you wrote, even when it is not what you meant. Two failures are silent: a join that is too wide returns too many rows, and a comparison that meets NULL returns too few. Neither raises an error, and both produce a number that looks fine.</p>

<h3>2. Relational algebra: the operators underneath</h3>
<p>Every SQL query becomes a tree of a few operators. <b>Select</b> (σ) keeps rows that match a predicate, <b>project</b> (π) keeps some columns, <b>join</b> (⋈) pairs rows that match, and union, intersection and difference combine two inputs. Relational algebra works on <em>sets</em>, with no duplicates and no order. SQL works on <em>bags</em>: duplicates are allowed, so <code>DISTINCT</code> is an explicit step, and order exists only if you write <code>ORDER BY</code>. The optimizer later rearranges this tree, so two different trees can mean the same query.</p>

<h3>3. Keys and constraints put the rule in the database</h3>
<p>A <b>primary key</b> gives every row a unique, non-null id. A <b>foreign key</b> such as <code>orders.customer_id</code> must point to an existing customer. <code>UNIQUE</code> stops two rows sharing a value such as an email. <code>NOT NULL</code> requires a value, and <code>CHECK</code> tests a rule on each row.</p>
<p>Each constraint is checked on every write. A unique constraint is backed by an index, so the check is one index probe. When the rule lives in the database, every writer must obey it: the web app, the batch loader and the person running a one-off script. A rule that lives only in application code binds only that application.</p>

<h3>4. A join is a set of matching pairs</h3>
<p>Think of a join as lines drawn between two tables. With <code>ON o.customer_id = c.id</code>, a line exists only where the condition is true. With no condition, every row pairs with every row. Three customers and three orders make nine pairs, and a <code>SUM</code> over nine pairs is wrong in a way that grows with table size.</p>
<p>The type of join decides what happens to rows with no match. An inner join drops them. A <code>LEFT JOIN</code> keeps the left row and fills the right side with NULL. Choose by asking: if a customer has no order, should the customer appear in the result? After each join, check the row count against what you expect before you add a <code>SUM</code>.</p>

<h3>5. NULL is unknown, and logic has three values</h3>
<p>NULL means unknown. It is not zero and not an empty string. Any comparison with NULL, even <code>NULL = NULL</code>, is UNKNOWN, not TRUE. <code>WHERE</code> keeps only rows whose condition is TRUE, so UNKNOWN rows are dropped just like FALSE ones.</p>
<p>That is why <code>3 NOT IN (1, 2, NULL)</code> never returns a row. It expands to <code>3 &lt;&gt; 1 AND 3 &lt;&gt; 2 AND 3 &lt;&gt; NULL</code>. The last term is UNKNOWN, and TRUE AND UNKNOWN is UNKNOWN. A single guest order with a NULL customer id empties the report. <code>NOT EXISTS</code> asks a different question, whether a matching row exists, and it is safe with NULLs.</p>

<h3>6. Aggregates, windows and the order a query is read</h3>
<p>An aggregate such as <code>SUM</code> or <code>COUNT</code> turns a bag of rows into one value. With <code>GROUP BY</code> you get one output row per group, and every selected column must be a group key or an aggregate. <code>HAVING</code> filters whole groups after aggregation, where <code>WHERE</code> filters rows before it. A <b>window function</b> uses <code>OVER (PARTITION BY ... ORDER BY ...)</code> to compute a value across related rows and attach it to each row, so no row disappears. Use it for running totals, ranks and shares. A <b>CTE</b> (<code>WITH</code>) names a subquery so a long query reads top to bottom, and a <b>lateral join</b> lets a subquery use columns from the table on its left.</p>
<figure class="mm" aria-label="Flowchart of the logical order of a SELECT: FROM and JOIN, WHERE, GROUP BY, HAVING, window functions, SELECT, ORDER BY and LIMIT" style="--diagram-width:168px">
  <img src="diagrams/ch00-clause-order.svg" alt="Flowchart: FROM and JOIN build the row pairs, WHERE keeps rows that are true, GROUP BY collapses rows into groups, HAVING filters groups, window functions add a column and keep every row, SELECT chooses columns, then ORDER BY and LIMIT sort and cut.">
  <figcaption>The logical order of a SELECT. A window function runs after grouping, so it sees grouped rows only if you grouped first.</figcaption>
</figure>

<h3>7. Money needs an exact type</h3>
<p>Floating-point types store binary fractions, and 0.1 has no exact binary form. Adding 0.1 and 0.2 gives 0.30000000000000004 in most languages, and a comparison with 0.3 fails. Store money in <code>NUMERIC(10,2)</code>, or in integer cents, so that sums and equality tests are exact.</p>

<h3>8. The trade-off</h3>
<p>Constraints cost a little time on every insert, and a unique index costs space. In return, no writer can bypass them and no report has to defend against bad rows. Declarative SQL also hands the plan to the optimizer, which is why later chapters ask what it chooses. The cheap habits that protect the rest are to count rows after each join and to keep NULLs out of any <code>NOT IN</code> list.</p>

<h3>9. Syntax</h3>
<pre>CREATE TABLE customers (
  id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name  text NOT NULL
);
CREATE TABLE orders (
  id          bigint PRIMARY KEY,
  customer_id bigint REFERENCES customers (id),
  amount      numeric(10,2) NOT NULL CHECK (amount &gt;= 0)
);

-- join with a condition, keep customers with no order
SELECT c.name, COALESCE(SUM(o.amount), 0)
FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.name;

-- every order with its share of the customer total: a window keeps the rows
SELECT id, customer_id, amount,
       amount * 100.0 / SUM(amount) OVER (PARTITION BY customer_id) AS pct
FROM orders;

-- customers with no orders, safe with NULLs
SELECT name FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- a retry that does no harm
INSERT INTO customers (email, name) VALUES ('ana@shop.io', 'Ana')
ON CONFLICT (email) DO NOTHING;</pre>
<p>Run <code>SELECT COUNT(*)</code> before and after a join. If the count grows when you expected it to stay, the join condition is wrong.</p>`;
  /* problem, predict and diagnose (kept from the first version of this course) */
  const FIELDS = {
    "problem": "A commerce app stores customers, orders and payments in separate tables. Revenue is off in two ways (illustrative): one report shows Ben at 125 when his real total is 60, and a mailing job emails Ana twice because she was loaded twice.",
    "predict": {
      "q": "A report lists customers whose id is NOT IN a subquery over orders.customer_id. One guest order has customer_id NULL. What does the query return?",
      "opts": [
        "Every customer who has no order, and no error",
        "No rows, and no error. The database does not warn you.",
        "An error, because NULL cannot be compared",
        "Only the customers whose id is NULL"
      ],
      "ans": 1,
      "why": "A comparison with NULL is UNKNOWN, not TRUE. NOT IN is then never TRUE for any customer, and WHERE keeps only TRUE rows, so the result is empty."
    },
    "diagnose": [
      {
        "t": "Missing ON",
        "sym": "A total is far larger than the orders that really exist",
        "ctx": "A revenue report sums every order for every customer, so each customer shows the same total.",
        "why": "A FROM list with two tables and no join condition makes a Cartesian product: every customer is paired with every order.",
        "log": "# representative output, wording varies by version\nSELECT count(*) FROM customers c, orders o;\n count\n-------\n     9",
        "fix": [
          "Measure first: count the rows after the join and compare with the number of orders.",
          "Fix: add ON o.customer_id = c.id, or use an explicit JOIN ... ON.",
          "Verify: the join row count equals the number of orders that have a matching customer."
        ]
      },
      {
        "t": "NOT IN with NULL",
        "sym": "A NOT IN report returns no rows and raises no error",
        "ctx": "The list of customers without orders is empty after a batch of guest orders is loaded.",
        "why": "The subquery returns a NULL. Every NOT IN test against that list is UNKNOWN, so WHERE drops every row.",
        "log": "# representative output, wording varies by version\n name\n------\n(0 rows)",
        "fix": [
          "Measure first: run the subquery alone and look for NULL in its result.",
          "Fix: rewrite NOT IN as NOT EXISTS, or filter WHERE customer_id IS NOT NULL in the subquery.",
          "Verify: the same customers without orders are returned as before, and the guest orders no longer hide anyone."
        ]
      },
      {
        "t": "Duplicate rows",
        "sym": "A unique business key appears twice in the table",
        "ctx": "A customer import runs twice. The customer count is higher than the number of people, and mail is sent twice.",
        "why": "Without a UNIQUE constraint on email, the database accepts a second row with the same value. Application checks alone can be skipped or race.",
        "log": "# representative output, wording varies by version\nERROR:  duplicate key value violates unique constraint \"customers_email_key\"\nDETAIL:  Key (email)=(ana@shop.test) already exists.",
        "fix": [
          "Measure first: count rows and COUNT(DISTINCT email) and compare them.",
          "Fix: ALTER TABLE customers ADD CONSTRAINT customers_email_key UNIQUE (email); after removing the duplicates.",
          "Verify: the second insert fails with the duplicate key error, and the row counts match the people count."
        ]
      },
      {
        "t": "Float money",
        "sym": "A total is off by a tiny amount that grows over many orders",
        "ctx": "A daily ledger check fails by a fraction of a cent. The difference grows with the number of orders.",
        "why": "float8 is binary floating point. 0.1 and 0.2 have no exact binary form, so the sum drifts.",
        "log": "# representative output, wording varies by version\nSELECT 0.1::float8 + 0.2::float8 AS total;\n        total\n--------------------\n 0.30000000000000004",
        "fix": [
          "Measure first: compare SUM(amount) with the expected total and check the column type in the schema.",
          "Fix: store money as NUMERIC(10,2) and compare with exact decimal values.",
          "Verify: the ledger check passes on a full day of orders."
        ]
      }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[0] = { ...FIELDS, source: SOURCE, explain: EXPLAIN, scenarios: [joinPairs, nullIn, dupUnique, windowScene] };
})();
