// wasm/src/cst.rs
//! High-Performance Flat Linear Arena Concrete Syntax Tree (CST) & 4D Navigation Topology Engine.
//! Constructs a zero-allocation CST in a contiguous linear memory arena, linking leaves
//! with prev/next pointers and compound differential bindings for sub-microsecond navigation queries.

use crate::catalog::lookup_catalog_packed_utf16;

pub const NODE_COMMAND: u16 = 1;
pub const NODE_GROUP: u16 = 2;
pub const NODE_FRACTION: u16 = 3;
pub const NODE_SCRIPT: u16 = 4;
pub const NODE_IDENTIFIER: u16 = 5;
pub const NODE_OPERATOR: u16 = 6;
pub const NODE_BOUNDARY: u16 = 7;
pub const NODE_TEXT: u16 = 8;
pub const NODE_UNDEROVER: u16 = 9;
pub const NODE_PUNCTUATION: u16 = 10;

pub const FLAG_MATRIX: u16 = 1 << 0;
pub const FLAG_LEFT_RIGHT: u16 = 1 << 1;
pub const FLAG_UNDEROVER: u16 = 1 << 2;
pub const FLAG_DIFF_COMPOUND: u16 = 1 << 3;
pub const FLAG_PRIME_MERGED: u16 = 1 << 4;
pub const FLAG_INFIX_SLASH: u16 = 1 << 5;
pub const FLAG_SYNTAX_ERROR: u16 = 1 << 6;
pub const FLAG_HALF_OPEN: u16 = 1 << 7;

pub const NO_INDEX: u32 = 0xFFFFFFFF;

/// 48-byte aligned binary CST node record in contiguous linear memory.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CstNodeRecord {
    pub kind: u16,             // NodeKind (1..10)
    pub flags: u16,            // Semantic flags (FLAG_*)
    pub start: u32,            // UTF-16 code unit start
    pub end: u32,              // UTF-16 code unit end
    pub role_id: u16,          // Canonical Color Role ID (0..15, or 100+depth)
    pub priority: u16,         // Visual priority (10, 20, 25, 30, 35, 99)
    pub child_start: u32,      // Index of first child in arena (NO_INDEX if leaf)
    pub child_count: u32,      // Number of contiguous children
    pub prev_leaf: u32,        // Index of preceding syntactic leaf (NO_INDEX if none)
    pub next_leaf: u32,        // Index of succeeding syntactic leaf (NO_INDEX if none)
    pub compound_partner: u32, // Index of paired partner token (e.g. 'd' <-> 'x')
    pub w: u16,                // Multi-scale rank: 0=glyph, 1=atom, 2=slot, 3=molecule, 4=enclosure
    pub z: u16,                // Molecule isolation plane (0=dominant baseline, >=1=unique molecule plane)
    pub y: i16,                // Orthogonal elevation (+1=superscript/numerator, 0=baseline, -1=subscript/denominator, -row=matrix)
    pub x: u16,                // Local horizontal sequence index along active slot (0..65535)
    pub extra_data: u16,       // Delimiter type / script type / sub-kind
    pub reserved: u16,         // Alignment padding to 48 bytes
}

impl Default for CstNodeRecord {
    fn default() -> Self {
        Self {
            kind: 0,
            flags: 0,
            start: 0,
            end: 0,
            role_id: 0,
            priority: 0,
            child_start: NO_INDEX,
            child_count: 0,
            prev_leaf: NO_INDEX,
            next_leaf: NO_INDEX,
            compound_partner: NO_INDEX,
            w: 0,
            z: 0,
            y: 0,
            x: 0,
            extra_data: 0,
            reserved: 0,
        }
    }
}

const CHAR_BACKSLASH: u16 = 92;
const CHAR_LBRACE: u16 = 123;
const CHAR_RBRACE: u16 = 125;
const CHAR_LBRACKET: u16 = 91;
const CHAR_RBRACKET: u16 = 93;
const CHAR_LPAREN: u16 = 40;
const CHAR_RPAREN: u16 = 41;
const CHAR_UNDERSCORE: u16 = 95;
const CHAR_CARET: u16 = 94;
const CHAR_PERCENT: u16 = 37;
const CHAR_PRIME: u16 = 39;

#[inline(always)]
fn is_ascii_alphabetic(code: u16) -> bool {
    (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

#[inline(always)]
fn is_ascii_digit(code: u16) -> bool {
    code >= 48 && code <= 57
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

/// Parses full mathematical text into the flat CST arena.
/// Returns the number of allocated nodes in the arena.
pub fn parse_cst_to_arena(
    slice: &[u16],
    arena: &mut [CstNodeRecord],
    active_domains: u32,
    active_dialects: u32,
) -> usize {
    let mut node_count = 0;
    let mut molecule_counter: u16 = 0;

    parse_slot_to_arena(
        slice,
        0,
        slice.len(),
        arena,
        &mut node_count,
        &mut molecule_counter,
        active_domains,
        active_dialects,
        0, // z: baseline
        0, // y: baseline
        0, // initial x
    );

    // Navigation Pass: Link adjacent leaf nodes within the same slot and pair compound differentials ('d' + 'x')
    annotate_leaf_chain(slice, arena, node_count);

    node_count
}

fn parse_slot_to_arena(
    slice: &[u16],
    start: usize,
    end: usize,
    arena: &mut [CstNodeRecord],
    node_count: &mut usize,
    molecule_counter: &mut u16,
    active_domains: u32,
    active_dialects: u32,
    z: u16,
    y: i16,
    initial_x: u16,
) {
    let max_nodes = arena.len();
    let mut i = start;
    let active_z = z;
    let mut active_y = y;
    let mut seq_x = initial_x;
    let mut current_row: i16 = 0;
    let mut current_col: u16 = 0;

    while i < end && *node_count < max_nodes {
        i = skip_whitespace_u16(slice, i);
        if i >= end {
            break;
        }
        let ch = slice[i];

        // 1. Comments: % ... \n
        if ch == CHAR_PERCENT {
            i += 1;
            while i < end && slice[i] != 10 && slice[i] != 13 {
                i += 1;
            }
            continue;
        }

        // 2. Matrix cell separators: '&'
        if ch == 38 { // '&'
            current_col += 1;
            seq_x = current_col * 16;
            let node_idx = *node_count;
            *node_count += 1;
            arena[node_idx] = CstNodeRecord {
                kind: NODE_PUNCTUATION,
                flags: 0,
                start: i as u32,
                end: (i + 1) as u32,
                role_id: 14, // spacing / uncolored
                priority: 10,
                child_start: NO_INDEX,
                child_count: 0,
                prev_leaf: NO_INDEX,
                next_leaf: NO_INDEX,
                compound_partner: NO_INDEX,
                w: 0,
                z: active_z,
                y: active_y,
                x: seq_x,
                extra_data: ch,
                reserved: 0,
            };
            i += 1;
            continue;
        }

        // 3. LaTeX Commands and Macros: \cmd
        if ch == CHAR_BACKSLASH {
            let cmd_start = i;
            let mut cmd_end = i + 1;
            if cmd_end < end {
                if !is_ascii_alphabetic(slice[cmd_end]) {
                    cmd_end += 1;
                } else {
                    while cmd_end < end && is_ascii_alphabetic(slice[cmd_end]) {
                        cmd_end += 1;
                    }
                }
            }

            // Check Matrix row break: \\ or \cr or \newline
            if starts_with_ascii(slice, cmd_start, b"\\\\")
                || starts_with_ascii(slice, cmd_start, b"\\cr")
                || starts_with_ascii(slice, cmd_start, b"\\newline")
            {
                current_row += 1;
                current_col = 0;
                active_y = -current_row;
                seq_x = 0;

                let node_idx = *node_count;
                *node_count += 1;
                arena[node_idx] = CstNodeRecord {
                    kind: NODE_COMMAND,
                    flags: 0,
                    start: cmd_start as u32,
                    end: cmd_end as u32,
                    role_id: 14,
                    priority: 10,
                    child_start: NO_INDEX,
                    child_count: 0,
                    prev_leaf: NO_INDEX,
                    next_leaf: NO_INDEX,
                    compound_partner: NO_INDEX,
                    w: 0,
                    z: active_z,
                    y: active_y,
                    x: seq_x,
                    extra_data: 0,
                    reserved: 0,
                };
                i = cmd_end;
                continue;
            }

            // Check Fractions: \frac, \dfrac, \tfrac, \cfrac
            if starts_with_ascii(slice, cmd_start, b"\\frac")
                || starts_with_ascii(slice, cmd_start, b"\\dfrac")
                || starts_with_ascii(slice, cmd_start, b"\\tfrac")
                || starts_with_ascii(slice, cmd_start, b"\\cfrac")
            {
                *molecule_counter += 1;
                let frac_z = *molecule_counter;
                let node_idx = *node_count;
                *node_count += 1;

                let mut current_idx = cmd_end;
                current_idx = skip_whitespace_u16(slice, current_idx);

                // Parse Numerator
                let mut num_end = current_idx;
                let mut num_inner_start = current_idx;
                let mut num_inner_end = current_idx;
                if current_idx < end && slice[current_idx] == CHAR_LBRACE {
                    let mut depth = 1;
                    num_inner_start = current_idx + 1;
                    current_idx += 1;
                    while current_idx < end && depth > 0 {
                        if slice[current_idx] == CHAR_BACKSLASH && current_idx + 1 < end {
                            current_idx += 2;
                            continue;
                        }
                        if slice[current_idx] == CHAR_LBRACE {
                            depth += 1;
                        } else if slice[current_idx] == CHAR_RBRACE {
                            depth -= 1;
                        }
                        current_idx += 1;
                    }
                    num_end = current_idx;
                    num_inner_end = if depth == 0 { current_idx - 1 } else { current_idx };
                } else if current_idx < end {
                    num_end = current_idx + 1;
                    num_inner_end = num_end;
                }

                current_idx = skip_whitespace_u16(slice, current_idx);

                // Parse Denominator
                let mut den_end = current_idx;
                let mut den_inner_start = current_idx;
                let mut den_inner_end = current_idx;
                if current_idx < end && slice[current_idx] == CHAR_LBRACE {
                    let mut depth = 1;
                    den_inner_start = current_idx + 1;
                    current_idx += 1;
                    while current_idx < end && depth > 0 {
                        if slice[current_idx] == CHAR_BACKSLASH && current_idx + 1 < end {
                            current_idx += 2;
                            continue;
                        }
                        if slice[current_idx] == CHAR_LBRACE {
                            depth += 1;
                        } else if slice[current_idx] == CHAR_RBRACE {
                            depth -= 1;
                        }
                        current_idx += 1;
                    }
                    den_end = current_idx;
                    den_inner_end = if depth == 0 { current_idx - 1 } else { current_idx };
                } else if current_idx < end {
                    den_end = current_idx + 1;
                    den_inner_end = den_end;
                }

                let fraction_end = den_end.max(num_end).max(cmd_end);
                let first_child = *node_count;

                // Recurse into numerator: y = 1, x = 0
                if num_inner_start < num_inner_end {
                    parse_slot_to_arena(
                        slice,
                        num_inner_start,
                        num_inner_end,
                        arena,
                        node_count,
                        molecule_counter,
                        active_domains,
                        active_dialects,
                        frac_z,
                        1, // y = +1 (numerator)
                        0,
                    );
                }

                // Recurse into denominator: y = -1, x = 0
                if den_inner_start < den_inner_end {
                    parse_slot_to_arena(
                        slice,
                        den_inner_start,
                        den_inner_end,
                        arena,
                        node_count,
                        molecule_counter,
                        active_domains,
                        active_dialects,
                        frac_z,
                        -1, // y = -1 (denominator)
                        0,
                    );
                }

                let total_children = (*node_count - first_child) as u32;

                arena[node_idx] = CstNodeRecord {
                    kind: NODE_FRACTION,
                    flags: 0,
                    start: cmd_start as u32,
                    end: fraction_end as u32,
                    role_id: 7, // structural
                    priority: 40,
                    child_start: if total_children > 0 { first_child as u32 } else { NO_INDEX },
                    child_count: total_children,
                    prev_leaf: NO_INDEX,
                    next_leaf: NO_INDEX,
                    compound_partner: NO_INDEX,
                    w: 4, // enclosure
                    z: frac_z,
                    y: active_y,
                    x: seq_x,
                    extra_data: 0,
                    reserved: 0,
                };

                seq_x += 1;
                i = fraction_end;
                continue;
            }

            // Check UnderOver: \underbrace, \overbrace, \underbracket, \overbracket, \underset, \overset
            if starts_with_ascii(slice, cmd_start, b"\\underbrace")
                || starts_with_ascii(slice, cmd_start, b"\\overbrace")
                || starts_with_ascii(slice, cmd_start, b"\\underbracket")
                || starts_with_ascii(slice, cmd_start, b"\\overbracket")
                || starts_with_ascii(slice, cmd_start, b"\\underset")
                || starts_with_ascii(slice, cmd_start, b"\\overset")
            {
                *molecule_counter += 1;
                let uo_z = *molecule_counter;
                let node_idx = *node_count;
                *node_count += 1;

                let is_under = starts_with_ascii(slice, cmd_start, b"\\underbrace")
                    || starts_with_ascii(slice, cmd_start, b"\\underbracket")
                    || starts_with_ascii(slice, cmd_start, b"\\underset");

                let mut current_idx = cmd_end;
                current_idx = skip_whitespace_u16(slice, current_idx);
                let mut base_end = current_idx;
                let mut base_inner_start = current_idx;
                let mut base_inner_end = current_idx;

                if current_idx < end && slice[current_idx] == CHAR_LBRACE {
                    let mut depth = 1;
                    base_inner_start = current_idx + 1;
                    current_idx += 1;
                    while current_idx < end && depth > 0 {
                        if slice[current_idx] == CHAR_BACKSLASH && current_idx + 1 < end {
                            current_idx += 2;
                            continue;
                        }
                        if slice[current_idx] == CHAR_LBRACE {
                            depth += 1;
                        } else if slice[current_idx] == CHAR_RBRACE {
                            depth -= 1;
                        }
                        current_idx += 1;
                    }
                    base_end = current_idx;
                    base_inner_end = if depth == 0 { current_idx - 1 } else { current_idx };
                }

                let first_child = *node_count;
                if base_inner_start < base_inner_end {
                    parse_slot_to_arena(
                        slice,
                        base_inner_start,
                        base_inner_end,
                        arena,
                        node_count,
                        molecule_counter,
                        active_domains,
                        active_dialects,
                        uo_z,
                        0, // base y = 0
                        0,
                    );
                }

                let total_children = (*node_count - first_child) as u32;

                arena[node_idx] = CstNodeRecord {
                    kind: NODE_UNDEROVER,
                    flags: FLAG_UNDEROVER,
                    start: cmd_start as u32,
                    end: base_end as u32,
                    role_id: 1, // operator
                    priority: 30,
                    child_start: if total_children > 0 { first_child as u32 } else { NO_INDEX },
                    child_count: total_children,
                    prev_leaf: NO_INDEX,
                    next_leaf: NO_INDEX,
                    compound_partner: NO_INDEX,
                    w: 3, // molecule
                    z: uo_z,
                    y: active_y,
                    x: seq_x,
                    extra_data: if is_under { 0 } else { 1 },
                    reserved: 0,
                };

                seq_x += 1;
                i = base_end;
                continue;
            }

            // Check Text Macros: \text, \mathrm, \textbf, \textit, \texttt
            if starts_with_ascii(slice, cmd_start, b"\\text")
                || starts_with_ascii(slice, cmd_start, b"\\mathrm")
                || starts_with_ascii(slice, cmd_start, b"\\textbf")
                || starts_with_ascii(slice, cmd_start, b"\\textit")
            {
                let node_idx = *node_count;
                *node_count += 1;

                let mut current_idx = cmd_end;
                current_idx = skip_whitespace_u16(slice, current_idx);
                let mut text_end = current_idx;

                if current_idx < end && slice[current_idx] == CHAR_LBRACE {
                    let mut depth = 1;
                    current_idx += 1;
                    while current_idx < end && depth > 0 {
                        if slice[current_idx] == CHAR_BACKSLASH && current_idx + 1 < end {
                            current_idx += 2;
                            continue;
                        }
                        if slice[current_idx] == CHAR_LBRACE {
                            depth += 1;
                        } else if slice[current_idx] == CHAR_RBRACE {
                            depth -= 1;
                        }
                        current_idx += 1;
                    }
                    text_end = current_idx;
                }

                arena[node_idx] = CstNodeRecord {
                    kind: NODE_TEXT,
                    flags: 0,
                    start: cmd_start as u32,
                    end: text_end as u32,
                    role_id: 14, // spacing / uncolored text
                    priority: 10,
                    child_start: NO_INDEX,
                    child_count: 0,
                    prev_leaf: NO_INDEX,
                    next_leaf: NO_INDEX,
                    compound_partner: NO_INDEX,
                    w: 1, // atom
                    z: active_z,
                    y: active_y,
                    x: seq_x,
                    extra_data: 0,
                    reserved: 0,
                };

                seq_x += 1;
                i = text_end;
                continue;
            }

            // General Macro: Lookup in Lemire MPHF catalog
            let packed = lookup_catalog_packed_utf16(&slice[cmd_start..cmd_end], active_domains, active_dialects);
            let (role_id, priority) = if packed != 0xFFFFFFFF {
                ((packed & 0xF) as u16, ((packed >> 4) & 0x7F) as u16)
            } else {
                (2, 30) // default relation
            };

            let node_idx = *node_count;
            *node_count += 1;
            arena[node_idx] = CstNodeRecord {
                kind: NODE_COMMAND,
                flags: 0,
                start: cmd_start as u32,
                end: cmd_end as u32,
                role_id,
                priority,
                child_start: NO_INDEX,
                child_count: 0,
                prev_leaf: NO_INDEX,
                next_leaf: NO_INDEX,
                compound_partner: NO_INDEX,
                w: 1, // atom
                z: active_z,
                y: active_y,
                x: seq_x,
                extra_data: 0,
                reserved: 0,
            };

            seq_x += 1;
            i = cmd_end;
            continue;
        }

        // 4. Subscripts and Superscripts: _ and ^
        if ch == CHAR_UNDERSCORE || ch == CHAR_CARET {
            let script_kind = if ch == CHAR_UNDERSCORE { 16u16 } else { 17u16 };
            let script_y: i16 = if ch == CHAR_UNDERSCORE { -1 } else { 1 };
            *molecule_counter += 1;
            let script_z = *molecule_counter;

            let node_idx = *node_count;
            *node_count += 1;

            let mut arg_start = i + 1;
            arg_start = skip_whitespace_u16(slice, arg_start);

            let mut arg_end = arg_start;
            let mut arg_inner_start = arg_start;
            let mut arg_inner_end = arg_start;

            if arg_start < end {
                if slice[arg_start] == CHAR_LBRACE {
                    let mut depth = 1;
                    arg_inner_start = arg_start + 1;
                    arg_end = arg_start + 1;
                    while arg_end < end && depth > 0 {
                        if slice[arg_end] == CHAR_BACKSLASH && arg_end + 1 < end {
                            arg_end += 2;
                            continue;
                        }
                        if slice[arg_end] == CHAR_LBRACE {
                            depth += 1;
                        } else if slice[arg_end] == CHAR_RBRACE {
                            depth -= 1;
                        }
                        arg_end += 1;
                    }
                    arg_inner_end = if depth == 0 { arg_end - 1 } else { arg_end };
                } else if slice[arg_start] == CHAR_BACKSLASH {
                    arg_end = arg_start + 1;
                    while arg_end < end && is_ascii_alphabetic(slice[arg_end]) {
                        arg_end += 1;
                    }
                    arg_inner_end = arg_end;
                } else {
                    arg_end = arg_start + 1;
                    arg_inner_end = arg_end;
                }
            }

            let first_child = *node_count;
            if arg_inner_start < arg_inner_end {
                parse_slot_to_arena(
                    slice,
                    arg_inner_start,
                    arg_inner_end,
                    arena,
                    node_count,
                    molecule_counter,
                    active_domains,
                    active_dialects,
                    script_z,
                    script_y,
                    0,
                );
            }
            let total_children = (*node_count - first_child) as u32;

            arena[node_idx] = CstNodeRecord {
                kind: NODE_SCRIPT,
                flags: 0,
                start: i as u32,
                end: arg_end as u32,
                role_id: script_kind,
                priority: 10,
                child_start: if total_children > 0 { first_child as u32 } else { NO_INDEX },
                child_count: total_children,
                prev_leaf: NO_INDEX,
                next_leaf: NO_INDEX,
                compound_partner: NO_INDEX,
                w: 2, // slot
                z: script_z,
                y: script_y,
                x: seq_x,
                extra_data: script_kind,
                reserved: 0,
            };

            seq_x += 1;
            i = arg_end;
            continue;
        }

        // 5. Groups and Delimiters: (...), [...], {...}
        if ch == CHAR_LPAREN || ch == CHAR_LBRACKET || ch == CHAR_LBRACE {
            let close_ch = if ch == CHAR_LPAREN {
                CHAR_RPAREN
            } else if ch == CHAR_LBRACKET {
                CHAR_RBRACKET
            } else {
                CHAR_RBRACE
            };

            let open_start = i;
            let mut depth = 1;
            let mut j = i + 1;
            while j < end && depth > 0 {
                if slice[j] == CHAR_BACKSLASH && j + 1 < end {
                    j += 2;
                    continue;
                }
                if slice[j] == ch {
                    depth += 1;
                } else if slice[j] == close_ch {
                    depth -= 1;
                }
                j += 1;
            }

            let group_end = j;
            let inner_start = open_start + 1;
            let inner_end = if depth == 0 { group_end - 1 } else { group_end };

            let is_bare_brace = ch == CHAR_LBRACE;
            let group_z = if !is_bare_brace {
                *molecule_counter += 1;
                *molecule_counter
            } else {
                active_z
            };

            let node_idx = *node_count;
            *node_count += 1;

            let first_child = *node_count;
            if inner_start < inner_end {
                parse_slot_to_arena(
                    slice,
                    inner_start,
                    inner_end,
                    arena,
                    node_count,
                    molecule_counter,
                    active_domains,
                    active_dialects,
                    group_z,
                    if !is_bare_brace { 0 } else { active_y },
                    0,
                );
            }
            let total_children = (*node_count - first_child) as u32;

            arena[node_idx] = CstNodeRecord {
                kind: NODE_GROUP,
                flags: if depth > 0 { FLAG_SYNTAX_ERROR } else { 0 },
                start: open_start as u32,
                end: group_end as u32,
                role_id: if is_bare_brace { 14 } else { 100 + (z % 6) as u16 },
                priority: 25,
                child_start: if total_children > 0 { first_child as u32 } else { NO_INDEX },
                child_count: total_children,
                prev_leaf: NO_INDEX,
                next_leaf: NO_INDEX,
                compound_partner: NO_INDEX,
                w: if is_bare_brace { 2 } else { 4 }, // slot vs enclosure
                z: group_z,
                y: active_y,
                x: seq_x,
                extra_data: ch,
                reserved: 0,
            };

            seq_x += 1;
            i = group_end;
            continue;
        }

        // 6. Binary Relations, Operators, Punctuation, Identifiers, Numbers
        match ch {
            61 | 60 | 62 => { // '=', '<', '>'
                let node_idx = *node_count;
                *node_count += 1;
                arena[node_idx] = CstNodeRecord {
                    kind: NODE_OPERATOR,
                    flags: 0,
                    start: i as u32,
                    end: (i + 1) as u32,
                    role_id: 2, // relation
                    priority: 30,
                    child_start: NO_INDEX,
                    child_count: 0,
                    prev_leaf: NO_INDEX,
                    next_leaf: NO_INDEX,
                    compound_partner: NO_INDEX,
                    w: 1, // atom
                    z: active_z,
                    y: active_y,
                    x: seq_x,
                    extra_data: ch,
                    reserved: 0,
                };
                seq_x += 1;
            }
            43 | 45 => { // '+', '-'
                let node_idx = *node_count;
                *node_count += 1;
                arena[node_idx] = CstNodeRecord {
                    kind: NODE_OPERATOR,
                    flags: 0,
                    start: i as u32,
                    end: (i + 1) as u32,
                    role_id: 1, // operator
                    priority: 30,
                    child_start: NO_INDEX,
                    child_count: 0,
                    prev_leaf: NO_INDEX,
                    next_leaf: NO_INDEX,
                    compound_partner: NO_INDEX,
                    w: 1, // atom
                    z: active_z,
                    y: active_y,
                    x: seq_x,
                    extra_data: ch,
                    reserved: 0,
                };
                seq_x += 1;
            }
            44 | 59 => { // ',', ';'
                let node_idx = *node_count;
                *node_count += 1;
                arena[node_idx] = CstNodeRecord {
                    kind: NODE_PUNCTUATION,
                    flags: 0,
                    start: i as u32,
                    end: (i + 1) as u32,
                    role_id: 14, // spacing
                    priority: 10,
                    child_start: NO_INDEX,
                    child_count: 0,
                    prev_leaf: NO_INDEX,
                    next_leaf: NO_INDEX,
                    compound_partner: NO_INDEX,
                    w: 0, // glyph
                    z: active_z,
                    y: active_y,
                    x: seq_x,
                    extra_data: ch,
                    reserved: 0,
                };
                seq_x += 1;
            }
            _ => {
                if is_ascii_digit(ch) {
                    let start_digit = i;
                    while i < end && (is_ascii_digit(slice[i]) || slice[i] == 46) {
                        i += 1;
                    }
                    let node_idx = *node_count;
                    *node_count += 1;
                    arena[node_idx] = CstNodeRecord {
                        kind: NODE_IDENTIFIER,
                        flags: 0,
                        start: start_digit as u32,
                        end: i as u32,
                        role_id: 9, // variable / uncolored
                        priority: 10,
                        child_start: NO_INDEX,
                        child_count: 0,
                        prev_leaf: NO_INDEX,
                        next_leaf: NO_INDEX,
                        compound_partner: NO_INDEX,
                        w: 1, // atom
                        z: active_z,
                        y: active_y,
                        x: seq_x,
                        extra_data: 0,
                        reserved: 0,
                    };
                    seq_x += 1;
                    continue;
                } else if is_ascii_alphabetic(ch) {
                    let start_alpha = i;
                    i += 1;
                    let node_idx = *node_count;
                    *node_count += 1;
                    arena[node_idx] = CstNodeRecord {
                        kind: NODE_IDENTIFIER,
                        flags: 0,
                        start: start_alpha as u32,
                        end: i as u32,
                        role_id: 9, // variable
                        priority: 10,
                        child_start: NO_INDEX,
                        child_count: 0,
                        prev_leaf: NO_INDEX,
                        next_leaf: NO_INDEX,
                        compound_partner: NO_INDEX,
                        w: 1, // atom
                        z: active_z,
                        y: active_y,
                        x: seq_x,
                        extra_data: 0,
                        reserved: 0,
                    };
                    seq_x += 1;
                    continue;
                }
            }
        }

        i += 1;
    }
}

/// Links adjacent leaves in the arena for O(1) cursor navigation and binds atomic differentials.
/// Strictly respects matrix cell walls (& and \\) and slot boundaries (Z, Y).
fn annotate_leaf_chain(slice: &[u16], arena: &mut [CstNodeRecord], count: usize) {
    let mut last_leaf_idx = NO_INDEX;

    for idx in 0..count {
        let kind = arena[idx].kind;
        let is_ampersand = kind == NODE_PUNCTUATION
            && arena[idx].start < slice.len() as u32
            && slice[arena[idx].start as usize] == 38;
        let is_newline_cmd = kind == NODE_COMMAND && {
            let s = arena[idx].start as usize;
            starts_with_ascii(slice, s, b"\\\\") || starts_with_ascii(slice, s, b"\\cr") || starts_with_ascii(slice, s, b"\\newline")
        };

        // Reset leaf chaining at matrix cell walls so navigation links NEVER cross cells
        if is_ampersand || is_newline_cmd {
            last_leaf_idx = NO_INDEX;
            continue;
        }

        let is_leaf = kind == NODE_IDENTIFIER
            || kind == NODE_OPERATOR
            || kind == NODE_PUNCTUATION
            || kind == NODE_COMMAND
            || kind == NODE_BOUNDARY
            || kind == NODE_TEXT;

        if is_leaf {
            if last_leaf_idx != NO_INDEX {
                let prev_z = arena[last_leaf_idx as usize].z;
                let prev_y = arena[last_leaf_idx as usize].y;
                if arena[idx].z == prev_z && arena[idx].y == prev_y {
                    arena[last_leaf_idx as usize].next_leaf = idx as u32;
                    arena[idx].prev_leaf = last_leaf_idx;
                } else {
                    last_leaf_idx = NO_INDEX;
                }
            }

            if last_leaf_idx == NO_INDEX {
                arena[idx].prev_leaf = NO_INDEX;
            }

            last_leaf_idx = idx as u32;

            // Check differential compounding: e.g. 'd' followed by 'x' within same slot
            let prev = arena[idx].prev_leaf;
            if prev != NO_INDEX {
                let p = prev as usize;
                if arena[p].kind == NODE_IDENTIFIER && (arena[p].end - arena[p].start == 1) {
                    let p_ch = slice[arena[p].start as usize];
                    if p_ch == 100 { // 'd'
                        if arena[idx].kind == NODE_IDENTIFIER {
                            arena[p].compound_partner = idx as u32;
                            arena[p].flags |= FLAG_DIFF_COMPOUND;
                            arena[idx].compound_partner = p as u32;
                            arena[idx].flags |= FLAG_DIFF_COMPOUND;
                        }
                    }
                }
            }
        }
    }
}

/// Emits flat 4-tuples [start, end, role_id, priority] into out_slice by walking the CST arena.
/// Returns the number of emitted tokens.
/// Strictly restricts styling to discrete leaf tokens and boundary delimiters;
/// never emits container-wide blanket spans (fractions, scripts, or groups) that would monocolor children.
pub fn collect_spans_from_arena(
    arena: &[CstNodeRecord],
    node_count: usize,
    out_slice: &mut [u32],
) -> usize {
    let max_tokens = out_slice.len() / 4;
    let mut token_count = 0;

    for idx in 0..node_count {
        if token_count >= max_tokens {
            break;
        }
        let node = &arena[idx];

        // 1. Structural containers NEVER emit container-wide spans over their children!
        if node.kind == NODE_FRACTION || node.kind == NODE_SCRIPT || node.kind == NODE_UNDEROVER {
            continue;
        }

        // 2. Delimiter Groups: only color the opening delimiter and closing delimiter!
        if node.kind == NODE_GROUP {
            // Bare braces { ... } are uncolored syntactic scoping in standard LaTeX mode
            let is_bare_brace = node.extra_data == 123; // '{'
            if !is_bare_brace && node.role_id >= 100 && node.end > node.start {
                // Open delimiter
                let out_idx = token_count * 4;
                out_slice[out_idx] = node.start;
                out_slice[out_idx + 1] = node.start + 1;
                out_slice[out_idx + 2] = node.role_id as u32;
                out_slice[out_idx + 3] = node.priority as u32;
                token_count += 1;

                // Close delimiter
                if (node.flags & FLAG_SYNTAX_ERROR) == 0 && node.end > node.start + 1 && token_count < max_tokens {
                    let out_idx2 = token_count * 4;
                    out_slice[out_idx2] = node.end - 1;
                    out_slice[out_idx2 + 1] = node.end;
                    out_slice[out_idx2 + 2] = node.role_id as u32;
                    out_slice[out_idx2 + 3] = node.priority as u32;
                    token_count += 1;
                }
            }
            continue;
        }

        // 3. Filter out uncolored structural spacing and plain variables
        if node.role_id != 14 && node.role_id != 9 {
            let out_idx = token_count * 4;
            out_slice[out_idx] = node.start;
            out_slice[out_idx + 1] = node.end;
            out_slice[out_idx + 2] = node.role_id as u32;
            out_slice[out_idx + 3] = node.priority as u32;
            token_count += 1;
        }
    }

    token_count
}

#[cfg(test)]
mod tests {
    use super::*;

    fn to_u16(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }

    #[test]
    fn test_parse_fraction_and_scripts() {
        let input = to_u16("\\frac{a}{b} + x_{i}^2");
        let mut arena = [CstNodeRecord::default(); 64];
        let count = parse_cst_to_arena(&input, &mut arena, 0xFFFFFFFF, 0xFFFFFFFF);

        assert!(count >= 3);
        let frac = arena.iter().take(count).find(|n| n.kind == NODE_FRACTION);
        assert!(frac.is_some());
        assert_eq!(frac.unwrap().start, 0);

        let script = arena.iter().take(count).find(|n| n.kind == NODE_SCRIPT);
        assert!(script.is_some());
    }

    #[test]
    fn test_leaf_chaining_and_differential_compounding() {
        let input = to_u16("dx + dy = 0");
        let mut arena = [CstNodeRecord::default(); 64];
        let count = parse_cst_to_arena(&input, &mut arena, 0xFFFFFFFF, 0xFFFFFFFF);

        assert!(count >= 5);
        // 'd' (idx 0) and 'x' (idx 1)
        assert_eq!(arena[0].next_leaf, 1);
        assert_eq!(arena[1].prev_leaf, 0);
        assert_eq!(arena[0].compound_partner, 1);
        assert_eq!(arena[1].compound_partner, 0);
        assert_ne!(arena[0].flags & FLAG_DIFF_COMPOUND, 0);
    }

    #[test]
    fn test_spatial_tensor_coordinates_4d() {
        let input = to_u16("\\frac{a}{b} = c");
        let mut arena = [CstNodeRecord::default(); 64];
        let count = parse_cst_to_arena(&input, &mut arena, 0xFFFFFFFF, 0xFFFFFFFF);

        assert!(count >= 4);
        let frac = arena[0];
        assert_eq!(frac.kind, NODE_FRACTION);
        assert_eq!(frac.w, 4); // enclosure
        assert_eq!(frac.z, 1); // isolation plane 1

        let num_a = arena[1];
        assert_eq!(num_a.kind, NODE_IDENTIFIER);
        assert_eq!(num_a.w, 1);
        assert_eq!(num_a.z, 1);
        assert_eq!(num_a.y, 1); // numerator elevation +1
        assert_eq!(num_a.x, 0);

        let den_b = arena[2];
        assert_eq!(den_b.kind, NODE_IDENTIFIER);
        assert_eq!(den_b.w, 1);
        assert_eq!(den_b.z, 1);
        assert_eq!(den_b.y, -1); // denominator elevation -1
        assert_eq!(den_b.x, 0);

        // Numerator 'a' and Denominator 'b' must NOT be linked across the slot boundary!
        assert_eq!(num_a.next_leaf, NO_INDEX);
        assert_eq!(den_b.prev_leaf, NO_INDEX);
    }

    #[test]
    fn test_matrix_cell_wall_leaf_partitioning() {
        let input = to_u16("a & b \\\\ c & d");
        let mut arena = [CstNodeRecord::default(); 64];
        let count = parse_cst_to_arena(&input, &mut arena, 0xFFFFFFFF, 0xFFFFFFFF);

        let a = arena.iter().take(count).find(|n| n.kind == NODE_IDENTIFIER && n.start == 0).unwrap();
        assert_eq!(a.y, 0);
        assert_eq!(a.x, 0);
        assert_eq!(a.next_leaf, NO_INDEX); // Never link across '&' cell wall!

        let b = arena.iter().take(count).find(|n| n.kind == NODE_IDENTIFIER && n.start == 4).unwrap();
        assert_eq!(b.y, 0);
        assert_eq!(b.x, 16);
        assert_eq!(b.prev_leaf, NO_INDEX); // Never link across '&' cell wall!
        assert_eq!(b.next_leaf, NO_INDEX); // Never link across '\\' row wall!

        let c = arena.iter().take(count).find(|n| n.kind == NODE_IDENTIFIER && n.start == 9).unwrap();
        assert_eq!(c.y, -1);
        assert_eq!(c.x, 0);
        assert_eq!(c.prev_leaf, NO_INDEX);

        let d = arena.iter().take(count).find(|n| n.kind == NODE_IDENTIFIER && n.start == 13).unwrap();
        assert_eq!(d.y, -1);
        assert_eq!(d.x, 16);
        assert_eq!(d.prev_leaf, NO_INDEX);
    }
}
