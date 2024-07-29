mod utils;

use dep::std;
use dep::std::println;
use crate::utils::{prefix_sha256_hash, concatenate_arrays, check_pubkey_matches_identity};

global CLIENT_DATA_JSON_LEN = 255;

struct ProgramOutputs {
    authenticator_data: [u8; 37],
    client_data_json_len: u8,
    client_data_json: [u8; CLIENT_DATA_JSON_LEN],
    signature: [u8; 64],
    pub_key_x: [u8; 32],
    pub_key_y: [u8; 32],
}


fn main(
    version: pub u32,
    initial_state_len: pub u32,
    initial_state: pub [u8; 4],
    next_state_len: pub u32,
    next_state: pub [u8; 4],
    identity_len: pub u8,
    identity: pub str<56>,
    tx_hash_len: pub u32,
    tx_hash: pub [u8; 43],
    payload_hash: pub Field,
    program_outputs: pub ProgramOutputs
) {
    // let client_data_json_hash = prefix_sha256_hash(program_outputs.client_data_json);
    let client_data_json_hash = prefix_sha256_hash(
        program_outputs.client_data_json_len,
        program_outputs.client_data_json
    );
    let concat = concatenate_arrays(program_outputs.authenticator_data, client_data_json_hash);
    let hashed_data = std::hash::sha256(concat);

    // Verifying pub_key matches the identity
    check_pubkey_matches_identity(program_outputs.pub_key_x, program_outputs.pub_key_y, identity);

    // The txhash IS the challenge
    for i in 0..(tx_hash.len()) {
        assert(tx_hash[i] == program_outputs.client_data_json[36 + i]);
    }

    let valid_signature = std::ecdsa_secp256r1::verify_signature(
        program_outputs.pub_key_x,
        program_outputs.pub_key_y,
        program_outputs.signature,
        hashed_data
    );

    assert(valid_signature);
    assert(version == 1);
    assert(tx_hash_len == 43);
    assert(identity_len == 56);
    assert(initial_state_len == 4);
    assert(next_state_len == 4);
    assert(initial_state == [0; 4]);
    assert(next_state == [0; 4]);
    assert(payload_hash == payload_hash);

    let mut signature = [0 as Field; 64];
    for i in 0..program_outputs.signature.len() {
        signature[i] = program_outputs.signature[i] as Field;
    }
}

#[test]
fn test_webauthn_verification_from_vibe_checker_134() {
    let authenticator_data = [
        73, 150, 13, 229, 136, 14, 140, 104, 116, 52, 23, 15, 100, 118, 96, 91, 143, 228, 174, 185, 162, 134, 50, 199, 153, 92, 243, 186, 131, 29, 151, 99, 1, 0, 0, 0, 2
    ];
    let client_data_json = [
        123, 34, 116, 121, 112, 101, 34, 58, 34, 119, 101, 98, 97, 117, 116, 104, 110, 46, 103, 101, 116, 34, 44, 34, 99, 104, 97, 108, 108, 101, 110, 103, 101, 34, 58, 34, 77, 68, 69, 121, 77, 122, 81, 49, 78, 106, 99, 52, 79, 87, 70, 105, 89, 50, 82, 108, 90, 106, 65, 120, 77, 106, 77, 48, 78, 84, 89, 51, 79, 68, 108, 104, 89, 109, 78, 107, 90, 87, 89, 34, 44, 34, 111, 114, 105, 103, 105, 110, 34, 58, 34, 104, 116, 116, 112, 58, 47, 47, 108, 111, 99, 97, 108, 104, 111, 115, 116, 58, 53, 49, 55, 51, 34, 44, 34, 99, 114, 111, 115, 115, 79, 114, 105, 103, 105, 110, 34, 58, 102, 97, 108, 115, 101, 125,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,// Padding with 121 zeros (134+121 = 255) 
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0
    ];
    let signature = [
        80, 114, 197, 245, 128, 150, 206, 160, 135, 105, 51, 205, 42, 143, 25, 53, 119, 97, 166, 196, 95, 98, 53, 63, 168, 171, 63, 85, 41, 42, 196, 134, 26, 198, 126, 179, 109, 99, 41, 92, 86, 45, 240, 238, 196, 106, 77, 219, 146, 196, 183, 80, 225, 170, 66, 218, 169, 244, 230, 252, 61, 213, 29, 201
    ];
    let challenge = [
        77, 68, 69, 121, 77, 122, 81, 49, 78, 106, 99, 52, 79, 87, 70, 105, 89, 50, 82, 108, 90, 106, 65, 120, 77, 106, 77, 48, 78, 84, 89, 51, 79, 68, 108, 104, 89, 109, 78, 107, 90, 87, 89
    ];
    let pub_key_x = [
        201, 91, 99, 172, 65, 154, 80, 154, 189, 195, 194, 210, 62, 219, 224, 36, 43, 134, 143, 236, 137, 178, 121, 35, 112, 146, 103, 238, 37, 100, 145, 26
    ];
    let pub_key_y = [
        169, 8, 63, 83, 58, 93, 192, 39, 114, 115, 138, 176, 56, 254, 162, 127, 93, 19, 156, 93, 51, 9, 194, 161, 253, 10, 203, 128, 171, 254, 255, 83
    ];

    let program_outputs = ProgramOutputs { authenticator_data, client_data_json_len: 134, client_data_json, signature, pub_key_x, pub_key_y };

    let version = 1;
    let initial_state_len = 4;
    let initial_state = [0, 0, 0, 0];
    let next_state_len = 4;
    let next_state = [0, 0, 0, 0];
    let identity_len = 56;
    let identity = "c59b18d3bdaccb4d689048559a9bb6e8265293bf.ecdsa_secp256r1";
    let tx_hash_len = 43;
    let tx_hash = challenge;
    let payload_hash = 0x0d05cdc496bde53c7f93a50ef18b8ff2084c18c65bb2b9cbac7c3b814befa0a3 as Field;

    main(
        version,
        initial_state_len,
        initial_state,
        next_state_len,
        next_state,
        identity_len,
        identity,
        tx_hash_len,
        tx_hash,
        payload_hash,
        program_outputs
    );
}

#[test]
fn test_webauthn_verification_from_vibe_checker_243() {
    let authenticator_data = [73,150,13,229,136,14,140,104,116,52,23,15,100,118,96,91,143,228,174,185,162,134,50,199,153,92,243,186,131,29,151,99,1,0,0,0,2];
    let client_data_json = [123,34,116,121,112,101,34,58,34,119,101,98,97,117,116,104,110,46,103,101,116,34,44,34,99,104,97,108,108,101,110,103,101,34,58,34,77,68,69,121,77,122,81,49,78,106,99,52,79,87,70,105,89,50,82,108,90,106,65,120,77,106,77,48,78,84,89,51,79,68,108,104,89,109,78,107,90,87,89,34,44,34,111,114,105,103,105,110,34,58,34,104,116,116,112,58,47,47,108,111,99,97,108,104,111,115,116,58,53,49,55,51,34,44,34,99,114,111,115,115,79,114,105,103,105,110,34,58,102,97,108,115,101,44,34,111,116,104,101,114,95,107,101,121,115,95,99,97,110,95,98,101,95,97,100,100,101,100,95,104,101,114,101,34,58,34,100,111,32,110,111,116,32,99,111,109,112,97,114,101,32,99,108,105,101,110,116,68,97,116,97,74,83,79,78,32,97,103,97,105,110,115,116,32,97,32,116,101,109,112,108,97,116,101,46,32,83,101,101,32,104,116,116,112,115,58,47,47,103,111,111,46,103,108,47,121,97,98,80,101,120,34,125,
        0,0,0,0,0,0,0,0,0,0,0,0 // Padding with 12 zeros (243+12 = 255) 
    ];
    let signature = [35,9,110,138,212,71,172,124,13,7,194,158,153,63,87,67,67,25,22,122,101,253,159,175,106,50,52,157,164,70,148,46,126,152,146,190,137,37,199,95,249,115,198,94,237,198,18,23,200,185,52,157,189,205,144,63,212,29,177,20,24,255,160,127];
    let challenge = [77,68,69,121,77,122,81,49,78,106,99,52,79,87,70,105,89,50,82,108,90,106,65,120,77,106,77,48,78,84,89,51,79,68,108,104,89,109,78,107,90,87,89];
    let pub_key_x = [15,206,241,12,21,160,54,11,79,72,44,109,43,45,101,54,210,243,13,236,51,33,47,66,187,38,60,249,64,70,37,252];
    let pub_key_y = [43,221,114,86,240,184,224,51,237,41,173,85,147,130,225,150,159,150,44,23,57,92,82,37,27,40,69,123,252,224,3,197];

    let program_outputs = ProgramOutputs {
        authenticator_data,
        client_data_json_len: 243,
        client_data_json,
        signature,
        pub_key_x,
        pub_key_y,
    };

    let version = 1;
    let initial_state_len = 4;
    let initial_state = [0, 0, 0, 0];
    let next_state_len = 4;
    let next_state = [0, 0, 0, 0];
    let identity_len = 56;
    let identity = "3f368bf90c71946fc7b0cde9161ace42985d235f.ecdsa_secp256r1";
    let tx_hash_len = 43;
    let tx_hash = challenge;
    let payload_hash = 0x2cd4a07375bb18c67225f96dc94a459803676221c55d76cfbb28238e5279c86d as Field;

    main(
        version,
        initial_state_len,
        initial_state,
        next_state_len,
        next_state,
        identity_len,
        identity,
        tx_hash_len,
        tx_hash,
        payload_hash,
        program_outputs,
    );
}

#[test]
fn test_webauthn_verification_from_vibe_checker_243_bis() {
    let authenticator_data = [73,150,13,229,136,14,140,104,116,52,23,15,100,118,96,91,143,228,174,185,162,134,50,199,153,92,243,186,131,29,151,99,1,0,0,0,2];
    let client_data_json = [123,34,116,121,112,101,34,58,34,119,101,98,97,117,116,104,110,46,103,101,116,34,44,34,99,104,97,108,108,101,110,103,101,34,58,34,77,68,69,121,77,122,81,49,78,106,99,52,79,87,70,105,89,50,82,108,90,106,65,120,77,106,77,48,78,84,89,51,79,68,108,104,89,109,78,107,90,87,89,34,44,34,111,114,105,103,105,110,34,58,34,104,116,116,112,58,47,47,108,111,99,97,108,104,111,115,116,58,53,49,55,51,34,44,34,99,114,111,115,115,79,114,105,103,105,110,34,58,102,97,108,115,101,44,34,111,116,104,101,114,95,107,101,121,115,95,99,97,110,95,98,101,95,97,100,100,101,100,95,104,101,114,101,34,58,34,100,111,32,110,111,116,32,99,111,109,112,97,114,101,32,99,108,105,101,110,116,68,97,116,97,74,83,79,78,32,97,103,97,105,110,115,116,32,97,32,116,101,109,112,108,97,116,101,46,32,83,101,101,32,104,116,116,112,115,58,47,47,103,111,111,46,103,108,47,121,97,98,80,101,120,34,125,
        0,0,0,0,0,0,0,0,0,0,0,0 // Padding with 12 zeros (243+12 = 255) 
    ];
    let signature = [216,184,64,61,79,81,150,39,72,191,167,234,52,253,225,66,52,192,76,159,65,164,134,34,212,255,104,99,14,53,71,115,0,190,96,135,49,186,213,189,93,36,212,143,36,92,27,42,44,103,95,153,46,59,158,22,223,196,84,102,51,209,135,233];
    let challenge = [77,68,69,121,77,122,81,49,78,106,99,52,79,87,70,105,89,50,82,108,90,106,65,120,77,106,77,48,78,84,89,51,79,68,108,104,89,109,78,107,90,87,89];
    let pub_key_x = [35,250,194,235,47,86,159,70,36,137,145,195,83,245,203,137,12,28,43,171,167,226,44,90,199,107,235,0,229,229,133,67];
    let pub_key_y = [84,107,152,100,72,140,98,57,186,30,76,187,129,194,209,158,96,37,254,211,60,198,27,227,167,247,204,51,145,53,120,95];

    let program_outputs = ProgramOutputs {
        authenticator_data,
        client_data_json_len: 243,
        client_data_json,
        signature,
        pub_key_x,
        pub_key_y,
    };

    let version = 1;
    let initial_state_len = 4;
    let initial_state = [0, 0, 0, 0];
    let next_state_len = 4;
    let next_state = [0, 0, 0, 0];
    let identity_len = 56;
    let identity = "ae0e5100ea7d28905ce690194c0717cd93756a20.ecdsa_secp256r1";
    let tx_hash_len = 43;
    let tx_hash = challenge;
    let payload_hash = 0x25c2c8e15ffcf1cfb9193d9663186fe76764564274a65d719b087d972b45fd11 as Field;

    main(
        version,
        initial_state_len,
        initial_state,
        next_state_len,
        next_state,
        identity_len,
        identity,
        tx_hash_len,
        tx_hash,
        payload_hash,
        program_outputs,
    );
}
