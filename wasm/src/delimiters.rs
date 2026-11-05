// wasm/src/delimiters.rs
//! High-Performance Rainbow Delimiter Scanner & Interval Disambiguation Engine
//! Scans math text directly from UTF-16 linear memory, emitting flat u32 binary spans.

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DelimType {
    Paren = 0,     // ( )
    Bracket = 1,   // [ ]
    Brace = 2,     // \{ \}
    BareBrace = 3, // { }
    Angle = 4,     // \langle \rangle
    Pipe = 5,      // | \|
    Other = 6,     // .
    Quote = 7,     // "
    BareLeft = 8,
    BareRight = 9,
}

impl DelimType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DelimType::Paren => "paren",
            DelimType::Bracket => "bracket",
            DelimType::Brace => "brace",
            DelimType::BareBrace => "bare_brace",
            DelimType::Angle => "angle",
            DelimType::Pipe => "pipe",
            DelimType::Other => "other",
            DelimType::Quote => "quote",
            DelimType::BareLeft => "bare_left",
            DelimType::BareRight => "bare_right",
        }
    }

    pub fn from_id(id: u32) -> Self {
        match id {
            0 => DelimType::Paren,
            1 => DelimType::Bracket,
            2 => DelimType::Brace,
            3 => DelimType::BareBrace,
            4 => DelimType::Angle,
            5 => DelimType::Pipe,
            6 => DelimType::Other,
            7 => DelimType::Quote,
            8 => DelimType::BareLeft,
            _ => DelimType::BareRight,
        }
    }
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

#[inline(always)]
pub fn starts_with_u16(slice: &[u16], start: usize, pattern: &str) -> bool {
    let p_bytes = pattern.as_bytes();
    if start + p_bytes.len() > slice.len() {
        return false;
    }
    for (k, &b) in p_bytes.iter().enumerate() {
        if slice[start + k] != b as u16 {
            return false;
        }
    }
    true
}

#[inline(always)]
pub fn is_ascii_alpha(c: u16) -> bool {
    (c >= b'a' as u16 && c <= b'z' as u16) || (c >= b'A' as u16 && c <= b'Z' as u16)
}

#[inline(always)]
pub fn is_whitespace(c: u16) -> bool {
    c == b' ' as u16 || c == b'\t' as u16 || c == b'\r' as u16 || c == b'\n' as u16
}

#[inline(always)]
pub fn skip_whitespace(slice: &[u16], mut start: usize) -> usize {
    while start < slice.len() && is_whitespace(slice[start]) {
        start += 1;
    }
    start
}

#[inline(always)]
pub fn skip_comment(slice: &[u16], mut start: usize) -> usize {
    start += 1;
    while start < slice.len() && slice[start] != b'\r' as u16 && slice[start] != b'\n' as u16 {
        start += 1;
    }
    if start < slice.len() && slice[start] == b'\r' as u16 && start + 1 < slice.len() && slice[start + 1] == b'\n' as u16 {
        return start + 2;
    }
    if start < slice.len() {
        return start + 1;
    }
    start
}

#[inline(always)]
pub fn skip_braced_group(slice: &[u16], start: usize) -> usize {
    let mut cur = skip_whitespace(slice, start);
    if cur >= slice.len() || slice[cur] != b'{' as u16 {
        return cur;
    }
    cur += 1;
    let mut depth = 1;
    while cur < slice.len() && depth > 0 {
        if slice[cur] == b'\\' as u16 {
            cur += 2;
            continue;
        }
        if slice[cur] == b'{' as u16 {
            depth += 1;
        } else if slice[cur] == b'}' as u16 {
            depth -= 1;
        }
        cur += 1;
    }
    cur
}

/// Checks if a substring contains a top-level comma (depth 0 of any nested brackets/braces),
/// used to identify valid mathematical intervals like [a, b) and (a, b].
pub fn has_top_level_comma(slice: &[u16], start: usize, end: usize) -> bool {
    let mut paren_depth = 0;
    let mut bracket_depth = 0;
    let mut brace_depth = 0;
    let mut i = start;
    let limit = end.min(slice.len());
    while i < limit {
        let ch = slice[i];
        if ch == b'%' as u16 {
            i = skip_comment(slice, i);
            continue;
        }
        if ch == b'(' as u16 {
            paren_depth += 1;
        } else if ch == b')' as u16 {
            if paren_depth > 0 {
                paren_depth -= 1;
            }
        } else if ch == b'[' as u16 {
            bracket_depth += 1;
        } else if ch == b']' as u16 {
            if bracket_depth > 0 {
                bracket_depth -= 1;
            }
        } else if ch == b'{' as u16 || starts_with_u16(slice, i, "\\{") {
            if starts_with_u16(slice, i, "\\{") {
                i += 1;
            }
            brace_depth += 1;
        } else if ch == b'}' as u16 || starts_with_u16(slice, i, "\\}") {
            if starts_with_u16(slice, i, "\\}") {
                i += 1;
            }
            if brace_depth > 0 {
                brace_depth -= 1;
            }
        } else if ch == b',' as u16 && paren_depth == 0 && bracket_depth == 0 && brace_depth == 0 {
            return true;
        }
        i += 1;
    }
    false
}

/// Matches extensible delimiters following \left, \right, or \middle
pub fn match_extensible_delim(slice: &[u16], start: usize) -> Option<(DelimType, usize)> {
    if start >= slice.len() {
        return None;
    }
    // Check single characters
    let ch = slice[start];
    if ch < 128 {
        match ch as u8 {
            b'(' | b')' => return Some((DelimType::Paren, 1)),
            b'[' | b']' => return Some((DelimType::Bracket, 1)),
            b'|' => return Some((DelimType::Pipe, 1)),
            b'.' | b'/' => return Some((DelimType::Other, 1)),
            _ => {}
        }
    }

    // Check Unicode single code-point delimiters
    match ch {
        0x27E6 | 0x27E7 | 0x2308 | 0x2309 | 0x230A | 0x230B => return Some((DelimType::Bracket, 1)), // ⟦ ⟧ ⌈ ⌉ ⌊ ⌋
        0x27E8 | 0x27E9 | 0x27EA | 0x27EB => return Some((DelimType::Angle, 1)),                       // ⟨ ⟩ ⟪ ⟫
        0x2983 | 0x2984 | 0x23B0 | 0x23B1 => return Some((DelimType::Brace, 1)),                       // ⦃ ⦄ ⎰ ⎱
        0x2016 => return Some((DelimType::Pipe, 1)),                                                   // ‖
        _ => {}
    }

    // Check backslash commands
    if ch == b'\\' as u16 {
        if starts_with_u16(slice, start, "\\{") || starts_with_u16(slice, start, "\\}") {
            return Some((DelimType::Brace, 2));
        }
        if starts_with_u16(slice, start, "\\|") {
            return Some((DelimType::Pipe, 2));
        }
        if starts_with_u16(slice, start, "\\backslash") {
            return Some((DelimType::Other, 10));
        }
        if starts_with_u16(slice, start, "\\langle") || starts_with_u16(slice, start, "\\rangle") {
            return Some((DelimType::Angle, 7));
        }
        if starts_with_u16(slice, start, "\\vert") || starts_with_u16(slice, start, "\\Vert") {
            return Some((DelimType::Pipe, 5));
        }
        if starts_with_u16(slice, start, "\\lvert")
            || starts_with_u16(slice, start, "\\rvert")
            || starts_with_u16(slice, start, "\\lVert")
            || starts_with_u16(slice, start, "\\rVert")
        {
            return Some((DelimType::Pipe, 6));
        }
        if starts_with_u16(slice, start, "\\lceil")
            || starts_with_u16(slice, start, "\\rceil")
            || starts_with_u16(slice, start, "\\lfloor")
            || starts_with_u16(slice, start, "\\rfloor")
        {
            return Some((DelimType::Bracket, 7));
        }
    }
    None
}

/// Matches sized delimiter prefixes: \big, \bigl, \bigr, \bigm, \Big, \Bigl, \Bigr, \Bigm, etc.
pub fn match_sized_delim(slice: &[u16], start: usize) -> Option<(bool, bool, bool, DelimType, usize)> {
    if !starts_with_u16(slice, start, "\\") {
        return None;
    }
    let (prefix_len, is_l, is_r, is_m) = if starts_with_u16(slice, start, "\\Biggl")
        || starts_with_u16(slice, start, "\\biggl")
    {
        (6, true, false, false)
    } else if starts_with_u16(slice, start, "\\Biggr") || starts_with_u16(slice, start, "\\biggr") {
        (6, false, true, false)
    } else if starts_with_u16(slice, start, "\\Biggm") || starts_with_u16(slice, start, "\\biggm") {
        (6, false, false, true)
    } else if starts_with_u16(slice, start, "\\Bigg") || starts_with_u16(slice, start, "\\bigg") {
        (5, false, false, false)
    } else if starts_with_u16(slice, start, "\\Bigl") || starts_with_u16(slice, start, "\\bigl") {
        (5, true, false, false)
    } else if starts_with_u16(slice, start, "\\Bigr") || starts_with_u16(slice, start, "\\bigr") {
        (5, false, true, false)
    } else if starts_with_u16(slice, start, "\\Bigm") || starts_with_u16(slice, start, "\\bigm") {
        (5, false, false, true)
    } else if starts_with_u16(slice, start, "\\Big") || starts_with_u16(slice, start, "\\big") {
        (4, false, false, false)
    } else {
        return None;
    };

    let target_idx = start + prefix_len;
    if let Some((dtype, dlen)) = match_extensible_delim(slice, target_idx) {
        Some((is_l, is_r, is_m, dtype, prefix_len + dlen))
    } else {
        None
    }
}

/// High-performance zero-allocation delimiter scanner.
/// Reads from UTF-16 slice, writes raw u32 integers into out_buf.
/// Returns packed u32: (pairs_count << 16) | unmatched_count.
pub fn scan_delimiters_u16(
    text: &[u16],
    out_buf: &mut [u32],
    include_bare_braces: bool,
    _highlight_unmatched: bool,
) -> u32 {
    let mut pairs: Vec<DelimPair> = Vec::with_capacity(64);
    let mut unmatched: Vec<DelimItem> = Vec::with_capacity(16);
    let mut stack: Vec<(DelimItem, u32)> = Vec::with_capacity(32);

    let n = text.len();
    let mut index = 0;

    let mut ignored_brackets: std::collections::HashSet<usize> = std::collections::HashSet::new();

    while index < n {
        let ch = text[index];

        // 1. Comments
        if ch == b'%' as u16 {
            index = skip_comment(text, index);
            continue;
        }

        // = resets unclosed bare pipes |
        if ch == b'=' as u16 {
            while let Some((stk, _)) = stack.last() {
                if stk.delim_type == DelimType::Pipe {
                    unmatched.push(stack.pop().unwrap().0);
                } else {
                    break;
                }
            }
        }

        // Skip optional bracket commands e.g. \sqrt[3]{x}, \tag[1]
        if ch == b'\\' as u16 {
            const OPT_CMDS: &[&str] = &[
                "\\sqrt", "\\\\", "\\tag", "\\xleftarrow", "\\xrightarrow",
                "\\rule", "\\makebox", "\\framebox", "\\parbox",
            ];
            let mut matched_opt = false;
            for &cmd in OPT_CMDS {
                if starts_with_u16(text, index, cmd) {
                    let next = index + cmd.len();
                    if next == n || !is_ascii_alpha(text[next]) {
                        index += cmd.len();
                        let cur = skip_whitespace(text, index);
                        if cur < n && text[cur] == b'[' as u16 {
                            let mut depth = 1;
                            let mut j = cur + 1;
                            while j < n && depth > 0 {
                                if text[j] == b'[' as u16 { depth += 1; }
                                else if text[j] == b']' as u16 { depth -= 1; }
                                j += 1;
                            }
                            if depth == 0 {
                                ignored_brackets.insert(cur);
                                ignored_brackets.insert(j - 1);
                            }
                        }
                        matched_opt = true;
                        break;
                    }
                }
            }
            if matched_opt {
                continue;
            }
        }

        // 2. Skip environment headers (\begin{...} and \end{...})
        if starts_with_u16(text, index, "\\begin") || starts_with_u16(text, index, "\\end") {
            let cmd_len = if starts_with_u16(text, index, "\\begin") { 6 } else { 4 };
            let mut cur = index + cmd_len;
            cur = skip_braced_group(text, cur); // skip {env}
            cur = skip_braced_group(text, cur); // skip optional second {cc|c} for array
            index = cur;
            continue;
        }

        // 3. Skip color commands (\textcolor{...}{...} or \color{...})
        if starts_with_u16(text, index, "\\textcolor") {
            index += 10;
            index = skip_braced_group(text, index); // skip color param
            continue;
        }
        if starts_with_u16(text, index, "\\color") {
            index += 6;
            index = skip_braced_group(text, index);
            continue;
        }

        // 4. Skip opaque text commands (\text{...}, \mbox{...})
        if starts_with_u16(text, index, "\\text") || starts_with_u16(text, index, "\\mbox") {
            let cmd_len = if starts_with_u16(text, index, "\\text") { 5 } else { 5 };
            index = skip_braced_group(text, index + cmd_len);
            continue;
        }

        // 5. \left / \right / \middle
        if starts_with_u16(text, index, "\\left")
            && (index + 5 == n || !is_ascii_alpha(text[index + 5]))
        {
            let after_left = skip_whitespace(text, index + 5);
            if let Some((dtype, dlen)) = match_extensible_delim(text, after_left) {
                let delim_end = after_left + dlen;
                let depth = stack.len() as u32;
                stack.push((
                    DelimItem {
                        delim_type: dtype,
                        start: index as u32,
                        end: delim_end as u32,
                        is_left_right: true,
                    },
                    depth,
                ));
                index = delim_end;
                continue;
            } else {
                let depth = stack.len() as u32;
                stack.push((
                    DelimItem {
                        delim_type: DelimType::BareLeft,
                        start: index as u32,
                        end: (index + 5) as u32,
                        is_left_right: true,
                    },
                    depth,
                ));
                index += 5;
                continue;
            }
        }

        if starts_with_u16(text, index, "\\right")
            && (index + 6 == n || !is_ascii_alpha(text[index + 6]))
        {
            let after_right = skip_whitespace(text, index + 6);
            if let Some((dtype, dlen)) = match_extensible_delim(text, after_right) {
                let delim_end = after_right + dlen;

                // Match right against open \left
                let mut match_idx = None;
                for (idx, (stk_item, _)) in stack.iter().enumerate().rev() {
                    if stk_item.is_left_right {
                        match_idx = Some(idx);
                        break;
                    }
                }

                if let Some(midx) = match_idx {
                    let (open_item, depth) = stack.remove(midx);
                    pairs.push(DelimPair {
                        open: open_item,
                        close: DelimItem {
                            delim_type: dtype,
                            start: index as u32,
                            end: delim_end as u32,
                            is_left_right: true,
                        },
                        depth,
                    });
                } else {
                    unmatched.push(DelimItem {
                        delim_type: dtype,
                        start: index as u32,
                        end: delim_end as u32,
                        is_left_right: true,
                    });
                }
                index = delim_end;
                continue;
            } else {
                unmatched.push(DelimItem {
                    delim_type: DelimType::BareRight,
                    start: index as u32,
                    end: (index + 6) as u32,
                    is_left_right: true,
                });
                index += 6;
                continue;
            }
        }

        if starts_with_u16(text, index, "\\middle")
            && (index + 7 == n || !is_ascii_alpha(text[index + 7]))
        {
            let after_middle = skip_whitespace(text, index + 7);
            if let Some((_, dlen)) = match_extensible_delim(text, after_middle) {
                index = after_middle + dlen;
                continue;
            }
        }

        // 6. Sized Delimiters: \bigl, \Bigl, \biggr, etc.
        if let Some((is_l, is_r, is_m, dtype, full_len)) = match_sized_delim(text, index) {
            let delim_end = index + full_len;
            let is_explicit_open = is_l;
            let is_explicit_close = is_r;
            let is_pipe = dtype == DelimType::Pipe || is_m;

            if !is_pipe {
                let is_open_delim = !is_explicit_close && (is_explicit_open || dtype == DelimType::Paren || dtype == DelimType::Bracket || dtype == DelimType::Angle || dtype == DelimType::Brace);
                let is_close_delim = !is_explicit_open && (is_explicit_close || dtype == DelimType::Paren || dtype == DelimType::Bracket || dtype == DelimType::Angle || dtype == DelimType::Brace);

                if is_open_delim && !is_explicit_close {
                    let depth = stack.len() as u32;
                    stack.push((
                        DelimItem {
                            delim_type: dtype,
                            start: index as u32,
                            end: delim_end as u32,
                            is_left_right: false,
                        },
                        depth,
                    ));
                    index += full_len;
                    continue;
                }

                if is_close_delim {
                    let mut match_idx = None;
                    for (idx, (stk, _)) in stack.iter().enumerate().rev() {
                        if !stk.is_left_right && stk.delim_type == dtype {
                            match_idx = Some(idx);
                            break;
                        }
                    }

                    // Half-open interval fallback: \bigl[ a, b \bigr) or \bigl( a, b \bigr]
                    if match_idx.is_none() && (dtype == DelimType::Paren || dtype == DelimType::Bracket) {
                        let alt = if dtype == DelimType::Paren { DelimType::Bracket } else { DelimType::Paren };
                        for (idx, (stk, _)) in stack.iter().enumerate().rev() {
                            if !stk.is_left_right && stk.delim_type == alt && has_top_level_comma(text, stk.end as usize, index) {
                                match_idx = Some(idx);
                                break;
                            }
                        }
                    }

                    if let Some(midx) = match_idx {
                        let (open_item, depth) = stack.remove(midx);
                        pairs.push(DelimPair {
                            open: open_item,
                            close: DelimItem {
                                delim_type: dtype,
                                start: index as u32,
                                end: delim_end as u32,
                                is_left_right: false,
                            },
                            depth,
                        });
                    } else {
                        unmatched.push(DelimItem {
                            delim_type: dtype,
                            start: index as u32,
                            end: delim_end as u32,
                            is_left_right: false,
                        });
                    }
                    index += full_len;
                    continue;
                }
            } else {
                // Symmetric pipe delimiter: match if existing on stack, else push
                let mut match_idx = None;
                for (idx, (stk, _)) in stack.iter().enumerate().rev() {
                    if !stk.is_left_right && stk.delim_type == DelimType::Pipe {
                        match_idx = Some(idx);
                        break;
                    }
                }
                if let Some(midx) = match_idx {
                    if !is_explicit_open {
                        let (open_item, depth) = stack.remove(midx);
                        pairs.push(DelimPair {
                            open: open_item,
                            close: DelimItem {
                                delim_type: DelimType::Pipe,
                                start: index as u32,
                                end: delim_end as u32,
                                is_left_right: false,
                            },
                            depth,
                        });
                        index += full_len;
                        continue;
                    }
                }
                let depth = stack.len() as u32;
                stack.push((
                    DelimItem {
                        delim_type: DelimType::Pipe,
                        start: index as u32,
                        end: delim_end as u32,
                        is_left_right: false,
                    },
                    depth,
                ));
                index += full_len;
                continue;
            }
        }

        // 7. Escaped set braces \{ and \}
        if starts_with_u16(text, index, "\\{") {
            let depth = stack.len() as u32;
            stack.push((
                DelimItem {
                    delim_type: DelimType::Brace,
                    start: index as u32,
                    end: (index + 2) as u32,
                    is_left_right: false,
                },
                depth,
            ));
            index += 2;
            continue;
        }

        if starts_with_u16(text, index, "\\}") {
            let mut match_idx = None;
            for (idx, (stk, _)) in stack.iter().enumerate().rev() {
                if !stk.is_left_right && stk.delim_type == DelimType::Brace {
                    match_idx = Some(idx);
                    break;
                }
            }
            if let Some(midx) = match_idx {
                let (open_item, depth) = stack.remove(midx);
                pairs.push(DelimPair {
                    open: open_item,
                    close: DelimItem {
                        delim_type: DelimType::Brace,
                        start: index as u32,
                        end: (index + 2) as u32,
                        is_left_right: false,
                    },
                    depth,
                });
            } else {
                unmatched.push(DelimItem {
                    delim_type: DelimType::Brace,
                    start: index as u32,
                    end: (index + 2) as u32,
                    is_left_right: false,
                });
            }
            index += 2;
            continue;
        }

        // 8. Angle brackets \langle and \rangle
        if starts_with_u16(text, index, "\\langle") {
            let depth = stack.len() as u32;
            stack.push((
                DelimItem {
                    delim_type: DelimType::Angle,
                    start: index as u32,
                    end: (index + 7) as u32,
                    is_left_right: false,
                },
                depth,
            ));
            index += 7;
            continue;
        }

        if starts_with_u16(text, index, "\\rangle") {
            let mut match_idx = None;
            let mut ket_pipe_idx = None;
            for (idx, (stk, _)) in stack.iter().enumerate().rev() {
                if !stk.is_left_right && stk.delim_type == DelimType::Angle {
                    match_idx = Some(idx);
                    break;
                }
                if !stk.is_left_right && stk.delim_type == DelimType::Pipe && ket_pipe_idx.is_none() {
                    ket_pipe_idx = Some(idx);
                }
                if stk.is_left_right || stk.delim_type == DelimType::BareBrace || stk.delim_type == DelimType::Paren || stk.delim_type == DelimType::Bracket || stk.delim_type == DelimType::Brace {
                    break;
                }
            }
            if let Some(midx) = match_idx {
                let (open_item, depth) = stack.remove(midx);
                pairs.push(DelimPair {
                    open: open_item,
                    close: DelimItem {
                        delim_type: DelimType::Angle,
                        start: index as u32,
                        end: (index + 7) as u32,
                        is_left_right: false,
                    },
                    depth,
                });
            } else if let Some(kpidx) = ket_pipe_idx {
                // Dirac ket |...\rangle: consume opening pipe so it doesn't linger
                stack.remove(kpidx);
            } else {
                unmatched.push(DelimItem {
                    delim_type: DelimType::Angle,
                    start: index as u32,
                    end: (index + 7) as u32,
                    is_left_right: false,
                });
            }
            index += 7;
            continue;
        }

        // 9. Standard parentheses ( and [
        if ch == b'(' as u16 || (ch == b'[' as u16 && !ignored_brackets.contains(&index)) {
            let dtype = if ch == b'(' as u16 { DelimType::Paren } else { DelimType::Bracket };
            let depth = stack.len() as u32;
            stack.push((
                DelimItem {
                    delim_type: dtype,
                    start: index as u32,
                    end: (index + 1) as u32,
                    is_left_right: false,
                },
                depth,
            ));
            index += 1;
            continue;
        }

        if ch == b')' as u16 || (ch == b']' as u16 && !ignored_brackets.contains(&index)) {
            let dtype = if ch == b')' as u16 { DelimType::Paren } else { DelimType::Bracket };
            let mut match_idx = None;
            for (idx, (stk, _)) in stack.iter().enumerate().rev() {
                if !stk.is_left_right && stk.delim_type == dtype {
                    match_idx = Some(idx);
                    break;
                }
            }

            // Half-open interval fallback: [a, b) or (a, b]
            if match_idx.is_none() {
                let alt = if dtype == DelimType::Paren { DelimType::Bracket } else { DelimType::Paren };
                for (idx, (stk, _)) in stack.iter().enumerate().rev() {
                    if !stk.is_left_right && stk.delim_type == alt && has_top_level_comma(text, stk.end as usize, index) {
                        match_idx = Some(idx);
                        break;
                    }
                }
            }

            if let Some(midx) = match_idx {
                // Pop all inner unmatched items
                let (open_item, depth) = stack[midx].clone();
                while stack.len() > midx {
                    let (popped, _) = stack.pop().unwrap();
                    if popped.start != open_item.start {
                        unmatched.push(popped);
                    }
                }
                pairs.push(DelimPair {
                    open: open_item,
                    close: DelimItem {
                        delim_type: dtype,
                        start: index as u32,
                        end: (index + 1) as u32,
                        is_left_right: false,
                    },
                    depth,
                });
            } else {
                unmatched.push(DelimItem {
                    delim_type: dtype,
                    start: index as u32,
                    end: (index + 1) as u32,
                    is_left_right: false,
                });
            }
            index += 1;
            continue;
        }

        // 10. String quotes " ... "
        if ch == b'"' as u16 {
            let mut match_idx = None;
            for (idx, (stk, _)) in stack.iter().enumerate().rev() {
                if !stk.is_left_right && stk.delim_type == DelimType::Quote {
                    match_idx = Some(idx);
                    break;
                }
            }
            if let Some(midx) = match_idx {
                let (open_item, depth) = stack.remove(midx);
                pairs.push(DelimPair {
                    open: open_item,
                    close: DelimItem {
                        delim_type: DelimType::Quote,
                        start: index as u32,
                        end: (index + 1) as u32,
                        is_left_right: false,
                    },
                    depth,
                });
            } else {
                let depth = stack.len() as u32;
                stack.push((
                    DelimItem {
                        delim_type: DelimType::Quote,
                        start: index as u32,
                        end: (index + 1) as u32,
                        is_left_right: false,
                    },
                    depth,
                ));
            }
            index += 1;
            continue;
        }

        // 11. Bare grouping braces { ... }
        if include_bare_braces && ch == b'{' as u16 {
            let depth = stack.len() as u32;
            stack.push((
                DelimItem {
                    delim_type: DelimType::BareBrace,
                    start: index as u32,
                    end: (index + 1) as u32,
                    is_left_right: false,
                },
                depth,
            ));
            index += 1;
            continue;
        }

        if include_bare_braces && ch == b'}' as u16 {
            let mut match_idx = None;
            for (idx, (stk, _)) in stack.iter().enumerate().rev() {
                if !stk.is_left_right && stk.delim_type == DelimType::BareBrace {
                    match_idx = Some(idx);
                    break;
                }
            }
            if let Some(midx) = match_idx {
                let (open_item, depth) = stack.remove(midx);
                pairs.push(DelimPair {
                    open: open_item,
                    close: DelimItem {
                        delim_type: DelimType::BareBrace,
                        start: index as u32,
                        end: (index + 1) as u32,
                        is_left_right: false,
                    },
                    depth,
                });
            } else {
                unmatched.push(DelimItem {
                    delim_type: DelimType::BareBrace,
                    start: index as u32,
                    end: (index + 1) as u32,
                    is_left_right: false,
                });
            }
            index += 1;
            continue;
        }

        // 12. Bare vertical bars | ... |
        if ch == b'|' as u16
            && (index + 1 == n || text[index + 1] != b'|' as u16)
            && (index == 0 || text[index - 1] != b'|' as u16)
        {
            let mut match_idx = None;
            for (idx, (stk, _)) in stack.iter().enumerate().rev() {
                if !stk.is_left_right && stk.delim_type == DelimType::Pipe {
                    match_idx = Some(idx);
                    break;
                }
                if stk.is_left_right
                    || stk.delim_type == DelimType::BareBrace
                    || stk.delim_type == DelimType::Paren
                    || stk.delim_type == DelimType::Bracket
                    || stk.delim_type == DelimType::Brace
                {
                    break;
                }
            }
            if let Some(midx) = match_idx {
                let (open_item, depth) = stack[midx].clone();
                while stack.len() > midx {
                    let (popped, _) = stack.pop().unwrap();
                    if popped.start != open_item.start {
                        unmatched.push(popped);
                    }
                }
                pairs.push(DelimPair {
                    open: open_item,
                    close: DelimItem {
                        delim_type: DelimType::Pipe,
                        start: index as u32,
                        end: (index + 1) as u32,
                        is_left_right: false,
                    },
                    depth,
                });
            } else {
                let depth = stack.len() as u32;
                stack.push((
                    DelimItem {
                        delim_type: DelimType::Pipe,
                        start: index as u32,
                        end: (index + 1) as u32,
                        is_left_right: false,
                    },
                    depth,
                ));
            }
            index += 1;
            continue;
        }

        index += 1;
    }

    // Remaining unclosed items on stack are unmatched
    while let Some((stk_item, _)) = stack.pop() {
        unmatched.push(stk_item);
    }

    // Serialize to flat out_buf:
    // 6 words per pair: [open_start, open_end, close_start, close_end, depth, delim_type]
    let pair_count = pairs.len().min(out_buf.len() / 6);
    let mut out_idx = 0;
    for i in 0..pair_count {
        let p = &pairs[i];
        out_buf[out_idx] = p.open.start;
        out_buf[out_idx + 1] = p.open.end;
        out_buf[out_idx + 2] = p.close.start;
        out_buf[out_idx + 3] = p.close.end;
        out_buf[out_idx + 4] = p.depth;
        out_buf[out_idx + 5] = p.open.delim_type as u32;
        out_idx += 6;
    }

    // Unmatched: 4 words per item: [start, end, delim_type, is_left_right]
    let remaining_words = out_buf.len().saturating_sub(out_idx);
    let unmatched_count = unmatched.len().min(remaining_words / 4);
    for i in 0..unmatched_count {
        let u = &unmatched[i];
        out_buf[out_idx] = u.start;
        out_buf[out_idx + 1] = u.end;
        out_buf[out_idx + 2] = u.delim_type as u32;
        out_buf[out_idx + 3] = if u.is_left_right { 1 } else { 0 };
        out_idx += 4;
    }

    ((pair_count as u32) << 16) | (unmatched_count as u32)
}

/// Backward compatibility wrapper for old char/utf16 slice caller
pub fn scan_delimiters_full(
    chars: &[char],
    _utf16: &[u32],
    include_bare_braces: bool,
) -> (Vec<DelimPair>, Vec<DelimItem>) {
    let s: String = chars.iter().collect();
    let u16_units: Vec<u16> = s.encode_utf16().collect();
    let mut out_buf = vec![0u32; 4096];
    let packed = scan_delimiters_u16(&u16_units, &mut out_buf, include_bare_braces, true);
    let pair_count = (packed >> 16) as usize;
    let unmatched_count = (packed & 0xFFFF) as usize;

    let mut pairs = Vec::with_capacity(pair_count);
    let mut unmatched = Vec::with_capacity(unmatched_count);

    let mut idx = 0;
    for _ in 0..pair_count {
        let open_start = out_buf[idx];
        let open_end = out_buf[idx + 1];
        let close_start = out_buf[idx + 2];
        let close_end = out_buf[idx + 3];
        let depth = out_buf[idx + 4];
        let delim_type = DelimType::from_id(out_buf[idx + 5]);
        pairs.push(DelimPair {
            open: DelimItem {
                delim_type,
                start: open_start,
                end: open_end,
                is_left_right: false,
            },
            close: DelimItem {
                delim_type,
                start: close_start,
                end: close_end,
                is_left_right: false,
            },
            depth,
        });
        idx += 6;
    }

    for _ in 0..unmatched_count {
        let start = out_buf[idx];
        let end = out_buf[idx + 1];
        let delim_type = DelimType::from_id(out_buf[idx + 2]);
        let is_left_right = out_buf[idx + 3] != 0;
        unmatched.push(DelimItem {
            delim_type,
            start,
            end,
            is_left_right,
        });
        idx += 4;
    }

    (pairs, unmatched)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn to_u16(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }

    #[test]
    fn test_scan_nested_brackets() {
        let text = to_u16("([x + y])");
        let mut out = [0u32; 128];
        let res = scan_delimiters_u16(&text, &mut out, false, false);
        let pairs_count = res >> 16;
        let unmatched_count = res & 0xFFFF;

        assert_eq!(pairs_count, 2);
        assert_eq!(unmatched_count, 0);

        // First closed pair: [ ] -> open 1..2, close 7..8, depth 1
        assert_eq!(out[0], 1);
        assert_eq!(out[1], 2);
        assert_eq!(out[2], 7);
        assert_eq!(out[3], 8);
        assert_eq!(out[4], 1); // depth 1

        // Second closed pair: ( ) -> open 0..1, close 8..9, depth 0
        assert_eq!(out[6], 0);
        assert_eq!(out[7], 1);
        assert_eq!(out[8], 8);
        assert_eq!(out[9], 9);
        assert_eq!(out[10], 0); // depth 0
    }

    #[test]
    fn test_scan_half_open_interval() {
        let text = to_u16("[a, b)");
        let mut out = [0u32; 128];
        let res = scan_delimiters_u16(&text, &mut out, false, false);
        let pairs_count = res >> 16;
        assert_eq!(pairs_count, 1);
        assert_eq!(out[0], 0);
        assert_eq!(out[1], 1);
        assert_eq!(out[2], 5);
        assert_eq!(out[3], 6);
    }

    #[test]
    fn test_scan_left_right() {
        let text = to_u16("\\left( \\frac{a}{b} \\right)");
        let mut out = [0u32; 128];
        let res = scan_delimiters_u16(&text, &mut out, false, false);
        let pairs_count = res >> 16;
        assert_eq!(pairs_count, 1);
        assert_eq!(out[0], 0);
        assert_eq!(out[1], 6);
    }
}
