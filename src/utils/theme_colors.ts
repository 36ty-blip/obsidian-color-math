import { ColorPalette, DEFAULT_PALETTE } from "../config";

/**
 * Converts any CSS color string (hex, rgb, rgba) into a standard #RRGGBB hex string.
 * MathJax \textcolor requires clean hex strings or valid LaTeX color names.
 */
export function normalizeColorToHex(colorStr: string, fallback: string): string {
  if (!colorStr) return fallback;
  const trimmed = colorStr.trim();
  if (!trimmed) return fallback;

  // #RGB or #RRGGBB
  if (trimmed.startsWith("#")) {
    if (trimmed.length === 4) {
      // #rgb -> #rrggbb
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    if (trimmed.length === 7) {
      return trimmed.toLowerCase();
    }
    if (trimmed.length === 9) {
      // #rrggbbaa -> take first 7
      return trimmed.slice(0, 7).toLowerCase();
    }
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, parseInt(rgbMatch[1], 10)));
    const g = Math.min(255, Math.max(0, parseInt(rgbMatch[2], 10)));
    const b = Math.min(255, Math.max(0, parseInt(rgbMatch[3], 10)));
    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // Named colors
  if (trimmed.toLowerCase() === "white") return "white";
  if (trimmed.toLowerCase() === "black") return "black";

  return fallback;
}

/**
 * Checks if Obsidian is currently running in Light Mode.
 */
export function isVaultLightMode(): boolean {
  if (typeof document === "undefined" || !document.body) {
    return false;
  }
  return document.body.classList.contains("theme-light");
}

/**
 * Extracts color values from Obsidian's active theme CSS variables on document.body.
 */
export function extractThemePalette(isLight?: boolean): ColorPalette {
  const light = isLight !== undefined ? isLight : isVaultLightMode();
  
  // In light mode, operators & relations should be dark slate so they are clearly legible
  const relationColor = light ? "#1e293b" : "white";
  const dotColor = light ? "#334155" : "white";

  if (typeof window === "undefined" || typeof document === "undefined" || !document.body) {
    return {
      ...DEFAULT_PALETTE,
      relation: relationColor,
      dot: dotColor,
      spacing: dotColor,
    };
  }

  const style = getComputedStyle(document.body);

  const getVar = (name: string, fallback: string): string => {
    const val = style.getPropertyValue(name).trim();
    return normalizeColorToHex(val, fallback);
  };

  // Extract core theme colors with Tokyo Night fallbacks
  const blue = getVar("--color-blue", style.getPropertyValue("--text-accent").trim() || DEFAULT_PALETTE.main);
  const purple = getVar("--color-purple", DEFAULT_PALETTE.derivative);
  const green = getVar("--color-green", DEFAULT_PALETTE.chain);
  const orange = getVar("--color-orange", DEFAULT_PALETTE.orange);
  const red = getVar("--color-red", getVar("--color-pink", DEFAULT_PALETTE.arrow));
  const cyan = getVar("--color-cyan", blue);

  return {
    main: blue,
    derivative: purple,
    chain: green,
    orange: orange,
    arrow: red,
    set: cyan,
    upper: purple,
    relation: relationColor,
    dot: dotColor,
    spacing: dotColor,
    parameter: purple,
  };
}
