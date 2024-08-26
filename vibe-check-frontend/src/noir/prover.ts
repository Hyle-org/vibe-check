import { BarretenbergBackend, CompiledCircuit } from "@noir-lang/backend_barretenberg";
import { Noir } from "@noir-lang/noir_js";
import webAuthnCircuit from "./webauthn.json";
import { getWebAuthnIdentity } from "../webauthn";

// Circuit tools setup
// Preloaded so the server starts downloading early and minimize latency.
const backend = new BarretenbergBackend(webAuthnCircuit as CompiledCircuit, { threads: 4 });
const noir = new Noir(webAuthnCircuit as CompiledCircuit, backend);
noir.generateProof({}).catch((_) => {
    import("@aztec/bb.js");
});

export const proveECDSA = async (webAuthnValues: Record<string, any>) => {
    const noirInput = {
        // TODO: remove generic values
        version: 1,
        initial_state_len: 4,
        initial_state: [0, 0, 0, 0],
        next_state_len: 4,
        next_state: [0, 0, 0, 0],
        identity_len: 56,
        identity: webAuthnValues.identity,
        tx_hash_len: 43,
        tx_hash: webAuthnValues.challenge,
        payload_hash: 0,
        success: true,
        program_outputs: {
            authenticator_data: webAuthnValues.authenticator_data,
            client_data_json_len: webAuthnValues.client_data_json_len,
            client_data_json: webAuthnValues.client_data_json,
            signature: webAuthnValues.signature,
            pub_key_x: webAuthnValues.pub_key_x,
            pub_key_y: webAuthnValues.pub_key_y,
        },
    };
    // Proving
    const proof = await noir.generateProof(noirInput);
    return JSON.stringify({
        publicInputs: proof.publicInputs,
        proof: Array.from(proof.proof),
    });
};
