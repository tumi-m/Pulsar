"use client";

import { motion } from "framer-motion";
import { Copy, Download, ChevronDown } from "lucide-react";
import { PLATFORMS } from "./platforms";
import { providerConfigured, providerMissing } from "@/lib/dsp";

/**
 * The "export this crate" sheet.
 *
 * Two audiences, kept apart. A listener needs to know, per service, whether
 * Pulsar can build the playlist on their account or can only hand them the
 * tracklist — and what a CSV is actually good for, since none of these
 * services imports one by itself. The site owner needs to know exactly which
 * setting is missing for each service; that lives in a collapsed section so it
 * never reads as instructions to a listener.
 *
 * Setup guidance used to exist for Spotify only, and disappeared as soon as a
 * client id was set — the moment the redirect URI usually starts to matter.
 */

interface Props {
  count: number;
  crateName: string;
  /** Bumped when the live config arrives, so the badges re-read readiness. */
  cfgTick: number;
  onPick: (key: string, label: string) => void;
  onCopy: () => void;
  onCsv: () => void;
  onCopyRedirect: () => void;
}

/** What each service needs before Pulsar can create playlists on it. */
const SETUP: Record<string, { console: string; consoleLabel: string; steps: string[] }> = {
  spotify: {
    console: "https://developer.spotify.com/dashboard",
    consoleLabel: "Spotify dashboard",
    steps: [
      "Create an app and set SPOTIFY_CLIENT_ID to its Client ID.",
      "Add the redirect URI below, exactly. Tick “Web API” under APIs used.",
      "Development mode allows up to 5 accounts (Users & Access), and the owner needs Premium.",
    ],
  },
  youtube_music: {
    console: "https://console.cloud.google.com/apis/credentials",
    consoleLabel: "Google Cloud credentials",
    steps: [
      "Enable YouTube Data API v3. Create an OAuth client of type “Web application”.",
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, and add the redirect URI below.",
      "Until Google verifies the app, add each account as a test user. The default quota covers roughly 65 tracks a day.",
    ],
  },
  tidal: {
    console: "https://developer.tidal.com/dashboard",
    consoleLabel: "TIDAL developer portal",
    steps: [
      "Request Open API access and set TIDAL_CLIENT_ID.",
      "Add the redirect URI below. Enable playlists.read, playlists.write, collection.read, user.read and search.read.",
    ],
  },
  apple_music: {
    console: "https://developer.apple.com/account/resources/authkeys/list",
    consoleLabel: "Apple Developer keys",
    steps: [
      "Create a MusicKit key (paid Apple Developer membership).",
      "Set APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY and APPLE_MUSIC_ENABLED=true.",
      "Listeners need an Apple Music subscription and must allow the sign-in pop-up.",
    ],
  },
};

export function ExportSheet({ count, crateName, cfgTick, onPick, onCopy, onCsv, onCopyRedirect }: Props) {
  const anyLive = PLATFORMS.some((p) => providerConfigured(p.key));
  const origin = typeof window !== "undefined" ? `${window.location.origin}/` : "/";

  return (
    // No key={cfgTick}: remounting on every config refresh snapped the owner
    // section shut and replayed the rows mid-tap. cfgTick as a prop re-renders.
    <div data-cfg={cfgTick}>
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-ink-400">Export</p>
      <p className="mt-0.5 truncate text-[15px] font-bold text-ink">
        {crateName} · {count} record{count === 1 ? "" : "s"}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
        {anyLive
          ? "Services marked with a green lamp build the playlist on your account."
          : "Pick a service to copy the tracklist and get a CSV for it."}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-1.5">
        {PLATFORMS.map((p, i) => {
          const live = providerConfigured(p.key);
          return (
            <motion.button
              key={p.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * i, duration: 0.22 }}
              onClick={() => onPick(p.key, p.label)}
              className={`flex min-h-[56px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-key transition-[background-color,box-shadow,transform] active:translate-y-px active:shadow-keyed ${
                live ? "border-lcd/30 bg-deck-600 hover:bg-[#2c353f]" : "border-chrome-700/50 bg-deck-700/70 hover:bg-deck-600"
              }`}
            >
              <span
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${p.color}26`, color: p.color }}
              >
                <p.Icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">{p.label}</span>
                <span className="block truncate text-[10.5px] text-ink-400">
                  {!live
                    ? "Copies the tracklist + a CSV"
                    : p.key === "youtube_music"
                      ? count > 60
                        ? "Creates it · YouTube's quota covers ~65 records a day — this may stop early"
                        : "Creates the playlist · about 65 records a day"
                      : "Creates the playlist on your account"}
                </span>
              </span>
              <span
                aria-label={live ? "Ready" : "Tracklist only"}
                className={`h-2 w-2 flex-shrink-0 rounded-full ${
                  live ? "bg-lcd shadow-[0_0_8px_rgba(126,217,174,0.85)]" : "bg-deck-600 ring-1 ring-chrome-700"
                }`}
              />
            </motion.button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={onCopy}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] border border-chrome-700/70 bg-deck-600 text-[10px] font-bold uppercase tracking-widest text-ink shadow-key active:translate-y-px active:shadow-keyed"
        >
          <Copy size={12} /> Copy tracklist
        </button>
        <button
          onClick={onCsv}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] border border-chrome-700/70 bg-deck-600 text-[10px] font-bold uppercase tracking-widest text-ink shadow-key active:translate-y-px active:shadow-keyed"
        >
          <Download size={12} /> Download CSV
        </button>
      </div>
      {/* Honest about what a CSV is for: the old copy implied each service
          would take it directly, and none of them does. */}
      <p className="mt-2 text-[10px] leading-relaxed text-ink-600">
        No streaming service imports a CSV by itself. Use it with an importer such as{" "}
        <a href="https://www.tunemymusic.com" target="_blank" rel="noopener noreferrer" className="text-ink-400 underline decoration-dotted underline-offset-2">
          TuneMyMusic
        </a>{" "}
        or{" "}
        <a href="https://soundiiz.com" target="_blank" rel="noopener noreferrer" className="text-ink-400 underline decoration-dotted underline-offset-2">
          Soundiiz
        </a>
        .
      </p>

      {/* ── For the site owner ─────────────────────────────────────── */}
      <details className="group mt-3 rounded-xl border border-white/10 bg-black/20">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-ink-400 hover:text-ink">
          Set up one-tap export · site owner
          <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 px-3 pb-3">
          <div>
            <p className="text-[10px] text-ink-400">Redirect URI to register (trailing slash included):</p>
            <button
              onClick={onCopyRedirect}
              className="mt-1 flex w-full items-center gap-2 overflow-hidden rounded-lg border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-left hover:border-white/25"
            >
              <Copy size={11} className="flex-shrink-0 text-ink-400" />
              <span className="truncate font-mono text-[10px] text-ink">{origin}</span>
            </button>
          </div>
          {PLATFORMS.filter((p) => SETUP[p.key]).map((p) => {
            const live = providerConfigured(p.key);
            const missing = providerMissing(p.key);
            const setup = SETUP[p.key];
            return (
              <div key={p.key} className="border-t border-white/[0.06] pt-2.5">
                <p className="flex items-center gap-2 text-[11px] font-bold text-ink">
                  <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-lcd" : "bg-vu"}`} />
                  {p.label}
                  <span className={`text-[10px] font-normal ${live ? "text-lcd" : "text-ink-400"}`}>
                    {live ? "ready" : missing.length ? `missing ${missing.join(", ")}` : "not configured"}
                  </span>
                </p>
                {!live && (
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[10px] leading-relaxed text-ink-400">
                    {setup.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                )}
                <a
                  href={setup.console}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[10px] text-tps underline decoration-dotted underline-offset-2"
                >
                  {setup.consoleLabel} ↗
                </a>
              </div>
            );
          })}
          <p className="border-t border-white/[0.06] pt-2.5 text-[10px] leading-relaxed text-ink-600">
            Vercel applies environment variable changes only to new deployments — redeploy after
            setting them.
          </p>
        </div>
      </details>
    </div>
  );
}
