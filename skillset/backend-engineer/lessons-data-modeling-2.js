/* Data Modeling, lessons 5 to 7. Same running scenario. All numbers are invented examples. */
SkillData.lessons['data-modeling'] = SkillData.lessons['data-modeling'].concat([
{
  title: `Model for the access patterns`,
  short: `List the questions the system must answer fast, then shape tables, indexes and stores to answer them.`,
  why: `A model can be perfectly normalized and still be too slow, or fit one engine and fight another. The reads and writes decide the physical shape, so you write them down before you choose indexes or a database.`,
  concept: [
    `An <b>access pattern</b> is one concrete question or write the system must serve, with its frequency, its latency target and its consistency need: "show newest ads in a category, 200 times a second, under 100 ms".`,
    `In a relational database, access patterns become <b>indexes</b>. A composite index serves a query that filters on its leading columns and sorts by the next one. Every index speeds some reads and slows every write, so each one needs a pattern behind it.`,
    `In a wide-column store such as ScyllaDB the order is reversed: you design one table <i>per query</i>, choosing the partition key to spread load and the clustering columns to sort within a partition. In a key-value store such as Redis you design the <i>key</i> and the value type for the one operation you need.`,
    `The same domain can live in more than one engine. Keep one system of record and treat the others as derived views that you can rebuild.`
  ],
  terms: [
    [`Access pattern`, `A query or write with a rate, a latency target and a consistency need.`],
    [`Composite index`, `An index on several columns, useful for a filter then a sort.`],
    [`Partition key`, `The value that decides which node or partition holds a row.`],
    [`System of record`, `The store that holds the truth, from which others are rebuilt.`]
  ],
  example: {
    setup: `Four reads and one write for the marketplace, with invented rates. The point is the method: pattern first, structure second.`,
    body: [
      `The listing page asks for the newest ads in a category. In PostgreSQL that is an index on (category_id, created_at DESC). The chat screen reads the latest messages of one conversation, so in a wide-column store the partition key is conversation_id and the rows sort by time. A session lookup is one key read, so it is a Redis key with a TTL.`
    ],
    table: {
      head: [`Pattern (example rate)`, `Structure`, `Engine and why`],
      rows: [
        [`Newest ads in a category, filter by price (200 per s)`, `Index on ad (category_id, created_at DESC)`, `PostgreSQL: one query, ranges, joins`],
        [`Ad detail by id (500 per s)`, `Primary key lookup`, `PostgreSQL: the primary key is the index`],
        [`Latest 50 messages of a chat (800 per s)`, `Partition key conversation_id, clustered by time`, `Wide-column: one partition read, append-heavy`],
        [`Is this session valid (2000 per s)`, `Key session:id with expiry`, `Key-value: one key, expires itself`],
        [`Save a message (800 writes per s)`, `Append to the chat partition`, `Wide-column: cheap sequential writes`]
      ]
    }
  },
  technique: [
    { t: `Write the pattern list`, x: `One line per read or write: what it asks, how often, how fast, how fresh the answer must be.` },
    { t: `Mark the hot and the critical ones`, x: `Design for the busiest and the most latency-sensitive first. A rare admin report can be slow.` },
    { t: `Pick the system of record`, x: `Choose one store that holds the truth. It is usually the one that enforces your keys and constraints.` },
    { t: `Shape the structure for each pattern`, x: `An index, a table per query, or a key design, depending on the engine.` },
    { t: `Prove it`, x: `Run the real query and read the plan (EXPLAIN in PostgreSQL) or the trace for your store, with realistic data volume.` }
  ],
  mistakes: [
    { t: `An index for every column`, ctx: `A single-column index is added on each column "just in case". Writes slow down and the planner still cannot sort by the right pair.`, fix: `Add an index only for a listed pattern, with the column order the query needs.` },
    { t: `Choosing the engine before the patterns`, ctx: `The team picks a trendy store, then finds that the main screen needs joins and ad-hoc filters it cannot do.`, fix: `Write the pattern list first. Let it decide between relational, wide-column and key-value.` },
    { t: `Two stores that both claim to be the truth`, ctx: `Ad data is edited in the database and in a search index, and they disagree.`, fix: `Name one system of record. Make the other a rebuildable view, fed by the first.` }
  ],
  review: [
    `Which measured query justifies each index? Ask for the EXPLAIN output on realistic volume.`,
    `Which store is the system of record? Can the others be rebuilt from it?`,
    `Red flag: an index on every column, or two stores both treated as the truth.`
  ],
  exercise: {
    prompt: `Add this pattern: "show a member their last 20 saved ads, newest first". Which key or index serves it, and what happens if saved_ad has only the primary key (member_id, ad_id)?`,
    answer: `<p>The query filters on member_id and sorts by saved_at. The primary key (member_id, ad_id) finds the member's rows but not in time order, so PostgreSQL would read all of a member's saved ads and sort them. Add an index on <code>saved_ad (member_id, saved_at DESC)</code>. The page then reads 20 index entries.</p><p>It costs one extra index write per save. For a member with a few hundred saved ads the sort alone would be cheap, so check the plan and the volume before adding it.</p>`
  },
  checklist: [
    `Every important read and write is a line in my pattern list with a rate and a target.`,
    `Every index points to a pattern, and I know its column order is deliberate.`,
    `I named one system of record.`,
    `I looked at a real plan or trace for the hottest pattern.`
  ],
  artifact: `Section 5 of the document: the access-pattern table (pattern, rate, target, structure, store) and the evidence that the hottest one meets its target.`,
  agent: `The agent asks for the pattern list before it proposes any index, suggests the index or table shape per pattern, and runs a plan check on the hottest one when it has database access.`,
  src: `PostgreSQL manual: Indexes (multicolumn indexes), EXPLAIN. M. Kleppmann, Designing Data-Intensive Applications, ch. 2 to 3. Course pages on this site: PostgreSQL, ScyllaDB and Redis internals. Rates are examples.`
},
{
  title: `Dimensional modeling for analytics`,
  short: `Shape data as facts and dimensions so people can slice a business process any way they ask.`,
  why: `The model that is best for taking orders is poor for answering "how many leads per category per week". Analytics wants wide reads over history, so it uses a different shape, built around one business process.`,
  concept: [
    `A <b>fact table</b> records one event per row, such as one ad view or one lead. It holds measures (counts, amounts) and references to dimensions. A <b>dimension table</b> describes the who, what, where and when: member, ad, category, date.`,
    `The most important decision is the <b>grain</b>: exactly what one row of the fact table means. "One row per ad view" is a grain. Declare it first, and every dimension and measure must be true at that grain.`,
    `Prefer <b>additive</b> measures (a count, an amount) that can be summed across any dimension. A ratio is not additive: store its parts and divide after you sum.`,
    `Dimensions change over time. Kimball names the common treatments as slowly changing dimensions: <b>Type 1</b> overwrites the old value, <b>Type 2</b> adds a new row with validity dates so history is kept, and <b>Type 3</b> adds a column that holds the previous value.`
  ],
  terms: [
    [`Grain`, `What exactly one row of a fact table represents.`],
    [`Measure`, `A numeric fact you aggregate, such as a view count.`],
    [`Star schema`, `One fact table surrounded by dimension tables.`],
    [`Type 2 dimension`, `A dimension that keeps history by adding a row per change.`]
  ],
  example: {
    setup: `Product wants "leads per category per week, and how it changed when an ad moved to another category". A lead is a buyer's first message on an ad.`,
    body: [
      `Business process: lead creation. Grain: one row per lead. Dimensions: date, ad, category, buyer region. Measure: lead_count (always 1 per row, so it sums), and first_response_seconds.`,
      `An ad can change category. If dim_ad overwrites the category (Type 1), last month's leads move to the new category and the old report changes. If dim_ad is Type 2, each lead points to the ad row that was valid when the lead happened, so history stays true.`
    ]
  },
  technique: [
    { t: `Choose the business process`, x: `Name one event the business measures: lead, ad view, payment.` },
    { t: `Declare the grain`, x: `Write one sentence: "one row per ...". Do not continue until it is exact.` },
    { t: `Choose the dimensions`, x: `List who, what, where, when for that grain. Each becomes a dimension with a surrogate key.` },
    { t: `Choose the measures`, x: `Keep only measures true at the grain. Store parts of a ratio, not the ratio.` },
    { t: `Decide how each dimension changes`, x: `For each attribute that can change, pick Type 1, 2 or 3 based on whether history must be preserved.` }
  ],
  mistakes: [
    { t: `Mixing two grains in one fact table`, ctx: `Rows hold both single leads and weekly totals, so a sum double counts.`, fix: `One grain per fact table. Put the weekly total in a separate aggregate table built from the first.` },
    { t: `Using Type 1 where history matters`, ctx: `A category rename rewrites the past, so a report run in March now disagrees with the one saved in February.`, fix: `Use Type 2 for attributes whose history a report may need, and Type 1 only for corrections.` },
    { t: `Storing a ratio as a measure`, ctx: `A conversion rate is stored per row. Averaging the averages across groups gives the wrong number.`, fix: `Store numerator and denominator as additive measures and divide after the sum.` }
  ],
  review: [
    `What is the grain, in one sentence? Is every dimension and measure true at that grain?`,
    `Is any ratio stored as a measure, or any history-needing attribute overwritten?`,
    `Red flag: a fact table mixing event rows and total rows.`
  ],
  exercise: {
    prompt: `State the grain and the dimensions for "ad views", and say whether view_duration_seconds is additive.`,
    answer: `<p>Grain: one row per ad view (one member or visitor viewing one ad detail page once). Dimensions: date and time, ad, category, viewer (nullable for anonymous), device. Measures: view_count (1 per row) and view_duration_seconds.</p><p>Duration is additive for totals (total seconds viewed per category), but an average duration must be computed as total seconds divided by view count after summing, never averaged from per-row averages.</p>`
  },
  checklist: [
    `I named one business process and wrote the grain as one sentence.`,
    `Every dimension and measure is true at that grain.`,
    `No ratio is stored as a measure.`,
    `Each changing dimension has a chosen type with a reason.`
  ],
  artifact: `Section 6 of the document (only if the feature needs analytics): process, grain, star diagram, measure list and the change type of each dimension.`,
  agent: `The agent refuses a fact table without a one-sentence grain, flags any measure that is a ratio, and asks which dimension attributes need history.`,
  src: `R. Kimball and M. Ross, The Data Warehouse Toolkit, 3rd ed., Wiley 2013 (grain, fact and dimension tables, slowly changing dimensions). M. Kleppmann, Designing Data-Intensive Applications, ch. 3 (star schemas).`
},
{
  title: `Changing a live schema safely`,
  short: `Change structure in small, reversible steps so old and new code both work during the move.`,
  why: `The first model is never the last. Changing a table that serves live traffic can lock it or break running code, so the way you change it matters as much as what you change.`,
  concept: [
    `The safe pattern is <b>expand, migrate, contract</b>. <b>Expand</b>: add the new structure without removing the old, so old code still works. <b>Migrate</b>: copy or backfill the data, in small batches, and move the code to the new structure. <b>Contract</b>: remove the old structure only when nothing uses it.`,
    `Every step must be compatible with the version of the code running just before and just after it. Deploy order matters: database first for additive changes, code first for removals.`,
    `Know what your database does to a live table. In PostgreSQL, adding a nullable column or one with a constant default is quick (a catalog change, since version 11 for defaults). Building an index blocks writes unless you use <code>CREATE INDEX CONCURRENTLY</code>. Adding a constraint scans the table, but you can add it as <code>NOT VALID</code> first and run <code>VALIDATE CONSTRAINT</code> later, which does not block writes for long.`,
    `Keep every migration in version control, in order, and write down how to undo it. A change you cannot reverse needs a stronger review.`
  ],
  terms: [
    [`Expand and contract`, `Add the new shape, move to it, then remove the old shape.`],
    [`Backfill`, `Filling a new column for existing rows, in batches.`],
    [`Backward compatible`, `Old code still works against the new schema.`],
    [`NOT VALID constraint`, `A constraint checked on new writes first, validated on old rows later.`]
  ],
  example: {
    setup: `Today <code>ad.price</code> is text such as "1.5tr". Product wants a numeric price and a currency, with no downtime.`,
    body: [
      `Expand: add <code>price_amount bigint</code> and <code>currency char(3)</code> as nullable columns. Deploy code that writes both the old and the new columns. Migrate: backfill old rows in batches of a few thousand, parsing the text, and log the rows that do not parse. Switch reads to the new columns once the backfill is complete and the counts match.`,
      `Contract: stop writing the old column, wait one release, then drop it. Then add the constraint as NOT VALID and validate it. At no point did old code fail, and every step can be undone until the drop.`
    ]
  },
  technique: [
    { t: `Write the target and the order`, x: `State the end shape, then list the steps in order with the code version that runs between each pair.` },
    { t: `Expand with additive changes`, x: `Add nullable columns, new tables and concurrent indexes. Avoid renames and type changes in place.` },
    { t: `Dual write, then backfill`, x: `Write both shapes from the new code, then fill old rows in small batches with a pause between them.` },
    { t: `Verify before switching reads`, x: `Compare counts and a sample of rows. Switch reads behind a flag so you can switch back.` },
    { t: `Contract last`, x: `Remove the old column in a later release, after nothing has read it for a full cycle. Keep the undo script.` }
  ],
  mistakes: [
    { t: `Renaming a column in one deploy`, ctx: `A migration renames <code>price</code> and the code switches in the same release. During the rollout old servers fail on the missing column.`, fix: `Add the new column, dual write, move reads, and drop the old column in a later release.` },
    { t: `One giant backfill`, ctx: `A single UPDATE touches 40 million rows in one transaction, holds locks, bloats the table and stalls replicas.`, fix: `Backfill in small batches, commit each one, and watch replica lag.` },
    { t: `Dropping before verifying`, ctx: `The old column is dropped the same day the new one is filled. A parsing bug is found a week later and the original data is gone.`, fix: `Keep the old column until the new one has been verified and read for a full cycle.` }
  ],
  review: [
    `Is each migration step compatible with the code version before and after it?`,
    `Is the backfill batched, and how are progress and failures observed? Where is the undo?`,
    `Red flag: a rename or type change in one deploy, one UPDATE over the whole table, or a DROP in the same release as the backfill.`
  ],
  exercise: {
    prompt: `Plan the change: make <code>ad.category_id</code> NOT NULL on a table with 40 million rows, where about 2 percent of rows are currently null.`,
    answer: `<p>1) Decide what the null rows mean and fix them: set a real category or move them to a drafts table, in batches. 2) Add <code>ALTER TABLE ad ADD CONSTRAINT ad_category_not_null CHECK (category_id IS NOT NULL) NOT VALID;</code> so new writes are checked at once. 3) Run <code>ALTER TABLE ad VALIDATE CONSTRAINT ad_category_not_null;</code> which scans without blocking writes for long. 4) Run <code>ALTER TABLE ad ALTER COLUMN category_id SET NOT NULL;</code> which can use the validated check to skip its own scan in recent PostgreSQL versions, then drop the helper constraint. Check your version's documentation for that last detail.</p>`
  },
  checklist: [
    `Each migration step works with the code version before and after it.`,
    `Backfills run in small committed batches.`,
    `Reads switch behind a flag and I verified the data first.`,
    `Every migration has an undo, or a stated reason it cannot.`
  ],
  artifact: `Section 7 of the document: the migration plan for the first planned change, with step order, code version per step, backfill method and undo.`,
  agent: `The agent drafts the migration files in expand, migrate, contract order from your target shape, flags any step that is not backward compatible, and asks for the undo of each.`,
  src: `PostgreSQL manual: ALTER TABLE (ADD COLUMN, ADD CONSTRAINT NOT VALID, VALIDATE CONSTRAINT), CREATE INDEX (CONCURRENTLY). S. Ambler and P. Sadalage, Refactoring Databases, 2006 (evolutionary design, transition periods). M. Kleppmann, Designing Data-Intensive Applications, ch. 4 (evolvability).`
}
]);
