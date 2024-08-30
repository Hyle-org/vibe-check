import { checkContractExists, registerContract, base64ToUint8Array, broadcastPayloadTx } from "hyle-js";
import { hashBalance } from "./smart_contracts/cairo/CairoHash.ts";
import { network } from "./network.ts";
import {
    type CairoSmileTokenPayloadArgs,
    type CairoSmilePayloadArgs,
    type ECDSAPayloadArgs,
    computeWebAuthnPayload,
    computeSmilePayload,
    computeSmileTokenPayload,
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
