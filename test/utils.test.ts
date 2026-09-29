import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { genreBucket, formatDate, isToday, isYesterday } from "@/lib/utils";

describe("genreBucket — specific buckets beat generic (first match wins)", () => {
  it("maps 'afro house' to House, not Electronic", () => {
    expect(genreBucket("Afro House")).toBe("House");
    expect(genreBucket("afro house")).toBe("House");
  });

  it("maps deep house / soulful house / afro tech to House", () => {
    expect(genreBucket("Deep House")).toBe("House");
    expect(genreBucket("Soulful House")).toBe("House");
    expect(genreBucket("Afro Tech")).toBe("House");
  });

  it("maps afrobeats vs afro house distinctly", () => {
    expect(genreBucket("Afrobeats")).toBe("Afrobeats");
    expect(genreBucket("Afro-Pop")).toBe("Afrobeats");
    expect(genreBucket("Naija")).toBe("Afrobeats");
  });

  it("maps amapiano before house", () => {
    expect(genreBucket("Amapiano")).toBe("Amapiano");
    expect(genreBucket("Private School Piano")).toBe("Amapiano");
  });

  it("maps gospel and worship", () => {
    expect(genreBucket("Gospel")).toBe("Gospel");
    expect(genreBucket("Praise & Worship")).toBe("Gospel");
    expect(genreBucket("Christian")).toBe("Gospel");
  });

  it("maps hip-hop / rap / trap / drill", () => {
    expect(genreBucket("Hip-Hop/Rap")).toBe("Hip-Hop");
    expect(genreBucket("trap")).toBe("Hip-Hop");
    expect(genreBucket("drill")).toBe("Hip-Hop");
  });

  it("maps electronic subgenres", () => {
    expect(genreBucket("Drum and Bass")).toBe("Electronic");
    expect(genreBucket("techno")).toBe("Electronic");
    expect(genreBucket("edm")).toBe("Electronic");
    expect(genreBucket("synth")).toBe("Electronic");
  });

  it("dubstep buckets to Reggae (matches 'dub' before Electronic)", () => {
    // Documenting existing first-match behaviour: 'dubstep' contains 'dub',
    // a Reggae keyword, and Reggae is listed before Electronic.
    expect(genreBucket("dubstep")).toBe("Reggae");
  });

  it("maps reggae / dancehall", () => {
    expect(genreBucket("Dancehall")).toBe("Reggae");
    expect(genreBucket("ska")).toBe("Reggae");
  });

  it("maps metal before rock", () => {
    expect(genreBucket("doom metal")).toBe("Metal");
    expect(genreBucket("hardcore")).toBe("Metal");
    expect(genreBucket("punk rock")).toBe("Rock");
  });

  it("returns null for empty / unknown / null", () => {
    expect(genreBucket("")).toBeNull();
    expect(genreBucket(null)).toBeNull();
    expect(genreBucket(undefined)).toBeNull();
    expect(genreBucket("some unrecognisable genre")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(genreBucket("AFRO HOUSE")).toBe("House");
    expect(genreBucket("AmApIaNo")).toBe("Amapiano");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as 'Mon D, YYYY' in UTC", () => {
    expect(formatDate("2026-07-28")).toBe("Jul 28, 2026");
    expect(formatDate("2025-01-05")).toBe("Jan 5, 2025");
  });
});

describe("isToday / isYesterday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("isToday matches the current ISO date", () => {
    vi.setSystemTime(new Date("2026-07-28T12:34:56Z"));
    expect(isToday("2026-07-28")).toBe(true);
    expect(isToday("2026-07-27")).toBe(false);
  });

  it("isYesterday matches the previous ISO date", () => {
    vi.setSystemTime(new Date("2026-07-28T12:34:56Z"));
    expect(isYesterday("2026-07-27")).toBe(true);
    expect(isYesterday("2026-07-28")).toBe(false);
    expect(isYesterday("2026-07-26")).toBe(false);
  });
});
describe("Fresh and Today use the viewer's calendar day, not UTC's", () => {
  const withTZ = (tz: string, fn: () => void) => {
    const prev = process.env.TZ;
    process.env.TZ = tz;
    try { fn(); } finally { process.env.TZ = prev; }
  };

  it("in Los Angeles at 18:30, today is still the 9th (UTC has rolled to the 10th)", async () => {
    const { localISODate, isToday } = await import("@/lib/utils");
    withTZ("America/Los_Angeles", () => {
      const now = Date.parse("2026-03-10T01:30:00Z");
      expect(localISODate(now)).toBe("2026-03-09");
      expect(isToday("2026-03-10", now)).toBe(false);
      expect(isToday("2026-03-09", now)).toBe(true);
    });
  });

  it("in Johannesburg at 01:30, today is already the 10th (UTC is still the 9th)", async () => {
    const { localISODate, isYesterday } = await import("@/lib/utils");
    withTZ("Africa/Johannesburg", () => {
      const now = Date.parse("2026-03-09T23:30:00Z");
      expect(localISODate(now)).toBe("2026-03-10");
      expect(isYesterday("2026-03-09", now)).toBe(true);
    });
  });

  it("steps back a calendar day across a DST change, not 24 hours", async () => {
    const { localISODate } = await import("@/lib/utils");
    withTZ("America/New_York", () => {
      // 2026-03-08 is the spring-forward day: it is 23 hours long.
      const now = Date.parse("2026-03-09T04:30:00Z"); // 00:30 EDT on the 9th
      expect(localISODate(now, -1)).toBe("2026-03-08");
    });
  });
});
