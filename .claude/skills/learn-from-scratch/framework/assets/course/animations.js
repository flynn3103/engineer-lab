/* Optional course animations. Renderers live in assets; their scene and simulation data live in CourseData.
 * Register before Course.mount. Each route gets a fresh host, with no course-specific mounting hook. */
(function (root) {
  'use strict';
  const Course = root.Course = root.Course || {};
  const animations = Object.create(null), scenes = Object.create(null);
  Course.registerAnimation = (name, renderer) => {
    if (!renderer || typeof renderer.mount !== 'function') throw new Error('animation ' + name + ' needs a mount function');
    if (animations[name]) throw new Error('animation ' + name + ' is already registered');
    animations[name] = renderer;
  };
  Course.validateAnimation = definition => {
    const renderer = definition && animations[definition.kind];
    if (!renderer) return ['animation ' + (definition && definition.kind) + ' is not registered'];
    if (renderer.validate) return renderer.validate(definition);
    if (!Array.isArray(definition.steps) || !definition.steps.length) return ['animation ' + definition.kind + ' needs steps'];
    return definition.steps.flatMap((step, i) => step.title && step.text ? [] : ['animation ' + definition.kind + ' step ' + (i + 1) + ' needs title and text']);
  };
  Course.mountAnimation = (host, definition) => {
    if (host.dataset.ready) return;
    const errors = Course.validateAnimation(definition);
    if (errors.length) throw new Error(errors.join('; '));
    const keyboard = animations[definition.kind].mount(host, definition);
    host.dataset.ready = '1';
    return keyboard || (event => {
      const action = event.key === 'ArrowRight' ? 'next' : event.key === 'ArrowLeft' ? 'prev' : null;
      if (action) {
        const button = host.querySelector('[data-act=' + action + ']');
        if (button && !button.disabled) button.click();
      }
    });
  };
  Course.registerScene = (name, painter) => {
    if (typeof painter !== 'function') throw new Error('scene ' + name + ' needs a painter');
    if (scenes[name]) throw new Error('scene ' + name + ' is already registered');
    scenes[name] = painter;
  };
  Course.renderScene = (name, scene, index) => {
    if (!scenes[name]) throw new Error('scene ' + name + ' is not registered');
    const stage = { innerHTML: '' }, stat = scenes[name](stage, scene, index);
    return { html: '<div class="rs vz"><div class="vz-stage">' + stage.innerHTML + '</div></div>', stat: stat ? Course.kit.e(stat) : '', bare: true };
  };
  /* Shared controller for a scene with narration. Painters redraw the whole state, so Back and Restart need no replay. */
  Course.animationPlayer = (host, scene, painter, cls) => {
    host.innerHTML = '<div class="rs ' + cls + '"><div class="' + cls + '-stage" data-stage></div>' +
      '<div class="pk-check" data-stat aria-live="polite"></div><div class="rs-say" aria-live="polite"><span class="rs-n" data-n></span><div><b data-title></b><p data-text></p></div></div>' +
      '<div class="rs-play"><button type="button" data-act="first">Restart</button><button type="button" data-act="prev">← Back</button><button type="button" data-act="next" class="rs-go">Next step →</button><span class="rs-count" data-count></span></div></div>';
    const $ = selector => host.querySelector(selector), steps = scene.steps;
    let index = 0;
    function show() {
      $('[data-stat]').textContent = painter($('[data-stage]'), scene, index) || '';
      $('[data-n]').textContent = index + 1;
      $('[data-title]').textContent = steps[index].title;
      $('[data-text]').textContent = steps[index].text;
      $('[data-count]').textContent = 'step ' + (index + 1) + ' of ' + steps.length;
      $('[data-act=first]').disabled = $('[data-act=prev]').disabled = index === 0;
      $('[data-act=next]').disabled = index === steps.length - 1;
    }
    host.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.act === 'first') index = 0;
      else if (button.dataset.act === 'prev') index = Math.max(0, index - 1);
      else if (button.dataset.act === 'next') index = Math.min(steps.length - 1, index + 1);
      else return;
      show();
    });
    show();
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
