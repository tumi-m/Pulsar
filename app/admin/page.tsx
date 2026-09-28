"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface RunResult {
  success: boolean;
  releases_found: number;
  releases_saved: number;
  errors: string[];
  run_at: string;
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  async function triggerAgent() {
    if (!secret.trim()) {
      setError("Enter your AGENT_TRIGGER_SECRET");
      return;
    }

    setRunning(true);
    setResult(null);
    setError(null);
    setLogs(["Agent starting..."]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        setLogs((prev) => [...prev, `Error: ${data.error ?? res.statusText}`]);
      } else {
        setResult(data);
        setLogs((prev) => [
          ...prev,
          `Run complete at ${new Date(data.run_at).toLocaleTimeString()}`,
          `Releases saved: ${data.releases_saved}`,
          ...(data.errors ?? []).map((e: string) => `Warning: ${e}`),
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setLogs((prev) => [...prev, `Fatal error: ${err}`]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-lg">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="relative w-3 h-3">
              <div className="absolute inset-0 rounded-full bg-sony" />
              <motion.div
                animate={{ scale: [1, 2.5, 1], opacity: [0.8, 0, 0.8] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-sony"
              />
            </div>
            <h1 className="text-ink font-bold text-2xl tracking-tight">
              PULSAR ADMIN
            </h1>
          </div>
          <p className="text-chrome-700 text-sm font-mono tracking-wide">
            Trigger the music discovery agent manually
          </p>
        </motion.div>

        {/* Control panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-deck-800/80 border border-deck-600/20 rounded-2xl p-6 space-y-5 backdrop-blur-sm"
        >
          {/* Secret input */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-chrome-700/60 tracking-widest">
              TRIGGER SECRET
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !running && triggerAgent()}
              placeholder="AGENT_TRIGGER_SECRET"
              className="w-full bg-deck/50 border border-deck-600/30 rounded-lg px-4 py-3 text-sm text-ink font-mono placeholder:text-chrome-700/30 focus:outline-none focus:border-sony/50 transition-colors"
            />
          </div>

          {/* Trigger button */}
          <motion.button
            onClick={triggerAgent}
            disabled={running}
            whileHover={!running ? { scale: 1.02 } : {}}
            whileTap={!running ? { scale: 0.98 } : {}}
            className={`
              w-full py-3 rounded-xl font-mono font-bold text-sm tracking-widest
              transition-all duration-300
              ${running
                ? "bg-sony/20 border border-sony/30 text-sony/50 cursor-not-allowed"
                : "bg-sony/20 border border-sony/40 text-sony hover:bg-sony/30 hover:shadow-sony"
              }
            `}
          >
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-sony/30 border-t-sony rounded-full"
                />
                SCANNING MUSIC...
              </span>
            ) : (
              "RUN DISCOVERY AGENT"
            )}
          </motion.button>
        </motion.div>

        {/* Logs */}
        <AnimatePresence>
          {logs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 bg-deck/80 border border-deck-600/10 rounded-xl p-4 space-y-1 font-mono text-xs overflow-hidden"
            >
              {logs.map((log, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`
                    ${log.startsWith("Error") || log.startsWith("Fatal")
                      ? "text-vu"
                      : log.startsWith("Warning")
                      ? "text-sport"
                      : log.startsWith("Releases saved")
                      ? "text-lcd"
                      : "text-chrome-700/70"
                    }
                  `}
                >
                  <span className="text-chrome-700/30 mr-2">{String(i + 1).padStart(2, "0")}</span>
                  {log}
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-lcd/5 border border-lcd/20 rounded-xl p-5 space-y-3"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-lcd" />
                <span className="text-lcd font-mono text-sm font-bold tracking-widest">
                  RUN COMPLETE
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-3xl font-bold text-ink">
                    {result.releases_saved}
                  </p>
                  <p className="text-[10px] font-mono text-chrome-700/50 tracking-widest mt-1">
                    RELEASES SAVED
                  </p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-ink/60">
                    {result.errors?.length ?? 0}
                  </p>
                  <p className="text-[10px] font-mono text-chrome-700/50 tracking-widest mt-1">
                    ERRORS
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-vu/5 border border-vu/20 rounded-xl p-4"
            >
              <p className="text-vu font-mono text-sm">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Back link */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-[11px] font-mono text-chrome-700/40 tracking-widest hover:text-chrome-700 transition-colors"
          >
            ← BACK TO PULSAR
          </Link>
        </div>
      </div>
    </div>
  );
}
