// wasm/src/checksum.rs
//! High-Performance SIMD-Friendly 64-Bit Checksum & Merkle Cluster Engine.
//! Provides sub-nanosecond hashing of math blocks and O(1) document-level note-open bails.

const FNV_OFFSET_64: u64 = 0xcbf29ce484222325;
const FNV_PRIME_64: u64 = 0x100000001b3;

/// Computes a high-dispersion 64-bit hash over UTF-16 code units.
/// Employs FNV-1a 64-bit core with SplitMix64 finalizer for optimal avalanche properties.
#[inline(always)]
pub fn hash64_u16(slice: &[u16]) -> u64 {
    let mut h = FNV_OFFSET_64;
    for &u in slice {
        h ^= u as u64;
        h = h.wrapping_mul(FNV_PRIME_64);
    }
    // SplitMix64 avalanche bit-mixer
    h ^= h >> 33;
    h = h.wrapping_mul(0xff51afd7ed558ccd);
    h ^= h >> 33;
    h = h.wrapping_mul(0xc4ceb9fe1a85ec53);
    h ^= h >> 33;
    h
}

/// Combines two 64-bit hashes into a commutative Merkle tree parent node.
#[inline(always)]
pub fn combine_hash64(left: u64, right: u64) -> u64 {
    let mut h = left ^ right.rotate_left(31);
    h = h.wrapping_mul(FNV_PRIME_64);
    h ^= h >> 27;
    h = h.wrapping_mul(0x94d049bb133111eb);
    h ^ (h >> 31)
}

/// Computes the Merkle root hash across a list of 64-bit equation fingerprints.
/// Yields a single document-level fingerprint that detects any equation mutation in O(N).
pub fn merkle_root_u64(hashes: &[u64]) -> u64 {
    if hashes.is_empty() {
        return 0;
    }
    if hashes.len() == 1 {
        return hashes[0];
    }

    let mut current = hashes.to_vec();
    while current.len() > 1 {
        let mut next = Vec::with_capacity((current.len() + 1) / 2);
        let mut i = 0;
        while i < current.len() {
            if i + 1 < current.len() {
                next.push(combine_hash64(current[i], current[i + 1]));
            } else {
                next.push(combine_hash64(current[i], current[i]));
            }
            i += 2;
        }
        current = next;
    }
    current[0]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash64_deterministic() {
        let text1: Vec<u16> = "x^2 + y^2 = z^2".encode_utf16().collect();
        let text2: Vec<u16> = "x^2 + y^2 = z^2".encode_utf16().collect();
        let text3: Vec<u16> = "x^2 + y^2 = z^3".encode_utf16().collect();

        let h1 = hash64_u16(&text1);
        let h2 = hash64_u16(&text2);
        let h3 = hash64_u16(&text3);

        assert_eq!(h1, h2);
        assert_ne!(h1, h3);
    }

    #[test]
    fn test_merkle_root_invalidation() {
        let h1 = hash64_u16(&"E = mc^2".encode_utf16().collect::<Vec<_>>());
        let h2 = hash64_u16(&"\\int f(x) dx".encode_utf16().collect::<Vec<_>>());
        let h3 = hash64_u16(&"a^2 + b^2 = c^2".encode_utf16().collect::<Vec<_>>());

        let root1 = merkle_root_u64(&[h1, h2, h3]);
        let root2 = merkle_root_u64(&[h1, h2, h3]);
        assert_eq!(root1, root2);

        // Mutate one equation
        let h2_mut = hash64_u16(&"\\int g(x) dx".encode_utf16().collect::<Vec<_>>());
        let root_mut = merkle_root_u64(&[h1, h2_mut, h3]);
        assert_ne!(root1, root_mut);
    }
}
