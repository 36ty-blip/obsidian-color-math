// wasm/src/lexer.rs
//! Fast Whole-Block Byte-Stream Lexer & Token Slicer Engine
//! Scans math text directly from UTF-16 linear memory, fusing Island 1 MPHF catalog
//! and Island 2 delimiter scan in a single zero-allocation pass.

use crate::catalog::lookup_catalog_packed_utf16;
use crate::delimiters::scan_delimiters_u16;

pub const ROLE_FUNCTION: u32 = 0;
pub const ROLE_OPERATOR: u32 = 1;
pub const ROLE_RELATION: u32 = 2;
pub const ROLE_CONSTANT: u32 = 3;
pub const ROLE_PARAMETER: u32 = 4;
pub const ROLE_DERIVATIVE: u32 = 5;
pub const ROLE_DELIMITER: u32 = 6;
pub const ROLE_STRUCTURAL: u32 = 7;
pub const ROLE_UNIT: u32 = 8;
pub const ROLE_VARIABLE: u32 = 9;
pub const ROLE_ARROW: u32 = 10;
pub const ROLE_SET: u32 = 11;
pub const ROLE_DOT: u32 = 12;
pub const ROLE_TRANSFORM: u32 = 13;
pub const ROLE_SPACING: u32 = 14;
pub const ROLE_ARITHMETIC: u32 = 15;
pub const ROLE_SUBSCRIPT: u32 = 16;
pub const ROLE_SUPERSCRIPT: u32 = 17;
pub const ROLE_SYNTAX_ERROR: u32 = 999;

const CHAR_BACKSLASH: u16 = 92;
const CHAR_LBRACE: u16 = 123;
const CHAR_RBRACE: u16 = 125;
const CHAR_UNDERSCORE: u16 = 95;
const CHAR_CARET: u16 = 94;
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
fn skip_whitespace_u16(slice: &[u16], mut idx: usize) -> usize {
    let n = slice.len();
    while idx < n && is_whitespace(slice[idx]) {
        idx += 1;
    }
    idx
}

#[inline]
fn skip_comment_u16(slice: &[u16], start: usize) -> usize {
    let mut i = start + 1;
    let n = slice.len();
    while i < n && slice[i] != 10 && slice[i] != 13 {
        i += 1;
    }
    if i < n && slice[i] == 13 && i + 1 < n && slice[i + 1] == 10 {
        return i + 2;
    }
    if i < n {
        return i + 1;
    }
    n
}

#[inline]
fn skip_braced_group_u16(slice: &[u16], mut i: usize) -> usize {
    i = skip_whitespace_u16(slice, i);
    let n = slice.len();
    if i >= n || slice[i] != CHAR_LBRACE {
        return i;
    }
    i += 1;
    let mut depth = 1;
    while i < n && depth > 0 {
        if slice[i] == CHAR_BACKSLASH && i + 1 < n {
            i += 2;
            continue;
        }
        if slice[i] == CHAR_LBRACE {
            depth += 1;
        } else if slice[i] == CHAR_RBRACE {
            depth -= 1;
        }
        i += 1;
    }
    i
}

#[inline]
fn read_argument_end_u16(slice: &[u16], start: usize) -> usize {
    let n = slice.len();
    if start >= n {
        return start;
    }
    if slice[start] == CHAR_LBRACE {
        let mut idx = start + 1;
        let mut depth = 1;
        while idx < n && depth > 0 {
            if slice[idx] == CHAR_BACKSLASH && idx + 1 < n {
                idx += 2;
                continue;
            }
            if slice[idx] == CHAR_LBRACE {
                depth += 1;
            } else if slice[idx] == CHAR_RBRACE {
                depth -= 1;
                if depth == 0 {
                    return idx + 1;
                }
            }
            idx += 1;
        }
        return idx;
    }
    if slice[start] == CHAR_BACKSLASH {
        let mut idx = start + 1;
        if idx < n && !is_ascii_alphabetic(slice[idx]) {
            return idx + 1;
        }
        while idx < n && is_ascii_alphabetic(slice[idx]) {
            idx += 1;
        }
        return idx;
    }
    start + 1
}

/// Matches literal ASCII prefix in UTF-16 slice
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

/// Scans the entire active math block and emits flat 4-tuples:
/// `[start, end, role_id, priority]` into `out_slice`.
/// Returns the number of emitted tokens.
pub fn lex_math_block_u16(
    slice: &[u16],
    out_slice: &mut [u32],
    active_domains: u32,
    active_dialects: u32,
    flags: u32,
) -> usize {
    let n = slice.len();
    let max_tokens = out_slice.len() / 4;
    let mut token_count = 0;

    let include_delimiters = (flags & 1) != 0;
    let include_scripts = (flags & 2) != 0;
    let for_latex_wrap = (flags & 4) != 0;

    let mut i = 0;
    while i < n {
        let ch = slice[i];

        // 1. Comments: % ... \n
        if ch == CHAR_PERCENT {
            if i == 0 || slice[i - 1] != CHAR_BACKSLASH {
                i = skip_comment_u16(slice, i);
                continue;
            }
        }

        // 2. Ignore \textcolor{...}{...} and \color{...}
        if ch == CHAR_BACKSLASH {
            if starts_with_ascii(slice, i, b"\\textcolor") {
                let mut next_i = i + 10;
                next_i = skip_braced_group_u16(slice, next_i); // color param
                i = next_i;
                continue;
            } else if starts_with_ascii(slice, i, b"\\color") {
                let mut next_i = i + 6;
                next_i = skip_braced_group_u16(slice, next_i);
                i = next_i;
                continue;
            }
        }

        // 3. Subscripts and Superscripts: _ and ^
        if include_scripts && (ch == CHAR_UNDERSCORE || ch == CHAR_CARET) {
            let role_id = if ch == CHAR_UNDERSCORE { ROLE_SUBSCRIPT } else { ROLE_SUPERSCRIPT };
            let arg_start = skip_whitespace_u16(slice, i + 1);
            if arg_start < n {
                let arg_end = read_argument_end_u16(slice, arg_start);
                let (inner_start, inner_end) = if slice[arg_start] == CHAR_LBRACE && arg_end > arg_start + 1 && slice[arg_end - 1] == CHAR_RBRACE {
                    (arg_start + 1, arg_end - 1)
                } else {
                    (arg_start, arg_end)
                };

                if inner_start < inner_end && token_count < max_tokens {
                    let out_idx = token_count * 4;
                    out_slice[out_idx] = inner_start as u32;
                    out_slice[out_idx + 1] = inner_end as u32;
                    out_slice[out_idx + 2] = role_id;
                    out_slice[out_idx + 3] = 10; // Script priority 10
                    token_count += 1;
                }
                i = arg_end;
                continue;
            }
        }

        // 4. LaTeX Backslash Control Sequences: \cmd
        if ch == CHAR_BACKSLASH {
            let cmd_start = i;
            let mut cmd_end = i + 1;
            if cmd_end < n {
                if !is_ascii_alphabetic(slice[cmd_end]) {
                    cmd_end += 1;
                } else {
                    while cmd_end < n && is_ascii_alphabetic(slice[cmd_end]) {
                        cmd_end += 1;
                    }
                }
            }

            // O(1) Lemire MPHF catalog lookup directly on UTF-16 slice
            let packed = lookup_catalog_packed_utf16(&slice[cmd_start..cmd_end], active_domains, active_dialects);
            if packed != 0xFFFFFFFF {
                let role_id = packed & 0xF;
                let priority = (packed >> 4) & 0x7F;

                let mut final_end = cmd_end;
                // Limits modifier: e.g. \int\limits or \sum\displaylimits
                if !for_latex_wrap {
                    let next_ws = skip_whitespace_u16(slice, cmd_end);
                    if starts_with_ascii(slice, next_ws, b"\\limits") {
                        if next_ws + 7 >= n || !is_ascii_alphabetic(slice[next_ws + 7]) {
                            final_end = next_ws + 7;
                        }
                    } else if starts_with_ascii(slice, next_ws, b"\\displaylimits") {
                        if next_ws + 14 >= n || !is_ascii_alphabetic(slice[next_ws + 14]) {
                            final_end = next_ws + 14;
                        }
                    } else if starts_with_ascii(slice, next_ws, b"\\nolimits") {
                        if next_ws + 9 >= n || !is_ascii_alphabetic(slice[next_ws + 9]) {
                            final_end = next_ws + 9;
                        }
                    }
                }

                if token_count < max_tokens {
                    let out_idx = token_count * 4;
                    out_slice[out_idx] = cmd_start as u32;
                    out_slice[out_idx + 1] = final_end as u32;
                    out_slice[out_idx + 2] = role_id;
                    out_slice[out_idx + 3] = priority;
                    token_count += 1;
                }
                i = final_end;
                continue;
            }

            i = cmd_end;
            continue;
        }

        // 5. Binary Relations and Operators
        match ch {
            61 | 60 | 62 => { // '=', '<', '>'
                if token_count < max_tokens {
                    let out_idx = token_count * 4;
                    out_slice[out_idx] = i as u32;
                    out_slice[out_idx + 1] = (i + 1) as u32;
                    out_slice[out_idx + 2] = ROLE_RELATION;
                    out_slice[out_idx + 3] = 30;
                    token_count += 1;
                }
            }
            43 | 45 => { // '+', '-'
                if token_count < max_tokens {
                    let out_idx = token_count * 4;
                    out_slice[out_idx] = i as u32;
                    out_slice[out_idx + 1] = (i + 1) as u32;
                    out_slice[out_idx + 2] = ROLE_OPERATOR;
                    out_slice[out_idx + 3] = 30;
                    token_count += 1;
                }
            }
            42 | 0x00B7 | 0x00D7 => { // '*', '·', '×'
                if token_count < max_tokens {
                    let out_idx = token_count * 4;
                    out_slice[out_idx] = i as u32;
                    out_slice[out_idx + 1] = (i + 1) as u32;
                    out_slice[out_idx + 2] = ROLE_DOT;
                    out_slice[out_idx + 3] = 30;
                    token_count += 1;
                }
            }
            _ => {}
        }

        i += 1;
    }

    // 6. Delimiter Scan (Island 2 Fusion inside Linear Memory)
    if include_delimiters {
        let mut delim_buf = [0u32; 4096];
        let packed_counts = scan_delimiters_u16(slice, &mut delim_buf, true, true);
        let pairs_count = (packed_counts >> 16) as usize;
        let unmatched_count = (packed_counts & 0xFFFF) as usize;

        // Add pairs
        for p_idx in 0..pairs_count {
            if token_count + 2 > max_tokens {
                break;
            }
            let base = p_idx * 6;
            let open_start = delim_buf[base];
            let open_end = delim_buf[base + 1];
            let close_start = delim_buf[base + 2];
            let close_end = delim_buf[base + 3];
            let depth = delim_buf[base + 4];

            // Open delimiter
            let out_idx = token_count * 4;
            out_slice[out_idx] = open_start;
            out_slice[out_idx + 1] = open_end;
            out_slice[out_idx + 2] = 100 + depth;
            out_slice[out_idx + 3] = 25;
            token_count += 1;

            // Close delimiter
            let out_idx2 = token_count * 4;
            out_slice[out_idx2] = close_start;
            out_slice[out_idx2 + 1] = close_end;
            out_slice[out_idx2 + 2] = 100 + depth;
            out_slice[out_idx2 + 3] = 25;
            token_count += 1;
        }

        // Add unmatched syntax errors
        for u_idx in 0..unmatched_count {
            if token_count >= max_tokens {
                break;
            }
            let base = (pairs_count + u_idx) * 6;
            let u_start = delim_buf[base];
            let u_end = delim_buf[base + 1];

            let out_idx = token_count * 4;
            out_slice[out_idx] = u_start;
            out_slice[out_idx + 1] = u_end;
            out_slice[out_idx + 2] = ROLE_SYNTAX_ERROR;
            out_slice[out_idx + 3] = 99;
            token_count += 1;
        }
    }

    token_count
}
