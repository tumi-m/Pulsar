import { describe, it, expect, beforeEach } from "vitest";
import { loadFormat, saveFormat, FORMATS, type MediaFormat } from "@/lib/format";

beforeEach(() => localStorage.clear());

describe("format", () => {
  it("defaults to vinyl", () => {
    expect(loadFormat()).toBe("vinyl");
  });
  it("persists and reloads a chosen format", () => {
    saveFormat("cd");
    expect(loadFormat()).toBe("cd");
  });
  it("falls back to vinyl for an invalid stored value", () => {
    localStorage.setItem("pulsar_format_v1", "bogus" as MediaFormat);
    expect(loadFormat()).toBe("vinyl");
  });
  it("exposes all five formats with stable ids", () => {
    expect(FORMATS.map((f) => f.id)).toEqual(["vinyl", "cassette", "cd", "floppy", "usb"]);
  });
});