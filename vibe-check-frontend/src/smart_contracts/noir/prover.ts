import { BarretenbergBackend, CompiledCircuit } from "@noir-lang/backend_barretenberg";
import { Noir } from "@noir-lang/noir_js";
import webAuthnCircuit from "./webauthn.json";
import { ECDSAArgs } from "../SmartContract";
import { getNoirProverUrl } from "@/network";

// Circuit tools setup
// Preloaded so the server starts downloading early and minimize latency.
const backend = new BarretenbergBackend(webAuthnCircuit as CompiledCircuit, { threads: 4 });
const noir = new Noir(webAuthnCircuit as CompiledCircuit);

noir.execute({}).catch((_) => {
    import("@aztec/bb.js");
});

export const proveECDSA = async (args: ECDSAArgs) => {
    let initial_state: number[] = [0, 0, 0, 0];
    let next_state: number[] = [0, 0, 0, 0];
    let tx_hash: number[] = [];
    const noirInput = {
        version: 1,
        initial_state_len: initial_state.length,
        initial_state: initial_state,
        next_state_len: next_state.length,
        next_state: next_state,
        identity_len: args.identity.length,
        identity: args.identity,
        tx_hash_len: tx_hash.length,
        tx_hash: tx_hash,
        success: true,
        index: 0,
        payloads: args.payloads.slice(1, -1).split(" "), // contains all the webauthn values, parsed as in Cairo
    };
    // Executing
    const { witness } = await noir.execute(noirInput);

    // Proving
    // const proof = await backend.generateProof(witness);
    
    // Delegating proving to external service for performance
    const requestOptions: RequestInit = {
        method: "POST",
        headers: {
            "Content-Type": "application/octet-stream",
        },
        body: Buffer.from(witness),
    };

    let proveResponse = await fetch(getNoirProverUrl() + "/prove-ecdsa", requestOptions);

    if (!proveResponse.ok) {
        throw new Error(`Failed to prove noir. Server responded with status ${proveResponse.status}`);
    }
    
    const proof = new Uint8Array(await proveResponse.arrayBuffer());

    return proof;
};
