import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { useState } from "react";

/**
 * Stacked overlays must close one at a time. Before this, closing the inner one
 * with its ✕ closed the outer one too (the history.back() it issued reached the
 * outer overlay's popstate listener), and one Escape closed every open overlay.
 *
 * jsdom delivers popstate asynchronously after history.back(), like a browser,
 * so each step waits for it.
 */

async function load() {
  vi.resetModules();
  return (await import("@/lib/useBackClose")).useBackClose;
}

const tick = () => act(() => new Promise((r) => setTimeout(r, 20)));

function makeStack(useBackClose: (a: boolean, f: () => void) => void) {
  function Overlay({ name, open, onClose }: { name: string; open: boolean; onClose: () => void }) {
    useBackClose(open, onClose);
    return open ? <div data-testid={name}>{name}</div> : null;
  }
  return function Stack() {
    const [outer, setOuter] = useState(true);
    const [inner, setInner] = useState(true);
    return (
      <>
        <Overlay name="outer" open={outer} onClose={() => setOuter(false)} />
        <Overlay name="inner" open={inner} onClose={() => setInner(false)} />
        <button onClick={() => setInner(false)}>close inner</button>
      </>
    );
  };
}

beforeEach(() => {
  window.history.replaceState(null, "");
});

describe("useBackClose with stacked overlays", () => {
  it("closing the inner overlay with its button leaves the outer one open", async () => {
    const Stack = makeStack(await load());
    const { getByText, queryByTestId } = render(<Stack />);
    await tick();
    fireEvent.click(getByText("close inner"));
    await tick();
    expect(queryByTestId("inner")).toBeNull();
    expect(queryByTestId("outer")).not.toBeNull();
  });

  it("one Escape closes only the top overlay", async () => {
    const Stack = makeStack(await load());
    const { queryByTestId } = render(<Stack />);
    await tick();
    fireEvent.keyDown(window, { key: "Escape" });
    await tick();
    expect(queryByTestId("inner")).toBeNull();
    expect(queryByTestId("outer")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    await tick();
    expect(queryByTestId("outer")).toBeNull();
  });

  it("Back peels them off top-most first", async () => {
    const Stack = makeStack(await load());
    const { queryByTestId } = render(<Stack />);
    await tick();
    await act(async () => window.history.back());
    await tick();
    expect(queryByTestId("inner")).toBeNull();
    expect(queryByTestId("outer")).not.toBeNull();
  });
});
