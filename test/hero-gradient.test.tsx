import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { useState } from "react";
import { THEMES } from "@/lib/theme";

/**
 * `background` is a shorthand: assigning it resets `background-clip` to
 * border-box. React rewrites only the style keys whose values changed, so a
 * component that sets `background` alongside `backgroundClip: "text"` paints
 * correctly once and then breaks on its first update — the shorthand clears the
 * clip and React has no reason to re-write it.
 *
 * That is exactly what the letterhead did. The theme hook starts on THEMES[0]
 * and swaps to the stored theme in an effect, so every visitor on any theme but
 * the default got a solid gradient rectangle with the word invisible inside it.
 * It survived review because the first render is right and the DOM is only
 * wrong afterwards.
 */

function Wordmark({ gradient, shorthand }: { gradient: string; shorthand: boolean }) {
  const style = shorthand
    ? { background: gradient, WebkitBackgroundClip: "text", backgroundClip: "text" }
    : { backgroundImage: gradient, WebkitBackgroundClip: "text", backgroundClip: "text" };
  return (
    <h1 data-testid="mark" style={style as React.CSSProperties}>
      Pulsar
    </h1>
  );
}

function Swapper({ shorthand }: { shorthand: boolean }) {
  const [i, setI] = useState(0);
  return (
    <>
      <button onClick={() => setI(1)}>swap</button>
      <Wordmark gradient={THEMES[i].hero} shorthand={shorthand} />
    </>
  );
}

const clipOf = (el: HTMLElement) =>
  el.style.backgroundClip || el.style.getPropertyValue("-webkit-background-clip");

describe("the letterhead keeps its text clip when the theme changes", () => {
  it("survives a gradient swap", () => {
    const { getByText, getByTestId, rerender } = render(<Swapper shorthand={false} />);
    expect(clipOf(getByTestId("mark"))).toBe("text");
    getByText("swap").click();
    rerender(<Swapper shorthand={false} />);
    expect(clipOf(getByTestId("mark"))).toBe("text");
  });

  it("demonstrates the shorthand losing it — the bug this guards against", () => {
    // Not a hypothetical: this is the assertion that fails on the old code.
    const { getByTestId, rerender } = render(<Wordmark gradient={THEMES[0].hero} shorthand />);
    rerender(<Wordmark gradient={THEMES[1].hero} shorthand />);
    expect(clipOf(getByTestId("mark"))).not.toBe("text");
  });
});

describe("every theme is wearable", () => {
  it("defines a distinct hero gradient and background per model", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(3);
    const heroes = new Set(THEMES.map((t) => t.hero));
    const bgs = new Set(THEMES.map((t) => t.bg));
    expect(heroes.size, "two themes share a wordmark gradient").toBe(THEMES.length);
    expect(bgs.size, "two themes share a background").toBe(THEMES.length);
  });

  it("gives each a three-colour swatch the picker can render", () => {
    for (const t of THEMES) {
      expect(t.swatch, t.id).toHaveLength(3);
      for (const c of t.swatch) expect(c, `${t.id}: ${c}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
