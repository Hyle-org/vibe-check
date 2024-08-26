import {
    broadcastPayloadTx,
    broadcastProofTx,
    checkTxStatus,
    checkTxStatuses,
    ensureContractsRegistered,
    setupCosmos,
} from "../src/cosmos";
import { proveERC20Transfer } from "../src/cairo/prover.ts";
import * as fs from "fs";
import { uint8ArrayToBase64 } from "../src/utils.ts";

const cosmos = setupCosmos("http://localhost:26657");

async function checkDigest() {
    const checkExists = await fetch("http://localhost:1317/hyle/zktx/v1/contract/smile_token");
    console.log("state digest is now", (await checkExists.json()).contract.state_digest);
}

let identity = "c59b18d3bdaccb4d689048559a9bb6e8265293bf.ecdsa_secp256r1";
let signature = [
    80, 114, 197, 245, 128, 150, 206, 160, 135, 105, 51, 205, 42, 143, 25, 53, 119, 97, 166, 196, 95, 98, 53, 63, 168,
    171, 63, 85, 41, 42, 196, 134, 26, 198, 126, 179, 109, 99, 41, 92, 86, 45, 240, 238, 196, 106, 77, 219, 146, 196,
    183, 80, 225, 170, 66, 218, 169, 244, 230, 252, 61, 213, 29, 201,
];
let smileTokenProof: Uint8Array;
let smileProof: Uint8Array;
let smileTokenPayload: string;
let smilePayload: string;
let ecdsaProof: string;

// Loading proofs and payloads
smileTokenPayload = fs.readFileSync("./proofs/smile_token.payload", "utf-8");
smilePayload = fs.readFileSync("./proofs/smile.payload", "utf-8");

smileTokenProof = new Uint8Array(fs.readFileSync("./proofs/smile_token.proof", null));
smileProof = new Uint8Array(fs.readFileSync("./proofs/smile.proof", null));
ecdsaProof = fs.readFileSync("./proofs/ecdsa.json", "utf-8");

await cosmos;
await ensureContractsRegistered();

await new Promise((resolve) => setTimeout(resolve, 2000));
await checkDigest();

// Send the payloads transaction
let payloadResp = await broadcastPayloadTx(
    identity,
    uint8ArrayToBase64(new Uint8Array(signature)),
    btoa(smilePayload),
    btoa(smileTokenPayload),
);

// Check that Tx is successful
const txStatus = await checkTxStatus(payloadResp.transactionHash);
if (txStatus.status === "success") {
    console.log("PayloadTx successful. txHash: ", payloadResp.transactionHash);
} else {
    console.log("PayloadTx failed. txHash: ", payloadResp.transactionHash);
    console.log(txStatus.error || "Unknown error");
    process.exit();
}

// Send the proofs transactions
const ecdsaResp = await broadcastProofTx(payloadResp.transactionHash, 0, "ecdsa_secp256r1", btoa(ecdsaProof));
const erc20Resp = await broadcastProofTx(
    payloadResp.transactionHash,
    1,
    "smile_token",
    uint8ArrayToBase64(smileTokenProof),
);
const smileResp = await broadcastProofTx(payloadResp.transactionHash, 2, "smile", uint8ArrayToBase64(smileProof));

// Check the status of the proofs TX
const proofTxStatus = await checkTxStatuses([
    ecdsaResp.transactionHash,
    erc20Resp.transactionHash,
    smileResp.transactionHash,
]);
if (proofTxStatus.status === "success") {
    console.log("PayloadTx successful. txHashes: ", payloadResp.transactionHash);
    console.log("ecdsa: ", ecdsaResp.transactionHash);
    console.log("erc20: ", erc20Resp.transactionHash);
    console.log("smile: ", smileResp.transactionHash);
} else {
    console.log("PayloadTx failed.");
    console.log("ecdsa: ", ecdsaResp.transactionHash);
    console.log("erc20: ", erc20Resp.transactionHash);
    console.log("smile: ", smileResp.transactionHash);
    console.log(txStatus.error || "Unknown error");
    process.exit();
}

await checkDigest();
