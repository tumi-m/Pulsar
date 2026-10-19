import { describe, it, expect, vi } from "vitest";
import {
  integrate,
  planGraft,
  planReveal,
  REST_ENERGY,
  REVEAL,
  settleLayout,
  type SimNode,
} from "@/components/SampleGraph";

/**
 * The sample graph's reveal draws only what an expand ADDED, and schedules it
 * so the lineage grows outward inside a hard 700ms cap. Both halves are pure,
 * so they're pinned here rather than by squinting at a screen recording.
 */

const song = (id: string, artist: string, title: string, level: number) => ({
  id,
  artist,
  title,
  year: null,
  level,
});

describe("planGraft", () => {
  // Graph so far: Stronger → Harder Better Faster Stronger → Cola Bottle Baby.
  const existing = [
    song("n0", "Kanye West", "Stronger", 0),
    song("n1", "Daft Punk", "Harder, Better, Faster, Stronger", 1),
    song("n2", "Edwin Birdsong", "Cola Bottle Baby", 2),
  ];
  const existingEdges = [
    { from: "n0", to: "n1" },
    { from: "n1", to: "n2" },
  ];
  // The route numbers every response from n0, whatever was clicked.
  const subChain = {
    nodes: [
      song("n0", "Daft Punk", "Harder, Better, Faster, Stronger", 0),
      song("n1", "EDWIN BIRDSONG", "cola bottle baby", 1),
      song("n2", "Somebody", "Older Record", 1),
      song("n3", "Someone Else", "Oldest Record", 2),
    ],
    edges: [
      { from: "n0", to: "n1" },
      { from: "n0", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n3" },
      { from: "n2", to: "n9" },
    ],
  };
  let seq = 0;
  const fresh = () => `g${++seq}`;

  it("gives new nodes graph-unique ids and levels counted from the graph's root", () => {
    seq = 0;
    const g = planGraft(existing, existingEdges, existing[1], subChain, fresh);
    expect(g.nodes.map((n) => n.id)).toEqual(["g1", "g2"]);
    const ids = new Set([...existing.map((n) => n.id), ...g.nodes.map((n) => n.id)]);
    expect(ids.size).toBe(existing.length + g.nodes.length);
    expect(g.nodes.map((n) => [n.title, n.level])).toEqual([
      ["Older Record", 2],
      ["Oldest Record", 3],
    ]);
  });

  it("re-uses songs already on the graph and skips edges it already draws", () => {
    seq = 0;
    const g = planGraft(existing, existingEdges, existing[1], subChain, fresh);
    // Cola Bottle Baby matched case-insensitively — not duplicated; its edge
    // from the clicked node already exists, so only the genuinely new links
    // remain. Self-loops and edges to ids the reply never defined are dropped.
    expect(g.nodes.some((n) => n.title.toLowerCase() === "cola bottle baby")).toBe(false);
    expect(g.edges).toEqual([
      { from: "n1", to: "g1" },
      { from: "g1", to: "g2" },
    ]);
  });

  it("treats an edge drawn the other way round as already drawn", () => {
    seq = 0;
    const g = planGraft(
      existing,
      [...existingEdges, { from: "n2", to: "n0" }],
      existing[0],
      {
        nodes: [song("n0", "Kanye West", "Stronger", 0), song("n1", "Edwin Birdsong", "Cola Bottle Baby", 1)],
        edges: [{ from: "n0", to: "n1" }],
      },
      fresh
    );
    expect(g).toEqual({ nodes: [], edges: [] });
  });
});

describe("planReveal", () => {
  it("grows a first load outward from the root inside the cap", () => {
    const edges = [
      { from: "n0", to: "n1" },
      { from: "n0", to: "n2" },
      { from: "n1", to: "n3" },
    ];
    const p = planReveal(edges, ["n0", "n1", "n2", "n3"]);
    expect(p.edgeMs).toBe(REVEAL.edgeMs);
    // Siblings fan out a beat apart; a grandchild's edge waits for its parent
    // node to arrive at the end of the edge before it.
    expect(p.edgeDelays).toEqual([0, REVEAL.siblingGapMs, REVEAL.edgeMs]);
    // Each node rides the edge that leads to it; the root pops in place.
    expect(p.nodeParents).toEqual([null, "n0", "n0", "n1"]);
    expect(p.nodeDelays).toEqual([0, 0, REVEAL.siblingGapMs, REVEAL.edgeMs]);
    expect(p.totalMs).toBeLessThanOrEqual(REVEAL.totalMs);
  });

  it("compresses a deep chain to the cap without breaking the order", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const edges = ids.slice(1).map((id, i) => ({ from: ids[i], to: id }));
    const p = planReveal(edges, ids);
    expect(p.totalMs).toBeLessThanOrEqual(REVEAL.totalMs);
    expect(p.edgeMs).toBeLessThan(REVEAL.edgeMs);
    for (let i = 1; i < edges.length; i++) {
      // Floors can shave a millisecond, never more.
      expect(p.edgeDelays[i]).toBeGreaterThanOrEqual(p.edgeDelays[i - 1] + p.edgeMs - 1);
    }
  });

  it("keeps a bushy expand inside the cap too", () => {
    const edges = Array.from({ length: 24 }, (_, i) => ({ from: "anchor", to: `g${i}` }));
    const p = planReveal(edges, edges.map((e) => e.to));
    expect(p.totalMs).toBeLessThanOrEqual(REVEAL.totalMs);
    expect(Math.max(...p.edgeDelays) + p.edgeMs).toBeLessThanOrEqual(REVEAL.totalMs);
    // Every new node grows from the expanded one.
    expect(new Set(p.nodeParents)).toEqual(new Set(["anchor"]));
  });

  it("starts an expand at once from the existing node, and draws links to old nodes", () => {
    const p = planReveal(
      [
        { from: "n4", to: "g1" },
        { from: "g1", to: "n2" }, // a new record that samples one already shown
      ],
      ["g1"]
    );
    expect(p.edgeDelays).toEqual([0, REVEAL.edgeMs]);
    expect(p.nodeDelays).toEqual([0]);
    expect(p.nodeParents).toEqual(["n4"]);
  });

  it("survives a malformed reply whose first edges form a cycle", () => {
    const p = planReveal(
      [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
      ["a", "b"]
    );
    expect(p.totalMs).toBeLessThanOrEqual(REVEAL.totalMs);
    expect(p.edgeDelays.every(Number.isFinite)).toBe(true);
  });

  it("handles nothing to reveal", () => {
    const p = planReveal([], []);
    expect(p.edgeDelays).toEqual([]);
    expect(p.nodeDelays).toEqual([]);
    expect(p.totalMs).toBe(REVEAL.edgeMs);
  });
});

/**
 * With reduced motion the force layout runs to rest before the graph is shown
 * and renders once, rather than flying the nodes out from the centre on
 * screen. These pin that the synchronous run really does arrive at rest.
 */
describe("settleLayout", () => {
  // Phone-width graph: the cramped case, where nodes end up against the walls.
  const W = 358;
  const H = 420;
  // A seeded scatter around the centre, like a fresh load's.
  const scatter = (count: number, seed = 7): SimNode[] => {
    let s = seed;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      x: W / 2 + (rand() - 0.5) * 120,
      y: H / 2 + (rand() - 0.5) * 120,
      vx: 0,
      vy: 0,
    }));
  };
  const chain = (count: number) =>
    Array.from({ length: count - 1 }, (_, i) => ({ from: `n${Math.floor(i / 2)}`, to: `n${i + 1}` }));

  // The time budget is for slow phones; off here, so a loaded CI box can't
  // change the answer.
  const unhurried = { budgetMs: Infinity };
  const truth = (nodes: SimNode[], edges: { from: string; to: string }[]) => {
    const t = nodes.map((n) => ({ ...n }));
    settleLayout(t, edges, W, H, { maxTicks: 50000, budgetMs: Infinity });
    return t;
  };
  const offBy = (a: SimNode[], b: SimNode[]) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));

  it("settles a fresh load without a frame loop, inside the bounds", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame");
    // 214 and 230 are long-tail starts: a 300-tick cap left them 137px and
    // 81px short of where they come to rest.
    for (const seed of [1, 7, 42, 99, 214, 230, 2024]) {
      const nodes = scatter(7, seed);
      nodes[0].fx = W / 2;
      nodes[0].fy = H / 2;
      const edges = chain(7);
      const rest = truth(nodes, edges);
      settleLayout(nodes, edges, W, H, unhurried);
      expect(offBy(nodes, rest)).toBeLessThan(2);
      // Nothing left that could be seen moving: well under a pixel a tick.
      const before = nodes.map((n) => [n.x, n.y]);
      integrate(nodes, edges, W, H);
      nodes.forEach((n, i) => {
        expect(Math.hypot(n.x - before[i][0], n.y - before[i][1])).toBeLessThan(0.5);
        expect(n.x).toBeGreaterThanOrEqual(40);
        expect(n.x).toBeLessThanOrEqual(W - 40);
        expect(n.y).toBeGreaterThanOrEqual(30);
        expect(n.y).toBeLessThanOrEqual(H - 30);
      });
      // The pinned root stays where it was pinned.
      expect([nodes[0].x, nodes[0].y]).toEqual([W / 2, H / 2]);
      // And the graph actually spread out from its starting clump.
      const spread = Math.max(...nodes.map((n) => Math.hypot(n.x - W / 2, n.y - H / 2)));
      expect(spread).toBeGreaterThan(80);
    }
    expect(raf).not.toHaveBeenCalled();
    raf.mockRestore();
  });

  it("lands a graft where it comes to rest, not in a clump at the anchor", () => {
    for (const seed of [3, 73, 214]) {
      const nodes = scatter(7, seed);
      nodes[0].fx = W / 2;
      nodes[0].fy = H / 2;
      settleLayout(nodes, chain(7), W, H, unhurried);
      // As expandNode adds them: within ±40px of the clicked node.
      const anchor = nodes[6];
      const added = ["g1", "g2", "g3"].map((id, i) => ({
        id,
        x: anchor.x + (i - 1) * 30,
        y: anchor.y + 20,
        vx: 0,
        vy: 0,
      }));
      nodes.push(...added);
      const edges = [...chain(7), { from: "n6", to: "g1" }, { from: "n6", to: "g2" }, { from: "g2", to: "g3" }];
      const rest = truth(nodes, edges);
      settleLayout(nodes, edges, W, H, unhurried);
      expect(offBy(nodes, rest)).toBeLessThan(2);
    }
  });

  it("stops as soon as the layout is at rest", () => {
    const nodes = scatter(5);
    const edges = chain(5);
    expect(settleLayout(nodes, edges, W, H, unhurried)).toBeLessThan(2000);
    expect(integrate(nodes, edges, W, H)).toBeLessThan(REST_ENERGY);
    // Already at rest: running it again costs a single tick.
    expect(settleLayout(nodes, edges, W, H, unhurried)).toBe(1);
  });

  it("honours the tick cap and the time budget", () => {
    // Twelve nodes in a clump are nowhere near rest after three ticks.
    expect(settleLayout(scatter(12), chain(12), W, H, { maxTicks: 3, budgetMs: Infinity })).toBe(3);
    // Out of time: it stops after the tick in hand rather than finishing.
    expect(settleLayout(scatter(12), chain(12), W, H, { budgetMs: -1 })).toBe(1);
  });

  it("counts an empty graph as at rest", () => {
    expect(integrate([], [], W, H)).toBe(0);
    expect(settleLayout([], [], W, H)).toBe(1);
  });
});
