import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Two credentialed routes the audit found unguarded, exercised through their
 * real handlers rather than mirrored helpers.
 */

beforeEach(() => {
  vi.resetModules(); // fresh in-memory rate-limit buckets per test
  vi.restoreAllMocks();
});

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
  });
}

describe("/api/youtube-token only exchanges for this site", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  });

  it("refuses a redirect URI that isn't this origin, without calling Google", async () => {
    const google = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/youtube-token/route");
    const res = await POST(
      post("https://pulsar.example/api/youtube-token", {
        code: "c",
        verifier: "v",
        redirectUri: "https://attacker.example/",
      })
    );
    expect(res.status).toBe(400);
    expect(google).not.toHaveBeenCalled();
  });

  it("refuses a cross-site browser request even with a matching URI", async () => {
    const google = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/youtube-token/route");
    const res = await POST(
      post(
        "https://pulsar.example/api/youtube-token",
        { code: "c", verifier: "v", redirectUri: "https://pulsar.example/" },
        { origin: "https://attacker.example" }
      )
    );
    expect(res.status).toBe(400);
    expect(google).not.toHaveBeenCalled();
  });

  it("still exchanges the site's own request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 })
    );
    const { POST } = await import("@/app/api/youtube-token/route");
    const res = await POST(
      post(
        "https://pulsar.example/api/youtube-token",
        { code: "c", verifier: "v", redirectUri: "https://pulsar.example/" },
        { origin: "https://pulsar.example" }
      )
    );
    expect(res.status).toBe(200);
    expect((await res.json()).access_token).toBe("tok");
  });
});

describe("/api/rerank is metered, and degrades rather than failing", () => {
  it("stops calling the model past the per-IP ceiling but still answers 200", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "https://model.example");
    vi.stubEnv("OLLAMA_API_KEY", "k");
    const model = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ message: { content: '{"order":[0],"drop":[]}' } }), { status: 200 })
    );
    const { POST } = await import("@/app/api/rerank/route");
    const body = { prompt: "late night", candidates: [{ artist: "A", title: "B" }] };

    let last: Response | null = null;
    for (let i = 0; i < 61; i++) last = await POST(post("https://pulsar.example/api/rerank", body));

    expect(model).toHaveBeenCalledTimes(60);
    expect(last!.status).toBe(200);
    const json = await last!.json();
    expect(json.order).toBeNull(); // the Selector keeps its keyword ranking
    expect(json.reason).toBe("rate-limited");
  });

  it("bounds what a caller can put into the billed prompt", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "https://model.example");
    vi.stubEnv("OLLAMA_API_KEY", "k");
    let sent = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      sent = String((init as RequestInit).body);
      return new Response(JSON.stringify({ message: { content: '{"order":[],"drop":[]}' } }), { status: 200 });
    });
    const { POST } = await import("@/app/api/rerank/route");
    const huge = "x".repeat(50_000);
    await POST(
      post("https://pulsar.example/api/rerank", {
        prompt: "p",
        candidates: [{ artist: huge, title: huge, genre: huge, tags: Array(50).fill(huge) }],
      })
    );
    expect(sent.length).toBeLessThan(6_000);
  });
});
