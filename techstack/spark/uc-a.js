/* Spark use cases: course content and complete animation state. */
CourseData.uc["read"] = [
  {
    "title": "Read a split without losing or doubling a record",
    "blurb": "Cut a CSV into pieces and still read every row exactly once.",
    "intro": "Imagine a CSV file too big for one machine. It is cut into pieces by size only, and each piece goes to a different worker. A cut does not care where a line ends, so it can land in the middle of a row. The sequence diagrams below show two cases. The step-by-step section lets you move the cut yourself and watch the one small rule that makes every row get read exactly once.",
    "trigger": "A worker is handed one piece of a big text file, for example bytes 10 to 20 of a 20-byte file. Many workers do this at the same time, each with a different piece, and none of them can ask the others where their lines ended.",
    "run": "spark.read.option(\"header\", True).csv(\"people.csv\").count()",
    "expect": "Every row is read by exactly one worker, even when a cut falls in the middle of a row.",
    "edges": [
      {
        "t": "The cut lands exactly where a line begins",
        "short": "The line is easy to lose.",
        "ctx": "Worker A stops because that line does not start before the end of its piece. If Worker B also throws it away while skipping the leftover, nobody reads it. The job still finishes with no error, but the answer is missing a row.",
        "fix": "Worker B steps back one byte before it skips. If the byte just before its piece is a line break, only that one break is thrown away and the line that begins here is kept."
      },
      {
        "t": "The cut lands in the middle of a line",
        "short": "The line could be read twice.",
        "ctx": "The line starts in one piece and ends in the next. If both workers read it, the row is counted twice.",
        "fix": "The piece where the line starts owns it. That worker reads past its own end to finish the line. The next worker throws away the leftover part."
      },
      {
        "t": "One line is longer than a whole piece",
        "short": "A worker in the middle gets no line start.",
        "ctx": "The worker in the middle looks for the first line break, and that break is already past the end of its own piece. So no line starts inside its piece.",
        "fix": "It reads nothing, and that is correct. The worker where the line starts reads it whole. That one worker is slow, but the answer is right."
      },
      {
        "t": "A line break made of two characters is cut in half",
        "short": "The worker may start reading from the middle of a row.",
        "ctx": "Some files end a line with a carriage return and a newline together. If the cut falls between the two, a worker can mistake the second character for the whole break.",
        "fix": "Read raw bytes and treat the pair as one line break. Drop the leftover carriage return from the row before using it."
      },
      {
        "t": "A cell contains a line break inside quotes",
        "short": "The rule cannot tell a real break from one inside a cell.",
        "ctx": "In a CSV, a quoted cell can hold a paragraph with line breaks. A worker that starts in the middle of the file cannot know whether a break it finds is inside quotes.",
        "fix": "Do not cut such files by size. Use one worker for the whole file, or use a file format that marks safe places to start reading."
      },
      {
        "t": "The last line has no line break",
        "short": "The final row could be dropped.",
        "ctx": "Some files end without a line break after the last row, so the worker never finds the end of that line.",
        "fix": "Treat the end of the file as the end of the line. The last worker reads that row as normal."
      },
      {
        "t": "Characters that take several bytes",
        "short": "A cut can land in the middle of one letter.",
        "ctx": "An accented letter can use two or more bytes, and the file is cut by bytes, not by letters. A cut can fall inside one letter.",
        "fix": "A line break is a single byte that never appears inside another character in UTF-8. So the worker only searches for that byte and never mistakes half a letter for a break."
      },
      {
        "t": "Extra reading at the edges",
        "short": "Every worker reads a little outside its own piece.",
        "ctx": "Every worker except the first reads a little before its start, and every worker reads a little past its end. If the next piece is on a far-away machine, that small read is a network trip.",
        "fix": "Make pieces large, such as 128 MB, so the extra read is a tiny share of the work. Run each worker close to its data when possible."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "csv-read",
      "text": "id,name,city\n1,Ann,Hanoi\n2,Binh,Hue\n3,Chi,Da Nang\n4,Dung,Saigon\n",
      "names": [
        "A",
        "B",
        "C"
      ],
      "presets": [
        {
          "label": "Cut in the middle of a line",
          "cut": 30
        },
        {
          "label": "Cut exactly where a line begins",
          "cut": 36
        },
        {
          "label": "Cut right on a line break",
          "cut": 35
        }
      ],
      "cut": 30,
      "pieces": 2
    }
  },
  {
    "title": "Plan splits for a mixed directory",
    "blurb": "",
    "intro": "Large files get cut. Small files get packed.",
    "trigger": "The driver plans an input of many differently sized files.",
    "run": "spark.read.csv(\"landing/\").count()",
    "expect": "Four tasks from five files: big.csv in three pieces, logs.gz whole, and the small files packed together.",
    "edges": [
      {
        "t": "A compressed file cannot be cut",
        "short": "It becomes one big job.",
        "ctx": "A gzip file has to be read from its first byte. If one worker started in the middle, it could not make sense of the bytes. So a 5 GB gzip file becomes one job on one worker, and the other workers sit idle.",
        "fix": "Use a compression format that has safe restart points, or write many smaller gzip files. The planner keeps one piece per file when the format cannot be cut."
      },
      {
        "t": "Listing millions of files is slow",
        "short": "Planning itself can take minutes.",
        "ctx": "To plan, the driver must ask the folder for every file name and size. With millions of small files this is slow, and only the driver does it, so nothing else can start.",
        "fix": "Write fewer, larger files, or use a table format that already keeps the file list, so the driver does not have to ask the folder each time."
      }
    ],
    "invariant": "Re-planning the same snapshot gives the same partitions.",
    "animation": {
      "kind": "pack",
      "target": 128,
      "open": 4,
      "max": 300,
      "steps": [
        {
          "title": "Look at the folder",
          "text": "The folder has five files. The bars are drawn to one scale, so big.csv is much longer than the others.",
          "lane": [
            {
              "name": "big.csv",
              "size": 300,
              "tone": "big",
              "done": false
            },
            {
              "name": "a.csv",
              "size": 5,
              "tone": "file",
              "done": false
            },
            {
              "name": "b.csv",
              "size": 8,
              "tone": "file",
              "done": false
            },
            {
              "name": "c.csv",
              "size": 4,
              "tone": "file",
              "done": false
            },
            {
              "name": "logs.gz",
              "size": 90,
              "tone": "file",
              "done": false
            }
          ],
          "tasks": [],
          "check": "total: 300 + 5 + 8 + 4 + 90 = 407 MB"
        },
        {
          "title": "Set the two rules",
          "text": "Each task should read about 128 MB of data. Opening every file also costs 4 MB of work, so a file counts a little more than its size when tasks are filled.",
          "lane": [
            {
              "name": "big.csv",
              "size": 300,
              "tone": "big",
              "done": false
            },
            {
              "name": "a.csv",
              "size": 5,
              "tone": "file",
              "done": false
            },
            {
              "name": "b.csv",
              "size": 8,
              "tone": "file",
              "done": false
            },
            {
              "name": "c.csv",
              "size": 4,
              "tone": "file",
              "done": false
            },
            {
              "name": "logs.gz",
              "size": 90,
              "tone": "file",
              "done": false
            }
          ],
          "tasks": [],
          "check": "target 128 MB · open cost 4 MB per file"
        },
        {
          "title": "Cut the big file",
          "text": "A plain CSV can be read from any byte, so big.csv can be cut every 128 MB. The last piece is what is left over: 44 MB.",
          "lane": [
            {
              "name": "big.csv part 1",
              "size": 128,
              "tone": "piece",
              "done": false
            },
            {
              "name": "big.csv part 2",
              "size": 128,
              "tone": "piece",
              "done": false
            },
            {
              "name": "big.csv part 3",
              "size": 44,
              "tone": "piece",
              "done": false
            },
            {
              "name": "a.csv",
              "size": 5,
              "tone": "file",
              "done": false
            },
            {
              "name": "b.csv",
              "size": 8,
              "tone": "file",
              "done": false
            },
            {
              "name": "c.csv",
              "size": 4,
              "tone": "file",
              "done": false
            },
            {
              "name": "logs.gz",
              "size": 90,
              "tone": "file",
              "done": false
            }
          ],
          "tasks": [],
          "check": "300 = 128 + 128 + 44"
        },
        {
          "title": "Keep the zipped file whole",
          "text": "logs.gz is compressed. A reader cannot start in the middle of it, so it stays one 90 MB piece, even though it is under the target.",
          "lane": [
            {
              "name": "big.csv part 1",
              "size": 128,
              "tone": "piece",
              "done": false
            },
            {
              "name": "big.csv part 2",
              "size": 128,
              "tone": "piece",
              "done": false
            },
            {
              "name": "big.csv part 3",
              "size": 44,
              "tone": "piece",
              "done": false
            },
            {
              "name": "a.csv",
              "size": 5,
              "tone": "file",
              "done": false
            },
            {
              "name": "b.csv",
              "size": 8,
              "tone": "file",
              "done": false
            },
            {
              "name": "c.csv",
              "size": 4,
              "tone": "file",
              "done": false
            },
            {
              "name": "logs.gz",
              "size": 90,
              "tone": "lock",
              "done": false
            }
          ],
          "tasks": [],
          "check": "logs.gz: cannot be cut, so 1 piece"
        },
        {
          "title": "Sort biggest first",
          "text": "Spark orders the pieces from biggest to smallest, then fills tasks in that order. Each piece is checked as shown in the line under the picture.",
          "lane": [
            {
              "name": "big.csv part 1",
              "size": 128,
              "tone": "piece",
              "done": false
            },
            {
              "name": "big.csv part 2",
              "size": 128,
              "tone": "piece",
              "done": false
            },
            {
              "name": "logs.gz",
              "size": 90,
              "tone": "lock",
              "done": false
            },
            {
              "name": "big.csv part 3",
              "size": 44,
              "tone": "piece",
              "done": false
            },
            {
              "name": "b.csv",
              "size": 8,
              "tone": "file",
              "done": false
            },
            {
              "name": "a.csv",
              "size": 5,
              "tone": "file",
              "done": false
            },
            {
              "name": "c.csv",
              "size": 4,
              "tone": "file",
              "done": false
            }
          ],
          "tasks": [],
          "check": "order: 128, 128, 90, 44, 8, 5, 4"
        },
        {
          "title": "Task 1 takes part 1",
          "text": "Task 1 is empty, so part 1 goes in. Its open cost is added to the total, which makes Task 1 count as 132 MB.",
          "lane": [
            {
              "name": "big.csv part 1",
              "size": 128,
              "tone": "piece",
              "done": true
            },
            {
              "name": "big.csv part 2",
              "size": 128,
              "tone": "piece",
              "done": false
            },
            {
              "name": "logs.gz",
              "size": 90,
              "tone": "lock",
              "done": false
            },
            {
              "name": "big.csv part 3",
              "size": 44,
              "tone": "piece",
              "done": false
            },
            {
              "name": "b.csv",
              "size": 8,
              "tone": "file",
              "done": false
            },
            {
              "name": "a.csv",
              "size": 5,
              "tone": "file",
              "done": false
            },
            {
              "name": "c.csv",
              "size": 4,
              "tone": "file",
              "done": false
            }
          ],
          "tasks": [
            [
              {
                "name": "big.csv part 1",
                "size": 128,
                "tone": "piece",
                "done": false
              }
            ]
          ],
          "check": "check: 0 + 128 is not over 128, so it fits.  total: 128 + 4 = 132"
        },
        {
          "title": "Part 2 starts Task 2",
          "text": "Task 1 is at 132. Adding part 2 would reach 260, which is over 128, so part 2 starts Task 2.",
          "lane": [
            {
              "name": "big.csv part 1",
              "size": 128,
              "tone": "piece",
              "done": true
            },
            {
              "name": "big.csv part 2",
              "size": 128,
              "tone": "piece",
              "done": true
            },
            {
              "name": "logs.gz",
              "size": 90,
              "tone": "lock",
              "done": false
            },
            {
              "name": "big.csv part 3",
              "size": 44,
              "tone": "piece",
              "done": false
            },
            {
              "name": "b.csv",
              "size": 8,
              "tone": "file",
              "done": false
            },
            {
              "name": "a.csv",
              "size": 5,
              "tone": "file",
              "done": false
            },
            {
              "name": "c.csv",
              "size": 4,
              "tone": "file",
              "done": false
            }
          ],
          "tasks": [
            [
              {
                "name": "big.csv part 1",
                "size": 128,
                "tone": "piece",
                "done": false
              }
            ],
            [
              {
                "name": "big.csv part 2",
                "size": 128,
                "tone": "piece",
                "done": false
              }
            ]
          ],
          "check": "check: 132 + 128 = 260, over 128, so a new task"
        },
        {
          "title": "logs.gz starts Task 3",
          "text": "Task 2 is at 132. Adding logs.gz (90) would reach 222, so logs.gz starts Task 3. It counts as 94 with its open cost.",
          "lane": [
            {
              "name": "big.csv part 1",
              "size": 128,
              "tone": "piece",
              "done": true
            },
            {
              "name": "big.csv part 2",
              "size": 128,
              "tone": "piece",
              "done": true
            },
            {
              "name": "logs.gz",
              "size": 90,
              "tone": "lock",
              "done": true
            },
            {
              "name": "big.csv part 3",
              "size": 44,
              "tone": "piece",
              "done": false
            },
            {
              "name": "b.csv",
              "size": 8,
              "tone": "file",
              "done": false
            },
            {
              "name": "a.csv",
              "size": 5,
              "tone": "file",
              "done": false
            },
            {
              "name": "c.csv",
              "size": 4,
              "tone": "file",
              "done": false
            }
          ],
          "tasks": [
            [
              {
                "name": "big.csv part 1",
                "size": 128,
                "tone": "piece",
                "done": false
              }
            ],
            [
              {
                "name": "big.csv part 2",
                "size": 128,
                "tone": "piece",
                "done": false
              }
            ],
            [
              {
                "name": "logs.gz",
                "size": 90,
                "tone": "lock",
                "done": false
              }
            ]
          ],
          "check": "check: 132 + 90 = 222, over 128, so a new task"
        },
        {
          "title": "Part 3 starts Task 4",
          "text": "Task 3 is at 94. Adding part 3 (44) would reach 138, so part 3 starts Task 4.",
          "lane": [
            {
              "name": "big.csv part 1",
              "size": 128,
              "tone": "piece",
              "done": true
            },
            {
              "name": "big.csv part 2",
              "size": 128,
              "tone": "piece",
              "done": true
            },
            {
              "name": "logs.gz",
              "size": 90,
              "tone": "lock",
              "done": true
            },
            {
              "name": "big.csv part 3",
              "size": 44,
              "tone": "piece",
              "done": true
            },
            {
              "name": "b.csv",
              "size": 8,
              "tone": "file",
              "done": false
            },
            {
              "name": "a.csv",
              "size": 5,
              "tone": "file",
              "done": false
            },
            {
              "name": "c.csv",
              "size": 4,
              "tone": "file",
              "done": false
            }
          ],
          "tasks": [
            [
              {
                "name": "big.csv part 1",
                "size": 128,
                "tone": "piece",
                "done": false
              }
            ],
            [
              {
                "name": "big.csv part 2",
                "size": 128,
                "tone": "piece",
                "done": false
              }
            ],
            [
              {
                "name": "logs.gz",
                "size": 90,
                "tone": "lock",
                "done": false
              }
            ],
            [
              {
                "name": "big.csv part 3",
                "size": 44,
                "tone": "piece",
                "done": false
              }
            ]
          ],
          "check": "check: 94 + 44 = 138, over 128, so a new task"
        },
        {
          "title": "Small files join Task 4",
          "text": "Task 4 is at 48. b.csv fits, then a.csv and c.csv. Every check passes, so all three join Task 4.",
          "lane": [
            {
              "name": "big.csv part 1",
              "size": 128,
              "tone": "piece",
              "done": true
            },
            {
              "name": "big.csv part 2",
              "size": 128,
              "tone": "piece",
              "done": true
            },
            {
              "name": "logs.gz",
              "size": 90,
              "tone": "lock",
              "done": true
            },
            {
              "name": "big.csv part 3",
              "size": 44,
              "tone": "piece",
              "done": true
            },
            {
              "name": "b.csv",
              "size": 8,
              "tone": "file",
              "done": true
            },
            {
              "name": "a.csv",
              "size": 5,
              "tone": "file",
              "done": true
            },
            {
              "name": "c.csv",
              "size": 4,
              "tone": "file",
              "done": true
            }
          ],
          "tasks": [
            [
              {
                "name": "big.csv part 1",
                "size": 128,
                "tone": "piece",
                "done": false
              }
            ],
            [
              {
                "name": "big.csv part 2",
                "size": 128,
                "tone": "piece",
                "done": false
              }
            ],
            [
              {
                "name": "logs.gz",
                "size": 90,
                "tone": "lock",
                "done": false
              }
            ],
            [
              {
                "name": "big.csv part 3",
                "size": 44,
                "tone": "piece",
                "done": false
              },
              {
                "name": "b.csv",
                "size": 8,
                "tone": "file",
                "done": false
              },
              {
                "name": "a.csv",
                "size": 5,
                "tone": "file",
                "done": false
              },
              {
                "name": "c.csv",
                "size": 4,
                "tone": "file",
                "done": false
              }
            ]
          ],
          "check": "check: 48 + 8 = 56, 60 + 5 = 65, 69 + 4 = 73, all under 128"
        },
        {
          "title": "Four tasks from five files",
          "text": "Five files became four tasks. The plan depends only on the file sizes, so the same folder always gives the same plan, and a failed task can safely run again.",
          "lane": [
            {
              "name": "big.csv part 1",
              "size": 128,
              "tone": "piece",
              "done": true
            },
            {
              "name": "big.csv part 2",
              "size": 128,
              "tone": "piece",
              "done": true
            },
            {
              "name": "logs.gz",
              "size": 90,
              "tone": "lock",
              "done": true
            },
            {
              "name": "big.csv part 3",
              "size": 44,
              "tone": "piece",
              "done": true
            },
            {
              "name": "b.csv",
              "size": 8,
              "tone": "file",
              "done": true
            },
            {
              "name": "a.csv",
              "size": 5,
              "tone": "file",
              "done": true
            },
            {
              "name": "c.csv",
              "size": 4,
              "tone": "file",
              "done": true
            }
          ],
          "tasks": [
            [
              {
                "name": "big.csv part 1",
                "size": 128,
                "tone": "piece",
                "done": false
              }
            ],
            [
              {
                "name": "big.csv part 2",
                "size": 128,
                "tone": "piece",
                "done": false
              }
            ],
            [
              {
                "name": "logs.gz",
                "size": 90,
                "tone": "lock",
                "done": false
              }
            ],
            [
              {
                "name": "big.csv part 3",
                "size": 44,
                "tone": "piece",
                "done": false
              },
              {
                "name": "b.csv",
                "size": 8,
                "tone": "file",
                "done": false
              },
              {
                "name": "a.csv",
                "size": 5,
                "tone": "file",
                "done": false
              },
              {
                "name": "c.csv",
                "size": 4,
                "tone": "file",
                "done": false
              }
            ]
          ],
          "check": "Task 4: 61 MB of data + 16 MB open cost = 77 MB counted"
        }
      ]
    }
  },
  {
    "title": "Read only the row groups a query needs",
    "blurb": "A Parquet file keeps a small summary, so most of it can be skipped.",
    "intro": "A Parquet file is split into row groups, and its footer records the smallest and biggest value of each column in each group. A filter can use those numbers to skip whole groups without reading them.",
    "trigger": "A query wants orders above 500 and only the city column, from a Parquet file that holds many rows in row groups.",
    "run": "spark.read.parquet(\"orders.parquet\").filter(\"amount > 500\").select(\"city\").show()",
    "expect": "The query reads 2 of 3 row groups and 4 of 12 column chunks, and returns the same rows as a full read.",
    "edges": [
      {
        "t": "The file has no statistics",
        "short": "Nothing can be skipped.",
        "ctx": "Some older writers do not store the smallest and biggest value. The reader has nothing to check against, so it must read every group.",
        "fix": "The answer is still right, just slower. Write files with a current writer, which stores the statistics."
      },
      {
        "t": "Values are mixed up in every group",
        "short": "Every group overlaps the range.",
        "ctx": "If rows were written in random order, each group covers almost the whole range of amount. The min and max then rule out nothing.",
        "fix": "Sort rows by the filter column before writing. Each group then covers a narrow range, and most can be skipped."
      },
      {
        "t": "Millions of tiny row groups",
        "short": "The footer gets big and planning slows.",
        "ctx": "A file with millions of tiny groups has a huge footer. The planner must read all of it before the first task can start.",
        "fix": "Write larger row groups, tens to hundreds of megabytes each."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "map",
      "cols": [
        "id",
        "city",
        "amount",
        "note"
      ],
      "line": 500,
      "scale": 10000,
      "groups": [
        {
          "name": "group 1",
          "min": 10,
          "max": 300,
          "dots": [
            {
              "v": 10
            },
            {
              "v": 45
            },
            {
              "v": 80
            },
            {
              "v": 130
            },
            {
              "v": 210
            },
            {
              "v": 255
            },
            {
              "v": 290
            },
            {
              "v": 300
            }
          ]
        },
        {
          "name": "group 2",
          "min": 120,
          "max": 9000,
          "dots": [
            {
              "v": 120
            },
            {
              "v": 260
            },
            {
              "v": 340
            },
            {
              "v": 480
            },
            {
              "v": 530,
              "c": "Hue"
            },
            {
              "v": 610,
              "c": "Hanoi"
            },
            {
              "v": 880,
              "c": "Da Nang"
            },
            {
              "v": 9000,
              "c": "Saigon"
            }
          ]
        },
        {
          "name": "group 3",
          "min": 600,
          "max": 800,
          "dots": [
            {
              "v": 600,
              "c": "Hue"
            },
            {
              "v": 640,
              "c": "Hanoi"
            },
            {
              "v": 680,
              "c": "Da Nang"
            },
            {
              "v": 700,
              "c": "Saigon"
            },
            {
              "v": 720,
              "c": "Hue"
            },
            {
              "v": 750,
              "c": "Hanoi"
            },
            {
              "v": 780,
              "c": "Da Nang"
            },
            {
              "v": 800,
              "c": "Saigon"
            }
          ]
        }
      ],
      "steps": [
        {
          "title": "Three row groups, nothing read yet",
          "text": "The file has three row groups of about 100,000 rows each, and four columns. The query wants amount above 500 and only the city column. The reader knows nothing about the rows yet.",
          "footer": "idle",
          "groups": [
            {
              "state": "hidden",
              "cols": [
                "idle",
                "idle",
                "idle",
                "idle"
              ],
              "test": false
            },
            {
              "state": "hidden",
              "cols": [
                "idle",
                "idle",
                "idle",
                "idle"
              ],
              "test": false
            },
            {
              "state": "hidden",
              "cols": [
                "idle",
                "idle",
                "idle",
                "idle"
              ],
              "test": false
            }
          ]
        },
        {
          "title": "Read the footer first",
          "text": "The footer sits at the end of the file and is small. It records the smallest and biggest amount in each row group. Those become the bars on the right. The dashed line is 500.",
          "footer": "read",
          "groups": [
            {
              "state": "known",
              "cols": [
                "idle",
                "idle",
                "idle",
                "idle"
              ],
              "test": false
            },
            {
              "state": "known",
              "cols": [
                "idle",
                "idle",
                "idle",
                "idle"
              ],
              "test": false
            },
            {
              "state": "known",
              "cols": [
                "idle",
                "idle",
                "idle",
                "idle"
              ],
              "test": false
            }
          ]
        },
        {
          "title": "Group 1 is ruled out",
          "text": "Group 1 only reaches 300, which is left of the line. None of its rows can match, so the whole group is skipped and none of its cells is read.",
          "footer": "read",
          "groups": [
            {
              "state": "skipped",
              "cols": [
                "skip",
                "skip",
                "skip",
                "skip"
              ],
              "test": false
            },
            {
              "state": "known",
              "cols": [
                "idle",
                "idle",
                "idle",
                "idle"
              ],
              "test": false
            },
            {
              "state": "known",
              "cols": [
                "idle",
                "idle",
                "idle",
                "idle"
              ],
              "test": false
            }
          ]
        },
        {
          "title": "Group 2: read two columns only",
          "text": "Group 2 runs from 120 to 9000, so some rows could pass. The reader reads its amount and city cells. The id and note cells stay on disk. The dots are sample rows.",
          "footer": "read",
          "groups": [
            {
              "state": "skipped",
              "cols": [
                "skip",
                "skip",
                "skip",
                "skip"
              ],
              "test": false
            },
            {
              "state": "read",
              "cols": [
                "unread",
                "read",
                "read",
                "unread"
              ],
              "test": false
            },
            {
              "state": "known",
              "cols": [
                "idle",
                "idle",
                "idle",
                "idle"
              ],
              "test": false
            }
          ]
        },
        {
          "title": "Check each row against the line",
          "text": "Each dot is a row. Dots not above 500 turn grey and are dropped. The rest give their city to the result.",
          "footer": "read",
          "groups": [
            {
              "state": "skipped",
              "cols": [
                "skip",
                "skip",
                "skip",
                "skip"
              ],
              "test": false
            },
            {
              "state": "read",
              "cols": [
                "unread",
                "read",
                "read",
                "unread"
              ],
              "test": true
            },
            {
              "state": "known",
              "cols": [
                "idle",
                "idle",
                "idle",
                "idle"
              ],
              "test": false
            }
          ]
        },
        {
          "title": "Group 3 is fully above the line",
          "text": "Group 3 starts at 600, so every row in it passes. Its amount and city cells are read the same way, and its cities join the result.",
          "footer": "read",
          "groups": [
            {
              "state": "skipped",
              "cols": [
                "skip",
                "skip",
                "skip",
                "skip"
              ],
              "test": false
            },
            {
              "state": "read",
              "cols": [
                "unread",
                "read",
                "read",
                "unread"
              ],
              "test": true
            },
            {
              "state": "read",
              "cols": [
                "unread",
                "read",
                "read",
                "unread"
              ],
              "test": true
            }
          ]
        },
        {
          "title": "The answer, and what was saved",
          "text": "The query read 2 of 3 row groups and 4 of the 12 column chunks. The note column was never read in any group. The result is the same as reading the whole file.",
          "footer": "read",
          "never": true,
          "groups": [
            {
              "state": "skipped",
              "cols": [
                "skip",
                "skip",
                "skip",
                "skip"
              ],
              "test": false
            },
            {
              "state": "read",
              "cols": [
                "unread",
                "read",
                "read",
                "unread"
              ],
              "test": true
            },
            {
              "state": "read",
              "cols": [
                "unread",
                "read",
                "read",
                "unread"
              ],
              "test": true
            }
          ]
        }
      ]
    }
  },
  {
    "title": "Skip folders that a filter rules out",
    "blurb": "A date in a folder name lets the planner skip whole folders.",
    "intro": "Many tables are stored as folders named after a column, such as date=2026-10-03. The planner reads the folder names and never opens the files in folders that cannot match.",
    "trigger": "The orders table is stored as one folder per day, and the query needs only one day.",
    "run": "spark.read.parquet(\"orders/\").where(\"date = '2026-10-03'\").count()",
    "expect": "Only the 4 files in date=2026-10-03 become tasks. The other 6 files are never opened.",
    "edges": [
      {
        "t": "The filter is on a column that is not in the name",
        "short": "No folder can be skipped.",
        "ctx": "If the query filters on amount, the folder names say nothing about amount. Every folder must be opened.",
        "fix": "Choose folders that match the common filters, or use a table format that keeps per-file statistics."
      },
      {
        "t": "Millions of folders",
        "short": "Listing becomes the slow part.",
        "ctx": "Each folder is one listing call. With millions of partitions, the planner spends minutes listing before any work starts.",
        "fix": "Use coarser folders, such as one per month, or keep a catalog of partitions."
      },
      {
        "t": "One value written two ways",
        "short": "The planner may keep one folder and drop the other.",
        "ctx": "If one folder is named date=2026-10-3 and another date=2026-10-03, a comparison on the name can treat them differently.",
        "fix": "Write one fixed format for partition values, and check folder names when the table is written."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "tree",
      "query": "WHERE date = 2026-10-03",
      "match": "date=2026-10-03",
      "folders": [
        {
          "name": "date=2026-10-01",
          "files": [
            "part-0",
            "part-1",
            "part-2"
          ]
        },
        {
          "name": "date=2026-10-02",
          "files": [
            "part-0",
            "part-1"
          ]
        },
        {
          "name": "date=2026-10-03",
          "files": [
            "part-0",
            "part-1",
            "part-2",
            "part-3"
          ]
        },
        {
          "name": "date=2026-10-04",
          "files": [
            "part-0"
          ]
        }
      ],
      "steps": [
        {
          "title": "Ten files in four folders",
          "text": "Orders are stored in one folder per day, and the folder name holds the date. Ten files are spread over four folders. The query needs only one day."
        },
        {
          "title": "The query arrives",
          "text": "The query asks for WHERE date = 2026-10-03. The folder names carry this column, so the planner can use them.",
          "query": true
        },
        {
          "title": "Read the folder names only",
          "text": "The planner reads the four folder names. It does not open any file, so nothing inside the folders is touched.",
          "query": true,
          "checked": true
        },
        {
          "title": "Rule out the other folders",
          "text": "The folders for 10-01, 10-02 and 10-04 cannot hold 10-03 rows, so they are ruled out. Their 6 files never enter the plan.",
          "query": true,
          "checked": true,
          "ruled": [
            0,
            1,
            3
          ]
        },
        {
          "title": "Open the matching folder",
          "text": "The one folder that matches is opened, and its 4 files go into the plan.",
          "query": true,
          "checked": true,
          "ruled": [
            0,
            1,
            3
          ],
          "open": [
            2
          ]
        },
        {
          "title": "One task per file",
          "text": "Each of the 4 files becomes one task. The 6 files in the other folders cost nothing.",
          "query": true,
          "checked": true,
          "ruled": [
            0,
            1,
            3
          ],
          "open": [
            2
          ],
          "tasks": true
        },
        {
          "title": "The result",
          "text": "The plan came from folder names alone, so it stays quick even when the other folders hold far more data. Ruling out a folder is one check, not one read per file.",
          "query": true,
          "checked": true,
          "ruled": [
            0,
            1,
            3
          ],
          "open": [
            2
          ],
          "tasks": true
        }
      ]
    }
  },
  {
    "title": "Handle a row that does not match the schema",
    "blurb": "One bad line should not silently change the answer.",
    "intro": "A CSV row may have too few columns, or a value that is not a number. The reader follows a chosen mode: keep the row, drop it, or stop the job. Each mode gives a different answer, so the choice matters.",
    "trigger": "A CSV file has rows that do not match the schema. The reader must decide what to do with each bad row.",
    "run": "spark.read.schema(\"name STRING, age INT, city STRING\").option(\"mode\", \"PERMISSIVE\").csv(\"people.csv\").show()",
    "expect": "It depends on the mode. PERMISSIVE keeps all 5 rows and marks 2. DROPMALFORMED keeps 3 with no warning. FAILFAST fails at row 3.",
    "edges": [
      {
        "t": "Rows vanish without a trace",
        "short": "Totals look fine but are too small.",
        "ctx": "DROPMALFORMED removes rows silently. A report built on the output is quietly wrong, and nothing fails.",
        "fix": "Count rows read and rows kept, and fail a check when they differ. Prefer PERMISSIVE and review the marked rows."
      },
      {
        "t": "Null values change the answer",
        "short": "An average can look plausible and still be wrong.",
        "ctx": "PERMISSIVE keeps rows with a null where a value was bad. An average of age then skips those rows, which can hide the problem.",
        "fix": "Look at the _corrupt_record column after loading, and decide for each report whether null rows should count."
      },
      {
        "t": "A quoted line break",
        "short": "The line number in the error is wrong.",
        "ctx": "A quoted cell can contain a line break, so one row spans two lines. The reported line number then no longer matches the file.",
        "fix": "Report the record number instead of the line number, or use a format with fixed-size records."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "compare",
      "header": [
        "name",
        "age",
        "city"
      ],
      "rows": [
        {
          "name": "Ann",
          "age": "31",
          "city": "Hanoi"
        },
        {
          "name": "Binh",
          "age": "27",
          "city": "Hue"
        },
        {
          "name": "Chi",
          "age": "abc",
          "city": "Da Nang",
          "bad": "age",
          "issue": "age is not a number"
        },
        {
          "name": "Dung",
          "age": "40",
          "city": null,
          "bad": "city",
          "issue": "only 2 fields"
        },
        {
          "name": "Lan",
          "age": "35",
          "city": "Saigon"
        }
      ],
      "steps": [
        {
          "upto": 0,
          "title": "The same file, three modes",
          "text": "The file has five rows, and the schema says age is a number. Each lane below shows what one mode would write. Press Next to read the next row."
        },
        {
          "upto": 1,
          "title": "Row 1 fits",
          "text": "Ann is 31 and the row has three fields. Every mode keeps it."
        },
        {
          "upto": 2,
          "title": "Row 2 fits",
          "text": "Binh is 27 and the row is complete. Every mode keeps it."
        },
        {
          "upto": 3,
          "title": "Row 3 has a bad age",
          "text": "The age is \"abc\", which is not a number. Each mode now behaves differently. FAILFAST stops here, and nothing it read so far is written."
        },
        {
          "upto": 4,
          "title": "Row 4 has only two fields",
          "text": "Dung has no city. PERMISSIVE keeps the row with a null city and saves the raw line. DROPMALFORMED drops it with no warning. FAILFAST has already stopped."
        },
        {
          "upto": 5,
          "title": "Row 5 fits",
          "text": "Lan is fine. PERMISSIVE and DROPMALFORMED both keep it. FAILFAST never reads it."
        },
        {
          "upto": 5,
          "summary": true,
          "title": "Same input, three answers",
          "text": "The output has 5 rows, 3 rows, or nothing. Only PERMISSIVE shows the problem rows. Choose the mode before the job runs, and check the marked rows."
        }
      ]
    }
  }
];
CourseData.uc["pipeline"] = [
  {
    "title": "Consumer asks for the next pair",
    "blurb": "Each step asks the one before it for a row, so only one row is in flight.",
    "intro": "One request may scan several rows before one passes.",
    "trigger": "The consumer asks for the next result from a chain of reader, filter and map.",
    "run": "rows.filter(lambda x: x > 10).map(lambda x: (x, 2 * x)).take(1)",
    "expect": "The consumer gets one result, the pair (12, 24). Only rows 5 and 12 were read.",
    "edges": [
      {
        "t": "No row passes the test",
        "short": "The chain just runs out.",
        "ctx": "The filter keeps asking the reader, and every row fails. At the end of the file the reader says it has nothing more.",
        "fix": "The &quot;nothing more&quot; answer travels back up the chain and the consumer finishes normally with zero rows. That is a valid result."
      },
      {
        "t": "The test itself crashes",
        "short": "One bad row must not kill the whole program.",
        "ctx": "A rule such as &quot;age is more than 10&quot; crashes on a row where age is blank.",
        "fix": "The error stops only this task attempt, not the whole process. The scheduler can retry the attempt, which is safe because every step only reads and transforms."
      }
    ],
    "invariant": "At most one row per operator is in flight.",
    "animation": {
      "kind": "slots",
      "rows": 4,
      "nodes": [
        "reader",
        "filter",
        "map",
        "consumer"
      ],
      "steps": [
        {
          "title": "Nothing has run yet",
          "text": "The file has four rows: 5, 12, 3 and 20. The chain is reader, filter, map, then the consumer. Each box can hold one row at a time.",
          "src": [
            "5",
            "12",
            "3",
            "20"
          ],
          "slots": [
            null,
            null,
            null,
            null
          ]
        },
        {
          "title": "The consumer asks for a result",
          "text": "The consumer calls next on map. Nothing moves until someone asks.",
          "src": [
            "5",
            "12",
            "3",
            "20"
          ],
          "slots": [
            null,
            null,
            null,
            null
          ],
          "arrow": {
            "gap": 2,
            "dir": "left",
            "label": "next()"
          }
        },
        {
          "title": "Map asks filter",
          "text": "Map has nothing to give yet, so it asks filter for a row.",
          "src": [
            "5",
            "12",
            "3",
            "20"
          ],
          "slots": [
            null,
            null,
            null,
            null
          ],
          "arrow": {
            "gap": 1,
            "dir": "left",
            "label": "next()"
          }
        },
        {
          "title": "Filter asks the reader",
          "text": "Filter has nothing either, so it asks the reader for a row.",
          "src": [
            "5",
            "12",
            "3",
            "20"
          ],
          "slots": [
            null,
            null,
            null,
            null
          ],
          "arrow": {
            "gap": 0,
            "dir": "left",
            "label": "next()"
          }
        },
        {
          "title": "Row 5 arrives and fails",
          "text": "The reader hands over row 5. Filter keeps only rows above 10, so it rejects 5. Map and the consumer never see it.",
          "src": [
            "12",
            "3",
            "20"
          ],
          "slots": [
            null,
            "5",
            null,
            null
          ],
          "flag": {
            "1": "fail"
          },
          "arrow": {
            "gap": 0,
            "dir": "right",
            "label": "row 5"
          },
          "note": "5 is not above 10"
        },
        {
          "title": "Filter asks again",
          "text": "Row 5 is dropped, so filter asks the reader for another row.",
          "src": [
            "12",
            "3",
            "20"
          ],
          "slots": [
            null,
            null,
            null,
            null
          ],
          "arrow": {
            "gap": 0,
            "dir": "left",
            "label": "next()"
          },
          "note": "nothing has passed yet, so the chain keeps pulling"
        },
        {
          "title": "Row 12 arrives and passes",
          "text": "The reader hands over row 12. It is above 10, so filter keeps it.",
          "src": [
            "3",
            "20"
          ],
          "slots": [
            null,
            "12",
            null,
            null
          ],
          "flag": {
            "1": "pass"
          },
          "arrow": {
            "gap": 0,
            "dir": "right",
            "label": "row 12"
          },
          "note": "12 is above 10"
        },
        {
          "title": "Row 12 moves up",
          "text": "Filter passes row 12 to map.",
          "src": [
            "3",
            "20"
          ],
          "slots": [
            null,
            null,
            "12",
            null
          ],
          "arrow": {
            "gap": 1,
            "dir": "right",
            "label": "row 12"
          }
        },
        {
          "title": "Map builds the pair",
          "text": "Map turns 12 into the pair (12, 24) and gives it to the consumer. The consumer now holds one result.",
          "src": [
            "3",
            "20"
          ],
          "slots": [
            null,
            null,
            null,
            "(12, 24)"
          ],
          "arrow": {
            "gap": 2,
            "dir": "right",
            "label": "pair"
          }
        },
        {
          "title": "Rows 3 and 20 were never touched",
          "text": "No box ever held more than one row. Rows 3 and 20 stay in the file until the consumer asks again.",
          "src": [
            "3",
            "20"
          ],
          "slots": [
            null,
            null,
            null,
            "(12, 24)"
          ],
          "note": "the consumer holds the result, and the chain is empty"
        }
      ]
    }
  },
  {
    "title": "Own the resource lifetime",
    "blurb": "Each attempt opens its own reader and closes it on every exit path.",
    "intro": "A lazy iterator outlives the call that created it.",
    "trigger": "A task attempt starts, reads its file, and then ends, crashes or is retried.",
    "run": "spark.read.csv(\"events.csv\").write.mode(\"overwrite\").parquet(\"out/\")",
    "expect": "Every attempt closes the reader it opened, and at most one reader is open at any time.",
    "edges": [
      {
        "t": "Closing too early",
        "short": "The first read fails.",
        "ctx": "If the code closes the file right after creating the chain, but the rows are pulled later, the reader is already closed on the first pull.",
        "fix": "Close the reader when the attempt ends, not when the chain is built."
      },
      {
        "t": "A leaked reader",
        "short": "Retries slowly use up all file handles.",
        "ctx": "If an attempt forgets to close its reader after a failure, every retry leaves one more file open. Thousands of retries can run the machine out of open files.",
        "fix": "Always close in a &quot;finally&quot; step that runs on success, failure and cancel."
      },
      {
        "t": "A retry repeats a write",
        "short": "Rows can be written twice.",
        "ctx": "Attempt 2 writes two rows to a database before it crashes. Attempt 3 starts from the top and writes the same rows again.",
        "fix": "Keep map steps free of side effects, or make the write safe to repeat, such as an upsert keyed by row id. Commit output only from the attempt that finishes."
      }
    ],
    "invariant": "Every opened resource is closed exactly once.",
    "animation": {
      "kind": "swim",
      "tMax": 10,
      "lanes": [
        {
          "name": "attempt 1",
          "task": [
            0,
            3.4
          ],
          "reader": [
            1,
            3.2
          ],
          "result": "ok",
          "marks": [
            {
              "at": 2,
              "label": "rows pulled"
            },
            {
              "at": 3,
              "label": "rows run out"
            },
            {
              "at": 3.2,
              "label": "close ✓",
              "kind": "ok"
            }
          ]
        },
        {
          "name": "attempt 2",
          "task": [
            4,
            5.5
          ],
          "reader": [
            4.2,
            5.5
          ],
          "result": "bad",
          "marks": [
            {
              "at": 4.8,
              "label": "2 rows read"
            },
            {
              "at": 5.5,
              "label": "crash",
              "kind": "bad"
            }
          ]
        },
        {
          "name": "attempt 3",
          "task": [
            6,
            8.2
          ],
          "reader": [
            6.2,
            8
          ],
          "result": "ok",
          "marks": [
            {
              "at": 8,
              "label": "close ✓",
              "kind": "ok"
            }
          ]
        }
      ],
      "steps": [
        {
          "t": 0,
          "title": "Three attempts, one reader each",
          "text": "A task can run several attempts. Each attempt opens its own reader. Nothing is open yet."
        },
        {
          "t": 1.5,
          "title": "Attempt 1 opens a reader",
          "text": "Attempt 1 opens the file. From now on, one reader is open."
        },
        {
          "t": 2.5,
          "title": "Rows are pulled",
          "text": "The consumer pulls rows one at a time. The reader stays open for the whole pass."
        },
        {
          "t": 3.1,
          "title": "The rows run out",
          "text": "The reader reports that no rows are left. It is still open, though no more rows are needed."
        },
        {
          "t": 3.4,
          "title": "Attempt 1 closes its reader",
          "text": "Whatever the outcome, the attempt closes the reader it opened. No file handle is held now."
        },
        {
          "t": 5,
          "title": "Attempt 2 opens its own reader",
          "text": "The scheduler starts attempt 2. It opens a reader of its own, so it does not reuse the one from attempt 1."
        },
        {
          "t": 5.5,
          "title": "The executor crashes",
          "text": "Attempt 2 crashes after two rows. The close sits in a cleanup step, so it runs on this path too."
        },
        {
          "t": 6.8,
          "title": "Attempt 3 starts from the top",
          "text": "The scheduler retries. Attempt 3 opens a fresh reader and reads from the first row."
        },
        {
          "t": 8.2,
          "title": "Summary",
          "text": "At most one reader was open at a time. None is left open once the job ends."
        }
      ]
    }
  },
  {
    "title": "Fuse a chain of narrow steps into one pass",
    "blurb": "Map and filter need only the row in front of them, so the whole chain can run in one pass.",
    "intro": "Filter and map look at one row at a time. Spark can run them as one chain over the rows, instead of building a full list after every step.",
    "trigger": "A map and a filter run one after the other on the same rows, with no shuffle between them.",
    "run": "rows.filter(lambda x: x > 10).map(lambda x: (x, 2 * x)).count()",
    "expect": "The chain runs in one pass. Its peak memory is one row, against 18 rows for the eager version in this example.",
    "edges": [
      {
        "t": "A sort in the middle of the chain",
        "short": "The whole partition is held again.",
        "ctx": "A sort cannot output its first row until it has seen every row, so the chain stops there and the partition is held in memory.",
        "fix": "Spark sorts with spilling to disk when memory runs out. Keep sorts out of a narrow chain when you can, and plan memory for the ones you need."
      },
      {
        "t": "A side effect before a filter",
        "short": "The write happens even for rows that are dropped.",
        "ctx": "Map writes each row to a database, and a filter after it drops the row. The write has already happened.",
        "fix": "Put filters before side effects, so only rows that will be kept are written."
      },
      {
        "t": "One row expands into a huge list",
        "short": "The next step may need all of it at once.",
        "ctx": "A step that turns one row into a list of thousands is fine while it streams. A later step that must collect everything, such as a sort or a join, holds all of it.",
        "fix": "Keep the next step streaming, or split the big list into smaller rows before it."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "piles",
      "steps": [
        {
          "title": "Twelve rows, two ways to pass them on",
          "text": "The file has 12 rows. The filter keeps the ones above 10, which is 6 of them. Top lane: each step builds a full list. Bottom lane: one row moves through at a time.",
          "eager": {
            "say": "Nothing is copied yet. All 12 rows sit in the file.",
            "file": [
              "5",
              "12",
              "3",
              "20",
              "8",
              "15",
              "30",
              "2",
              "11",
              "7",
              "25",
              "9"
            ]
          },
          "pull": {
            "say": "Nothing is copied yet. Each row waits in the file.",
            "file": [
              "5",
              "12",
              "3",
              "20",
              "8",
              "15",
              "30",
              "2",
              "11",
              "7",
              "25",
              "9"
            ]
          }
        },
        {
          "title": "The reader takes its rows",
          "text": "Eager copies all 12 rows at once. Pull takes only what is needed right now, which is row 5.",
          "eager": {
            "say": "The reader copies all 12 rows into its own list.",
            "reader": [
              "5",
              "12",
              "3",
              "20",
              "8",
              "15",
              "30",
              "2",
              "11",
              "7",
              "25",
              "9"
            ]
          },
          "pull": {
            "say": "The reader takes row 5 only. The other rows stay in the file.",
            "reader": [
              "5"
            ],
            "file": [
              "12",
              "3",
              "20",
              "8",
              "15",
              "30",
              "2",
              "11",
              "7",
              "25",
              "9"
            ]
          }
        },
        {
          "title": "The filter checks the rows",
          "text": "This is the biggest difference. Eager now holds 18 rows at once: the reader list and the filter list. Pull holds one.",
          "eager": {
            "say": "Filter copies the 6 passing rows into its own list. The reader list is still full, so 18 rows are in memory.",
            "reader": [
              "5",
              "12",
              "3",
              "20",
              "8",
              "15",
              "30",
              "2",
              "11",
              "7",
              "25",
              "9"
            ],
            "filter": [
              "12",
              "20",
              "15",
              "30",
              "11",
              "25"
            ],
            "wait": [
              "reader"
            ]
          },
          "pull": {
            "say": "Row 5 fails the filter, so it is dropped. Row 12 is in the reader now.",
            "reader": [
              "12"
            ],
            "filter": [
              "✗5"
            ],
            "file": [
              "3",
              "20",
              "8",
              "15",
              "30",
              "2",
              "11",
              "7",
              "25",
              "9"
            ]
          }
        },
        {
          "title": "The reader list is released",
          "text": "Eager frees its reader list, which it no longer needs. Pull moves row 12 on, and the filter holds only that row.",
          "eager": {
            "say": "The reader list is no longer needed, so it is cleared. The filter list holds 6 rows.",
            "filter": [
              "12",
              "20",
              "15",
              "30",
              "11",
              "25"
            ]
          },
          "pull": {
            "say": "Row 12 is above 10, so filter keeps it. Still one row in memory.",
            "filter": [
              "✗5",
              "12"
            ],
            "file": [
              "3",
              "20",
              "8",
              "15",
              "30",
              "2",
              "11",
              "7",
              "25",
              "9"
            ]
          }
        },
        {
          "title": "Map makes the pairs",
          "text": "Eager now holds two lists at once: the filter list and the map list. Pull turns row 12 into a pair, and that is the only row in memory.",
          "eager": {
            "say": "Map builds 6 pairs while the filter list still exists, so 12 rows are in memory.",
            "filter": [
              "12",
              "20",
              "15",
              "30",
              "11",
              "25"
            ],
            "map": [
              "12→24",
              "20→40",
              "15→30",
              "30→60",
              "11→22",
              "25→50"
            ],
            "wait": [
              "filter"
            ]
          },
          "pull": {
            "say": "Map turns 12 into 12→24 and hands it on. The rest of the rows wait in the file.",
            "filter": [
              "✗5"
            ],
            "map": [
              "12→24"
            ],
            "file": [
              "3",
              "20",
              "8",
              "15",
              "30",
              "2",
              "11",
              "7",
              "25",
              "9"
            ]
          }
        },
        {
          "title": "The filter list is released",
          "text": "Eager is left with the 6 pairs. Pull hands its first pair to the consumer.",
          "eager": {
            "say": "The filter list is cleared. Only the 6 pairs are left.",
            "map": [
              "12→24",
              "20→40",
              "15→30",
              "30→60",
              "11→22",
              "25→50"
            ]
          },
          "pull": {
            "say": "The consumer takes 12→24. The next row is read only when it is asked for.",
            "out": [
              "12→24"
            ],
            "file": [
              "3",
              "20",
              "8",
              "15",
              "30",
              "2",
              "11",
              "7",
              "25",
              "9"
            ]
          }
        },
        {
          "title": "Peak memory",
          "text": "Eager peaked at 18 rows. Pull never held more than one. With a bigger file, the eager peak grows with it, and the pull peak stays at one row.",
          "eager": {
            "say": "The consumer gets all 6 pairs at the end.",
            "out": [
              "12→24",
              "20→40",
              "15→30",
              "30→60",
              "11→22",
              "25→50"
            ]
          },
          "pull": {
            "say": "Each pair goes to the consumer as it is made. Rows 3 and onward stay in the file.",
            "out": [
              "12→24"
            ],
            "file": [
              "3",
              "20",
              "8",
              "15",
              "30",
              "2",
              "11",
              "7",
              "25",
              "9"
            ]
          }
        }
      ]
    }
  },
  {
    "title": "Stop early when the consumer has enough rows",
    "blurb": "LIMIT stops the pipeline as soon as enough rows have passed.",
    "intro": "A consumer that needs three rows should not make the reader scan the whole file. Rows are pulled one at a time, so the reader stops as soon as the third row passes.",
    "trigger": "A query asks for the first three rows that pass a filter.",
    "run": "spark.read.parquet(\"events/\").filter(\"value > 10\").limit(3).show()",
    "expect": "The result is the first three passing rows, and the reader stops after row 15.",
    "edges": [
      {
        "t": "The filter almost never passes",
        "short": "LIMIT still reads nearly the whole file.",
        "ctx": "If only three rows in a billion pass, LIMIT 3 reads almost everything before it can stop.",
        "fix": "Use a filter the storage can skip, such as partition folders or row group statistics, so the rows are never read."
      },
      {
        "t": "ORDER BY before LIMIT",
        "short": "The reader cannot stop early.",
        "ctx": "To know the top three rows, every row has to be compared, so the scan cannot stop after three.",
        "fix": "Spark keeps only the best three rows seen so far in each partition. Memory stays small, but every row is still read."
      },
      {
        "t": "Many partitions",
        "short": "Some extra rows are read.",
        "ctx": "Spark does not stop row by row across partitions. It reads a few partitions first and more only if it still needs rows, so it can read a little more than needed.",
        "fix": "Accept the small extra cost. Only tune the scale-up setting if LIMIT itself is the bottleneck."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "basket",
      "rowsN": 24,
      "limit": 3,
      "threshold": 10,
      "values": [
        5,
        8,
        3,
        12,
        7,
        2,
        9,
        4,
        14,
        6,
        1,
        8,
        5,
        3,
        11,
        6,
        2,
        9,
        13,
        7,
        4,
        15,
        1,
        8
      ],
      "steps": [
        {
          "upto": 0,
          "title": "The consumer wants 3 rows",
          "text": "The basket asks for rows one at a time. The filter keeps rows whose value is above 10. The reader stops as soon as the basket holds 3."
        },
        {
          "upto": 1,
          "title": "Row 1 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 1, with value 5. 5 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 2,
          "title": "Row 2 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 2, with value 8. 8 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 3,
          "title": "Row 3 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 3, with value 3. 3 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 4,
          "title": "Row 4 goes into the basket (1 of 3)",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 4, with value 12. 12 is above 10, so the filter passes it to the basket."
        },
        {
          "upto": 5,
          "title": "Row 5 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 5, with value 7. 7 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 6,
          "title": "Row 6 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 6, with value 2. 2 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 7,
          "title": "Row 7 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 7, with value 9. 9 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 8,
          "title": "Row 8 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 8, with value 4. 4 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 9,
          "title": "Row 9 goes into the basket (2 of 3)",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 9, with value 14. 14 is above 10, so the filter passes it to the basket."
        },
        {
          "upto": 10,
          "title": "Row 10 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 10, with value 6. 6 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 11,
          "title": "Row 11 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 11, with value 1. 1 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 12,
          "title": "Row 12 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 12, with value 8. 8 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 13,
          "title": "Row 13 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 13, with value 5. 5 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 14,
          "title": "Row 14 is rejected",
          "text": "The basket asks the filter for the next row. The filter asks the reader, and the reader gives row 14, with value 3. 3 is not above 10, so the filter drops it and asks again."
        },
        {
          "upto": 15,
          "title": "Row 15 fills the basket (3 of 3)",
          "text": "The basket asks the filter for the next row. The reader gives row 15, with value 11. 11 is above 10, so the filter passes it, and the basket is full. The basket stops asking, and the reader closes."
        },
        {
          "upto": 15,
          "summary": true,
          "title": "Rows 16 to 24 are never read",
          "text": "The basket is full, so it never asks again. Rows 16 to 24 are never read, even though rows 19 and 22 would have passed."
        }
      ]
    }
  }
];
CourseData.uc["lineage"] = [
  {
    "title": "Compute a partition with a cache in front",
    "blurb": "A cached partition is served from memory, and a miss is rebuilt from its parents.",
    "intro": "Hit, miss, and evict all end in the same rows.",
    "trigger": "A task needs partition 3 of a dataset that the program asked Spark to keep in memory.",
    "run": "rdd = sc.textFile(\"sales.txt\").filter(lambda l: l != \"\").map(str.upper).cache(); rdd.count(); rdd.count()",
    "expect": "The second request for partition 3 is served from the cache, and both requests return the same rows.",
    "edges": [
      {
        "t": "Memory is full",
        "short": "The copy is simply not kept.",
        "ctx": "The task rebuilt the rows but the cache has no room to store them.",
        "fix": "The job still finishes. The rows are used and then dropped. It will just be slower next time, because the work has to be repeated."
      },
      {
        "t": "The parents give different answers each time",
        "short": "The cache and a rebuild could disagree.",
        "ctx": "If the parent step uses random numbers or the current time, rebuilding gives different rows than the cached copy had.",
        "fix": "Keep parent steps deterministic, or save a checkpoint so that every later read sees the same rows."
      }
    ],
    "invariant": "A hit and a recompute return the same rows.",
    "animation": {
      "kind": "shelf",
      "chain": [
        "read",
        "filter",
        "map"
      ],
      "want": 3,
      "steps": [
        {
          "title": "Task needs partition 3",
          "text": "A task needs partition 3 of a dataset the program asked Spark to keep. Before doing any work, it checks the cache.",
          "look": null,
          "active": null,
          "msg": null,
          "shelf": [
            "p1",
            "p2"
          ],
          "task": "needs partition 3",
          "rows": null
        },
        {
          "title": "Ask the cache",
          "text": "The task asks the block manager: do you have partition 3?",
          "look": "ask",
          "active": null,
          "msg": "task → block manager: do you have p3?",
          "shelf": [
            "p1",
            "p2"
          ],
          "task": "asks the cache",
          "rows": null
        },
        {
          "title": "No: that is a miss",
          "text": "The block manager says no. This is a miss, so the task has to make the rows itself.",
          "look": "miss",
          "active": null,
          "msg": "block manager → task: no",
          "shelf": [
            "p1",
            "p2"
          ],
          "task": "waiting",
          "rows": null
        },
        {
          "title": "Ask map to compute it",
          "text": "The task asks the last step, map, to compute partition 3.",
          "look": null,
          "active": "map",
          "msg": "task → map: compute p3",
          "shelf": [
            "p1",
            "p2"
          ],
          "task": "waiting",
          "rows": null
        },
        {
          "title": "Map asks filter",
          "text": "Map asks filter for partition 3, since it needs the rows that filter makes.",
          "look": null,
          "active": "filter",
          "msg": "map → filter: give me p3",
          "shelf": [
            "p1",
            "p2"
          ],
          "task": "waiting",
          "rows": null
        },
        {
          "title": "Filter asks the read",
          "text": "Filter asks the read step for partition 3.",
          "look": null,
          "active": "read",
          "msg": "filter → read: give me p3",
          "shelf": [
            "p1",
            "p2"
          ],
          "task": "waiting",
          "rows": null
        },
        {
          "title": "Read sends the rows back",
          "text": "The read step reads partition 3 from the file and sends the rows back up to filter.",
          "look": null,
          "active": "read",
          "msg": "read → filter: rows",
          "shelf": [
            "p1",
            "p2"
          ],
          "task": "waiting",
          "rows": "up"
        },
        {
          "title": "Filter sends them up",
          "text": "Filter applies its test and sends the rows up to map.",
          "look": null,
          "active": "filter",
          "msg": "filter → map: rows",
          "shelf": [
            "p1",
            "p2"
          ],
          "task": "waiting",
          "rows": "up"
        },
        {
          "title": "Map sends them to the task",
          "text": "Map transforms the rows and sends them to the task. The task now has partition 3.",
          "look": null,
          "active": "map",
          "msg": "map → task: rows",
          "shelf": [
            "p1",
            "p2"
          ],
          "task": "has partition 3 rows",
          "rows": "up"
        },
        {
          "title": "Keep a copy",
          "text": "The task asks the cache to store partition 3, so the next request can skip the work.",
          "look": "store",
          "active": null,
          "msg": "task → block manager: store p3",
          "shelf": [
            "p1",
            "p2",
            "p3"
          ],
          "task": "has partition 3 rows",
          "rows": null
        },
        {
          "title": "Another task asks",
          "text": "Later, another task asks for partition 3. The cache is asked first.",
          "look": "ask",
          "active": null,
          "msg": "task → block manager: do you have p3?",
          "shelf": [
            "p1",
            "p2",
            "p3"
          ],
          "task": "asks the cache",
          "rows": null
        },
        {
          "title": "Hit: nothing is recomputed",
          "text": "The cache has partition 3, so it answers at once. Read, filter and map do nothing.",
          "look": "hit",
          "active": null,
          "msg": "block manager → task: yes, here are the rows",
          "shelf": [
            "p1",
            "p2",
            "p3"
          ],
          "task": "has partition 3 rows from the cache",
          "rows": null
        },
        {
          "title": "The same rows either way",
          "text": "A hit and a rebuild return the same rows. The cache only changes how long the answer takes.",
          "look": null,
          "active": null,
          "msg": null,
          "shelf": [
            "p1",
            "p2",
            "p3"
          ],
          "task": "has partition 3 rows",
          "rows": null
        }
      ]
    }
  },
  {
    "title": "Block lifecycle",
    "blurb": "A cached block can be stored, evicted, dropped or never stored, and each has a different cost.",
    "intro": "Intent to cache and actual residency are different states.",
    "trigger": "Memory is running out, or the program says it is done with a dataset and asks Spark to forget it.",
    "run": "rdd.persist(StorageLevel.MEMORY_ONLY).count()",
    "expect": "An evicted block is rebuilt from its lineage when it is needed again, and a block that never fits is computed only for the task that asked for it.",
    "edges": [
      {
        "t": "A block that is being read",
        "short": "It cannot be removed.",
        "ctx": "A task is reading block B right now when memory runs short.",
        "fix": "The manager skips blocks that are in use and removes a different one."
      },
      {
        "t": "A very long chain and no checkpoint",
        "short": "One loss can mean redoing everything.",
        "ctx": "When the chain of steps behind a dataset is very long, rebuilding one lost block means replaying all of them.",
        "fix": "Save a checkpoint after the long chain so the replay stops there."
      },
      {
        "t": "Memory and disk: an evicted block is spilled, not dropped",
        "short": "The block is read back from disk.",
        "ctx": "With MEMORY_AND_DISK, an evicted block is written to disk instead of being thrown away. A later read loads it back.",
        "fix": "Reading from disk is usually cheaper than a rebuild. If the disk is slow, a rebuild can be faster, so choose the storage level by cost."
      }
    ],
    "invariant": "Eviction changes cost, never results.",
    "animation": {
      "kind": "tank",
      "capacity": 3,
      "steps": [
        {
          "title": "Nothing is stored yet",
          "text": "Memory holds three blocks at most. A, B, C and D are datasets that the program asks Spark to keep.",
          "mem": [],
          "states": {},
          "pick": null,
          "inuse": [],
          "request": null,
          "msg": null
        },
        {
          "title": "persist is called on A",
          "text": "The program asks Spark to keep block A. A is requested, and nothing is stored yet.",
          "mem": [],
          "states": {
            "A": "Requested"
          },
          "pick": null,
          "inuse": [],
          "request": "A",
          "msg": "program → Spark: persist A"
        },
        {
          "title": "A is computed and stored",
          "text": "A is computed and stored in memory. It is now resident.",
          "mem": [
            "A"
          ],
          "states": {
            "A": "Resident"
          },
          "pick": null,
          "inuse": [],
          "request": null,
          "msg": "A computed and stored"
        },
        {
          "title": "B is stored",
          "text": "B is computed and stored. There is still room in memory.",
          "mem": [
            "A",
            "B"
          ],
          "states": {
            "A": "Resident",
            "B": "Resident"
          },
          "pick": null,
          "inuse": [],
          "request": null,
          "msg": "B computed and stored"
        },
        {
          "title": "C is stored: memory is full",
          "text": "C is stored, and memory now holds three blocks. It is full.",
          "mem": [
            "A",
            "B",
            "C"
          ],
          "states": {
            "A": "Resident",
            "B": "Resident",
            "C": "Resident"
          },
          "pick": null,
          "inuse": [],
          "request": null,
          "msg": "C computed and stored"
        },
        {
          "title": "D is requested, but memory is full",
          "text": "The program asks for D. There is no room, so the block manager has to free some space first.",
          "mem": [
            "A",
            "B",
            "C"
          ],
          "states": {
            "A": "Resident",
            "B": "Resident",
            "C": "Resident",
            "D": "Requested"
          },
          "pick": null,
          "inuse": [],
          "request": "D",
          "msg": "D requested: no room"
        },
        {
          "title": "Pick the least recently used block",
          "text": "The manager picks the block that was used longest ago, which is A. Nothing is reading A right now, so it can go.",
          "mem": [
            "A",
            "B",
            "C"
          ],
          "states": {
            "A": "Resident",
            "B": "Resident",
            "C": "Resident",
            "D": "Requested"
          },
          "pick": "A",
          "inuse": [],
          "request": "D",
          "msg": "choose least recently used: A"
        },
        {
          "title": "A is evicted, and D takes its place",
          "text": "A is evicted. In memory-only mode its copy is simply gone. D is computed and stored in the free space.",
          "mem": [
            "B",
            "C",
            "D"
          ],
          "states": {
            "A": "Evicted",
            "B": "Resident",
            "C": "Resident",
            "D": "Resident"
          },
          "pick": null,
          "inuse": [],
          "request": null,
          "msg": "A evicted, D stored"
        },
        {
          "title": "A is needed again",
          "text": "A is requested again. It is evicted, and memory is full, so the next least recently used block, B, must go first.",
          "mem": [
            "B",
            "C",
            "D"
          ],
          "states": {
            "A": "Evicted",
            "B": "Resident",
            "C": "Resident",
            "D": "Resident"
          },
          "pick": "B",
          "inuse": [],
          "request": "A",
          "msg": "request A: choose B to make room"
        },
        {
          "title": "B is evicted, and A is rebuilt",
          "text": "B is evicted to make room. A is recomputed from its parents and stored again.",
          "mem": [
            "C",
            "D",
            "A"
          ],
          "states": {
            "A": "Resident",
            "B": "Evicted",
            "C": "Resident",
            "D": "Resident"
          },
          "pick": null,
          "inuse": [],
          "request": null,
          "msg": "B evicted, A recomputed and stored"
        },
        {
          "title": "E is requested while every block is in use",
          "text": "The program asks for E. Every block in memory is being read at this moment, so none can be evicted.",
          "mem": [
            "C",
            "D",
            "A"
          ],
          "states": {
            "A": "Resident",
            "B": "Evicted",
            "C": "Resident",
            "D": "Resident",
            "E": "Requested"
          },
          "pick": null,
          "inuse": [
            "C",
            "D",
            "A"
          ],
          "request": "E",
          "msg": "E requested: nothing can be evicted"
        },
        {
          "title": "E is not stored",
          "text": "E is computed only for the task that asked for it. It is not stored, so its state is NotStored.",
          "mem": [
            "C",
            "D",
            "A"
          ],
          "states": {
            "A": "Resident",
            "B": "Evicted",
            "C": "Resident",
            "D": "Resident",
            "E": "NotStored"
          },
          "pick": null,
          "inuse": [
            "C",
            "D",
            "A"
          ],
          "request": null,
          "msg": "E computed for one task, not stored"
        },
        {
          "title": "D is unpersisted",
          "text": "The program no longer needs D, so it asks Spark to drop it. D leaves memory for good.",
          "mem": [
            "C",
            "A"
          ],
          "states": {
            "A": "Resident",
            "B": "Evicted",
            "C": "Resident",
            "D": "Dropped",
            "E": "NotStored"
          },
          "pick": null,
          "inuse": [],
          "request": null,
          "msg": "unpersist D: dropped"
        },
        {
          "title": "Summary",
          "text": "Each block has one state at a time. An evicted or dropped block comes back only by being rebuilt from its lineage.",
          "mem": [
            "C",
            "A"
          ],
          "states": {
            "A": "Resident",
            "B": "Evicted",
            "C": "Resident",
            "D": "Dropped",
            "E": "NotStored"
          },
          "pick": null,
          "inuse": [],
          "request": null,
          "msg": null
        }
      ]
    }
  },
  {
    "title": "Rebuild a lost partition from its lineage",
    "blurb": "Only the lost partitions are rebuilt, by walking back through their parents.",
    "intro": "A lost partition is rebuilt from its parent, and that parent from its own parent, until a partition that still exists is found.",
    "trigger": "An executor dies after it has computed some partitions of a dataset, and the next action needs them.",
    "run": "C.count()",
    "expect": "Only the two lost partitions are rebuilt, from their parents. The other ten are untouched.",
    "edges": [
      {
        "t": "The source file was deleted",
        "short": "Nothing is left to rebuild from.",
        "ctx": "If the source had been deleted, the walk back would stop at it, and the lost partition could not be rebuilt.",
        "fix": "Keep the source data until the job is done, or checkpoint before the source can disappear."
      },
      {
        "t": "A shuffle output was lost with the executor",
        "short": "The parent stage has to run again.",
        "ctx": "In a wide step, the output of the parent stage lives on the executors. If that executor is gone, the stage that made it must run again.",
        "fix": "Use the external shuffle service, so shuffle files survive an executor loss."
      },
      {
        "t": "A parent step is not repeatable",
        "short": "The rebuilt partition may differ from the lost one.",
        "ctx": "If B uses random numbers or the current time, the rebuilt B2 can differ from the one that was lost.",
        "fix": "Keep steps deterministic, or checkpoint so the result is saved and not recomputed."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "tiles",
      "stages": [
        "A read",
        "B filter",
        "C map"
      ],
      "parts": 4,
      "steps": [
        {
          "title": "Every tile is in place",
          "text": "count() on C needs all 12 tiles: four partitions in each of the three stages. Executor 2 holds B2 and C2. The file still holds A2.",
          "states": {
            "A0": "ok",
            "A1": "ok",
            "A2": "ok",
            "A3": "ok",
            "B0": "ok",
            "B1": "ok",
            "B2": "ok",
            "B3": "ok",
            "C0": "ok",
            "C1": "ok",
            "C2": "ok",
            "C3": "ok"
          },
          "msg": null
        },
        {
          "title": "The driver sends C2 to executor 2",
          "text": "The driver asks executor 2 to compute C partition 2.",
          "states": {
            "A0": "ok",
            "A1": "ok",
            "A2": "ok",
            "A3": "ok",
            "B0": "ok",
            "B1": "ok",
            "B2": "ok",
            "B3": "ok",
            "C0": "ok",
            "C1": "ok",
            "C2": "wanted",
            "C3": "ok"
          },
          "msg": "driver → executor 2: compute C2"
        },
        {
          "title": "Executor 2 does not answer",
          "text": "Executor 2 is lost, so B2 and C2 are gone with it.",
          "states": {
            "A0": "ok",
            "A1": "ok",
            "A2": "ok",
            "A3": "ok",
            "B0": "ok",
            "B1": "ok",
            "B2": "lost",
            "B3": "ok",
            "C0": "ok",
            "C1": "ok",
            "C2": "lost",
            "C3": "ok"
          },
          "msg": "executor 2: no answer"
        },
        {
          "title": "C2 needs B2, which is also lost",
          "text": "To rebuild C2, the driver needs B2 first. B2 is lost too, so the driver walks back one step to its parent.",
          "states": {
            "A0": "ok",
            "A1": "ok",
            "A2": "ok",
            "A3": "ok",
            "B0": "ok",
            "B1": "ok",
            "B2": "lost",
            "B3": "ok",
            "C0": "ok",
            "C1": "ok",
            "C2": "lost",
            "C3": "ok"
          },
          "msg": "driver: C2 needs B2"
        },
        {
          "title": "Recompute B2 on executor 1",
          "text": "The driver asks executor 1 to recompute B partition 2.",
          "states": {
            "A0": "ok",
            "A1": "ok",
            "A2": "ok",
            "A3": "ok",
            "B0": "ok",
            "B1": "ok",
            "B2": "rebuilding",
            "B3": "ok",
            "C0": "ok",
            "C1": "ok",
            "C2": "lost",
            "C3": "ok"
          },
          "msg": "driver → executor 1: recompute B2"
        },
        {
          "title": "Read A2 from the file",
          "text": "To recompute B2, executor 1 reads A partition 2 from the file. A is the source, so it is still there.",
          "states": {
            "A0": "ok",
            "A1": "ok",
            "A2": "source",
            "A3": "ok",
            "B0": "ok",
            "B1": "ok",
            "B2": "rebuilding",
            "B3": "ok",
            "C0": "ok",
            "C1": "ok",
            "C2": "lost",
            "C3": "ok"
          },
          "msg": "executor 1 → file: read A2"
        },
        {
          "title": "The file returns the rows",
          "text": "The file sends the rows of A partition 2 back to executor 1.",
          "states": {
            "A0": "ok",
            "A1": "ok",
            "A2": "source",
            "A3": "ok",
            "B0": "ok",
            "B1": "ok",
            "B2": "rebuilding",
            "B3": "ok",
            "C0": "ok",
            "C1": "ok",
            "C2": "lost",
            "C3": "ok"
          },
          "msg": "file → executor 1: rows"
        },
        {
          "title": "B2 is back",
          "text": "B2 is rebuilt on executor 1. Its parent was enough to rebuild it.",
          "states": {
            "A0": "ok",
            "A1": "ok",
            "A2": "ok",
            "A3": "ok",
            "B0": "ok",
            "B1": "ok",
            "B2": "rebuilt",
            "B3": "ok",
            "C0": "ok",
            "C1": "ok",
            "C2": "lost",
            "C3": "ok"
          },
          "msg": "executor 1 → driver: B2 is back"
        },
        {
          "title": "Recompute C2 from B2",
          "text": "Now the driver asks executor 1 to recompute C2 from the rebuilt B2.",
          "states": {
            "A0": "ok",
            "A1": "ok",
            "A2": "ok",
            "A3": "ok",
            "B0": "ok",
            "B1": "ok",
            "B2": "rebuilt",
            "B3": "ok",
            "C0": "ok",
            "C1": "ok",
            "C2": "rebuilding",
            "C3": "ok"
          },
          "msg": "driver → executor 1: recompute C2 from B2"
        },
        {
          "title": "C2 is back",
          "text": "C2 is rebuilt. The count can finish.",
          "states": {
            "A0": "ok",
            "A1": "ok",
            "A2": "ok",
            "A3": "ok",
            "B0": "ok",
            "B1": "ok",
            "B2": "rebuilt",
            "B3": "ok",
            "C0": "ok",
            "C1": "ok",
            "C2": "rebuilt",
            "C3": "ok"
          },
          "msg": "executor 1 → driver: C2 is back"
        },
        {
          "title": "Summary",
          "text": "Only two tiles were rebuilt, B2 and C2, and each came from its parent. The other ten tiles were never touched.",
          "states": {
            "A0": "ok",
            "A1": "ok",
            "A2": "ok",
            "A3": "ok",
            "B0": "ok",
            "B1": "ok",
            "B2": "rebuilt",
            "B3": "ok",
            "C0": "ok",
            "C1": "ok",
            "C2": "rebuilt",
            "C3": "ok"
          },
          "msg": null
        }
      ]
    }
  },
  {
    "title": "A checkpoint cuts a long lineage",
    "blurb": "A checkpoint saves a partition, so a rebuild stops there instead of at the source.",
    "intro": "A checkpoint writes a result to reliable storage and cuts the lineage behind it.",
    "trigger": "A chain of eight transformations is so long that rebuilding a lost partition would replay all of them.",
    "run": "sc.setCheckpointDir(\"ckpt\"); op4.checkpoint(); op8.count()",
    "expect": "After the checkpoint, a rebuild replays four operators instead of eight.",
    "edges": [
      {
        "t": "The checkpoint is only marked at first",
        "short": "Nothing is saved until a job runs.",
        "ctx": "checkpoint() must be called before any job runs on the RDD. It marks the RDD, and the write happens during a job, not when the call is made.",
        "fix": "Run an action right after asking for the checkpoint, and check the checkpoint folder before relying on it."
      },
      {
        "t": "Checkpoints cost time",
        "short": "Every checkpoint writes the whole partition to storage.",
        "ctx": "Writing to reliable storage takes time and network, and it happens for every partition of the checkpointed RDD.",
        "fix": "Checkpoint only after long chains or expensive steps, not after every operator."
      },
      {
        "t": "A local checkpoint is lost with its executor",
        "short": "Faster, but not safe for data you cannot lose.",
        "ctx": "A local checkpoint keeps the data on the executors. If that executor is lost, the checkpoint is lost with it.",
        "fix": "Use a reliable checkpoint for data you cannot afford to lose. Use a local one when a rebuild is cheap."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "replay",
      "ops": 8,
      "checkpointAfter": 4,
      "steps": [
        {
          "title": "A chain of eight operators",
          "text": "The program defines op1 to op8, one after another. Nothing has run yet. Each operator only records what it will do.",
          "states": [
            "idle",
            "idle",
            "idle",
            "idle",
            "idle",
            "idle",
            "idle",
            "idle"
          ],
          "msg": null,
          "cost": null
        },
        {
          "title": "The first action runs the chain",
          "text": "The first action runs all eight operators once. Nothing in the middle is kept, so only the final result of op8 is kept.",
          "states": [
            "ran",
            "ran",
            "ran",
            "ran",
            "ran",
            "ran",
            "ran",
            "result"
          ],
          "msg": "driver → executor: run op1 to op8 once",
          "cost": null
        },
        {
          "title": "One partition of op8 is lost",
          "text": "The executor holding op8 is lost, so its result is gone. Nothing in the chain is stored, so every operator has to run again.",
          "states": [
            "gone",
            "gone",
            "gone",
            "gone",
            "gone",
            "gone",
            "gone",
            "lost"
          ],
          "msg": "executor: result of op8 lost",
          "cost": null
        },
        {
          "title": "Replay op1",
          "text": "Replay op1 for partition 3, from the source. Replay starts at the source file.",
          "states": [
            "replay",
            "wait",
            "wait",
            "wait",
            "wait",
            "wait",
            "wait",
            "wait"
          ],
          "msg": "driver → executor: replay op1",
          "cost": {
            "replayed": 1,
            "of": 8
          }
        },
        {
          "title": "Replay op2",
          "text": "Replay op2 for partition 3, from the source. It runs after op1 is done.",
          "states": [
            "done",
            "replay",
            "wait",
            "wait",
            "wait",
            "wait",
            "wait",
            "wait"
          ],
          "msg": "driver → executor: replay op2",
          "cost": {
            "replayed": 2,
            "of": 8
          }
        },
        {
          "title": "Replay op3",
          "text": "Replay op3 for partition 3, from the source. It runs after op2 is done.",
          "states": [
            "done",
            "done",
            "replay",
            "wait",
            "wait",
            "wait",
            "wait",
            "wait"
          ],
          "msg": "driver → executor: replay op3",
          "cost": {
            "replayed": 3,
            "of": 8
          }
        },
        {
          "title": "Replay op4",
          "text": "Replay op4 for partition 3, from the source. It runs after op3 is done.",
          "states": [
            "done",
            "done",
            "done",
            "replay",
            "wait",
            "wait",
            "wait",
            "wait"
          ],
          "msg": "driver → executor: replay op4",
          "cost": {
            "replayed": 4,
            "of": 8
          }
        },
        {
          "title": "Replay op5",
          "text": "Replay op5 for partition 3, from the source. It runs after op4 is done.",
          "states": [
            "done",
            "done",
            "done",
            "done",
            "replay",
            "wait",
            "wait",
            "wait"
          ],
          "msg": "driver → executor: replay op5",
          "cost": {
            "replayed": 5,
            "of": 8
          }
        },
        {
          "title": "Replay op6",
          "text": "Replay op6 for partition 3, from the source. It runs after op5 is done.",
          "states": [
            "done",
            "done",
            "done",
            "done",
            "done",
            "replay",
            "wait",
            "wait"
          ],
          "msg": "driver → executor: replay op6",
          "cost": {
            "replayed": 6,
            "of": 8
          }
        },
        {
          "title": "Replay op7",
          "text": "Replay op7 for partition 3, from the source. It runs after op6 is done.",
          "states": [
            "done",
            "done",
            "done",
            "done",
            "done",
            "done",
            "replay",
            "wait"
          ],
          "msg": "driver → executor: replay op7",
          "cost": {
            "replayed": 7,
            "of": 8
          }
        },
        {
          "title": "Replay op8",
          "text": "Replay op8 for partition 3, from the source. It runs after op7 is done.",
          "states": [
            "done",
            "done",
            "done",
            "done",
            "done",
            "done",
            "done",
            "replay"
          ],
          "msg": "driver → executor: replay op8",
          "cost": {
            "replayed": 8,
            "of": 8
          }
        },
        {
          "title": "op8 is back",
          "text": "The replay has reached op8, and the lost partition is back.",
          "states": [
            "done",
            "done",
            "done",
            "done",
            "done",
            "done",
            "done",
            "result"
          ],
          "msg": "executor → driver: op8 is back",
          "cost": {
            "replayed": 8,
            "of": 8
          }
        },
        {
          "title": "Ask for a checkpoint after op4",
          "text": "The program asks for a checkpoint on op4. Spark only marks op4 at this point. Nothing is written yet.",
          "states": [
            "idle",
            "idle",
            "idle",
            "marked",
            "idle",
            "idle",
            "idle",
            "result"
          ],
          "msg": "driver: mark op4 for a checkpoint",
          "cost": null
        },
        {
          "title": "The next action runs op1 to op4",
          "text": "The next action runs op1 to op4 for the checkpoint. Their results are about to be written.",
          "states": [
            "ran",
            "ran",
            "ran",
            "writing",
            "idle",
            "idle",
            "idle",
            "result"
          ],
          "msg": "driver → executor: run op1 to op4",
          "cost": null
        },
        {
          "title": "op4 is saved in reliable storage",
          "text": "op4 is written to reliable storage. Spark no longer needs op1 to op3 to rebuild op8.",
          "states": [
            "skip",
            "skip",
            "skip",
            "checkpoint",
            "idle",
            "idle",
            "idle",
            "result"
          ],
          "msg": "executor → storage: write op4",
          "cost": null
        },
        {
          "title": "The partition of op8 is lost again",
          "text": "The same executor is lost again, so the op8 result is gone.",
          "states": [
            "skip",
            "skip",
            "skip",
            "checkpoint",
            "idle",
            "idle",
            "idle",
            "lost"
          ],
          "msg": "executor: result of op8 lost",
          "cost": null
        },
        {
          "title": "Read op4 from the checkpoint",
          "text": "The rebuild starts at op4. It reads op4 from reliable storage instead of running op1 to op4 again.",
          "states": [
            "skip",
            "skip",
            "skip",
            "read",
            "idle",
            "idle",
            "idle",
            "lost"
          ],
          "msg": "driver → storage: read op4",
          "cost": null
        },
        {
          "title": "Replay op5",
          "text": "Replay op5 from the checkpoint. It runs after op4 is done.",
          "states": [
            "skip",
            "skip",
            "skip",
            "checkpoint",
            "replay",
            "wait",
            "wait",
            "wait"
          ],
          "msg": "driver → executor: replay op5",
          "cost": {
            "replayed": 1,
            "of": 4
          }
        },
        {
          "title": "Replay op6",
          "text": "Replay op6 from the checkpoint. It runs after op5 is done.",
          "states": [
            "skip",
            "skip",
            "skip",
            "checkpoint",
            "done",
            "replay",
            "wait",
            "wait"
          ],
          "msg": "driver → executor: replay op6",
          "cost": {
            "replayed": 2,
            "of": 4
          }
        },
        {
          "title": "Replay op7",
          "text": "Replay op7 from the checkpoint. It runs after op6 is done.",
          "states": [
            "skip",
            "skip",
            "skip",
            "checkpoint",
            "done",
            "done",
            "replay",
            "wait"
          ],
          "msg": "driver → executor: replay op7",
          "cost": {
            "replayed": 3,
            "of": 4
          }
        },
        {
          "title": "Replay op8",
          "text": "Replay op8 from the checkpoint. It runs after op7 is done.",
          "states": [
            "skip",
            "skip",
            "skip",
            "checkpoint",
            "done",
            "done",
            "done",
            "replay"
          ],
          "msg": "driver → executor: replay op8",
          "cost": {
            "replayed": 4,
            "of": 4
          }
        },
        {
          "title": "op8 is back, after four replays",
          "text": "The rebuild needed four replays, op5 to op8. Before the checkpoint it would have needed eight.",
          "states": [
            "skip",
            "skip",
            "skip",
            "checkpoint",
            "done",
            "done",
            "done",
            "result"
          ],
          "msg": "executor → driver: op8 is back",
          "cost": {
            "replayed": 4,
            "of": 4
          }
        },
        {
          "title": "Summary",
          "text": "Replay cost: eight operators before the checkpoint, four after it. The checkpoint cuts the lineage at op4.",
          "states": [
            "skip",
            "skip",
            "skip",
            "checkpoint",
            "done",
            "done",
            "done",
            "result"
          ],
          "msg": null,
          "cost": {
            "replayed": 4,
            "of": 4
          }
        }
      ]
    }
  }
];
CourseData.uc["stages"] = [
  {
    "title": "Plan stages from an action",
    "blurb": "",
    "intro": "The planner walks backwards from the result.",
    "trigger": "Your program calls an action such as collect(). Spark must now decide which steps can run together and which must wait for a shuffle.",
    "run": "lines.map(parse).reduceByKey(add).sortByKey().collect()",
    "expect": "Three stages. The two shuffles, at reduceByKey and sortByKey, each cut the plan once. read and map stay together.",
    "edges": [
      {
        "t": "Two paths share one parent",
        "short": "The shared stage is made once.",
        "ctx": "A dataset is used by two different branches, forming a diamond. A careless planner would create its stage twice and run it twice.",
        "fix": "The planner remembers stages it already made and links both branches to the same one."
      },
      {
        "t": "The output is already there",
        "short": "A stage can be skipped.",
        "ctx": "A stage already ran for an earlier action and its output still exists.",
        "fix": "The planner marks it as available and goes straight on to the next stage."
      }
    ],
    "invariant": "No stage runs before its parent outputs are complete.",
    "animation": {
      "kind": "dag",
      "nodes": [
        "read",
        "map",
        "reduceByKey",
        "sortByKey",
        "collect"
      ],
      "wide": [
        false,
        false,
        true,
        true,
        false
      ],
      "maxStages": 3,
      "steps": [
        {
          "title": "Nothing has run yet",
          "text": "The program only describes the work: read, map, reduceByKey, sortByKey. collect() is the action that asks for an answer. The planner has not cut anything yet.",
          "cur": -1,
          "stages": []
        },
        {
          "title": "Start at the action",
          "text": "The planner makes the result stage first. It holds collect() and the sortByKey work that feeds it.",
          "cur": 4,
          "stages": [
            {
              "id": 3,
              "name": "Stage 3 · sortByKey + collect",
              "nodes": [
                3,
                4
              ],
              "state": "walking"
            }
          ]
        },
        {
          "title": "sortByKey is wide: cut here",
          "text": "sortByKey needs rows from every parent partition, so it cannot be pipelined. The planner cuts before it and makes a parent stage for everything earlier.",
          "cur": 3,
          "stages": [
            {
              "id": 3,
              "name": "Stage 3 · sortByKey + collect",
              "nodes": [
                3,
                4
              ],
              "state": "built"
            },
            {
              "id": 2,
              "name": "Stage 2 · parent",
              "nodes": [
                0,
                1,
                2
              ],
              "state": "walking"
            }
          ]
        },
        {
          "title": "reduceByKey is wide too: cut again",
          "text": "Walking back, reduceByKey is another wide step. Another cut, and another parent stage. Stage 2 keeps only reduceByKey.",
          "cur": 2,
          "stages": [
            {
              "id": 3,
              "name": "Stage 3 · sortByKey + collect",
              "nodes": [
                3,
                4
              ],
              "state": "built"
            },
            {
              "id": 2,
              "name": "Stage 2 · reduceByKey",
              "nodes": [
                2
              ],
              "state": "built"
            },
            {
              "id": 1,
              "name": "Stage 1 · read + map",
              "nodes": [
                0,
                1
              ],
              "state": "walking"
            }
          ]
        },
        {
          "title": "Narrow steps stay together",
          "text": "read and map each need only their own partition, so they are pipelined into stage 1. No shuffle is needed inside it.",
          "cur": 0,
          "stages": [
            {
              "id": 3,
              "name": "Stage 3 · sortByKey + collect",
              "nodes": [
                3,
                4
              ],
              "state": "built"
            },
            {
              "id": 2,
              "name": "Stage 2 · reduceByKey",
              "nodes": [
                2
              ],
              "state": "built"
            },
            {
              "id": 1,
              "name": "Stage 1 · read + map",
              "nodes": [
                0,
                1
              ],
              "state": "built"
            }
          ]
        },
        {
          "title": "Parents run first",
          "text": "Only stage 1 has no parent, so it runs first. Stages 2 and 3 wait for its output, one shuffle at a time.",
          "cur": -1,
          "stages": [
            {
              "id": 3,
              "name": "Stage 3 · sortByKey + collect",
              "nodes": [
                3,
                4
              ],
              "state": "waiting"
            },
            {
              "id": 2,
              "name": "Stage 2 · reduceByKey",
              "nodes": [
                2
              ],
              "state": "waiting"
            },
            {
              "id": 1,
              "name": "Stage 1 · read + map",
              "nodes": [
                0,
                1
              ],
              "state": "running"
            }
          ]
        }
      ]
    }
  },
  {
    "title": "Stage readiness",
    "blurb": "",
    "intro": "A stage is runnable only when its inputs are registered.",
    "trigger": "A task in a parent stage finishes, or a worker dies and takes some finished output with it.",
    "run": "counts.collect()  # stage 1 has 4 tasks, stage 2 waits for all 4 outputs",
    "expect": "Stage 2 starts only when the tracker holds 4 of 4 outputs, and it closes again if an output is lost.",
    "edges": [
      {
        "t": "Late messages from an old attempt",
        "short": "They must not change anything.",
        "ctx": "A task from an earlier try of the stage reports success after the stage was already restarted.",
        "fix": "Every message carries its attempt number. The tracker ignores any that are not from the current attempt."
      },
      {
        "t": "A stage that keeps losing outputs",
        "short": "It cannot retry forever.",
        "ctx": "The same stage loses its outputs again and again, for example on a very unreliable machine.",
        "fix": "After a set number of tries the job fails with a clear error instead of looping for ever."
      }
    ],
    "invariant": "Stage state follows registered outputs, not task chatter.",
    "animation": {
      "kind": "gate",
      "tasks": 4,
      "steps": [
        {
          "title": "Stage 2 waits for all four outputs",
          "text": "Stage 1 has four tasks. Stage 2 needs every one of their outputs before it may start, so it waits.",
          "tiles": [
            {
              "s": "run"
            },
            {
              "s": "run"
            },
            {
              "s": "run"
            },
            {
              "s": "run"
            }
          ],
          "outputs": 0,
          "parent": "running",
          "child": "waiting",
          "msg": null
        },
        {
          "title": "Task 1 reports its output",
          "text": "Task 1 finishes on host A and tells the driver where its output is. The tracker records one of four.",
          "tiles": [
            {
              "s": "done",
              "h": "A"
            },
            {
              "s": "run"
            },
            {
              "s": "run"
            },
            {
              "s": "run"
            }
          ],
          "outputs": 1,
          "parent": "running",
          "child": "waiting",
          "msg": null
        },
        {
          "title": "Tasks 2 and 3 finish",
          "text": "Two more outputs arrive. Stage 2 still waits, because task 4 is missing.",
          "tiles": [
            {
              "s": "done",
              "h": "A"
            },
            {
              "s": "done",
              "h": "B"
            },
            {
              "s": "done",
              "h": "C"
            },
            {
              "s": "run"
            }
          ],
          "outputs": 3,
          "parent": "running",
          "child": "waiting",
          "msg": null
        },
        {
          "title": "The last output arrives",
          "text": "Task 4 finishes on host D. Four of four outputs are registered, so the gate opens and stage 2 can run.",
          "tiles": [
            {
              "s": "done",
              "h": "A"
            },
            {
              "s": "done",
              "h": "B"
            },
            {
              "s": "done",
              "h": "C"
            },
            {
              "s": "done",
              "h": "D"
            }
          ],
          "outputs": 4,
          "parent": "done",
          "child": "runnable",
          "msg": null
        },
        {
          "title": "Host C dies",
          "text": "Host C dies with task 3 output on it. The tracker drops that output, so the gate shuts at three of four. Stage 1 goes back to resubmitting, and stage 2 waits again.",
          "tiles": [
            {
              "s": "done",
              "h": "A"
            },
            {
              "s": "done",
              "h": "B"
            },
            {
              "s": "lost",
              "h": "C"
            },
            {
              "s": "done",
              "h": "D"
            }
          ],
          "outputs": 3,
          "parent": "resubmitting",
          "child": "waiting",
          "msg": null
        },
        {
          "title": "A late report is ignored",
          "text": "A message about the first attempt of task 3 arrives late. It carries the old attempt number, so the tracker ignores it and the gate stays shut.",
          "tiles": [
            {
              "s": "done",
              "h": "A"
            },
            {
              "s": "done",
              "h": "B"
            },
            {
              "s": "lost",
              "h": "C"
            },
            {
              "s": "done",
              "h": "D"
            }
          ],
          "outputs": 3,
          "parent": "resubmitting",
          "child": "waiting",
          "msg": "late report: task 3, attempt 0 · ignored"
        },
        {
          "title": "Only task 3 reruns",
          "text": "Task 3 reruns on host D and reports success. Four of four outputs again, so the gate opens and stage 2 runs. Tasks 1, 2 and 4 were never rerun.",
          "tiles": [
            {
              "s": "done",
              "h": "A"
            },
            {
              "s": "done",
              "h": "B"
            },
            {
              "s": "rerun",
              "h": "D"
            },
            {
              "s": "done",
              "h": "D"
            }
          ],
          "outputs": 4,
          "parent": "done",
          "child": "runnable",
          "msg": null
        }
      ]
    }
  },
  {
    "title": "A shared parent stage is planned once",
    "blurb": "",
    "intro": "Two branches of one graph both need the same shuffle. The planner keeps a memo of stages it has made, so the shared parent is linked twice and run once.",
    "trigger": "Two branches of one graph both depend on the same shuffled dataset, so the planner reaches the same parent twice while building one job.",
    "run": "a = raw.reduceByKey(add); a.mapValues(f).join(a.filter(g)).collect()",
    "expect": "The shared shuffle is planned once and runs once. Both branches read its outputs.",
    "edges": [
      {
        "t": "The memo lives for one plan",
        "short": "Reuse holds inside one planning pass.",
        "ctx": "The memo is built while one job is planned. A later job is planned again from the start.",
        "fix": "Later jobs can still skip a finished shuffle through its registered outputs. See UC-04."
      },
      {
        "t": "Two reduceByKey calls look alike",
        "short": "Same code, two shuffles.",
        "ctx": "Two separate reduceByKey calls over the same input look alike, but they are two shuffles with two ids. Spark cannot merge them.",
        "fix": "Assign the dataset to one variable and reuse it, so the planner sees a single shuffle."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "diamond",
      "steps": [
        {
          "title": "The plan is a diamond",
          "text": "The result joins two branches, A and B. Both come from one shuffled dataset, D. Drawn out, D sits at the top and the result sits at the bottom.",
          "n": {
            "D": "idle",
            "A": "idle",
            "B": "idle",
            "R": "idle"
          },
          "stages": [],
          "memo": [],
          "dup": false
        },
        {
          "title": "Walk branch A first",
          "text": "The planner makes the result stage, then the parent for branch A. Walking back from A reaches D, a wide step, so it creates D's stage. The memo now remembers D.",
          "n": {
            "D": "planned",
            "A": "planned",
            "B": "idle",
            "R": "planned"
          },
          "stages": [
            {
              "id": "R",
              "name": "Result · join + collect",
              "state": "built"
            },
            {
              "id": "A",
              "name": "Map side · branch A",
              "state": "built"
            },
            {
              "id": "D",
              "name": "Shuffle 1 · map side of D",
              "state": "built"
            }
          ],
          "memo": [
            "D → stage D"
          ],
          "dup": false
        },
        {
          "title": "Walk branch B",
          "text": "Now branch B. Its parent is a new stage of its own. Walking back from B, the next step is D again.",
          "n": {
            "D": "planned",
            "A": "planned",
            "B": "planned",
            "R": "planned"
          },
          "stages": [
            {
              "id": "R",
              "name": "Result · join + collect",
              "state": "built"
            },
            {
              "id": "A",
              "name": "Map side · branch A",
              "state": "built"
            },
            {
              "id": "D",
              "name": "Shuffle 1 · map side of D",
              "state": "built"
            },
            {
              "id": "B",
              "name": "Map side · branch B",
              "state": "built"
            }
          ],
          "memo": [
            "D → stage D"
          ],
          "dup": false
        },
        {
          "title": "Reach D again: reuse it",
          "text": "The second path reaches D. The memo says its stage exists, so the planner links branch B to that stage. No new stage is created.",
          "n": {
            "D": "reused",
            "A": "planned",
            "B": "planned",
            "R": "planned"
          },
          "stages": [
            {
              "id": "R",
              "name": "Result · join + collect",
              "state": "built"
            },
            {
              "id": "A",
              "name": "Map side · branch A",
              "state": "built"
            },
            {
              "id": "D",
              "name": "Shuffle 1 · map side of D",
              "state": "built"
            },
            {
              "id": "B",
              "name": "Map side · branch B",
              "state": "built"
            }
          ],
          "memo": [
            "D → stage D"
          ],
          "dup": false
        },
        {
          "title": "Without the memo, D runs twice",
          "text": "A planner without a memo would add a second copy of D. The same reads and reduceByKey would run twice, and the join would see two sets of outputs. This planner never makes that copy.",
          "n": {
            "D": "reused",
            "A": "planned",
            "B": "planned",
            "R": "planned"
          },
          "stages": [
            {
              "id": "R",
              "name": "Result · join + collect",
              "state": "built"
            },
            {
              "id": "A",
              "name": "Map side · branch A",
              "state": "built"
            },
            {
              "id": "D",
              "name": "Shuffle 1 · map side of D",
              "state": "built"
            },
            {
              "id": "B",
              "name": "Map side · branch B",
              "state": "built"
            }
          ],
          "memo": [
            "D → stage D"
          ],
          "dup": true
        },
        {
          "title": "D runs once",
          "text": "Stage D runs once, with 4 tasks. Branches A and B wait for its outputs, and the result waits for them.",
          "n": {
            "D": "running",
            "A": "planned",
            "B": "planned",
            "R": "planned"
          },
          "stages": [
            {
              "id": "D",
              "name": "Shuffle 1 · map side of D",
              "state": "running"
            },
            {
              "id": "A",
              "name": "Map side · branch A",
              "state": "waiting"
            },
            {
              "id": "B",
              "name": "Map side · branch B",
              "state": "waiting"
            },
            {
              "id": "R",
              "name": "Result · join + collect",
              "state": "waiting"
            }
          ],
          "memo": [
            "D → stage D"
          ],
          "dup": false
        },
        {
          "title": "Branches, then the result",
          "text": "D finished, so A and B run from its outputs, and then the result runs. Shuffle 1 was paid for once, not twice.",
          "n": {
            "D": "done",
            "A": "done",
            "B": "done",
            "R": "running"
          },
          "stages": [
            {
              "id": "D",
              "name": "Shuffle 1 · map side of D",
              "state": "done"
            },
            {
              "id": "A",
              "name": "Map side · branch A",
              "state": "done"
            },
            {
              "id": "B",
              "name": "Map side · branch B",
              "state": "done"
            },
            {
              "id": "R",
              "name": "Result · join + collect",
              "state": "running"
            }
          ],
          "memo": [
            "D → stage D"
          ],
          "dup": false
        }
      ]
    }
  },
  {
    "title": "A second job skips a finished shuffle",
    "blurb": "",
    "intro": "Two actions run on the same dataset. The map outputs from the first job are still registered, so the second job does not run that stage again.",
    "trigger": "A second action runs on a dataset whose shuffle already ran in an earlier job of the same application.",
    "run": "counts = df.groupBy(\"k\").count(); counts.collect(); counts.count()",
    "expect": "The second job runs only its result stage. Its map side is marked skipped, because the outputs from job 1 are still registered.",
    "edges": [
      {
        "t": "An executor with map outputs is lost",
        "short": "The skip stops at the missing output.",
        "ctx": "Outputs live on the executor that wrote them. When that executor dies, some outputs disappear, and the stage is no longer complete.",
        "fix": "The planner resubmits only the missing map tasks. Surviving outputs are reused."
      },
      {
        "t": "Shuffle files are cleaned up",
        "short": "The skip needs the outputs to still exist.",
        "ctx": "Shuffle files are removed when the application no longer needs them, for example after a long idle time or through external cleanup.",
        "fix": "Spark recomputes the map side. Cache the result if reuse must survive a long gap."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "skip",
      "steps": [
        {
          "title": "Job 1 is about to run",
          "text": "collect() needs one shuffle. The map side has four tasks, and its outputs stay on the executors that wrote them. The result has two tasks.",
          "j1": [
            [
              "Map side · shuffle 1",
              "idle"
            ],
            [
              "Result · 2 tasks",
              "idle"
            ]
          ],
          "j2": null,
          "outputs": 0,
          "tasks": 0
        },
        {
          "title": "The map side writes its outputs",
          "text": "Four map tasks run. Each one writes its output for the reducers and reports it to the driver.",
          "j1": [
            [
              "Map side · shuffle 1",
              "run"
            ],
            [
              "Result · 2 tasks",
              "idle"
            ]
          ],
          "j2": null,
          "outputs": 0,
          "tasks": 0
        },
        {
          "title": "All four outputs are registered",
          "text": "The driver records four of four outputs. The map side is done, and its outputs remain on the executors.",
          "j1": [
            [
              "Map side · shuffle 1",
              "done"
            ],
            [
              "Result · 2 tasks",
              "idle"
            ]
          ],
          "j2": null,
          "outputs": 4,
          "tasks": 4
        },
        {
          "title": "Job 1 finishes",
          "text": "The result stage fetches the outputs and runs its two tasks.",
          "j1": [
            [
              "Map side · shuffle 1",
              "done"
            ],
            [
              "Result · 2 tasks",
              "run"
            ]
          ],
          "j2": null,
          "outputs": 4,
          "tasks": 4
        },
        {
          "title": "Job 2 reuses the outputs",
          "text": "count() needs the same shuffle. The planner finds four of four outputs still registered, so the map side is skipped and only the new result waits to run.",
          "j1": [
            [
              "Map side · shuffle 1",
              "done"
            ],
            [
              "Result · 2 tasks",
              "done"
            ]
          ],
          "j2": [
            [
              "Map side · shuffle 1",
              "skip"
            ],
            [
              "Result · 2 tasks",
              "waiting"
            ]
          ],
          "outputs": 4,
          "tasks": 6
        },
        {
          "title": "Only the new result runs",
          "text": "Only the two result tasks of job 2 run. The shuffle work is not repeated.",
          "j1": [
            [
              "Map side · shuffle 1",
              "done"
            ],
            [
              "Result · 2 tasks",
              "done"
            ]
          ],
          "j2": [
            [
              "Map side · shuffle 1",
              "skip"
            ],
            [
              "Result · 2 tasks",
              "run"
            ]
          ],
          "outputs": 4,
          "tasks": 8
        },
        {
          "title": "A lost output brings back one task",
          "text": "An executor holding one map output dies, so outputs fall to three of four. The skip no longer holds. The planner resubmits only the missing map task before the result can run.",
          "j1": [
            [
              "Map side · shuffle 1",
              "done"
            ],
            [
              "Result · 2 tasks",
              "done"
            ]
          ],
          "j2": [
            [
              "Map side · shuffle 1",
              "rerun"
            ],
            [
              "Result · 2 tasks",
              "waiting"
            ]
          ],
          "outputs": 3,
          "tasks": 8
        }
      ]
    }
  },
  {
    "title": "A join with matching layouts adds no exchange",
    "blurb": "",
    "intro": "When both sides are already partitioned by the same key and partition count, each join task reads matching partitions directly. The stage and its exchange disappear.",
    "trigger": "A join runs on two inputs that may already be laid out by the same key, such as two bucketed tables.",
    "run": "spark.table(\"orders\").join(spark.table(\"customers\"), \"id\").explain()",
    "expect": "The plan shows the join with no exchange under either input when the layouts match.",
    "edges": [
      {
        "t": "Bucket counts differ",
        "short": "The exchange comes back.",
        "ctx": "One table uses 8 buckets and the other uses 16. The layouts do not match, so Spark exchanges the side that does not fit.",
        "fix": "Rebuild one table with the same bucket count and key. Then check explain() again."
      },
      {
        "t": "The layout is trusted, not checked",
        "short": "A wrong layout gives wrong joins.",
        "ctx": "Spark trusts the bucket metadata. If files were written with another key or partitioner, the join can return wrong rows without an error.",
        "fix": "Write both tables with the same job and check their layout in the catalog before joining."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "copart",
      "steps": [
        {
          "title": "Two tables, one join",
          "text": "orders and customers join on id. Spark cannot see how either side is laid out, so it must assume the rows are scattered.",
          "a": {
            "name": "orders",
            "tag": "layout unknown",
            "parts": 8,
            "set": false
          },
          "b": {
            "name": "customers",
            "tag": "layout unknown",
            "parts": 8,
            "set": false
          },
          "plan": [],
          "moved": "not planned yet"
        },
        {
          "title": "Without a match: exchange both sides",
          "text": "Each side is hashed by id and written out, then read back by the join. That makes three stages. Every row of both tables moves across the network.",
          "a": {
            "name": "orders",
            "tag": "layout unknown",
            "parts": 8,
            "set": false
          },
          "b": {
            "name": "customers",
            "tag": "layout unknown",
            "parts": 8,
            "set": false
          },
          "plan": [
            {
              "name": "orders → hash(id)",
              "kind": "out"
            },
            {
              "name": "customers → hash(id)",
              "kind": "out"
            },
            {
              "name": "join + collect",
              "kind": "in"
            }
          ],
          "moved": "every row, both sides"
        },
        {
          "title": "Matching layout: partition i meets partition i",
          "text": "Both tables are laid out by hash(id) into 8 partitions, with the same partitioner. Each join task reads partition i of orders and partition i of customers directly.",
          "a": {
            "name": "orders",
            "tag": "hash(id) % 8",
            "parts": 8,
            "set": true
          },
          "b": {
            "name": "customers",
            "tag": "hash(id) % 8",
            "parts": 8,
            "set": true
          },
          "plan": [
            {
              "name": "join + collect",
              "kind": "local"
            }
          ],
          "moved": "nothing"
        },
        {
          "title": "One side changes its partition count",
          "text": "customers is now laid out with 16 partitions, so the partitioners no longer match. Spark exchanges customers again. orders can stay where it is, but the join is two stages once more.",
          "a": {
            "name": "orders",
            "tag": "hash(id) % 8",
            "parts": 8,
            "set": true
          },
          "b": {
            "name": "customers",
            "tag": "hash(id) % 16",
            "parts": 16,
            "set": false
          },
          "plan": [
            {
              "name": "customers → hash(id) % 8",
              "kind": "out"
            },
            {
              "name": "join + collect",
              "kind": "in"
            }
          ],
          "moved": "customers only"
        }
      ]
    }
  },
  {
    "title": "Tasks follow partitions, not slots",
    "blurb": "",
    "intro": "A stage makes one task per partition. Slots decide only how many of those tasks run at the same time, in waves.",
    "trigger": "A stage is planned with a partition count that differs from the number of executor slots.",
    "run": "df.repartition(12).count()  # 4 cores: 12 tasks run in 3 waves",
    "expect": "The stage has one task per partition. The slots set how many run together, so the number of waves is partitions divided by slots, rounded up.",
    "edges": [
      {
        "t": "Too few partitions for the slots",
        "short": "Slots sit idle for the whole stage.",
        "ctx": "A stage with 2 tasks on 8 slots leaves 6 slots idle until it ends.",
        "fix": "Raise the partition count to at least the slot count, ideally a multiple of it."
      },
      {
        "t": "Too many tiny partitions",
        "short": "Scheduling overhead dominates.",
        "ctx": "A stage with 20,000 tiny partitions spends more time starting tasks than doing real work.",
        "fix": "Coalesce, or set a target size, so each task reads a useful amount of data."
      }
    ],
    "invariant": "",
    "animation": {
      "kind": "waves",
      "steps": [
        {
          "title": "Count the partitions",
          "text": "Stage 1 reads 12 partitions. Spark makes one task per partition, so the stage has 12 tasks. The executors offer four slots.",
          "parts": 12,
          "slots": 4,
          "started": false,
          "done": 0
        },
        {
          "title": "Wave 1 fills all four slots",
          "text": "Four tasks start at once, one in each slot. The other eight wait in line for a free slot.",
          "parts": 12,
          "slots": 4,
          "started": true,
          "done": 0
        },
        {
          "title": "Wave 2 starts as slots free up",
          "text": "Each slot takes its next task as soon as its last one finishes. The second wave is four more tasks.",
          "parts": 12,
          "slots": 4,
          "started": true,
          "done": 1
        },
        {
          "title": "Wave 3 is the last",
          "text": "The third wave runs the final four tasks. Twelve tasks on four slots take three rounds.",
          "parts": 12,
          "slots": 4,
          "started": true,
          "done": 2
        },
        {
          "title": "Everything is done",
          "text": "All 12 tasks finished in three waves. More slots would shorten the stage. More partitions help only while they outnumber the slots.",
          "parts": 12,
          "slots": 4,
          "started": true,
          "done": 3
        },
        {
          "title": "repartition(6): 6 tasks, two waves",
          "text": "Six tasks now run. Four run in wave 1, and only two run in wave 2. Two slots sit idle in that second wave.",
          "parts": 6,
          "slots": 4,
          "started": true,
          "done": 0
        },
        {
          "title": "Two partitions leave slots idle",
          "text": "With 2 partitions there is one wave, and two of the four slots never get work. More partitions, not more executors, would put them to use.",
          "parts": 2,
          "slots": 4,
          "started": true,
          "done": 0
        }
      ]
    }
  }
];
CourseData.uc["schedule"] = [
  {
    "title": "One launch and completion cycle",
    "blurb": "",
    "intro": "Each finished task frees a slot, and the freed slot triggers the next offer. The cycle repeats until the queue is empty.",
    "trigger": "Workers have just registered and a batch of tasks is waiting to be run.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "No worker holds the data",
        "short": "Wait a little, then go anywhere.",
        "ctx": "All workers that have the data are busy, but others are idle.",
        "fix": "The scheduler waits a short, limited time for a local slot. If none opens, it runs the task on another worker and moves the data over."
      },
      {
        "t": "Tasks that are too short",
        "short": "The boss becomes the bottleneck.",
        "ctx": "If each task takes a few milliseconds, sending messages takes longer than the work itself.",
        "fix": "Make tasks bigger by using fewer, larger partitions, so each message pays for real work."
      }
    ],
    "invariant": "Active attempts never exceed granted slots.",
    "kind": "ticks",
    "steps": [
      {
        "t": "Tasks are waiting",
        "x": "Six tasks sit in the queue. Nothing runs until a worker has free room.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "The worker offers room",
        "x": "The worker says it has four free slots. A slot is room to run one task at a time.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Match tasks to the offer",
        "x": "The scheduler picks tasks, preferring ones whose data already sits on this worker. Moving the job to the data is cheaper than moving the data.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Send the launch messages",
        "x": "The scheduler sends the four tasks to the worker.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "The worker runs them",
        "x": "All four slots are busy, so the scheduler cannot send more. Running tasks never go above the slots the worker offered.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "One task finishes",
        "x": "Task 2 finishes and reports back. Its slot is free again.",
        "s": {
          "k": 5
        }
      },
      {
        "t": "The next task goes in",
        "x": "The scheduler sends task 5 into the free slot. This repeats until the queue is empty.",
        "s": {
          "k": 6
        }
      }
    ],
    "scene": {
      "actors": [
        "Worker",
        "Scheduler",
        "Task queue"
      ],
      "steps": [
        {
          "title": "Tasks are waiting",
          "text": "Six tasks sit in the queue. Nothing runs until a worker has free room.",
          "m": null,
          "set": {
            "Task queue": [
              "task 1",
              "task 2",
              "task 3",
              "task 4",
              "task 5",
              "task 6"
            ]
          },
          "badge": {},
          "v": {
            "free": 0,
            "run": 0,
            "queue": 6
          }
        },
        {
          "title": "The worker offers room",
          "text": "The worker says it has four free slots. A slot is room to run one task at a time.",
          "m": [
            "Worker",
            "Scheduler",
            "I have 4 free slots"
          ],
          "set": {
            "Worker": [
              "slot 1: free",
              "slot 2: free",
              "slot 3: free",
              "slot 4: free"
            ]
          },
          "badge": {},
          "v": {
            "free": 4,
            "run": 0,
            "queue": 6
          }
        },
        {
          "title": "Match tasks to the offer",
          "text": "The scheduler picks tasks, preferring ones whose data already sits on this worker. Moving the job to the data is cheaper than moving the data.",
          "m": [
            "Scheduler",
            "Task queue",
            "take tasks 1 to 4"
          ],
          "set": {
            "Task queue": [
              "!task 1 chosen",
              "!task 2 chosen",
              "!task 3 chosen",
              "!task 4 chosen",
              "task 5",
              "task 6"
            ]
          },
          "badge": {},
          "v": {
            "free": 4,
            "run": 0,
            "queue": 6
          }
        },
        {
          "title": "Send the launch messages",
          "text": "The scheduler sends the four tasks to the worker.",
          "m": [
            "Scheduler",
            "Worker",
            "launch tasks 1 to 4"
          ],
          "set": {
            "Worker": [
              "+slot 1: task 1",
              "+slot 2: task 2",
              "+slot 3: task 3",
              "+slot 4: task 4"
            ]
          },
          "badge": {},
          "v": {
            "free": 0,
            "run": 4,
            "queue": 2
          }
        },
        {
          "title": "The worker runs them",
          "text": "All four slots are busy, so the scheduler cannot send more. Running tasks never go above the slots the worker offered.",
          "m": null,
          "set": {
            "Task queue": [
              "task 5",
              "task 6"
            ]
          },
          "badge": {},
          "v": {
            "free": 0,
            "run": 4,
            "queue": 2
          }
        },
        {
          "title": "One task finishes",
          "text": "Task 2 finishes and reports back. Its slot is free again.",
          "m": [
            "Worker",
            "Scheduler",
            "task 2 done, 1 slot free"
          ],
          "set": {
            "Worker": [
              "slot 1: task 1",
              "slot 2: free",
              "slot 3: task 3",
              "slot 4: task 4"
            ]
          },
          "badge": {},
          "v": {
            "free": 1,
            "run": 3,
            "queue": 2
          }
        },
        {
          "title": "The next task goes in",
          "text": "The scheduler sends task 5 into the free slot. This repeats until the queue is empty.",
          "m": [
            "Scheduler",
            "Worker",
            "launch task 5"
          ],
          "set": {
            "Worker": [
              "slot 1: task 1",
              "+slot 2: task 5",
              "slot 3: task 3",
              "slot 4: task 4"
            ],
            "Task queue": [
              "task 6"
            ]
          },
          "badge": {},
          "v": {
            "free": 0,
            "run": 4,
            "queue": 1
          }
        }
      ],
      "kind": "ticks"
    }
  },
  {
    "title": "Task attempt states",
    "blurb": "",
    "intro": "One attempt, from queue to result.",
    "trigger": "A task attempt is created, runs, and ends in one of a few ways: finished, failed or killed.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "A worker goes quiet",
        "short": "Is it slow or dead?",
        "ctx": "A running task is on a worker that stops answering. The scheduler cannot tell right away if it is slow or gone.",
        "fix": "Workers send heartbeats every few seconds. After several missed heartbeats the attempt is marked failed and the task is run again elsewhere."
      },
      {
        "t": "A success arrives too late",
        "short": "It must not count twice.",
        "ctx": "An attempt that was already killed or replaced reports success afterwards.",
        "fix": "Each attempt can end only once. Later reports for an attempt that already ended are ignored."
      }
    ],
    "invariant": "Each attempt has exactly one terminal state.",
    "kind": "kanban",
    "steps": [
      {
        "t": "Created and waiting",
        "x": "The attempt exists but no slot is free yet.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "A slot opens",
        "x": "The scheduler matches the attempt to a free slot and sends the launch message.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "It runs",
        "x": "The worker starts the task code.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "It finishes",
        "x": "The attempt reports success. Its state is FINISHED, and the slot is free for the next task.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Another attempt fails",
        "x": "A second attempt hits an error and reports FAILED. The slot is freed, and the scheduler may try the task again as a new attempt.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "A silent worker",
        "x": "A third attempt runs on a worker that stops sending heartbeats. After a while the scheduler decides it is gone and marks the attempt failed.",
        "s": {
          "k": 5
        }
      },
      {
        "t": "A late success is ignored",
        "x": "If a killed or failed attempt reports success afterwards, the report is ignored. An attempt only ever ends once.",
        "s": {
          "k": 6
        }
      }
    ],
    "scene": {
      "actors": [
        "Task attempt",
        "Scheduler",
        "Worker slot"
      ],
      "steps": [
        {
          "title": "Created and waiting",
          "text": "The attempt exists but no slot is free yet.",
          "m": null,
          "set": {},
          "badge": {
            "Task attempt": "PENDING",
            "Worker slot": "BUSY"
          },
          "v": {
            "cards": [
              {
                "id": "A1",
                "col": 0,
                "note": "no free slot"
              }
            ]
          }
        },
        {
          "title": "A slot opens",
          "text": "The scheduler matches the attempt to a free slot and sends the launch message.",
          "m": [
            "Scheduler",
            "Worker slot",
            "launch attempt"
          ],
          "set": {},
          "badge": {
            "Task attempt": "LAUNCHED",
            "Worker slot": "RESERVED"
          },
          "v": {
            "cards": [
              {
                "id": "A1",
                "col": 1,
                "note": "slot matched"
              }
            ]
          }
        },
        {
          "title": "It runs",
          "text": "The worker starts the task code.",
          "m": [
            "Worker slot",
            "Task attempt",
            "start"
          ],
          "set": {},
          "badge": {
            "Task attempt": "RUNNING",
            "Worker slot": "IN USE"
          },
          "v": {
            "cards": [
              {
                "id": "A1",
                "col": 2
              }
            ]
          }
        },
        {
          "title": "It finishes",
          "text": "The attempt reports success. Its state is FINISHED, and the slot is free for the next task.",
          "m": [
            "Task attempt",
            "Scheduler",
            "done"
          ],
          "set": {},
          "badge": {
            "Task attempt": "FINISHED",
            "Worker slot": "FREE"
          },
          "v": {
            "cards": [
              {
                "id": "A1",
                "col": 3,
                "note": "success"
              }
            ]
          }
        },
        {
          "title": "Another attempt fails",
          "text": "A second attempt hits an error and reports FAILED. The slot is freed, and the scheduler may try the task again as a new attempt.",
          "m": [
            "Task attempt",
            "Scheduler",
            "failed"
          ],
          "set": {},
          "badge": {
            "Task attempt": "FAILED",
            "Worker slot": "FREE"
          },
          "v": {
            "cards": [
              {
                "id": "A1",
                "col": 3,
                "note": "success"
              },
              {
                "id": "A2",
                "col": 4,
                "note": "error"
              }
            ]
          }
        },
        {
          "title": "A silent worker",
          "text": "A third attempt runs on a worker that stops sending heartbeats. After a while the scheduler decides it is gone and marks the attempt failed.",
          "m": [
            "Scheduler",
            "Task attempt",
            "no heartbeat, failed"
          ],
          "set": {},
          "badge": {
            "Task attempt": "FAILED",
            "Worker slot": "LOST"
          },
          "v": {
            "cards": [
              {
                "id": "A1",
                "col": 3,
                "note": "success"
              },
              {
                "id": "A2",
                "col": 4,
                "note": "error"
              },
              {
                "id": "A3",
                "col": 2,
                "note": "running"
              }
            ]
          }
        },
        {
          "title": "A late success is ignored",
          "text": "If a killed or failed attempt reports success afterwards, the report is ignored. An attempt only ever ends once.",
          "m": [
            "Task attempt",
            "Scheduler",
            "late: success"
          ],
          "set": {
            "Scheduler": [
              "~late report ignored"
            ]
          },
          "badge": {},
          "v": {
            "cards": [
              {
                "id": "A1",
                "col": 3,
                "note": "success"
              },
              {
                "id": "A2",
                "col": 4,
                "note": "error"
              },
              {
                "id": "A3",
                "col": 4,
                "note": "no heartbeat"
              },
              {
                "id": "A2",
                "col": 5,
                "ghost": true,
                "note": "late success"
              }
            ]
          }
        }
      ],
      "kind": "kanban"
    }
  },
  {
    "title": "Wait for a local slot, then step down",
    "blurb": "",
    "intro": "A task prefers the executor that holds its data. If no slot is free there, it waits a bounded time at each locality level before accepting a farther one.",
    "trigger": "A task prefers the executor that holds its data, but every slot on that executor is busy right now.",
    "run": "spark-submit --conf spark.locality.wait=3s app.py  # 3s is the default",
    "expect": "The task waits at most one locality wait per level it passes, then runs somewhere else. The delay is bounded.",
    "edges": [
      {
        "t": "No slot at the data's executor",
        "short": "Wait a bounded time, then step down.",
        "ctx": "The data is on one executor, which is busy. Waiting without limit would leave the other slots idle.",
        "fix": "Each locality level gets a bounded wait (spark.locality.wait, default 3 s). After it, the task moves to the next level."
      },
      {
        "t": "The wait costs more than a remote read",
        "short": "Lower the wait, not the rule.",
        "ctx": "For short tasks or a fast network, a 3 s wait can take longer than the read it saves.",
        "fix": "Lower spark.locality.wait, or set a per-level value such as spark.locality.wait.node, after measuring."
      }
    ],
    "invariant": "",
    "kind": "ladder",
    "steps": [
      {
        "t": "The task wants its data",
        "x": "The block the task reads is cached on executor 1. The scheduler first looks for a free slot on executor 1, the best level, which is PROCESS_LOCAL.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "No slot there: start a wait",
        "x": "Executor 1 is full. The scheduler starts a timer and waits up to spark.locality.wait, 3 seconds by default, for a slot at this level.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Timer ends: step down one level",
        "x": "No PROCESS_LOCAL slot appeared. The scheduler moves to NODE_LOCAL, meaning any executor on the same host, and starts a new wait.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "A slot opens on the same host",
        "x": "Executor 2 on the same host frees a slot before the timer ends. The task starts there and does not cross hosts to read its data.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Every level gave up: run anywhere",
        "x": "If no slot had appeared on the same host either, the scheduler would also wait at RACK_LOCAL, then run the task on any free slot. Each wait is bounded, so the task always runs.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Set the wait to zero",
        "x": "With spark.locality.wait=0 the scheduler does not wait at all and takes the first free slot. Longer waits keep more reads local, at the cost of idle time.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "ladder",
      "steps": [
        {
          "title": "The task wants its data",
          "text": "The block the task reads is cached on executor 1. The scheduler first looks for a free slot on executor 1, the best level, which is PROCESS_LOCAL.",
          "v": {
            "level": 0,
            "since": 0,
            "t": 0,
            "ran": null,
            "passed": []
          }
        },
        {
          "title": "No slot there: start a wait",
          "text": "Executor 1 is full. The scheduler starts a timer and waits up to spark.locality.wait, 3 seconds by default, for a slot at this level.",
          "v": {
            "level": 0,
            "since": 0,
            "t": 1.5,
            "ran": null,
            "passed": []
          }
        },
        {
          "title": "Timer ends: step down one level",
          "text": "No PROCESS_LOCAL slot appeared. The scheduler moves to NODE_LOCAL, meaning any executor on the same host, and starts a new wait.",
          "v": {
            "level": 1,
            "since": 3,
            "t": 3,
            "ran": null,
            "passed": [
              0
            ]
          }
        },
        {
          "title": "A slot opens on the same host",
          "text": "Executor 2 on the same host frees a slot before the timer ends. The task starts there and does not cross hosts to read its data.",
          "v": {
            "level": 1,
            "since": 3,
            "t": 4,
            "ran": 1,
            "passed": [
              0
            ]
          }
        },
        {
          "title": "Every level gave up: run anywhere",
          "text": "If no slot had appeared on the same host either, the scheduler would also wait at RACK_LOCAL, then run the task on any free slot. Each wait is bounded, so the task always runs.",
          "v": {
            "level": 3,
            "since": 9,
            "t": 9,
            "ran": 3,
            "passed": [
              0,
              1,
              2
            ]
          }
        },
        {
          "title": "Set the wait to zero",
          "text": "With spark.locality.wait=0 the scheduler does not wait at all and takes the first free slot. Longer waits keep more reads local, at the cost of idle time.",
          "v": {
            "level": 0,
            "since": 0,
            "t": 0,
            "ran": null,
            "passed": [],
            "zero": true
          }
        }
      ]
    }
  },
  {
    "title": "Retry a failed attempt until the limit",
    "blurb": "",
    "intro": "A failure from an application error is retried on another executor. If the same task keeps failing, the limit stops the job instead of looping forever.",
    "trigger": "A task attempt fails because of an error in the application, such as an exception in user code or bad input.",
    "run": "spark-submit --conf spark.task.maxFailures=4 app.py  # 4 is the default",
    "expect": "The same task may fail up to 4 times. The fourth failure aborts the job with the last error.",
    "edges": [
      {
        "t": "A flaky failure, then success",
        "short": "The retry hides it.",
        "ctx": "A network blip fails one attempt. The next attempt on another executor succeeds, and the job completes.",
        "fix": "The failed attempt stays in the logs, and only the successful attempt produces the result."
      },
      {
        "t": "A deterministic error",
        "short": "Retries only repeat it.",
        "ctx": "Bad input or a bug in the code fails the same way on every attempt, so each retry wastes time.",
        "fix": "After the fourth failure the job aborts with the task error. Fix the cause, then rerun."
      }
    ],
    "invariant": "",
    "kind": "budget",
    "steps": [
      {
        "t": "Attempt 0 starts",
        "x": "Task 7 starts its first attempt. Nothing has failed yet, so all 4 attempts are still available.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Attempt 0 fails",
        "x": "An exception in the user code fails the attempt. The scheduler records the reason and queues the task again as a new attempt.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Attempt 1 fails too",
        "x": "The retry runs on another executor and fails with the same error. Two failures are now on record, and two attempts remain.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Attempt 2 fails",
        "x": "The third attempt fails in the same way. One attempt is left.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Attempt 3 fails: the limit is reached",
        "x": "The fourth failure uses up spark.task.maxFailures. The scheduler stops retrying this task.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "The job is aborted",
        "x": "The job stops, and its error message shows the last failure. Retrying more would only repeat the same error.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "budget",
      "steps": [
        {
          "title": "Attempt 0 starts",
          "text": "Task 7 starts its first attempt. Nothing has failed yet, so all 4 attempts are still available.",
          "v": {
            "att": [
              "run"
            ]
          }
        },
        {
          "title": "Attempt 0 fails",
          "text": "An exception in the user code fails the attempt. The scheduler records the reason and queues the task again as a new attempt.",
          "v": {
            "att": [
              "fail",
              "run"
            ]
          }
        },
        {
          "title": "Attempt 1 fails too",
          "text": "The retry runs on another executor and fails with the same error. Two failures are now on record, and two attempts remain.",
          "v": {
            "att": [
              "fail",
              "fail",
              "run"
            ]
          }
        },
        {
          "title": "Attempt 2 fails",
          "text": "The third attempt fails in the same way. One attempt is left.",
          "v": {
            "att": [
              "fail",
              "fail",
              "fail",
              "run"
            ]
          }
        },
        {
          "title": "Attempt 3 fails: the limit is reached",
          "text": "The fourth failure uses up spark.task.maxFailures. The scheduler stops retrying this task.",
          "v": {
            "att": [
              "fail",
              "fail",
              "fail",
              "fail"
            ]
          }
        },
        {
          "title": "The job is aborted",
          "text": "The job stops, and its error message shows the last failure. Retrying more would only repeat the same error.",
          "v": {
            "att": [
              "fail",
              "fail",
              "fail",
              "fail"
            ],
            "abort": true
          }
        }
      ]
    }
  },
  {
    "title": "Cores per task set the slot count",
    "blurb": "",
    "intro": "Each task takes spark.task.cpus cores from the executor. The number of tasks an executor can run at once is its cores divided by that value.",
    "trigger": "Each task needs 2 cores (spark.task.cpus=2), and the executor offers 4 cores.",
    "run": "spark-submit --executor-cores 4 --conf spark.task.cpus=2 app.py",
    "expect": "Two tasks run at once on this executor. The number of slots is executor cores divided by spark.task.cpus, rounded down.",
    "edges": [
      {
        "t": "Cores are not a multiple of cpus",
        "short": "Some cores sit idle.",
        "ctx": "With 5 cores and spark.task.cpus=2, only 2 tasks run at once and one core stays idle.",
        "fix": "Choose executor cores as a multiple of spark.task.cpus, or accept the idle core."
      },
      {
        "t": "A task needs more cores than an executor has",
        "short": "It never fits.",
        "ctx": "spark.task.cpus=4 on an executor with 2 cores: no offer can cover the task, so it waits with nothing else running there.",
        "fix": "Set executor cores to at least spark.task.cpus, or lower spark.task.cpus."
      }
    ],
    "invariant": "",
    "kind": "cores",
    "steps": [
      {
        "t": "The executor offers 4 cores",
        "x": "The executor registers with 4 free cores. Nothing is running yet.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "The first task takes 2 cores",
        "x": "The scheduler matches task 1 to the offer. It needs 2 cores, so it takes 2 of the 4.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "A second task fits in the rest",
        "x": "Task 2 also needs 2 cores. The 2 cores left are exactly enough, so it starts. All 4 cores are now busy.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "A third task waits",
        "x": "Task 3 is ready, but no 2 free cores remain. It waits in the queue. The executor is not idle: it is full.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Task 1 finishes",
        "x": "Task 1 reports success and frees its 2 cores. The scheduler offers them again, and task 3 starts.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Compare with spark.task.cpus=1",
        "x": "With one core per task, the same 4 cores would run 4 tasks at once. The same hardware gives twice the slots.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "cores",
      "steps": [
        {
          "title": "The executor offers 4 cores",
          "text": "The executor registers with 4 free cores. Nothing is running yet.",
          "v": {
            "cores": 4,
            "cpus": 2,
            "tasks": []
          }
        },
        {
          "title": "The first task takes 2 cores",
          "text": "The scheduler matches task 1 to the offer. It needs 2 cores, so it takes 2 of the 4.",
          "v": {
            "cores": 4,
            "cpus": 2,
            "tasks": [
              {
                "id": "T1",
                "at": [
                  0,
                  1
                ],
                "s": "run"
              }
            ]
          }
        },
        {
          "title": "A second task fits in the rest",
          "text": "Task 2 also needs 2 cores. The 2 cores left are exactly enough, so it starts. All 4 cores are now busy.",
          "v": {
            "cores": 4,
            "cpus": 2,
            "tasks": [
              {
                "id": "T1",
                "at": [
                  0,
                  1
                ],
                "s": "run"
              },
              {
                "id": "T2",
                "at": [
                  2,
                  3
                ],
                "s": "run"
              }
            ]
          }
        },
        {
          "title": "A third task waits",
          "text": "Task 3 is ready, but no 2 free cores remain. It waits in the queue. The executor is not idle: it is full.",
          "v": {
            "cores": 4,
            "cpus": 2,
            "tasks": [
              {
                "id": "T1",
                "at": [
                  0,
                  1
                ],
                "s": "run"
              },
              {
                "id": "T2",
                "at": [
                  2,
                  3
                ],
                "s": "run"
              },
              {
                "id": "T3",
                "s": "wait"
              }
            ]
          }
        },
        {
          "title": "Task 1 finishes",
          "text": "Task 1 reports success and frees its 2 cores. The scheduler offers them again, and task 3 starts.",
          "v": {
            "cores": 4,
            "cpus": 2,
            "tasks": [
              {
                "id": "T3",
                "at": [
                  0,
                  1
                ],
                "s": "run"
              },
              {
                "id": "T2",
                "at": [
                  2,
                  3
                ],
                "s": "run"
              }
            ]
          }
        },
        {
          "title": "Compare with spark.task.cpus=1",
          "text": "With one core per task, the same 4 cores would run 4 tasks at once. The same hardware gives twice the slots.",
          "v": {
            "cores": 4,
            "cpus": 1,
            "tasks": [
              {
                "id": "T1",
                "at": [
                  0
                ],
                "s": "run"
              },
              {
                "id": "T2",
                "at": [
                  1
                ],
                "s": "run"
              },
              {
                "id": "T3",
                "at": [
                  2
                ],
                "s": "run"
              },
              {
                "id": "T4",
                "at": [
                  3
                ],
                "s": "run"
              }
            ]
          }
        }
      ]
    }
  }
];
