/* Testing and quality: five lessons. Running scenario: a classifieds marketplace. All numbers are invented examples.
 * Sources named per lesson: M. Cohn, Succeeding with Agile (2009, test pyramid), M. Fowler (TestPyramid, mocks and stubs articles),
 * Google Testing Blog (test sizes), Jia and Harman (2011) survey of mutation testing, the PostgreSQL documentation for test databases.
 * Topic list informed by Backend from First Principles (chapter on testing), re-expressed as reviewer habits. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['quality'] = [
{
  title: `The test pyramid and what each level proves`,
  short: `Choose the cheapest test that can prove each requirement, and know what each level cannot prove.`,
  why: `An agent asked for "tests" produces whatever is easiest to write, usually many unit tests with mocks and a few that never touch a database. A reviewer maps each requirement to the level that can actually prove it, and notices the requirements that no test proves.`,
  concept: [
    `The <b>test pyramid</b> (an idea popularised by Mike Cohn, and discussed by Martin Fowler) says to have many small fast tests, fewer medium ones and a few large ones. The shape is advice about cost: the higher the level, the slower, flakier and harder to diagnose the test is.`,
    `Each level proves something different. A <b>unit test</b> proves that one piece of logic gives the right result for given inputs, in milliseconds, with no network or database. An <b>integration test</b> proves that our code works with a real neighbour: the database, the queue, the HTTP framework. An <b>end-to-end test</b> proves that a whole user journey works across the deployed pieces. A <b>contract test</b> proves that two services agree on a message shape.`,
    `Do not confuse a high count with proof. What matters is the <b>requirement to test map</b>: each requirement and each failure case from the earlier modules points at a test that would fail if it were broken. A requirement with no test is unproven, whatever the coverage number says.`
  ],
  terms: [
    [`Unit test`, `Tests one piece of logic in isolation, fast and deterministic.`],
    [`Integration test`, `Tests our code against a real dependency such as the database.`],
    [`End-to-end test`, `Drives a full user journey through the deployed system.`],
    [`Contract test`, `Checks that a provider and a consumer agree on a message or API shape.`],
    [`Flaky test`, `A test that sometimes passes and sometimes fails with no code change.`]
  ],
  example: {
    setup: `The agent delivers 120 tests for the "save ad" feature and reports 92 percent coverage (invented numbers). The reviewer builds the requirement to test map.`,
    body: [
      `Requirement 1: a member can save an ad at most once. Proof needs the real unique constraint on <code>saved_ad (member_id, ad_id)</code>, so it is an integration test against PostgreSQL. The agent has only a unit test where a mocked repository returns "duplicate", which proves nothing about the database. Requirement 2: price must be positive. A unit test of the validation function proves it, cheaply and well.`,
      `Requirement 3: a seller who is blocked cannot post. This crosses auth, the handler and the database, so one integration test through the HTTP layer proves it. Requirement 4: "a buyer can find a new ad within 5 seconds" needs the indexing pipeline, so a single end-to-end journey proves it. The map exposes that requirements 1 and 4 had no real proof, despite 120 tests and 92 percent coverage.`
    ],
    table: {
      head: [`Requirement`, `Cheapest level that proves it`, `What the agent had`],
      rows: [
        [`Save an ad at most once`, `Integration, real constraint`, `Unit test with a mock, no proof`],
        [`Price must be positive`, `Unit`, `Unit test, fine`],
        [`Blocked seller cannot post`, `Integration through HTTP`, `Missing`],
        [`New ad searchable in 5 s`, `One end-to-end journey`, `Missing`]
      ]
    }
  },
  technique: [
    { t: `List the requirements and failure cases`, x: `Take them from the requirements module and the failure table, one line each.` },
    { t: `Pick the cheapest level that can fail`, x: `For each line choose the lowest level where the broken behavior would turn the test red.` },
    { t: `Write the map first`, x: `A table of requirement, level, test name. Gaps are visible before any test is written.` },
    { t: `Keep the top thin`, x: `Few end-to-end tests, one per critical journey. Push detail down to unit and integration tests.` },
    { t: `Add contract tests at service borders`, x: `Where two services or teams meet, test the message shape on both sides.` },
    { t: `Treat coverage as a smoke alarm`, x: `Low coverage shows untested code. High coverage proves nothing about requirements.` }
  ],
  mistakes: [
    { t: `Mocking the thing under test`, ctx: `A repository is mocked to return the answer the test expects, so the test checks the mock.`, fix: `Use the real dependency where the dependency is the point, such as the database constraint.` },
    { t: `The inverted pyramid`, ctx: `Fifty slow browser tests and almost no unit tests. Each run takes 40 minutes and fails randomly.`, fix: `Move checks down to the lowest level that can prove them, keep a few journeys on top.` },
    { t: `Quoting coverage as quality`, ctx: `"92 percent covered" is the only evidence offered.`, fix: `Ask for the requirement to test map and for evidence that the tests can fail.` }
  ],
  review: [
    `Show the map from each requirement and failure case to a test. Which lines are empty?`,
    `For each test: what real behavior breaks to make it fail?`,
    `Which tests run against a real database, and which against mocks? Why that split?`,
    `How long does the whole suite take, and which level takes most of the time?`,
    `Red flag: a coverage figure presented as proof, with no requirement mapping.`
  ],
  exercise: {
    prompt: `Name the level and the one-line test for these: (a) a report on an ad cannot be filed twice by the same member, (b) the price formatter shows "1.200.000 d" for 1200000 VND, (c) a seller sees a new message in the app within 2 seconds.`,
    answer: `<p>(a) Integration: insert two reports through the repository or API against a real database and expect the second to be rejected by the unique constraint, mapped to 409. (b) Unit: call the formatter with fixed inputs and compare the string, including zero and large values. (c) End-to-end, one journey: send a message from one client and assert the other client receives it within the time bound; also an integration test of the delivery path for detail.</p>`
  },
  checklist: [
    `A requirement to test map exists and has no empty lines.`,
    `Each test sits at the cheapest level that can fail.`,
    `Database rules are proven against a real database.`,
    `The end-to-end layer is thin and covers critical journeys only.`,
    `Coverage is used as an alarm, not as proof.`
  ],
  artifact: `Section 1 of the test plan: the requirement to test map.`,
  agent: `The agent builds the requirement to test map from the requirements and the failure table, proposes a level for each line, and reports the empty lines before it writes any test.`,
  src: `M. Cohn, Succeeding with Agile (2009), the test automation pyramid. M. Fowler, "TestPyramid" (martinfowler.com bliki). Google Testing Blog, "Test Sizes". Backend from First Principles, chapter on testing (topic list).`
},
{
  title: `Unit and integration tests`,
  short: `Write unit tests for logic with fast doubles, and integration tests against the real database and framework.`,
  why: `Most agent-written backend tests either mock everything or need a shared dev database. A reviewer wants fast unit tests of real logic and trustworthy integration tests with a clean, isolated database.`,
  concept: [
    `A good <b>unit test</b> has three parts, arrange, act, assert, and one reason to fail. It tests behavior visible to callers, not the internal steps, so a refactor that keeps behavior does not break it. Time, randomness and identifiers are passed in so the test can fix them.`,
    `A <b>test double</b> replaces a dependency. A <i>stub</i> returns canned answers. A <i>fake</i> is a simple working version, such as an in-memory store. A <i>mock</i> records the calls so the test can check them. Use doubles at the edges you do not own (a payment or SMS provider) and prefer a fake over a mock when you can, because mocks lock a test to the implementation.`,
    `An <b>integration test</b> uses the real database, the real migrations and the real HTTP layer. Two rules make it reliable: each test starts from a known state (a transaction rolled back, a truncated schema or a fresh container), and the schema comes from the same migrations that production uses. A test database that differs from production hides exactly the constraint and type bugs you want to catch.`
  ],
  terms: [
    [`Arrange, act, assert`, `Set up the state, run the behavior, check the outcome.`],
    [`Stub`, `A double that returns fixed answers.`],
    [`Fake`, `A simple working substitute, such as an in-memory repository.`],
    [`Mock`, `A double that records calls so the test can verify them.`],
    [`Test isolation`, `Each test runs from a known state and cannot affect another.`]
  ],
  example: {
    setup: `Feature: a member can save at most 200 ads and only once each. Compare a weak and a strong test set (invented limit).`,
    body: [
      `Unit level: a pure function <code>canSave(currentCount, alreadySaved)</code> is tested with fixed inputs: 199 and not saved gives allowed, 200 gives rejected with reason <code>limit</code>, already saved gives <code>duplicate</code>. No database, 1 ms each, and the boundary 199 and 200 is exactly where bugs live.`,
      `Integration level: against a real PostgreSQL created from the production migrations, the test inserts two saves of the same pair through the API and expects 201 then 409, and then checks the table has one row. A second test fires two concurrent requests for the same pair and expects exactly one row, which proves the constraint and not a check-then-insert in code. The mocked version of the same feature could never catch that race.`
    ],
    table: {
      head: [`Test`, `Level`, `Dependency`, `Catches`],
      rows: [
        [`Boundary of 199 and 200`, `Unit`, `none`, `Off-by-one in the limit`],
        [`Second save returns 409`, `Integration`, `real database`, `Missing unique constraint`],
        [`Two parallel saves, one row`, `Integration`, `real database`, `Check-then-insert race`]
      ]
    }
  },
  technique: [
    { t: `Extract the logic into pure functions`, x: `Keep rules free of IO so they can be unit tested without doubles.` },
    { t: `Test behavior, not steps`, x: `Assert on results and visible side effects, not on which private functions were called.` },
    { t: `Fix time, randomness and ids`, x: `Inject a clock and an id generator so results are repeatable.` },
    { t: `Prefer fakes to mocks`, x: `Use an in-memory fake for your own interfaces, and a stub for external providers.` },
    { t: `Use the real database for data rules`, x: `Run the production migrations into a throwaway database (a container, or a schema per test run). Check the rules the schema enforces.` },
    { t: `Reset state per test`, x: `Roll back a transaction or truncate between tests so order never matters. Run the suite in random order once to prove it.` }
  ],
  mistakes: [
    { t: `Tests that depend on order`, ctx: `Test B passes only because test A left a row behind. A reordered run fails.`, fix: `Each test builds and cleans its own state.` },
    { t: `Over-mocked unit tests`, ctx: `The test verifies that <code>repo.save</code> was called once with certain arguments. A harmless refactor breaks it.`, fix: `Assert on the outcome, or use a fake repository.` },
    { t: `A different database in tests`, ctx: `Tests run on SQLite while production uses PostgreSQL. Partial indexes and JSON operators behave differently.`, fix: `Test against the same engine and version as production.` }
  ],
  review: [
    `Which rules are tested as pure functions, and which need the database?`,
    `Does the integration suite use the production migrations and the same database engine?`,
    `How does each test reset its state? Does the suite pass in random order?`,
    `Where are mocks used, and could a fake replace them?`,
    `Red flag: a test that asserts a mock was called, with no assertion on a result or stored state.`
  ],
  exercise: {
    prompt: `The agent wrote a test for "mark conversation as read": it mocks the repository and asserts <code>repo.update</code> was called with <code>read=true</code>. What is wrong, and what do you ask for?`,
    answer: `<p>It checks the implementation, not behavior: the test passes even if the update is applied to the wrong row or the SQL is wrong, and fails if someone renames the method. Ask for an integration test: create a conversation with two unread messages in a real database, call the endpoint as the recipient, then read back and assert the messages are marked read, and that another member's messages in the same conversation are untouched. Add a unit test for the pure rule of who may mark what as read.</p>`
  },
  checklist: [
    `Business rules are pure functions with fast unit tests including boundaries.`,
    `Time, randomness and ids are injected.`,
    `Integration tests use the production engine and migrations.`,
    `Every test resets its own state and the suite passes in random order.`,
    `Mocks are limited to external providers.`
  ],
  artifact: `Section 2 of the test plan: unit and integration tests per requirement, with their dependencies.`,
  agent: `The agent separates logic from IO, writes boundary unit tests and database-backed integration tests from the production migrations, and shows the suite passing in random order.`,
  src: `M. Fowler, "Mocks Aren't Stubs" and "Test Double" (martinfowler.com). G. Meszaros, xUnit Test Patterns (2007) for the double vocabulary. PostgreSQL documentation, the sections on constraints and on transaction isolation, for the concurrent insert behavior. This site's Postgres course.`
},
{
  title: `End-to-end tests and test data`,
  short: `Keep a few full-journey tests that are stable, and build test data that is explicit, minimal and safe.`,
  why: `End-to-end tests are expensive and are the usual source of flakiness. Agents often write many of them with shared, magic test data. A reviewer wants a thin set of journeys that are deterministic, and data that each test creates itself.`,
  concept: [
    `An <b>end-to-end (E2E) test</b> runs a real journey against a deployed or composed copy of the system: post an ad, see it in search, message the seller. It proves the pieces fit together, including configuration and wiring that lower tests cannot see. It cannot tell you <i>why</i> something failed, so keep each journey short and keep the details in lower-level tests.`,
    `<b>Flaky tests</b> come from time (sleeping a fixed number of seconds), shared state (another test changed the row), ordering and eventually consistent systems. Fix them by waiting for a condition with a timeout (poll until the ad appears) instead of sleeping, by isolating data per test, and by quarantining a flaky test quickly so it does not train the team to ignore red builds.`,
    `<b>Test data</b> should be created by the test through builders or factories, with only the fields that matter set explicitly and the rest defaulted. Never copy production data with real personal information into tests. If you need realistic volume, generate synthetic data, and mask anything derived from real records.`
  ],
  terms: [
    [`Journey`, `A user-visible path through several parts of the system.`],
    [`Builder or factory`, `A helper that creates valid test data with sensible defaults.`],
    [`Polling with timeout`, `Repeatedly checking for a condition until it is true or a deadline passes.`],
    [`Quarantine`, `Isolating a flaky test from the gate while it is fixed.`],
    [`Synthetic data`, `Generated data that looks real but is not taken from real people.`]
  ],
  example: {
    setup: `A critical journey: a seller posts an ad, a buyer finds it by search and sends a message, and the seller receives it. The first agent version sleeps 10 seconds after posting and fails once in five runs (invented rate).`,
    body: [
      `The cause is that search indexing is asynchronous and takes between 1 and 12 seconds. A fixed sleep either wastes time or is too short. The fix is to poll the search endpoint every 500 ms until the ad appears or 30 seconds pass, and to fail with the last response in the message. The test creates its own seller, buyer and category through a factory, with a unique title like <code>e2e-ad-</code> plus a random suffix so it can find exactly its own ad without touching others.`,
      `After the run it deletes what it created. The journey has five steps and one assertion per step, and nothing else: price rules, validation messages and limits are covered in unit and integration tests. When this test fails, a reviewer reads the step name and knows which join of the system broke.`
    ],
    table: {
      head: [`Source of flakiness`, `Symptom`, `Fix`],
      rows: [
        [`Fixed sleeps`, `Passes locally, fails in CI`, `Poll for the condition with a timeout`],
        [`Shared data`, `Fails when another test runs`, `Each test creates and cleans its own data`],
        [`Real clock`, `Fails near midnight or on expiry`, `Inject a clock or use relative times`]
      ]
    }
  },
  technique: [
    { t: `Choose the critical journeys`, x: `Pick the few paths whose failure would hurt most: post an ad, search, message. Three to ten is usual.` },
    { t: `Make each step observable`, x: `One clear assertion per step, with the response captured on failure.` },
    { t: `Wait for conditions`, x: `Replace sleeps with polling and a deadline, and report what was seen last.` },
    { t: `Create data through factories`, x: `Each test creates what it needs with unique names, and removes it after.` },
    { t: `Use synthetic data`, x: `Generate it. Never load a copy of production personal data into a test environment.` },
    { t: `Quarantine fast`, x: `Move a flaky test out of the gate within a day, open a ticket, fix or delete it.` }
  ],
  mistakes: [
    { t: `Everything as an E2E test`, ctx: `Each validation rule has a browser test. The suite takes 50 minutes.`, fix: `One journey per critical path. Test rules at lower levels.` },
    { t: `Shared test accounts`, ctx: `All tests log in as the same user, so one test's changes break another's.`, fix: `Create a member per test, with a unique identity.` },
    { t: `Production data in test`, ctx: `A snapshot of real members is restored into staging for convenience.`, fix: `Use synthetic or masked data only, and treat copies as sensitive.` }
  ],
  review: [
    `How many E2E tests are there, and which critical journey does each cover?`,
    `Where does the suite wait for asynchronous results, and how?`,
    `How is each test's data created and removed?`,
    `What is the flaky test policy and how many tests are quarantined now?`,
    `Red flag: fixed sleeps or a copy of production personal data in the test environment.`
  ],
  exercise: {
    prompt: `Design the E2E journey for "report an ad": list the steps, the data it creates, and how it waits for the moderator queue.`,
    answer: `<p>Data: a seller with an ad, a reporting member, a moderator account, all created by factories with unique names. Steps: (1) member reports the ad with a reason, expect 201. (2) the report appears in the moderator queue, polling the queue endpoint with a 30 second deadline. (3) moderator resolves it as "removed", expect 200. (4) the ad is no longer visible to the public, polling the public ad page until 404. Cleanup deletes the created rows. Report reasons, duplicates and limits are tested lower down.</p>`
  },
  checklist: [
    `Each critical journey has one short E2E test.`,
    `No fixed sleeps: conditions are polled with a deadline.`,
    `Each test creates and cleans up its own data.`,
    `No real personal data is used in any test environment.`,
    `Flaky tests are quarantined and tracked.`
  ],
  artifact: `Section 3 of the test plan: the E2E journeys, the data strategy and the flaky test policy.`,
  agent: `The agent writes the journeys with polling and factories, generates synthetic data, and reports the run time and any retried step. It refuses to load production data.`,
  src: `Google Testing Blog, "Flaky Tests at Google and How We Mitigate Them" (2016). M. Fowler, "Eradicating Non-Determinism in Tests". Backend from First Principles, chapter on testing (topic list).`
},
{
  title: `Reviewing agent-written tests`,
  short: `Check that a test can fail for the right reason, using mutation thinking and a short list of smells.`,
  why: `Agents write tests that pass. Passing is cheap: a test with no real assertion passes forever. The reviewer's job is to prove that each test would turn red if the behavior broke.`,
  concept: [
    `A <b>tautological test</b> cannot fail. Examples: asserting that a value equals the same value computed by the same code, asserting only that no exception was thrown, asserting that a mock returns what the test told it to return, or testing a constant. Such tests raise coverage and give confidence that is not earned.`,
    `<b>Mutation testing</b> is a technique that measures whether tests can fail. A tool makes small changes to the code (a mutant): flip a comparison, change a plus to a minus, delete a call. It runs the tests, and if they still pass, the mutant <i>survived</i>, which means the tests do not notice that behavior. The idea is surveyed by Jia and Harman (2011). You do not need the tool to use the idea: in review, mentally or by hand, break the code and ask which test goes red.`,
    `Other <b>test smells</b> to look for: no assertions, too many assertions on unrelated things, a test named after a method and not a behavior, logic (loops, ifs) inside the test, a test that depends on the order of other tests, and expected values copied from the output of the code under test instead of derived from the requirement.`
  ],
  terms: [
    [`Tautological test`, `A test that passes whatever the code does.`],
    [`Mutant`, `A copy of the code with one small deliberate fault.`],
    [`Survived mutant`, `A mutant that the tests did not detect, which shows a gap.`],
    [`Golden value`, `An expected value taken from the code's own output instead of from the requirement.`]
  ],
  example: {
    setup: `The agent's test for the listing fee: a seller pays 10000 for the first 3 ads in a month and 25000 after that (invented prices).`,
    body: [
      `Agent test: <code>expect(fee(3)).toBe(fee(3))</code> and <code>expect(() =&gt; fee(5)).not.toThrow()</code>. Both pass for any implementation, so both are tautological. A second test calls <code>fee(1)</code> and expects 10000, but nothing tests the boundary between 3 and 4.`,
      `Apply mutation thinking: change <code>&lt;= 3</code> to <code>&lt; 3</code>. Which test fails? None, so that mutant survives. The reviewer asks for the boundary tests derived from the rule: fee(3) is 10000, fee(4) is 25000, fee(0) is rejected. Now the same mutant turns <code>fee(3)</code> red. Each added test kills a named mutant, which is a much better reason to have a test than a coverage target.`
    ],
    table: {
      head: [`Smell`, `Why it is a problem`, `Ask the agent`],
      rows: [
        [`Expected value computed by the same code`, `Cannot differ from actual`, `Where does the expected value come from?`],
        [`Only "does not throw"`, `Wrong results pass`, `What result do you assert?`],
        [`Asserts mock call only`, `Tests the wiring, not the effect`, `What stored or returned state proves it?`],
        [`Survives a flipped comparison`, `Boundary untested`, `Which test fails if I change this operator?`]
      ]
    }
  },
  technique: [
    { t: `Read each test's assertion first`, x: `Find the line that can fail and ask what it checks. No assertion means no test.` },
    { t: `Trace the expected value`, x: `It must come from the requirement or a worked example, never from the code under test.` },
    { t: `Break the code by hand`, x: `Flip an operator, change a boundary, delete a line, and see which test goes red.` },
    { t: `Ask for boundary and negative cases`, x: `At the edges of each rule and for each error class, not only the happy path.` },
    { t: `Use a mutation tool where it exists`, x: `Run it on the changed code only, to keep it fast, and read the surviving mutants as a list of missing tests.` },
    { t: `Delete tests that prove nothing`, x: `A useless test is cost: it slows the suite and hides the real gaps.` }
  ],
  mistakes: [
    { t: `Trusting a green suite`, ctx: `All tests pass after the agent changes the pricing rule, so the change is approved. The old tests never covered the changed branch.`, fix: `Break the new code deliberately and confirm a test fails.` },
    { t: `Golden values from the output`, ctx: `The agent ran the function and pasted the result as the expected value. A bug is now locked in as correct.`, fix: `Derive expected values from the requirement or a hand calculation.` },
    { t: `Chasing a mutation score`, ctx: `A target of 100 percent leads to tests of trivial getters.`, fix: `Use surviving mutants to find real gaps, and accept that some are equivalent or not worth killing.` }
  ],
  review: [
    `For this test, what single change to the code would make it fail?`,
    `Where does each expected value come from? Show the requirement or the calculation.`,
    `Which boundary and error cases are tested, and which operator flips would survive?`,
    `Did you run the tests with a deliberately broken version to see them fail?`,
    `Red flag: a test with no assertion, or one that asserts a value equal to the output of the same function.`
  ],
  exercise: {
    prompt: `A test says: <code>const r = canPost(member); expect(r).toBeDefined()</code> for the rule "blocked members cannot post, and a member may post at most 10 ads per day". Rewrite the cases the reviewer would require.`,
    answer: `<p>The test passes for any return value. Require: blocked member with 0 ads today is rejected with reason <code>blocked</code>. Active member with 9 ads today is allowed. Active member with 10 ads today is rejected with reason <code>daily_limit</code>. Active member with 0 ads is allowed. A blocked member with 10 ads reports the blocked reason, which fixes the order of rules. Each case asserts the exact result and the reason, and each would fail if an operator or the order were flipped.</p>`
  },
  checklist: [
    `Every test has a meaningful assertion on a result or stored state.`,
    `Expected values come from requirements, not from the code.`,
    `Boundaries and negative cases are covered.`,
    `At least one deliberate break was shown to turn a test red.`,
    `Tests that prove nothing were removed.`
  ],
  artifact: `Section 4 of the test plan: the review record of tests checked by deliberate breakage, and the surviving gaps.`,
  agent: `The agent lists for each new test the mutation it would catch, runs a mutation tool on the changed files when one is available, and writes down the survivors it chose not to kill and why.`,
  src: `Y. Jia and M. Harman, "An Analysis and Survey of the Development of Mutation Testing", IEEE Transactions on Software Engineering (2011). M. Fowler, "Test Coverage" (martinfowler.com bliki), on coverage as a way to find untested code. Backend from First Principles, chapter on testing (topic list).`
},
{
  title: `Quality gates in the pipeline`,
  short: `Turn the checks into gates that block a merge or a release, with a clear rule for each and a way to keep them fast.`,
  why: `A check that nobody must pass is a suggestion. A reviewer wants the agreed checks wired as gates, fast enough that people do not bypass them, with the evidence attached to every change.`,
  concept: [
    `A <b>quality gate</b> is an automated check in the pipeline that must pass before code moves forward: before merge, before deploy to staging, before production. Gates run in order of cost, cheap ones first, so a typo fails in seconds and not after a 20 minute suite.`,
    `Typical gates: format and lint, type check, unit tests, integration tests, a dependency and secret scan, a check that migrations apply to a fresh database and to a copy of the previous schema, a coverage floor on <i>changed</i> lines, and the E2E journeys against a deployed preview. Each gate states what it protects, who owns it, and what it costs in time.`,
    `Gates need <b>discipline</b>: a failing test blocks the merge, an override is rare and recorded with a reason, and flaky gates are repaired or removed, because a gate people re-run until green teaches them to ignore it. Show <b>trend</b> numbers (duration, flake rate), not only pass or fail.`
  ],
  terms: [
    [`Quality gate`, `An automated check that must pass before a change proceeds.`],
    [`Shift left`, `Catch problems earlier, where they are cheaper to fix.`],
    [`Required check`, `A check configured so the merge button is disabled until it passes.`],
    [`Override`, `A recorded decision to proceed despite a failing gate.`]
  ],
  example: {
    setup: `The marketplace pipeline has one big job that runs everything in 25 minutes and is not required to merge (invented). People merge on red "because it is probably flaky".`,
    body: [
      `Redesign by cost. Stage 1, under 1 minute: format, lint, type check. Stage 2, under 3 minutes: unit tests and a secret and dependency scan. Stage 3, under 8 minutes: integration tests against a throwaway database built by the migrations, plus a check that migrations apply to the previous production schema. Stage 4 after merge: deploy to staging and run the three E2E journeys, which gates promotion to production.`,
      `Stages 1 to 3 are required checks on every pull request. The coverage rule is about changed lines (new code must have tests), not a global percentage. Overrides need a named approver and a ticket. The flake rate is shown on a dashboard, and any test failing without a code change twice in a week is quarantined.`
    ],
    table: {
      head: [`Stage`, `Checks`, `Target time`, `Blocks`],
      rows: [
        [`1 Static`, `Format, lint, types`, `under 1 min`, `Merge`],
        [`2 Fast tests`, `Unit tests, secret and dependency scan`, `under 3 min`, `Merge`],
        [`3 Integration`, `Real database tests, migration check`, `under 8 min`, `Merge`],
        [`4 Staging`, `E2E journeys, smoke test`, `under 10 min`, `Promotion to production`]
      ]
    }
  },
  technique: [
    { t: `List the checks and what each protects`, x: `One line per check: the risk it covers and the owner.` },
    { t: `Order by cost`, x: `Cheap, fast checks first so failures return quickly.` },
    { t: `Make them required`, x: `Configure the repository so the merge is blocked until the gates pass.` },
    { t: `Gate migrations explicitly`, x: `Apply migrations to a fresh database and to the previous schema, and check that old and new code both run, tying to the expand and contract lesson of the data modeling module.` },
    { t: `Set rules for overrides and flakes`, x: `Overrides are named and recorded. Flaky tests are quarantined by a stated rule.` },
    { t: `Track the trend`, x: `Report duration, failure rate and flake rate, and cut a stage when it exceeds its budget.` }
  ],
  mistakes: [
    { t: `Gates that are advisory`, ctx: `The checks run but the merge button is enabled, so red builds merge.`, fix: `Make the agreed checks required.` },
    { t: `One slow gate for everything`, ctx: `A 25 minute job runs on every push, so people batch changes and skip it.`, fix: `Split into stages by cost and run the slow ones later.` },
    { t: `Coverage floor on the whole repo`, ctx: `A global 80 percent target is met by tests of trivial code while the risky change is untested.`, fix: `Require tests on changed lines and map them to requirements.` }
  ],
  review: [
    `Which checks are required to merge, and which only advise?`,
    `What does each gate protect against, and how long does it take?`,
    `Does a migration gate apply the change to the previous schema, and run old code against it?`,
    `How many overrides and quarantined tests were there last month?`,
    `Red flag: a pipeline that is regularly merged on red because it is known to be flaky.`
  ],
  exercise: {
    prompt: `Order these into stages and say which block merge: unit tests, E2E journeys, lint, migration check, secret scan, integration tests.`,
    answer: `<p>Stage 1 (blocks merge): lint. Stage 2 (blocks merge): unit tests, secret scan. Stage 3 (blocks merge): integration tests and the migration check, since both need a database but not a deployed system. Stage 4 (blocks promotion to production, not merge): E2E journeys against staging. Reason: cheap and deterministic first, expensive and environment-dependent last.</p>`
  },
  checklist: [
    `Every agreed check is a required gate, with an owner.`,
    `Stages run cheap checks first and stay within their time budgets.`,
    `Migrations are checked on a fresh and on the previous schema.`,
    `Overrides are rare, named and recorded.`,
    `Duration and flake rate are tracked.`
  ],
  artifact: `Section 5 of the test plan: the gate table with stages, checks, time budgets and what each blocks.`,
  agent: `The agent writes the pipeline stages, marks the required checks, adds the migration gate and the scan, and posts a short evidence summary (checks passed, requirement map, surviving gaps) on each change.`,
  src: `J. Humble and D. Farley, Continuous Delivery (2010), on the deployment pipeline and commit stage. Google Testing Blog posts on test size and flakiness. Your repository host's documentation on required status checks. See the Delivery module for the pipeline that carries these gates.`
}
];
