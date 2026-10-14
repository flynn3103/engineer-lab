/* Identity and security: seven lessons. Same running scenario (a classifieds marketplace). All numbers are invented examples.
 * Topic list informed by the security, authentication and authorization chapters of DsThakurRawat/Backend-from-first-Principle
 * (headings only), re-expressed as reviewer habits. Facts cited to OWASP, RFCs and product documentation named per lesson. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['security'] = [
{
  title: `The attacker mindset`,
  short: `Ask who could abuse each feature and what they gain, before deciding which controls to add.`,
  why: `Security failures are rarely clever. They are an unasked question: someone can call this with another member's id, or send a larger input than anyone tried. An agent builds what was asked and tests the intended use. A reviewer adds the second reader of every endpoint, the one who wants to misuse it.`,
  concept: [
    `<b>Trust boundaries.</b> Draw a line wherever data or control passes from a less trusted party to a more trusted one: browser to API, API to database, API to a third-party service, uploaded file to the image processor. Everything that crosses a boundary inward is untrusted until checked. The client is always untrusted, including your own mobile app, because the attacker controls the device.`,
    `<b>Assets, actors, abuse cases.</b> List what is worth protecting (accounts, phone numbers, messages, the ability to post ads), who might attack (anonymous visitor, a malicious member, a stolen-token holder, an insider), and for each feature an <b>abuse case</b> next to the use case. Use case: "a buyer messages a seller". Abuse case: "a bot messages ten thousand sellers with a scam link".`,
    `<b>A simple threat model.</b> For each trust boundary ask the STRIDE questions (a mnemonic from Microsoft): can someone <i>spoof</i> an identity, <i>tamper</i> with data, <i>repudiate</i> an action (deny doing it), <i>disclose</i> information, <i>deny service</i>, or <i>elevate</i> privileges? You do not need a tool, only a table and an hour.`,
    `<b>Defense in depth and least privilege.</b> No single control is trusted alone: the API checks ownership, the database user has only the rights the service needs, and secrets are scoped. The OWASP API Security Top 10 (2023 edition) is a good checklist of how real APIs fail. It is a prompt for questions, not a complete standard.`
  ],
  terms: [
    [`Trust boundary`, `A line where data passes from a less trusted to a more trusted party.`],
    [`Abuse case`, `A use case written from the attacker's side.`],
    [`STRIDE`, `Six threat types: spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege.`],
    [`Least privilege`, `Each actor gets only the access it needs for its job.`]
  ],
  example: {
    setup: `The marketplace adds "contact seller": a buyer presses a button and the seller's phone number is revealed. The agent implements <code>GET /ads/{id}/phone</code> and tests that it returns the number.`,
    body: [
      `Write the abuse cases. A scraper loops over all ad ids and harvests every phone number (an <i>information disclosure</i> and an unrestricted access to a sensitive business flow). A competitor reveals a number without logging in. A seller who deleted their ad still has the number served from a cache.`,
      `Controls follow from the abuse cases: require a logged-in member, rate limit reveals per member and per day, log each reveal, honour deleted and hidden status, and consider a short-lived reveal token rather than a plain GET. None of these were in the request, and all came from asking who benefits from abusing it.`
    ],
    table: {
      head: [`Threat (STRIDE)`, `Marketplace example`, `Typical control`],
      rows: [
        [`Spoofing`, `Log in as another member with a stolen password`, `Strong password storage, MFA, session protection`],
        [`Tampering`, `Change another seller's ad price`, `Object-level authorization`],
        [`Repudiation`, `Moderator denies deleting an ad`, `Audit log with actor and time`],
        [`Information disclosure`, `Phone number scraping, verbose errors`, `Access checks, rate limits, generic errors`],
        [`Denial of service`, `Huge search query, mass uploads`, `Limits on size, rate and cost`],
        [`Elevation of privilege`, `A member calls a moderator endpoint`, `Function-level authorization`]
      ]
    }
  },
  technique: [
    { t: `Draw the trust boundaries`, x: `One small diagram: client, API, database, external services, file storage. Mark where untrusted data enters.` },
    { t: `List assets and actors`, x: `Write what is worth stealing or breaking, and who might try, from anonymous to insider.` },
    { t: `Write an abuse case for each feature`, x: `One line per feature in the form "an attacker who wants X does Y".` },
    { t: `Walk STRIDE at each boundary`, x: `Fill a table of threat, example and control. A blank cell is a question, not a pass.` },
    { t: `Rank by likelihood and impact`, x: `Fix high impact and easy-to-reach first. Record accepted risks with an owner.` }
  ],
  mistakes: [
    { t: `Trusting your own client`, ctx: `The mobile app hides the "delete" button for other people's ads, so the API skips the check.`, fix: `Enforce every rule on the server. UI hiding is cosmetic.` },
    { t: `Security as a final step`, ctx: `A review at the end finds that identity was never modeled, and fixing it means redesigning endpoints.`, fix: `Write abuse cases with the requirements and threat-model during design.` },
    { t: `A checklist without thinking`, ctx: `The agent lists all ten OWASP items with "implemented" and cannot say where.`, fix: `For each item ask for the file, the test and the abuse case it answers.` }
  ],
  review: [
    `Show the trust boundaries. Which inputs come from outside, and where is each validated?`,
    `What are the abuse cases for this feature, and which control answers each?`,
    `Which rules rely on the client behaving? Where are they enforced on the server?`,
    `What are the accepted risks, who owns them, and when are they reviewed?`,
    `Red flag: a security section that lists generic controls ("uses HTTPS", "follows OWASP") and names no feature-specific abuse case.`
  ],
  exercise: {
    prompt: `Write three abuse cases for "report an ad" and one control for each.`,
    answer: `<p>(1) A seller's competitor files hundreds of false reports to get ads hidden automatically: limit reports per member and per ad, weight reports by the reporter's history, and never hide automatically on count alone without review. (2) A bot reports every new ad to flood moderators: rate limit and require a verified account. (3) A reporter enumerates ad ids through different responses to guess which exist: return the same response for existing and hidden ads. Each control also needs a metric, so abuse is visible.</p>`
  },
  checklist: [
    `Trust boundaries are drawn and untrusted inputs are listed.`,
    `Every feature has at least one abuse case.`,
    `STRIDE was walked for each boundary and blank cells were resolved or recorded.`,
    `No rule depends on the client behaving.`
  ],
  artifact: `Section 1 of the security review: the trust boundary sketch, the asset and actor list, and the threat table with abuse cases.`,
  agent: `The agent drafts the threat table from the feature list, writes an abuse case beside each use case, and marks every control with the file and test that implements it. It lists accepted risks for you to sign off.`,
  src: `OWASP API Security Top 10 (2023). A. Shostack, Threat Modeling: Designing for Security, Wiley 2014 (STRIDE, trust boundaries). OWASP Threat Modeling Cheat Sheet. Backend from First Principles, chapter 17 (security mindset) chapter topic only, text not read. Numbers and scenarios are invented examples.`
},
{
  title: `Authentication: passwords and sessions`,
  short: `Store passwords so a stolen database is not a stolen password, and keep sessions that can be revoked.`,
  why: `Authentication answers "who are you?". Every later check depends on it, so a weakness here undoes the rest. Password storage and session handling are two places where an agent copies a plausible snippet that is years out of date.`,
  concept: [
    `<b>Never store a password; store a slow, salted hash of it.</b> A <b>salt</b> is a random value stored with the hash so identical passwords hash differently and precomputed tables fail. The hash function must be deliberately slow and memory-hungry so that guessing is expensive. The OWASP Password Storage Cheat Sheet recommends Argon2id first, then scrypt or bcrypt where Argon2 is not available, with parameters tuned to your hardware. Plain SHA-256 or MD5, even with a salt, is far too fast. Use the library's own function to compare and do not write your own.`,
    `<b>Login protection.</b> Return the same message and similar timing for a wrong username and a wrong password, so attackers cannot learn which accounts exist. Limit attempts per account and per source, and add multi-factor authentication for sensitive accounts. Reset flows are an attack path too: reset tokens must be random, single use, short lived and stored hashed.`,
    `<b>Sessions.</b> After login the server creates a random, unguessable <b>session id</b> and stores the session (member, expiry) server-side, usually in a store such as Redis. The browser keeps the id in a cookie. The cookie should be <code>HttpOnly</code> (not readable by scripts), <code>Secure</code> (sent only over HTTPS) and have a <code>SameSite</code> attribute. Issue a new id at login (to prevent session fixation), expire sessions, and delete the server-side record at logout so a copied cookie stops working.`,
    `<b>Sessions are revocable.</b> Because the server owns the record, a password change or an admin action can end every session of a member at once. That property is the main reason to prefer server-side sessions for browser applications, and it is the one that tokens give up (see the next lesson).`
  ],
  terms: [
    [`Salt`, `A random per-password value mixed into the hash so equal passwords differ.`],
    [`Key derivation function`, `A deliberately slow hash designed for passwords, such as Argon2id, scrypt or bcrypt.`],
    [`Session fixation`, `Forcing a victim to use a session id the attacker already knows.`],
    [`HttpOnly, Secure, SameSite`, `Cookie attributes: hidden from scripts, HTTPS only, restricted on cross-site requests.`]
  ],
  example: {
    setup: `The agent builds member sign-in. It stores <code>sha256(password)</code> in <code>member.password_hash</code>, and after login returns the member id in a cookie called <code>uid</code>.`,
    body: [
      `Review. First, a leaked database lets an attacker test billions of SHA-256 guesses per second on ordinary graphics hardware, so most real passwords fall quickly. Replace it with Argon2id (or bcrypt) and a per-password salt, and store the algorithm and parameters with the hash so they can be raised later and old hashes upgraded at the next login.`,
      `Second, the cookie holds the member id, which the client controls. Anyone can set <code>uid=1</code> and become the first member. The cookie must hold a random session id that maps to a server-side record. Third, the login endpoint says "no such user" or "wrong password", which lets an attacker enumerate members. Fix all three, then ask for the test that proves each one.`
    ],
    table: {
      head: [`Item`, `Weak`, `Better`],
      rows: [
        [`Password storage`, `Plain, MD5, SHA-256`, `Argon2id, or bcrypt or scrypt, salted, parameters stored`],
        [`Session cookie value`, `Member id or a guessable counter`, `Long random id mapped server-side`],
        [`Cookie flags`, `None`, `HttpOnly, Secure, SameSite`],
        [`Login error`, `"User not found"`, `One generic message`],
        [`Logout`, `Delete the cookie in the browser`, `Delete the server-side session too`]
      ]
    }
  },
  technique: [
    { t: `Check the hash function and its parameters`, x: `Look for Argon2id, scrypt or bcrypt with a salt, and find where the parameters are stored and how they can be upgraded.` },
    { t: `Look at what the cookie contains`, x: `It must be an opaque random id. If it is the member id or a readable value, authentication is broken.` },
    { t: `Check the cookie flags`, x: `HttpOnly, Secure and a SameSite value, with a domain and path that are as narrow as possible.` },
    { t: `Trace the login, reset and logout flows`, x: `Same error and similar timing for unknown users, reset tokens random and single use, sessions rotated at login and destroyed at logout.` },
    { t: `Add attempt limits and a way to revoke`, x: `Rate limit logins, support MFA for risky roles, and ensure a password change ends other sessions.` }
  ],
  mistakes: [
    { t: `A fast hash`, ctx: `The agent picks SHA-256 with a salt because "it is secure".`, fix: `Use a password hashing function. The goal is to be slow for the attacker, which general hashes are not.` },
    { t: `Rolling your own`, ctx: `A custom token scheme signs "memberId:expiry" with a homemade function.`, fix: `Use a vetted library or the framework's session support. Cryptography written from scratch is rarely right.` },
    { t: `Reset links that live forever`, ctx: `A password reset token is valid for days and can be used more than once.`, fix: `Short expiry, single use, stored hashed, and send a notice that the password changed.` }
  ],
  review: [
    `Which algorithm and parameters hash passwords, and how is an old hash upgraded?`,
    `What is inside the session cookie? Show its flags.`,
    `What does the login return for an unknown user and for a wrong password, and how fast?`,
    `How does a member end all their sessions? Show the test.`,
    `Red flag: a fast hash such as MD5 or SHA-256 for passwords, or an identifier the client can edit used as proof of identity.`
  ],
  exercise: {
    prompt: `The agent logs in a member and keeps the same session id as before login. Which attack does that allow and what is the fix?`,
    answer: `<p>Session fixation. An attacker gets a victim to use a known session id (for example through a crafted link or a shared computer). After the victim logs in, the attacker's copy of the id is now authenticated.</p><p>Fix: create a brand new session id at login and when privilege changes, discard the old one, and bind the cookie flags properly. Add a test that the id before and after login differs.</p>`
  },
  checklist: [
    `Passwords use Argon2id, scrypt or bcrypt with a salt, parameters stored.`,
    `The session cookie is a random opaque id with HttpOnly, Secure and SameSite.`,
    `Login errors do not reveal which accounts exist.`,
    `Sessions are rotated at login and revoked on logout or password change.`
  ],
  artifact: `Section 2 of the security review: the authentication design (hashing, session store, cookie flags, reset and logout flows) with the tests for each.`,
  agent: `The agent uses the framework's vetted session and password functions, never writes its own cryptography, produces the flow descriptions, and adds tests for session rotation, generic login errors and revocation.`,
  src: `OWASP Password Storage Cheat Sheet. OWASP Session Management Cheat Sheet. RFC 9106 Argon2. RFC 6265 HTTP State Management (cookies). OWASP API Security Top 10 (2023), API2 Broken Authentication. Backend from First Principles, chapter 15 (authentication, sessions, cookies) chapter topic only, text not read.`
},
{
  title: `Authentication: tokens and JWT trade-offs`,
  short: `Know what a bearer token proves, what JWT adds and removes, and when a plain session is the better answer.`,
  why: `Agents like JWT. It appears in many tutorials and feels modern. But a token you cannot revoke, stored where scripts can read it, is often a step backward from a session. A reviewer needs to ask for the reason a token was chosen and to know the specific mistakes that break it.`,
  concept: [
    `A <b>bearer token</b> proves identity to anyone who holds it, like a key. If it leaks, the finder can use it until it expires. So the design questions are: where is it stored, how long does it live, and can it be revoked?`,
    `A <b>JWT</b> (JSON Web Token, RFC 7519) is a signed JSON payload of <i>claims</i> (subject, expiry, roles) in three base64url parts: header, payload, signature. The server verifies the signature and trusts the claims without a lookup, which is why it scales across services. The payload is encoded, not encrypted, so anything in it is readable by the holder.`,
    `<b>Trade-offs.</b> Gains: stateless verification across services, no session store hit. Costs: <b>revocation is hard</b> (a valid token stays valid until expiry, so you need short lifetimes plus a refresh token or a deny list, which brings state back), claims can go stale (a demoted moderator keeps the role until expiry), and tokens grow large. For a browser app with one backend a server-side session is usually simpler and safer. Tokens suit service-to-service calls, mobile clients and APIs consumed by third parties.`,
    `<b>Common JWT failures</b> (see RFC 8725, JWT Best Current Practices): accepting the <code>alg: none</code> or letting the token choose the algorithm; using a weak or hard-coded shared secret; not checking <code>exp</code>, issuer and audience; putting secrets in the payload; and storing the token in <code>localStorage</code>, where any cross-site scripting (XSS) bug can read it. Verify with a fixed algorithm chosen by the server.`,
    `<b>OAuth 2.0</b> (RFC 6749) is a framework for delegating access, for example "sign in with another provider" or letting a third-party app act for a member with limited scope. It is not an authentication protocol by itself. If you need login through an identity provider, use OpenID Connect on top of it, with a well-maintained library.`
  ],
  terms: [
    [`Bearer token`, `A credential that works for whoever presents it.`],
    [`JWT`, `A signed JSON token of claims. Signed means tamper-evident, not secret.`],
    [`Access and refresh token`, `A short-lived token for calls, and a longer-lived one used only to get a new access token.`],
    [`Claim`, `A statement in the token, such as subject, expiry or role.`]
  ],
  example: {
    setup: `The agent replaces sessions with JWTs for the marketplace web app: 30 day expiry, signed with a secret from the source code, stored in <code>localStorage</code>, containing <code>{"sub": 42, "role": "moderator"}</code>.`,
    body: [
      `List the failures. A 30 day token cannot be revoked, so a stolen one is usable for a month. A hard-coded secret lets anyone with the repository forge tokens as any member. <code>localStorage</code> exposes the token to every script on the page. The role claim means demoting a moderator takes up to 30 days to take effect.`,
      `A defensible version: either go back to server-side sessions for the web app, or issue a 10 minute access token signed with a key from the secrets store and a rotating refresh token kept in an <code>HttpOnly</code> cookie that is revoked on logout and password change, with the algorithm fixed in the verifier and <code>exp</code>, <code>iss</code> and <code>aud</code> checked. Keep role changes effective by looking up current roles for sensitive actions.`
    ],
    table: {
      head: [`Need`, `Server session`, `JWT access token`],
      rows: [
        [`Instant revocation`, `Easy: delete the record`, `Hard: needs short expiry, refresh and a deny list`],
        [`Verify without a lookup`, `No: a store read per request`, `Yes: signature check`],
        [`Many services, one login`, `Needs a shared store`, `Natural fit`],
        [`Browser safety`, `HttpOnly cookie`, `Easy to store unsafely`],
        [`Third-party API clients`, `Awkward`, `Natural fit with OAuth scopes`]
      ]
    }
  },
  technique: [
    { t: `Ask why a token was chosen`, x: `If the answer is only "it is stateless", check that revocation and staleness were considered. Prefer sessions for a single browser app.` },
    { t: `Set short lifetimes`, x: `Minutes for access tokens, a longer rotating refresh token that can be revoked and is stored safely.` },
    { t: `Fix the verification rules`, x: `Algorithm chosen by the server, key from the secrets store, and exp, iss and aud checked on every request.` },
    { t: `Keep the payload minimal`, x: `Subject and expiry, plus coarse scope. Never secrets or personal data, since the payload is readable.` },
    { t: `Choose the storage place`, x: `HttpOnly Secure cookie for browsers. Never localStorage for long-lived or powerful tokens.` },
    { t: `Plan revocation`, x: `Decide how logout, password change and a stolen token end access, and test it.` }
  ],
  mistakes: [
    { t: `Believing signed means private`, ctx: `The token carries the member's email and phone number "because it is signed".`, fix: `Signed means unchangeable, not hidden. Put only what the holder may see.` },
    { t: `Long-lived tokens with no revocation`, ctx: `The token lives for 30 days and the only logout is deleting it on the client.`, fix: `Short access tokens, revocable refresh tokens, and server-side invalidation on logout.` },
    { t: `Letting the token pick the algorithm`, ctx: `The library trusts the <code>alg</code> header, so an attacker sets none or swaps an asymmetric algorithm for a symmetric one.`, fix: `Configure the exact allowed algorithm on the server and reject everything else.` }
  ],
  review: [
    `Why a token and not a session here? What is the revocation plan?`,
    `How long does the access token live, where is it stored, and where does the signing key come from?`,
    `Which checks does the verifier perform, and is the algorithm fixed by the server?`,
    `What is in the payload? Would we be comfortable if the member read it?`,
    `Red flag: a long-lived JWT in localStorage signed with a secret in the repository.`
  ],
  exercise: {
    prompt: `A moderator is removed from the team. The service uses 1 hour JWTs with a <code>role</code> claim and no refresh token. What can they still do, and what would you change?`,
    answer: `<p>For up to an hour they keep moderator rights, because the service trusts the claim without a lookup. For a sensitive action (hide an ad, ban a member) that is too long.</p><p>Options: shorten the token life, add a refresh step that re-reads roles, keep a deny list of revoked subjects checked on privileged routes, or check the current role in the database for moderator actions and keep the token only for identity. The cost of each option is a state lookup, which is the price of revocation.</p>`
  },
  checklist: [
    `There is a stated reason for tokens over sessions.`,
    `Access tokens are short lived and a revocation path exists.`,
    `The verifier fixes the algorithm and checks exp, iss and aud.`,
    `The signing key is in a secrets store and the payload holds no secrets.`,
    `The token is not kept in localStorage for powerful credentials.`
  ],
  artifact: `Section 3 of the security review: the token design (lifetimes, storage, verification rules, revocation plan) and the reason it was chosen over sessions.`,
  agent: `The agent defaults to server-side sessions for browser apps and proposes tokens only with a written reason. When it uses JWT it sets short lifetimes, fixed algorithms and a revocation test.`,
  src: `RFC 7519 JSON Web Token. RFC 8725 JSON Web Token Best Current Practices. RFC 6749 OAuth 2.0 Authorization Framework. OpenID Connect Core 1.0. OWASP JSON Web Token Cheat Sheet for Java and OWASP HTML5 Security Cheat Sheet (storage). Backend from First Principles, chapter 15 chapter topic only, text not read.`
},
{
  title: `Authorization: object-level and function-level checks`,
  short: `On every request, check that this caller may do this action to this exact record.`,
  why: `Authorization failures top the OWASP API list for good reason. The login works, the code is clean, and yet any member can read another member's messages by changing a number in the URL. Agents rarely write this check unless asked, because the feature works without it and the tests use one user.`,
  concept: [
    `<b>Authentication is not authorization.</b> Knowing who the caller is does not say what they may do. Authorization asks: may <i>this subject</i> perform <i>this action</i> on <i>this object</i>?`,
    `<b>BOLA</b> (Broken Object Level Authorization, API1 in the OWASP API Security Top 10, 2023, formerly called IDOR) happens when the API takes an object id from the request and does not check that the caller may access that object. Predictable ids make it easy to exploit, but random ids do not fix it: they only slow discovery. The check itself is the fix.`,
    `<b>BFLA</b> (Broken Function Level Authorization, API5) happens when an ordinary member can call an administrative function, for example <code>POST /admin/ads/{id}/hide</code>, because the route exists and no role check guards it. Hidden URLs are not access control.`,
    `<b>Where to check.</b> Put the check in one place that every route passes through, such as the service layer or a policy function, and make it the default. Prefer scoping the query: <code>SELECT ... FROM message WHERE message_id = ? AND conversation_id IN (SELECT conversation_id FROM participant WHERE member_id = ?)</code> returns nothing for a stranger, and there is no separate check to forget. A <b>deny by default</b> policy and consistent 403 or 404 behavior (404 hides the existence of the object) complete the design.`,
    `<b>Property level.</b> Even for an object the caller may read, some fields may not be allowed, such as a hidden phone number or moderator notes (API3), and some may not be written, which is the mass assignment issue in the API module.`
  ],
  terms: [
    [`BOLA`, `The API accepts an object id and does not check the caller's right to that object.`],
    [`BFLA`, `A caller reaches a function reserved for another role, such as an admin endpoint.`],
    [`Deny by default`, `Access is refused unless a rule explicitly allows it.`],
    [`Policy`, `A function or rule set that answers "may this subject do this action on this object?".`]
  ],
  example: {
    setup: `A member opens a conversation: <code>GET /conversations/9001/messages</code>. The agent checks that the session is valid and returns the rows for conversation 9001.`,
    body: [
      `Member A requests conversation 9002, which belongs to two other members. It returns their private messages. That is BOLA. The same hole exists in <code>DELETE /ads/{id}</code>, <code>PATCH /members/{id}</code> and <code>GET /conversations/{id}/messages</code>, and the agent's tests, which used a single test member, passed.`,
      `A solid fix has three parts: the query joins the participant table with the caller's id, the repository method takes the caller as an argument so it cannot be called without one, and a test logs in as member B and tries every object route belonging to A. For moderator endpoints, a role check runs in a shared guard, and a second test calls each admin route as an ordinary member and expects a refusal.`
    ],
    table: {
      head: [`Endpoint`, `Missing check`, `Fix`],
      rows: [
        [`GET /conversations/{id}/messages`, `Caller is a participant`, `Join participant on the caller id`],
        [`PATCH /ads/{id}`, `Caller owns the ad`, `Update with WHERE ad_id = ? AND member_id = ?`],
        [`GET /members/{id}`, `Private fields for other members`, `Separate public and private response types`],
        [`POST /admin/ads/{id}/hide`, `Caller has the moderator role`, `Guard on the admin route group`]
      ]
    }
  },
  technique: [
    { t: `List every endpoint that takes an object id`, x: `Path, query and body ids. These are the BOLA candidates.` },
    { t: `Name the rule for each`, x: `Owner, participant, moderator, public. Write it as subject, action, object.` },
    { t: `Enforce the rule in one place`, x: `Scope the query by caller or call a policy function the repository requires, and deny by default.` },
    { t: `List every privileged function`, x: `Admin and moderator routes, and role changes. Guard them as a group and test as a normal member.` },
    { t: `Test with two users`, x: `For each object route, create objects as A and attempt every action as B. A suite with one test user proves nothing here.` }
  ],
  mistakes: [
    { t: `Relying on unguessable ids`, ctx: `The ids are UUIDs, so the team decides ownership checks are optional.`, fix: `Ids leak through links, logs and shared screens. The ownership check is what protects data.` },
    { t: `Checking only in the UI`, ctx: `The web app hides the admin menu for ordinary members, but the route is open.`, fix: `Enforce roles on the server for every route, and test with an ordinary account.` },
    { t: `Trusting a role or id from the request body`, ctx: `The body contains <code>{"member_id": 7}</code> and the service uses it as the author.`, fix: `The actor always comes from the authenticated session, never from input.` }
  ],
  review: [
    `List the endpoints that take an object id. For each, show the line that checks the caller's right to that object.`,
    `Where is the policy written, and what happens by default when no rule matches?`,
    `Which routes are administrative, and what test calls them as an ordinary member?`,
    `Do the tests use two different members? Show the cross-user test.`,
    `Red flag: an object fetched by id alone, with no caller condition, followed by a check "later" or no check at all.`
  ],
  exercise: {
    prompt: `Write the two lines of SQL and the test for <code>POST /ads/{id}/images</code> so only the ad's owner can attach an image.`,
    answer: `<p>Verify ownership with a scoped query before inserting: <code>SELECT 1 FROM ad WHERE ad_id = ? AND member_id = ? AND status != 'deleted'</code>, bound to the id from the path and the member from the session. If no row, answer 404 (or 403) and insert nothing. Run both in one transaction, or use <code>INSERT ... SELECT ... WHERE EXISTS (...)</code>.</p><p>Test: member A creates an ad, member B posts an image to it and expects a refusal and no new <code>ad_image</code> row. A test where only A acts proves nothing.</p>`
  },
  checklist: [
    `Every id-taking endpoint has a named rule and an enforcing line.`,
    `The default is deny, and the check lives in one place.`,
    `Admin routes are guarded as a group and tested as an ordinary member.`,
    `The actor comes from the session, never from the request.`,
    `Tests use at least two members.`
  ],
  artifact: `Section 4 of the security review: an authorization matrix (endpoint, subject, action, object, rule, enforcing code, test).`,
  agent: `The agent produces the authorization matrix from the route table, scopes queries by the caller, adds the two-user tests, and lists any endpoint where it could not find a rule for your decision.`,
  src: `OWASP API Security Top 10 (2023): API1 Broken Object Level Authorization, API3 Broken Object Property Level Authorization, API5 Broken Function Level Authorization. OWASP Authorization Cheat Sheet. Backend from First Principles, chapter 17 (BOLA, BFLA) chapter topic only, text not read.`
},
{
  title: `Injection, XSS and CSRF`,
  short: `Keep data and code apart in queries, pages and cross-site requests.`,
  why: `These three classic attacks all come from one mistake: letting data be interpreted as something else. They are old, well understood and still found in new code, because string building feels natural and an agent's first draft often uses it.`,
  concept: [
    `<b>Injection.</b> If you build a query by joining strings, input can change the query's meaning. <code>"... WHERE title = '" + q + "'"</code> with <code>q = ' OR '1'='1</code> returns every ad, and worse inputs can read or change other tables. The fix is <b>parameterized queries</b> (prepared statements): the statement and the values travel separately, so a value is never parsed as SQL. The same holds for shell commands, LDAP and NoSQL filters. Identifiers (a sort column) cannot be parameters, so check them against an allow-list.`,
    `<b>Cross-site scripting (XSS).</b> If a page includes member-written text (an ad description) without encoding it, a script in that text runs in other members' browsers and can act as them. Defenses: encode output for its context (HTML, attribute, URL, script), prefer frameworks that encode by default, sanitize if you must allow rich text, and add a Content-Security-Policy as a second layer. Stored XSS in ad text is the marketplace's likely version.`,
    `<b>Cross-site request forgery (CSRF).</b> If the browser sends your session cookie automatically, another site can make it submit <code>POST /ads/9/delete</code> as the logged-in member. Defenses: <code>SameSite</code> cookies (Lax or Strict) as a baseline, an anti-CSRF token for state-changing requests, and checking the <code>Origin</code> header. Pure token-in-header APIs (no cookie authentication) are not exposed to CSRF in the same way, but they are exposed to XSS stealing the token.`,
    `<b>Related: SSRF</b> (server-side request forgery, API7 in the 2023 OWASP list). If the server fetches a URL supplied by a user, for example to preview a link in a message, an attacker can point it at internal addresses such as a cloud metadata endpoint. Allow-list hosts and block private address ranges after DNS resolution.`
  ],
  terms: [
    [`Parameterized query`, `A query where values are sent separately from the SQL text.`],
    [`Output encoding`, `Converting data so a browser shows it as text, not as markup or script.`],
    [`CSRF token`, `A secret value tied to the session and required on state-changing requests.`],
    [`SSRF`, `Making the server request an address of the attacker's choosing.`]
  ],
  example: {
    setup: `The agent adds ad search. It builds the SQL from the query string and the sort parameter, and renders the description in the ad page with a raw-HTML option "so that line breaks work".`,
    body: [
      `<pre>sql = "SELECT * FROM ad WHERE title ILIKE '%" + q + "%' ORDER BY " + sort</pre>`,
      `Three findings. The <code>q</code> concatenation is SQL injection: use <code>WHERE title ILIKE $1</code> with the pattern passed as a parameter. The <code>sort</code> value cannot be a parameter, so map it through an allow-list such as <code>{"newest": "created_at DESC", "price": "price ASC"}</code>. The raw-HTML option is stored XSS: a seller writes a script tag in a description and it runs for every visitor. Render as text and convert newlines, or run a vetted sanitizer with a short allowed tag list.`,
      `For CSRF, the site uses cookie sessions, so state-changing endpoints need SameSite cookies plus a token, and the agent must show the test where a forged cross-site post is refused.`
    ],
    table: {
      head: [`Attack`, `Where the data meets code`, `Primary defense`],
      rows: [
        [`SQL injection`, `Query text`, `Parameterized queries, allow-list for identifiers`],
        [`Stored XSS`, `HTML in a page`, `Context-aware output encoding, CSP as backup`],
        [`CSRF`, `A browser sending cookies on its own`, `SameSite, anti-CSRF token, Origin check`],
        [`SSRF`, `A URL the server fetches`, `Host allow-list, block private ranges`]
      ]
    }
  },
  technique: [
    { t: `Search the code for string-built queries`, x: `Any concatenation or formatting of input into SQL, shell or filter text is a finding. Replace with parameters.` },
    { t: `Allow-list what cannot be parameterized`, x: `Sort fields, column names and table names come from a fixed map, never from the request.` },
    { t: `Trace each piece of user text to the page`, x: `Find where it is rendered. Check the encoding for that context and any raw-HTML switch.` },
    { t: `Classify the session mechanism for CSRF`, x: `If cookies authenticate, require SameSite plus a token on writes. Test a forged cross-site request.` },
    { t: `List every place the server fetches a user-supplied URL`, x: `Apply a host allow-list and block internal ranges after resolving the name.` }
  ],
  mistakes: [
    { t: `Escaping by hand`, ctx: `A helper replaces quotes in input before concatenating. A multibyte or encoding trick slips through.`, fix: `Use parameters. Hand-written escaping is the weaker control.` },
    { t: `Validation as the only defense`, ctx: `The team strips the word "script" from input and calls XSS solved.`, fix: `Validate for correctness, but defend by encoding on output for the right context.` },
    { t: `GET requests that change state`, ctx: `<code>GET /ads/9/delete</code> is triggered by an image tag on another site.`, fix: `State changes use POST, PUT, PATCH or DELETE and carry CSRF protection.` }
  ],
  review: [
    `Show every place user input reaches SQL or a command. Is it a parameter in each?`,
    `Which values cannot be parameters, and where is their allow-list?`,
    `Where is member-written text rendered, and how is it encoded? Is there a raw-HTML switch?`,
    `How does the app defend cookie-authenticated writes against CSRF? Show the test.`,
    `Red flag: SQL assembled with string concatenation, or a raw-HTML flag turned on for user content.`
  ],
  exercise: {
    prompt: `A link preview feature fetches <code>url</code> from a chat message and shows the page title. List the risks and the controls.`,
    answer: `<p>SSRF: an attacker sends an internal address (a metadata service, an admin panel, localhost) and the server fetches it, perhaps leaking the response in the preview. Also: redirects to internal addresses, huge responses, slow responses, and a title containing script (XSS when rendered).</p><p>Controls: allow only http and https, resolve the name and block private and link-local ranges (and recheck after each redirect), cap response size, time and redirects, run the fetch in an isolated worker with no internal access, and encode the title on output.</p>`
  },
  checklist: [
    `No query is built by string concatenation, and identifiers come from allow-lists.`,
    `User text is encoded for its output context, with no unsafe raw-HTML paths.`,
    `Cookie-authenticated writes have SameSite plus a CSRF token or an Origin check.`,
    `Server-side URL fetches have a host allow-list and block internal ranges.`
  ],
  artifact: `Section 5 of the security review: the list of untrusted inputs with the sink (query, page, URL fetch, command) and the control for each, plus the tests that attack them.`,
  agent: `The agent writes parameterized queries and allow-lists, avoids raw-HTML rendering, adds CSRF protection to cookie-authenticated writes, and produces an input-to-sink table with attacking tests.`,
  src: `OWASP SQL Injection Prevention Cheat Sheet. OWASP Cross Site Scripting Prevention Cheat Sheet. OWASP Cross-Site Request Forgery Prevention Cheat Sheet. OWASP Server-Side Request Forgery Prevention Cheat Sheet. OWASP API Security Top 10 (2023), API7 Server Side Request Forgery. MDN, Set-Cookie SameSite attribute. Backend from First Principles, chapter 17 chapter topic only, text not read.`
},
{
  title: `Rate limiting and secrets`,
  short: `Limit what one caller can consume, and keep credentials out of code, logs and images.`,
  why: `Not every attack is a clever exploit. Many are volume: password guessing, scraping, spamming, expensive queries. And one leaked key can turn a small bug into a major breach. Both problems are controlled by limits and by where credentials live, and both are easy for an agent to forget when it is pleased that the feature works.`,
  concept: [
    `<b>Rate limiting</b> caps how many requests a caller can make in a time window. Common algorithms: a <b>fixed window</b> counter (simple, but allows a burst across a window edge), a <b>sliding window</b>, and a <b>token bucket</b> (tokens refill at a steady rate, a burst is allowed up to the bucket size). A shared store such as Redis keeps the counters so that all servers agree. The caller is identified by member id when logged in and by IP address when not, though IP is weak behind shared networks.`,
    `Limit by <b>cost</b>, not only by count: login attempts, password resets, phone reveals, search with wide filters and uploads deserve tighter limits than reading one ad. This is OWASP API4, Unrestricted Resource Consumption, and API6, Unrestricted Access to Sensitive Business Flows (scraping, spam). Also cap request size, page size, upload size and query time. Reply with 429 and a <code>Retry-After</code> header.`,
    `<b>Secrets</b> are credentials: database passwords, API keys, signing keys. Rules: never in the repository or in a container image, injected at runtime from a secrets manager or the platform, different per environment, least privilege per key, rotated on a schedule and after any suspected leak, and never written to logs. If a secret reached version control, treat it as leaked even if the commit was removed, and rotate it.`,
    `<b>Check at startup.</b> Fail fast if a required secret is missing or still has a placeholder value, as in the Mindset module's "fail fast at startup". Scrub secrets and personal data from logs and error messages, and use a secret scanner in the pipeline to catch accidents.`
  ],
  terms: [
    [`Token bucket`, `A limiter where tokens refill at a fixed rate and each request spends one.`],
    [`429`, `The HTTP status for too many requests, often with a Retry-After header.`],
    [`Secrets manager`, `A service that stores credentials and hands them to the application at runtime.`],
    [`Rotation`, `Replacing a secret with a new one on a schedule or after a leak.`]
  ],
  example: {
    setup: `The marketplace login and "send message" endpoints have no limits, and the agent put the database URL with its password in <code>config.example</code>, which the agent also copied to <code>config.prod</code> in the repository.`,
    body: [
      `Attack one: a bot tries a list of leaked passwords against the login endpoint at thousands of attempts per minute. Attack two: a spammer sends 10,000 messages from a new account in an hour. Attack three: someone reads the repository and has the production database password.`,
      `Controls (invented numbers): login 5 attempts per account per 15 minutes and a per-IP limit, with a slowdown or a challenge after repeated failures; messages 30 per member per hour, with a lower limit for accounts under a day old; both answer 429 with <code>Retry-After</code>. The database password moves to the platform's secret store, the file in the repository gets a placeholder, the old password is rotated because it was committed, and the service refuses to start without it.`
    ],
    table: {
      head: [`Endpoint`, `Limit key`, `Example limit (invented)`, `Why`],
      rows: [
        [`POST /login`, `Account and IP`, `5 per 15 min per account`, `Password guessing`],
        [`POST /conversations/{id}/messages`, `Member`, `30 per hour, lower for new accounts`, `Spam`],
        [`GET /ads/{id}/phone`, `Member`, `20 per day`, `Scraping`],
        [`GET /ads (search)`, `Member or IP`, `Cap page size and filter cost`, `Expensive queries`],
        [`POST /ads/{id}/images`, `Member`, `Size and count caps`, `Storage abuse`]
      ]
    }
  },
  technique: [
    { t: `List the abusable and costly endpoints`, x: `Login, reset, reveal phone, send message, search, upload, any call that costs money.` },
    { t: `Choose a key and a limit for each`, x: `Member id when known, otherwise IP, with a number grounded in normal use. Mark invented numbers as such.` },
    { t: `Pick the algorithm and the store`, x: `Token bucket or sliding window in a shared store, with a decision for what happens if the store is down (fail open or closed).` },
    { t: `Answer clearly`, x: `429, Retry-After, and a metric per rule so tuning and abuse are visible.` },
    { t: `Inventory the secrets`, x: `List each secret, who needs it, where it is stored, who rotates it and when. Scan the repository and the image.` }
  ],
  mistakes: [
    { t: `A limit by IP only`, ctx: `Everyone on a mobile carrier's shared address is blocked together, while an attacker rotates addresses freely.`, fix: `Combine member and IP keys and put the strictest limits on account-level actions.` },
    { t: `Secrets in the image or logs`, ctx: `The Dockerfile copies <code>.env</code>, and a debug log prints the whole configuration.`, fix: `Inject at runtime, add the file to ignore lists, and redact known secret fields in the logger.` },
    { t: `Rate limiter that fails with the store`, ctx: `If the limiter's Redis is down, every request errors and the site is down.`, fix: `Decide per endpoint: fail open for reads, fail closed for login, and alert on limiter errors.` }
  ],
  review: [
    `Which endpoints have limits, by what key and at what rate? Where do the numbers come from?`,
    `What does the client see when limited, and what happens when the counter store is unavailable?`,
    `List every secret and where it is stored. Is any in the repository, the image or a log?`,
    `Is there a rotation plan and a startup check that fails when a secret is missing?`,
    `Red flag: a credential in source control, a .env file in the image, or login and message endpoints with no limits.`
  ],
  exercise: {
    prompt: `A token-bucket rule allows a burst of 10 and refills 1 token every 6 seconds. A client sends 25 requests at once. How many succeed immediately and what is the steady rate?`,
    answer: `<p>The bucket holds 10 tokens, so the first 10 succeed and the other 15 get 429. After that, one request is admitted every 6 seconds, which is 10 per minute in steady state. If 25 is a normal burst for a legitimate client (a page that loads 25 resources), the bucket is too small, which is why the numbers should come from observed usage.</p>`
  },
  checklist: [
    `Costly and abusable endpoints have limits with a stated key and number.`,
    `Limited callers receive 429 with Retry-After and a metric exists.`,
    `The limiter's failure mode is decided per endpoint.`,
    `No secret is in the repository, image or logs, and the service checks them at startup.`,
    `Secrets have an owner and a rotation plan.`
  ],
  artifact: `Section 6 of the security review: the rate limit table (endpoint, key, limit, failure mode) and the secrets inventory (secret, store, owner, rotation).`,
  agent: `The agent adds limits to abusable endpoints with a documented key and rate, keeps secrets out of code and logs, fails at startup on missing configuration, and lists every secret in the inventory.`,
  src: `OWASP API Security Top 10 (2023): API4 Unrestricted Resource Consumption, API6 Unrestricted Access to Sensitive Business Flows. RFC 6585 (429 Too Many Requests). RFC 9110 (Retry-After). OWASP Secrets Management Cheat Sheet. Redis course on this site for counters and expiry. Backend from First Principles, chapters 17 and 12 chapter topic only, text not read. Limits are invented examples.`
},
{
  title: `Security headers and misconfiguration`,
  short: `Turn on the browser protections that cost one line, and remove the defaults that expose too much.`,
  why: `A large share of real breaches come from configuration, not from code: debug mode left on, a storage bucket made public, a default password, an old API version that nobody remembers. These are cheap to check and easy to miss, so a reviewer should look for them on purpose.`,
  concept: [
    `<b>Response headers</b> tell browsers to apply protections. <code>Strict-Transport-Security</code> (HSTS) makes browsers use HTTPS only for a period. <code>Content-Security-Policy</code> limits where scripts and other content may load from, and is a strong second layer against XSS. <code>X-Content-Type-Options: nosniff</code> stops browsers from guessing content types. <code>Referrer-Policy</code> limits what the Referer header leaks. <code>Cache-Control: no-store</code> on sensitive responses keeps them out of caches. Frame protection comes from the <code>frame-ancestors</code> directive of CSP, or the older <code>X-Frame-Options</code>.`,
    `<b>Transport.</b> Serve everything over TLS, redirect HTTP, and do not accept old protocol versions. Keep certificates renewed by automation, and use HSTS only after you are sure all subdomains support HTTPS.`,
    `<b>Misconfiguration</b> (API8 in the OWASP 2023 list) covers: debug and stack traces in production, verbose error messages, default or sample credentials, unneeded HTTP methods, directory listings, permissive CORS, public object storage, admin consoles on the open internet, and missing patches. <b>Improper inventory management</b> (API9) is the sibling: forgotten old versions (<code>/v1</code>), test endpoints and shadow services that were never secured or retired.`,
    `<b>Safe defaults.</b> Production configuration should differ from development in the secure direction: debug off, strict CORS, least privilege database roles (the application account cannot drop tables), and network rules that expose only the load balancer. Keep the same code and different configuration, validated at startup.`
  ],
  terms: [
    [`HSTS`, `A header telling browsers to use HTTPS only for a given time.`],
    [`CSP`, `Content-Security-Policy: a list of where the page may load scripts and other content from.`],
    [`Misconfiguration`, `A secure feature left off, or an insecure default left on.`],
    [`Inventory`, `The list of all endpoints, versions and services that are running.`]
  ],
  example: {
    setup: `Before launch the agent is asked to "harden" the marketplace API and web app. It adds HTTPS redirect and a CORS allow-list and reports done.`,
    body: [
      `Review the rest. Is debug mode off, and does a 500 return only a generic message and a request id? Does the web app send CSP and nosniff? Does the database role used by the service have only <code>SELECT, INSERT, UPDATE, DELETE</code> on its tables, with migrations run by a different role? Is the image bucket private, with images served through signed or public-read objects deliberately? Does <code>/v1</code> still exist from the prototype with no authentication, and is it in the contract at all?`,
      `A configuration review is a table with one row per item, the evidence (a command, a response header, a screenshot of the setting) and an owner. The agent can generate most of the evidence by running checks against a staging environment.`
    ],
    table: {
      head: [`Item`, `Check`, `Evidence`],
      rows: [
        [`Transport`, `HTTP redirects, HSTS present`, `Response headers from staging`],
        [`Browser protections`, `CSP, nosniff, Referrer-Policy`, `Response headers`],
        [`Errors`, `No stack traces or SQL in responses`, `A forced 500 request`],
        [`Database access`, `Application role cannot alter schema`, `Grants listing`],
        [`Storage`, `Buckets private unless intended`, `Bucket policy`],
        [`Inventory`, `No endpoint outside the OpenAPI contract`, `Route table diff`]
      ]
    }
  },
  technique: [
    { t: `Fetch the real response headers`, x: `Check HSTS, CSP, nosniff, Referrer-Policy and cache rules on a staging deployment, not in the code.` },
    { t: `Force an error and read it`, x: `Trigger a 500 and a 404. The body must be generic, and details must go to logs with the request id.` },
    { t: `Review privileges`, x: `Database roles, storage policies, cloud permissions and network exposure, each at least privilege.` },
    { t: `Diff reality against the contract`, x: `List the running routes and versions and compare with the OpenAPI document. Anything extra is a finding.` },
    { t: `Automate the checks`, x: `Run a header check and a dependency vulnerability scan in the pipeline, and fail the build on a regression.` }
  ],
  mistakes: [
    { t: `Debug on in production`, ctx: `A framework debug page shows environment variables and source when an error occurs.`, fix: `Debug off outside development, verified at startup and by a forced-error test.` },
    { t: `A forgotten old version`, ctx: `<code>/v1/ads</code> from the prototype skips rate limits and authorization added in v2.`, fix: `Keep an inventory, retire old versions on a date, and apply the same middleware to every version.` },
    { t: `Copying a strict CSP blindly`, ctx: `A copied policy breaks the site, so the agent loosens it to allow everything, which protects nothing.`, fix: `Start in report-only mode, fix the violations, then enforce a policy that names the real sources.` }
  ],
  review: [
    `Show the response headers of a staging page and an API response. Which protections are present?`,
    `What does a forced server error return? Where does the detail go?`,
    `What can the application's database role do? Who runs migrations?`,
    `Compare the running routes with the contract. What is extra, and what is the plan for old versions?`,
    `Red flag: debug mode, default credentials, wildcard CORS or a public bucket anywhere outside development.`
  ],
  exercise: {
    prompt: `A scan finds that <code>/admin</code> is reachable from the internet with the default framework login page. List what you would ask for, in order.`,
    answer: `<p>First, contain: restrict the route to a private network or an identity-aware proxy now. Second, check whether any default or shared credential exists and whether there are signs of use in logs. Third, rotate credentials and add multi-factor authentication for the admin function. Fourth, add the admin surface to the inventory and a test that it is not reachable publicly. Fifth, record why it was exposed (a missing network rule, a default config) and add a pipeline check so it cannot return.</p>`
  },
  checklist: [
    `HTTPS, HSTS, CSP, nosniff and Referrer-Policy are verified on a deployed environment.`,
    `Error responses are generic and carry a request id.`,
    `Database, storage and network access follow least privilege.`,
    `The route and version inventory matches the contract.`,
    `Header and dependency checks run in the pipeline.`
  ],
  artifact: `Section 7 of the security review, and the final <b>security review record</b>: threat table, authentication design, authorization matrix, input-to-sink table, limits and secrets, and the configuration checklist with evidence and an owner for every row.`,
  agent: `The <code>security-review</code> agent runs header and error checks against a staging deployment, diffs the live routes against the contract, scans dependencies and secrets, and assembles the full security review record for your sign-off.`,
  src: `OWASP Secure Headers Project. MDN Web Docs, Content-Security-Policy and Strict-Transport-Security. RFC 6797 HTTP Strict Transport Security. OWASP API Security Top 10 (2023): API8 Security Misconfiguration, API9 Improper Inventory Management. Backend from First Principles, chapter 17 chapter topic only, text not read.`
}
];
