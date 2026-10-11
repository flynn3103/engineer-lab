/* Course-specific bindings to reusable scene painters in assets/course/animations. */
(function () {
  'use strict';
  const P = CourseData.PAINT = {};
  Object.values(CourseData.uc).flat().forEach(u => {
    if (u.scene) P[u.kind] = state => Course.renderScene(u.kind, u.scene, state.k);
  });
})();
