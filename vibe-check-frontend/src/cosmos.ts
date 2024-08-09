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
import { uint8ArrayToBase64 } from "./utils.ts";

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
    }).catch((e) => console.log(e));
}

export async function broadcastProofTx(txHash: string, payloadIndex: number, contractName: string, proof: string) {
    const msgAny = {
        typeUrl: "/hyle.zktx.v1.MsgPublishPayloadProof",
        value: {
            txHash: Buffer.from(txHash, "hex").toString("base64"),
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

export async function broadcastPayloadTx(
    identity: string,
    ecdsaPayload: string,
    smilePayload: string,
    erc20Payload: string,
) {
    const msgAny = {
        typeUrl: "/hyle.zktx.v1.MsgPublishPayloads",
        value: {
            payloads: [
                {
                    contractName: "ecdsa_secp256r1",
                    data: ecdsaPayload, // ATM we don't process noir payload. This value might change in the future
                },
                {
                    contractName: "smile",
                    data: smilePayload,
                },
                {
                    contractName: "smile_token",
                    data: erc20Payload,
                },
            ],
            identity: identity,
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
        const resp2 = await checkTxStatus(hash);
        if (resp2.status == "failed") {
            return resp2;
        }
    }
    return {
        status: "success",
    };
}

export async function checkTxStatus(hash: string) {
    const resp = await client.getTx(hash);
    if (resp?.code !== 0) {
        return {
            status: "failed",
            error: resp?.rawLog || "unknown error",
        };
    }
    return {
        status: "success",
    };
}
export async function ensureContractsRegistered() {
    const checkExists = await fetch(`${getNetworkApiUrl()}/hyle/zktx/v1/contract/smile_token`);
    if ((await checkExists.json())?.contract?.program_id == "1Q==") {
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
