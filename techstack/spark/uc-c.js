/* Spark use cases: course content and complete animation state. */
CourseData.uc["joins"] = [
  {
    "title": "Broadcast hash join",
    "blurb": "",
    "intro": "The fact table does not move.",
    "trigger": "You join a very big table (orders) with a small one (cities) on city id.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "The \"small\" table is not small",
        "short": "The copy does not fit in memory.",
        "ctx": "A table that looked small is large after filtering, and copying it to every worker overflows memory.",
        "fix": "Spark only broadcasts below a size limit. If it still happens, raise the limit carefully or switch to a shuffled join."
      },
      {
        "t": "Some outer joins cannot broadcast",
        "short": "The kept side must not be copied.",
        "ctx": "In a left outer join, the left rows with no match must still appear, and copying the left side to every worker would produce duplicates.",
        "fix": "Broadcast the other side instead, or use a shuffled join."
      }
    ],
    "invariant": "Matching rows appear m × n times per key.",
    "kind": "fanout",
    "steps": [
      {
        "t": "One side is tiny",
        "x": "Orders has a billion rows. Cities has only 200. Moving the big table would be a waste. Moving the small one is cheap.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Collect the small table",
        "x": "The driver gathers all 200 cities into one place.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Build a lookup table",
        "x": "The driver turns them into a hash table, a lookup keyed by city id.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Send a copy to everyone",
        "x": "Every worker gets its own copy. This is called a broadcast.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Stream the big table past it",
        "x": "Each worker reads its orders one by one and looks up the city. No order moves to another machine.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Matches are counted fully",
        "x": "If a city appears twice in the small table, each order matches twice. Every match is kept, the right number of times.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "actors": [
        "Driver",
        "Small table",
        "Workers (big table)"
      ],
      "steps": [
        {
          "title": "One side is tiny",
          "text": "Orders has a billion rows. Cities has only 200. Moving the big table would be a waste. Moving the small one is cheap.",
          "m": null,
          "set": {
            "Small table": [
              "city 1 Hanoi",
              "city 2 Hue",
              "... 200 rows"
            ],
            "Workers (big table)": [
              "orders part 1",
              "orders part 2",
              "orders part 3"
            ]
          },
          "badge": {},
          "v": {
            "s": "sizes"
          }
        },
        {
          "title": "Collect the small table",
          "text": "The driver gathers all 200 cities into one place.",
          "m": [
            "Small table",
            "Driver",
            "all 200 rows"
          ],
          "set": {
            "Driver": [
              "cities: 200 rows"
            ]
          },
          "badge": {},
          "v": {
            "s": "collect"
          }
        },
        {
          "title": "Build a lookup table",
          "text": "The driver turns them into a hash table, a lookup keyed by city id.",
          "m": [
            "Driver",
            "Driver",
            "build hash table"
          ],
          "set": {
            "Driver": [
              "cities: 200 rows",
              "+lookup: id → name"
            ]
          },
          "badge": {},
          "v": {
            "s": "hash"
          }
        },
        {
          "title": "Send a copy to everyone",
          "text": "Every worker gets its own copy. This is called a broadcast.",
          "m": [
            "Driver",
            "Workers (big table)",
            "broadcast lookup"
          ],
          "set": {
            "Workers (big table)": [
              "orders part 1 + lookup",
              "orders part 2 + lookup",
              "orders part 3 + lookup"
            ]
          },
          "badge": {},
          "v": {
            "s": "copies"
          }
        },
        {
          "title": "Stream the big table past it",
          "text": "Each worker reads its orders one by one and looks up the city. No order moves to another machine.",
          "m": [
            "Workers (big table)",
            "Workers (big table)",
            "look up each order"
          ],
          "set": {
            "Workers (big table)": [
              "+order 1 → Hanoi",
              "+order 2 → Hue",
              "+order 3 → Hanoi"
            ]
          },
          "badge": {},
          "v": {
            "s": "stream"
          }
        },
        {
          "title": "Matches are counted fully",
          "text": "If a city appears twice in the small table, each order matches twice. Every match is kept, the right number of times.",
          "m": null,
          "set": {},
          "badge": {},
          "v": {
            "s": "match",
            "dup": "Hanoi appears twice in cities, so each order matches twice: both matches are kept"
          }
        }
      ],
      "kind": "fanout"
    }
  },
  {
    "title": "Shuffled join, same key meets",
    "blurb": "",
    "intro": "Both sides are exchanged by key, then joined locally.",
    "trigger": "Both tables are big, so neither can be copied to every worker.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "One hot key",
        "short": "One reducer gets far more rows.",
        "ctx": "A key such as &quot;unknown city&quot; appears in millions of rows, and all of them go to one reducer, which becomes the slowest.",
        "fix": "Let adaptive execution split the hot key into several smaller pieces. See the skewed join page."
      },
      {
        "t": "Null keys never match",
        "short": "They disappear from an inner join.",
        "ctx": "In standard SQL a missing key is not equal to anything, not even another missing key.",
        "fix": "Filter out or fill missing keys first if they should match, or use a null-safe comparison."
      }
    ],
    "invariant": "Equal keys always land in the same reducer.",
    "kind": "scatter",
    "steps": [
      {
        "t": "Both tables are spread out",
        "x": "Rows with the same key are scattered over many workers, so they cannot meet where they are.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Pick a home for each key",
        "x": "A fixed formula on the key decides the reducer. Keys 1 and 3 go to reducer 0. Keys 2 and 4 go to reducer 1. The same formula is used for both tables.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Send table A",
        "x": "Each worker sends its rows of table A to the reducer that owns the key.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Send table B the same way",
        "x": "Because the formula is the same, table B rows land in the same reducers.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Build and probe",
        "x": "Each reducer puts one side into a lookup and then looks up the other side in it. Matching rows are right next to each other.",
        "s": {
          "k": 4
        }
      }
    ],
    "scene": {
      "actors": [
        "Table A",
        "Table B",
        "Reducer 0",
        "Reducer 1"
      ],
      "steps": [
        {
          "title": "Both tables are spread out",
          "text": "Rows with the same key are scattered over many workers, so they cannot meet where they are.",
          "m": null,
          "set": {
            "Table A": [
              "key 1",
              "key 2",
              "key 3",
              "key 4"
            ],
            "Table B": [
              "key 1",
              "key 2",
              "key 3",
              "key 4"
            ]
          },
          "badge": {},
          "v": {
            "moved": {
              "A": false,
              "B": false
            }
          }
        },
        {
          "title": "Pick a home for each key",
          "text": "A fixed formula on the key decides the reducer. Keys 1 and 3 go to reducer 0. Keys 2 and 4 go to reducer 1. The same formula is used for both tables.",
          "m": null,
          "set": {},
          "badge": {},
          "v": {
            "moved": {
              "A": false,
              "B": false
            },
            "rule": true
          }
        },
        {
          "title": "Send table A",
          "text": "Each worker sends its rows of table A to the reducer that owns the key.",
          "m": [
            "Table A",
            "Reducer 0",
            "keys 1, 3"
          ],
          "set": {
            "Reducer 0": [
              "A: key 1",
              "A: key 3"
            ],
            "Reducer 1": [
              "A: key 2",
              "A: key 4"
            ]
          },
          "badge": {},
          "v": {
            "moved": {
              "A": true,
              "B": false
            },
            "rule": true
          }
        },
        {
          "title": "Send table B the same way",
          "text": "Because the formula is the same, table B rows land in the same reducers.",
          "m": [
            "Table B",
            "Reducer 1",
            "keys 2, 4"
          ],
          "set": {
            "Reducer 0": [
              "A: key 1",
              "A: key 3",
              "B: key 1",
              "B: key 3"
            ],
            "Reducer 1": [
              "A: key 2",
              "A: key 4",
              "B: key 2",
              "B: key 4"
            ]
          },
          "badge": {},
          "v": {
            "moved": {
              "A": true,
              "B": true
            },
            "rule": true
          }
        },
        {
          "title": "Build and probe",
          "text": "Each reducer puts one side into a lookup and then looks up the other side in it. Matching rows are right next to each other.",
          "m": [
            "Reducer 0",
            "Reducer 1",
            "both do the same"
          ],
          "set": {
            "Reducer 0": [
              "+match key 1",
              "+match key 3"
            ],
            "Reducer 1": [
              "+match key 2",
              "+match key 4"
            ]
          },
          "badge": {},
          "v": {
            "moved": {
              "A": true,
              "B": true
            },
            "rule": true,
            "probe": true
          }
        }
      ],
      "kind": "scatter"
    }
  },
  {
    "title": "Sort-merge join walks two sorted lists",
    "blurb": "",
    "intro": "When neither table is small, both sides are sorted by key within each partition, then walked together in one pass. Equal keys are paired as the walk meets them.",
    "trigger": "Two large tables join on a key, and neither is small enough to broadcast to every worker.",
    "run": "spark.conf.set(\"spark.sql.join.preferSortMergeJoin\", \"true\")  # true by default",
    "expect": "Both sides are sorted by key within each partition, then merged in one pass. Sorting costs time, but memory stays bounded.",
    "edges": [
      {
        "t": "One key has very many rows",
        "short": "The buffered group gets large.",
        "ctx": "A single key with millions of rows on both sides must be buffered, which can spill heavily or run out of memory.",
        "fix": "Fix the skew, for example with the skew handling in the adaptive feature, or filter the key out."
      },
      {
        "t": "Input already sorted on the key",
        "short": "The sort can be skipped.",
        "ctx": "If the data is already sorted and partitioned by the key, the sort step has nothing to do.",
        "fix": "Save the data bucketed and sorted by the join key, as in the co-partitioned stage case."
      }
    ],
    "invariant": "",
    "kind": "merge",
    "steps": [
      {
        "t": "Both sides arrive in partitions",
        "x": "After the exchange by key, the same key values sit in the same partition on both sides. The rows inside each partition are not in order yet.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Sort each side by key",
        "x": "Each partition sorts its left rows and its right rows by key. Sorting is the main cost of this join.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Walk both lists together",
        "x": "Two pointers move forward through the sorted lists. When the keys match, the matching rows are output.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Advance the smaller key",
        "x": "Here the left key 1 is smaller than the right key 2. No right row can match key 1, so the left pointer moves on.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Equal keys produce all pairs",
        "x": "Key 2 appears twice on each side, so every pair of them is output: four pairs. The pointers then move past both groups.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Memory stays bounded",
        "x": "Only the current group of equal keys has to be held in memory, so the join works on data far larger than memory. Key 4 adds its two pairs, six in total.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "merge",
      "steps": [
        {
          "title": "Both sides arrive in partitions",
          "text": "After the exchange by key, the same key values sit in the same partition on both sides. The rows inside each partition are not in order yet.",
          "v": {
            "sorted": false,
            "li": -1,
            "ri": -1,
            "out": 0
          }
        },
        {
          "title": "Sort each side by key",
          "text": "Each partition sorts its left rows and its right rows by key. Sorting is the main cost of this join.",
          "v": {
            "sorted": true,
            "li": -1,
            "ri": -1,
            "out": 0
          }
        },
        {
          "title": "Walk both lists together",
          "text": "Two pointers move forward through the sorted lists. When the keys match, the matching rows are output.",
          "v": {
            "sorted": true,
            "li": 1,
            "ri": 0,
            "out": 0,
            "match": true
          }
        },
        {
          "title": "Advance the smaller key",
          "text": "Here the left key 1 is smaller than the right key 2. No right row can match key 1, so the left pointer moves on.",
          "v": {
            "sorted": true,
            "li": 0,
            "ri": 0,
            "out": 0,
            "lt": "L"
          }
        },
        {
          "title": "Equal keys produce all pairs",
          "text": "Key 2 appears twice on each side, so every pair of them is output: four pairs. The pointers then move past both groups.",
          "v": {
            "sorted": true,
            "li": 1,
            "ri": 0,
            "out": 4,
            "group": {
              "l": [
                1,
                2
              ],
              "r": [
                0,
                1
              ]
            }
          }
        },
        {
          "title": "Memory stays bounded",
          "text": "Only the current group of equal keys has to be held in memory, so the join works on data far larger than memory. Key 4 adds its two pairs, six in total.",
          "v": {
            "sorted": true,
            "li": 3,
            "ri": 3,
            "out": 6,
            "group": {
              "l": [
                3,
                3
              ],
              "r": [
                3,
                4
              ]
            },
            "buffered": true
          }
        }
      ]
    }
  },
  {
    "title": "A join with no equal key compares every pair",
    "blurb": "",
    "intro": "A cross join, or a join on a range, has no key to split the work by. Every row of one side is compared with every row of the other, so the cost is the product of the two sizes.",
    "trigger": "A join has no equal key, only a range condition or nothing at all, such as a cross join between two lists.",
    "run": "a.crossJoin(b)  # or a.join(b, a.x < b.y); the work is the number of rows in a times the number in b",
    "expect": "Every pair must be compared, so the work grows with the product of the two sizes. Keep one side small, or add an equal key.",
    "edges": [
      {
        "t": "Accidental cross join",
        "short": "A missing join condition multiplies the rows.",
        "ctx": "A join written without an equal key, or with a condition that is always true, quietly becomes a cross join.",
        "fix": "Check the join condition, and read the plan for a cartesian or nested-loop operator."
      },
      {
        "t": "Both sides are large",
        "short": "Broadcasting is not an option.",
        "ctx": "With neither side small, no worker can hold the other side, so the full pair grid is unavoidable.",
        "fix": "Narrow both sides first with filters, or rewrite the range join as an equal key with buckets."
      }
    ],
    "invariant": "",
    "kind": "pairs",
    "steps": [
      {
        "t": "Two lists with no shared key",
        "x": "The query pairs each row of A with each row of B, or joins on a range. No equal key lets the engine split the work by key.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Compare the first row of A with all of B",
        "x": "Each row of A is compared with every row of B. The first row of A is paired with all five rows of B.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Continue down A",
        "x": "The same happens for the next rows of A. Every cell of the grid is one comparison.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "The grid is 4 by 5",
        "x": "A has 4 rows and B has 5. That is 20 comparisons, and the output can hold up to 20 rows.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Scale it up: a million by a million",
        "x": "With a million rows on each side there are a trillion pairs. Even at a billion comparisons a second, that is over 15 minutes of pure comparisons, before any real work.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Broadcast the small side, or add a key",
        "x": "If one side is small, broadcast it so each worker compares its own rows locally. Otherwise, an equal key lets the join split the work.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "pairs",
      "steps": [
        {
          "title": "Two lists with no shared key",
          "text": "The query pairs each row of A with each row of B, or joins on a range. No equal key lets the engine split the work by key.",
          "v": {
            "a": 4,
            "b": 5,
            "done": 0
          }
        },
        {
          "title": "Compare the first row of A with all of B",
          "text": "Each row of A is compared with every row of B. The first row of A is paired with all five rows of B.",
          "v": {
            "a": 4,
            "b": 5,
            "done": 5
          }
        },
        {
          "title": "Continue down A",
          "text": "The same happens for the next rows of A. Every cell of the grid is one comparison.",
          "v": {
            "a": 4,
            "b": 5,
            "done": 15
          }
        },
        {
          "title": "The grid is 4 by 5",
          "text": "A has 4 rows and B has 5. That is 20 comparisons, and the output can hold up to 20 rows.",
          "v": {
            "a": 4,
            "b": 5,
            "done": 20
          }
        },
        {
          "title": "Scale it up: a million by a million",
          "text": "With a million rows on each side there are a trillion pairs. Even at a billion comparisons a second, that is over 15 minutes of pure comparisons, before any real work.",
          "v": {
            "a": 1000000,
            "b": 1000000,
            "big": true
          }
        },
        {
          "title": "Broadcast the small side, or add a key",
          "text": "If one side is small, broadcast it so each worker compares its own rows locally. Otherwise, an equal key lets the join split the work.",
          "v": {
            "a": 4,
            "b": 5,
            "done": 20,
            "broadcast": true
          }
        }
      ]
    }
  },
  {
    "title": "Outer and anti joins keep the unmatched rows",
    "blurb": "",
    "intro": "A left join keeps every left row, with nulls where no right row matches. An anti join keeps only the unmatched left rows. A filter placed in the wrong spot can undo a left join.",
    "trigger": "A left join keeps every row of the left table, even when no right row matches it.",
    "run": "orders.join(customers, \"id\", \"left\")  # unmatched orders get nulls for the customer columns",
    "expect": "Unmatched left rows are kept with nulls on the right. An anti join keeps only those unmatched rows.",
    "edges": [
      {
        "t": "A WHERE filter on the right table",
        "short": "It silently becomes an inner join.",
        "ctx": "Rows with null right columns fail the filter, so the unmatched left rows disappear.",
        "fix": "Move the condition into the ON clause of the left join."
      },
      {
        "t": "Duplicate keys on the right",
        "short": "The left row repeats.",
        "ctx": "A left row with two matches on the right is output twice, once for each match.",
        "fix": "Deduplicate the right side on the key, if one match per left row is what you want."
      }
    ],
    "invariant": "",
    "kind": "venn",
    "steps": [
      {
        "t": "Two tables, some ids overlap",
        "x": "Orders has ids 1 to 5. Customers has ids 3 to 7. Ids 3, 4 and 5 appear in both.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "An inner join keeps the overlap",
        "x": "An inner join outputs only the matching ids: 3, 4 and 5.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "A left join keeps every left row",
        "x": "A left join keeps all of orders. Ids 1 and 2 have no customer, so their customer columns are null.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "An anti join keeps only the unmatched",
        "x": "A left anti join returns just the orders with no customer: ids 1 and 2. Its output has no customer columns at all.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "A full outer join keeps both sides",
        "x": "A full outer join keeps every row of both tables. Ids 6 and 7 appear too, with nulls on the orders side.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "A filter after a left join undoes it",
        "x": "A filter on customers placed after a left join removes the unmatched orders, which makes the result an inner join again. Put that condition inside the join instead.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "venn",
      "steps": [
        {
          "title": "Two tables, some ids overlap",
          "text": "Orders has ids 1 to 5. Customers has ids 3 to 7. Ids 3, 4 and 5 appear in both.",
          "v": {
            "mode": "sets"
          }
        },
        {
          "title": "An inner join keeps the overlap",
          "text": "An inner join outputs only the matching ids: 3, 4 and 5.",
          "v": {
            "mode": "inner",
            "result": [
              3,
              4,
              5
            ]
          }
        },
        {
          "title": "A left join keeps every left row",
          "text": "A left join keeps all of orders. Ids 1 and 2 have no customer, so their customer columns are null.",
          "v": {
            "mode": "left",
            "result": [
              1,
              2,
              3,
              4,
              5
            ]
          }
        },
        {
          "title": "An anti join keeps only the unmatched",
          "text": "A left anti join returns just the orders with no customer: ids 1 and 2. Its output has no customer columns at all.",
          "v": {
            "mode": "anti",
            "result": [
              1,
              2
            ]
          }
        },
        {
          "title": "A full outer join keeps both sides",
          "text": "A full outer join keeps every row of both tables. Ids 6 and 7 appear too, with nulls on the orders side.",
          "v": {
            "mode": "full",
            "result": [
              1,
              2,
              3,
              4,
              5,
              6,
              7
            ]
          }
        },
        {
          "title": "A filter after a left join undoes it",
          "text": "A filter on customers placed after a left join removes the unmatched orders, which makes the result an inner join again. Put that condition inside the join instead.",
          "v": {
            "mode": "filter",
            "result": [
              3,
              4,
              5
            ]
          }
        }
      ]
    }
  }
];
CourseData.uc["adaptive"] = [
  {
    "title": "Re-plan at the barrier",
    "blurb": "",
    "intro": "The map stage finished. The reduce stage has not started.",
    "trigger": "A map stage has just finished, so Spark finally knows how big each piece of data really is.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "A required number of partitions",
        "short": "Merging might break the result.",
        "ctx": "Some operators need exactly a certain number of partitions, and merging changes the meaning.",
        "fix": "Spark only merges where it is safe. A user-requested fixed count is respected."
      },
      {
        "t": "A stage that is cached",
        "short": "Statistics may be old.",
        "ctx": "If the result was cached earlier, the sizes Spark sees may no longer match reality.",
        "fix": "Spark uses the sizes it has. Re-run with fresh data, or clear the cache."
      }
    ],
    "invariant": "Layout changes never change the answer.",
    "kind": "histogram",
    "steps": [
      {
        "t": "The stage is done",
        "x": "The first stage wrote its shuffle files. Before the next stage starts, the driver collects the size of each reducer&#39;s share.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Planned guess vs real size",
        "x": "The plan had assumed five equal parts. The truth: four are tiny and one is huge.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Merge the tiny ones",
        "x": "Tiny parts next to each other are merged up to a target size. Parts 0, 1 and 2 (6 MB in total) become one task instead of three.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Spot the huge one",
        "x": "Part 3 is far above the typical size. It is flagged so that it can be split.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Start with the better layout",
        "x": "The next stage runs with the new layout: fewer tiny tasks and a plan for the big one.",
        "s": {
          "k": 4
        }
      }
    ],
    "scene": {
      "actors": [
        "Driver",
        "Map output sizes",
        "Next stage"
      ],
      "steps": [
        {
          "title": "The stage is done",
          "text": "The first stage wrote its shuffle files. Before the next stage starts, the driver collects the size of each reducer's share.",
          "m": [
            "Driver",
            "Map output sizes",
            "how big is each share?"
          ],
          "set": {
            "Map output sizes": [
              "part 0: 2 MB",
              "part 1: 3 MB",
              "part 2: 1 MB",
              "part 3: 300 MB",
              "part 4: 2 MB"
            ]
          },
          "badge": {},
          "v": {
            "real": false
          }
        },
        {
          "title": "Planned guess vs real size",
          "text": "The plan had assumed five equal parts. The truth: four are tiny and one is huge.",
          "m": null,
          "set": {},
          "badge": {},
          "v": {
            "real": true
          }
        },
        {
          "title": "Merge the tiny ones",
          "text": "Tiny parts next to each other are merged up to a target size. Parts 0, 1 and 2 (6 MB in total) become one task instead of three.",
          "m": [
            "Driver",
            "Next stage",
            "merge 0, 1, 2"
          ],
          "set": {
            "Next stage": [
              "+task A: parts 0, 1, 2  (6 MB)"
            ]
          },
          "badge": {},
          "v": {
            "real": true,
            "merged": true
          }
        },
        {
          "title": "Spot the huge one",
          "text": "Part 3 is far above the typical size. It is flagged so that it can be split.",
          "m": [
            "Driver",
            "Next stage",
            "part 3 is too big"
          ],
          "set": {
            "Next stage": [
              "task A: parts 0, 1, 2",
              "!part 3: 300 MB (too big)"
            ]
          },
          "badge": {},
          "v": {
            "real": true,
            "merged": true,
            "flag": true
          }
        },
        {
          "title": "Start with the better layout",
          "text": "The next stage runs with the new layout: fewer tiny tasks and a plan for the big one.",
          "m": [
            "Driver",
            "Next stage",
            "start"
          ],
          "set": {
            "Next stage": [
              "task A: parts 0, 1, 2",
              "part 3: split (see skewed join)",
              "task C: part 4"
            ]
          },
          "badge": {},
          "v": {
            "real": true,
            "merged": true,
            "flag": true,
            "layout": true
          }
        }
      ],
      "kind": "histogram"
    }
  },
  {
    "title": "Skewed join",
    "blurb": "",
    "intro": "Split the big side, replicate the small side. Never the reverse.",
    "trigger": "One join key is so common that one reducer gets almost all the work.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "The kept side of an outer join",
        "short": "It cannot be split.",
        "ctx": "In a left outer join, splitting the left side is fine. Splitting the preserved side would duplicate rows that have no match.",
        "fix": "Spark splits only the side it is allowed to split and leaves the other alone."
      },
      {
        "t": "The copy costs more than the skew",
        "short": "Replicating a big side is not free.",
        "ctx": "The other side is large too, and copying it to every range uses more network than it saves.",
        "fix": "Spark checks sizes first and only splits when it pays off."
      }
    ],
    "invariant": "Each match is produced once.",
    "kind": "donut",
    "steps": [
      {
        "t": "One reducer is overloaded",
        "x": "Most sales happen in one city. Its partition on the left side is 300 MB while the others are 3 MB. One reducer has to do almost everything.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Find the big partition",
        "x": "The driver compares each partition with the median and flags part 2.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Cut it into ranges",
        "x": "It splits the big partition into three smaller ranges, using the natural boundaries of the map outputs.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Copy the matching rows",
        "x": "Each range needs the matching Hanoi rows from the other side. Those rows are copied, once for each range.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Join each pair on its own",
        "x": "Now three reducers share the work, each joining one range with its copy.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Put the results together",
        "x": "The three outputs are joined end to end. Every match was produced exactly once.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "actors": [
        "Skewed side",
        "Other side",
        "Reducers"
      ],
      "steps": [
        {
          "title": "One reducer is overloaded",
          "text": "Most sales happen in one city. Its partition on the left side is 300 MB while the others are 3 MB. One reducer has to do almost everything.",
          "m": null,
          "set": {
            "Skewed side": [
              "part 0: 3 MB",
              "part 1: 3 MB",
              "!part 2: 300 MB (Hanoi)"
            ],
            "Other side": [
              "part 0",
              "part 1",
              "part 2 (Hanoi)"
            ],
            "Reducers": [
              "reducer 2 will be slow"
            ]
          },
          "badge": {},
          "v": {
            "slices": [
              3,
              3,
              300,
              3
            ]
          }
        },
        {
          "title": "Find the big partition",
          "text": "The driver compares each partition with the median and flags part 2.",
          "m": [
            "Skewed side",
            "Skewed side",
            "part 2 is far above the median"
          ],
          "set": {},
          "badge": {},
          "v": {
            "slices": [
              3,
              3,
              300,
              3
            ],
            "flag": true
          }
        },
        {
          "title": "Cut it into ranges",
          "text": "It splits the big partition into three smaller ranges, using the natural boundaries of the map outputs.",
          "m": [
            "Skewed side",
            "Skewed side",
            "split part 2"
          ],
          "set": {
            "Skewed side": [
              "part 0: 3 MB",
              "part 1: 3 MB",
              "+part 2a: 100 MB",
              "+part 2b: 100 MB",
              "+part 2c: 100 MB"
            ]
          },
          "badge": {},
          "v": {
            "slices": [
              3,
              3,
              100,
              100,
              100,
              3
            ],
            "split": true
          }
        },
        {
          "title": "Copy the matching rows",
          "text": "Each range needs the matching Hanoi rows from the other side. Those rows are copied, once for each range.",
          "m": [
            "Other side",
            "Reducers",
            "copy part 2 three times"
          ],
          "set": {
            "Other side": [
              "part 0",
              "part 1",
              "part 2 ×3"
            ]
          },
          "badge": {},
          "v": {
            "slices": [
              3,
              3,
              100,
              100,
              100,
              3
            ],
            "split": true,
            "copies": true
          }
        },
        {
          "title": "Join each pair on its own",
          "text": "Now three reducers share the work, each joining one range with its copy.",
          "m": [
            "Reducers",
            "Reducers",
            "join pairs locally"
          ],
          "set": {
            "Reducers": [
              "+reducer 2a: 100 MB",
              "+reducer 2b: 100 MB",
              "+reducer 2c: 100 MB"
            ]
          },
          "badge": {},
          "v": {
            "slices": [
              3,
              3,
              100,
              100,
              100,
              3
            ],
            "split": true,
            "copies": true,
            "reducers": true
          }
        },
        {
          "title": "Put the results together",
          "text": "The three outputs are joined end to end. Every match was produced exactly once.",
          "m": null,
          "set": {
            "Reducers": [
              "reducer 2a",
              "reducer 2b",
              "+combined result"
            ]
          },
          "badge": {},
          "v": {
            "slices": [
              3,
              3,
              100,
              100,
              100,
              3
            ],
            "split": true,
            "copies": true,
            "reducers": true,
            "done": true
          }
        }
      ],
      "kind": "donut"
    }
  },
  {
    "title": "Switch a shuffle join to broadcast at run time",
    "blurb": "",
    "intro": "The plan is chosen from estimates made before the job runs. After one side finishes its map stage, its real size is known. If it is below the broadcast threshold, the join is switched to a broadcast join.",
    "trigger": "The planner chose a shuffle join from estimates, but after one side finishes its map stage, its real size is small enough to broadcast.",
    "run": "spark.conf.set(\"spark.sql.autoBroadcastJoinThreshold\", \"10MB\")  # 10 MB is the default; adaptive execution uses it at run time",
    "expect": "When the real size of one side is under the threshold, the join becomes a broadcast join, and the other side is never shuffled.",
    "edges": [
      {
        "t": "The real size is still above the threshold",
        "short": "The shuffle join stays.",
        "ctx": "Measured size can be far above the threshold, so the switch does not happen and the planned shuffle join runs as before.",
        "fix": "Nothing to do; raise the threshold only if the memory on each worker can hold the small side."
      },
      {
        "t": "Broadcast side is too big for a worker",
        "short": "Memory pressure on each worker.",
        "ctx": "A broadcast copy lives in every worker. A threshold set too high can make many workers run short of memory.",
        "fix": "Keep the threshold near the default unless you have measured the memory headroom."
      }
    ],
    "invariant": "",
    "kind": "switch",
    "steps": [
      {
        "t": "The plan guessed wrong",
        "x": "Before the job ran, the estimate said the filtered table was 200 MB, so the planner chose a shuffle join for both sides.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "The first side runs its shuffle",
        "x": "The filtered side finishes its map stage. The engine now knows its real size: 6 MB.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Compare the real size with the threshold",
        "x": "The real size is below the broadcast threshold of 10 MB, so broadcasting this side is cheap.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Switch the join to broadcast",
        "x": "The engine rewrites the join: the small side is broadcast to every worker, and the big side is read where it is.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "The big side is never shuffled",
        "x": "Because the join is now a broadcast, the other large side is not shuffled at all. That saves a whole exchange.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "The answer is the same",
        "x": "Only the physical join changed. The rows returned are identical to what the shuffle join would have returned.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "switch",
      "steps": [
        {
          "title": "The plan guessed wrong",
          "text": "Before the job ran, the estimate said the filtered table was 200 MB, so the planner chose a shuffle join for both sides.",
          "v": {
            "est": 200,
            "real": null,
            "threshold": 10,
            "join": "shuffle"
          }
        },
        {
          "title": "The first side runs its shuffle",
          "text": "The filtered side finishes its map stage. The engine now knows its real size: 6 MB.",
          "v": {
            "est": 200,
            "real": 6,
            "threshold": 10,
            "join": "shuffle"
          }
        },
        {
          "title": "Compare the real size with the threshold",
          "text": "The real size is below the broadcast threshold of 10 MB, so broadcasting this side is cheap.",
          "v": {
            "est": 200,
            "real": 6,
            "threshold": 10,
            "join": "shuffle",
            "compare": true
          }
        },
        {
          "title": "Switch the join to broadcast",
          "text": "The engine rewrites the join: the small side is broadcast to every worker, and the big side is read where it is.",
          "v": {
            "est": 200,
            "real": 6,
            "threshold": 10,
            "join": "broadcast"
          }
        },
        {
          "title": "The big side is never shuffled",
          "text": "Because the join is now a broadcast, the other large side is not shuffled at all. That saves a whole exchange.",
          "v": {
            "est": 200,
            "real": 6,
            "threshold": 10,
            "join": "broadcast",
            "saved": true
          }
        },
        {
          "title": "The answer is the same",
          "text": "Only the physical join changed. The rows returned are identical to what the shuffle join would have returned.",
          "v": {
            "est": 200,
            "real": 6,
            "threshold": 10,
            "join": "broadcast",
            "saved": true
          }
        }
      ]
    }
  },
  {
    "title": "Read local shuffle blocks without the network",
    "blurb": "",
    "intro": "After a shuffle, some blocks sit on the executor that will read them. The adaptive local shuffle reader reads those from local disk, and only the remaining blocks use the network.",
    "trigger": "After a shuffle, some of the blocks a reducer needs are on the same executor, and they could be read without the network.",
    "run": "spark.conf.set(\"spark.sql.adaptive.localShuffleReader.enabled\", \"true\")  # true by default",
    "expect": "Blocks on the reducer own executor are read from its local disk. Only the remaining blocks use the network.",
    "edges": [
      {
        "t": "The reducer runs on a different executor than the blocks",
        "short": "Nothing is local.",
        "ctx": "Blocks written by one executor are only local to that executor, so a reducer elsewhere still fetches them all over the network.",
        "fix": "Nothing to change; the reader falls back to network fetches automatically."
      },
      {
        "t": "Local disk is slow",
        "short": "Local is not always faster.",
        "ctx": "A local read still uses the disk, so a slow disk can make a local read slower than a fast network fetch.",
        "fix": "Check disk throughput, and keep the reducer executors on machines with healthy disks."
      }
    ],
    "invariant": "",
    "kind": "localread",
    "steps": [
      {
        "t": "The plan reads every block the same way",
        "x": "Before adaptive planning, every shuffle block is read through the normal reader, as if all of them were remote.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Check where each block sits",
        "x": "Once the map outputs are known, the engine sees which blocks are on the executor that runs this reducer.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Local blocks become local reads",
        "x": "The three blocks on the same executor are read straight from its disk. The plan node is renamed to a local shuffle read.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Remote blocks still use the network",
        "x": "The other five blocks sit on different executors, so they are fetched over the network as before, under the same cap.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Count what changed",
        "x": "Of 8 blocks, 3 are now local. That is 3 fewer requests on the network for this reducer.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Same data, less traffic",
        "x": "The rows are the same. Only the way the blocks reach the reducer changed.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "localread",
      "steps": [
        {
          "title": "The plan reads every block the same way",
          "text": "Before adaptive planning, every shuffle block is read through the normal reader, as if all of them were remote.",
          "v": {
            "blocks": [
              "net",
              "net",
              "net",
              "net",
              "net",
              "net",
              "net",
              "net"
            ],
            "mode": "normal"
          }
        },
        {
          "title": "Check where each block sits",
          "text": "Once the map outputs are known, the engine sees which blocks are on the executor that runs this reducer.",
          "v": {
            "blocks": [
              "wait",
              "wait",
              "wait",
              "wait",
              "wait",
              "wait",
              "wait",
              "wait"
            ],
            "mode": "checked"
          }
        },
        {
          "title": "Local blocks become local reads",
          "text": "The three blocks on the same executor are read straight from its disk. The plan node is renamed to a local shuffle read.",
          "v": {
            "blocks": [
              "local",
              "local",
              "local",
              "wait",
              "wait",
              "wait",
              "wait",
              "wait"
            ],
            "mode": "local"
          }
        },
        {
          "title": "Remote blocks still use the network",
          "text": "The other five blocks sit on different executors, so they are fetched over the network as before, under the same cap.",
          "v": {
            "blocks": [
              "local",
              "local",
              "local",
              "net",
              "net",
              "net",
              "net",
              "net"
            ],
            "mode": "local"
          }
        },
        {
          "title": "Count what changed",
          "text": "Of 8 blocks, 3 are now local. That is 3 fewer requests on the network for this reducer.",
          "v": {
            "blocks": [
              "local",
              "local",
              "local",
              "net",
              "net",
              "net",
              "net",
              "net"
            ],
            "mode": "local",
            "count": true
          }
        },
        {
          "title": "Same data, less traffic",
          "text": "The rows are the same. Only the way the blocks reach the reducer changed.",
          "v": {
            "blocks": [
              "local",
              "local",
              "local",
              "net",
              "net",
              "net",
              "net",
              "net"
            ],
            "mode": "local",
            "count": true
          }
        }
      ]
    }
  },
  {
    "title": "Re-plan after every query stage",
    "blurb": "",
    "intro": "Adaptive execution cuts the query at each shuffle. After a query stage runs and is measured, the rest of the query is planned again with the real sizes.",
    "trigger": "A query has several shuffles, and each stage produces new size information that the rest of the plan can use.",
    "run": "spark.conf.set(\"spark.sql.adaptive.enabled\", \"true\")  # on by default since Spark 3.2",
    "expect": "After each query stage finishes, the engine plans the rest of the query again with the measured sizes. The loop repeats at each stage boundary.",
    "edges": [
      {
        "t": "A query with no shuffle",
        "short": "Nothing to re-plan.",
        "ctx": "Without a shuffle there is no stage boundary, so the query is planned once, as usual.",
        "fix": "Nothing to do; the plan is already final."
      },
      {
        "t": "Re-planning on noisy statistics",
        "short": "A plan can change for the worse.",
        "ctx": "A tiny sample of a stage can suggest a plan that is wrong for the rest of the data.",
        "fix": "Compare explain output on a representative run before relying on a specific plan change."
      }
    ],
    "invariant": "",
    "kind": "loop",
    "steps": [
      {
        "t": "Query stages are cut at exchanges",
        "x": "Each shuffle becomes a query stage boundary. Nothing after the first boundary is fixed yet.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Run the first query stage",
        "x": "The first stage runs, and its shuffle output is measured: the size of each partition and the number of rows.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Re-plan the rest",
        "x": "With the measured sizes, the engine plans everything after this stage again: join type, partition count and skew handling.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Run the next stage with the new plan",
        "x": "The second stage runs using the new plan, and its output is measured in turn.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Re-plan again if needed",
        "x": "The loop repeats at each boundary. A later stage can be re-planned from everything measured so far.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "The final plan is the one that ran",
        "x": "The plan that actually executed is the final one, and explain shows it with the changes adaptive execution made.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "loop",
      "steps": [
        {
          "title": "Query stages are cut at exchanges",
          "text": "Each shuffle becomes a query stage boundary. Nothing after the first boundary is fixed yet.",
          "v": {
            "stage": 0,
            "phase": "cut",
            "done": 0
          }
        },
        {
          "title": "Run the first query stage",
          "text": "The first stage runs, and its shuffle output is measured: the size of each partition and the number of rows.",
          "v": {
            "stage": 1,
            "phase": "run",
            "done": 0
          }
        },
        {
          "title": "Re-plan the rest",
          "text": "With the measured sizes, the engine plans everything after this stage again: join type, partition count and skew handling.",
          "v": {
            "stage": 1,
            "phase": "replan",
            "done": 1
          }
        },
        {
          "title": "Run the next stage with the new plan",
          "text": "The second stage runs using the new plan, and its output is measured in turn.",
          "v": {
            "stage": 2,
            "phase": "run",
            "done": 1
          }
        },
        {
          "title": "Re-plan again if needed",
          "text": "The loop repeats at each boundary. A later stage can be re-planned from everything measured so far.",
          "v": {
            "stage": 3,
            "phase": "replan",
            "done": 2
          }
        },
        {
          "title": "The final plan is the one that ran",
          "text": "The plan that actually executed is the final one, and explain shows it with the changes adaptive execution made.",
          "v": {
            "stage": 3,
            "phase": "final",
            "done": 3
          }
        }
      ]
    }
  }
];
CourseData.uc["evidence"] = [
  {
    "title": "Explain a slow stage after the fact",
    "blurb": "",
    "intro": "Replay turns a log into the same view that ran live.",
    "trigger": "A task has just finished, and its numbers must be kept so that someone can understand the job later.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "A slow disk",
        "short": "It must not slow down the job.",
        "ctx": "The log writer cannot keep up with the events that arrive.",
        "fix": "Events wait in a queue. If the queue overflows, some are dropped with a warning, but scheduling goes on."
      },
      {
        "t": "Very large jobs",
        "short": "Millions of events.",
        "ctx": "Logging every task of a huge job makes a big file and uses driver memory.",
        "fix": "Sample or compress, or log summaries instead of every detail."
      }
    ],
    "invariant": "Logging never changes scheduling decisions.",
    "kind": "tape",
    "steps": [
      {
        "t": "A task ends",
        "x": "The scheduler sees a task finish. It has numbers: run time, bytes read, bytes spilled, and so on.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Post an event",
        "x": "It puts one short event on the listener bus, a message board, and goes straight back to scheduling.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Everyone gets a copy",
        "x": "The bus hands the event to each listener on its own thread. A slow listener cannot hold up the others.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Append to the log",
        "x": "The log writer adds the event to the event log file, in the background.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Update the live view",
        "x": "The live status store updates its counters, so the web page shows the new totals.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Scheduling was never slowed",
        "x": "If the disk is slow, the log queue grows a little. The scheduler never waits for it. It decides the same way with or without logging.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "actors": [
        "Scheduler",
        "Listener bus",
        "Log writer",
        "Live status"
      ],
      "steps": [
        {
          "title": "A task ends",
          "text": "The scheduler sees a task finish. It has numbers: run time, bytes read, bytes spilled, and so on.",
          "m": null,
          "set": {
            "Scheduler": [
              "task 12 done: 4 s, 128 MB read, 0 spilled"
            ]
          },
          "badge": {},
          "v": {
            "ev": 0,
            "written": 0,
            "writer": 0,
            "live": 0
          }
        },
        {
          "title": "Post an event",
          "text": "It puts one short event on the listener bus, a message board, and goes straight back to scheduling.",
          "m": [
            "Scheduler",
            "Listener bus",
            "task-end event"
          ],
          "set": {
            "Listener bus": [
              "+task 12 end"
            ]
          },
          "badge": {},
          "v": {
            "ev": 1,
            "written": 0,
            "bus": true,
            "writer": 0,
            "live": 0
          }
        },
        {
          "title": "Everyone gets a copy",
          "text": "The bus hands the event to each listener on its own thread. A slow listener cannot hold up the others.",
          "m": [
            "Listener bus",
            "Log writer",
            "task 12 end"
          ],
          "set": {},
          "badge": {},
          "v": {
            "ev": 1,
            "written": 0,
            "writer": 1,
            "live": 0
          }
        },
        {
          "title": "Append to the log",
          "text": "The log writer adds the event to the event log file, in the background.",
          "m": [
            "Log writer",
            "Log writer",
            "append to the file"
          ],
          "set": {
            "Log writer": [
              "+line: task 12 end"
            ]
          },
          "badge": {},
          "v": {
            "ev": 1,
            "written": 1,
            "writer": 0,
            "live": 0
          }
        },
        {
          "title": "Update the live view",
          "text": "The live status store updates its counters, so the web page shows the new totals.",
          "m": [
            "Listener bus",
            "Live status",
            "task 12 end"
          ],
          "set": {
            "Live status": [
              "tasks done: 12",
              "bytes read: 1.5 GB"
            ]
          },
          "badge": {},
          "v": {
            "ev": 1,
            "written": 1,
            "writer": 0,
            "live": 1
          }
        },
        {
          "title": "Scheduling was never slowed",
          "text": "If the disk is slow, the log queue grows a little. The scheduler never waits for it. It decides the same way with or without logging.",
          "m": null,
          "set": {},
          "badge": {},
          "v": {
            "ev": 6,
            "written": 4,
            "writer": 3,
            "live": 6,
            "slow": true
          }
        }
      ],
      "kind": "tape"
    }
  },
  {
    "title": "Log lifecycle",
    "blurb": "",
    "intro": "In-progress logs must be distinguishable from complete ones.",
    "trigger": "Someone opens a job that has already finished, perhaps days ago.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "The driver died, the log is cut short",
        "short": "Do not trust it.",
        "ctx": "The log ends in the middle, with no &quot;application end&quot; event.",
        "fix": "The history server marks the application as incomplete and shows what it has, with a warning."
      },
      {
        "t": "The log was already deleted",
        "short": "Nothing to replay.",
        "ctx": "A retention rule removed old logs.",
        "fix": "Keep logs for as long as you may need to investigate, or copy important ones elsewhere."
      }
    ],
    "invariant": "Replaying the log reproduces the live view.",
    "kind": "segments",
    "steps": [
      {
        "t": "Open an old job",
        "x": "A person asks to see application 42. The job is long gone, but its log was kept.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Find the log",
        "x": "The history server looks in the log folder and finds app-42.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Read the events in order",
        "x": "It reads the file from the first line, replaying events in exactly the order they happened.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Rebuild what happened",
        "x": "Replaying the events rebuilds jobs, stages, tasks, and the final query plan.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Looks just like it did live",
        "x": "The same pages as a live job are shown. You can find the slow stage after the fact.",
        "s": {
          "k": 4
        }
      }
    ],
    "scene": {
      "actors": [
        "History server",
        "Event log",
        "Rebuilt view"
      ],
      "steps": [
        {
          "title": "Open an old job",
          "text": "A person asks to see application 42. The job is long gone, but its log was kept.",
          "m": null,
          "set": {
            "Event log": [
              "app-42.log",
              "app-41.log",
              "app-40.log"
            ]
          },
          "badge": {},
          "v": {
            "found": false
          }
        },
        {
          "title": "Find the log",
          "text": "The history server looks in the log folder and finds app-42.",
          "m": [
            "History server",
            "Event log",
            "open app-42"
          ],
          "set": {
            "Event log": [
              "+app-42.log",
              "app-41.log",
              "app-40.log"
            ]
          },
          "badge": {},
          "v": {
            "found": true,
            "cur": 0
          }
        },
        {
          "title": "Read the events in order",
          "text": "It reads the file from the first line, replaying events in exactly the order they happened.",
          "m": [
            "Event log",
            "History server",
            "events 1, 2, 3 ..."
          ],
          "set": {
            "History server": [
              "job start",
              "stage 1 submitted",
              "task 1 end ..."
            ]
          },
          "badge": {},
          "v": {
            "found": true,
            "cur": 6
          }
        },
        {
          "title": "Rebuild what happened",
          "text": "Replaying the events rebuilds jobs, stages, tasks, and the final query plan.",
          "m": [
            "History server",
            "Rebuilt view",
            "build"
          ],
          "set": {
            "Rebuilt view": [
              "+job 0: 2 stages",
              "+stage 1: 40 tasks",
              "+plan"
            ]
          },
          "badge": {},
          "v": {
            "found": true,
            "cur": 12,
            "jobs": 1,
            "stages": 2,
            "tasks": 40,
            "plan": 1
          }
        },
        {
          "title": "Looks just like it did live",
          "text": "The same pages as a live job are shown. You can find the slow stage after the fact.",
          "m": null,
          "set": {
            "Rebuilt view": [
              "job 0: 2 stages",
              "stage 1: 40 tasks",
              "plan",
              "+same pages as live"
            ]
          },
          "badge": {},
          "v": {
            "found": true,
            "cur": 12,
            "jobs": 1,
            "stages": 2,
            "tasks": 40,
            "plan": 1,
            "match": true
          }
        }
      ],
      "kind": "segments"
    }
  },
  {
    "title": "A full event queue drops events",
    "blurb": "",
    "intro": "Events go onto a bounded queue, and listeners consume them. If events arrive faster than they are consumed, the queue fills and new events are dropped. Dropped events never reach the live UI or the log.",
    "trigger": "A job fires events faster than the listeners can consume them, for example when thousands of tasks start and finish in a short time.",
    "run": "spark-submit --conf spark.scheduler.listenerbus.eventqueue.capacity=20000 app.py  # 10000 is the default",
    "expect": "Events beyond the queue capacity are dropped, so the UI and the event log miss them. Size the queue for the peak event rate, or speed up the listener.",
    "edges": [
      {
        "t": "A short burst, not a steady rate",
        "short": "A bigger queue absorbs it.",
        "ctx": "Many tasks finishing together can briefly outrun the listeners, then the rate drops again.",
        "fix": "Raise the queue capacity so the burst fits; the listeners catch up afterwards."
      },
      {
        "t": "A listener that is always slow",
        "short": "A bigger queue only delays the drops.",
        "ctx": "If a listener cannot keep up on average, the queue fills no matter how large it is.",
        "fix": "Make the listener faster, for example by writing the log to faster storage."
      }
    ],
    "invariant": "",
    "kind": "dropqueue",
    "steps": [
      {
        "t": "Events arrive from the scheduler",
        "x": "Each task start and end is an event. The scheduler puts them on the bus, a bounded queue of 10,000 events, and keeps scheduling.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "A slow listener falls behind",
        "x": "A listener that writes the event log consumes events more slowly than they arrive, so the queue begins to fill.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "The queue is nearly full",
        "x": "The queue holds 9,800 of its 10,000 places. The scheduler keeps working, because posting an event does not wait for the listeners.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "The queue is full: events are dropped",
        "x": "New events arrive when the queue is full. They are dropped, and a warning counts how many were lost.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "The UI and the log have gaps",
        "x": "The live pages and the event log are missing the dropped events. Totals and task lists can be incomplete.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Enlarge the queue or speed up the listener",
        "x": "A larger capacity holds bursts, and a faster listener keeps up. The right fix depends on which one is the bottleneck.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "dropqueue",
      "steps": [
        {
          "title": "Events arrive from the scheduler",
          "text": "Each task start and end is an event. The scheduler puts them on the bus, a bounded queue of 10,000 events, and keeps scheduling.",
          "v": {
            "cap": 10000,
            "fill": 2000,
            "dropped": 0,
            "logged": true
          }
        },
        {
          "title": "A slow listener falls behind",
          "text": "A listener that writes the event log consumes events more slowly than they arrive, so the queue begins to fill.",
          "v": {
            "cap": 10000,
            "fill": 6000,
            "dropped": 0,
            "logged": true,
            "slow": true
          }
        },
        {
          "title": "The queue is nearly full",
          "text": "The queue holds 9,800 of its 10,000 places. The scheduler keeps working, because posting an event does not wait for the listeners.",
          "v": {
            "cap": 10000,
            "fill": 9800,
            "dropped": 0,
            "logged": true,
            "slow": true
          }
        },
        {
          "title": "The queue is full: events are dropped",
          "text": "New events arrive when the queue is full. They are dropped, and a warning counts how many were lost.",
          "v": {
            "cap": 10000,
            "fill": 10000,
            "dropped": 250,
            "logged": true,
            "slow": true
          }
        },
        {
          "title": "The UI and the log have gaps",
          "text": "The live pages and the event log are missing the dropped events. Totals and task lists can be incomplete.",
          "v": {
            "cap": 10000,
            "fill": 10000,
            "dropped": 250,
            "logged": false,
            "slow": true
          }
        },
        {
          "title": "Enlarge the queue or speed up the listener",
          "text": "A larger capacity holds bursts, and a faster listener keeps up. The right fix depends on which one is the bottleneck.",
          "v": {
            "cap": 20000,
            "fill": 12000,
            "dropped": 0,
            "logged": true
          }
        }
      ]
    }
  },
  {
    "title": "The live UI keeps a window, the log keeps all",
    "blurb": "",
    "intro": "The live pages keep only the most recent jobs and stages, so memory stays bounded. The event log still holds every event, so the history view can show what the live view forgot.",
    "trigger": "A long application has run thousands of stages, and someone opens its live UI to look for an early slow stage.",
    "run": "spark-submit --conf spark.ui.retainedStages=1000 --conf spark.ui.retainedJobs=1000 app.py  # 1000 is the default for both",
    "expect": "The live UI shows the most recent stages and jobs only. Older ones leave memory, but the event log still has every one of them.",
    "edges": [
      {
        "t": "The job is still running",
        "short": "The log is still being written.",
        "ctx": "The history server reads the log as it grows. A live job can show less than the event log holds until it is replayed.",
        "fix": "Refresh the history server, or use the live UI for the current window."
      },
      {
        "t": "The log was not enabled",
        "short": "Removed stages are lost for good.",
        "ctx": "Without an event log, the live window is the only record, so a removed stage cannot be looked at afterwards.",
        "fix": "Turn the event log on for every application you may need to explain later."
      }
    ],
    "invariant": "",
    "kind": "window",
    "steps": [
      {
        "t": "Stages keep arriving",
        "x": "Each finished stage is added to the live UI. The UI keeps a window of the most recent ones, so driver memory stays bounded.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "The window is full",
        "x": "When the window holds its limit of stages, the oldest one is removed from the live pages to free memory.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "A removed stage is still in the log",
        "x": "The event log was written while the job ran, so every stage, including the removed ones, is in the file.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "The live UI is only a window",
        "x": "Opening the live UI shows the latest stages only. Looking for an early slow stage here finds nothing.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "The history server shows all of them",
        "x": "Replaying the event log rebuilds the complete list, from the first stage to the last.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "A bigger window has a cost",
        "x": "A bigger window keeps more in driver memory. For long applications the history server is the right tool, not a larger window.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "window",
      "steps": [
        {
          "title": "Stages keep arriving",
          "text": "Each finished stage is added to the live UI. The UI keeps a window of the most recent ones, so driver memory stays bounded.",
          "v": {
            "total": 10,
            "window": 10,
            "log": false
          }
        },
        {
          "title": "The window is full",
          "text": "When the window holds its limit of stages, the oldest one is removed from the live pages to free memory.",
          "v": {
            "total": 14,
            "window": 10,
            "log": true
          }
        },
        {
          "title": "A removed stage is still in the log",
          "text": "The event log was written while the job ran, so every stage, including the removed ones, is in the file.",
          "v": {
            "total": 14,
            "window": 10,
            "log": true,
            "evicted": true
          }
        },
        {
          "title": "The live UI is only a window",
          "text": "Opening the live UI shows the latest stages only. Looking for an early slow stage here finds nothing.",
          "v": {
            "total": 14,
            "window": 10,
            "log": true,
            "evicted": true,
            "live": true
          }
        },
        {
          "title": "The history server shows all of them",
          "text": "Replaying the event log rebuilds the complete list, from the first stage to the last.",
          "v": {
            "total": 14,
            "window": 10,
            "log": true,
            "evicted": true,
            "history": true
          }
        },
        {
          "title": "A bigger window has a cost",
          "text": "A bigger window keeps more in driver memory. For long applications the history server is the right tool, not a larger window.",
          "v": {
            "total": 14,
            "window": 10,
            "log": true,
            "evicted": true,
            "history": true,
            "bigger": true
          }
        }
      ]
    }
  },
  {
    "title": "The spread of task durations shows skew",
    "blurb": "",
    "intro": "For one stage, the spread of task durations separates a slow cluster from a skewed key. A tight spread with a far maximum points to a few heavy tasks.",
    "trigger": "A stage looks slow, and you need to know whether every task is slow or only a few of them.",
    "run": "Spark UI: Stages tab, then the stage page, then Summary Metrics (min, median and max task durations)",
    "expect": "A tight spread means the whole stage is slow. A few tasks far above the median point to skew, and the input size of those tasks confirms it.",
    "edges": [
      {
        "t": "Few tasks in the stage",
        "short": "The summary is not reliable.",
        "ctx": "With only a handful of tasks, one slow task can set the maximum and mislead the reading.",
        "fix": "Look at the individual tasks in the stage page before deciding."
      },
      {
        "t": "Slow tasks on one machine",
        "short": "The skew is in the cluster, not the data.",
        "ctx": "If the outlier tasks all ran on one executor, a bad disk or node is more likely than a skewed key.",
        "fix": "Check the executor column for the slow tasks, and exclude the executor if it is the cause."
      }
    ],
    "invariant": "",
    "kind": "box",
    "steps": [
      {
        "t": "Look at the stage, not one task",
        "x": "A stage has 200 tasks. One slow task is easy to miss in a list of 200 rows.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Summarise the durations",
        "x": "The summary shows the minimum, the 25th percentile, the median, the 75th percentile and the maximum duration of the tasks.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Most tasks are alike",
        "x": "The box is tight, between 20 and 24 seconds, so most tasks cost about the same and the maximum is close to them.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "A few tasks sit far above",
        "x": "For a different stage, the maximum is 240 seconds, far above the box. Those few tasks are outliers, and the whiskers show how far they reach.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Check the input size of the outliers",
        "x": "The slow tasks read far more input bytes than the rest. That points to a skewed key, not a slow machine.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Decide the fix from the shape",
        "x": "A tight box with a long tail means skew: fix the key. A wide spread everywhere means the whole stage needs more resources.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "box",
      "steps": [
        {
          "title": "Look at the stage, not one task",
          "text": "A stage has 200 tasks. One slow task is easy to miss in a list of 200 rows.",
          "v": {
            "stats": null
          }
        },
        {
          "title": "Summarise the durations",
          "text": "The summary shows the minimum, the 25th percentile, the median, the 75th percentile and the maximum duration of the tasks.",
          "v": {
            "stats": {
              "min": 18,
              "q1": 20,
              "med": 22,
              "q3": 24,
              "max": 26
            },
            "outliers": []
          }
        },
        {
          "title": "Most tasks are alike",
          "text": "The box is tight, between 20 and 24 seconds, so most tasks cost about the same and the maximum is close to them.",
          "v": {
            "stats": {
              "min": 18,
              "q1": 20,
              "med": 22,
              "q3": 24,
              "max": 26
            },
            "outliers": [],
            "tight": true
          }
        },
        {
          "title": "A few tasks sit far above",
          "text": "For a different stage, the maximum is 240 seconds, far above the box. Those few tasks are outliers, and the whiskers show how far they reach.",
          "v": {
            "stats": {
              "min": 18,
              "q1": 20,
              "med": 22,
              "q3": 24,
              "max": 240
            },
            "outliers": [
              120,
              180,
              240
            ]
          }
        },
        {
          "title": "Check the input size of the outliers",
          "text": "The slow tasks read far more input bytes than the rest. That points to a skewed key, not a slow machine.",
          "v": {
            "stats": {
              "min": 18,
              "q1": 20,
              "med": 22,
              "q3": 24,
              "max": 240
            },
            "outliers": [
              120,
              180,
              240
            ],
            "inputs": true
          }
        },
        {
          "title": "Decide the fix from the shape",
          "text": "A tight box with a long tail means skew: fix the key. A wide spread everywhere means the whole stage needs more resources.",
          "v": {
            "stats": {
              "min": 18,
              "q1": 20,
              "med": 22,
              "q3": 24,
              "max": 240
            },
            "outliers": [
              120,
              180,
              240
            ],
            "inputs": true,
            "skew": true
          }
        }
      ]
    }
  }
];
CourseData.uc["build"] = [
  {
    "title": "End-to-end run",
    "blurb": "",
    "intro": "One set of options, one trace, one answer.",
    "trigger": "You run the small reference engine on 12 rows of input, to see all the earlier ideas working together.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "Zero rows of input",
        "short": "Still a valid result.",
        "ctx": "The input is empty, so there is nothing to add up.",
        "fix": "The engine returns an empty result and marks the output complete. It does not fail."
      },
      {
        "t": "Invalid options",
        "short": "Rejected, not guessed.",
        "ctx": "An option such as negative memory makes no sense.",
        "fix": "The engine rejects it with a clear message instead of quietly changing it to something else."
      }
    ],
    "invariant": "The total is 640 under every setting.",
    "kind": "mosaic",
    "steps": [
      {
        "t": "Choose options",
        "x": "You choose how much memory, whether a worker is lost and whether to speculate. The engine takes them as its input.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Read the input",
        "x": "The 12 input rows are cut into partitions, using the rule from the read page.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Run the pipeline and combine",
        "x": "Each task pulls its rows through the filter and map, and adds up counts per key before writing.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Shuffle, spill, merge",
        "x": "Reducers fetch their parts. With small memory, some parts spill to disk and are merged at the end.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "A worker is lost, then replayed",
        "x": "The worker you chose to lose takes some output with it. Only the lost tasks run again, and the result does not change.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Publish and show the answer",
        "x": "Only one attempt per partition publishes, and the output is marked complete. The engine prints the answer and a trace of every step.",
        "s": {
          "k": 5
        }
      },
      {
        "t": "The same answer every time",
        "x": "Change any option: more memory, no loss, speculation on or off. The total is still 640. This is the promise of the whole design.",
        "s": {
          "k": 6
        }
      }
    ],
    "scene": {
      "actors": [
        "You",
        "Engine",
        "Scheduler",
        "Sink"
      ],
      "steps": [
        {
          "title": "Choose options",
          "text": "You choose how much memory, whether a worker is lost and whether to speculate. The engine takes them as its input.",
          "m": [
            "You",
            "Engine",
            "run(options)"
          ],
          "set": {
            "You": [
              "memory: small",
              "lose a worker: yes"
            ]
          },
          "badge": {},
          "v": {
            "opts": true
          }
        },
        {
          "title": "Read the input",
          "text": "The 12 input rows are cut into partitions, using the rule from the read page.",
          "m": [
            "Engine",
            "Engine",
            "split the 12 rows"
          ],
          "set": {
            "Engine": [
              "partition 0: 4 rows",
              "partition 1: 4 rows",
              "partition 2: 4 rows"
            ]
          },
          "badge": {},
          "v": {
            "rows": true
          }
        },
        {
          "title": "Run the pipeline and combine",
          "text": "Each task pulls its rows through the filter and map, and adds up counts per key before writing.",
          "m": [
            "Engine",
            "Scheduler",
            "tasks for stage 1"
          ],
          "set": {
            "Scheduler": [
              "3 tasks running"
            ]
          },
          "badge": {},
          "v": {
            "rows": true,
            "parts": true
          }
        },
        {
          "title": "Shuffle, spill, merge",
          "text": "Reducers fetch their parts. With small memory, some parts spill to disk and are merged at the end.",
          "m": [
            "Scheduler",
            "Engine",
            "wave complete"
          ],
          "set": {
            "Engine": [
              "shuffle done",
              "+spilled 2 runs, merged"
            ]
          },
          "badge": {},
          "v": {
            "rows": true,
            "parts": true,
            "shuf": true
          }
        },
        {
          "title": "A worker is lost, then replayed",
          "text": "The worker you chose to lose takes some output with it. Only the lost tasks run again, and the result does not change.",
          "m": [
            "Scheduler",
            "Engine",
            "rerun lost tasks"
          ],
          "set": {
            "Engine": [
              "shuffle done",
              "spilled 2 runs, merged",
              "!lost output",
              "+replayed 1 task"
            ]
          },
          "badge": {},
          "v": {
            "rows": true,
            "parts": true,
            "shuf": true,
            "lost": 1
          }
        },
        {
          "title": "Publish and show the answer",
          "text": "Only one attempt per partition publishes, and the output is marked complete. The engine prints the answer and a trace of every step.",
          "m": [
            "Engine",
            "Sink",
            "publish winners"
          ],
          "set": {
            "Sink": [
              "+total = 640"
            ]
          },
          "badge": {},
          "v": {
            "rows": true,
            "parts": true,
            "lost": 1,
            "replayed": true,
            "pub": true
          }
        },
        {
          "title": "The same answer every time",
          "text": "Change any option: more memory, no loss, speculation on or off. The total is still 640. This is the promise of the whole design.",
          "m": [
            "Sink",
            "You",
            "answer + trace"
          ],
          "set": {
            "You": [
              "+total = 640",
              "+trace"
            ]
          },
          "badge": {},
          "v": {
            "rows": true,
            "parts": true,
            "lost": 1,
            "replayed": true,
            "pub": true,
            "alt": true
          }
        }
      ],
      "kind": "mosaic"
    }
  },
  {
    "title": "The same input gives the same answer under any options",
    "blurb": "",
    "intro": "Options such as memory and speculation change how the work runs, not what it produces. Running the engine twice with different options and comparing the outputs checks the whole design.",
    "trigger": "You run the same input twice: once with small memory and no speculation, and once with large memory and speculation on.",
    "run": "run the reference engine with memory=small and speculation=off, then with memory=large and speculation=on; compare the two outputs",
    "expect": "The two runs give the same total and the same rows per partition, even though their traces differ.",
    "edges": [
      {
        "t": "Timings look different between runs",
        "short": "That is not a correctness problem.",
        "ctx": "Speculation and spilling change the time taken. Comparing timings as if they were answers would flag false failures.",
        "fix": "Compare the outputs for equality, and read the timings only as cost."
      },
      {
        "t": "Random input between runs",
        "short": "The outputs can differ for a reason unrelated to options.",
        "ctx": "If the input is generated with a random seed that changes per run, the totals differ without any engine bug.",
        "fix": "Fix the seed, then compare the runs."
      }
    ],
    "invariant": "",
    "kind": "diff",
    "steps": [
      {
        "t": "Two runs, two option sets",
        "x": "Run A uses small memory and no speculation. Run B uses large memory and speculation on. The input is the same 12 rows.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Both finish the same shuffle",
        "x": "Run A spills to disk and runs one attempt per task. Run B spills nothing and starts a backup attempt for a slow task.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "The traces differ",
        "x": "The traces differ in spill counts, attempt counts and timings. That is expected: the options change how the work runs.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "The totals match",
        "x": "Both runs publish the same rows for each partition, and the total is 640 in both.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Compare key by key",
        "x": "The check compares the outputs key by key, not the timings. Any mismatch would be a bug in the engine, not a difference between the options.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "A mismatch would be a bug",
        "x": "If the totals differed, the engine would have a race or a lost update. The trace would show the step where the outputs diverged.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "diff",
      "steps": [
        {
          "title": "Two runs, two option sets",
          "text": "Run A uses small memory and no speculation. Run B uses large memory and speculation on. The input is the same 12 rows.",
          "v": {
            "a": null,
            "b": null,
            "rows": []
          }
        },
        {
          "title": "Both finish the same shuffle",
          "text": "Run A spills to disk and runs one attempt per task. Run B spills nothing and starts a backup attempt for a slow task.",
          "v": {
            "a": null,
            "b": null,
            "rows": [
              [
                "total",
                "640",
                "640"
              ],
              [
                "spilled",
                "3",
                "0"
              ],
              [
                "attempts",
                "12",
                "13"
              ]
            ],
            "focus": "counters"
          }
        },
        {
          "title": "The traces differ",
          "text": "The traces differ in spill counts, attempt counts and timings. That is expected: the options change how the work runs.",
          "v": {
            "a": null,
            "b": null,
            "rows": [
              [
                "total",
                "640",
                "640"
              ],
              [
                "spilled",
                "3",
                "0"
              ],
              [
                "attempts",
                "12",
                "13"
              ],
              [
                "time",
                "14 s",
                "11 s"
              ]
            ],
            "focus": "differ"
          }
        },
        {
          "title": "The totals match",
          "text": "Both runs publish the same rows for each partition, and the total is 640 in both.",
          "v": {
            "a": null,
            "b": null,
            "rows": [
              [
                "total",
                "640",
                "640"
              ],
              [
                "spilled",
                "3",
                "0"
              ],
              [
                "attempts",
                "12",
                "13"
              ],
              [
                "time",
                "14 s",
                "11 s"
              ]
            ],
            "focus": "total"
          }
        },
        {
          "title": "Compare key by key",
          "text": "The check compares the outputs key by key, not the timings. Any mismatch would be a bug in the engine, not a difference between the options.",
          "v": {
            "a": null,
            "b": null,
            "rows": [
              [
                "partition 0",
                "150",
                "150"
              ],
              [
                "partition 1",
                "180",
                "180"
              ],
              [
                "partition 2",
                "190",
                "190"
              ],
              [
                "partition 3",
                "120",
                "120"
              ]
            ],
            "focus": "keys"
          }
        },
        {
          "title": "A mismatch would be a bug",
          "text": "If the totals differed, the engine would have a race or a lost update. The trace would show the step where the outputs diverged.",
          "v": {
            "a": null,
            "b": null,
            "rows": [
              [
                "partition 0",
                "150",
                "150"
              ],
              [
                "partition 1",
                "180",
                "180"
              ],
              [
                "partition 2",
                "190",
                "196"
              ],
              [
                "partition 3",
                "120",
                "120"
              ]
            ],
            "focus": "bug"
          }
        }
      ]
    }
  },
  {
    "title": "When a partition keeps failing, nothing is published",
    "blurb": "",
    "intro": "If one partition fails every attempt, the job aborts. Partitions that finished are not published as a result, so readers never see a partial answer.",
    "trigger": "One partition fails on every attempt, for example because a worker keeps dying on the same input.",
    "run": "set one partition to fail on every attempt in the reference engine, then run it",
    "expect": "The job aborts after the retry limit. Nothing is published, so readers never see a partial answer.",
    "edges": [
      {
        "t": "Partial output is wanted",
        "short": "Use a different output, not this one.",
        "ctx": "Some workflows want the finished partitions even when one fails. This design publishes only complete results.",
        "fix": "Write each partition to its own location and record success yourself, if partial results are acceptable."
      },
      {
        "t": "The failure is transient",
        "short": "Retries should absorb it.",
        "ctx": "A one-off failure on one attempt does not abort the job; only exhausting every attempt does.",
        "fix": "Raise the attempt limit only if the failures are truly random."
      }
    ],
    "invariant": "",
    "kind": "abort",
    "steps": [
      {
        "t": "Four partitions run",
        "x": "Four partitions run in parallel. Each one writes its output to a private staging area first.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Three partitions commit",
        "x": "Partitions 0, 1 and 3 are authorized by the coordinator, and each commits its output.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Partition 2 fails again and again",
        "x": "Partition 2 fails on every attempt. Each failure is retried, until the limit is reached.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "The limit is reached",
        "x": "Partition 2 has used its last allowed attempt. The job cannot produce a complete answer.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "The job aborts and nothing is published",
        "x": "The engine stops the job and writes no readiness marker. The committed partitions stay out of the final output.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Fix the cause and rerun",
        "x": "After the cause is fixed, the rerun produces the full answer, 640, from scratch.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "abort",
      "steps": [
        {
          "title": "Four partitions run",
          "text": "Four partitions run in parallel. Each one writes its output to a private staging area first.",
          "v": {
            "parts": [
              "staging",
              "staging",
              "staging",
              "staging"
            ],
            "job": "running",
            "result": "none"
          }
        },
        {
          "title": "Three partitions commit",
          "text": "Partitions 0, 1 and 3 are authorized by the coordinator, and each commits its output.",
          "v": {
            "parts": [
              "committed",
              "staging",
              "committed",
              "committed"
            ],
            "job": "running",
            "result": "none"
          }
        },
        {
          "title": "Partition 2 fails again and again",
          "text": "Partition 2 fails on every attempt. Each failure is retried, until the limit is reached.",
          "v": {
            "parts": [
              "committed",
              "failing",
              "committed",
              "committed"
            ],
            "job": "running",
            "result": "none",
            "attempts": 4
          }
        },
        {
          "title": "The limit is reached",
          "text": "Partition 2 has used its last allowed attempt. The job cannot produce a complete answer.",
          "v": {
            "parts": [
              "committed",
              "failed",
              "committed",
              "committed"
            ],
            "job": "running",
            "result": "none",
            "attempts": 4
          }
        },
        {
          "title": "The job aborts and nothing is published",
          "text": "The engine stops the job and writes no readiness marker. The committed partitions stay out of the final output.",
          "v": {
            "parts": [
              "committed",
              "failed",
              "committed",
              "committed"
            ],
            "job": "aborted",
            "result": "none",
            "attempts": 4
          }
        },
        {
          "title": "Fix the cause and rerun",
          "text": "After the cause is fixed, the rerun produces the full answer, 640, from scratch.",
          "v": {
            "parts": [
              "committed",
              "committed",
              "committed",
              "committed"
            ],
            "job": "done",
            "result": "640"
          }
        }
      ]
    }
  },
  {
    "title": "Compare options by what each one costs",
    "blurb": "",
    "intro": "Each option changes a cost: spills, attempts and time. Running every combination once and comparing the counters shows which option is worth its price for the same answer.",
    "trigger": "You want to know what each option costs before choosing one for production.",
    "run": "run the same input once for each option set, and read the spill, attempt and time counters in each trace",
    "expect": "Each option changes the cost, not the answer. The small multiples show which option costs what, so the choice is made on evidence.",
    "edges": [
      {
        "t": "One run is not enough",
        "short": "Counters vary between runs.",
        "ctx": "A single run can be noisy, especially for time, so one number is not a reliable comparison.",
        "fix": "Run each option several times and compare the averages."
      },
      {
        "t": "Speculation helps only with stragglers",
        "short": "No slow task means no gain.",
        "ctx": "If no task is slow, speculation adds backup attempts and cost without saving any time.",
        "fix": "Turn speculation on only when the trace shows slow tasks."
      }
    ],
    "invariant": "",
    "kind": "multiples",
    "steps": [
      {
        "t": "Pick the option sets to compare",
        "x": "Three option sets: small memory with speculation off, large memory with speculation off, and large memory with speculation on.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Run each set once",
        "x": "Each run gives the same total, 640. The engine records spills, attempts and time for each run.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Spills: only small memory",
        "x": "Spills appear only with small memory. The large-memory runs spill nothing.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Attempts: speculation adds some",
        "x": "Speculation adds backup attempts, so the speculative run has more attempts than the plain large-memory run.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Time: the fastest is not the cheapest",
        "x": "The plain large-memory run is fastest. The speculative run is slightly slower here, because its backups cost more than they saved.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Choose by the cost that matters",
        "x": "If memory is the scarce resource, small memory with speculation off uses the least, at the cost of spills and time. If time matters most, large memory without speculation is the fastest here.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "multiples",
      "steps": [
        {
          "title": "Pick the option sets to compare",
          "text": "Three option sets: small memory with speculation off, large memory with speculation off, and large memory with speculation on.",
          "v": {
            "focus": null
          }
        },
        {
          "title": "Run each set once",
          "text": "Each run gives the same total, 640. The engine records spills, attempts and time for each run.",
          "v": {
            "focus": "total"
          }
        },
        {
          "title": "Spills: only small memory",
          "text": "Spills appear only with small memory. The large-memory runs spill nothing.",
          "v": {
            "focus": "spill"
          }
        },
        {
          "title": "Attempts: speculation adds some",
          "text": "Speculation adds backup attempts, so the speculative run has more attempts than the plain large-memory run.",
          "v": {
            "focus": "attempts"
          }
        },
        {
          "title": "Time: the fastest is not the cheapest",
          "text": "The plain large-memory run is fastest. The speculative run is slightly slower here, because its backups cost more than they saved.",
          "v": {
            "focus": "time"
          }
        },
        {
          "title": "Choose by the cost that matters",
          "text": "If memory is the scarce resource, small memory with speculation off uses the least, at the cost of spills and time. If time matters most, large memory without speculation is the fastest here.",
          "v": {
            "focus": "time",
            "note": "memory is the scarce resource: pick small memory with speculation off"
          }
        }
      ]
    }
  }
];
