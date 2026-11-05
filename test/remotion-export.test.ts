import { afterEach, describe, expect, it, vi } from "vitest";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import nextConfig from "../next.config";
import { browserCanEncode, chooseExportTarget, exportFilename, explain, type CanRender } from "@/remotion/export-target";
import { IMAGE_HOSTS, isOptimizableImage, recapArtwork, recapPropsFromReleases } from "@/remotion/from-releases";
import { normalizeRecapProps } from "@/remotion/props";
import type { Release } from "@/lib/types";

const SIZE = { width: 1080, height: 1920 };

/** A fake canRenderMediaOnWeb that supports exactly the listed "container/codec[/muted]" combos. */
function supports(...ok: string[]): CanRender & { calls: string[]; bitrates: number[] } {
  const calls: string[] = [];
  const bitrates: number[] = [];
  const fn = (async ({ container, videoCodec, muted, videoBitrate }) => {
    const key = `${container}/${videoCodec}${muted ? "/muted" : ""}`;
    calls.push(key);
    bitrates.push(videoBitrate);
    if (ok.includes(key)) return { canRender: true, issues: [] };
    return {
      canRender: false,
      issues: [{ type: "video-codec-unsupported", message: `${videoCodec} unsupported`, severity: "error" as const }],
    };
  }) as CanRender & { calls: string[]; bitrates: number[] };
  fn.calls = calls;
  fn.bitrates = bitrates;
  return fn;
}

describe("chooseExportTarget", () => {
  it("prefers H.264 MP4 with sound", async () => {
    const choice = await chooseExportTarget(supports("mp4/h264", "webm/vp9"), { ...SIZE, withAudio: true });
    expect(choice.target).toMatchObject({ container: "mp4", videoCodec: "h264", muted: false, mimeType: "video/mp4" });
    expect(choice.droppedAudio).toBe(false);
  });

  it("falls back to WebM VP9, then VP8, when there's no H.264 encoder (open-source Chromium)", async () => {
    const vp9 = await chooseExportTarget(supports("webm/vp9", "webm/vp8"), { ...SIZE, withAudio: true });
    expect(vp9.target).toMatchObject({ container: "webm", videoCodec: "vp9", extension: "webm", mimeType: "video/webm" });
    const vp8 = await chooseExportTarget(supports("webm/vp8"), { ...SIZE, withAudio: true });
    expect(vp8.target).toMatchObject({ container: "webm", videoCodec: "vp8" });
  });

  it("keeps the video and drops the soundtrack when only the audio can't be encoded", async () => {
    const can = supports("webm/vp9/muted");
    const choice = await chooseExportTarget(can, { ...SIZE, withAudio: true });
    expect(choice.target).toMatchObject({ container: "webm", videoCodec: "vp9", muted: true });
    expect(choice.droppedAudio).toBe(true);
    // every candidate was tried with sound before any silently
    expect(can.calls.slice(0, 3)).toEqual(["mp4/h264", "webm/vp9", "webm/vp8"]);
  });

  it("doesn't ask for audio when the soundtrack is off", async () => {
    const can = supports("mp4/h264/muted");
    const choice = await chooseExportTarget(can, { ...SIZE, withAudio: false });
    expect(choice.target?.muted).toBe(true);
    expect(choice.droppedAudio).toBe(false);
    expect(can.calls).toEqual(["mp4/h264/muted"]);
  });

  it("explains honestly when nothing can be encoded", async () => {
    const none = await chooseExportTarget(supports(), { ...SIZE, withAudio: true });
    expect(none.target).toBeNull();
    expect(none.reason).toMatch(/no video encoder/i);

    const noWebCodecs: CanRender = async () => ({
      canRender: false,
      issues: [{ type: "webcodecs-unavailable", message: "WebCodecs unavailable", severity: "error" }],
    });
    expect((await chooseExportTarget(noWebCodecs, { ...SIZE, withAudio: false })).reason).toMatch(/WebCodecs/);
  });

  it("asks for, and renders at, a bitrate fit for a 1080 × 1920 upload rather than the renderer's 'medium'", async () => {
    // "medium" came out at ~1.6 Mb/s for VP9 and smeared every moving frame.
    const vp9 = supports("webm/vp9");
    const choice = await chooseExportTarget(vp9, { ...SIZE, withAudio: true });
    expect(choice.target?.videoBitrate).toBeGreaterThanOrEqual(5_000_000);
    // the capability check validated the encoder at the bitrate it will run at
    expect(vp9.bitrates.at(-1)).toBe(choice.target?.videoBitrate);
    const h264 = await chooseExportTarget(supports("mp4/h264"), { ...SIZE, withAudio: true });
    expect(h264.target?.videoBitrate).toBeGreaterThanOrEqual(6_000_000);
    // a full 12-record recap (23.2 s) stays a reasonable download, under ~30 MB with audio
    for (const t of [choice.target, h264.target]) expect(((t!.videoBitrate + 192_000) * 23.2) / 8 / 1e6).toBeLessThan(30);
  });

  it("survives a capability check that throws", async () => {
    let first = true;
    const flaky: CanRender = async () => {
      if (first) {
        first = false;
        throw new Error("boom");
      }
      return { canRender: true, issues: [] };
    };
    const choice = await chooseExportTarget(flaky, { ...SIZE, withAudio: false });
    expect(choice.target).toMatchObject({ container: "webm", videoCodec: "vp9" });
  });
});

describe("explain", () => {
  it("falls back to the renderer's own message for anything unexpected", () => {
    expect(explain([{ type: "output-target-unsupported", message: "No OPFS", severity: "error" }])).toBe("No OPFS");
    expect(explain([{ type: "invalid-dimensions", message: "x", severity: "error" }])).toMatch(/1080 × 1920/);
  });
});

describe("browserCanEncode", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("is false without WebCodecs (jsdom, old Safari) and true with it", () => {
    vi.stubGlobal("VideoEncoder", undefined);
    expect(browserCanEncode()).toBe(false);
    vi.stubGlobal("VideoEncoder", class {});
    expect(browserCanEncode()).toBe(true);
  });
});

describe("exportFilename", () => {
  it("names the file after the crate and the container", () => {
    expect(
      exportFilename("road-trip", {
        container: "mp4",
        videoCodec: "h264",
        videoBitrate: 8_000_000,
        muted: false,
        extension: "mp4",
        mimeType: "video/mp4",
      })
    ).toBe("road-trip-recap.mp4");
  });
});

const release = (over: Partial<Release>): Release => ({
  id: "r",
  artist: "Kendrick Lamar",
  title: "GNX",
  type: "album",
  artwork_url: "",
  release_date: "2024-11-22",
  genre: null,
  tags: [],
  mood: null,
  spotify: null,
  apple_music: null,
  tidal: null,
  soundcloud: null,
  youtube_music: null,
  boomplay: null,
  created_at: "",
  curator_note: null,
  ...over,
});

describe("recap artwork", () => {
  const proxy = "/api/artwork?artist=Kendrick%20Lamar&title=GNX";

  it("serves a stored cover through the app's own next/image endpoint, with the iTunes lookup as the fallback", () => {
    // Same origin either way, so the export canvas isn't tainted — but it is
    // the cover the crate panel shows, not whatever iTunes guesses.
    expect(recapArtwork(release({ artwork_url: "https://i.scdn.co/image/abc" }))).toEqual({
      artworkUrl: "/_next/image?url=https%3A%2F%2Fi.scdn.co%2Fimage%2Fabc&w=828&q=75",
      artworkFallbackUrl: proxy,
    });
    // the review's case: a Bandcamp-only release iTunes has never heard of
    expect(recapArtwork(release({ artwork_url: "https://f4.bcbits.com/img/a1_10.jpg" })).artworkUrl).toBe(
      "/_next/image?url=https%3A%2F%2Ff4.bcbits.com%2Fimg%2Fa1_10.jpg&w=828&q=75"
    );
  });

  it("falls back to the proxy alone when there is nothing next/image will fetch", () => {
    expect(recapArtwork(release({ artwork_url: "" }))).toEqual({ artworkUrl: proxy, artworkFallbackUrl: null });
    // a host next.config doesn't allow, plain http, protocol-relative, junk
    for (const url of ["https://cdn.example.com/x.jpg", "http://i.scdn.co/image/abc", "//i.scdn.co/image/abc", "not a url"]) {
      expect(recapArtwork(release({ artwork_url: url }))).toEqual({ artworkUrl: proxy, artworkFallbackUrl: null });
    }
  });

  it("keeps same-origin covers, and only falls back from ones that aren't the proxy already", () => {
    expect(recapArtwork(release({ artwork_url: "/api/artwork?artist=a&title=b" }))).toEqual({
      artworkUrl: "/api/artwork?artist=a&title=b",
      artworkFallbackUrl: null,
    });
    expect(recapArtwork(release({ artwork_url: "/covers/gnx.jpg" }))).toEqual({ artworkUrl: "/covers/gnx.jpg", artworkFallbackUrl: proxy });
  });

  it("encodes what needs encoding in the proxy URL", () => {
    expect(recapArtwork(release({ artist: "AC/DC", title: "Back & Black?" })).artworkUrl).toBe(
      "/api/artwork?artist=AC%2FDC&title=Back%20%26%20Black%3F"
    );
  });

  it("allows exactly the hosts next.config.ts lets next/image fetch, matched as Next matches them", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    // the same list…
    expect(
      patterns.map((p) => (p instanceof URL ? p.hostname : `${p.protocol}://${p.hostname}`)).sort()
    ).toEqual(IMAGE_HOSTS.map((h) => `https://${h}`).sort());
    // …read the same way as Next's own matcher reads it
    const urls = [
      "https://i.scdn.co/image/abc",
      "https://x.i.scdn.co/image/abc",
      "https://is1-ssl.mzstatic.com/image/thumb/a.jpg",
      "https://a.b.mzstatic.com/x.jpg",
      "https://mzstatic.com/x.jpg",
      "https://evilmzstatic.com/x.jpg",
      "https://d1.cloudfront.net/x.png",
      "https://f4.bcbits.com/img/a1_10.jpg",
      "https://bcbits.com/img/a1_10.jpg",
      "https://lh3.googleusercontent.com/x",
      "https://lh4.googleusercontent.com/x",
      "https://upload.wikimedia.org/wikipedia/x.jpg",
      "https://coverartarchive.org/release/x/front",
      "https://ia800.us.archive.org/x.jpg",
      "https://e-cdns-images.dzcdn.net/images/cover/x.jpg",
      "http://i.scdn.co/image/abc",
      "https://cdn.example.com/x.jpg",
    ];
    for (const url of urls) {
      expect([url, isOptimizableImage(url)]).toEqual([url, hasRemoteMatch([], patterns, new URL(url))]);
    }
  });
});

describe("recapPropsFromReleases", () => {
  it("uses the display title, keeps the year, caps at twelve and keeps the real count", () => {
    const releases = Array.from({ length: 14 }, (_, i) =>
      release({ id: `r${i}`, title: `Title ${i} (feat. Someone)`, clean_title: `Title ${i}` })
    );
    const props = normalizeRecapProps(recapPropsFromReleases("Road Trip", releases, true));
    expect(props.records).toHaveLength(12);
    expect(props.totalRecords).toBe(14);
    expect(props.records[0]).toEqual({
      title: "Title 0",
      artist: "Kendrick Lamar",
      // the proxy is keyed on the raw title, as <Artwork> does
      artworkUrl: "/api/artwork?artist=Kendrick%20Lamar&title=Title%200%20(feat.%20Someone)",
      artworkFallbackUrl: null,
      year: "2024",
    });
    expect(props.withAudio).toBe(true);
  });

  it("makes an empty crate into an empty (intro + outro) recap", () => {
    const props = normalizeRecapProps(recapPropsFromReleases("Nothing yet", [], false));
    expect(props.records).toEqual([]);
    expect(props.totalRecords).toBe(0);
  });
});
