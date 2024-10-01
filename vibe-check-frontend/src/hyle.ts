import { checkContractExists, registerContract, base64ToUint8Array, broadcastBlobTx } from "hyle-js";
import { hashBalance } from "./smart_contracts/cairo/CairoHash.ts";
import { network } from "./network.ts";
import {
    type CairoSmileTokenBlobArgs,
    type CairoSmileBlobArgs,
    type ECDSABlobArgs,
    computeWebAuthnBlob,
    computeSmileBlob,
    computeSmileTokenBlob,
    BlobTx,
} from "./smart_contracts/SmartContract.ts";

export async function broadcastVibeCheckBlob(
    identity: string,
    webAuthnValues: ECDSABlobArgs,
    smileArgs: CairoSmileBlobArgs,
    smileTokenArgs: CairoSmileTokenBlobArgs,
): Promise<[BlobTx, string]> {
    let blobTx: BlobTx = {
        identity: identity,
        blobs: [
            {
                contractName: "ecdsa_secp256r1",
                data: computeWebAuthnBlob(webAuthnValues),
            },
            {
                contractName: "smile",
                data: computeSmileBlob(smileArgs),
            },
            {
                contractName: "smile_token",
                data: computeSmileTokenBlob(smileTokenArgs),
            },
        ]
    }
    return [blobTx, await broadcastBlobTx(network, blobTx.identity, blobTx.blobs)];
}

export async function ensureContractsRegistered() {
    let exists = await checkContractExists(network, "smile_token");
    if (!exists) {
        const initialBalanceHash = hashBalance([
            {
                name: "faucet",
                amount: 1000000,
            },
        ]);
        await registerContract(
            network,
            "cairo",
            "smile_token",
            new Uint8Array([213]),
            new Uint8Array(initialBalanceHash.split("").map((x) => x.charCodeAt(0))),
        );
    }
    exists = await checkContractExists(network, "smile");
    if (!exists) {
        await registerContract(
            network,
            "cairo",
            "smile",
            new Uint8Array([123]),
            new Uint8Array("666".split("").map((x) => x.charCodeAt(0))),
        );
    }
    exists = await checkContractExists(network, "ecdsa_secp256r1");
    if (!exists) {
        const b64vKey =
            "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";
        const vKey = base64ToUint8Array(b64vKey);
        await registerContract(
            network,
            "noir",
            "ecdsa_secp256r1",
            vKey,
            new Uint8Array([0, 0, 0, 0]), // TODO: add Nonce in digest?
        );
    }
}
