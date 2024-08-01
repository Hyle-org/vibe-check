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
    }).catch(e => console.log(e));
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

export async function broadcastPayloadTx(identity: string, ecdsaPayload: Uint8Array, smilePayload: string, erc20Payload: string) {
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
        const resp2 =  await checkTxStatus(hash);
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
