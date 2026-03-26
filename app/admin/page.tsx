"use client";

import { useState } from "react";
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
              <div className="absolute inset-0 rounded-full bg-neon-violet" />
              <motion.div
                animate={{ scale: [1, 2.5, 1], opacity: [0.8, 0, 0.8] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-neon-violet"
              />
            </div>
            <h1 className="text-star-white font-bold text-2xl tracking-tight">
              PULSAR ADMIN
            </h1>
          </div>
          <p className="text-dust text-sm font-mono tracking-wide">
            Trigger the music discovery agent manually
          </p>
        </motion.div>

        {/* Control panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-cosmos/80 border border-mist/20 rounded-2xl p-6 space-y-5 backdrop-blur-sm"
        >
          {/* Secret input */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-dust/60 tracking-widest">
              TRIGGER SECRET
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !running && triggerAgent()}
              placeholder="AGENT_TRIGGER_SECRET"
              className="w-full bg-void/50 border border-mist/30 rounded-lg px-4 py-3 text-sm text-star-white font-mono placeholder:text-dust/30 focus:outline-none focus:border-neon-violet/50 transition-colors"
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
                ? "bg-neon-violet/20 border border-neon-violet/30 text-neon-violet/50 cursor-not-allowed"
                : "bg-neon-violet/20 border border-neon-violet/40 text-neon-violet hover:bg-neon-violet/30 hover:shadow-neon-violet"
              }
            `}
          >
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-neon-violet/30 border-t-neon-violet rounded-full"
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
              className="mt-4 bg-void/80 border border-mist/10 rounded-xl p-4 space-y-1 font-mono text-xs overflow-hidden"
            >
              {logs.map((log, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`
                    ${log.startsWith("Error") || log.startsWith("Fatal")
                      ? "text-neon-pink"
                      : log.startsWith("Warning")
                      ? "text-neon-amber"
                      : log.startsWith("Releases saved")
                      ? "text-neon-green"
                      : "text-dust/70"
                    }
                  `}
                >
                  <span className="text-dust/30 mr-2">{String(i + 1).padStart(2, "0")}</span>
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
              className="mt-4 bg-neon-green/5 border border-neon-green/20 rounded-xl p-5 space-y-3"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-neon-green" />
                <span className="text-neon-green font-mono text-sm font-bold tracking-widest">
                  RUN COMPLETE
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-3xl font-bold text-star-white">
                    {result.releases_saved}
                  </p>
                  <p className="text-[10px] font-mono text-dust/50 tracking-widest mt-1">
                    RELEASES SAVED
                  </p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-star-white/60">
                    {result.errors?.length ?? 0}
                  </p>
                  <p className="text-[10px] font-mono text-dust/50 tracking-widest mt-1">
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
              className="mt-4 bg-neon-pink/5 border border-neon-pink/20 rounded-xl p-4"
            >
              <p className="text-neon-pink font-mono text-sm">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Back link */}
        <div className="mt-8 text-center">
          <a
            href="/"
            className="text-[11px] font-mono text-dust/40 tracking-widest hover:text-dust transition-colors"
          >
            ← BACK TO PULSAR
          </a>
        </div>
      </div>
    </div>
  );
}
