/**
 * The Walkman palette, restated as literals.
 *
 * This bundle never sees app/globals.css or Tailwind, so the colours are
 * copied from there (and match remotion/tokens.ts). Keep them in step.
 */
export const C = {
  deck900: '#0b0d10',
  deck800: '#12161a',
  deck700: '#1a2027',
  deck600: '#252d36',
  chrome300: '#bac2c9',
  chrome500: '#8b949d',
  chrome700: '#59626b',
  ink: '#edf1f4',
  ink400: '#98a2ab',
  ink600: '#626b74',
  sony: '#f2662c',
  tps: '#4e86c7',
  sport: '#ffce0a',
  vu: '#e23b2e',
  lcd: '#7ed9ae',
  lcdWell: '#0c1712',
  cream: '#efe4cc',
  labelInk: '#12161a',
  rule: 'rgba(78, 134, 199, 0.28)',
  /** The sample graph's edge colour (components/SampleGraph.tsx). */
  edge: 'rgba(242, 102, 44, 0.35)',
} as const;
