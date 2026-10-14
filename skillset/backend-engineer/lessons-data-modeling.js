/* Data Modeling, lessons 1 to 4. Running scenario: a classifieds marketplace. All numbers are invented examples. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['data-modeling'] = [
{
  title: `Three levels: conceptual, logical, physical`,
  short: `One model is really three, and each answers a different question for a different reader.`,
  why: `Teams skip straight to CREATE TABLE, then discover the business never agreed on what an "ad" is. Separating the levels lets the business confirm meaning first, the engineer fix structure second, and the database decide storage last. Changing a column type then never reopens an argument about what the thing is.`,
  concept: [
    `A <b>conceptual model</b> names the things the business cares about and how they relate. It has no keys, no types and no database. Its reader is a product owner: "is this what we mean?"`,
    `A <b>logical model</b> adds structure that does not depend on one product: attributes, keys, which attribute identifies a row, and relationships written as references. Its reader is any engineer: "is this correct and free of duplication?"`,
    `A <b>physical model</b> is the design for one engine: table names, column types, indexes, partitioning, constraints. Its reader is the database and the person on call: "is this fast and safe to run?"`,
    `Move down one level at a time. Each level adds decisions and removes none of the meaning above it. The idea of separating a view of data from its storage goes back to Codd's relational model (1970), and the entity-relationship way of drawing the top level to Chen (1976).`
  ],
  terms: [
    [`Entity`, `A thing the business keeps facts about: Member, Ad, Category.`],
    [`Attribute`, `One fact about an entity: an ad has a title and a price.`],
    [`Relationship`, `A named link between entities: a Member posts an Ad.`],
    [`Identifier`, `The attribute or set of attributes that tells one instance from another.`]
  ],
  example: {
    setup: `Requirement from the marketplace: "A member can post ads. An ad belongs to one category. Buyers chat with the seller about an ad." The same sentence is modeled at three levels.`,
    body: [
      `At the conceptual level there are four boxes and three lines. Nobody has said how an ad is identified or what type its price is, and that is deliberate.`,
      `At the logical level each box gets attributes and an identifier, and each line becomes a reference. At the physical level for PostgreSQL the same ad becomes a table with typed columns, a primary key, a foreign key and an index.`
    ],
    table: {
      head: [`Level`, `What the Ad looks like`, `Decided here`],
      rows: [
        [`Conceptual`, `Ad, posted by Member, in Category`, `Which things exist and how they relate`],
        [`Logical`, `Ad(ad_id, member_id, category_id, title, price). Identifier: ad_id`, `Attributes, identifiers, references, no duplicated facts`],
        [`Physical`, `<code>CREATE TABLE ad (ad_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, member_id bigint NOT NULL REFERENCES member, category_id int NOT NULL REFERENCES category, title text NOT NULL, price_vnd bigint CHECK (price_vnd &gt;= 0))</code>`, `Types, constraints, indexes, partitioning, storage`]
      ]
    }
  },
  technique: [
    { t: `Collect the requirement sentences`, x: `Write the sentences you were given, one per line. Do not draw yet.` },
    { t: `Underline nouns and verbs`, x: `Nouns become candidate entities or attributes. Verbs become candidate relationships.` },
    { t: `Draw the conceptual model and confirm it`, x: `Boxes and lines only. Show it to someone from the business and ask "is any box wrong or missing?"` },
    { t: `Add attributes and identifiers for the logical model`, x: `Give every entity an identifier, list its attributes, and turn each line into a reference. No types yet.` },
    { t: `Choose the engine and write the physical model`, x: `Pick types, constraints and indexes for that engine. Record the queries each index serves.` }
  ],
  mistakes: [
    { t: `Designing tables first`, ctx: `You open the editor and write DDL from the first screen mockup. The table mirrors one screen, and the next screen needs a different shape.`, fix: `Draw the conceptual model first. A mockup is one view of the data, not the data.` },
    { t: `Putting types in the conceptual model`, ctx: `The business diagram shows "price: bigint". Reviewers now debate types instead of meaning, and the diagram is wrong the day the engine changes.`, fix: `Keep the conceptual level to names and relationships. Types belong to the physical level.` },
    { t: `Letting the physical model drift from the logical one`, ctx: `A column is added in production for a deadline and the logical diagram is never updated. Six months later nobody knows which one is the truth.`, fix: `Treat the physical model as generated from, or at least reviewed against, the logical one. Update both in the same change.` }
  ],
  review: [
    `Which level is each artifact at? Does the conceptual diagram contain types or keys?`,
    `Can the agent point to the requirement sentence behind every entity?`,
    `Red flag: DDL appears before anyone confirmed the conceptual model.`
  ],
  exercise: {
    prompt: `A buyer can save an ad to a favorites list and add a private note to it. Add this to the marketplace at the conceptual level, then say what new decision appears at the logical level.`,
    answer: `<p><b>Conceptual.</b> Add a relationship "saves" between Member and Ad. Because the buyer also adds a note, the relationship carries a fact of its own, so promote it to an entity: <code>SavedAd</code>, with a line to Member and a line to Ad.</p><p><b>Logical decision.</b> What identifies a SavedAd? A member should not save the same ad twice, so the identifier is the pair (member_id, ad_id). Attributes: note, saved_at.</p>`
  },
  checklist: [
    `I can say which question each of the three levels answers.`,
    `My conceptual model has no types or keys.`,
    `Every entity in the logical model has an identifier.`,
    `I know which level a given decision belongs to.`
  ],
  artifact: `Section 1 of the data model document: the requirement sentences and the conceptual ER diagram, confirmed by someone from the business.`,
  agent: `The agent asks for the requirement sentences first, drafts the conceptual diagram from the nouns and verbs, and refuses to write DDL until you confirm it.`,
  src: `E. F. Codd, A Relational Model of Data for Large Shared Data Banks, CACM 13(6), 1970. P. Chen, The Entity-Relationship Model, ACM TODS 1(1), 1976. PostgreSQL manual: CREATE TABLE, constraints.`
},
{
  title: `Entities, relationships and cardinality`,
  short: `Find the things, link them, and for each link ask how many on each side and whether it is optional.`,
  why: `Most schema bugs are cardinality bugs: a one-to-many that should be many-to-many, or an optional link that was made required. Both are cheap to fix on paper and expensive after data exists.`,
  concept: [
    `<b>Cardinality</b> is how many instances can sit on each side of a relationship: one-to-one, one-to-many, many-to-many. <b>Optionality</b> is whether the link must exist. Ask both questions in <i>both directions</i>: "can an ad have no images?" and "can an image have no ad?"`,
    `A <b>many-to-many</b> relationship cannot be stored in either table directly. It becomes its own entity (an association entity) that holds two references. That entity often carries facts of its own, such as when it was created.`,
    `A <b>weak entity</b> only exists with its owner, such as an ad image that has no meaning without its ad. It is identified through the owner.`
  ],
  terms: [
    [`One-to-many`, `One category has many ads, each ad has one category.`],
    [`Many-to-many`, `Many members save many ads. Needs an association entity.`],
    [`Optional`, `The link may be absent, such as an ad with no images.`],
    [`Association entity`, `The table that turns a many-to-many into two one-to-many links.`]
  ],
  example: {
    setup: `The marketplace has members, ads, categories, images, saved ads, conversations and messages. Read the diagram line by line, in both directions.`,
    body: [
      `A member posts zero or many ads, and every ad has exactly one poster. A category contains zero or many ads. An ad has zero or many images, and an image belongs to exactly one ad.`,
      `A conversation is between one ad, one buyer and the seller, so it links two things. Saved ads are a many-to-many between member and ad, resolved by the SavedAd entity.`
    ]
  },
  technique: [
    { t: `List the entities`, x: `Each noun that has its own facts and its own life becomes an entity. A noun that is only a fact about another (a price) is an attribute.` },
    { t: `Name each relationship with a verb`, x: `Write "Member posts Ad", not a bare line. If you cannot name it, you do not understand it yet.` },
    { t: `Ask cardinality in both directions`, x: `For each line ask "how many B for one A" and "how many A for one B". Write down the answers.` },
    { t: `Ask optionality in both directions`, x: `Can the link be missing? Be honest about the business rule, not the screen.` },
    { t: `Resolve every many-to-many`, x: `Replace it with an association entity and check whether it carries attributes or a lifecycle.` }
  ],
  mistakes: [
    { t: `Storing a many-to-many as a list column`, ctx: `Saved ads are kept as a comma-separated list on the member row. You cannot index it, cannot enforce that each ad exists, and removing one means rewriting the whole string.`, fix: `Use the SavedAd association table with a reference to each side and a unique pair.` },
    { t: `Asking cardinality in one direction only`, ctx: `You decide "a conversation has an ad" and miss that the same ad has many conversations, one per interested buyer. The model allows only one chat per ad.`, fix: `Write the sentence both ways every time: one ad, many conversations, and one conversation, exactly one ad.` },
    { t: `Making a relationship required when it is not`, ctx: `Every ad requires a category, but a draft ad is saved before the user picks one. The required link forces a fake "Uncategorized" row.`, fix: `Decide whether drafts are ads. If they are, the link is optional until publish. If not, model Draft separately.` }
  ],
  review: [
    `For each relationship, ask for the cardinality and optionality in both directions. Does the agent answer both?`,
    `Find every list-valued, JSON or comma-separated column. Is it hiding a relationship?`,
    `Red flag: a relationship with no verb, or an entity with no requirement behind it.`
  ],
  exercise: {
    prompt: `Moderators handle reports. A member can report an ad or another member. A moderator is assigned to a report, and one report can be re-assigned. Draw the entities and cardinalities, and say what you would ask the product owner.`,
    answer: `<p>Entities: Member, Ad, Report, ReportAssignment (a moderator is a Member with a role). Report links to its reporter (many reports, one reporter) and to a target. The target is either an ad or a member, which is a modeling choice: two optional references with a rule that exactly one is set, or a separate table for each target type.</p><p>A report can be re-assigned, so keep history: ReportAssignment(report, moderator, assigned_at). Questions to ask: can one report cover several ads? Can a moderator see their own reports? Does an assignment ever end without a new one?</p>`
  },
  checklist: [
    `Every relationship has a verb name.`,
    `I asked cardinality and optionality in both directions.`,
    `Every many-to-many is an association entity.`,
    `No list-valued or comma-separated column stands in for a relationship.`
  ],
  artifact: `Section 2 of the document: the full ER diagram with cardinality and optionality, and a one-line meaning for every entity.`,
  agent: `The agent checks that each relationship is named, flags any list-valued attribute as a hidden many-to-many, and lists the questions it still needs the product owner to answer.`,
  src: `P. Chen, The Entity-Relationship Model, ACM TODS 1(1), 1976. M. Kleppmann, Designing Data-Intensive Applications, ch. 2 (relationships and many-to-many). Mermaid erDiagram syntax for the notation.`
},
{
  title: `Keys and identity`,
  short: `Decide what makes a row the same row, and what the database must refuse to duplicate.`,
  why: `A key is a promise to the whole system about identity. Pick a poor one, such as an email address that members can change, and every table that points at it must change too. Pick none, and duplicates arrive.`,
  concept: [
    `A <b>candidate key</b> is a minimal set of attributes that is unique for every row. The one you choose to point at is the <b>primary key</b>. Others stay as <b>unique constraints</b>.`,
    `A <b>natural key</b> comes from the business (a national id, an ISBN). A <b>surrogate key</b> is generated by the system and has no meaning (a bigint or a UUID). Natural keys change in ways nobody planned for, so most teams use a surrogate primary key and keep the natural key as a unique constraint.`,
    `A <b>foreign key</b> is a reference that the database enforces: you cannot point at a row that does not exist. A <b>composite key</b> uses two or more columns, which suits association tables.`,
    `For generated identifiers, a sequence-based bigint is small and keeps index inserts in order. A random UUID is easy to generate anywhere but scatters inserts across the index. Time-ordered UUIDs (RFC 9562 defines UUIDv7) give the same independence with better insert locality.`
  ],
  terms: [
    [`Candidate key`, `A minimal unique set of columns.`],
    [`Surrogate key`, `A generated id with no business meaning.`],
    [`Natural key`, `A business value used as identity, such as an email address.`],
    [`Foreign key`, `A column that must match a row in another table.`]
  ],
  example: {
    setup: `Choose keys for member, ad, ad image and saved ad in the marketplace.`,
    body: [
      `Member: the email looks like a good key, but members change it and may have none if they sign up by phone. Use a surrogate <code>member_id</code> and add unique constraints on email and phone (a unique constraint ignores nulls in PostgreSQL, so a member with no phone is fine).`,
      `Ad image: it only exists with its ad, so identify it by (ad_id, position). SavedAd: identify it by (member_id, ad_id), which also stops the double save.`
    ],
    table: {
      head: [`Table`, `Primary key`, `Also unique`, `Foreign keys`],
      rows: [
        [`member`, `member_id (identity)`, `email, phone`, `none`],
        [`ad`, `ad_id (identity)`, `none`, `member_id, category_id`],
        [`ad_image`, `(ad_id, position)`, `none`, `ad_id`],
        [`saved_ad`, `(member_id, ad_id)`, `none`, `member_id, ad_id`]
      ]
    }
  },
  technique: [
    { t: `List the candidate keys`, x: `For each entity, write every minimal combination of attributes that is unique.` },
    { t: `Ask if each one can change`, x: `If a business value can change, or can be absent, it is a bad primary key.` },
    { t: `Choose the primary key`, x: `Default to a generated surrogate. Use a composite key for association and weak entities.` },
    { t: `Keep the other candidates as unique constraints`, x: `Identity that the business cares about must still be enforced by the database.` },
    { t: `Declare every foreign key`, x: `Add the reference and decide what happens on delete: restrict, cascade or set null.` }
  ],
  mistakes: [
    { t: `Using a changeable value as the primary key`, ctx: `Email is the key of member and appears in six other tables. A member changes it, and you must update every table in one transaction or lose links.`, fix: `Key on a generated id. Keep email as a unique column that can change in one place.` },
    { t: `Skipping foreign keys for speed`, ctx: `The team removes foreign keys because "inserts are slower". Months later ads exist for deleted members and no query can trust the data.`, fix: `Keep them. Measure the cost on your workload before removing a safety net, and index the referencing column.` },
    { t: `Using a random UUID as a clustered key without thinking`, ctx: `Every insert lands at a random place in the index, so pages split and the cache works hard.`, fix: `Prefer a sequence or a time-ordered UUID when insert rate is high, or accept the cost knowingly.` }
  ],
  review: [
    `Which keys can change or be absent? Check what email, phone or slug is used as an identity.`,
    `Is every foreign key declared, and what happens on delete? Was the rule chosen or defaulted?`,
    `Red flag: a table with no primary key, or cascade delete applied everywhere without a reason.`
  ],
  exercise: {
    prompt: `A member can have several phone numbers, and a phone number can be used by only one active member. Model it, and choose the keys.`,
    answer: `<p>Phone numbers are a repeating fact about a member, so give them their own table: <code>member_phone(member_id, phone, active)</code>, with primary key (member_id, phone).</p><p>The rule "a number belongs to one active member" depends on the status, so enforce it with a partial unique index: <code>CREATE UNIQUE INDEX one_active_owner ON member_phone (phone) WHERE active;</code> If a number may never be shared at all, a plain unique constraint on phone is enough. Ask the business which rule is real.</p>`
  },
  checklist: [
    `Every table has a primary key.`,
    `No primary key uses a value that can change or be absent.`,
    `Every candidate key the business cares about is a unique constraint.`,
    `Every reference is a declared foreign key with a chosen delete rule.`
  ],
  artifact: `Section 3 of the document: a key table like the one above for every entity, with the reason for each choice.`,
  agent: `The agent flags any table without a key, any key built on a changeable column, and any reference that is not a declared foreign key, and it asks you to state the delete rule.`,
  src: `PostgreSQL manual, section Constraints (primary keys, unique constraints, foreign keys). RFC 9562 (UUID version 7). C. J. Date, An Introduction to Database Systems (candidate keys).`
},
{
  title: `Normalization, and when to break it`,
  short: `Store each fact once so updates cannot disagree, then denormalize only for a reason you can name.`,
  why: `When the same fact lives in two places, someone updates one and forgets the other. Normalization is the discipline that makes this impossible by structure instead of by care. It is also the baseline you measure a deliberate shortcut against.`,
  concept: [
    `<b>First normal form (1NF):</b> every column holds one value, and there are no repeating groups. <b>Second (2NF):</b> in a table with a composite key, every other column depends on the whole key. <b>Third (3NF):</b> every other column depends on the key and nothing but the key. W. Kent's summary: the key, the whole key, and nothing but the key.`,
    `<b>Boyce-Codd normal form (BCNF)</b> tightens 3NF: whenever one set of columns determines another, the determining set must be a candidate key. Most business models that reach 3NF are already in BCNF.`,
    `The test is <b>functional dependency</b>: if knowing A tells you B, then B depends on A. Write those dependencies down. A column that depends on something other than the key belongs in another table.`,
    `Denormalizing means storing a fact twice on purpose to make a read cheaper. It is a trade: you buy a faster read and pay with an update you must keep in sync. Do it after you have a measured query that needs it, and write down who keeps the copies in sync.`
  ],
  terms: [
    [`Functional dependency`, `A tells you B, written A to B.`],
    [`Update anomaly`, `The same fact stored twice, changed in one place only.`],
    [`Insert anomaly`, `A fact cannot be stored until an unrelated fact exists.`],
    [`Denormalization`, `Storing a derived or duplicated fact deliberately to speed a read.`]
  ],
  example: {
    setup: `A first draft of the marketplace stores everything on one ad row.`,
    body: [
      `The draft table is <code>ad(ad_id, title, price, seller_name, seller_phone, category_name, image_urls)</code>. Image urls are a repeating group, so it breaks 1NF. seller_name and seller_phone depend on the seller, not on the ad, and category_name depends on the category, so it breaks 3NF.`,
      `The anomaly is easy to see: a seller changes phone and 300 ads still show the old one. After normalizing, the phone lives once on member, the category name once on category, and images in their own table. Later, a deliberate denormalization is fine: the ad keeps a <code>reply_count</code> so the list page need not count messages on every view, and a job keeps it correct.`
    ],
    table: {
      head: [`Step`, `Problem found`, `Fix`],
      rows: [
        [`1NF`, `image_urls holds a list`, `Move to ad_image(ad_id, position, url)`],
        [`2NF`, `none: the key is a single column`, `Nothing to do`],
        [`3NF`, `seller_phone depends on the seller, category_name on the category`, `Move to member and category, keep only foreign keys on ad`]
      ]
    }
  },
  technique: [
    { t: `Write the functional dependencies`, x: `For each table, list "this column set determines that column".` },
    { t: `Remove repeating groups`, x: `Any list-valued or numbered column group moves to its own table (1NF).` },
    { t: `Remove partial dependencies`, x: `Where the key has several columns, move columns that depend on part of it (2NF).` },
    { t: `Remove transitive dependencies`, x: `Move any column that depends on a non-key column to its own table (3NF).` },
    { t: `Denormalize last, with a note`, x: `For each copy you keep, write the query that needs it, who updates it, and how you would detect drift.` }
  ],
  mistakes: [
    { t: `Denormalizing before measuring`, ctx: `The team copies the seller name onto every ad to save a join. The join was cheap, and now name changes need a backfill job.`, fix: `Normalize first. Denormalize when a measured query is too slow and no index fixes it.` },
    { t: `Over-normalizing a value that never changes`, ctx: `A currency code is split into its own table with an id, and every query now joins it for no benefit.`, fix: `Keep stable, small, closed-set values as a column with a check constraint or an enum.` },
    { t: `Storing a derived value with no owner`, ctx: `reply_count sits on the ad, but several services update it. Counts drift and nobody knows which is right.`, fix: `Give each copy exactly one writer and a repair job, or compute it on read.` }
  ],
  review: [
    `Which functional dependencies did the agent assume? Do they match the business rules?`,
    `For each denormalized column: who writes it, and how is drift detected?`,
    `Red flag: a copied column with no owner, or a JSON blob that holds structured facts.`
  ],
  exercise: {
    prompt: `A table <code>order_line(order_id, product_id, product_name, quantity, unit_price)</code> has the key (order_id, product_id). Which normal form does it break, and what is the fix?`,
    answer: `<p>product_name depends on product_id alone, which is only part of the key, so it breaks 2NF. Move it to <code>product(product_id, product_name)</code> and keep only product_id on the line.</p><p>unit_price needs a second look. If it is the price at the time of the order, it depends on the whole key and belongs on the line: that is a deliberate, correct copy of a historical fact, not duplication.</p>`
  },
  checklist: [
    `I wrote the functional dependencies for each table.`,
    `No table has a repeating group or a column that depends on a non-key column.`,
    `Every denormalized column has a stated reason and one owner.`,
    `A historical snapshot (price at order time) is kept on purpose, not by accident.`
  ],
  artifact: `Section 4 of the document: the normalized table list plus a short "deliberate copies" table (column, reason, owner, how drift is detected).`,
  agent: `The agent derives functional dependencies from your column names, points out each possible 2NF and 3NF violation, and refuses a denormalized column that has no named owner.`,
  src: `W. Kent, A Simple Guide to Five Normal Forms in Relational Database Theory, CACM 26(2), 1983. E. F. Codd (1970, normalization). C. J. Date, An Introduction to Database Systems. M. Kleppmann, Designing Data-Intensive Applications, ch. 2 (normalization and joins).`
}
];
