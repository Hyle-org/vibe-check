import { ref } from "vue";
import { broadcastProofTx, checkTxesStatus, MsgPublishPayloads, uint8ArrayToBase64 } from "hyle-js";

import { proveSmile, proveSmileTokenTransfer } from "@/smart_contracts/cairo/prover";
import { proveECDSA } from "@/smart_contracts/noir/prover";
import { CairoSmileArgs, CairoSmileTokenArgs, ECDSAArgs } from "./SmartContract";
import { getBalances } from "./SmileTokenIndexer";

export function useProving(
    status = ref("idle" as "idle" | "proving" | "checking_tx" | "tx_success" | "tx_failure" | "failed_at_proving"),
    error = ref<string | null>(null),
    sentTxHash = ref<string | null>(null),
) {
    const ecdsaPromiseDone = ref(false);
    const smilePromiseDone = ref(false);
    const smileTokenPromiseDone = ref(false);

    function getPayload(parsedTransaction: MsgPublishPayloads | undefined){
        if (!parsedTransaction) return undefined;
        return parsedTransaction.payloads?.data;
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
            smilePromise.then(() => (smilePromiseDone.value = true));
            smileTokenPromise.then(() => (smileTokenPromiseDone.value = true));

            // Send the proofs transactions
            // The order we expect them is the order they're most likely going to finish in.
            const ecdsaResp = await broadcastProofTx(txHash, 0, "ecdsa_secp256r1", uint8ArrayToBase64(await ecdsaPromise));
            const smileTokenResp = await broadcastProofTx(txHash, 2, "smile_token", uint8ArrayToBase64(await smileTokenPromise));
            const smileResp = await broadcastProofTx(txHash, 1, "smile", uint8ArrayToBase64(await smilePromise));
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

    const computePayloadsAndProve = async (payloadTx: { identity: string; payloads: { contractsName: string[]; data: string; }; }, txHash: string) => {
        // for webauthn
        const ecdsaArgs: ECDSAArgs = {
            identity: payloadTx.identity,
            payloads: payloadTx.payloads.data,
        };
        // for smile
        const smileArgs: CairoSmileArgs = {
            identity: payloadTx.identity,
            payloads: payloadTx.payloads.data,
        };
        // for smileToken
        const smileTokenArgs: CairoSmileTokenArgs = {
            balances: getBalances(),
            payloads: payloadTx.payloads.data,
        };
    
        await proveAndSendProofsTx(txHash, ecdsaArgs, smileArgs, smileTokenArgs);
    }

    return {
        ecdsaPromiseDone,
        smilePromiseDone,
        smileTokenPromiseDone,
        status,
        error,
        sentTxHash,
        computePayloadsAndProve,
        getPayload
    };
}
