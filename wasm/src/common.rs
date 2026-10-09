// wasm/src/common.rs

/// ColorSpan representation matching TypeScript ColorSpan:
/// role: ColorRole index or special ID (e.g. 100+ for rainbow depths, 999 for syntax error)
/// priority: z-index / CSS ordering precedence
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Span {
    pub start: u32,
    pub end: u32,
    pub role: u32,
    pub priority: u32,
}

/// Precomputes character offset to UTF-16 code unit offset mapping
/// so Rust indices match JavaScript string indices exactly (handling surrogate pairs / emoji).
pub fn compute_utf16_offsets(chars: &[char]) -> Vec<u32> {
    let mut utf16_offsets = Vec::with_capacity(chars.len() + 1);
    let mut current = 0u32;
    for &c in chars {
        utf16_offsets.push(current);
        current += c.len_utf16() as u32;
    }
    utf16_offsets.push(current);
    utf16_offsets
}

/// Checks if `chars` starting at index `start` matches the prefix string `s`.
pub fn starts_with(chars: &[char], start: usize, s: &str) -> bool {
    let s_chars: Vec<char> = s.chars().collect();
    if start + s_chars.len() > chars.len() {
        return false;
    }
    for (idx, &sc) in s_chars.iter().enumerate() {
        if chars[start + idx] != sc {
            return false;
        }
    }
    true
}

/// Skips ASCII/Unicode whitespace characters starting at index `start`.
pub fn skip_whitespace(chars: &[char], mut start: usize) -> usize {
    while start < chars.len() && chars[start].is_whitespace() {
        start += 1;
    }
    start
}

/// Skips LaTeX comment `% ...\n` or `\r\n`.
pub fn skip_comment(chars: &[char], start: usize) -> usize {
    let mut i = start + 1;
    let n = chars.len();
    while i < n && chars[i] != '\r' && chars[i] != '\n' {
        i += 1;
    }
    if i < n && chars[i] == '\r' && i + 1 < n && chars[i + 1] == '\n' {
        return i + 2;
    }
    if i < n {
        return i + 1;
    }
    n
}

/// Skips balanced content inside curly braces `{ ... }` assuming opening brace was just consumed.
pub fn skip_braced_content(chars: &[char], mut i: usize) -> usize {
    let mut depth = 1;
    while i < chars.len() && depth > 0 {
        if chars[i] == '{' {
            depth += 1;
        } else if chars[i] == '}' {
            depth -= 1;
            if depth == 0 {
                return i;
            }
        }
        i += 1;
    }
    i
}

/// Skips an entire braced group `{...}` including leading whitespace.
pub fn skip_braced_group(chars: &[char], mut i: usize) -> usize {
    while i < chars.len() && chars[i].is_whitespace() {
        i += 1;
    }
    if i >= chars.len() || chars[i] != '{' {
        return i;
    }
    i += 1;
    let mut depth = 1;
    while i < chars.len() && depth > 0 {
        if chars[i] == '{' {
            depth += 1;
        } else if chars[i] == '}' {
            depth -= 1;
        }
        i += 1;
    }
    i
}
