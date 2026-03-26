import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#04040a",
        cosmos: "#08081a",
        nebula: "#0f0f2a",
        "neon-blue": "#00d4ff",
        "neon-pink": "#ff0080",
        "neon-violet": "#9b5de5",
        "neon-amber": "#ffa500",
        "neon-green": "#00ff88",
        "star-white": "#e8e8f4",
        "dust": "#4a4a6a",
        "mist": "#2a2a4a",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      backgroundImage: {
        "cosmic-radial":
          "radial-gradient(ellipse at center, #0f0f2a 0%, #04040a 70%)",
        "neon-glow-blue":
          "radial-gradient(ellipse, rgba(0,212,255,0.15) 0%, transparent 70%)",
        "neon-glow-pink":
          "radial-gradient(ellipse, rgba(255,0,128,0.15) 0%, transparent 70%)",
      },
      animation: {
        "float": "float 6s ease-in-out infinite",
        "float-slow": "float 10s ease-in-out infinite",
        "pulse-glow": "pulseGlow 3s ease-in-out infinite",
        "drift": "drift 20s linear infinite",
        "spin-slow": "spin 20s linear infinite",
        "gravity-drop": "gravityDrop 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards",
        "particle-rise": "particleRise 4s ease-out forwards",
        "scanline": "scanline 8s linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
        drift: {
          "0%": { transform: "translateX(0) translateY(0)" },
          "25%": { transform: "translateX(10px) translateY(-15px)" },
          "50%": { transform: "translateX(-5px) translateY(-30px)" },
          "75%": { transform: "translateX(-15px) translateY(-15px)" },
          "100%": { transform: "translateX(0) translateY(0)" },
        },
        gravityDrop: {
          "0%": { transform: "translateY(-100px)", opacity: "0" },
          "60%": { transform: "translateY(10px)", opacity: "1" },
          "80%": { transform: "translateY(-5px)" },
          "100%": { transform: "translateY(0px)", opacity: "1" },
        },
        particleRise: {
          "0%": { transform: "translateY(0) scale(1)", opacity: "1" },
          "100%": { transform: "translateY(-200px) scale(0)", opacity: "0" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
      boxShadow: {
        "neon-blue": "0 0 20px rgba(0,212,255,0.5), 0 0 60px rgba(0,212,255,0.2)",
        "neon-pink": "0 0 20px rgba(255,0,128,0.5), 0 0 60px rgba(255,0,128,0.2)",
        "neon-violet": "0 0 20px rgba(155,93,229,0.5), 0 0 60px rgba(155,93,229,0.2)",
        "card-hover": "0 30px 80px rgba(0,0,0,0.8), 0 0 40px rgba(0,212,255,0.1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
