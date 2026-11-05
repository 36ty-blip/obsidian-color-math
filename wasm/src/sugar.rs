// wasm/src/sugar.rs
//! High-Performance In-Place Syntactic Sugar & Ligature Desugarer.
//! Rewrites ergonomic mathematical syntax (mat[...], ligatures, ellipses) directly
//! in UTF-16 linear memory with zero heap allocations.

const CHAR_BACKSLASH: u16 = 92;
const CHAR_LBRACE: u16 = 123;
const CHAR_RBRACE: u16 = 125;
const CHAR_LBRACKET: u16 = 91;
const CHAR_RBRACKET: u16 = 93;
const CHAR_LPAREN: u16 = 40;
const CHAR_RPAREN: u16 = 41;
const CHAR_COMMA: u16 = 44;
const CHAR_SEMICOLON: u16 = 59;
const CHAR_PERCENT: u16 = 37;

#[inline(always)]
fn is_ascii_alphabetic(code: u16) -> bool {
    (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

#[inline(always)]
fn is_whitespace(code: u16) -> bool {
    code == 32 || code == 9 || code == 10 || code == 13
}

#[inline]
fn starts_with_ascii(slice: &[u16], start: usize, prefix: &[u8]) -> bool {
    if start + prefix.len() > slice.len() {
        return false;
    }
    for (idx, &b) in prefix.iter().enumerate() {
        if slice[start + idx] != b as u16 {
            return false;
        }
    }
    true
}

#[inline]
fn append_ascii(out: &mut [u16], out_idx: &mut usize, s: &[u8]) {
    let max = out.len();
    for &b in s {
        if *out_idx < max {
            out[*out_idx] = b as u16;
            *out_idx += 1;
        }
    }
}

include!("constructors_generated.rs");

/// Identifies matrix shorthand environment name via single-source-of-truth code-generated table:
/// e.g. "mat" -> "matrix", "pmat" -> "pmatrix", "bmat" -> "bmatrix", "align" -> "aligned", etc.
fn match_matrix_prefix(slice: &[u16], mut i: usize) -> Option<(&'static [u8], usize)> {
    if i < slice.len() && slice[i] == CHAR_BACKSLASH {
        i += 1;
    }
    match_generated_matrix_prefix(slice, i)
}

/// Desugars math block text from `src` into `dest`.
/// Returns the length of the desugared output in UTF-16 code units.
pub fn desugar_math_u16(
    src: &[u16],
    dest: &mut [u16],
    flags: u32,
) -> usize {
    let n = src.len();
    let mut i = 0;
    let mut out_len = 0;

    let enable_matrices = (flags & 1) != 0;
    let enable_ligatures = (flags & 2) != 0;
    let enable_ellipses = (flags & 4) != 0;

    while i < n {
        let ch = src[i];

        // 1. Comments: % ... \n
        if ch == CHAR_PERCENT && (i == 0 || src[i - 1] != CHAR_BACKSLASH) {
            dest[out_len] = ch;
            out_len += 1;
            i += 1;
            while i < n && src[i] != 10 && src[i] != 13 {
                if out_len < dest.len() {
                    dest[out_len] = src[i];
                    out_len += 1;
                }
                i += 1;
            }
            continue;
        }

        // 2. ASCII Ellipses: ... -> \dots
        if enable_ellipses && ch == 46 && i + 2 < n && src[i + 1] == 46 && src[i + 2] == 46 {
            append_ascii(dest, &mut out_len, b"\\dots ");
            i += 3;
            continue;
        }

        // 3. Ligatures and ASCII Operators
        if enable_ligatures {
            if ch == 33 && i + 1 < n && src[i + 1] == 61 { // !=
                append_ascii(dest, &mut out_len, b"\\neq ");
                i += 2;
                continue;
            }
            if ch == 62 && i + 1 < n && src[i + 1] == 61 { // >=
                append_ascii(dest, &mut out_len, b"\\ge ");
                i += 2;
                continue;
            }
            if ch == 60 && i + 1 < n && src[i + 1] == 61 { // <=
                append_ascii(dest, &mut out_len, b"\\le ");
                i += 2;
                continue;
            }
            if ch == 45 && i + 1 < n && src[i + 1] == 62 { // ->
                append_ascii(dest, &mut out_len, b"\\to ");
                i += 2;
                continue;
            }
            if ch == 61 && i + 1 < n && src[i + 1] == 62 { // =>
                append_ascii(dest, &mut out_len, b"\\implies ");
                i += 2;
                continue;
            }
            if ch == 126 && i + 1 < n && src[i + 1] == 61 { // ~=
                append_ascii(dest, &mut out_len, b"\\approx ");
                i += 2;
                continue;
            }
            // Word-boundary ligatures: ox, o+, xx
            if ch == 111 && i + 1 < n { // 'o'
                if src[i + 1] == 120 && (i == 0 || !is_ascii_alphabetic(src[i - 1])) && (i + 2 >= n || !is_ascii_alphabetic(src[i + 2])) {
                    append_ascii(dest, &mut out_len, b"\\otimes ");
                    i += 2;
                    continue;
                } else if src[i + 1] == 43 && (i == 0 || !is_ascii_alphabetic(src[i - 1])) {
                    append_ascii(dest, &mut out_len, b"\\oplus ");
                    i += 2;
                    continue;
                }
            }
            if ch == 120 && i + 1 < n && src[i + 1] == 120 && (i == 0 || !is_ascii_alphabetic(src[i - 1])) && (i + 2 >= n || !is_ascii_alphabetic(src[i + 2])) {
                append_ascii(dest, &mut out_len, b"\\times ");
                i += 2;
                continue;
            }
        }

        // 4. Matrix Shorthand: mat[...], pmat[...], bmat[...], etc.
        if enable_matrices {
            let is_boundary = i == 0 || (!is_ascii_alphabetic(src[i - 1]) && src[i - 1] != CHAR_BACKSLASH) || (src[i] == CHAR_BACKSLASH);
            if is_boundary {
                if let Some((env, after_mat)) = match_matrix_prefix(src, i) {
                    let mut bracket_start = after_mat;
                    while bracket_start < n && is_whitespace(src[bracket_start]) {
                        bracket_start += 1;
                    }
                    if bracket_start < n && src[bracket_start] == CHAR_LBRACKET {
                        // Find matching closing bracket
                        let mut depth = 1;
                        let mut j = bracket_start + 1;
                        while j < n && depth > 0 {
                            if src[j] == CHAR_BACKSLASH && j + 1 < n {
                                j += 2;
                                continue;
                            }
                            if src[j] == CHAR_LBRACKET {
                                depth += 1;
                            } else if src[j] == CHAR_RBRACKET {
                                depth -= 1;
                            }
                            j += 1;
                        }

                        if depth == 0 {
                            let content_start = bracket_start + 1;
                            let content_end = j - 1;

                            // Emit \begin{<env>}
                            append_ascii(dest, &mut out_len, b"\\begin{");
                            append_ascii(dest, &mut out_len, env);
                            append_ascii(dest, &mut out_len, b"}");

                            // Process contents: replace ',' with ' & ' and ';' with ' \\ '
                            let mut paren_depth = 0;
                            let mut brace_depth = 0;
                            let mut k = content_start;
                            while k < content_end {
                                let c = src[k];
                                if c == CHAR_LPAREN {
                                    paren_depth += 1;
                                } else if c == CHAR_RPAREN {
                                    if paren_depth > 0 { paren_depth -= 1; }
                                } else if c == CHAR_LBRACE {
                                    brace_depth += 1;
                                } else if c == CHAR_RBRACE {
                                    if brace_depth > 0 { brace_depth -= 1; }
                                }

                                if paren_depth == 0 && brace_depth == 0 {
                                    if c == CHAR_COMMA {
                                        append_ascii(dest, &mut out_len, b" & ");
                                        k += 1;
                                        while k < content_end && is_whitespace(src[k]) {
                                            k += 1;
                                        }
                                        continue;
                                    } else if c == CHAR_SEMICOLON {
                                        append_ascii(dest, &mut out_len, b" \\\\ ");
                                        k += 1;
                                        while k < content_end && is_whitespace(src[k]) {
                                            k += 1;
                                        }
                                        continue;
                                    }
                                }

                                if out_len < dest.len() {
                                    dest[out_len] = c;
                                    out_len += 1;
                                }
                                k += 1;
                            }

                            // Emit \end{<env>}
                            append_ascii(dest, &mut out_len, b"\\end{");
                            append_ascii(dest, &mut out_len, env);
                            append_ascii(dest, &mut out_len, b"}");

                            i = j;
                            continue;
                        }
                    }
                }
            }
        }

        if out_len < dest.len() {
            dest[out_len] = ch;
            out_len += 1;
        }
        i += 1;
    }

    out_len
}

#[cfg(test)]
mod tests {
    use super::*;

    fn to_u16(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }

    fn from_u16(slice: &[u16]) -> String {
        String::from_utf16_lossy(slice)
    }

    #[test]
    fn test_desugar_ligatures_and_ellipses() {
        let input = to_u16("a != b, x >= 0, y <= 1, f: A -> B, P => Q, a ... b");
        let mut out = [0u16; 1024];
        let len = desugar_math_u16(&input, &mut out, 7); // all flags
        let result = from_u16(&out[..len]);

        assert!(result.contains("\\neq"));
        assert!(result.contains("\\ge"));
        assert!(result.contains("\\le"));
        assert!(result.contains("\\to"));
        assert!(result.contains("\\implies"));
        assert!(result.contains("\\dots"));
    }

    #[test]
    fn test_desugar_matrix_shorthand() {
        let input = to_u16("mat[1, 2; 3, 4] + pmat[a, b; c, d] + cases[x, x >= 0; -x, x < 0] + align[a &= b; c &= d]");
        let mut out = [0u16; 2048];
        let len = desugar_math_u16(&input, &mut out, 7);
        let result = from_u16(&out[..len]);

        assert!(result.contains("\\begin{matrix}1 & 2 \\\\ 3 & 4\\end{matrix}"));
        assert!(result.contains("\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}"));
        assert!(result.contains("\\begin{cases}x & x >= 0 \\\\ -x & x < 0\\end{cases}"));
        assert!(result.contains("\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}"));
    }
}
