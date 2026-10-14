Object.assign(SkillData.modules.find(m => m.id === 'delivery'), {
  status: 'ready',
  goal: `Be able to review how a service is packaged, run and shipped. You read a Dockerfile and a Kubernetes manifest for risk, check that a pipeline builds once and promotes the same artifact, and ask for a release strategy and a rollback that actually work with the database.`,
  competencies: [
    `Review container images for size, reproducibility and secrets.`,
    `Read Kubernetes manifests: replicas, probes, resources and configuration.`,
    `Judge CI/CD pipelines: build once, scoped credentials, post-deploy checks.`,
    `Choose rolling, blue-green or canary releases and write a working rollback.`,
    `Keep environments aligned and secrets scoped and rotatable.`
  ],
  artifact: `A delivery pipeline definition with a rollback plan: the image recipe, the runtime manifests, the pipeline stages, the release strategy and the environment and secret rules.`,
  agent: `The agent, using this skill, writes the Dockerfile, the manifests and the pipeline, splits risky changes into backward-compatible releases, and attaches a rehearsed rollback and a secret handling plan.`,
  skillName: 'delivery'
});
delete SkillData.modules.find(m => m.id === 'delivery').outline;
SkillData.modules.find(m => m.id === 'delivery').skillDescription = "Ship backend changes safely: container images, orchestration basics, CI/CD pipelines, rolling, blue-green and canary releases, rollback, environments, config and secrets, backward-compatible migrations. Use for Dockerfiles, Kubernetes manifests, pipelines, release plans or rollback design.";
