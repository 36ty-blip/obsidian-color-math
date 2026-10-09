// wasm/src/macros.rs

use wasm_bindgen::prelude::*;

use crate::common::{
    compute_utf16_offsets, skip_braced_content, skip_braced_group, skip_comment, starts_with, Span,
};
use crate::delimiters::scan_delimiters_full;

/// Classifies known LaTeX math macros into (role, priority) pairs:
/// Role indices matching TypeScript ColorRole enum:
/// 0: main, 1: orange, 2: dot, 3: derivative, 4: chain, 5: upper,
/// 6: relation, 7: arrow, 8: set, 9: spacing, 10: parameter, 11: unit, 12: energyOperator
pub fn classify_macro(cmd: &str) -> Option<(u32, u32)> {
    match cmd {
        "\\sum" | "\\prod" | "\\coprod" | "\\int" | "\\iint" | "\\iiint" | "\\oint"
        | "\\lim" | "\\sup" | "\\inf" | "\\max" | "\\min"
        | "\\bigcup" | "\\bigcap" | "\\bigsqcup" | "\\bigvee" | "\\bigwedge"
        | "\\bigoplus" | "\\bigotimes" => Some((1, 30)),

        "\\rightarrow" | "\\leftarrow" | "\\Rightarrow" | "\\Leftarrow"
        | "\\leftrightarrow" | "\\Leftrightarrow" | "\\longrightarrow" | "\\longleftarrow"
        | "\\mapsto" | "\\to" => Some((7, 30)),

        "\\in" | "\\notin" | "\\subset" | "\\supset" | "\\subseteq" | "\\supseteq"
        | "\\setminus" | "\\emptyset" | "\\cup" | "\\cap" => Some((8, 30)),

        "\\," | "\\:" | "\\;" | "\\quad" | "\\qquad" | "\\!" | "\\ " => Some((9, 30)),

        "\\cdot" | "\\times" => Some((2, 30)),

        "\\neq" | "\\ne" | "\\leq" | "\\le" | "\\geq" | "\\ge"
        | "\\approx" | "\\sim" | "\\equiv" | "\\propto" => Some((6, 30)),

        "\\partial" | "\\nabla" => Some((3, 35)),

        "\\sin" | "\\cos" | "\\tan" | "\\arcsin" | "\\arccos" | "\\arctan"
        | "\\sinh" | "\\cosh" | "\\tanh" | "\\sec" | "\\csc" | "\\cot"
        | "\\exp" | "\\ln" | "\\log" | "\\det" | "\\tr" | "\\trace" => Some((0, 20)),

        "\\pi" | "\\varpi" | "\\hbar" | "\\infty" | "\\ell" | "\\aleph" => Some((1, 20)),

        _ => None,
    }
}

/// Full-equation AST parse prototype exported to WebAssembly.
#[wasm_bindgen]
pub fn parse_math_spans(input: &str) -> Vec<u32> {
    let chars: Vec<char> = input.chars().collect();
    let n = chars.len();
    let utf16 = compute_utf16_offsets(&chars);
    let mut spans: Vec<Span> = Vec::new();

    let mut i = 0;
    while i < n {
        let ch = chars[i];

        if ch == '%' {
            i = skip_comment(&chars, i);
            continue;
        }

        if ch == '\\' && starts_with(&chars, i, "\\textcolor") {
            i += 10;
            i = skip_braced_group(&chars, i);
            continue;
        }

        if ch == '_' || ch == '^' {
            let role = if ch == '_' { 4 } else { 5 };
            i += 1;
            if i < n && chars[i] == '{' {
                let group_start = i + 1;
                let group_end = skip_braced_content(&chars, group_start);
                if group_end > group_start {
                    spans.push(Span {
                        start: utf16[group_start],
                        end: utf16[group_end],
                        role,
                        priority: 10,
                    });
                }
                i = if group_end < n && chars[group_end] == '}' { group_end + 1 } else { group_end };
            } else if i < n && !chars[i].is_whitespace() {
                let arg_start = i;
                if chars[i] == '\\' {
                    i += 1;
                    while i < n && chars[i].is_ascii_alphabetic() {
                        i += 1;
                    }
                } else {
                    i += 1;
                }
                spans.push(Span {
                    start: utf16[arg_start],
                    end: utf16[i],
                    role,
                    priority: 10,
                });
            }
            continue;
        }

        if ch == '\\' {
            let cmd_start = i;
            i += 1;
            if i < n && !chars[i].is_ascii_alphabetic() {
                i += 1;
            } else {
                while i < n && chars[i].is_ascii_alphabetic() {
                    i += 1;
                }
            }
            let cmd_str: String = chars[cmd_start..i].iter().collect();
            if let Some((role, priority)) = classify_macro(&cmd_str) {
                spans.push(Span {
                    start: utf16[cmd_start],
                    end: utf16[i],
                    role,
                    priority,
                });
            }
            continue;
        }

        match ch {
            '=' | '<' | '>' => {
                spans.push(Span {
                    start: utf16[i],
                    end: utf16[i + 1],
                    role: 6,
                    priority: 30,
                });
            }
            '*' | '·' | '×' => {
                spans.push(Span {
                    start: utf16[i],
                    end: utf16[i + 1],
                    role: 2,
                    priority: 30,
                });
            }
            _ => {}
        }

        i += 1;
    }

    // Append full delimiter scans
    let (pairs, unmatched) = scan_delimiters_full(&chars, &utf16, true);
    for p in pairs {
        let role = 100 + p.depth;
        spans.push(Span {
            start: p.open.start,
            end: p.open.end,
            role,
            priority: 25,
        });
        spans.push(Span {
            start: p.close.start,
            end: p.close.end,
            role,
            priority: 25,
        });
    }
    for u in unmatched {
        spans.push(Span {
            start: u.start,
            end: u.end,
            role: 999,
            priority: 99,
        });
    }

    spans.sort_by_key(|s| s.start);

    let mut flat = Vec::with_capacity(spans.len() * 4);
    for s in spans {
        flat.push(s.start);
        flat.push(s.end);
        flat.push(s.role);
        flat.push(s.priority);
    }
    flat
}
