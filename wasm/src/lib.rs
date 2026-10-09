// wasm/src/lib.rs
//! Color Math WebAssembly Core Engine
//!
//! Modular architecture:
//! - `common`: Span types, UTF-16 index mapping, char & AST scanning primitives
//! - `delimiters`: Rainbow delimiter scanner, sized delimiters, interval disambiguation, unmatched error detection
//! - `macros`: LaTeX macro command classifier, AST prototype parse
//!
//! Future modules:
//! - `units`: Physical units scanner (SI prefixes, compound units, micro disambiguation)
//! - `dimensionless`: Dimensionless numbers and constants
//! - `differentials`: Calculus derivatives and differential operators

pub mod common;
pub mod delimiters;
pub mod macros;

// Re-export WASM entry points at crate root for wasm-bindgen
pub use macros::parse_math_spans;

#[cfg(test)]
mod tests {
    use super::*;
    use common::*;
    use delimiters::*;
    use macros::*;

    #[test]
    fn test_compute_utf16_offsets() {
        let chars: Vec<char> = "a\u{1F600}b".chars().collect(); // 1-char, 2-unit surrogate emoji, 1-char
        let utf16 = compute_utf16_offsets(&chars);
        assert_eq!(utf16, vec![0, 1, 3, 4]);
    }

    #[test]
    fn test_common_helpers() {
        let chars: Vec<char> = "  \\text{abc}% comment\nx".chars().collect();
        assert_eq!(skip_whitespace(&chars, 0), 2);
        assert!(starts_with(&chars, 2, "\\text"));
        assert!(!starts_with(&chars, 2, "\\sum"));

        let comment_idx = 12; // points to '%'
        let next_line = skip_comment(&chars, comment_idx);
        assert_eq!(chars[next_line], 'x');

        let braced: Vec<char> = "{foo{bar}}baz".chars().collect();
        assert_eq!(skip_braced_group(&braced, 0), 10);
    }

    #[test]
    fn test_delimiter_scanner_nested() {
        let input = "( [ x ] )";
        let chars: Vec<char> = input.chars().collect();
        let utf16 = compute_utf16_offsets(&chars);
        let (pairs, unmatched) = scan_delimiters_full(&chars, &utf16, false);

        assert_eq!(pairs.len(), 2);
        assert_eq!(unmatched.len(), 0);
        // Outer paren: depth 0
        // Inner bracket: depth 1
        assert_eq!(pairs[0].depth, 1); // inner closed first
        assert_eq!(pairs[1].depth, 0); // outer closed second
    }

    #[test]
    fn test_half_open_intervals() {
        let input = "[a, b)";
        let chars: Vec<char> = input.chars().collect();
        let utf16 = compute_utf16_offsets(&chars);
        let (pairs, unmatched) = scan_delimiters_full(&chars, &utf16, false);

        assert_eq!(pairs.len(), 1);
        assert_eq!(unmatched.len(), 0);
        assert_eq!(pairs[0].open.start, 0);
        assert_eq!(pairs[0].close.start, 5);
    }

    #[test]
    fn test_unmatched_syntax_errors() {
        let input = "\\frac{a}{b";
        let chars: Vec<char> = input.chars().collect();
        let utf16 = compute_utf16_offsets(&chars);
        let (_, unmatched) = scan_delimiters_full(&chars, &utf16, true);

        assert_eq!(unmatched.len(), 1);
        assert_eq!(unmatched[0].delim_type, DelimType::BareBrace);
    }

    #[test]
    fn test_macro_classifier() {
        assert_eq!(classify_macro("\\int"), Some((1, 30)));
        assert_eq!(classify_macro("\\partial"), Some((3, 35)));
        assert_eq!(classify_macro("\\sin"), Some((0, 20)));
        assert_eq!(classify_macro("\\unknown"), None);
    }

    #[test]
    fn test_parse_math_spans() {
        let latex = "\\int x dx = y";
        let flat = parse_math_spans(latex);
        assert!(!flat.is_empty());
        assert_eq!(flat.len() % 4, 0);
    }
}
