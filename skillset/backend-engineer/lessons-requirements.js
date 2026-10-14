/* Collect the functional spec: five lessons. Running scenario: a classifieds marketplace. All numbers are invented examples. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['requirements'] = [
{
  title: `Turn a request into a problem statement`,
  short: `Separate the person's goal from their proposed solution, and write the problem with its actors, trigger and measure of success.`,
  why: `Requests arrive as solutions: "add a favorites button", "make search faster". An agent will happily build exactly that. A reviewer's job is to check that the thing built answers the need behind the request, because a perfectly built wrong feature is the most expensive kind.`,
  concept: [
    `A <b>request</b> is what someone asked for. A <b>need</b> is why they asked. "Add a saved ads button" is a request. "Buyers lose track of ads they want to compare" is a need. The same need can often be met in several ways, and the request names only one of them.`,
    `A usable <b>problem statement</b> has five parts: the <b>actor</b> (who has the problem), the <b>situation</b> (when it happens), the <b>pain</b> (what goes wrong today), the <b>outcome</b> (what better looks like) and the <b>measure</b> (how we would know). The measure may be rough, but it must exist, or nobody can say later whether the feature worked.`,
    `Ask <b>"why" until you reach a goal a person has</b>, not a feature. Stop when the answer no longer names a screen or a table. This is the practice behind the "five whys" idea, but you rarely need five: two or three usually reach the goal.`,
    `Record <b>assumptions</b> in a separate list. Every gap you fill with a guess ("buyers are logged in", "an ad has at most 10 photos") is a risk the requester never agreed to. A guess written down can be corrected. A guess left implicit becomes behavior.`
  ],
  terms: [
    [`Actor`, `A kind of person or system that interacts with the product, such as buyer, seller, moderator.`],
    [`Need`, `The goal behind a request, stated without naming a solution.`],
    [`Problem statement`, `Actor, situation, pain, outcome and measure, in a few sentences.`],
    [`Assumption`, `Something taken as true without confirmation, listed so it can be challenged.`]
  ],
  example: {
    setup: `The product owner writes: "Add a favorites button to every ad." An agent that starts coding now will produce a button and a table. Ask first what the problem is. (All numbers below are invented.)`,
    body: [
      `After two questions the picture changes. Why a favorites button? "Buyers come back to compare ads and cannot find them." Why can they not find them? "The browser history is messy and the app forgets what they looked at." The need is: a buyer who is comparing several ads wants to return to them without searching again.`,
      `Written as a statement: <i>A buyer comparing ads (actor) leaves the list and later cannot find the ads they liked (situation and pain). They should be able to return to chosen ads in two taps (outcome). We will know it works if the share of buyers who open the same ad on three or more days rises from 8 percent to 12 percent (measure, invented numbers).</i> Now the "saved ad" feature has a reason, and options such as a recently viewed list can be compared with it.`
    ],
    table: {
      head: [`Part`, `Weak version`, `Useful version`],
      rows: [
        [`Actor`, `"Users"`, `A signed-in buyer comparing 3 to 10 ads`],
        [`Pain`, `"It is inconvenient"`, `Returning to an ad needs a new search and often fails`],
        [`Outcome`, `"Better experience"`, `Back to a chosen ad in two taps`],
        [`Measure`, `None`, `Repeat views of the same ad across 3 or more days, 8 to 12 percent (invented)`]
      ]
    }
  },
  technique: [
    { t: `Quote the request word for word`, x: `Keep the original sentence at the top of the spec. Everything after it is interpretation and should be marked as such.` },
    { t: `Ask why until you reach a goal`, x: `Keep asking until the answer is a person's goal, not a screen or a table.` },
    { t: `Name the actor and the situation`, x: `Pick a real kind of user and a moment, not "the user in general".` },
    { t: `Write the outcome and the measure`, x: `One sentence for what changes, one for how it would be noticed. Mark invented targets as such.` },
    { t: `List assumptions and open questions`, x: `Everything you guessed goes into a list with an owner who can confirm it.` }
  ],
  mistakes: [
    { t: `Building the request as worded`, ctx: `"Favorites button" ships. Buyers use it, but the real complaint, finding an ad again after a new session, is only half solved because the list is not shown on the home screen.`, fix: `State the need and check each requirement against it. Ask the requester which need the feature serves.` },
    { t: `A problem statement that hides the solution`, ctx: `"Buyers need a saved_ad table with a join to ad" is a design, not a problem.`, fix: `Remove any noun that is a table, endpoint or screen. If the statement still makes sense, it is a problem.` },
    { t: `Silent assumptions`, ctx: `The agent assumes only signed-in members can save ads. Nobody confirmed it, and guest buyers are 60 percent of traffic (invented).`, fix: `Put every assumption in a list and mark who must confirm it before the work starts.` }
  ],
  review: [
    `Does the spec quote the original request and then state the need behind it?`,
    `Who is the actor, in which situation, and what is the measure of success?`,
    `Which assumptions did the agent make? Is each one listed and assigned to someone who can confirm it?`,
    `Red flag: a spec that begins with tables, endpoints or screens and never says what problem it solves.`
  ],
  exercise: {
    prompt: `The request says: "Show the seller's phone number on every ad." Write the questions you would ask and a draft problem statement. Name at least two assumptions that could be wrong.`,
    answer: `<p>Questions: Who needs the number and in what situation? Why not use chat? Does the seller want the number public? Is the goal faster contact, or is chat failing buyers? What happens to spam and scraping if a number is visible?</p><p>Draft: <i>A buyer who wants to ask about an ad right now (actor, situation) finds that chat replies take hours (pain). They should reach the seller quickly (outcome), measured by the share of ads that get a first reply within one hour.</i> A phone number is one way to meet it, a fast chat notification is another.</p><p>Assumptions that could be wrong: sellers agree to a public number, buyers prefer calls to chat, and the number is verified. Each affects privacy and abuse and needs an owner to confirm.</p>`
  },
  checklist: [
    `The original request is quoted unchanged.`,
    `The need is stated without a table, endpoint or screen.`,
    `Actor, situation, pain, outcome and measure are all present.`,
    `Assumptions and open questions are listed with owners.`
  ],
  artifact: `Section 1 of the functional spec: the quoted request, the problem statement, the assumptions and the open questions.`,
  agent: `The agent restates every request as a problem statement before it proposes anything, refuses to continue if the actor or measure is missing, and lists each assumption it had to make so you can confirm or reject them.`,
  src: `Course pages on this site use the same scenario-first framing (see the problem statements on the Redis and Kafka pages). The "five whys" practice is associated with Taiichi Ohno and Toyota. M. Kleppmann, Designing Data-Intensive Applications, ch. 1 (what the system is for). Numbers are invented examples.`
},
{
  title: `Functional and non-functional requirements`,
  short: `Say what the system must do and how well it must do it, with a number on every quality.`,
  why: `"Fast", "secure" and "reliable" are not requirements. An agent given adjectives picks its own numbers, and you will not know which. Functional requirements say what happens. Non-functional requirements say how well, and they are the ones that decide the architecture.`,
  concept: [
    `A <b>functional requirement</b> describes behavior: "A seller can mark an ad as sold, and it disappears from search." A <b>non-functional requirement</b> (NFR) describes a quality of that behavior: how fast, how many, how available, how private, how recoverable. Many teams also call them quality attributes.`,
    `Every NFR needs three things: a <b>metric</b>, a <b>target</b> and the <b>conditions</b> it is measured under. "Search returns in under 300 ms" is incomplete. "The 95th percentile of search latency is under 300 ms, measured at the server, at 200 requests per second with 5 million ads" can be tested.`,
    `Common NFR families: <b>performance</b> (latency percentiles, throughput), <b>availability</b> (the share of time the service works), <b>durability</b> (committed data is not lost), <b>consistency</b> (how fresh and agreed the data must be), <b>security and privacy</b>, <b>capacity</b> (growth over the next year), <b>operability</b> (logs, metrics, deploys) and <b>cost</b>.`,
    `<b>NFRs conflict.</b> Stronger consistency costs latency, more availability costs money, tighter privacy limits analytics. A good spec states the priority when two collide, for example "availability of browsing wins over freshness of view counts".`,
    `A target is a decision, so it needs an owner and a reason. "99.99 percent availability" allows about 53 minutes of downtime per year, and "99.9 percent" allows about 8.8 hours. Ask whether the product really needs the extra nine, because each one is expensive.`
  ],
  terms: [
    [`Functional requirement`, `Something the system must do, stated as observable behavior.`],
    [`Non-functional requirement`, `A measurable quality of that behavior: speed, volume, availability, privacy.`],
    [`Percentile`, `p95 is the latency that 95 percent of requests are faster than.`],
    [`Availability`, `The share of time the service answers correctly, for example 99.9 percent.`],
    [`Durability`, `The promise that data once confirmed is not lost.`]
  ],
  example: {
    setup: `The "saved ads" feature from the first lesson. A draft spec says: "Buyers can save ads. It must be fast and reliable." Rewrite it so that each line can be tested. (All numbers are invented.)`,
    body: [
      `Functional: FR-1 a signed-in buyer can save an ad. FR-2 saving the same ad twice has no extra effect. FR-3 the buyer can list saved ads, newest saved first. FR-4 a saved ad that was deleted by the seller shows as "no longer available" and can be removed. These describe behavior and each has an obvious test.`,
      `Non-functional: NFR-1 listing 50 saved ads responds in under 250 ms at p95 under 100 requests per second. NFR-2 a save that was confirmed to the buyer survives a database failover (durability). NFR-3 the saved list may be at most 5 seconds behind a save made on another device (consistency). NFR-4 the feature must stay up when the recommendation service is down (degraded mode). Each has a metric, a target and a condition.`
    ],
    table: {
      head: [`Vague line`, `Testable requirement`, `Why it matters to design`],
      rows: [
        [`"Fast"`, `p95 under 250 ms for 50 items at 100 requests per second`, `Decides whether an index or a cache is needed`],
        [`"Reliable"`, `Confirmed saves survive failover`, `Forces synchronous replication or a durable write before the reply`],
        [`"Up to date"`, `At most 5 s behind across devices`, `Allows a replica to serve the list`],
        [`"Secure"`, `A buyer can read only their own saved list`, `Needs an owner check on every read`]
      ]
    }
  },
  technique: [
    { t: `Write functional requirements as observable behavior`, x: `One sentence each, actor first, with a verb. Give each an id such as FR-1.` },
    { t: `Walk the NFR families`, x: `Performance, availability, durability, consistency, security, capacity, operability, cost. Write a line or "not needed" for each.` },
    { t: `Give each NFR a metric, a target and conditions`, x: `Percentile or rate, the number, the load and data volume it holds under.` },
    { t: `Rank the NFRs`, x: `When two collide, which wins? Write the order down once.` },
    { t: `Attach an owner and a reason to each target`, x: `A target nobody can justify is a candidate for relaxing.` }
  ],
  mistakes: [
    { t: `Adjectives instead of numbers`, ctx: `"The API should scale and be highly available." The agent picks its own definition, and the review turns into an argument about words.`, fix: `Reject any quality word that has no metric, target and condition.` },
    { t: `Averages as targets`, ctx: `"Average latency under 200 ms" hides a tail of multi-second requests.`, fix: `State p95 or p99, plus the load it was measured under.` },
    { t: `Every NFR at maximum`, ctx: `The spec asks for 99.99 percent availability, strong consistency and a 50 ms p99 for a feature that is a wish list.`, fix: `Rank them. State what is traded away, and who agreed.` }
  ],
  review: [
    `Is each functional requirement one testable behavior with an id?`,
    `Does every quality have a metric, a target and the conditions it is measured under?`,
    `Which two NFRs conflict, and which one wins? Is it written?`,
    `Who owns each target, and what is the reason for this number and not a looser one?`,
    `Red flag: the words "fast", "scalable", "secure" or "highly available" with no number next to them.`
  ],
  exercise: {
    prompt: `Rewrite "Chat must be real time and never lose a message" as two or three testable requirements. Name one conflict between them.`,
    answer: `<p>Example: NFR-1 a message sent by one member is shown to the other, if online, within 2 seconds at p95 (latency). NFR-2 once the sender sees "sent", the message is stored on at least two nodes (durability). NFR-3 messages in a conversation are displayed in the order the server received them (ordering). All numbers are invented and need a human owner.</p><p>Conflict: waiting for two nodes to store the message (NFR-2) adds latency to NFR-1, and strict ordering across servers needs coordination. The spec should say which wins, for instance "durability wins over the 2 second target".</p>`
  },
  checklist: [
    `Functional requirements are behaviors with ids.`,
    `Every NFR has a metric, a target and conditions.`,
    `I considered all eight families and wrote "not needed" where it applies.`,
    `NFR conflicts are ranked and the ranking is recorded.`
  ],
  artifact: `Section 2 of the spec: numbered functional requirements and a table of non-functional requirements (metric, target, conditions, owner, priority).`,
  agent: `The agent turns every vague quality word into a metric with a proposed target, marks the targets it had to guess as assumptions to confirm, and flags the pairs of requirements that conflict.`,
  src: `ISO/IEC 25010 (software product quality model) for the quality-attribute families. Google, Site Reliability Engineering, 2016 (service level objectives and percentiles). M. Kleppmann, Designing Data-Intensive Applications, ch. 1 (reliability, scalability, maintainability, and describing load and performance). Availability arithmetic: 99.9 percent of a 365 day year is about 8.8 hours. All targets in the example are invented.`
},
{
  title: `Acceptance criteria you can test`,
  short: `Write each requirement as examples that a test or a person can pass or fail, including the cases people forget.`,
  why: `A requirement without a way to check it is an opinion. Acceptance criteria are the bridge between the spec and the tests. They are also where an agent's misunderstanding shows up first, because a concrete example is much harder to misread than a paragraph.`,
  concept: [
    `<b>Acceptance criteria</b> are the conditions a piece of work must meet to be accepted. The most useful form is <b>specification by example</b>: a concrete case with a starting state, an action and an expected result. The common template is Given, When, Then, which came from behavior-driven development.`,
    `Each criterion should be <b>specific</b> (names real values), <b>observable</b> (you can see the result from outside), and <b>independent</b> (it can pass or fail alone). "The system handles errors well" fails all three. "Given an ad that does not exist, when a buyer saves it, then the reply is 404 and nothing is stored" passes.`,
    `Cover four kinds of case for each requirement: the <b>happy path</b>, the <b>boundaries</b> (zero, one, the maximum, one over), the <b>invalid input</b> (wrong type, missing, too long) and the <b>state conflicts</b> (twice, at the same time, after deletion, without permission). Most bugs live in the last three, and an agent's own tests often skip them.`,
    `Link every criterion to a requirement id, and every requirement to at least one criterion. A requirement with no criterion is untestable. A criterion with no requirement is either a missing requirement or scope creep.`
  ],
  terms: [
    [`Acceptance criterion`, `A pass or fail condition that a piece of work must satisfy.`],
    [`Given, When, Then`, `A template: the starting state, the action, the expected observable result.`],
    [`Boundary case`, `A value at the edge of what is allowed, such as 0, 1, the limit and limit plus one.`],
    [`Traceability`, `Each requirement links to the criteria that check it, and back.`]
  ],
  example: {
    setup: `Requirement FR-1 from the saved ads feature: "A signed-in buyer can save an ad." FR-2: "Saving the same ad twice has no extra effect." Write criteria for both. Assume a limit of 200 saved ads per buyer (invented).`,
    body: [
      `Happy path: Given a signed-in buyer and an active ad, when the buyer saves it, then the reply is 201 and the ad is in their saved list. Idempotency (FR-2): given the buyer already saved the ad, when they save it again, then the reply is 200 or 204 (the team chooses) and the list still has one entry.`,
      `Boundaries and conflicts: given the buyer has 200 saved ads, when they save a 201st, then the reply is 409 or 422 with a message that says the limit is 200 (the status code is a decision to record). Given an ad deleted a moment ago, when a buyer saves it, then 404 and nothing is stored. Given no session, then 401. Given two requests to save the same ad at the same instant, then exactly one row exists. That last case is exactly what a unique constraint guarantees and an application check does not.`
    ],
    table: {
      head: [`Kind`, `Criterion (short)`, `Expected result`],
      rows: [
        [`Happy path`, `Save an active ad`, `201, appears in the list`],
        [`Boundary`, `Save the 201st ad`, `Rejected, the limit is stated`],
        [`Invalid input`, `Ad id is not a number`, `400, nothing stored`],
        [`State conflict`, `Same ad saved twice, at once`, `One row only`],
        [`Authorization`, `Buyer reads another buyer's list`, `403 or 404, no data returned`]
      ]
    }
  },
  technique: [
    { t: `Write one happy-path example per requirement`, x: `Concrete values, a starting state, an action and a visible result.` },
    { t: `Add the boundary values`, x: `Zero, one, the maximum and one over, for every limit in the requirement.` },
    { t: `Add invalid input cases`, x: `Missing, wrong type, too long, malformed. State the expected error and that nothing is stored.` },
    { t: `Add state conflicts and permission cases`, x: `Twice, concurrently, after deletion, someone else's data, no login.` },
    { t: `Trace criteria to requirements`, x: `A matrix of requirement ids against criteria ids. Look for empty rows and columns.` }
  ],
  mistakes: [
    { t: `Criteria that restate the requirement`, ctx: `"The buyer can save an ad successfully." There is no starting state, no value and no visible result.`, fix: `Name the state, the input and the exact observable output, including status code or screen text.` },
    { t: `Only the happy path`, ctx: `All five criteria describe success. Double submit, deleted ad and limit are never specified, so the code does something arbitrary.`, fix: `For each requirement add at least one boundary, one invalid input and one conflict case.` },
    { t: `Criteria that describe the implementation`, ctx: `"A row is inserted into saved_ad with a UNIQUE index." That is a design, and a different correct design would fail the criterion.`, fix: `Describe what a user or caller can observe, and leave the mechanism to the design.` }
  ],
  review: [
    `Does every requirement id have at least one criterion, and every criterion a requirement id?`,
    `Are boundary, invalid input, conflict and permission cases present, not only the happy path?`,
    `Could two engineers read a criterion and write the same test? If not, which value is missing?`,
    `Are the error codes and messages stated, and are those choices recorded as decisions?`,
    `Red flag: criteria written after the code, copied from the implementation, so they cannot fail.`
  ],
  exercise: {
    prompt: `Requirement: "A seller can mark an ad as sold, and it disappears from search." Write five criteria, one of each kind: happy path, invalid input, state conflict, permission and a timing criterion.`,
    answer: `<p>Happy path: given an active ad owned by the seller, when the seller marks it sold, then its status is "sold" and a search for its title no longer returns it. Invalid input: given a request with a status value that does not exist, then 400 and the ad is unchanged. State conflict: given an ad already sold, marking it sold again leaves it sold and does not fail (or returns a stated error). Permission: given a different member, when they mark the ad sold, then 403 (or 404 to avoid revealing existence) and the ad is unchanged. Timing: the ad is absent from search within 60 seconds of the change (invented number), which exposes whether search is indexed asynchronously.</p><p>Note how the timing criterion forces a decision the requirement hid.</p>`
  },
  checklist: [
    `Every requirement has criteria in Given, When, Then form or an equivalent.`,
    `Boundaries, invalid input, conflicts and permissions are covered.`,
    `Criteria describe what is observable, not how it is built.`,
    `A traceability table shows no empty rows or columns.`
  ],
  artifact: `Section 3 of the spec: acceptance criteria per requirement, with a traceability table.`,
  agent: `The agent drafts criteria for each requirement in Given, When, Then form, adds boundary, invalid and conflict cases, and keeps the traceability table. It writes the tests from your approved criteria, not the other way round.`,
  src: `D. North, Introducing BDD, 2006 (the Given, When, Then form). G. Adzic, Specification by Example, Manning 2011. RFC 9110 (HTTP semantics) for status code meanings: 201, 400, 401, 403, 404, 409, 422. OWASP API Security Top 10 (2023), API1 Broken Object Level Authorization. Limits and times are invented examples.`
},
{
  title: `Glossary, scope and out-of-scope`,
  short: `Fix the meaning of every domain word and say clearly what the work will not do.`,
  why: `Most spec disputes are about words and boundaries. If "ad" means a listing to one person and a paid promotion to another, the model will be wrong however well it is built. If the spec does not say what is excluded, every adjacent idea becomes a surprise or a delay.`,
  concept: [
    `A <b>glossary</b> defines each domain term once, in plain words, and the whole team uses it in the spec, in code and in table names. This is the shared vocabulary that domain-driven design calls the <b>ubiquitous language</b>. If the code says <code>listing</code> while the spec says <code>ad</code>, you have two concepts or one confusion.`,
    `For each term record: the <b>definition</b>, the <b>synonyms to avoid</b>, and the <b>states</b> it can be in. "Ad: a listing created by a member. States: draft, pending review, active, sold, expired, removed." The state list is what feeds the data model and the status field.`,
    `Mine the spec for <b>nouns and verbs</b>. Nouns are candidate entities (member, ad, category, ad_image, saved_ad, conversation, message). Verbs are candidate operations and state changes (post, save, report, mark sold). This is the handoff to the data modeling module.`,
    `<b>Scope</b> says what is in. <b>Out of scope</b> says what is deliberately not done now, with a reason, such as "payments in chat: not in this release, needs a compliance review". A good out-of-scope list is a list of things somebody might reasonably expect. Add a short <b>future</b> note where today's design must not block a later feature.`,
    `Keep an <b>open questions</b> list with an owner and a due date, and do not let the design pass a blocking question silently. An open question that the agent answered with a guess belongs in the assumptions list from the first lesson.`
  ],
  terms: [
    [`Glossary`, `The list of domain terms with one agreed meaning each.`],
    [`Ubiquitous language`, `The same words in the spec, the code and the database (Evans, 2003).`],
    [`Out of scope`, `What the work will not do, with a reason.`],
    [`Open question`, `A gap in knowledge with an owner and a date.`]
  ],
  example: {
    setup: `Reading the saved ads and chat requirements, the nouns that appear are: user, member, buyer, seller, ad, listing, post, favorite, saved ad, conversation, thread, message. Reduce them to a glossary.`,
    body: [
      `Several words name one thing: <i>user</i> and <i>member</i> (choose <b>member</b>), <i>ad</i>, <i>listing</i> and <i>post</i> (choose <b>ad</b>, and keep "post" as the verb), <i>favorite</i> and <i>saved ad</i> (choose <b>saved ad</b>), <i>conversation</i> and <i>thread</i> (choose <b>conversation</b>). <i>Buyer</i> and <i>seller</i> are not entities but roles a member plays relative to an ad.`,
      `Out of scope for this release (decisions to confirm, invented for the example): payments and escrow, price alerts on saved ads, sharing a saved list with other people, and moderation tooling beyond the existing report form. Each has a reason. Price alerts are out because they need a notification design, but the saved ad table must record the price the buyer saw, so the feature can be added later.`
    ],
    table: {
      head: [`Term`, `Definition`, `Avoid`, `States or notes`],
      rows: [
        [`member`, `A registered person who can post, save and chat`, `user, account`, `active, suspended, deleted`],
        [`ad`, `A listing a member posts in one category`, `listing, post (as a noun)`, `draft, pending, active, sold, expired, removed`],
        [`saved ad`, `A member's bookmark of an ad`, `favorite`, `exists or not. Remembers the date saved`],
        [`conversation`, `A private exchange between two members about one ad`, `thread, chat room`, `open, archived`]
      ]
    }
  },
  technique: [
    { t: `Collect the nouns and verbs`, x: `Highlight them in the request and in every example. Do not filter yet.` },
    { t: `Merge synonyms and choose one name`, x: `Pick the word the business already uses, and list the others under "avoid".` },
    { t: `Define each term and its states`, x: `One sentence, plus the lifecycle states. Check that each state has a way in and a way out.` },
    { t: `Write the out-of-scope list with reasons`, x: `Include what a reader would reasonably expect. Add what the design must not block.` },
    { t: `Keep open questions visible`, x: `Each has an owner and a date. Mark which ones block the design.` }
  ],
  mistakes: [
    { t: `Two words, one idea (or one word, two ideas)`, ctx: `"Ad" means a listing in the product docs and a paid promotion in the sales docs, so a report counts both.`, fix: `Settle one meaning per word and rename the other concept. Use the glossary in code review.` },
    { t: `No out-of-scope list`, ctx: `The agent adds price alerts and a shared list because they seem related. The release grows by a week.`, fix: `List the exclusions. Treat an addition outside the spec as a change request, not a bonus.` },
    { t: `Roles modeled as entities`, ctx: `Buyer and seller become two tables, and a member who does both needs two rows.`, fix: `A role is a relationship to a thing. One member table, and the role follows from who owns the ad.` }
  ],
  review: [
    `Is there a glossary, and do the table and field names in the design match it exactly?`,
    `Does any word have two meanings, or two words one meaning, anywhere in the spec?`,
    `Does the out-of-scope list include what a reader would expect, each with a reason?`,
    `Which open questions block the design, and who owns them?`,
    `Red flag: a feature in the diff that appears nowhere in the requirements.`
  ],
  exercise: {
    prompt: `A report feature says: "Members can flag bad ads, and moderators review flags." List the terms for the glossary, the states of a report, and three out-of-scope items you would propose.`,
    answer: `<p>Terms: report (a member's complaint about one ad or message, avoid "flag" once you pick one), reporter (a role, not a table), moderator (a member with a role), decision (the moderator's outcome). States of a report: open, under review, resolved (with outcomes such as upheld and dismissed). Check each state has a transition in and out.</p><p>Out of scope, to confirm: appeals against a decision, automatic detection of bad ads, and rewarding reporters. Reasons would be cost and policy. Note a future need: keep the decision history so appeals can be added.</p>`
  },
  checklist: [
    `Every domain noun is in the glossary with one name and one definition.`,
    `States are listed for each lifecycle-bearing term.`,
    `Out-of-scope items each have a reason, and future needs are noted.`,
    `Names in the design match the glossary.`
  ],
  artifact: `Section 4 of the spec: glossary, entity and operation candidates, scope, out-of-scope with reasons and open questions.`,
  agent: `The agent builds the glossary from your request, flags synonyms and double meanings, proposes the entity list for the data model, and refuses to add behavior that is not in scope without raising a change request.`,
  src: `E. Evans, Domain-Driven Design, Addison-Wesley 2003 (ubiquitous language). Course on this site: the data modeling module of this skill set, lesson on finding entities. Out-of-scope items are invented examples.`
},
{
  title: `Reviewing an agent-written spec`,
  short: `A short protocol and a list of red flags for a spec that reads well but may hold invented facts, hidden choices and missing cases.`,
  why: `An agent writes a clean spec in seconds, in confident language, and fills any gap with something plausible. That is the risk. A spec feeds every later step, so one invented requirement becomes a table, an endpoint, a test and a release. Review it as the cheapest place to catch a mistake.`,
  concept: [
    `Run the spec through four checks. <b>Source</b>: can every requirement be traced to the request, an owner's answer or a labelled assumption? <b>Testability</b>: does each requirement have a criterion that can fail? <b>Completeness</b>: are boundaries, errors, permissions and the unhappy states present? <b>Consistency</b>: do the glossary, the requirements and the criteria agree with each other?`,
    `Know the agent's habits. It <b>fills gaps with plausible content</b> and presents it as fact. It <b>writes to the average case</b> and omits rare, important ones. It <b>solves a bigger problem than asked</b> and adds features. It <b>uses vague words</b> because they are always safe. It <b>copies a template</b> from a similar domain, so a marketplace spec can come back full of e-commerce checkout assumptions.`,
    `A <b>requirement smell</b> is a word that signals a hidden decision: "appropriate", "as needed", "fast", "user-friendly", "etc.", "and so on", "should" (versus "must"), "usually", "support" and any passive sentence with no actor ("the ad is removed"). Search the spec for them as you would search code for leftover unfinished-work markers.`,
    `Review is a <b>conversation with evidence</b>. For each finding, send back a question rather than a rewrite: "Which request line asks for rate limiting?" The answer is either a source you had missed or a requirement to delete. Record the outcome, so the spec carries a change history of what was added and why.`
  ],
  terms: [
    [`Traceability`, `Every requirement links back to a source and forward to criteria.`],
    [`Requirement smell`, `A word or pattern that usually hides an undecided question.`],
    [`Gold plating`, `Adding features nobody asked for.`],
    [`Change request`, `A recorded, approved addition to scope.`]
  ],
  example: {
    setup: `The agent returns this fragment for the chat feature. Review it with the four checks.`,
    body: [
      `<pre>FR-1  Members can send messages to each other.
FR-2  Messages are delivered quickly and reliably.
FR-3  The system should support attachments as appropriate.
FR-4  Messages are retained for 7 years for compliance.
FR-5  Members can pay each other securely in chat.</pre>`,
      `Source: FR-4 and FR-5 appear nowhere in the request. A 7 year retention is a legal claim the agent cannot know, and payments are out of scope. Testability: FR-2 has no metric, FR-3 has two smell words. Completeness: no blocking, no report, no limit on message size, and no mention that only the two members of a conversation may read it. Consistency: "members send messages to each other" conflicts with the glossary, which says a conversation is about one ad.`
    ],
    table: {
      head: [`Line`, `Finding`, `Question sent back`],
      rows: [
        [`FR-2`, `No metric`, `What delivery time at which percentile, and what durability?`],
        [`FR-3`, `Vague words`, `Which file types, which size, stored where?`],
        [`FR-4`, `Invented fact`, `Who set 7 years and where is the source? Privacy law may demand deletion.`],
        [`FR-5`, `Out of scope`, `Which request line asks for payments?`],
        [`Missing`, `Permission and abuse cases`, `Who can read a conversation, and how can a member block another?`]
      ]
    }
  },
  technique: [
    { t: `Trace every requirement to a source`, x: `Request line, owner answer or labelled assumption. Mark anything else as invented.` },
    { t: `Search for smell words`, x: `Appropriate, as needed, fast, etc., should, usually, and passive sentences with no actor.` },
    { t: `Check completeness with the four case kinds`, x: `For each requirement ask for boundary, invalid input, conflict and permission criteria.` },
    { t: `Compare the glossary, requirements and criteria`, x: `Names and states must match. Check that each state in the glossary appears in a requirement.` },
    { t: `Send findings back as questions`, x: `Ask for the source or the removal. Record the answer and update the change history.` }
  ],
  mistakes: [
    { t: `Reading for style`, ctx: `The spec is well written, so it is approved. Nobody notices that retention and payments were invented.`, fix: `Trace requirements to sources first and read for prose last.` },
    { t: `Letting the agent resolve open questions`, ctx: `The spec says "assumed: guests may chat" with no owner. The assumption silently becomes a security decision.`, fix: `Anything that changes who can do what is a decision for a person. Route it to the owner.` },
    { t: `Approving without a test of the spec`, ctx: `The criteria are never checked for an example that would fail. They describe the code that has not been written yet and cannot be wrong.`, fix: `Pick two requirements and ask what concrete input would violate each. If no example exists, the line is too vague.` }
  ],
  review: [
    `Can I point to the source of each requirement: the request, an owner or a labelled assumption?`,
    `Which lines contain smell words, and what decision does each one hide?`,
    `Which requirement did the agent add that nobody asked for, and was it raised as a change request?`,
    `Do the glossary, the requirements and the criteria use the same names and states?`,
    `Red flag: precise legal, regulatory or numeric claims in a spec with no named source.`
  ],
  exercise: {
    prompt: `The agent's spec for reports says: "Moderators should review reports promptly. Repeat offenders are banned automatically. The system supports multiple languages." Review these three lines.`,
    answer: `<p>Line 1: "should" and "promptly" are smell words. Ask: within how long, at which percentile, and what happens to unreviewed reports (escalation)? Line 2: an automatic ban is a high-impact decision, not in the request. Ask for the source, the definition of repeat offender, an appeal path and who approves it, or move it out of scope. Line 3: "supports multiple languages" is vague. Ask which languages, whether it means the interface, the report text or the moderator tools, and whether translation is in scope.</p><p>Outcome: one line needs a metric, one is a change request that needs a human decision, one needs scoping or deletion. None is ready.</p>`
  },
  checklist: [
    `Every requirement has a source or a labelled assumption.`,
    `Smell words are replaced by numbers or decisions.`,
    `Boundary, invalid, conflict and permission cases exist for each requirement.`,
    `Glossary, requirements and criteria agree.`,
    `Added features were raised as change requests and decided by a person.`
  ],
  artifact: `A spec review record: findings per check (source, testability, completeness, consistency), the questions sent back and the answers, plus the change history.`,
  agent: `The agent labels each requirement with its source, lists its own assumptions and smell words before you review, and keeps a change history. You review the spec and that record, and approve the spec as the input to design.`,
  src: `IEEE 830-1998 and ISO/IEC/IEEE 29148 (qualities of a good requirement: unambiguous, verifiable, traceable). The smell-word idea is common in requirements engineering practice. The Mindset module of this course, lesson five (the five lenses). The example spec is invented.`
}
];
