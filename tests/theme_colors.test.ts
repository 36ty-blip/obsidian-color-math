import { describe, it, expect } from 'vitest';
import { normalizeColorToHex, extractThemePalette } from '../src/utils/theme_colors';
import { DEFAULT_PALETTE } from '../src/config';

describe('theme_colors normalization', () => {
  it('normalizes 6-digit hex codes', () => {
    expect(normalizeColorToHex('#7aa2f7', '#000000')).toBe('#7aa2f7');
    expect(normalizeColorToHex('#E0AF68', '#000000')).toBe('#e0af68');
  });

  it('normalizes 3-digit shorthand hex codes', () => {
    expect(normalizeColorToHex('#fff', '#000000')).toBe('#ffffff');
    expect(normalizeColorToHex('#123', '#000000')).toBe('#112233');
  });

  it('normalizes 8-digit hex with alpha', () => {
    expect(normalizeColorToHex('#7aa2f7ff', '#000000')).toBe('#7aa2f7');
  });

  it('normalizes rgb and rgba strings', () => {
    expect(normalizeColorToHex('rgb(122, 162, 247)', '#000000')).toBe('#7aa2f7');
    expect(normalizeColorToHex('rgba(187, 154, 247, 0.9)', '#000000')).toBe('#bb9af7');
    expect(normalizeColorToHex('rgb(255, 255, 255)', '#000000')).toBe('#ffffff');
    expect(normalizeColorToHex('rgb(0, 0, 0)', '#ffffff')).toBe('#000000');
  });

  it('handles named colors white and black', () => {
    expect(normalizeColorToHex('white', '#000000')).toBe('white');
    expect(normalizeColorToHex('White', '#000000')).toBe('white');
    expect(normalizeColorToHex('black', '#ffffff')).toBe('black');
  });

  it('falls back on invalid or empty color strings', () => {
    expect(normalizeColorToHex('', '#fallback')).toBe('#fallback');
    expect(normalizeColorToHex('invalid-color-value', '#fallback')).toBe('#fallback');
  });
});

describe('extractThemePalette', () => {
  it('returns valid palette structure with dark mode relations', () => {
    const palette = extractThemePalette(false);
    expect(palette.main).toBeDefined();
    expect(palette.derivative).toBeDefined();
    expect(palette.chain).toBeDefined();
    expect(palette.relation).toBe('white');
  });

  it('returns slate dark relation in light mode', () => {
    const palette = extractThemePalette(true);
    expect(palette.relation).toBe('#1e293b');
    expect(palette.dot).toBe('#334155');
  });
});
