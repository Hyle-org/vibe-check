import { AccountData, DirectSecp256k1HdWallet, Registry } from "@cosmjs/proto-signing";
import { SigningStargateClient, defaultRegistryTypes } from "@cosmjs/stargate";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";

// A message type auto-generated from .proto files using ts-proto. @cosmjs/stargate ships some
// common types but don't rely on those being available. You need to set up your own code generator
// for the types you care about. How this is done should be documented, but is not yet:
// https://github.com/cosmos/cosmjs/issues/640
import { MsgRegisterContract, MsgPublishPayloadProof, MsgPublishPayloads } from "./proto/tx.ts";
import { hashBalance } from "./cairo/CairoHash";
import { getNetworkApiUrl } from "./network.ts";

const mnemonic =
    "surround miss nominee dream gap cross assault thank captain prosper drop duty group candy wealth weather scale put";

let client: SigningStargateClient;
let firstAccount: AccountData;

export async function setupCosmos(address: string) {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "hyle" });
    [firstAccount] = await wallet.getAccounts();

    const rpcEndpoint = address;
    client = await SigningStargateClient.connectWithSigner(rpcEndpoint, wallet, {
        registry: new Registry([
            ...defaultRegistryTypes,
            ["/hyle.zktx.v1.MsgPublishPayloads", MsgPublishPayloads],
            ["/hyle.zktx.v1.MsgPublishPayloadProof", MsgPublishPayloadProof],
            ["/hyle.zktx.v1.MsgRegisterContract", MsgRegisterContract],
        ]),
    }).catch(e => console.log(e));
}

export function uint8ArrayToBase64(array: Uint8Array): string {
    if (typeof Buffer !== "undefined") return Buffer.from(array).toString("base64");
    // Work around call stack issues with large arrays
    const CHUNK_SIZE = 0x8000;
    let index = 0;
    const length = array.length;
    let result = "";
    while (index < length) {
        const end = Math.min(length, index + CHUNK_SIZE);
        result += String.fromCharCode.apply(null, array.slice(index, end));
        index = end;
    }
    return btoa(result);
}

export async function broadcastProofTx(txHash: string, payloadIndex: number, contractName: string, proof: string) {
    const msgAny = {
        typeUrl: "/hyle.zktx.v1.MsgPublishPayloadProof",
        value: {
            txHash: Buffer.from(txHash, 'hex').toString('base64'),
            payloadIndex: payloadIndex,
            contractName: contractName,
            proof: proof,
        },
    };
    const fee = {
        amount: [
            {
                denom: "hyle",
                amount: "2000",
            },
        ],
        gas: "180000", // 180k
    };
    const signedTx = await client.sign(firstAccount.address, [msgAny], fee, "", {
        accountNumber: 1,
        sequence: 1,
        chainId: "hyle",
    });
    // For now our transactions are always included.
    return await client.broadcastTx(Uint8Array.from(TxRaw.encode(signedTx).finish()));
}

export async function broadcastPayloadTx(ecdsaPayload: Uint8Array, smilePayload: string, erc20Payload: string) {
    const msgAny = {
        typeUrl: "/hyle.zktx.v1.MsgPublishPayloads",
        value: {
            payloads: [
                {
                    contractName: "ecdsa_secp256r1",
                    data: uint8ArrayToBase64(ecdsaPayload), // ATM we don't process noir payload. This value might change in the future
                },
                {
                    contractName: "smile_token",
                    data: window.btoa(erc20Payload),
                },
                {
                    contractName: "smile",
                    data: window.btoa(smilePayload),
                },
            ],
        },
    };
    const fee = {
        amount: [
            {
                denom: "hyle",
                amount: "2000",
            },
        ],
        gas: "180000", // 180k
    };
    const signedTx = await client.sign(firstAccount.address, [msgAny], fee, "", {
        accountNumber: 1,
        sequence: 1,
        chainId: "hyle",
    });
    // For now our transactions are always included.
    return await client.broadcastTx(Uint8Array.from(TxRaw.encode(signedTx).finish()));
}

export async function checkTxStatuses(hashes: string[]) {
    for (const hash of hashes) {
        const resp = await client.getTx(hash);
        if (resp?.code !== 0) {
            return {
                status: "failed",
                error: resp?.rawLog || "unknown error for tx "+hash,
            };
        }
    }
    return {
        status: "success",
    };
}

export async function ensureContractsRegistered() {
    const checkExists = await fetch(`${getNetworkApiUrl()}/hyle/zktx/v1/contract/smile_token`);
    if ((await checkExists.json()).contract.program_id == "1Q==") {
        return;
    }

    const initialBalanceHash = hashBalance([
        {
            name: "faucet",
            amount: 1000000,
        },
    ]);
    // Creation of smile_token contract
    let msgAny = {
        typeUrl: "/hyle.zktx.v1.MsgRegisterContract",
        value: {
            owner: firstAccount.address,
            verifier: "cairo",
            contractName: "smile_token",
            programId: new Uint8Array([213]),
            stateDigest: new Uint8Array(initialBalanceHash.split("").map((x) => x.charCodeAt(0))),
        } as MsgRegisterContract,
    };
    const fee = {
        amount: [
            {
                denom: "hyle",
                amount: "2000",
            },
        ],
        gas: "180000", // 180k
    };
    let signedTx = await client.sign(firstAccount.address, [msgAny], fee, "", {
        accountNumber: 1,
        sequence: 1,
        chainId: "hyle",
    });
    client.broadcastTx(Uint8Array.from(TxRaw.encode(signedTx).finish()));

    // Creation for smile contract
    msgAny = {
        typeUrl: "/hyle.zktx.v1.MsgRegisterContract",
        value: {
            owner: firstAccount.address,
            verifier: "cairo",
            contractName: "smile",
            programId: new Uint8Array([123]),
            stateDigest: new Uint8Array("666".split("").map((x) => x.charCodeAt(0))),
        } as MsgRegisterContract,
    };
    signedTx = await client.sign(firstAccount.address, [msgAny], fee, "", {
        accountNumber: 1,
        sequence: 2,
        chainId: "hyle",
    });
    client.broadcastTx(Uint8Array.from(TxRaw.encode(signedTx).finish()));

    // Creation of ECDSA contract
    const b64vKey =
        "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";
    const vKey = Uint8Array.from(Buffer.from(b64vKey, "base64"));
    msgAny = {
        typeUrl: "/hyle.zktx.v1.MsgRegisterContract",
        value: {
            owner: firstAccount.address,
            verifier: "noir",
            contractName: "ecdsa_secp256r1",
            programId: vKey,
            stateDigest: new Uint8Array([0, 0, 0, 0]), // TODO: add Nonce in digest?
        } as MsgRegisterContract,
    };
    signedTx = await client.sign(firstAccount.address, [msgAny], fee, "", {
        accountNumber: 1,
        sequence: 3,
        chainId: "hyle",
    });
    await client.broadcastTx(Uint8Array.from(TxRaw.encode(signedTx).finish()));
}
