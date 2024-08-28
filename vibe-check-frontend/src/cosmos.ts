import { checkContractExists, registerContract, base64ToUint8Array, broadcastPayloadTx } from "hyle-js";
import { hashBalance } from "./smart_contracts/cairo/CairoHash.ts";
import { network } from "./network.ts";
import {
    computeSmileTokenPayload,
    computeSmilePayload,
    computeWebAuthnPayload,
    type CairoSmileTokenPayloadArgs,
    type CairoSmilePayloadArgs,
    type ECDSAPayloadArgs,
    PayloadTx,
} from "./smart_contracts/SmartContract.ts";
import { DeliverTxResponse } from "@cosmjs/stargate";

export async function broadcastVibeCheckPayload(
    identity: string,
    webAuthnValues: ECDSAPayloadArgs,
    smileArgs: CairoSmilePayloadArgs,
    smileTokenArgs: CairoSmileTokenPayloadArgs,
): Promise<[PayloadTx, DeliverTxResponse]> {
    let payloadTx = {
        identity: identity,
        payloads: [
            {
                contractName: "ecdsa_secp256r1",
                data: window.btoa(computeWebAuthnPayload(webAuthnValues)),
            },
            {
                contractName: "smile",
                data: window.btoa(computeSmilePayload(smileArgs)),
            },
            {
                contractName: "smile_token",
                data: window.btoa(computeSmileTokenPayload(smileTokenArgs)),
            },
        ]
    }
    return [payloadTx, await broadcastPayloadTx(payloadTx.identity, payloadTx.payloads)];
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
            "cairo",
            "smile_token",
            new Uint8Array([213]),
            new Uint8Array(initialBalanceHash.split("").map((x) => x.charCodeAt(0))),
        );
    }
    exists = await checkContractExists(network, "smile");
    if (!exists) {
        await registerContract(
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
            "noir",
            "ecdsa_secp256r1",
            vKey,
            new Uint8Array([0, 0, 0, 0]), // TODO: add Nonce in digest?
        );
    }
}
