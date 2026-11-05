// tests/multiline_alignment_neighbor.test.ts
import { describe, it, expect } from "vitest";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { MathCSTParser } from "../src/parsers/cst/parser";

interface FakeChtmlElement {
  tagName: string;
  className: string;
  textContent: string;
  classList: {
    add: (...cls: string[]) => void;
    contains: (cls: string) => boolean;
  };
  children: FakeChtmlElement[];
  parentElement: FakeChtmlElement | null;
  firstElementChild: FakeChtmlElement | null;
  lastElementChild: FakeChtmlElement | null;
  querySelector: (sel: string) => FakeChtmlElement | null;
  querySelectorAll: (sel: string) => FakeChtmlElement[];
  matches: (sel: string) => boolean;
  closest: (sel: string) => FakeChtmlElement | null;
  contains: (other: FakeChtmlElement | null) => boolean;
}

function el(tagName: string, children: FakeChtmlElement[] = [], className = "", textContent = ""): FakeChtmlElement {
  const classes = new Set<string>(className.split(/\s+/).filter(Boolean));
  const matchSingleSelector = (node: FakeChtmlElement, rawSel: string): boolean => {
    const trimmed = rawSel.trim();
    const notMatch = trimmed.match(/^([a-zA-Z0-9_-]+):not\(\.([a-zA-Z0-9_-]+)\)$/);
    if (notMatch) {
      return node.tagName === notMatch[1].toUpperCase() && !node.classList.contains(notMatch[2]);
    }
    return node.tagName === trimmed.toUpperCase();
  };

  const node: FakeChtmlElement = {
    tagName: tagName.toUpperCase(),
    textContent,
    get className() {
      return Array.from(classes).join(" ");
    },
    set className(val: string) {
      classes.clear();
      val.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
    classList: {
      add: (...cls: string[]) => cls.forEach((c) => classes.add(c)),
      contains: (cls: string) => classes.has(cls),
    },
    children,
    parentElement: null,
    get firstElementChild() {
      return children[0] || null;
    },
    get lastElementChild() {
      return children[children.length - 1] || null;
    },
    matches: (sel: string) => {
      return sel.split(",").some((s) => matchSingleSelector(node, s));
    },
    closest: (sel: string) => {
      let curr: FakeChtmlElement | null = node;
      while (curr) {
        if (curr.matches(sel)) return curr;
        curr = curr.parentElement;
      }
      return null;
    },
    contains: (other: FakeChtmlElement | null) => {
      let curr = other;
      while (curr) {
        if (curr === node) return true;
        curr = curr.parentElement;
      }
      return false;
    },
    querySelector: (sel: string) => {
      return node.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll: (sel: string) => {
      const matched: FakeChtmlElement[] = [];
      const walk = (curr: FakeChtmlElement) => {
        for (const child of curr.children) {
          if (child.matches(sel)) {
            matched.push(child);
          }
          walk(child);
        }
      };
      walk(node);
      return matched;
    },
  };

  for (const c of children) {
    c.parentElement = node;
  }
  return node;
}

/**
 * Creates a live MathJax 4.1.3 CHTML leaf (<mjx-mi>, <mjx-mn>, <mjx-mo>) whose `textContent` is `""`
 * and whose glyphs are encoded strictly as `<mjx-c class="mjx-cHEX"></mjx-c>` children.
 */
function chtmlLeaf(tag: string, chars: string): FakeChtmlElement {
  const glyphs: FakeChtmlElement[] = [];
  for (const ch of chars) {
    const hex = ch.codePointAt(0)!.toString(16).toUpperCase();
    glyphs.push(el("mjx-c", [], `mjx-c${hex}`, ""));
  }
  return el(tag, glyphs, "", "");
}

describe("2D Grid Alignment, Live MathJax 4 CHTML Hex Decoding & Neighbor-Contextual Reconciler", () => {
  const fourierLatex = String.raw`\begin{aligned} a_0 &= {2}/{2l}\int_{C}^{C+2l}f(x)dx \\  \\      a_n &=  {2}/{2l}\int_{C}^{C+2l}f(x){cos({n pi x}/{l})}dx \\ \\ b_n &=  {2}/{2l}\int_{C}^{C+2l}f(x){sin({n pi x}/{l})}dx\end{aligned}`;

  it("annotates prevLeaf, nextLeaf, compoundRole, and compoundPartner on CST leaves", () => {
    const parser = new MathCSTParser(fourierLatex);
    const ast = parser.parse();
    expect(ast.length).toBeGreaterThan(0);

    const dNodes: any[] = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.kind === "identifier" && n.text === "d") {
          dNodes.push(n);
        }
        if (n.children) walk(n.children);
        if (n.numerator) walk(n.numerator);
        if (n.denominator) walk(n.denominator);
        if (n.arg) walk(n.arg);
      }
    };
    walk(ast);

    expect(dNodes.length).toBe(3);
    for (const dNode of dNodes) {
      expect(dNode.compoundRole).toBe("diff_op");
      expect(dNode.compoundPartner).toBeDefined();
      expect(dNode.compoundPartner.text).toBe("x");
      expect(dNode.compoundPartner.compoundRole).toBe("diff_var");
      expect(dNode.compoundPartner.compoundPartner).toBe(dNode);
      expect(dNode.nextLeaf).toBe(dNode.compoundPartner);
      expect(dNode.compoundPartner.prevLeaf).toBe(dNode);
    }
  });

  it("maps all 3 rows and their dx tokens to exact row-local offsets in authentic MathJax 4 CHTML (empty textContent, mjx-cHEX, U+2061, empty spacer mjx-mi, and \\\\ \\\\ empty rows)", () => {
    const row0DxIdx = fourierLatex.indexOf("dx");
    const row2DxIdx = fourierLatex.indexOf("dx", row0DxIdx + 2);
    const row4DxIdx = fourierLatex.indexOf("dx", row2DxIdx + 2);

    const buildRhsCell = (trigNodes: FakeChtmlElement[]) => {
      const dLeaf = chtmlLeaf("mjx-mi", "d");
      const xLeaf = chtmlLeaf("mjx-mi", "x");
      const mtd = el("mjx-mtd", [
        el("mjx-mi", [], "", ""), // Empty alignment spacer injected by MathJax \begin{aligned}
        chtmlLeaf("mjx-mo", "="),
        el("mjx-texatom", [chtmlLeaf("mjx-mn", "2")]),
        chtmlLeaf("mjx-mo", "/"),
        el("mjx-texatom", [chtmlLeaf("mjx-mn", "2"), chtmlLeaf("mjx-mi", "l")]),
        el("mjx-msubsup", [
          chtmlLeaf("mjx-mo", "∫"),
          el("mjx-script", [
            el("mjx-texatom", [
              chtmlLeaf("mjx-mi", "C"),
              chtmlLeaf("mjx-mo", "+"),
              chtmlLeaf("mjx-mn", "2"),
              chtmlLeaf("mjx-mi", "l"),
            ]),
            el("mjx-spacer"),
            el("mjx-texatom", [chtmlLeaf("mjx-mi", "C")]),
          ]),
        ]),
        chtmlLeaf("mjx-mi", "f"),
        chtmlLeaf("mjx-mo", "\u2061"), // Invisible ApplyFunction
        el("mjx-mrow", [
          chtmlLeaf("mjx-mo", "("),
          chtmlLeaf("mjx-mi", "x"),
          chtmlLeaf("mjx-mo", ")"),
        ]),
        ...trigNodes,
        dLeaf,
        xLeaf,
      ]);
      return { mtd, dLeaf, xLeaf };
    };

    const buildTrigBlock = (fnLetters: [string, string, string]) => [
      el("mjx-texatom", [
        chtmlLeaf("mjx-mi", fnLetters[0]),
        chtmlLeaf("mjx-mi", fnLetters[1]),
        chtmlLeaf("mjx-mi", fnLetters[2]),
        el("mjx-mrow", [
          chtmlLeaf("mjx-mo", "("),
          el("mjx-texatom", [
            chtmlLeaf("mjx-mi", "n"),
            chtmlLeaf("mjx-mi", "p"),
            chtmlLeaf("mjx-mi", "i"),
            chtmlLeaf("mjx-mi", "x"),
          ]),
          chtmlLeaf("mjx-mo", "/"),
          el("mjx-texatom", [chtmlLeaf("mjx-mi", "l")]),
          chtmlLeaf("mjx-mo", ")"),
        ]),
      ]),
    ];

    const rhs0 = buildRhsCell([]);
    const rhs2 = buildRhsCell(buildTrigBlock(["c", "o", "s"]));
    const rhs4 = buildRhsCell(buildTrigBlock(["s", "i", "n"]));

    const container = el("mjx-container", [
      el("mjx-math", [
        el("mjx-mtable", [
          el("mjx-mtr", [
            el("mjx-mtd", [
              el("mjx-msub", [chtmlLeaf("mjx-mi", "a"), el("mjx-script", [chtmlLeaf("mjx-mn", "0")])]),
            ]),
            rhs0.mtd,
          ]),
          // Empty row from \\ \\
          el("mjx-mtr", [el("mjx-mtd"), el("mjx-mtd")]),
          el("mjx-mtr", [
            el("mjx-mtd", [
              el("mjx-msub", [chtmlLeaf("mjx-mi", "a"), el("mjx-script", [chtmlLeaf("mjx-mi", "n")])]),
            ]),
            rhs2.mtd,
          ]),
          // Empty row from \\ \\
          el("mjx-mtr", [el("mjx-mtd"), el("mjx-mtd")]),
          el("mjx-mtr", [
            el("mjx-mtd", [
              el("mjx-msub", [chtmlLeaf("mjx-mi", "b"), el("mjx-script", [chtmlLeaf("mjx-mi", "n")])]),
            ]),
            rhs4.mtd,
          ]),
        ]),
      ]),
    ]);

    stampMathJaxDOM(container as unknown as Element, fourierLatex);

    const rD0 = getMathJaxElementRange(rhs0.dLeaf as unknown as Element)!;
    const rX0 = getMathJaxElementRange(rhs0.xLeaf as unknown as Element)!;
    const rD2 = getMathJaxElementRange(rhs2.dLeaf as unknown as Element)!;
    const rX2 = getMathJaxElementRange(rhs2.xLeaf as unknown as Element)!;
    const rD4 = getMathJaxElementRange(rhs4.dLeaf as unknown as Element)!;
    const rX4 = getMathJaxElementRange(rhs4.xLeaf as unknown as Element)!;

    // Row 0 dx maps strictly to Row 0's dx
    expect(rD0).toBeDefined();
    expect(rX0).toBeDefined();
    expect({ start: rD0.start, end: rD0.end }).toEqual({ start: row0DxIdx, end: row0DxIdx + 1 });
    expect({ start: rX0.start, end: rX0.end }).toEqual({ start: row0DxIdx + 1, end: row0DxIdx + 2 });
    expect(rD0.scales?.atom).toEqual({ start: row0DxIdx, end: row0DxIdx + 2 });
    expect(rX0.scales?.atom).toEqual({ start: row0DxIdx, end: row0DxIdx + 2 });

    // Row 2 dx maps strictly to Row 2's dx (NOT Row 0's dx!)
    expect(rD2).toBeDefined();
    expect(rX2).toBeDefined();
    expect({ start: rD2.start, end: rD2.end }).toEqual({ start: row2DxIdx, end: row2DxIdx + 1 });
    expect({ start: rX2.start, end: rX2.end }).toEqual({ start: row2DxIdx + 1, end: row2DxIdx + 2 });
    expect(rD2.scales?.atom).toEqual({ start: row2DxIdx, end: row2DxIdx + 2 });
    expect(rX2.scales?.atom).toEqual({ start: row2DxIdx, end: row2DxIdx + 2 });

    // Row 4 dx maps strictly to Row 4's dx (NOT Row 0's or Row 2's dx!)
    expect(rD4).toBeDefined();
    expect(rX4).toBeDefined();
    expect({ start: rD4.start, end: rD4.end }).toEqual({ start: row4DxIdx, end: row4DxIdx + 1 });
    expect({ start: rX4.start, end: rX4.end }).toEqual({ start: row4DxIdx + 1, end: row4DxIdx + 2 });
    expect(rD4.scales?.atom).toEqual({ start: row4DxIdx, end: row4DxIdx + 2 });
    expect(rX4.scales?.atom).toEqual({ start: row4DxIdx, end: row4DxIdx + 2 });
  });

  it("preserves leading braced expressions after \\begin{aligned} without swallowing {2} as a column format spec", () => {
    const latex = String.raw`\begin{aligned} {2}/{2l} &= 1 \end{aligned}`;
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    const firstNumIdx = latex.indexOf("2");
    let foundFirstTwo = false;
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.kind === "number" && n.value === "2" && n.start === firstNumIdx) {
          foundFirstTwo = true;
        }
        if (n.children) walk(n.children);
        if (n.numerator) walk(n.numerator);
        if (n.denominator) walk(n.denominator);
      }
    };
    walk(ast);
    expect(foundFirstTwo).toBe(true);
  });

  it("disambiguates intra-row duplicate tokens (\\int d(x) \\cdot x \\, dx) using compoundPartner and syntactic neighbor bigrams", () => {
    const latex = String.raw`\int d(x) \cdot x \, dx`;
    const firstDIdx = latex.indexOf("d(x)");
    const firstXIdx = latex.indexOf("x)");
    const secondXIdx = latex.indexOf("x \\,");
    const diffDIdx = latex.lastIndexOf("dx");
    const diffXIdx = diffDIdx + 1;

    const firstD = chtmlLeaf("mjx-mi", "d");
    const firstX = chtmlLeaf("mjx-mi", "x");
    const secondX = chtmlLeaf("mjx-mi", "x");
    const diffD = chtmlLeaf("mjx-mi", "d");
    const diffX = chtmlLeaf("mjx-mi", "x");

    const container = el("mjx-container", [
      el("mjx-math", [
        chtmlLeaf("mjx-mo", "∫"),
        firstD,
        el("mjx-mrow", [
          chtmlLeaf("mjx-mo", "("),
          firstX,
          chtmlLeaf("mjx-mo", ")"),
        ]),
        chtmlLeaf("mjx-mo", "⋅"),
        secondX,
        el("mjx-mspace"),
        diffD,
        diffX,
      ]),
    ]);

    stampMathJaxDOM(container as unknown as Element, latex);

    const rFirstD = getMathJaxElementRange(firstD as unknown as Element)!;
    const rFirstX = getMathJaxElementRange(firstX as unknown as Element)!;
    const rSecondX = getMathJaxElementRange(secondX as unknown as Element)!;
    const rDiffD = getMathJaxElementRange(diffD as unknown as Element)!;
    const rDiffX = getMathJaxElementRange(diffX as unknown as Element)!;

    expect({ start: rFirstD.start, end: rFirstD.end }).toEqual({ start: firstDIdx, end: firstDIdx + 1 });
    expect({ start: rFirstX.start, end: rFirstX.end }).toEqual({ start: firstXIdx, end: firstXIdx + 1 });
    expect({ start: rSecondX.start, end: rSecondX.end }).toEqual({ start: secondXIdx, end: secondXIdx + 1 });
    expect({ start: rDiffD.start, end: rDiffD.end }).toEqual({ start: diffDIdx, end: diffDIdx + 1 });
    expect({ start: rDiffX.start, end: rDiffX.end }).toEqual({ start: diffXIdx, end: diffXIdx + 1 });
    // Differential dx carries compound atom scale [diffDIdx, diffXIdx + 1]
    expect(rDiffD.scales?.atom).toEqual({ start: diffDIdx, end: diffXIdx + 1 });
    expect(rDiffX.scales?.atom).toEqual({ start: diffDIdx, end: diffXIdx + 1 });
  });
});
