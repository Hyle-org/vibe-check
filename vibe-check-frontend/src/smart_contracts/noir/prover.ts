import { BarretenbergBackend, CompiledCircuit } from "@noir-lang/backend_barretenberg";
import { Noir } from "@noir-lang/noir_js";
import webAuthnCircuit from "./webauthn.json";
import { ECDSAArgs } from "../SmartContract";

// Circuit tools setup
// Preloaded so the server starts downloading early and minimize latency.
const backend = new BarretenbergBackend(webAuthnCircuit as CompiledCircuit, { threads: 4 });
const noir = new Noir(webAuthnCircuit as CompiledCircuit, backend);
noir.generateProof({}).catch((_) => {
    import("@aztec/bb.js");
});

export const proveECDSA = async (args: ECDSAArgs) => {
    let initial_state = [0, 0, 0, 0];
    let next_state = [0, 0, 0, 0];
    let tx_hash = [0];
    const noirInput = {
        // TODO: remove generic values
        version: 1,
        initial_state_len: initial_state.length,
        initial_state: initial_state,
        next_state_len: next_state.length,
        next_state: next_state,
        identity_len: args.identity,
        identity: args.identity,
        tx_hash_len: tx_hash.length,
        tx_hash: tx_hash,
        success: true,
        payloads: args.payloads.slice(1, -1).split(" "), // contains all the webauthn values, parsed as in Cairo
    };
    // Proving
    console.log("noir input:", noirInput);    
    const proof = await noir.generateProof(noirInput);
    return JSON.stringify({
        publicInputs: proof.publicInputs,
        proof: Array.from(proof.proof),
    });
};
