/* Delivery: five lessons. Running scenario: a classifieds marketplace. All numbers are invented examples.
 * Sources named per lesson: Docker documentation (Dockerfile best practices, multi-stage builds), Kubernetes documentation (Deployments, Services,
 * ConfigMaps, Secrets, probes), J. Humble and D. Farley, Continuous Delivery (2010), The Twelve-Factor App, Google SRE Workbook (canarying releases).
 * Topic list informed by Backend from First Principles (chapter on delivery and deployment), re-expressed as reviewer habits. */
window.SkillData = window.SkillData || { lessons: {}, diagrams: {} };
SkillData.lessons['delivery'] = [
{
  title: `Containers and images`,
  short: `Package the service so it runs the same everywhere, small, reproducible and without secrets inside.`,
  why: `Agents write a Dockerfile that works on the first run and is wrong in ways that only show later: a 1.2 GB image, a process running as root, a secret baked into a layer, a build that gives a different result next week. The reviewer reads the Dockerfile as a security and reliability document.`,
  concept: [
    `A <b>container</b> is a normal process started with isolated views of the file system, network and process table, using kernel features. It is not a virtual machine: it shares the host kernel. An <b>image</b> is the read-only package a container starts from: a stack of file system layers plus metadata such as the start command.`,
    `A <b>Dockerfile</b> is the recipe. Layers are cached in order, so put things that change rarely (the base image, dependency install) before things that change often (your source). A <b>multi-stage build</b> uses one stage with build tools to compile and a final small stage that copies only the result, which makes the image smaller and leaves compilers and source out of production. See the Docker documentation, "Best practices for writing Dockerfiles" and "Multi-stage builds".`,
    `Build for <b>reproducibility and least privilege</b>: pin the base image to a specific version (a digest is exact), install dependencies from a lock file, run as a non-root user, add a <code>.dockerignore</code> so local files, <code>.git</code> and <code>.env</code> do not enter the build, and never copy secrets into an image: anyone who can pull the image can read every layer. Configuration arrives at run time, as the reliability module explains.`
  ],
  terms: [
    [`Image`, `A read-only layered package from which containers are started.`],
    [`Layer`, `One step of the build. Unchanged layers are reused from cache.`],
    [`Multi-stage build`, `Build in one stage, copy only the output into a small final stage.`],
    [`Digest`, `A content hash that identifies exactly one image, unlike a movable tag such as latest.`],
    [`Registry`, `A server that stores and serves images.`]
  ],
  example: {
    setup: `The agent's first Dockerfile for the ad service: start from a full language image tagged <code>latest</code>, copy the whole directory, install, and run as root. The image is large and rebuilds slowly (invented sizes).`,
    body: [
      `Problems a reviewer finds: <code>latest</code> moves, so two builds a week apart differ. <code>COPY . .</code> before the dependency install busts the cache on every source change and also copies a local <code>.env</code> file with a database password into a layer. The process runs as root, so a bug that gives file access gives root in the container. The final image holds compilers and test files that production never uses.`,
      `The fix: a build stage on a pinned version installs dependencies from the lock file first, then copies source and compiles. A final stage starts from a small runtime base pinned by version or digest, copies only the built output, creates a non-root user, and sets the start command. <code>.dockerignore</code> excludes <code>.git</code>, <code>.env</code> and local files. The image drops from about 1.2 GB to about 150 MB (invented), pulls faster, rebuilds in seconds when only source changes, and contains no secret.`
    ],
    table: {
      head: [`Smell in the Dockerfile`, `Risk`, `Fix`],
      rows: [
        [`Base image tagged latest`, `Builds are not repeatable`, `Pin a version or digest`],
        [`COPY of the whole directory first`, `Cache busts, secrets copied`, `Copy lock files, install, then copy source, plus .dockerignore`],
        [`No USER instruction`, `Runs as root`, `Create and switch to a non-root user`],
        [`Build tools in the final image`, `Large, bigger attack surface`, `Multi-stage build`]
      ]
    }
  },
  technique: [
    { t: `Pin the base image`, x: `Use an explicit version, or a digest for exact reproducibility, and update it on purpose through a pull request.` },
    { t: `Order layers by change rate`, x: `Install dependencies from the lock file before copying source, so the cache works.` },
    { t: `Use a multi-stage build`, x: `Compile in a build stage and copy only the runtime output into a small final stage.` },
    { t: `Run as non-root`, x: `Create a user, own only what it needs, and switch with the USER instruction.` },
    { t: `Keep secrets and junk out`, x: `Add a .dockerignore. Inject secrets at run time. Scan the image for known vulnerable packages and for leaked secrets.` },
    { t: `Tag by commit`, x: `Tag each image with the commit it was built from, so every running version traces to source. Use the same image in every environment.` }
  ],
  mistakes: [
    { t: `Secrets in the image`, ctx: `A build argument or a copied <code>.env</code> puts the database password in a layer. Deleting the file in a later layer does not remove it from the earlier one.`, fix: `Never put secrets in a build. Inject them at run time and rotate any that leaked.` },
    { t: `Using latest in production`, ctx: `A rollback to "the previous latest" is impossible, because nobody knows what it was.`, fix: `Deploy immutable tags that name the commit.` },
    { t: `One image per environment`, ctx: `A different build for staging and production, so what was tested is not what ships.`, fix: `Build once, run the same image everywhere, change only configuration.` }
  ],
  review: [
    `Is the base image pinned, and who updates it?`,
    `Is there a multi-stage build, and what is in the final image besides the runtime output?`,
    `Which user does the process run as?`,
    `Show a search of the image layers and the repository for secrets. Is a .dockerignore present?`,
    `Red flag: a secret in a build argument, an environment line in the Dockerfile, or an image tagged only latest.`
  ],
  exercise: {
    prompt: `Write the six review questions you would ask about this one line: <code>COPY . /app</code> as the first instruction after <code>FROM node:latest</code>.`,
    answer: `<p>(1) Which exact version is "latest" today, and how do we rebuild the same thing in a month? (2) Does the directory contain <code>.env</code> or credentials, and is there a .dockerignore? (3) Why copy before installing dependencies, given that it breaks caching? (4) Do tests, source maps and build tools need to be in the final image? (5) Which user runs the process? (6) What tag identifies the built image, and can we deploy the previous one by tag?</p>`
  },
  checklist: [
    `The base image is pinned and updated deliberately.`,
    `Layers are ordered so dependency installs are cached.`,
    `A multi-stage build produces a small runtime image.`,
    `The process runs as a non-root user.`,
    `No secrets in the image, and a .dockerignore exists.`,
    `Images are tagged by commit and are the same in every environment.`
  ],
  artifact: `Section 1 of the delivery pipeline definition: the image recipe, its base, tag rule and scan.`,
  agent: `The agent writes a multi-stage Dockerfile and a .dockerignore, pins versions, adds a non-root user, runs an image and secret scan, and prints the image size and the tag rule.`,
  src: `Docker documentation: "Best practices for writing Dockerfiles" and "Multi-stage builds". The Twelve-Factor App, factors I (Codebase), II (Dependencies) and V (Build, release, run). Backend from First Principles, chapter on delivery (topic list).`
},
{
  title: `Orchestration basics with Kubernetes concepts`,
  short: `Describe the desired state, and let the platform keep it true: replicas, restarts, discovery and limits.`,
  why: `An agent can write a pile of YAML that applies cleanly and still has no probes, no resource limits and one replica. The reviewer needs enough vocabulary to read the manifest and to ask what happens when a node dies or a deploy begins.`,
  concept: [
    `An <b>orchestrator</b> runs containers across many machines and keeps them in the state you declared. In Kubernetes you declare <i>desired state</i> as objects, and controllers work to make reality match it. This site's Kubernetes course explains the control loop, the API server and etcd in depth, and this lesson uses only the vocabulary a reviewer needs.`,
    `A <b>Pod</b> is the smallest unit: one or more containers that share a network address. A <b>Deployment</b> manages a set of identical Pods with a given number of <b>replicas</b>, replaces failed ones and performs rolling updates. A <b>Service</b> gives a stable address and load balancing over the Pods that match its label selector. <b>ConfigMap</b> and <b>Secret</b> objects hold configuration, passed in as environment variables or files. An <b>Ingress</b> or gateway routes outside traffic to Services.`,
    `Two settings are the usual gaps. <b>Resource requests and limits</b>: the request is what the scheduler reserves for the Pod, and the limit caps use (a Pod over its memory limit is killed). <b>Probes</b>: the liveness and readiness checks from the reliability module are declared here, and a rolling update waits for readiness before it sends traffic. Run at least two replicas for any service that must stay up through a node failure or a deploy.`
  ],
  terms: [
    [`Desired state`, `What you declared should be true. The controllers make it so.`],
    [`Pod`, `One or more containers scheduled together on a node.`],
    [`Deployment`, `Manages replicas of a Pod template and its updates.`],
    [`Service`, `A stable name and address that balances over matching Pods.`],
    [`Requests and limits`, `The reserved amount of CPU and memory, and the cap on use.`]
  ],
  example: {
    setup: `The agent produces a Deployment for the ad service. A reviewer reads it for what happens at three moments: a node dies, a deploy starts, a traffic spike arrives.`,
    body: [
      `The manifest says <code>replicas: 1</code>, has no probes and no resources. Node dies: the only Pod is gone until it is rescheduled, which means downtime. Deploy starts: the new Pod is considered ready the moment its container starts, so traffic reaches it before the app is listening, and requests fail. Spike: with no CPU or memory requests the scheduler may pack many Pods on one node, and with no memory limit one leaking Pod can starve its neighbours.`,
      `The reviewed version sets 3 replicas spread over nodes, a readiness probe on <code>/readyz</code>, a liveness probe on <code>/livez</code>, CPU and memory requests based on measured use with a memory limit above the observed peak, and the image tagged with the commit. A Service selects the Pods by label. A rolling update then replaces Pods one at a time, each new Pod taking traffic only after readiness passes. The numbers for requests and limits come from measurement, and any guess is labelled as one.`
    ],
    table: {
      head: [`Object`, `Job`, `Reviewer question`],
      rows: [
        [`Deployment`, `Replicas and rolling updates`, `How many replicas, and what update strategy?`],
        [`Service`, `Stable address and balancing`, `Which labels does it select, and which port?`],
        [`ConfigMap and Secret`, `Run-time configuration`, `Which values are secrets, and who can read them?`],
        [`Probes`, `Health and readiness`, `Do they match the app endpoints and timings?`],
        [`Requests and limits`, `Scheduling and protection`, `Where do the numbers come from?`]
      ]
    }
  },
  technique: [
    { t: `Declare, do not script`, x: `Keep manifests in the repository as the source of truth, and change the cluster only through them.` },
    { t: `Set the replica count on purpose`, x: `At least two for services that must stay up, with the reason written down.` },
    { t: `Wire the probes`, x: `Point readiness and liveness at the endpoints from the reliability module, with timings that suit the startup time.` },
    { t: `Set requests and limits from data`, x: `Measure real CPU and memory under load and set values with headroom. State the source of each number.` },
    { t: `Use labels and Services for discovery`, x: `Pods find each other by Service name, never by Pod address.` },
    { t: `Keep config outside the image`, x: `Use ConfigMaps and Secrets and restrict who can read the Secrets.` }
  ],
  mistakes: [
    { t: `A single replica`, ctx: `The service runs one Pod, so every deploy and node maintenance is an outage.`, fix: `Run at least two replicas and spread them across nodes.` },
    { t: `No readiness probe`, ctx: `New Pods get traffic while still starting, and users see errors on every deploy.`, fix: `Add a readiness probe that reflects real ability to serve.` },
    { t: `Believing a Secret is encrypted`, ctx: `A Kubernetes Secret is only base64-encoded by default, and anyone with read access to the namespace can decode it.`, fix: `Limit access with RBAC, consider encryption at rest and an external secret manager.` }
  ],
  review: [
    `How many replicas are there, and what happens to traffic if a node fails?`,
    `Which probes are defined, and do they hit the endpoints of the reliability module?`,
    `Where do the resource requests and limits come from?`,
    `Which settings are in ConfigMaps and which in Secrets, and who can read the Secrets?`,
    `Red flag: a manifest with one replica, no probes and no resource settings.`
  ],
  exercise: {
    prompt: `Name what must be in a Deployment for the message service so that a rolling deploy causes zero failed requests. Mention three items from this lesson and one from the reliability module.`,
    answer: `<p>At least two replicas, a readiness probe that passes only when the instance can serve, and a rolling update strategy that does not remove old Pods before new ones are ready (set the allowed unavailable and surge counts explicitly). From the reliability module: graceful shutdown on SIGTERM, with a drain shorter than the termination grace period, so requests already running finish. Resource requests also matter, so the new Pods can be scheduled.</p>`
  },
  checklist: [
    `Manifests are in the repository and are the source of truth.`,
    `At least two replicas for services that must stay up.`,
    `Readiness and liveness probes are set and match the app.`,
    `Requests and limits come from measurement.`,
    `Secrets are separated from ConfigMaps, with access limited.`
  ],
  artifact: `Section 2 of the delivery pipeline definition: the runtime manifests with replicas, probes, resources and configuration.`,
  agent: `The agent writes the Deployment, Service, probes, resource settings and config objects, explains the source of each number, and runs a dry-run and a manifest lint before proposing the change.`,
  src: `Kubernetes documentation: "Deployments", "Service", "ConfigMaps", "Secrets" (including the note that Secret values are base64 encoded) and "Configure Liveness, Readiness and Startup Probes". This site's Kubernetes internals course (control loop, etcd, scheduler, rollout).`
},
{
  title: `CI/CD pipelines`,
  short: `Build once, test, and promote the same artifact through stages, with every step automated and every change traceable.`,
  why: `A pipeline is the machine that turns a commit into running software. An agent can write one that works, but the reviewer must check that it builds once, promotes the same artifact, holds credentials safely and cannot ship untested code.`,
  concept: [
    `<b>Continuous integration</b> (CI) means every change is merged into the main line often and automatically built and tested. <b>Continuous delivery</b> means every merged change is always in a state that could be released, and a release is a decision and a button. <b>Continuous deployment</b> goes one step further and releases every passing change automatically. J. Humble and D. Farley describe the <i>deployment pipeline</i> as the path a change takes through stages of increasing confidence.`,
    `The key rule is <b>build once, deploy the same artifact everywhere</b>. The commit builds one image, tagged with the commit id. Staging and production run that exact image with different configuration. If production gets a rebuilt image, what you tested is not what you shipped.`,
    `Pipeline <b>safety</b>: credentials for deploying are the most powerful secrets you have, so keep them in the CI secret store, scope them to the environment, prefer short-lived credentials, and never print them in logs. Require review and passing gates for the main branch. Record who deployed what and when. Treat the pipeline definition as code in the repository, reviewed like any other.`
  ],
  terms: [
    [`Continuous integration`, `Merge small changes often and build and test each one automatically.`],
    [`Continuous delivery`, `Every passing change is releasable, and releasing is a deliberate step.`],
    [`Artifact`, `The built output, such as an image, that moves through the stages.`],
    [`Promotion`, `Moving the same artifact from one environment to the next.`],
    [`Pipeline as code`, `The pipeline definition lives in the repository and is reviewed.`]
  ],
  example: {
    setup: `The agent proposes a pipeline: on push to main, build and test, then deploy to production using a long-lived admin token (invented design). A reviewer lists what is missing.`,
    body: [
      `Problems: there is no staging step, so the first real run of a change is in production. The image is built again in the deploy job, so it is not the one that was tested. The admin token has rights far beyond deployment and is stored in plain settings. There is no record linking a running version to a commit, and no automatic check that the deploy worked.`,
      `The reviewed pipeline: pull request runs the gates from the quality module. On merge, one job builds the image and pushes it with the commit tag. A deploy job applies it to staging with staging configuration, then runs the smoke test and E2E journeys. Promotion to production is the same image and tag, with production configuration, using a deploy credential limited to that namespace. After the rollout a verification step checks the readiness of the new Pods and the error rate against the service level objective, and fails the pipeline, triggering rollback, if they are bad.`
    ],
    table: {
      head: [`Stage`, `Input`, `Output`, `Gate`],
      rows: [
        [`Pull request`, `Source change`, `Pass or fail`, `Lint, tests, migration check`],
        [`Build`, `Merged commit`, `Image tagged with the commit`, `Scan for secrets and vulnerabilities`],
        [`Staging deploy`, `The same image`, `Running staging release`, `Smoke test, E2E journeys`],
        [`Production deploy`, `The same image`, `Running production release`, `Approval if required, post-deploy SLO check`]
      ]
    }
  },
  technique: [
    { t: `Define the stages and gates`, x: `Write what enters and leaves each stage and what blocks it.` },
    { t: `Build the artifact once`, x: `One build per commit, tagged with the commit id, stored in the registry and reused by every stage.` },
    { t: `Separate build from deploy credentials`, x: `Give each job the least rights it needs, scoped to its environment, kept in the CI secret store.` },
    { t: `Automate verification after deploy`, x: `A smoke test and a check of the health and error signals, with automatic rollback on failure.` },
    { t: `Record the trace`, x: `Link each running version to its commit, the author, the pipeline run and the time. Announce deploys where the team can see them.` },
    { t: `Keep the pipeline fast and reviewed`, x: `Review changes to the pipeline like code, and cut stages that exceed their time budget.` }
  ],
  mistakes: [
    { t: `Rebuilding per environment`, ctx: `Each environment's job builds from source, so a dependency update between builds changes what ships.`, fix: `Build once and promote the identical image.` },
    { t: `A powerful long-lived token`, ctx: `One admin credential is used by every job and leaks through a log line.`, fix: `Scoped, short-lived credentials per environment, and masked logs.` },
    { t: `No post-deploy verification`, ctx: `The pipeline ends at "applied". A broken release is found by users.`, fix: `Verify readiness and key signals, and roll back automatically on failure.` }
  ],
  review: [
    `Is the image built once per commit and promoted unchanged? Show the tag in each environment.`,
    `Which credentials does each job hold, and what can they do?`,
    `What does the pipeline check after a deploy, and what happens if it fails?`,
    `Can I find the commit, author and pipeline run for the version running now?`,
    `Red flag: production deployed from a rebuilt image or with a broad, long-lived credential.`
  ],
  exercise: {
    prompt: `Describe the smallest pipeline for the ad service that satisfies build once, promote the same artifact, and verify after deploy. Name the jobs and what each outputs.`,
    answer: `<p>Job 1 (test): runs the quality gates on the pull request. Job 2 (build): on merge, builds the image once, tags it with the commit id, scans it and pushes it to the registry. Job 3 (staging): applies the manifests with that tag and staging configuration, then runs the smoke test and journeys. Job 4 (production): applies the same tag with production configuration using a production-scoped credential, waits for the rollout to become ready, then checks the error and latency SLIs for a short window and fails (with rollback) if they breach. Output of each job is a pass or fail plus the commit, tag and run id recorded.</p>`
  },
  checklist: [
    `The pipeline is code in the repository and is reviewed.`,
    `An image is built once per commit and promoted unchanged.`,
    `Deploy credentials are scoped, short-lived where possible, and masked in logs.`,
    `Post-deploy verification exists and can trigger rollback.`,
    `Every running version traces to a commit and a pipeline run.`
  ],
  artifact: `Section 3 of the delivery pipeline definition: the stages, gates, credentials and verification steps.`,
  agent: `The agent writes the pipeline definition with one build and promotion of that artifact, scopes the credentials, adds the post-deploy check and rollback trigger, and lists the secrets it needs from a human.`,
  src: `J. Humble and D. Farley, Continuous Delivery (2010), chapters on the deployment pipeline. The Twelve-Factor App, factor V (Build, release, run). Backend from First Principles, chapter on delivery (topic list). Your CI product's documentation for secret stores and scoped credentials.`
},
{
  title: `Deployment strategies and rollback`,
  short: `Choose how new code meets traffic, limit the blast radius, and make going back as practiced as going forward.`,
  why: `Every deployment is a risk. An agent will often propose "just roll it out" or an elaborate canary with no stated reason. The reviewer asks what the release does if it is wrong, how fast it is noticed, and how fast it is undone.`,
  concept: [
    `A <b>rolling update</b> replaces old instances with new ones a few at a time, so capacity stays up and old and new versions run side by side for a while. Kubernetes Deployments do this by default, controlled by how many Pods may be unavailable and how many extra may be created at once.`,
    `A <b>blue-green</b> release runs a full copy of the new version (green) beside the current one (blue) and switches traffic over at once. It gives a fast rollback (switch back) at the cost of double capacity during the release and of keeping the data compatible with both. A <b>canary</b> release sends a small share of real traffic, for example 1 and then 5 and then 25 percent, to the new version and compares its error and latency signals with the old before going on. The SRE Workbook chapter on canarying releases describes the method and its risks.`,
    `The hardest part of rollback is <b>state</b>. Code can be rolled back in a minute, but a schema change or written data cannot. Rely on the <b>expand and contract</b> pattern from the data modeling module (lesson "Changing a live schema safely"): add the new structure first, deploy code that works with both, and remove the old structure only later. Then both the old and the new code run against the same database, and rollback is safe. Feature flags let you separate deploying code from turning behavior on, with an instant off switch.`
  ],
  terms: [
    [`Rolling update`, `Replace instances gradually so capacity stays up.`],
    [`Blue-green`, `Two full environments, switch traffic between them.`],
    [`Canary`, `Send a small share of traffic to the new version and compare it with the old.`],
    [`Feature flag`, `A setting that turns behavior on or off without a deploy.`],
    [`Blast radius`, `How many users a bad change can affect.`]
  ],
  example: {
    setup: `A release changes how ad prices are stored: from a text column to amount and currency columns, and the code now reads the new ones (the migration example of the data modeling module). Invented numbers throughout.`,
    body: [
      `Naive plan: run one migration that renames and drops the old column, deploy the new code with a rolling update, and if it fails, redeploy the old code. During the rolling update some Pods are old and expect the old column, which is gone, so they error. And the redeploy of the old code cannot work, because the column it needs was dropped. Rollback is impossible.`,
      `Safe plan: Release 1 expands: add the nullable new columns, write both old and new, and backfill. Release 2 reads the new columns, behind a feature flag, as a canary at 1 then 10 percent, watching the error rate and latency SLIs against the baseline, with an automatic abort if the error share exceeds the threshold for 5 minutes. If it looks bad, turn the flag off or roll the Deployment back. Release 3, weeks later, contracts: drop the old column when no code reads it. At every point the previous release still works against the current schema.`
    ],
    table: {
      head: [`Strategy`, `Blast radius`, `Rollback speed`, `Cost`],
      rows: [
        [`Rolling update`, `Grows as new Pods replace old`, `Minutes, roll back the Deployment`, `Low`],
        [`Blue-green`, `All users at the switch`, `Seconds, switch back`, `Double capacity for the release`],
        [`Canary`, `A small share first`, `Fast, stop sending traffic`, `Needs good signals and traffic routing`],
        [`Feature flag`, `Chosen share of users`, `Instant, turn the flag off`, `Flag code to maintain and remove later`]
      ]
    }
  },
  technique: [
    { t: `Choose the strategy from the risk`, x: `Match the strategy to blast radius and rollback needs. A rolling update suits small compatible changes, canary or blue-green suit risky ones.` },
    { t: `Make every release backward compatible`, x: `The previous version must still work with the new schema and messages. Use expand and contract for data changes.` },
    { t: `Define abort conditions in advance`, x: `State the signals and thresholds that stop the rollout or roll it back, tied to the SLIs.` },
    { t: `Separate deploy from release`, x: `Ship code dark behind a flag, then turn it on gradually. Keep a rule to remove old flags.` },
    { t: `Write and rehearse the rollback`, x: `A numbered plan with who does it and how long it takes. Practice it in staging.` },
    { t: `Know the one-way doors`, x: `Mark steps that cannot be undone, such as dropping a column or sending an email, and slow those down for human review.` }
  ],
  mistakes: [
    { t: `A rollback plan that does not work`, ctx: `"Redeploy the previous version" after a migration dropped the column the old code needs.`, fix: `Keep schema changes backward compatible across at least one release and test the rollback.` },
    { t: `A canary with no signals`, ctx: `5 percent of traffic goes to the new version but nobody compares its error rate with the old.`, fix: `Define the signals and the abort threshold before the release.` },
    { t: `Permanent feature flags`, ctx: `Flags from last year still change behavior and nobody knows the combinations.`, fix: `Each flag has an owner and a removal date.` }
  ],
  review: [
    `Which strategy does this release use, and why is that right for its risk?`,
    `Do the old and new versions both work against the database during the release?`,
    `What are the abort signals and thresholds, and does anything act on them automatically?`,
    `Show the rollback steps, the time they take, and when they were last tested.`,
    `Red flag: a release that drops or renames a column in the same step as the code that stops using it.`
  ],
  exercise: {
    prompt: `Plan the release of a new "report reason" column that becomes required, so that rollback stays possible. Give the three releases and the abort rule.`,
    answer: `<p>Release 1 (expand): add the column as nullable, deploy code that writes it when present and tolerates null on reads. Backfill old rows with a default reason in batches. Release 2: add a check that no nulls remain, then set the column not null and make the API require it, behind a flag, canary at a small share. Abort and flip the flag off if the 4xx or 5xx share on the report endpoint rises above the baseline by a stated margin for several minutes. Release 3 (contract): remove the tolerance code and the flag. At each step the previous release still works with the schema.</p>`
  },
  checklist: [
    `The strategy is chosen from the blast radius and the rollback need.`,
    `Each release works with both the previous and the next schema.`,
    `Abort signals, thresholds and actions are defined before the release.`,
    `Rollback is written down, timed and rehearsed.`,
    `Irreversible steps are marked and reviewed by a person.`
  ],
  artifact: `Section 4 of the delivery pipeline definition: the release strategy, the abort rule and the rollback plan.`,
  agent: `The agent splits a risky change into backward-compatible releases in expand, migrate, contract order, proposes the strategy and abort thresholds, and writes the rollback steps with a staging rehearsal.`,
  src: `Google SRE Workbook, chapter "Canarying Releases". Kubernetes documentation, "Deployments" (rolling update, rollout status and undo). J. Humble and D. Farley, Continuous Delivery (2010), on blue-green deployment and releasing. Expand and contract: see the data modeling module of this course.`
},
{
  title: `Environments, configuration and secrets`,
  short: `Keep environments alike except for configuration, and handle secrets so a leak is small and recoverable.`,
  why: `Most "works on staging" incidents come from environments that differ in unnoticed ways, and most security incidents in delivery come from a secret in the wrong place. The reviewer checks both.`,
  concept: [
    `An <b>environment</b> is a place the software runs with its own data and settings: local development, test, staging, production. Aim for <b>parity</b>: the same image, the same database engine and version, the same topology in miniature, so that staging results predict production. The Twelve-Factor App (factor X, Dev/prod parity) argues for keeping the gap small. Differences should be only <i>configuration</i> (addresses, sizes, credentials) and are written down.`,
    `<b>Configuration</b> is kept out of the image and injected at run time, validated at startup as the reliability module requires. Environment-specific files are versioned in a repository so that a change is reviewed and can be reverted. <b>Secrets</b> need more: stored in a secret manager or an encrypted store, delivered only to the processes that need them, readable by few people, never in logs, images or the repository, and rotatable.`,
    `Plan for <b>leaks</b>. Each secret has an owner, a scope (one service, one environment), an expiry or rotation period, and a documented way to revoke and replace it. Prefer short-lived and automatically issued credentials to long-lived shared ones. Use separate credentials per environment so that a leaked staging key cannot touch production data. Never use production personal data in lower environments.`
  ],
  terms: [
    [`Environment parity`, `Keeping development, staging and production as alike as possible.`],
    [`Secret manager`, `A service that stores secrets encrypted and controls who can read them.`],
    [`Rotation`, `Replacing a secret with a new one on a schedule or after a leak.`],
    [`Least privilege`, `Each credential grants only what its user needs.`]
  ],
  example: {
    setup: `The marketplace has staging and production. A reviewer compares them and finds differences (invented findings).`,
    body: [
      `Staging uses a single small database of a different major version and has no read replica, so a query that depends on the newer version or on replica lag passes staging and fails in production. Staging uses the same payment API key as production because "it was easier". An old deploy script has the database password in plain text in the repository history.`,
      `The remediation: align the database version and shape, add a replica to staging at small size, give staging its own sandbox payment key, move every secret into the secret manager scoped by environment and service, rotate the password that was in history (deleting it from history does not undo the exposure), and keep a written table of the remaining differences. The pipeline reads the secret at deploy time through a scoped credential and never prints it.`
    ],
    table: {
      head: [`Item`, `Staging`, `Production`, `Allowed difference`],
      rows: [
        [`Image`, `commit tag`, `same commit tag`, `none`],
        [`Database engine and version`, `same`, `same`, `none`],
        [`Instance size and replicas`, `small`, `large`, `yes, capacity only`],
        [`Payment key`, `sandbox key`, `live key`, `yes, separate secret`],
        [`Data`, `synthetic`, `real`, `yes, never copy real personal data down`]
      ]
    }
  },
  technique: [
    { t: `Write the environment table`, x: `List what differs between environments and why. Everything not on the list must be identical.` },
    { t: `Align the engine and the topology`, x: `Same database engine and version, same kinds of components, scaled down in size only.` },
    { t: `Version the configuration`, x: `Environment files live in a repository, reviewed, with secrets referenced and not included.` },
    { t: `Store secrets in a manager`, x: `Encrypted, access controlled and audited. Deliver at run time to the process that needs them.` },
    { t: `Scope and separate`, x: `One credential per service and per environment, with least privilege. Staging cannot reach production data.` },
    { t: `Rehearse a leak`, x: `Know how to find where a secret is used, revoke it and issue a new one. Rotate on a schedule.` }
  ],
  mistakes: [
    { t: `Shared credentials across environments`, ctx: `Staging and production use the same database user, so a staging bug can modify production data.`, fix: `Separate credentials per environment and service, with least privilege.` },
    { t: `Secrets in the repository`, ctx: `A password committed once remains in history even after the file is removed.`, fix: `Treat it as leaked: rotate it, then move secrets to a manager and add secret scanning.` },
    { t: `Production data in staging`, ctx: `A copy of the member table is restored into staging for realistic tests.`, fix: `Use synthetic data, or properly masked data under the same protection as production.` }
  ],
  review: [
    `Show the table of differences between staging and production. Which are intentional?`,
    `Where is each secret stored, who can read it, and how is it rotated?`,
    `Can credentials from one environment access another?`,
    `If this key leaked today, what are the steps and how long would they take?`,
    `Red flag: a secret in the repository, the image or a log, or real member data in a lower environment.`
  ],
  exercise: {
    prompt: `The agent adds a new SMS provider key to the notification service. List where it must and must not appear, and how rotation works.`,
    answer: `<p>Must: in the secret manager, as separate values for staging (a sandbox key) and production, scoped so only the notification service in that environment can read it, and injected at run time as a secret the startup schema marks required. Must not: the repository, the Dockerfile, a build argument, the image, logs, error messages or a ConfigMap. Rotation: issue a new key at the provider, add it to the manager, roll the service so it picks it up, check that sends succeed, revoke the old key, and record the date and owner.</p>`
  },
  checklist: [
    `Environments differ only in a written list of configuration differences.`,
    `The database engine and version match across environments.`,
    `Configuration is versioned and reviewed, and secrets are not in it.`,
    `Secrets sit in a manager, scoped per service and environment.`,
    `A rotation and leak procedure exists and has been rehearsed.`,
    `No real personal data in lower environments.`
  ],
  artifact: `Section 5 of the delivery pipeline definition: the environment table, the configuration and secret handling rules and the rotation plan.`,
  agent: `The agent writes the environment table, moves secrets to references to the secret manager, adds a secret scan to the pipeline, and drafts the rotation steps for each secret it finds.`,
  src: `The Twelve-Factor App, factors III (Config) and X (Dev/prod parity), 12factor.net. Kubernetes documentation, "Secrets" and "Good practices for Kubernetes Secrets". Backend from First Principles, chapter on configuration and delivery (topic list). See the security module of this course for credential handling.`
}
];
