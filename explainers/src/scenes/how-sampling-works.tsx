import {
  Circle,
  CubicBezier,
  Gradient,
  Layout,
  Line,
  makeScene2D,
  Node,
  Rect,
  Txt,
} from '@motion-canvas/2d';
import {
  all,
  chain,
  createRef,
  createRefArray,
  createSignal,
  delay,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  linear,
  range,
  sequence,
  waitFor,
  type PossibleVector2,
  type ReferenceReceiver,
  type ThreadGenerator,
} from '@motion-canvas/core';

import {fontsReady, MONO, SANS} from '../fonts';
import {C} from '../palette';

/**
 * "How sampling works" — the explainer at the top of the Samples panel.
 *
 * One mechanic, shown twice so it reads as a rule rather than an anecdote:
 * a slice of a record is cut, carried into a new song's timeline and looped;
 * then that new song is cut the same way. It ends by folding the three
 * records into the node-and-edge picture the sample graph draws, so the
 * panel's main view is already familiar when you reach it.
 *
 * It is designed at 1920×1080 but mostly watched about 360 px wide inside
 * the panel (a scale of ~0.19), so nothing that carries meaning is set below
 * ~44 px, and the sentence at the top does the explaining — the diagram only
 * has to be readable as shapes.
 *
 * Frame 0 is a complete title card over the original record. It is the
 * poster: with reduced motion the player sits on it until someone presses
 * play.
 */

/* ── layout, in world units (the world group pans between beats) ───────── */

const ROW_Y = [0, 380, 760];
const CARD_X = -640;
const CARD = 300;
const VINYL_X = -520;
const LANE_X = 230;
const LANE_W = 1180;
const LANE_H = 210;
/** The drawable width inside a lane. */
const INNER = 1100;
const HEAD_Y = -392;
const KICK_Y = -462;
/** Where tags and timestamps sit above a lane (lane-local). */
const TAG_Y = -LANE_H / 2 - 60;

const BARS = 56;
const PITCH = INNER / BARS;
const BAR_W = 11;
const barX = (i: number) => -INNER / 2 + PITCH * (i + 0.5);

/** The four seconds that get sampled: bars [34, 42) of the original. */
const CUT = {from: 34, to: 42};
const CUT_LEFT = -INNER / 2 + PITCH * CUT.from;
const CUT_RIGHT = -INNER / 2 + PITCH * CUT.to;
const CUT_MID = (CUT_LEFT + CUT_RIGHT) / 2;
const SLICE_W = CUT_RIGHT - CUT_LEFT + 16;
const SLICE_H = 196;
const inCut = (i: number) => i >= CUT.from && i < CUT.to;

/** A new song's timeline: four bars of four beats. */
const SLOT = INNER / 4;
const slotX = (j: number) => -INNER / 2 + SLOT * (j + 0.5);
const BEAT = SLOT / 4;
/** A slice stretched to fill one bar — the time-stretch is the point. */
const SLOT_SCALE: PossibleVector2 = [(SLOT - 20) / SLICE_W, 150 / SLICE_H];
const SLOT_Y = -12;
const DRUM_Y = LANE_H / 2 - 24;
/** The second generation's sample: bars 2–3 of the new song. */
const CHUNK_W = 2 * SLOT + 16;
const CHUNK_SCALE: PossibleVector2 = [(2 * SLOT - 12) / CHUNK_W, 0.95];

/** Where the three records end up as sample-graph nodes. */
const NODES: [number, number][] = [
  [-560, -10],
  [0, 170],
  [560, -10],
];
/** Other records branching off each one — the chain keeps going. */
const BRANCHES: [from: number, x: number, y: number][] = [
  [0, -820, 300],
  [0, -340, 390],
  [1, 210, 440],
  [2, 820, 300],
];

const RECORDS = [
  {title: 'ORIGINAL', year: '1973', color: C.sony},
  {title: 'NEW SONG', year: '1994', color: C.tps},
  {title: 'NEXT GEN', year: '2016', color: C.lcd},
];

/**
 * A believable waveform: a slow envelope over fast detail. Deterministic, so
 * every render and every viewer gets the same picture. The sampled bars are a
 * drum-break pattern instead, so the slice is recognisable each time it
 * reappears down the chain.
 */
const BREAK = [150, 64, 118, 72, 156, 60, 132, 92];
const HEIGHTS = range(BARS).map(i => {
  if (inCut(i)) return BREAK[i - CUT.from];
  const envelope = 0.55 + 0.45 * Math.sin(i * 0.23 + 0.6) * Math.sin(i * 0.07 + 1.1);
  const detail = 0.45 + 0.55 * Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
  return Math.round(28 + 128 * Math.max(0.1, envelope * detail));
});

const sport = (alpha: number) => `rgba(255, 206, 10, ${alpha})`;
/** sport(0.08) over the lane, pre-mixed: a lifted chunk must hide what it leaves behind. */
const CHUNK_FILL = '#252519';

export default makeScene2D(function* (view) {
  // Text is measured when a node is created; build nothing until the faces
  // are in, or the layout is computed against the fallback font.
  yield fontsReady();
  view.fill(C.deck900);

  /* ── references ───────────────────────────────────────────────────── */
  const world = createRef<Node>();
  const rowBodies = createRefArray<Node>();
  const vinyls = createRefArray<Node>();
  const cards = createRefArray<Rect>();
  const cardDetails = createRefArray<Node>();
  const years = createRefArray<Txt>();

  const kicker = createRef<Txt>();
  const headline = createRef<Txt>();
  const tagline = createRef<Txt>();
  const pills = createRefArray<Rect>();

  // 01–02: the original
  const head1 = createSignal(-INNER / 2 - 12);
  const cutSweep = createSignal(0);
  const cutDim = createSignal(0);
  const playhead1 = createRef<Node>();
  const highlight1 = createRef<Rect>();
  const cutMarks = createRefArray<Line>();
  const stamp1 = createRef<Rect>();
  const bpm1 = createRef<Rect>();
  const slice = createRef<Node>();

  // 03: the flip
  const curve1 = createRef<CubicBezier>();
  const ride1 = createSignal(0);
  const loops = createRefArray<Node>();
  const loopBodies = createRefArray<Node>();
  const tags2 = createRefArray<Rect>();
  const bpm2 = createRef<Txt>();
  const pitch2 = createRef<Txt>();
  const drums = createRefArray<Rect>();
  const head2 = createSignal(-INNER / 2 - 12);
  const playhead2 = createRef<Node>();
  const chunkDim = createSignal(0);

  // 04: the chain
  const chunk = createRef<Node>();
  const chunkFrame = createRef<Rect>();
  const stamp2 = createRef<Rect>();
  const curve2 = createRef<CubicBezier>();
  const ride2 = createSignal(0);
  const chunkCopy = createRef<Node>();
  const tags3 = createRefArray<Rect>();
  const head3 = createSignal(-INNER / 2 - 12);
  const playhead3 = createRef<Node>();

  // close: the graph
  const edges = createRefArray<Line>();
  const branchEdges = createRefArray<Line>();
  const branchNodes = createRefArray<Node>();
  const pulse = createRef<Circle>();

  /* ── building blocks ──────────────────────────────────────────────── */

  const vinyl = (r: number) => (
    <Node ref={vinyls} x={VINYL_X}>
      <Circle size={270} fill={'#050607'} stroke={'rgba(255,255,255,0.10)'} lineWidth={2} />
      {[230, 198, 166].map(s => (
        <Circle size={s} stroke={'rgba(255,255,255,0.07)'} lineWidth={2} />
      ))}
      {/* A sheen and a label mark: a perfect disc doesn't look like it spins. */}
      <Circle
        size={246}
        stroke={'rgba(255,255,255,0.16)'}
        lineWidth={6}
        startAngle={-70}
        endAngle={-25}
      />
      <Circle size={100} fill={RECORDS[r].color} />
      <Rect y={-30} size={[8, 30]} radius={4} fill={'rgba(18,22,26,0.55)'} />
      <Circle size={16} fill={C.deck900} />
    </Node>
  );

  const card = (r: number) => (
    <Rect
      ref={cards}
      x={CARD_X}
      y={ROW_Y[r]}
      size={CARD}
      radius={18}
      fill={C.cream}
      clip
      opacity={r === 0 ? 1 : 0}
      shadowColor={'rgba(0,0,0,0.5)'}
      shadowBlur={30}
      shadowOffsetY={10}
    >
      <Node ref={cardDetails}>
        <Rect y={-CARD / 2 + 28} size={[CARD, 56]} fill={RECORDS[r].color} />
        <Txt
          x={-126}
          y={-34}
          offset={[-1, 0]}
          text={RECORDS[r].title}
          fontFamily={SANS}
          fontWeight={800}
          fontSize={44}
          letterSpacing={-0.5}
          fill={C.labelInk}
        />
        {/* The faint blue rules a J-card gives you to write a tracklist on. */}
        <Line points={[[-126, 90], [126, 90]]} stroke={C.rule} lineWidth={3} />
        <Line points={[[-126, 120], [126, 120]]} stroke={C.rule} lineWidth={3} />
      </Node>
      <Txt
        ref={years}
        x={-126}
        y={34}
        offset={[-1, 0]}
        text={RECORDS[r].year}
        fontFamily={MONO}
        fontWeight={700}
        fontSize={46}
        fill={C.labelInk}
      />
    </Rect>
  );

  const playhead = (ref: typeof playhead1, x: () => number) => (
    <Node ref={ref} x={x} opacity={0}>
      <Line points={[[0, -LANE_H / 2 + 10], [0, LANE_H / 2 - 10]]} stroke={C.lcd} lineWidth={5} />
      <Circle y={-LANE_H / 2 + 10} size={18} fill={C.lcd} />
    </Node>
  );

  /** A rounded tag: timestamps in LCD green, tempo and pitch in the record's colour. */
  const tag = (
    text: string,
    color: string,
    props: {ref?: ReferenceReceiver<Rect>; txtRef?: ReferenceReceiver<Txt>; well?: boolean},
  ) => (
    <Rect
      ref={props.ref}
      layout
      padding={[6, 20]}
      radius={props.well ? 10 : 40}
      fill={props.well ? C.lcdWell : C.deck700}
      stroke={color}
      lineWidth={3}
      opacity={0}
    >
      <Txt
        ref={props.txtRef}
        text={text}
        fontFamily={MONO}
        fontWeight={700}
        fontSize={46}
        fill={color}
      />
    </Rect>
  );

  /** Beat grid for a new song's lane: bar lines brighter than beat lines. */
  const grid = () =>
    range(17).map(k => (
      <Line
        points={[[-INNER / 2 + BEAT * k, -LANE_H / 2 + 14], [-INNER / 2 + BEAT * k, LANE_H / 2 - 14]]}
        stroke={k % 4 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'}
        lineWidth={k % 4 === 0 ? 3 : 2}
      />
    ));

  /** The sampled bars on their own, framed. `lit` brightens it as a playhead passes. */
  const sliceBody = (lit: () => number) => [
    // Opaque backing: the dimmed bars left in the lane mustn't show through.
    <Rect size={[SLICE_W, SLICE_H]} radius={12} fill={C.deck800} />,
    <Rect
      size={[SLICE_W, SLICE_H]}
      radius={12}
      fill={() => sport(0.12 + 0.34 * lit())}
      stroke={C.sport}
      lineWidth={4}
    />,
    ...range(CUT.to - CUT.from).map(k => (
      <Rect
        x={barX(CUT.from + k) - CUT_MID}
        size={[BAR_W, HEIGHTS[CUT.from + k]]}
        radius={BAR_W / 2}
        fill={C.sport}
      />
    )),
  ];

  const inSlot = (head: number, left: number, width: number) =>
    head >= left && head < left + width ? 1 : 0;

  /** Bars 2–3 of the new song: two loops and the drums under them. */
  const chunkBody = (lit: () => number) => [
    ...[1, 2].map(j => (
      <Node x={slotX(j)} y={SLOT_Y} scale={SLOT_SCALE}>
        {sliceBody(lit)}
      </Node>
    )),
    ...range(8).map(k => (
      <Rect
        x={-INNER / 2 + BEAT * (k + 4.5)}
        y={DRUM_Y}
        size={[34, k % 2 === 0 ? 18 : 11]}
        radius={4}
        fill={C.tps}
      />
    )),
  ];

  /* ── the stage ────────────────────────────────────────────────────── */

  view.add(
    <Node ref={world} y={60}>
      {/* Rows: vinyl, lane and tags. Cards are added later so they sit on top. */}
      {range(3).map(r => (
        <Node ref={rowBodies} y={ROW_Y[r]} opacity={r === 0 ? 1 : 0}>
          {vinyl(r)}
          <Rect
            x={LANE_X}
            size={[LANE_W, LANE_H]}
            radius={22}
            fill={C.deck800}
            stroke={'rgba(255,255,255,0.10)'}
            lineWidth={3}
          >
            {r === 0 ? (
              <>
                {range(BARS).map(i => (
                  <Rect
                    x={barX(i)}
                    size={[BAR_W, HEIGHTS[i]]}
                    radius={BAR_W / 2}
                    // Played bars light up behind the playhead; the cut
                    // turns yellow as the highlight sweeps over it.
                    fill={() =>
                      inCut(i) && barX(i) < CUT_LEFT + cutSweep() * (CUT_RIGHT - CUT_LEFT)
                        ? C.sport
                        : barX(i) < head1()
                          ? C.ink
                          : C.chrome500
                    }
                    opacity={() => (inCut(i) ? 1 - 0.6 * cutDim() : 1)}
                  />
                ))}
                <Rect
                  ref={highlight1}
                  x={CUT_LEFT - 8}
                  offset={[-1, 0]}
                  size={[0, SLICE_H]}
                  radius={12}
                  fill={sport(0.14)}
                  stroke={C.sport}
                  lineWidth={4}
                  opacity={0}
                />
                {[CUT_LEFT - 8, CUT_RIGHT + 8].map(x => (
                  <Line
                    ref={cutMarks}
                    points={[[x, -LANE_H / 2 - 22], [x, LANE_H / 2 + 22]]}
                    stroke={C.sport}
                    lineWidth={5}
                    lineDash={[12, 10]}
                    end={0}
                  />
                ))}
                {playhead(playhead1, () => head1())}
                <Node x={CUT_MID} y={TAG_Y}>
                  {tag('2:14–2:18', C.lcd, {ref: stamp1, well: true})}
                </Node>
                <Node x={INNER / 2 - 90} y={TAG_Y}>
                  {tag('88 BPM', C.sony, {ref: bpm1})}
                </Node>
              </>
            ) : (
              <>
                {grid()}
                {r === 1 &&
                  range(16).map(k => (
                    <Rect
                      ref={drums}
                      x={-INNER / 2 + BEAT * (k + 0.5)}
                      y={DRUM_Y}
                      size={[34, k % 2 === 0 ? 18 : 11]}
                      radius={4}
                      fill={C.tps}
                      opacity={0}
                    />
                  ))}
                {r === 1 ? playhead(playhead2, () => head2()) : playhead(playhead3, () => head3())}
                {r === 1 && (
                  <Node x={0} y={TAG_Y}>
                    {tag('1:02–1:07', C.lcd, {ref: stamp2, well: true})}
                  </Node>
                )}
                <Layout layout gap={16} alignItems={'center'} offset={[1, 0]} x={INNER / 2 + 20} y={TAG_Y}>
                  {r === 1
                    ? [
                        tag('±0 ST', C.tps, {ref: tags2, txtRef: pitch2}),
                        tag('88 BPM', C.tps, {ref: tags2, txtRef: bpm2}),
                      ]
                    : [tag('−3 ST', C.lcd, {ref: tags3}), tag('75 BPM', C.lcd, {ref: tags3})]}
                </Layout>
              </>
            )}
          </Rect>
        </Node>
      ))}

      {/* The graph the records fold into at the end, drawn under the nodes. */}
      {[0, 1].map(i => (
        <Line
          ref={edges}
          points={[NODES[i], NODES[i + 1]]}
          stroke={sport(0.8)}
          lineWidth={7}
          lineCap={'round'}
          end={0}
          // A round cap draws a dot even at zero length.
          opacity={0}
        />
      ))}
      {BRANCHES.map(([from, x, y]) => (
        <Line
          ref={branchEdges}
          points={[NODES[from], [x, y]]}
          stroke={'rgba(255,255,255,0.16)'}
          lineWidth={4}
          lineDash={[14, 12]}
          end={0}
        />
      ))}
      {BRANCHES.map(([, x, y]) => (
        <Node ref={branchNodes} x={x} y={y} opacity={0}>
          <Circle size={72} fill={C.deck700} stroke={'rgba(255,255,255,0.22)'} lineWidth={3} />
          <Txt text={'?'} fontFamily={MONO} fontWeight={700} fontSize={40} fill={C.ink400} />
        </Node>
      ))}
      <Circle
        ref={pulse}
        size={30}
        fill={C.sport}
        shadowColor={C.sport}
        shadowBlur={28}
        position={NODES[0]}
        opacity={0}
      />

      {/* Where the sample travels. Starts under the slice, ends in bar 1. */}
      <CubicBezier
        ref={curve1}
        p0={[LANE_X + CUT_MID, ROW_Y[0]]}
        p1={[LANE_X + CUT_MID, ROW_Y[0] + 230]}
        p2={[LANE_X + slotX(0), ROW_Y[1] - 230]}
        p3={[LANE_X + slotX(0), ROW_Y[1] + SLOT_Y]}
        stroke={C.sony}
        lineWidth={6}
        lineDash={[18, 14]}
        end={0}
      />
      <CubicBezier
        ref={curve2}
        p0={[LANE_X, ROW_Y[1]]}
        p1={[LANE_X, ROW_Y[1] + 230]}
        p2={[LANE_X - SLOT, ROW_Y[2] - 230]}
        p3={[LANE_X - SLOT, ROW_Y[2]]}
        stroke={C.tps}
        lineWidth={6}
        lineDash={[18, 14]}
        end={0}
      />

      {/* The sample itself: sits exactly over the highlight until it's lifted. */}
      <Node ref={slice} x={LANE_X + CUT_MID} y={ROW_Y[0]} opacity={0}>
        {sliceBody(() => inSlot(head2(), -INNER / 2, SLOT))}
      </Node>
      {[1, 2, 3].map(j => (
        <Node
          ref={loops}
          x={LANE_X + slotX(j)}
          y={ROW_Y[1] + SLOT_Y}
          scale={SLOT_SCALE}
          opacity={() => (j === 1 || j === 2 ? 1 - 0.6 * chunkDim() : 1)}
        >
          <Node ref={loopBodies} opacity={0}>
            {sliceBody(() => inSlot(head2(), -INNER / 2 + SLOT * j, SLOT))}
          </Node>
        </Node>
      ))}
      <Node ref={chunk} x={LANE_X} y={ROW_Y[1]} opacity={0}>
        <Rect
          ref={chunkFrame}
          x={-CHUNK_W / 2}
          offset={[-1, 0]}
          size={[0, LANE_H - 10]}
          radius={14}
          fill={CHUNK_FILL}
          stroke={C.sport}
          lineWidth={5}
        />
        {chunkBody(() => inSlot(head3(), -INNER / 2, 2 * SLOT))}
      </Node>
      <Node ref={chunkCopy} x={LANE_X + SLOT} y={ROW_Y[2]} scale={CHUNK_SCALE} opacity={0}>
        <Rect size={[CHUNK_W, LANE_H - 10]} radius={14} fill={CHUNK_FILL} stroke={C.sport} lineWidth={5} />
        {chunkBody(() => inSlot(head3(), 0, 2 * SLOT))}
      </Node>

      {range(3).map(r => card(r))}
    </Node>,
  );

  // Header: rows panning up slide under this rather than over the words.
  view.add(
    <Rect
      y={-420}
      size={[1920, 240]}
      fill={
        new Gradient({
          from: [0, -120],
          to: [0, 120],
          stops: [
            {offset: 0, color: C.deck900},
            {offset: 0.72, color: C.deck900},
            {offset: 1, color: 'rgba(11,13,16,0)'},
          ],
        })
      }
    />,
  );
  view.add(
    <>
      <Txt
        ref={kicker}
        x={-860}
        y={KICK_Y}
        offset={[-1, 0]}
        text={'PULSAR · EXPLAINER'}
        fontFamily={MONO}
        fontWeight={700}
        fontSize={48}
        letterSpacing={4}
        fill={C.tps}
      />
      <Txt
        ref={headline}
        x={-860}
        y={HEAD_Y + 14}
        offset={[-1, 0]}
        text={'How sampling works'}
        fontFamily={SANS}
        fontWeight={800}
        fontSize={104}
        letterSpacing={-2}
        fill={C.ink}
      />
      <Txt
        ref={tagline}
        x={-860}
        y={HEAD_Y + 104}
        offset={[-1, 0]}
        text={'Dig the chain.'}
        fontFamily={SANS}
        fontWeight={800}
        fontSize={76}
        letterSpacing={-1}
        fill={C.sony}
        opacity={0}
      />
      {range(4).map(i => (
        <Rect ref={pills} x={688 + i * 58} y={KICK_Y} size={[44, 12]} radius={6} fill={C.deck600} />
      ))}
    </>,
  );

  /* ── helpers ──────────────────────────────────────────────────────── */

  function* caption(k: string, h: string, step: number, accent: string): ThreadGenerator {
    yield* all(kicker().opacity(0, 0.25), headline().opacity(0, 0.25));
    kicker().text(k).fill(accent);
    headline().text(h).fontSize(76).letterSpacing(-1).y(HEAD_Y + 18);
    yield* all(
      kicker().opacity(1, 0.4),
      headline().opacity(1, 0.45),
      headline().y(HEAD_Y, 0.45, easeOutCubic),
      ...(step >= 0 ? [pills[step].fill(accent, 0.4)] : []),
    );
  }

  /** Pop in from slightly small to `scale` (a loop's scale is its time-stretch). */
  function* appear(node: Node, scale: PossibleVector2 = 1): ThreadGenerator {
    node.scale(node.scale().mul(0.85));
    yield* all(node.opacity(1, 0.28), node.scale(scale, 0.38, easeOutBack));
  }

  function* ride(
    node: Node,
    curve: CubicBezier,
    progress: typeof ride1,
    scale: PossibleVector2,
    seconds: number,
  ): ThreadGenerator {
    node.position(() => curve.getPointAtPercentage(progress()).position);
    yield* all(progress(1, seconds, easeInOutCubic), node.scale(scale, seconds, easeInOutCubic));
    // Detach from the curve so later beats can fade the curve without the
    // slice depending on it.
    node.position(node.position());
  }

  function* ping(node: Node): ThreadGenerator {
    yield* node.scale(1.1, 0.12).to(1, 0.3, easeOutCubic);
  }

  /* ── the animation ────────────────────────────────────────────────── */

  // The records turn for the whole piece, in the background.
  yield all(...range(3).map(r => vinyls[r].rotation(3600, 30, linear)));

  // 0 — title card (the poster frame).
  yield* waitFor(1.4);

  // 01 — the original, played up to the moment that matters.
  yield* caption('01 · THE ORIGINAL', 'A 1973 record. One moment in it.', 0, C.sony);
  yield* all(playhead1().opacity(1, 0.3), head1(CUT_LEFT, 2.6, linear));
  yield* waitFor(0.3);

  // 02 — the cut: highlight it, stamp the time, lift a copy out.
  yield* caption('02 · THE CUT', 'Four seconds get lifted — the sample.', 1, C.sport);
  highlight1().opacity(1);
  yield* all(
    highlight1().width(SLICE_W, 0.8, easeInOutCubic),
    cutSweep(1, 0.8, easeInOutCubic),
    head1(CUT_RIGHT, 0.8, linear),
  );
  yield* all(appear(stamp1()), delay(0.15, appear(bpm1())));
  yield* all(...cutMarks.map(m => m.end(1, 0.35, easeOutCubic)));
  slice().opacity(1);
  yield* all(
    slice().y(ROW_Y[0] - 16, 0.5, easeOutBack),
    slice().scale(1.06, 0.5, easeOutBack),
    cutDim(1, 0.5),
    highlight1().opacity(0, 0.4),
    playhead1().opacity(0, 0.4),
    ...cutMarks.map(m => m.opacity(0, 0.5)),
  );
  yield* waitFor(0.4);

  // 03 — the flip: carried into a new song, stretched to the bar, looped.
  yield* all(
    caption('03 · THE FLIP', 'Looped and pitched into a new song.', 2, C.tps),
    world().y(-100, 1.1, easeInOutCubic),
    rowBodies[1].opacity(1, 0.8),
    cards[1].opacity(1, 0.8),
  );
  yield* curve1().end(1, 0.7, easeInOutCubic);
  yield* ride(slice(), curve1(), ride1, SLOT_SCALE, 1.3);
  yield* all(
    curve1().opacity(0.3, 0.4),
    sequence(0.18, ...loopBodies.map(l => appear(l))),
  );
  yield* all(appear(tags2[0]), appear(tags2[1]));
  yield* all(bpm2().text('93 BPM', 0.5), pitch2().text('+2 ST', 0.5));
  yield* sequence(0.035, ...drums.map(d => d.opacity(1, 0.15)));
  yield* all(playhead2().opacity(1, 0.2), head2(INNER / 2, 1.8, linear));
  yield* playhead2().opacity(0, 0.2);

  // 04 — the chain: the new song gets cut exactly the same way.
  yield* all(
    caption('04 · THE CHAIN', 'Then the new song gets sampled too.', 3, C.lcd),
    world().y(-480, 1.1, easeInOutCubic),
    rowBodies[0].opacity(0, 0.6),
    cards[0].opacity(0, 0.6),
    curve1().opacity(0, 0.6),
    rowBodies[2].opacity(1, 0.8),
    cards[2].opacity(1, 0.8),
  );
  chunk().opacity(1);
  yield* all(chunkFrame().width(CHUNK_W, 0.6, easeInOutCubic), appear(stamp2()));
  yield* all(
    chunk().y(ROW_Y[1] - 16, 0.4, easeOutBack),
    chunk().scale(1.04, 0.4, easeOutBack),
    chunkDim(1, 0.4),
    ...drums.slice(4, 12).map(d => d.opacity(0.4, 0.4)),
  );
  yield* curve2().end(1, 0.6, easeInOutCubic);
  yield* ride(chunk(), curve2(), ride2, CHUNK_SCALE, 1.2);
  yield* all(
    curve2().opacity(0.3, 0.4),
    appear(chunkCopy(), CHUNK_SCALE),
    delay(0.1, all(appear(tags3[0]), appear(tags3[1]))),
  );
  yield* all(playhead3().opacity(1, 0.2), head3(INNER / 2, 1.4, linear));

  // Close — fold the three records into the sample graph.
  yield* all(
    caption('PULSAR · SAMPLE GRAPH', 'Every record is a branch.', -1, C.tps),
    world().y(0, 1.6, easeInOutCubic),
    ...rowBodies.map(b => b.opacity(0, 0.6)),
    ...[slice(), chunk(), chunkCopy(), curve2(), ...loops].map(n => n.opacity(0, 0.6)),
    ...pills.map(p => p.opacity(0, 0.6)),
    ...cardDetails.map(d => d.opacity(0, 0.5)),
    ...range(3).map(r =>
      all(
        cards[r].opacity(1, 0.8),
        cards[r].position(NODES[r], 1.6, easeInOutCubic),
        cards[r].size(150, 1.6, easeInOutCubic),
        cards[r].radius(75, 1.6, easeInOutCubic),
        cards[r].fill(RECORDS[r].color, 1.6),
        years[r].position([0, 0], 1.6, easeInOutCubic),
        years[r].offset([0, 0], 1.6, easeInOutCubic),
      ),
    ),
  );
  yield* all(
    sequence(0.25, ...edges.map(e => all(e.opacity(1, 0.1), e.end(1, 0.6, easeInOutCubic)))),
    delay(0.5, sequence(0.12, ...branchEdges.map(e => e.end(1, 0.5, easeOutCubic)))),
    delay(0.8, sequence(0.12, ...branchNodes.map(n => appear(n)))),
    delay(0.4, all(tagline().opacity(1, 0.5), tagline().y(HEAD_Y + 84, 0.5, easeOutCubic))),
  );

  // The sample travels the chain once more, waking each record it reaches.
  yield* chain(
    pulse().opacity(1, 0.2),
    pulse().position(NODES[1], 0.8, easeInOutCubic),
    ping(cards[1]),
    pulse().position(NODES[2], 0.8, easeInOutCubic),
    all(ping(cards[2]), pulse().opacity(0, 0.3)),
  );
  yield* waitFor(1.4);
});
