import { ref } from "vue";
import {
    broadcastProofTx,
    checkTxesStatus,
    MsgPublishPayloads,
    uint8ArrayToBase64,
} from "hyle-js";

import { proveSmile, proveSmileTokenTransfer } from "@/smart_contracts/cairo/prover";
import { proveECDSA } from "@/smart_contracts/noir/prover";
import { BlobTx, CairoSmileArgs, CairoSmileTokenArgs, computeBlob, ECDSAArgs } from "./SmartContract";
import { getBalances, getBalancesAtTx } from "./SmileTokenIndexer";
import { network } from "@/network";

export function useProving(
    status = ref("idle" as "idle" | "proving" | "checking_tx" | "tx_success" | "tx_failure" | "failed_at_proving"),
    error = ref<string | null>(null),
    sentTxHash = ref<string | null>(null),
) {
    const ecdsaPromiseDone = ref(false);
    const smilePromiseDone = ref(false);
    const smileTokenPromiseDone = ref(false);

    function getBlobs(parsedTransaction: MsgPublishPayloads | undefined, contract: string) {
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
            const smileTokenProofTxHash = await broadcastProofTx(
                network,
                txHash,
                2,
                "smile_token",
                uint8ArrayToBase64(await smileTokenPromise),
            );
            const smileProofTxHash = await broadcastProofTx(network, txHash, 1, "smile", uint8ArrayToBase64(await smilePromise));
            const ecdsaProofTxHash = await broadcastProofTx(
                network,
                txHash,
                0,
                "ecdsa_secp256r1",
                await ecdsaPromise,
            );
            console.log("ecdsaProofTx: ", ecdsaProofTxHash);
            console.log("smileProofTx: ", smileProofTxHash);
            console.log("smileTokenProofTx: ", smileTokenProofTxHash);
            // Switch to waiter view
            status.value = "checking_tx";

            // Check the status of the TX
            const txStatus = await checkTxesStatus(
                network,
                [
                    ecdsaProofTxHash,
                    smileProofTxHash,
                    smileTokenProofTxHash,
                ]
            );
            if (txStatus.status === "success") {
                status.value = "tx_success";
                sentTxHash.value = smileTokenProofTxHash;
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

    const computeBlobsAndProve = async (blobTx: BlobTx, txHash: string) => {
        // getting each blob to process the main blob
        let blobWebAuthn = blobTx.blobs[0].data;
        let blobSmile = blobTx.blobs[1].data;
        let blobSmileToken = blobTx.blobs[2].data;

        let gatheredBlobs = computeBlob(blobWebAuthn, blobSmile, blobSmileToken);

        // for webauthn
        const ecdsaArgs: ECDSAArgs = {
            identity: blobTx.identity,
            blobs: gatheredBlobs,
        };
        // for smile
        const smileArgs: CairoSmileArgs = {
            identity: blobTx.identity,
            blobs: gatheredBlobs,
        };
        // for smileToken
        const smileTokenArgs: CairoSmileTokenArgs = {
            balances: getBalancesAtTx(txHash),
            blobs: gatheredBlobs,
        };

        await proveAndSendProofsTx(txHash, ecdsaArgs, smileArgs, smileTokenArgs);
    };

    return {
        ecdsaPromiseDone,
        smilePromiseDone,
        smileTokenPromiseDone,
        status,
        error,
        sentTxHash,
        computeBlobsAndProve,
        getBlobs,
    };
}
