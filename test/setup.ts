import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia; useScrollLock and other hooks query it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom lacks ResizeObserver and IntersectionObserver (used by ReleaseGrid).
class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
window.ResizeObserver = window.ResizeObserver ?? class RO extends IO {};
window.IntersectionObserver = window.IntersectionObserver ?? class extends IO {};