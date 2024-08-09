import { ref } from "vue";
import { hexToUint8Array, uint8ArrayToBase64 } from "hyle-js";

import { ECDSAArgs, CairoArgs, CairoSmileArgs } from "@/smart_contracts/SmartContract";

import { proveSmile, proveERC20Transfer } from "@/smart_contracts/cairo/prover";
import { proveECDSA } from "@/smart_contracts/noir/prover";
import { broadcastProofTx, checkTxesStatus } from "hyle-js";

export function useProving(
    status = ref("idle" as "idle" | "proving" | "checking_tx" | "tx_success" | "tx_failure" | "failed_at_proving"),
    error = ref<string | null>(null),
    sentTxHash = ref<string | null>(null),
) {
    const ecdsaPromiseDone = ref(false);
    const smilePromiseDone = ref(false);
    const erc20PromiseDone = ref(false);

    const proveAndSendProofsTx = async (
        txHash: string,
        webAuthnValues: ECDSAArgs,
        smileArgs: CairoSmileArgs,
        erc20Args: CairoArgs,
    ) => {
        ecdsaPromiseDone.value = false;
        smilePromiseDone.value = false;
        erc20PromiseDone.value = false;
        status.value = "proving";
        try {
            const ecdsaPromise = proveECDSA(webAuthnValues);
            const erc20Promise = proveERC20Transfer(erc20Args);
            const smilePromise = proveSmile(smileArgs);

            ecdsaPromise.then(() => (ecdsaPromiseDone.value = true));
            erc20Promise.then(() => (erc20PromiseDone.value = true));
            smilePromise.then(() => (smilePromiseDone.value = true));

            // Send the proofs transactions
            // The order we expect them is the order they're most likely going to finish in.
            const erc20Resp = await broadcastProofTx(txHash, 2, "smile_token", uint8ArrayToBase64(await erc20Promise));
            const smileResp = await broadcastProofTx(txHash, 1, "smile", uint8ArrayToBase64(await smilePromise));
            const ecdsaResp = await broadcastProofTx(txHash, 0, "ecdsa_secp256r1", window.btoa(await ecdsaPromise));
            console.log("ecdsaProofTx: ", ecdsaResp.transactionHash);
            console.log("smileProofTx: ", smileResp.transactionHash);
            console.log("erc20ProofTx: ", erc20Resp.transactionHash);
            // Switch to waiter view
            status.value = "checking_tx";

            // Check the status of the TX
            const txStatus = await checkTxesStatus([
                ecdsaResp.transactionHash,
                smileResp.transactionHash,
                erc20Resp.transactionHash,
            ]);
            if (txStatus.status === "success") {
                status.value = "tx_success";
                sentTxHash.value = erc20Resp.transactionHash;
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

    return {
        ecdsaPromiseDone,
        smilePromiseDone,
        erc20PromiseDone,
        status,
        error,
        sentTxHash,
        proveAndSendProofsTx,
    };
}
