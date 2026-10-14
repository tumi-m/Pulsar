import { describe, it, expect } from "vitest";
import { timingSafeEqual } from "@/lib/crypto";

describe("timingSafeEqual", () => {
  it("matches equal strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("rejects different strings of equal length", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("aaa", "aab")).toBe(false);
  });

  it("rejects different lengths (prefix attacks)", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "x")).toBe(false);
  });

  it("is case- and content-sensitive", () => {
    expect(timingSafeEqual("Secret", "secret")).toBe(false);
  });
});