import { ref } from "vue";
import {
    BlobTxInfo,
    broadcastProofTx,
    checkTxesStatus,
} from "hyle-js";

import { proveSmile, proveSmileTokenTransfer } from "@/smart_contracts/cairo/prover";
import { proveECDSA } from "@/smart_contracts/noir/prover";
import { CairoSmileArgs, CairoSmileBlobArgs, CairoSmileTokenArgs, CairoSmileTokenBlobArgs, computeBlob, computeSmileBlob, computeSmileTokenBlob, computeWebAuthnBlob, ECDSAArgs, ECDSABlobArgs } from "./SmartContract";
import { getBalancesAtTx } from "./SmileTokenIndexer";
import { network } from "@/network";

export function useProving(
    status = ref("idle" as "idle" | "proving" | "checking_tx" | "tx_success" | "tx_failure" | "failed_at_proving"),
    error = ref<string | null>(null),
    sentTxHash = ref<string | null>(null),
) {
    const ecdsaPromiseDone = ref(false);
    const smilePromiseDone = ref(false);
    const smileTokenPromiseDone = ref(false);

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
                await smileTokenPromise,
            );
            const smileProofTxHash = await broadcastProofTx(network, txHash, 1, "smile", await smilePromise);
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

            // Wait a bit and assume TX will be processed
            await new Promise((resolve) => setTimeout(resolve, 4000));

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


    const prepareArgsFromBlobs = (identity: string, gatheredBlobs: any, txHash: string) => {
        // for webauthn
        const ecdsaArgs: ECDSAArgs = {
            identity: identity,
            blobs: gatheredBlobs,
        };
        // for smile
        const smileArgs: CairoSmileArgs = {
            identity: identity,
            blobs: gatheredBlobs,
        };
        // for smileToken
        const smileTokenArgs: CairoSmileTokenArgs = {
            balances: getBalancesAtTx(txHash),
            blobs: gatheredBlobs,
        };

        return { ecdsaArgs, smileArgs, smileTokenArgs };
    };

    const proveFromBlobs = async (txHash: string, identity: string, webAuthnBlobArgs: ECDSABlobArgs, smileBlobArgs: CairoSmileBlobArgs, smileTokenBlobArgs: CairoSmileTokenBlobArgs) => {
        let webAuthnBlob = computeWebAuthnBlob(webAuthnBlobArgs);
        let smileBlob = computeSmileBlob(smileBlobArgs);
        let smileTokenBlob = computeSmileTokenBlob(smileTokenBlobArgs);

        let gatheredBlobs = computeBlob(webAuthnBlob, smileBlob, smileTokenBlob);

        const { ecdsaArgs, smileArgs, smileTokenArgs } = prepareArgsFromBlobs(identity, gatheredBlobs, txHash);

        await proveAndSendProofsTx(txHash, ecdsaArgs, smileArgs, smileTokenArgs);
    };

    const proveFromBlobTx = async (blobTx: BlobTxInfo) => {
        let { blobWebAuthn, blobSmile, blobSmileToken } = blobTx.blobs.reduce((acc: { blobWebAuthn: any, blobSmile: any, blobSmileToken: any }, blob) => {
            if (blob.contractName === "ecdsa_secp256r1") acc.blobWebAuthn = new TextDecoder().decode(new Uint8Array(blob.data));
            if (blob.contractName === "smile") acc.blobSmile = new TextDecoder().decode(new Uint8Array(blob.data));
            if (blob.contractName === "smile_token") acc.blobSmileToken = new TextDecoder().decode(new Uint8Array(blob.data));
            return acc;
        }, { blobWebAuthn: null, blobSmile: null, blobSmileToken: null });

        let gatheredBlobs = computeBlob(blobWebAuthn, blobSmile, blobSmileToken);

        const { ecdsaArgs, smileArgs, smileTokenArgs } = prepareArgsFromBlobs(blobTx.identity, gatheredBlobs, blobTx.txHash);

        await proveAndSendProofsTx(blobTx.txHash, ecdsaArgs, smileArgs, smileTokenArgs);
    };

    return {
        ecdsaPromiseDone,
        smilePromiseDone,
        smileTokenPromiseDone,
        status,
        error,
        sentTxHash,
        proveFromBlobs,
        proveFromBlobTx
    };
}
