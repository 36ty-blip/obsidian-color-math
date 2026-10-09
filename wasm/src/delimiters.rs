// wasm/src/delimiters.rs

use std::collections::HashSet;

use crate::common::{
    skip_braced_group, skip_comment, skip_whitespace, starts_with,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DelimType {
    Paren,     // ( )
    Bracket,   // [ ]
    Brace,     // \{ \}
    BareBrace, // { }
    Angle,     // \langle \rangle
    Pipe,      // | \|
    Other,     // .
}

#[derive(Clone, Debug)]
pub struct DelimItem {
    pub delim_type: DelimType,
    pub start: u32,
    pub end: u32,
    pub is_left_right: bool,
}

#[derive(Clone, Debug)]
pub struct DelimPair {
    pub open: DelimItem,
    pub close: DelimItem,
    pub depth: u32,
}

pub fn has_top_level_comma(chars: &[char], start: usize, end: usize) -> bool {
    let mut paren_depth = 0;
    let mut bracket_depth = 0;
    let mut brace_depth = 0;
    let mut i = start;
    while i < end {
        let ch = chars[i];
        if ch == '%' {
            i = skip_comment(chars, i);
            continue;
        }
        if ch == '(' {
            paren_depth += 1;
        } else if ch == ')' {
            if paren_depth > 0 {
                paren_depth -= 1;
            }
        } else if ch == '[' {
            bracket_depth += 1;
        } else if ch == ']' {
            if bracket_depth > 0 {
                bracket_depth -= 1;
            }
        } else if ch == '{' || starts_with(chars, i, "\\{") {
            if starts_with(chars, i, "\\{") {
                i += 1;
            }
            brace_depth += 1;
        } else if ch == '}' || starts_with(chars, i, "\\}") {
            if starts_with(chars, i, "\\}") {
                i += 1;
            }
            if brace_depth > 0 {
                brace_depth -= 1;
            }
        } else if ch == ',' && paren_depth == 0 && bracket_depth == 0 && brace_depth == 0 {
            return true;
        }
        i += 1;
    }
    false
}

pub fn match_delimiter_token(chars: &[char], start: usize) -> Option<(&'static str, DelimType, usize)> {
    if starts_with(chars, start, "\\{") {
        return Some(("\\{", DelimType::Brace, 2));
    }
    if starts_with(chars, start, "\\}") {
        return Some(("\\}", DelimType::Brace, 2));
    }
    if starts_with(chars, start, "\\langle") {
        return Some(("\\langle", DelimType::Angle, 7));
    }
    if starts_with(chars, start, "\\rangle") {
        return Some(("\\rangle", DelimType::Angle, 7));
    }
    if starts_with(chars, start, "\\|") {
        return Some(("\\|", DelimType::Pipe, 2));
    }
    if start < chars.len() {
        match chars[start] {
            '(' | ')' => Some(("()", DelimType::Paren, 1)),
            '[' | ']' => Some(("[]", DelimType::Bracket, 1)),
            '{' | '}' => Some(("{}", DelimType::BareBrace, 1)),
            '|' => Some(("|", DelimType::Pipe, 1)),
            '.' => Some((".", DelimType::Other, 1)),
            _ => None,
        }
    } else {
        None
    }
}

/// Sized delimiter match helper for \bigl, \Bigl, \biggl, \Biggl and closing \bigr, \Bigr, etc.
pub fn match_sized_delim(chars: &[char], start: usize) -> Option<(bool, DelimType, usize)> {
    if !starts_with(chars, start, "\\") {
        return None;
    }
    let is_open = if starts_with(chars, start, "\\bigl")
        || starts_with(chars, start, "\\Bigl")
        || starts_with(chars, start, "\\biggl")
        || starts_with(chars, start, "\\Biggl")
    {
        true
    } else if starts_with(chars, start, "\\bigr")
        || starts_with(chars, start, "\\Bigr")
        || starts_with(chars, start, "\\biggr")
        || starts_with(chars, start, "\\Biggr")
    {
        false
    } else {
        return None;
    };

    let prefix_len = if starts_with(chars, start, "\\biggl")
        || starts_with(chars, start, "\\Biggl")
        || starts_with(chars, start, "\\biggr")
        || starts_with(chars, start, "\\Biggr")
    {
        6
    } else {
        5
    };

    let target_idx = start + prefix_len;
    if let Some((_, dtype, dlen)) = match_delimiter_token(chars, target_idx) {
        Some((is_open, dtype, prefix_len + dlen))
    } else {
        None
    }
}

/// High-performance delimiter scanner in Rust.
/// Returns balanced pairs and unmatched items.
pub fn scan_delimiters_full(
    chars: &[char],
    utf16: &[u32],
    include_bare_braces: bool,
) -> (Vec<DelimPair>, Vec<DelimItem>) {
    let mut pairs: Vec<DelimPair> = Vec::new();
    let mut unmatched: Vec<DelimItem> = Vec::new();
    let mut stack: Vec<(DelimItem, u32, usize)> = Vec::new(); // (item, depth, char_idx)
    let mut ignored_brackets: HashSet<usize> = HashSet::new();

    let n = chars.len();
    let mut i = 0;

    // Optional bracket commands to exempt from delimiter matching: e.g. \sqrt[3]{x}, \tag[1]
    let optional_cmds = [
        "\\sqrt", "\\\\", "\\tag", "\\xleftarrow", "\\xrightarrow", "\\rule",
        "\\makebox", "\\framebox", "\\parbox",
    ];

    while i < n {
        let ch = chars[i];

        // 1. Comments
        if ch == '%' {
            i = skip_comment(chars, i);
            continue;
        }

        // 2. Skip environment headers (\begin{...} and \end{...})
        if starts_with(chars, i, "\\begin") || starts_with(chars, i, "\\end") {
            let cmd_len = if starts_with(chars, i, "\\begin") { 6 } else { 4 };
            let mut cur = i + cmd_len;
            cur = skip_braced_group(chars, cur); // skip {env}
            cur = skip_braced_group(chars, cur); // skip optional second {cc|c} for array
            i = cur;
            continue;
        }

        // 3. Skip color command wrappers (\textcolor{...}{...} or \color{...})
        if starts_with(chars, i, "\\textcolor") {
            i += 10;
            i = skip_braced_group(chars, i); // skip color
            continue;
        }
        if starts_with(chars, i, "\\color") {
            i += 6;
            i = skip_braced_group(chars, i);
            continue;
        }

        // 4. \left / \right
        if starts_with(chars, i, "\\left") {
            let after_left = skip_whitespace(chars, i + 5);
            if let Some((_, dtype, dlen)) = match_delimiter_token(chars, after_left) {
                let delim_end = after_left + dlen;
                let depth = stack.len() as u32;
                let item = DelimItem {
                    delim_type: dtype,
                    start: utf16[i],
                    end: utf16[delim_end],
                    is_left_right: true,
                };
                stack.push((item, depth, i));
                i = delim_end;
                continue;
            }
        }

        if starts_with(chars, i, "\\right") {
            let after_right = skip_whitespace(chars, i + 6);
            if let Some((_, dtype, dlen)) = match_delimiter_token(chars, after_right) {
                let delim_end = after_right + dlen;
                let close_item = DelimItem {
                    delim_type: dtype,
                    start: utf16[i],
                    end: utf16[delim_end],
                    is_left_right: true,
                };

                // Find matching \left
                let mut match_idx = None;
                for (idx, (stk_item, _, _)) in stack.iter().enumerate().rev() {
                    if stk_item.is_left_right {
                        match_idx = Some(idx);
                        break;
                    }
                }

                if let Some(midx) = match_idx {
                    let (open_item, depth, _) = stack.remove(midx);
                    pairs.push(DelimPair {
                        open: open_item,
                        close: close_item,
                        depth,
                    });
                } else {
                    unmatched.push(close_item);
                }
                i = delim_end;
                continue;
            }
        }

        // 5. Sized Delimiters: \bigl, \Bigl, \biggr, \Biggl, etc.
        if let Some((is_open, dtype, full_len)) = match_sized_delim(chars, i) {
            let delim_end = i + full_len;
            if is_open {
                let depth = stack.len() as u32;
                let item = DelimItem {
                    delim_type: dtype,
                    start: utf16[i],
                    end: utf16[delim_end],
                    is_left_right: false,
                };
                stack.push((item, depth, i));
            } else {
                let close_item = DelimItem {
                    delim_type: dtype,
                    start: utf16[i],
                    end: utf16[delim_end],
                    is_left_right: false,
                };

                let mut match_idx = None;
                for (idx, (stk_item, _, _)) in stack.iter().enumerate().rev() {
                    if !stk_item.is_left_right && stk_item.delim_type == dtype {
                        match_idx = Some(idx);
                        break;
                    }
                }

                // Half-open interval fallback for sized delimiters: \bigl[ a, b \bigr) or \bigl( a, b \bigr]
                if match_idx.is_none() && (dtype == DelimType::Paren || dtype == DelimType::Bracket) {
                    let alt_type = if dtype == DelimType::Paren { DelimType::Bracket } else { DelimType::Paren };
                    for (idx, (stk_item, _, open_char_idx)) in stack.iter().enumerate().rev() {
                        if !stk_item.is_left_right && stk_item.delim_type == alt_type {
                            let open_end_char = open_char_idx + full_len;
                            if has_top_level_comma(chars, open_end_char, i) {
                                match_idx = Some(idx);
                                break;
                            }
                        }
                    }
                }

                if let Some(midx) = match_idx {
                    let (open_item, depth, _) = stack.remove(midx);
                    pairs.push(DelimPair {
                        open: open_item,
                        close: close_item,
                        depth,
                    });
                } else {
                    unmatched.push(close_item);
                }
            }
            i = delim_end;
            continue;
        }

        // 6. Escaped set braces \{ and \}
        if starts_with(chars, i, "\\{") {
            let depth = stack.len() as u32;
            let item = DelimItem {
                delim_type: DelimType::Brace,
                start: utf16[i],
                end: utf16[i + 2],
                is_left_right: false,
            };
            stack.push((item, depth, i));
            i += 2;
            continue;
        }

        if starts_with(chars, i, "\\}") {
            let close_item = DelimItem {
                delim_type: DelimType::Brace,
                start: utf16[i],
                end: utf16[i + 2],
                is_left_right: false,
            };
            let mut match_idx = None;
            for (idx, (stk_item, _, _)) in stack.iter().enumerate().rev() {
                if !stk_item.is_left_right && stk_item.delim_type == DelimType::Brace {
                    match_idx = Some(idx);
                    break;
                }
            }
            if let Some(midx) = match_idx {
                let (open_item, depth, _) = stack.remove(midx);
                pairs.push(DelimPair {
                    open: open_item,
                    close: close_item,
                    depth,
                });
            } else {
                unmatched.push(close_item);
            }
            i += 2;
            continue;
        }

        // 7. Angle brackets \langle and \rangle
        if starts_with(chars, i, "\\langle") {
            let depth = stack.len() as u32;
            let item = DelimItem {
                delim_type: DelimType::Angle,
                start: utf16[i],
                end: utf16[i + 7],
                is_left_right: false,
            };
            stack.push((item, depth, i));
            i += 7;
            continue;
        }

        if starts_with(chars, i, "\\rangle") {
            let close_item = DelimItem {
                delim_type: DelimType::Angle,
                start: utf16[i],
                end: utf16[i + 7],
                is_left_right: false,
            };
            let mut match_idx = None;
            for (idx, (stk_item, _, _)) in stack.iter().enumerate().rev() {
                if !stk_item.is_left_right && stk_item.delim_type == DelimType::Angle {
                    match_idx = Some(idx);
                    break;
                }
            }
            if let Some(midx) = match_idx {
                let (open_item, depth, _) = stack.remove(midx);
                pairs.push(DelimPair {
                    open: open_item,
                    close: close_item,
                    depth,
                });
            } else {
                unmatched.push(close_item);
            }
            i += 7;
            continue;
        }

        // 8. Standard parentheses ( and [
        if ch == '(' || (ch == '[' && !ignored_brackets.contains(&i)) {
            let dtype = if ch == '(' { DelimType::Paren } else { DelimType::Bracket };
            let depth = stack.len() as u32;
            let item = DelimItem {
                delim_type: dtype,
                start: utf16[i],
                end: utf16[i + 1],
                is_left_right: false,
            };
            stack.push((item, depth, i));
            i += 1;
            continue;
        }

        if ch == ')' || (ch == ']' && !ignored_brackets.contains(&i)) {
            let dtype = if ch == ')' { DelimType::Paren } else { DelimType::Bracket };
            let close_item = DelimItem {
                delim_type: dtype,
                start: utf16[i],
                end: utf16[i + 1],
                is_left_right: false,
            };

            let mut match_idx = None;
            for (idx, (stk_item, _, _)) in stack.iter().enumerate().rev() {
                if !stk_item.is_left_right && stk_item.delim_type == dtype {
                    match_idx = Some(idx);
                    break;
                }
            }

            // Half-open interval fallback: [a, b) or (a, b] containing top-level comma
            if match_idx.is_none() && (dtype == DelimType::Paren || dtype == DelimType::Bracket) {
                let alt_type = if dtype == DelimType::Paren { DelimType::Bracket } else { DelimType::Paren };
                for (idx, (stk_item, _, open_char_idx)) in stack.iter().enumerate().rev() {
                    if !stk_item.is_left_right && stk_item.delim_type == alt_type {
                        if has_top_level_comma(chars, open_char_idx + 1, i) {
                            match_idx = Some(idx);
                            break;
                        }
                    }
                }
            }

            if let Some(midx) = match_idx {
                let (open_item, depth, _) = stack.remove(midx);
                pairs.push(DelimPair {
                    open: open_item,
                    close: close_item,
                    depth,
                });
            } else {
                unmatched.push(close_item);
            }
            i += 1;
            continue;
        }

        // 9. Bare grouping braces { and }
        if include_bare_braces && ch == '{' {
            let depth = stack.len() as u32;
            let item = DelimItem {
                delim_type: DelimType::BareBrace,
                start: utf16[i],
                end: utf16[i + 1],
                is_left_right: false,
            };
            stack.push((item, depth, i));
            i += 1;
            continue;
        }

        if include_bare_braces && ch == '}' {
            let close_item = DelimItem {
                delim_type: DelimType::BareBrace,
                start: utf16[i],
                end: utf16[i + 1],
                is_left_right: false,
            };
            let mut match_idx = None;
            for (idx, (stk_item, _, _)) in stack.iter().enumerate().rev() {
                if !stk_item.is_left_right && stk_item.delim_type == DelimType::BareBrace {
                    match_idx = Some(idx);
                    break;
                }
            }
            if let Some(midx) = match_idx {
                let (open_item, depth, _) = stack.remove(midx);
                pairs.push(DelimPair {
                    open: open_item,
                    close: close_item,
                    depth,
                });
            } else {
                unmatched.push(close_item);
            }
            i += 1;
            continue;
        }

        // 10. Optional bracket command exemptions: \sqrt[3]{x}, \tag[1]
        if ch == '\\' {
            for cmd in &optional_cmds {
                if starts_with(chars, i, cmd) {
                    let cmd_len = cmd.chars().count();
                    let cur = skip_whitespace(chars, i + cmd_len);
                    if cur < n && chars[cur] == '[' {
                        let mut depth = 1;
                        let mut j = cur + 1;
                        while j < n && depth > 0 {
                            if chars[j] == '[' {
                                depth += 1;
                            } else if chars[j] == ']' {
                                depth -= 1;
                            }
                            j += 1;
                        }
                        if depth == 0 {
                            ignored_brackets.insert(cur);
                            ignored_brackets.insert(j - 1);
                        }
                    }
                    break;
                }
            }
        }

        i += 1;
    }

    // Any remaining items left on stack were never closed!
    for (remaining, _, _) in stack {
        unmatched.push(remaining);
    }

    (pairs, unmatched)
}

