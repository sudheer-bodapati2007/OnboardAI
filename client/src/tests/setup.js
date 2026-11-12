// src/tests/setup.js
import '@testing-library/jest-dom/vitest';

// jsdom does not implement scrollIntoView (used by chat pages to autoscroll).
// Stub it as a no-op so components that scroll on update render cleanly.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
