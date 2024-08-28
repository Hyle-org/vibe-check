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
