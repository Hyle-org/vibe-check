import { checkContractExists, registerContract, base64ToUint8Array, broadcastPayloadTx } from "hyle-js";
import { hashBalance } from "./smart_contracts/cairo/CairoHash.ts";
import { network } from "./network.ts";
import {
    computeErc20Payload,
    computeSmilePayload,
    type CairoArgs,
    type CairoSmileArgs,
    type ECDSAArgs,
} from "./smart_contracts/SmartContract.ts";

export function broadcastVibeCheckPayload(
    identity: string,
    webAuthnValues: ECDSAArgs,
    smileArgs: CairoSmileArgs,
    erc20Args: CairoArgs,
) {
    return broadcastPayloadTx(identity, [
        {
            contractName: "ecdsa_secp256r1",
            data: window.btoa(JSON.stringify(webAuthnValues)),
        },
        {
            contractName: "smile",
            data: window.btoa(computeSmilePayload(smileArgs)),
        },
        {
            contractName: "smile_token",
            data: window.btoa(computeErc20Payload(erc20Args)),
        },
    ]);
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
