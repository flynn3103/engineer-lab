/* Chapter 1 · Relational Model and SQL. Data only: scenarios for the Visualize view.
   Every scenario has a "bug" path and, where one exists, a "fix" path. Numbers are illustrative. */
(function () {
  const CUST = { cols: ['id', 'name', 'email'], w: [40, 70, 130], rows: [[1, 'Ana', 'ana@shop.test'], [2, 'Ben', 'ben@shop.test'], [3, 'Chi', 'chi@shop.test']] };
  const ORD = { cols: ['id', 'customer_id', 'amount'], w: [50, 110, 80], rows: [[101, 1, 40], [102, 1, 25], [103, 2, 60]] };
  const ORD_NULL = { cols: ['id', 'customer_id', 'amount'], w: [50, 110, 80], rows: [[101, 1, 40], [102, 1, 25], [103, 2, 60], [104, 'NULL', 15]] };
  const DUP = [[1, 'Ana', 'ana@shop.test'], [2, 'Ben', 'ben@shop.test'], [3, 'Chi', 'chi@shop.test'], [4, 'Ana', 'ana@shop.test']];

  /* rowsOf(def, {index: class}) keeps the table's rows and adds a highlight class per row. */
  const rowsOf = (def, map, rows = def.rows) => rows.map((r, i) => ({ c: r, k: map[i] || '' }));

  const JOIN_SQL = ['SELECT c.name, SUM(o.amount) AS revenue', 'FROM customers c', 'JOIN orders o ON o.customer_id = c.id', 'GROUP BY c.name;'];

  /* Shared by the correct join and by the fixed missing-ON scenario. */
  const JOIN_STEPS = [
    { log: 'Two tables: customers and orders. Each row is one fact. The join has not run yet.', sql: 1, links: [] },
    { log: 'Ana (id 1) matches the orders where customer_id is 1: orders 101 and 102.', sql: 2,
      t: { customers: rowsOf(CUST, { 0: 'hit' }), orders: rowsOf(ORD, { 0: 'hit', 1: 'hit' }) },
      links: [[0, 0, 'hit'], [0, 1, 'hit']] },
    { log: 'Ben (id 2) matches order 103. The join keeps that pair too.', sql: 2,
      t: { customers: rowsOf(CUST, { 0: 'hit', 1: 'hit' }), orders: rowsOf(ORD, { 0: 'hit', 1: 'hit', 2: 'hit' }) },
      links: [[0, 0, 'hit'], [0, 1, 'hit'], [1, 2, 'hit']] },
    { log: 'Chi (id 3) has no order. An inner join keeps only matched pairs, so Chi is left out.', sql: 2,
      t: { customers: rowsOf(CUST, { 0: 'hit', 1: 'hit', 2: 'miss' }), orders: rowsOf(ORD, { 0: 'hit', 1: 'hit', 2: 'hit' }) },
      links: [[0, 0, 'hit'], [0, 1, 'hit'], [1, 2, 'hit']] },
    { log: 'GROUP BY c.name adds the matched amounts per customer: Ana 65, Ben 60.', sql: 3,
      res: { cols: ['name', 'revenue'], w: [120, 120], rows: [['Ana', '65'], ['Ben', '60']] },
      links: [[0, 0, 'hit'], [0, 1, 'hit'], [1, 2, 'hit']] }
  ];

  const scenarios = [
    {
      id: 'join', label: 'Correct join',
      desc: 'Pair each order with its customer on the key. Only matched pairs reach the report.',
      sql: { bug: JOIN_SQL },
      tables: { customers: CUST, orders: ORD },
      bug: JOIN_STEPS
    },
    {
      id: 'missing-on', label: 'Missing ON',
      desc: 'A join with no condition pairs every row with every row. Revenue then depends on table size, not on the orders.',
      sql: {
        bug: ['SELECT c.name, SUM(o.amount) AS revenue', 'FROM customers c, orders o   -- no join condition', 'GROUP BY c.name;'],
        fix: JOIN_SQL
      },
      tables: { customers: CUST, orders: ORD },
      bug: [
        { log: 'The FROM clause lists two tables and no ON condition.', sql: 1, links: [] },
        { log: 'With no condition, every customer is paired with every order: 3 × 3 = 9 pairs.', sql: 1,
          links: [[0, 0, 'bad'], [0, 1, 'bad'], [0, 2, 'bad'], [1, 0, 'bad'], [1, 1, 'bad'], [1, 2, 'bad'], [2, 0, 'bad'], [2, 1, 'bad'], [2, 2, 'bad']] },
        { log: 'Each group now sums all three orders: 40 + 25 + 60 = 125.', sql: 2, links: [],
          res: { cols: ['name', 'revenue'], w: [120, 120], rows: [['Ana', '125'], ['Ben', '125'], ['Chi', '125']] } },
        { log: 'Ben shows 125, but his real revenue is 60. Chi has no orders and still shows 125.', sql: 2, links: [],
          res: { cols: ['name', 'revenue'], w: [120, 120], rows: [{ c: ['Ana', '125'], k: '' }, { c: ['Ben', '125'], k: 'bad' }, { c: ['Chi', '125'], k: 'bad' }] } }
      ],
      fix: [
        { log: 'Apply the fix: add ON o.customer_id = c.id, so only pairs with the same key survive.', sql: 2, links: [] },
        ...JOIN_STEPS.slice(1)
      ]
    },
    {
      id: 'null-in', label: 'NULL in NOT IN',
      desc: 'NOT IN returns no rows when its list holds a NULL. Here the list came from a guest order with no customer.',
      sql: {
        bug: ['SELECT c.name', 'FROM customers c', 'WHERE c.id NOT IN (', '  SELECT o.customer_id FROM orders o', ');'],
        fix: ['SELECT c.name', 'FROM customers c', 'WHERE NOT EXISTS (', '  SELECT 1 FROM orders o WHERE o.customer_id = c.id', ');']
      },
      tables: { customers: CUST, orders: ORD_NULL },
      bug: [
        { log: 'Ask for customers whose id is not in the list of customer_id values from orders.', sql: 2, links: [] },
        { log: 'The subquery returns 1, 1, 2 and NULL. The NULL is the guest order 104.', sql: 3, t: { orders: rowsOf(ORD_NULL, { 3: 'miss' }) },
          links: [[0, 0, 'hit'], [0, 1, 'hit'], [1, 2, 'hit']] },
        { log: 'Ana (1) and Ben (2) appear in the list, so NOT IN is FALSE for them. They are excluded.', sql: 3,
          t: { customers: rowsOf(CUST, { 0: 'miss', 1: 'miss' }), orders: rowsOf(ORD_NULL, { 3: 'miss' }) }, links: [] },
        { log: 'Chi (3) is not 1 and not 2, but 3 = NULL is UNKNOWN, not TRUE. WHERE keeps only TRUE, so Chi is dropped.', sql: 2,
          t: { customers: rowsOf(CUST, { 0: 'miss', 1: 'miss', 2: 'bad' }), orders: rowsOf(ORD_NULL, { 3: 'bad' }) }, links: [] },
        { log: 'Result: no rows. The report is empty, and the database raises no error.', sql: 2, links: [],
          t: { customers: rowsOf(CUST, { 0: 'miss', 1: 'miss', 2: 'bad' }) },
          res: { cols: ['name'], w: [240], rows: [], empty: '0 rows: the query runs without error and finds nothing' } }
      ],
      fix: [
        { log: 'Apply the fix: NOT EXISTS checks each customer on its own. NULL never equals anything, so the guest order cannot hide anyone.', sql: 2, links: [] },
        { log: 'Chi has no order with customer_id = 3, so NOT EXISTS is TRUE and Chi is kept.', sql: 3, links: [],
          t: { customers: rowsOf(CUST, { 2: 'ok' }) },
          res: { cols: ['name'], w: [240], rows: [{ c: ['Chi'], k: 'ok' }] } }
      ]
    },
    {
      id: 'dup', label: 'Duplicate rows',
      desc: 'A table with no UNIQUE constraint accepts the same person twice. COUNT(*) then counts rows, not people.',
      sql: {
        bug: ['-- no UNIQUE constraint on customers.email', "INSERT INTO customers VALUES (4, 'Ana', 'ana@shop.test');", 'SELECT COUNT(*) AS total_rows, COUNT(DISTINCT email) AS people', 'FROM customers;'],
        fix: ['ALTER TABLE customers ADD CONSTRAINT customers_email_key UNIQUE (email);', "INSERT INTO customers VALUES (4, 'Ana', 'ana@shop.test');", '-- psql reports an error for the second insert', 'SELECT COUNT(*) AS total_rows, COUNT(DISTINCT email) AS people', 'FROM customers;']
      },
      tables: { customers: { cols: CUST.cols, w: CUST.w, rows: CUST.rows } },
      bug: [
        { log: 'customers has no UNIQUE constraint on email, so the database has no rule against a second Ana.', sql: 0, links: [] },
        { log: 'The insert succeeds. The table now holds 4 rows.', sql: 1, links: [], t: { customers: rowsOf(CUST, { 3: 'new' }, DUP) } },
        { log: 'COUNT(*) says 4 rows. COUNT(DISTINCT email) says 3 people.', sql: 2, links: [], t: { customers: rowsOf(CUST, { 3: 'bad' }, DUP) },
          res: { cols: ['total_rows', 'people'], w: [120, 120], rows: [['4', '3']] } },
        { log: 'Any report that counts customers as rows overstates them. A mailing job would email Ana twice.', sql: 2, links: [], t: { customers: rowsOf(CUST, { 3: 'bad' }, DUP) },
          res: { cols: ['total_rows', 'people'], w: [120, 120], rows: [{ c: ['4', '3'], k: 'bad' }] } }
      ],
      fix: [
        { log: 'Add UNIQUE on email. Now the database enforces the rule on every write, not just the import script.', sql: 0, links: [] },
        { log: 'The second import inserts Ana again and the write is rejected: ERROR: duplicate key value violates unique constraint "customers_email_key". The row never enters the table.', sql: 1, links: [], t: { customers: rowsOf(CUST, { 3: 'rej' }, DUP) } },
        { log: 'The count is correct: 3 rows and 3 people.', sql: 3, links: [], t: { customers: rowsOf(CUST, {}) },
          res: { cols: ['total_rows', 'people'], w: [120, 120], rows: [{ c: ['3', '3'], k: 'ok' }] } }
      ]
    },
    {
      id: 'float', label: 'Float money',
      desc: 'Binary floating point cannot store 0.1 or 0.2 exactly. Add a few prices and the total drifts.',
      sql: {
        bug: ['-- money stored as double precision (float8)', 'SELECT 0.1::float8 + 0.2::float8 AS total;'],
        fix: ['-- money stored as NUMERIC(10,2): exact decimal arithmetic', 'SELECT 0.10::numeric(10,2) + 0.20::numeric(10,2) AS total;']
      },
      tables: {},
      bug: [
        { log: 'Two prices, 0.10 and 0.20, are added as float8 values.', sql: 1, links: [], res: { cols: ['price 1', 'price 2'], w: [110, 110], rows: [['0.10', '0.20']] } },
        { log: 'The sum is not exactly 0.3. Representative PostgreSQL output: 0.30000000000000004.', sql: 1, links: [], res: { cols: ['total'], w: [220], rows: [{ c: ['0.30000000000000004'], k: 'bad' }] } },
        { log: 'Prices like this drift by fractions of a cent. Across thousands of orders, the error adds up.', sql: 1, links: [], res: { cols: ['total'], w: [220], rows: [{ c: ['0.30000000000000004'], k: 'bad' }] } }
      ],
      fix: [
        { log: 'Store money as NUMERIC(10,2). The database does exact decimal arithmetic on it.', sql: 1, links: [], res: { cols: ['price 1', 'price 2'], w: [110, 110], rows: [['0.10', '0.20']] } },
        { log: 'The total is exactly 0.30, so equality checks and sums on money behave the way a ledger expects.', sql: 1, links: [], res: { cols: ['total'], w: [220], rows: [{ c: ['0.30'], k: 'ok' }] } }
      ]
    }
  ];

  window.RELATIONAL_SCENARIOS = scenarios;
})();
