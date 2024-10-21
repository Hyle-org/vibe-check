import * as fs from "fs";
import { broadcastVibeCheckBlob, ensureContractsRegistered } from "../src/hyle";
import { broadcastProofTx, uint8ArrayToBase64, checkTxStatus, checkTxesStatus } from "hyle-js";

import * as ecdsaBlob from "../proofs/ecdsa.blob.json";
import * as smileBlob from "../proofs/smile.blob.json";
import * as smileTokenBlob from "../proofs/smile_token.blob.json";
import { network } from "../src/network";

async function checkDigest() {
    const checkExists = await fetch("http://localhost:4321/v1/history/contract/smile_token");
    console.log("state digest is now", (await checkExists.json()).state_digest);
}

// TODO Change value to match what's saved in files
let identity = "c59b18d3bdaccb4d689048559a9bb6e8265293bf.ecdsa_secp256r1";
let smileTokenProof: Uint8Array;
let smileProof: Uint8Array;
let ecdsaProof: string;

// Loading proofs
smileTokenProof = new Uint8Array(fs.readFileSync("./proofs/smile_token.proof", null));
smileProof = new Uint8Array(fs.readFileSync("./proofs/smile.proof", null));
ecdsaProof = fs.readFileSync("./proofs/ecdsa.json", "utf-8");



await ensureContractsRegistered();

await new Promise((resolve) => setTimeout(resolve, 2000));
await checkDigest();

// Send the blobs transaction
let [blobTx, blobTxHash] = await broadcastVibeCheckBlob(
    identity,
    ecdsaBlob,
    smileBlob,
    smileTokenBlob,
);

// Check that Tx is successful
const txStatus = await checkTxStatus(network, blobTxHash);
if (txStatus.status === "success") {
    console.log("BlobTx successful. txHash: ", blobTxHash);
} else {
    console.log("BlobTx failed. txHash: ", blobTxHash);
    console.log(txStatus.error || "Unknown error");
    process.exit();
}

// Send the proofs transactions
const ecdsaProofTxHash = await broadcastProofTx(network, blobTxHash, 0, "ecdsa_secp256r1", ecdsaProof);
const smileTokenProofTxHash = await broadcastProofTx(network, 
    blobTxHash,
    1,
    "smile_token",
    uint8ArrayToBase64(smileTokenProof),
);
const smileProofTxHash = await broadcastProofTx(network, blobTxHash, 2, "smile", uint8ArrayToBase64(smileProof));

// Check the status of the proofs TX
const proofTxStatus = await checkTxesStatus(network, [
    ecdsaProofTxHash,
    smileTokenProofTxHash,
    smileProofTxHash,
]);
if (proofTxStatus.status === "success") {
    console.log("ProofTx successful. txHashes: ", blobTxHash);
    console.log("ecdsa: ", ecdsaProofTxHash);
    console.log("erc20: ", smileTokenProofTxHash);
    console.log("smile: ", smileProofTxHash);
} else {
    console.log("ProofTx failed.");
    console.log("ecdsa: ", ecdsaProofTxHash);
    console.log("erc20: ", smileTokenProofTxHash);
    console.log("smile: ", smileProofTxHash);
    console.log(txStatus.error || "Unknown error");
    process.exit();
}

await checkDigest();
