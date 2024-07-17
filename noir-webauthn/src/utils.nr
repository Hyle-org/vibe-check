use dep::std;

pub fn prefix_sha256_hash<N>(prefix_length: u8, input: [u8; N]) -> [u8; 32] {
    let mut result = [0; 32];
    assert([1, 2, 3, 113, 114, 133, 134, 156, 242, 243].any(|x| x == prefix_length), "Length is not supported");
    if prefix_length == 1 {
        result = std::hash::sha256(prefix(input, [0; 1]));
    }
    if prefix_length == 2 {
        result = std::hash::sha256(prefix(input, [0; 2]));
    }
    if prefix_length == 3 {
        result = std::hash::sha256(prefix(input, [0; 3]));
    }
    if prefix_length == 113 {
        result = std::hash::sha256(prefix(input, [0; 113]));
    }
    if prefix_length == 114 {
        result = std::hash::sha256(prefix(input, [0; 114]));
    }
    if prefix_length == 133 {
        result = std::hash::sha256(prefix(input, [0; 133]));
    }
    if prefix_length == 134 {
        result = std::hash::sha256(prefix(input, [0; 134]));
    }
    if prefix_length == 156 {
        result = std::hash::sha256(prefix(input, [0; 156]));
    }
    if prefix_length == 242 {
        result = std::hash::sha256(prefix(input, [0; 242]));
    }
    if prefix_length == 243 {
        result = std::hash::sha256(prefix(input, [0; 243]));
    }
    result
}


pub fn concatenate_arrays(a: [u8; 37], b: [u8; 32]) -> [u8; 69] {
    let mut result = [0; 69];
    for i in 0..37 {
        result[i] = a[i];
    }
    for i in 0..32 {
        result[i+37] = b[i];
    }
    result
}

pub fn check_pubkey_matches_identity(pub_key_x: [u8; 32], pub_key_y: [u8; 32], identity: str<56>) {
    // Compute the publickey as concatenation of pub_key_x and pub_key_y
    let mut pub_key = [0; 64];
    for i in 0..32 {
        pub_key[i] = pub_key_x[i];
    }
    for j in 0..32 {
        pub_key[j+32] = pub_key_y[j];
    }
    // Compute the address as the hash of the publickey
    let address: [u8; 32] = std::hash::sha256(pub_key);

    // identity is the last 20bytes of the address.
    // Assert that there is a match between identity provided and identity computed from pubkeys
    for k in 0..20 {
        assert(address[12 + k] == identity.from_hex_to_uint_slice(2*k, 2*k + 2) as u8);
    }
}


fn prefix<N, M>(input: [u8; N], mut result: [u8; M]) -> [u8; M] {
    for i in 0..M {
        result[i] = input[i];
    }
    result
}