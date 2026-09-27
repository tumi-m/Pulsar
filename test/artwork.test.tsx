import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { Artwork } from "@/components/Artwork";

/**
 * Regression cover for the broken-glyph bug.
 *
 * `/api/artwork` answers a failed lookup with `502` and a JSON body. Many feed
 * records store that proxy URL as their own `artwork_url`, so the <img> finished
 * loading with `naturalWidth === 0`: `onError` never fired, `onLoad` did, the
 * fallback chain never advanced, and the tile rendered the browser's
 * broken-image icon plus oversized alt text instead of the designed letter
 * placeholder. A load event is not proof of an image.
 */

// next/image needs a Next runtime for its loader; the component's behaviour
// under test is the load/error handling, which is identical on a plain <img>.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    onLoad,
    onError,
    className,
  }: {
    src: string;
    alt: string;
    onLoad?: (e: { currentTarget: HTMLImageElement }) => void;
    onError?: () => void;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      src={src}
      alt={alt}
      className={className}
      data-testid="next-image"
      onLoad={onLoad}
      onError={onError}
    />
  ),
}));

/** jsdom never decodes, so both dimensions must be forced explicitly. */
function setDecodedSize(img: HTMLImageElement, w: number, h = w) {
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
}

const letterTile = () => screen.queryByText("F");

beforeEach(() => vi.clearAllMocks());

describe("Artwork treats a zero-dimension load as a failure", () => {
  it("falls through to the letter tile when the proxy 'loads' nothing", () => {
    const onUnavailable = vi.fn();
    render(
      <Artwork
        src="/api/artwork?artist=Fontaines%20D.C.&title=Romance"
        artist="Fontaines D.C."
        title="Romance"
        onUnavailable={onUnavailable}
      />
    );

    const img = screen.getByAltText("Fontaines D.C. — Romance") as HTMLImageElement;
    setDecodedSize(img, 0);
    fireEvent.load(img);

    // The broken <img> must be gone, not merely faded — an element with
    // naturalWidth 0 still paints the browser's glyph and its alt text.
    expect(screen.queryByAltText("Fontaines D.C. — Romance")).toBeNull();
    expect(letterTile()).toBeInTheDocument();
    expect(onUnavailable).toHaveBeenCalled();
  });

  it("advances the remote URL to the proxy rather than showing nothing", () => {
    render(
      <Artwork src="https://cdn.example.com/cover.jpg" artist="Fontaines D.C." title="Romance" />
    );

    const img = screen.getByTestId("next-image") as HTMLImageElement;
    setDecodedSize(img, 0);
    fireEvent.load(img);

    // Stage 1: our own proxy gets a turn before the tile is given up on.
    const retried = screen.getByAltText("Fontaines D.C. — Romance") as HTMLImageElement;
    expect(retried.getAttribute("src")).toContain("/api/artwork?artist=Fontaines");
    expect(letterTile()).toBeNull();
  });

  it("still reveals artwork that genuinely decoded", () => {
    render(
      <Artwork src="https://cdn.example.com/cover.jpg" artist="Fontaines D.C." title="Romance" />
    );

    const img = screen.getByTestId("next-image") as HTMLImageElement;
    setDecodedSize(img, 640);
    fireEvent.load(img);

    expect(img.className).toContain("opacity-100");
    expect(letterTile()).toBeNull();
  });

  it("does not strand a tile on a half-decoded image", () => {
    // A width without a height is not something a browser can draw.
    render(<Artwork src="/api/artwork?artist=X&title=Y" artist="Fontaines D.C." title="Romance" />);
    const img = screen.getByAltText("Fontaines D.C. — Romance") as HTMLImageElement;
    setDecodedSize(img, 640, 0);
    fireEvent.load(img);
    expect(letterTile()).toBeInTheDocument();
  });
});

describe("Artwork settles images that finished before hydration", () => {
  /**
   * The bug that actually shipped. 55 proxy <img> tags are server-rendered on
   * the home page; the browser fetches them while parsing the HTML, so a 502
   * fires `error` before React has attached a single handler. Every one of
   * those tiles stayed at stage 0 forever — no event, no fallback, a broken
   * glyph. The component has to interrogate the element on mount.
   */
  function completeAs(w: number) {
    const proto = window.HTMLImageElement.prototype;
    const spies = [
      vi.spyOn(proto, "complete", "get").mockReturnValue(true),
      vi.spyOn(proto, "naturalWidth", "get").mockReturnValue(w),
      vi.spyOn(proto, "naturalHeight", "get").mockReturnValue(w),
    ];
    return () => spies.forEach((s) => s.mockRestore());
  }

  it("falls back without ever receiving an event", () => {
    const restore = completeAs(0);
    try {
      const onUnavailable = vi.fn();
      render(
        <Artwork
          src="/api/artwork?artist=X&title=Y"
          artist="Fontaines D.C."
          title="Romance"
          onUnavailable={onUnavailable}
        />
      );
      // No fireEvent at all — this is the whole point.
      expect(letterTile()).toBeInTheDocument();
      expect(onUnavailable).toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("reveals a cover that finished early instead of leaving it invisible", () => {
    const restore = completeAs(640);
    try {
      render(<Artwork src="/api/artwork?artist=X&title=Y" artist="Fontaines D.C." title="Romance" />);
      const img = screen.getByAltText("Fontaines D.C. — Romance");
      // Without the mount check this stays at opacity-0 behind the placeholder.
      expect(img.className).toContain("opacity-100");
      expect(letterTile()).toBeNull();
    } finally {
      restore();
    }
  });
});

describe("Artwork keeps its existing error handling", () => {
  it("reports unavailable once the proxy itself errors", () => {
    const onUnavailable = vi.fn();
    render(
      <Artwork
        src="/api/artwork?artist=X&title=Y"
        artist="Fontaines D.C."
        title="Romance"
        onUnavailable={onUnavailable}
      />
    );
    fireEvent.error(screen.getByAltText("Fontaines D.C. — Romance"));
    expect(onUnavailable).toHaveBeenCalled();
    expect(letterTile()).toBeInTheDocument();
  });
});
