import { BarretenbergBackend, CompiledCircuit  } from '@noir-lang/backend_barretenberg';
import { InputMap, Noir } from '@noir-lang/noir_js';
import * as fs from 'fs';

// Loading circuit
import circuit from "../target/webauthn.json";

/////// LOCAL PROOF CREATION /////////
// Proving
const program_outputs: InputMap = {
    authenticator_data: [73,150,13,229,136,14,140,104,116,52,23,15,100,118,96,91,143,228,174,185,162,134,50,199,153,92,243,186,131,29,151,99,1,0,0,0,2],
    client_data_json_len: 134,
    client_data_json: [123,34,116,121,112,101,34,58,34,119,101,98,97,117,116,104,110,46,103,101,116,34,44,34,99,104,97,108,108,101,110,103,101,34,58,34,77,68,69,121,77,122,81,49,78,106,99,52,79,87,70,105,89,50,82,108,90,106,65,120,77,106,77,48,78,84,89,51,79,68,108,104,89,109,78,107,90,87,89,34,44,34,111,114,105,103,105,110,34,58,34,104,116,116,112,58,47,47,108,111,99,97,108,104,111,115,116,58,53,49,55,51,34,44,34,99,114,111,115,115,79,114,105,103,105,110,34,58,102,97,108,115,101,125,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // Padding with 121 zeros (134+121 = 255) 
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0
    ],
    signature: [80,114,197,245,128,150,206,160,135,105,51,205,42,143,25,53,119,97,166,196,95,98,53,63,168,171,63,85,41,42,196,134,26,198,126,179,109,99,41,92,86,45,240,238,196,106,77,219,146,196,183,80,225,170,66,218,169,244,230,252,61,213,29,201],
    pub_key_x: [201,91,99,172,65,154,80,154,189,195,194,210,62,219,224,36,43,134,143,236,137,178,121,35,112,146,103,238,37,100,145,26],
    pub_key_y: [169,8,63,83,58,93,192,39,114,115,138,176,56,254,162,127,93,19,156,93,51,9,194,161,253,10,203,128,171,254,255,83],
};

var noirInput = {} as Record<string, Array<number> | number | String | any>;
noirInput.version = 1;
noirInput.initial_state_len = 4;
noirInput.initial_state = [0, 0, 0, 0];
noirInput.next_state_len = 4;
noirInput.next_state = [0, 0, 0, 0];
noirInput.identity_len = 56;
noirInput.identity = "c59b18d3bdaccb4d689048559a9bb6e8265293bf.ecdsa_secp256r1";
noirInput.tx_hash_len = 43;
noirInput.tx_hash = [77,68,69,121,77,122,81,49,78,106,99,52,79,87,70,105,89,50,82,108,90,106,65,120,77,106,77,48,78,84,89,51,79,68,108,104,89,109,78,107,90,87,89,];
noirInput.program_outputs = program_outputs;

// Circuit tools setup
const backend = new BarretenbergBackend(circuit as CompiledCircuit);
const verificationKey = await backend.getVerificationKey();

const noir = new Noir(circuit as CompiledCircuit, backend);
const proof = await noir.generateProof(noirInput);

var jsonProof = JSON.stringify({
    ...proof,
    proof: Array.from(proof.proof)
});
fs.writeFileSync('../target/proof.json', jsonProof);
fs.writeFileSync('../target/vkey', verificationKey);

process.exit();