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
      /* Walkman palette. Values live as CSS custom properties in
         app/globals.css — see the comment there for where each colour comes
         from and what it means. Tokens are named for the part of the machine
         they belong to, so a class says what it is rather than what hue it
         happens to be: `bg-deck` is the housing, `text-sony` is the transport
         button, `border-chrome-500` is brushed trim.

         Each reads the -rgb channel twin with <alpha-value>, because that is
         the only shape Tailwind 3 can apply `/60`-style opacity to. A bare
         `var(--x)` here silently drops every opacity-modified class. */
      colors: {
        deck: {
          DEFAULT: "rgb(var(--deck-900-rgb) / <alpha-value>)",
          600: "rgb(var(--deck-600-rgb) / <alpha-value>)",
          700: "rgb(var(--deck-700-rgb) / <alpha-value>)",
          800: "rgb(var(--deck-800-rgb) / <alpha-value>)",
          900: "rgb(var(--deck-900-rgb) / <alpha-value>)",
        },
        chrome: {
          DEFAULT: "rgb(var(--chrome-500-rgb) / <alpha-value>)",
          100: "rgb(var(--chrome-100-rgb) / <alpha-value>)",
          300: "rgb(var(--chrome-300-rgb) / <alpha-value>)",
          500: "rgb(var(--chrome-500-rgb) / <alpha-value>)",
          700: "rgb(var(--chrome-700-rgb) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink-100-rgb) / <alpha-value>)",
          100: "rgb(var(--ink-100-rgb) / <alpha-value>)",
          400: "rgb(var(--ink-400-rgb) / <alpha-value>)",
          600: "rgb(var(--ink-600-rgb) / <alpha-value>)",
        },
        sony: "rgb(var(--sony-orange-rgb) / <alpha-value>)",
        tps: "rgb(var(--tps-blue-rgb) / <alpha-value>)",
        sport: "rgb(var(--sport-yellow-rgb) / <alpha-value>)",
        vu: "rgb(var(--vu-red-rgb) / <alpha-value>)",
        lcd: "rgb(var(--lcd-green-rgb) / <alpha-value>)",
        cream: "rgb(var(--label-cream-rgb) / <alpha-value>)",
        tape: "rgb(var(--tape-brown-rgb) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      backgroundImage: {
        /* The two signature surfaces. Their values live in app/globals.css so a
           single edit changes the brand everywhere; they used to be pasted as
           literals at ten call sites. */
        faceplate: "var(--grad-faceplate)",
        transport: "var(--grad-transport)",
        /* Brushed aluminium: a fine vertical grain over a metal tone. */
        brushed:
          "repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 3px), " +
          "linear-gradient(180deg, #2a323b 0%, #1a2027 55%, #151b21 100%)",
      },
      /* `ease-[cubic-bezier(0.22,1,0.36,1)]` emitted NO CSS: tailwindcss-animate
         also registers ease-*, the arbitrary value is ambiguous, and Tailwind
         drops it. Three layout transitions ran on the default curve instead.
         A named token is unambiguous; it is lib/motion.ts EASE.out. */
      transitionTimingFunction: {
        settle: "cubic-bezier(0.22, 1, 0.36, 1)",
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
        /* A lit control, not a neon sign: a tight halo the colour of the part
           itself, over the deep shadow a physical object casts. */
        sony: "0 0 18px rgba(242,102,44,0.45), 0 0 52px rgba(242,102,44,0.18)",
        tps: "0 0 18px rgba(78,134,199,0.45), 0 0 52px rgba(78,134,199,0.18)",
        sport: "0 0 18px rgba(255,206,10,0.45), 0 0 52px rgba(255,206,10,0.18)",
        vu: "0 0 18px rgba(226,59,46,0.45), 0 0 52px rgba(226,59,46,0.18)",
        /* A physical key: bezel highlight above, dark well below — and the
           same key while it is held down. */
        key: "inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.5), 0 2px 5px rgba(0,0,0,0.55)",
        keyed: "inset 0 2px 5px rgba(0,0,0,0.65), inset 0 -1px 0 rgba(255,255,255,0.08)",
        "card-hover": "0 30px 80px rgba(0,0,0,0.8), 0 0 40px rgba(78,134,199,0.10)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
