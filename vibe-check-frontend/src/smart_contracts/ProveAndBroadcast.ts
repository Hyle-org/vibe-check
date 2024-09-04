import { ref } from "vue";
import {
    broadcastProofTx,
    checkTxesStatus,
    getNetworkRpcUrl,
    MsgPublishPayloads,
    setupCosmos,
    uint8ArrayToBase64,
} from "hyle-js";

import { proveSmile, proveSmileTokenTransfer } from "@/smart_contracts/cairo/prover";
import { proveECDSA } from "@/smart_contracts/noir/prover";
import { CairoSmileArgs, CairoSmileTokenArgs, computePayload, ECDSAArgs } from "./SmartContract";
import { getBalances } from "./SmileTokenIndexer";
import { network } from "@/network";

export function useProving(
    status = ref("idle" as "idle" | "proving" | "checking_tx" | "tx_success" | "tx_failure" | "failed_at_proving"),
    error = ref<string | null>(null),
    sentTxHash = ref<string | null>(null),
) {
    const ecdsaPromiseDone = ref(false);
    const smilePromiseDone = ref(false);
    const smileTokenPromiseDone = ref(false);

    function getPayload(parsedTransaction: MsgPublishPayloads | undefined, contract: string) {
        if (!parsedTransaction) return undefined;
        return parsedTransaction.payloads.find((x) => x.contractName === contract)?.data;
    }

    function getIdentity(parsedTransaction: MsgPublishPayloads | undefined) {
        return parsedTransaction?.identity ?? "";
    }

    const proveAndSendProofsTx = async (
        txHash: string,
        ecdsaArgs: ECDSAArgs,
        smileArgs: CairoSmileArgs,
        smileTokenArgs: CairoSmileTokenArgs,
    ) => {
        ecdsaPromiseDone.value = false;
        smilePromiseDone.value = false;
        smileTokenPromiseDone.value = false;
        status.value = "proving";
        try {
            const ecdsaPromise = proveECDSA(ecdsaArgs);
            const smilePromise = proveSmile(smileArgs);
            const smileTokenPromise = proveSmileTokenTransfer(smileTokenArgs);

            ecdsaPromise.then(() => (ecdsaPromiseDone.value = true));
            smileTokenPromise.then(() => (smileTokenPromiseDone.value = true));
            smilePromise.then(() => (smilePromiseDone.value = true));

            // Send the proofs transactions
            // The order we expect them is the order they're most likely going to finish in.
            const smileTokenResp = await broadcastProofTx(
                txHash,
                2,
                "smile_token",
                uint8ArrayToBase64(await smileTokenPromise),
            );
            const smileResp = await broadcastProofTx(txHash, 1, "smile", uint8ArrayToBase64(await smilePromise));
            const ecdsaResp = await broadcastProofTx(
                txHash,
                0,
                "ecdsa_secp256r1",
                uint8ArrayToBase64(await ecdsaPromise),
            );
            console.log("ecdsaProofTx: ", ecdsaResp.transactionHash);
            console.log("smileProofTx: ", smileResp.transactionHash);
            console.log("smileTokenProofTx: ", smileTokenResp.transactionHash);
            // Switch to waiter view
            status.value = "checking_tx";

            // Check the status of the TX
            const txStatus = await checkTxesStatus([
                ecdsaResp.transactionHash,
                smileResp.transactionHash,
                smileTokenResp.transactionHash,
            ]);
            if (txStatus.status === "success") {
                status.value = "tx_success";
                sentTxHash.value = smileTokenResp.transactionHash;
            } else {
                status.value = "tx_failure";
                error.value = txStatus.error || "Unknown error";
            }
        } catch (e) {
            console.error(e);
            error.value = `${e}`;
            status.value = "failed_at_proving";
        }
    };

    const computePayloadsAndProve = async (parsedTransaction: MsgPublishPayloads | undefined, txHash: string) => {
        const cosmos = setupCosmos(getNetworkRpcUrl(network)!);
        // getting each payloads to process the main payload
        let payloadWebAuthn = getPayload(parsedTransaction, "ecdsa_secp256r1");
        let payloadSmile = getPayload(parsedTransaction, "smile");
        let payloadSmileToken = getPayload(parsedTransaction, "smile_token");
        let gatheredPayloads = computePayload(payloadWebAuthn, payloadSmile, payloadSmileToken);

        // getting values needed to prove each contract
        let identity = getIdentity(parsedTransaction);

        // for webauthn
        const ecdsaArgs: ECDSAArgs = {
            identity: identity,
            payloads: gatheredPayloads,
        };
        // for smile
        const smileArgs: CairoSmileArgs = {
            identity: identity,
            payloads: gatheredPayloads,
        };
        // for smileToken
        const smileTokenArgs: CairoSmileTokenArgs = {
            balances: getBalances(),
            payloads: gatheredPayloads,
        };

        await cosmos;
        await proveAndSendProofsTx(txHash, ecdsaArgs, smileArgs, smileTokenArgs);
    };

    return {
        ecdsaPromiseDone,
        smilePromiseDone,
        smileTokenPromiseDone,
        status,
        error,
        sentTxHash,
        computePayloadsAndProve,
        getPayload,
    };
}
