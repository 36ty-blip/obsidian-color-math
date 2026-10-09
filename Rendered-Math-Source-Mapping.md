---
tags: [color-math, mathjax, source-mapping, plugin-design]
created: 2026-10-06
status: design-notes
---

# Connecting rendered mathematics to its source

## Goal

Point at part of a rendered equation and highlight the original LaTeX that produced it. Also support the reverse direction: move the editor cursor and highlight the corresponding rendered part.

Example source: `\frac{x^2+1}{y}`.

- Hover `x`: highlight `x`.
- Hover the exponent: highlight `2`.
- Select the entire power: highlight `x^2`.
- Hover the fraction bar: highlight `\frac{x^2+1}{y}`, or the `\frac` command according to the chosen interaction policy.

**Recommended starting stack: TypeScript + MathJax + CSS.** JavaScript handles interaction; TypeScript defines the mapping structures; CSS handles visual feedback. WebAssembly is optional and should follow measurement.

These are proposed architectures, not implementations verified inside the existing Color Math repository. Obsidian compatibility depends on its bundled MathJax version and the integration points available to a plugin.

## What must be mapped?

There are three separate things:

1. **Original source:** characters and their positions in the note.
2. **Parsed structure:** fractions, powers, identifiers, and other expression nodes.
3. **Rendered structure:** HTML or SVG elements that the pointer can reach.

MathJax converts input into an internal MathML tree and then into CHTML or SVG. That internal tree is not automatically a lossless representation of the original TeX. [1]

A structure describing mathematical meaning is also different from a syntax tree describing exactly what was typed. Prefer a source-preserving syntax tree for navigation. Add semantic information separately if useful.

## Comparison

Effort and reliability are engineering estimates for this feature, not benchmarks.

| Approach | How it works | Effort | Mapping quality | Fit for Obsidian |
| --- | --- | --- | --- | --- |
| 1. Inspect existing output | Match rendered elements against source tokens | Low initially | Approximate | Easy experiment; limited precision |
| 2. Annotate temporary TeX | Insert IDs around safely parsed expressions before rendering | Medium | Good within supported syntax | Strong prototype if rendering can be controlled |
| 3. Instrument MathJax | Preserve source provenance during its actual parsing and output | High | Potentially strongest for MathJax-supported TeX | Depends on access to internals/version |
| 4. Own parser + renderer adapter | Parse with source ranges; connect nodes to MathJax output | High | Strong within declared syntax support | Good reusable engine; integration work |
| 5. Align two trees | Match a source-aware tree to MathJax's parsed tree | High | Variable; ambiguity remains | Useful when output hooks exist but parser hooks do not |
| 6. SVG or geometry hit testing | Map graphical groups or regions to source-aware nodes | Medium to high | Determined by the underlying mapping | Good for a controlled custom preview |
| 7. Own complete renderer | Control parsing, layout, and hit regions | Very high | Fully controllable within supported syntax | Usually excessive for this feature |

Approaches can be combined. In particular, SVG is an output choice, and WebAssembly is an execution choice; neither supplies source mapping by itself.

## 1. Inspect existing rendered output

Read the generated DOM, identify visible identifiers/operators, and try matching them to tokens in the original equation.

**Advantages:** no need to replace the renderer; small initial experiment; can demonstrate hover interactions quickly.

**Limitations:** `x+x+x` contains three identical symbols; `\alpha` renders differently from its source text; macros generate output indirectly; fraction bars are not text tokens. Some visible glyphs may use CSS or SVG paths rather than ordinary text nodes. DOM order does not establish source order reliably.

Do not present this as exact mapping. Give an ambiguous match a larger expression range or no result.

**Choose this for:** an exploratory prototype, equation-level navigation, or a narrowly restricted syntax subset.

## 2. Annotate a temporary copy of the TeX

Parse the original source enough to identify safe expression boundaries. Create a render-only copy with generated IDs:

```latex
\frac{\cssId{cm-e7-power}{x^2}+1}{\cssId{cm-e7-y}{y}}
```

Maintain a separate table connecting those IDs to ranges in the **original** source. Do not save the inserted markup into the note.

MathJax's `html` extension documents `\cssId` and `\class`. Current documentation also describes `\data`, but availability differs between versions; older documentation does not list it. [2][3]

**Advantages:** uses a documented mechanism; works naturally with JS/TS and CSS; easier than patching the parser for a small supported subset.

**Limitations:** arbitrary wrapping can change grouping, spacing, macro argument consumption, or script attachment. Wrapping a base before `^` is especially worth checking. Comments, escaped braces, environments, and custom macros require real parsing rather than regex insertion. Extensions may be unavailable in the host renderer. Generated IDs can attach to an existing element rather than a new wrapper, so nested annotations must be inspected for overwritten/lost IDs.

**Choose this for:** the first controlled prototype, using a conservative whitelist of safe wrappers and falling back to the whole expression elsewhere.

Validate that annotated and unannotated versions have equivalent layout. Never assume every token can safely receive a wrapper.

## 3. Instrument MathJax's parser and output

Capture where source constructs begin and end while MathJax parses them. Carry this provenance through node construction and copy node IDs into rendered output.

This is more than recording the parser's current character index. TeX expansion can replace the input stream with generated text; argument parsing can be nested; layout nodes may be synthesized or merged. Track which original input produced each generated construct.

**Advantages:** mapping follows the parser actually responsible for rendering; potentially best support for MathJax macros and extensions.

**Limitations:** a generic post-parse callback cannot restore provenance already discarded. Exact mapping may require a custom input extension, modifications to parser methods, output customization, or a maintained fork. Public extension support does not imply that every necessary provenance hook is public and stable.

Recent MathJax development includes `data-latex` metadata on internal nodes. Treat source snippets as a possible aid, not proof of original character offsets. Repeated snippets and macro expansion still require explicit provenance. Check the exact deployed version and implementation before relying on it. [4][5]

**Choose this for:** broad TeX support when you control the MathJax instance and can maintain a version-specific integration.

## 4. Build a source-aware parser and use a renderer adapter

Build or adopt a parser that preserves tokens, comments, commands, braces, and source ranges. Give every supported expression a stable ID within an equation revision.

Then use one explicit bridge to the renderer:

- Generate annotated TeX, as in approach 2.
- Generate MathML with mapping metadata and verify that your output adapter preserves it.
- Customize output wrappers to attach IDs to corresponding rendered nodes.

**Important:** building a syntax tree alone does not connect it to MathJax's DOM. The bridge is a separate engineering task.

**Advantages:** reusable in multiple applications; controlled offset conventions; suitable foundation for coloring, inspection, and navigation.

**Limitations:** a partial TeX parser can disagree with MathJax. Supporting arbitrary user macros and extensions is much harder than recognizing fractions and powers. Converting to MathML requires preserving layout choices and supported TeX behavior. Unknown syntax needs a conservative fallback.

**Choose this for:** a reusable Color Math engine. Keep a common mapping model, with separate LaTeX, Typst, and Unicode input adapters. Their grammars and renderers cannot be treated as interchangeable.

A lightweight structural parser is a reasonable first milestone; a full symbolic algebra system is unnecessary for this feature.

## 5. Align a source tree with MathJax's tree

Parse the source independently, obtain MathJax's internal tree, and match corresponding fractions, scripts, identifiers, and rows. Attach source ranges after matching.

**Advantages:** can avoid modifying MathJax's parser; may reuse a parser already present in Color Math.

**Limitations:** normalization, macro expansion, inferred rows, and merged numbers can make the two trees different. Repeated equivalent expressions create ambiguity. A mathematical meaning match does not establish which exact spelling or occurrence produced it.

**Choose this for:** a supported subset where alignment can be validated. Store confidence and fall back to the nearest reliably mapped parent. Never silently invent exact offsets.

## 6. SVG groups or geometric hit regions

With SVG output, attach mapping IDs to groups representing mapped expression nodes. Pointer events can identify the group. For thin bars and radicals, use transparent hit regions or overlay rectangles.

With CHTML, an overlay can similarly use `getBoundingClientRect()` or `getClientRects()` to draw highlight boxes around already mapped elements.

**Advantages:** helpful for graphical pieces without ordinary text nodes; good control over hit areas.

**Limitations:** geometry tells you where an object is, not where it came from. You still need approaches 2–5. Zoom, scrolling, fonts, resizing, and re-rendering invalidate cached regions. Rectangles overlap, so the smallest rectangle alone is not a reliable selection rule.

**Choose this for:** improving pointer accuracy after source mapping works, especially in a controlled preview. Switching output format inside Obsidian is a separate integration decision.

## 7. Build your own renderer

Own tokenization, macro handling, structure, font metrics, layout, and DOM/SVG generation. Attach IDs during rendering.

**Advantages:** full control over mapping and interaction.

**Limitations:** mathematical typography, stretchy delimiters, arrays, font coverage, and accessibility are substantial projects. Replacing MathJax solely for hover navigation is unlikely to justify the maintenance cost.

**Choose this for:** a specialized editor with deliberately limited notation, or a project whose main goal is a new math renderer.

## CSS, JavaScript, TypeScript, and optional additions

| Technology | Role | Recommendation |
| --- | --- | --- |
| CSS | Hover styles and overlays | Use; cannot recover source offsets by itself |
| JavaScript | Pointer handling, DOM access, editor coordination | Required for the web interaction layer |
| TypeScript | Typed mappings, parser interfaces, integration | Preferred implementation language |
| Web Worker | Parse off the UI thread | Add when parsing causes visible UI stalls |
| WebAssembly | Run a Rust/C/C++ parser core | Add if measured benefit or reuse justifies it |
| Rust | Optional native/WASM engine | Useful for a reusable core; unnecessary for the first prototype |
| SVG | Alternative output and hit regions | Optional; still requires provenance |
| CodeMirror integration | Source decorations and cursor navigation | Needed for source highlighting in Obsidian Live Preview |

A worker cannot directly operate on the page DOM. Send source and revision IDs to it, and receive serializable mapping records. Perform DOM and editor changes on the main thread.

WebAssembly does not directly style elements or automatically track TeX source. JS/TS still connects its results to the UI. Startup, bundle size, copying strings, and cross-boundary calls can outweigh savings on short equations. If using WASM, return one batch of mappings per equation rather than one call per symbol.

## Mapping contract

Use zero-based, half-open ranges: `[from, to)`. For `\frac{x^2+1}{y}`, the length is **15** JavaScript UTF-16 code units:

| Part | Range | Source slice |
| --- | --- | --- |
| Whole fraction | `[0, 15)` | `\frac{x^2+1}{y}` |
| Command | `[0, 5)` | `\frac` |
| Numerator content | `[6, 11)` | `x^2+1` |
| Power | `[6, 9)` | `x^2` |
| Base | `[6, 7)` | `x` |
| Exponent | `[8, 9)` | `2` |
| Denominator content | `[13, 14)` | `y` |

These ranges are relative to the equation content, excluding Markdown math delimiters. To highlight the note, add the equation's current document offset.

```typescript
type SourceSpan = { from: number; to: number };

type MappedPart = {
  id: string;
  equationId: string;
  revision: number;
  kind: string;
  spans: SourceSpan[];
  parentId?: string;
  confidence: "exact" | "parent" | "approximate";
  generated: boolean;
};
```

Use multiple spans when provenance is discontinuous. Use UTF-16 consistently with JavaScript/editor positions; a Rust parser may return UTF-8 byte offsets, which need explicit conversion. A visible Unicode symbol can occupy multiple code units.

For a macro such as `\newcommand{\sq}[1]{#1^2}`, rendered `\sq{x}` involves a call site, an argument, and a definition. Default navigation can go to the call site; a separate action can show the definition. Generated exponent `2` should not claim to be a literal character inside the call.

## Interaction sketch

This is illustrative TypeScript, not a complete Obsidian plugin. It assumes the rendering adapter has already put `data-cm-id` on mapped elements.

```typescript
function installHover(
  root: HTMLElement,
  mappings: Map<string, MappedPart>,
  activeRevision: () => number,
  show: (part: MappedPart) => void,
  clear: () => void,
): () => void {
  const move = (event: PointerEvent) => {
    if (!(event.target instanceof Element)) return clear();
    const node = event.target.closest("[data-cm-id]");
    if (!node || !root.contains(node)) return clear();
    const id = node.getAttribute("data-cm-id");
    const part = id ? mappings.get(id) : undefined;
    if (!part || part.revision !== activeRevision()) return clear();
    show(part);
  };
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerleave", clear);
  return () => {
    root.removeEventListener("pointermove", move);
    root.removeEventListener("pointerleave", clear);
  };
}
```

Use delegated events rather than a listener per symbol. Deduplicate repeated hover results and schedule expensive overlay work with `requestAnimationFrame`. On touch devices, offer tap or long-press. Provide keyboard navigation too.

For source highlights, use editor decorations rather than repeatedly changing the selection. For rendered highlights, prefer color/background or an overlay; avoid font-size changes that invalidate math layout. [2]

## Obsidian integration considerations

1. Inspect the actual bundled MathJax version, enabled extensions, and output.
2. Verify whether the plugin can intercept original math source before rendering. Post-processing rendered DOM alone cannot restore lost offsets.
3. Treat Reading View, Live Preview widgets, and source editing as separate integration surfaces.
4. Use documented rendering APIs where sufficient; do not assume that they expose parser/output customization.
5. Associate mappings with the note, equation instance, source revision, and renderer configuration. Identical equations can appear multiple times.
6. Invalidate mappings on edits; reconcile asynchronous results before attaching them.
7. Remove event handlers and observers when widgets disappear or the plugin unloads.
8. If bundled renderer hooks are insufficient, consider a plugin-owned preview with its own renderer. Account for the additional bundle, fonts, styling, and lifecycle cost.

## Recommended implementation path

1. Make a controlled preview for one equation using TypeScript and MathJax.
2. Map whole expressions, powers, fractions, and individual identifiers using safe temporary annotations.
3. Preserve the original source and add bidirectional highlighting.
4. Declare supported syntax; fall back to mapped parent expressions for unsupported constructs.
5. Test repeated symbols, macros, radicals, fraction bars, matrices, comments, escaped braces, Unicode offsets, and edits during rendering.
6. Decide between parser instrumentation and a reusable source-aware parser based on whether broad MathJax compatibility or multi-renderer reuse matters more.
7. Measure parsing, typesetting, mapping, and pointer work separately. Add workers or WASM only for the measured bottleneck.

**Best first step:** approach 2 with a conservative structural parser. **Best reusable direction:** approach 4 with renderer adapters. **Best direction for faithful MathJax macro provenance:** approach 3, with explicit version maintenance.

## Sources and evidence boundaries

Reviewed 2026-10-05 UTC. Architectural recommendations and effort estimates above are design judgments. No exact Obsidian MathJax version or working plugin integration was established in this review.

1. [MathJax processing model](https://docs.mathjax.org/en/latest/advanced/model.html): internal MathML tree, MathItem, CHTML/SVG pipeline.
2. [MathJax current html extension](https://docs.mathjax.org/en/latest/input/tex/extensions/html.html): IDs, classes, data attributes, loading, and layout-sensitive styling.
3. [MathJax 3.0 html extension](https://docs.mathjax.org/en/v3.0/input/tex/extensions/html.html): older documented command set.
4. [MathJax source releases](https://github.com/mathjax/MathJax-src/releases): release notes mentioning `data-latex` metadata.
5. [MathJax issue 3459](https://github.com/mathjax/mathjax/issues/3459): version-specific `data-latex` behavior for numeric subscripts; illustrates why metadata requires validation.
6. [Obsidian renderMath API](https://docs.obsidian.md/Reference/TypeScript+API/renderMath): public rendering entry point to investigate during integration.
