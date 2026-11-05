// wasm/src/catalog.rs
use crate::catalog_data::*;

#[inline(always)]
pub fn fnv1a_utf16(units: &[u16]) -> u32 {
    let mut h: u32 = 0x811c9dc5;
    for &u in units {
        h ^= u as u32;
        h = h.wrapping_mul(0x01000193);
    }
    h
}

/// O(1) Lemire Minimal Perfect Hash Function (MPHF) catalog lookup via UTF-16 code units.
/// Returns the 0-indexed slot (0..9341) matching the token, or -1 if no match.
#[inline]
pub fn lookup_catalog_slot_utf16(token: &[u16], active_domains: u32, active_dialects: u32) -> i32 {
    if token.is_empty() {
        return -1;
    }
    let h0 = fnv1a_utf16(token);
    let d = DISPLACEMENTS[(h0 as usize) & MASK];
    let h = h0 ^ (d as u32).wrapping_mul(0x9E3779B9);
    let slot = ((h as u64 * N as u64) >> 32) as usize;
    if slot < N {
        if CATALOG_KEYS[slot].encode_utf16().eq(token.iter().copied()) {
            let domains = CATALOG_DOMAINS[slot];
            if (domains & active_domains) != 0 {
                let dialects = CATALOG_DIALECTS[slot];
                if dialects == 0 || (dialects & active_dialects) != 0 {
                    return slot as i32;
                }
            }
        }
    }
    -1
}

/// Packed 32-bit metadata structure:
/// Bits 0..3:   Role ID (0..15)
/// Bits 4..10:  Priority (0..99)
/// Bits 11..12: Tier (0..2)
/// Bits 13..19: Arity (0..127)
/// Bits 20..31: Slot Index (0..9341)
#[inline]
pub fn lookup_catalog_packed_utf16(token: &[u16], active_domains: u32, active_dialects: u32) -> u32 {
    let slot = lookup_catalog_slot_utf16(token, active_domains, active_dialects);
    if slot < 0 {
        return 0xFFFFFFFF; // Sentinel for not found
    }
    let s = slot as usize;
    let role = (CATALOG_ROLE_IDS[s] as u32) & 0xF;
    let priority = (CATALOG_PRIORITIES[s] as u32) & 0x7F;
    let tier = (CATALOG_TIERS[s] as u32) & 0x3;
    let arity = (CATALOG_ARITIES[s] as u32) & 0x7F;
    let slot_idx = (slot as u32) & 0xFFF;

    role | (priority << 4) | (tier << 11) | (arity << 13) | (slot_idx << 20)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn to_utf16(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }

    #[test]
    fn test_lookup_sin() {
        let key = to_utf16("\\sin");
        let slot = lookup_catalog_slot_utf16(&key, 0xFFFFFFFF, 0xFFFFFFFF);
        assert!(slot >= 0);
        assert_eq!(CATALOG_KEYS[slot as usize], "\\sin");
        assert_eq!(CATALOG_ROLE_IDS[slot as usize], 0); // ROLE_FUNCTION
    }

    #[test]
    fn test_lookup_alpha() {
        let key = to_utf16("\\alpha");
        let slot = lookup_catalog_slot_utf16(&key, 0xFFFFFFFF, 0xFFFFFFFF);
        assert!(slot >= 0);
        assert_eq!(CATALOG_KEYS[slot as usize], "\\alpha");
        assert_eq!(CATALOG_ROLE_IDS[slot as usize], 4); // ROLE_PARAMETER
    }

    #[test]
    fn test_lookup_unicode_combining() {
        let key = to_utf16("̅");
        let slot = lookup_catalog_slot_utf16(&key, 0xFFFFFFFF, 0xFFFFFFFF);
        assert!(slot >= 0);
        assert_eq!(CATALOG_KEYS[slot as usize], "̅");
    }

    #[test]
    fn test_lookup_unknown() {
        let key = to_utf16("\\notACommand123");
        let slot = lookup_catalog_slot_utf16(&key, 0xFFFFFFFF, 0xFFFFFFFF);
        assert_eq!(slot, -1);
    }
}
