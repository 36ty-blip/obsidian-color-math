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
pub mod catalog_data;
pub mod catalog;
pub mod lexer;
pub mod checksum;
pub mod sugar;
pub mod cst;

// Re-export entry points at crate root
pub use macros::parse_math_spans;

// =========================================================================
// Raw C-ABI Zero-Allocation WASM Exports (Zero Runtime Overhead)
// =========================================================================

static mut SCRATCH_BUF: [u16; 256] = [0; 256];

/// Returns linear memory offset of the 256-code-unit static UTF-16 scratch buffer.
#[no_mangle]
pub extern "C" fn cm_scratch_ptr() -> *mut u16 {
    std::ptr::addr_of_mut!(SCRATCH_BUF) as *mut u16
}

/// Performs zero-allocation catalog slot lookup from UTF-16 code units placed in SCRATCH_BUF.
#[no_mangle]
pub extern "C" fn cm_lookup_catalog_slot(len: usize, active_domains: u32, active_dialects: u32) -> i32 {
    if len == 0 || len > 256 {
        return -1;
    }
    let slice = unsafe { std::slice::from_raw_parts(std::ptr::addr_of!(SCRATCH_BUF) as *const u16, len) };
    catalog::lookup_catalog_slot_utf16(slice, active_domains, active_dialects)
}

/// Performs zero-allocation catalog packed metadata lookup from UTF-16 code units placed in SCRATCH_BUF.
#[no_mangle]
pub extern "C" fn cm_lookup_catalog_packed(len: usize, active_domains: u32, active_dialects: u32) -> u32 {
    if len == 0 || len > 256 {
        return 0xFFFFFFFF;
    }
    let slice = unsafe { std::slice::from_raw_parts(std::ptr::addr_of!(SCRATCH_BUF) as *const u16, len) };
    catalog::lookup_catalog_packed_utf16(slice, active_domains, active_dialects)
}

/// Returns the total entry count in the compiled MPHF catalog (9342).
#[no_mangle]
pub extern "C" fn cm_catalog_count() -> u32 {
    catalog_data::N as u32
}

// -------------------------------------------------------------------------
// Island 2: Whole-Block Zero-Allocation Delimiter Scanner & Interval Engine
// -------------------------------------------------------------------------

pub const MAX_DELIM_TEXT_LEN: usize = 32768; // 32k UTF-16 code units (64 KB)
pub const MAX_DELIM_OUTPUT_WORDS: usize = 16384; // 16k u32 words (64 KB)

static mut DELIM_TEXT_BUF: [u16; MAX_DELIM_TEXT_LEN] = [0; MAX_DELIM_TEXT_LEN];
static mut DELIM_OUTPUT_BUF: [u32; MAX_DELIM_OUTPUT_WORDS] = [0; MAX_DELIM_OUTPUT_WORDS];

/// Returns linear memory offset of the 32k UTF-16 delimiter input text buffer.
#[no_mangle]
pub extern "C" fn cm_delim_text_ptr() -> *mut u16 {
    std::ptr::addr_of_mut!(DELIM_TEXT_BUF) as *mut u16
}

/// Returns linear memory offset of the static u32 delimiter output buffer.
#[no_mangle]
pub extern "C" fn cm_delim_output_ptr() -> *const u32 {
    std::ptr::addr_of!(DELIM_OUTPUT_BUF) as *const u32
}

/// Performs zero-allocation whole-block delimiter scan directly from linear memory.
/// Returns packed u32: (pairs_count << 16) | (unmatched_count & 0xFFFF).
#[no_mangle]
pub extern "C" fn cm_scan_delimiters(
    len: usize,
    include_bare_braces: u32,
    highlight_unmatched: u32,
) -> u32 {
    if len == 0 || len > MAX_DELIM_TEXT_LEN {
        return 0;
    }
    let slice = unsafe { std::slice::from_raw_parts(std::ptr::addr_of!(DELIM_TEXT_BUF) as *const u16, len) };
    let out_slice = unsafe { std::slice::from_raw_parts_mut(std::ptr::addr_of_mut!(DELIM_OUTPUT_BUF) as *mut u32, MAX_DELIM_OUTPUT_WORDS) };
    delimiters::scan_delimiters_u16(slice, out_slice, include_bare_braces != 0, highlight_unmatched != 0)
}

// -------------------------------------------------------------------------
// Island 3: Fast Whole-Block Byte-Stream Lexer & Token Slicer Engine
// -------------------------------------------------------------------------

pub const MAX_LEXER_TEXT_LEN: usize = 32768; // 32k UTF-16 code units (64 KB)
pub const MAX_LEXER_OUTPUT_WORDS: usize = 32768; // 32k u32 words (128 KB -> 8192 tokens)

static mut LEXER_TEXT_BUF: [u16; MAX_LEXER_TEXT_LEN] = [0; MAX_LEXER_TEXT_LEN];
static mut LEXER_OUTPUT_BUF: [u32; MAX_LEXER_OUTPUT_WORDS] = [0; MAX_LEXER_OUTPUT_WORDS];

/// Returns linear memory offset of the 32k UTF-16 lexer input text buffer.
#[no_mangle]
pub extern "C" fn cm_lexer_text_ptr() -> *mut u16 {
    std::ptr::addr_of_mut!(LEXER_TEXT_BUF) as *mut u16
}

/// Returns linear memory offset of the static u32 lexer output buffer.
#[no_mangle]
pub extern "C" fn cm_lexer_output_ptr() -> *const u32 {
    std::ptr::addr_of!(LEXER_OUTPUT_BUF) as *const u32
}

/// Performs zero-allocation whole-block lexer scan directly from linear memory.
/// Returns the number of emitted tokens (each token occupies 4 u32 words).
#[no_mangle]
pub extern "C" fn cm_lex_math_block(
    len: usize,
    active_domains: u32,
    active_dialects: u32,
    flags: u32,
) -> u32 {
    if len == 0 || len > MAX_LEXER_TEXT_LEN {
        return 0;
    }
    let slice = unsafe { std::slice::from_raw_parts(std::ptr::addr_of!(LEXER_TEXT_BUF) as *const u16, len) };
    let out_slice = unsafe { std::slice::from_raw_parts_mut(std::ptr::addr_of_mut!(LEXER_OUTPUT_BUF) as *mut u32, MAX_LEXER_OUTPUT_WORDS) };
    lexer::lex_math_block_u16(slice, out_slice, active_domains, active_dialects, flags) as u32
}

// -------------------------------------------------------------------------
// Island 4: Fast In-Place Syntactic Sugar & Merkle Checksum Engine
// -------------------------------------------------------------------------

pub const MAX_SUGAR_TEXT_LEN: usize = 32768; // 32k UTF-16 code units (64 KB)
pub const MAX_SUGAR_OUT_LEN: usize = 65536;  // 64k UTF-16 code units (128 KB for matrix expansion)

static mut SUGAR_TEXT_BUF: [u16; MAX_SUGAR_TEXT_LEN] = [0; MAX_SUGAR_TEXT_LEN];
static mut SUGAR_OUT_BUF: [u16; MAX_SUGAR_OUT_LEN] = [0; MAX_SUGAR_OUT_LEN];
static mut MERKLE_HASH_BUF: [u64; 2048] = [0; 2048]; // up to 2048 equations per document

/// Returns linear memory offset of the static sugar input buffer.
#[no_mangle]
pub extern "C" fn cm_sugar_text_ptr() -> *mut u16 {
    std::ptr::addr_of_mut!(SUGAR_TEXT_BUF) as *mut u16
}

/// Returns linear memory offset of the static sugar output buffer.
#[no_mangle]
pub extern "C" fn cm_sugar_out_ptr() -> *const u16 {
    std::ptr::addr_of!(SUGAR_OUT_BUF) as *const u16
}

/// Returns linear memory offset of the 2048-element Merkle hash input buffer.
#[no_mangle]
pub extern "C" fn cm_merkle_buf_ptr() -> *mut u64 {
    std::ptr::addr_of_mut!(MERKLE_HASH_BUF) as *mut u64
}

/// Computes high-dispersion 64-bit checksum directly from SUGAR_TEXT_BUF in <0.3ns/byte.
#[no_mangle]
pub extern "C" fn cm_hash64_math(len: usize) -> u64 {
    if len == 0 || len > MAX_SUGAR_TEXT_LEN {
        return 0;
    }
    let slice = unsafe { std::slice::from_raw_parts(std::ptr::addr_of!(SUGAR_TEXT_BUF) as *const u16, len) };
    checksum::hash64_u16(slice)
}

/// Desugars math block in SUGAR_TEXT_BUF into SUGAR_OUT_BUF.
/// Returns the length of the desugared output string in UTF-16 code units.
#[no_mangle]
pub extern "C" fn cm_desugar_math(len: usize, flags: u32) -> u32 {
    if len == 0 || len > MAX_SUGAR_TEXT_LEN {
        return 0;
    }
    let src = unsafe { std::slice::from_raw_parts(std::ptr::addr_of!(SUGAR_TEXT_BUF) as *const u16, len) };
    let dest = unsafe { std::slice::from_raw_parts_mut(std::ptr::addr_of_mut!(SUGAR_OUT_BUF) as *mut u16, MAX_SUGAR_OUT_LEN) };
    sugar::desugar_math_u16(src, dest, flags) as u32
}

/// Computes Merkle root hash across count elements in MERKLE_HASH_BUF.
#[no_mangle]
pub extern "C" fn cm_merkle_root(count: usize) -> u64 {
    if count == 0 || count > 2048 {
        return 0;
    }
    let slice = unsafe { std::slice::from_raw_parts(std::ptr::addr_of!(MERKLE_HASH_BUF) as *const u64, count) };
    checksum::merkle_root_u64(slice)
}

// -------------------------------------------------------------------------
// Island 5: Flat Linear Arena CST & 4D Navigation Topology Engine
// -------------------------------------------------------------------------

pub const MAX_CST_TEXT_LEN: usize = 32768; // 32k UTF-16 code units (64 KB)
pub const MAX_CST_NODES: usize = 4096;     // 4,096 flat 48-byte node records (192 KB)
pub const MAX_CST_OUTPUT_WORDS: usize = 16384; // 16k u32 words (64 KB -> 4096 tokens)

static mut CST_TEXT_BUF: [u16; MAX_CST_TEXT_LEN] = [0; MAX_CST_TEXT_LEN];
static mut CST_ARENA: [cst::CstNodeRecord; MAX_CST_NODES] = [cst::CstNodeRecord {
    kind: 0,
    flags: 0,
    start: 0,
    end: 0,
    role_id: 0,
    priority: 0,
    child_start: cst::NO_INDEX,
    child_count: 0,
    prev_leaf: cst::NO_INDEX,
    next_leaf: cst::NO_INDEX,
    compound_partner: cst::NO_INDEX,
    w: 0,
    z: 0,
    y: 0,
    x: 0,
    extra_data: 0,
    reserved: 0,
}; MAX_CST_NODES];
static mut CST_OUTPUT_BUF: [u32; MAX_CST_OUTPUT_WORDS] = [0; MAX_CST_OUTPUT_WORDS];

/// Returns linear memory offset of the 32k UTF-16 CST input text buffer.
#[no_mangle]
pub extern "C" fn cm_cst_text_ptr() -> *mut u16 {
    std::ptr::addr_of_mut!(CST_TEXT_BUF) as *mut u16
}

/// Returns linear memory offset of the static CST binary arena.
#[no_mangle]
pub extern "C" fn cm_cst_arena_ptr() -> *const cst::CstNodeRecord {
    std::ptr::addr_of!(CST_ARENA) as *const cst::CstNodeRecord
}

/// Returns linear memory offset of the static u32 CST token output buffer.
#[no_mangle]
pub extern "C" fn cm_cst_output_ptr() -> *const u32 {
    std::ptr::addr_of!(CST_OUTPUT_BUF) as *const u32
}

/// Parses whole math block into the Flat Linear Arena.
/// Returns the number of allocated nodes in the arena.
#[no_mangle]
pub extern "C" fn cm_parse_cst(
    len: usize,
    active_domains: u32,
    active_dialects: u32,
    _flags: u32,
) -> u32 {
    if len == 0 || len > MAX_CST_TEXT_LEN {
        return 0;
    }
    let slice = unsafe { std::slice::from_raw_parts(std::ptr::addr_of!(CST_TEXT_BUF) as *const u16, len) };
    let arena = unsafe { std::slice::from_raw_parts_mut(std::ptr::addr_of_mut!(CST_ARENA) as *mut cst::CstNodeRecord, MAX_CST_NODES) };
    cst::parse_cst_to_arena(slice, arena, active_domains, active_dialects) as u32
}

/// Traverses the CST arena and writes flat 4-tuples [start, end, role_id, priority] to CST_OUTPUT_BUF.
/// Returns the number of emitted tokens.
#[no_mangle]
pub extern "C" fn cm_cst_collect_spans(node_count: usize) -> u32 {
    if node_count == 0 || node_count > MAX_CST_NODES {
        return 0;
    }
    let arena = unsafe { std::slice::from_raw_parts(std::ptr::addr_of!(CST_ARENA) as *const cst::CstNodeRecord, node_count) };
    let out_slice = unsafe { std::slice::from_raw_parts_mut(std::ptr::addr_of_mut!(CST_OUTPUT_BUF) as *mut u32, MAX_CST_OUTPUT_WORDS) };
    cst::collect_spans_from_arena(arena, node_count, out_slice) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn to_u16(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }

    #[test]
    fn test_cm_scan_delimiters_c_abi() {
        let input = to_u16("\\left( \\frac{a}{b} \\right) + [0, 1)");
        let ptr = cm_delim_text_ptr();
        unsafe {
            std::ptr::copy_nonoverlapping(input.as_ptr(), ptr, input.len());
        }
        let res = cm_scan_delimiters(input.len(), 0, 1);
        let pairs_count = res >> 16;
        let unmatched_count = res & 0xFFFF;

        assert_eq!(pairs_count, 2); // \left(\right) and [0, 1)
        assert_eq!(unmatched_count, 0);

        let out_ptr = cm_delim_output_ptr();
        let out_slice = unsafe { std::slice::from_raw_parts(out_ptr, (pairs_count * 6) as usize) };

        // Pair 1: \left( ... \right)
        assert_eq!(out_slice[0], 0); // open_start
        assert_eq!(out_slice[1], 6); // open_end (\left( length 6)
        assert_eq!(out_slice[2], 19); // close_start (\right))
        assert_eq!(out_slice[3], 26); // close_end
        assert_eq!(out_slice[4], 0); // depth 0

        // Pair 2: [0, 1)
        assert_eq!(out_slice[6], 29); // open_start ([)
        assert_eq!(out_slice[7], 30); // open_end
        assert_eq!(out_slice[8], 34); // close_start ())
        assert_eq!(out_slice[9], 35); // close_end
        assert_eq!(out_slice[10], 0); // depth 0
    }

    #[test]
    fn test_cm_lex_math_block_c_abi() {
        let input = to_u16("\\int_{0}^{1} x^2 \\, dx = \\frac{1}{2}");
        let ptr = cm_lexer_text_ptr();
        unsafe {
            std::ptr::copy_nonoverlapping(input.as_ptr(), ptr, input.len());
        }
        // flags: 1 (delimiters) | 2 (scripts) = 3
        let token_count = cm_lex_math_block(input.len(), 0xFFFFFFFF, 0xFFFFFFFF, 3);
        assert!(token_count > 0);

        let out_ptr = cm_lexer_output_ptr();
        let out_slice = unsafe { std::slice::from_raw_parts(out_ptr, (token_count * 4) as usize) };

        // Check that tokens contain start, end, role_id, priority
        for idx in 0..token_count as usize {
            let start = out_slice[idx * 4];
            let end = out_slice[idx * 4 + 1];
            let _role = out_slice[idx * 4 + 2];
            let _prio = out_slice[idx * 4 + 3];
            assert!(start < end);
            assert!(end <= input.len() as u32);
        }
    }

    #[test]
    fn test_cm_sugar_and_checksum_c_abi() {
        let input = to_u16("mat[1, 2; 3, 4] != 0 ... done");
        let ptr = cm_sugar_text_ptr();
        unsafe {
            std::ptr::copy_nonoverlapping(input.as_ptr(), ptr, input.len());
        }

        // 1. Hash64 Checksum
        let hash1 = cm_hash64_math(input.len());
        assert_ne!(hash1, 0);

        // 2. Desugar Math
        let out_len = cm_desugar_math(input.len(), 7); // matrices + ligatures + ellipses
        assert!(out_len > input.len() as u32);

        let out_ptr = cm_sugar_out_ptr();
        let out_slice = unsafe { std::slice::from_raw_parts(out_ptr, out_len as usize) };
        let desugared = String::from_utf16_lossy(out_slice);

        assert!(desugared.contains("\\begin{matrix}"));
        assert!(desugared.contains("\\neq"));
        assert!(desugared.contains("\\dots"));

        // 3. Merkle Root
        let merkle_ptr = cm_merkle_buf_ptr();
        unsafe {
            *merkle_ptr = hash1;
            *merkle_ptr.add(1) = hash1 ^ 0x12345678;
        }
        let root = cm_merkle_root(2);
        assert_ne!(root, 0);
    }

    #[test]
    fn test_cm_cst_arena_and_navigation_c_abi() {
        let input = to_u16("\\frac{\\partial y}{\\partial x} + \\underbrace{a + b}_{c} = 0");
        let ptr = cm_cst_text_ptr();
        unsafe {
            std::ptr::copy_nonoverlapping(input.as_ptr(), ptr, input.len());
        }

        let node_count = cm_parse_cst(input.len(), 0xFFFFFFFF, 0xFFFFFFFF, 0);
        assert!(node_count > 0);

        let arena_ptr = cm_cst_arena_ptr();
        let arena_slice = unsafe { std::slice::from_raw_parts(arena_ptr, node_count as usize) };

        // Verify fraction and underover nodes exist in arena
        let has_frac = arena_slice.iter().any(|n| n.kind == cst::NODE_FRACTION);
        let has_underover = arena_slice.iter().any(|n| n.kind == cst::NODE_UNDEROVER);
        assert!(has_frac);
        assert!(has_underover);

        // Verify leaf chaining
        let leaves: Vec<_> = arena_slice.iter().enumerate().filter(|(_, n)| {
            n.kind == cst::NODE_IDENTIFIER || n.kind == cst::NODE_OPERATOR || n.kind == cst::NODE_COMMAND
        }).collect();
        assert!(leaves.len() > 1);

        // Collect flat spans
        let span_count = cm_cst_collect_spans(node_count as usize);
        assert!(span_count > 0);

        let out_ptr = cm_cst_output_ptr();
        let out_slice = unsafe { std::slice::from_raw_parts(out_ptr, (span_count * 4) as usize) };
        for idx in 0..span_count as usize {
            let start = out_slice[idx * 4];
            let end = out_slice[idx * 4 + 1];
            assert!(start < end);
        }
    }
}
