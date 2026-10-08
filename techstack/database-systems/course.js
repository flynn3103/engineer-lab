/* Problem-based course data for Database Systems. Written from the original CHAPTERS in techstack/database-systems/01-database-systems-end-to-end.html (read-only source). */
window.COURSE = {
  name: 'Database Systems',
  kick: '16 chapters · problem-based · PostgreSQL 17 examples',
  lead: `A payments service keeps orders, ledger lines and inventory in one database. Its production incidents come from reports that double-count or drop rows, locks and isolation levels that let two correct requests break a rule, a crash between two writes, a query that reads far more data than it returns, and a cluster that splits data across machines. Each chapter starts from one of these incidents, asks what the database must do to prevent it, and walks the mechanism that does it.`,
  chapters: [
{
  title: 'Relational Model and SQL',
  problem: `A commerce app stores customers, orders and payments in separate tables. Revenue is off in two ways (illustrative): one report shows Ben at 125 when his real total is 60, and a mailing job emails Ana twice because she was loaded twice.`,
  predict: {
    q: `A report lists customers whose id is NOT IN a subquery over orders.customer_id. One guest order has customer_id NULL. What does the query return?`,
    opts: [
      `Every customer who has no order, and no error`,
      `No rows, and no error. The database does not warn you.`,
      `An error, because NULL cannot be compared`,
      `Only the customers whose id is NULL`
    ],
    ans: 1,
    why: `A comparison with NULL is UNKNOWN, not TRUE. NOT IN is then never TRUE for any customer, and WHERE keeps only TRUE rows, so the result is empty.`
  },
  explain: `<h3>The idea</h3>
<p>A relational database stores facts as rows in tables. You describe the result you want in SQL, and the database works out how to fetch it. The description has to be exact, because the database does exactly what it says, even when that is not what you meant.</p>
<h3>How it works, step by step</h3>
<p>A <b>primary key</b> gives every row a unique id. A <b>foreign key</b> such as <code>orders.customer_id</code> must match an existing customer. <b>UNIQUE</b> stops two rows sharing a value, such as an email. <b>NOT NULL</b> requires a value. Put the rule in the database and every writer must obey it.</p>
<p>A <b>join</b> keeps a pair of rows only when its <code>ON</code> condition is true. With no condition, every row pairs with every row: 3 customers and 3 orders make 9 pairs. Any sum over those pairs is wrong, and the query still runs without an error.</p>
<p><b>NULL</b> means unknown, not zero and not an empty string. A comparison with NULL is unknown, and <code>WHERE</code> keeps only rows that are true. So <code>3 NOT IN (1, 2, NULL)</code> is never true, and the whole query returns nothing. To ask “has no matching row”, use <code>NOT EXISTS</code>.</p>
<h3>The trade-off</h3>
<p>Constraints are checked on every write, which costs a little time on each insert. In return, no application can bypass them. Floating-point types are fast but cannot store 0.1 exactly, so store money as <code>NUMERIC(10,2)</code>. Before you trust a number, count the rows after each join and check that no NULL can reach a <code>NOT IN</code> list.</p>`,
  diagnose: [
    {
      t: 'Missing ON',
      sym: 'A total is far larger than the orders that really exist',
      ctx: 'A revenue report sums every order for every customer, so each customer shows the same total.',
      why: 'A FROM list with two tables and no join condition makes a Cartesian product: every customer is paired with every order.',
      log: `# representative output, wording varies by version
SELECT count(*) FROM customers c, orders o;
 count
-------
     9`,
      fix: [
        'Measure first: count the rows after the join and compare with the number of orders.',
        'Fix: add ON o.customer_id = c.id, or use an explicit JOIN ... ON.',
        'Verify: the join row count equals the number of orders that have a matching customer.'
      ]
    },
    {
      t: 'NOT IN with NULL',
      sym: 'A NOT IN report returns no rows and raises no error',
      ctx: 'The list of customers without orders is empty after a batch of guest orders is loaded.',
      why: 'The subquery returns a NULL. Every NOT IN test against that list is UNKNOWN, so WHERE drops every row.',
      log: `# representative output, wording varies by version
 name
------
(0 rows)`,
      fix: [
        'Measure first: run the subquery alone and look for NULL in its result.',
        'Fix: rewrite NOT IN as NOT EXISTS, or filter WHERE customer_id IS NOT NULL in the subquery.',
        'Verify: the same customers without orders are returned as before, and the guest orders no longer hide anyone.'
      ]
    },
    {
      t: 'Duplicate rows',
      sym: 'A unique business key appears twice in the table',
      ctx: 'A customer import runs twice. The customer count is higher than the number of people, and mail is sent twice.',
      why: 'Without a UNIQUE constraint on email, the database accepts a second row with the same value. Application checks alone can be skipped or race.',
      log: `# representative output, wording varies by version
ERROR:  duplicate key value violates unique constraint "customers_email_key"
DETAIL:  Key (email)=(ana@shop.test) already exists.`,
      fix: [
        'Measure first: count rows and COUNT(DISTINCT email) and compare them.',
        'Fix: ALTER TABLE customers ADD CONSTRAINT customers_email_key UNIQUE (email); after removing the duplicates.',
        'Verify: the second insert fails with the duplicate key error, and the row counts match the people count.'
      ]
    },
    {
      t: 'Float money',
      sym: 'A total is off by a tiny amount that grows over many orders',
      ctx: 'A daily ledger check fails by a fraction of a cent. The difference grows with the number of orders.',
      why: 'float8 is binary floating point. 0.1 and 0.2 have no exact binary form, so the sum drifts.',
      log: `# representative output, wording varies by version
SELECT 0.1::float8 + 0.2::float8 AS total;
        total
--------------------
 0.30000000000000004`,
      fix: [
        'Measure first: compare SUM(amount) with the expected total and check the column type in the schema.',
        'Fix: store money as NUMERIC(10,2) and compare with exact decimal values.',
        'Verify: the ledger check passes on a full day of orders.'
      ]
    }
  ],
  source: { label: 'Original: SQL cheat sheet (Relational model and SQL)', href: '01-database-systems-end-to-end.html#ch0' },
  scenarios: [
  {
    "id": "missing-on",
    "label": "Missing ON",
    "desc": "A join with no condition pairs every row with every row. Revenue then depends on table size, not on the orders.",
    "sql": {
      "bug": [
        "SELECT c.name, SUM(o.amount) AS revenue",
        "FROM customers c, orders o   -- no join condition",
        "GROUP BY c.name;"
      ],
      "fix": [
        "SELECT c.name, SUM(o.amount) AS revenue",
        "FROM customers c",
        "JOIN orders o ON o.customer_id = c.id",
        "GROUP BY c.name;"
      ]
    },
    "tables": {
      "customers": {
        "cols": [
          "id",
          "name",
          "email"
        ],
        "w": [
          40,
          70,
          130
        ],
        "rows": [
          [
            1,
            "Ana",
            "ana@shop.test"
          ],
          [
            2,
            "Ben",
            "ben@shop.test"
          ],
          [
            3,
            "Chi",
            "chi@shop.test"
          ]
        ]
      },
      "orders": {
        "cols": [
          "id",
          "customer_id",
          "amount"
        ],
        "w": [
          50,
          110,
          80
        ],
        "rows": [
          [
            101,
            1,
            40
          ],
          [
            102,
            1,
            25
          ],
          [
            103,
            2,
            60
          ]
        ]
      }
    },
    "bug": [
      {
        "log": "The FROM clause lists two tables and no ON condition.",
        "sql": 1,
        "links": [],
        "code": 1
      },
      {
        "log": "With no condition, every customer is paired with every order: 3 × 3 = 9 pairs.",
        "sql": 1,
        "links": [
          [
            0,
            0,
            "bad"
          ],
          [
            0,
            1,
            "bad"
          ],
          [
            0,
            2,
            "bad"
          ],
          [
            1,
            0,
            "bad"
          ],
          [
            1,
            1,
            "bad"
          ],
          [
            1,
            2,
            "bad"
          ],
          [
            2,
            0,
            "bad"
          ],
          [
            2,
            1,
            "bad"
          ],
          [
            2,
            2,
            "bad"
          ]
        ],
        "code": 1
      },
      {
        "log": "Each group now sums all three orders: 40 + 25 + 60 = 125.",
        "sql": 2,
        "links": [],
        "res": {
          "cols": [
            "name",
            "revenue"
          ],
          "w": [
            120,
            120
          ],
          "rows": [
            [
              "Ana",
              "125"
            ],
            [
              "Ben",
              "125"
            ],
            [
              "Chi",
              "125"
            ]
          ]
        },
        "code": 2
      },
      {
        "log": "Ben shows 125, but his real revenue is 60. Chi has no orders and still shows 125.",
        "sql": 2,
        "links": [],
        "res": {
          "cols": [
            "name",
            "revenue"
          ],
          "w": [
            120,
            120
          ],
          "rows": [
            {
              "c": [
                "Ana",
                "125"
              ],
              "k": ""
            },
            {
              "c": [
                "Ben",
                "125"
              ],
              "k": "bad"
            },
            {
              "c": [
                "Chi",
                "125"
              ],
              "k": "bad"
            }
          ]
        },
        "code": 2
      }
    ],
    "fix": [
      {
        "log": "Apply the fix: add ON o.customer_id = c.id, so only pairs with the same key survive.",
        "sql": 2,
        "links": [],
        "code": 2
      },
      {
        "log": "Ana (id 1) matches the orders where customer_id is 1: orders 101 and 102.",
        "sql": 2,
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": "hit"
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": ""
            }
          ],
          "orders": [
            {
              "c": [
                101,
                1,
                40
              ],
              "k": "hit"
            },
            {
              "c": [
                102,
                1,
                25
              ],
              "k": "hit"
            },
            {
              "c": [
                103,
                2,
                60
              ],
              "k": ""
            }
          ]
        },
        "links": [
          [
            0,
            0,
            "hit"
          ],
          [
            0,
            1,
            "hit"
          ]
        ],
        "code": 2
      },
      {
        "log": "Ben (id 2) matches order 103. The join keeps that pair too.",
        "sql": 2,
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": "hit"
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": "hit"
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": ""
            }
          ],
          "orders": [
            {
              "c": [
                101,
                1,
                40
              ],
              "k": "hit"
            },
            {
              "c": [
                102,
                1,
                25
              ],
              "k": "hit"
            },
            {
              "c": [
                103,
                2,
                60
              ],
              "k": "hit"
            }
          ]
        },
        "links": [
          [
            0,
            0,
            "hit"
          ],
          [
            0,
            1,
            "hit"
          ],
          [
            1,
            2,
            "hit"
          ]
        ],
        "code": 2
      },
      {
        "log": "Chi (id 3) has no order. An inner join keeps only matched pairs, so Chi is left out.",
        "sql": 2,
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": "hit"
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": "hit"
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": "miss"
            }
          ],
          "orders": [
            {
              "c": [
                101,
                1,
                40
              ],
              "k": "hit"
            },
            {
              "c": [
                102,
                1,
                25
              ],
              "k": "hit"
            },
            {
              "c": [
                103,
                2,
                60
              ],
              "k": "hit"
            }
          ]
        },
        "links": [
          [
            0,
            0,
            "hit"
          ],
          [
            0,
            1,
            "hit"
          ],
          [
            1,
            2,
            "hit"
          ]
        ],
        "code": 2
      },
      {
        "log": "GROUP BY c.name adds the matched amounts per customer: Ana 65, Ben 60.",
        "sql": 3,
        "res": {
          "cols": [
            "name",
            "revenue"
          ],
          "w": [
            120,
            120
          ],
          "rows": [
            [
              "Ana",
              "65"
            ],
            [
              "Ben",
              "60"
            ]
          ]
        },
        "links": [
          [
            0,
            0,
            "hit"
          ],
          [
            0,
            1,
            "hit"
          ],
          [
            1,
            2,
            "hit"
          ]
        ],
        "code": 3
      }
    ],
    "codeLabel": "Query",
    "code": {
      "bug": [
        "SELECT c.name, SUM(o.amount) AS revenue",
        "FROM customers c, orders o   -- no join condition",
        "GROUP BY c.name;"
      ],
      "fix": [
        "SELECT c.name, SUM(o.amount) AS revenue",
        "FROM customers c",
        "JOIN orders o ON o.customer_id = c.id",
        "GROUP BY c.name;"
      ]
    }
  },
  {
    "id": "null-in",
    "label": "NULL in NOT IN",
    "desc": "NOT IN returns no rows when its list holds a NULL. Here the list came from a guest order with no customer.",
    "sql": {
      "bug": [
        "SELECT c.name",
        "FROM customers c",
        "WHERE c.id NOT IN (",
        "  SELECT o.customer_id FROM orders o",
        ");"
      ],
      "fix": [
        "SELECT c.name",
        "FROM customers c",
        "WHERE NOT EXISTS (",
        "  SELECT 1 FROM orders o WHERE o.customer_id = c.id",
        ");"
      ]
    },
    "tables": {
      "customers": {
        "cols": [
          "id",
          "name",
          "email"
        ],
        "w": [
          40,
          70,
          130
        ],
        "rows": [
          [
            1,
            "Ana",
            "ana@shop.test"
          ],
          [
            2,
            "Ben",
            "ben@shop.test"
          ],
          [
            3,
            "Chi",
            "chi@shop.test"
          ]
        ]
      },
      "orders": {
        "cols": [
          "id",
          "customer_id",
          "amount"
        ],
        "w": [
          50,
          110,
          80
        ],
        "rows": [
          [
            101,
            1,
            40
          ],
          [
            102,
            1,
            25
          ],
          [
            103,
            2,
            60
          ],
          [
            104,
            "NULL",
            15
          ]
        ]
      }
    },
    "bug": [
      {
        "log": "Ask for customers whose id is not in the list of customer_id values from orders.",
        "sql": 2,
        "links": [],
        "code": 2
      },
      {
        "log": "The subquery returns 1, 1, 2 and NULL. The NULL is the guest order 104.",
        "sql": 3,
        "t": {
          "orders": [
            {
              "c": [
                101,
                1,
                40
              ],
              "k": ""
            },
            {
              "c": [
                102,
                1,
                25
              ],
              "k": ""
            },
            {
              "c": [
                103,
                2,
                60
              ],
              "k": ""
            },
            {
              "c": [
                104,
                "NULL",
                15
              ],
              "k": "miss"
            }
          ]
        },
        "links": [
          [
            0,
            0,
            "hit"
          ],
          [
            0,
            1,
            "hit"
          ],
          [
            1,
            2,
            "hit"
          ]
        ],
        "code": 3
      },
      {
        "log": "Ana (1) and Ben (2) appear in the list, so NOT IN is FALSE for them. They are excluded.",
        "sql": 3,
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": "miss"
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": "miss"
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": ""
            }
          ],
          "orders": [
            {
              "c": [
                101,
                1,
                40
              ],
              "k": ""
            },
            {
              "c": [
                102,
                1,
                25
              ],
              "k": ""
            },
            {
              "c": [
                103,
                2,
                60
              ],
              "k": ""
            },
            {
              "c": [
                104,
                "NULL",
                15
              ],
              "k": "miss"
            }
          ]
        },
        "links": [],
        "code": 3
      },
      {
        "log": "Chi (3) is not 1 and not 2, but 3 = NULL is UNKNOWN, not TRUE. WHERE keeps only TRUE, so Chi is dropped.",
        "sql": 2,
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": "miss"
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": "miss"
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": "bad"
            }
          ],
          "orders": [
            {
              "c": [
                101,
                1,
                40
              ],
              "k": ""
            },
            {
              "c": [
                102,
                1,
                25
              ],
              "k": ""
            },
            {
              "c": [
                103,
                2,
                60
              ],
              "k": ""
            },
            {
              "c": [
                104,
                "NULL",
                15
              ],
              "k": "bad"
            }
          ]
        },
        "links": [],
        "code": 2
      },
      {
        "log": "Result: no rows. The report is empty, and the database raises no error.",
        "sql": 2,
        "links": [],
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": "miss"
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": "miss"
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": "bad"
            }
          ]
        },
        "res": {
          "cols": [
            "name"
          ],
          "w": [
            240
          ],
          "rows": [],
          "empty": "0 rows: the query runs without error and finds nothing"
        },
        "code": 2
      }
    ],
    "fix": [
      {
        "log": "Apply the fix: NOT EXISTS checks each customer on its own. NULL never equals anything, so the guest order cannot hide anyone.",
        "sql": 2,
        "links": [],
        "code": 2
      },
      {
        "log": "Chi has no order with customer_id = 3, so NOT EXISTS is TRUE and Chi is kept.",
        "sql": 3,
        "links": [],
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": "ok"
            }
          ]
        },
        "res": {
          "cols": [
            "name"
          ],
          "w": [
            240
          ],
          "rows": [
            {
              "c": [
                "Chi"
              ],
              "k": "ok"
            }
          ]
        },
        "code": 3
      }
    ],
    "codeLabel": "Query",
    "code": {
      "bug": [
        "SELECT c.name",
        "FROM customers c",
        "WHERE c.id NOT IN (",
        "  SELECT o.customer_id FROM orders o",
        ");"
      ],
      "fix": [
        "SELECT c.name",
        "FROM customers c",
        "WHERE NOT EXISTS (",
        "  SELECT 1 FROM orders o WHERE o.customer_id = c.id",
        ");"
      ]
    }
  },
  {
    "id": "dup",
    "label": "Duplicate rows",
    "desc": "A table with no UNIQUE constraint accepts the same person twice. COUNT(*) then counts rows, not people.",
    "sql": {
      "bug": [
        "-- no UNIQUE constraint on customers.email",
        "INSERT INTO customers VALUES (4, 'Ana', 'ana@shop.test');",
        "SELECT COUNT(*) AS total_rows, COUNT(DISTINCT email) AS people",
        "FROM customers;"
      ],
      "fix": [
        "ALTER TABLE customers ADD CONSTRAINT customers_email_key UNIQUE (email);",
        "INSERT INTO customers VALUES (4, 'Ana', 'ana@shop.test');",
        "-- psql reports an error for the second insert",
        "SELECT COUNT(*) AS total_rows, COUNT(DISTINCT email) AS people",
        "FROM customers;"
      ]
    },
    "tables": {
      "customers": {
        "cols": [
          "id",
          "name",
          "email"
        ],
        "w": [
          40,
          70,
          130
        ],
        "rows": [
          [
            1,
            "Ana",
            "ana@shop.test"
          ],
          [
            2,
            "Ben",
            "ben@shop.test"
          ],
          [
            3,
            "Chi",
            "chi@shop.test"
          ]
        ]
      }
    },
    "bug": [
      {
        "log": "customers has no UNIQUE constraint on email, so the database has no rule against a second Ana.",
        "sql": 0,
        "links": [],
        "code": 0
      },
      {
        "log": "The insert succeeds. The table now holds 4 rows.",
        "sql": 1,
        "links": [],
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                4,
                "Ana",
                "ana@shop.test"
              ],
              "k": "new"
            }
          ]
        },
        "code": 1
      },
      {
        "log": "COUNT(*) says 4 rows. COUNT(DISTINCT email) says 3 people.",
        "sql": 2,
        "links": [],
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                4,
                "Ana",
                "ana@shop.test"
              ],
              "k": "bad"
            }
          ]
        },
        "res": {
          "cols": [
            "total_rows",
            "people"
          ],
          "w": [
            120,
            120
          ],
          "rows": [
            [
              "4",
              "3"
            ]
          ]
        },
        "code": 2
      },
      {
        "log": "Any report that counts customers as rows overstates them. A mailing job would email Ana twice.",
        "sql": 2,
        "links": [],
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                4,
                "Ana",
                "ana@shop.test"
              ],
              "k": "bad"
            }
          ]
        },
        "res": {
          "cols": [
            "total_rows",
            "people"
          ],
          "w": [
            120,
            120
          ],
          "rows": [
            {
              "c": [
                "4",
                "3"
              ],
              "k": "bad"
            }
          ]
        },
        "code": 2
      }
    ],
    "fix": [
      {
        "log": "Add UNIQUE on email. Now the database enforces the rule on every write, not just the import script.",
        "sql": 0,
        "links": [],
        "code": 0
      },
      {
        "log": "The second import inserts Ana again and the write is rejected: ERROR: duplicate key value violates unique constraint \"customers_email_key\". The row never enters the table.",
        "sql": 1,
        "links": [],
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                4,
                "Ana",
                "ana@shop.test"
              ],
              "k": "rej"
            }
          ]
        },
        "code": 1
      },
      {
        "log": "The count is correct: 3 rows and 3 people.",
        "sql": 3,
        "links": [],
        "t": {
          "customers": [
            {
              "c": [
                1,
                "Ana",
                "ana@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                2,
                "Ben",
                "ben@shop.test"
              ],
              "k": ""
            },
            {
              "c": [
                3,
                "Chi",
                "chi@shop.test"
              ],
              "k": ""
            }
          ]
        },
        "res": {
          "cols": [
            "total_rows",
            "people"
          ],
          "w": [
            120,
            120
          ],
          "rows": [
            {
              "c": [
                "3",
                "3"
              ],
              "k": "ok"
            }
          ]
        },
        "code": 3
      }
    ],
    "codeLabel": "Query",
    "code": {
      "bug": [
        "-- no UNIQUE constraint on customers.email",
        "INSERT INTO customers VALUES (4, 'Ana', 'ana@shop.test');",
        "SELECT COUNT(*) AS total_rows, COUNT(DISTINCT email) AS people",
        "FROM customers;"
      ],
      "fix": [
        "ALTER TABLE customers ADD CONSTRAINT customers_email_key UNIQUE (email);",
        "INSERT INTO customers VALUES (4, 'Ana', 'ana@shop.test');",
        "-- psql reports an error for the second insert",
        "SELECT COUNT(*) AS total_rows, COUNT(DISTINCT email) AS people",
        "FROM customers;"
      ]
    }
  }
]
}
,
{
  title: 'Pages, Records, and the Buffer Pool',
  problem: `An order service keeps a 200 GB <code>orders</code> table on a database server with 16 GB of RAM (illustrative). Most customer lookups return in 2 ms, but some take 3 seconds, and a nightly report makes the slow ones common. The on-call engineer sees <code>EXPLAIN (ANALYZE, BUFFERS)</code> report a large <code>shared read</code> count and a small <code>shared hit</code> count for the slow queries.`,
  predict: {
    q: `The pool has 4 frames and evicts the least recently used page (LRU). A report reads pages P1, P2, P3, P4, P5 in a loop, three times. How many of the 15 page requests are served from memory?`,
    opts: [
      `0: each page is evicted just before the loop needs it again`,
      `11: only the first read of each page misses, the rest hit`,
      `About 8: LRU keeps roughly half of the pages`,
      `15: the database reads the whole table into RAM on the first pass`
    ],
    ans: 0,
    why: `With 5 pages and 4 frames, the page LRU evicts is always the one the loop asks for next. Every request misses, so the cache never helps until the pool holds the whole loop.`
  },
  explain: `<h3>The idea</h3>
<p>Disk is far slower than memory, and a query can only work on data that is in RAM. So the database groups rows into fixed-size <b>pages</b>, for example 8 KB, and every disk read moves a whole page. It keeps a bounded set of pages in memory, the <b>buffer pool</b>, and decides from real access patterns which pages stay.</p>
<h3>How a row is stored</h3>
<p>Each page is a <b>slotted page</b>: a header, a slot array that grows from one end, and records packed from the other end. A row is found again by its <b>record ID</b>, the pair (page, slot). The slot holds the record offset and length, so the record ID stays stable even when records move inside the page. A <b>free-space map</b> says which page has room for a new row.</p>
<h3>How it works, step by step</h3>
<p>The <b>executor</b> never talks to the disk. It asks the <b>buffer pool manager</b> for a page ID. The manager checks the <b>page table</b>, a map from page ID to frame. An entry is a <b>hit</b>: the frame is pinned and returned. A <b>frame</b> is a fixed-size slot in RAM that holds one page.</p>
<p>Each frame has a <b>pin count</b>, the number of users using it now, and a <b>dirty flag</b>, set when its content differs from disk. On a miss with no free frame, the <b>replacer</b> picks a victim among unpinned frames. <b>LRU</b> picks the least recently used frame; <b>Clock</b> approximates LRU with one reference bit per frame. If the victim is dirty, the <b>disk manager</b> writes it back first, then reads the new page into the frame.</p>
<h3>The trade-off</h3>
<p>A pinned page is never evicted, and a changed page is never lost. But a pool smaller than the hot set misses on every request. A one-time scan can push hot pages out. A dirty victim makes a read wait for a write. PostgreSQL sizes the pool with <code>shared_buffers</code> and gives large sequential scans, VACUUM and COPY a small 256 kB ring of buffers. InnoDB uses midpoint insertion, tuned by <code>innodb_old_blocks_time</code> and <code>innodb_old_blocks_pct</code>. The background writer (<code>bgwriter_lru_maxpages</code>, <code>bgwriter_delay</code>) cleans dirty pages before a query needs their frames.</p>`,
  diagnose: [
    {
      t: 'Thrashing',
      sym: '<b>Hit rate</b> collapses once the working set stops fitting in the pool.',
      ctx: 'A report reads five pages in a loop, again and again. The pool has 4 frames, so each page is evicted just before it is needed again.',
      why: 'LRU evicts the page that was used longest ago, and in a loop that is exactly the page needed next. Every access misses, so the cache never helps.',
      log: `-- representative output, counts illustrative
Index Scan using orders_customer_idx on orders  (actual time=0.041..2871.337 rows=14 loops=1)
  Buffers: shared hit=212 read=18427
Execution Time: 2871.802 ms`,
      note: 'Run the same query twice. If <code>shared read</code> stays large and <code>shared hit</code> stays small, the working set is not staying cached.',
      fix: [
        'Measure first: run <code>EXPLAIN (ANALYZE, BUFFERS)</code> twice on the same query, and read the per-table cache hit ratio from <code>pg_statio_user_tables</code> (<code>heap_blks_hit</code> against <code>heap_blks_read</code>).',
        'Size the pool to the hot set. The PostgreSQL documentation suggests starting <code>shared_buffers</code> at about 25% of RAM on a dedicated server, and leaving the rest to the OS page cache.',
        'Touch fewer pages per request: add an index that covers the predicate, or keep related rows together, so the hot set shrinks.',
        'Verify: run the same query twice after the change. The second run should show almost no <code>read</code>.'
      ]
    },
    {
      t: 'Leaked pin',
      sym: '<b>Free frames</b> run out after a few failed requests, and then the next request waits forever.',
      ctx: 'An error path in a storage extension returns early without unpinning. Each failed request leaves its frame pinned for the life of the process.',
      why: 'A pin is a reference count, and eviction needs the count at zero. Time never clears a missing unpin, so the unpinned frames drain until none are left.',
      log: `-- representative MySQL/InnoDB output, wording varies by version
[Warning] InnoDB: Difficult to find free blocks in the buffer pool (search iterations ...)!

SHOW ENGINE INNODB STATUS;  ->  BUFFER POOL AND MEMORY: Free buffers 0`,
      note: 'Free buffers at 0 with rising search iterations means no frame can be reused. Look for references that never went away.',
      fix: [
        'Measure first: find the leaking path with diagnostics. In MySQL, <code>SHOW ENGINE INNODB STATUS</code> reports free buffers and pending reads; in PostgreSQL, the <code>pg_buffercache</code> extension shows what each buffer holds.',
        'Pair every pin with an unpin on every exit path. Use a guard that releases on scope exit: RAII in C++ or Rust, try-with-resources in Java, defer in Go.',
        'Add an assertion in debug and test builds: when a request ends, every frame it touched must have a pin count of zero.',
        'Verify: run the failing path 10,000 times in a test, then check that the number of free frames matches the count before the test.'
      ]
    },
    {
      t: 'Scan flooding',
      sym: '<b>Checkout</b> latency rises only while the nightly export runs.',
      ctx: 'A nightly export reads a 180 GB sales table once, page by page. It passes through the same buffer pool that serves checkout, so the checkout hot set is replaced every night.',
      why: 'LRU keeps the most recently used pages. A scan touches many pages exactly once, and each one is more recent than the hot pages, so the scan pushes them out. The export gains nothing from caching, yet it uses the cache that other queries need.',
      log: `-- representative pg_stat_io (PostgreSQL 16+), counts illustrative
backend_type   | context  |   reads     |    hits
client backend | normal   |   412,908   |  9,811,002
client backend | bulkread | 1,920,000   |          0`,
      note: 'A <code>bulkread</code> row with many reads and no hits is a scan. If <code>normal</code> reads rise in the same window, the hot set is being evicted.',
      fix: [
        'Measure first: during the export, read <code>pg_stat_io</code> and compare reads in context <code>bulkread</code> with reads in context <code>normal</code>.',
        'Give large scans a bounded ring. PostgreSQL does this for large sequential scans, VACUUM and COPY: they reuse a small 256 kB ring of buffers instead of the whole pool.',
        'In MySQL/InnoDB, rely on midpoint insertion. Pages read by a scan enter the old sublist first; <code>innodb_old_blocks_time</code> (default 1000 ms) delays promotion, and <code>innodb_old_blocks_pct</code> sets the old-sublist share.',
        'Move the export to a replica or to an off-peak window, so it does not compete with the hot set on the primary.',
        'Verify: compare checkout p99 latency and <code>pg_stat_io</code> reads in context <code>normal</code> across two export runs, before and after the change.'
      ]
    },
    {
      t: 'Dirty eviction',
      sym: '<b>Read latency</b> spikes during write bursts, while disk read throughput looks normal.',
      ctx: 'An order-ingest service updates about 8,000 rows a second. The background writer cannot flush pages as fast as writers dirty them, so most frames a reader needs hold changes that are not on disk yet.',
      why: 'A frame cannot be reused while it holds unsaved changes. A backend that needs a frame and finds a dirty victim must write it first, so the read waits on a write. That is background flushing work done inside the query path.',
      log: `-- representative pg_stat_bgwriter (PostgreSQL 16 and earlier), counts illustrative
 buffers_clean | buffers_alloc | buffers_backend
   1,203,411   |  9,870,114   |   6,402,955   <- written by query backends`,
      note: 'A rising <code>buffers_backend</code> means query backends are doing the writer&rsquo;s job. PostgreSQL 17 moved these counts into <code>pg_stat_io</code>.',
      fix: [
        'Measure first: track <code>buffers_backend</code> (or writes by backend in <code>pg_stat_io</code>) as a rate. It should stay small next to background writes.',
        'Keep the background writer ahead of the workload: raise <code>bgwriter_lru_maxpages</code> and lower <code>bgwriter_delay</code>, so dirty pages are written before a backend needs their frames.',
        'Spread the writes: commit in smaller batches so dirty pages reach disk steadily, instead of in one burst. Checkpoint I/O bursts are a separate mechanism, covered in chapter 13.',
        'Verify: replay the same write burst and compare p99 read latency before and after the change.'
      ]
    }
  ],
  source: { label: 'Original: Pages, Records, and the Buffer Pool', href: '01-database-systems-end-to-end.html#ch1' },
  scenarios: [
    {
      id: 'loop',
      label: 'Loop thrashing',
      desc: 'A report loops over 5 pages with a 4-frame LRU pool, so every request misses (illustrative sizes).',
      codeLabel: 'Command',
      code: {
        bug: [
          '-- buffer pool: 4 frames, replacer: LRU (illustrative)',
          '-- report: read P1, P2, P3, P4, P5, then repeat',
          '-- pass 2 and pass 3 ask for the same 5 pages',
          '-- Buffers: shared hit=0 read=15'
        ],
        fix: [
          '-- buffer pool: 6 frames, replacer: LRU (illustrative)',
          '-- report: read P1, P2, P3, P4, P5, then repeat',
          '-- Buffers: shared hit=10 read=5'
        ]
      },
      diagram: {
        w: 640, h: 280,
        nodes: [
          { id: 'q', x: 10, y: 30, w: 150, h: 60, t: 'Report query', s: 'loops P1 to P5' },
          { id: 'bpm', x: 240, y: 30, w: 160, h: 60, t: 'Buffer pool mgr', s: 'page table lookup' },
          { id: 'fr', x: 470, y: 30, w: 160, h: 60, t: 'Buffer frames', s: 'pin count, dirty' },
          { id: 'rp', x: 240, y: 190, w: 160, h: 60, t: 'Replacer', s: 'LRU picks a victim' },
          { id: 'dk', x: 470, y: 190, w: 160, h: 60, t: 'Disk manager', s: 'reads whole pages' }
        ],
        edges: [
          { id: 'e1', a: 'q', b: 'bpm', label: 'fetch' },
          { id: 'e2', a: 'bpm', b: 'fr', label: 'hit' },
          { id: 'e3', a: 'bpm', b: 'rp', label: 'miss' },
          { id: 'e4', a: 'rp', b: 'dk', label: 'evict, read' },
          { id: 'e5', a: 'dk', b: 'fr', label: 'load page' }
        ]
      },
      bug: [
        { log: 'Pass 1 reads P1 to P4. Each is a miss, and each loads into one of the 4 free frames.', code: 1, hl: { nodes: { q: 'on', bpm: 'on', dk: 'on', fr: 'on' }, edges: { e1: 'on', e5: 'on' } }, stats: [{ l: 'misses', v: '4', cls: 'warn' }, { l: 'hits', v: '0', cls: 'warn' }] },
        { log: 'P5 is a miss and the pool is full, so LRU evicts P1, the page used longest ago.', code: 1, hl: { nodes: { rp: 'bad', fr: 'warn' }, edges: { e3: 'on', e4: 'bad' } }, stats: [{ l: 'misses', v: '5', cls: 'bad' }, { l: 'evictions', v: '1', cls: 'warn' }] },
        { log: 'Pass 2 asks for P1, which was just evicted. It misses and evicts P2, which is needed next.', code: 2, hl: { nodes: { bpm: 'bad', rp: 'bad' }, edges: { e3: 'bad', e4: 'bad' } }, stats: [{ l: 'misses', v: '6', cls: 'bad' }, { l: 'hits', v: '0', cls: 'bad' }] },
        { log: 'The same happens for every page of pass 2: each request evicts the page the loop wants next.', code: 2, hl: { nodes: { rp: 'bad', dk: 'warn' }, edges: { e4: 'bad', e5: 'on' } }, stats: [{ l: 'misses', v: '10', cls: 'bad' }, { l: 'hits', v: '0', cls: 'bad' }] },
        { log: 'Pass 3 repeats the pattern. All 15 requests miss, so every one waits for a disk read.', code: 3, hl: { nodes: { fr: 'bad', dk: 'bad' }, edges: { e5: 'bad' } }, stats: [{ l: 'misses', v: '15', cls: 'bad' }, { l: 'hit rate', v: '0%', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Pass 1 reads P1 to P5. Each is a miss, and they fill 5 of the 6 frames. Nothing is evicted.', code: 1, hl: { nodes: { q: 'on', bpm: 'on', dk: 'on', fr: 'new' }, edges: { e1: 'on', e5: 'on' } }, stats: [{ l: 'misses', v: '5', cls: 'warn' }, { l: 'evictions', v: '0', cls: 'ok' }] },
        { log: 'Pass 2 finds every page in the page table. Five hits, no disk read, and the replacer stays idle.', code: 1, hl: { nodes: { bpm: 'ok', fr: 'ok', rp: 'dim', dk: 'dim' }, edges: { e2: 'ok' } }, stats: [{ l: 'hits', v: '5', cls: 'ok' }] },
        { log: 'Pass 3 hits again. The pool now holds the whole loop: 5 misses and 10 hits in total.', code: 2, hl: { nodes: { fr: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'misses', v: '5', cls: 'ok' }, { l: 'hits', v: '10', cls: 'ok' }, { l: 'hit rate', v: '67%', cls: 'ok' }] }
      ]
    },
    {
      id: 'dirty',
      label: 'Dirty victim',
      desc: 'A full pool must write a dirty victim page before it can read the requested page (illustrative page numbers).',
      codeLabel: 'Command',
      code: {
        bug: [
          '-- frames hold pages 17, 8, 23, 42; page 42 is dirty and LRU',
          '-- read page 17: hit in frame 1',
          '-- read page 99: miss, no free frame',
          '-- victim: frame 4 (page 42), pin count 0, dirty',
          '-- write page 42, then read page 99 into frame 4'
        ],
        fix: [
          '-- raise bgwriter_lru_maxpages, lower bgwriter_delay',
          '-- background writer flushes page 42 before the request',
          '-- read page 99: victim frame 4 is clean',
          '-- read page 99 into frame 4, no write in the query path'
        ]
      },
      diagram: {
        w: 640, h: 280,
        nodes: [
          { id: 'ex', x: 10, y: 30, w: 140, h: 60, t: 'Executor', s: 'asks for page 99' },
          { id: 'bpm', x: 170, y: 30, w: 140, h: 60, t: 'Buffer pool mgr', s: 'page table' },
          { id: 'rp', x: 330, y: 30, w: 140, h: 60, t: 'Replacer', s: 'LRU or Clock' },
          { id: 'fr', x: 170, y: 190, w: 140, h: 60, t: 'Frame 4', s: 'page 42, dirty' },
          { id: 'dk', x: 330, y: 190, w: 140, h: 60, t: 'Disk manager', s: 'read and write' },
          { id: 'df', x: 490, y: 190, w: 140, h: 60, t: 'Data file', s: 'fixed-size pages' }
        ],
        edges: [
          { id: 'a', a: 'ex', b: 'bpm', label: 'fetch' },
          { id: 'b', a: 'bpm', b: 'rp', label: 'pick victim' },
          { id: 'c', a: 'bpm', b: 'fr', label: 'frame' },
          { id: 'd', a: 'fr', b: 'dk', label: 'page I/O' },
          { id: 'e', a: 'dk', b: 'df', label: 'I/O' }
        ]
      },
      bug: [
        { log: 'Read page 17. The page table maps it to frame 1, so it is a hit with no disk I/O.', code: 1, hl: { nodes: { ex: 'on', bpm: 'ok' }, edges: { a: 'on' } }, stats: [{ l: 'disk reads', v: '0', cls: 'ok' }] },
        { log: 'Read page 99. It is not in the page table, and all four frames are in use.', code: 2, hl: { nodes: { bpm: 'warn' }, edges: { a: 'on' } }, stats: [{ l: 'free frames', v: '0', cls: 'warn' }] },
        { log: 'The replacer picks frame 4, which holds page 42: least recently used and not pinned.', code: 3, hl: { nodes: { rp: 'on', fr: 'warn' }, edges: { b: 'on', c: 'on' } }, stats: [{ l: 'victim', v: 'frame 4', cls: 'warn' }] },
        { log: 'Frame 4 is dirty, so page 42 must be written to the data file before the frame can be reused.', code: 4, hl: { nodes: { fr: 'bad', dk: 'bad', df: 'on' }, edges: { d: 'bad', e: 'bad' } }, stats: [{ l: 'disk writes', v: '1', cls: 'bad' }] },
        { log: 'Only then is page 99 read into frame 4 and pinned. The read waited on a write.', code: 4, hl: { nodes: { dk: 'on', fr: 'on', ex: 'warn' }, edges: { d: 'on', e: 'on' } }, stats: [{ l: 'disk reads', v: '1', cls: 'warn' }, { l: 'disk writes', v: '1', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The background writer runs ahead of the requests and writes page 42 to the data file. Frame 4 is now clean.', code: 1, hl: { nodes: { fr: 'ok', dk: 'on', df: 'on' }, edges: { d: 'on', e: 'on' } }, stats: [{ l: 'dirty frames', v: '0', cls: 'ok' }] },
        { log: 'Read page 99 misses. The replacer picks frame 4, and it needs no write-back.', code: 2, hl: { nodes: { bpm: 'on', rp: 'on', fr: 'ok' }, edges: { a: 'on', b: 'on', c: 'ok' } }, stats: [{ l: 'victim', v: 'clean', cls: 'ok' }] },
        { log: 'Page 99 is read into frame 4 and returned. The query path did 1 read and 0 writes.', code: 3, hl: { nodes: { dk: 'ok', ex: 'ok' }, edges: { d: 'ok' } }, stats: [{ l: 'disk reads', v: '1', cls: 'ok' }, { l: 'disk writes', v: '0', cls: 'ok' }] }
      ]
    },
    {
      id: 'scan',
      label: 'Scan flooding',
      desc: 'A one-time scan of 6 pages pushes the hot pages out of a 4-frame LRU pool (illustrative sizes).',
      codeLabel: 'Command',
      code: {
        bug: [
          '-- 4 frames, LRU; hot set H1, H2, H3 (checkout)',
          '-- checkout reads H1, H2, H3 twice',
          '-- export scans S1 to S6 once, through the same pool',
          '-- checkout reads H1, H2, H3 again'
        ],
        fix: [
          '-- 4 frames; scan pages reuse one reserved frame (a ring)',
          '-- checkout reads H1, H2, H3 twice',
          '-- export scans S1 to S6 through the ring frame',
          '-- checkout reads H1, H2, H3 again'
        ]
      },
      diagram: {
        w: 640, h: 280,
        nodes: [
          { id: 'co', x: 10, y: 30, w: 150, h: 60, t: 'Checkout', s: 'reads H1 to H3' },
          { id: 'exp', x: 10, y: 190, w: 150, h: 60, t: 'Nightly export', s: 'scans S1 to S6' },
          { id: 'bpm', x: 240, y: 110, w: 160, h: 60, t: 'Buffer pool mgr', s: 'LRU replacer' },
          { id: 'hot', x: 470, y: 30, w: 160, h: 60, t: 'Hot frames', s: 'H1, H2, H3' },
          { id: 'ring', x: 470, y: 190, w: 160, h: 60, t: 'Scan frame', s: 'one frame for S pages' }
        ],
        edges: [
          { id: 'a', a: 'co', b: 'bpm', label: 'fetch' },
          { id: 'b', a: 'exp', b: 'bpm', label: 'fetch' },
          { id: 'c', a: 'bpm', b: 'hot', label: 'hot pages' },
          { id: 'd', a: 'bpm', b: 'ring', label: 'scan pages' }
        ]
      },
      bug: [
        { log: 'Checkout reads H1, H2, H3, then reads them again: 3 misses, then 3 hits.', code: 1, hl: { nodes: { co: 'on', hot: 'ok' }, edges: { a: 'on', c: 'on' } }, stats: [{ l: 'hits', v: '3', cls: 'ok' }, { l: 'misses', v: '3', cls: 'warn' }] },
        { log: 'The export reads S1 to S6 once. Each scan page is newer than the hot pages, so LRU evicts H1, H2 and H3.', code: 2, hl: { nodes: { exp: 'on', bpm: 'warn', hot: 'bad' }, edges: { b: 'on', c: 'bad' } }, stats: [{ l: 'misses', v: '9', cls: 'warn' }, { l: 'hot pages left', v: '0', cls: 'bad' }] },
        { log: 'Checkout reads H1, H2, H3 again. All three miss and wait for disk.', code: 3, hl: { nodes: { co: 'bad', hot: 'bad' }, edges: { a: 'bad' } }, stats: [{ l: 'hits', v: '3', cls: 'bad' }, { l: 'misses', v: '12', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Checkout reads H1, H2, H3 twice: 3 misses, then 3 hits, as before.', code: 1, hl: { nodes: { co: 'on', hot: 'ok' }, edges: { a: 'on', c: 'on' } }, stats: [{ l: 'hits', v: '3', cls: 'ok' }] },
        { log: 'The export reads S1 to S6 through the one reserved frame. Each scan page replaces the last scan page only.', code: 2, hl: { nodes: { exp: 'on', ring: 'new', hot: 'ok' }, edges: { b: 'on', d: 'on' } }, stats: [{ l: 'hot pages left', v: '3', cls: 'ok' }] },
        { log: 'Checkout reads H1, H2, H3 again and all three hit: 6 hits and 9 misses in total.', code: 3, hl: { nodes: { co: 'ok', hot: 'ok' }, edges: { a: 'ok', c: 'ok' } }, stats: [{ l: 'hits', v: '6', cls: 'ok' }, { l: 'misses', v: '9', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Storage Models, File Formats, and Compression',
  problem: `An orders table has 100 columns. Checkout writes one order at a time, and a nightly revenue report needs only three of those columns. The report reads about 1 TB to use about 30 GB (illustrative), and the analytics team sees bytes read close to 100% of the table in the engine profile.`,
  predict: {
    q: `The table stores whole rows together in pages, as in chapter 2. The report runs <code>SUM(amount)</code>. Roughly how much of the table must it read?`,
    opts: [
      `Only the amount values, because the query names one column`,
      `Nearly all of it, because every page holds whole rows and must be read to reach amount`,
      `Only the pages an index points to, because SUM uses the primary key`
    ],
    ans: 1,
    why: `A disk read moves a whole page, and a row page keeps every column of each row together. To reach one column the reader still reads every page, so the scan costs the size of the table.`
  },
  explain: `<h3>The idea</h3>
<p>Arrange and encode data according to how the workload reads it. Transactions insert and read whole rows. Analytics scans a few columns over many rows. One layout cannot be best for both.</p>
<h3>How it works, step by step</h3>
<p>A <b>row store</b> (NSM) keeps all columns of a row together in a page. One insert writes one page. A <b>column store</b> (DSM) keeps each column apart, so a scan reads only the columns it needs, but one new row touches one file per column. <b>PAX</b> is a hybrid: rows are grouped into <b>row groups</b>, and inside each group every column is stored as its own <b>column chunk</b>.</p>
<p>Parquet is a column-based file in this style. The writer buffers rows until a row group is full, encodes each column chunk on its own, writes the chunks, and writes a <b>footer</b> last. The footer holds the schema, the offset of every chunk, and the min and max of each chunk, called a <b>zone map</b>. A reader reads the last 8 bytes, then the footer, then only the chunks it needs. Avro, by contrast, is row-based: a header with the schema, then blocks of whole rows, and no footer.</p>
<h3>Encoding and pruning</h3>
<p>Each chunk picks its own encoding. <b>Dictionary</b> encoding stores each distinct value once plus a small id per row. <b>RLE</b> stores runs of repeats. <b>Bit packing</b> uses only the bits a value needs. <b>Delta</b> stores differences between neighbours. <b>Pruning</b> uses the footer min and max to skip row groups that cannot match, before any data is read. <b>Late materialization</b> keeps values encoded as long as possible and decodes only what the query returns.</p>
<h3>The trade-off</h3>
<p>Columns read less and compress better, but appends are buffered until a row group fills, and one row touches many chunks. Encodings only pay off when data repeats: a dictionary for a unique column is larger than the plain data. Zone maps only help when each row group covers a narrow range, so sort order and row-group size matter.</p>`,
  diagnose: [
    {
      t: 'Row layout wastes I/O',
      sym: 'bytes read stay near 100% of the table, even though the query uses one column.',
      ctx: 'The same 8 rows are laid out in row pages. The query needs only amount, but every page is read in full: 256 bytes, which is 100% of the table.',
      why: 'A row page keeps whole rows together. The reader must read the page to reach any column, so a scan costs the size of the table, not the size of the columns it uses.',
      log: `representative, illustrative
query: SUM(amount) FROM orders WHERE day >= 2026-03-01
bytes read: 1.0 TB (columns used: 1 of 100)`,
      fix: [
        'Measure first: read bytes read and columns used in the engine profile for the slow query.',
        'Store analytical tables in a columnar format such as Parquet or ORC.',
        'Select only the columns you need. SELECT * forces every chunk to be read.',
        'Keep transactional tables in row storage, and copy them to a columnar table for reporting.',
        'Verify: compare bytes read in the engine profile before and after the change.'
      ]
    },
    {
      t: 'High-cardinality dictionary',
      sym: 'encoded size grows above the plain size, and the writer has to fall back.',
      ctx: 'user_id is unique in every row; city has only 2 values. Plain: 64 bytes per column. A dictionary of 8 entries for user_id costs 67 bytes, more than plain.',
      why: 'A dictionary stores each distinct value once, plus an id per row. When almost every value is distinct, the dictionary is as large as the data, so it saves nothing and costs work.',
      log: `representative writer warning; wording varies by version
WARN: dictionary for column user_id exceeded its size limit; falling back to plain encoding`,
      fix: [
        'Measure first: check the encoded size of each column in the file metadata, and compare it with the plain size.',
        'Dictionary-encode only columns with few distinct values, such as city or status.',
        'Let the writer fall back to plain or delta encoding for unique columns, such as ids and timestamps.',
        'Verify: user_id should stay close to its plain size, and city should shrink.'
      ]
    },
    {
      t: 'Schema evolution',
      sym: 'the query fails after amount changes from INT32 to DOUBLE, even though the table still looks fine.',
      ctx: 'The reader takes its schema from file 1. File 1 stores amount as INT32 and file 2 stores it as DOUBLE.',
      why: 'A Parquet file records its own column types. The reader must convert each file to one agreed type. Without a table-level schema, the first file decides, and the next file that differs breaks the read.',
      log: `representative, wording varies by engine and version
Parquet column cannot be converted: expected INT32, found DOUBLE (column: amount)`,
      fix: [
        'Measure first: read the column type of amount from each file footer, and find the first file that differs.',
        'Keep one table-level schema, and check every new file against it before it is committed.',
        'Widen types explicitly (INT32 to DOUBLE) in the table definition. Do not change a column type in place.',
        'Use a table format with schema evolution rules, such as Delta or Iceberg, where the schema is kept in the table log (chapter 16).',
        'Verify: read the table from an old file and from a new file, and check the row count and the sum.'
      ]
    },
    {
      t: 'Poor sort order or oversized row groups',
      sym: 'row groups read stay at 4 of 4, even with a narrow date filter.',
      ctx: '4 row groups of 2 rows each, with the min and max day of each. Query: WHERE day >= 03-04. Unsorted, every row group covers 03-01 to 03-04.',
      why: 'Row-group statistics only help when a row group covers a narrow range. Unsorted data gives every row group the same wide min and max. Oversized row groups have the same effect: one group covers the whole file, so nothing can be skipped.',
      log: `representative scan summary, counts illustrative
row groups: 4 total, 0 skipped by statistics
bytes read: 1.2 GB`,
      fix: [
        'Measure first: count the row groups skipped by statistics in the scan summary.',
        'Sort or cluster the data by the column that queries filter, such as day, before writing it.',
        'Keep row groups small enough that each covers a narrow range, but not so small that the metadata grows.',
        'Run a periodic rewrite (compaction) that re-sorts recent small files.',
        'Verify: count the row groups skipped by statistics before and after the change.'
      ]
    }
  ],
  source: { label: 'Original: Storage Models, File Formats, and Compression', href: '01-database-systems-end-to-end.html#ch2' },
  scenarios: [
    {
      id: 'olap',
      label: 'Analytic scan',
      desc: 'SUM(amount) over 8 rows of 4 columns, stored as row pages or as column chunks (illustrative sizes).',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- layout: row store (NSM), 2 pages of 4 rows, 128 bytes each',
          'SELECT SUM(amount) FROM orders;',
          '-- reads page 1 and page 2 in full',
          '-- decodes id, city, amount, day for all 8 rows'
        ],
        fix: [
          '-- layout: column store (DSM), one chunk per column',
          'SELECT SUM(amount) FROM orders;',
          '-- reads only the amount chunk',
          '-- decodes the 8 amount values'
        ]
      },
      diagram: {
        w: 640, h: 280,
        nodes: [
          { id: 'q', x: 10, y: 30, w: 160, h: 60, t: 'SUM(amount)', s: 'uses 1 of 4 columns' },
          { id: 'rp', x: 240, y: 30, w: 160, h: 60, t: 'Row pages', s: '2 pages, 256 B' },
          { id: 'ck', x: 240, y: 190, w: 160, h: 60, t: 'amount chunk', s: '64 B, 8 values' },
          { id: 'dec', x: 470, y: 30, w: 160, h: 60, t: 'Decoder', s: 'expands values' },
          { id: 'out', x: 470, y: 190, w: 160, h: 60, t: 'Result', s: 'sum = 360' }
        ],
        edges: [
          { id: 'a', a: 'q', b: 'rp', label: 'row layout' },
          { id: 'b', a: 'q', b: 'ck', label: 'column layout' },
          { id: 'c', a: 'rp', b: 'dec', label: 'whole rows' },
          { id: 'd', a: 'ck', b: 'dec', label: 'one column' },
          { id: 'e', a: 'dec', b: 'out', label: 'sum' }
        ]
      },
      bug: [
        { log: 'The query needs only amount, but the table is stored as row pages.', code: 1, hl: { nodes: { q: 'on', rp: 'warn' }, edges: { a: 'on' } }, stats: [{ l: 'columns used', v: '1 of 4', cls: 'warn' }] },
        { log: 'Page 1 is read in full: 128 bytes with all 4 columns of rows 1 to 4.', code: 2, hl: { nodes: { rp: 'bad' }, edges: { a: 'bad' } }, stats: [{ l: 'bytes read', v: '128 B', cls: 'warn' }] },
        { log: 'Page 2 is read the same way. 256 bytes, which is 100% of the table.', code: 2, hl: { nodes: { rp: 'bad' }, edges: { a: 'bad', c: 'on' } }, stats: [{ l: 'bytes read', v: '256 B', cls: 'bad' }, { l: 'share of table', v: '100%', cls: 'bad' }] },
        { log: 'The decoder decodes 32 values to use 8. The answer is 360, at four times the needed work.', code: 3, hl: { nodes: { dec: 'bad', out: 'on' }, edges: { c: 'bad', e: 'on' } }, stats: [{ l: 'values decoded', v: '32', cls: 'bad' }, { l: 'sum', v: '360', cls: 'ok' }] }
      ],
      fix: [
        { log: 'The same query runs on a column layout: each column is its own chunk.', code: 0, hl: { nodes: { q: 'on', ck: 'on' }, edges: { b: 'on' } }, stats: [{ l: 'columns used', v: '1 of 4', cls: 'ok' }] },
        { log: 'Only the amount chunk is read. The id, city and day chunks stay on disk.', code: 2, hl: { nodes: { ck: 'ok', rp: 'dim' }, edges: { b: 'ok', a: 'dim' } }, stats: [{ l: 'bytes read', v: '64 B', cls: 'ok' }, { l: 'share of table', v: '25%', cls: 'ok' }] },
        { log: 'The decoder expands 8 values, and all of them are used. The sum is 360.', code: 3, hl: { nodes: { dec: 'ok', out: 'ok' }, edges: { d: 'ok', e: 'ok' } }, stats: [{ l: 'values decoded', v: '8', cls: 'ok' }, { l: 'sum', v: '360', cls: 'ok' }] }
      ]
    },
    {
      id: 'zone',
      label: 'Zone map pruning',
      desc: 'WHERE day >= 03-04 over 4 row groups, with data unsorted or sorted by day (illustrative data).',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- rows written in arrival order, unsorted by day',
          '-- every row group: min day 03-01 or later, max day 03-04',
          'SELECT SUM(amount) FROM orders WHERE day >= \'03-04\';',
          '-- row groups: 4 total, 0 skipped by statistics'
        ],
        fix: [
          '-- rows sorted by day before writing',
          '-- row groups cover 03-01, 03-02, 03-03, 03-04',
          'SELECT SUM(amount) FROM orders WHERE day >= \'03-04\';',
          '-- row groups: 4 total, 3 skipped by statistics'
        ]
      },
      diagram: {
        w: 640, h: 280,
        nodes: [
          { id: 'q', x: 10, y: 30, w: 180, h: 60, t: 'Query', s: 'WHERE day >= 03-04' },
          { id: 'ft', x: 230, y: 30, w: 180, h: 60, t: 'Footer', s: 'min and max per group' },
          { id: 'pr', x: 450, y: 30, w: 180, h: 60, t: 'Pruning', s: 'skip if max < 03-04' },
          { id: 'g1', x: 10, y: 190, w: 145, h: 60, t: 'Row group 1', s: 'rows 1 and 2' },
          { id: 'g2', x: 168, y: 190, w: 145, h: 60, t: 'Row group 2', s: 'rows 3 and 4' },
          { id: 'g3', x: 326, y: 190, w: 145, h: 60, t: 'Row group 3', s: 'rows 5 and 6' },
          { id: 'g4', x: 484, y: 190, w: 145, h: 60, t: 'Row group 4', s: 'rows 7 and 8' }
        ],
        edges: [
          { id: 'a', a: 'q', b: 'ft', label: 'read footer' },
          { id: 'b', a: 'ft', b: 'pr', label: 'min, max' },
          { id: 'c1', a: 'pr', b: 'g1', label: 'g1' },
          { id: 'c2', a: 'pr', b: 'g2', label: 'g2' },
          { id: 'c3', a: 'pr', b: 'g3', label: 'g3' },
          { id: 'c4', a: 'pr', b: 'g4', label: 'g4' }
        ]
      },
      bug: [
        { log: 'The reader reads the footer first. Each row group has its min and max day there.', code: 2, hl: { nodes: { q: 'on', ft: 'on' }, edges: { a: 'on', b: 'on' } }, stats: [{ l: 'row groups', v: '4', cls: 'warn' }] },
        { log: 'Row groups 1 and 2 have max day 03-04, so they can match and must be read.', code: 1, hl: { nodes: { pr: 'warn', g1: 'bad', g2: 'bad' }, edges: { c1: 'bad', c2: 'bad' } }, stats: [{ l: 'skipped', v: '0', cls: 'bad' }] },
        { log: 'Row groups 3 and 4 also have max day 03-04, so they are read too.', code: 1, hl: { nodes: { pr: 'warn', g3: 'bad', g4: 'bad' }, edges: { c3: 'bad', c4: 'bad' } }, stats: [{ l: 'skipped', v: '0', cls: 'bad' }] },
        { log: 'Unsorted: 0 of 4 row groups skipped. Every row group covers 03-01 to 03-04, so the statistics cannot help.', code: 3, hl: { nodes: { g1: 'bad', g2: 'bad', g3: 'bad', g4: 'bad' } }, stats: [{ l: 'row groups read', v: '4 of 4', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The data is sorted by day, so the footer shows narrow ranges: one day per row group.', code: 1, hl: { nodes: { ft: 'ok', q: 'on' }, edges: { a: 'on', b: 'on' } }, stats: [{ l: 'row groups', v: '4', cls: 'ok' }] },
        { log: 'Row groups 1, 2 and 3 have max day 03-01, 03-02 and 03-03, all below 03-04, so they are skipped unread.', code: 3, hl: { nodes: { pr: 'ok', g1: 'dim', g2: 'dim', g3: 'dim' }, edges: { c1: 'dim', c2: 'dim', c3: 'dim' } }, stats: [{ l: 'skipped', v: '3', cls: 'ok' }] },
        { log: 'Only row group 4 can match, so it is the only one read.', code: 3, hl: { nodes: { g4: 'ok' }, edges: { c4: 'ok' } }, stats: [{ l: 'row groups read', v: '1 of 4', cls: 'ok' }] }
      ]
    },
    {
      id: 'oltp',
      label: 'Row insert',
      desc: 'Checkout inserts one order into a column store and into a row store (illustrative 4-column table).',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- layout: column store (DSM), one chunk per column',
          'INSERT INTO orders VALUES (9, \'HN\', 90, \'03-05\');',
          '-- the new row touches id, city, amount and day chunks',
          '-- 4 separate writes for one row'
        ],
        fix: [
          '-- layout: row store (NSM) for the transactional table',
          'INSERT INTO orders VALUES (9, \'HN\', 90, \'03-05\');',
          '-- the new row fits in page 2, one page is rewritten',
          '-- copy to a columnar table later for reporting'
        ]
      },
      diagram: {
        w: 640, h: 280,
        nodes: [
          { id: 'ins', x: 10, y: 30, w: 150, h: 60, t: 'Checkout', s: 'INSERT one order' },
          { id: 'wr', x: 240, y: 30, w: 160, h: 60, t: 'Storage layer', s: 'places the row' },
          { id: 'pg', x: 470, y: 30, w: 160, h: 60, t: 'Row page 2', s: 'whole rows together' },
          { id: 'c1', x: 10, y: 190, w: 145, h: 60, t: 'id chunk', s: 'column file' },
          { id: 'c2', x: 168, y: 190, w: 145, h: 60, t: 'city chunk', s: 'column file' },
          { id: 'c3', x: 326, y: 190, w: 145, h: 60, t: 'amount chunk', s: 'column file' },
          { id: 'c4', x: 484, y: 190, w: 145, h: 60, t: 'day chunk', s: 'column file' }
        ],
        edges: [
          { id: 'a', a: 'ins', b: 'wr', label: 'insert' },
          { id: 'b', a: 'wr', b: 'pg', label: 'row store' },
          { id: 'w1', a: 'wr', b: 'c1', label: 'id' },
          { id: 'w2', a: 'wr', b: 'c2', label: 'city' },
          { id: 'w3', a: 'wr', b: 'c3', label: 'amount' },
          { id: 'w4', a: 'wr', b: 'c4', label: 'day' }
        ]
      },
      bug: [
        { log: 'Checkout inserts one order with 4 values. The table is stored by column.', code: 1, hl: { nodes: { ins: 'on', wr: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'rows inserted', v: '1', cls: 'ok' }] },
        { log: 'Each value belongs to a different chunk: id, city, amount and day.', code: 2, hl: { nodes: { c1: 'warn', c2: 'warn', c3: 'warn', c4: 'warn' }, edges: { w1: 'on', w2: 'on', w3: 'on', w4: 'on' } }, stats: [{ l: 'units touched', v: '4 chunks', cls: 'warn' }] },
        { log: 'One row costs 4 separate writes, one per column. The layout that suits analytics is costly for checkout.', code: 3, hl: { nodes: { c1: 'bad', c2: 'bad', c3: 'bad', c4: 'bad' }, edges: { w1: 'bad', w2: 'bad', w3: 'bad', w4: 'bad' } }, stats: [{ l: 'writes per row', v: '4', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The transactional table is kept as a row store. The new row fits in page 2.', code: 2, hl: { nodes: { ins: 'on', wr: 'on', pg: 'ok' }, edges: { a: 'on', b: 'ok' } }, stats: [{ l: 'units touched', v: '1 page', cls: 'ok' }] },
        { log: 'One page is rewritten for one row. A copy in columnar form serves the reports.', code: 3, hl: { nodes: { pg: 'ok', c1: 'dim', c2: 'dim', c3: 'dim', c4: 'dim' } }, stats: [{ l: 'writes per row', v: '1', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Hash Tables, Indexes, and Filters',
  problem: `A support tool looks up one customer by id in a table of 100 million rows. With no index, each lookup reads every row: at 1 million rows per second it takes about 100 seconds (illustrative). The on-call engineer sees the lookup endpoint time out, and the plan shows a full scan that returns one row.`,
  predict: {
    q: `You add a B+ tree index on <code>customer_id</code>. With 256 entries per node and 100 million keys (illustrative), about how many index pages does one lookup read?`,
    opts: [
      `About 4, one node per level from the root to a leaf`,
      `About 1,000,000, because the index is as large as the table`,
      `Exactly 1, because an index jumps straight to the row`,
      `About 27, because a lookup is a binary search over 100 million keys`
    ],
    ans: 0,
    why: `Each node holds 256 sorted keys, so each level divides the search by 256. Four levels cover 256 to the fourth power, more than 100 million keys, so a lookup reads one page per level.`
  },
  explain: `<h3>The idea</h3>
<p>Keep an auxiliary structure that rules out most rows quickly, and pay for it with space and extra work on every write. Match the structure to the query shape: a hash table for equality, a B+ tree for point and range lookups, a Bloom filter to skip data that cannot match.</p>
<h3>How it works, step by step</h3>
<p>A <b>hash table</b> maps a key to a slot with a fast, non-cryptographic hash function. Lookups are O(1) on average, but keys have no order, so there are no range scans. With <b>linear probing</b> a lookup scans forward from the hashed slot until it finds the key or an empty slot. A missing key must reach an empty slot to be sure, so it gets much more expensive as the table fills. <b>Extendible</b> and <b>linear hashing</b> grow the table by splitting buckets instead of rebuilding it.</p>
<p>A <b>B+ tree</b> is a balanced, sorted tree. Values sit only in the leaves, and sibling pointers link the leaves for range scans. A lookup reads one node per level. An insert goes into the leaf in sorted order; a full leaf splits and copies its middle key up to the parent. A <b>composite key</b> such as (a, b, c) serves a prefix such as a, or a and b, but not b alone.</p>
<p>A <b>Bloom filter</b> is a bit array with k hash functions. An insert sets k bits. A lookup answers "no" for certain or "maybe". It has no false negatives. About 10 bits per key with k = 7 gives about 1% false positives.</p>
<h3>Concurrency</h3>
<p><b>Latches</b> are short locks that protect in-memory structures, not transactions. A B+ tree uses <b>latch crabbing</b>: take the child latch, then release the parent once the child is safe.</p>
<h3>The trade-off</h3>
<p>Every index makes each insert write one more structure and adds storage. Increasing keys all land on the rightmost leaf and contend for its latch. A Bloom filter sized for 1 million keys silently gets worse as keys are added.</p>`,
  diagnose: [
    {
      t: 'Wrong leading column',
      sym: 'a lookup by customer_id examines all 100,000,000 index entries to return 100 rows.',
      ctx: 'The query asks for customer_id = 4242. The index is (status, customer_id), so the leading column is status, which the query does not filter on.',
      why: 'A B+ tree is sorted by the first column, then by the second inside each group. With status first, customer 4242 is spread over all four status groups, so no prefix of the key narrows the search.',
      log: `representative plan summary, counts illustrative
Index Scan using orders_status_customer_idx (status, customer_id)
Filter: (customer_id = 4242)
rows examined: 100000000, rows returned: 100`,
      fix: [
        'Measure first: read rows examined and rows returned in the plan for the slow lookup.',
        'Put the column that the query filters on with equality first: (customer_id, status).',
        'A B+ tree can use any leading prefix of its key, but not a column that comes after a missing prefix. Check the query shapes before choosing the order.',
        'For queries that filter on status alone, add a second index that starts with status, instead of making the first index serve both.',
        'Verify: compare rows examined in the plan before and after the change.'
      ]
    },
    {
      t: 'Too many indexes',
      sym: 'each insert writes 9 pages, and the 8 indexes take 66.4 GB for a 20 GB table.',
      ctx: 'The orders table has 8 indexes, but only 2 of them serve the workload. Each insert must also write one leaf page in every index.',
      why: 'Every index is a copy of some columns, kept in sorted order. An insert must update the leaf of each index, so writes grow with the number of indexes, and so does storage. Most indexes are rarely used.',
      log: `representative usage report, counts illustrative
index orders_idx_3: scans 0 in 30 days, writes 100000000
index orders_idx_7: scans 0 in 30 days, writes 100000000
page writes per insert: 9`,
      fix: [
        'List the indexes with their scan counts from the usage statistics. Drop the ones that no query uses.',
        'Combine indexes that share a leading column when one of them can serve both queries.',
        'Keep a primary key and the few indexes that the top queries need. Measure insert rate before and after each drop.',
        'Verify: page writes per insert and storage size, before and after the change.'
      ]
    },
    {
      t: 'Sequential keys',
      sym: 'every insert lands on the rightmost leaf, and most threads wait for its latch.',
      ctx: '16 threads insert one key each per round into an index with 8 leaves. All 16 keys are larger than the last key, so all land on leaf 8.',
      why: 'Keys that always increase, such as serial ids and timestamps, are always placed at the right end of the tree. Every insert then takes the write latch on the same leaf, so the threads run one at a time.',
      log: `representative latch summary, counts illustrative
index orders_pkey, leaf 8 (rightmost)
threads: 16, inserts per round: 16
latch waits per round: 15`,
      fix: [
        'Measure first: count inserts per leaf and latch waits per round on the busiest index.',
        'Spread the keys: prefix the key with a shard number (for example id % 8), so that inserts go to different leaves.',
        'Use a key that does not follow arrival order, such as a hashed or random id, when write load is high. This costs locality for range scans.',
        'Keep the sequential key when range scans by time matter more, and shard the index instead of changing the key.',
        'Verify: count inserts per leaf and latch waits per round, before and after the change.'
      ]
    },
    {
      t: 'Undersized Bloom filter',
      sym: 'a lookup for a missing customer reads many index pages, because many filters say maybe (illustrative: 21 of 100 files).',
      ctx: 'A lookup for a customer that is in none of the 100 files. Each filter has 3 bits per key, so k = 2 hash functions.',
      why: 'A Bloom filter never has false negatives, but its false positive rate depends on bits per key. At 3 bits per key, roughly one filter in four says maybe for any key, so most of the files the filter was meant to skip are read.',
      log: `# illustrative counts from the playground, not a server log
21 of 100 filter checks answered maybe for a key that is absent`,
      fix: [
        'Measure first: count maybe answers for keys that are not present, and compare with the expected false positive rate.',
        'Size each filter by bits per key. About 10 bits per key gives about 1 percent false positives with 7 hash functions.',
        'Choose the number of hash functions as k = (m / n) ln 2, not a fixed small number.',
        'When a file grows, rebuild its filter for the new key count. A filter sized for 1 million keys gets worse silently as keys are added.',
        'Verify: count maybe answers for missing keys again after the rebuild, and check they match the expected rate.'
      ]
    }
  ],
  source: { label: 'Original: Hash Tables, Indexes, and Filters', href: '01-database-systems-end-to-end.html#ch3' },
  scenarios: [
    {
      id: 'find',
      label: 'Find one customer',
      desc: 'One lookup in 100 million rows, by full scan and by B+ tree (illustrative: 100 rows per page, 256 entries per node).',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- no index on customer_id',
          'SELECT * FROM customers WHERE customer_id = 4242;',
          '-- full scan: read every heap page, 100 rows per page',
          '-- 1,000,000 pages read to return 1 row'
        ],
        fix: [
          'CREATE INDEX customers_id_idx ON customers (customer_id);',
          'SELECT * FROM customers WHERE customer_id = 4242;',
          '-- B+ tree: root, 2 inner levels, leaf',
          '-- leaf entry gives the record id (page, slot)'
        ]
      },
      diagram: {
        w: 640, h: 280,
        nodes: [
          { id: 'q', x: 10, y: 30, w: 140, h: 60, t: 'Lookup', s: 'customer 4242' },
          { id: 'hp', x: 10, y: 190, w: 140, h: 60, t: 'Heap pages', s: '1,000,000 pages' },
          { id: 'rt', x: 175, y: 30, w: 135, h: 60, t: 'Root', s: '256 keys' },
          { id: 'in', x: 335, y: 30, w: 135, h: 60, t: 'Inner levels', s: '2 levels' },
          { id: 'lf', x: 495, y: 30, w: 135, h: 60, t: 'Leaf', s: 'key, record id' },
          { id: 'row', x: 495, y: 190, w: 135, h: 60, t: 'Heap row', s: '(page, slot)' }
        ],
        edges: [
          { id: 'a', a: 'q', b: 'hp', label: 'scan all' },
          { id: 'b', a: 'q', b: 'rt', label: 'descend' },
          { id: 'c', a: 'rt', b: 'in', label: 'level 2, 3' },
          { id: 'd', a: 'in', b: 'lf', label: 'level 4' },
          { id: 'e', a: 'lf', b: 'row', label: 'record id' }
        ]
      },
      bug: [
        { log: 'The lookup has no index to use, so the executor starts a full scan at the first heap page.', code: 1, hl: { nodes: { q: 'on', hp: 'warn' }, edges: { a: 'on' } }, stats: [{ l: 'pages read', v: '1', cls: 'warn' }] },
        { log: 'Each page holds 100 rows. The scan checks every row against customer_id = 4242.', code: 2, hl: { nodes: { hp: 'bad' }, edges: { a: 'bad' } }, stats: [{ l: 'rows examined', v: '50,000,000', cls: 'bad' }] },
        { log: 'The scan reads all 1,000,000 pages. It costs the same whether the customer exists or not.', code: 3, hl: { nodes: { hp: 'bad' }, edges: { a: 'bad' } }, stats: [{ l: 'pages read', v: '1,000,000', cls: 'bad' }, { l: 'rows examined', v: '100,000,000', cls: 'bad' }] },
        { log: 'One row matches. At an illustrative 1 million rows per second, the lookup takes about 100 seconds.', code: 3, hl: { nodes: { q: 'bad' } }, stats: [{ l: 'rows returned', v: '1', cls: 'ok' }, { l: 'time', v: '~100 s', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Read the root node. Its 256 sorted keys say which child can hold 4242.', code: 2, hl: { nodes: { q: 'on', rt: 'on' }, edges: { b: 'on' } }, stats: [{ l: 'pages read', v: '1', cls: 'ok' }] },
        { log: 'Read one node in each of the 2 inner levels, again picking one child.', code: 2, hl: { nodes: { in: 'on' }, edges: { c: 'on' } }, stats: [{ l: 'pages read', v: '3', cls: 'ok' }] },
        { log: 'Read the leaf. It holds key 4242 and its record id. The tree height is 4.', code: 3, hl: { nodes: { lf: 'ok' }, edges: { d: 'ok' } }, stats: [{ l: 'index pages read', v: '4', cls: 'ok' }] },
        { log: 'The record id (page, slot) points to the heap row, so only that page is fetched.', code: 3, hl: { nodes: { row: 'ok', hp: 'dim' }, edges: { e: 'ok', a: 'dim' } }, stats: [{ l: 'index pages read', v: '4', cls: 'ok' }, { l: 'heap pages scanned', v: '0', cls: 'ok' }] }
      ]
    },
    {
      id: 'bloom',
      label: 'Bloom sizing',
      desc: 'A lookup for a missing customer across 100 files, each with a Bloom filter of 3 or 10 bits per key.',
      codeLabel: 'Config',
      code: {
        bug: [
          '-- 100 files of 1 million keys, one Bloom filter each',
          'bits per key = 3, k = 2 hash functions',
          'lookup customer_id = 4242   -- in none of the files',
          '-- each maybe reads that file index (height 3)'
        ],
        fix: [
          'bits per key = 10, k = 7 hash functions',
          '-- k = (m / n) ln 2',
          'lookup customer_id = 4242   -- in none of the files',
          '-- each maybe reads that file index (height 3)'
        ]
      },
      diagram: {
        w: 640, h: 280,
        nodes: [
          { id: 'q', x: 10, y: 110, w: 150, h: 60, t: 'Lookup', s: 'missing customer' },
          { id: 'bf', x: 240, y: 110, w: 170, h: 60, t: 'Bloom filters', s: '100, in memory' },
          { id: 'no', x: 470, y: 30, w: 160, h: 60, t: 'Skip file', s: 'definite no' },
          { id: 'ix', x: 470, y: 190, w: 160, h: 60, t: 'File index', s: '3 pages per read' }
        ],
        edges: [
          { id: 'a', a: 'q', b: 'bf', label: 'check' },
          { id: 'b', a: 'bf', b: 'no', label: 'no' },
          { id: 'c', a: 'bf', b: 'ix', label: 'maybe' }
        ]
      },
      bug: [
        { log: 'The lookup checks each file filter. Filters live in memory, so a check costs no page read.', code: 2, hl: { nodes: { q: 'on', bf: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'filters checked', v: '100', cls: 'ok' }] },
        { log: 'At 3 bits per key with 2 hash functions, the false positive rate is 23.68%.', code: 1, hl: { nodes: { bf: 'warn' } }, stats: [{ l: 'false positive rate', v: '23.68%', cls: 'bad' }] },
        { log: 'In this example, 79 filters say no and those files are skipped, but 21 say maybe.', code: 2, hl: { nodes: { no: 'ok', ix: 'warn' }, edges: { b: 'ok', c: 'bad' } }, stats: [{ l: 'files that say maybe', v: '21', cls: 'bad' }] },
        { log: 'Each maybe reads that file index, 3 pages, and finds nothing. That is 63 wasted page reads.', code: 3, hl: { nodes: { ix: 'bad' }, edges: { c: 'bad' } }, stats: [{ l: 'wasted index reads', v: '63', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Filters are rebuilt at 10 bits per key with 7 hash functions. The false positive rate falls to 0.82%.', code: 0, hl: { nodes: { bf: 'ok' } }, stats: [{ l: 'false positive rate', v: '0.82%', cls: 'ok' }] },
        { log: 'In the same example, 99 filters say no, and 1 file says maybe.', code: 2, hl: { nodes: { no: 'ok', ix: 'warn' }, edges: { b: 'ok', c: 'on' } }, stats: [{ l: 'files that say maybe', v: '1', cls: 'ok' }] },
        { log: 'One wasted index read of 3 pages, instead of 63. The filter costs more memory per key.', code: 3, hl: { nodes: { ix: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'wasted index reads', v: '3', cls: 'ok' }] }
      ]
    },
    {
      id: 'probe',
      label: 'Crowded hash table',
      desc: 'A linear-probing hash index fills with inserts, and lookups for missing keys probe more and more slots (illustrative sizes).',
      codeLabel: 'Command',
      code: {
        bug: [
          '-- linear probing, 2^27 = 134,217,728 slots, 100M keys',
          'insert 10M keys   -- 110M keys, load factor 0.820',
          'insert 10M keys   -- 120M keys, load factor 0.894',
          '-- lookup missing key: probe until an empty slot'
        ],
        fix: [
          'insert 20M keys   -- 140M keys exceed 134,217,728 slots',
          '-- table doubles to 268,435,456 slots (1 rebuild)',
          '-- load factor 0.522',
          '-- lookup missing key: an empty slot comes soon'
        ]
      },
      diagram: {
        w: 640, h: 280,
        nodes: [
          { id: 'q', x: 10, y: 30, w: 150, h: 60, t: 'Lookup', s: 'key not present' },
          { id: 'hf', x: 240, y: 30, w: 160, h: 60, t: 'Hash function', s: 'key to slot' },
          { id: 'sl', x: 470, y: 30, w: 160, h: 60, t: 'Slot array', s: '134,217,728 slots' },
          { id: 'em', x: 470, y: 190, w: 160, h: 60, t: 'Empty slot', s: 'proves key absent' },
          { id: 'rb', x: 240, y: 190, w: 160, h: 60, t: 'Rebuild', s: 'doubles the table' }
        ],
        edges: [
          { id: 'a', a: 'q', b: 'hf', label: 'hash' },
          { id: 'b', a: 'hf', b: 'sl', label: 'start slot' },
          { id: 'c', a: 'sl', b: 'em', label: 'probe forward' },
          { id: 'd', a: 'rb', b: 'sl', label: 'rehash keys' }
        ]
      },
      bug: [
        { log: 'At build, 100 million keys fill 134,217,728 slots: load factor 0.745. A missing key probes 8.19 slots on average.', code: 0, hl: { nodes: { q: 'on', hf: 'on', sl: 'on' }, edges: { a: 'on', b: 'on' } }, stats: [{ l: 'load factor', v: '0.745', cls: 'warn' }, { l: 'probes, key missing', v: '8.19', cls: 'warn' }] },
        { log: 'After 10 million inserts the load factor is 0.820. A missing key now probes 15.86 slots.', code: 1, hl: { nodes: { sl: 'warn' }, edges: { c: 'on' } }, stats: [{ l: 'load factor', v: '0.820', cls: 'warn' }, { l: 'probes, key missing', v: '15.86', cls: 'bad' }] },
        { log: 'After 20 million inserts the load factor is 0.894. A present key needs 5.22 probes, a missing key 45.06.', code: 2, hl: { nodes: { sl: 'bad' }, edges: { c: 'bad' } }, stats: [{ l: 'load factor', v: '0.894', cls: 'bad' }, { l: 'probes, key present', v: '5.22', cls: 'warn' }, { l: 'probes, key missing', v: '45.06', cls: 'bad' }] },
        { log: 'A missing key must walk forward until it reaches an empty slot, and in a crowded table empty slots are rare.', code: 3, hl: { nodes: { sl: 'bad', em: 'warn' }, edges: { c: 'bad' } }, stats: [{ l: 'probes, key missing', v: '45.06', cls: 'bad' }] }
      ],
      fix: [
        { log: '140 million keys exceed the 134,217,728 slots, so the table doubles to 268,435,456 slots and every key is rehashed once.', code: 1, hl: { nodes: { rb: 'new', sl: 'on' }, edges: { d: 'on' } }, stats: [{ l: 'rebuilds since build', v: '1', cls: 'warn' }] },
        { log: 'The load factor drops to 0.522. A missing key now probes 2.68 slots, a present key 1.55.', code: 2, hl: { nodes: { sl: 'ok', em: 'ok' }, edges: { b: 'ok', c: 'ok' } }, stats: [{ l: 'load factor', v: '0.522', cls: 'ok' }, { l: 'probes, key present', v: '1.55', cls: 'ok' }, { l: 'probes, key missing', v: '2.68', cls: 'ok' }] }
      ]
    }
  ]
}
,
{
  title: 'Query Execution Engine',
  problem: `A sales dashboard runs <code>SELECT customer_name, total FROM orders WHERE country = 'VN' AND total &gt; 900 LIMIT 100</code> on a 10,000,000-row orders table with no index (illustrative). It returns 100 rows, yet memory on the database node jumps by about 2 GB while the query runs. On-call sees the engine profile report 10,000,000 rows read from storage for a result that fits on one screen.`,
  predict: {
    q: `About 3 percent of rows match the filter (illustrative). If each row flows up the plan as soon as the scan reads it, how many rows must the scan read before <code>LIMIT 100</code> is satisfied?`,
    opts: [
      `All 10,000,000, because the scan always finishes before the filter starts`,
      `About 3,334, because the limit can stop the scan once 100 rows have matched`,
      `Exactly 100, because the limit is passed down to storage`,
      `300,000, because every matching row must be found first`
    ],
    ans: 1,
    why: `In a pipeline the limit stops asking for rows after 100 matches. At a 3 percent match rate that happens after about 100 / 0.03 = 3,334 rows read, not 10,000,000.`
  },
  explain: `<h3>The idea</h3>
<p>A query plan is a tree of physical <b>operators</b>: scan, filter, limit, join, sort. Each operator transforms a stream of tuples (rows). The rule is simple: move and materialize only the rows and columns the result needs. A <b>pipeline</b> passes rows from one operator to the next without storing a full intermediate result.</p>
<h3>How it works, step by step</h3>
<p>In the <b>iterator (Volcano)</b> model, each operator implements <code>Next</code>, which returns one tuple or an end marker. The root calls <code>Next</code> on its child, and so on down to the scan. Each row is pushed up as far as it can go before the next row is read. <code>LIMIT</code> works because the parent simply stops calling <code>Next</code>.</p>
<p>In the <b>materialization</b> model, each operator processes all of its input and returns all of its output at once. That means fewer calls, which suits OLTP queries that touch few rows. But a limit cannot stop the child early, and large intermediate results must spill to disk.</p>
<p><b>Predicate pushdown</b> evaluates the WHERE conditions inside the scan, so failing rows never cross to the engine. <b>Projection pushdown</b> tells the scan which columns the operators above need. <code>SELECT *</code> says every column is needed.</p>
<p>A <b>pipeline breaker</b> must see all of its input before it emits: the build side of a join, a subquery, <code>ORDER BY</code>, or a materialized CTE. An operator keeps <b>state</b> between calls (a scan cursor, a hash table, buffered rows), and a cancelled query must release it. The engine checks a <b>cancel flag</b>; how often operators check it decides how much work runs after a cancel.</p>
<h3>The trade-off</h3>
<p>Pull-based iterators make a limit easy, but pay one call per row. Batch (vectorized) execution, chapter 10, cuts that cost. Pipeline breakers are sometimes unavoidable, so the design goal is to isolate them and feed them narrow, filtered rows. In the illustrative model, a pipelined plan with pushdown reads about 3,334 rows and holds one 8 KB page. A materialized plan without pushdown reads all 10,000,000 rows and holds about 2,060 MB.</p>`,
  diagnose: [
    {
      t: 'Filter after the scan',
      sym: 'The filter keeps 300,000 rows, but 10,000,000 rows cross from storage to the engine first.',
      ctx: 'A query with no LIMIT returns 300,000 matches, yet the profile shows the full table crossing from storage and 9,700,000 rows removed above the scan.',
      why: 'When the scan does not know the predicate, it must send every row up, and the filter drops most of them. The bytes and calls for the dropped rows are wasted. (With LIMIT 100, a pipeline would stop after about 3,334 rows.)',
      log: `representative plan summary, counts illustrative
Seq Scan on orders (rows out: 10,000,000)
  -> Filter: (country = VN AND total > 900) (rows removed by filter: 9,700,000)`,
      fix: [
        'Measure first: check that the predicate is pushed into the scan. In the plan, the Filter node should sit inside the scan, not above it.',
        'Write predicates in a form the scan understands: plain comparisons on a column, not a function of the column, so the engine can use them.',
        'Keep the storage format that supports predicate evaluation at the scan, such as file statistics (chapter 3).',
        'Verify: rows crossing from storage, in the engine profile, before and after the change.'
      ]
    },
    {
      t: 'SELECT * blocks column pruning',
      sym: 'Every query copies all 20 columns, so the buffer for 300,000 matches is 60 MB instead of 9.6 MB.',
      ctx: 'The client reads only two columns, but the plan output lists all 20 and the buffer for matches is 60 MB.',
      why: 'The plan can only skip a column when no operator above the scan needs it. SELECT * says that every column is needed, so the scan copies all of them, even the ones the client never reads.',
      log: `representative plan summary, counts illustrative
Seq Scan on orders, output: order_id, customer_id, customer_name, country, ... (20 columns)
bytes per row: 200
buffer for matches: 60 MB`,
      fix: [
        'Measure first: read bytes per row and the output column list in the plan for the query.',
        'List the columns the query needs. Do not use SELECT * in a query that feeds a join, a sort or a buffer.',
        'Let the views and the application code name columns. A wide view used by many queries can hide the cost.',
        'In a columnar store, pruning also saves I/O, because the unread column chunks are not fetched at all.',
        'Verify: bytes per row in the plan, and the buffer size for the same query, before and after the change.'
      ]
    },
    {
      t: 'Pipeline breaker holds an oversized intermediate',
      sym: 'A CTE with a LIMIT outside it reads 10,000,000 rows and holds 60 MB in a temp buffer, although only 100 rows are returned.',
      ctx: 'The query returns 100 rows, but the plan shows a materialized CTE Scan and a 60 MB temp buffer.',
      why: 'A materialized CTE is a pipeline breaker: it must finish before its parent starts. The outer LIMIT cannot stop it early, so every match is written to a temp buffer first.',
      log: `representative plan summary, counts illustrative
CTE Scan on recent (materialized)
  Rows Removed by Filter: 9,700,000
Temp buffer: 60 MB
Limit (rows out: 100)`,
      fix: [
        'Measure first: read rows read from storage and the temp buffer size for the CTE in the plan.',
        'Remove the MATERIALIZED keyword, so that the CTE is inlined and the LIMIT can stop the scan. (PostgreSQL 12 and later; the source notes this was written from memory, not checked against a live version.)',
        'Refer to the CTE only once. A CTE used several times may still be materialized by design, so keep it when reuse saves more than it costs.',
        'Filter and project inside the CTE, so the buffer holds narrow rows instead of full ones.',
        'Verify: rows read from storage and temp buffer size, in the plan, before and after the change.'
      ]
    },
    {
      t: 'Cancellation ignored inside the engine',
      sym: 'After the client cancels at 1,000,000 rows, the query runs on for 9,000,000 more rows.',
      ctx: 'The client has already given up, but the server keeps burning CPU and I/O on the query until the stage ends.',
      why: 'A cancel flag that is only checked between large stages lets the operators run to the end of the stage. The cost of a cancel depends on how often the operators look at the flag.',
      log: `representative engine log, counts illustrative
query 4711: cancel requested at row 1000000
query 4711: stage finished at row 10000000
query 4711: cancelled after 9000000 rows past the request`,
      fix: [
        'Measure first: count rows processed after the cancel request in the engine log.',
        'Check the cancel flag once per batch of rows (for example every 1,024 rows) and once per page, not once per stage.',
        'Make the check cheap: a single atomic flag read per batch, so the cost is small compared with the batch.',
        'Propagate the cancel to every operator and to the scan threads, so that no fragment keeps running.',
        'Verify: rows processed after the cancel request, before and after the change.'
      ]
    }
  ],
  source: { label: 'Original: Query Execution Engine', href: '01-database-systems-end-to-end.html#ch4' },
  scenarios: [
    {
      id: 'pipe',
      label: 'Materialized vs pipelined',
      desc: 'The same LIMIT 100 query runs materialized without pushdown, then pipelined with pushdown (illustrative 10,000,000-row table, 3 percent match rate).',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- materialized execution, pushdown off',
          'SELECT customer_name, total',
          'FROM orders',
          "WHERE country = 'VN' AND total > 900",
          'LIMIT 100;',
          '-- each operator finishes its whole input before its parent starts'
        ],
        fix: [
          '-- pipelined (iterator) execution, pushdown on',
          'SELECT customer_name, total',
          'FROM orders',
          "WHERE country = 'VN' AND total > 900",
          'LIMIT 100;',
          '-- the scan gets the predicate and the 2 needed columns'
        ]
      },
      diagram: {
        w: 640, h: 330,
        nodes: [
          { id: 'lim', x: 240, y: 15, w: 160, h: 50, t: 'Limit', s: 'LIMIT 100' },
          { id: 'cl', x: 470, y: 15, w: 150, h: 50, t: 'Client', s: 'wants 100 rows' },
          { id: 'flt', x: 240, y: 145, w: 160, h: 50, t: 'Filter', s: 'country, total' },
          { id: 'tmp', x: 470, y: 145, w: 150, h: 50, t: 'Intermediate', s: 'materialized rows' },
          { id: 'scn', x: 240, y: 275, w: 160, h: 50, t: 'Seq Scan', s: 'orders, 10M rows' },
          { id: 'sto', x: 10, y: 275, w: 170, h: 50, t: 'Storage', s: '200 bytes per row' }
        ],
        edges: [
          { id: 'e1', a: 'sto', b: 'scn', label: 'pages' },
          { id: 'e2', a: 'scn', b: 'flt', label: 'rows' },
          { id: 'e3', a: 'flt', b: 'lim', label: 'matches' },
          { id: 'e4', a: 'lim', b: 'cl', label: '100 rows' },
          { id: 'e5', a: 'scn', b: 'tmp', label: 'materialize' }
        ]
      },
      bug: [
        { log: 'The scan reads all 10,000,000 rows (illustrative), 200 bytes each, with all 20 columns.', code: 2, hl: { nodes: { sto: 'on', scn: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'rows read', v: '10,000,000', cls: 'bad' }] },
        { log: 'The scan materializes every full row before the filter may start: about 2,000 MB held in memory.', code: 5, hl: { nodes: { scn: 'warn', tmp: 'bad' }, edges: { e5: 'bad' } }, stats: [{ l: 'rows materialized', v: '10,000,000', cls: 'bad' }, { l: 'memory', v: '2,000 MB', cls: 'bad' }] },
        { log: 'The filter runs over the whole buffer, keeps 300,000 matches and materializes them too, 60 MB more.', code: 3, hl: { nodes: { flt: 'warn', tmp: 'bad' }, edges: { e2: 'on' } }, stats: [{ l: 'removed by filter', v: '9,700,000', cls: 'warn' }, { l: 'matches', v: '300,000', cls: 'warn' }] },
        { log: 'The limit picks 100 of the 300,000 matches. It could not stop the scan early, so the work is already done.', code: 4, hl: { nodes: { lim: 'warn', cl: 'on' }, edges: { e3: 'on', e4: 'on' } }, stats: [{ l: 'rows returned', v: '100', cls: 'ok' }, { l: 'peak memory', v: '2,060 MB', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The predicate and the 2 needed columns are pushed into the scan. The filter is fused into it.', code: 5, hl: { nodes: { scn: 'new', flt: 'dim', tmp: 'dim' } }, stats: [{ l: 'bytes per row sent', v: '32', cls: 'ok' }] },
        { log: 'The limit calls Next. Each row flows up as soon as the scan reads it; nothing is stored in between.', code: 4, hl: { nodes: { scn: 'ok', lim: 'on' }, edges: { e2: 'ok', e3: 'ok' } }, stats: [{ l: 'rows materialized', v: '0', cls: 'ok' }] },
        { log: 'After about 3,334 rows read, 100 rows have matched. The limit stops calling Next and the scan stops.', code: 4, hl: { nodes: { lim: 'ok', cl: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'rows read', v: '3,334', cls: 'ok' }, { l: 'rows crossing', v: '100', cls: 'ok' }, { l: 'peak memory', v: '8.2 KB', cls: 'ok' }] }
      ]
    },
    {
      id: 'cte',
      label: 'Materialized CTE',
      desc: 'A materialized CTE is a pipeline breaker, so the outer LIMIT 100 cannot stop the scan (illustrative counts).',
      codeLabel: 'Query',
      code: {
        bug: [
          'WITH recent AS MATERIALIZED (',
          '  SELECT * FROM orders',
          "  WHERE country = 'VN' AND total > 900",
          ')',
          'SELECT * FROM recent LIMIT 100;'
        ],
        fix: [
          'WITH recent AS (',
          '  SELECT customer_name, total FROM orders',
          "  WHERE country = 'VN' AND total > 900",
          ')',
          'SELECT * FROM recent LIMIT 100;'
        ]
      },
      diagram: {
        w: 640, h: 330,
        nodes: [
          { id: 'lim', x: 240, y: 15, w: 170, h: 50, t: 'Limit', s: 'LIMIT 100' },
          { id: 'cl', x: 470, y: 15, w: 150, h: 50, t: 'Client', s: '100 rows' },
          { id: 'cs', x: 240, y: 145, w: 170, h: 50, t: 'CTE Scan', s: 'reads the buffer' },
          { id: 'sc', x: 10, y: 275, w: 160, h: 50, t: 'Seq Scan', s: 'orders' },
          { id: 'cte', x: 240, y: 275, w: 170, h: 50, t: 'CTE recent', s: 'pipeline breaker' },
          { id: 'tb', x: 470, y: 275, w: 150, h: 50, t: 'Temp buffer', s: 'matches, full rows' }
        ],
        edges: [
          { id: 'a', a: 'sc', b: 'cte', label: 'rows' },
          { id: 'b', a: 'cte', b: 'tb', label: 'write all' },
          { id: 'c', a: 'tb', b: 'cs', label: 'read' },
          { id: 'd', a: 'cs', b: 'lim', label: 'rows' },
          { id: 'e', a: 'lim', b: 'cl', label: 'result' },
          { id: 'f', a: 'sc', b: 'lim', label: 'pipelined' }
        ]
      },
      bug: [
        { log: 'The CTE is marked MATERIALIZED, so it must finish before the outer query starts.', code: 0, hl: { nodes: { cte: 'warn' } }, stats: [{ l: 'rows read', v: '0', cls: 'ok' }] },
        { log: 'The CTE scans chunk after chunk of orders and writes each match, all 20 columns, to a temp buffer.', code: 1, hl: { nodes: { sc: 'on', cte: 'on', tb: 'warn' }, edges: { a: 'on', b: 'on' } }, stats: [{ l: 'rows read', v: '5,000,000', cls: 'warn' }, { l: 'temp buffer', v: '30 MB', cls: 'warn' }] },
        { log: 'The CTE is complete: 10,000,000 rows read, 300,000 full rows in a 60 MB temp buffer (illustrative).', code: 2, hl: { nodes: { tb: 'bad' }, edges: { b: 'bad' } }, stats: [{ l: 'rows read', v: '10,000,000', cls: 'bad' }, { l: 'temp buffer', v: '60 MB', cls: 'bad' }] },
        { log: 'Only now does the outer query read 100 rows from the buffer and return them.', code: 4, hl: { nodes: { cs: 'on', lim: 'on', cl: 'on' }, edges: { c: 'on', d: 'on', e: 'on' } }, stats: [{ l: 'rows returned', v: '100', cls: 'ok' }] }
      ],
      fix: [
        { log: 'Without MATERIALIZED the CTE is inlined, so the outer LIMIT 100 drives the scan.', code: 0, hl: { nodes: { cte: 'dim', tb: 'dim', cs: 'dim', sc: 'new' }, edges: { f: 'ok' } }, stats: [{ l: 'temp buffer', v: '0 B', cls: 'ok' }] },
        { log: 'Rows are read one at a time; the filter runs in the scan and the limit counts matches.', code: 2, hl: { nodes: { sc: 'ok', lim: 'on' }, edges: { f: 'ok' } }, stats: [{ l: 'rows read', v: '1,667', cls: 'ok' }] },
        { log: 'After about 3,334 rows, 100 matches have been returned. The scan stops and the temp buffer was never used.', code: 4, hl: { nodes: { lim: 'ok', cl: 'ok' }, edges: { e: 'ok' } }, stats: [{ l: 'rows read', v: '3,334', cls: 'ok' }, { l: 'temp buffer', v: '0 B', cls: 'ok' }] }
      ]
    },
    {
      id: 'cancel',
      label: 'Ignored cancel',
      desc: 'A client cancels a 10,000,000-row query at row 1,000,000; the engine stops only as often as it checks the cancel flag (illustrative).',
      codeLabel: 'Config',
      code: {
        bug: [
          '-- query 4711 scans 10,000,000 rows',
          '-- the client cancels at row 1,000,000',
          '-- the engine reads the cancel flag once per stage',
          '-- the stage runs on to row 10,000,000'
        ],
        fix: [
          '-- query 4711 scans 10,000,000 rows',
          '-- the client cancels at row 1,000,000',
          '-- the engine reads the cancel flag once per batch of 1,024 rows',
          '-- the operator stops at the end of the batch in progress'
        ]
      },
      diagram: {
        w: 640, h: 210,
        nodes: [
          { id: 'cl', x: 10, y: 15, w: 160, h: 50, t: 'Client', s: 'cancels at row 1M' },
          { id: 'fl', x: 240, y: 15, w: 170, h: 50, t: 'Cancel flag', s: 'set on request' },
          { id: 'sto', x: 10, y: 145, w: 160, h: 50, t: 'Storage', s: '10M rows' },
          { id: 'op', x: 240, y: 145, w: 170, h: 50, t: 'Operators', s: 'scan + filter' },
          { id: 'ws', x: 470, y: 145, w: 150, h: 50, t: 'Wasted work', s: 'rows after cancel' }
        ],
        edges: [
          { id: 'c1', a: 'cl', b: 'fl', label: 'cancel' },
          { id: 'c2', a: 'fl', b: 'op', label: 'checked' },
          { id: 'c3', a: 'sto', b: 'op', label: 'rows' },
          { id: 'c4', a: 'op', b: 'ws', label: 'past cancel' }
        ]
      },
      bug: [
        { log: 'Chunk 1 of 10 runs: 1,000,000 rows processed. The client has not cancelled yet.', code: 0, hl: { nodes: { sto: 'on', op: 'on' }, edges: { c3: 'on' } }, stats: [{ l: 'rows processed', v: '1,000,000', cls: 'ok' }] },
        { log: 'The client cancels at row 1,000,000 and the cancel flag is set.', code: 1, hl: { nodes: { cl: 'on', fl: 'warn' }, edges: { c1: 'on' } }, stats: [{ l: 'state', v: 'cancel requested', cls: 'warn' }] },
        { log: 'The operators check the flag only at the end of the stage, so chunks 2 to 10 keep running.', code: 2, hl: { nodes: { fl: 'warn', op: 'bad' }, edges: { c2: 'dim', c3: 'on' } }, stats: [{ l: 'rows processed', v: '5,000,000', cls: 'bad' }, { l: 'state', v: 'still running', cls: 'bad' }] },
        { log: 'The stage finishes at row 10,000,000: 9,000,000 rows of work ran after the cancel.', code: 3, hl: { nodes: { ws: 'bad' }, edges: { c4: 'bad' } }, stats: [{ l: 'rows after cancel', v: '9,000,000', cls: 'bad' }, { l: 'state', v: 'ran to the end', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The client cancels at row 1,000,000 and the flag is set.', code: 1, hl: { nodes: { cl: 'on', fl: 'on' }, edges: { c1: 'on' } }, stats: [{ l: 'rows processed', v: '1,000,000', cls: 'ok' }] },
        { log: 'The operators read the flag once per batch of 1,024 rows, so they see it at the end of the current batch.', code: 2, hl: { nodes: { fl: 'ok', op: 'ok' }, edges: { c2: 'ok' } }, stats: [{ l: 'check interval', v: '1,024 rows', cls: 'ok' }] },
        { log: 'The query stops after 1,024 rows past the cancel and releases its operator state.', code: 3, hl: { nodes: { op: 'ok', ws: 'ok' }, edges: { c4: 'ok' } }, stats: [{ l: 'rows after cancel', v: '1,024', cls: 'ok' }, { l: 'state', v: 'stopped', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Sorting, Aggregation, and Join Algorithms',
  problem: `A nightly report joins <code>orders_10m</code> (10,000,000 rows) with <code>events_100m</code> (100,000,000 rows) (illustrative). In staging, with 10,000 rows on each side, the same join finished instantly. In production it runs for hours, temporary storage fills again and again, and the report misses its morning deadline.`,
  predict: {
    q: `The join is fast at 10,000 rows and takes hours at 100,000,000. What makes the cost grow so much faster than the data?`,
    opts: [
      `The plan re-reads the larger table for each chunk of the smaller one, so cost grows with the product of the two sizes`,
      `The result has to travel over the network, and that grows with the row count`,
      `The database takes a lock per row, and lock waits add up`,
      `The disk is slower for big tables, so every page read costs more`
    ],
    ans: 0,
    why: `A nested-loop join reads the inner table once per block of the outer table. Ten times more data on each side means about a hundred times more page reads, not ten.`
  },
  explain: `<h3>The idea</h3>
<p>Sorting, grouping and joining need working space. The same join can run as several physical algorithms, and each is cheap for some sizes and ruinous for others. Pick the algorithm from the input size, the ordering, the available memory and the key distribution. Cost is counted in disk pages read and written, because I/O usually dominates. M and N are the pages of inputs R and S; B is the number of buffer pages.</p>
<h3>How it works, step by step</h3>
<p>A <b>block nested loop</b> join reads the inner table once per block of the outer table. Its cost is M + ceil(M / (B - 2)) × N. That is fine for small inputs and a disaster for two large ones.</p>
<p><b>External merge sort</b> writes sorted runs of B pages, then merges up to B - 1 runs per pass. A <b>sort-merge join</b> sorts both inputs, then merges them in one pass of M + N. If an input is already sorted on the key, its sort is free.</p>
<p>A <b>hash join</b> builds a hash table on the smaller input and probes it with the other. It works only for equi-joins. When the build side does not fit, the <b>Grace hash join</b> hashes both inputs into B - 1 partitions on disk, then builds and probes each partition in memory. The total is 3 × (M + N) when the partitions fit. A partition that still does not fit is split again with a new hash function. This is <b>spilling</b>: moving excess working state to temporary storage.</p>
<p><b>Hash aggregation</b> keeps a table from group key to running value (for AVG, a count and a sum). Sorting is better only when the input is already sorted. In a parallel hash join, every row with the same key goes to the same partition, so a hot key gives one worker most of the work.</p>
<h3>The trade-off</h3>
<p>Hashing reads each input a fixed number of times, but needs memory and an equality key. Sorting costs more up front, but is free on ordered input. A binary join plan can build an intermediate result far larger than its inputs and output. A <b>multiway (worst-case optimal) join</b>, such as leapfrog trie join, avoids that by working one variable at a time, but the attribute order must be fixed in advance. Choosing the join order is chapter 9.</p>`,
  diagnose: [
    {
      t: 'Nested loop on two large inputs',
      sym: 'The nested loop reads 101,100,000 pages, about 2.3 h, because the inner table is rescanned for every block of the outer table.',
      ctx: 'A join of a 10M-row and a 100M-row table runs for hours; the plan shows a Nested Loop with 101 outer blocks.',
      why: 'A block nested loop reads the inner table once per block of the outer table. With 1,000 buffers, the outer table is 101 blocks, so the inner table is read that many times.',
      log: `representative plan summary, counts illustrative
Nested Loop (outer: orders_10m, inner: events_100m)
buffers: 1000, outer blocks: 101
pages read: 101,100,000`,
      fix: [
        'Measure first: read the join algorithm and pages read in the plan.',
        'Use a hash join for an equi-join of two large inputs. It reads each input a fixed number of times, not once per block.',
        'If the join key is already sorted on both sides, use a sort-merge join, which reads each input once.',
        'Put the smaller table on the build side, and check that it is the one the optimizer chooses (chapter 9).',
        'Verify: pages read in the plan before and after the change.'
      ]
    },
    {
      t: 'Hash or sort spills repeatedly',
      sym: 'The join writes its partitions to disk 5 times, because each partition is still too big for the 10 buffers.',
      ctx: 'Temporary storage fills and drains in waves while the join runs; the engine log shows one spilling line per partitioning level.',
      why: 'A partition that does not fit in memory is split again. With few buffers, each split leaves partitions still too large, so the data is written to disk at every level.',
      log: `representative engine log, counts illustrative
hash join: buffers 10, partitions 9
level 1: 11,111 pages per partition, spilling
level 2: 1,235 pages per partition, spilling
level 5: 2 pages per partition, fits in memory`,
      fix: [
        'Measure first: count the spilling levels in the log and the temp I/O pages.',
        'Give the join enough buffers that its first partitions fit in memory. In this case, 1,000 buffers is enough for one level.',
        'Project only the columns the join and the output need, so each row is smaller and the partitions are smaller.',
        'Pre-aggregate or filter before the join, so that fewer rows reach the partitioning step.',
        'Verify: count the levels in the log and temp I/O pages, before and after the change.'
      ]
    },
    {
      t: 'Skewed key sends work to one partition',
      sym: 'One worker holds 38.75 percent of the probe work, while the other 7 workers wait.',
      ctx: 'A parallel join shows one worker pegged and seven idle near the end; the join finishes only when the busiest worker does.',
      why: 'Hash partitioning puts all rows with the same key in the same partition. When 30 percent of the rows share one key, that partition gets far more work than the others, and the join finishes only when its busiest worker does.',
      log: `representative worker summary, counts illustrative
probe rows per worker: w1 = 38,750,000, w2..w8 = 8,750,000 each
max/avg: 3.1x
join wait: 7 workers idle`,
      fix: [
        'Measure first: find the hot keys from statistics, or from a sample, before the join, and read probe rows per worker.',
        'Salt the hot key: add a random suffix on the probe side, and copy the matching build row for each suffix, so the hot rows spread over all workers.',
        'Handle the hot key separately, with a broadcast of its build rows, and hash-join the rest.',
        'Verify: the busiest worker share and the time of the slowest partition, before and after the change.'
      ]
    },
    {
      t: 'Binary join order creates a huge intermediate',
      sym: 'A three-way join stores 100,000,000 intermediate rows, to produce 1,000,000 output rows.',
      ctx: 'A triangle query on a 10M-edge graph returns 1,000,000 rows, but the first hash join emits 100,000,000.',
      why: 'A binary plan joins two tables first, and the result can be much larger than both the inputs and the final output. For a triangle query on a graph, the first two-hop join produces every path, and most of them never close.',
      log: `representative plan summary, counts illustrative
Hash Join (R.b = S.b) rows out: 100,000,000
  -> Hash Join (S.c = T.c) rows out: 1,000,000
intermediate rows stored: 100,000,000`,
      fix: [
        'Measure first: compare intermediate rows in the plan with the input and output row counts.',
        'Use a multiway join (worst-case optimal, such as leapfrog trie join), which works one variable at a time, so no pairwise intermediate is stored.',
        'A multiway join is slower when the pairwise intermediates are not larger than the inputs, so the plan choice depends on that size. Join ordering is chapter 9.',
        'For a binary plan, choose the first join that keeps the intermediate small, using the statistics.',
        'Verify: intermediate rows in the plan, before and after the change.'
      ]
    }
  ],
  source: { label: 'Original: Sorting, Aggregation, and Join Algorithms', href: '01-database-systems-end-to-end.html#ch5' },
  scenarios: [
    {
      id: 'nl',
      label: 'Nested loop join',
      desc: 'A 10M-row table joins a 100M-row table with 1,000 buffer pages, first as a block nested loop, then as a Grace hash join (illustrative 100 MB/s disk).',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- R = orders_10m: 100,000 pages; S = events_100m: 1,000,000 pages',
          'SELECT ... FROM orders_10m r JOIN events_100m s ON s.order_id = r.id;',
          '-- plan: Nested Loop (outer: orders_10m, inner: events_100m)',
          '-- buffers: 1000, outer blocks: 101',
          '-- pages read: 101,100,000'
        ],
        fix: [
          '-- same inputs, same B = 1000 buffers',
          '-- plan: Hash Join (Grace), 999 partitions',
          'partition R: read 100,000 pages, write 100,000 pages',
          'partition S: read 1,000,000 pages, write 1,000,000 pages',
          'build + probe each partition: read 1,100,000 pages'
        ]
      },
      diagram: {
        w: 640, h: 330,
        nodes: [
          { id: 'r', x: 10, y: 15, w: 170, h: 50, t: 'R orders_10m', s: '100,000 pages' },
          { id: 'buf', x: 240, y: 15, w: 170, h: 50, t: 'Buffers B=1000', s: '998 pages per block' },
          { id: 'jn', x: 240, y: 145, w: 170, h: 50, t: 'Join operator', s: 'equi-join on key' },
          { id: 'out', x: 470, y: 145, w: 150, h: 50, t: 'Output', s: '100M rows' },
          { id: 's', x: 10, y: 275, w: 170, h: 50, t: 'S events_100m', s: '1,000,000 pages' },
          { id: 'tmp', x: 240, y: 275, w: 170, h: 50, t: 'Temp partitions', s: '999 per input' }
        ],
        edges: [
          { id: 'n1', a: 'r', b: 'buf', label: 'outer block' },
          { id: 'n2', a: 'buf', b: 'jn', label: 'block' },
          { id: 'n3', a: 's', b: 'jn', label: 'rescan' },
          { id: 'n4', a: 'jn', b: 'out', label: 'rows' },
          { id: 'n5', a: 's', b: 'tmp', label: 'partition' },
          { id: 'n6', a: 'r', b: 'tmp', label: 'partition' },
          { id: 'n7', a: 'tmp', b: 'jn', label: 'build + probe' }
        ]
      },
      bug: [
        { log: 'The first outer block of 998 pages of R is loaded into the buffers.', code: 3, hl: { nodes: { r: 'on', buf: 'on' }, edges: { n1: 'on' } }, stats: [{ l: 'outer block', v: '1 of 101', cls: 'ok' }] },
        { log: 'For that one block, the join scans all of S: 1,000,000 pages.', code: 2, hl: { nodes: { s: 'warn', jn: 'on' }, edges: { n2: 'on', n3: 'bad' } }, stats: [{ l: 'scans of S', v: '1', cls: 'warn' }, { l: 'pages read', v: '1,100,000', cls: 'warn' }] },
        { log: 'Every next block rescans S again. Halfway through, S has been read 50 times.', code: 3, hl: { nodes: { s: 'bad', jn: 'warn' }, edges: { n3: 'bad' } }, stats: [{ l: 'scans of S', v: '50', cls: 'bad' }, { l: 'pages read', v: '50,100,000', cls: 'bad' }] },
        { log: 'Finished: S was scanned 101 times, 101,100,000 pages, about 2.3 h at 100 MB/s (illustrative).', code: 4, hl: { nodes: { out: 'on' }, edges: { n4: 'on' } }, stats: [{ l: 'scans of S', v: '101', cls: 'bad' }, { l: 'pages read', v: '101,100,000', cls: 'bad' }, { l: 'time', v: '2.3 h', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Partition R: read 100,000 pages and write 100,000 pages to 999 partitions on disk.', code: 2, hl: { nodes: { r: 'on', tmp: 'new' }, edges: { n6: 'on' } }, stats: [{ l: 'pages so far', v: '200,000', cls: 'ok' }, { l: 'time so far', v: '16.4 s', cls: 'ok' }] },
        { log: 'Partition S the same way. Each R partition is now about 100 pages, which fits in memory.', code: 3, hl: { nodes: { s: 'on', tmp: 'new' }, edges: { n5: 'on' } }, stats: [{ l: 'pages so far', v: '2,200,000', cls: 'ok' }, { l: 'scans of S', v: '1', cls: 'ok' }] },
        { log: 'Build a hash table on each R partition and probe it with the matching S partition: 1,100,000 more pages.', code: 4, hl: { nodes: { tmp: 'ok', jn: 'ok', out: 'ok' }, edges: { n7: 'ok', n4: 'ok' } }, stats: [{ l: 'pages read', v: '3,300,000', cls: 'ok' }, { l: 'time', v: '4.5 min', cls: 'ok' }] }
      ]
    },
    {
      id: 'spill',
      label: 'Repeated spills',
      desc: 'A Grace hash join on a 100,000-page input splits again at every level while partitions are larger than memory (illustrative).',
      codeLabel: 'Config',
      code: {
        bug: [
          'hash join: buffers 10, partitions 9',
          'level 1: 11,111 pages per partition, spilling',
          'level 2: 1,235 pages per partition, spilling',
          'levels 3 and 4: 137 and 15 pages per partition, spilling',
          'level 5: 2 pages per partition, fits in memory'
        ],
        fix: [
          'hash join: buffers 1000, partitions 999',
          'level 1: 100 pages per partition, fits in memory',
          'build and probe each partition in memory'
        ]
      },
      diagram: {
        w: 640, h: 330,
        nodes: [
          { id: 'inp', x: 10, y: 15, w: 160, h: 50, t: 'Input R', s: '100,000 pages' },
          { id: 'hp', x: 240, y: 15, w: 170, h: 50, t: 'Hash partitioner', s: 'B - 1 partitions' },
          { id: 'dsk', x: 470, y: 15, w: 150, h: 50, t: 'Temp space', s: 'spilled partitions' },
          { id: 'mem', x: 240, y: 145, w: 170, h: 50, t: 'Memory', s: 'B buffer pages' },
          { id: 'jn', x: 240, y: 275, w: 170, h: 50, t: 'Build and probe', s: 'one partition at a time' }
        ],
        edges: [
          { id: 'p1', a: 'inp', b: 'hp', label: 'read' },
          { id: 'p2', a: 'hp', b: 'dsk', label: 'spill' },
          { id: 'p3', a: 'hp', b: 'mem', label: 'fits?' },
          { id: 'p4', a: 'mem', b: 'jn', label: 'join' }
        ]
      },
      bug: [
        { log: 'The join has only B = 10 buffers, so it hashes the input into 9 partitions.', code: 0, hl: { nodes: { inp: 'on', hp: 'on', mem: 'warn' }, edges: { p1: 'on' } }, stats: [{ l: 'buffers', v: '10', cls: 'bad' }] },
        { log: 'Level 1: each partition is 11,111 pages, far larger than 10 buffers, so all of them are written to disk.', code: 1, hl: { nodes: { hp: 'warn', dsk: 'bad' }, edges: { p2: 'bad', p3: 'dim' } }, stats: [{ l: 'levels spilled', v: '1', cls: 'warn' }, { l: 'temp I/O pages', v: '200,000', cls: 'warn' }] },
        { log: 'Level 2: each partition is read back and split again into 1,235-page pieces, still too big.', code: 2, hl: { nodes: { dsk: 'bad', hp: 'warn' }, edges: { p2: 'bad' } }, stats: [{ l: 'levels spilled', v: '2', cls: 'bad' }, { l: 'temp I/O pages', v: '400,000', cls: 'bad' }] },
        { log: 'Levels 3 and 4 rewrite all 100,000 pages twice more, to 137 and then 15 pages per partition.', code: 3, hl: { nodes: { dsk: 'bad' }, edges: { p2: 'bad' } }, stats: [{ l: 'levels spilled', v: '4', cls: 'bad' }, { l: 'temp I/O pages', v: '800,000', cls: 'bad' }] },
        { log: 'Level 5: partitions of about 2 pages finally fit, after every level rewrote the whole input.', code: 4, hl: { nodes: { mem: 'ok', jn: 'on' }, edges: { p3: 'on', p4: 'on' } }, stats: [{ l: 'levels', v: '5', cls: 'bad' }, { l: 'temp I/O pages', v: '1,000,000', cls: 'bad' }] }
      ],
      fix: [
        { log: 'With B = 1,000 buffers, the input is hashed into 999 partitions.', code: 0, hl: { nodes: { inp: 'on', hp: 'on', mem: 'new' }, edges: { p1: 'on' } }, stats: [{ l: 'buffers', v: '1,000', cls: 'ok' }] },
        { log: 'Level 1: each partition is about 100 pages and fits in memory, so no further split is needed.', code: 1, hl: { nodes: { dsk: 'on', mem: 'ok' }, edges: { p2: 'on', p3: 'ok' } }, stats: [{ l: 'levels', v: '1', cls: 'ok' }, { l: 'temp I/O pages', v: '200,000', cls: 'ok' }] },
        { log: 'Each partition is built and probed in memory once.', code: 2, hl: { nodes: { jn: 'ok' }, edges: { p4: 'ok' } }, stats: [{ l: 'temp I/O saved', v: '800,000 pages', cls: 'ok' }] }
      ]
    },
    {
      id: 'skew',
      label: 'Skewed join key',
      desc: 'Eight workers hash-join a 100M-row probe side where 30 percent of rows share one key (illustrative).',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- probe side: 100,000,000 rows, 8 workers',
          '-- 30 percent of the rows share one join key',
          'partition = hash(key) mod 8',
          '-- every hot-key row goes to worker w1'
        ],
        fix: [
          '-- the hot key is found from statistics before the join',
          'probe side: hot key gets a random suffix (salt)',
          'build side: one copy of the hot key row per suffix',
          '-- the hot rows spread over all 8 workers'
        ]
      },
      diagram: {
        w: 640, h: 330,
        nodes: [
          { id: 'w1', x: 470, y: 15, w: 150, h: 50, t: 'Worker w1', s: 'hot key lands here' },
          { id: 'pr', x: 10, y: 145, w: 160, h: 50, t: 'Probe side', s: '100M rows' },
          { id: 'hs', x: 240, y: 145, w: 170, h: 50, t: 'Hash on key', s: 'one partition per key' },
          { id: 'wr', x: 470, y: 145, w: 150, h: 50, t: 'Workers w2..w8', s: '7 other partitions' },
          { id: 'dn', x: 240, y: 275, w: 170, h: 50, t: 'Join finishes', s: 'when slowest is done' }
        ],
        edges: [
          { id: 'k1', a: 'pr', b: 'hs', label: 'rows' },
          { id: 'k2', a: 'hs', b: 'w1', label: 'hot key' },
          { id: 'k3', a: 'hs', b: 'wr', label: 'other keys' },
          { id: 'k4', a: 'w1', b: 'dn', label: 'last' },
          { id: 'k5', a: 'wr', b: 'dn', label: 'early' }
        ]
      },
      bug: [
        { log: 'Eight workers each own one hash partition of the 100,000,000 probe rows.', code: 0, hl: { nodes: { pr: 'on', hs: 'on' }, edges: { k1: 'on' } }, stats: [{ l: 'even split', v: '12.5%', cls: 'ok' }] },
        { log: 'Every row with the hot key hashes to the same partition, so all 30 percent land on w1.', code: 2, hl: { nodes: { hs: 'warn', w1: 'bad' }, edges: { k2: 'bad', k3: 'on' } }, stats: [{ l: 'w1 probe rows', v: '38,750,000', cls: 'bad' }, { l: 'w2..w8 each', v: '8,750,000', cls: 'ok' }] },
        { log: 'Workers w2 to w8 finish early and wait; seven workers sit idle.', code: 3, hl: { nodes: { wr: 'dim', w1: 'bad' }, edges: { k5: 'dim' } }, stats: [{ l: 'idle workers', v: '7', cls: 'warn' }] },
        { log: 'The join ends only when w1 ends, about 3.1 times as long as an even split.', code: 3, hl: { nodes: { dn: 'bad' }, edges: { k4: 'bad' } }, stats: [{ l: 'busiest worker', v: '38.75%', cls: 'bad' }, { l: 'max/avg', v: '3.1x', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Statistics show the hot key before the join starts.', code: 0, hl: { nodes: { hs: 'on' } }, stats: [{ l: 'hot key share', v: '30%', cls: 'warn' }] },
        { log: 'Hot rows get a random suffix and the build row is copied per suffix, so they hash to all 8 partitions.', code: 1, hl: { nodes: { hs: 'new', w1: 'ok', wr: 'ok' }, edges: { k2: 'ok', k3: 'ok' } }, stats: [{ l: 'rows per worker', v: '12,500,000', cls: 'ok' }] },
        { log: 'All workers finish together; the busiest worker holds 12.5 percent.', code: 3, hl: { nodes: { dn: 'ok' }, edges: { k4: 'ok', k5: 'ok' } }, stats: [{ l: 'busiest worker', v: '12.5%', cls: 'ok' }, { l: 'max/avg', v: '1.0x', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Server-Side Logic and UDFs',
  problem: `An analytics team moved a pricing rule into a scalar function, <code>tier_rate()</code>, which looks up a rate in a 5-row table, and called it from a report over 1,000,000 orders (illustrative). The report used to take two seconds; now it runs for several minutes. CPU is busy, and the plan shows only a plain scan of orders.`,
  predict: {
    q: `<code>tier_rate()</code> is a procedural function that runs <code>SELECT rate FROM tiers WHERE tier = $1</code>. The report calls it on 1,000,000 rows. How many times does that inner SELECT run?`,
    opts: [
      `Once, because the result is cached for the whole query`,
      `5 times, once per distinct tier`,
      `1,000,000 times, once per row`,
      `0 times, because the optimizer rewrites it into a join`
    ],
    ans: 2,
    why: `The optimizer treats a procedural UDF as a black box and plans it as one call per row. Each call issues its own statement, so 1,000,000 rows mean 1,000,000 lookups.`
  },
  explain: `<h3>The idea</h3>
<p>A <b>UDF</b> (user-defined function) packages computation that a query can call. A <b>scalar UDF</b> takes values from one row and returns one value. Putting logic in the database saves network round trips and lets many queries reuse it. But it performs well only when the optimizer can inspect, inline and batch it.</p>
<h3>How it works, step by step</h3>
<p>The optimizer treats a procedural UDF (written in PL/pgSQL, PL/SQL, Transact-SQL and others) as a black box. It cannot cost it, so it plans one call per row. Each call pays to enter and leave the function runtime. If the function runs a query, each call also issues its own SQL statement, parsed, planned and run alone. Statements run one at a time, so there is no cross-statement optimization, and correlated queries inside a UDF can prevent parallel execution.</p>
<p>A <b>cursor loop</b> (row by agonizing row) does the same thing in a procedure: one FETCH and one UPDATE per row.</p>
<p><b>Inlining</b> rewrites the function into a relational expression and embeds it in the calling query. Froid, which ships as scalar UDF inlining in SQL Server 2019, does this in five steps: turn statements into SQL expressions, split the body into regions, chain the regions with lateral joins, inline the expression, then optimize the whole query. A <b>lateral join</b> lets a subquery in FROM refer to columns of the row it joins with.</p>
<p><b>Batching</b> turns the function into statements over a temporary table with one row per input tuple, so it runs over many tuples at once. A <b>vectorized UDF</b> receives a batch of values per call, so the call overhead is paid once per batch.</p>
<h3>The trade-off</h3>
<p>In the illustrative model (0.05 ms per call, 0.2 ms per inner statement, 0.0005 ms per row of set work), 1,000,000 rows take 250 s as a scalar UDF, 750 ms batched at 1,000 per call, and about 500 ms inlined. Inlining is not always faster, so the rewritten query still goes through the cost model. A function with side effects, such as writing a log row, cannot safely be inlined or reordered, so it stays a call per row (general reasoning, not from the course notes).</p>`,
  diagnose: [
    {
      t: 'Scalar UDF per row',
      sym: 'UDF calls equal the row count. The query runs for minutes on a table that a set-oriented plan scans in seconds.',
      ctx: 'A report slows from seconds to minutes after logic moved into a function; the plan shows a call count equal to the rows scanned.',
      why: 'A scalar UDF is a black box to the optimizer, so it is planned as one call per row. Each call pays the cost of entering the function runtime and, if the function queries, a statement of its own.',
      log: `representative plan note, wording varies by engine
Function Scan on line_total  (calls=1000000)
  -> SQL statements issued from function: 1000000`,
      fix: [
        'Measure first: check the plan; a Function Scan with a large call count is the signal.',
        'Rewrite the function as a plain SQL expression, or as a view, so the optimizer can inline it.',
        'If the logic must stay procedural, check whether the engine can inline it (for example Froid in SQL Server) and whether that inlining happens in your version.',
        'Verify: the call count in the plan should drop to 0 after inlining, and the elapsed time should fall in step.'
      ]
    },
    {
      t: 'Cursor loop instead of one set',
      sym: 'Round trips grow with rows. A loop that fetches and updates one order at a time sends two statements for each.',
      ctx: 'A batch job that touches 2,000 orders sends 4,000 statements; the server log is a long run of FETCH and UPDATE pairs.',
      why: 'A cursor loop processes rows one at a time (row by agonizing row). Each FETCH and each UPDATE is a separate statement, and the optimizer cannot combine them into one plan.',
      log: `representative client log, wording varies
-- loop body runs once per row
FETCH NEXT FROM order_cur
UPDATE orders SET total = ... WHERE id = $1`,
      fix: [
        'Measure first: count the statements in the server log for one run of the job.',
        'Write one set-oriented UPDATE (or INSERT ... SELECT) that joins the source to the target.',
        'If the loop has real branching, express each branch as a CASE expression inside the set statement.',
        'Keep the cursor only for the rare case that a set statement cannot express, and batch its work.',
        'Verify: count the statements in the server log; a set-oriented version sends one statement per batch, not per row.'
      ]
    },
    {
      t: 'Side effect blocks inlining',
      sym: 'The UDF runs as a black box on every row, and it writes an audit row each time, so the row count of writes equals the row count of calls.',
      ctx: 'The audit_log table grows by one row per scanned row, and the plan shows the function was not inlined.',
      why: 'General reasoning, not from the course notes: the optimizer may inline or reorder only what it can prove has no side effects. A function that writes a log row is a barrier: it stays as a call, and each call performs its own write.',
      log: `representative plan note
Function Scan on audit_price (calls=8, side effects: 8 inserts into audit_log)
Inlining: not applied, function writes to a table`,
      fix: [
        'Measure first: compare the function call count in the plan with the number of rows written to the audit table.',
        'Move the audit write out of the function and into the caller, as one batched INSERT ... SELECT after the main query.',
        'Keep the UDF pure (no writes, no reads of changing state) so the optimizer can inline it and push cheap predicates ahead of it.',
        'Mark functions with the correct volatility, so the planner does not assume they are pure when they are not.',
        'Verify: the function should show as inlined, and the write count should match the number of batches, not the number of rows.'
      ]
    },
    {
      t: 'Unsafe extension crashes the server',
      sym: 'One bad native function kills its server process, and every other session on the server is reset with it.',
      ctx: 'All 200 sessions drop at once and reconnect; the server log shows a segmentation fault in one server process.',
      why: 'General knowledge, not from the course notes: a compiled extension runs inside the database process, with the process memory and privileges. A fault in it is a fault in the server. The server then resets the other sessions to protect shared memory.',
      log: `representative server log, wording varies by version
LOG: server process (PID 4121) was terminated by signal 11: Segmentation fault
WARNING: terminating connection because of crash of another server process`,
      fix: [
        'Measure first: find the crashing call from the terminated process in the server log and the query it was running.',
        'Run untrusted or experimental logic in a separate worker process, with a timeout and memory limit, rather than in the server process.',
        'Prefer the engine interpreted or sandboxed language for UDFs over native code that can crash the process.',
        'Set statement timeouts, so a runaway function fails one query instead of holding a session.',
        'Verify: kill the worker in a test and confirm that only the one query fails and other sessions stay connected.'
      ]
    }
  ],
  source: { label: 'Original: Server-Side Logic and UDFs', href: '01-database-systems-end-to-end.html#ch6' },
  scenarios: [
    {
      id: 'scalar',
      label: 'Scalar vs inlined',
      desc: 'The same tier-rate lookup over 1,000,000 rows runs as a scalar UDF, then as one inlined join (illustrative cost model).',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- tier_rate(tier): SELECT rate FROM tiers WHERE tier = $1',
          'SELECT id, tier_rate(customer_tier) * total',
          'FROM orders;            -- 1,000,000 rows',
          '-- one call and one inner statement per row'
        ],
        fix: [
          'SELECT o.id, t.rate * o.total',
          'FROM orders o',
          'JOIN tiers t ON t.tier = o.customer_tier;',
          '-- one statement, no function call'
        ]
      },
      diagram: {
        w: 640, h: 330,
        nodes: [
          { id: 'pl', x: 10, y: 15, w: 170, h: 50, t: 'Main plan', s: 'scan orders, 1M rows' },
          { id: 'udf', x: 240, y: 15, w: 170, h: 50, t: 'UDF runtime', s: 'enter and leave' },
          { id: 'res', x: 10, y: 145, w: 170, h: 50, t: 'Result', s: 'one value per row' },
          { id: 'st', x: 240, y: 145, w: 170, h: 50, t: 'Inner statement', s: 'parse, plan, run' },
          { id: 'tr', x: 470, y: 145, w: 150, h: 50, t: 'tiers table', s: '5 rows' },
          { id: 'jn', x: 240, y: 275, w: 170, h: 50, t: 'Join with tiers', s: 'one set-oriented plan' }
        ],
        edges: [
          { id: 'u1', a: 'pl', b: 'udf', label: 'call per row' },
          { id: 'u2', a: 'udf', b: 'st', label: 'issues' },
          { id: 'u3', a: 'st', b: 'tr', label: 'lookup' },
          { id: 'u4', a: 'udf', b: 'res', label: 'value' },
          { id: 'u5', a: 'pl', b: 'jn', label: 'inlined' },
          { id: 'u6', a: 'tr', b: 'jn', label: 'join' }
        ]
      },
      bug: [
        { log: 'The scan reads row 1 and calls tier_rate(): one entry into the function runtime (0.05 ms, illustrative).', code: 1, hl: { nodes: { pl: 'on', udf: 'warn' }, edges: { u1: 'on' } }, stats: [{ l: 'UDF calls', v: '1', cls: 'warn' }] },
        { log: 'Inside the call, the function issues its own SELECT, parsed, planned and run alone (0.2 ms, illustrative).', code: 0, hl: { nodes: { st: 'warn', tr: 'on' }, edges: { u2: 'on', u3: 'on' } }, stats: [{ l: 'SQL statements', v: '1', cls: 'warn' }] },
        { log: 'One value comes back and the scan moves to the next row. The optimizer cannot see inside the call to plan around it.', code: 3, hl: { nodes: { res: 'on', udf: 'bad' }, edges: { u4: 'on' } }, stats: [{ l: 'rows done', v: '1 of 1,000,000', cls: 'warn' }] },
        { log: 'Repeated for every row: 1,000,000 calls and 1,000,000 statements, about 250 s in this model.', code: 2, hl: { nodes: { udf: 'bad', st: 'bad' }, edges: { u1: 'bad', u2: 'bad' } }, stats: [{ l: 'UDF calls', v: '1,000,000', cls: 'bad' }, { l: 'SQL statements', v: '1,000,000', cls: 'bad' }, { l: 'time', v: '250.0 s', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The lookup is written as a join, so the optimizer sees the whole query. No function call is left.', code: 2, hl: { nodes: { udf: 'dim', st: 'dim', jn: 'new' }, edges: { u5: 'ok' } }, stats: [{ l: 'UDF calls', v: '0', cls: 'ok' }] },
        { log: 'One statement joins orders with the 5-row tiers table as one set-oriented operation.', code: 0, hl: { nodes: { tr: 'on', jn: 'ok' }, edges: { u6: 'ok' } }, stats: [{ l: 'SQL statements', v: '1', cls: 'ok' }, { l: 'rows of work', v: '1,000,000', cls: 'ok' }] },
        { log: 'At 0.0005 ms per row of set work the query takes about 500 ms, about 500 times faster in this model.', code: 3, hl: { nodes: { pl: 'ok', jn: 'ok' } }, stats: [{ l: 'time', v: '500.2 ms', cls: 'ok' }] }
      ]
    },
    {
      id: 'cursor',
      label: 'Cursor loop',
      desc: 'A procedure updates orders one at a time with a cursor, then with one set-oriented UPDATE (illustrative counts).',
      codeLabel: 'Query',
      code: {
        bug: [
          'DECLARE order_cur CURSOR FOR SELECT id FROM orders;',
          'LOOP',
          '  FETCH NEXT FROM order_cur',
          '  UPDATE orders SET total = ... WHERE id = $1',
          'END LOOP;'
        ],
        fix: [
          'UPDATE orders o',
          'SET total = ...',
          'FROM order_source s     -- illustrative',
          'WHERE s.id = o.id;'
        ]
      },
      diagram: {
        w: 640, h: 210,
        nodes: [
          { id: 'cur', x: 10, y: 15, w: 170, h: 50, t: 'Cursor loop', s: 'one order at a time' },
          { id: 'fe', x: 240, y: 15, w: 170, h: 50, t: 'FETCH NEXT', s: 'one statement' },
          { id: 'up', x: 470, y: 15, w: 150, h: 50, t: 'UPDATE one row', s: 'one statement' },
          { id: 'ord', x: 240, y: 145, w: 170, h: 50, t: 'orders table', s: '2,000 rows' },
          { id: 'set', x: 470, y: 145, w: 150, h: 50, t: 'Set UPDATE', s: 'one statement' }
        ],
        edges: [
          { id: 'q1', a: 'cur', b: 'fe', label: 'read' },
          { id: 'q2', a: 'fe', b: 'up', label: 'then' },
          { id: 'q3', a: 'up', b: 'ord', label: 'write' },
          { id: 'q4', a: 'set', b: 'ord', label: 'all rows' }
        ]
      },
      bug: [
        { log: 'The cursor is opened over the orders.', code: 0, hl: { nodes: { cur: 'on' } }, stats: [{ l: 'statements sent', v: '0', cls: 'ok' }] },
        { log: 'Fetch order o1: one statement to read the row.', code: 2, hl: { nodes: { fe: 'warn' }, edges: { q1: 'on' } }, stats: [{ l: 'statements sent', v: '1', cls: 'warn' }] },
        { log: 'Update o1: one more statement to write it back. The optimizer plans each one alone.', code: 3, hl: { nodes: { up: 'warn', ord: 'on' }, edges: { q2: 'on', q3: 'on' } }, stats: [{ l: 'statements sent', v: '2', cls: 'warn' }, { l: 'rows handled', v: '1', cls: 'ok' }] },
        { log: 'Done: 4 orders took 8 statements. At 2,000 orders that is 4,000 statements.', code: 4, hl: { nodes: { fe: 'bad', up: 'bad' }, edges: { q3: 'bad' } }, stats: [{ l: 'statements (2,000 orders)', v: '4,000', cls: 'bad' }] }
      ],
      fix: [
        { log: 'One set-oriented UPDATE with a join covers all the orders at once.', code: 0, hl: { nodes: { cur: 'dim', fe: 'dim', up: 'dim', set: 'new' }, edges: { q4: 'ok' } }, stats: [{ l: 'statements sent', v: '1', cls: 'ok' }] },
        { log: 'Done: 4 orders took 1 statement. At 2,000 orders it is still 1 statement.', code: 3, hl: { nodes: { set: 'ok', ord: 'ok' }, edges: { q4: 'ok' } }, stats: [{ l: 'statements (2,000 orders)', v: '1', cls: 'ok' }] }
      ]
    },
    {
      id: 'side',
      label: 'Side effect',
      desc: 'A pricing UDF also writes an audit row, so it cannot be inlined and writes once per row (illustrative 8-row sample).',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- audit_price(price): inserts into audit_log, then returns a price',
          'SELECT id, audit_price(price) FROM orders;',
          '-- one call and one audit insert per row'
        ],
        fix: [
          'SELECT id, price * rate FROM orders;       -- pure, inlined',
          'INSERT INTO audit_log SELECT ... FROM orders;  -- one batch',
          '-- 0 calls, 1 audit insert'
        ]
      },
      diagram: {
        w: 640, h: 210,
        nodes: [
          { id: 'q', x: 10, y: 15, w: 160, h: 50, t: 'Query', s: 'price per row' },
          { id: 'fn', x: 240, y: 15, w: 170, h: 50, t: 'audit_price()', s: 'cannot be inlined' },
          { id: 'al', x: 470, y: 15, w: 150, h: 50, t: 'audit_log', s: 'one insert per call' },
          { id: 'inl', x: 240, y: 145, w: 170, h: 50, t: 'Inlined price', s: 'pure expression' },
          { id: 'bat', x: 470, y: 145, w: 150, h: 50, t: 'Batch insert', s: 'INSERT ... SELECT' }
        ],
        edges: [
          { id: 's1', a: 'q', b: 'fn', label: 'call per row' },
          { id: 's2', a: 'fn', b: 'al', label: 'insert' },
          { id: 's3', a: 'q', b: 'inl', label: 'no call' },
          { id: 's4', a: 'inl', b: 'bat', label: 'after query' },
          { id: 's5', a: 'bat', b: 'al', label: 'one write' }
        ]
      },
      bug: [
        { log: 'The function writes an audit row, so the optimizer cannot prove it safe to inline or move.', code: 0, hl: { nodes: { fn: 'warn' } }, stats: [{ l: 'inlining', v: 'not applied', cls: 'warn' }] },
        { log: 'Row 1: the query calls audit_price(), which inserts one audit row.', code: 1, hl: { nodes: { q: 'on', fn: 'on', al: 'warn' }, edges: { s1: 'on', s2: 'on' } }, stats: [{ l: 'UDF calls', v: '1', cls: 'warn' }, { l: 'audit writes', v: '1', cls: 'warn' }] },
        { log: 'Each next row repeats the call and the write. After 8 rows: 8 calls and 8 writes.', code: 2, hl: { nodes: { fn: 'bad', al: 'bad' }, edges: { s1: 'bad', s2: 'bad' } }, stats: [{ l: 'UDF calls', v: '8', cls: 'bad' }, { l: 'audit writes', v: '8', cls: 'bad' }] },
        { log: 'At 1,000,000 rows that is 1,000,000 calls and 1,000,000 audit writes.', code: 2, hl: { nodes: { al: 'bad' } }, stats: [{ l: 'audit writes (1M rows)', v: '1,000,000', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The price logic is made pure and inlined; the scan computes it with no call and no write.', code: 0, hl: { nodes: { fn: 'dim', inl: 'new' }, edges: { s3: 'ok' } }, stats: [{ l: 'UDF calls', v: '0', cls: 'ok' }] },
        { log: 'After the main query, one INSERT ... SELECT writes the audit rows as a single batch.', code: 1, hl: { nodes: { bat: 'new', al: 'ok' }, edges: { s4: 'ok', s5: 'ok' } }, stats: [{ l: 'audit inserts', v: '1', cls: 'ok' }] },
        { log: 'Done: 0 calls and 1 batched audit insert for all 8 rows.', code: 2, hl: { nodes: { inl: 'ok', bat: 'ok' } }, stats: [{ l: 'UDF calls', v: '0', cls: 'ok' }, { l: 'audit inserts', v: '1', cls: 'ok' }] }
      ]
    }
  ]
}
,
{
  title: 'Database Networking and Data Transfer',
  problem: `A nightly BI export pulls 1,000,000 order rows from the database into an analytics tool. <code>EXPLAIN ANALYZE</code> says the query itself runs in 200 ms, but the export takes 12 seconds (illustrative). The database CPU is nearly idle, the network graph shows a steady trickle of small packets, and the client process is busy the whole time.`,
  predict: {
    q: `The query is fast and the server is idle. What should you change first to make the export faster?`,
    opts: [
      `Add an index, so the query finishes sooner`,
      `Give the database server more CPU cores`,
      `Fetch rows in large batches and avoid rebuilding every value on the client`,
      `Turn on general-purpose compression, because the bytes on the wire are the main cost`
    ],
    ans: 2,
    why: `The 200 ms of query work is already done. The rest of the time goes to the path back to the client: round trips, copies and per-value conversion. Compression shrinks bytes, but bytes are rarely the main cost on a fast LAN.`
  },
  explain: `<h3>The idea</h3>
<p>Returning a result is part of the query. Every row is serialized by the server, crosses the network, is copied, and is rebuilt on the client. If each step is done one row at a time, the transfer can take far longer than the query. The fix is to move results in large, efficient batches with as few round trips, copies and format conversions as possible.</p>
<h3>How it works, step by step</h3>
<p>Applications reach the database through <b>ODBC</b>, <b>JDBC</b> or a vendor library such as <b>libpq</b> for Postgres. The driver speaks the <b>wire protocol</b>: the byte format for requests, results and errors over TCP. Each DBMS has its own.</p>
<p>The <b>fetch size</b> is the number of rows the server sends per round trip. A <b>round trip</b> is one request and its answer. With a fetch size of 1, a million rows means a million round trips, and each one waits for the network.</p>
<p>ODBC and JDBC are <b>row-oriented</b>: the server packs one tuple at a time and the client decodes one tuple at a time, building an object per row. Analytics tools want columns. <b>Arrow</b> is a columnar memory layout that both sides agree on. <b>ADBC</b> (Arrow Database Connectivity) sends column vectors instead of rows. DuckDB gives zero-copy access to results through Arrow to client code in the same process.</p>
<p><b>Compression</b> comes in two kinds. General algorithms (lz4, gzip, zstd) are easy to decode with a library but slower. Columnar encodings trade some ratio for decode speed. A <b>connection pool</b> keeps connections open so each request skips the handshake and authentication.</p>
<h3>The trade-off</h3>
<p>A larger fetch size amortizes the round trip, but a batch that is too large raises client memory. Binary encoding is fast but the client must handle byte order. Text encoding avoids that but is larger. Every driver must implement each feature, which is one reason drivers are conservative about new formats.</p>
<h3>What to look at first</h3>
<p>Count round trips, then count conversions. If the query time is small and the client is busy, the transfer is the bottleneck, not the engine.</p>`,
  diagnose: [
    {
      t: 'N+1 queries',
      sym: 'Round trips grow with the number of parent rows. One query for the list, then one query per item: 2,001 round trips for 2,000 orders.',
      ctx: 'A page or job gets slower as the number of orders grows, while each single statement in the log is fast.',
      why: 'Each query in the loop pays a full network round trip before the next one starts. The list query is cheap, but the per-item queries add latency that multiplies with the row count.',
      log: `representative application log, wording varies by stack
query #1  SELECT id FROM orders WHERE day = $1       rows=2000  4 ms
query #2  SELECT * FROM items WHERE order_id = $1  rows=3   0.9 ms
... repeated 2000 times`,
      note: 'The same short statement repeated once per parent row is the signature of N+1.',
      fix: [
        'Measure: count statements per request in the database log. One request should send a constant number, not one per row.',
        'Fetch the parent rows and their children in one query, with a JOIN or an IN list.',
        'Where the ORM generates the per-row queries, enable eager loading for the relation that is read.',
        'Verify: round trips stay at 1 or 2 when the row count grows.'
      ]
    },
    {
      t: 'Tiny fetch size',
      sym: 'A large result arrives one row at a time, so the transfer makes one round trip per row.',
      ctx: 'The query finishes quickly on the server, but the client takes many seconds to read the result.',
      why: 'Fetch size is the number of rows the server sends per round trip. With a fetch size of 1, a result of 100,000 rows needs 100,000 round trips, and each one waits for the network.',
      log: `representative driver setting, names vary by driver
fetchSize=1   rows=100000   round trips=100000   elapsed=24.6 s`,
      note: 'Round trips equal to the row count means the fetch size is 1.',
      fix: [
        'Measure: compare the round trip count with the row count, and check the driver default: some drivers fetch all rows at once, others fetch one row at a time.',
        'Raise the fetch size to a few thousand rows, so one round trip carries a whole batch.',
        'Keep the batch small enough that client memory stays bounded.',
        'Verify: the round trip count in the server log should fall by the fetch size factor.'
      ]
    },
    {
      t: 'Client materializes everything',
      sym: 'The client holds the whole result in memory before it processes the first row, and runs out of memory on large results.',
      ctx: 'The job works on small days and crashes on large ones, with the heap growing until the end.',
      why: 'If the client collects all rows into a list first, memory grows with the result size. A result of a million rows needs about 120 MB of row objects here, and far more in languages with heavier objects.',
      log: `representative client error, wording varies by runtime
java.lang.OutOfMemoryError: Java heap space
  at ResultSetCollector.collectAll(ResultSetCollector.java:42)`,
      note: 'The stack frame shows a collect-all step, not the driver, holding the rows.',
      fix: [
        'Measure: watch client memory while the result is read. If it grows with the row count, the client is holding every row.',
        'Iterate over the result as it arrives. Process each batch and drop it before fetching the next.',
        'Write results straight to the destination (a file or a table) rather than to a list. If the whole result is needed, aggregate in the database and return the aggregate.',
        'Verify: client memory should stay flat as the row count grows.'
      ]
    },
    {
      t: 'Row conversion in analytics',
      sym: 'Most of the time goes to building row objects, one value at a time, before the analytics tool can start.',
      ctx: 'Loading a query result into a dataframe takes seconds even though the query and the network are fast.',
      why: 'Row-oriented APIs deliver one tuple at a time, so the client makes one object or call per value. A columnar result can be handed over as column buffers, so the client makes one call per column instead.',
      log: `representative profile, names vary by tool
fetch+convert  rows=1000000 cols=5  value conversions=5000000  time=8.1 s
build DataFrame from row objects  time=6.4 s`,
      note: 'Value conversions equal to rows times columns means every value was rebuilt.',
      fix: [
        'Measure the fetch and the conversion separately, so the cost is visible in each.',
        'Fetch in columnar form (Arrow or another columnar interchange), so the analytics tool receives buffers.',
        'Use a driver or client library that supports a bulk or columnar fetch, and check its documentation for the format it returns.',
        'Verify: the value conversion count in the profile should drop to 0 for columnar fetches.'
      ]
    }
  ],
  source: { label: 'Original: Database Networking and Data Transfer', href: '01-database-systems-end-to-end.html#ch7' },
  scenarios: [
    {
      id: 'fetch',
      label: 'Fetch size',
      desc: 'One million rows of 64 bytes cross a 1 Gbit/s LAN with a fetch size of 1, then 10,000 (illustrative costs).',
      codeLabel: 'Config',
      code: {
        bug: [
          '# representative driver setting, names vary by driver',
          'fetchSize=1',
          '# result: 1,000,000 rows of 64 bytes',
          '# one round trip per row, 0.2 ms each (illustrative)',
          '# driver builds one row object per row'
        ],
        fix: [
          'fetchSize=10000',
          '# one round trip carries 10,000 rows',
          '# 100 round trips for the whole result',
          '# client holds one batch at a time'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'ex', x: 10, y: 30, w: 150, h: 60, t: 'Query executor', s: 'result ready' },
          { id: 'wire', x: 245, y: 30, w: 150, h: 60, t: 'Wire protocol', s: 'TCP round trips' },
          { id: 'drv', x: 480, y: 30, w: 150, h: 60, t: 'JDBC driver', s: 'decodes rows' },
          { id: 'app', x: 480, y: 200, w: 150, h: 60, t: 'Analytics tool', s: 'row objects' },
          { id: 'mem', x: 245, y: 200, w: 150, h: 60, t: 'Client memory', s: 'one batch held' }
        ],
        edges: [
          { id: 'e1', a: 'ex', b: 'wire', label: 'batch' },
          { id: 'e2', a: 'wire', b: 'drv', label: 'round trip' },
          { id: 'e3', a: 'drv', b: 'app', label: 'objects' },
          { id: 'e4', a: 'app', b: 'mem', label: 'holds' }
        ]
      },
      bug: [
        { log: 'The executor finishes in 200 ms (illustrative). The result is 1,000,000 rows of 64 bytes, 64 MB in total.', code: 2, hl: { nodes: { ex: 'ok' } }, stats: [{ l: 'query time', v: '200 ms', cls: 'ok' }, { l: 'result', v: '64 MB', cls: 'ok' }] },
        { log: 'With fetchSize=1 the driver asks for one row, and the wire protocol carries it in one round trip of 0.2 ms (illustrative).', code: 1, hl: { nodes: { wire: 'bad', drv: 'on' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'rows per round trip', v: '1', cls: 'bad' }] },
        { log: 'That repeats for every row: 1,000,000 round trips, which is 200 s of waiting on the network alone.', code: 3, hl: { nodes: { wire: 'bad' }, edges: { e2: 'bad' } }, stats: [{ l: 'round trips', v: '1,000,000', cls: 'bad' }, { l: 'round-trip time', v: '200 s', cls: 'bad' }] },
        { log: 'The driver also builds one row object per row: 1.5 s of conversion, while the 64 MB themselves take only 0.5 s on the wire.', code: 4, hl: { nodes: { drv: 'warn', app: 'warn' }, edges: { e3: 'on' } }, stats: [{ l: 'conversion', v: '1.5 s', cls: 'warn' }, { l: 'bytes on wire', v: '0.5 s', cls: 'ok' }] },
        { log: 'The transfer takes about 202 s for a 200 ms query, and almost all of it is round trips.', code: 1, stats: [{ l: 'total', v: '202.0 s', cls: 'bad' }, { l: 'copies', v: '3', cls: 'warn' }] }
      ],
      fix: [
        { log: 'With fetchSize=10000, one round trip carries 10,000 rows.', code: 0, hl: { nodes: { wire: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'rows per round trip', v: '10,000', cls: 'ok' }] },
        { log: 'The whole result now takes 100 round trips, 20 ms of round-trip time instead of 200 s.', code: 2, hl: { nodes: { wire: 'ok', drv: 'on' }, edges: { e1: 'ok', e2: 'ok' } }, stats: [{ l: 'round trips', v: '100', cls: 'ok' }, { l: 'round-trip time', v: '20 ms', cls: 'ok' }] },
        { log: 'The client holds one batch at a time, about 1.2 MB of row objects, so memory stays bounded.', code: 3, hl: { nodes: { mem: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'client memory', v: '1.2 MB per batch', cls: 'ok' }] },
        { log: 'Total time falls to about 2.0 s. Now the 1.5 s of row conversion is the largest cost, which the next scenario removes.', code: 1, hl: { nodes: { app: 'warn' }, edges: { e3: 'on' } }, stats: [{ l: 'total', v: '2.0 s', cls: 'ok' }, { l: 'conversion', v: '1.5 s', cls: 'warn' }] }
      ]
    },
    {
      id: 'arrow',
      label: 'Columnar transfer',
      desc: 'The same million rows sent as row tuples and then as Arrow-style column buffers, fetch size 10,000 (illustrative costs).',
      codeLabel: 'Config',
      code: {
        bug: [
          '# row-oriented fetch (ODBC / JDBC style)',
          'fetchSize=10000',
          '# server packs one tuple at a time',
          '# driver decodes one tuple at a time',
          '# analytics tool rebuilds columns from row objects'
        ],
        fix: [
          '# columnar fetch (Arrow-style, for example ADBC)',
          'fetchSize=10000',
          '# server sends column vectors',
          '# client wraps the buffers, no row objects',
          '# embedded DuckDB: Arrow buffers in the same process'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'ex', x: 10, y: 30, w: 150, h: 60, t: 'Query executor', s: 'internal layout' },
          { id: 'ser', x: 245, y: 30, w: 150, h: 60, t: 'Serializer', s: 'rows or columns' },
          { id: 'wire', x: 480, y: 30, w: 150, h: 60, t: 'Wire protocol', s: 'bytes over TCP' },
          { id: 'drv', x: 480, y: 200, w: 150, h: 60, t: 'Driver', s: 'decode' },
          { id: 'df', x: 245, y: 200, w: 150, h: 60, t: 'Dataframe', s: 'wants columns' }
        ],
        edges: [
          { id: 'e1', a: 'ex', b: 'ser', label: 'result' },
          { id: 'e2', a: 'ser', b: 'wire', label: 'encode' },
          { id: 'e3', a: 'wire', b: 'drv', label: 'bytes' },
          { id: 'e4', a: 'drv', b: 'df', label: 'values' }
        ]
      },
      bug: [
        { log: 'The serializer packs one tuple at a time into protocol messages.', code: 2, hl: { nodes: { ex: 'on', ser: 'warn' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'bytes on wire', v: '64 MB', cls: 'warn' }] },
        { log: 'The bytes are copied from the server buffer to the socket and again into the driver.', code: 1, hl: { nodes: { wire: 'on' }, edges: { e3: 'on' } }, stats: [{ l: 'copies', v: '3', cls: 'warn' }] },
        { log: 'The driver decodes each tuple and builds a row object, one value at a time.', code: 3, hl: { nodes: { drv: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'conversion', v: '1.5 s', cls: 'bad' }] },
        { log: 'The dataframe then rebuilds columns from those row objects. The whole transfer takes about 2.0 s (illustrative).', code: 4, hl: { nodes: { df: 'bad' } }, stats: [{ l: 'total', v: '2.0 s', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The serializer writes column vectors in an agreed Arrow-style layout. Columnar encodings shrink the result to about 25.6 MB.', code: 2, hl: { nodes: { ser: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'bytes on wire', v: '25.6 MB', cls: 'ok' }] },
        { log: 'The driver wraps the received buffers instead of building row objects, with one copy.', code: 3, hl: { nodes: { drv: 'ok' }, edges: { e3: 'ok', e4: 'ok' } }, stats: [{ l: 'copies', v: '1', cls: 'ok' }, { l: 'conversion', v: '0.02 s', cls: 'ok' }] },
        { log: 'The dataframe reads the columns directly. The transfer takes about 0.24 s instead of 2.0 s.', code: 1, hl: { nodes: { df: 'ok' } }, stats: [{ l: 'total', v: '0.24 s', cls: 'ok' }] },
        { log: 'With an embedded DBMS such as DuckDB in the same process, the tool gets a view on the same Arrow buffers: 0 copies and 0 conversions.', code: 4, hl: { nodes: { ex: 'new', df: 'ok' }, edges: { e3: 'dim' } }, stats: [{ l: 'copies', v: '0', cls: 'ok' }, { l: 'conversions', v: '0', cls: 'ok' }] }
      ]
    },
    {
      id: 'nplus1',
      label: 'N+1 queries',
      desc: 'An ORM loads 2,000 orders and then queries items once per order, then the same data in one JOIN (illustrative timings).',
      codeLabel: 'Query',
      code: {
        bug: [
          'SELECT id FROM orders WHERE day = $1;       -- 2,000 rows',
          '-- for each order:',
          'SELECT * FROM items WHERE order_id = $1;   -- 0.9 ms',
          '-- 2,001 statements per request'
        ],
        fix: [
          'SELECT o.id, i.*',
          'FROM orders o JOIN items i ON i.order_id = o.id',
          'WHERE o.day = $1;',
          '-- 1 statement per request'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'app', x: 10, y: 110, w: 150, h: 60, t: 'Application', s: 'ORM loop' },
          { id: 'net', x: 245, y: 110, w: 150, h: 60, t: 'Network', s: 'one round trip each' },
          { id: 'db', x: 480, y: 110, w: 150, h: 60, t: 'Database', s: 'fast statements' },
          { id: 'log', x: 480, y: 220, w: 150, h: 60, t: 'Statement log', s: 'count per request' }
        ],
        edges: [
          { id: 'e1', a: 'app', b: 'net', label: 'query' },
          { id: 'e2', a: 'net', b: 'db', label: 'trip' },
          { id: 'e3', a: 'db', b: 'log', label: 'logged' }
        ]
      },
      bug: [
        { log: 'The list query returns 2,000 orders in 4 ms: 1 round trip.', code: 0, hl: { nodes: { app: 'on', db: 'ok' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'round trips', v: '1', cls: 'ok' }] },
        { log: 'The ORM loops over the orders and sends one items query per order. Each waits a full round trip before the next starts.', code: 2, hl: { nodes: { app: 'warn', net: 'bad' }, edges: { e1: 'bad', e2: 'bad' } }, stats: [{ l: 'round trips', v: '2 to 2,001', cls: 'warn' }] },
        { log: 'Each items query is only 0.9 ms (illustrative), so nothing looks slow on its own.', code: 2, hl: { nodes: { db: 'ok' } }, stats: [{ l: 'per statement', v: '0.9 ms', cls: 'ok' }] },
        { log: 'The statement log shows 2,001 statements for one request, about 1.8 s in total plus network waits.', code: 3, hl: { nodes: { log: 'bad' }, edges: { e3: 'on' } }, stats: [{ l: 'round trips', v: '2,001', cls: 'bad' }, { l: 'statements', v: '2,001', cls: 'bad' }] }
      ],
      fix: [
        { log: 'One JOIN fetches the orders and their items together.', code: 1, hl: { nodes: { app: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'statements', v: '1', cls: 'ok' }] },
        { log: 'The result crosses the network in batched round trips set by the fetch size, not one per order.', code: 2, hl: { nodes: { net: 'ok', db: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'round trips', v: '1', cls: 'ok' }] },
        { log: 'The statement log shows a constant count per request, even when the day has more orders.', code: 3, hl: { nodes: { log: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'statements per request', v: '1', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Query Optimization and Cost Models',
  problem: `A nightly bulk load grows the <code>products</code> table tenfold. The next morning the sales report, a four-table join of customers, orders, items and products, takes about three times longer than yesterday (illustrative). The SQL text did not change. <code>EXPLAIN ANALYZE</code> shows estimated rows=5000 and actual rows=50000 on the products scan.`,
  predict: {
    q: `The query text is identical and the data grew only in one table. Why did the whole query slow down by much more than that table's share of the work?`,
    opts: [
      `More data makes every plan slower by the same factor`,
      `The optimizer ranked plans with old row counts and chose a join order that builds a large intermediate result`,
      `The hash join algorithm cannot handle tables above 5,000 rows`,
      `The buffer pool is cold after the load, so every page comes from disk`
    ],
    ans: 1,
    why: `The optimizer does not run plans to compare them. It trusts its estimates, so a table it thinks is small looks like a cheap place to start, and the real plan carries far more rows than estimated.`
  },
  explain: `<h3>The idea</h3>
<p>SQL says what to compute, not how. Many plans give the same answer, and their costs can differ hugely. The <b>optimizer</b> searches equivalent plans and estimates which one will use the least resources. It never runs them to compare. Wrong estimates lead to wrong plans.</p>
<h3>How it works, step by step</h3>
<p>First, <b>rewrite rules</b> turn the logical plan into equivalent forms: push filters down, drop unused columns early, and decorrelate subqueries into joins. Rules like these need only the catalog, not the data.</p>
<p>Next, <b>cardinality estimation</b> predicts how many rows each operator produces. The catalog keeps the row count of each table (N_R) and the distinct values of each column (V(A,R)). For an equality filter the estimate is N_R / V(A,R), which assumes uniform data. For two predicates joined by AND, the estimator multiplies their selectivities, which assumes they are independent. <b>Histograms</b> and <b>sampling</b> refine these numbers. <code>ANALYZE</code> refreshes them.</p>
<p>Then the optimizer <b>searches join orders</b>. System R-style search, used by Postgres, builds bottom-up with dynamic programming: the best plan for one table, then for two, and so on. Cascades-style optimizers search top-down with a <b>memo</b> of groups, where each group holds equivalent expressions and is explored once.</p>
<p>Finally, a <b>cost model</b> ranks the physical plans. Postgres weights CPU and I/O with constants: by default a tuple in memory counts as 400 times faster than one from disk, and sequential I/O as 4 times faster than random I/O. The number only compares plans; it means nothing on its own.</p>
<h3>The trade-off</h3>
<p>Join orders grow exponentially with the number of tables, so search must be bounded. Postgres switches to its genetic optimizer (GEQO) for complex queries. A plan is only as good as its estimates, and real data breaks the uniformity and independence assumptions. Studies on the JOB workload found every system underestimates more as joins grow. Better cardinality estimates help more than a more accurate cost model, and hash joins over sequential scans are a robust default when estimates are doubtful.</p>`,
  diagnose: [
    {
      t: 'Stale statistics',
      sym: 'The optimizer joins the wrong way: a table grew 10x since the last ANALYZE, so the plan starts from it as if it were small.',
      ctx: 'A query that did not change slows down after a large load into one of its tables.',
      why: 'The optimizer ranks plans with its estimates. When the statistics say a table has 5,000 rows, it looks cheap to start from, and the plan carries a large intermediate result that the estimate missed.',
      log: `representative EXPLAIN ANALYZE, numbers illustrative
Hash Join  (estimated rows=20000)  (actual rows=200000)
  -> Seq Scan on products  (estimated rows=5000)  (actual rows=50000)`,
      note: 'A tenfold gap between estimated and actual rows on a base table points at its statistics.',
      fix: [
        'Measure: compare estimated and actual rows on each node of the plan. A large gap is the signal.',
        'Run ANALYZE after large loads, or let autovacuum analyze the table once it changes by a set fraction.',
        'Use an incremental statistics refresh for tables that grow every day, so the estimate follows the table.',
        'Verify: after ANALYZE the picked plan should match the best plan, and the estimate should be close to the actual rows.'
      ]
    },
    {
      t: 'Correlated predicates',
      sym: 'The customer filter is estimated 10x too small, because two predicates are treated as independent when they overlap.',
      ctx: 'A filter on two related columns returns far more rows than the plan expected, and the join order built on it is slow.',
      why: 'The optimizer multiplies the selectivities of the two predicates (independence). When one predicate implies the other, the real selectivity is the smaller one, so the product is far too low, and the optimizer starts from a table it thinks is tiny.',
      log: `representative plan note, numbers illustrative
Seq Scan on customers  Filter: region = HN AND segment = gold
  estimated rows=1000  actual rows=10000`,
      note: 'Each predicate alone is estimated well. Only the AND of the two is wrong.',
      fix: [
        'Measure: compare the estimate with the actual rows in EXPLAIN ANALYZE for the combined filter.',
        'Create column-group statistics (or extended statistics) on the correlated columns, so the optimizer sees their joint distribution.',
        'Where the correlation is known, rewrite the predicate in a form that states the dependency directly, such as a single predicate on the key.',
        'Verify: the estimate on the filtered table should match the actual rows within a small factor.'
      ]
    },
    {
      t: 'Cached plan for other parameters',
      sym: 'A plan built for one parameter value runs slowly for another: an index loop chosen for a rare value probes the index once per matching row of a common value.',
      ctx: 'A prepared statement is fast for most calls and very slow for a few popular values.',
      why: 'A prepared statement can reuse one plan for every parameter value. The plan was chosen for a rare value, where an index loop is cheap. For a common value the same loop does one probe per row, while a full scan with a hash join reads the table once.',
      log: `representative plan-cache note, wording varies by engine
prepared statement reused: plan built for region = $1 (rare value)
Nested Loop  (loops=10000)  Index Scan on orders`,
      note: 'loops=10000 on the inner index scan shows one probe per matching row.',
      fix: [
        'Measure: check the plan cache setting for prepared statements in your engine, and test the plan for both a rare and a common value.',
        'Let the engine re-plan for each parameter value (custom plans), or use a generic plan only when its cost is close to the custom one.',
        'Where the values are very skewed, split the query so that common and rare values take different paths.',
        'Verify: the page reads for the common value should match a scan-based plan, and the rare value should keep its index loop.'
      ]
    },
    {
      t: 'Search budget exceeded',
      sym: 'A many-table query stalls in planning: the optimizer enumerates far more join orders than it can finish in its time budget.',
      ctx: 'A generated query with many joins spends seconds in planning before the first row is read.',
      why: 'The number of subset pairs grows like 3 to the power n for bushy plans. Exhaustive search is practical for a few tables, and hopeless for many. The optimizer hits its time budget and either returns a poor plan or fails.',
      log: `representative planner message, wording varies by engine
planning took 42.7 s; join search exceeded the planning budget
fallback: no plan within the time limit`,
      fix: [
        'Measure: compare planning time with execution time as the number of tables in the query grows.',
        'Set a budget: a maximum number of join candidates, or a time limit with a cheaper fallback.',
        'Above the threshold, switch from exhaustive DP to a greedy or randomized search, which keeps the plan complete. Split the query into blocks (for example, around a subquery), so each block has fewer tables.',
        'Verify: planning time should stay bounded as the table count grows, and the plan should still be complete.'
      ]
    }
  ],
  source: { label: 'Original: Query Optimization and Cost Models', href: '01-database-systems-end-to-end.html#ch8' },
  scenarios: [
    {
      id: 'stale',
      label: 'Stale statistics',
      desc: 'Four tables, customers 100,000, orders 2,000,000, items 8,000,000, products 50,000 rows, while the statistics still say products has 5,000 (illustrative model, cost = sum of intermediate rows).',
      codeLabel: 'Query',
      code: {
        bug: [
          'SELECT ...',
          'FROM customers c JOIN orders o ON o.customer_id = c.id',
          '  JOIN items i ON i.order_id = o.id',
          '  JOIN products p ON p.id = i.product_id',
          "WHERE c.region = 'HN' AND c.segment = 'gold' AND p.category = 'X';",
          '-- statistics: products = 5,000 rows (before the load)'
        ],
        fix: [
          'ANALYZE products;',
          '-- statistics: products = 50,000 rows',
          'EXPLAIN ANALYZE SELECT ... ;   -- same query text'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'st', x: 10, y: 30, w: 150, h: 60, t: 'Statistics', s: 'rows, distinct keys' },
          { id: 'card', x: 245, y: 30, w: 150, h: 60, t: 'Cardinality est.', s: 'rows per join' },
          { id: 'dp', x: 480, y: 30, w: 150, h: 60, t: 'Join search (DP)', s: 'connected subsets' },
          { id: 'cost', x: 480, y: 200, w: 150, h: 60, t: 'Cost model', s: 'sum of intermediates' },
          { id: 'plan', x: 245, y: 200, w: 150, h: 60, t: 'Chosen plan', s: 'join order' },
          { id: 'ex', x: 10, y: 200, w: 150, h: 60, t: 'Executor', s: 'actual rows' }
        ],
        edges: [
          { id: 'e1', a: 'st', b: 'card', label: 'N_R, V(A,R)' },
          { id: 'e2', a: 'card', b: 'dp', label: 'estimates' },
          { id: 'e3', a: 'dp', b: 'cost', label: 'candidates' },
          { id: 'e4', a: 'cost', b: 'plan', label: 'cheapest' },
          { id: 'e5', a: 'plan', b: 'ex', label: 'run' }
        ]
      },
      bug: [
        { log: 'The statistics from the last ANALYZE say products has 5,000 rows. It really has 50,000 after the load.', code: 5, hl: { nodes: { st: 'bad' } }, stats: [{ l: 'products estimated', v: '5,000', cls: 'bad' }, { l: 'products actual', v: '50,000', cls: 'warn' }] },
        { log: 'Cardinality estimation says items joined with products gives 16,000 rows. The real number is 160,000.', code: 3, hl: { nodes: { card: 'warn' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'items ⋈ products est.', v: '16,000', cls: 'warn' }, { l: 'actual', v: '160,000', cls: 'bad' }] },
        { log: 'Dynamic programming over connected subsets ranks every join order. Starting from products looks cheapest: C ⋈ (O ⋈ (I ⋈ P)) at an estimated cost of 32,160.', code: 1, hl: { nodes: { dp: 'on', cost: 'on', plan: 'warn' }, edges: { e3: 'on', e4: 'on' } }, stats: [{ l: 'estimated cost', v: '32,160', cls: 'ok' }] },
        { log: 'The executor runs that plan. Its joins produce 160,000, 160,000 and 1,600 rows, for an actual cost of 321,600.', code: 2, hl: { nodes: { ex: 'bad' }, edges: { e5: 'bad' } }, stats: [{ l: 'actual cost', v: '321,600', cls: 'bad' }] },
        { log: 'The best plan under the true numbers is ((C ⋈ O) ⋈ I) ⋈ P at 101,600. The picked plan does 3.17 times the work.', code: 4, hl: { nodes: { plan: 'bad' } }, stats: [{ l: 'best plan cost', v: '101,600', cls: 'ok' }, { l: 'actual / best', v: '3.17x', cls: 'bad' }] }
      ],
      fix: [
        { log: 'ANALYZE refreshes the statistics: products has 50,000 rows.', code: 0, hl: { nodes: { st: 'ok' }, edges: { e1: 'ok' } }, stats: [{ l: 'products estimated', v: '50,000', cls: 'ok' }] },
        { log: 'The estimates now match reality: C ⋈ O gives 20,000 rows, then 80,000 with items, then 1,600 with products.', code: 1, hl: { nodes: { card: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'estimated = actual', v: 'yes', cls: 'ok' }] },
        { log: 'The search picks ((C ⋈ O) ⋈ I) ⋈ P, which filters customers first.', code: 2, hl: { nodes: { dp: 'ok', cost: 'ok', plan: 'ok' }, edges: { e3: 'ok', e4: 'ok' } }, stats: [{ l: 'estimated cost', v: '101,600', cls: 'ok' }] },
        { log: 'The executor runs it at an actual cost of 101,600, the best plan for this data.', code: 2, hl: { nodes: { ex: 'ok' }, edges: { e5: 'ok' } }, stats: [{ l: 'actual cost', v: '101,600', cls: 'ok' }, { l: 'actual / best', v: '1.00x', cls: 'ok' }] }
      ]
    },
    {
      id: 'corr',
      label: 'Correlated filters',
      desc: 'Two customer predicates, each 10% selective, overlap completely, but the estimator multiplies them (same illustrative four-table model).',
      codeLabel: 'Query',
      code: {
        bug: [
          "WHERE c.region = 'HN'        -- 10% of customers",
          "  AND c.segment = 'gold'     -- 10% of customers",
          '-- estimator: 10% x 10% = 1% = 1,000 rows',
          '-- real: every gold customer is in HN, 10% = 10,000 rows'
        ],
        fix: [
          'CREATE STATISTICS cust_region_segment (dependencies)',
          '  ON region, segment FROM customers;',
          'ANALYZE customers;',
          '-- estimator now sees the overlap: 10,000 rows'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'tab', x: 10, y: 30, w: 150, h: 60, t: 'customers', s: '100,000 rows' },
          { id: 'p1', x: 245, y: 30, w: 150, h: 60, t: "region = 'HN'", s: '10% selective' },
          { id: 'p2', x: 480, y: 30, w: 150, h: 60, t: "segment = 'gold'", s: '10% selective' },
          { id: 'sel', x: 480, y: 200, w: 150, h: 60, t: 'Selectivity', s: 'product of the two' },
          { id: 'ord', x: 245, y: 200, w: 150, h: 60, t: 'Join order', s: 'starts from smallest' },
          { id: 'ex', x: 10, y: 200, w: 150, h: 60, t: 'Executor', s: 'actual rows' }
        ],
        edges: [
          { id: 'e1', a: 'tab', b: 'p1', label: 'filter' },
          { id: 'e2', a: 'p1', b: 'p2', label: 'AND' },
          { id: 'e3', a: 'p2', b: 'sel', label: 'combine' },
          { id: 'e4', a: 'sel', b: 'ord', label: 'estimate' },
          { id: 'e5', a: 'ord', b: 'ex', label: 'run' }
        ]
      },
      bug: [
        { log: 'Each predicate alone keeps 10% of 100,000 customers.', code: 0, hl: { nodes: { tab: 'on', p1: 'ok', p2: 'ok' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'each predicate', v: '10%', cls: 'ok' }] },
        { log: 'The estimator assumes independence and multiplies: 10% x 10% = 1%, so it expects 1,000 customers.', code: 2, hl: { nodes: { sel: 'bad' }, edges: { e3: 'on' } }, stats: [{ l: 'estimated rows', v: '1,000', cls: 'bad' }] },
        { log: 'In reality every gold customer is in HN, so 10,000 customers match, ten times the estimate.', code: 3, hl: { nodes: { sel: 'bad', tab: 'warn' } }, stats: [{ l: 'actual rows', v: '10,000', cls: 'warn' }] },
        { log: 'Believing customers is tiny, the search picks ((C ⋈ O) ⋈ I) ⋈ P. Its joins really produce 200,000, 800,000 and 16,000 rows.', code: 2, hl: { nodes: { ord: 'warn', ex: 'bad' }, edges: { e4: 'on', e5: 'bad' } }, stats: [{ l: 'estimated cost', v: '101,600', cls: 'ok' }, { l: 'actual cost', v: '1,016,000', cls: 'bad' }] },
        { log: 'The best plan for the real data, C ⋈ (O ⋈ (I ⋈ P)), costs 336,000. The picked plan does 3.02 times the work.', code: 3, hl: { nodes: { ord: 'bad' } }, stats: [{ l: 'best plan cost', v: '336,000', cls: 'ok' }, { l: 'actual / best', v: '3.02x', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Extended statistics record that the two columns depend on each other.', code: 0, hl: { nodes: { sel: 'new' }, edges: { e3: 'ok' } }, stats: [{ l: 'column-group stats', v: 'on', cls: 'ok' }] },
        { log: 'After ANALYZE the estimate for the combined filter is 10%, which is 10,000 customers.', code: 2, hl: { nodes: { sel: 'ok', p1: 'ok', p2: 'ok' } }, stats: [{ l: 'estimated rows', v: '10,000', cls: 'ok' }, { l: 'actual rows', v: '10,000', cls: 'ok' }] },
        { log: 'With the right number the search picks C ⋈ (O ⋈ (I ⋈ P)), and it runs at 336,000, the best plan.', code: 3, hl: { nodes: { ord: 'ok', ex: 'ok' }, edges: { e4: 'ok', e5: 'ok' } }, stats: [{ l: 'actual cost', v: '336,000', cls: 'ok' }, { l: 'actual / best', v: '1.00x', cls: 'ok' }] }
      ]
    },
    {
      id: 'generic',
      label: 'Cached plan',
      desc: 'A prepared statement reuses a plan built for a rare region when it runs for HN, which matches 10,000 customers (illustrative page counts).',
      codeLabel: 'Query',
      code: {
        bug: [
          'PREPARE q(text) AS',
          '  SELECT ... FROM customers c JOIN orders o ON o.customer_id = c.id',
          '  WHERE c.region = $1;',
          "EXECUTE q('rare');   -- plan built: index nested loop",
          "EXECUTE q('HN');     -- same plan reused, 10,000 probes"
        ],
        fix: [
          'SET plan_cache_mode = force_custom_plan;',
          "EXECUTE q('HN');     -- re-planned: hash join, one scan",
          "EXECUTE q('rare');   -- re-planned: index loop kept"
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'stmt', x: 10, y: 30, w: 150, h: 60, t: 'Prepared stmt', s: 'region = $1' },
          { id: 'cache', x: 245, y: 30, w: 150, h: 60, t: 'Plan cache', s: 'one plan reused' },
          { id: 'loop', x: 480, y: 30, w: 150, h: 60, t: 'Index loop', s: '4 pages per probe' },
          { id: 'hash', x: 480, y: 200, w: 150, h: 60, t: 'Hash join', s: 'one scan of orders' },
          { id: 'orders', x: 245, y: 200, w: 150, h: 60, t: 'orders', s: '3,000 pages' }
        ],
        edges: [
          { id: 'e1', a: 'stmt', b: 'cache', label: 'execute' },
          { id: 'e2', a: 'cache', b: 'loop', label: 'cached' },
          { id: 'e3', a: 'loop', b: 'hash', label: 'alternative' },
          { id: 'e4', a: 'hash', b: 'orders', label: 'scan' }
        ]
      },
      bug: [
        { log: 'The first call uses a rare region. An index loop is cheap for it, at about 200 page reads.', code: 3, hl: { nodes: { stmt: 'on', cache: 'on', loop: 'ok' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'page reads (rare)', v: '200', cls: 'ok' }] },
        { log: 'The next call uses HN, which matches 10,000 customers. The cached index loop is reused.', code: 4, hl: { nodes: { cache: 'warn', loop: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'matching rows', v: '10,000', cls: 'warn' }] },
        { log: 'The loop probes the index once per row, 4 page reads per probe.', code: 4, hl: { nodes: { loop: 'bad' } }, stats: [{ l: 'probes', v: '10,000', cls: 'bad' }] },
        { log: 'In total HN reads 40,000 pages, about 13 times a full scan of orders.', code: 4, hl: { nodes: { loop: 'bad', hash: 'dim' } }, stats: [{ l: 'page reads (HN)', v: '40,000', cls: 'bad' }, { l: 'full scan', v: '3,000', cls: 'ok' }] }
      ],
      fix: [
        { log: 'With custom plans, the planner builds a plan for each parameter value.', code: 0, hl: { nodes: { cache: 'new' }, edges: { e1: 'ok' } }, stats: [{ l: 'plan per value', v: 'yes', cls: 'ok' }] },
        { log: 'For HN it picks a hash join that scans orders once: 3,000 pages.', code: 1, hl: { nodes: { hash: 'ok', orders: 'ok' }, edges: { e3: 'ok', e4: 'ok' } }, stats: [{ l: 'page reads (HN)', v: '3,000', cls: 'ok' }] },
        { log: 'For the rare value it keeps the index loop, at about 200 page reads.', code: 2, hl: { nodes: { loop: 'ok' }, edges: { e2: 'ok' } }, stats: [{ l: 'page reads (rare)', v: '200', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Vectorized, Compiled, and Parallel Execution',
  problem: `An analytics team keeps a large fact table fully in memory on a 16-core server, and a simple filter-and-sum dashboard query still runs at about 5 million rows per second (illustrative). Disk reads are zero. Adding cores barely helps, and a CPU profile shows most time in function calls, branch mispredictions and scheduler overhead rather than in the comparison itself.`,
  predict: {
    q: `The engine passes one row per operator call. What change should it make first?`,
    opts: [
      `Buy faster disks`,
      `Add more cores and more worker threads`,
      `Pass batches of about 1,000 rows per call and process each batch in a tight loop`,
      `Pass batches as large as possible, such as one million rows per call`
    ],
    ans: 2,
    why: `Each call has a fixed cost, and a batch spreads it over its rows. About 1,000 rows keeps the vectors in cache; much larger batches overflow it and the cost per row rises again.`
  },
  explain: `<h3>The idea</h3>
<p>Once data is in memory, the disk no longer sets the pace. The CPU does, and the Volcano iterator from chapter 5 pays a function call per operator per row. The fix is to process <b>batches</b> in tight loops, and to spread small units of work across cores. To go 10 times faster, the engine must execute 90 percent fewer instructions.</p>
<h3>How it works, step by step</h3>
<p><b>Vectorized execution</b> passes a batch of values between operators, so the call cost is shared by every row in it. Inside the loop, <b>SIMD</b> instructions work on several values at once, one lane per row.</p>
<p>A <b>selection vector</b> lists the row positions that passed a predicate. Vectorized code computes a bitmask for the whole vector and compresses the survivors, so it avoids a branch per row. A branch that mispredicts stalls the pipeline.</p>
<p><b>Compilation</b> generates code for one query. Types are known, predicates become plain comparisons, and the loop makes no function calls. HyPer fuses each pipeline so a tuple stays in registers. PostgreSQL (v11, 2018) uses LLVM JIT for expressions and tuple decoding, and its optimizer cost estimates decide when to compile.</p>
<p><b>Morsel-driven scheduling</b> cuts the input into morsels of about 100,000 tuples (HyPer). One worker per core pulls morsels, takes ones on its own socket first, and steals from another socket only when idle. On a <b>NUMA</b> machine each socket has its own memory, so reading from the far socket is slower.</p>
<h3>The trade-off</h3>
<p>Batches that are too small leave the call cost on every row. Batches that overflow the L1 or L2 cache cost more per row again. Compiled code wins on calculation-heavy work but keeps branches, so it can lose at 50 percent selectivity; vectorized code hides cache misses better. Compilation is a fixed cost before the first row, so short queries should not pay it. More workers than cores, or one shared queue, adds lock waits and far-socket reads instead of speed.</p>`,
  diagnose: [
    {
      t: 'Batches too small',
      sym: 'The overhead per row is about 600 cycles at batch size 1, far more than the work itself.',
      ctx: 'A vectorized engine is slower than expected, and the profile shows most time in operator calls.',
      why: 'Each operator call has a fixed cost: the call, the loop setup and the type checks. A batch spreads that cost over its rows. With one row per batch, the fixed cost is the whole cost.',
      log: `representative, illustrative
4,096 rows, batch size 1: 12,288 operator calls
overhead: 600 cycles per row`,
      note: 'Operator calls equal to rows times operators means the batch size is 1.',
      fix: [
        'Measure: count operator calls and cycles per row in the engine profile.',
        'Use batches of about 1,000 rows, which keep the working vectors in L1 or L2 cache, and make the batch size a setting you test on your own hardware.',
        'Do not go to very large batches. When the vectors overflow the cache, the cost per row rises again.',
        'Verify: operator calls per row and cycles per row in the profile drop after the change.'
      ]
    },
    {
      t: 'Divergent predicates',
      sym: 'Lanes that already failed a predicate still run the next one.',
      ctx: 'A query with several predicates, where the first removes most rows, gains little from SIMD.',
      why: 'A SIMD instruction runs on every lane, even when a lane holds a row that an earlier predicate removed. When most rows fail early, most lanes do wasted work.',
      log: `representative, illustrative
predicate 2 over 4 vectors: 32 lane operations, 8 useful
lane utilization: 25 percent`,
      fix: [
        'Measure: lane utilization in the profile, useful lanes over lane operations.',
        'Keep a selection vector, and compress the survivors into full vectors before the next predicate.',
        'Refill partly empty vectors from the next batch (buffered or partial refill), and run the most selective predicate first, so that fewer lanes reach the others.',
        'Verify: lane utilization in the profile should rise toward 100 percent.'
      ]
    },
    {
      t: 'Too many workers',
      sym: 'Workers queue for one lock, and many morsels are read from the far socket.',
      ctx: 'Adding worker threads makes a parallel scan no faster, or slower, on a two-socket server.',
      why: 'Every worker needs the queue. With one global queue, only one request is granted per tick, so extra workers mostly wait. The queue also ignores where data lives, so reads cross the socket interconnect.',
      log: `representative, from the scheduler simulation (illustrative cost model)
global queue, 16 workers: 34 ticks, 443 lock waits, 7 remote morsels`,
      fix: [
        'Measure: count lock waits and remote morsels before the change.',
        'Set the worker count to the core count, and pin each worker to a core.',
        'Use one queue per socket. A worker steals from another socket only when its own queue is empty. Place each partition on the socket that reads it (first touch).',
        'Verify: count lock waits and remote morsels after the change and compare.'
      ]
    },
    {
      t: 'JIT costs more than it saves',
      sym: 'A 10,000-row query spends about 40 ms compiling and about 0.04 ms running.',
      ctx: 'Short queries got slower after query compilation was turned on.',
      why: 'Compilation is a fixed cost paid before the first row. For a short query it is larger than the run itself. It pays off only when the time saved over all rows is larger than the compile time.',
      log: `representative, illustrative
compile: 40 ms (fixed)
run, 10,000 rows vectorized: 0.04 ms`,
      note: 'When compile time is many times the run time, the query is too short to compile.',
      fix: [
        'Measure: compare total time, including compile time, for a short query and a long one.',
        'Interpret or vectorize short queries. Compile only when the estimated run time is larger than the compile time.',
        'Use adaptive execution: start with the interpreter, compile in the background, and switch per morsel when the code is ready (HyPer). Cache compiled code for queries that run often.',
        'Verify: short queries return to their run time without the compile cost, and long queries keep the compiled speed-up.'
      ]
    }
  ],
  source: { label: 'Original: Vectorized, Compiled, and Parallel Execution', href: '01-database-systems-end-to-end.html#ch9' },
  scenarios: [
    {
      id: 'batch',
      label: 'Batch size',
      desc: 'A three-operator filter pipeline at 5% selectivity on a 3 GHz core, run with batches of 1 and then 1,024 rows (illustrative cycle costs).',
      codeLabel: 'Config',
      code: {
        bug: [
          '# vectorized pipeline: scan -> filter -> aggregate',
          '# rows per operator call: 1',
          '# fixed cost per call: about 200 cycles (illustrative)',
          '# 3 operators x 200 cycles / 1 row = 600 cycles per row'
        ],
        fix: [
          '# rows per operator call: 1,024',
          '# 3 operators x 200 cycles / 1,024 rows = 0.6 cycles per row',
          '# the batch still fits in L1 cache',
          '# 16 cores, each worker reads its own socket'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'scan', x: 10, y: 30, w: 150, h: 60, t: 'Scan', s: 'batch of B rows' },
          { id: 'filt', x: 245, y: 30, w: 150, h: 60, t: 'Filter', s: 'selection vector' },
          { id: 'agg', x: 480, y: 30, w: 150, h: 60, t: 'Aggregate', s: 'sum per batch' },
          { id: 'ovh', x: 245, y: 200, w: 150, h: 60, t: 'Call overhead', s: '200 cycles per call' },
          { id: 'core', x: 480, y: 200, w: 150, h: 60, t: 'CPU cores', s: '3 GHz each' }
        ],
        edges: [
          { id: 'e1', a: 'scan', b: 'filt', label: 'batch' },
          { id: 'e2', a: 'filt', b: 'agg', label: 'batch' },
          { id: 'e3', a: 'filt', b: 'ovh', label: 'per call' },
          { id: 'e4', a: 'agg', b: 'core', label: 'cycles' }
        ]
      },
      bug: [
        { log: 'The scan hands the filter a batch of 1 row. Each operator call has a fixed cost of about 200 cycles (illustrative).', code: 1, hl: { nodes: { scan: 'on', filt: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'rows per call', v: '1', cls: 'bad' }] },
        { log: 'Three operators each pay that cost for every row: 600 cycles of overhead per row. For 4,096 rows that is 12,288 operator calls.', code: 3, hl: { nodes: { ovh: 'bad' }, edges: { e3: 'bad', e2: 'on' } }, stats: [{ l: 'overhead per row', v: '600 cycles', cls: 'bad' }, { l: 'operator calls', v: '12,288', cls: 'bad' }] },
        { log: 'The actual comparison and memory read cost about 10 cycles per row, so the overhead is almost all of the 610 cycles.', code: 2, hl: { nodes: { agg: 'warn', core: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'cycles per row', v: '610.1', cls: 'bad' }] },
        { log: 'At 3 GHz that is about 5 million rows per second, slower even than the scalar Volcano engine at 77 million.', code: 0, hl: { nodes: { core: 'bad' } }, stats: [{ l: 'M rows/s', v: '5', cls: 'bad' }, { l: 'scalar', v: '77', cls: 'warn' }] }
      ],
      fix: [
        { log: 'Each call now carries 1,024 rows, so the call cost is shared: about 0.6 cycles of overhead per row.', code: 1, hl: { nodes: { filt: 'ok', ovh: 'ok' }, edges: { e1: 'ok', e3: 'ok' } }, stats: [{ l: 'overhead per row', v: '0.6 cycles', cls: 'ok' }] },
        { log: 'The batch fits in L1 cache, and the filter runs branch-free over a selection vector: 10.7 cycles per row in total.', code: 2, hl: { nodes: { agg: 'ok', core: 'ok' }, edges: { e2: 'ok', e4: 'ok' } }, stats: [{ l: 'cycles per row', v: '10.7', cls: 'ok' }] },
        { log: 'One core now filters about 281 million rows per second, 3.7 times the scalar engine.', code: 1, hl: { nodes: { core: 'ok' } }, stats: [{ l: 'M rows/s, 1 core', v: '281', cls: 'ok' }] },
        { log: 'On 16 cores reading local memory, at 69% parallel efficiency, the pipeline reaches about 3,105 million rows per second.', code: 3, hl: { nodes: { core: 'new' }, edges: { e4: 'ok' } }, stats: [{ l: 'M rows/s, 16 cores', v: '3,105', cls: 'ok' }, { l: 'efficiency', v: '69%', cls: 'warn' }] }
      ]
    },
    {
      id: 'lanes',
      label: 'Divergent lanes',
      desc: 'Thirty-two rows in vectors of 8 SIMD lanes, where predicate 1 keeps one row in four (illustrative).',
      codeLabel: 'Query',
      code: {
        bug: [
          'WHERE p1 AND p2       -- p1 keeps 25% (illustrative)',
          '-- predicate 1 runs over 4 vectors of 8 lanes',
          '-- rows that failed stay in their lanes',
          '-- predicate 2 runs on all 32 lanes'
        ],
        fix: [
          'WHERE p1 AND p2',
          '-- predicate 1 writes a selection vector',
          '-- compress the 8 survivors into 1 full vector',
          '-- predicate 2 runs on 8 lanes, all useful'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'vec', x: 10, y: 30, w: 150, h: 60, t: 'Vectors', s: '4 x 8 lanes' },
          { id: 'p1', x: 245, y: 30, w: 150, h: 60, t: 'Predicate 1', s: 'keeps 8 of 32' },
          { id: 'sv', x: 480, y: 30, w: 150, h: 60, t: 'Selection vector', s: 'survivor positions' },
          { id: 'p2', x: 245, y: 200, w: 150, h: 60, t: 'Predicate 2', s: 'SIMD over lanes' },
          { id: 'out', x: 10, y: 200, w: 150, h: 60, t: 'Output', s: 'rows that pass' }
        ],
        edges: [
          { id: 'e1', a: 'vec', b: 'p1', label: 'all lanes' },
          { id: 'e2', a: 'p1', b: 'sv', label: 'bitmask' },
          { id: 'e3', a: 'sv', b: 'p2', label: 'packed' },
          { id: 'e4', a: 'p1', b: 'p2', label: 'unpacked' },
          { id: 'e5', a: 'p2', b: 'out', label: 'pass' }
        ]
      },
      bug: [
        { log: 'Thirty-two rows sit in 4 vectors of 8 lanes. Predicate 1 runs on all of them and keeps 8 rows.', code: 1, hl: { nodes: { vec: 'on', p1: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'survivors', v: '8 of 32', cls: 'ok' }] },
        { log: 'The 24 rows that failed stay in their lanes. The vectors are not repacked.', code: 2, hl: { nodes: { p1: 'warn', sv: 'dim' }, edges: { e4: 'on' } }, stats: [{ l: 'dead lanes', v: '24', cls: 'warn' }] },
        { log: 'Predicate 2 runs on all 32 lanes, because a SIMD instruction works on every lane.', code: 3, hl: { nodes: { p2: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'lane operations', v: '32', cls: 'bad' }] },
        { log: 'Only 8 of those lanes hold a row that is still needed. Lane utilization is 25 percent.', code: 3, hl: { nodes: { p2: 'bad', out: 'warn' }, edges: { e5: 'on' } }, stats: [{ l: 'useful lanes', v: '8', cls: 'warn' }, { l: 'utilization', v: '25%', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Predicate 1 writes a bitmask, and the 8 surviving positions go into a selection vector.', code: 1, hl: { nodes: { p1: 'ok', sv: 'new' }, edges: { e2: 'ok' } }, stats: [{ l: 'survivors', v: '8 of 32', cls: 'ok' }] },
        { log: 'Compress packs the 8 survivors into one full vector.', code: 2, hl: { nodes: { sv: 'ok' }, edges: { e3: 'ok', e4: 'dim' } }, stats: [{ l: 'vectors for predicate 2', v: '1', cls: 'ok' }] },
        { log: 'Predicate 2 runs on 8 lanes, and every lane holds a needed row: 100 percent utilization.', code: 3, hl: { nodes: { p2: 'ok', out: 'ok' }, edges: { e5: 'ok' } }, stats: [{ l: 'lane operations', v: '8', cls: 'ok' }, { l: 'utilization', v: '100%', cls: 'ok' }] }
      ]
    },
    {
      id: 'morsels',
      label: 'Morsel scheduling',
      desc: 'Thirty-two morsels split across two sockets, scheduled by one global queue with 16 workers, then by per-socket queues with 8 (illustrative: 2 ticks local, 3 ticks remote).',
      codeLabel: 'Config',
      code: {
        bug: [
          '# workers: 16 (8 per socket)',
          '# queue: one global queue, arrival order',
          '# one queue pop granted per tick',
          '# queue ignores where each morsel lives'
        ],
        fix: [
          '# workers: 8 = cores, 4 per socket, pinned',
          '# queue: one queue per socket',
          '# take local morsels first',
          '# steal from the other socket only when empty'
        ]
      },
      diagram: {
        w: 640, h: 290,
        nodes: [
          { id: 'm0', x: 10, y: 30, w: 150, h: 60, t: 'Memory socket 0', s: '16 morsels' },
          { id: 'gq', x: 245, y: 30, w: 150, h: 60, t: 'Global queue', s: 'one lock' },
          { id: 'm1', x: 480, y: 30, w: 150, h: 60, t: 'Memory socket 1', s: '16 morsels' },
          { id: 'w0', x: 10, y: 200, w: 150, h: 60, t: 'Workers socket 0', s: 'one per core' },
          { id: 'sq', x: 240, y: 200, w: 160, h: 60, t: 'Socket queues', s: 'steal only when empty' },
          { id: 'w1', x: 480, y: 200, w: 150, h: 60, t: 'Workers socket 1', s: 'one per core' }
        ],
        edges: [
          { id: 'g0', a: 'gq', b: 'w0', label: 'pull' },
          { id: 'g1', a: 'gq', b: 'w1', label: 'pull' },
          { id: 'far', a: 'm0', b: 'w1', label: 'far read' },
          { id: 's0', a: 'sq', b: 'w0', label: 'local' },
          { id: 's1', a: 'sq', b: 'w1', label: 'local' }
        ]
      },
      bug: [
        { log: 'Thirty-two morsels are queued, half on each socket. Sixteen workers, eight per socket, pull from one global queue.', code: 1, hl: { nodes: { gq: 'on', w0: 'on', w1: 'on', sq: 'dim' } }, stats: [{ l: 'workers', v: '16', cls: 'warn' }, { l: 'queues', v: '1', cls: 'warn' }] },
        { log: 'Only one pop is granted per tick, so the other workers wait for the queue lock.', code: 2, hl: { nodes: { gq: 'bad' }, edges: { g0: 'on', g1: 'on' } }, stats: [{ l: 'lock waits', v: 'climbing', cls: 'bad' }] },
        { log: 'The queue hands out morsels in arrival order, so some workers read a morsel from the far socket at 3 ticks instead of 2.', code: 3, hl: { nodes: { m0: 'warn', w1: 'warn' }, edges: { far: 'bad' } }, stats: [{ l: 'remote morsels', v: '7', cls: 'bad' }] },
        { log: 'The scan finishes after 34 ticks, with 443 lock waits and 7 far-socket reads.', code: 0, hl: { nodes: { gq: 'bad' } }, stats: [{ l: 'ticks', v: '34', cls: 'bad' }, { l: 'lock waits', v: '443', cls: 'bad' }, { l: 'remote', v: '7', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Eight workers, one per core, four per socket, each pinned to its core. Each socket has its own queue.', code: 0, hl: { nodes: { gq: 'dim', sq: 'new', w0: 'ok', w1: 'ok' }, edges: { s0: 'ok', s1: 'ok' } }, stats: [{ l: 'workers', v: '8', cls: 'ok' }, { l: 'queues', v: '2', cls: 'ok' }] },
        { log: 'Each worker takes morsels from its own socket first, so reads stay in local memory.', code: 2, hl: { nodes: { m0: 'ok', m1: 'ok' }, edges: { far: 'dim' } }, stats: [{ l: 'remote morsels', v: '0', cls: 'ok' }] },
        { log: 'The scan finishes after 17 ticks with 66 lock waits, half the time with half the workers.', code: 3, hl: { nodes: { sq: 'ok' } }, stats: [{ l: 'ticks', v: '17', cls: 'ok' }, { l: 'lock waits', v: '66', cls: 'ok' }, { l: 'remote', v: '0', cls: 'ok' }] }
      ]
    }
  ]
}
,
{
  title: 'Transactions and Isolation',
  problem: `A hospital rota service lets a doctor go off call only if another doctor is still on call. Alice and Bob are the two doctors on call, and they both tap "go off call" within the same second. Each request checks the other doctor, sees them on call, and succeeds. The night shift ends with nobody on call, and the database logged no error (illustrative).`,
  predict: {
    q: `Both requests run at Snapshot Isolation. Both read before either commits, and each one updates only its own row. What happens?`,
    opts: [
      `Both commit, and nobody is on call`,
      `The second commit is aborted, because first-writer-wins sees a conflict`,
      `The second request blocks until the first commits, then sees the change`,
      `The database rejects the second update with a constraint error`
    ],
    ans: 0,
    why: `Each transaction reads its own snapshot, and they write different rows, so the first-writer-wins rule never fires. This anomaly is called write skew, and Snapshot Isolation allows it.`
  },
  explain: `<h3>The idea</h3>
<p>A <b>transaction</b> groups reads and writes into one unit that succeeds or fails as a whole. It starts with BEGIN and ends with COMMIT or ABORT. When transactions run at the same time, their operations interleave. An <b>isolation level</b> defines which intermediate states one transaction may observe from another. A request can be correct when it runs alone and still break a business rule when it interleaves with another.</p>
<h3>How it works, step by step</h3>
<p>A <b>schedule</b> is the order in which the operations of several transactions run. A serial schedule runs one transaction at a time. A <b>serializable</b> schedule gives the same result as some serial schedule.</p>
<p>Two operations <b>conflict</b> when they touch the same object, come from different transactions, and at least one writes. Read-write conflicts cause unrepeatable reads, write-read conflicts cause dirty reads, and write-write conflicts cause lost updates.</p>
<p>To check a schedule, draw a <b>precedence graph</b>: one node per transaction, and an edge Ti to Tj when an operation of Ti conflicts with a later one of Tj. No cycle means the schedule is conflict serializable.</p>
<p>The levels, from weak to strong: Read Uncommitted allows every anomaly. Read Committed blocks dirty reads but allows unrepeatable reads, phantoms and lost updates. Repeatable Read, in its locking definition, blocks unrepeatable reads but allows phantoms. <b>Snapshot Isolation</b> reads from one snapshot and aborts the second writer of a row (first writer wins), but it still allows <b>write skew</b>: two transactions read overlapping data and write different rows. Serializable allows none of these. In PostgreSQL, REPEATABLE READ is snapshot isolation.</p>
<h3>The trade-off</h3>
<p>Weaker levels allow more concurrency, and you pay for it in anomalies. Serializable is correct, but it aborts some transactions, so the application must retry them. Choose the weakest level that still keeps your invariants, and write those invariants down first. Some rules are better enforced directly, with a unique index or a constraint. How each level is enforced is chapter 12.</p>`,
  diagnose: [
    {
      t: 'Concurrent updates overwrite each other',
      sym: 'The balance is 150, but two +50 updates should give 200.',
      ctx: 'Two requests add to the same account at the same moment. Both succeed, and no error is logged.',
      why: 'Each transaction reads the balance, adds 50 in the application, and writes the result. Under Read Committed, the second write uses an old value and silently overwrites the first.',
      log: `representative, illustrative
start balance: 100, two transactions add 50 each
final balance: 150 (expected 200)`,
      fix: [
        'Measure first: run the two transactions together in a test and compare the final balance with the expected 200.',
        'Fix: let the database do the update: UPDATE accounts SET balance = balance + 50 WHERE id = 1. The row lock makes it atomic.',
        'Fix: or use Snapshot Isolation, where the second committer aborts, and retry the transaction.',
        'Fix: or lock the row first with SELECT ... FOR UPDATE, then update it.',
        'Verify: run the two transactions together, and check that the final balance is 200.'
      ]
    },
    {
      t: 'Snapshot Isolation permits write skew',
      sym: 'Both doctors go off call, and nobody is on call.',
      ctx: 'Two requests that each check the other doctor commit at the same time. Each request is correct on its own.',
      why: 'Under Snapshot Isolation, each transaction reads a consistent snapshot. The two transactions write different rows, so the first-writer-wins rule never fires. Neither transaction sees the other’s write.',
      log: `representative, from the interleaving in the playground
level: Snapshot Isolation, schedule: both read before either commits
Doctors on call at the end: 0`,
      fix: [
        'Measure first: write the rule down as an invariant (at least one doctor on call) and replay the interleaving where both read before either commits.',
        'Fix: use Serializable. It checks what each transaction read, aborts one of them, and the application retries it.',
        'Fix: or turn the rule into a write conflict: both transactions update one shared row, such as an on-call counter.',
        'Fix: or enforce the rule in the database, with a constraint or a trigger.',
        'Verify: run the same interleaving, and check the invariant after both commits.'
      ]
    },
    {
      t: 'Check-then-insert double-books a resource',
      sym: 'Two bookings exist for room 101 at 10:00.',
      ctx: 'Two booking requests for the same room and time arrive together. Both pass the availability check.',
      why: 'The check and the insert are two steps. Both transactions run the check before either one inserts, so both see the room as free. Isolation levels do not help here, because there is no existing row to conflict on.',
      log: `representative, illustrative
SELECT count(*) FROM bookings WHERE room = 101 AND slot = '10:00'  -> 0 (in both transactions)
bookings after both commits: 2`,
      fix: [
        'Measure first: count bookings per room and slot, and list any slot with more than one booking.',
        'Fix: add a unique index on (room, slot). The second insert fails, whatever the isolation level.',
        'Fix: handle the duplicate-key error in the application, and show the room as taken.',
        'Fix: or use Serializable with range or predicate protection, which a plain row check cannot give you.',
        'Verify: run two inserts for the same room and time, and count the bookings.'
      ]
    },
    {
      t: 'Phantom rows invalidate a repeated range query',
      sym: 'The same Monday count changes from 2 to 3 inside one transaction.',
      ctx: 'A transaction counts rows in a range twice, and another session inserts a matching row in between.',
      why: 'A range query returns rows that match a condition. Another transaction can insert a new matching row between two reads. Under Read Committed each read sees the latest data, so the new row appears in the second read.',
      log: `representative, illustrative
T1: SELECT count(*) FROM shifts WHERE day = 'Mon'
first read: 2, second read after T2 commits: 3`,
      fix: [
        'Measure first: run the range count twice inside one transaction while another session inserts a matching row.',
        'Fix: run the transaction at Snapshot Isolation, so both reads come from one snapshot. In PostgreSQL, REPEATABLE READ is snapshot isolation, and it prevents phantom reads.',
        'Fix: use Serializable when the rule depends on a range, and let the database detect the conflict.',
        'Fix: keep the transaction short, so there is less time for other commits.',
        'Verify: count the rows in two reads inside one transaction, while another session inserts.'
      ]
    }
  ],
  source: { label: 'Original: Transactions and Isolation', href: '01-database-systems-end-to-end.html#ch10' },
  scenarios: [
    {
      id: 'skew',
      label: 'Write skew',
      desc: 'Two on-call transactions interleave under Snapshot Isolation, then under Serializable.',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- T1 (Alice) and T2 (Bob) run at the same time',
          'BEGIN ISOLATION LEVEL REPEATABLE READ;  -- snapshot isolation',
          `SELECT on_call FROM doctors WHERE name = 'bob';  -- on`,
          `UPDATE doctors SET on_call = false WHERE name = 'alice';`,
          'COMMIT;  -- T2 does the same for bob, and also commits'
        ],
        fix: [
          '-- the same two transactions',
          'BEGIN ISOLATION LEVEL SERIALIZABLE;',
          `SELECT on_call FROM doctors WHERE name = 'bob';`,
          `UPDATE doctors SET on_call = false WHERE name = 'alice';`,
          'COMMIT;  -- one of T1, T2 is aborted',
          '-- the application retries the aborted transaction'
        ]
      },
      diagram: {
        w: 640, h: 250,
        nodes: [
          { id: 't1', x: 10, y: 25, w: 170, h: 60, t: 'Alice tx (T1)', s: 'checks Bob on call' },
          { id: 't2', x: 10, y: 165, w: 170, h: 60, t: 'Bob tx (T2)', s: 'checks Alice on call' },
          { id: 'snap', x: 235, y: 25, w: 170, h: 60, t: 'Snapshot', s: 'data as of BEGIN' },
          { id: 'cc', x: 460, y: 25, w: 170, h: 60, t: 'Commit check', s: 'SI or Serializable' },
          { id: 'rows', x: 460, y: 165, w: 170, h: 60, t: 'On-call rows', s: 'alice, bob' }
        ],
        edges: [
          { id: 'e1', a: 't1', b: 'snap', label: 'read bob' },
          { id: 'e2', a: 't2', b: 'snap', label: 'read alice' },
          { id: 'e3', a: 'snap', b: 'cc', label: 'commit' },
          { id: 'e4', a: 'cc', b: 'rows', label: 'apply' }
        ]
      },
      bug: [
        { log: 'Both transactions begin. Each snapshot shows Alice and Bob on call.', code: 1, hl: { nodes: { t1: 'on', t2: 'on', snap: 'on' } }, stats: [{ l: 'doctors on call', v: '2', cls: 'ok' }] },
        { log: 'T1 reads Bob: on. T2 reads Alice: on. Both read before either one writes.', code: 2, hl: { nodes: { snap: 'on' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'reads', v: '2, both see "on"', cls: 'warn' }] },
        { log: 'T1 sets Alice off. T2 sets Bob off. They write different rows, so first-writer-wins has nothing to catch.', code: 3, hl: { nodes: { t1: 'warn', t2: 'warn', cc: 'warn' }, edges: { e3: 'on' } }, stats: [{ l: 'write-write conflicts', v: '0', cls: 'warn' }] },
        { log: 'Both commit. Alice is off and Bob is off. The rule "at least one on call" is broken.', code: 4, hl: { nodes: { rows: 'bad' }, edges: { e4: 'bad' } }, stats: [{ l: 'doctors on call', v: '0', cls: 'bad' }, { l: 'invariant', v: 'broken', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The same interleaving at Serializable: T1 reads Bob on call, T2 reads Alice on call.', code: 2, hl: { nodes: { t1: 'on', t2: 'on', snap: 'on' }, edges: { e1: 'on', e2: 'on' } }, stats: [{ l: 'doctors on call', v: '2', cls: 'ok' }] },
        { log: 'T1 commits first, and Alice is now off.', code: 4, hl: { nodes: { t1: 'ok', cc: 'ok' }, edges: { e3: 'ok' } }, stats: [{ l: 'doctors on call', v: '1', cls: 'ok' }] },
        { log: 'T2 tries to commit. A value it read, Alice, was changed by T1 after T2 started, so T2 is aborted.', code: 4, hl: { nodes: { t2: 'bad', cc: 'ok' } }, stats: [{ l: 'aborted', v: 'T2', cls: 'warn' }] },
        { log: 'The application retries T2. It now reads Alice off, so it makes no change.', code: 5, hl: { nodes: { rows: 'ok' }, edges: { e4: 'ok' } }, stats: [{ l: 'doctors on call', v: '1', cls: 'ok' }, { l: 'invariant', v: 'holds', cls: 'ok' }] }
      ]
    },
    {
      id: 'lost',
      label: 'Lost update',
      desc: 'Two transactions each add 50 to one balance by reading it, adding in the app and writing it back.',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- two transactions each add 50, at Read Committed',
          'SELECT balance FROM accounts WHERE id = 1;  -- 100',
          '-- the application computes 100 + 50 = 150',
          'UPDATE accounts SET balance = 150 WHERE id = 1;',
          'COMMIT;'
        ],
        fix: [
          'BEGIN;',
          'UPDATE accounts SET balance = balance + 50 WHERE id = 1;',
          'COMMIT;  -- the row lock makes the add atomic'
        ]
      },
      diagram: {
        w: 640, h: 250,
        nodes: [
          { id: 't1', x: 10, y: 25, w: 160, h: 60, t: 'T1', s: 'adds 50' },
          { id: 't2', x: 10, y: 165, w: 160, h: 60, t: 'T2', s: 'adds 50' },
          { id: 'row', x: 240, y: 95, w: 160, h: 60, t: 'Account row', s: 'id = 1' },
          { id: 'fin', x: 470, y: 95, w: 160, h: 60, t: 'Final balance', s: 'expected 200' }
        ],
        edges: [
          { id: 'a', a: 't1', b: 'row', label: 'read, write' },
          { id: 'b', a: 't2', b: 'row', label: 'read, write' },
          { id: 'c', a: 'row', b: 'fin', label: 'committed' }
        ]
      },
      bug: [
        { log: 'The balance is 100. Two transactions each add 50, so the correct result is 200.', code: 0, hl: { nodes: { row: 'on' } }, stats: [{ l: 'balance', v: '100', cls: 'ok' }, { l: 'expected', v: '200', cls: 'ok' }] },
        { log: 'T1 reads 100 and plans to write 150. T2 reads 100 and plans to write 150.', code: 1, hl: { nodes: { t1: 'on', t2: 'on' }, edges: { a: 'on', b: 'on' } }, stats: [{ l: 'reads', v: '100, 100', cls: 'warn' }] },
        { log: 'T1 writes 150 and commits.', code: 3, hl: { nodes: { t1: 'ok', row: 'on' }, edges: { a: 'ok' } }, stats: [{ l: 'balance', v: '150', cls: 'ok' }] },
        { log: 'T2 writes 150 from its old read and commits. T1’s +50 is lost.', code: 4, hl: { nodes: { t2: 'bad', fin: 'bad' }, edges: { b: 'bad', c: 'bad' } }, stats: [{ l: 'balance', v: '150', cls: 'bad' }, { l: 'expected', v: '200', cls: 'warn' }] }
      ],
      fix: [
        { log: 'T1 runs one UPDATE that adds 50 in the database. It holds the row lock until commit.', code: 1, hl: { nodes: { t1: 'on', row: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'balance', v: '150 (uncommitted)', cls: 'warn' }] },
        { log: 'T2 runs the same UPDATE and waits for the row lock. T1 commits.', code: 2, hl: { nodes: { t1: 'ok', t2: 'warn' }, edges: { a: 'ok' } }, stats: [{ l: 'balance', v: '150', cls: 'ok' }] },
        { log: 'T2 gets the lock, adds 50 to the current 150, and commits. No update is lost.', code: 2, hl: { nodes: { t2: 'ok', fin: 'ok' }, edges: { b: 'ok', c: 'ok' } }, stats: [{ l: 'balance', v: '200', cls: 'ok' }, { l: 'expected', v: '200', cls: 'ok' }] }
      ]
    },
    {
      id: 'book',
      label: 'Double booking',
      desc: 'Two requests check that room 101 at 10:00 is free, then both insert a booking.',
      codeLabel: 'Query',
      code: {
        bug: [
          `SELECT count(*) FROM bookings WHERE room = 101 AND slot = '10:00';  -- 0`,
          `INSERT INTO bookings (room, slot) VALUES (101, '10:00');`,
          'COMMIT;'
        ],
        fix: [
          'ALTER TABLE bookings ADD UNIQUE (room, slot);',
          `INSERT INTO bookings (room, slot) VALUES (101, '10:00');`,
          'ERROR: duplicate key value violates unique constraint "bookings_room_slot_key"'
        ]
      },
      diagram: {
        w: 640, h: 250,
        nodes: [
          { id: 't1', x: 10, y: 25, w: 160, h: 60, t: 'T1 request', s: 'books room 101' },
          { id: 't2', x: 10, y: 165, w: 160, h: 60, t: 'T2 request', s: 'books room 101' },
          { id: 'tbl', x: 240, y: 95, w: 170, h: 60, t: 'bookings table', s: 'room 101 at 10:00' },
          { id: 'idx', x: 470, y: 95, w: 160, h: 60, t: 'Unique index', s: '(room, slot)' }
        ],
        edges: [
          { id: 'a', a: 't1', b: 'tbl', label: 'check, insert' },
          { id: 'b', a: 't2', b: 'tbl', label: 'check, insert' },
          { id: 'c', a: 'tbl', b: 'idx', label: 'key check' }
        ]
      },
      bug: [
        { log: 'Room 101 at 10:00 has no booking. Two requests arrive at the same time.', code: 0, hl: { nodes: { tbl: 'on' } }, stats: [{ l: 'bookings', v: '0', cls: 'ok' }] },
        { log: 'T1 counts bookings for the slot: 0. T2 counts: 0. Both see the room as free.', code: 0, hl: { nodes: { t1: 'on', t2: 'on' }, edges: { a: 'on', b: 'on' } }, stats: [{ l: 'count seen', v: '0, 0', cls: 'warn' }] },
        { log: 'T1 inserts its booking. T2 inserts its booking. No existing row conflicts, so nothing stops the second insert.', code: 1, hl: { nodes: { tbl: 'warn', idx: 'dim' } }, stats: [{ l: 'bookings', v: '2', cls: 'warn' }] },
        { log: 'Both commit. The room is double-booked.', code: 2, hl: { nodes: { tbl: 'bad' } }, stats: [{ l: 'bookings', v: '2', cls: 'bad' }, { l: 'room', v: 'double-booked', cls: 'bad' }] }
      ],
      fix: [
        { log: 'A unique constraint on (room, slot) is added. It is checked on every insert, whatever the isolation level.', code: 0, hl: { nodes: { idx: 'new' } }, stats: [{ l: 'bookings', v: '0', cls: 'ok' }] },
        { log: 'T1 inserts its booking and commits.', code: 1, hl: { nodes: { t1: 'ok', tbl: 'on' }, edges: { a: 'ok', c: 'ok' } }, stats: [{ l: 'bookings', v: '1', cls: 'ok' }] },
        { log: 'T2 inserts the same room and slot. The unique index rejects it, and the app shows the room as taken.', code: 2, hl: { nodes: { t2: 'bad', idx: 'ok' }, edges: { b: 'bad' } }, stats: [{ l: 'bookings', v: '1', cls: 'ok' }, { l: 'room', v: 'booked once', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Concurrency Control and MVCC',
  problem: `During a flash sale, ten checkout workers update one stock counter row. The dashboard shows 412 attempts per second but only 10 commits per second, and the transfer service starts logging <code>ERROR:  deadlock detected</code> (illustrative). By evening, the <code>orders</code> table has bloated, although VACUUM ran the night before.`,
  predict: {
    q: `Ten clients each read the counter, add 1 in the app, and write it back only if the version has not changed (optimistic control). How many write attempts does it take to commit all 10 increments?`,
    opts: [
      `10, one per client`,
      `55: in each round only one of the remaining clients wins, and the rest retry`,
      `20: each client fails once and then succeeds`,
      `It never finishes, because optimistic writers deadlock`
    ],
    ans: 1,
    why: `All remaining clients read the same version, and only one write can match it. So rounds of 10, 9, 8 ... 1 attempts add up to 55, with 45 aborts. A hot row serializes the work under any protocol.`
  },
  explain: `<h3>The idea</h3>
<p>Chapter 11 said which anomalies each isolation level allows. A <b>concurrency-control protocol</b> enforces it. When two transactions want the same row, the protocol chooses: one waits, one aborts, or one reads an older version. Each choice has a cost you can see in production as waits, aborts or retained versions.</p>
<h3>How it works, step by step</h3>
<p><b>Locks.</b> The lock manager grants Shared (S) locks to readers and Exclusive (X) locks to writers. S is compatible only with S. X is compatible with nothing, so it waits for every other holder.</p>
<p><b>Two-phase locking (2PL)</b>: a transaction grows its lock set, then shrinks it. Strict 2PL holds locks until commit, so nobody reads uncommitted writes. Waiting can form a cycle. <b>Deadlock detection</b> builds a waits-for graph, finds the cycle and aborts a victim, usually the youngest.</p>
<p><b>Timestamp ordering</b> gives each transaction a fixed timestamp and aborts any access that arrives out of order instead of waiting. <b>Optimistic control (OCC)</b> works in a private workspace without waiting and validates at commit. It aborts if a transaction that committed meanwhile wrote something it read or wrote. OCC suits low conflict.</p>
<p><b>MVCC</b> keeps several versions of each row. A reader uses a snapshot and never waits for a writer. A writer blocks only another writer of the same row, and the first writer wins. In PostgreSQL, an UPDATE writes a new tuple version and sets <code>xmax</code> on the old one. <b>VACUUM</b> later removes versions that no open snapshot can see.</p>
<h3>The trade-off</h3>
<p>Locking pays in waits and deadlock victims. Optimistic schemes pay in aborts and retries, which grow fast under contention. MVCC keeps readers fast, but one long-lived snapshot stops garbage collection, so dead versions pile up. Aborts with SQLSTATE <code>40001</code> or <code>40P01</code> are normal outcomes. The application must retry the whole transaction. Match the protocol to contention, read duration and retry behavior.</p>`,
  diagnose: [
    {
      t: 'Opposite lock order',
      sym: 'Deadlock errors appear under load, and the same two transfers fail again on each retry.',
      ctx: 'Two code paths update the same pair of accounts, but lock them in a different order.',
      why: 'Each transaction holds one lock and waits for the lock the other holds. Neither can move first, so the database must abort one victim.',
      log: `-- representative PostgreSQL log, wording varies by version
ERROR:  deadlock detected
DETAIL:  Process 4412 waits for ShareLock on transaction 918; blocked by process 4417.
         Process 4417 waits for ShareLock on transaction 917; blocked by process 4412.
HINT:  See server log for query details.`,
      fix: [
        'Measure first: count the deadlock detected errors in the server log, and read the DETAIL lines to find the two processes and statements in the cycle.',
        'Fix: take locks in one global order, such as ascending account id, in every code path that touches both rows.',
        'Fix: lock all the rows in one statement with ORDER BY id and FOR UPDATE, so the order is fixed in one place.',
        'Fix: keep transactions short. Do not call a remote service while row locks are held.',
        'Fix: retry on SQLSTATE 40P01 (deadlock detected) with a small random backoff, and log the victim statement.',
        'Verify: run the two transfers in both orders with 20 concurrent sessions. The deadlock count should be 0.'
      ]
    },
    {
      t: 'Serialization errors not retried',
      sym: 'Some transfers vanish. The logs show SQLSTATE 40001 on a few requests, and nothing is retried.',
      ctx: 'Transfers run at REPEATABLE READ or SERIALIZABLE, and the API returns HTTP 500 for a few of them.',
      why: 'Under snapshot isolation or serializable, the database aborts one of two conflicting transactions so the result stays correct. That abort is a normal outcome, and the application must run the transaction again. Treated as a failure, it loses the work.',
      log: `-- representative PostgreSQL error at REPEATABLE READ or SERIALIZABLE
ERROR:  could not serialize access due to concurrent update
SQLSTATE: 40001
-- representative application log
POST /transfer  status=500  account=1842  amount=50  sqlstate=40001`,
      fix: [
        'Measure first: count requests that ended with sqlstate=40001 in the application log, and check whether any of them was retried.',
        'Fix: wrap the whole transaction, not one statement, in a retry loop for SQLSTATE 40001 and 40P01.',
        'Fix: use a bounded number of retries with jittered backoff, then return a clear error to the caller.',
        'Fix: make the transfer idempotent: store a request id in the same transaction, so a retry cannot apply the transfer twice.',
        'Verify: force a conflict in a test. Every request must end in a commit or a bounded error, and the balances must sum to the expected total.'
      ]
    },
    {
      t: 'Long-lived snapshots',
      sym: 'Table bloat grows during the day, even though VACUUM runs every night.',
      ctx: 'A reporting session sits idle in transaction for hours while the table keeps getting updates.',
      why: 'VACUUM may remove a dead version only when no open snapshot can still see it. One idle transaction keeps an old snapshot alive, so every version created after it is retained.',
      log: `-- representative PostgreSQL output, counts illustrative
VACUUM VERBOSE orders;
INFO:  "orders": found 0 removable, 1843920 nonremovable row versions
DETAIL:  1843912 dead row versions cannot be removed yet, oldest xmin: 2947103
-- representative pg_stat_activity columns for the session that holds the old snapshot
state: idle in transaction   backend_xmin: 2947103   xact_start: 06:12`,
      fix: [
        'Measure first: find the blocker. Sort pg_stat_activity by the oldest xact_start and the oldest backend_xmin, and match it to the oldest xmin that VACUUM VERBOSE reports.',
        'Fix: end idle transactions. Set idle_in_transaction_session_timeout so a session that sits in a transaction cannot pin the horizon.',
        'Fix: split long reads into short batches, each in its own transaction, so no single snapshot lasts for hours.',
        'Verify: after the session ends, VACUUM VERBOSE reports 0 dead row versions that cannot be removed.'
      ]
    },
    {
      t: 'Hot row',
      sym: 'Throughput stalls at a few commits per second on one counter, while attempts keep climbing.',
      ctx: 'Many clients increment the same counter row with a read-modify-write and a version check.',
      why: 'Every client writes the same row. With optimistic checks, all but one attempt fail and retry. With locking, the rest queue behind one lock. Either way the hot row serializes the work.',
      log: `-- representative application metrics, 10 clients on one counter row
attempts/s    412
commits/s      10
retries/s     402   (UPDATE ... WHERE version = $1 affected 0 rows)`,
      fix: [
        'Measure first: compare attempts/s with commits/s for the counter, and count UPDATEs that affected 0 rows.',
        'Fix: replace read-modify-write with one atomic statement: UPDATE counters SET n = n + 1 WHERE id = $1. The row lock serializes it without retries.',
        'Fix: shard a hot counter into N rows and sum them on read, so writers rarely share a row.',
        'Fix: batch increments in the application and write them every few hundred milliseconds.',
        'Verify: attempts per commit should approach 1, and the retry or abort count should be near 0.'
      ]
    }
  ],
  source: { label: 'Original: Concurrency Control and MVCC', href: '01-database-systems-end-to-end.html#ch11' },
  scenarios: [
    {
      id: 'hot',
      label: 'Abort or wait',
      desc: 'Ten clients increment one counter row, first with optimistic version checks, then with one atomic UPDATE that waits for the row lock (illustrative).',
      codeLabel: 'Query',
      code: {
        bug: [
          'SELECT n, version FROM counters WHERE id = $1;',
          '-- the application computes n + 1',
          'UPDATE counters SET n = $2, version = version + 1',
          '  WHERE id = $1 AND version = $3;  -- 0 rows: retry'
        ],
        fix: [
          'UPDATE counters SET n = n + 1 WHERE id = $1;',
          '-- the row lock queues writers; nobody retries'
        ]
      },
      diagram: {
        w: 640, h: 250,
        nodes: [
          { id: 'cl', x: 10, y: 95, w: 160, h: 60, t: 'Ten clients', s: 'add 1 to one row' },
          { id: 'row', x: 240, y: 95, w: 160, h: 60, t: 'Counter row', s: 'id = 1' },
          { id: 'occ', x: 470, y: 25, w: 160, h: 60, t: 'Version check', s: 'one winner a round' },
          { id: 'q', x: 470, y: 165, w: 160, h: 60, t: 'Lock queue', s: 'waits for X lock' }
        ],
        edges: [
          { id: 'w', a: 'cl', b: 'row', label: 'write' },
          { id: 'o', a: 'row', b: 'occ', label: 'optimistic' },
          { id: 'l', a: 'row', b: 'q', label: 'locking' }
        ]
      },
      bug: [
        { log: 'Ten clients read the counter at version 0, and each tries to write version 1.', code: 0, hl: { nodes: { cl: 'on', row: 'on' }, edges: { w: 'on' } }, stats: [{ l: 'clients', v: '10' }] },
        { log: 'Round 1: 10 clients try to write. One succeeds; the other 9 see a changed version and must retry.', code: 3, hl: { nodes: { occ: 'bad' }, edges: { o: 'bad' } }, stats: [{ l: 'attempts', v: '10', cls: 'warn' }, { l: 'aborted', v: '9', cls: 'bad' }, { l: 'commits', v: '1' }] },
        { log: 'Round 5: 6 clients try, 1 succeeds, 5 retry. Every round has exactly one winner.', code: 3, hl: { nodes: { occ: 'bad', cl: 'warn' } }, stats: [{ l: 'attempts', v: '40', cls: 'warn' }, { l: 'aborted', v: '35', cls: 'bad' }, { l: 'commits', v: '5' }] },
        { log: 'Round 10: the last client commits. Ten increments cost 55 attempts.', code: 3, hl: { nodes: { row: 'warn' } }, stats: [{ l: 'attempts', v: '55', cls: 'bad' }, { l: 'aborted', v: '45', cls: 'bad' }, { l: 'commits', v: '10', cls: 'ok' }] }
      ],
      fix: [
        { log: 'Each client runs one atomic UPDATE that adds 1 inside the database.', code: 0, hl: { nodes: { cl: 'on', row: 'on' }, edges: { w: 'on' } }, stats: [{ l: 'attempts', v: '10', cls: 'ok' }] },
        { log: 'Round 1: the first client holds the row lock and commits. The other 9 wait in the lock queue, with no retry.', code: 1, hl: { nodes: { q: 'warn' }, edges: { l: 'on' } }, stats: [{ l: 'queued', v: '9', cls: 'warn' }, { l: 'commits', v: '1' }] },
        { log: 'Round 10: every client has committed once. The work still runs one at a time, but nothing is aborted.', code: 1, hl: { nodes: { q: 'ok', row: 'ok' }, edges: { l: 'ok' } }, stats: [{ l: 'attempts', v: '10', cls: 'ok' }, { l: 'aborted', v: '0', cls: 'ok' }, { l: 'queued (total)', v: '45', cls: 'warn' }, { l: 'commits', v: '10', cls: 'ok' }] }
      ]
    },
    {
      id: 'deadlock',
      label: 'Deadlock',
      desc: 'Under strict 2PL, two transfers lock rows A and B in opposite orders and wait for each other.',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- T1: transfer from A (id 1) to B (id 2)',
          'UPDATE accounts SET balance = balance - 30 WHERE id = 1;',
          'UPDATE accounts SET balance = balance + 30 WHERE id = 2;',
          '-- T2: transfer from B to A, so it locks id 2 first, then id 1',
          'ERROR:  deadlock detected'
        ],
        fix: [
          'BEGIN;',
          'SELECT * FROM accounts WHERE id IN (1, 2)',
          '  ORDER BY id FOR UPDATE;  -- same order in every path',
          '-- then both UPDATEs, then COMMIT'
        ]
      },
      diagram: {
        w: 640, h: 250,
        nodes: [
          { id: 't1', x: 10, y: 25, w: 170, h: 60, t: 'T1 transfer', s: 'locks A, then B' },
          { id: 't2', x: 10, y: 165, w: 170, h: 60, t: 'T2 transfer', s: 'locks B, then A' },
          { id: 'ra', x: 260, y: 25, w: 140, h: 60, t: 'Row A', s: 'X lock' },
          { id: 'rb', x: 260, y: 165, w: 140, h: 60, t: 'Row B', s: 'X lock' },
          { id: 'det', x: 460, y: 95, w: 170, h: 60, t: 'Deadlock detector', s: 'waits-for graph' }
        ],
        edges: [
          { id: 'ha', a: 't1', b: 'ra', label: 'holds' },
          { id: 'hb', a: 't2', b: 'rb', label: 'holds' },
          { id: 'wb', a: 't1', b: 'rb', label: 'wants' },
          { id: 'wa', a: 't2', b: 'ra', label: 'wants' },
          { id: 'cy', a: 'ra', b: 'det', label: 'cycle' }
        ]
      },
      bug: [
        { log: 'T1 takes an exclusive lock on A. T2 takes an exclusive lock on B.', code: 1, hl: { nodes: { t1: 'on', t2: 'on', ra: 'on', rb: 'on' }, edges: { ha: 'on', hb: 'on' } }, stats: [{ l: 'locks held', v: '2' }] },
        { log: 'T1 asks for B. T2 holds it, so T1 waits for T2.', code: 2, hl: { nodes: { t1: 'warn' }, edges: { wb: 'on' } }, stats: [{ l: 'waiting', v: 'T1', cls: 'warn' }] },
        { log: 'T2 asks for A. T1 holds it, so T2 waits for T1. The waits form a cycle.', code: 3, hl: { nodes: { t1: 'warn', t2: 'warn' }, edges: { wb: 'bad', wa: 'bad' } }, stats: [{ l: 'waiting', v: 'T1, T2', cls: 'bad' }] },
        { log: 'The detector finds the cycle and picks T2, the younger transaction, as the victim.', code: 3, hl: { nodes: { det: 'on', t2: 'bad' }, edges: { cy: 'on' } }, stats: [{ l: 'victim', v: 'T2', cls: 'warn' }] },
        { log: 'T2 is rolled back with ERROR: deadlock detected, and the app must retry it. T1 gets B and commits.', code: 4, hl: { nodes: { t1: 'ok', t2: 'bad' } }, stats: [{ l: 'commits', v: '1' }, { l: 'aborts', v: '1', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Both transfers lock rows in one global order, A before B.', code: 2, hl: { nodes: { t1: 'on', t2: 'on' } }, stats: [{ l: 'lock order', v: 'A, then B', cls: 'ok' }] },
        { log: 'T1 takes A and B. T2 wants A, so it waits for T1. T1 waits for nobody, so no cycle can form.', code: 2, hl: { nodes: { ra: 'on', rb: 'on', t2: 'warn' }, edges: { ha: 'on', wb: 'ok', wa: 'on' } }, stats: [{ l: 'waiting', v: 'T2', cls: 'warn' }] },
        { log: 'T1 commits and releases both locks. T2 takes A, then B, and commits.', code: 3, hl: { nodes: { t1: 'ok', t2: 'ok', det: 'dim' } }, stats: [{ l: 'commits', v: '2', cls: 'ok' }, { l: 'aborts', v: '0', cls: 'ok' }] }
      ]
    },
    {
      id: 'bloat',
      label: 'Old snapshot',
      desc: 'An idle reporting transaction keeps an old snapshot open, so VACUUM cannot remove dead row versions.',
      codeLabel: 'Command',
      code: {
        bug: [
          '-- session A: a report opens a transaction and goes idle',
          'BEGIN; SELECT ... ;  -- state: idle in transaction',
          '-- session B: 8 updates to the same row',
          'VACUUM VERBOSE orders;',
          'DETAIL:  ... dead row versions cannot be removed yet, oldest xmin: 2947103'
        ],
        fix: [
          '-- find the session with the oldest snapshot',
          'SELECT state, backend_xmin, xact_start FROM pg_stat_activity ORDER BY xact_start;',
          '-- end that session; set idle_in_transaction_session_timeout',
          'VACUUM VERBOSE orders;  -- dead versions are now removable'
        ]
      },
      diagram: {
        w: 640, h: 250,
        nodes: [
          { id: 'rep', x: 10, y: 25, w: 170, h: 60, t: 'Report session', s: 'idle in transaction' },
          { id: 'upd', x: 10, y: 165, w: 170, h: 60, t: 'Updates', s: 'one new version each' },
          { id: 'heap', x: 240, y: 95, w: 160, h: 60, t: 'Heap page', s: 'row versions' },
          { id: 'vac', x: 470, y: 95, w: 160, h: 60, t: 'VACUUM', s: 'removes dead versions' }
        ],
        edges: [
          { id: 'sn', a: 'rep', b: 'heap', label: 'old snapshot' },
          { id: 'nv', a: 'upd', b: 'heap', label: 'new version' },
          { id: 'gc', a: 'vac', b: 'heap', label: 'cleanup' }
        ]
      },
      bug: [
        { log: 'The row has one live version. A reporting session opened a transaction and has not ended it.', code: 1, hl: { nodes: { rep: 'warn', heap: 'on' }, edges: { sn: 'on' } }, stats: [{ l: 'versions kept', v: '1' }] },
        { log: 'Update 1 writes a new version. The open snapshot may still need the old one, so VACUUM keeps it.', code: 2, hl: { nodes: { upd: 'on', vac: 'warn' }, edges: { nv: 'on', gc: 'dim' } }, stats: [{ l: 'updates', v: '1' }, { l: 'versions kept', v: '2', cls: 'warn' }] },
        { log: 'Update 4: every version created after the snapshot is retained. 4 dead versions sit on the page.', code: 2, hl: { nodes: { heap: 'warn', vac: 'warn' }, edges: { nv: 'on' } }, stats: [{ l: 'updates', v: '4' }, { l: 'versions kept', v: '5', cls: 'warn' }] },
        { log: 'Update 8: VACUUM VERBOSE reports dead row versions that cannot be removed yet. The table bloats.', code: 4, hl: { nodes: { heap: 'bad', vac: 'bad', rep: 'bad' } }, stats: [{ l: 'updates', v: '8' }, { l: 'versions kept', v: '9', cls: 'bad' }] }
      ],
      fix: [
        { log: 'After updates 1 and 2, pg_stat_activity shows the report session idle in transaction with the oldest backend_xmin.', code: 1, hl: { nodes: { rep: 'warn' }, edges: { sn: 'on' } }, stats: [{ l: 'versions kept', v: '3', cls: 'warn' }] },
        { log: 'The idle session is ended before update 3. The snapshot horizon moves forward.', code: 2, hl: { nodes: { rep: 'dim', vac: 'on' }, edges: { sn: 'dim', gc: 'on' } }, stats: [{ l: 'reader', v: 'ended', cls: 'ok' }] },
        { log: 'Updates 3 to 8: each writes a version, and VACUUM removes the one dead version at once.', code: 3, hl: { nodes: { heap: 'ok', vac: 'ok' }, edges: { nv: 'on', gc: 'ok' } }, stats: [{ l: 'updates', v: '8' }, { l: 'versions kept', v: '1', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Logging and Crash Recovery',
  problem: `A payments database moves 30 from account A to account B. The host loses power in the middle of the transfer. After restart, <code>SUM(balance)</code> is 120 instead of 150 (illustrative). Thirty units have left A and never arrived in B, and nothing in the log mentions the transfer.`,
  predict: {
    q: `Now assume the log records for the transfer were flushed before page A was written. Power fails after page A is on disk, before the COMMIT. What should recovery do?`,
    opts: [
      `Undo the transfer from the logged before values, so A is 100 and B is 50`,
      `Redo the rest of the transfer, so A is 70 and B is 80`,
      `Leave A at 70, because pages on disk are always trusted`,
      `Stop and wait for an operator to fix the balances by hand`
    ],
    ans: 0,
    why: `The transfer never wrote a durable COMMIT record, so it is a loser and must be undone. The log holds the before values, so recovery can restore A to 100, and the total is 150 again.`
  },
  explain: `<h3>The idea</h3>
<p>A crash can stop a transaction halfway. Some changed pages may be on disk and others only in memory. <b>Write-ahead logging (WAL)</b> records each change in a log before the changed data page reaches disk. After a crash, the durable log tells recovery what to repeat and what to reverse.</p>
<h3>How it works, step by step</h3>
<p>Each log record gets a <b>log sequence number (LSN)</b> and holds the transaction id, the object, a before value (for undo) and an after value (for redo). Records wait in the <b>log buffer</b> in memory. <code>flushedLSN</code> is the newest LSN on disk. Each page stores <code>pageLSN</code>, the newest LSN that changed it.</p>
<p>The WAL rule has two parts. A page may be written only after the log records for its changes are on disk. A commit is final only when its COMMIT record is flushed, and only then may the client be told. Group commit shares one flush among several commits.</p>
<p>Most systems use <b>STEAL</b> (an uncommitted change may reach disk) and <b>NO-FORCE</b> (commit does not force pages out). So recovery needs both <b>redo</b> and <b>undo</b>.</p>
<p>A <b>checkpoint</b> bounds how far recovery must scan. A fuzzy checkpoint lets work continue and records the active transaction table (ATT) and dirty page table (DPT). The <b>MasterRecord</b> points to the last completed checkpoint.</p>
<p><b>ARIES</b> recovery runs three passes. Analysis rebuilds the ATT and DPT from the checkpoint. Redo starts at the smallest <code>recLSN</code> and repeats history, skipping a record when the page already has it. Undo reverses the losers and writes a <b>compensation log record (CLR)</b> for each, so a crash during recovery is safe.</p>
<h3>The trade-off</h3>
<p>STEAL plus NO-FORCE is fast, because commits write the log sequentially and pages go out later. The price is a more complex recovery, a flush wait on every commit, and checkpoints that must write dirty pages without stalling everyone.</p>`,
  diagnose: [
    {
      t: 'Acknowledged before durable',
      sym: 'The client shows success, but after a restart the transfer has disappeared.',
      ctx: 'The server crashed or lost power shortly after it replied OK to the client.',
      why: 'The database must not tell the client that a transaction committed until its COMMIT record is on stable storage. If the server replies first, a crash can erase a commit the client was told about.',
      log: `-- representative application log
INFO  transfer ok  txn=T1  account=1842 -> 2291  amount=30
-- after a restart, the same transfer is missing from the log and the balances`,
      fix: [
        'Measure first: compare the transfers the application logged as ok with the rows present after the restart.',
        'Fix: reply to the client only after the commit flush returns. The server must wait for the WAL sync before it sends OK.',
        'Fix: if synchronous commit is turned off for speed, say so to the client: the reply then promises less.',
        'Fix: use group commit to share one flush among concurrent commits, so the wait stays short.',
        'Verify: kill the server right after OK is sent in a test. The transfer must be present after restart, every time.'
      ]
    },
    {
      t: 'Partially written page',
      sym: 'Wrong balance after restart, and the page fails verification when it is read.',
      ctx: 'Power failed in the middle of an in-place data page write.',
      why: 'The torn-write model and the doublewrite area are illustrative; the course text does not cover them. A page write is not atomic on disk: power can fail after the first sector. Recovery then sees a fresh header with stale contents. Redo skips the record because the page header says it is already applied.',
      log: `-- representative PostgreSQL log, wording varies by version
WARNING:  page verification failed, calculated checksum 41237 but expected 9182
-- representative application check
SUM(balance) = 120, expected 150`,
      fix: [
        'Measure first: search the server log for page verification failed, and compare SUM(balance) with the expected total.',
        'Fix: write a full copy of each page to a doublewrite area and sync it, before the page is written in place (illustrative; not in the course text).',
        'Fix: store a checksum in each page, and on recovery restore a page that fails it from the doublewrite copy.',
        'Fix: log a full page image the first time a page changes after a checkpoint, so redo can rebuild a torn page (illustrative; not in the course text).',
        'Verify: simulate a torn write in a test. The restart must restore a page with the expected total.'
      ]
    },
    {
      t: 'Checkpoint I/O burst',
      sym: 'p99 latency spikes every few minutes, exactly when the checkpoint runs.',
      ctx: 'The latency graph has regular spikes that line up with checkpoint lines in the server log.',
      why: 'A blocking checkpoint writes every dirty page at once, and transactions wait while it runs. The write burst fills the device queue, and everyone pays the latency.',
      log: `-- representative PostgreSQL server log, counts illustrative
LOG:  checkpoint starting: time
LOG:  checkpoint complete: wrote 412000 buffers (12.3%); write=268.4 s, sync=3.1 s`,
      fix: [
        'Measure first: line up the checkpoint starting and checkpoint complete log lines with the p99 latency graph, and read the buffers written and the write and sync times.',
        'Fix: use a fuzzy checkpoint: record the dirty page table and the active transactions, and let work continue during the flush.',
        'Fix: spread the writes: let the background writer flush a steady number of pages per tick, so no single tick takes the whole burst.',
        'Fix: set the checkpoint interval so that recovery time is acceptable, and no more often than the device can absorb.',
        'Verify: the peak write count per second and the p99 latency should both fall, while the recovery time stays within target.'
      ]
    },
    {
      t: 'Stalled replication slot',
      sym: 'Disk fills with WAL while the primary looks healthy and queries stay fast.',
      ctx: 'A change-data-capture consumer stopped some time ago, and its slot is still defined on the primary.',
      why: 'Representative of PostgreSQL slot behavior, not from the course text: a replication or change-data-capture slot keeps the WAL it has not consumed. A stopped consumer keeps its slot, so the server cannot recycle the WAL, and the directory grows until it is full.',
      log: `-- representative PostgreSQL 16 output
slot_name   | active | restart_lsn | wal_status
orders_cdc  | f      | 3A/0F2C1000 | extended`,
      fix: [
        'Measure first: list the replication slots and check active, restart_lsn and wal_status. An inactive slot with an old restart_lsn is holding WAL.',
        'Fix: alert on inactive slots and on retained WAL bytes, not only on query latency.',
        'Fix: set a limit on retained WAL, so a stuck consumer loses its slot instead of filling the disk.',
        'Fix: make consumers resume from the slot position, and fix the consumer before the disk is at risk.',
        'Verify: stop a test consumer. The alert fires, and the retained WAL stays within the limit.'
      ]
    }
  ],
  source: { label: 'Original: Logging and Crash Recovery', href: '01-database-systems-end-to-end.html#ch12' },
  scenarios: [
    {
      id: 'wal',
      label: 'Log first',
      desc: 'T1 moves 30 from A (100) to B (50); power fails after page A is written, with and without the WAL rule.',
      codeLabel: 'Command',
      code: {
        bug: [
          'BEGIN T1; A 100 -> 70; B 50 -> 80   -- LSN 1 to 3, in the log buffer',
          'write page A to disk                 -- before its log record',
          '-- power fails: log buffer lost, flushedLSN 0',
          'recovery: no log record, so A cannot be undone'
        ],
        fix: [
          'BEGIN T1; A 100 -> 70; B 50 -> 80   -- LSN 1 to 3, in the log buffer',
          'flush the log through LSN 3          -- WAL rule',
          'write page A to disk                 -- steal',
          '-- power fails before COMMIT T1',
          'recovery: redo LSN 3, then undo LSN 3 and LSN 2'
        ]
      },
      diagram: {
        w: 640, h: 250,
        nodes: [
          { id: 'tx', x: 10, y: 25, w: 160, h: 60, t: 'T1 transfer', s: 'A -30, B +30' },
          { id: 'rec', x: 10, y: 165, w: 160, h: 60, t: 'Recovery', s: 'redo, then undo' },
          { id: 'buf', x: 225, y: 25, w: 180, h: 60, t: 'Log buffer', s: 'records in memory' },
          { id: 'pool', x: 225, y: 165, w: 180, h: 60, t: 'Buffer pool', s: 'dirty pages A, B' },
          { id: 'log', x: 450, y: 25, w: 180, h: 60, t: 'Log on disk', s: 'durable to flushedLSN' },
          { id: 'disk', x: 450, y: 165, w: 180, h: 60, t: 'Data pages', s: 'A and B on disk' }
        ],
        edges: [
          { id: 'lr', a: 'tx', b: 'buf', label: 'log record' },
          { id: 'up', a: 'tx', b: 'pool', label: 'update' },
          { id: 'fl', a: 'buf', b: 'log', label: 'flush' },
          { id: 'pw', a: 'pool', b: 'disk', label: 'page write' },
          { id: 'rp', a: 'log', b: 'rec', label: 'replay' }
        ]
      },
      bug: [
        { log: 'T1 changes A from 100 to 70 and B from 50 to 80. Records LSN 1 to 3 sit in the log buffer, and pages A and B are dirty.', code: 0, hl: { nodes: { tx: 'on', buf: 'on', pool: 'on' }, edges: { lr: 'on', up: 'on' } }, stats: [{ l: 'flushedLSN', v: '0', cls: 'warn' }] },
        { log: 'The pool writes page A to disk before its log records are flushed. This breaks the WAL rule.', code: 1, hl: { nodes: { pool: 'warn', disk: 'bad' }, edges: { pw: 'bad', fl: 'dim' } }, stats: [{ l: 'A on disk', v: '70', cls: 'bad' }, { l: 'B on disk', v: '50' }] },
        { log: 'Power fails. The log buffer is lost, and the log on disk has nothing about T1.', code: 2, hl: { nodes: { buf: 'bad', pool: 'dim', log: 'dim' } }, stats: [{ l: 'durable records', v: '0', cls: 'bad' }] },
        { log: 'Recovery reads the durable log and finds nothing to undo. Page A stays at 70 and B at 50.', code: 3, hl: { nodes: { rec: 'bad', disk: 'bad' }, edges: { rp: 'dim' } }, stats: [{ l: 'A + B', v: '70 + 50', cls: 'bad' }, { l: 'total', v: '120 (expected 150)', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The same changes: LSN 1 to 3 in the log buffer, pages A and B dirty.', code: 0, hl: { nodes: { tx: 'on', buf: 'on', pool: 'on' }, edges: { lr: 'on', up: 'on' } }, stats: [{ l: 'flushedLSN', v: '0' }] },
        { log: 'The log is flushed through LSN 3 first. The before and after values are now durable.', code: 1, hl: { nodes: { log: 'ok' }, edges: { fl: 'ok' } }, stats: [{ l: 'flushedLSN', v: '3', cls: 'ok' }] },
        { log: 'Only now is page A written to disk (steal). Then power fails, before COMMIT T1.', code: 3, hl: { nodes: { disk: 'warn', buf: 'dim', pool: 'dim' }, edges: { pw: 'on' } }, stats: [{ l: 'A on disk', v: '70', cls: 'warn' }, { l: 'COMMIT T1', v: 'not durable', cls: 'warn' }] },
        { log: 'Recovery finds no COMMIT for T1, so T1 is a loser. Redo repeats LSN 3 on B, then undo reverses LSN 3 and LSN 2.', code: 4, hl: { nodes: { rec: 'ok', disk: 'ok' }, edges: { rp: 'ok' } }, stats: [{ l: 'redone', v: '1' }, { l: 'undone', v: '2' }, { l: 'A + B', v: '100 + 50', cls: 'ok' }, { l: 'total', v: '150', cls: 'ok' }] }
      ]
    },
    {
      id: 'ack',
      label: 'Early OK',
      desc: 'The server tells the client a transfer committed, then power fails before the COMMIT record is on disk.',
      codeLabel: 'Command',
      code: {
        bug: [
          'COMMIT;',
          '-- the server appends UPDATE and COMMIT to the log buffer',
          '-- the server replies OK before the flush',
          '-- power fails: the log buffer is lost'
        ],
        fix: [
          'COMMIT;',
          '-- the server appends UPDATE and COMMIT to the log buffer',
          '-- the server flushes the log; COMMIT is durable',
          '-- only now does the server reply OK'
        ]
      },
      diagram: {
        w: 640, h: 250,
        nodes: [
          { id: 'cl', x: 10, y: 25, w: 160, h: 60, t: 'Client', s: 'waits for OK' },
          { id: 'srv', x: 240, y: 25, w: 160, h: 60, t: 'Server', s: 'commit path' },
          { id: 'buf', x: 240, y: 165, w: 160, h: 60, t: 'Log buffer', s: 'lost on crash' },
          { id: 'log', x: 470, y: 165, w: 160, h: 60, t: 'Log on disk', s: 'survives a crash' }
        ],
        edges: [
          { id: 'c', a: 'cl', b: 'srv', label: 'COMMIT / OK' },
          { id: 'a', a: 'srv', b: 'buf', label: 'append' },
          { id: 'f', a: 'buf', b: 'log', label: 'flush' }
        ]
      },
      bug: [
        { log: 'T1 moves 30 from A to B. The server writes UPDATE and COMMIT to the log buffer. Nothing is on disk yet.', code: 1, hl: { nodes: { srv: 'on', buf: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'COMMIT durable', v: 'no', cls: 'warn' }] },
        { log: 'The server sends OK before the flush, so the client shows success.', code: 2, hl: { nodes: { cl: 'warn' }, edges: { c: 'bad', f: 'dim' } }, stats: [{ l: 'client sees', v: 'OK', cls: 'warn' }] },
        { log: 'Power fails. The log buffer is lost, and the log on disk has nothing about T1.', code: 3, hl: { nodes: { buf: 'bad', log: 'dim' } }, stats: [{ l: 'durable records', v: '0', cls: 'bad' }] },
        { log: 'Recovery: T1 is absent from the log, so it never happened. The client was told it succeeded.', code: 3, hl: { nodes: { cl: 'bad', srv: 'bad' } }, stats: [{ l: 'balances', v: 'A 100 · B 50', cls: 'bad' }, { l: 'acknowledged write', v: 'lost', cls: 'bad' }] }
      ],
      fix: [
        { log: 'The server writes UPDATE and COMMIT to the log buffer.', code: 1, hl: { nodes: { srv: 'on', buf: 'on' }, edges: { a: 'on' } }, stats: [{ l: 'COMMIT durable', v: 'no', cls: 'warn' }] },
        { log: 'The server flushes the log to disk. The COMMIT record is now durable.', code: 2, hl: { nodes: { log: 'ok' }, edges: { f: 'ok' } }, stats: [{ l: 'COMMIT durable', v: 'yes', cls: 'ok' }] },
        { log: 'Only now does the server send OK. Power fails, and recovery replays the durable COMMIT.', code: 3, hl: { nodes: { cl: 'ok', srv: 'ok' }, edges: { c: 'ok' } }, stats: [{ l: 'balances', v: 'A 70 · B 80', cls: 'ok' }, { l: 'acknowledged write', v: 'survives', cls: 'ok' }] }
      ]
    },
    {
      id: 'ckpt',
      label: 'Checkpoint burst',
      desc: 'A checkpoint must write 400 dirty pages (illustrative): all at once, or paced in the background.',
      codeLabel: 'Command',
      code: {
        bug: [
          'LOG:  checkpoint starting: time',
          '-- blocking checkpoint: write all 400 dirty pages now',
          '-- new transactions wait until it finishes',
          '-- tick 2: nothing left to write'
        ],
        fix: [
          '-- fuzzy checkpoint: record the ATT and DPT, keep running',
          '-- background writer: 100 pages per tick',
          '-- tick 4: last 100 pages written, checkpoint complete'
        ]
      },
      diagram: {
        w: 640, h: 250,
        nodes: [
          { id: 'pool', x: 10, y: 25, w: 160, h: 60, t: 'Buffer pool', s: '400 dirty pages' },
          { id: 'ck', x: 240, y: 25, w: 160, h: 60, t: 'Checkpoint', s: 'blocking or fuzzy' },
          { id: 'dev', x: 470, y: 25, w: 160, h: 60, t: 'Disk queue', s: 'page writes' },
          { id: 'tx', x: 240, y: 165, w: 160, h: 60, t: 'Transactions', s: 'p99 latency' }
        ],
        edges: [
          { id: 'd', a: 'pool', b: 'ck', label: 'dirty pages' },
          { id: 'w', a: 'ck', b: 'dev', label: 'write' },
          { id: 'b', a: 'ck', b: 'tx', label: 'blocks?' }
        ]
      },
      bug: [
        { log: '400 dirty pages are in the pool. A blocking checkpoint must write them all before new transactions can start (illustrative).', code: 1, hl: { nodes: { pool: 'on', ck: 'on' }, edges: { d: 'on' } }, stats: [{ l: 'dirty left', v: '400' }, { l: 'p99 ms', v: '4', cls: 'ok' }] },
        { log: 'Tick 1: all 400 pages are written in one burst. The device queue fills.', code: 1, hl: { nodes: { dev: 'bad' }, edges: { w: 'bad' } }, stats: [{ l: 'written this tick', v: '400', cls: 'bad' }] },
        { log: 'New transactions wait for the checkpoint, and p99 latency jumps.', code: 2, hl: { nodes: { tx: 'bad' }, edges: { b: 'bad' } }, stats: [{ l: 'p99 ms', v: '900', cls: 'bad' }] },
        { log: 'Tick 2: nothing is left to write, and latency is back to normal until the next checkpoint.', code: 3, hl: { nodes: { tx: 'ok', dev: 'dim' } }, stats: [{ l: 'dirty left', v: '0' }, { l: 'p99 ms', v: '4', cls: 'ok' }] }
      ],
      fix: [
        { log: 'A fuzzy checkpoint records the dirty page table and lets transactions keep running.', code: 0, hl: { nodes: { ck: 'ok', tx: 'ok' }, edges: { d: 'on', b: 'dim' } }, stats: [{ l: 'dirty left', v: '400' }] },
        { log: 'Ticks 1 to 3: the background writer flushes 100 pages per tick.', code: 1, hl: { nodes: { dev: 'on' }, edges: { w: 'on' } }, stats: [{ l: 'written per tick', v: '100', cls: 'ok' }, { l: 'p99 ms', v: '5', cls: 'ok' }] },
        { log: 'Tick 4: the last 100 pages are written. The checkpoint is complete, and the redo start point is recorded.', code: 2, hl: { nodes: { ck: 'ok', dev: 'ok', tx: 'ok' }, edges: { w: 'ok' } }, stats: [{ l: 'dirty left', v: '0', cls: 'ok' }, { l: 'p99 ms', v: '5', cls: 'ok' }] }
      ]
    }
  ]
}
,
{
  title: 'Distributed OLTP Databases',
  problem: `A payments service keeps accounts on two PostgreSQL shards: alice on shard A, bob on shard B. During a deploy, the transfer service commits a debit of 30 on shard A, then crashes before it sends the credit to shard B (illustrative). Both shards report healthy, but the nightly ledger check finds 120 where it expects 150, and support has a ticket for money that left one account and never arrived.`,
  predict: {
    q: `The transfer uses two plain commits, one per shard, with no commit protocol. Shard A has committed the debit and the coordinator is gone. What happens next?`,
    opts: [
      `Shard A's crash recovery rolls the debit back, because the whole transfer did not finish`,
      `The debit stays and the credit never happens, so 30 is missing until someone repairs it`,
      `Shard B applies the credit later, when the coordinator comes back`,
      `The database notices that the totals differ and aborts the transfer on both shards`
    ],
    ans: 1,
    why: `Each shard's recovery (chapter 13) protects only its own committed work, and the debit is committed and durable. Nothing on shard B knows a credit was due, and nothing retries it.`
  },
  explain: `<h3>The idea</h3>
<p><b>Sharding</b> (horizontal partitioning) splits rows across nodes by a partitioning key, using hash, range or predicate. Most transactions should touch one shard. A transaction that touches several shards needs <b>coordination</b>, so that all shards reach one agreed outcome even when a node or the coordinator fails.</p>
<h3>How it works, step by step</h3>
<p>The router reads the partitioning key and sends each piece of work to the shard that owns it. For a cross-shard transfer, <b>two-phase commit</b> (2PC) runs in two phases. Phase 1: the coordinator sends prepare. Each participant writes its change to its log, keeps its row locks, and votes OK or ABORT. Phase 2: if every vote is OK, the coordinator writes COMMIT to its own durable log and sends it. Otherwise it sends ABORT.</p>
<p>PostgreSQL exposes the phases directly. Each shard runs <code>PREPARE TRANSACTION 'xfer-42'</code>, and the coordinator later runs <code>COMMIT PREPARED 'xfer-42'</code> or <code>ROLLBACK PREPARED</code> on each one. This needs <code>max_prepared_transactions</code> above zero, and it is 0 by default. Operators find in-doubt transactions in <code>pg_prepared_xacts</code>.</p>
<p><b>Replication</b> keeps copies for availability. Synchronous propagation waits for replicas before acknowledging. Asynchronous propagation acknowledges first, so a replica can return stale reads. Moving a shard while it serves traffic (<b>online rebalancing</b>) needs <b>fencing</b>: an epoch or lease, so the old owner stops accepting writes. Every retry carries a request id, so it is applied once (<b>idempotency</b>).</p>
<h3>The trade-off</h3>
<p>2PC blocks. A participant that voted OK cannot commit or abort alone, because the coordinator may already have decided COMMIT. Its locks stay held until the coordinator returns. Storing the decision in a replicated log (Raft or Paxos) lets a standby finish the work. Within one data center, 2PC is often preferred because it needs fewer round trips. Under a network partition, a system still has to choose between consistency and availability (CAP).</p>`,
  diagnose: [
    {
      t: 'Hot shard',
      sym: 'One shard takes most of the requests while the others sit idle. The other shards show low load.',
      ctx: 'p99 latency rises on one shard only. Adding more shards does not move the load, because the same tenant keeps landing on the same one.',
      why: 'Hash partitioning spreads different keys evenly, but it cannot spread one key. A single busy tenant sends all of its requests to one shard, however many shards there are.',
      log: `representative shard metrics, one 5-minute window
shard-2  requests=high  p99 latency rising
shard-0  requests=low   cpu idle
busiest shard share: 80% of requests`,
      fix: [
        'Measure first: check the key distribution before you pick a partition key. A key with a few very heavy values is a poor choice.',
        'Split the hot key into buckets (acme plus a bucket suffix from 0 to 3). Reads for that tenant then fan out to the buckets.',
        'Move the hot tenant to a dedicated shard when it is large enough to justify the cost.',
        'Verify: compare the busiest shard\'s share of requests before and after the change. Here it moves from 80% to 30%.'
      ]
    },
    {
      t: 'Coordinator failure in doubt',
      sym: 'The rows of a transfer stay locked while the coordinator is down, and every new transfer on those rows waits.',
      ctx: 'Transfers on a few accounts hang and time out together, right after the coordinator restarts or crashes. Other accounts work.',
      why: 'In two-phase commit, a prepared participant cannot commit or abort on its own, because the coordinator may already have decided COMMIT. The decision is stored only in the coordinator\'s log, so the participant blocks until the coordinator returns.',
      log: `representative PostgreSQL view after a coordinator crash
SELECT gid, prepared FROM pg_prepared_xacts;
 xfer-42 | 2026-10-08 09:14:02   (still prepared, locks held)`,
      fix: [
        'Measure first: run SELECT gid, prepared FROM pg_prepared_xacts; on each participant to list prepared transactions and how long they have waited.',
        'Write the decision to a replicated log (Raft or Paxos) before sending COMMIT, so a standby coordinator can read it.',
        'Let a standby take over after a short timeout, read the decision, and finish the transaction.',
        'Set a lock timeout on the participants, so queued transfers fail fast and the client retries them.',
        'Verify: force a coordinator restart in a test and measure how long the rows stay locked. Here it moves from 40 s to 2 s (illustrative).'
      ]
    },
    {
      t: 'Replica lag',
      sym: 'A user saves a new balance and reads the old value a moment later.',
      ctx: 'Users report that a save "did not work", then the value appears after a refresh. Writes go to the primary, reads to replicas.',
      why: 'Asynchronous replication acknowledges the write before the replica applies it. A read routed to that replica can return the state from before the write, which breaks read-your-writes.',
      log: `representative replica status, PostgreSQL pg_stat_replication
client_addr  state      replay_lag
10.0.2.14    streaming  00:00:00.3
(representative. replay_lag as an interval column is from the PostgreSQL documentation, not the course notes; check your version)`,
      fix: [
        'Measure first: read replay_lag in pg_stat_replication on the primary and compare it with the time between a user\'s write and the next read.',
        'After a user writes, send that user\'s reads to the primary for a short window, such as 1 s.',
        'Return the commit position from the write, and read from a replica only once it has replayed past that position (for example with pg_last_wal_replay_lsn(), a PostgreSQL function, not in the course notes; check the docs).',
        'Use synchronous replication for the data that must be read back at once.',
        'Verify: run the same write-then-read test and count stale reads. Here it moves from 2 of 5 to 0.'
      ]
    },
    {
      t: 'Rebalancing without fencing',
      sym: 'A write that the old owner accepted after the copy stopped never reaches the new owner.',
      ctx: 'After a shard move, a few writes that clients saw acknowledged are missing on the new node. No error was returned to anyone.',
      why: 'A routing change is not instant. A client with a stale cache keeps sending writes to the old owner, which still accepts them. Nothing copies those writes after the copy stops, so they are lost.',
      log: `representative node log during a shard move
node-1 shard=7 epoch=1 accepted write w4 (routing stale)
node-2 shard=7 epoch=2 copy stopped at log position 103`,
      fix: [
        'Measure first: search the old owner\'s log for writes it accepted after the cut-over, such as "accepted write w4 (routing stale)".',
        'Give each shard owner an epoch number, and bump it at the cut-over.',
        'The old owner rejects any request that carries an old epoch. The client refreshes its routing and retries.',
        'Each retry carries a request id, so the new owner applies a retried write only once (idempotency).',
        'Verify: count the writes that clients saw acknowledged, and check each one on the new owner. Here lost writes move from 2 to 0.'
      ]
    }
  ],
  source: { label: 'Original: Distributed OLTP Databases', href: '01-database-systems-end-to-end.html#ch13' },
  scenarios: [
    {
      id: 'xfer',
      label: 'Cross-shard transfer',
      desc: 'A transfer of 30 from alice (shard A) to bob (shard B) while the coordinator crashes, first with dual writes, then with two-phase commit.',
      codeLabel: 'Query',
      code: {
        bug: [
          '-- shard A (autocommit)',
          "UPDATE accounts SET balance = balance - 30 WHERE id = 'alice';",
          '-- coordinator crashes here',
          '-- shard B (never sent)',
          "UPDATE accounts SET balance = balance + 30 WHERE id = 'bob';"
        ],
        fix: [
          '-- shard A',
          'BEGIN;',
          "UPDATE accounts SET balance = balance - 30 WHERE id = 'alice';",
          "PREPARE TRANSACTION 'xfer-42';   -- durable, lock held, vote OK",
          '-- shard B',
          'BEGIN;',
          "UPDATE accounts SET balance = balance + 30 WHERE id = 'bob';",
          "PREPARE TRANSACTION 'xfer-42';",
          '-- coordinator, after both votes and its own durable decision',
          "COMMIT PREPARED 'xfer-42';        -- run on A and on B"
        ]
      },
      diagram: {
        w: 640, h: 320,
        nodes: [
          { id: 'cl', x: 10, y: 110, w: 120, h: 60, t: 'Client', s: 'transfer 30' },
          { id: 'co', x: 190, y: 110, w: 170, h: 60, t: 'Coordinator', s: 'drives the commit' },
          { id: 'lg', x: 190, y: 250, w: 170, h: 60, t: 'Coordinator log', s: 'durable decision' },
          { id: 'sa', x: 440, y: 20, w: 190, h: 60, t: 'Shard A', s: 'alice: 100' },
          { id: 'sb', x: 440, y: 250, w: 190, h: 60, t: 'Shard B', s: 'bob: 50' }
        ],
        edges: [
          { id: 'e1', a: 'cl', b: 'co', label: 'transfer' },
          { id: 'e2', a: 'co', b: 'sa', label: 'debit' },
          { id: 'e3', a: 'co', b: 'sb', label: 'credit' },
          { id: 'e4', a: 'co', b: 'lg', label: 'decision' }
        ]
      },
      bug: [
        { log: 'Start: alice has 100 on shard A and bob has 50 on shard B. The transfer moves 30 (illustrative).', code: 0, hl: { nodes: { cl: 'on', co: 'on' }, edges: { e1: 'on' } }, stats: [{ l: 'applied total', v: '150', cls: 'ok' }] },
        { log: 'Write 1: the coordinator commits the debit on shard A. Alice now has 70.', code: 1, hl: { nodes: { sa: 'on' }, edges: { e2: 'on' } }, stats: [{ l: 'alice', v: '70' }, { l: 'bob', v: '50' }] },
        { log: 'The coordinator crashes after write 1 and before write 2. Nothing retries it.', code: 2, hl: { nodes: { co: 'bad' }, edges: { e3: 'dim' } }, stats: [{ l: 'coordinator', v: 'down', cls: 'bad' }] },
        { log: 'Shard B never receives the credit. Write 1 is committed, and nothing undoes it.', code: 4, hl: { nodes: { sb: 'warn', sa: 'bad' } }, stats: [{ l: 'applied total', v: '120', cls: 'bad' }, { l: 'missing', v: '30', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Prepare on A: shard A checks the debit, writes it to its log, and holds alice\'s row lock. Vote: OK.', code: 3, hl: { nodes: { sa: 'warn' }, edges: { e2: 'on' } }, stats: [{ l: 'rows locked', v: '1', cls: 'warn' }, { l: 'applied total', v: '150', cls: 'ok' }] },
        { log: 'Prepare on B: shard B holds bob\'s lock and records the credit. Vote: OK.', code: 7, hl: { nodes: { sb: 'warn' }, edges: { e3: 'on' } }, stats: [{ l: 'rows locked', v: '2', cls: 'warn' }] },
        { log: 'The coordinator writes its decision, COMMIT, to its own durable log.', code: 8, hl: { nodes: { lg: 'new' }, edges: { e4: 'on' } }, stats: [{ l: 'decision', v: 'COMMIT (on disk)', cls: 'ok' }] },
        { log: 'The coordinator crashes before it sends COMMIT. Shards A and B hold their locks and are in doubt, but no money is missing.', code: 8, hl: { nodes: { co: 'bad', sa: 'warn', sb: 'warn' } }, stats: [{ l: 'rows locked', v: '2', cls: 'warn' }, { l: 'missing', v: '0', cls: 'ok' }] },
        { log: 'The coordinator restarts, reads COMMIT from its log, and runs COMMIT PREPARED on A and B. Alice has 70 and bob has 80.', code: 9, hl: { nodes: { co: 'ok', lg: 'ok', sa: 'ok', sb: 'ok' }, edges: { e2: 'ok', e3: 'ok' } }, stats: [{ l: 'applied total', v: '150', cls: 'ok' }, { l: 'rows locked', v: '0', cls: 'ok' }] }
      ]
    },
    {
      id: 'hot',
      label: 'Hot shard',
      desc: 'Routing by hash(tenant_id) over 4 shards when one tenant, acme, sends 70% of 200 requests (illustrative).',
      codeLabel: 'Config',
      code: {
        bug: [
          'shard = hash(tenant_id) % 4',
          "-- tenant 'acme' sends 70% of requests",
          'shard-2  requests=high  p99 latency rising',
          'shard-0  requests=low   cpu idle'
        ],
        fix: [
          'shard = hash(tenant_id) % 4          -- every other tenant',
          "shard = bucket (0 to 3)              -- tenant 'acme', bucket per request",
          'reads for acme fan out to the 4 buckets'
        ]
      },
      diagram: {
        w: 640, h: 310,
        nodes: [
          { id: 'rt', x: 10, y: 125, w: 170, h: 60, t: 'Router', s: 'hash(tenant_id) % 4' },
          { id: 's0', x: 280, y: 20, w: 160, h: 60, t: 'shard-0', s: 'small tenants' },
          { id: 's1', x: 470, y: 20, w: 160, h: 60, t: 'shard-1', s: 'small tenants' },
          { id: 's2', x: 280, y: 240, w: 160, h: 60, t: 'shard-2', s: 'acme lands here' },
          { id: 's3', x: 470, y: 240, w: 160, h: 60, t: 'shard-3', s: 'small tenants' }
        ],
        edges: [
          { id: 'r0', a: 'rt', b: 's0', label: 'route' },
          { id: 'r1', a: 'rt', b: 's1', label: 'route' },
          { id: 'r2', a: 'rt', b: 's2', label: 'acme' },
          { id: 'r3', a: 'rt', b: 's3', label: 'route' }
        ]
      },
      bug: [
        { log: 'Requests arrive. Seven in ten belong to the tenant acme (illustrative).', code: 1, hl: { nodes: { rt: 'on' } }, stats: [{ l: 'requests', v: '0' }] },
        { log: 'The router hashes tenant_id. Every request for acme has the same key, so it goes to the same shard.', code: 0, hl: { nodes: { rt: 'on', s2: 'warn' }, edges: { r2: 'on' } }, stats: [{ l: 'requests', v: '40' }, { l: 'busiest shard', v: '80%', cls: 'warn' }] },
        { log: 'After 200 requests, shard-2 has 160, shard-1 and shard-3 have 20 each, and shard-0 has none.', code: 2, hl: { nodes: { s2: 'bad', s0: 'dim' }, edges: { r2: 'bad', r0: 'dim' } }, stats: [{ l: 'requests', v: '200' }, { l: 'busiest shard', v: '80%', cls: 'bad' }] },
        { log: 'Shard-2 sees p99 latency rise while shard-0 is idle. More shards would not help, because one key cannot be spread.', code: 3, hl: { nodes: { s2: 'bad', s0: 'dim' } }, stats: [{ l: 'idle shards', v: '1 of 4', cls: 'warn' }] }
      ],
      fix: [
        { log: 'Acme gets a bucket from 0 to 3 for each request, so its requests spread over 4 shards. Other tenants still route by hash.', code: 1, hl: { nodes: { rt: 'new' }, edges: { r0: 'on', r1: 'on', r2: 'on', r3: 'on' } }, stats: [{ l: 'acme buckets', v: '4', cls: 'ok' }] },
        { log: 'After 200 requests, the shards hold 40, 50, 60 and 50.', code: 0, hl: { nodes: { s0: 'ok', s1: 'ok', s2: 'ok', s3: 'ok' } }, stats: [{ l: 'busiest shard', v: '30%', cls: 'ok' }] },
        { log: 'Reads for acme now fan out to its 4 buckets, which is the cost of the split.', code: 2, hl: { edges: { r0: 'ok', r1: 'ok', r2: 'ok', r3: 'ok' } }, stats: [{ l: 'acme read fan-out', v: '4 shards', cls: 'warn' }] }
      ]
    },
    {
      id: 'fence',
      label: 'Shard move',
      desc: 'Shard 7 moves from node 1 to node 2 while a client with stale routing keeps writing, first without fencing, then with an epoch.',
      codeLabel: 'Command',
      code: {
        bug: [
          'copy shard=7 from snapshot at log position 100',
          'w1, w2, w3 applied on node-1 and copied to node-2',
          'routing: shard 7 -> node-2   # copy stops at log position 103',
          'node-1 shard=7 epoch=1 accepted write w4 (routing stale)'
        ],
        fix: [
          'copy shard=7 from snapshot at log position 100',
          'routing: shard 7 -> node-2; epoch for shard 7 becomes 2',
          'node-1 rejects writes that carry epoch=1',
          'client refreshes routing, retries w4 on node-2 with the same request id'
        ]
      },
      diagram: {
        w: 640, h: 320,
        nodes: [
          { id: 'cl', x: 10, y: 130, w: 140, h: 60, t: 'Stale client', s: 'cached routing' },
          { id: 'rt', x: 230, y: 20, w: 170, h: 60, t: 'Routing table', s: 'shard 7 -> owner' },
          { id: 'n1', x: 230, y: 250, w: 170, h: 60, t: 'Node 1', s: 'old owner, epoch 1' },
          { id: 'n2', x: 470, y: 130, w: 160, h: 60, t: 'Node 2', s: 'new owner, epoch 2' }
        ],
        edges: [
          { id: 'lk', a: 'cl', b: 'rt', label: 'lookup' },
          { id: 'wr', a: 'cl', b: 'n1', label: 'write (stale)' },
          { id: 'cp', a: 'n1', b: 'n2', label: 'log copy' },
          { id: 'rr', a: 'rt', b: 'n2', label: 'new owner' }
        ]
      },
      bug: [
        { log: 'Shard 7 lives on node 1. A copy to node 2 starts from the snapshot at log position 100.', code: 0, hl: { nodes: { n1: 'on', n2: 'new' }, edges: { cp: 'on' } }, stats: [{ l: 'on node 2', v: '0 of 6' }] },
        { log: 'Writes w1, w2 and w3 arrive before the cut-over. Node 1 applies them, and the copy follows the log to node 2.', code: 1, hl: { nodes: { n1: 'on', n2: 'on' }, edges: { wr: 'on', cp: 'on' } }, stats: [{ l: 'on node 2', v: '3 of 6' }] },
        { log: 'Cut-over: the routing table now says shard 7 is on node 2. The copy stops at log position 103.', code: 2, hl: { nodes: { rt: 'on' }, edges: { rr: 'on', cp: 'dim' } }, stats: [{ l: 'copy', v: 'stopped at 103', cls: 'warn' }] },
        { log: 'w4 and w5 come from a client with a stale cache. Node 1 still accepts them, but nothing copies them to node 2.', code: 3, hl: { nodes: { cl: 'warn', n1: 'bad' }, edges: { wr: 'bad', cp: 'dim' } }, stats: [{ l: 'lost', v: '2', cls: 'bad' }] },
        { log: 'w6 arrives after the client refreshes and goes to node 2. Two acknowledged writes are gone.', code: 3, hl: { nodes: { n2: 'warn' } }, stats: [{ l: 'on node 2', v: '4 of 6', cls: 'bad' }, { l: 'lost', v: '2', cls: 'bad' }] }
      ],
      fix: [
        { log: 'At the cut-over, the epoch for shard 7 is bumped from 1 to 2. Node 1 now rejects any write that carries epoch 1.', code: 1, hl: { nodes: { rt: 'new', n1: 'warn' }, edges: { rr: 'on' } }, stats: [{ l: 'epoch', v: '2', cls: 'ok' }] },
        { log: 'w4 and w5 come from the stale client. Node 1 rejects them.', code: 2, hl: { nodes: { cl: 'warn', n1: 'ok' }, edges: { wr: 'bad' } }, stats: [{ l: 'rejected', v: '2', cls: 'warn' }, { l: 'lost', v: '0', cls: 'ok' }] },
        { log: 'The client refreshes its routing and retries on node 2 with the same request id, so each write applies once.', code: 3, hl: { nodes: { cl: 'ok', n2: 'ok' }, edges: { lk: 'on', rr: 'ok' } }, stats: [{ l: 'retried', v: '2', cls: 'ok' }] },
        { log: 'w6 arrives after the refresh and goes to node 2. Every acknowledged write is there.', code: 3, hl: { nodes: { n2: 'ok' } }, stats: [{ l: 'on node 2', v: '6 of 6', cls: 'ok' }, { l: 'lost', v: '0', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Cloud Data Warehouses',
  problem: `Forty analytics teams moved from their own fixed clusters, idle most of the day, to one shared cloud warehouse over a 10 TB events table (illustrative). At the 09:00 dashboard refresh, every dashboard is slow and some wait in a queue. Worker metrics show the same 100 GB table read from remote storage on every query, and one ad hoc query for last week billed the whole table.`,
  predict: {
    q: `The same 100 GB table is queried four times in a row. Each worker has a local disk cache, but files are given to workers without regard to which worker read them before. How much is read from remote storage in total?`,
    opts: [
      `100 GB, because the first query warms the cache for the other three`,
      `About 400 GB, because each query lands on workers that do not hold the files`,
      `0 GB, because the warehouse keeps the whole table on its workers`
    ],
    ans: 1,
    why: `A cache only helps the worker that holds the file. If files land on random workers, every query misses and reads all 100 GB from storage again, which is what the worker metrics in the incident show.`
  },
  explain: `<h3>The idea</h3>
<p>A cloud warehouse keeps durable storage, elastic compute and query coordination apart. <b>Disaggregation</b> means the data lives in a distributed file system or object store, and compute is a pool of workers that can be added or removed. Dremel (BigQuery), Snowflake, Redshift and Yellowbrick all separate the two, though the details differ.</p>
<h3>How it works, step by step</h3>
<p>A coordinator (Dremel's root coordinator, Snowflake's cloud services) reads the metadata once and builds a plan of stages. Zone maps prune files that cannot match before any data is read. A scheduler gives each worker its tasks. Workers read only the column chunks they need.</p>
<p>Between stages, a <b>shuffle</b> sends each row to the next stage by hash partition. Dremel keeps shuffle output in memory on shuffle nodes and spills to disk only when needed. Tasks are deterministic and idempotent, so a failed task can restart. A slow task (a straggler) gets a redundant copy, or, in Snowflake, an early worker steals its work.</p>
<p>Snowflake, Yellowbrick and Redshift keep a <b>local cache</b> on each worker and use consistent hashing (Yellowbrick uses rendezvous hashing) so the same file goes to the same worker and the cache is hit again. <b>Workload management</b> shares a fixed number of execution slots across queries. Extra queries wait in a queue.</p>
<h3>The trade-off</h3>
<p>Elastic compute over shared storage removes the cluster per team, but every byte not in a worker cache crosses the network. A shuffle is only as fast as its biggest partition. Slots are finite, so a burst queues. And a scan with no filter on the partition column reads, and bills, the whole table.</p>`,
  diagnose: [
    {
      t: 'Cold workers refetch data',
      sym: 'The same table is read from remote storage on every query, even though the last query read it.',
      ctx: 'Repeated dashboard queries are no faster than the first run. Remote read bytes stay flat per query and the cache hit rate is near zero.',
      why: 'When workers are picked without regard to the data, a file is read by a worker that has no copy of it, and the cache never helps.',
      log: `representative worker metrics, per query
query_id=q2 cache_hit_bytes=0 remote_read_bytes=100 GB
query_id=q3 cache_hit_bytes=0 remote_read_bytes=100 GB`,
      fix: [
        'Measure first: compare cache_hit_bytes and remote_read_bytes for repeated queries on the same table.',
        'Map each file to a worker with consistent hashing, so later queries on the same file go to the same worker.',
        'Keep the cache warm on each worker, and size it for the hot part of the table.',
        'Pin files that many queries need, so they are not evicted by a one-off scan.',
        'Verify: count remote GB read over four identical queries. Here it moves from 400 GB to 100 GB (illustrative).'
      ]
    },
    {
      t: 'Skew in a shuffle',
      sym: 'The query finishes when one partition finishes, and most workers sit idle while it runs.',
      ctx: 'One stage shows a median task time of a few seconds and a maximum ten times longer. Adding workers does not shorten it.',
      why: 'A shuffle hashes rows by a key. If one key holds most rows, every row of that key lands in one partition, and that partition sets the finish time.',
      log: `representative stage timing
stage 2  tasks=8  p50=4.6 s  max=48 s  partition 0 rows=480
stage 2  tasks=8  p50=4.6 s  max=10 s  after split`,
      fix: [
        'Measure first: compare the slowest task (max) with the median (p50) of the stage, and check the row count of the slowest partition.',
        'Detect the hot key from statistics or from the first stage, and split its rows across several partitions.',
        'Repartition at run time when a partition gets too full, and give the work to idle workers.',
        'Use a broadcast join when the small side fits in memory, so no shuffle is needed.',
        'Verify: compare the slowest partition with the median. Here the query ends at 48 s and 10 s (illustrative).'
      ]
    },
    {
      t: 'Too many queries for the slots',
      sym: 'Every dashboard query slows down during peak hours, and a few wait for a long time.',
      ctx: 'Run time per query is normal, but wall-clock time is high. The queue is long at the top of each hour.',
      why: 'Queries share a fixed pool of slots. When more queries arrive than there are slots, the extras queue, and each waits behind the ones before it.',
      log: `representative queue metrics, one warehouse
queued_queries=8 running_queries=2 max_concurrency=2
queue_wait_p95=high`,
      fix: [
        'Measure first: compare queued_queries with running_queries and max_concurrency at peak, and watch queue_wait_p95.',
        'Add slots: scale out to a second warehouse or cluster for this workload.',
        'Set a per-group concurrency limit, so one team cannot take every slot.',
        'Give short interactive queries a separate queue from long batch jobs.',
        'Verify: count how many ticks the slowest query waits. Here it moves from 5 to 3 ticks (illustrative).'
      ]
    },
    {
      t: 'Unbounded scans',
      sym: 'A query for one week reads the whole multi-terabyte table, and the bill grows with it.',
      ctx: 'One ad hoc query dominates the daily cost report. Its bytes scanned equal the table size.',
      why: 'Without a filter that matches the partitioning, the engine has no reason to skip anything. Storage is read in full, and so is the price.',
      log: `representative query stats
bytes_billed=10000 GB  partitions_scanned=365 of 365
(billing units differ by vendor; this is illustrative)`,
      fix: [
        'Measure first: check bytes_billed and partitions_scanned for the query against the size of the window it asks for.',
        'Filter on the partition column, such as the event day, so the engine can skip partitions.',
        'Cluster the table on the columns that queries filter, so zone maps can prune micropartitions or row groups.',
        'Set a cost or byte limit for ad hoc queries, so a missing filter fails fast.',
        'Verify: compare bytes scanned before and after the change. Here it moves from 10000 GB to 191.8 GB.'
      ]
    }
  ],
  source: { label: 'Original: Cloud Data Warehouses', href: '01-database-systems-end-to-end.html#ch14' },
  scenarios: [
    {
      id: 'cache',
      label: 'Worker cache',
      desc: 'Four identical queries over one 100 GB table on workers with local caches, first with any free worker, then with consistent hashing (illustrative).',
      codeLabel: 'Config',
      code: {
        bug: [
          '# file -> worker assignment',
          'worker = any free worker in the pool   # no regard to the data',
          'q1..q4: the same query over the same 100 GB table',
          'query_id=q2 cache_hit_bytes=0 remote_read_bytes=100 GB'
        ],
        fix: [
          '# file -> worker assignment',
          'worker = consistent_hash(file)   # same file, same worker',
          'q1: cache miss, read from object storage, keep in the worker cache',
          'q2..q4: cache hit on the worker that already holds the file'
        ]
      },
      diagram: {
        w: 640, h: 310,
        nodes: [
          { id: 'cs', x: 10, y: 125, w: 160, h: 60, t: 'Cloud services', s: 'plans, assigns files' },
          { id: 'w1', x: 240, y: 20, w: 170, h: 60, t: 'Worker 1', s: 'local disk cache' },
          { id: 'w2', x: 240, y: 240, w: 170, h: 60, t: 'Worker 2', s: 'local disk cache' },
          { id: 'os', x: 480, y: 125, w: 150, h: 60, t: 'Object storage', s: 'micropartitions' }
        ],
        edges: [
          { id: 'a1', a: 'cs', b: 'w1', label: 'files' },
          { id: 'a2', a: 'cs', b: 'w2', label: 'files' },
          { id: 'm1', a: 'w1', b: 'os', label: 'miss' },
          { id: 'm2', a: 'w2', b: 'os', label: 'miss' }
        ]
      },
      bug: [
        { log: 'Query 1: the caches are empty. The files go to worker 1, which reads 100 GB from object storage and keeps it.', code: 2, hl: { nodes: { cs: 'on', w1: 'on', os: 'on' }, edges: { a1: 'on', m1: 'on' } }, stats: [{ l: 'remote GB read', v: '100' }, { l: 'cache hit share', v: '0%' }] },
        { log: 'Query 2: the same files go to worker 2, which does not hold them. Every byte comes from storage again.', code: 1, hl: { nodes: { w2: 'bad', os: 'on' }, edges: { a2: 'on', m2: 'bad' } }, stats: [{ l: 'remote GB read', v: '200', cls: 'warn' }, { l: 'cache hit share', v: '0%', cls: 'bad' }] },
        { log: 'Query 3: the files again land on a worker without a copy. Worker 1\'s cache sits unused.', code: 3, hl: { nodes: { w1: 'dim', w2: 'bad' }, edges: { m2: 'bad' } }, stats: [{ l: 'remote GB read', v: '300', cls: 'bad' }] },
        { log: 'Query 4: one more full read. Four queries read the table four times.', code: 3, hl: { nodes: { os: 'bad' } }, stats: [{ l: 'remote GB read', v: '400', cls: 'bad' }, { l: 'cache hit share', v: '0%', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Query 1: consistent hashing maps the files to worker 1. The cache is empty, so it reads 100 GB from storage and keeps it.', code: 2, hl: { nodes: { w1: 'on', os: 'on' }, edges: { a1: 'on', m1: 'on' } }, stats: [{ l: 'remote GB read', v: '100' }] },
        { log: 'Query 2: the same files hash to worker 1 again. The read is a cache hit.', code: 3, hl: { nodes: { w1: 'ok', w2: 'dim' }, edges: { a1: 'ok' } }, stats: [{ l: 'remote GB read', v: '100', cls: 'ok' }, { l: 'cache hit share', v: '50%', cls: 'ok' }] },
        { log: 'Queries 3 and 4 hit the cache too. Storage is read once in total.', code: 3, hl: { nodes: { w1: 'ok', os: 'dim' }, edges: { a1: 'ok', m1: 'dim' } }, stats: [{ l: 'remote GB read', v: '100', cls: 'ok' }, { l: 'cache hit share', v: '75%', cls: 'ok' }] }
      ]
    },
    {
      id: 'skew',
      label: 'Shuffle skew',
      desc: 'An aggregate shuffles 800 rows into 8 partitions when one key holds 60% of the rows; each worker does 10 rows per second (illustrative).',
      codeLabel: 'Query',
      code: {
        bug: [
          'SELECT user_id, count(*)',
          'FROM events',
          'GROUP BY user_id;   -- one user_id holds 60% of the rows',
          'stage 2  tasks=8  p50=4.6 s  max=48 s  partition 0 rows=480'
        ],
        fix: [
          '-- the hot key is detected from statistics or from stage 1',
          '-- its rows are split across several partitions',
          '-- the final aggregate combines the split parts',
          'stage 2  tasks=8  p50=4.6 s  max=10 s  after split'
        ]
      },
      diagram: {
        w: 640, h: 310,
        nodes: [
          { id: 's1', x: 10, y: 125, w: 150, h: 60, t: 'Stage 1 workers', s: 'scan, partial agg' },
          { id: 'sh', x: 220, y: 125, w: 150, h: 60, t: 'Shuffle', s: 'hash by key' },
          { id: 'p0', x: 430, y: 20, w: 200, h: 60, t: 'Partition 0', s: 'hot key rows' },
          { id: 'pr', x: 430, y: 240, w: 200, h: 60, t: 'Partitions 1-7', s: 'other keys' }
        ],
        edges: [
          { id: 'x1', a: 's1', b: 'sh', label: 'rows' },
          { id: 'x2', a: 'sh', b: 'p0', label: 'hot key' },
          { id: 'x3', a: 'sh', b: 'pr', label: 'other keys' }
        ]
      },
      bug: [
        { log: 'Stage 1 sends 800 rows to the shuffle. One key holds 60% of them (illustrative).', code: 2, hl: { nodes: { s1: 'on', sh: 'on' }, edges: { x1: 'on' } }, stats: [{ l: 'rows', v: '800' }, { l: 'partitions', v: '8' }] },
        { log: 'The shuffle hashes by key. All 480 rows of the hot key land in partition 0. The other 7 partitions get 45 or 46 rows each.', code: 2, hl: { nodes: { p0: 'warn', pr: 'on' }, edges: { x2: 'bad', x3: 'on' } }, stats: [{ l: 'partition 0 rows', v: '480', cls: 'bad' }] },
        { log: 'Partitions 1 to 7 finish at about 4.6 s. Their workers then sit idle.', code: 3, hl: { nodes: { pr: 'dim', p0: 'warn' } }, stats: [{ l: 'partitions finished', v: '7 of 8', cls: 'warn' }] },
        { log: 'Partition 0 finishes at 48 s. The query ends only then.', code: 3, hl: { nodes: { p0: 'bad' } }, stats: [{ l: 'query done at', v: '48 s', cls: 'bad' }, { l: 'p50 task', v: '4.6 s' }] }
      ],
      fix: [
        { log: 'The hot key is detected, and its rows are split across several partitions.', code: 1, hl: { nodes: { sh: 'new' }, edges: { x2: 'on', x3: 'on' } }, stats: [{ l: 'rows per partition', v: '100', cls: 'ok' }] },
        { log: 'Every partition has 100 rows and finishes at 10 s.', code: 3, hl: { nodes: { p0: 'ok', pr: 'ok' }, edges: { x2: 'ok', x3: 'ok' } }, stats: [{ l: 'query done at', v: '10 s', cls: 'ok' }] }
      ]
    },
    {
      id: 'slots',
      label: 'Slot queue',
      desc: 'Ten dashboard queries arrive at once; each takes one tick of work and queries are admitted in order (illustrative).',
      codeLabel: 'Config',
      code: {
        bug: [
          '# representative warehouse setting',
          'max_concurrency=2',
          'queued_queries=8 running_queries=2 max_concurrency=2'
        ],
        fix: [
          '# representative: scale out or raise slots for this workload',
          'max_concurrency=4',
          'short interactive queries use their own queue'
        ]
      },
      diagram: {
        w: 640, h: 310,
        nodes: [
          { id: 'dq', x: 10, y: 125, w: 150, h: 60, t: 'Dashboards', s: '10 queries at once' },
          { id: 'qu', x: 240, y: 125, w: 150, h: 60, t: 'Queue', s: 'first in, first out' },
          { id: 'sl', x: 470, y: 20, w: 160, h: 60, t: 'Slots', s: 'max_concurrency' },
          { id: 'wk', x: 470, y: 240, w: 160, h: 60, t: 'Workers', s: 'run the scans' }
        ],
        edges: [
          { id: 'q1', a: 'dq', b: 'qu', label: 'submit' },
          { id: 'q2', a: 'qu', b: 'sl', label: 'admit' },
          { id: 'q3', a: 'sl', b: 'wk', label: 'run' }
        ]
      },
      bug: [
        { log: 'All 10 dashboard queries arrive at once. With 2 slots, 2 start and 8 wait.', code: 2, hl: { nodes: { dq: 'on', qu: 'warn', sl: 'on' }, edges: { q1: 'on', q2: 'on' } }, stats: [{ l: 'running', v: '2' }, { l: 'queued', v: '8', cls: 'warn' }] },
        { log: 'Tick 1: 2 queries have finished. The next 2 start, and 6 still wait.', code: 1, hl: { nodes: { qu: 'warn', wk: 'on' }, edges: { q3: 'on' } }, stats: [{ l: 'done', v: '2' }, { l: 'queued', v: '6', cls: 'warn' }] },
        { log: 'Tick 3: 6 queries have finished, and 2 still wait.', code: 1, hl: { nodes: { qu: 'warn' } }, stats: [{ l: 'done', v: '6' }, { l: 'queued', v: '2', cls: 'warn' }] },
        { log: 'Tick 5: the last query ends. It did one tick of work and waited four.', code: 1, hl: { nodes: { dq: 'bad' } }, stats: [{ l: 'slowest query ends at tick', v: '5', cls: 'bad' }] }
      ],
      fix: [
        { log: 'With 4 slots, 4 queries start at once and 6 wait.', code: 1, hl: { nodes: { sl: 'new', qu: 'warn' }, edges: { q2: 'on' } }, stats: [{ l: 'running', v: '4' }, { l: 'queued', v: '6', cls: 'warn' }] },
        { log: 'Tick 1: 4 have finished, 4 run, 2 wait. Tick 2: 8 have finished and the queue is empty.', code: 1, hl: { nodes: { qu: 'ok', wk: 'on' }, edges: { q3: 'on' } }, stats: [{ l: 'done', v: '8' }, { l: 'queued', v: '0', cls: 'ok' }] },
        { log: 'Tick 3: the last query ends, two ticks earlier than with 2 slots.', code: 1, hl: { nodes: { dq: 'ok' } }, stats: [{ l: 'slowest query ends at tick', v: '3', cls: 'ok' }] }
      ]
    }
  ]
},
{
  title: 'Lakehouse and Embedded Analytics',
  problem: `A streaming job commits to a lakehouse table on object storage every minute. After a few months, every read of the table is slower, and query planning takes 10 s although the data has barely grown (illustrative). The same week, another team moves the DuckDB analytics from its laptop app into a shared web service, and 4 of 5 concurrent writes fail with a lock error.`,
  predict: {
    q: `The lakehouse table has 1,005 commits in its transaction log and no checkpoint. How does a reader find the data files that make up the current table?`,
    opts: [
      `It lists the object store directory and reads every Parquet file it finds`,
      `It replays all 1,005 commit files, because the table state is the replay of the log`,
      `It reads only the newest commit file, which holds the whole table state`,
      `It asks the Spark driver, which keeps the table state in memory`
    ],
    ans: 1,
    why: `Each commit lists only the files it added and removed, so the current state is the replay of every commit. Listing the directory would also return files that later commits removed.`
  },
  explain: `<h3>The idea</h3>
<p>Place the analytical engine and the transaction boundary where the data and the users need them. A <b>lakehouse</b> keeps immutable data files (usually Parquet) in an object store, plus a <b>transaction log</b> that says which files make up each version of the table. An <b>embedded engine</b> such as DuckDB runs as a library inside the application process, with no server and no network hop.</p>
<h3>How it works, step by step</h3>
<p>A lakehouse write is a <b>snapshot commit</b>. Executors write new Parquet files first. No reader can see them yet. The Spark driver then writes the next numbered JSON commit file in <code>_delta_log</code>, listing the files added and removed. The write succeeds only if that version number is free, so two writers cannot both claim it. Readers see the old version or the new one, never a half-written state.</p>
<p>A reader rebuilds the table by replaying the log. A <b>checkpoint</b> is a Parquet summary of the table state at one version, and <code>_last_checkpoint</code> points to the newest one. The default interval in Delta Lake is every 10 commits, so a reader replays only the commits after it. Time travel replays the log up to an older version, which works while the old files are still kept. Compaction rewrites small files into larger ones, and vacuum removes files no retained version needs.</p>
<p>DuckDB keeps a database in a single file, split into PAX row groups of 120k tuples. A multi-threaded, push-based vectorized engine reads them inside the process. It can also read Parquet, Arrow and JSON files, and files on HTTP or S3, through extensions.</p>
<h3>The trade-off</h3>
<p>The lakehouse serves many writers and readers, but every commit adds log entries and often small files, so it needs maintenance. The embedded engine has no coordination cost, but the working set must fit in memory or spill to disk, and one process at a time holds the database file open for writing (representative; the course notes do not state this lock rule). Many users need a server or a lakehouse instead.</p>`,
  diagnose: [
    {
      t: 'Thousands of small files',
      sym: 'The query plan takes longer each week, even though the data has not grown. Most of the time goes to opening files.',
      ctx: 'Planning time climbs steadily while execution time is flat. The table\'s average file size keeps shrinking.',
      why: 'Every commit writes a few small files. Planning and each scan open every file, and small files make the per-file cost dominate. The data is the same size, but there are many more files to open.',
      log: `representative table health metrics
files=1000 avg_file_size=0.5 MB
planning_time=10 s (planning, not execution)`,
      fix: [
        'Measure first: track the file count, avg_file_size and planning_time for the table over time.',
        'Compact small files on a schedule (OPTIMIZE-style rewrites into larger files).',
        'Write fewer, larger files per commit: batch small writes instead of committing each row.',
        'Keep per-file statistics, so pruning can skip files without opening them.',
        'Verify: count the files that a query has to open before and after compaction. Here it moves from 1000 to 10 files (illustrative).'
      ]
    },
    {
      t: 'Log and catalog metadata grow',
      sym: 'Every read of the table is slower than last month, and the log and the file catalog keep growing.',
      ctx: 'Even small queries on the table pay a fixed delay before the first file is read. The log directory holds thousands of commit files.',
      why: 'The table state is the replay of the log. Without checkpoints, every reader replays every commit, so the cost of a read grows with the number of commits. The catalog of file entries grows with each commit too, and old files pile up unless old commits and files are cleaned up.',
      log: `representative log directory listing
_delta_log/00000000000000001000.json
_delta_log/_last_checkpoint  (missing or stale)
file catalog: 1000 file entries listed for one table (representative)`,
      fix: [
        'Measure first: list _delta_log and check whether _last_checkpoint exists and how many commits follow it.',
        'Write a checkpoint every 10 commits (the default for Delta Lake), so a reader replays only the commits after it.',
        'Expire old log entries after the retention window (30 days by default for Delta Lake, per the Delta Lake documentation checked on the web, not the course notes), once a checkpoint covers them.',
        'Vacuum old data files that no retained version still needs. Time travel only works within the retention window.',
        'Verify: count the commit files a read replays before and after checkpointing. Here it moves from 1005 to 5 files (illustrative).'
      ]
    },
    {
      t: 'Embedded workload exceeds RAM',
      sym: 'The process is killed with an out-of-memory error, halfway through a query over a file that was fine last week.',
      ctx: 'The app crashes on one large query, not on small ones. The input file has grown past the machine\'s RAM.',
      why: 'An embedded engine runs inside the application process, on one machine. If it keeps the whole input in memory, a dataset larger than RAM fails. A streaming scan with spilling operators can run on the same machine.',
      log: `representative process log
process exited: out of memory (embedded engine, 16 GB limit)
last operator: hash aggregate, spill=disabled`,
      fix: [
        'Measure first: watch the peak memory of the process during the failing query and note the last operator before the exit.',
        'Scan row group by row group, so only one group is in memory at a time.',
        'Turn on spilling for the blocking operators (aggregates, joins, sorts) and give the engine a disk temp directory.',
        'Move the largest tables to a lakehouse or a server when the data no longer fits on one machine.',
        'Verify: watch the peak memory of the process during the same query. Here it moves from 40 GB (out of memory at chunk 1) to 0.012 GB (the row group size is an assumption), plus spill.'
      ]
    },
    {
      t: 'Embedded engine as a shared service',
      sym: 'Many users write to one embedded database and most of their requests fail with a lock error.',
      ctx: 'The feature worked for one developer, then failed under load in a shared deployment. Only the first writer succeeds.',
      why: 'An embedded engine is one library in one process. A database file can be open for writing by only one process at a time (representative; not stated in the course notes), so putting it behind a multi-user service without a single owner process means most requests fail.',
      log: `representative error
IO Error: Could not set lock on file "analytics.db": another process holds it (representative wording)`,
      fix: [
        'Measure first: count the writes that fail with the lock error, and list which processes open the database file.',
        'Put one service process in front of the file, and let it own the connection. Requests from many users queue inside the service.',
        'Use a lakehouse or a managed server for many concurrent writers, so the storage is not tied to one process.',
        'Keep the embedded engine for one user, such as a laptop app or a notebook.',
        'Verify: count the writes that fail with 5 concurrent clients. Here it moves from 4 failed to 0 failed (illustrative).'
      ]
    }
  ],
  source: { label: 'Original: Lakehouse and Embedded Analytics', href: '01-database-systems-end-to-end.html#ch15' },
  scenarios: [
    {
      id: 'commit',
      label: 'Commit and checkpoint',
      desc: 'A snapshot commit to a Delta table, then a read after 1,005 commits, first with no checkpoint, then with one every 10 commits (illustrative).',
      codeLabel: 'Command',
      code: {
        bug: [
          'executors write part-0001.parquet, part-0002.parquet   # not visible yet',
          'commit: add part-0001.parquet, add part-0002.parquet   # only if the version is free',
          '_delta_log/00000000000000001000.json',
          '_delta_log/_last_checkpoint  (missing or stale)',
          'read: replay every commit file to list the current files'
        ],
        fix: [
          'executors write part-0001.parquet, part-0002.parquet   # not visible yet',
          'commit: add part-0001.parquet, add part-0002.parquet   # only if the version is free',
          'every 10 commits: write a checkpoint (Parquet summary of the table state)',
          '_last_checkpoint points to the checkpoint at version 999',
          'read: start at the checkpoint, replay only the newer commits'
        ]
      },
      diagram: {
        w: 640, h: 320,
        nodes: [
          { id: 'dr', x: 10, y: 20, w: 160, h: 60, t: 'Spark driver', s: 'plans and commits' },
          { id: 'ex', x: 10, y: 250, w: 160, h: 60, t: 'Executors', s: 'write Parquet files' },
          { id: 'lg', x: 235, y: 20, w: 175, h: 60, t: 'Transaction log', s: '_delta_log JSON commits' },
          { id: 'os', x: 235, y: 250, w: 175, h: 60, t: 'Object store', s: 'immutable data files' },
          { id: 'cp', x: 470, y: 20, w: 160, h: 60, t: 'Checkpoint', s: 'Parquet summary' },
          { id: 'rd', x: 470, y: 250, w: 160, h: 60, t: 'Reader', s: 'rebuilds the table' }
        ],
        edges: [
          { id: 'wf', a: 'ex', b: 'os', label: 'new files' },
          { id: 'cm', a: 'dr', b: 'lg', label: 'commit N' },
          { id: 'ck', a: 'lg', b: 'cp', label: 'summarize' },
          { id: 'rp', a: 'rd', b: 'lg', label: 'replay' },
          { id: 'rc', a: 'rd', b: 'cp', label: 'start here' }
        ]
      },
      bug: [
        { log: 'A job writes new rows. The executors write them as new Parquet files. No reader can see them yet.', code: 0, hl: { nodes: { ex: 'on', os: 'new' }, edges: { wf: 'on' } }, stats: [{ l: 'visible to readers', v: 'no', cls: 'warn' }] },
        { log: 'The driver writes the next commit file. It succeeds only if that version number is free, and then the new files are visible.', code: 1, hl: { nodes: { dr: 'on', lg: 'on' }, edges: { cm: 'on' } }, stats: [{ l: 'visible to readers', v: 'yes', cls: 'ok' }] },
        { log: 'One commit a minute for months: the log reaches 1,005 commit files, and no checkpoint is ever written (illustrative).', code: 3, hl: { nodes: { lg: 'warn', cp: 'bad' }, edges: { ck: 'dim' } }, stats: [{ l: 'commits', v: '1005' }, { l: 'checkpoint', v: 'missing', cls: 'bad' }] },
        { log: 'A reader has no checkpoint to start from, so it replays every commit file to find the current files.', code: 4, hl: { nodes: { rd: 'bad', lg: 'bad' }, edges: { rp: 'bad' } }, stats: [{ l: 'commit files replayed per read', v: '1005', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Commits work the same way: new files first, then one commit with the next free version number.', code: 1, hl: { nodes: { dr: 'on', lg: 'on', os: 'on' }, edges: { wf: 'on', cm: 'on' } }, stats: [{ l: 'commits', v: '1005' }] },
        { log: 'Every 10 commits, a checkpoint summarises the table state. The newest covers version 999.', code: 2, hl: { nodes: { cp: 'new' }, edges: { ck: 'on' } }, stats: [{ l: 'checkpoint interval', v: '10 commits', cls: 'ok' }] },
        { log: 'The reader opens _last_checkpoint and starts from the checkpoint at version 999.', code: 3, hl: { nodes: { rd: 'on', cp: 'ok' }, edges: { rc: 'ok' } }, stats: [{ l: 'start version', v: '999', cls: 'ok' }] },
        { log: 'It replays only commits 1000 to 1004, the 5 after the checkpoint.', code: 4, hl: { nodes: { rd: 'ok', lg: 'ok' }, edges: { rp: 'ok' } }, stats: [{ l: 'commit files replayed per read', v: '5', cls: 'ok' }] }
      ]
    },
    {
      id: 'small',
      label: 'Small files',
      desc: 'Each commit writes one small file and planning opens every file at 0.01 s each, first with no compaction, then with compaction every 100 commits (illustrative).',
      codeLabel: 'Command',
      code: {
        bug: [
          '# streaming job: one commit, one small file',
          'files=1000 avg_file_size=0.5 MB',
          'planning_time=10 s (planning, not execution)'
        ],
        fix: [
          '# every 100 commits: OPTIMIZE-style rewrite of small files into one larger file',
          '# old small files stay until vacuum removes them',
          'planner opens only the live files'
        ]
      },
      diagram: {
        w: 640, h: 310,
        nodes: [
          { id: 'wr', x: 10, y: 125, w: 150, h: 60, t: 'Streaming job', s: 'one commit a minute' },
          { id: 'fs', x: 240, y: 125, w: 160, h: 60, t: 'Object store', s: 'data files' },
          { id: 'pl', x: 470, y: 20, w: 160, h: 60, t: 'Planner', s: 'opens each file' },
          { id: 'cj', x: 470, y: 240, w: 160, h: 60, t: 'Compaction', s: 'rewrites small files' }
        ],
        edges: [
          { id: 'f1', a: 'wr', b: 'fs', label: 'small file' },
          { id: 'f2', a: 'fs', b: 'pl', label: 'open' },
          { id: 'f3', a: 'cj', b: 'fs', label: 'rewrite' }
        ]
      },
      bug: [
        { log: 'Start: an empty table. Each commit writes one small file.', code: 0, hl: { nodes: { wr: 'on' }, edges: { f1: 'on' } }, stats: [{ l: 'files to open', v: '0' }] },
        { log: 'After 100 commits there are 100 small files. Planning opens each one.', code: 0, hl: { nodes: { fs: 'warn', pl: 'on' }, edges: { f2: 'on' } }, stats: [{ l: 'files to open', v: '100' }, { l: 'planning time', v: '1 s' }] },
        { log: 'After 500 commits, 500 files. The data is small, but the per-file cost now dominates.', code: 1, hl: { nodes: { fs: 'warn', pl: 'warn' } }, stats: [{ l: 'files to open', v: '500', cls: 'warn' }, { l: 'planning time', v: '5 s', cls: 'warn' }] },
        { log: 'After 1,000 commits, 1,000 files and 10 s of planning before any row is read.', code: 2, hl: { nodes: { pl: 'bad', cj: 'dim' } }, stats: [{ l: 'files to open', v: '1000', cls: 'bad' }, { l: 'planning time', v: '10 s', cls: 'bad' }] }
      ],
      fix: [
        { log: 'Every 100 commits, compaction rewrites the small files into one larger file.', code: 0, hl: { nodes: { cj: 'new', fs: 'on' }, edges: { f3: 'on' } }, stats: [{ l: 'files after 100 commits', v: '1', cls: 'ok' }] },
        { log: 'After 250 commits, 2 compacted files plus 50 new small ones remain.', code: 2, hl: { nodes: { pl: 'on' }, edges: { f2: 'on' } }, stats: [{ l: 'files to open', v: '52' }, { l: 'planning time', v: '0.5 s' }] },
        { log: 'After 1,000 commits, 10 files remain, and planning is fast again.', code: 2, hl: { nodes: { pl: 'ok', fs: 'ok' }, edges: { f2: 'ok' } }, stats: [{ l: 'files to open', v: '10', cls: 'ok' }, { l: 'planning time', v: '0.1 s', cls: 'ok' }] }
      ]
    },
    {
      id: 'embed',
      label: 'Embedded lock',
      desc: 'Five web worker processes write to one DuckDB database file, first each opening the file itself, then through one owner process (illustrative).',
      codeLabel: 'Command',
      code: {
        bug: [
          '# each web worker process opens the file itself',
          "duckdb.connect('analytics.db')   # worker 1: gets the write lock",
          "duckdb.connect('analytics.db')   # workers 2 to 5",
          'IO Error: Could not set lock on file "analytics.db": another process holds it (representative wording)'
        ],
        fix: [
          '# one service process owns the connection',
          "con = duckdb.connect('analytics.db')   # opened once",
          'workers send their writes to the service',
          'the service queues them and runs them on con, one after another'
        ]
      },
      diagram: {
        w: 640, h: 310,
        nodes: [
          { id: 'ww', x: 10, y: 125, w: 150, h: 60, t: 'Web workers', s: '5 processes' },
          { id: 'sv', x: 240, y: 20, w: 170, h: 60, t: 'Service process', s: 'owns the connection' },
          { id: 'er', x: 240, y: 240, w: 170, h: 60, t: 'Lock error', s: 'IO Error to client' },
          { id: 'db', x: 480, y: 125, w: 150, h: 60, t: 'analytics.db', s: 'one database file' }
        ],
        edges: [
          { id: 'o1', a: 'ww', b: 'db', label: 'open to write' },
          { id: 'o2', a: 'ww', b: 'sv', label: 'request' },
          { id: 'o3', a: 'sv', b: 'db', label: 'one writer' },
          { id: 'o4', a: 'ww', b: 'er', label: 'lock held' }
        ]
      },
      bug: [
        { log: 'Five clients want to write to the same database at once.', code: 0, hl: { nodes: { ww: 'on' } }, stats: [{ l: 'writes served', v: '0' }, { l: 'writes failed', v: '0' }] },
        { log: 'Client 1 opens the database file for writing and gets the lock. Its write succeeds.', code: 1, hl: { nodes: { db: 'on' }, edges: { o1: 'on' } }, stats: [{ l: 'writes served', v: '1', cls: 'ok' }] },
        { log: 'Client 2 tries to open the same file, but another process holds the write lock. The request fails.', code: 3, hl: { nodes: { er: 'bad' }, edges: { o4: 'bad' } }, stats: [{ l: 'writes failed', v: '1', cls: 'bad' }] },
        { log: 'Clients 3 to 5 fail the same way. Only the first writer got through.', code: 2, hl: { nodes: { ww: 'bad', er: 'bad' }, edges: { o4: 'bad' } }, stats: [{ l: 'writes served', v: '1' }, { l: 'writes failed', v: '4', cls: 'bad' }] }
      ],
      fix: [
        { log: 'One service process opens the file once and owns the connection.', code: 1, hl: { nodes: { sv: 'new', db: 'on' }, edges: { o3: 'on' } }, stats: [{ l: 'processes with the file open', v: '1', cls: 'ok' }] },
        { log: 'All five clients send their writes to the service. The requests queue inside it.', code: 2, hl: { nodes: { ww: 'on', sv: 'on' }, edges: { o2: 'on' } }, stats: [{ l: 'queued', v: '5' }] },
        { log: 'The service runs the writes one after another. Every write succeeds.', code: 3, hl: { nodes: { sv: 'ok', db: 'ok' }, edges: { o3: 'ok' } }, stats: [{ l: 'writes served', v: '5', cls: 'ok' }, { l: 'writes failed', v: '0', cls: 'ok' }] }
      ]
    }
  ]
}
  ]
};
