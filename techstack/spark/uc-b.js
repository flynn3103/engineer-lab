/* Spark use cases: course content and complete animation state. */
CourseData.uc["shuffle"] = [
  {
    "title": "Write and index map output",
    "blurb": "",
    "intro": "The index file turns one big file into addressable ranges.",
    "trigger": "A map task has finished reading its partition and must leave its results where the reduce tasks can pick them up.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "Almost every key is different",
        "short": "Combining saves nothing.",
        "ctx": "If each word appears once, adding up in memory removes no records, and the work is wasted.",
        "fix": "Spark skips the combine for jobs where it cannot help, such as grouping everything per key."
      },
      {
        "t": "Too many tiny slices",
        "short": "Reducers read many small pieces.",
        "ctx": "With thousands of reducers, each slice of a file is very small, so reducers waste time jumping around the disk.",
        "fix": "Use fewer reduce partitions, or let Spark merge small ones at run time."
      }
    ],
    "invariant": "Combined partial state sums to the same total as raw records.",
    "kind": "stacked",
    "steps": [
      {
        "t": "Records come in",
        "x": "The task reads six records. Each is a word and a count of 1.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Combine as you go",
        "x": "Instead of keeping six records, the task adds them up in memory by word: cat 3, dog 2, bird 1. Less data to move later.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Memory is full, so write a run",
        "x": "If memory runs out, the task sorts what it has and writes it to disk as a &quot;run&quot;, then makes room. This can happen several times.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Decide who gets which key",
        "x": "Each word goes to one reduce task, chosen by a fixed formula on the word. Here reducer 0 gets bird and cat, and reducer 1 gets dog.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "One data file",
        "x": "The task merges its runs and the memory leftovers into a single file, ordered by reducer.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "An index file",
        "x": "Next to it goes a tiny index that says where each reducer&#39;s part starts: reducer 0 at byte 0, reducer 1 at byte 40. A reducer can read just its slice.",
        "s": {
          "k": 5
        }
      },
      {
        "t": "Tell the driver",
        "x": "The task reports where its files are. The data never passed through the driver. Only the address did.",
        "s": {
          "k": 6
        }
      }
    ],
    "scene": {
      "actors": [
        "Map task",
        "Memory",
        "Disk",
        "Driver"
      ],
      "steps": [
        {
          "title": "Records come in",
          "text": "The task reads six records. Each is a word and a count of 1.",
          "m": null,
          "set": {
            "Map task": [
              "cat 1",
              "dog 1",
              "cat 1",
              "bird 1",
              "dog 1",
              "cat 1"
            ]
          },
          "badge": {},
          "v": {
            "raw": true,
            "mem": [
              [
                "cat",
                1,
                0
              ],
              [
                "dog",
                1,
                1
              ],
              [
                "cat",
                1,
                0
              ],
              [
                "bird",
                1,
                0
              ],
              [
                "dog",
                1,
                1
              ],
              [
                "cat",
                1,
                0
              ]
            ],
            "run": [],
            "file": []
          }
        },
        {
          "title": "Combine as you go",
          "text": "Instead of keeping six records, the task adds them up in memory by word: cat 3, dog 2, bird 1. Less data to move later.",
          "m": [
            "Map task",
            "Memory",
            "add up by key"
          ],
          "set": {
            "Memory": [
              "cat 3",
              "dog 2",
              "bird 1"
            ]
          },
          "badge": {},
          "v": {
            "mem": [
              [
                "cat",
                3,
                0
              ],
              [
                "dog",
                2,
                1
              ],
              [
                "bird",
                1,
                0
              ]
            ],
            "run": [],
            "file": []
          }
        },
        {
          "title": "Memory is full, so write a run",
          "text": "If memory runs out, the task sorts what it has and writes it to disk as a \"run\", then makes room. This can happen several times.",
          "m": [
            "Memory",
            "Disk",
            "spill sorted run"
          ],
          "set": {
            "Disk": [
              "+run 1: bird 1, cat 2"
            ]
          },
          "badge": {},
          "v": {
            "mem": [
              [
                "cat",
                1,
                0
              ],
              [
                "dog",
                2,
                1
              ]
            ],
            "run": [
              [
                "bird",
                1,
                0
              ],
              [
                "cat",
                2,
                0
              ]
            ],
            "file": []
          }
        },
        {
          "title": "Decide who gets which key",
          "text": "Each word goes to one reduce task, chosen by a fixed formula on the word. Here reducer 0 gets bird and cat, and reducer 1 gets dog.",
          "m": [
            "Map task",
            "Memory",
            "pick a reducer per key"
          ],
          "set": {
            "Memory": [
              "reducer 0: bird 1, cat 3",
              "reducer 1: dog 2"
            ]
          },
          "badge": {},
          "v": {
            "mem": [
              [
                "cat",
                1,
                0
              ],
              [
                "dog",
                2,
                1
              ]
            ],
            "run": [
              [
                "bird",
                1,
                0
              ],
              [
                "cat",
                2,
                0
              ]
            ],
            "file": [],
            "assign": true
          }
        },
        {
          "title": "One data file",
          "text": "The task merges its runs and the memory leftovers into a single file, ordered by reducer.",
          "m": [
            "Memory",
            "Disk",
            "write data file"
          ],
          "set": {
            "Disk": [
              "run 1",
              "+data file: [bird, cat] [dog]"
            ]
          },
          "badge": {},
          "v": {
            "mem": [],
            "run": [],
            "file": [
              [
                "bird",
                1,
                0
              ],
              [
                "cat",
                3,
                0
              ],
              [
                "dog",
                2,
                1
              ]
            ]
          }
        },
        {
          "title": "An index file",
          "text": "Next to it goes a tiny index that says where each reducer's part starts: reducer 0 at byte 0, reducer 1 at byte 40. A reducer can read just its slice.",
          "m": [
            "Map task",
            "Disk",
            "write index"
          ],
          "set": {
            "Disk": [
              "data file: [bird, cat] [dog]",
              "+index: r0 at 0, r1 at 40"
            ]
          },
          "badge": {},
          "v": {
            "mem": [],
            "run": [],
            "file": [
              [
                "bird",
                1,
                0
              ],
              [
                "cat",
                3,
                0
              ],
              [
                "dog",
                2,
                1
              ]
            ],
            "index": true
          }
        },
        {
          "title": "Tell the driver",
          "text": "The task reports where its files are. The data never passed through the driver. Only the address did.",
          "m": [
            "Map task",
            "Driver",
            "my output is on host A"
          ],
          "set": {
            "Driver": [
              "+map task 1: host A"
            ]
          },
          "badge": {},
          "v": {
            "mem": [],
            "run": [],
            "file": [
              [
                "bird",
                1,
                0
              ],
              [
                "cat",
                3,
                0
              ],
              [
                "dog",
                2,
                1
              ]
            ],
            "index": true,
            "driver": true
          }
        }
      ],
      "kind": "stacked"
    }
  },
  {
    "title": "Reducer fetches its ranges",
    "blurb": "",
    "intro": "Locations come from the driver. Bytes do not.",
    "trigger": "A reduce task starts. It needs its own slice of the output of every map task, and those slices live on different machines.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "A host is dead",
        "short": "The fetch fails.",
        "ctx": "The reducer cannot reach host B, so the data it needs is gone.",
        "fix": "It reports a fetch failure to the driver. The driver reruns just the lost map tasks, then the reducer tries again."
      },
      {
        "t": "Too many requests at once",
        "short": "Memory or connections run out.",
        "ctx": "A reducer with thousands of map outputs asks them all at the same moment.",
        "fix": "There is a cap on bytes and requests in flight. Spark only asks for more as earlier ones finish."
      }
    ],
    "invariant": "Fetched bytes in flight never exceed the configured cap.",
    "kind": "lanes",
    "steps": [
      {
        "t": "The reducer starts",
        "x": "Reducer 1 needs the &quot;dog&quot; data from all three map tasks, but it does not know where they are.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Ask the driver",
        "x": "The driver keeps a map of where every map output lives.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Get the addresses",
        "x": "Map 0 is on host A, map 1 on host B, map 2 on host C.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Fetch in parallel, with a limit",
        "x": "The reducer asks hosts A and B at once. Host C waits, because only a few requests may be in the air at the same time. This protects memory and connections.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "The last one is fetched",
        "x": "As soon as a request finishes, the next starts. The data of host C arrives.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Merge the parts",
        "x": "Now the reducer adds the partial counts for each key: dog is 2 + 1 + 4 = 7.",
        "s": {
          "k": 5
        }
      },
      {
        "t": "Let go of the buffers",
        "x": "Each fetched part is thrown away as soon as it has been used, so memory stays small.",
        "s": {
          "k": 6
        }
      }
    ],
    "scene": {
      "actors": [
        "Reducer",
        "Driver",
        "Map outputs"
      ],
      "steps": [
        {
          "title": "The reducer starts",
          "text": "Reducer 1 needs the \"dog\" data from all three map tasks, but it does not know where they are.",
          "m": null,
          "set": {
            "Reducer": [
              "needs slice 1 of map 0, 1, 2"
            ]
          },
          "badge": {},
          "v": {
            "known": false,
            "asked": false,
            "lanes": [],
            "inflight": 0
          }
        },
        {
          "title": "Ask the driver",
          "text": "The driver keeps a map of where every map output lives.",
          "m": [
            "Reducer",
            "Driver",
            "where are the map outputs?"
          ],
          "set": {},
          "badge": {},
          "v": {
            "known": false,
            "asked": true,
            "lanes": [],
            "inflight": 0
          }
        },
        {
          "title": "Get the addresses",
          "text": "Map 0 is on host A, map 1 on host B, map 2 on host C.",
          "m": [
            "Driver",
            "Reducer",
            "A, B, C"
          ],
          "set": {
            "Driver": [
              "map 0 → A",
              "map 1 → B",
              "map 2 → C"
            ]
          },
          "badge": {},
          "v": {
            "known": true,
            "lanes": [
              {
                "h": "A",
                "p": 0,
                "s": "wait"
              },
              {
                "h": "B",
                "p": 0,
                "s": "wait"
              },
              {
                "h": "C",
                "p": 0,
                "s": "wait"
              }
            ],
            "inflight": 0
          }
        },
        {
          "title": "Fetch in parallel, with a limit",
          "text": "The reducer asks hosts A and B at once. Host C waits, because only a few requests may be in the air at the same time. This protects memory and connections.",
          "m": [
            "Reducer",
            "Map outputs",
            "fetch from A and B"
          ],
          "set": {
            "Map outputs": [
              "+A: slice 1 (dog 2)",
              "+B: slice 1 (dog 1)",
              "~C: waiting"
            ]
          },
          "badge": {},
          "v": {
            "known": true,
            "lanes": [
              {
                "h": "A",
                "p": 40,
                "s": "fetch"
              },
              {
                "h": "B",
                "p": 40,
                "s": "fetch"
              },
              {
                "h": "C",
                "p": 0,
                "s": "wait"
              }
            ],
            "inflight": 2
          }
        },
        {
          "title": "The last one is fetched",
          "text": "As soon as a request finishes, the next starts. The data of host C arrives.",
          "m": [
            "Map outputs",
            "Reducer",
            "slices from C"
          ],
          "set": {
            "Map outputs": [
              "A: done",
              "B: done",
              "+C: slice 1 (dog 4)"
            ],
            "Reducer": [
              "dog 2",
              "dog 1",
              "dog 4"
            ]
          },
          "badge": {},
          "v": {
            "known": true,
            "lanes": [
              {
                "h": "A",
                "p": 100,
                "s": "done"
              },
              {
                "h": "B",
                "p": 100,
                "s": "done"
              },
              {
                "h": "C",
                "p": 60,
                "s": "fetch"
              }
            ],
            "inflight": 1
          }
        },
        {
          "title": "Merge the parts",
          "text": "Now the reducer adds the partial counts for each key: dog is 2 + 1 + 4 = 7.",
          "m": [
            "Reducer",
            "Reducer",
            "add up"
          ],
          "set": {
            "Reducer": [
              "+dog 7"
            ]
          },
          "badge": {},
          "v": {
            "known": true,
            "lanes": [
              {
                "h": "A",
                "p": 100,
                "s": "done"
              },
              {
                "h": "B",
                "p": 100,
                "s": "done"
              },
              {
                "h": "C",
                "p": 100,
                "s": "done"
              }
            ],
            "inflight": 0,
            "merge": [
              [
                "A",
                2
              ],
              [
                "B",
                1
              ],
              [
                "C",
                4
              ]
            ]
          }
        },
        {
          "title": "Let go of the buffers",
          "text": "Each fetched part is thrown away as soon as it has been used, so memory stays small.",
          "m": null,
          "set": {
            "Map outputs": []
          },
          "badge": {},
          "v": {
            "known": true,
            "lanes": [
              {
                "h": "A",
                "p": 100,
                "s": "done"
              },
              {
                "h": "B",
                "p": 100,
                "s": "done"
              },
              {
                "h": "C",
                "p": 100,
                "s": "done"
              }
            ],
            "inflight": 0,
            "freed": true
          }
        }
      ],
      "kind": "lanes"
    }
  },
  {
    "title": "Few reducers: skip the sort",
    "blurb": "",
    "intro": "With few reducers and no map-side combine, a map task can write one small file per reducer and join them. With many reducers, sorting into one file is cheaper.",
    "trigger": "A map task has 8 reduce partitions to write, and its records are not combined on the map side.",
    "run": "spark-submit --conf spark.shuffle.sort.bypassMergeThreshold=200 app.py  # 200 is the default",
    "expect": "The output is identical either way. Bypass is only used when the reducer count is at most the threshold and no map-side combine is needed.",
    "edges": [
      {
        "t": "The reduce needs a map-side combine",
        "short": "Bypass cannot combine, so it is not used.",
        "ctx": "reduceByKey adds up values per key on the map side. The bypass path writes records without combining them, so it would lose that saving.",
        "fix": "Spark checks whether a combine is needed before it checks the reducer count."
      },
      {
        "t": "Very many reducers",
        "short": "Too many open files at once.",
        "ctx": "Bypass opens one file per reducer at the same time. With thousands of reducers, that exhausts the open-file limit.",
        "fix": "Above the threshold the sort path writes one sorted file, so only one file is open at a time."
      }
    ],
    "invariant": "",
    "kind": "paths",
    "steps": [
      {
        "t": "Check the conditions",
        "x": "The map task has 8 reducers, which is at most 200, and no map-side combine is needed. The bypass path is allowed.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "One temp file per reducer",
        "x": "Each reducer gets its own temporary file. Each record is appended to the file of the reducer it belongs to. No sorting is needed.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Concatenate into one file",
        "x": "When the task finishes, the 8 temporary files are joined end to end into one data file. The start offset of each part is recorded as it goes.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Write the index and report",
        "x": "An index file records where each reducer segment starts. The temporary files are deleted, and the output is registered with the driver as before.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Many reducers: the sort path",
        "x": "With 1000 reducers the bypass path is not used. The task sorts its records by reducer id, spills if needed, and merges them into one data file.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Why the threshold exists",
        "x": "Bypass keeps one file open per reducer at the same time. Past the threshold, 1000 open files cost more than the sort saves, so the sort path wins.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "paths",
      "steps": [
        {
          "title": "Check the conditions",
          "text": "The map task has 8 reducers, which is at most 200, and no map-side combine is needed. The bypass path is allowed.",
          "v": {
            "R": 8,
            "path": null,
            "checks": [
              [
                "8 reducers ≤ 200",
                true
              ],
              [
                "no map-side combine",
                true
              ]
            ],
            "tmp": 0
          }
        },
        {
          "title": "One temp file per reducer",
          "text": "Each reducer gets its own temporary file. Each record is appended to the file of the reducer it belongs to. No sorting is needed.",
          "v": {
            "R": 8,
            "path": "bypass",
            "checks": [
              [
                "8 reducers ≤ 200",
                true
              ],
              [
                "no map-side combine",
                true
              ]
            ],
            "tmp": 8,
            "open": 8
          }
        },
        {
          "title": "Concatenate into one file",
          "text": "When the task finishes, the 8 temporary files are joined end to end into one data file. The start offset of each part is recorded as it goes.",
          "v": {
            "R": 8,
            "path": "bypass",
            "checks": [
              [
                "8 reducers ≤ 200",
                true
              ],
              [
                "no map-side combine",
                true
              ]
            ],
            "tmp": 8,
            "merged": true,
            "open": 8
          }
        },
        {
          "title": "Write the index and report",
          "text": "An index file records where each reducer segment starts. The temporary files are deleted, and the output is registered with the driver as before.",
          "v": {
            "R": 8,
            "path": "bypass",
            "checks": [
              [
                "8 reducers ≤ 200",
                true
              ],
              [
                "no map-side combine",
                true
              ]
            ],
            "tmp": 0,
            "data": true,
            "index": true,
            "open": 0
          }
        },
        {
          "title": "Many reducers: the sort path",
          "text": "With 1000 reducers the bypass path is not used. The task sorts its records by reducer id, spills if needed, and merges them into one data file.",
          "v": {
            "R": 1000,
            "path": "sort",
            "checks": [
              [
                "1000 reducers > 200",
                false
              ],
              [
                "sort path",
                true
              ]
            ],
            "tmp": 0,
            "sorted": true,
            "open": 1
          }
        },
        {
          "title": "Why the threshold exists",
          "text": "Bypass keeps one file open per reducer at the same time. Past the threshold, 1000 open files cost more than the sort saves, so the sort path wins.",
          "v": {
            "R": 1000,
            "path": "sort",
            "checks": [
              [
                "1000 reducers > 200",
                false
              ],
              [
                "sort path",
                true
              ]
            ],
            "tmp": 0,
            "sorted": true,
            "data": true,
            "index": true,
            "open": 1
          }
        }
      ]
    }
  },
  {
    "title": "Read local ranges from disk",
    "blurb": "",
    "intro": "A reducer does not always need the network. Ranges written on its own executor, or on its own host, can be read straight from disk.",
    "trigger": "A reduce task needs one range from each map output, and the outputs are on the same executor, the same host or another host.",
    "run": "spark-submit --conf spark.shuffle.readHostLocalDisk=true app.py  # true is the default",
    "expect": "Only ranges from other hosts use the network. The in-flight cap applies to those, and local ranges are read straight from disk.",
    "edges": [
      {
        "t": "The local file is gone",
        "short": "The local read fails.",
        "ctx": "The file was deleted, or the host lost its disk after the map task finished.",
        "fix": "The reader reports a fetch failure, and the driver reruns that map task, just as in the fetch-failure case above."
      },
      {
        "t": "A host with many executors",
        "short": "Many local reads at the same time.",
        "ctx": "Lots of local reads on one machine can saturate its disk, even though none of them uses the network.",
        "fix": "Spread the reducers across hosts, or raise disk bandwidth; the cap still bounds the remote part."
      }
    ],
    "invariant": "",
    "kind": "routes",
    "steps": [
      {
        "t": "Ask the driver for locations",
        "x": "The reducer asks the driver where each map output lives. Every answer names an executor and a host, so the reducer can group the ranges by where they are.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Group the ranges by location",
        "x": "Two ranges are on the reducer&#39;s own executor, one is on another executor on the same host, and three are on a different host.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Local ranges are read from disk",
        "x": "The two ranges on the same executor are read from its local files. No socket is opened, and no bytes cross the network.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Same-host ranges read the disk directly",
        "x": "The range on the other executor sits on the same machine. The reducer reads that file from the local disk too, so it skips the network.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Remote ranges go over the network",
        "x": "The three ranges on the other host use the network, within the cap. Only two requests are in the air at a time.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Merge all six ranges",
        "x": "All ranges are in. The reducer merges the partial sums, and the result is the same as if every range had come over the network.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "routes",
      "steps": [
        {
          "title": "Ask the driver for locations",
          "text": "The reducer asks the driver where each map output lives. Every answer names an executor and a host, so the reducer can group the ranges by where they are.",
          "v": {
            "L": [
              "wait",
              "wait"
            ],
            "H": [
              "wait"
            ],
            "R": [
              "wait",
              "wait",
              "wait"
            ]
          }
        },
        {
          "title": "Group the ranges by location",
          "text": "Two ranges are on the reducer's own executor, one is on another executor on the same host, and three are on a different host.",
          "v": {
            "L": [
              "wait",
              "wait"
            ],
            "H": [
              "wait"
            ],
            "R": [
              "wait",
              "wait",
              "wait"
            ]
          }
        },
        {
          "title": "Local ranges are read from disk",
          "text": "The two ranges on the same executor are read from its local files. No socket is opened, and no bytes cross the network.",
          "v": {
            "L": [
              "disk",
              "disk"
            ],
            "H": [
              "wait"
            ],
            "R": [
              "wait",
              "wait",
              "wait"
            ]
          }
        },
        {
          "title": "Same-host ranges read the disk directly",
          "text": "The range on the other executor sits on the same machine. The reducer reads that file from the local disk too, so it skips the network.",
          "v": {
            "L": [
              "disk",
              "disk"
            ],
            "H": [
              "disk"
            ],
            "R": [
              "wait",
              "wait",
              "wait"
            ]
          }
        },
        {
          "title": "Remote ranges go over the network",
          "text": "The three ranges on the other host use the network, within the cap. Only two requests are in the air at a time.",
          "v": {
            "L": [
              "disk",
              "disk"
            ],
            "H": [
              "disk"
            ],
            "R": [
              "net",
              "net",
              "wait"
            ],
            "cap": true
          }
        },
        {
          "title": "Merge all six ranges",
          "text": "All ranges are in. The reducer merges the partial sums, and the result is the same as if every range had come over the network.",
          "v": {
            "L": [
              "done",
              "done"
            ],
            "H": [
              "done"
            ],
            "R": [
              "done",
              "done",
              "done"
            ]
          }
        }
      ]
    }
  },
  {
    "title": "Block count grows as maps times reducers",
    "blurb": "",
    "intro": "Each map writes one range per reducer, and each reducer fetches from every map. The number of blocks is the product, so it can grow very fast.",
    "trigger": "A stage has 2000 map tasks and 2000 reduce tasks, and each map writes a range for every reducer.",
    "run": "spark.conf.set(\"spark.sql.adaptive.enabled\", \"true\")  # AQE is on by default since Spark 3.2",
    "expect": "The block count is maps times reducers. Fewer or larger ranges cut the number of requests, which is what slows the reducers down.",
    "edges": [
      {
        "t": "Many tiny blocks",
        "short": "Overhead dominates the work.",
        "ctx": "A round trip and a seek cost about the same for 2 KB as for 2 MB. Millions of tiny blocks make the reducers wait on requests.",
        "fix": "Use fewer partitions, so each block is larger."
      },
      {
        "t": "The reducer count is fixed at planning time",
        "short": "The plan can be too fine.",
        "ctx": "The reducer count is chosen before the data sizes are known, and it is often too high for a small shuffle.",
        "fix": "Adaptive execution merges small neighbours after the map stage, as in the last step."
      }
    ],
    "invariant": "",
    "kind": "explode",
    "steps": [
      {
        "t": "Count the maps and reducers",
        "x": "The stage has 2000 map tasks and 2000 reduce tasks. Each map output holds one range per reducer, so the blocks multiply: 2000 times 2000 is 4 million.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Every map writes a range per reducer",
        "x": "One map output is 2000 small ranges, each only a few kilobytes. Writing them is cheap, but the index now has 2000 entries per map.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Every reducer asks every map",
        "x": "Each reducer needs one range from each of the 2000 maps, so it makes 2000 separate fetches. Across all reducers that is 4 million requests.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Small reads are dominated by overhead",
        "x": "Each request costs a round trip and a disk seek, however small the range. With 2 KB ranges, the overhead costs more than the bytes themselves.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Use fewer reduce partitions",
        "x": "With 200 reducers there are 400,000 blocks. Each range is ten times bigger, and each reducer still fetches from 2000 maps.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Let the engine merge small partitions",
        "x": "Adaptive query execution can plan 2000 reduce partitions and merge small neighbours at run time, down to 200 here. The blocks drop to the same 400,000.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "explode",
      "steps": [
        {
          "title": "Count the maps and reducers",
          "text": "The stage has 2000 map tasks and 2000 reduce tasks. Each map output holds one range per reducer, so the blocks multiply: 2000 times 2000 is 4 million.",
          "v": {
            "M": 2000,
            "R": 2000
          }
        },
        {
          "title": "Every map writes a range per reducer",
          "text": "One map output is 2000 small ranges, each only a few kilobytes. Writing them is cheap, but the index now has 2000 entries per map.",
          "v": {
            "M": 2000,
            "R": 2000,
            "note": "each map output has 2000 ranges, one per reducer"
          }
        },
        {
          "title": "Every reducer asks every map",
          "text": "Each reducer needs one range from each of the 2000 maps, so it makes 2000 separate fetches. Across all reducers that is 4 million requests.",
          "v": {
            "M": 2000,
            "R": 2000,
            "note": "each reducer makes 2000 fetches, one per map"
          }
        },
        {
          "title": "Small reads are dominated by overhead",
          "text": "Each request costs a round trip and a disk seek, however small the range. With 2 KB ranges, the overhead costs more than the bytes themselves.",
          "v": {
            "M": 2000,
            "R": 2000,
            "note": "every request costs a round trip and a seek, even for a 2 KB range"
          }
        },
        {
          "title": "Use fewer reduce partitions",
          "text": "With 200 reducers there are 400,000 blocks. Each range is ten times bigger, and each reducer still fetches from 2000 maps.",
          "v": {
            "M": 2000,
            "R": 200
          }
        },
        {
          "title": "Let the engine merge small partitions",
          "text": "Adaptive query execution can plan 2000 reduce partitions and merge small neighbours at run time, down to 200 here. The blocks drop to the same 400,000.",
          "v": {
            "M": 2000,
            "R": 200,
            "planned": 2000
          }
        }
      ]
    }
  }
];
CourseData.uc["memory"] = [
  {
    "title": "Grow state under a grant",
    "blurb": "",
    "intro": "Each insert asks for more memory before growing.",
    "trigger": "A task is building a big table in memory, for example counting words, and it keeps growing.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "A structure that cannot spill",
        "short": "The task fails.",
        "ctx": "Some data, such as a big list that must stay whole, cannot be written out in pieces. If memory is refused, there is no way out.",
        "fix": "Task fails with an out-of-memory error. Give each task more memory, or make partitions smaller so the structure fits."
      },
      {
        "t": "Too many runs",
        "short": "The final merge is slow.",
        "ctx": "With a tiny memory pool, the task writes hundreds of small runs, and merging them takes long.",
        "fix": "Give tasks more memory or use fewer, bigger tasks so fewer runs are written."
      }
    ],
    "invariant": "Spilling never changes the final result.",
    "kind": "sawtooth",
    "steps": [
      {
        "t": "Ask before growing",
        "x": "The task is counting words. Before the table gets bigger, it asks the memory manager for another 64 MB.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Granted",
        "x": "There is room, so the answer is yes and the table grows.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Asked again, refused",
        "x": "The pool is now full, so the next request is refused. The task cannot grow any more.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Write a run to disk",
        "x": "Instead of crashing, the task sorts its table and writes it to disk as a run. Then it hands back that memory.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Keep going",
        "x": "The task starts a new, small table and goes on reading. When memory fills again, it writes run 2.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Merge at the end",
        "x": "At the end the task merges run 1, run 2 and what is left in memory, adding up counts for the same word.",
        "s": {
          "k": 5
        }
      },
      {
        "t": "Same answer",
        "x": "The result is exactly what it would have been with unlimited memory. Spilling only costs time.",
        "s": {
          "k": 6
        }
      }
    ],
    "scene": {
      "actors": [
        "Task",
        "Memory manager",
        "Disk"
      ],
      "steps": [
        {
          "title": "Ask before growing",
          "text": "The task is counting words. Before the table gets bigger, it asks the memory manager for another 64 MB.",
          "m": [
            "Task",
            "Memory manager",
            "may I have 64 MB more?"
          ],
          "set": {
            "Task": [
              "table: 64 MB"
            ],
            "Memory manager": [
              "pool: 128 MB, used 64 MB"
            ]
          },
          "badge": {},
          "v": {
            "used": 0,
            "runs": 0,
            "ask": 64
          }
        },
        {
          "title": "Granted",
          "text": "There is room, so the answer is yes and the table grows.",
          "m": [
            "Memory manager",
            "Task",
            "yes"
          ],
          "set": {
            "Task": [
              "table: 128 MB"
            ],
            "Memory manager": [
              "pool: 128 MB, used 128 MB"
            ]
          },
          "badge": {},
          "v": {
            "used": 64,
            "runs": 0
          }
        },
        {
          "title": "Asked again, refused",
          "text": "The pool is now full, so the next request is refused. The task cannot grow any more.",
          "m": [
            "Task",
            "Memory manager",
            "may I have 64 MB more?"
          ],
          "set": {
            "Memory manager": [
              "!pool full: refused"
            ]
          },
          "badge": {},
          "v": {
            "used": 128,
            "runs": 0,
            "refused": true
          }
        },
        {
          "title": "Write a run to disk",
          "text": "Instead of crashing, the task sorts its table and writes it to disk as a run. Then it hands back that memory.",
          "m": [
            "Task",
            "Disk",
            "spill run 1"
          ],
          "set": {
            "Disk": [
              "+run 1 (sorted)"
            ],
            "Task": [
              "table: empty"
            ],
            "Memory manager": [
              "pool: 128 MB, used 0 MB"
            ]
          },
          "badge": {},
          "v": {
            "used": 0,
            "runs": 1
          }
        },
        {
          "title": "Keep going",
          "text": "The task starts a new, small table and goes on reading. When memory fills again, it writes run 2.",
          "m": [
            "Task",
            "Disk",
            "spill run 2"
          ],
          "set": {
            "Disk": [
              "run 1",
              "+run 2"
            ]
          },
          "badge": {},
          "v": {
            "used": 64,
            "runs": 1
          }
        },
        {
          "title": "Merge at the end",
          "text": "At the end the task merges run 1, run 2 and what is left in memory, adding up counts for the same word.",
          "m": [
            "Disk",
            "Task",
            "merge runs"
          ],
          "set": {
            "Task": [
              "+final counts"
            ]
          },
          "badge": {},
          "v": {
            "used": 0,
            "runs": 2,
            "merge": true
          }
        },
        {
          "title": "Same answer",
          "text": "The result is exactly what it would have been with unlimited memory. Spilling only costs time.",
          "m": null,
          "set": {},
          "badge": {},
          "v": {
            "used": 0,
            "runs": 2,
            "merge": true,
            "same": true
          }
        }
      ],
      "kind": "sawtooth"
    }
  },
  {
    "title": "Memory pressure outcomes",
    "blurb": "",
    "intro": "Three different endings. Know which one you are looking at.",
    "trigger": "A worker gets close to the memory limit of the container it runs in.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "It looks like a lost worker",
        "short": "Not like an out-of-memory error.",
        "ctx": "The operating system kills the process, so Spark writes no helpful message. The logs show &quot;executor lost&quot;.",
        "fix": "Look for exit code 137 or &quot;killed by YARN/Kubernetes for exceeding memory&quot;, and raise memory overhead."
      },
      {
        "t": "More memory, same problem",
        "short": "Raising memory is not enough.",
        "ctx": "You raise the Spark memory setting but not the container size, so the hidden part is still squeezed.",
        "fix": "Raise Spark memory and the overhead together."
      }
    ],
    "invariant": "Accounted memory and container memory are different numbers.",
    "kind": "bullet",
    "steps": [
      {
        "t": "Two kinds of memory",
        "x": "The container has a hard limit of 10 GB. Spark keeps careful books for 8 GB of it. The rest is for things Spark does not count.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Tasks grow",
        "x": "Tasks ask for more memory. Spark accounting gives it out until its 8 GB are used.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Spark says no first",
        "x": "The next request is refused. Spillable data is written to disk, and the work goes on safely.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Hidden memory keeps growing",
        "x": "Meanwhile network buffers and native code grow outside the books. Spark cannot refuse them because it does not know about them.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "The container crosses its limit",
        "x": "8 GB plus 3 GB is 11 GB. This is more than the 10 GB limit.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "The OS kills the container",
        "x": "The operating system stops the container at once. There is no tidy error message from Spark. The driver just sees that a worker has vanished.",
        "s": {
          "k": 5
        }
      },
      {
        "t": "The fix",
        "x": "Leave overhead room: ask the cluster for more memory than Spark itself uses. It is room for the memory Spark cannot count.",
        "s": {
          "k": 6
        }
      }
    ],
    "scene": {
      "actors": [
        "Spark accounting",
        "Memory Spark cannot see",
        "Container (OS)"
      ],
      "steps": [
        {
          "title": "Two kinds of memory",
          "text": "The container has a hard limit of 10 GB. Spark keeps careful books for 8 GB of it. The rest is for things Spark does not count.",
          "m": null,
          "set": {
            "Spark accounting": [
              "limit: 8 GB"
            ],
            "Memory Spark cannot see": [
              "network buffers",
              "native code",
              "thread stacks"
            ],
            "Container (OS)": [
              "hard limit: 10 GB"
            ]
          },
          "badge": {},
          "v": {
            "acc": 0,
            "hidden": 0,
            "limit": 10
          }
        },
        {
          "title": "Tasks grow",
          "text": "Tasks ask for more memory. Spark accounting gives it out until its 8 GB are used.",
          "m": [
            "Spark accounting",
            "Spark accounting",
            "grants up to 8 GB"
          ],
          "set": {
            "Spark accounting": [
              "used: 8 of 8 GB"
            ]
          },
          "badge": {},
          "v": {
            "acc": 5,
            "hidden": 0,
            "limit": 10
          }
        },
        {
          "title": "Spark says no first",
          "text": "The next request is refused. Spillable data is written to disk, and the work goes on safely.",
          "m": [
            "Spark accounting",
            "Spark accounting",
            "refuse, spill to disk"
          ],
          "set": {
            "Spark accounting": [
              "!refused, spilled",
              "used: 8 of 8 GB"
            ]
          },
          "badge": {},
          "v": {
            "acc": 8,
            "hidden": 0,
            "limit": 10,
            "refused": true
          }
        },
        {
          "title": "Hidden memory keeps growing",
          "text": "Meanwhile network buffers and native code grow outside the books. Spark cannot refuse them because it does not know about them.",
          "m": null,
          "set": {
            "Memory Spark cannot see": [
              "network buffers: 1 GB",
              "native code: 1.5 GB",
              "thread stacks: 0.5 GB"
            ]
          },
          "badge": {},
          "v": {
            "acc": 8,
            "hidden": 1.5,
            "limit": 10
          }
        },
        {
          "title": "The container crosses its limit",
          "text": "8 GB plus 3 GB is 11 GB. This is more than the 10 GB limit.",
          "m": null,
          "set": {
            "Container (OS)": [
              "!used: 11 GB of 10 GB"
            ]
          },
          "badge": {},
          "v": {
            "acc": 8,
            "hidden": 3,
            "limit": 10
          }
        },
        {
          "title": "The OS kills the container",
          "text": "The operating system stops the container at once. There is no tidy error message from Spark. The driver just sees that a worker has vanished.",
          "m": [
            "Container (OS)",
            "Spark accounting",
            "killed"
          ],
          "set": {
            "Container (OS)": [
              "!killed"
            ]
          },
          "badge": {},
          "v": {
            "acc": 8,
            "hidden": 3,
            "limit": 10,
            "killed": true
          }
        },
        {
          "title": "The fix",
          "text": "Leave overhead room: ask the cluster for more memory than Spark itself uses. It is room for the memory Spark cannot count.",
          "m": null,
          "set": {
            "Spark accounting": [
              "limit: 8 GB"
            ],
            "Container (OS)": [
              "+limit: 12 GB"
            ]
          },
          "badge": {},
          "v": {
            "acc": 8,
            "hidden": 3,
            "limit": 13,
            "fixed": true
          }
        }
      ],
      "kind": "bullet"
    }
  },
  {
    "title": "Cache and execution share one pool",
    "blurb": "",
    "intro": "Cached data and running work draw from the same unified pool. Each can borrow the other free space, but cache can only be evicted down to a protected share.",
    "trigger": "A job caches a table, and then runs a large sort that needs memory from the same pool.",
    "run": "spark-submit --conf spark.memory.storageFraction=0.5 app.py  # 0.5 is the default",
    "expect": "Execution can take back cached space above the protected share, and it spills when it still lacks memory. Cache never takes memory from running work.",
    "edges": [
      {
        "t": "A cached table is needed again",
        "short": "It may have been evicted.",
        "ctx": "Execution can take cache above the protected share. Reading that table later recomputes the evicted blocks.",
        "fix": "Cache only what you reuse, or raise the storage fraction if the cache must survive large sorts."
      },
      {
        "t": "Storage fraction set too high",
        "short": "Execution starves and spills.",
        "ctx": "If storage can hold most of the pool, execution has little room and spills heavily.",
        "fix": "Keep spark.memory.storageFraction at the default unless the cache is more important than the sorts."
      }
    ],
    "invariant": "",
    "kind": "pool",
    "steps": [
      {
        "t": "One pool, two users",
        "x": "Storage for cached data and execution for sorts, joins and aggregations share one unified pool of 10 units. Nothing is cached and nothing is running yet.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Caching fills storage",
        "x": "The table is cached and fills 6 units. Cache may use free space, so it grows past its protected half of 5 units.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "A sort asks for memory",
        "x": "A sort starts and asks for 6 units. The free space holds 4 units, so the sort takes those and still needs 2 more.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Execution takes back cache above the share",
        "x": "Execution may evict cached blocks, but only the part above the protected 5 units. It takes 1 unit back, so the sort still lacks 1 and spills that part to disk.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Cache cannot take back execution",
        "x": "A new cache request for 3 units arrives. Storage cannot evict the running sort, so the new block is not cached, and the job does not fail.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "The sort ends and memory is free again",
        "x": "The sort finishes and releases its 5 units. The cache can grow back into the free space when the next block is stored.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "pool",
      "steps": [
        {
          "title": "One pool, two users",
          "text": "Storage for cached data and execution for sorts, joins and aggregations share one unified pool of 10 units. Nothing is cached and nothing is running yet.",
          "v": {
            "storage": 0,
            "exec": 0,
            "pool": 10
          }
        },
        {
          "title": "Caching fills storage",
          "text": "The table is cached and fills 6 units. Cache may use free space, so it grows past its protected half of 5 units.",
          "v": {
            "storage": 6,
            "exec": 0,
            "pool": 10
          }
        },
        {
          "title": "A sort asks for memory",
          "text": "A sort starts and asks for 6 units. The free space holds 4 units, so the sort takes those and still needs 2 more.",
          "v": {
            "storage": 6,
            "exec": 4,
            "pool": 10,
            "asked": 2
          }
        },
        {
          "title": "Execution takes back cache above the share",
          "text": "Execution may evict cached blocks, but only the part above the protected 5 units. It takes 1 unit back, so the sort still lacks 1 and spills that part to disk.",
          "v": {
            "storage": 5,
            "exec": 5,
            "pool": 10,
            "spill": 1
          }
        },
        {
          "title": "Cache cannot take back execution",
          "text": "A new cache request for 3 units arrives. Storage cannot evict the running sort, so the new block is not cached, and the job does not fail.",
          "v": {
            "storage": 5,
            "exec": 5,
            "pool": 10,
            "refused": 3
          }
        },
        {
          "title": "The sort ends and memory is free again",
          "text": "The sort finishes and releases its 5 units. The cache can grow back into the free space when the next block is stored.",
          "v": {
            "storage": 5,
            "exec": 0,
            "pool": 10
          }
        }
      ]
    }
  },
  {
    "title": "Each running task gets a share of execution memory",
    "blurb": "",
    "intro": "The execution pool is split among the tasks that are running. A task may use at most its share, so adding cores lowers the share each task gets.",
    "trigger": "An executor runs several tasks at once, and each task builds a large hash table in execution memory.",
    "run": "spark-submit --executor-cores 4 --executor-memory 8g app.py  # the pool is shared by the running tasks",
    "expect": "Each running task may use at most its fair share of the execution pool. More cores means smaller shares and more spilling.",
    "edges": [
      {
        "t": "A few tasks are much bigger than the rest",
        "short": "The share is fair, not needed.",
        "ctx": "A task with a large key can need more than its share, while small tasks leave their share unused. Only the big task spills.",
        "fix": "Fix the skew (see the adaptive feature) rather than adding cores, which shrinks everyone share."
      },
      {
        "t": "More cores, same memory",
        "short": "Parallelism costs memory.",
        "ctx": "Doubling cores on the same executor halves each task share. Operations that used to fit now spill.",
        "fix": "Match cores to memory per task, for example by raising executor memory when you raise cores."
      }
    ],
    "invariant": "",
    "kind": "shares",
    "steps": [
      {
        "t": "One task alone",
        "x": "With a single running task it may use the whole execution pool of 6 units.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Four tasks start",
        "x": "Four tasks run at once. Each may use at most a quarter of the pool, which is 1.5 units, and must have at least an eighth, 0.75 units, before it waits or spills.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "A task asks for more than its share",
        "x": "Task 3 needs 2 units, but its cap is 1.5. It keeps the 1.5 units and spills the remaining 0.5 units to disk.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Other tasks finish: the shares grow",
        "x": "Two tasks finish, so only two are running. Each running task may now use up to half the pool, which is 3 units.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Doubling the cores halves the share",
        "x": "With 8 cores, 8 tasks run at once. Each share shrinks to at most 0.75 units, so the same pool now serves many smaller tasks.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "More memory gives each task more room",
        "x": "With 12 units in the pool and 8 tasks, each may use up to 1.5 units. The same 8 tasks spill nothing, because the extra memory is what they lacked.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "shares",
      "steps": [
        {
          "title": "One task alone",
          "text": "With a single running task it may use the whole execution pool of 6 units.",
          "v": {
            "pool": 6,
            "n": 1,
            "tasks": [
              {
                "id": "T1",
                "use": 6,
                "spill": 0
              }
            ]
          }
        },
        {
          "title": "Four tasks start",
          "text": "Four tasks run at once. Each may use at most a quarter of the pool, which is 1.5 units, and must have at least an eighth, 0.75 units, before it waits or spills.",
          "v": {
            "pool": 6,
            "n": 4,
            "tasks": [
              {
                "id": "T1",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T2",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T3",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T4",
                "use": 1.5,
                "spill": 0
              }
            ]
          }
        },
        {
          "title": "A task asks for more than its share",
          "text": "Task 3 needs 2 units, but its cap is 1.5. It keeps the 1.5 units and spills the remaining 0.5 units to disk.",
          "v": {
            "pool": 6,
            "n": 4,
            "tasks": [
              {
                "id": "T1",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T2",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T3",
                "use": 1.5,
                "spill": 0.5,
                "need": 2
              },
              {
                "id": "T4",
                "use": 1.5,
                "spill": 0
              }
            ]
          }
        },
        {
          "title": "Other tasks finish: the shares grow",
          "text": "Two tasks finish, so only two are running. Each running task may now use up to half the pool, which is 3 units.",
          "v": {
            "pool": 6,
            "n": 2,
            "tasks": [
              {
                "id": "T3",
                "use": 3,
                "spill": 0
              },
              {
                "id": "T4",
                "use": 3,
                "spill": 0
              }
            ]
          }
        },
        {
          "title": "Doubling the cores halves the share",
          "text": "With 8 cores, 8 tasks run at once. Each share shrinks to at most 0.75 units, so the same pool now serves many smaller tasks.",
          "v": {
            "pool": 6,
            "n": 8,
            "tasks": [
              {
                "id": "T1",
                "use": 0.75,
                "spill": 0
              },
              {
                "id": "T2",
                "use": 0.75,
                "spill": 0
              },
              {
                "id": "T3",
                "use": 0.75,
                "spill": 0
              },
              {
                "id": "T4",
                "use": 0.75,
                "spill": 0
              },
              {
                "id": "T5",
                "use": 0.75,
                "spill": 0
              },
              {
                "id": "T6",
                "use": 0.75,
                "spill": 0
              },
              {
                "id": "T7",
                "use": 0.75,
                "spill": 0
              },
              {
                "id": "T8",
                "use": 0.75,
                "spill": 0
              }
            ]
          }
        },
        {
          "title": "More memory gives each task more room",
          "text": "With 12 units in the pool and 8 tasks, each may use up to 1.5 units. The same 8 tasks spill nothing, because the extra memory is what they lacked.",
          "v": {
            "pool": 12,
            "n": 8,
            "tasks": [
              {
                "id": "T1",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T2",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T3",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T4",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T5",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T6",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T7",
                "use": 1.5,
                "spill": 0
              },
              {
                "id": "T8",
                "use": 1.5,
                "spill": 0
              }
            ]
          }
        }
      ]
    }
  },
  {
    "title": "Off-heap memory and the garbage collector",
    "blurb": "",
    "intro": "Data kept on the Java heap is scanned by the garbage collector. Off-heap storage and execution memory stay outside the heap, so the collector has less to scan and pauses are shorter.",
    "trigger": "A job keeps millions of cached objects on the Java heap, and the garbage collector pauses the executor again and again.",
    "run": "spark-submit --conf spark.memory.offHeap.enabled=true --conf spark.memory.offHeap.size=4g app.py  # off-heap is off by default",
    "expect": "Data kept off the heap is invisible to the garbage collector, so pauses are shorter. The total memory budget does not change.",
    "edges": [
      {
        "t": "Off-heap runs out",
        "short": "Spill, or a container kill.",
        "ctx": "Off-heap memory counts toward the container limit. Filling it can get the container killed if the overhead room is too small.",
        "fix": "Size spark.memory.offHeap.size together with the executor memory overhead."
      },
      {
        "t": "Objects are created outside Spark",
        "short": "The collector still scans them.",
        "ctx": "Data built in user code on the heap is not moved off heap, so the pauses remain.",
        "fix": "Keep large data in DataFrames or the cache, where Spark manages its memory."
      }
    ],
    "invariant": "",
    "kind": "heap",
    "steps": [
      {
        "t": "Objects on the heap",
        "x": "Each cached row is a Java object on the heap. The garbage collector must scan those objects every time it runs.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "A full collection pauses everything",
        "x": "When the heap fills, a full collection stops all tasks in the executor. The executor is silent for several seconds at a time.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Move storage off heap",
        "x": "With spark.memory.offHeap.enabled=true, the cache keeps its bytes outside the heap, in memory the collector never scans.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Execution uses off-heap too",
        "x": "Sorts and hash tables can also use the off-heap pool. The heap now holds only small objects and pointers.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Pauses shrink",
        "x": "The heap is small, so collections are quick and frequent but short. The executor keeps working between them.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Off-heap is not free",
        "x": "The off-heap pool is a separate budget. When it runs out, the work spills as it would on heap, and the container limit still counts the off-heap bytes.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "heap",
      "steps": [
        {
          "title": "Objects on the heap",
          "text": "Each cached row is a Java object on the heap. The garbage collector must scan those objects every time it runs.",
          "v": {
            "heap": 8,
            "off": 0,
            "heapMax": 8,
            "offMax": 6,
            "pause": 0
          }
        },
        {
          "title": "A full collection pauses everything",
          "text": "When the heap fills, a full collection stops all tasks in the executor. The executor is silent for several seconds at a time.",
          "v": {
            "heap": 8,
            "off": 0,
            "heapMax": 8,
            "offMax": 6,
            "pause": 8
          }
        },
        {
          "title": "Move storage off heap",
          "text": "With spark.memory.offHeap.enabled=true, the cache keeps its bytes outside the heap, in memory the collector never scans.",
          "v": {
            "heap": 3,
            "off": 5,
            "heapMax": 8,
            "offMax": 6,
            "pause": 1
          }
        },
        {
          "title": "Execution uses off-heap too",
          "text": "Sorts and hash tables can also use the off-heap pool. The heap now holds only small objects and pointers.",
          "v": {
            "heap": 2,
            "off": 6,
            "heapMax": 8,
            "offMax": 6,
            "pause": 1
          }
        },
        {
          "title": "Pauses shrink",
          "text": "The heap is small, so collections are quick and frequent but short. The executor keeps working between them.",
          "v": {
            "heap": 2,
            "off": 6,
            "heapMax": 8,
            "offMax": 6,
            "pause": 0.4
          }
        },
        {
          "title": "Off-heap is not free",
          "text": "The off-heap pool is a separate budget. When it runs out, the work spills as it would on heap, and the container limit still counts the off-heap bytes.",
          "v": {
            "heap": 2,
            "off": 6,
            "heapMax": 8,
            "offMax": 6,
            "pause": 0.4,
            "full": true
          }
        }
      ]
    }
  }
];
CourseData.uc["recovery"] = [
  {
    "title": "Executor lost mid-reduce",
    "blurb": "",
    "intro": "The reducer reports a fetch failure. The producers rerun.",
    "trigger": "During the reduce stage, a worker that holds map output dies.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "A shuffle service keeps the files",
        "short": "Sometimes nothing needs redoing.",
        "ctx": "A separate shuffle service stores the files outside the worker. If only the worker died, the files are still there.",
        "fix": "The driver still knows where the files are, and reducers fetch them as normal."
      },
      {
        "t": "The rerun gives a different answer",
        "short": "Randomness breaks recovery.",
        "ctx": "If a map step uses random numbers or the clock, the rerun output is not the same as the lost one, and reducers may mix old and new data.",
        "fix": "Keep steps deterministic, or fix the random seed."
      }
    ],
    "invariant": "Surviving outputs are reused, not recomputed.",
    "kind": "heatmap",
    "steps": [
      {
        "t": "Everything is running",
        "x": "Reducers are fetching map output. Worker X holds the output of maps 1 and 2. Worker Y holds map 3.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "A worker dies",
        "x": "Worker X crashes and its files are gone.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "A fetch fails",
        "x": "A reducer asks X for map 1 and gets no answer. It cannot go on without that data, so it tells the driver which output it could not get.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Forget everything on X",
        "x": "The driver does not trust anything on X any more. It strikes both outputs off its list, not only the one that failed.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Redo only what is missing",
        "x": "Maps 1 and 2 run again on the surviving workers. Map 3 is not touched, because its output is still safe on Y.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Update the addresses",
        "x": "The new outputs are registered with the driver.",
        "s": {
          "k": 5
        }
      },
      {
        "t": "The reducers try again",
        "x": "The reducers ask the driver for the new addresses, fetch the data and carry on.",
        "s": {
          "k": 6
        }
      }
    ],
    "scene": {
      "actors": [
        "Reducer",
        "Driver",
        "Dead worker",
        "Other workers"
      ],
      "steps": [
        {
          "title": "Everything is running",
          "text": "Reducers are fetching map output. Worker X holds the output of maps 1 and 2. Worker Y holds map 3.",
          "m": null,
          "set": {
            "Driver": [
              "map 1, 2 on X",
              "map 3 on Y"
            ],
            "Dead worker": [
              "output of map 1, 2"
            ],
            "Other workers": [
              "output of map 3"
            ]
          },
          "badge": {},
          "v": {
            "cells": {
              "m1X": "ok",
              "m2X": "ok",
              "m3Y": "ok"
            }
          }
        },
        {
          "title": "A worker dies",
          "text": "Worker X crashes and its files are gone.",
          "m": null,
          "set": {
            "Dead worker": [
              "!crashed"
            ]
          },
          "badge": {},
          "v": {
            "cells": {
              "m1X": "lost",
              "m2X": "lost",
              "m3Y": "ok"
            },
            "dead": true
          }
        },
        {
          "title": "A fetch fails",
          "text": "A reducer asks X for map 1 and gets no answer. It cannot go on without that data, so it tells the driver which output it could not get.",
          "m": [
            "Reducer",
            "Driver",
            "cannot fetch map 1 from X"
          ],
          "set": {
            "Reducer": [
              "!stuck: needs map 1"
            ]
          },
          "badge": {},
          "v": {
            "cells": {
              "m1X": "fail",
              "m2X": "lost",
              "m3Y": "ok"
            },
            "dead": true
          }
        },
        {
          "title": "Forget everything on X",
          "text": "The driver does not trust anything on X any more. It strikes both outputs off its list, not only the one that failed.",
          "m": [
            "Driver",
            "Driver",
            "forget X"
          ],
          "set": {
            "Driver": [
              "!map 1 lost",
              "!map 2 lost",
              "map 3 on Y"
            ]
          },
          "badge": {},
          "v": {
            "cells": {
              "m1X": "struck",
              "m2X": "struck",
              "m3Y": "ok"
            },
            "dead": true
          }
        },
        {
          "title": "Redo only what is missing",
          "text": "Maps 1 and 2 run again on the surviving workers. Map 3 is not touched, because its output is still safe on Y.",
          "m": [
            "Driver",
            "Other workers",
            "rerun map 1 and 2"
          ],
          "set": {
            "Other workers": [
              "output of map 3",
              "+rerun map 1",
              "+rerun map 2"
            ]
          },
          "badge": {},
          "v": {
            "cells": {
              "m1X": "struck",
              "m2X": "struck",
              "m3Y": "ok",
              "m1Z": "rerun",
              "m2Z": "rerun"
            },
            "dead": true
          }
        },
        {
          "title": "Update the addresses",
          "text": "The new outputs are registered with the driver.",
          "m": [
            "Other workers",
            "Driver",
            "new outputs ready"
          ],
          "set": {
            "Driver": [
              "+map 1 on Y",
              "+map 2 on Z",
              "map 3 on Y"
            ]
          },
          "badge": {},
          "v": {
            "cells": {
              "m1X": "struck",
              "m2X": "struck",
              "m3Y": "ok",
              "m1Z": "ok",
              "m2Z": "ok"
            },
            "dead": true
          }
        },
        {
          "title": "The reducers try again",
          "text": "The reducers ask the driver for the new addresses, fetch the data and carry on.",
          "m": [
            "Reducer",
            "Driver",
            "where are they now?"
          ],
          "set": {
            "Reducer": [
              "+fetching from Y and Z"
            ]
          },
          "badge": {},
          "v": {
            "cells": {
              "m1X": "struck",
              "m2X": "struck",
              "m3Y": "ok",
              "m1Z": "ok",
              "m2Z": "ok"
            },
            "dead": true,
            "reducers": true
          }
        }
      ],
      "kind": "heatmap"
    }
  },
  {
    "title": "Speculate a straggler",
    "blurb": "",
    "intro": "Two attempts, one winner. The loser must not publish.",
    "trigger": "Most tasks have finished, but one is far slower than the rest and everyone is waiting for it.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "The loser may already have written something",
        "short": "Extra copies can leave side effects.",
        "ctx": "If a task also calls an outside service or writes to a database, the killed copy may have already done it.",
        "fix": "Keep task code free of side effects, or write through the commit step so only one copy&#39;s output becomes visible."
      },
      {
        "t": "The slowness is the data, not the machine",
        "short": "A second copy is just as slow.",
        "ctx": "If one partition is simply huge, a copy on a fast worker still needs just as long.",
        "fix": "Fix the skew by splitting the big partition. Speculation helps only when the machine is the problem."
      }
    ],
    "invariant": "Only one attempt per partition becomes visible.",
    "kind": "strip",
    "steps": [
      {
        "t": "One task lags",
        "x": "Nine of ten tasks finished in about 10 seconds. Task 7 has been running for 40 seconds.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Compare with the middle",
        "x": "After most tasks finish, the driver compares the slow one with the median time. Task 7 is far above it.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Start a second copy",
        "x": "The driver starts a second copy of task 7 on a different, free worker. Perhaps the first one sits on a sick machine.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Both run",
        "x": "Now two copies of the same work are racing.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "One wins",
        "x": "The backup finishes first, in 12 seconds, and reports its result.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Stop the other",
        "x": "The driver kills the slow copy and throws away anything it wrote. Only one result per task counts.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "actors": [
        "Driver",
        "Slow task (copy 1)",
        "Backup task (copy 2)"
      ],
      "steps": [
        {
          "title": "One task lags",
          "text": "Nine of ten tasks finished in about 10 seconds. Task 7 has been running for 40 seconds.",
          "m": null,
          "set": {
            "Driver": [
              "9 of 10 tasks done"
            ]
          },
          "badge": {
            "Slow task (copy 1)": "RUNNING 40 s"
          },
          "v": {
            "c1": 40,
            "c2": null,
            "med": false
          }
        },
        {
          "title": "Compare with the middle",
          "text": "After most tasks finish, the driver compares the slow one with the median time. Task 7 is far above it.",
          "m": [
            "Driver",
            "Driver",
            "compare with median 10 s"
          ],
          "set": {
            "Driver": [
              "9 of 10 done",
              "!task 7 is a straggler"
            ]
          },
          "badge": {},
          "v": {
            "c1": 40,
            "c2": null,
            "med": true
          }
        },
        {
          "title": "Start a second copy",
          "text": "The driver starts a second copy of task 7 on a different, free worker. Perhaps the first one sits on a sick machine.",
          "m": [
            "Driver",
            "Backup task (copy 2)",
            "run task 7 again"
          ],
          "set": {},
          "badge": {
            "Backup task (copy 2)": "RUNNING"
          },
          "v": {
            "c1": 40,
            "c2": 0,
            "med": true
          }
        },
        {
          "title": "Both run",
          "text": "Now two copies of the same work are racing.",
          "m": null,
          "set": {},
          "badge": {
            "Slow task (copy 1)": "RUNNING",
            "Backup task (copy 2)": "RUNNING"
          },
          "v": {
            "c1": 46,
            "c2": 6,
            "med": true
          }
        },
        {
          "title": "One wins",
          "text": "The backup finishes first, in 12 seconds, and reports its result.",
          "m": [
            "Backup task (copy 2)",
            "Driver",
            "done"
          ],
          "set": {
            "Driver": [
              "10 of 10 done",
              "+task 7 from copy 2"
            ]
          },
          "badge": {
            "Backup task (copy 2)": "WON"
          },
          "v": {
            "c1": 52,
            "c2": 12,
            "med": true,
            "won": true
          }
        },
        {
          "title": "Stop the other",
          "text": "The driver kills the slow copy and throws away anything it wrote. Only one result per task counts.",
          "m": [
            "Driver",
            "Slow task (copy 1)",
            "kill"
          ],
          "set": {},
          "badge": {
            "Slow task (copy 1)": "KILLED"
          },
          "v": {
            "c1": 52,
            "c2": 12,
            "med": true,
            "won": true,
            "killed": true
          }
        }
      ],
      "kind": "strip"
    }
  },
  {
    "title": "Retry a fetch before reporting a failure",
    "blurb": "",
    "intro": "A dropped connection does not always mean the executor is gone. The reducer retries the same fetch a few times, with a wait, before it reports the output as lost.",
    "trigger": "A reducer fetches a block from another executor, and the connection drops once while the executor is still alive.",
    "run": "spark-submit --conf spark.shuffle.io.maxRetries=3 --conf spark.shuffle.io.retryWait=5s app.py  # both are the defaults",
    "expect": "A short network drop is retried inside the fetch, so no map task reruns. Only a fetch that fails every retry is reported as lost output.",
    "edges": [
      {
        "t": "The executor really is dead",
        "short": "Retries only delay the report.",
        "ctx": "Every retry fails the same way, so the reducer waits through all the retry waits before the driver hears about it.",
        "fix": "The fetch failure then triggers the rerun of that map output, as in UC-02 of this feature."
      },
      {
        "t": "Retries hide a slow network",
        "short": "The job is slower, not wrong.",
        "ctx": "Each retry adds the retry wait. Many fetches retrying at once can make a shuffle look stuck.",
        "fix": "Check the network first; raise retryWait only if drops are short and frequent."
      }
    ],
    "invariant": "",
    "kind": "backoff",
    "steps": [
      {
        "t": "The fetch starts",
        "x": "The reducer opens a connection to executor B and asks for range 3 of map 1.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "The connection drops",
        "x": "The connection breaks in the middle of the transfer. The reducer does not report anything to the driver yet.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Wait, then retry",
        "x": "The reducer waits spark.shuffle.io.retryWait, 5 seconds by default, and asks for the same range again.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "The retry fails too",
        "x": "The second attempt also fails, because executor B is briefly unreachable. One retry is still left.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "The third attempt succeeds",
        "x": "The network recovers. The last retry gets the range. The driver never hears about a failure, and no map task reruns.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "When the retries run out",
        "x": "If every retry fails, the reducer reports a fetch failure to the driver. Only then is the map output rerun.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "backoff",
      "steps": [
        {
          "title": "The fetch starts",
          "text": "The reducer opens a connection to executor B and asks for range 3 of map 1.",
          "v": {
            "att": [
              "run"
            ]
          }
        },
        {
          "title": "The connection drops",
          "text": "The connection breaks in the middle of the transfer. The reducer does not report anything to the driver yet.",
          "v": {
            "att": [
              "fail"
            ]
          }
        },
        {
          "title": "Wait, then retry",
          "text": "The reducer waits spark.shuffle.io.retryWait, 5 seconds by default, and asks for the same range again.",
          "v": {
            "att": [
              "fail"
            ],
            "waiting": true
          }
        },
        {
          "title": "The retry fails too",
          "text": "The second attempt also fails, because executor B is briefly unreachable. One retry is still left.",
          "v": {
            "att": [
              "fail",
              "fail"
            ]
          }
        },
        {
          "title": "The third attempt succeeds",
          "text": "The network recovers. The last retry gets the range. The driver never hears about a failure, and no map task reruns.",
          "v": {
            "att": [
              "fail",
              "fail",
              "ok"
            ]
          }
        },
        {
          "title": "When the retries run out",
          "text": "If every retry fails, the reducer reports a fetch failure to the driver. Only then is the map output rerun.",
          "v": {
            "att": [
              "fail",
              "fail",
              "fail",
              "fail"
            ],
            "reported": true
          }
        }
      ]
    }
  },
  {
    "title": "Exclude an executor that keeps failing",
    "blurb": "",
    "intro": "When one executor fails the same stage over and over, the scheduler stops giving it tasks for the rest of that stage. The other executors finish the work.",
    "trigger": "One executor keeps failing the tasks it is given, while the other executors run theirs normally.",
    "run": "spark-submit --conf spark.excludeOnFailure.enabled=true app.py  # off by default",
    "expect": "After repeated failures on one executor, the scheduler stops giving it tasks for that stage, so the job finishes on the healthy executors.",
    "edges": [
      {
        "t": "Every executor is flaky",
        "short": "Excluding them all stalls the stage.",
        "ctx": "If too many executors reach the limit, the stage has nowhere left to run its tasks.",
        "fix": "Fix the shared cause, such as a bad network or a bad input. Exclusion is for one bad machine, not a whole cluster."
      },
      {
        "t": "A genuinely bad task",
        "short": "The failures follow the task, not the executor.",
        "ctx": "The same task fails on every executor, so excluding machines does not help.",
        "fix": "Treat it as an application error and fix the input or code. The retry limit then aborts the job."
      }
    ],
    "invariant": "",
    "kind": "exclude",
    "steps": [
      {
        "t": "Four executors, one flaky",
        "x": "Executor E3 has a bad disk. Tasks given to it fail, while E1, E2 and E4 run their tasks normally.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Task A fails on E3",
        "x": "Task A fails on E3, and the scheduler retries it on another executor. E3 has one failure on record for this stage.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Two failures on E3",
        "x": "Task B also fails on E3. Two failures on the same executor reach the limit for this stage.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "E3 is excluded for the stage",
        "x": "The scheduler excludes E3 from this stage, so it gets no more tasks until the stage ends. The other executors take its work.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "The stage finishes on healthy executors",
        "x": "The remaining tasks run on E1, E2 and E4. The stage completes without the bad disk being used again.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Exclusion lasts for one stage only",
        "x": "The next stage starts with E3 available again. If the disk is still bad, it will fail again and be excluded again.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "exclude",
      "steps": [
        {
          "title": "Four executors, one flaky",
          "text": "Executor E3 has a bad disk. Tasks given to it fail, while E1, E2 and E4 run their tasks normally.",
          "v": {
            "stage": "stage 1",
            "nodes": {
              "E1": {
                "f": 0,
                "done": 0
              },
              "E2": {
                "f": 0,
                "done": 0
              },
              "E3": {
                "f": 0,
                "done": 0
              },
              "E4": {
                "f": 0,
                "done": 0
              }
            },
            "note": "E3 has a bad disk: tasks given to it fail"
          }
        },
        {
          "title": "Task A fails on E3",
          "text": "Task A fails on E3, and the scheduler retries it on another executor. E3 has one failure on record for this stage.",
          "v": {
            "stage": "stage 1",
            "nodes": {
              "E1": {
                "f": 0,
                "done": 1
              },
              "E2": {
                "f": 0,
                "done": 0
              },
              "E3": {
                "f": 1,
                "done": 0
              },
              "E4": {
                "f": 0,
                "done": 0
              }
            },
            "note": "task A failed on E3 and was retried on E1"
          }
        },
        {
          "title": "Two failures on E3",
          "text": "Task B also fails on E3. Two failures on the same executor reach the limit for this stage.",
          "v": {
            "stage": "stage 1",
            "nodes": {
              "E1": {
                "f": 0,
                "done": 1
              },
              "E2": {
                "f": 0,
                "done": 1
              },
              "E3": {
                "f": 2,
                "done": 0
              },
              "E4": {
                "f": 0,
                "done": 0
              }
            },
            "note": "two failures on E3 reach the limit for this stage"
          }
        },
        {
          "title": "E3 is excluded for the stage",
          "text": "The scheduler excludes E3 from this stage, so it gets no more tasks until the stage ends. The other executors take its work.",
          "v": {
            "stage": "stage 1",
            "nodes": {
              "E1": {
                "f": 0,
                "done": 2
              },
              "E2": {
                "f": 0,
                "done": 1
              },
              "E3": {
                "f": 2,
                "done": 0,
                "ex": true
              },
              "E4": {
                "f": 0,
                "done": 1
              }
            },
            "note": "E3 is excluded: it gets no more tasks in this stage"
          }
        },
        {
          "title": "The stage finishes on healthy executors",
          "text": "The remaining tasks run on E1, E2 and E4. The stage completes without the bad disk being used again.",
          "v": {
            "stage": "stage 1",
            "nodes": {
              "E1": {
                "f": 0,
                "done": 3
              },
              "E2": {
                "f": 0,
                "done": 2
              },
              "E3": {
                "f": 2,
                "done": 0,
                "ex": true
              },
              "E4": {
                "f": 0,
                "done": 2
              }
            },
            "note": "the remaining tasks finish on E1, E2 and E4"
          }
        },
        {
          "title": "Exclusion lasts for one stage only",
          "text": "The next stage starts with E3 available again. If the disk is still bad, it will fail again and be excluded again.",
          "v": {
            "stage": "stage 2",
            "nodes": {
              "E1": {
                "f": 0,
                "done": 0
              },
              "E2": {
                "f": 0,
                "done": 0
              },
              "E3": {
                "f": 0,
                "done": 0
              },
              "E4": {
                "f": 0,
                "done": 0
              }
            },
            "note": "a new stage starts with E3 available again"
          }
        }
      ]
    }
  },
  {
    "title": "An external shuffle service outlives the executor",
    "blurb": "",
    "intro": "With an external shuffle service on each node, map output files are served by that service rather than by the executor. Losing the executor no longer loses the output.",
    "trigger": "An executor is lost after it wrote map output, and the cluster runs an external shuffle service on every node.",
    "run": "spark-submit --conf spark.shuffle.service.enabled=true app.py  # needs the service running on each node",
    "expect": "Map output is served by the shuffle service, so losing the executor does not force its map tasks to run again.",
    "edges": [
      {
        "t": "The service is not running on that node",
        "short": "It is the same as no service.",
        "ctx": "Without the service process on the node, the files die with the executor, and recovery falls back to rerunning map tasks.",
        "fix": "Start the service on every worker node before the job starts."
      },
      {
        "t": "Cached data on the executor",
        "short": "The service serves shuffle files only.",
        "ctx": "Cached blocks live in executor memory, so losing the executor still loses them.",
        "fix": "Recompute them from lineage, or persist them to disk or a reliable store."
      }
    ],
    "invariant": "",
    "kind": "service",
    "steps": [
      {
        "t": "Map output lives with the executor",
        "x": "Without a service, the executor serves its own map output files to the reducers.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "The executor dies",
        "x": "Executor E2 is lost. Without a service, its output files become unreachable with it.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "The shuffle service keeps serving",
        "x": "With an external shuffle service on each node, the files are served by that service, a separate process that keeps running after the executor exits.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Reducers keep fetching",
        "x": "Reducers fetch the map output from the service on the same node. No fetch fails, so no map task reruns.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "The service process itself goes down",
        "x": "If the service on that node dies too, the files are unreachable, and the usual fetch-failure recovery applies.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Idle executors can be released",
        "x": "Because the files survive executor removal, dynamic allocation can give back idle executors that hold no cached data.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "service",
      "steps": [
        {
          "title": "Map output lives with the executor",
          "text": "Without a service, the executor serves its own map output files to the reducers.",
          "v": {
            "exec": "alive",
            "svc": null,
            "fetch": "exec"
          }
        },
        {
          "title": "The executor dies",
          "text": "Executor E2 is lost. Without a service, its output files become unreachable with it.",
          "v": {
            "exec": "dead",
            "svc": null,
            "fetch": null
          }
        },
        {
          "title": "The shuffle service keeps serving",
          "text": "With an external shuffle service on each node, the files are served by that service, a separate process that keeps running after the executor exits.",
          "v": {
            "exec": "dead",
            "svc": "up",
            "fetch": null
          }
        },
        {
          "title": "Reducers keep fetching",
          "text": "Reducers fetch the map output from the service on the same node. No fetch fails, so no map task reruns.",
          "v": {
            "exec": "dead",
            "svc": "up",
            "fetch": "svc"
          }
        },
        {
          "title": "The service process itself goes down",
          "text": "If the service on that node dies too, the files are unreachable, and the usual fetch-failure recovery applies.",
          "v": {
            "exec": "dead",
            "svc": "down",
            "fetch": "fail"
          }
        },
        {
          "title": "Idle executors can be released",
          "text": "Because the files survive executor removal, dynamic allocation can give back idle executors that hold no cached data.",
          "v": {
            "exec": "released",
            "svc": "up",
            "fetch": "svc",
            "idle": true
          }
        }
      ]
    }
  }
];
CourseData.uc["commit"] = [
  {
    "title": "Attempt commit protocol",
    "blurb": "",
    "intro": "The task asks before it promotes.",
    "trigger": "A task attempt has finished writing its output and wants to make it final.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "The winner dies before publishing",
        "short": "Part 0 would be missing.",
        "ctx": "Attempt 1 got permission and crashed before moving the file.",
        "fix": "The coordinator notices the attempt failed and allows a new attempt to try again."
      },
      {
        "t": "A denied attempt must clean up",
        "short": "Otherwise leftovers pile up.",
        "ctx": "A refused attempt leaves its temporary files in the output area.",
        "fix": "Every denied or failed attempt deletes its own temporary files."
      }
    ],
    "invariant": "At most one attempt per partition is promoted.",
    "kind": "ledger",
    "steps": [
      {
        "t": "Write privately first",
        "x": "Two copies of the same task are running. Each writes into its own temporary folder, so they never overwrite each other.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Attempt 1 asks permission",
        "x": "Attempt 1 finishes first and asks the commit coordinator: may I publish part 0?",
        "s": {
          "k": 1
        }
      },
      {
        "t": "First one is allowed",
        "x": "The coordinator has not heard about part 0 yet, so it says yes and remembers that attempt 1 won.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Attempt 2 asks too",
        "x": "Attempt 2 finishes a moment later and asks the same question.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Second one is refused",
        "x": "The answer is no, part 0 already has a winner. The refusal has no effect on anything already published.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "The winner publishes",
        "x": "Attempt 1 moves its file into the final folder.",
        "s": {
          "k": 5
        }
      },
      {
        "t": "The loser cleans up",
        "x": "Attempt 2 deletes its temporary folder. Nothing is left behind.",
        "s": {
          "k": 6
        }
      }
    ],
    "scene": {
      "actors": [
        "Attempt 1",
        "Attempt 2 (copy)",
        "Coordinator",
        "Final folder"
      ],
      "steps": [
        {
          "title": "Write privately first",
          "text": "Two copies of the same task are running. Each writes into its own temporary folder, so they never overwrite each other.",
          "m": null,
          "set": {
            "Attempt 1": [
              "temp folder 1: part-0"
            ],
            "Attempt 2 (copy)": [
              "temp folder 2: part-0"
            ],
            "Final folder": [
              "(empty)"
            ]
          },
          "badge": {},
          "v": {
            "t1": [
              "part-0"
            ],
            "t2": [
              "part-0"
            ],
            "ledger": [],
            "final": []
          }
        },
        {
          "title": "Attempt 1 asks permission",
          "text": "Attempt 1 finishes first and asks the commit coordinator: may I publish part 0?",
          "m": [
            "Attempt 1",
            "Coordinator",
            "may I commit part 0?"
          ],
          "set": {},
          "badge": {},
          "v": {
            "t1": [
              "part-0"
            ],
            "t2": [
              "part-0"
            ],
            "ledger": [
              {
                "who": "attempt 1",
                "ans": "pending"
              }
            ],
            "final": []
          }
        },
        {
          "title": "First one is allowed",
          "text": "The coordinator has not heard about part 0 yet, so it says yes and remembers that attempt 1 won.",
          "m": [
            "Coordinator",
            "Attempt 1",
            "yes"
          ],
          "set": {
            "Coordinator": [
              "part 0: attempt 1 wins"
            ]
          },
          "badge": {},
          "v": {
            "t1": [
              "part-0"
            ],
            "t2": [
              "part-0"
            ],
            "ledger": [
              {
                "who": "attempt 1",
                "ans": "yes"
              }
            ],
            "final": []
          }
        },
        {
          "title": "Attempt 2 asks too",
          "text": "Attempt 2 finishes a moment later and asks the same question.",
          "m": [
            "Attempt 2 (copy)",
            "Coordinator",
            "may I commit part 0?"
          ],
          "set": {},
          "badge": {},
          "v": {
            "t1": [
              "part-0"
            ],
            "t2": [
              "part-0"
            ],
            "ledger": [
              {
                "who": "attempt 1",
                "ans": "yes"
              },
              {
                "who": "attempt 2",
                "ans": "pending"
              }
            ],
            "final": []
          }
        },
        {
          "title": "Second one is refused",
          "text": "The answer is no, part 0 already has a winner. The refusal has no effect on anything already published.",
          "m": [
            "Coordinator",
            "Attempt 2 (copy)",
            "no"
          ],
          "set": {
            "Attempt 2 (copy)": [
              "!denied"
            ]
          },
          "badge": {},
          "v": {
            "t1": [
              "part-0"
            ],
            "t2": [
              "part-0"
            ],
            "ledger": [
              {
                "who": "attempt 1",
                "ans": "yes"
              },
              {
                "who": "attempt 2",
                "ans": "no"
              }
            ],
            "final": []
          }
        },
        {
          "title": "The winner publishes",
          "text": "Attempt 1 moves its file into the final folder.",
          "m": [
            "Attempt 1",
            "Final folder",
            "move part-0"
          ],
          "set": {
            "Final folder": [
              "+part-0"
            ],
            "Attempt 1": []
          },
          "badge": {},
          "v": {
            "t1": [],
            "t2": [
              "part-0"
            ],
            "ledger": [
              {
                "who": "attempt 1",
                "ans": "yes"
              },
              {
                "who": "attempt 2",
                "ans": "no"
              }
            ],
            "final": [
              "part-0 (attempt 1)"
            ]
          }
        },
        {
          "title": "The loser cleans up",
          "text": "Attempt 2 deletes its temporary folder. Nothing is left behind.",
          "m": [
            "Attempt 2 (copy)",
            "Attempt 2 (copy)",
            "delete temp folder"
          ],
          "set": {
            "Attempt 2 (copy)": []
          },
          "badge": {},
          "v": {
            "t1": [],
            "t2": [],
            "gone": true,
            "ledger": [
              {
                "who": "attempt 1",
                "ans": "yes"
              },
              {
                "who": "attempt 2",
                "ans": "no"
              }
            ],
            "final": [
              "part-0 (attempt 1)"
            ]
          }
        }
      ],
      "kind": "ledger"
    }
  },
  {
    "title": "Output attempt states",
    "blurb": "",
    "intro": "Visible is not the same as ready.",
    "trigger": "Every partition says it is committed, and the job must now declare the whole output ready.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "No atomic rename on object stores",
        "short": "Files show up one at a time.",
        "ctx": "A cloud object store cannot rename a whole folder in one step, so results appear gradually.",
        "fix": "Use a committer built for the store, and rely on the marker file, not on the folder listing."
      },
      {
        "t": "A reader that only lists files",
        "short": "It can read a partial result.",
        "ctx": "A downstream job lists the folder while the writer is still working.",
        "fix": "Downstream jobs wait for the marker, or read through a table format that publishes atomically."
      }
    ],
    "invariant": "Readiness is a separate fact from file existence.",
    "kind": "filetree",
    "steps": [
      {
        "t": "Parts appear one by one",
        "x": "Each partition publishes its file. On a cloud object store, files appear one at a time, not all at once.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "A reader looks too early",
        "x": "A reader lists the folder now. It sees two files and might think this is the full result. It is not.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Check every partition",
        "x": "The driver waits until all four partitions report committed.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "The marker is written last",
        "x": "The driver then writes one extra tiny file, _SUCCESS. It means: this output is complete.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Readers trust the marker",
        "x": "A correct reader looks for _SUCCESS first, not at the file list.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "If the job fails",
        "x": "If the job failed midway, there is no marker. Readers see that and treat the output as incomplete, even if some files exist.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "actors": [
        "Driver",
        "Output folder",
        "Reader"
      ],
      "steps": [
        {
          "title": "Parts appear one by one",
          "text": "Each partition publishes its file. On a cloud object store, files appear one at a time, not all at once.",
          "m": [
            "Driver",
            "Output folder",
            "parts being published"
          ],
          "set": {
            "Output folder": [
              "part-0",
              "part-1"
            ]
          },
          "badge": {
            "Output folder": "FILLING"
          },
          "v": {
            "parts": 1,
            "marker": false
          }
        },
        {
          "title": "A reader looks too early",
          "text": "A reader lists the folder now. It sees two files and might think this is the full result. It is not.",
          "m": [
            "Reader",
            "Output folder",
            "list files"
          ],
          "set": {
            "Reader": [
              "!sees part-0, part-1 only"
            ]
          },
          "badge": {},
          "v": {
            "parts": 2,
            "marker": false,
            "reader": "a reader sees 2 files and may think the output is complete"
          }
        },
        {
          "title": "Check every partition",
          "text": "The driver waits until all four partitions report committed.",
          "m": [
            "Driver",
            "Output folder",
            "all 4 parts are committed"
          ],
          "set": {
            "Output folder": [
              "part-0",
              "part-1",
              "part-2",
              "part-3"
            ]
          },
          "badge": {},
          "v": {
            "parts": 4,
            "marker": false,
            "check": "driver: 4 of 4 partitions committed"
          }
        },
        {
          "title": "The marker is written last",
          "text": "The driver then writes one extra tiny file, _SUCCESS. It means: this output is complete.",
          "m": [
            "Driver",
            "Output folder",
            "write _SUCCESS"
          ],
          "set": {
            "Output folder": [
              "part-0",
              "part-1",
              "part-2",
              "part-3",
              "+_SUCCESS"
            ]
          },
          "badge": {
            "Output folder": "COMPLETE"
          },
          "v": {
            "parts": 4,
            "marker": true
          }
        },
        {
          "title": "Readers trust the marker",
          "text": "A correct reader looks for _SUCCESS first, not at the file list.",
          "m": [
            "Reader",
            "Output folder",
            "is _SUCCESS there?"
          ],
          "set": {
            "Reader": [
              "+yes, read all 4 parts"
            ]
          },
          "badge": {},
          "v": {
            "parts": 4,
            "marker": true,
            "reader": "a correct reader looks for _SUCCESS first"
          }
        },
        {
          "title": "If the job fails",
          "text": "If the job failed midway, there is no marker. Readers see that and treat the output as incomplete, even if some files exist.",
          "m": null,
          "set": {
            "Output folder": [
              "part-0",
              "part-1",
              "!no _SUCCESS"
            ],
            "Reader": [
              "!output incomplete, skip"
            ]
          },
          "badge": {
            "Output folder": "INCOMPLETE"
          },
          "v": {
            "parts": 2,
            "marker": false,
            "failed": true,
            "reader": "no marker: incomplete, even though 2 files exist"
          }
        }
      ],
      "kind": "filetree"
    }
  },
  {
    "title": "Commit algorithm v1 versus v2",
    "blurb": "",
    "intro": "The Hadoop commit algorithm decides how many times each output file is moved. Version 2 moves fewer files, so the job commit is quicker, but partial output can then become visible.",
    "trigger": "A Hadoop-style job finishes many tasks, and their output must be moved from temporary folders into the output folder.",
    "run": "spark-submit --conf mapreduce.fileoutputcommitter.algorithm.version=2 app.py  # version 1 is the default",
    "expect": "Version 2 moves each file fewer times, so the job commit is faster. The price is that a failed job can leave partial output visible.",
    "edges": [
      {
        "t": "Readers run during the job",
        "short": "Version 2 exposes partial files early.",
        "ctx": "With version 2, readers can see the files of finished tasks before the job is complete.",
        "fix": "Write to a new path and switch readers only after the job commits, or use the _SUCCESS marker as in UC-02."
      },
      {
        "t": "Object store with many files",
        "short": "Renames are copies, so commit time grows.",
        "ctx": "On an object store a rename copies the whole file, so the second rename in version 1 can dominate the job time.",
        "fix": "Use an output committer built for object stores, or fewer, larger output files."
      }
    ],
    "invariant": "",
    "kind": "renames",
    "steps": [
      {
        "t": "Every task writes to its own folder",
        "x": "Four tasks each write one file into a private temporary folder. Nothing is visible in the output folder yet.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Version 1: a task commit moves its file once",
        "x": "With algorithm version 1, a task commit moves its file from its private folder into the job temporary folder. Two tasks are done.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "All tasks moved into the job folder",
        "x": "All four files are now in the job temporary folder. Still nothing is in the output folder.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "The job commit moves everything again",
        "x": "The job commit renames every file into the output folder. That is a second rename per file: eight renames for four files. On an object store each rename copies the data, so this step is slow.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Version 2: tasks commit straight to the output",
        "x": "With version 2, each task commit moves its file directly into the output folder. Two tasks are committed, so two files are already visible.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "A failure midway leaves partial output",
        "x": "The job fails before the other two tasks commit. Version 2 has already published two files, so readers see a partial result. Version 1 would have shown none.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "renames",
      "steps": [
        {
          "title": "Every task writes to its own folder",
          "text": "Four tasks each write one file into a private temporary folder. Nothing is visible in the output folder yet.",
          "v": {
            "alg": 1,
            "files": [
              "temp",
              "temp",
              "temp",
              "temp"
            ],
            "renames": 0
          }
        },
        {
          "title": "Version 1: a task commit moves its file once",
          "text": "With algorithm version 1, a task commit moves its file from its private folder into the job temporary folder. Two tasks are done.",
          "v": {
            "alg": 1,
            "files": [
              "jobtmp",
              "jobtmp",
              "temp",
              "temp"
            ],
            "renames": 2
          }
        },
        {
          "title": "All tasks moved into the job folder",
          "text": "All four files are now in the job temporary folder. Still nothing is in the output folder.",
          "v": {
            "alg": 1,
            "files": [
              "jobtmp",
              "jobtmp",
              "jobtmp",
              "jobtmp"
            ],
            "renames": 4
          }
        },
        {
          "title": "The job commit moves everything again",
          "text": "The job commit renames every file into the output folder. That is a second rename per file: eight renames for four files. On an object store each rename copies the data, so this step is slow.",
          "v": {
            "alg": 1,
            "files": [
              "output",
              "output",
              "output",
              "output"
            ],
            "renames": 8
          }
        },
        {
          "title": "Version 2: tasks commit straight to the output",
          "text": "With version 2, each task commit moves its file directly into the output folder. Two tasks are committed, so two files are already visible.",
          "v": {
            "alg": 2,
            "files": [
              "output",
              "output",
              "temp",
              "temp"
            ],
            "renames": 2
          }
        },
        {
          "title": "A failure midway leaves partial output",
          "text": "The job fails before the other two tasks commit. Version 2 has already published two files, so readers see a partial result. Version 1 would have shown none.",
          "v": {
            "alg": 2,
            "files": [
              "output",
              "output",
              "temp",
              "temp"
            ],
            "renames": 2,
            "failed": true
          }
        }
      ]
    }
  },
  {
    "title": "Overwrite can clear output before the new output is ready",
    "blurb": "",
    "intro": "Overwrite mode replaces a folder. Spark may remove the old output before the new output is complete, so a failed job can leave the folder empty.",
    "trigger": "A job writes its result into a folder that already holds the previous run, using overwrite mode.",
    "run": "df.write.mode(\"overwrite\").partitionBy(\"day\").parquet(\"/data/out\")  # with spark.sql.sources.partitionOverwriteMode=dynamic only the written partitions are replaced",
    "expect": "Full overwrite can remove the old output before the new output is ready. Dynamic partition overwrite replaces only the partitions the job writes, and a failed job leaves the old partitions in place.",
    "edges": [
      {
        "t": "Full overwrite on a large table",
        "short": "A failure can leave nothing.",
        "ctx": "Full overwrite removes the old data first, so a job that fails midway leaves the table with no data at all.",
        "fix": "Write to a new path or table, then switch readers. Or use dynamic partition overwrite for partitioned tables."
      },
      {
        "t": "Dynamic overwrite with no partition column",
        "short": "Dynamic mode has nothing to select by.",
        "ctx": "Without partitionBy, dynamic mode behaves like full overwrite, because the whole table is one partition.",
        "fix": "Partition the table by the column that changes, such as day, or accept full overwrite."
      }
    ],
    "invariant": "",
    "kind": "overwrite",
    "steps": [
      {
        "t": "Yesterday output is in place",
        "x": "The folder holds the output of the previous run: four part files. Readers see them.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "The job writes new files to staging",
        "x": "New files are written to a staging area first. The old output is still there, so readers still get the previous run.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Overwrite clears the old output",
        "x": "In full overwrite mode, Spark removes the old output before the new files are committed. The staged files are not visible yet.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "The job fails before commit",
        "x": "The job fails. The old files are gone and the new ones never became visible. The folder is empty, so readers get nothing.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Dynamic overwrite: only the written partitions",
        "x": "With spark.sql.sources.partitionOverwriteMode=dynamic, only the partitions the job writes are replaced. Here only day=2 is rewritten. Days 1 and 3 are not touched.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Dynamic overwrite fails safely",
        "x": "If the job fails before day=2 commits, the staged files are discarded and the old day=2 files stay in place. Readers still see the previous complete data.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "overwrite",
      "steps": [
        {
          "title": "Yesterday output is in place",
          "text": "The folder holds the output of the previous run: four part files. Readers see them.",
          "v": {
            "items": [
              {
                "n": "part-0",
                "st": "old"
              },
              {
                "n": "part-1",
                "st": "old"
              },
              {
                "n": "part-2",
                "st": "old"
              },
              {
                "n": "part-3",
                "st": "old"
              }
            ]
          }
        },
        {
          "title": "The job writes new files to staging",
          "text": "New files are written to a staging area first. The old output is still there, so readers still get the previous run.",
          "v": {
            "items": [
              {
                "n": "part-0",
                "st": "old"
              },
              {
                "n": "part-1",
                "st": "old"
              },
              {
                "n": "part-2",
                "st": "old"
              },
              {
                "n": "part-3",
                "st": "old"
              },
              {
                "n": "staged 0",
                "st": "staged"
              },
              {
                "n": "staged 1",
                "st": "staged"
              }
            ]
          }
        },
        {
          "title": "Overwrite clears the old output",
          "text": "In full overwrite mode, Spark removes the old output before the new files are committed. The staged files are not visible yet.",
          "v": {
            "items": [
              {
                "n": "part-0",
                "st": "gone"
              },
              {
                "n": "part-1",
                "st": "gone"
              },
              {
                "n": "part-2",
                "st": "gone"
              },
              {
                "n": "part-3",
                "st": "gone"
              },
              {
                "n": "staged 0",
                "st": "staged"
              },
              {
                "n": "staged 1",
                "st": "staged"
              }
            ]
          }
        },
        {
          "title": "The job fails before commit",
          "text": "The job fails. The old files are gone and the new ones never became visible. The folder is empty, so readers get nothing.",
          "v": {
            "items": [],
            "failed": true
          }
        },
        {
          "title": "Dynamic overwrite: only the written partitions",
          "text": "With spark.sql.sources.partitionOverwriteMode=dynamic, only the partitions the job writes are replaced. Here only day=2 is rewritten. Days 1 and 3 are not touched.",
          "v": {
            "items": [
              {
                "n": "day=1",
                "st": "old"
              },
              {
                "n": "day=2",
                "st": "staged"
              },
              {
                "n": "day=3",
                "st": "old"
              }
            ],
            "dynamic": true
          }
        },
        {
          "title": "Dynamic overwrite fails safely",
          "text": "If the job fails before day=2 commits, the staged files are discarded and the old day=2 files stay in place. Readers still see the previous complete data.",
          "v": {
            "items": [
              {
                "n": "day=1",
                "st": "old"
              },
              {
                "n": "day=2",
                "st": "old"
              },
              {
                "n": "day=3",
                "st": "old"
              }
            ],
            "dynamic": true,
            "failed": true
          }
        }
      ]
    }
  }
];
CourseData.uc["sql"] = [
  {
    "title": "From query to tasks",
    "blurb": "",
    "intro": "The same pipeline for SQL and DataFrame code.",
    "trigger": "A user types a query or calls a DataFrame action.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "A custom function in the way",
        "short": "The optimizer cannot see inside it.",
        "ctx": "A user-written function is a black box. Spark cannot push a filter past it or skip columns it might use.",
        "fix": "Use built-in functions where possible, so the optimizer can reason about them."
      },
      {
        "t": "Out-of-date statistics",
        "short": "A slower plan, never a wrong answer.",
        "ctx": "Spark picks a strategy from old information about table sizes and picks a poor one.",
        "fix": "Refresh the statistics. Adaptive execution also corrects some of these choices at run time."
      }
    ],
    "invariant": "Every rewrite preserves query semantics.",
    "kind": "flow",
    "steps": [
      {
        "t": "You write a query",
        "x": "The text says what you want, not how to get it.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Turn text into a plan",
        "x": "The parser makes a tree of steps: scan users, filter, group, count. Names are not checked yet.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Check the names",
        "x": "Spark looks up &quot;users&quot;, &quot;city&quot; and &quot;age&quot; in the catalog and checks their types. A typo fails here, with a clear message.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Make it cheaper",
        "x": "The optimizer rewrites the plan without changing the answer: read only the two columns needed, and apply &quot;age &gt; 30&quot; while reading the file.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Choose real steps",
        "x": "The physical planner picks actual operators. Counting by city needs all rows of a city together, so it adds an exchange (a shuffle) by city.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Tasks are created",
        "x": "The plan is cut into stages and tasks and sent to the workers.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "actors": [
        "You",
        "Parser",
        "Optimizer",
        "Physical planner"
      ],
      "steps": [
        {
          "title": "You write a query",
          "text": "The text says what you want, not how to get it.",
          "m": [
            "You",
            "Parser",
            "SELECT city, count(*) FROM users WHERE age > 30 GROUP BY city"
          ],
          "set": {
            "You": [
              "SELECT city, count(*)",
              "FROM users WHERE age > 30",
              "GROUP BY city"
            ]
          },
          "badge": {},
          "v": {
            "at": 0,
            "cols": 12,
            "rows": 100
          }
        },
        {
          "title": "Turn text into a plan",
          "text": "The parser makes a tree of steps: scan users, filter, group, count. Names are not checked yet.",
          "m": [
            "Parser",
            "Optimizer",
            "unresolved plan"
          ],
          "set": {
            "Parser": [
              "scan users → filter → group → count"
            ]
          },
          "badge": {},
          "v": {
            "at": 1,
            "cols": 12,
            "rows": 100
          }
        },
        {
          "title": "Check the names",
          "text": "Spark looks up \"users\", \"city\" and \"age\" in the catalog and checks their types. A typo fails here, with a clear message.",
          "m": [
            "Optimizer",
            "Optimizer",
            "resolve names and types"
          ],
          "set": {
            "Optimizer": [
              "users.city: string",
              "users.age: int"
            ]
          },
          "badge": {},
          "v": {
            "at": 2,
            "cols": 12,
            "rows": 100,
            "names": true
          }
        },
        {
          "title": "Make it cheaper",
          "text": "The optimizer rewrites the plan without changing the answer: read only the two columns needed, and apply \"age > 30\" while reading the file.",
          "m": [
            "Optimizer",
            "Optimizer",
            "prune columns, push filter down"
          ],
          "set": {
            "Optimizer": [
              "read only city, age",
              "+filter age > 30 inside the scan"
            ]
          },
          "badge": {},
          "v": {
            "at": 3,
            "cols": 2,
            "rows": 40,
            "names": true
          }
        },
        {
          "title": "Choose real steps",
          "text": "The physical planner picks actual operators. Counting by city needs all rows of a city together, so it adds an exchange (a shuffle) by city.",
          "m": [
            "Optimizer",
            "Physical planner",
            "optimized plan"
          ],
          "set": {
            "Physical planner": [
              "scan + filter",
              "partial count",
              "+exchange by city",
              "final count"
            ]
          },
          "badge": {},
          "v": {
            "at": 3,
            "cols": 2,
            "rows": 40,
            "names": true,
            "ex": true
          }
        },
        {
          "title": "Tasks are created",
          "text": "The plan is cut into stages and tasks and sent to the workers.",
          "m": [
            "Physical planner",
            "You",
            "tasks ready"
          ],
          "set": {
            "Physical planner": [
              "stage 1: scan + filter + partial count",
              "stage 2: final count"
            ]
          },
          "badge": {},
          "v": {
            "at": 4,
            "cols": 2,
            "rows": 40,
            "names": true,
            "ex": true,
            "tasks": 3
          }
        }
      ],
      "kind": "flow"
    }
  },
  {
    "title": "Choose a physical operator",
    "blurb": "",
    "intro": "Distribution requirements decide where exchanges go.",
    "trigger": "The planner meets a &quot;count by city&quot; and must choose how to run it.",
    "run": "",
    "expect": "",
    "edges": [
      {
        "t": "An aggregate that cannot be split into parts",
        "short": "Partial counting is impossible.",
        "ctx": "A function like &quot;median&quot; cannot be computed from partial medians.",
        "fix": "Spark shuffles all raw rows by key first, which is slower. Use approximate versions where a small error is fine."
      },
      {
        "t": "The wrong number of shuffle partitions",
        "short": "Too few is slow, too many is wasteful.",
        "ctx": "Few partitions make huge tasks. Thousands make tiny ones where setup costs more than the work.",
        "fix": "Let adaptive execution merge small partitions, or tune the partition count by data size."
      }
    ],
    "invariant": "Partial plus final equals the single-stage answer.",
    "kind": "waterfall",
    "steps": [
      {
        "t": "The question",
        "x": "The plan says: count rows per city. All rows of one city must end up in one place before the count is final.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Look at the child",
        "x": "The planner asks the step below it how its output is split across tasks.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Case 1: already by city",
        "x": "If the data is already split by city, every city is whole inside one task. The planner counts in place, with no exchange.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Case 2: not split by city",
        "x": "More often rows of one city are spread over all tasks. Each task first counts what it has: Hanoi 40, Hue 10 here, Hanoi 25, Hue 5 there.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Send small totals, not rows",
        "x": "Only the small partial totals cross the network, grouped by city.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Finish with a final count",
        "x": "Each reducer adds its parts: Hanoi 65, Hue 15. The answer matches counting everything in one place.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "actors": [
        "Planner",
        "Child plan",
        "Tasks"
      ],
      "steps": [
        {
          "title": "The question",
          "text": "The plan says: count rows per city. All rows of one city must end up in one place before the count is final.",
          "m": null,
          "set": {
            "Planner": [
              "count(*) group by city"
            ]
          },
          "badge": {},
          "v": {
            "mode": "none"
          }
        },
        {
          "title": "Look at the child",
          "text": "The planner asks the step below it how its output is split across tasks.",
          "m": [
            "Planner",
            "Child plan",
            "how are you split?"
          ],
          "set": {},
          "badge": {},
          "v": {
            "mode": "unknown"
          }
        },
        {
          "title": "Case 1: already by city",
          "text": "If the data is already split by city, every city is whole inside one task. The planner counts in place, with no exchange.",
          "m": [
            "Child plan",
            "Planner",
            "split by city"
          ],
          "set": {
            "Tasks": [
              "+task A: all of Hanoi",
              "+task B: all of Hue"
            ]
          },
          "badge": {},
          "v": {
            "mode": "inplace"
          }
        },
        {
          "title": "Case 2: not split by city",
          "text": "More often rows of one city are spread over all tasks. Each task first counts what it has: Hanoi 40, Hue 10 here, Hanoi 25, Hue 5 there.",
          "m": [
            "Child plan",
            "Planner",
            "no particular split"
          ],
          "set": {
            "Tasks": [
              "task A: Hanoi 40, Hue 10",
              "task B: Hanoi 25, Hue 5"
            ]
          },
          "badge": {},
          "v": {
            "mode": "partial"
          }
        },
        {
          "title": "Send small totals, not rows",
          "text": "Only the small partial totals cross the network, grouped by city.",
          "m": [
            "Planner",
            "Tasks",
            "exchange by city"
          ],
          "set": {
            "Tasks": [
              "reducer 1: Hanoi 40 + 25",
              "reducer 2: Hue 10 + 5"
            ]
          },
          "badge": {},
          "v": {
            "mode": "sent"
          }
        },
        {
          "title": "Finish with a final count",
          "text": "Each reducer adds its parts: Hanoi 65, Hue 15. The answer matches counting everything in one place.",
          "m": [
            "Planner",
            "Tasks",
            "final count"
          ],
          "set": {
            "Tasks": [
              "+Hanoi 65",
              "+Hue 15"
            ]
          },
          "badge": {},
          "v": {
            "mode": "final"
          }
        }
      ],
      "kind": "waterfall"
    }
  },
  {
    "title": "Simplify conditions before reading rows",
    "blurb": "",
    "intro": "The optimizer folds constants and removes conditions that cannot change the answer. Fewer comparisons run for every row, and a simple filter can be pushed down to the reader.",
    "trigger": "A filter has conditions that can be computed or removed before any row is read, such as a repeated comparison and a constant expression.",
    "run": "df.filter((F.col(\"x\") > 5) & (F.col(\"x\") > 3) & (F.lit(2) * 3 == 6)).explain(True)  # the optimized plan shows one condition",
    "expect": "The optimized plan keeps one condition, and the rows it returns are exactly the rows the original filter returned.",
    "edges": [
      {
        "t": "A condition that changes with the data",
        "short": "The planner keeps it.",
        "ctx": "x &gt; now() depends on the moment the query runs, so it cannot be folded to a constant before execution.",
        "fix": "Compute the value in the driver first, or accept that the condition is checked per row."
      },
      {
        "t": "Null values",
        "short": "Simplification must keep null semantics.",
        "ctx": "x &gt; 5 is not always true for null x. The planner only drops a condition when that is safe for null inputs.",
        "fix": "Nothing to do; the optimizer keeps the result identical. Check with explain if a filter looks removed."
      }
    ],
    "invariant": "",
    "kind": "rewrite",
    "steps": [
      {
        "t": "The query as written",
        "x": "The filter says x is greater than 5, and also greater than 3, and also that 2 times 3 equals 6. The planner has not simplified anything yet.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Fold the constant",
        "x": "2 times 3 is known before any row is read, so the planner replaces it with 6. The last condition, 6 equals 6, is always true.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Drop the always-true part",
        "x": "AND with a condition that is always true changes nothing, so that part is removed.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Keep the stronger condition",
        "x": "If x is greater than 5, it is always greater than 3. The weaker condition is redundant, so only x greater than 5 remains.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "The answer is the same",
        "x": "Rows with x above 5 are exactly the rows that passed the original filter. The result is identical, only the work is smaller.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Cheaper per row, and pushed down",
        "x": "One comparison runs per row instead of four. The single filter can be pushed to the file reader, which then skips rows it does not need.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "rewrite",
      "steps": [
        {
          "title": "The query as written",
          "text": "The filter says x is greater than 5, and also greater than 3, and also that 2 times 3 equals 6. The planner has not simplified anything yet.",
          "v": {
            "expr": "x > 5 AND x > 3 AND 2 * 3 = 6",
            "ops": 4
          }
        },
        {
          "title": "Fold the constant",
          "text": "2 times 3 is known before any row is read, so the planner replaces it with 6. The last condition, 6 equals 6, is always true.",
          "v": {
            "expr": "x > 5 AND x > 3 AND 6 = 6",
            "ops": 3,
            "folded": true
          }
        },
        {
          "title": "Drop the always-true part",
          "text": "AND with a condition that is always true changes nothing, so that part is removed.",
          "v": {
            "expr": "x > 5 AND x > 3",
            "ops": 2,
            "dropped": true
          }
        },
        {
          "title": "Keep the stronger condition",
          "text": "If x is greater than 5, it is always greater than 3. The weaker condition is redundant, so only x greater than 5 remains.",
          "v": {
            "expr": "x > 5",
            "ops": 1,
            "dropped": true
          }
        },
        {
          "title": "The answer is the same",
          "text": "Rows with x above 5 are exactly the rows that passed the original filter. The result is identical, only the work is smaller.",
          "v": {
            "expr": "x > 5",
            "ops": 1
          }
        },
        {
          "title": "Cheaper per row, and pushed down",
          "text": "One comparison runs per row instead of four. The single filter can be pushed to the file reader, which then skips rows it does not need.",
          "v": {
            "expr": "x > 5",
            "ops": 1,
            "pushed": true
          }
        }
      ]
    }
  },
  {
    "title": "Two distinct counts need an expand step",
    "blurb": "",
    "intro": "Counting distinct values of two different columns in one aggregation needs a separate grouping for each column. Spark copies each row once per distinct column before it aggregates.",
    "trigger": "A query counts distinct values of two different columns in one aggregation, such as COUNT(DISTINCT city) and COUNT(DISTINCT product) per day.",
    "run": "df.groupBy(\"day\").agg(F.countDistinct(\"city\"), F.countDistinct(\"product\")).explain()  # look for Expand in the plan",
    "expect": "Each distinct column needs its own grouping, so every input row is copied once per distinct column before the aggregation. More distinct columns mean more copies.",
    "edges": [
      {
        "t": "Approximate counts are enough",
        "short": "Cheaper than an exact expand.",
        "ctx": "When an estimate is acceptable, approximate distinct counts avoid the expand and need far less memory.",
        "fix": "Use approx_count_distinct where a small error is fine."
      },
      {
        "t": "Only one distinct column",
        "short": "No expand needed.",
        "ctx": "With one distinct column the planner uses a simpler two-phase aggregation, not an expand.",
        "fix": "Nothing to change; the explain plan shows which path was taken."
      }
    ],
    "invariant": "",
    "kind": "expand",
    "steps": [
      {
        "t": "Two distinct counts in one query",
        "x": "The query counts distinct cities and distinct products for each day. One plain grouping cannot count two different sets of unique values at once.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "Expand: one copy per distinct column",
        "x": "Spark copies each input row once per distinct column. Each copy keeps only its own column, and the other is set to null. Here 3 rows become 6.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Group the copies by day and column",
        "x": "Each copy is grouped by day and by which column it carries. The distinct values of one column meet only with the same column.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Count distinct within each group",
        "x": "Within each group, duplicates are removed and counted. The city count comes from one group, and the product count from the other.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Combine the results per day",
        "x": "The partial counts are combined into one row per day that holds both counts.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "The cost: rows multiply",
        "x": "With 10 distinct columns, the input is copied 10 times. A large table with many distinct columns can cost far more than one plain aggregation.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "expand",
      "steps": [
        {
          "title": "Two distinct counts in one query",
          "text": "The query counts distinct cities and distinct products for each day. One plain grouping cannot count two different sets of unique values at once.",
          "v": {
            "view": "input"
          }
        },
        {
          "title": "Expand: one copy per distinct column",
          "text": "Spark copies each input row once per distinct column. Each copy keeps only its own column, and the other is set to null. Here 3 rows become 6.",
          "v": {
            "view": "expand"
          }
        },
        {
          "title": "Group the copies by day and column",
          "text": "Each copy is grouped by day and by which column it carries. The distinct values of one column meet only with the same column.",
          "v": {
            "view": "group"
          }
        },
        {
          "title": "Count distinct within each group",
          "text": "Within each group, duplicates are removed and counted. The city count comes from one group, and the product count from the other.",
          "v": {
            "view": "count"
          }
        },
        {
          "title": "Combine the results per day",
          "text": "The partial counts are combined into one row per day that holds both counts.",
          "v": {
            "view": "combine"
          }
        },
        {
          "title": "The cost: rows multiply",
          "text": "With 10 distinct columns, the input is copied 10 times. A large table with many distinct columns can cost far more than one plain aggregation.",
          "v": {
            "view": "cost"
          }
        }
      ]
    }
  },
  {
    "title": "Shuffles default to 200 partitions",
    "blurb": "",
    "intro": "Every shuffle in a SQL query uses spark.sql.shuffle.partitions reduce tasks, 200 by default. For a small input, most of those tasks have almost nothing to do.",
    "trigger": "A grouping runs a shuffle over a small table, using the default spark.sql.shuffle.partitions setting of 200.",
    "run": "spark.conf.set(\"spark.sql.shuffle.partitions\", \"200\")  # 200 is the default; adaptive execution can merge small partitions at run time",
    "expect": "The shuffle always creates 200 reduce tasks. For a small input most are nearly empty, so adaptive execution or a smaller count saves the start-up cost.",
    "edges": [
      {
        "t": "Too few partitions for large data",
        "short": "Each task is huge and slow.",
        "ctx": "A few very large partitions can run out of memory and spill heavily, while most slots sit idle.",
        "fix": "Raise spark.sql.shuffle.partitions, or rely on adaptive execution to split them."
      },
      {
        "t": "Many tiny output files",
        "short": "Each reduce task writes a file.",
        "ctx": "Two hundred reducers can write two hundred small output files for a small result.",
        "fix": "Coalesce or repartition before writing, or merge partitions at run time."
      }
    ],
    "invariant": "",
    "kind": "swarm",
    "steps": [
      {
        "t": "A small table, one shuffle",
        "x": "The table is 10 MB. A group by is about to shuffle it.",
        "s": {
          "k": 0
        }
      },
      {
        "t": "The shuffle makes 200 partitions",
        "x": "The default is 200 shuffle partitions, so the reduce stage has 200 tasks, however little data there is.",
        "s": {
          "k": 1
        }
      },
      {
        "t": "Most tasks have almost nothing",
        "x": "10 MB spread over 200 tasks is about 50 KB each. Most tasks finish about as fast as they can be started.",
        "s": {
          "k": 2
        }
      },
      {
        "t": "Starting tasks costs more than the work",
        "x": "Scheduling and starting 200 tasks takes more time than the work itself, so the stage is slow for a small job.",
        "s": {
          "k": 3
        }
      },
      {
        "t": "Adaptive execution merges small partitions",
        "x": "After the map stage, the engine sees the real sizes and merges neighbouring small partitions up to a target size. Here it runs 8 tasks instead of 200.",
        "s": {
          "k": 4
        }
      },
      {
        "t": "Set the count for the data size",
        "x": "For large data, 200 can be too few, and each task becomes huge: 2 TB over 200 tasks is about 10 GB each. Tune the count to the data, or let adaptive execution choose.",
        "s": {
          "k": 5
        }
      }
    ],
    "scene": {
      "kind": "swarm",
      "steps": [
        {
          "title": "A small table, one shuffle",
          "text": "The table is 10 MB. A group by is about to shuffle it.",
          "v": {
            "tasks": 0,
            "mb": 10
          }
        },
        {
          "title": "The shuffle makes 200 partitions",
          "text": "The default is 200 shuffle partitions, so the reduce stage has 200 tasks, however little data there is.",
          "v": {
            "tasks": 200,
            "mb": 10
          }
        },
        {
          "title": "Most tasks have almost nothing",
          "text": "10 MB spread over 200 tasks is about 50 KB each. Most tasks finish about as fast as they can be started.",
          "v": {
            "tasks": 200,
            "mb": 10,
            "tiny": true
          }
        },
        {
          "title": "Starting tasks costs more than the work",
          "text": "Scheduling and starting 200 tasks takes more time than the work itself, so the stage is slow for a small job.",
          "v": {
            "tasks": 200,
            "mb": 10,
            "overhead": true
          }
        },
        {
          "title": "Adaptive execution merges small partitions",
          "text": "After the map stage, the engine sees the real sizes and merges neighbouring small partitions up to a target size. Here it runs 8 tasks instead of 200.",
          "v": {
            "tasks": 8,
            "mb": 10,
            "merged": true
          }
        },
        {
          "title": "Set the count for the data size",
          "text": "For large data, 200 can be too few, and each task becomes huge: 2 TB over 200 tasks is about 10 GB each. Tune the count to the data, or let adaptive execution choose.",
          "v": {
            "tasks": 200,
            "mb": 2000,
            "big": true
          }
        }
      ]
    }
  }
];
