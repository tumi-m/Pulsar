import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";

// Each test re-imports the hook on a fresh module so the module-level lock
// counter is isolated (a leaked mount in one test can't affect another).
async function loadHook() {
  vi.resetModules();
  return (await import("@/lib/useScrollLock")).useScrollLock;
}

type Mq = (query: string) => MediaQueryList;
function setMobile() {
  (window as unknown as { matchMedia: Mq }).matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as Mq;
}
function setDesktop() {
  (window as unknown as { matchMedia: Mq }).matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as Mq;
}

beforeEach(() => {
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
});

describe("useScrollLock", () => {
  it("locks the page while active on mobile", async () => {
    setMobile();
    const useScrollLock = await loadHook();
    function Comp() {
      useScrollLock(true);
      return null;
    }
    const { unmount } = render(<Comp />);
    expect(document.body.style.position).toBe("fixed");
    unmount();
    expect(document.body.style.position).toBe("");
  });

  it("does not lock when inactive", async () => {
    setMobile();
    const useScrollLock = await loadHook();
    function Comp() {
      useScrollLock(false);
      return null;
    }
    const { unmount } = render(<Comp />);
    expect(document.body.style.position).not.toBe("fixed");
    unmount();
  });

  it("ref-counts stacked overlays — unlocks only when the last closes", async () => {
    setMobile();
    const useScrollLock = await loadHook();
    function Comp() {
      useScrollLock(true);
      return null;
    }
    const { unmount: u1 } = render(<Comp />);
    const { unmount: u2 } = render(<Comp />);
    expect(document.body.style.position).toBe("fixed");
    u1();
    expect(document.body.style.position).toBe("fixed"); // still locked by the second
    u2();
    expect(document.body.style.position).toBe(""); // released
  });

  it("does not lock on desktop (≥1024px side panels keep scrolling)", async () => {
    setDesktop();
    const useScrollLock = await loadHook();
    function Comp() {
      useScrollLock(true);
      return null;
    }
    const { unmount } = render(<Comp />);
    expect(document.body.style.position).not.toBe("fixed");
    unmount();
  });

  it("restores the saved offset instantly, not as a smooth animation", async () => {
    // The app sets `scroll-behavior: smooth` globally. Inheriting it turned the
    // restore into a ~500ms animation that other work could interrupt: closing
    // a sheet from 840px landed the feed at 209px. This pins the correction as
    // instant by checking the property is neutralised for the call itself —
    // asserting only the final offset would pass even while animating.
    setMobile();
    document.documentElement.style.scrollBehavior = "smooth";
    const useScrollLock = await loadHook();
    Object.defineProperty(window, "scrollY", { value: 840, configurable: true });
    let behaviourDuringScroll: string | null = null;
    const scrollTo = vi.fn(() => {
      behaviourDuringScroll = document.documentElement.style.scrollBehavior;
    });
    Object.defineProperty(window, "scrollTo", { value: scrollTo, configurable: true });

    function Comp() {
      useScrollLock(true);
      return null;
    }
    const { unmount } = render(<Comp />);
    expect(document.body.style.top).toBe("-840px");
    unmount();

    expect(scrollTo).toHaveBeenCalledWith(0, 840);
    expect(behaviourDuringScroll).toBe("auto");
    // …and the page's own preference is handed back afterwards.
    expect(document.documentElement.style.scrollBehavior).toBe("smooth");
  });
});
