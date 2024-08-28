import { BarretenbergBackend, CompiledCircuit } from "@noir-lang/backend_barretenberg";
import webAuthnCircuit from "../target/webauthn.json";
import * as fs from "fs";


export const exportNoirVerificationKey = async (webAuthnCircuit: CompiledCircuit) => {
    // Circuit tools setup
    const backend = new BarretenbergBackend(webAuthnCircuit, { threads: 4 });
    let verificationKey = await backend.getVerificationKey();
    var b64VerificationKey = btoa(String.fromCharCode.apply(null, new Uint8Array(verificationKey)));
    fs.writeFileSync('../target/vkey', verificationKey);
    fs.writeFileSync('../target/vkey.b64', b64VerificationKey);
    
    return;
}

await exportNoirVerificationKey(webAuthnCircuit as CompiledCircuit);

process.exit();