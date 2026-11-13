// note: just enough rlp for an eip-1559 transfer, written here so the contract hashes what it judged

pub fn encode_bytes(bytes: &[u8]) -> Vec<u8> {
    if bytes.len() == 1 && bytes[0] < 0x80 {
        return bytes.to_vec();
    }
    let mut out = length_prefix(0x80, bytes.len());
    out.extend_from_slice(bytes);
    out
}

pub fn encode_uint(value: u128) -> Vec<u8> {
    let raw = value.to_be_bytes();
    let first = raw.iter().position(|b| *b != 0).unwrap_or(raw.len());
    encode_bytes(&raw[first..])
}

pub fn encode_list(items: &[Vec<u8>]) -> Vec<u8> {
    let body: Vec<u8> = items.concat();
    let mut out = length_prefix(0xc0, body.len());
    out.extend(body);
    out
}

fn length_prefix(offset: u8, len: usize) -> Vec<u8> {
    if len < 56 {
        return vec![offset + len as u8];
    }
    let raw = (len as u64).to_be_bytes();
    let first = raw.iter().position(|b| *b != 0).unwrap_or(raw.len());
    let mut out = vec![offset + 55 + (raw.len() - first) as u8];
    out.extend_from_slice(&raw[first..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_yellow_paper_examples() {
        assert_eq!(encode_bytes(b"dog"), vec![0x83, b'd', b'o', b'g']);
        assert_eq!(encode_uint(0), vec![0x80]);
        assert_eq!(encode_uint(15), vec![0x0f]);
        assert_eq!(encode_uint(1024), vec![0x82, 0x04, 0x00]);
        assert_eq!(encode_list(&[encode_bytes(b"cat"), encode_bytes(b"dog")]), vec![0xc8, 0x83, b'c', b'a', b't', 0x83, b'd', b'o', b'g']);
        assert_eq!(encode_list(&[]), vec![0xc0]);
        let long = vec![b'a'; 56];
        assert_eq!(&encode_bytes(&long)[..2], &[0xb8, 56]);
    }
}
