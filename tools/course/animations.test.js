const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function context() {
  const ctx = { TextEncoder, TextDecoder };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ['assets/course/kit.js', 'assets/course/contract.js', 'assets/course/animations.js']) {
    if (fs.existsSync(path.join(root, file))) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
  }
  return ctx;
}

test('animation registration rejects duplicate names and invalid renderers', () => {
  const { Course } = context();
  assert.equal(typeof Course.registerAnimation, 'function');
  Course.registerAnimation('example', { mount() {} });
  assert.throws(() => Course.registerAnimation('example', { mount() {} }), /already registered/);
  assert.throws(() => Course.registerAnimation('broken', {}), /mount/);
});

test('animation mounting passes course data and mounts each host once', () => {
  const { Course } = context();
  assert.equal(typeof Course.mountAnimation, 'function');
  const definition = { kind: 'example', steps: [{ title: 'First', text: 'Start here.' }] };
  const host = { dataset: {} };
  let calls = 0;
  Course.registerAnimation('example', { mount(element, data) {
    assert.equal(element, host);
    assert.equal(data, definition);
    calls++;
  } });
  Course.mountAnimation(host, definition);
  Course.mountAnimation(host, definition);
  assert.equal(calls, 1);
  assert.throws(() => Course.mountAnimation({ dataset: {} }, { kind: 'missing' }), /not registered/);
});

test('scene rendering uses the complete scene and preserves escaped stat text', () => {
  const { Course } = context();
  assert.equal(typeof Course.registerScene, 'function');
  Course.registerScene('example', (stage, scene, index) => {
    stage.innerHTML = '<div>' + Course.kit.e(scene.steps[index].value) + '</div>';
    return 'a < b';
  });
  const result = Course.renderScene('example', { steps: [{ value: 'first' }, { value: '<second>' }] }, 1);
  assert.match(result.html, /&lt;second&gt;/);
  assert.equal(result.stat, 'a &lt; b');
  assert.equal(result.bare, true);
  assert.throws(() => Course.renderScene('missing', {}, 0), /not registered/);
});

test('course validation rejects unregistered and malformed animation definitions', () => {
  const ctx = context();
  for (const name of ['spec.js', 'uc-a.js', 'uc-b.js', 'uc-c.js', 'diagrams.js', 'paint.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'techstack/redis', name), 'utf8'), ctx);
  }
  const u = ctx.CourseData.uc.proto[0];
  delete u.kind;
  delete u.steps;
  u.animation = { kind: 'missing', steps: [] };
  let errors = ctx.Course.validate(ctx.CourseData).errors;
  assert.ok(errors.some(e => /animation.*not registered/.test(e)), errors.join('\n'));
  ctx.Course.registerAnimation('missing', { mount() {} });
  errors = ctx.Course.validate(ctx.CourseData).errors;
  assert.ok(errors.some(e => /animation.*steps/.test(e)), errors.join('\n'));
  u.animation.steps = [{ title: 'Start', text: 'Complete state.' }];
  assert.equal(ctx.Course.validate(ctx.CourseData).errors.length, 0);
});
