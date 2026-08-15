"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Play } from "lucide-react";

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

const ROLE_COLORS = ["#ff5fa2", "#9b5de5", "#00d4ff", "#45f0a0", "#ffb347", "#ff5b5b"];

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
  const [tick, setTick] = useState(0); // re-render trigger
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const widthRef = useRef(600);
  const heightRef = useRef(420);

  // ── physics ──────────────────────────────────────────────
  const step = useCallback(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const W = widthRef.current;
    const H = heightRef.current;
    const cx = W / 2;
    const cy = H / 2;

    // Repulsion (O(n²) but n is tiny — sample graphs are < 30 nodes)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
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
      // keep inside bounds
      n.x = Math.max(40, Math.min(W - 40, n.x));
      n.y = Math.max(30, Math.min(H - 30, n.y));
    }

    setTick((t) => (t + 1) % 1000000);
    rafRef.current = requestAnimationFrame(step);
  }, []);

  // ── load initial chain ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const res = await fetch(
          `/api/samples/chain?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`
        );
        if (!res.ok) throw new Error("chain fetch failed");
        const data: ChainResponse = await res.json();
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
        setReady(true);
        rafRef.current = requestAnimationFrame(step);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artist, title]);

  // Track the SVG size for responsive layout.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(() => {
      const rect = svg.getBoundingClientRect();
      widthRef.current = rect.width;
      heightRef.current = rect.height;
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  // ── expand a node: fetch its ancestors and graft them on ─
  const expandNode = async (node: GraphNode) => {
    if (node.loading) return;
    node.loading = true;
    setTick((t) => t + 1);
    try {
      const res = await fetch(
        `/api/samples/chain?artist=${encodeURIComponent(node.artist)}&title=${encodeURIComponent(node.title)}`
      );
      if (!res.ok) return;
      const data: ChainResponse = await res.json();
      const existing = new Map(nodesRef.current.map((n) => [`${n.artist}::${n.title}`.toLowerCase(), n]));
      const idMap = new Map<string, GraphNode>();
      let added = 0;
      for (const n of data.nodes) {
        if (n.level === 0) {
          idMap.set(n.id, node); // the root of this sub-chain IS the clicked node
          continue;
        }
        const key = `${n.artist}::${n.title}`.toLowerCase();
        if (existing.has(key)) {
          idMap.set(n.id, existing.get(key)!);
          continue;
        }
        const newNode: GraphNode = {
          ...n,
          x: node.x + (Math.random() - 0.5) * 80,
          y: node.y + (Math.random() - 0.5) * 80,
          vx: 0,
          vy: 0,
        };
        nodesRef.current.push(newNode);
        existing.set(key, newNode);
        idMap.set(n.id, newNode);
        added++;
      }
      for (const e of data.edges) {
        const a = idMap.get(e.from);
        const b = idMap.get(e.to);
        if (!a || !b) continue;
        const dup = edgesRef.current.some(
 (ed) =>
            (ed.from === a.id && ed.to === b.id) || (ed.from === b.id && ed.to === a.id)
        );
        if (!dup) edgesRef.current.push({ from: a.id, to: b.id });
      }
      // unpin the clicked node so the new subtree has room to settle
      node.fx = null;
      node.fy = null;
    } finally {
      node.loading = false;
      setTick((t) => t + 1);
    }
  };

  const nodes = nodesRef.current;
  const edges = edgesRef.current;
  const selNode = selected ? nodes.find((n) => n.id === selected) : null;

  const handleNodeDown = (node: GraphNode) => {
    const svg = svgRef.current;
    if (!svg) return;
    const start = { x: node.x, y: node.y };
    const onMove = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      node.fx = e.clientX - rect.left;
      node.fy = e.clientY - rect.top;
    };
    const onUp = () => {
      node.fx = null;
      node.fy = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    void start;
  };

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a14]/60 md:h-[480px]">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none"
        style={{ cursor: hovered ? "pointer" : "default" }}
      >
        {/* edges */}
        {edges.map((e, i) => {
          const a = nodes.find((n) => n.id === e.from);
          const b = nodes.find((n) => n.id === e.to);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgba(155,93,229,0.35)"
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
                  fill="rgba(232,232,244,0.9)"
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
          );
        })}
      </svg>

      {/* loading state */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a14]/80">
          <Loader2 size={22} className="animate-spin text-neon-violet" />
          <span className="ml-3 text-[11px] font-bold uppercase tracking-[0.2em] text-star-white/50">
            Tracing sample DNA…
          </span>
        </div>
      )}

      {/* selected node panel */}
      <AnimatePresence>
        {selNode && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="absolute bottom-3 left-3 right-3 rounded-xl border border-white/12 bg-[#0a0a14]/90 p-3 backdrop-blur-xl md:right-auto md:max-w-sm"
          >
            <p className="truncate text-[13px] font-bold text-star-white">{selNode.title}</p>
            <p className="truncate text-[11px] text-star-white/55">{selNode.artist}</p>
            <div className="mt-1.5 flex items-center gap-2">
              {selNode.year && (
                <span className="font-mono text-[10px] text-star-white/40">{selNode.year}</span>
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
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-star-white transition-colors hover:bg-white/[0.12]"
              >
                <Play size={11} fill="currentColor" /> Play
              </button>
              <button
                onClick={() => void expandNode(selNode)}
                disabled={selNode.loading}
                className="flex items-center gap-1.5 rounded-lg border border-neon-violet/40 bg-neon-violet/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-neon-violet transition-colors hover:bg-neon-violet/25 disabled:opacity-50"
              >
                {selNode.loading ? "Tracing…" : "Expand chain"}
              </button>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-star-white/35">
              Drag nodes to rearrange · click &ldquo;Expand chain&rdquo; to trace this song&rsquo;s
              own samples and grow the graph.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {ready && nodes.length <= 1 && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="text-[11px] leading-relaxed text-star-white/40">
            No sample chain found for this track via MusicBrainz. Try a track from the curated
            set (e.g. Kanye West — Stronger) for a rich graph.
          </p>
        </div>
      )}
    </div>
  );
}