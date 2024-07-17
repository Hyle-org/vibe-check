import { AccountData, DirectSecp256k1HdWallet, Registry } from "@cosmjs/proto-signing";
import { SigningStargateClient, defaultRegistryTypes } from "@cosmjs/stargate";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";

// A message type auto-generated from .proto files using ts-proto. @cosmjs/stargate ships some
// common types but don't rely on those being available. You need to set up your own code generator
// for the types you care about. How this is done should be documented, but is not yet:
// https://github.com/cosmos/cosmjs/issues/640
import { MsgExecuteStateChanges, MsgRegisterContract } from "./proto/tx.ts";
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
            ["/hyle.zktx.v1.MsgExecuteStateChanges", MsgExecuteStateChanges],
            ["/hyle.zktx.v1.MsgRegisterContract", MsgRegisterContract],
        ]),
    }).catch(e => console.log(e));
}

function uint8ArrayToBase64(array: Uint8Array): string {
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

export async function broadcastTx(ecdsaProof: string, smileProof: Uint8Array, erc20Proof: Uint8Array) {
    const msgAny = {
        typeUrl: "/hyle.zktx.v1.MsgExecuteStateChanges",
        value: {
            stateChanges: [
                {
                    contractName: "ecdsa_secp256r1",
                    proof: window.btoa(ecdsaProof),
                },
                {
                    contractName: "smile_token",
                    proof: uint8ArrayToBase64(erc20Proof),
                },
                {
                    contractName: "smile",
                    proof: uint8ArrayToBase64(smileProof),
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
