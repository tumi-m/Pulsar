/**
 * The one way GSAP enters the app.
 *
 * GSAP is only worth its weight where a precise, sequenced timeline earns it —
 * the sample page's "how it was flipped" choreography — but that page is
 * statically reachable from the home page (ReleaseGrid → SamplesExplorer →
 * SamplePage). A plain `import gsap from "gsap"` anywhere on that path would
 * put the core, CSSPlugin and every plugin below into "/"'s first load for an
 * animation most visits never see. So nothing imports gsap directly: callers
 * ask for it here, at the moment they need it, and it arrives as its own
 * chunk.
 *
 * The promise is cached, so a page full of rows asks once, and the plugins are
 * registered exactly once — registering inside a component that re-renders is
 * what the gsap-plugins skill warns against. @gsap/react's useGSAP is not
 * loaded: it imports gsap statically, and a hook can't arrive late anyway.
 * Callers use gsap.matchMedia()/context() in an effect and revert() on cleanup.
 */

type GsapCore = typeof import("gsap").gsap;
type DrawSVG = typeof import("gsap/DrawSVGPlugin").DrawSVGPlugin;
type MotionPath = typeof import("gsap/MotionPathPlugin").MotionPathPlugin;
type ScrambleText = typeof import("gsap/ScrambleTextPlugin").ScrambleTextPlugin;

export interface GsapKit {
  gsap: GsapCore;
  plugins: {
    DrawSVGPlugin: DrawSVG;
    MotionPathPlugin: MotionPath;
    ScrambleTextPlugin: ScrambleText;
  };
}

let pending: Promise<GsapKit> | null = null;

export function loadGsap(): Promise<GsapKit> {
  // GSAP drives the DOM; there is nothing for it to do during SSR, and a
  // server-side call would cache a promise the client never shares anyway.
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadGsap() is browser-only"));
  }
  if (!pending) {
    pending = Promise.all([
      import("gsap"),
      import("gsap/DrawSVGPlugin"),
      import("gsap/MotionPathPlugin"),
      import("gsap/ScrambleTextPlugin"),
    ]).then(([core, draw, motionPath, scramble]) => {
      const gsap = core.gsap;
      const plugins = {
        DrawSVGPlugin: draw.DrawSVGPlugin,
        MotionPathPlugin: motionPath.MotionPathPlugin,
        ScrambleTextPlugin: scramble.ScrambleTextPlugin,
      };
      gsap.registerPlugin(plugins.DrawSVGPlugin, plugins.MotionPathPlugin, plugins.ScrambleTextPlugin);
      return { gsap, plugins };
    });
    // A chunk that failed to load (flaky network, a deploy mid-session) must
    // not poison the cache for the rest of the visit — the next row retries.
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
