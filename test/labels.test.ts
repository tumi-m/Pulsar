import { describe, it, expect } from "vitest";
import { labelFor } from "@/lib/labels";

describe("labelFor", () => {
  it("resolves a known release to its label", () => {
    expect(labelFor("Nirvana", "Bleach")).toBe("Sub Pop");
    expect(labelFor("Adele", "21")).toBe("XL Recordings");
  });
  it("is case-insensitive and ignores bracketed asides", () => {
    expect(labelFor("nirvana", "Bleach (Remastered)")).toBe("Sub Pop");
  });
  it("returns null for an unmapped release", () => {
    expect(labelFor("Unknown Artist", "Mystery Album")).toBeNull();
  });
});