import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadAiMode,
  saveAiMode,
  loadShowType,
  saveShowType,
} from "@/lib/settings";

beforeEach(() => localStorage.clear());

describe("settings — AI mode", () => {
  it("defaults to chat", () => {
    expect(loadAiMode()).toBe("chat");
  });
  it("round-trips survey", () => {
    saveAiMode("survey");
    expect(loadAiMode()).toBe("survey");
    saveAiMode("chat");
    expect(loadAiMode()).toBe("chat");
  });
  it("dispatches pulsar-ai-mode-change on save", () => {
    const h = vi.fn();
    window.addEventListener("pulsar-ai-mode-change", h);
    saveAiMode("survey");
    window.removeEventListener("pulsar-ai-mode-change", h);
    expect(h).toHaveBeenCalled();
  });
});

describe("settings — show type", () => {
  it("defaults to all", () => {
    expect(loadShowType()).toBe("all");
  });
  it("round-trips a chosen type", () => {
    saveShowType("ep");
    expect(loadShowType()).toBe("ep");
    saveShowType("single");
    expect(loadShowType()).toBe("single");
  });
  it("falls back to all for an invalid stored value", () => {
    localStorage.setItem("pulsar_show_type", "nonsense");
    expect(loadShowType()).toBe("all");
  });
  it("dispatches pulsar-type-change on save", () => {
    const h = vi.fn();
    window.addEventListener("pulsar-type-change", h);
    saveShowType("album");
    window.removeEventListener("pulsar-type-change", h);
    expect(h).toHaveBeenCalled();
  });
});