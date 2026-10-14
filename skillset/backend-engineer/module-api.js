Object.assign(SkillData.modules.find(m => m.id === 'api'), {
  status: 'ready',
  goal: `Be able to review an HTTP API and its request path: the protocol is used correctly, each rule sits in the right stage and layer, input is validated at the edge, lists and errors are consistent, and the whole thing is written down as a contract that tests can check.`,
  competencies: [
    `Use methods, status codes, caching headers and CORS as the protocol defines them.`,
    `Trace a request through its stages and place guards before the work they protect.`,
    `Design resources, one error model and stable pagination.`,
    `Validate and serialize at the boundary with separate request and response types.`,
    `Split controllers, services, repositories and middleware, with transactions in the service.`,
    `Write an OpenAPI contract first and detect breaking changes.`,
    `Design Protocol Buffers schemas that evolve safely, and gRPC services with the right call shapes, error codes and callers.`
  ],
  artifact: `An <b>API contract</b>: an OpenAPI document with the endpoint table (methods, status codes, caching), the request pipeline, the resource and error model, the field ownership table, the layer map, and a log of breaking changes with deprecation dates. For service-to-service calls it also holds the .proto schema with its field number table and the gRPC service definition.`,
  agent: `The agent, using the <code>api-design</code> skill, writes the contract first (OpenAPI for HTTP, protobuf and a service definition for gRPC), applies the lesson checklists (real status codes, one error shape, capped and indexed lists, separate request and response types, security on every operation), runs a lint and a breaking-change diff for both kinds of contract, and attaches contract tests.`,
  skillName: 'api-design'
});
delete SkillData.modules.find(m => m.id === 'api').outline;
SkillData.modules.find(m => m.id === 'api').skillDescription = "Design and review HTTP and gRPC APIs: methods and status codes, caching and CORS, REST resources, errors and pagination, validation at the boundary, layered code, an OpenAPI contract, and Protocol Buffers schemas and gRPC services. Use when designing endpoints or a .proto, reviewing an API, handler or schema, writing OpenAPI, choosing REST versus gRPC, or checking for breaking changes.";
