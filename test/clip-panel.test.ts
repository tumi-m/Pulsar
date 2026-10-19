import { describe, it, expect } from "vitest";
import { panelBounds, panelWidth, resizePanel, type PanelViewport } from "@/components/Visualizer";

/**
 * The floating visualiser panel (home of the Record key) opens centred. Its
 * drag bounds and corner resize are derived from that centring, so the close
 * button can't be dragged off-screen and the resize corner stays under the
 * pointer.
 */

const desktop: PanelViewport = { innerWidth: 1280, innerHeight: 800, clientWidth: 1280 };
const phone: PanelViewport = { innerWidth: 390, innerHeight: 844, clientWidth: 390 };

/** Viewport-space left/right edges of the panel for a width and drag offset. */
function edges(w: number, x: number, view: PanelViewport) {
  const r = panelWidth(w, view);
  const left = (view.clientWidth - r) / 2 + x;
  return { left, right: left + r };
}

describe("panelBounds", () => {
  it("lets a centred desktop panel reach either edge and no further", () => {
    const b = panelBounds(560, desktop);
    expect(b.left).toBe(-360);
    expect(b.right).toBe(360);
    expect(edges(560, b.right, desktop).right).toBe(1280);
    expect(edges(560, b.left, desktop).left).toBe(0);
  });

  it("follows the panel's width", () => {
    expect(panelBounds(1000, desktop).right).toBe(140);
    expect(panelBounds(240, desktop).right).toBe(520);
  });

  it("measures against the rendered width (92vw on a phone), not the stored one", () => {
    const b = panelBounds(560, phone);
    expect(b.right).toBeCloseTo((390 - 390 * 0.92) / 2);
    expect(edges(560, b.right, phone).right).toBeCloseTo(390);
  });

  it("keeps the panel inside the content box when a scrollbar narrows it", () => {
    const view = { ...desktop, clientWidth: 1265 };
    expect(edges(560, panelBounds(560, view).right, view).right).toBe(1265);
  });

  it("never goes negative", () => {
    const tiny = { innerWidth: 200, innerHeight: 300, clientWidth: 200 };
    expect(panelBounds(560, tiny).right).toBeGreaterThanOrEqual(0);
    expect(panelBounds(560, tiny).bottom).toBe(80);
  });
});

describe("resizePanel", () => {
  const start = { px: 900, py: 500, w: 560, h: 340, x: 0 };

  it("moves the corner with the pointer, 1:1 on both axes", () => {
    const before = edges(start.w, start.x, desktop);
    const next = resizePanel(start, 1100, 600, desktop);
    expect(next).toMatchObject({ w: 760, h: 440 });
    const after = edges(next.w, next.x, desktop);
    expect(after.left).toBe(before.left);
    expect(after.right - before.right).toBe(200);
  });

  it("pins the left edge of a dragged panel too", () => {
    const from = { ...start, x: -200 };
    const next = resizePanel(from, 800, 500, desktop);
    expect(edges(next.w, next.x, desktop).left).toBe(edges(from.w, from.x, desktop).left);
    expect(next.w).toBe(460);
  });

  it("stops the right edge at the viewport, which keeps x within the new bounds", () => {
    const from = { ...start, x: 300 };
    const next = resizePanel(from, 5000, 500, desktop);
    expect(edges(next.w, next.x, desktop).right).toBeLessThanOrEqual(1280);
    const b = panelBounds(next.w, desktop);
    expect(next.x).toBeLessThanOrEqual(b.right);
    expect(next.x).toBeGreaterThanOrEqual(b.left);
  });

  it("keeps the old size limits", () => {
    expect(resizePanel(start, -5000, -5000, desktop)).toMatchObject({ w: 240, h: 170 });
    const huge = resizePanel({ ...start, x: -360 }, 5000, 5000, desktop);
    expect(huge.w).toBe(1100);
    expect(huge.h).toBe(680);
  });

  it("can't grow past 92vw on a phone, where the panel already fills the width", () => {
    const next = resizePanel({ px: 370, py: 400, w: 560, h: 340, x: 0 }, 389, 400, phone);
    expect(next.w).toBeCloseTo(390 * 0.92);
    expect(next.x).toBeCloseTo(0);
  });
});
