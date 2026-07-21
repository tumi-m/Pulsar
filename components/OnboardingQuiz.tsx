"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QUIZ, buildProfile, saveProfile, type TasteProfile } from "@/lib/taste";

interface OnboardingQuizProps {
  onComplete: (profile: TasteProfile) => void;
  onSkip: () => void;
}

/* ────────────────────────────────────────────────────────────────
   Vibe graphics — every quiz option is a pure CSS/SVG animation.
   No words on the choices themselves: you pick what you FEEL.
   ──────────────────────────────────────────────────────────────── */

function Visual({ kind }: { kind: string }) {
  switch (kind) {
    case "storm":
      return (
        <div className="absolute inset-0 overflow-hidden bg-[#0d0208]">
          {[...Array(7)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-[2px] bg-gradient-to-b from-[#ff0080] to-transparent"
              style={{ left: `${10 + i * 13}%`, height: "60%", top: "-10%" }}
              animate={{ opacity: [0, 1, 0], scaleY: [0.4, 1, 0.4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.17 }}
            />
          ))}
          <motion.div
            className="absolute inset-0 bg-[#ff0080]/10"
            animate={{ opacity: [0, 0.5, 0] }}
            transition={{ duration: 2.2, repeat: Infinity }}
          />
        </div>
      );
    case "ocean":
      return (
        <div className="absolute inset-0 overflow-hidden bg-[#02121f]">
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute inset-x-[-30%] h-16 rounded-[100%] border-t border-[#00d4ff]/40"
              style={{ top: `${28 + i * 16}%` }}
              animate={{ x: ["-4%", "4%", "-4%"] }}
              transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </div>
      );
    case "vinyl":
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-[#160f0a]">
          <motion.div
            className="relative h-[70%] w-[70%] rounded-full border border-[#ffa500]/50"
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          >
            {[0.78, 0.6, 0.42].map((s) => (
              <div
                key={s}
                className="absolute rounded-full border border-[#ffa500]/25"
                style={{
                  inset: `${(1 - s) * 50}%`,
                }}
              />
            ))}
            <div className="absolute inset-[44%] rounded-full bg-[#ffa500]/70" />
          </motion.div>
        </div>
      );
    case "grid":
      return (
        <div className="absolute inset-0 overflow-hidden bg-[#050014]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(155,93,229,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(155,93,229,0.35) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
              transform: "perspective(240px) rotateX(55deg) translateY(20%) scale(1.6)",
            }}
          />
          <motion.div
            className="absolute inset-x-0 h-10 bg-gradient-to-b from-[#9b5de5]/40 to-transparent"
            animate={{ top: ["-15%", "110%"] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
          />
        </div>
      );
    case "night":
      return (
        <div className="absolute inset-0 overflow-hidden bg-[#03030c]">
          {[...Array(24)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-[2px] w-[2px] rounded-full bg-white"
              style={{ left: `${(i * 41) % 100}%`, top: `${(i * 29) % 100}%` }}
              animate={{ opacity: [0.15, 1, 0.15] }}
              transition={{ duration: 2 + (i % 5), repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
          <div className="absolute right-[18%] top-[20%] h-10 w-10 rounded-full bg-[#e8e8f4]/90 shadow-[0_0_30px_rgba(232,232,244,0.5)]" />
        </div>
      );
    case "sunrise":
      return (
        <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-[#1a0f2e] via-[#3d1d3a] to-[#c2571d]">
          <motion.div
            className="absolute left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-[#ffa500]"
            style={{ boxShadow: "0 0 60px rgba(255,165,0,0.8)" }}
            animate={{ bottom: ["6%", "18%"] }}
            transition={{ duration: 4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
          <div className="absolute inset-x-0 bottom-0 h-[18%] bg-[#0d0208]" />
        </div>
      );
    case "static":
      return (
        <div className="absolute inset-0 overflow-hidden bg-[#0a0a0a]">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute inset-x-0 h-[3px] bg-white/60"
              animate={{ top: [`${i * 25}%`, `${i * 25 + 12}%`, `${i * 25}%`], opacity: [0, 1, 0] }}
              transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.4, repeatDelay: 0.8 }}
            />
          ))}
        </div>
      );
    case "silk":
      return (
        <div className="absolute inset-0 overflow-hidden bg-[#120818]">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute inset-x-[-20%] h-24 rounded-[100%] bg-gradient-to-r from-transparent via-[#e8e8f4]/15 to-transparent"
              style={{ top: `${i * 18}%` }}
              animate={{ x: ["-6%", "6%", "-6%"], skewY: [-3, 3, -3] }}
              transition={{ duration: 6 + i * 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </div>
      );
    default:
      return <div className="absolute inset-0 bg-cosmos" />;
  }
}

/* ──────────────────────────────────────────────────────────────── */

export function OnboardingQuiz({ onComplete, onSkip }: OnboardingQuizProps) {
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const question = QUIZ[step];

  function pick(optionId: string) {
    const next = [...picks, optionId];
    if (step + 1 < QUIZ.length) {
      setPicks(next);
      setStep(step + 1);
    } else {
      const profile = buildProfile(next);
      saveProfile(profile);
      onComplete(profile);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col bg-void"
    >
      {/* industrial header */}
      <div className="flex items-center justify-between px-6 pt-6 md:px-10">
        <span className="text-xs font-bold uppercase tracking-[0.3em] text-star-white">
          “PULSAR”
        </span>
        <button
          onClick={onSkip}
          className="text-[10px] font-bold uppercase tracking-[0.25em] text-star-white/40 transition-colors hover:text-star-white"
        >
          “SKIP” →
        </button>
      </div>

      {/* question counter — Off-White industrial numbering */}
      <div className="px-6 pt-10 text-center md:px-10">
        <motion.p
          key={`q-${step}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[10px] font-bold uppercase tracking-[0.35em] text-star-white/40"
        >
          Question {String(step + 1).padStart(2, "0")} / {String(QUIZ.length).padStart(2, "0")}
        </motion.p>
        <motion.h2
          key={`t-${step}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-3 text-2xl font-bold uppercase tracking-tight text-star-white md:text-4xl"
        >
          “WHICH ONE?”
        </motion.h2>
        <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-star-white/35">
          Tap the one that feels like you — no wrong answers
        </p>
      </div>

      {/* the two graphic options */}
      <div className="flex flex-1 items-center justify-center px-5 pb-10 pt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={question.id}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3 }}
            className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2"
          >
            {question.options.map((opt, i) => (
              <motion.button
                key={opt.id}
                onClick={() => pick(opt.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                aria-label={opt.label}
                className="group relative aspect-[4/3] overflow-hidden rounded-none border border-star-white/25 outline-none transition-colors hover:border-star-white focus-visible:border-star-white sm:aspect-square"
              >
                <Visual kind={opt.visual} />
                {/* Off-White corner marks */}
                <span className="absolute left-2 top-2 text-[9px] font-bold uppercase tracking-[0.25em] text-white/70">
                  “{String.fromCharCode(65 + i)}”
                </span>
                <span className="absolute bottom-2 right-2 text-[9px] font-bold text-white/50">
                  ✕
                </span>
                {/* hover arrow */}
                <span className="absolute bottom-2 left-2 translate-y-2 text-lg text-white opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                  →
                </span>
              </motion.button>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* progress bar */}
      <div className="px-6 pb-8 md:px-10">
        <div className="mx-auto flex max-w-3xl gap-1.5">
          {QUIZ.map((_, i) => (
            <div
              key={i}
              className={`h-[3px] flex-1 transition-colors duration-300 ${
                i <= step ? "bg-star-white" : "bg-star-white/15"
              }`}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
