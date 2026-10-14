import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

/**
 * Overlays that don't move focus are invisible to anyone not using a mouse.
 * Measured on the built app before this hook existed: clicking Samples left
 * `document.activeElement` on the Samples button, so Tab walked the grid
 * underneath a panel covering it.
 *
 * The hook is re-imported per test because the open-dialog stack is
 * module-level — a leaked mount in one test would otherwise silence the next.
 */
async function loadHook() {
  vi.resetModules();
  return (await import("@/lib/useDialog")).useDialog;
}

type Mq = (q: string) => MediaQueryList;
function setViewport(desktop: boolean) {
  (window as unknown as { matchMedia: Mq }).matchMedia = ((q: string) => ({
    matches: desktop,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as Mq;
}

/** jsdom gives everything a zero box; the hook skips invisible controls. */
function makeVisible() {
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width: 40, height: 40, top: 0, left: 0, right: 40, bottom: 40 }),
  });
}

function Panel({
  open,
  useDialog,
  modal,
}: {
  open: boolean;
  useDialog: typeof import("@/lib/useDialog").useDialog;
  modal?: boolean;
}) {
  const ref = useDialog<HTMLDivElement>(open, modal === undefined ? {} : { modal });
  if (!open) return null;
  return (
    <div ref={ref} role="dialog" data-testid="panel">
      <button>first</button>
      <button>middle</button>
      <button>last</button>
    </div>
  );
}

beforeEach(() => {
  setViewport(false);
  makeVisible();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

/** The hook focuses on the next frame; give it one. */
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

describe("useDialog moves focus into the panel", () => {
  it("focuses the first control when it opens", async () => {
    const useDialog = await loadHook();
    const { getByText } = render(<Panel open useDialog={useDialog} />);
    await frame();
    expect(document.activeElement).toBe(getByText("first"));
  });

  it("gives focus back to whatever opened it", async () => {
    const useDialog = await loadHook();
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { rerender } = render(<Panel open useDialog={useDialog} />);
    await frame();
    expect(document.activeElement).not.toBe(opener);

    rerender(<Panel open={false} useDialog={useDialog} />);
    expect(document.activeElement).toBe(opener);
  });

  it("leaves focus alone if something else has deliberately claimed it", async () => {
    const useDialog = await loadHook();
    const opener = document.createElement("button");
    const elsewhere = document.createElement("button");
    document.body.append(opener, elsewhere);
    opener.focus();

    const { rerender } = render(<Panel open useDialog={useDialog} />);
    await frame();
    elsewhere.focus();
    rerender(<Panel open={false} useDialog={useDialog} />);
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("useDialog keeps Tab inside a modal overlay", () => {
  it("wraps from the last control back to the first", async () => {
    const useDialog = await loadHook();
    const { getByText } = render(<Panel open useDialog={useDialog} />);
    await frame();
    const last = getByText("last");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(getByText("first"));
  });

  it("wraps backwards from the first to the last", async () => {
    const useDialog = await loadHook();
    const { getByText } = render(<Panel open useDialog={useDialog} />);
    await frame();
    getByText("first").focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(getByText("last"));
  });

  it("lets Tab leave a desktop side panel, where the grid is still usable", async () => {
    setViewport(true); // ≥1024px — same rule useScrollLock applies
    const useDialog = await loadHook();
    const { getByText } = render(<Panel open useDialog={useDialog} />);
    await frame();
    const last = getByText("last");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    // Not trapped: the browser's own Tab handling takes it out of the panel.
    expect(document.activeElement).toBe(last);
  });

  it("still moves focus in on desktop — non-modal is not 'ignore me'", async () => {
    setViewport(true);
    const useDialog = await loadHook();
    const { getByText } = render(<Panel open useDialog={useDialog} />);
    await frame();
    expect(document.activeElement).toBe(getByText("first"));
  });
});

describe("useDialog handles stacked overlays", () => {
  it("only the innermost panel traps Tab", async () => {
    const useDialog = await loadHook();
    function Stack() {
      const outer = useDialog<HTMLDivElement>(true);
      const inner = useDialog<HTMLDivElement>(true);
      return (
        <>
          <div ref={outer} role="dialog">
            <button>outer-only</button>
          </div>
          <div ref={inner} role="dialog">
            <button>inner-first</button>
            <button>inner-last</button>
          </div>
        </>
      );
    }
    const { getByText } = render(<Stack />);
    await frame();
    getByText("inner-last").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    // Wrapped within the inner panel, not into the outer one.
    expect(document.activeElement).toBe(getByText("inner-first"));
  });
});

describe("a panel can say where focus should land", () => {
  it("prefers the control marked data-dialog-autofocus", async () => {
    const useDialog = await loadHook();
    function WithInput() {
      const ref = useDialog<HTMLDivElement>(true);
      return (
        <div ref={ref} role="dialog">
          <button>close</button>
          <input data-dialog-autofocus placeholder="say something" />
        </div>
      );
    }
    const { getByPlaceholderText } = render(<WithInput />);
    await frame();
    expect(document.activeElement).toBe(getByPlaceholderText("say something"));
  });
});

describe("changing content re-enters focus without bouncing out", () => {
  it("moves to the new autofocus target and keeps the original opener", async () => {
    const useDialog = await loadHook();
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    function Panelled({ step, open }: { step: string; open: boolean }) {
      const ref = useDialog<HTMLDivElement>(open, { modal: true, focusKey: step });
      if (!open) return null;
      return (
        <div ref={ref} role="dialog">
          <button>close</button>
          {step === "chat" && <input data-dialog-autofocus placeholder="type here" />}
        </div>
      );
    }

    const { rerender, getByText, getByPlaceholderText } = render(
      <Panelled step="choose" open />
    );
    await frame();
    expect(document.activeElement).toBe(getByText("close"));

    rerender(<Panelled step="chat" open />);
    await frame();
    expect(document.activeElement).toBe(getByPlaceholderText("type here"));

    // Closing still returns to the button that opened it, not to anything
    // captured during the intermediate step.
    rerender(<Panelled step="chat" open={false} />);
    expect(document.activeElement).toBe(opener);
  });
});
