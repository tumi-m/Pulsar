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
         button, `border-chrome-500` is brushed trim. */
      colors: {
        deck: {
          DEFAULT: "var(--deck-900)",
          600: "var(--deck-600)",
          700: "var(--deck-700)",
          800: "var(--deck-800)",
          900: "var(--deck-900)",
        },
        chrome: {
          DEFAULT: "var(--chrome-500)",
          100: "var(--chrome-100)",
          300: "var(--chrome-300)",
          500: "var(--chrome-500)",
          700: "var(--chrome-700)",
        },
        ink: {
          DEFAULT: "var(--ink-100)",
          100: "var(--ink-100)",
          400: "var(--ink-400)",
          600: "var(--ink-600)",
        },
        sony: "var(--sony-orange)",
        tps: "var(--tps-blue)",
        sport: "var(--sport-yellow)",
        vu: "var(--vu-red)",
        lcd: "var(--lcd-green)",
        cream: "var(--label-cream)",
        tape: "var(--tape-brown)",
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
