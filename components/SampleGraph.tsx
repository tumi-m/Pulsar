"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Play } from "lucide-react";
import type { Timeline } from "animejs";
import { ifReadyWithin, loadAnime, type AnimeKit } from "@/lib/animeLoader";
import { EASE, useReducedMotion } from "@/lib/motion";

/**
 * Force-directed sample-DNA graph.
 *
 * A lightweight physics simulation (repulsion + spring edges + gravity) lays
 * songs out as nodes and sample relationships as edges — so a track's full
 * ancestry is visible at a glance instead of a flat list. Click a node to
 * fetch and graft its own ancestors onto the graph (expand the chain).
 *
 * This is the visual differentiator over WhoSampled: you SEE the lineage as a
 * living tree, and can walk it indefinitely.
 */

interface GraphNode {
  id: string;
  artist: string;
  title: string;
  year: string | null;
  level: number;
  // simulation state (mutated in place by the RAF loop)
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null; // pinned
  fy?: number | null;
  loading?: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
}

interface ChainResponse {
  nodes: { id: string; artist: string; title: string; year: string | null; level: number }[];
  edges: { from: string; to: string }[];
}

// Walkman palette, ordered so adjacent roles stay distinguishable:
// transport orange, housing blue, sport yellow, LCD green, VU red, J-card cream.
const ROLE_COLORS = ["#f2662c", "#4e86c7", "#ffce0a", "#7ed9ae", "#e23b2e", "#efe4cc"];

const edgeKey = (e: GraphEdge) => `${e.from}>${e.to}`;
const songKey = (n: { artist: string; title: string }) => `${n.artist}::${n.title}`.toLowerCase();

/**
 * Work out what an expanded node's sub-chain adds to the graph.
 *
 * The API numbers every response from `n0`, so the sub-chain's ids collide
 * with the graph's own: grafted nodes used to keep them, two nodes could share
 * a React key, and an edge could attach to the wrong record. New nodes get a
 * fresh graph id from `freshId`, and a level counted from the graph's root
 * rather than from the clicked node (which the sub-chain calls level 0).
 */
export function planGraft(
  existing: readonly { id: string; artist: string; title: string }[],
  existingEdges: readonly GraphEdge[],
  anchor: { id: string; level: number },
  data: ChainResponse,
  freshId: () => string
): { nodes: ChainResponse["nodes"]; edges: GraphEdge[] } {
  const byKey = new Map(existing.map((n) => [songKey(n), n.id]));
  const toGraph = new Map<string, string>();
  const nodes: ChainResponse["nodes"] = [];
  for (const n of data.nodes) {
    // The root of the sub-chain IS the clicked node.
    if (n.level === 0) {
      toGraph.set(n.id, anchor.id);
      continue;
    }
    const known = byKey.get(songKey(n));
    if (known) {
      toGraph.set(n.id, known);
      continue;
    }
    const id = freshId();
    nodes.push({ id, artist: n.artist, title: n.title, year: n.year, level: anchor.level + n.level });
    byKey.set(songKey(n), id);
    toGraph.set(n.id, id);
  }
  // Either direction counts as already drawn: the graph has no arrowheads.
  const drawn = new Set(existingEdges.flatMap((e) => [`${e.from}>${e.to}`, `${e.to}>${e.from}`]));
  const edges: GraphEdge[] = [];
  for (const e of data.edges) {
    const from = toGraph.get(e.from);
    const to = toGraph.get(e.to);
    if (!from || !to || from === to || drawn.has(`${from}>${to}`)) continue;
    drawn.add(`${from}>${to}`).add(`${to}>${from}`);
    edges.push({ from, to });
  }
  return { nodes, edges };
}

/**
 * Reveal timing. The whole reveal is capped at 700ms: it plays on every
 * expand, and a lineage that takes a second to grow reads as the app being
 * slow rather than as the record's history unfolding.
 */
export const REVEAL = { totalMs: 700, edgeMs: 340, siblingGapMs: 45, rippleMs: 600 } as const;

export interface RevealPlan {
  /** How long each edge takes to draw — and each node to travel out along it. */
  edgeMs: number;
  /** Per edge, aligned with the edges passed in. */
  edgeDelays: number[];
  /** Per node, aligned with the node ids passed in. */
  nodeDelays: number[];
  /** The node each new node travels out from; null pops it in place. */
  nodeParents: (string | null)[];
  totalMs: number;
}

/**
 * Schedule a reveal so the lineage grows outward: an edge starts drawing the
 * moment its source node has arrived, siblings fan out a beat apart, and each
 * new node rides the tip of the edge that leads to it. Deep or bushy grafts
 * are compressed as a whole (delays and durations alike) to fit the cap, so
 * that ordering survives at any size.
 */
export function planReveal(
  edges: readonly GraphEdge[],
  nodeIds: readonly string[],
  opts: { totalMs: number; edgeMs: number; siblingGapMs: number } = REVEAL
): RevealPlan {
  const fresh = new Set(nodeIds);
  // The edge a new node arrives along: the first new edge that ends at it.
  const inbound = new Map<string, number>();
  edges.forEach((e, i) => {
    if (fresh.has(e.to) && e.from !== e.to && !inbound.has(e.to)) inbound.set(e.to, i);
  });
  const fanOut = new Map<string, number>();
  const rank = edges.map((e) => {
    const r = fanOut.get(e.from) ?? 0;
    fanOut.set(e.from, r + 1);
    return r;
  });
  const raw: (number | undefined)[] = [];
  const delayOf = (i: number, depth: number): number => {
    const known = raw[i];
    if (known !== undefined) return known;
    const parent = inbound.get(edges[i].from);
    // `depth` bounds the walk, so a malformed response with a cycle of
    // first-inbound edges can't recurse forever.
    const start =
      parent !== undefined && parent !== i && depth < edges.length
        ? delayOf(parent, depth + 1) + opts.edgeMs
        : 0;
    return (raw[i] = start + rank[i] * opts.siblingGapMs);
  };
  const rawDelays = edges.map((_, i) => delayOf(i, 0));
  const rawEnd = Math.max(0, ...rawDelays) + opts.edgeMs;
  const k = Math.min(1, opts.totalMs / rawEnd);
  // Floors, not rounds: delay + duration must never add up past the cap.
  const edgeMs = Math.floor(opts.edgeMs * k);
  const edgeDelays = rawDelays.map((d) => Math.floor(d * k));
  const via = nodeIds.map((id) => inbound.get(id));
  const nodeDelays = via.map((i) => (i === undefined ? 0 : edgeDelays[i]));
  const nodeParents = via.map((i) => (i === undefined ? null : edges[i].from));
  const totalMs = Math.max(0, ...edgeDelays, ...nodeDelays) + edgeMs;
  return { edgeMs, edgeDelays, nodeDelays, nodeParents, totalMs };
}

/** The part of a node the force layout reads and writes. */
export type SimNode = Pick<GraphNode, "id" | "x" | "y" | "vx" | "vy" | "fx" | "fy">;

/** Below this mean kinetic energy per node the layout counts as at rest. */
export const REST_ENERGY = 0.002;

/**
 * One tick of the force layout: repulsion, spring edges, gravity toward the
 * centre, then integration with damping. Mutates the nodes in place and
 * returns their mean kinetic energy. Kept free of React and rAF so the same
 * physics can run live, a frame at a time, or all at once in `settleLayout`.
 */
export function integrate(nodes: SimNode[], edges: readonly GraphEdge[], W: number, H: number): number {
  const cx = W / 2;
  const cy = H / 2;

  // Repulsion (O(n²) but n is tiny — sample graphs are < 30 nodes)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) d2 = 1;
      const d = Math.sqrt(d2);
      const force = 3200 / d2;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Spring edges — pull connected nodes together.
  const idMap = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const a = idMap.get(e.from);
    const b = idMap.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const rest = 90;
    const k = 0.04;
    const f = (d - rest) * k;
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Gravity toward center + integration + damping.
  let energy = 0;
  for (const n of nodes) {
    n.vx += (cx - n.x) * 0.006;
    n.vy += (cy - n.y) * 0.006;
    if (n.fx != null) {
      n.x = n.fx;
      n.vx = 0;
    } else {
      n.x += n.vx;
      n.vx *= 0.82;
    }
    if (n.fy != null) {
      n.y = n.fy;
      n.vy = 0;
    } else {
      n.y += n.vy;
      n.vy *= 0.82;
    }
    // Keep inside bounds, and let the wall absorb the push. Clamping only the
    // position left the velocity rebuilding against the wall every frame,
    // so on a phone-width graph a node shoved into the edge counted as
    // moving forever and the loop never went to sleep.
    const bx = Math.max(40, Math.min(W - 40, n.x));
    const by = Math.max(30, Math.min(H - 30, n.y));
    if (bx !== n.x) {
      n.x = bx;
      n.vx = 0;
    }
    if (by !== n.y) {
      n.y = by;
      n.vy = 0;
    }
    energy += n.vx * n.vx + n.vy * n.vy;
  }
  // An empty graph is at rest. It used to divide by zero, compare NaN as
  // "still moving", and keep the loop awake behind an empty chain.
  return nodes.length ? energy / nodes.length : 0;
}

/**
 * Run the layout to rest without rendering in between: the reduced-motion
 * form of the simulation. The nodes appear where they end up instead of
 * flying out from the centre. Returns the ticks run.
 *
 * Most layouts are at rest within a few hundred ticks, but the tail is long:
 * at 300, one fresh 7-node load in twenty and a quarter of grafts were still
 * drifting, up to 200px from where they'd stop. 2000 put every graph up to
 * 30 nodes within 2px of rest in a seeded sweep. The time budget is for a slow
 * phone with a big graph. A layout cut short is still drawn without motion;
 * it just has further to jump the next time a drag or graft moves it.
 */
export function settleLayout(
  nodes: SimNode[],
  edges: readonly GraphEdge[],
  W: number,
  H: number,
  { maxTicks = 2000, budgetMs = 48 }: { maxTicks?: number; budgetMs?: number } = {}
): number {
  const deadline = performance.now() + budgetMs;
  for (let i = 1; i <= maxTicks; i++) {
    if (integrate(nodes, edges, W, H) < REST_ENERGY || performance.now() > deadline) return i;
  }
  return maxTicks;
}

/**
 * How long the graph, data in hand, waits for Anime.js before showing up
 * without its reveal. The chunk is fetched alongside the chain and is nearly
 * always there first; this only bites on a slow or stalled chunk, which must
 * never keep the lineage itself off screen.
 */
const ANIME_GRACE_MS = 150;

/** What the next commit should reveal: the nodes and edges it just added. */
interface RevealJob {
  nodes: string[];
  edges: GraphEdge[];
  /** The expanded node, which gets a ripple ring; null on first load. */
  anchor: string | null;
}

/** A reveal in flight, with every element it has written to. */
interface Reveal {
  tl: Timeline;
  edges: SVGPathElement[];
  bodies: SVGGElement[];
  ripple: SVGCircleElement | null;
}

/** What createDrawable leaves on a path: a normalised length and a dash. */
const DRAW_ATTRS = ["pathLength", "stroke-dasharray", "stroke-dashoffset", "draw"];

/**
 * Hand every element back exactly as React renders it without a reveal. Run
 * when a reveal finishes and when one is cut short, so a cancelled reveal can
 * never leave an edge half-drawn or a node invisible.
 */
function settle(r: Reveal) {
  for (const el of r.edges) for (const a of DRAW_ATTRS) el.removeAttribute(a);
  for (const el of [...r.bodies, r.ripple]) {
    el?.style.removeProperty("opacity");
    el?.style.removeProperty("transform");
  }
}

/**
 * Read at the moment of need, not once at mount, so turning the OS setting on
 * mid-visit is honoured by the very next expand.
 */
const motionUnwelcome = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function SampleGraph({
  artist,
  title,
  onPlayNode,
}: {
  artist: string;
  title: string;
  onPlayNode: (artist: string, title: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const rafRef = useRef<number>(0);
  // True while the simulation loop is scheduled. It used to run — and
  // re-render the whole SVG — sixty times a second for as long as the panel
  // was open, long after every node had stopped moving.
  const runningRef = useRef(false);
  const draggingRef = useRef(false);
  const [, setTick] = useState(0); // re-render trigger (value never read)
  const [ready, setReady] = useState(false);
  // The request failed, as opposed to succeeding with nothing to draw. Both
  // used to show "No sample chain found … try a different track", which
  // blamed the record for a network error and offered no way to retry.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const widthRef = useRef(600);
  const heightRef = useRef(420);
  const reduced = useReducedMotion();
  // ── reveal (Anime.js) ──
  // The simulation keeps writing every edge's `d` and every node's position
  // through React; the reveal only ever touches what React never renders — a
  // path's dash and an inner group's opacity/transform — so neither side can
  // overwrite the other mid-flight, and nothing here re-renders per frame.
  const animeRef = useRef<AnimeKit | null>(null);
  const pendingRevealRef = useRef<RevealJob | null>(null);
  const revealsRef = useRef(new Set<Reveal>());
  const [revealSeq, setRevealSeq] = useState(0);
  // Bumped per load and again on unmount, so an expand that resolves after the
  // panel moved on to another record — or closed the graph — can tell it would
  // be grafting onto a graph that's gone.
  const genRef = useRef(0);
  const graftSeqRef = useRef(0);

  // ── physics ──────────────────────────────────────────────
  const step = useCallback(() => {
    const energy = integrate(nodesRef.current, edgesRef.current, widthRef.current, heightRef.current);
    setTick((t) => (t + 1) % 1000000);
    // Sleep once the graph has come to rest; drag, expand and resize wake it.
    if (!draggingRef.current && energy < REST_ENERGY) {
      runningRef.current = false;
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const wake = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(step);
  }, [step]);

  /**
   * Bring the layout to rest after a load, a graft, a resize or a drop.
   * Normally that's the live simulation. With reduced motion the same physics
   * runs to rest synchronously and the graph renders once, already settled;
   * the live loop then only ever runs under a finger, mid-drag.
   */
  const relayout = useCallback(() => {
    if (!motionUnwelcome()) return wake();
    // Mid-drag the loop is already live under the finger, and the drop
    // settles whatever this added.
    if (draggingRef.current && runningRef.current) return;
    cancelAnimationFrame(rafRef.current);
    runningRef.current = false;
    settleLayout(nodesRef.current, edgesRef.current, widthRef.current, heightRef.current);
    setTick((t) => (t + 1) % 1000000);
  }, [wake]);

  // ── reveal ───────────────────────────────────────────────
  /** Reveal these additions on the commit that renders them. */
  const queueReveal = (job: RevealJob) => {
    const prev = pendingRevealRef.current;
    pendingRevealRef.current = prev
      ? {
          nodes: [...prev.nodes, ...job.nodes],
          edges: [...prev.edges, ...job.edges],
          anchor: job.anchor ?? prev.anchor,
        }
      : job;
    setRevealSeq((s) => s + 1);
  };

  const stopReveals = () => {
    pendingRevealRef.current = null;
    for (const r of revealsRef.current) {
      r.tl.revert();
      settle(r);
    }
    revealsRef.current.clear();
  };

  // A layout effect, so the hidden first frame is in place before the browser
  // paints the commit that added these elements — otherwise every new edge
  // flashes fully drawn for a frame before it starts drawing.
  useLayoutEffect(() => {
    const job = pendingRevealRef.current;
    pendingRevealRef.current = null;
    const anime = animeRef.current;
    const svg = svgRef.current;
    if (!job || !anime || !svg || motionUnwelcome()) return;

    const plan = planReveal(job.edges, job.nodes);
    const edgeAt = new Map(job.edges.map((e, i) => [edgeKey(e), i]));
    const nodeAt = new Map(job.nodes.map((id, i) => [id, i]));
    const edgeEls: SVGPathElement[] = [];
    const edgeIdx: number[] = [];
    svg.querySelectorAll<SVGPathElement>("path[data-edge]").forEach((el) => {
      const i = edgeAt.get(el.dataset.edge ?? "");
      if (i !== undefined) {
        edgeEls.push(el);
        edgeIdx.push(i);
      }
    });
    const bodyEls: SVGGElement[] = [];
    const bodyIdx: number[] = [];
    svg.querySelectorAll<SVGGElement>("g[data-node-body]").forEach((el) => {
      const i = nodeAt.get(el.dataset.nodeBody ?? "");
      if (i !== undefined) {
        bodyEls.push(el);
        bodyIdx.push(i);
      }
    });
    const ripple = job.anchor
      ? Array.from(svg.querySelectorAll<SVGCircleElement>("circle[data-ripple]")).find(
          (el) => el.dataset.ripple === job.anchor
        ) ?? null
      : null;
    if (!edgeEls.length && !bodyEls.length && !ripple) return;

    // Each new node's progress out along the edge that leads to it, animated
    // as plain numbers and turned into a transform in `ride`. Reading where
    // the simulation has the node and its parent on every frame keeps the
    // node on the tip of its line even while the layout is still flying
    // apart; a fixed start offset drifted off the line within a few frames.
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    const riders = bodyEls.map((el, k) => ({
      el,
      node: byId.get(job.nodes[bodyIdx[k]]),
      from: byId.get(plan.nodeParents[bodyIdx[k]] ?? ""),
      t: 0,
      s: 0.3,
      o: 0,
    }));
    const ride = () => {
      for (const r of riders) {
        const k = 1 - r.t;
        const dx = r.node && r.from ? (r.from.x - r.node.x) * k : 0;
        const dy = r.node && r.from ? (r.from.y - r.node.y) * k : 0;
        r.el.style.transform = `translate(${dx}px, ${dy}px) scale(${r.s})`;
        r.el.style.opacity = `${r.o}`;
      }
    };
    // Hidden now rather than on the timeline's first tick, so a node still
    // waiting out its delay is never on screen at full size for a frame.
    ride();

    const travel = anime.cubicBezier(...EASE.out);
    const reveal: Reveal = {
      tl: anime.createTimeline({
        onRender: ride,
        onComplete: () => {
          settle(reveal);
          revealsRef.current.delete(reveal);
        },
      }),
      edges: edgeEls,
      bodies: bodyEls,
      ripple,
    };

    if (ripple) {
      reveal.tl.add(
        ripple,
        { opacity: { from: 0.7, to: 0 }, scale: { from: 1, to: 3.2 }, duration: REVEAL.rippleMs, ease: travel },
        0
      );
    }
    if (edgeEls.length) {
      // pathLength normalises the dash, so a draw of "0 0.5" is half the edge
      // however long the simulation has stretched it this frame. Created at
      // "0 0", which hides each edge synchronously, before paint.
      reveal.tl.add(
        anime.createDrawable(edgeEls, 0, 0),
        {
          draw: { from: "0 0", to: "0 1" },
          duration: plan.edgeMs,
          delay: (_el: unknown, i = 0) => plan.edgeDelays[edgeIdx[i]],
          ease: travel,
        },
        0
      );
    }
    if (riders.length) {
      reveal.tl.add(
        riders,
        {
          // The edge's own duration and curve, so the node arrives exactly as
          // its line does; the scale overshoots to land it with some weight.
          t: { to: 1, ease: travel },
          s: { to: 1, ease: anime.cubicBezier(...EASE.overshoot) },
          o: { to: 1, duration: Math.min(plan.edgeMs, 160), ease: "linear" },
          duration: plan.edgeMs,
          delay: (_el: unknown, i = 0) => plan.nodeDelays[bodyIdx[i]],
        },
        0
      );
    }
    revealsRef.current.add(reveal);
  }, [revealSeq]);

  // ── load initial chain ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    genRef.current += 1;
    setReady(false);
    setFailed(false);
    // Fetched alongside the chain, so the graph's first frame can already be
    // the first frame of its reveal. Reduced motion never downloads it, and a
    // failed or late chunk just means the graph appears without the reveal:
    // once the chain is here it waits ANIME_GRACE_MS for the kit, no longer.
    // Caught here, not only in ifReadyWithin: a chunk that fails while the
    // fetch is still out would otherwise be an unhandled rejection meanwhile.
    const animeP = motionUnwelcome() ? Promise.resolve(null) : loadAnime().catch(() => null);
    (async () => {
      try {
        const res = await fetch(
          `/api/samples/chain?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`
        );
        if (!res.ok) throw new Error("chain fetch failed");
        const data: ChainResponse = await res.json();
        const anime = await ifReadyWithin(animeP, ANIME_GRACE_MS);
        if (cancelled) return;
        const W = widthRef.current;
        const H = heightRef.current;
        const byOldId = new Map<string, GraphNode>();
        const gnodes: GraphNode[] = data.nodes.map((n) => {
          const node: GraphNode = {
            ...n,
            x: W / 2 + (Math.random() - 0.5) * 120,
            y: H / 2 + (Math.random() - 0.5) * 120,
            vx: 0,
            vy: 0,
          };
          byOldId.set(n.id, node);
          return node;
        });
        // The root (level 0) is pinned to the centre initially.
        const root = gnodes.find((n) => n.level === 0);
        if (root) {
          root.fx = W / 2;
          root.fy = H / 2;
        }
        // Remap edges from the API's node ids to our graph ids (they match).
        const gedges: GraphEdge[] = data.edges.map((e) => ({ from: e.from, to: e.to }));
        nodesRef.current = gnodes;
        edgesRef.current = gedges;
        animeRef.current = anime;
        if (anime) queueReveal({ nodes: gnodes.map((n) => n.id), edges: gedges, anchor: null });
        setReady(true);
        cancelAnimationFrame(rafRef.current);
        runningRef.current = false;
        relayout();
      } catch {
        if (!cancelled) {
          setFailed(true);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      // Retires any expand still in flight: its reply must neither graft onto
      // this graph nor wake the simulation on a component that's gone.
      genRef.current += 1;
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      stopReveals();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artist, title, attempt]);

  // Track the SVG size for responsive layout.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(() => {
      const rect = svg.getBoundingClientRect();
      widthRef.current = rect.width;
      heightRef.current = rect.height;
      if (nodesRef.current.length) relayout();
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [relayout]);

  // ── expand a node: fetch its ancestors and graft them on ─
  const expandNode = async (node: GraphNode) => {
    if (node.loading) return;
    node.loading = true;
    setTick((t) => t + 1);
    const gen = genRef.current;
    // Cached after the first load, so this resolves at once; started before
    // the fetch anyway in case that first load was reduced-motion, failed or
    // gave up on a late chunk. Either way the graft never waits past the grace.
    const animeP = motionUnwelcome() ? Promise.resolve(null) : loadAnime().catch(() => null);
    try {
      const res = await fetch(
        `/api/samples/chain?artist=${encodeURIComponent(node.artist)}&title=${encodeURIComponent(node.title)}`
      );
      if (!res.ok) return;
      const data: ChainResponse = await res.json();
      const anime = await ifReadyWithin(animeP, ANIME_GRACE_MS);
      // The panel moved on to another record while this was in flight:
      // grafting now would splice this song's ancestors into that graph.
      if (gen !== genRef.current) return;
      const graft = planGraft(
        nodesRef.current,
        edgesRef.current,
        node,
        data,
        () => `g${++graftSeqRef.current}`
      );
      for (const n of graft.nodes) {
        nodesRef.current.push({
          ...n,
          x: node.x + (Math.random() - 0.5) * 80,
          y: node.y + (Math.random() - 0.5) * 80,
          vx: 0,
          vy: 0,
        });
      }
      edgesRef.current.push(...graft.edges);
      // unpin the clicked node so the new subtree has room to settle
      node.fx = null;
      node.fy = null;
      if (anime && (graft.nodes.length || graft.edges.length)) {
        animeRef.current = anime;
        queueReveal({ nodes: graft.nodes.map((n) => n.id), edges: graft.edges, anchor: node.id });
      }
    } catch {
      // Offline or a malformed reply: the button simply comes back to try again.
    } finally {
      node.loading = false;
      // After an unmount or a record change this node belongs to a graph that
      // no longer exists: waking the loop would run the layout on it every
      // frame until it came to rest, for nothing on screen.
      if (gen === genRef.current) {
        setTick((t) => t + 1);
        relayout();
      }
    }
  };

  const nodes = nodesRef.current;
  const edges = edgesRef.current;
  const selNode = selected ? nodes.find((n) => n.id === selected) : null;

  const handleNodeDown = (node: GraphNode) => {
    const svg = svgRef.current;
    if (!svg) return;
    const start = { x: node.x, y: node.y };
    draggingRef.current = true;
    // Woken by the first move, not the press: a tap that only selects a node
    // shouldn't set the layout going, and with reduced motion it mustn't.
    let moved = false;
    const onMove = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      node.fx = e.clientX - rect.left;
      node.fy = e.clientY - rect.top;
      moved = true;
      wake();
    };
    const onUp = () => {
      draggingRef.current = false;
      node.fx = null;
      node.fy = null;
      // Mid-drag the graph follows the finger either way; with reduced motion
      // the drift back to rest after the drop lands at once instead.
      if (moved && motionUnwelcome()) relayout();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // A touch the browser takes over (a scroll, a system gesture) ends in
    // pointercancel, not pointerup — which left the node stuck to a finger
    // that had already gone.
    window.addEventListener("pointercancel", onUp);
    void start;
  };

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#12161a]/60 md:h-[480px]">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none"
        style={{ cursor: hovered ? "pointer" : "default" }}
      >
        {/* edges — <path> rather than <line>: the reveal normalises each one
            with pathLength, and <path> is where browsers have supported that
            attribute longest. Drawn from the sampling record toward its source. */}
        {edges.map((e) => {
          const a = nodes.find((n) => n.id === e.from);
          const b = nodes.find((n) => n.id === e.to);
          if (!a || !b) return null;
          return (
            <path
              key={edgeKey(e)}
              data-edge={edgeKey(e)}
              d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
              fill="none"
              stroke="rgba(242,102,44,0.35)"
              strokeWidth={1.5}
            />
          );
        })}
        {/* nodes */}
        {nodes.map((n) => {
          const r = n.level === 0 ? 10 : 7;
          const color = ROLE_COLORS[n.level % ROLE_COLORS.length];
          const isSel = selected === n.id;
          const isHover = hovered === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              onPointerDown={() => handleNodeDown(n)}
              onClick={() => setSelected(n.id)}
              onPointerEnter={() => setHovered(n.id)}
              onPointerLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Ripple when this node's expansion lands. Invisible by
                  attribute, so it stays hidden once the reveal clears its
                  inline styles; the stroke stays hairline as it scales. */}
              <circle
                data-ripple={n.id}
                r={r + 2}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                opacity={0}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              {/* The reveal's scale/opacity/travel lands on this inner group:
                  the outer one's transform is the simulation's. */}
              <g data-node-body={n.id}>
                {(isSel || isHover) && (
                  <circle r={r + 6} fill={color} opacity={0.18} />
                )}
                <circle
                  r={r}
                  fill={color}
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth={n.level === 0 ? 2 : 1}
                  style={{ filter: `drop-shadow(0 0 ${isHover ? 10 : 5}px ${color})` }}
                />
                {(isHover || isSel || n.level === 0) && (
                  <text
                    y={r + 12}
                    textAnchor="middle"
                    className="pointer-events-none select-none"
                    fontSize={9}
                    fontWeight={700}
                    fill="rgba(237,241,244,0.9)"
                  >
                    {n.title.length > 22 ? n.title.slice(0, 21) + "…" : n.title}
                  </text>
                )}
                {n.loading && (
                  <circle
                    r={r + 3}
                    fill="none"
                    stroke="white"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    className="animate-spin"
                    style={{ transformOrigin: "0 0" }}
                  />
                )}
              </g>
            </g>
          );
        })}
      </svg>

      {/* loading state */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#12161a]/80">
          <Loader2 size={22} className="animate-spin text-sony" />
          <span className="ml-3 text-[11px] font-bold uppercase tracking-[0.2em] text-ink/50">
            Tracing sample DNA…
          </span>
        </div>
      )}

      {/* selected node panel */}
      <AnimatePresence>
        {selNode && (
          <motion.div
            initial={{ opacity: 0, y: reduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : 12 }}
            className="absolute bottom-3 left-3 right-3 rounded-xl border border-white/[0.12] bg-[#12161a]/90 p-3 backdrop-blur-xl md:right-auto md:max-w-sm"
          >
            <p className="truncate text-[13px] font-bold text-ink">{selNode.title}</p>
            <p className="truncate text-[11px] text-ink/55">{selNode.artist}</p>
            <div className="mt-1.5 flex items-center gap-2">
              {selNode.year && (
                <span className="font-mono text-[10px] text-ink/40">{selNode.year}</span>
              )}
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                style={{
                  background: `${ROLE_COLORS[selNode.level % ROLE_COLORS.length]}30`,
                  color: ROLE_COLORS[selNode.level % ROLE_COLORS.length],
                }}
              >
                Level {selNode.level}
              </span>
            </div>
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={() => onPlayNode(selNode.artist, selNode.title)}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink transition-colors hover:bg-white/[0.12]"
              >
                <Play size={11} fill="currentColor" /> Play
              </button>
              <button
                onClick={() => void expandNode(selNode)}
                disabled={selNode.loading}
                className="flex items-center gap-1.5 rounded-lg border border-sony/40 bg-sony/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-sony transition-colors hover:bg-sony/25 disabled:opacity-50"
              >
                {selNode.loading ? "Tracing…" : "Expand chain"}
              </button>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-ink/35">
              Drag nodes to rearrange · click &ldquo;Expand chain&rdquo; to trace this song&rsquo;s
              own samples and grow the graph.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {ready && failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-[11px] leading-relaxed text-ink/50">
            Couldn&rsquo;t reach the sample graph just now.
          </p>
          <button
            onClick={() => setAttempt((n) => n + 1)}
            className="min-h-9 rounded-[10px] border border-chrome-700/70 bg-deck-600 px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-ink shadow-key active:translate-y-px active:shadow-keyed"
          >
            Try again
          </button>
        </div>
      )}
      {ready && !failed && nodes.length <= 1 && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="text-[11px] leading-relaxed text-ink/40">
            No sample chain found for this track via MusicBrainz. Try a track from the curated
            set (e.g. Kanye West — Stronger) for a rich graph.
          </p>
        </div>
      )}
    </div>
  );
}