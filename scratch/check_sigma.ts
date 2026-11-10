import { computeSemanticMathSpans } from '../src/converters/generic';
import { selectColorSpans, flattenColorSpans } from '../src/utils/spans';
import { DEFAULT_OPTIONS, ColorPalette } from '../src/config';

const AUDIT_COLORS: ColorPalette = {
  main: '#7aa2f7',
  orange: '#e0af68',
  parameter: '#ff9e64',
  derivative: '#bb9af7',
  chain: '#9ece6a',
  upper: '#9d7cd8',
  transform: '#e0af68',
  energyOperator: '#2ac3de',
  relation: '#89ddff',
  arithmetic: '#c0caf5',
  dot: '#ff757f',
  arrow: '#f7768e',
  set: '#7dcfff',
  structural: '#ced5e3',
  unit: '#73daca',
  spacing: '#565f89',
};

const MAX_STRESS_OPTIONS = {
  ...DEFAULT_OPTIONS,
  enableTaxonomy: true,
  taxonomyFunctions: true,
  taxonomyParameters: true,
  taxonomyConstants: true,
  taxonomyIndices: true,
  rainbowDelimiters: true,
  rainbowBareBraces: true,
  highlightUnmatchedBraces: true,
  strictBracketWarnings: true,
  variableDataFlow: true,
  colorDifferentials: true,
  colorInfinitesimals: true,
  extendedFunctions: true,
  previewLatexNormalization: true,
  autoScaleDelimiters: true,
  useCST: true,
};

const eq = '|gH\\rangle\\langle gH|';
const raw = computeSemanticMathSpans(eq, AUDIT_COLORS, MAX_STRESS_OPTIONS);
console.log('raw spans for |gH\\rangle\\langle gH|:');
raw.forEach(s => console.log(' ', s.start, s.end, `"${eq.slice(s.start, s.end)}"`, s.color, s.priority));
const sel = selectColorSpans(eq, raw);
const flat = flattenColorSpans(sel);
console.log('flat spans:');
flat.forEach(s => console.log(' ', s.start, s.end, `"${eq.slice(s.start, s.end)}"`, s.color, s.priority));
