/**
 * Pulsar — agent fetch guard.
 *
 * `fetch_page` is the one place a model-controlled URL reaches the network.
 * Without validation, a poisoned search snippet can steer the agent at
 * internal endpoints (cloud metadata, localhost admin panels, the Supabase
 * REST endpoint). The allowlist keeps the curator pointed at the editorial
 * sources it actually needs; the private-range block is defense in depth.
 */

// Hosts the curator legitimately browses (editorial + music platforms).
const ALLOWED_HOSTS = [
  /(^|\.)pitchfork\.com$/,
  /(^|\.)bandcamp\.com$/,
  /(^|\.)residentadvisor\.net$/,
  /(^|\.)thefader\.com$/,
  /(^|\.)reddit\.com$/,
  /(^|\.)open\.spotify\.com$/,
  /(^|\.)music\.apple\.com$/,
  /(^|\.)tidal\.com$/,
  /(^|\.)soundcloud\.com$/,
  /(^|\.)music\.youtube\.com$/,
  /(^|\.)wikipedia\.org$/,
  /(^|\.)allmusic\.com$/,
  /(^|\.)discogs\.com$/,
  /(^|\.)last\.fm$/,
  /(^|\.)whoSampled\.com$/i,
  /(^|\.)boomplay\.com$/,
  /(^|\.)audiomack\.com$/,
  /(^|\.)musicinafrica\.net$/,
  /(^|\.)okayafrica\.com$/,
  /(^|\.)npr\.org$/,
  /(^|\.)guardian\.com$/,
];

/** Hostname literals / ranges that must never be fetched. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "169.254.169.254",
]);

export interface UrlCheck {
  ok: boolean;
  reason?: string;
}

/** Validate a model-supplied URL before fetching. */
export function checkFetchUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "unparseable URL" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: `scheme not allowed: ${url.protocol}` };
  }

  const host = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: "blocked host" };
  }

  // Raw IP literals: only block (no public-ip fetches from the agent).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { ok: false, reason: "IP literals not allowed" };
  }
  if (host.includes(":") && !host.startsWith("[")) {
    return { ok: false, reason: "IPv6 literals not allowed" };
  }
  // IPv6 in brackets — block loopback/link-local/ULA prefixes.
  if (/^\[[0-9a-f:]+\]$/.test(host)) {
    const v6 = host.slice(1, -1);
    if (/^(:|f[cd][0-9a-f]{2}:|fe80)/i.test(v6) || v6 === "::1") {
      return { ok: false, reason: "private IPv6 not allowed" };
    }
  }

  // Internal-ish names and cloud metadata paths by suffix.
  if (/\.(local|internal|lan|home|corp)$/.test(host)) {
    return { ok: false, reason: "internal hostname" };
  }

  if (!ALLOWED_HOSTS.some((re) => re.test(host))) {
    return { ok: false, reason: `host not on allowlist: ${host}` };
  }

  return { ok: true };
}