/* API and request lifecycle: six lessons. Same running scenario (a classifieds marketplace). All numbers are invented examples.
 * Topic list informed by the chapters of DsThakurRawat/Backend-from-first-Principle on HTTP, routing, REST, serialization,
 * validation, layers and OpenAPI (headings only), re-expressed as reviewer habits. Facts cited to the sources named per lesson. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['api'] = [
{
  title: `HTTP, status codes, caching and CORS`,
  short: `Use the protocol's own vocabulary correctly, so clients, caches and browsers behave without custom rules.`,
  why: `Every API is spoken over HTTP, and HTTP already defines what a method promises, what a status code means and what a cache may do. An agent often returns 200 for everything, or caches the wrong thing. A reviewer who knows the vocabulary can spot these quickly, because the mistakes show in the first response.`,
  concept: [
    `A <b>method</b> carries a promise. <code>GET</code> is <b>safe</b> (it does not change state) and <b>idempotent</b> (repeating it has the same effect as once). <code>PUT</code> and <code>DELETE</code> are idempotent but not safe. <code>POST</code> is neither, so a retried POST can create two ads. These definitions are in RFC 9110 (HTTP Semantics).`,
    `A <b>status code</b> tells the client what to do next. 2xx means success (200 OK, 201 Created with a <code>Location</code> header, 204 No Content). 3xx redirects. 4xx means the client is at fault (400 malformed, 401 not authenticated, 403 not allowed, 404 not found, 409 conflict, 422 semantically invalid, 429 too many requests). 5xx means the server is at fault. Clients retry 5xx and do not retry most 4xx, so a wrong code changes behavior.`,
    `<b>Caching</b> is controlled by headers. <code>Cache-Control: max-age=60</code> lets a cache reuse a response for 60 seconds. <code>private</code> means only the user's own browser may store it, <code>no-store</code> means nobody may. An <code>ETag</code> is a version tag: the client sends <code>If-None-Match</code> and the server may answer 304 Not Modified with no body. RFC 9111 defines HTTP caching.`,
    `<b>CORS</b> (cross-origin resource sharing) is a browser rule, not a server defense. A page on one origin may call your API on another origin only if the API's response says so through <code>Access-Control-Allow-Origin</code>. For some requests the browser first sends a <b>preflight</b> <code>OPTIONS</code> request. Curl and other servers ignore CORS entirely, so it never replaces authentication.`
  ],
  terms: [
    [`Safe method`, `A method that does not change server state (GET, HEAD).`],
    [`Idempotent`, `Repeating the request has the same effect as sending it once.`],
    [`Validator`, `A version marker such as ETag that lets a client ask "has it changed?".`],
    [`Preflight`, `The OPTIONS request a browser sends before a cross-origin request that is not simple.`]
  ],
  example: {
    setup: `The web app on <code>www.market.example</code> calls the API on <code>api.market.example</code> to show an ad. The agent's first version returns <code>200</code> with <code>{"error": "not found"}</code> for a missing ad and sets <code>Access-Control-Allow-Origin: *</code> together with cookie sessions.`,
    body: [
      `Three problems. A missing ad should be <code>404</code>, otherwise monitoring counts it as success and clients cannot tell it from a hit. The wildcard origin cannot be combined with credentials by browsers, and "allow everyone" was chosen to make an error go away, which is a smell. And the ad detail response has no caching rule, so each view reaches the database.`,
      `A better response: <code>200</code>, <code>Cache-Control: public, max-age=30</code> for anonymous viewers, an <code>ETag</code>, and an allow-list of exactly the two origins the product uses. Thirty seconds of staleness is a decision the product owner must accept, since a seller who edits a price will see the old one elsewhere for that long.`
    ],
    table: {
      head: [`Situation`, `Right response`, `Common wrong answer`],
      rows: [
        [`Ad id does not exist`, `404 with an error body`, `200 with an error field`],
        [`Create ad succeeded`, `201 and a Location header`, `200 with no pointer to the new resource`],
        [`Duplicate saved ad`, `409 or an idempotent 200`, `500 from a database exception`],
        [`Seller edits another seller's ad`, `403 (or 404 to hide existence)`, `200, or 401`],
        [`Too many requests`, `429 with Retry-After`, `503`]
      ]
    }
  },
  technique: [
    { t: `Write down each endpoint's method promise`, x: `Is it safe, idempotent, or neither? If the answer does not match the method, change the method or the design.` },
    { t: `Map outcomes to status codes`, x: `For each endpoint list success, client error and server error cases with the exact code. Never put an error inside a 200.` },
    { t: `Decide the caching rule per response`, x: `Public, private or no-store, and for how long. Add an ETag where recomputing the body is expensive and the data changes rarely.` },
    { t: `Treat CORS as an allow-list`, x: `List the origins, methods and headers the product really needs. Never reflect the request origin back without checking it.` },
    { t: `Test the headers, not only the body`, x: `Assert the status and the key headers in an integration test so a refactor cannot drop them.` }
  ],
  mistakes: [
    { t: `200 for every outcome`, ctx: `The handler wraps everything in a try block and returns 200 with a message. Dashboards show 100 percent success while users see failures.`, fix: `Use the real code and let an error handler map exceptions to codes in one place.` },
    { t: `Caching a personalized response publicly`, ctx: `A "my saved ads" endpoint gets <code>Cache-Control: public</code> from a shared middleware. A shared cache then serves one member's list to another.`, fix: `Personalized responses are <code>private</code> or <code>no-store</code>. Vary or key the cache by identity only when you mean to.` },
    { t: `Using CORS as security`, ctx: `The team says "the API is protected because only our site is allowed". Anyone can call it from a script.`, fix: `Authenticate and authorize on the server. CORS only limits what browsers let other web pages read.` }
  ],
  review: [
    `For each endpoint, which method and why? Is a POST that is retried by a client safe?`,
    `Show the table of outcomes and status codes. Where does a validation failure, a missing record and a forbidden record go?`,
    `Which responses are cacheable, for whom and for how long? Who approved that staleness?`,
    `What are the CORS allow-list entries, and why is each needed?`,
    `Red flag: a 200 response with an error in the body, or a wildcard origin used to "fix" a browser error.`
  ],
  exercise: {
    prompt: `The agent adds <code>GET /ads/{id}/view</code> that increments a view counter and returns the ad. A browser prefetch and a crawler call it. What is wrong and what would you do?`,
    answer: `<p>A GET must be safe. Incrementing a counter changes state, so prefetching, crawlers and caches will inflate or skip counts, and a cache may answer without the counter ever moving.</p><p>Make the ad read a plain cacheable GET. Record the view separately, for example a <code>POST /ads/{id}/views</code> sent by the page (or an event from the server log), and accept that the count is approximate. Ask what the counter is for before deciding how accurate it must be.</p>`
  },
  checklist: [
    `Each endpoint's method matches its safety and idempotency.`,
    `Every outcome has a specific status code and none hides in a 200.`,
    `Each response has a stated caching rule, private where it is personal.`,
    `CORS is an allow-list with a reason for every entry.`
  ],
  artifact: `Section 1 of the API contract: a table of endpoint, method, status codes, caching rule and CORS policy.`,
  agent: `The agent produces the endpoint table with an outcome-to-status mapping, sets cache headers deliberately, and refuses to use a wildcard CORS origin with credentials. It marks any caching staleness for your approval.`,
  src: `RFC 9110 HTTP Semantics (methods, status codes, safe and idempotent). RFC 9111 HTTP Caching (Cache-Control, validators). RFC 6585 (status 429). WHATWG Fetch Standard, CORS protocol section. Backend from First Principles, chapter 2 (HTTP) was chapter topic only, text not read.`
},
{
  title: `Routing and the request lifecycle`,
  short: `Follow one request from the socket to the response, and know where each rule belongs.`,
  why: `When a request misbehaves, the cause lives at one stage of its journey. If you can name the stages and their order, you can ask where a check was put and see when it is in the wrong place, for example authorization that runs after the data was already fetched.`,
  concept: [
    `A request passes through <b>stages</b> in order: the connection is accepted, the request line and headers are parsed, a <b>router</b> matches the method and path to a handler, <b>middleware</b> runs (logging, authentication, rate limit), the body is parsed and validated, the handler calls business logic, and the result is serialized into a response.`,
    `<b>Routing</b> maps a method and a path pattern such as <code>GET /ads/{id}</code> to code. Be careful with ordering and ambiguity: <code>/ads/search</code> must not be captured by <code>/ads/{id}</code>. Route by resource and keep verbs out of paths where a method already says it.`,
    `<b>Middleware</b> is code that wraps the handler and can stop the request early. Order matters: request id and logging first, then rate limiting, then authentication, then authorization, then validation, then the handler. A check placed after the work it should guard protects nothing.`,
    `<b>Context</b> is the per-request bag of values (request id, the authenticated member, a deadline). Pass it down explicitly. A <b>deadline</b> set at the edge lets every later call give up in time, which connects to the timeouts in the Mindset module.`
  ],
  terms: [
    [`Router`, `Matches method and path to a handler and extracts path parameters.`],
    [`Middleware`, `Code that runs before or after the handler and may end the request early.`],
    [`Request context`, `Per-request values such as the request id, caller identity and deadline.`],
    [`Path parameter`, `A variable part of the path, like the ad id in /ads/{id}.`]
  ],
  example: {
    setup: `The agent adds <code>PATCH /ads/{id}</code> to edit an ad. It registers the route, then a "rate limit" middleware, then the handler. Authentication is checked inside the handler "when needed".`,
    body: [
      `Trace the request. The rate limiter runs before authentication, so it can only count by IP address, and a seller behind a shared network is limited with strangers. Authentication inside the handler means a new handler that forgets it is open by default. The safer shape is a pipeline where authentication is the default for a route group and public routes are the explicit exception.`,
      `Also trace failure. If the body is invalid JSON, which stage answers and with what code? If the handler panics, who turns it into a 500 with a request id, and does the response avoid leaking a stack trace?`
    ],
    table: {
      head: [`Stage`, `Responsibility`, `Wrong place example`],
      rows: [
        [`Request id and log`, `Tag every line of this request`, `Generated inside the handler, so earlier failures have no id`],
        [`Rate limit`, `Cheap rejection of abusive traffic`, `After a database read`],
        [`Authentication`, `Who is the caller?`, `In each handler, by hand`],
        [`Authorization`, `May this caller do this to this object?`, `In the UI only`],
        [`Validation`, `Is the input well formed?`, `Deep in the repository`],
        [`Error handler`, `Map errors to codes and one error shape`, `A try block in every handler`]
      ]
    }
  },
  technique: [
    { t: `Draw the pipeline for one route`, x: `List each stage in order, with the response each can end it with. Ask which stage is missing.` },
    { t: `Make protection the default`, x: `Apply authentication to a whole route group, and mark public routes explicitly so a forgotten check fails closed.` },
    { t: `Order middleware by cost and purpose`, x: `Cheap rejections first, identity before limits that depend on it, validation before business logic.` },
    { t: `Check route ambiguity`, x: `List static routes beside parameter routes and confirm which one wins.` },
    { t: `Set a request deadline and an id at the edge`, x: `Pass both through the context to every outbound call and every log line.` },
    { t: `Centralize errors`, x: `One error handler converts known errors to codes and unknown ones to a generic 500 with the request id.` }
  ],
  mistakes: [
    { t: `Authentication per handler`, ctx: `Each handler calls an auth helper. A new <code>/admin/export</code> handler is added and the call is forgotten.`, fix: `Attach authentication at the route group. Test that every route without an explicit public marker returns 401 when unauthenticated.` },
    { t: `Work before the guard`, ctx: `The handler loads the ad, then checks the caller. The read happens even for a rejected caller and timing reveals existence.`, fix: `Run the guard first, or fetch with the ownership condition in the query.` },
    { t: `A different error shape per handler`, ctx: `Some handlers return plain text, others JSON with different field names.`, fix: `One error model, produced by one handler. See the lesson on resources, errors and pagination.` }
  ],
  review: [
    `Draw the pipeline for this route. Where does authentication run, and what happens to a route added without it?`,
    `Which middleware order was chosen, and why is rate limiting before or after authentication?`,
    `What does the client receive for malformed JSON, an unknown route and an unexpected exception?`,
    `Is the request id in the response and in every log line?`,
    `Red flag: access control or validation done inside individual handlers by hand, with no test that proves every route is covered.`
  ],
  exercise: {
    prompt: `List the stages a <code>POST /ads/{id}/images</code> upload should pass, and say which one decides a 413 (payload too large) and which a 403.`,
    answer: `<p>Order: request id and logging, rate limit, authentication, authorization (is the caller the owner of ad {id}?), size and type check, handler (store the file, insert the <code>ad_image</code> row), error handler.</p><p>413 is decided as early as possible, ideally by the server or proxy from <code>Content-Length</code> and a streaming limit, before the body is read in full. 403 is decided by authorization once the caller and the ad are known. Reading a huge body before checking either wastes memory and is an attack surface.</p>`
  },
  checklist: [
    `I can name the stages of a request and the order they run.`,
    `Authentication is the default for a route group and public routes are explicit.`,
    `Guards run before the work they protect.`,
    `A request id and deadline are created at the edge and propagated.`,
    `Errors are converted by one handler.`
  ],
  artifact: `Section 2 of the API contract: the request pipeline per route group, with the order of middleware and the public routes listed.`,
  agent: `The agent states the pipeline for each route group, applies authentication by default, and adds a test that walks the route table and fails if a non-public route accepts an anonymous call.`,
  src: `RFC 9110 (request and response model). OWASP API Security Top 10 (2023), API2 Broken Authentication, for why defaults matter. Backend from First Principles, chapters 3 and 4 (routing, the request lifecycle) chapter topic only, text not read. Framework documentation of your chosen stack for middleware order.`
},
{
  title: `REST resources, errors and pagination`,
  short: `Model the API around nouns, one error shape, and pagination that does not break under change.`,
  why: `A resource model is the public face of the data model, and it is hard to change once clients depend on it. Errors and lists are where agents are most inconsistent, and where clients suffer most. Getting these three right gives you a contract that other teams can build on.`,
  concept: [
    `<b>REST</b> (Roy Fielding, 2000) as used in practice means resources identified by URLs, manipulated by standard methods, with stateless requests. Name resources by nouns: <code>/ads</code>, <code>/ads/{id}</code>, <code>/members/{id}/saved-ads</code>. Use plural nouns consistently and nest only one level, since deep paths couple clients to the storage layout.`,
    `<b>One error model.</b> Every failure should look the same to a client. RFC 9457 (Problem Details for HTTP APIs) defines a JSON shape with <code>type</code>, <code>title</code>, <code>status</code>, <code>detail</code> and <code>instance</code>, and allows extra fields such as a list of field errors and a <code>request_id</code>. A stable machine-readable code matters more than the wording of the message.`,
    `<b>Pagination</b> keeps a list from being unbounded. <b>Offset pagination</b> (<code>?page=3&amp;limit=20</code>) is simple but slow for deep pages (the database still walks the skipped rows) and unstable when rows are inserted while the client pages. <b>Cursor (keyset) pagination</b> returns a token that encodes the last seen sort key, for example <code>(created_at, ad_id)</code>, and the next query asks for rows after it. It is fast and stable, but cannot jump to page 50. Always cap the page size on the server.`,
    `<b>Filtering and sorting</b> are part of the contract. Whitelist the fields a client may filter and sort by. Each one must be backed by an index from the Data modeling module, or one request can scan the whole ad table.`
  ],
  terms: [
    [`Resource`, `A thing the API exposes, named by a noun and a URL.`],
    [`Problem Details`, `The standard JSON error shape of RFC 9457.`],
    [`Offset pagination`, `Skip N rows then take M. Simple, slow when deep, unstable under inserts.`],
    [`Cursor pagination`, `Continue after the last seen sort key. Fast and stable, no random page jump.`]
  ],
  example: {
    setup: `The ad list endpoint must show newest ads first in a category. The agent builds <code>GET /ads?category=7&amp;page=40&amp;size=100000</code> with offset pagination and returns errors as plain strings.`,
    body: [
      `Two reviews. First, size is not capped, so one request can ask for the whole table. Page 40 with offset means the database reads and discards thousands of rows, and new ads shifting the list make the client see duplicates. A cursor on <code>(created_at, ad_id)</code> with a cap of 50 fixes both, and the matching index is <code>(category_id, created_at DESC, ad_id DESC)</code>.`,
      `Second, errors. Compare the weak and the good body for a failed create (invented values).`,
      `<pre>Weak:  "Invalid input"
Good:  { "type": "https://api.market.example/errors/validation",
         "title": "Validation failed", "status": 422,
         "request_id": "r-8f31",
         "errors": [ { "field": "price", "code": "must_be_positive" } ] }</pre>`
    ],
    table: {
      head: [`Concern`, `Offset`, `Cursor`],
      rows: [
        [`Deep page cost`, `Grows with the offset`, `Constant with an index`],
        [`Rows inserted while paging`, `Duplicates or gaps`, `Stable`],
        [`Jump to page N`, `Yes`, `No`],
        [`Implementation effort`, `Low`, `Medium: a stable unique sort key is required`]
      ]
    }
  },
  technique: [
    { t: `List resources as nouns`, x: `One table of resource, URL, methods. Merge verbs into methods, and keep nesting to one level.` },
    { t: `Define the error model once`, x: `Adopt Problem Details, add a stable error code and the request id, and make the global error handler the only producer.` },
    { t: `Choose a pagination style per list`, x: `Cursor for feeds and large lists, offset only for small bounded ones. Cap the size on the server.` },
    { t: `Whitelist filters and sorts`, x: `For each, name the index that supports it. Reject unknown parameters with a 400 or 422.` },
    { t: `Make the response envelope consistent`, x: `Every list returns items plus the next cursor. Never return a bare array that cannot grow a new field.` }
  ],
  mistakes: [
    { t: `Unbounded lists`, ctx: `<code>GET /conversations</code> returns every conversation a member ever had. A heavy user takes 10 seconds.`, fix: `Paginate everything that can grow, with a maximum page size enforced by the server.` },
    { t: `Sorting by a non-unique key`, ctx: `A cursor on <code>created_at</code> alone skips or repeats ads that share a timestamp.`, fix: `Add a unique tiebreaker such as the id to the sort and to the cursor.` },
    { t: `Leaking the schema in errors`, ctx: `The 500 body contains a raw database error with table and column names.`, fix: `Log the detail with the request id and return a generic message and the id.` }
  ],
  review: [
    `Show the resource table. Are the names nouns, plural and consistent?`,
    `Show one error body for each failure class. Is it the same shape every time, with a stable code?`,
    `Which lists are paginated, with what style and what maximum size? What index serves the sort?`,
    `Which query parameters are accepted, and what happens to an unknown one?`,
    `Red flag: an endpoint that returns an unbounded array, or error responses with several different shapes.`
  ],
  exercise: {
    prompt: `Design the list for <code>GET /members/{id}/saved-ads</code>. State the sort, the cursor contents, the page cap and the index.`,
    answer: `<p>Sort by when it was saved, newest first. The table is <code>saved_ad</code> with the member and the ad as a composite key and a <code>created_at</code>. Cursor contents: the last <code>(created_at, ad_id)</code>, encoded as an opaque string so clients do not build it by hand. Page cap: 50, default 20.</p><p>Index: <code>(member_id, created_at DESC, ad_id DESC)</code>. The query asks for rows after the cursor in that order. The caller must be the member, which is an authorization check (see the lesson on object-level authorization in the security module).</p>`
  },
  checklist: [
    `Resources are plural nouns, nested at most one level.`,
    `One error model with a stable code and a request id.`,
    `Every list is paginated and capped, with a unique sort key.`,
    `Filters and sorts are whitelisted and each has an index.`
  ],
  artifact: `Section 3 of the API contract: the resource table, the error model with examples, and the pagination rules per list.`,
  agent: `The agent lists resources as nouns, emits all failures as Problem Details with the request id, and chooses cursor pagination for growing lists. It names the index each filter and sort needs and checks it against the data model.`,
  src: `R. Fielding, Architectural Styles and the Design of Network-based Software Architectures, doctoral dissertation, 2000, ch. 5 (REST). RFC 9457 Problem Details for HTTP APIs. PostgreSQL manual: row-wise comparison with ROW constructors, used for keyset queries. Backend from First Principles, chapter 8 (RESTful design, pagination) chapter topic only, text not read. Numbers are invented examples.`
},
{
  title: `Serialization and validation at the boundary`,
  short: `Treat the edge of the service as a customs gate: parse strictly, validate once, and convert to safe internal types.`,
  why: `Every byte that crosses the boundary is untrusted. Bad input that gets past the edge causes errors three layers down, where the message is confusing and the damage is larger. A reviewer checks that the gate exists, that it is strict, and that responses cannot leak fields that were never meant to leave.`,
  concept: [
    `<b>Serialization</b> converts internal objects to bytes for the wire (usually JSON) and back. Two risks sit here: accepting more than you meant (extra fields, wrong types) and sending more than you meant (internal fields such as <code>password_hash</code> or <code>internal_notes</code>).`,
    `<b>Validate at the boundary.</b> Define the shape of each request body as a schema: required fields, types, lengths, ranges, allowed values. Reject what does not fit with a 400 (cannot be parsed) or 422 (parses but breaks a rule) and a list of field errors. After this point inner code can assume well-formed values, which removes a class of defensive checks.`,
    `<b>Syntax versus semantics.</b> A schema checks syntax: price is a non-negative integer. Business rules need state: the category must exist and accept ads, the member must not exceed their active ad quota. Do syntax checks at the edge and the rest in the service, and back the invariants with database constraints, since validation in code can be bypassed by another code path.`,
    `<b>Separate wire types from storage types.</b> A request DTO (data transfer object) for create has no <code>ad_id</code>, <code>member_id</code> or <code>status</code>, because the server sets them. Binding the request body straight onto the database record enables <b>mass assignment</b>: a client sends <code>"status": "approved"</code> or <code>"member_id": 1</code> and it is saved. This maps to Broken Object Property Level Authorization (API3 in the OWASP API Security Top 10, 2023).`
  ],
  terms: [
    [`DTO`, `A type that describes exactly what crosses the wire, separate from the stored record.`],
    [`Mass assignment`, `Binding request fields onto a record so a client can set fields it should not.`],
    [`Strict parsing`, `Rejecting unknown fields and wrong types instead of ignoring them.`],
    [`400 versus 422`, `400 the request cannot be understood. 422 it is understood but breaks a rule.`]
  ],
  example: {
    setup: `<code>POST /ads</code> creates an ad. The agent defines one <code>Ad</code> class used for the request, the database row and the response.`,
    body: [
      `A client sends <code>{"title": "Bike", "price": -5, "status": "approved", "member_id": 1}</code>. With the shared class the server stores an approved ad for member 1 at a negative price. With separate types the create request allows only <code>title</code>, <code>description</code>, <code>price</code>, <code>category_id</code>, and the server fills in <code>member_id</code> from the authenticated caller and sets <code>status</code> to pending review.`,
      `The response type also differs: it lists the fields the public may see. The seller's phone number appears only when the product says so, and never <code>report_count</code> or moderation notes. The review question is always "which fields can cross, in each direction, and who decided?".`
    ],
    table: {
      head: [`Field`, `In create request?`, `In public response?`, `Set by`],
      rows: [
        [`title, price, category_id`, `Yes, validated`, `Yes`, `Client`],
        [`ad_id, created_at`, `No`, `Yes`, `Server`],
        [`member_id`, `No`, `Seller summary only`, `Server from the session`],
        [`status`, `No`, `Yes, read only`, `Server and moderators`],
        [`password_hash, report_count`, `No`, `No`, `Never exposed`]
      ]
    }
  },
  technique: [
    { t: `Write a schema for every request body and query`, x: `Required fields, types, min and max lengths, ranges, enumerations, and a maximum body size.` },
    { t: `Reject unknown fields`, x: `Prefer strict parsing, or an explicit allow-list, so a typo or an attack field is an error and not silently ignored.` },
    { t: `Keep request, storage and response types separate`, x: `Make the lists of fields explicit in each direction. Never return a database row directly.` },
    { t: `Set server-owned fields on the server`, x: `Owner, status, timestamps and counters come from the session and the service, never from the body.` },
    { t: `Return field-level errors`, x: `Report every failing field in one 422 so a client can fix them all, with a stable code per rule.` },
    { t: `Back the rules with constraints`, x: `Repeat hard invariants as database constraints. Validation at the edge is the friendly layer, not the only one.` }
  ],
  mistakes: [
    { t: `One class for everything`, ctx: `The ORM model is used as request body and response. A new internal column is exposed to every client the day it is added.`, fix: `Use explicit request and response types. Review any change that adds a field to the response.` },
    { t: `Validation only in the front end`, ctx: `The web form checks the price, the API does not. A script posts a negative price.`, fix: `Treat the front end as a convenience. The server validates everything again.` },
    { t: `Trusting the declared type`, ctx: `A file upload is accepted because the name ends in .jpg and the header says image/jpeg.`, fix: `Check the actual content (magic bytes), cap the size, and store files outside the web root under generated names.` }
  ],
  review: [
    `Show the request and response types for this endpoint. Which fields can the client set, and which are set by the server?`,
    `What happens when the body has an unknown field, a wrong type or is 50 MB?`,
    `Which validations are only in code, and which are also database constraints?`,
    `Can any response field expose data the caller should not see?`,
    `Red flag: a database model bound directly to the request body, or returned directly in a response.`
  ],
  exercise: {
    prompt: `The agent implements <code>PATCH /ads/{id}</code> by copying every field in the JSON body onto the ad record. Write the attack and the fix.`,
    answer: `<p>Attack: a seller sends <code>{"status": "approved"}</code> to skip moderation, or <code>{"member_id": 99}</code> to hand an ad to someone else, or <code>{"report_count": 0}</code> to clear reports.</p><p>Fix: an update type that lists only the editable fields (title, description, price, and so on), applied field by field. The service verifies the caller owns the ad, and moderator-only fields change through a separate, authorized endpoint. Add a test that sends each forbidden field and checks that it is rejected or ignored by design.</p>`
  },
  checklist: [
    `Every request has a schema with limits, and unknown fields are rejected or deliberately ignored.`,
    `Request, storage and response types are separate and field lists are explicit.`,
    `Server-owned fields are never taken from the client.`,
    `Hard invariants are also database constraints.`
  ],
  artifact: `Section 4 of the API contract: request and response schemas per endpoint, the field ownership table, and the validation rules with their codes.`,
  agent: `The agent writes schemas and separate request and response types, builds the field ownership table, and adds tests that send forbidden fields. It flags any place where it had to bind a stored record directly.`,
  src: `OWASP API Security Top 10 (2023), API3 Broken Object Property Level Authorization (excessive data exposure and mass assignment). OWASP Mass Assignment Cheat Sheet. RFC 9110 (400 and 422 meanings). RFC 8259 (JSON). Backend from First Principles, chapters 5 and 6 (serialization, validation) chapter topic only, text not read.`
},
{
  title: `Controllers, services, repositories and middleware`,
  short: `Give each layer one job so rules live in one place and can be tested without a server or a database.`,
  why: `Layering is what lets a system change safely. When the handler contains SQL, an HTTP status and a business rule at once, every change touches everything and nothing can be tested alone. A reviewer checks the dependency direction and where each rule lives.`,
  concept: [
    `A common split has three layers. The <b>controller</b> (handler) speaks HTTP: it reads the request, calls the service, maps the result to a response. The <b>service</b> holds business rules and coordinates work: "a member may have at most 20 active ads". The <b>repository</b> speaks to storage: queries in, domain objects out.`,
    `<b>Dependencies point one way</b>: controller to service to repository. The service must not know about HTTP (no status codes, no request objects), and the repository must not know about business rules. The service depends on a repository <i>interface</i>, so a test can replace it with an in-memory one (<b>dependency injection</b>).`,
    `<b>Transactions belong to the service.</b> A rule like "create the ad and its images together or not at all" spans repository calls, so the service opens the transaction and passes it down. A repository method that commits by itself makes atomic business operations impossible.`,
    `<b>Cross-cutting concerns</b> (logging, authentication, rate limits, metrics) belong in middleware, not copied into handlers. Be careful not to over-layer: a service that only forwards a call to a repository is noise. Add a layer when it has a real job.`
  ],
  terms: [
    [`Controller`, `The HTTP-facing layer: parse, call, respond.`],
    [`Service`, `The layer that holds business rules and transactions.`],
    [`Repository`, `The layer that hides storage queries behind domain-level methods.`],
    [`Dependency injection`, `Passing a layer its collaborators from outside so tests can substitute them.`]
  ],
  example: {
    setup: `The agent writes "post an ad" as one 150-line handler: it parses JSON, checks the member's quota with a query, inserts the ad and images, calls the moderation service, and builds the response with status codes.`,
    body: [
      `It works, but the quota rule cannot be tested without HTTP and a database, the moderation call sits inside an open transaction (a slow call holding locks, as the Mindset module warned), and when a second endpoint (the mobile batch import) needs the same quota rule it will copy it.`,
      `Split it. The controller validates the body and calls <code>AdService.post(member, input)</code>. The service checks the quota, opens a transaction, calls <code>AdRepository.insert</code> and <code>ImageRepository.insert</code>, commits, and only then asks moderation (or queues the check). The controller maps a <code>QuotaExceeded</code> result to a 409 or 422 with the shared error shape.`
    ],
    table: {
      head: [`Question`, `Belongs in`, `Misplaced in`],
      rows: [
        [`Parse JSON, set 201 and Location`, `Controller`, `Service`],
        [`At most 20 active ads per member`, `Service`, `Controller or SQL string in the handler`],
        [`SELECT ... WHERE member_id = ?`, `Repository`, `Service`],
        [`Request id, auth, rate limit`, `Middleware`, `Every handler`],
        [`BEGIN and COMMIT for post ad`, `Service`, `Repository method that commits alone`]
      ]
    }
  },
  technique: [
    { t: `Write each rule down with its layer`, x: `A table of rule, layer and test. A rule with no layer has no home and will be duplicated.` },
    { t: `Check the dependency direction`, x: `No HTTP types in services, no business rules in repositories, no SQL in controllers.` },
    { t: `Put the transaction around the business operation`, x: `Open it in the service and keep slow external calls outside of it.` },
    { t: `Inject collaborators`, x: `Services receive repositories and clients through their constructor, so a unit test can use fakes.` },
    { t: `Test per layer`, x: `Service rules with fakes, repositories against a real test database, controllers for status codes and shapes.` }
  ],
  mistakes: [
    { t: `The fat handler`, ctx: `Everything is in the controller because it was quicker to generate. Rules are copied into the next endpoint.`, fix: `Extract the rule into a service method and test it once. Ask the agent to show the dependency direction.` },
    { t: `Ceremony layers`, ctx: `Five layers, each forwarding to the next, for a simple read. Changes now touch five files.`, fix: `Keep layers that have a job. Reads without rules can go from controller to a query object.` },
    { t: `Leaky repository`, ctx: `The repository returns ORM objects with lazy loading. A template triggers a query per row in the controller (the N+1 problem).`, fix: `Return plain domain objects and load what the use case needs in one query.` }
  ],
  review: [
    `Name the layers in this change and what each is allowed to know. Show where the business rules live.`,
    `Where does the transaction begin and end? Is any slow external call inside it?`,
    `Can the service be unit tested without a server and without a database?`,
    `Is a rule that appears in two endpoints implemented once?`,
    `Red flag: SQL strings, HTTP status codes and business rules in the same function.`
  ],
  exercise: {
    prompt: `Place these in controller, service, repository or middleware: (a) reject a message to a conversation the caller is not in, (b) insert into <code>message</code>, (c) log duration and status, (d) return 404 when the conversation is missing.`,
    answer: `<p>(a) Service: the rule needs the conversation membership, which the service loads through a repository, and it must apply however the message arrives (HTTP or another entry point). (b) Repository. (c) Middleware, since it applies to every request. (d) The service signals "not found" in domain terms, and the controller maps it to 404 (or to 403 or 404 on purpose, to avoid revealing that the conversation exists).</p>`
  },
  checklist: [
    `Each business rule has exactly one home and one test.`,
    `Dependencies point controller to service to repository.`,
    `Transactions are opened in the service and exclude slow external calls.`,
    `Cross-cutting concerns are in middleware.`
  ],
  artifact: `Section 5 of the API contract: a layer map per endpoint, with the rule table (rule, layer, test) and the transaction boundaries.`,
  agent: `The agent keeps handlers thin, puts rules in services behind injected repositories, opens transactions at the service level, and produces the rule table. It refuses to commit inside a repository method.`,
  src: `M. Fowler, Patterns of Enterprise Application Architecture, 2002 (service layer, repository, data mapper). R. C. Martin, Clean Architecture, 2017 (dependency rule). PostgreSQL manual: transactions. Backend from First Principles, chapter 9 (handlers, services, repositories, middleware) chapter topic only, text not read.`
},
{
  title: `OpenAPI as the contract`,
  short: `Write the contract first and in a machine-readable form, so clients, tests and reviewers all check the same document.`,
  why: `An API is a promise to people you cannot see. If the promise lives only in code, it changes by accident. A contract in the OpenAPI format is reviewable before code exists, can generate documentation, mocks and client code, and can be checked against the running service. It is the artifact of this module.`,
  concept: [
    `The <b>OpenAPI Specification</b> describes an HTTP API in YAML or JSON: <code>paths</code> with operations (method, parameters, request body, responses), reusable <code>components</code> (schemas, parameters, security schemes) and <code>servers</code>. Version 3.x is current; check the version your tools support.`,
    `<b>Contract first</b> means the OpenAPI document is written and agreed before the implementation. Reviewers then discuss resource names, error shapes and field ownership while changes are cheap. A <b>code first</b> approach generates the document from code. That is acceptable only if the generated file is committed and reviewed like source.`,
    `A contract earns its keep when it is <b>checked</b>. Lint it for style rules, validate requests and responses against it in tests (contract tests), and run a <b>breaking-change diff</b> in the pipeline. A change is breaking if existing clients can fail: removing or renaming a field, making an optional field required, tightening a type, adding a new required parameter, or changing a status code meaning.`,
    `<b>Versioning.</b> Additive changes (a new optional field or endpoint) are compatible if clients ignore unknown fields. Breaking changes need a new version or a deprecation period with a published date. Mark fields as <code>deprecated</code> rather than deleting them. Security belongs in the document too: declare the security schemes and which operations need which scopes, and every operation either lists one or is explicitly public.`
  ],
  terms: [
    [`OpenAPI`, `A standard format for describing HTTP APIs: paths, schemas, security and responses.`],
    [`Contract first`, `Write and agree the API description before writing the implementation.`],
    [`Breaking change`, `A change that can make an existing client fail.`],
    [`Contract test`, `A test that checks real responses against the schema in the contract.`]
  ],
  example: {
    setup: `The marketplace adds an endpoint to report an ad. The agent writes the contract first, in OpenAPI 3.x, for the reviewer.`,
    body: [
      `<pre>paths:
  /ads/{ad_id}/reports:
    post:
      summary: Report an ad
      security: [ { bearerAuth: [] } ]
      parameters:
        - { name: ad_id, in: path, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/ReportCreate" }
      responses:
        "201": { description: Created }
        "401": { $ref: "#/components/responses/Problem" }
        "404": { $ref: "#/components/responses/Problem" }
        "422": { $ref: "#/components/responses/Problem" }
        "429": { $ref: "#/components/responses/Problem" }</pre>`,
      `The reviewer can already ask: why no 409 for reporting the same ad twice? Is a report allowed on your own ad? Is there a maximum number of reports per member per day, and is it the 429? None of these needed any code to discuss.`
    ],
    table: {
      head: [`Change to a response field`, `Compatible?`, `Why`],
      rows: [
        [`Add optional field <code>seller_rating</code>`, `Yes`, `Clients ignore unknown fields`],
        [`Rename <code>price</code> to <code>price_vnd</code>`, `No`, `Existing clients read the old name`],
        [`Make <code>phone</code> required in the create request`, `No`, `Old clients omit it and now fail`],
        [`Change 404 to 410 for deleted ads`, `No`, `Clients may branch on the code`],
        [`Mark a field deprecated and keep it`, `Yes`, `A warning, not a break`]
      ]
    }
  },
  technique: [
    { t: `Write the contract before the code`, x: `Paths, parameters, schemas, responses and the security scheme, reviewed as a document.` },
    { t: `Reuse components`, x: `Define the error response, pagination parameters and common schemas once and reference them.` },
    { t: `Declare security on every operation`, x: `Either a scheme with scopes or an explicit empty list for public routes, so omissions stand out.` },
    { t: `Lint and diff in the pipeline`, x: `Run a style linter and a breaking-change check against the last released contract on every change.` },
    { t: `Test the implementation against the contract`, x: `Validate real responses against the schemas, including error responses.` },
    { t: `Plan deprecation`, x: `For every breaking change write the notice, the date and the migration path, or avoid it by adding a new field.` }
  ],
  mistakes: [
    { t: `A contract that drifts`, ctx: `The OpenAPI file was written once. The code later added a field and changed a code, and nobody noticed.`, fix: `Check responses against it in tests and fail the build on a breaking diff.` },
    { t: `Only the happy path in the document`, ctx: `Each operation lists 200 and nothing else. Clients guess the error behavior.`, fix: `List every error status and reference the shared error response.` },
    { t: `Renaming in place`, ctx: `A field is renamed "for clarity" in a minor release and a mobile app breaks.`, fix: `Add the new name, deprecate the old, remove after the published date.` }
  ],
  review: [
    `Is the contract committed, and was it reviewed before the implementation? Show the diff against the last version.`,
    `Does every operation list its error responses and its security requirement?`,
    `Which changes in this diff are breaking, and what is the deprecation plan?`,
    `What test fails if the implementation returns something the contract does not allow?`,
    `Red flag: a contract generated from code and never reviewed, or an endpoint present in code and missing from the document.`
  ],
  exercise: {
    prompt: `The agent proposes changing the ad list response from a bare array to <code>{"items": [...], "next_cursor": "..."}</code>. Is it breaking, and how would you roll it out?`,
    answer: `<p>Yes, it is breaking: every existing client that expects an array fails. Better to have started with an envelope, which is why the resources lesson insists on one.</p><p>Rollout: introduce the envelope on a new path or version (for example <code>/v2/ads</code>) or behind an explicit request header, keep the old shape working for a published period, publish the date, watch usage of the old shape in metrics, and remove it only when usage is near zero or the date has passed. Add the diff check so a future change like this cannot ship by accident.</p>`
  },
  checklist: [
    `The contract exists, is versioned in the repository and was reviewed first.`,
    `Every operation lists success, error responses and its security requirement.`,
    `A breaking-change check runs on every change.`,
    `Tests validate real responses against the schemas.`,
    `Deprecations have a notice, a date and a migration path.`
  ],
  artifact: `The finished <b>API contract</b>: an OpenAPI document with an error model, plus the five sections from the earlier lessons and a changelog of breaking changes.`,
  agent: `The agent writes the OpenAPI document first, runs a linter and a breaking-change diff, generates contract tests, and lists any change it considers breaking for your approval with a deprecation plan.`,
  src: `OpenAPI Specification 3.x, OpenAPI Initiative (paths, components, security schemes, deprecated). RFC 9457 (error model referenced by the contract). Semantic Versioning 2.0.0 for the meaning of compatible and breaking changes. Backend from First Principles, chapter 24 (OpenAPI) chapter topic only, text not read.`
},
{
  title: `Protocol Buffers: schema design and evolution`,
  short: `A .proto file is a contract with a wire format: field numbers are identity, and the rules for changing it safely are strict.`,
  why: `Protobuf is compact and fast, and the generated code makes calls feel local, so teams adopt it quickly. The danger is that the schema is also a compatibility promise to every deployed client and server, and an agent can produce a .proto that compiles and still breaks production the day one side is deployed before the other.`,
  concept: [
    `A <b>message</b> is a set of typed fields. On the wire each field is identified by its <b>field number</b>, not its name. Numbers 1 to 15 take one byte for the tag and 16 to 2047 take two, so put the most frequent fields in the low numbers. The number is permanent: once a number has been released in a version that anyone has deployed, it must never mean something else.`,
    `<b>Compatible changes</b> (in general): add a new field with a new number, add a new enum value, add a new message or service method, and rename a field (the wire does not carry names, but generated code and the JSON mapping do change, so treat a rename as a breaking change for code and JSON users). <b>Breaking changes</b>: reuse or renumber a field, change a field's type in an incompatible way, change a field between singular and repeated or into a oneof, remove a required behavior, and remove an enum value that is still in use. When a field is deleted, mark its number and name as <code>reserved</code> so nobody reuses them.`,
    `<b>Defaults and presence.</b> In proto3 a plain scalar field that is not set reads as its zero value (0, empty string, false) and the zero value is not sent, so you cannot tell "unset" from "zero". Use the <code>optional</code> keyword when the difference matters, or a wrapper or message type. Every enum should start with a zero value named like <code>AD_STATUS_UNSPECIFIED = 0</code>, so an unset enum is never silently a real state.`,
    `<b>Unknown fields.</b> A receiver that does not know a field number keeps or ignores it instead of failing, which is what lets old and new versions talk to each other. That is also why a typo in a field number is a silent bug, not a crash.`,
    `<b>Choose types on purpose.</b> Use int64 minor units or a money message for amounts, never float. Use <code>google.protobuf.Timestamp</code> and <code>Duration</code> for time instead of bare integers. Put the major version in the package (<code>marketplace.ads.v1</code>) so a real breaking change becomes a new package. Tools such as <code>buf</code> can lint a schema and compare it with the previous release to report breaking changes, which is the protobuf equivalent of an OpenAPI diff.`
  ],
  terms: [
    [`Field number`, `The permanent integer that identifies a field on the wire.`],
    [`reserved`, `A declaration that a number or name was used before and must not be reused.`],
    [`Presence`, `Whether a field was set, as opposed to holding its default value.`],
    [`oneof`, `A group of fields where at most one is set at a time.`],
    [`Wire compatible`, `Old and new binaries can exchange the message without error.`]
  ],
  example: {
    setup: `The marketplace has an internal Ad service that Search, Chat and Moderation call. The agent proposes the first version of the message. The names, numbers and prices are invented examples.`,
    body: [
      `<pre>syntax = "proto3";
package marketplace.ads.v1;

enum AdStatus {
  AD_STATUS_UNSPECIFIED = 0;
  AD_STATUS_DRAFT = 1;
  AD_STATUS_PUBLISHED = 2;
  AD_STATUS_REMOVED = 3;
}

message Ad {
  int64 ad_id = 1;
  int64 member_id = 2;
  int32 category_id = 3;
  string title = 4;
  int64 price_vnd = 5;
  AdStatus status = 6;
  google.protobuf.Timestamp created_at = 7;
}</pre>`,
      `Later, product wants a price currency and wants to drop the old status field in favor of a soft-delete timestamp. The safe edit adds <code>string currency_code = 8</code> and a <code>google.protobuf.Timestamp removed_at = 9</code>, stops using field 6, and writes <code>reserved 6; reserved "status";</code> after both sides no longer read it. The unsafe edit, which an agent may well produce, changes <code>int64 price_vnd = 5</code> to <code>double price = 5</code>: it compiles, but old clients now misread the bytes.`
    ],
    table: {
      head: [`Change`, `Safe?`, `Why`],
      rows: [
        [`Add field 8 currency_code`, `Yes`, `Old readers ignore it, new readers get a default from old writers`],
        [`Add enum value AD_STATUS_EXPIRED = 4`, `Yes, with care`, `Old code sees an unknown value, so it must handle that case`],
        [`Change field 5 from int64 to double`, `No`, `The bytes mean something different to old and new code`],
        [`Reuse number 6 for a different field`, `No`, `Old data and old clients read the new meaning as the old one`],
        [`Rename title to name`, `Wire yes, code and JSON no`, `Generated names and the JSON mapping change for every user`]
      ]
    }
  },
  technique: [
    { t: `Write the package with a major version`, x: `Name it for the domain and version, for example marketplace.ads.v1. A breaking redesign becomes v2, served next to v1.` },
    { t: `Assign numbers by frequency, then freeze them`, x: `Hot fields get 1 to 15. After a release, a number never changes meaning.` },
    { t: `Make presence explicit`, x: `Use optional or a wrapper where unset differs from zero. Start every enum with an UNSPECIFIED zero value.` },
    { t: `Pick types for the data`, x: `Integer minor units or a money type for amounts, Timestamp and Duration for time, strings for opaque ids that may change format.` },
    { t: `Retire with reserved`, x: `When removing a field, reserve its number and name, after confirming nothing reads it.` },
    { t: `Lint and diff in the pipeline`, x: `Run a schema linter and a breaking-change check against the last released schema on every change, and fail the build on a break.` }
  ],
  mistakes: [
    { t: `Reusing or renumbering a field`, ctx: `A cleanup renumbers fields 1 to 7 to be tidy. Old clients keep working until the first message arrives, then every field is decoded into the wrong place.`, fix: `Numbers are permanent. Leave gaps, and reserve what you delete.` },
    { t: `Treating zero as unset`, ctx: `A price of 0 and a missing price look the same, so a free ad and an ad with no price are shown alike.`, fix: `Mark the field optional (or use a wrapper) when absence has a meaning, and say what absence means in a comment.` },
    { t: `Using float or an unversioned package`, ctx: `Prices are stored as doubles and rounding errors appear in totals. The package has no version, so the first breaking change has nowhere to go.`, fix: `Integer minor units or a money type, and a versioned package from the first commit.` }
  ],
  review: [
    `Is every field number new, never reused, and is every deleted field in a reserved list?`,
    `Where does an unset value differ from zero, and is that field marked optional?`,
    `Does the enum start with an UNSPECIFIED zero value, and does consuming code handle unknown values?`,
    `Ask for the breaking-change report against the last released schema. Which tool produced it?`,
    `Red flag: a changed type or renumbered field described as a harmless refactor, or a schema with no version in the package.`
  ],
  exercise: {
    prompt: `The agent changes <code>int32 category_id = 3</code> to <code>string category_slug = 3</code> and deploys the server first. Explain what happens and give the safe plan.`,
    answer: `<p>Field 3 changes meaning and wire type: an old client sends a varint for 3 and the new server reads it as a string field, which is a parse error or an ignored field. An old client reading a new response gets wrong or missing data. Both directions are unsafe.</p><p>Safe plan: add <code>string category_slug = 9</code> and keep <code>category_id = 3</code>. Have the server fill both. Move clients to read the slug. When no client reads field 3, write <code>reserved 3; reserved "category_id";</code> in a later release. Run the breaking-change check to prove the first step is compatible.</p>`
  },
  checklist: [
    `The package carries a major version.`,
    `Every released field number is permanent, and removed ones are reserved.`,
    `Presence is explicit where unset differs from zero, and enums start with UNSPECIFIED.`,
    `Amounts and time use suitable types, not float or bare integers.`,
    `A lint and breaking-change check runs on every schema change.`
  ],
  artifact: `The <b>schema section</b> of the API contract for service-to-service calls: the .proto files with comments, the field number table with reserved entries, the presence rules, and the latest breaking-change report.`,
  agent: `The agent writes the schema with explicit presence and an UNSPECIFIED enum zero, never reuses or renumbers a field, reserves removed ones, and attaches the lint and breaking-change output for every change.`,
  src: `Protocol Buffers Language Guide (proto3) at protobuf.dev: field numbers, reserved, enums, optional, oneof, updating a message type. Protocol Buffers Style Guide. Google API Design Guide and API Improvement Proposals at google.aip.dev for naming and versioning. Buf documentation for lint and breaking-change rules. Prices, numbers and names are invented examples.`
},
{
  title: `gRPC services: when to use them and how to design them`,
  short: `Choose gRPC for the right callers, shape methods and streams around the work, and keep errors, versions and browsers in view.`,
  why: `gRPC is attractive for internal calls: typed clients, a compact format, and streaming. It is also easy to pick for the wrong caller, to design chatty methods, or to hide errors in a generic status. A reviewer decides whether gRPC fits, and whether the service definition is a good contract.`,
  concept: [
    `<b>gRPC</b> runs on HTTP/2 and sends Protocol Buffers messages by default. A service definition lists methods, and generated code gives each side a client and a server stub. There are four call shapes: <b>unary</b> (one request, one response), <b>server streaming</b> (one request, a stream of responses), <b>client streaming</b>, and <b>bidirectional streaming</b>.`,
    `<b>When it fits.</b> Internal service-to-service calls, strongly typed contracts shared by many languages, low latency and high call volume, and streaming. <b>When REST and JSON fit better.</b> Public APIs and partners, browsers, simple CRUD that benefits from HTTP caching and easy debugging with curl, and teams that need to read traffic with plain tools. Browsers cannot speak native gRPC, so they need gRPC-Web, a proxy, or a REST gateway generated from annotations on the service.`,
    `<b>Design the methods around the work.</b> One coarse call that returns what the caller needs beats five fine calls in a loop (the network is not a function call). Name methods with verbs on a resource (<code>GetAd</code>, <code>ListAds</code>, <code>CreateAd</code>). Paginate list methods with a page size and an opaque page token, as REST does. Use a stream when the data really is a sequence over time, for example price updates, and not as a way to avoid pagination.`,
    `<b>Errors.</b> gRPC has its own status codes (for example <code>INVALID_ARGUMENT</code>, <code>NOT_FOUND</code>, <code>PERMISSION_DENIED</code>, <code>RESOURCE_EXHAUSTED</code>, <code>FAILED_PRECONDITION</code>, <code>UNAVAILABLE</code>, <code>DEADLINE_EXCEEDED</code>). Pick the code that tells the caller what to do: retry later (<code>UNAVAILABLE</code>), fix the request (<code>INVALID_ARGUMENT</code>), or give up. Put structured details (which field was invalid) in the error details, not in a free-text message. Never return <code>UNKNOWN</code> or <code>INTERNAL</code> for an error the caller caused.`,
    `<b>Operating it.</b> Deadlines, retries and idempotency are covered in the Async work and messaging module; the same rules apply: every call carries a deadline, and only idempotent methods are retried. HTTP/2 keeps long-lived connections, so a plain layer-4 load balancer can send most traffic to one backend. Use a gRPC-aware proxy or client-side balancing. Version the service by package (<code>marketplace.ads.v1</code>) and keep the old version running during migration. Enable the standard health-checking service so orchestrators can probe it.`
  ],
  terms: [
    [`Unary`, `One request and one response, like a normal function call.`],
    [`Server streaming`, `One request, and the server sends many responses over time.`],
    [`Status code`, `gRPC's result category, set on every call.`],
    [`Stub`, `The generated client or server code for a service.`],
    [`gRPC-Web`, `A variant that lets browsers call gRPC services through a proxy.`]
  ],
  example: {
    setup: `Search needs ad data in bulk, Chat needs a few ad fields per conversation, and a dashboard wants live price changes. The Ad service is internal. The agent proposes a service definition.`,
    body: [
      `<pre>service AdService {
  rpc GetAd(GetAdRequest) returns (Ad);
  rpc BatchGetAds(BatchGetAdsRequest) returns (BatchGetAdsResponse);
  rpc ListAds(ListAdsRequest) returns (ListAdsResponse);
  rpc WatchPriceChanges(WatchPriceChangesRequest)
      returns (stream PriceChange);
}

message BatchGetAdsRequest { repeated int64 ad_ids = 1; }
message ListAdsRequest {
  int32 category_id = 1;
  int32 page_size = 2;
  string page_token = 3;
}</pre>`,
      `The review finds three things. <code>BatchGetAds</code> must cap the list (for example 100 ids) or one call can ask for a million. <code>ListAds</code> is paginated with a token, which is right. <code>WatchPriceChanges</code> is a true stream, but the service must say what happens when the client falls behind and how it resumes after a disconnect. The agent also returned <code>INTERNAL</code> for an unknown ad id: the correct code is <code>NOT_FOUND</code>.`
    ],
    table: {
      head: [`Caller`, `Protocol`, `Why`],
      rows: [
        [`Search, Chat, Moderation (internal)`, `gRPC`, `Typed clients, many languages, high call rate`],
        [`Mobile and web apps`, `REST and JSON, or gRPC-Web through a gateway`, `Browsers and public clients need HTTP-friendly access`],
        [`Partners`, `REST and JSON with OpenAPI`, `Easy to read, cache and debug without special tools`]
      ]
    }
  },
  technique: [
    { t: `Decide the protocol by caller`, x: `List the callers. Internal and typed: gRPC. Browsers, partners and public: REST, or a gateway in front of gRPC.` },
    { t: `Design coarse methods`, x: `For each use, ask whether one call can return what the caller needs. Add batch methods with a cap, and paginate lists.` },
    { t: `Choose the call shape`, x: `Use unary by default. Use a stream only for a real sequence over time, and define backpressure and resume rules.` },
    { t: `Map errors to codes`, x: `For each failure, pick the status code that tells the caller what to do, and put structured details in the error details.` },
    { t: `Set the operating rules`, x: `Deadline on every call, retries only for idempotent methods, version in the package, health service enabled, balancing that understands HTTP/2.` },
    { t: `Test the contract`, x: `Generate clients in two languages, call with a CLI tool, and run the schema breaking-change check on every change.` }
  ],
  mistakes: [
    { t: `Chatty fine-grained methods`, ctx: `Chat calls GetAd once per conversation in a loop of 200. Each call is fast, but the sum breaks the latency budget.`, fix: `Add BatchGetAds with a cap, and design methods around what the caller needs.` },
    { t: `One generic error`, ctx: `Every failure is returned as UNKNOWN with a message string. Callers retry bad requests and cannot tell a missing ad from an outage.`, fix: `Use specific codes, and structured error details for the field-level cause.` },
    { t: `gRPC for everything`, ctx: `A public partner API is built on gRPC. Partners cannot easily debug it and browsers cannot call it.`, fix: `Expose REST and JSON (or a generated gateway) at the edge, and keep gRPC inside.` }
  ],
  review: [
    `Who calls this, and does gRPC fit each of them? Where is the REST or gateway edge?`,
    `Are list and batch methods capped and paginated, and are streams given a resume and a slow-consumer rule?`,
    `Does each failure map to a status code that tells the caller what to do?`,
    `How is the service balanced across instances, and where is the health service and the version in the package?`,
    `Red flag: every error is UNKNOWN or INTERNAL, a method returns unbounded data, or gRPC is chosen for a browser or partner without a gateway.`
  ],
  exercise: {
    prompt: `A mobile app needs the same ad data that Search gets over gRPC. Choose how to serve it and say what you must add to the service definition.`,
    answer: `<p>Do not expose the internal gRPC service to the app. Put an API layer at the edge that speaks REST and JSON (documented in OpenAPI) and calls the Ad service over gRPC. Alternatively, generate a gateway from HTTP annotations on the service definition so the same methods are reachable as REST, or use gRPC-Web through a proxy.</p><p>Add to the definition: HTTP annotations if you use a gateway, field-level authorization at the edge (the app must only see its allowed fields), pagination on list methods, caps on batch methods, and error codes that the edge maps to HTTP status codes and a Problem Details body.</p>`
  },
  checklist: [
    `Each caller has a protocol choice with a reason.`,
    `Methods are coarse, batch and list methods are capped, and lists are paginated.`,
    `Streams define resume and slow-consumer behavior.`,
    `Every failure maps to a specific status code with structured details.`,
    `Deadlines, versioning, balancing and the health service are specified.`
  ],
  artifact: `The <b>service definition section</b> of the API contract: the service and message definitions, a caller and protocol table, an error and status-code table, and the operating rules (deadlines, retries, versioning, balancing, health).`,
  agent: `The agent picks the protocol per caller, designs coarse capped methods, maps every failure to a status code with details, adds a REST or gateway edge for browsers and partners, and attaches generated clients and contract tests.`,
  src: `gRPC documentation at grpc.io: core concepts, status codes, deadlines, health checking, load balancing, gRPC-Web. Protocol Buffers documentation at protobuf.dev. Google API Improvement Proposals (pagination, errors, standard methods) at google.aip.dev. This course: Async work and messaging, lesson on gRPC and service-to-service calls (deadlines, retries). Names and numbers are invented examples.`
}

];
